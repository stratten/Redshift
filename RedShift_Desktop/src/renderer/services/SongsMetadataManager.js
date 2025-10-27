// SongsMetadataManager.js - Handle song-level operations

class SongsMetadataManager {
  constructor(loggingService) {
    this.logger = loggingService;
  }
  
  /**
   * Toggle favorite status for a track
   * @param {string} filePath - Path to the audio file
   * @param {boolean} isFavorite - New favorite status
   */
  async toggleFavorite(filePath, isFavorite) {
    try {
      await window.electronAPI.invoke('songs-toggle-favorite', filePath, !!isFavorite);
      this.logger.logBoth('success', `${isFavorite ? 'Added to' : 'Removed from'} favourites: ${filePath}`);
    } catch (error) {
      this.logger.logBoth('error', `Failed to toggle favourite: ${error.message}`);
    }
  }

  /**
   * Set rating for a track
   * @param {string} filePath - Path to the audio file
   * @param {number} rating - Rating value (0-5)
   */
  async setRating(filePath, rating) {
    try {
      const r = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
      await window.electronAPI.invoke('songs-set-rating', filePath, r);
      this.logger.logBoth('success', `Set rating ${r}/5 for: ${filePath}`);
    } catch (error) {
      this.logger.logBoth('error', `Failed to set rating: ${error.message}`);
    }
  }

  /**
   * Get all song metadata
   * @returns {Promise<Array>} Array of song metadata objects
   */
  async getAllSongMetadata() {
    try {
      const rows = await window.electronAPI.invoke('songs-get-all-metadata');
      this.logger.logBoth('info', `Loaded song metadata for ${rows.length} songs`);
      return rows;
    } catch (error) {
      this.logger.logBoth('error', `Failed to load song metadata: ${error.message}`);
      return [];
    }
  }

  /**
   * Get all favorite tracks
   * @returns {Promise<Array>} Array of favorite tracks
   */
  async getFavorites() {
    try {
      const rows = await window.electronAPI.invoke('songs-get-favorites');
      this.logger.logBoth('info', `Loaded favourites (${rows.length})`);
      return rows;
    } catch (error) {
      this.logger.logBoth('error', `Failed to load favourites: ${error.message}`);
      return [];
    }
  }

  /**
   * Get top played tracks
   * @param {number} limit - Maximum number of tracks to return
   * @returns {Promise<Array>} Array of top played tracks
   */
  async getTopPlayed(limit = 50) {
    try {
      const rows = await window.electronAPI.invoke('songs-get-top-played', limit);
      this.logger.logBoth('info', `Loaded top played (${rows.length})`);
      return rows;
    } catch (error) {
      this.logger.logBoth('error', `Failed to load top played: ${error.message}`);
      return [];
    }
  }

  /**
   * Update song metadata (writes to actual audio file)
   * @param {string} filePath - Path to the audio file
   * @param {string} fieldType - Field to update (e.g., 'title', 'artist', 'album')
   * @param {string} newValue - New value for the field
   * @returns {Promise<boolean>} True if successful
   */
  async updateSongMetadata(filePath, fieldType, newValue) {
    try {
      // Build updates object with the field being changed
      const updates = {};
      updates[fieldType] = newValue;
      
      // Call the IPC handler that writes to actual audio files
      const result = await window.electronAPI.invoke('update-track-metadata', filePath, updates);
      
      if (result.success) {
        this.logger.logBoth('success', `✅ Wrote ID3 tags to file: ${fieldType} = "${newValue}"`);
        return true;
      } else {
        throw new Error(result.message || 'Update failed');
      }
    } catch (error) {
      this.logger.logBoth('error', `Failed to update file metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Show file in Finder/Explorer
   * @param {string} filePath - Path to the file
   */
  showInFinder(filePath) {
    this.logger.logBoth('info', `Show in Finder: ${filePath}`);
    window.electronAPI.invoke('show-in-finder', filePath);
  }

  /**
   * Get file info (open system properties dialog)
   * @param {string} filePath - Path to the file
   */
  getFileInfo(filePath) {
    this.logger.logBoth('info', `Get Info: ${filePath}`);
    window.electronAPI.invoke('get-file-info', filePath);
  }
}

