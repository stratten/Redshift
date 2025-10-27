// USBSyncDashboard.js - USB sync dashboard UI management

class USBSyncDashboard {
  constructor(loggingService) {
    this.logger = loggingService;
  }
  
  /**
   * Update USB sync dashboard with stats
   * @param {number} syncedCount - Number of synced tracks
   * @param {number} totalCount - Total number of tracks
   * @param {number} unsyncedCount - Number of unsynced tracks
   */
  updateDashboard(syncedCount, totalCount, unsyncedCount) {
    // Show the overview cards
    const overview = document.getElementById('usbSyncOverview');
    if (overview) {
      overview.style.display = 'flex';
    }
    
    // Update the stat cards
    const totalEl = document.getElementById('usbTotalTracksCount');
    const syncedEl = document.getElementById('usbSyncedTracksCount');
    const unsyncedEl = document.getElementById('usbUnsyncedTracksCount');
    
    if (totalEl) totalEl.textContent = totalCount;
    if (syncedEl) syncedEl.textContent = syncedCount;
    if (unsyncedEl) unsyncedEl.textContent = unsyncedCount;
    
    // Show tracks list only if there are unsynced tracks
    const tracksList = document.getElementById('usbTracksList');
    if (tracksList) {
      if (unsyncedCount > 0) {
        tracksList.style.display = 'block';
        this.loadUnsyncedTracks();
      } else {
        tracksList.style.display = 'none';
      }
    }
  }

  /**
   * Hide the USB sync dashboard
   */
  hideDashboard() {
    const overview = document.getElementById('usbSyncOverview');
    const tracksList = document.getElementById('usbTracksList');
    
    if (overview) {
      overview.style.display = 'none';
    }
    if (tracksList) {
      tracksList.style.display = 'none';
    }
  }

  /**
   * Load and display unsynced tracks list
   */
  async loadUnsyncedTracks() {
    const container = document.getElementById('usbTracksListContent');
    if (!container) return;
    
    try {
      // Get the list of unsynced tracks from the backend
      const unsyncedTracks = await window.electronAPI.invoke('usb-sync-get-unsynced-tracks');
      
      if (!unsyncedTracks || unsyncedTracks.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
            <h3>All tracks synced!</h3>
            <p>Your device has all tracks from your library</p>
          </div>
        `;
        return;
      }
      
      // Calculate total size
      const totalSize = unsyncedTracks.reduce((sum, track) => sum + (track.size || 0), 0);
      const sizeEl = document.getElementById('usbTracksListSize');
      if (sizeEl) {
        sizeEl.textContent = `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
      }
      
      // Display tracks (limit to first 50 for performance)
      const displayTracks = unsyncedTracks.slice(0, 50);
      container.innerHTML = displayTracks.map(track => `
        <div class="file-item">
          <div class="file-info">
            <div class="file-name">${this.escapeHtml(track.title || track.name)}</div>
            <div class="file-meta">${this.escapeHtml(track.artist || 'Unknown Artist')} • ${this.escapeHtml(track.album || 'Unknown Album')}</div>
          </div>
          <div class="file-size">${(track.size / (1024 * 1024)).toFixed(1)} MB</div>
        </div>
      `).join('');
      
      if (unsyncedTracks.length > 50) {
        container.innerHTML += `
          <div style="padding: 15px; text-align: center; color: #666;">
            ... and ${unsyncedTracks.length - 50} more tracks
          </div>
        `;
      }
      
    } catch (error) {
      console.error('Failed to load unsynced tracks:', error);
      container.innerHTML = `
        <div class="empty-state">
          <p style="color: #e74c3c;">Failed to load track list</p>
        </div>
      `;
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

