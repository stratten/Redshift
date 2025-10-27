// MusicSyncManager.js - Music file transfer to device
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const path = require('path');

/**
 * Handles music file synchronization to iOS device
 */
class MusicSyncManager {
  constructor(musicLibraryCache) {
    this.musicLibraryCache = musicLibraryCache;
  }

  /**
   * Push file directly to iOS app using pymobiledevice3
   * @param {string} udid - Device UDID
   * @param {string} localPath - Local file path
   * @param {string} destFileName - Destination filename
   */
  async pushFileToDevice(udid, localPath, destFileName) {
    try {
      const bundleId = 'com.redshiftplayer.mobile';
      const remotePath = `Documents/Music/${destFileName}`;
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      
      // Use bundled Python to run pymobiledevice3 with explicit UDID
      const cmd = `"${pythonPath}" -m pymobiledevice3 apps push --udid "${udid}" "${bundleId}" "${localPath}" "${remotePath}"`;
      
      await execAsync(cmd);
      console.log(`✅ Pushed: ${destFileName}`);
      
    } catch (error) {
      throw new Error(`Failed to push ${destFileName}: ${error.message}`);
    }
  }

  /**
   * Get list of tracks that need to be synced
   * @param {Map} deviceFiles - Map of files currently on device
   */
  async getUnsyncedTracks(deviceFiles) {
    try {
      // Get all tracks from the library
      const allTracks = await this.musicLibraryCache.getAllMetadata();
      
      // Filter to only tracks not on the device
      const unsyncedTracks = allTracks.filter(track => {
        const fileName = path.basename(track.path);
        const deviceFile = deviceFiles.get(fileName);
        
        // Track is unsynced if it's not on device or file size doesn't match
        if (!deviceFile) return true;
        
        // Check file size match
        const fs = require('fs');
        try {
          const stats = fs.statSync(track.path);
          return stats.size !== deviceFile.size;
        } catch {
          return true; // If we can't stat the file, include it
        }
      });
      
      // Return tracks with useful metadata for display
      return unsyncedTracks.map(track => ({
        name: path.basename(track.path),
        path: track.path,
        title: track.title || path.basename(track.path),
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Unknown Album',
        size: track.size || 0
      }));
      
    } catch (error) {
      console.error('Failed to get unsynced tracks:', error);
      return [];
    }
  }

  /**
   * Filter tracks to only those that need syncing
   * @param {Array} tracks - All local tracks
   * @param {Map} deviceFiles - Files on device
   * @returns {Array} Tracks that need syncing
   */
  filterTracksToSync(tracks, deviceFiles) {
    return tracks.filter(track => {
      const fileName = path.basename(track.path);
      const onDevice = deviceFiles.get(fileName);
      
      if (!onDevice) {
        return true; // Not on device, needs sync
      }
      
      // Check if file size matches (simple check for same file)
      try {
        const localStat = fs.statSync(track.path);
        if (localStat.size !== onDevice.size) {
          return true; // Different size, needs sync
        }
      } catch {
        return true; // Can't stat local file, try to sync anyway
      }
      
      return false; // Already on device with same size
    });
  }

  /**
   * Sync music files to device
   * @param {string} udid - Device UDID
   * @param {Array} tracksToSync - Tracks that need syncing
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Object} Sync results
   */
  async syncMusicFiles(udid, tracksToSync, progressCallback) {
    const totalTracks = tracksToSync.length;
    let transferred = 0;
    let failed = 0;
    let skipped = 0;

    // Push each file that needs syncing
    for (let i = 0; i < tracksToSync.length; i++) {
      const track = tracksToSync[i];
      const fileName = path.basename(track.path);

      try {
        if (!await fs.pathExists(track.path)) {
          console.warn(`⚠️  Source file not found: ${track.path}`);
          failed++;
          continue;
        }

        console.log(`📤 [${i + 1}/${totalTracks}] ${fileName}`);
        await this.pushFileToDevice(udid, track.path, fileName);
        transferred++;

        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: totalTracks,
            fileName,
            status: 'copied',
            transferred,
            failed
          });
        }

      } catch (error) {
        // Check if file already exists (not an error, just skip)
        if (error.message && error.message.includes('already exists')) {
          skipped++;
          console.log(`⏭️  Already on device: ${fileName}`);
        } else {
          console.error(`❌ Failed: ${fileName} - ${error.message}`);
          failed++;
        }
        
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: totalTracks,
            fileName,
            status: error.message.includes('already exists') ? 'skipped' : 'failed',
            transferred,
            failed,
            skipped
          });
        }
      }
    }

    return { transferred, failed, skipped, total: totalTracks };
  }
}

module.exports = MusicSyncManager;

