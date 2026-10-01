# 04 — Desktop Playlist Sync: Policy, Store, Schema

Apply before 05, which requires both new modules.

## New file: `RedShift_Desktop/src/main/services/usb-sync/PlaylistSyncPolicy.js`

Complete content:

```js
// PlaylistSyncPolicy.js - Pure decision logic for bi-directional playlist sync.
// Kept free of I/O so every branch is unit-tested without a device or database.

const CHOICES = Object.freeze({
  KEEP_NEWEST: 'keep-newest',
  KEEP_ALL_UNIQUE: 'keep-all-unique',
  KEEP_DESKTOP: 'keep-desktop',
  KEEP_PHONE: 'keep-phone'
});

function uniqueInOrder(names) {
  const seen = new Set();
  const result = [];
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function sameTrackList(a, b) {
  if (a.length !== b.length) return false;
  return a.every((name, index) => name === b[index]);
}

/**
 * Decides what to do with one playlist name present on at least one side.
 * "Changed" means modified after the stamp both sides agreed on at the end of
 * the last successful sync (the baseline).
 * @param {{modified: number, tracks: string[]}|null} local desktop playlist
 * @param {{modified: number, tracks: string[]}|null} device playlist pulled from the phone
 * @param {{modified: number}|null} baseline
 * @returns {{action: 'import-device'|'keep-local'|'take-device'|'conflict'|'noop', desktopChanged: boolean, deviceChanged: boolean}}
 */
function decidePlaylistSync(local, device, baseline) {
  if (!device) return { action: 'keep-local', desktopChanged: true, deviceChanged: false };
  if (!local) return { action: 'import-device', desktopChanged: false, deviceChanged: true };
  if (sameTrackList(local.tracks, device.tracks)) {
    return { action: 'noop', desktopChanged: false, deviceChanged: false };
  }
  if (baseline && Number.isFinite(baseline.modified)) {
    const desktopChanged = local.modified > baseline.modified;
    const deviceChanged = device.modified > baseline.modified;
    if (desktopChanged && deviceChanged) return { action: 'conflict', desktopChanged, deviceChanged };
    if (deviceChanged) return { action: 'take-device', desktopChanged, deviceChanged };
    return { action: 'keep-local', desktopChanged, deviceChanged };
  }
  // No baseline yet (first sync with this policy, or the same name created on
  // both sides independently): an empty side carries no edits worth keeping.
  if (device.tracks.length === 0) return { action: 'keep-local', desktopChanged: true, deviceChanged: false };
  if (local.tracks.length === 0) return { action: 'take-device', desktopChanged: false, deviceChanged: true };
  return { action: 'conflict', desktopChanged: true, deviceChanged: true };
}

function resolveConflict(choice, local, device) {
  switch (choice) {
    case CHOICES.KEEP_DESKTOP:
      return { tracks: local.tracks.slice(), source: 'desktop' };
    case CHOICES.KEEP_PHONE:
      return { tracks: device.tracks.slice(), source: 'device' };
    case CHOICES.KEEP_ALL_UNIQUE:
      return { tracks: uniqueInOrder([...local.tracks, ...device.tracks]), source: 'merged' };
    case CHOICES.KEEP_NEWEST:
    default:
      return device.modified > local.modified
        ? { tracks: device.tracks.slice(), source: 'device' }
        : { tracks: local.tracks.slice(), source: 'desktop' };
  }
}

/**
 * Desktop modified stamp to store after a decision. The phone applies a
 * pushed playlist only when its stamp is newer than or equal to the phone
 * copy, so any desktop-authored result must not be older than the copy the
 * phone sent.
 */
function resultingModified({ source, local, device, nowSeconds }) {
  if (source === 'device') return device.modified;
  if (source === 'merged') return Math.max(nowSeconds, local.modified + 1, device.modified + 1);
  if (device && local.modified <= device.modified) return Math.max(nowSeconds, device.modified + 1);
  return local.modified;
}

function normalizePlaylistJSON(raw) {
  if (!raw || typeof raw.name !== 'string' || raw.name.trim().length === 0) return null;
  const modified = Number(raw.modifiedDate);
  const created = Number(raw.createdDate);
  return {
    name: raw.name,
    tracks: Array.isArray(raw.tracks) ? uniqueInOrder(raw.tracks) : [],
    modified: Number.isFinite(modified) ? Math.floor(modified) : 0,
    created: Number.isFinite(created) ? Math.floor(created) : 0
  };
}

module.exports = {
  CHOICES,
  uniqueInOrder,
  sameTrackList,
  decidePlaylistSync,
  resolveConflict,
  resultingModified,
  normalizePlaylistJSON
};
```

## New file: `RedShift_Desktop/src/main/services/usb-sync/PlaylistSyncStore.js`

Complete content:

```js
// PlaylistSyncStore.js - Transactional playlist writes and last-sync baselines
// used only by USB playlist sync.

const path = require('path');

class PlaylistSyncStore {
  constructor(db, playlistService) {
    this.db = db;
    this.playlistService = playlistService;
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(error) {
        if (error) reject(error);
        else resolve(this);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row || null)));
    });
  }

  async inTransaction(work) {
    await this.run('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  /** Library path for a device filename by exact basename, or null. */
  async findLibraryPathForFilename(filename) {
    const row = await this.get('SELECT file_path FROM songs WHERE file_name = ? ORDER BY id LIMIT 1', [filename]);
    return row ? row.file_path : null;
  }

  async getPlaylistFilenames(playlistId) {
    const tracks = await this.playlistService.getPlaylistTracks(playlistId);
    return tracks.map((track) => path.basename(track.file_path));
  }

  /**
   * Resolves every filename before touching the playlist, then swaps the
   * contents in one transaction so a failure can never leave it emptied.
   * @returns {Promise<{resolved: number, missing: string[]}>}
   */
  async replacePlaylistTracks(playlistId, filenames, modifiedDate) {
    const filePaths = [];
    const missing = [];
    for (const filename of filenames) {
      const filePath = await this.findLibraryPathForFilename(filename);
      if (filePath) filePaths.push(filePath);
      else missing.push(filename);
    }
    await this.inTransaction(async () => {
      await this.run('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlistId]);
      for (let index = 0; index < filePaths.length; index++) {
        await this.run(
          'INSERT INTO playlist_tracks (playlist_id, file_path, position) VALUES (?, ?, ?)',
          [playlistId, filePaths[index], index + 1]
        );
      }
      await this.run('UPDATE playlists SET track_count = ?, modified_date = ? WHERE id = ?', [filePaths.length, modifiedDate, playlistId]);
    });
    if (missing.length > 0) {
      console.warn(`⚠️  ${missing.length} playlist track(s) not in desktop library: ${missing.join(', ')}`);
    }
    return { resolved: filePaths.length, missing };
  }

  async importDevicePlaylist(devicePlaylist) {
    const playlist = await this.playlistService.createPlaylist(devicePlaylist.name, '', false);
    await this.replacePlaylistTracks(playlist.id, devicePlaylist.tracks, devicePlaylist.modified);
    await this.run('UPDATE playlists SET created_date = ? WHERE id = ?', [devicePlaylist.created || devicePlaylist.modified, playlist.id]);
    return playlist;
  }

  async setModifiedDate(playlistId, modifiedDate) {
    await this.run('UPDATE playlists SET modified_date = ? WHERE id = ?', [modifiedDate, playlistId]);
  }

  async getBaselines() {
    const rows = await this.all('SELECT name_key, last_synced_modified FROM playlist_sync_state');
    return new Map(rows.map((row) => [row.name_key, { modified: row.last_synced_modified }]));
  }

  async recordBaselines(entries, syncedAt = Math.floor(Date.now() / 1000)) {
    await this.inTransaction(async () => {
      for (const entry of entries) {
        await this.run(
          'INSERT OR REPLACE INTO playlist_sync_state (name_key, last_synced_modified, last_synced_at) VALUES (?, ?, ?)',
          [entry.name.toLowerCase(), entry.modified, syncedAt]
        );
      }
    });
  }
}

module.exports = PlaylistSyncStore;
```

## File: `RedShift_Desktop/src/main/services/Database.js`

### Edit 4.1 — baseline table (idempotent, created with the rest of the schema at startup)

Find:

```js
  await run(db, `CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks(playlist_id, position)`);
```

Replace:

```js
  await run(db, `CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks(playlist_id, position)`);

  // Modified stamp both sides agreed on at the end of the last successful USB
  // playlist sync, keyed by lowercase playlist name (the phone JSON has no id).
  await run(db, `
    CREATE TABLE IF NOT EXISTS playlist_sync_state (
      name_key TEXT PRIMARY KEY,
      last_synced_modified INTEGER NOT NULL,
      last_synced_at INTEGER NOT NULL
    )
  `);
```

## File: `RedShift_Desktop/src/main/services/PlaylistService.js`

### Edit 4.2 — remove the broken device-JSON import/update helpers

These call `this.addTrackToPlaylist`, which does not exist; `updatePlaylistFromJSON` also deletes every track before that call throws. Their only caller was `PlaylistSyncManager`, which now uses `PlaylistSyncStore`. `findTrackByFilename` (suffix `LIKE`, so `Pearl.mp3` could match `XPearl.mp3`) has no other caller.

Find the text from `  /**` above "Import playlist from JSON" through the opening of the "Update playlist timestamps" doc comment. The whitespace-only lines contain, in order, 6, 6, 6, 2, 6, 6, 6, 2 and 2 spaces:

```js
  /**
   * Import playlist from JSON (from device sync)
   * @param {object} playlistData - Playlist data from JSON
   */
  async importPlaylistFromJSON(playlistData) {
    try {
      // Create the playlist
      const playlist = await this.createPlaylist(playlistData.name, '', false); // Don't sync to Doppler by default
      
      // Add tracks by filename
      for (const filename of playlistData.tracks) {
        // Find track by filename
        const track = await this.findTrackByFilename(filename);
        if (track) {
          await this.addTrackToPlaylist(playlist.id, track.id);
        } else {
          console.warn(`⚠️  Track not found in library: ${filename}`);
        }
      }
      
      // Update timestamps to match device
      await this.updatePlaylistTimestamps(playlist.id, playlistData.createdDate, playlistData.modifiedDate);
      
      console.log(`✅ Imported playlist from device: ${playlistData.name} (${playlistData.tracks.length} tracks)`);
      return playlist;
    } catch (error) {
      console.error(`❌ Failed to import playlist from JSON: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update existing playlist from JSON (from device sync)
   * @param {number} playlistId - Local playlist ID
   * @param {object} playlistData - Playlist data from JSON
   */
  async updatePlaylistFromJSON(playlistId, playlistData) {
    try {
      // Remove all existing tracks
      await this.removeAllTracksFromPlaylist(playlistId);
      
      // Add tracks by filename
      for (const filename of playlistData.tracks) {
        const track = await this.findTrackByFilename(filename);
        if (track) {
          await this.addTrackToPlaylist(playlistId, track.id);
        } else {
          console.warn(`⚠️  Track not found in library: ${filename}`);
        }
      }
      
      // Update timestamps to match device
      await this.updatePlaylistTimestamps(playlistId, playlistData.createdDate, playlistData.modifiedDate);
      
      console.log(`✅ Updated playlist from device: ${playlistData.name} (${playlistData.tracks.length} tracks)`);
    } catch (error) {
      console.error(`❌ Failed to update playlist from JSON: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find track by filename
   * @param {string} filename - Track filename
   */
  async findTrackByFilename(filename) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT id FROM songs WHERE file_path LIKE ?`;
      this.db.get(sql, [`%${filename}`], (error, row) => {
        if (error) {
          reject(error);
        } else {
          resolve(row || null);
        }
      });
    });
  }
  
  /**
   * Update playlist timestamps
```

Replace:

```js
  /**
   * Update playlist timestamps
```

`updatePlaylistTimestamps` and `removeAllTracksFromPlaylist` stay; they are correct and harmless. `PlaylistService.js` shrinks from 575 to about 497 lines.

## File: `RedShift_Desktop/package.json`

### Edit 4.3 — register the new tests (`node --test` runs only the files listed)

Find:

```json
        "test": "node --test test/artist-credit-parser.test.js test/video-library-classification.test.js test/video-library-cache.integration.test.js test/tvmaze-service.test.js test/video-compatibility-service.test.js"
```

Replace:

```json
        "test": "node --test test/artist-credit-parser.test.js test/video-library-classification.test.js test/video-library-cache.integration.test.js test/tvmaze-service.test.js test/video-compatibility-service.test.js test/playlist-sync-policy.test.js test/playlist-sync-store.integration.test.js"
```
