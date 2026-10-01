# 05 — Desktop `PlaylistSyncManager` Replacement and Wiring

Apply after 04.

## File: `RedShift_Desktop/src/main/services/usb-sync/PlaylistSyncManager.js` — full replacement

Why this is a full replacement rather than anchored edits: the pull, merge and helper sections all change, and the current file has 20+ whitespace-only lines that make individual anchors fragile. The public method names and the signatures called by `RedShiftUSBSyncService` (`pullPlaylistsFromDevice(deviceId)`, `mergePlaylistsWithConflictResolution()`, `syncPlaylists(deviceId)`, `getPlaylistsForSync()`, `pushPlaylistToDevice(udid, playlist)`) are preserved.

Behaviour changes:

- The pull reads through `HouseArrestService` (the app container) instead of `AfcService('com.apple.afc')`. The old service opened the media partition, where `Documents/Playlists` does not exist. It failed silently, so the desktop never saw any phone edits and pushed over them.
- The pull throws on failure. `RedShiftUSBSyncService.sync()` already catches this, marks `playlistSyncOk = false`, and skips the push and the manifest. A failed pull therefore can never be followed by a push that overwrites phone edits.
- The pulled contents are kept in memory (`this.pulledPlaylists`). The temp-directory round trip is gone.
- The merge uses the three-way baseline policy from `PlaylistSyncPolicy`, and a conflict prompt appears only when both sides changed.

Complete content:

```js
// PlaylistSyncManager.js - Bi-directional playlist sync between desktop and the
// RedShift Mobile app container. Decisions live in PlaylistSyncPolicy; writes
// and baselines live in PlaylistSyncStore.
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const PlaylistSyncStore = require('./PlaylistSyncStore');
const {
  CHOICES,
  decidePlaylistSync,
  resolveConflict,
  resultingModified,
  normalizePlaylistJSON
} = require('./PlaylistSyncPolicy');

const BUNDLE_ID = 'com.redshiftplayer.mobile';
const REMOTE_PLAYLISTS_DIR = 'Documents/Playlists';
const PYTHON_PATH = path.join(__dirname, '../../../../resources/python/python/bin/python3');
const CONFLICT_BUTTONS = [
  { label: 'Keep Newest', choice: CHOICES.KEEP_NEWEST },
  { label: 'Keep All Unique', choice: CHOICES.KEEP_ALL_UNIQUE },
  { label: 'Keep Desktop', choice: CHOICES.KEEP_DESKTOP },
  { label: 'Keep Phone', choice: CHOICES.KEEP_PHONE }
];

function formatStamp(seconds) {
  return seconds > 0 ? new Date(seconds * 1000).toLocaleString() : 'unknown';
}

/** Default conflict prompt: a native dialog. Closing it means Keep Newest. */
async function promptPlaylistConflict({ name, local, device }) {
  const { dialog, BrowserWindow } = require('electron');
  const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  const options = {
    type: 'question',
    buttons: CONFLICT_BUTTONS.map((button) => button.label),
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Playlist Changed on Both Devices',
    message: `"${name}" was edited on this computer and on your phone since the last sync.`,
    detail: `Desktop: ${local.tracks.length} tracks, edited ${formatStamp(local.modified)}\nPhone: ${device.tracks.length} tracks, edited ${formatStamp(device.modified)}\n\nKeep All Unique keeps the desktop order and appends songs only on the phone.`
  };
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  return (CONFLICT_BUTTONS[response] || CONFLICT_BUTTONS[0]).choice;
}

class PlaylistSyncManager {
  constructor(deviceMonitorService, playlistService, getConnectedDeviceByDeviceId, options = {}) {
    this.deviceMonitorService = deviceMonitorService;
    this.playlistService = playlistService;
    this.getConnectedDeviceByDeviceId = getConnectedDeviceByDeviceId;
    this.syncStore = options.syncStore
      || (playlistService ? new PlaylistSyncStore(playlistService.db, playlistService) : null);
    this.promptConflict = options.promptConflict || promptPlaylistConflict;

    // Raw playlist JSON objects read from the phone; null until a pull succeeds.
    this.pulledPlaylists = null;
  }

  /**
   * Runs a Python snippet with `afc` bound to the app container and returns
   * the JSON object printed on its last stdout line.
   */
  async runHouseArrestScript(udid, body) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'redshift-playlists-'));
    const script = [
      'import sys',
      'import json',
      'from pymobiledevice3.lockdown import create_using_usbmux',
      'from pymobiledevice3.services.house_arrest import HouseArrestService',
      '',
      'try:',
      `    lockdown = create_using_usbmux(serial=${JSON.stringify(udid)})`,
      `    afc = HouseArrestService(lockdown=lockdown, bundle_id='${BUNDLE_ID}')`,
      ...body.split('\n').map((line) => `    ${line}`),
      'except Exception as e:',
      '    print(json.dumps({"success": False, "error": str(e)}))',
      '    sys.exit(1)',
      ''
    ].join('\n');
    try {
      const scriptPath = path.join(tempDir, 'playlist_sync.py');
      await fs.writeFile(scriptPath, script);
      let stdout;
      try {
        ({ stdout } = await execAsync(`"${PYTHON_PATH}" "${scriptPath}"`, { maxBuffer: 16 * 1024 * 1024 }));
      } catch (error) {
        stdout = error.stdout || '';
        if (!stdout.trim()) throw error;
      }
      const lines = stdout.trim().split('\n');
      const result = JSON.parse(lines[lines.length - 1]);
      if (!result.success) throw new Error(result.error || 'Device script failed');
      return result;
    } finally {
      await fs.remove(tempDir);
    }
  }

  /**
   * Reads every playlist JSON from the app container into memory. Throws on
   * any device error so the caller skips the push instead of overwriting
   * phone edits it never saw.
   * @param {string} deviceId - The device ID (productId)
   */
  async pullPlaylistsFromDevice(deviceId) {
    this.pulledPlaylists = null;
    console.log('📥 Pulling playlists from device...');
    const device = this.getConnectedDeviceByDeviceId(deviceId);
    if (!device || !device.udid) {
      throw new Error(`Device ${deviceId} not found or UDID not available`);
    }
    const result = await this.runHouseArrestScript(device.udid, [
      'try:',
      `    afc.makedirs('${REMOTE_PLAYLISTS_DIR}')`,
      'except Exception:',
      '    pass',
      'files = []',
      `for name in afc.listdir('${REMOTE_PLAYLISTS_DIR}'):`,
      "    if name.endswith('.json'):",
      `        data = afc.get_file_contents('${REMOTE_PLAYLISTS_DIR}/' + name)`,
      "        files.append({'file': name, 'text': data.decode('utf-8', errors='replace')})",
      "print(json.dumps({'success': True, 'files': files}))"
    ].join('\n'));

    const pulled = [];
    for (const entry of result.files || []) {
      try {
        pulled.push(JSON.parse(entry.text));
      } catch (error) {
        console.warn(`⚠️  Skipping unreadable playlist file ${entry.file}: ${error.message}`);
      }
    }
    this.pulledPlaylists = pulled;
    console.log(`✅ Pulled ${pulled.length} playlist(s) from device`);
  }

  /**
   * Three-way merge against the last-sync baseline. Only one side changed:
   * that side wins silently. Both changed: the user picks a resolution.
   */
  async mergePlaylistsWithConflictResolution() {
    if (!this.pulledPlaylists) {
      throw new Error('Playlist merge requires a successful pull first');
    }
    if (!this.syncStore) {
      throw new Error('PlaylistService not available for playlist merge');
    }
    const counts = { imported: 0, tookDevice: 0, keptDesktop: 0, merged: 0, unchanged: 0, skipped: 0 };
    try {
      console.log('🔄 Merging playlists against last-sync baselines...');
      const baselines = await this.syncStore.getBaselines();
      const localPlaylists = await this.playlistService.getAllPlaylists();
      const localByKey = new Map(localPlaylists.map((playlist) => [playlist.name.toLowerCase(), playlist]));
      const nowSeconds = Math.floor(Date.now() / 1000);

      for (const raw of this.pulledPlaylists) {
        const device = normalizePlaylistJSON(raw);
        if (!device) {
          counts.skipped++;
          console.warn('⚠️  Skipping playlist file without a name');
          continue;
        }
        try {
          const key = device.name.toLowerCase();
          const localRow = localByKey.get(key) || null;
          const local = localRow
            ? { modified: Number(localRow.modified_date) || 0, tracks: await this.syncStore.getPlaylistFilenames(localRow.id) }
            : null;
          const decision = decidePlaylistSync(local, device, baselines.get(key) || null);
          console.log(`📋 ${device.name}: ${decision.action}`);

          if (decision.action === 'import-device') {
            const created = await this.syncStore.importDevicePlaylist(device);
            localByKey.set(key, { id: created.id, name: device.name, modified_date: device.modified });
            counts.imported++;
          } else if (decision.action === 'take-device') {
            await this.syncStore.replacePlaylistTracks(localRow.id, device.tracks, device.modified);
            counts.tookDevice++;
          } else if (decision.action === 'keep-local') {
            const modified = resultingModified({ source: 'desktop', local, device, nowSeconds });
            if (modified !== local.modified) await this.syncStore.setModifiedDate(localRow.id, modified);
            counts.keptDesktop++;
          } else if (decision.action === 'conflict') {
            const choice = await this.promptConflict({ name: localRow.name, local, device });
            const resolution = resolveConflict(choice, local, device);
            const modified = resultingModified({ source: resolution.source, local, device, nowSeconds });
            if (resolution.source === 'desktop') {
              if (modified !== local.modified) await this.syncStore.setModifiedDate(localRow.id, modified);
            } else {
              await this.syncStore.replacePlaylistTracks(localRow.id, resolution.tracks, modified);
            }
            counts.merged++;
          } else {
            counts.unchanged++;
          }
        } catch (error) {
          counts.skipped++;
          console.error(`❌ Failed to merge playlist ${device.name}: ${error.message}`);
        }
      }
      console.log(`✅ Playlist merge complete: ${JSON.stringify(counts)}`);
      return counts;
    } finally {
      this.pulledPlaylists = null;
    }
  }

  /**
   * Pushes every desktop playlist to the device, then records the pushed
   * stamps as the new baselines.
   * @param {string} deviceId - The device ID (productId)
   */
  async syncPlaylists(deviceId) {
    console.log('📋 Starting playlist push...');
    const playlists = await this.getPlaylistsForSync();
    if (playlists.length === 0) {
      console.log('📋 No playlists to sync');
      return;
    }
    const devices = this.deviceMonitorService.getConnectedDevices();
    const device = Array.from(devices.values()).find((d) => String(d.productId) === deviceId);
    if (!device || !device.udid) {
      throw new Error('Device not found or UDID not available');
    }
    await this.runHouseArrestScript(device.udid, [
      'try:',
      `    afc.makedirs('${REMOTE_PLAYLISTS_DIR}')`,
      'except Exception:',
      '    pass',
      "print(json.dumps({'success': True}))"
    ].join('\n'));

    for (const playlist of playlists) {
      console.log(`📋 Pushing playlist: ${playlist.name}`);
      await this.pushPlaylistToDevice(device.udid, playlist);
    }
    if (this.syncStore) {
      await this.syncStore.recordBaselines(playlists.map((playlist) => ({ name: playlist.name, modified: playlist.modifiedDate })));
    }
    console.log(`✅ Playlist push complete: ${playlists.length} playlists`);
  }

  /**
   * Get playlists with their tracks for syncing
   */
  async getPlaylistsForSync() {
    if (!this.playlistService) {
      console.log('⚠️  PlaylistService not available, skipping playlist sync');
      return [];
    }
    const playlists = await this.playlistService.getAllPlaylists();
    const playlistsWithTracks = [];
    for (const playlist of playlists) {
      const tracks = await this.playlistService.getPlaylistTracks(playlist.id);
      playlistsWithTracks.push({
        name: playlist.name,
        tracks: tracks.map((t) => path.basename(t.file_path)),
        createdDate: Number(playlist.created_date) || 0,
        modifiedDate: Number(playlist.modified_date) || 0
      });
    }
    return playlistsWithTracks;
  }

  /**
   * Push playlist JSON file to device
   * @param {string} udid - Device UDID
   * @param {object} playlist - Playlist data
   */
  async pushPlaylistToDevice(udid, playlist) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'redshift-playlist-push-'));
    try {
      // Must match the phone's exportPlaylistToJSON naming so both sides write one file per playlist.
      const safeFilename = playlist.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const jsonFilename = `${safeFilename}.json`;
      const localPath = path.join(tmpDir, jsonFilename);
      await fs.writeJson(localPath, playlist);
      const remotePath = `${REMOTE_PLAYLISTS_DIR}/${jsonFilename}`;
      await execAsync(`"${PYTHON_PATH}" -m pymobiledevice3 apps push --udid "${udid}" "${BUNDLE_ID}" "${localPath}" "${remotePath}"`);
    } catch (error) {
      throw new Error(`Failed to push playlist ${playlist.name}: ${error.message}`);
    } finally {
      await fs.remove(tmpDir);
    }
  }
}

module.exports = PlaylistSyncManager;
```

Resulting size: about 270 lines.

## File: `RedShift_Desktop/src/main/services/RedShiftUSBSyncService.js`

### Edit 5.1 — fix the stale step comment

The constructor stays as is: the manager builds its own `PlaylistSyncStore` from `playlistService.db`, which is the same `this.db` connection passed in `main.js`.

Find:

```js
        // Step 2: Merge with local playlists (last modified wins)
```

Replace:

```js
        // Step 2: Three-way merge against last-sync baselines (prompts only when both sides changed)
```

## Hazards

- `afc.get_file_contents` exists on `AfcService`, which `HouseArrestService` subclasses. The prior art is `ArtistImageSyncManager` and `SyncManifestBuilder`, which use `listdir`, `makedirs`, `rm` and `rename` on the same object.
- `require('electron')` is lazy inside `promptPlaylistConflict`, so `node --test` can load this module. Tests always inject `promptConflict`.
- The conflict dialog blocks the sync while it waits for an answer. The sync is already a long-running, user-initiated operation, and the dialog is modal to the focused window.
- `udid` is interpolated through `JSON.stringify`, which produces a valid Python string literal for any UDID characters.
- `transactions`: `PlaylistSyncStore.inTransaction` uses `BEGIN IMMEDIATE` on the shared app connection. The sqlite3 driver queues statements, but another service could run a statement between our awaits and have it land inside our transaction. This is accepted (see Deferrals in the index). The sync is short, and the other writers (play counts, library scan) are idempotent upserts.
