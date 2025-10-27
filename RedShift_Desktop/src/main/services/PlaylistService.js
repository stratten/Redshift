// src/main/services/PlaylistService.js - Playlist Management Service

const path = require('path');

class PlaylistService {
  constructor(database, settings, eventEmitter) {
    this.db = database;
    this.settings = settings;
    this.eventEmitter = eventEmitter;
  }
  
  /**
   * Create a new playlist
   */
  async createPlaylist(name, description = '', syncToDoppler = true) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO playlists (name, description, sync_to_doppler)
        VALUES (?, ?, ?)
      `;
      
      this.db.run(sql, [name, description, syncToDoppler ? 1 : 0], function(error) {
        if (error) {
          reject(new Error(`Failed to create playlist: ${error.message}`));
        } else {
          const playlist = {
            id: this.lastID,
            name,
            description,
            created_date: Math.floor(Date.now() / 1000),
            modified_date: Math.floor(Date.now() / 1000),
            track_count: 0,
            duration: 0,
            sync_to_doppler: syncToDoppler
          };
          
          console.log(`🎵 Created playlist: "${name}" (ID: ${this.lastID})`);
          resolve(playlist);
        }
      });
    });
  }
  
  /**
   * Get all playlists
   */
  async getAllPlaylists() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT p.*, 
               COUNT(pt.id) as actual_track_count,
               SUM(CASE WHEN pt.id IS NOT NULL THEN 1 ELSE 0 END) as track_count
        FROM playlists p
        LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
        GROUP BY p.id
        ORDER BY p.name
      `;
      
      this.db.all(sql, [], (error, rows) => {
        if (error) {
          reject(new Error(`Failed to get playlists: ${error.message}`));
        } else {
          const playlists = rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            created_date: row.created_date,
            modified_date: row.modified_date,
            track_count: row.actual_track_count || 0,
            duration: row.duration || 0,
            is_smart: row.is_smart === 1,
            smart_criteria: row.smart_criteria,
            sync_to_doppler: row.sync_to_doppler === 1,
            doppler_playlist_id: row.doppler_playlist_id
          }));
          resolve(playlists);
        }
      });
    });
  }
  
  /**
   * Get a specific playlist by ID
   */
  async getPlaylist(playlistId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM playlists WHERE id = ?`;
      
      this.db.get(sql, [playlistId], (error, row) => {
        if (error) {
          reject(new Error(`Failed to get playlist: ${error.message}`));
        } else if (!row) {
          reject(new Error(`Playlist not found: ${playlistId}`));
        } else {
          resolve({
            id: row.id,
            name: row.name,
            description: row.description,
            created_date: row.created_date,
            modified_date: row.modified_date,
            track_count: row.track_count,
            duration: row.duration,
            is_smart: row.is_smart === 1,
            smart_criteria: row.smart_criteria,
            sync_to_doppler: row.sync_to_doppler === 1,
            doppler_playlist_id: row.doppler_playlist_id
          });
        }
      });
    });
  }
  
  /**
   * Update playlist metadata
   */
  async updatePlaylist(playlistId, updates) {
    return new Promise((resolve, reject) => {
      const allowedFields = ['name', 'description', 'sync_to_doppler'];
      const updateFields = [];
      const values = [];
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ?`);
          values.push(key === 'sync_to_doppler' ? (value ? 1 : 0) : value);
        }
      }
      
      if (updateFields.length === 0) {
        reject(new Error('No valid fields to update'));
        return;
      }
      
      updateFields.push('modified_date = strftime("%s", "now")');
      values.push(playlistId);
      
      const sql = `UPDATE playlists SET ${updateFields.join(', ')} WHERE id = ?`;
      
      this.db.run(sql, values, function(error) {
        if (error) {
          reject(new Error(`Failed to update playlist: ${error.message}`));
        } else if (this.changes === 0) {
          reject(new Error(`Playlist not found: ${playlistId}`));
        } else {
          console.log(`🎵 Updated playlist ${playlistId}`);
          resolve();
        }
      });
    });
  }
  
  /**
   * Delete a playlist
   */
  async deletePlaylist(playlistId) {
    return new Promise((resolve, reject) => {
      // First get the playlist name for logging
      this.getPlaylist(playlistId)
        .then(playlist => {
          const sql = `DELETE FROM playlists WHERE id = ?`;
          
          this.db.run(sql, [playlistId], function(error) {
            if (error) {
              reject(new Error(`Failed to delete playlist: ${error.message}`));
            } else if (this.changes === 0) {
              reject(new Error(`Playlist not found: ${playlistId}`));
            } else {
              console.log(`🎵 Deleted playlist: "${playlist.name}" (ID: ${playlistId})`);
              resolve();
            }
          });
        })
        .catch(reject);
    });
  }
  
  /**
   * Add tracks to a playlist
   */
  async addTracksToPlaylist(playlistId, filePaths) {
    if (!Array.isArray(filePaths)) {
      filePaths = [filePaths];
    }
    
    return new Promise((resolve, reject) => {
      // Get the current maximum position
      const getMaxPositionSql = `SELECT COALESCE(MAX(position), 0) as max_pos FROM playlist_tracks WHERE playlist_id = ?`;
      
      this.db.get(getMaxPositionSql, [playlistId], (error, row) => {
        if (error) {
          reject(new Error(`Failed to get playlist position: ${error.message}`));
          return;
        }
        
        let currentPosition = row.max_pos;
        const insertSql = `INSERT INTO playlist_tracks (playlist_id, file_path, position) VALUES (?, ?, ?)`;
        
        // Insert tracks one by one to maintain order
        let insertPromises = filePaths.map((filePath, index) => {
          return new Promise((insertResolve, insertReject) => {
            currentPosition++;
            this.db.run(insertSql, [playlistId, filePath, currentPosition], function(insertError) {
              if (insertError) {
                insertReject(new Error(`Failed to add track: ${insertError.message}`));
              } else {
                insertResolve();
              }
            });
          });
        });
        
        Promise.all(insertPromises)
          .then(() => {
            // Update playlist track count and modified date
            this.updatePlaylistStats(playlistId)
              .then(() => {
                console.log(`🎵 Added ${filePaths.length} track(s) to playlist ${playlistId}`);
                resolve();
              })
              .catch(reject);
          })
          .catch(reject);
      });
    });
  }
  
  /**
   * Remove tracks from a playlist
   */
  async removeTracksFromPlaylist(playlistId, trackIds) {
    if (!Array.isArray(trackIds)) {
      trackIds = [trackIds];
    }
    
    return new Promise((resolve, reject) => {
      const placeholders = trackIds.map(() => '?').join(',');
      const sql = `DELETE FROM playlist_tracks WHERE playlist_id = ? AND id IN (${placeholders})`;
      
      this.db.run(sql, [playlistId, ...trackIds], (error) => {
        if (error) {
          reject(new Error(`Failed to remove tracks: ${error.message}`));
        } else {
          // Reorder remaining tracks to fill gaps
          this.reorderPlaylistTracks(playlistId)
            .then(() => {
              this.updatePlaylistStats(playlistId)
                .then(() => {
                  console.log(`🎵 Removed ${trackIds.length} track(s) from playlist ${playlistId}`);
                  resolve();
                })
                .catch(reject);
            })
            .catch(reject);
        }
      });
    });
  }
  
  /**
   * Get tracks in a playlist
   */
  async getPlaylistTracks(playlistId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT pt.id, pt.file_path, pt.position, pt.added_date
        FROM playlist_tracks pt
        WHERE pt.playlist_id = ?
        ORDER BY pt.position
      `;
      
      this.db.all(sql, [playlistId], (error, rows) => {
        if (error) {
          reject(new Error(`Failed to get playlist tracks: ${error.message}`));
        } else {
          resolve(rows.map(row => ({
            id: row.id,
            file_path: row.file_path,
            position: row.position,
            added_date: row.added_date
          })));
        }
      });
    });
  }
  
  /**
   * Reorder tracks in a playlist
   */
  async reorderPlaylistTracks(playlistId, trackOrder = null) {
    return new Promise((resolve, reject) => {
      if (trackOrder) {
        // Specific reordering based on provided track IDs
        const updatePromises = trackOrder.map((trackId, index) => {
          return new Promise((updateResolve, updateReject) => {
            const sql = `UPDATE playlist_tracks SET position = ? WHERE id = ? AND playlist_id = ?`;
            this.db.run(sql, [index + 1, trackId, playlistId], function(error) {
              if (error) {
                updateReject(error);
              } else {
                updateResolve();
              }
            });
          });
        });
        
        Promise.all(updatePromises).then(resolve).catch(reject);
      } else {
        // Fill gaps in positions (after deletions)
        const sql = `
          UPDATE playlist_tracks 
          SET position = (
            SELECT COUNT(*) 
            FROM playlist_tracks pt2 
            WHERE pt2.playlist_id = playlist_tracks.playlist_id 
            AND pt2.id <= playlist_tracks.id
          )
          WHERE playlist_id = ?
        `;
        
        this.db.run(sql, [playlistId], (error) => {
          if (error) {
            reject(new Error(`Failed to reorder tracks: ${error.message}`));
          } else {
            resolve();
          }
        });
      }
    });
  }
  
  /**
   * Update playlist statistics (track count, duration)
   */
  async updatePlaylistStats(playlistId) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE playlists 
        SET track_count = (
          SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?
        ),
        modified_date = strftime('%s', 'now')
        WHERE id = ?
      `;
      
      this.db.run(sql, [playlistId, playlistId], (error) => {
        if (error) {
          reject(new Error(`Failed to update playlist stats: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Export playlist to M3U format
   */
  async exportPlaylistToM3U(playlistId, filePath) {
    try {
      const playlist = await this.getPlaylist(playlistId);
      const tracks = await this.getPlaylistTracks(playlistId);
      
      let m3uContent = `#EXTM3U\n#PLAYLIST:${playlist.name}\n\n`;
      
      for (const track of tracks) {
        // Add track path (M3U format)
        m3uContent += `${track.file_path}\n`;
      }
      
      const fs = require('fs-extra');
      await fs.writeFile(filePath, m3uContent, 'utf8');
      
      console.log(`🎵 Exported playlist "${playlist.name}" to ${filePath}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to export playlist: ${error.message}`);
    }
  }
  
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
   * @param {number} playlistId - Playlist ID
   * @param {number} createdDate - Created timestamp (Unix)
   * @param {number} modifiedDate - Modified timestamp (Unix)
   */
  async updatePlaylistTimestamps(playlistId, createdDate, modifiedDate) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE playlists
        SET created_date = ?, modified_date = ?
        WHERE id = ?
      `;
      
      this.db.run(sql, [createdDate, modifiedDate, playlistId], (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Remove all tracks from playlist
   * @param {number} playlistId - Playlist ID
   */
  async removeAllTracksFromPlaylist(playlistId) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM playlist_tracks WHERE playlist_id = ?`;
      this.db.run(sql, [playlistId], (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Import playlist from M3U format
   */
  async importPlaylistFromM3U(filePath, playlistName = null) {
    try {
      const fs = require('fs-extra');
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      
      // Extract playlist name if not provided
      if (!playlistName) {
        const playlistLine = lines.find(line => line.startsWith('#PLAYLIST:'));
        playlistName = playlistLine ? playlistLine.substring(10) : path.basename(filePath, '.m3u');
      }
      
      // Create playlist
      const playlist = await this.createPlaylist(playlistName, `Imported from ${path.basename(filePath)}`);
      
      // Extract file paths (skip M3U metadata lines)
      const trackPaths = lines.filter(line => !line.startsWith('#') && line.length > 0);
      
      // Add tracks to playlist
      if (trackPaths.length > 0) {
        await this.addTracksToPlaylist(playlist.id, trackPaths);
      }
      
      console.log(`🎵 Imported playlist "${playlistName}" with ${trackPaths.length} tracks`);
      return playlist;
    } catch (error) {
      throw new Error(`Failed to import playlist: ${error.message}`);
    }
  }
  
  /**
   * Get playlists that should sync to Doppler
   */
  async getPlaylistsForSync() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM playlists WHERE sync_to_doppler = 1 ORDER BY name`;
      
      this.db.all(sql, [], (error, rows) => {
        if (error) {
          reject(new Error(`Failed to get sync playlists: ${error.message}`));
        } else {
          resolve(rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            track_count: row.track_count,
            doppler_playlist_id: row.doppler_playlist_id
          })));
        }
      });
    });
  }
  
  /**
   * Mark playlist as synced to Doppler with external ID
   */
  async markPlaylistSynced(playlistId, dopplerPlaylistId) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE playlists SET doppler_playlist_id = ? WHERE id = ?`;
      
      this.db.run(sql, [dopplerPlaylistId, playlistId], function(error) {
        if (error) {
          reject(new Error(`Failed to mark playlist as synced: ${error.message}`));
        } else {
          console.log(`🎵 Marked playlist ${playlistId} as synced to Doppler (${dopplerPlaylistId})`);
          resolve();
        }
      });
    });
  }
}

module.exports = PlaylistService;
