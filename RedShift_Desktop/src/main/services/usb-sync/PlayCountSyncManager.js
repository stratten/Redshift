// PlayCountSyncManager.js - Play count synchronization (bi-directional)
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const path = require('path');

/**
 * Handles play count synchronization between desktop and iOS device
 */
class PlayCountSyncManager {
  constructor(db, getConnectedDeviceByDeviceId) {
    this.db = db;
    this.getConnectedDeviceByDeviceId = getConnectedDeviceByDeviceId;
    
    // Temp storage for pulled play counts
    this.pulledPlayCountsFile = null;
  }

  /**
   * Pull play counts from device
   * @param {string} deviceId - Device ID
   */
  async pullPlayCountsFromDevice(deviceId) {
    try {
      console.log('📥 Pulling play counts from device...');
      
      const { app } = require('electron');
      const device = this.getConnectedDeviceByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }
      
      const bundleId = 'com.redshiftplayer.mobile';
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      const tempDir = path.join(app.getPath('temp'), 'redshift-playcount-pull');
      await fs.ensureDir(tempDir);
      
      const remotePath = 'Documents/SyncData/play_counts.json';
      const localPath = path.join(tempDir, 'play_counts.json');
      
      try {
        const pullCmd = `"${pythonPath}" -m pymobiledevice3 apps pull --udid "${device.udid}" "${bundleId}" "${remotePath}" "${localPath}"`;
        await execAsync(pullCmd);
        
        console.log('📥 Pulled play counts file from device');
        
        // Store the file path for merge step
        this.pulledPlayCountsFile = localPath;

      } catch (error) {
        if (error.message && error.message.includes('No such file')) {
          console.log('⚠️  No play counts file found on device (first sync?)');
          this.pulledPlayCountsFile = null;
        } else {
          throw error;
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to pull play counts from device:', error);
      throw error;
    }
  }

  /**
   * Merge device play counts with local play counts
   * Play counts are ADDED together, most recent lastPlayed wins
   */
  async mergePlayCounts() {
    try {
      console.log('🔄 Merging play counts...');
      
      if (!this.pulledPlayCountsFile) {
        console.log('⚠️  No pulled play counts to merge');
        return;
      }
      
      // Read device play counts
      const devicePlayCounts = await fs.readJson(this.pulledPlayCountsFile);
      console.log(`📊 Processing ${devicePlayCounts.length} device play count entries...`);
      
      let updated = 0;
      let added = 0;
      
      for (const entry of devicePlayCounts) {
        try {
          const { fileName, playCount: devicePlayCount, lastPlayed: deviceLastPlayed, isFavorite, rating } = entry;
          
          // Find the song in local database
          const song = await this.findSongByFilename(fileName);
          
          if (song) {
            // Song exists - merge metadata
            const localPlayCount = song.play_count || 0;
            const localLastPlayed = song.last_played || 0;
            
            // Add play counts together
            const mergedPlayCount = localPlayCount + devicePlayCount;
            
            // Use most recent lastPlayed
            const mergedLastPlayed = Math.max(localLastPlayed, deviceLastPlayed || 0);
            
            // Merge favorites (OR logic - if either is favorite, result is favorite)
            const mergedIsFavorite = song.is_favorite || isFavorite || false;
            
            // Use highest rating
            const mergedRating = Math.max(song.rating || 0, rating || 0);
            
            // Update database with all metadata
            await this.updateTrackMetadata(fileName, mergedPlayCount, mergedLastPlayed, mergedIsFavorite, mergedRating);
            
            console.log(`  📊 ${fileName}: plays ${localPlayCount}+${devicePlayCount}=${mergedPlayCount}, fav: ${mergedIsFavorite}, rating: ${mergedRating}`);
            updated++;
          } else {
            // Song doesn't exist locally (might be added later)
            console.log(`  ⚠️  Song not found locally: ${fileName}`);
            added++;
          }
        } catch (error) {
          console.error(`❌ Failed to process metadata for ${entry.fileName}:`, error.message);
        }
      }
      
      console.log(`✅ Play count merge complete: ${updated} updated, ${added} skipped (not in library)`);
      
      // Clean up temp file
      await fs.remove(this.pulledPlayCountsFile);
      this.pulledPlayCountsFile = null;
      
    } catch (error) {
      console.error('❌ Failed to merge play counts:', error);
      throw error;
    }
  }
  
  /**
   * Push desktop track metadata to device
   * @param {string} udid - Device UDID
   */
  async pushMetadataToDevice(udid) {
    try {
      console.log('📤 Pushing desktop track metadata to device...');
      
      const { app } = require('electron');
      const path = require('path');
      
      // Get all tracks from database
      const tracks = await this.getAllTracks();
      
      // Create metadata export (only tracks with metadata worth syncing)
      const metadataEntries = tracks
        .filter(track => track.play_count > 0 || track.is_favorite || (track.rating && track.rating > 0))
        .map(track => ({
          fileName: path.basename(track.file_path),
          playCount: track.play_count || 0,
          lastPlayed: track.last_played || null,
          isFavorite: track.is_favorite || false,
          rating: track.rating || 0
        }));
      
      console.log(`📤 Exporting ${metadataEntries.length} tracks with metadata`);
      
      // Write to temp file
      const tempDir = path.join(app.getPath('temp'), 'redshift-metadata-push');
      await fs.ensureDir(tempDir);
      const localPath = path.join(tempDir, 'play_counts.json');
      
      await fs.writeJSON(localPath, metadataEntries, { spaces: 2 });
      
      // Push to device
      const bundleId = 'com.redshiftplayer.mobile';
      const remotePath = 'Documents/SyncData/play_counts.json';
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      
      const pushCmd = `"${pythonPath}" -m pymobiledevice3 apps push --udid "${udid}" "${bundleId}" "${localPath}" "${remotePath}"`;
      await execAsync(pushCmd);
      
      console.log(`📤 Pushed track metadata to device`);
      
      // Clean up
      await fs.remove(tempDir);
      
    } catch (error) {
      console.error('❌ Failed to push track metadata:', error);
      throw error;
    }
  }

  /**
   * Get all tracks from database
   * @returns {Promise<Array>} Array of track objects
   */
  async getAllTracks() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM songs`;
      this.db.all(sql, [], (error, rows) => {
        if (error) {
          reject(error);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Find song by filename in database
   * @param {string} filename - Track filename
   */
  async findSongByFilename(filename) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM songs WHERE file_path LIKE ?`;
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
   * Update play count for a song
   * @param {string} filename - Track filename
   * @param {number} playCount - New play count
   * @param {number} lastPlayed - Last played timestamp (Unix)
   */
  async updateTrackMetadata(filename, playCount, lastPlayed, isFavorite, rating) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE songs
        SET play_count = ?,
            last_played = ?,
            is_favorite = ?,
            rating = ?,
            modified_date = strftime('%s', 'now')
        WHERE file_path LIKE ?
      `;
      this.db.run(sql, [playCount, lastPlayed, isFavorite ? 1 : 0, rating, `%${filename}`], (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

module.exports = PlayCountSyncManager;

