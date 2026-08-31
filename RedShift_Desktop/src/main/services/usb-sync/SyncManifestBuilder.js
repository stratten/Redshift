// SyncManifestBuilder.js - Builds and publishes the post-sync library manifest
// that the mobile app treats as the authoritative marker for a completed,
// importable sync. Only called after audio, playlists, and play_counts.json
// have all been pushed successfully (see RedShiftUSBSyncService.sync()).
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const MANIFEST_SCHEMA_VERSION = 1;
const MANIFEST_REMOTE_DIR = 'Documents/SyncData';
const MANIFEST_REMOTE_NAME = 'library-manifest.json';
const BUNDLE_ID = 'com.redshiftplayer.mobile';

/**
 * Builds and uploads the desktop's canonical library manifest to the device.
 */
class SyncManifestBuilder {
  constructor(musicLibraryCache) {
    this.musicLibraryCache = musicLibraryCache;
  }

  /**
   * Builds the manifest payload from the desktop's canonical track metadata.
   * @param {Set<string>} confirmedFileNames - Filenames confirmed present on
   *   the device after this sync (already-present + successfully transferred
   *   this run). Files not in this set are excluded so a partially failed
   *   transfer never advertises metadata for a file the phone doesn't have.
   */
  async buildManifest(confirmedFileNames) {
    const allTracks = await this.musicLibraryCache.getAllMetadata();
    const files = [];

    for (const track of allTracks) {
      const fileName = path.basename(track.path);
      if (!confirmedFileNames.has(fileName)) {
        continue;
      }

      let stat;
      try {
        stat = await fs.stat(track.path);
      } catch {
        continue; // Source file vanished since the transfer step; exclude it.
      }

      const common = track.common || {};
      const format = track.format || {};
      const trackNumber = (common.track && (common.track.no ?? common.track.number)) || null;
      const discNumber = (common.disk && (common.disk.no ?? common.disk.number)) || null;

      files.push({
        fileName,
        title: common.title || null,
        artist: common.artist || null,
        album: common.album || null,
        albumArtist: common.albumartist || null,
        year: common.year || null,
        trackNumber,
        discNumber,
        genre: common.genre || null,
        duration: format.duration || 0,
        fileSize: stat.size,
        // Fast fingerprint (size + source mtime) rather than a full content
        // hash, so building the manifest for a large library stays cheap.
        // The phone does NOT compare this value directly (AFC transfers do
        // not preserve source mtime); it matches manifest entries by
        // fileName + fileSize instead. This field is kept for forward
        // compatibility with a future desktop-side incremental manifest diff.
        fingerprint: `${stat.size}-${Math.floor(stat.mtimeMs)}`
      });
    }

    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      revision: String(Date.now()),
      generatedAt: new Date().toISOString(),
      files
    };
  }

  /**
   * Writes the manifest to the device: upload to a temporary remote path
   * first, then promote (rename) it into place only after the upload
   * succeeds. Mobile reconciliation only ever reads the final name, so a
   * crash/disconnect mid-upload leaves the previous manifest (or none)
   * intact instead of a half-written file being read as complete.
   */
  async publishManifest(udid, manifest) {
    const tempDir = path.join(os.tmpdir(), `redshift-manifest-${Date.now()}`);
    await fs.ensureDir(tempDir);

    try {
      const localPath = path.join(tempDir, MANIFEST_REMOTE_NAME);
      await fs.writeJson(localPath, manifest);

      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      const tempRemotePath = `${MANIFEST_REMOTE_DIR}/${MANIFEST_REMOTE_NAME}.tmp`;
      const finalRemotePath = `${MANIFEST_REMOTE_DIR}/${MANIFEST_REMOTE_NAME}`;

      await this.ensureSyncDataDirectory(udid, tempDir, pythonPath);

      const pushCmd = `"${pythonPath}" -m pymobiledevice3 apps push --udid "${udid}" "${BUNDLE_ID}" "${localPath}" "${tempRemotePath}"`;
      await execAsync(pushCmd);

      await this.promoteManifest(udid, tempDir, pythonPath, tempRemotePath, finalRemotePath);
    } finally {
      await fs.remove(tempDir);
    }
  }

  async ensureSyncDataDirectory(udid, tempDir, pythonPath) {
    const mkdirScript = `
import sys
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.house_arrest import HouseArrestService

try:
    lockdown = create_using_usbmux(serial="${udid}")
    afc = HouseArrestService(lockdown=lockdown, bundle_id='${BUNDLE_ID}')
    try:
        afc.makedirs('${MANIFEST_REMOTE_DIR}')
    except Exception:
        pass  # Directory may already exist
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
`;
    const scriptPath = path.join(tempDir, 'mkdir_syncdata.py');
    await fs.writeFile(scriptPath, mkdirScript);
    await execAsync(`"${pythonPath}" "${scriptPath}"`);
  }

  async promoteManifest(udid, tempDir, pythonPath, tempRemotePath, finalRemotePath) {
    const promoteScript = `
import sys
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.house_arrest import HouseArrestService

try:
    lockdown = create_using_usbmux(serial="${udid}")
    afc = HouseArrestService(lockdown=lockdown, bundle_id='${BUNDLE_ID}')
    try:
        afc.rm('${finalRemotePath}')
    except Exception:
        pass  # No previous manifest to remove
    afc.rename('${tempRemotePath}', '${finalRemotePath}')
    print('promoted')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
`;
    const scriptPath = path.join(tempDir, 'promote_manifest.py');
    await fs.writeFile(scriptPath, promoteScript);
    const { stdout } = await execAsync(`"${pythonPath}" "${scriptPath}"`);
    if (!stdout.includes('promoted')) {
      throw new Error(`Manifest promotion did not confirm success: ${stdout}`);
    }
  }
}

module.exports = SyncManifestBuilder;
