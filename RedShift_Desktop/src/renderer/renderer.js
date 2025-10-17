// src/renderer/renderer.js - Main UI Manager (Refactored)

class RedshiftSyncUI {
  constructor() {
    // Initialize components
    this.audioPlayer = new AudioPlayer(this);
    this.musicLibrary = new MusicLibrary(this);
    this.syncManager = new SyncManager(this);
    this.settingsManager = new SettingsManager(this);
    this.playlistManager = new PlaylistManager(this);
    this.dopplerSync = new DopplerSync(this);
    
    this.initializeUI();
    this.setupEventListeners();
    this.setupIPCListeners();
    
    // Test terminal logging and auto-scan library
    setTimeout(async () => {
      this.logBoth('info', '🚀 RedShift music player UI initialized');
      
      // Auto-scan music library on startup
      try {
        this.logBoth('info', '🚀 Auto-scanning music library on startup (setTimeout 500ms)...');
        await this.musicLibrary.scanMusicLibrary();
      } catch (error) {
        this.logBoth('warning', `🚀 Auto-scan failed: ${error.message}`);
      }
    }, 500); // Increased delay to ensure UI is fully loaded
  }
  
  initializeUI() {
    // Initialize tab switching
    this.setupTabSwitching();
    
    // Load initial settings
    this.settingsManager.loadSettings();
    
    // Check phone connection status
    this.checkPhoneConnection();
    
    // Load settings and auto-scan music library
    this.initializeMusicLibrary();

    // Initialize column resizing for music table once DOM is ready
    setTimeout(() => this.setupColumnResizing(), 0);
  }
  
  setupTabSwitching() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tabId = item.dataset.tab;
        
        // Update active nav item
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Update page title
        const titles = {
          dashboard: 'Dashboard',
          music: 'Music Player',
          sync: 'Doppler Sync',
          history: 'Transfer History',
          settings: 'Settings'
        };
        document.getElementById('pageTitle').textContent = titles[tabId];
        
        // Show/hide tab-specific header actions
        document.getElementById('dashboardActions').style.display = tabId === 'dashboard' ? 'flex' : 'none';
        document.getElementById('musicActions').style.display = tabId === 'music' ? 'flex' : 'none';
        
        // Show/hide tab content
        tabContents.forEach(content => {
          content.style.display = 'none';
        });
        document.getElementById(`${tabId}Tab`).style.display = 'block';
        
          // Load tab-specific data
          if (tabId === 'history') {
            this.syncManager.loadTransferHistory();
          } else if (tabId === 'music') {
            // Initialize subtabs for music tab
            this.setupMusicSubtabs();
          }
        });
      });
    }
    
    setupMusicSubtabs() {
      const subtabItems = document.querySelectorAll('.subtab-item');
      const subtabContents = document.querySelectorAll('.subtab-content');
      
      subtabItems.forEach(item => {
        item.addEventListener('click', () => {
          const subtabId = item.dataset.subtab;
          
          // Update active subtab item
          subtabItems.forEach(sub => sub.classList.remove('active'));
          item.classList.add('active');
          
          // Show/hide subtab content
          subtabContents.forEach(content => {
            content.style.display = 'none';
          });
          document.getElementById(`${subtabId}Subtab`).style.display = 'block';
          
          // Load subtab-specific data
          if (subtabId === 'playlists') {
            // Playlists are automatically loaded by PlaylistManager
          } else if (subtabId === 'recentlyPlayed') {
            this.musicLibrary.loadRecentlyPlayed();
          }
        });
      });
    }
  
  setupEventListeners() {
    // All event listeners are now handled by components
    // This keeps the main class clean and focused
  }
  
  setupIPCListeners() {
    // Phone connection status
    window.electronAPI.on('phone-connected', (data) => {
      this.syncManager.updatePhoneStatus(true, `${data.deviceType} connected`);
    });
    
    window.electronAPI.on('phone-disconnected', (data) => {
      this.syncManager.updatePhoneStatus(false, `${data.deviceType || 'iPhone'} disconnected`);
    });
    
    // File system events
    window.electronAPI.on('file-added', (data) => {
      this.addLog('info', `New file detected: ${data.path.split('/').pop()}`);
    });
    
    window.electronAPI.on('file-changed', (data) => {
      this.addLog('info', `File modified: ${data.path.split('/').pop()}`);
    });
    
    // Scan events
    window.electronAPI.on('scan-started', () => {
      this.syncManager.updateScanState(true);
    });
    
    window.electronAPI.on('scan-completed', (data) => {
      this.syncManager.updateScanState(false);
      this.syncManager.updateSyncData(data);
    });
    
    window.electronAPI.on('scan-error', (data) => {
      this.syncManager.updateScanState(false);
      this.addLog('error', `Scan failed: ${data.error}`);
    });
    
    // Transfer events
    window.electronAPI.on('transfer-started', (data) => {
      this.syncManager.updateTransferState(true);
      this.syncManager.showTransferProgress(data.total, data.method);
    });
    
    window.electronAPI.on('transfer-progress', (data) => {
      this.syncManager.updateTransferProgress(data.current, data.total, data.currentFile);
    });
    
    window.electronAPI.on('transfer-completed', (data) => {
      this.syncManager.updateTransferState(false);
      this.syncManager.hideTransferModal();
      this.addLog('success', `Transfer completed: ${data.transferred} files via ${data.method}`);
      // Clear current files and rescan
      this.syncManager.currentFiles = [];
      this.syncManager.updateFilesList();
      this.syncManager.updateStats();
    });
    
    window.electronAPI.on('transfer-error', (data) => {
      this.syncManager.updateTransferState(false);
      this.syncManager.hideTransferModal();
      this.addLog('error', `Transfer failed: ${data.error}`);
    });
    
    // Log messages
    window.electronAPI.on('log', (data) => {
      this.addLog(data.type, data.message);
    });
    
    // Audio player events
    window.electronAPI.on('audio-state-changed', (data) => {
      console.log('🎵 Audio state changed:', data);
      this.audioPlayer.updateAudioPlayerState(data);
    });
    
    window.electronAPI.on('audio-track-loaded', (data) => {
      console.log('🎵 Track loaded:', data);
      this.audioPlayer.updateTrackInfo(data.track);
    });
    
    window.electronAPI.on('audio-play', (data) => {
      console.log('🎵 Audio play event:', data);
      this.audioPlayer.updatePlaybackState(true);
    });
    
    window.electronAPI.on('audio-pause', (data) => {
      console.log('🎵 Audio pause event:', data);
      this.audioPlayer.updatePlaybackState(false);
    });
    
    window.electronAPI.on('audio-stop', (data) => {
      console.log('🎵 Audio stop event:', data);
      this.audioPlayer.updatePlaybackState(false);
      this.audioPlayer.updateProgress(0, this.audioPlayer.audioPlayerState.duration);
    });
    
    // Disable external progress writes to avoid fighting with local HTML5 audio clock
    // The renderer's Audio element is the single source of truth for timeline UI
    window.electronAPI.on('audio-position-changed', (data) => {
      // Intentionally no-op to prevent jitter after seeks
      // console.log('🎵 (ignored) external position update', data.position, '/', data.duration);
    });
    
    window.electronAPI.on('audio-volume-changed', (data) => {
      console.log('🎵 Volume changed:', data);
      this.audioPlayer.updateVolumeUI(data.volume, data.isMuted);
    });
    
    window.electronAPI.on('audio-queue-changed', (data) => {
      console.log('🎵 Queue changed:', data);
      this.audioPlayer.updateQueueUI(data.queue, data.currentIndex);
    });
    
    window.electronAPI.on('audio-track-ended', (data) => {
      console.log('🎵 Track ended:', data);
    });
    
    window.electronAPI.on('audio-error', (data) => {
      console.error('🎵 Audio error:', data);
      this.addLog('error', `Audio error: ${data.error}`);
    });

    // Reflect shuffle/repeat changes immediately from main
    window.electronAPI.on('audio-shuffle-changed', (data) => {
      if (data && typeof data.shuffleMode === 'boolean') {
        this.audioPlayer.updateShuffleButton(data.shuffleMode);
      }
    });
    window.electronAPI.on('audio-repeat-changed', (data) => {
      if (data && data.repeatMode) {
        this.audioPlayer.updateRepeatButton(data.repeatMode);
      }
    });
  }

  // Column resizing for music table (adjacent-only)
  setupColumnResizing() {
    const table = document.getElementById('musicTable');
    if (!table) return;
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return;

    // Add explicit handles to headers except last
    const headers = Array.from(headerRow.children);
    headers.forEach((th, i) => {
      if (i === headers.length - 1) return;
      let handle = th.querySelector('.col-resize-handle');
      if (!handle) {
        handle = document.createElement('div');
        handle.className = 'col-resize-handle';
        th.appendChild(handle);
      }
    });

    let dragging = false;
    let startX = 0;
    let leftTh = null; // header to left of handle (the one we grow)
    let rightTh = null; // adjacent header to the right (the one we shrink)
    let leftStartWidth = 0;
    let rightStartWidth = 0;

    const onMouseMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      let newLeft = leftStartWidth + dx;
      let newRight = rightStartWidth - dx;
      const leftMin = parseInt(window.getComputedStyle(leftTh).minWidth || '60', 10);
      const rightMin = parseInt(window.getComputedStyle(rightTh).minWidth || '60', 10);
      if (newLeft < leftMin) { newRight -= (leftMin - newLeft); newLeft = leftMin; }
      if (newRight < rightMin) { newLeft -= (rightMin - newRight); newRight = rightMin; }
      if (newLeft < leftMin || newRight < rightMin) return; // hit limits
      leftTh.style.width = `${newLeft}px`;
      rightTh.style.width = `${newRight}px`;
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    headerRow.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.col-resize-handle');
      if (!handle) return;
      const th = handle.parentElement;
      const ths = Array.from(headerRow.children);
      const idx = ths.indexOf(th);
      if (idx < 0 || idx === ths.length - 1) return;
      dragging = true;
      startX = e.clientX;
      leftTh = ths[idx];
      rightTh = ths[idx + 1];
      leftStartWidth = leftTh.getBoundingClientRect().width;
      rightStartWidth = rightTh.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  }
  
  async initializeMusicLibrary() {
    // Wait a bit for settings to load, then auto-scan
    setTimeout(async () => {
      try {
        this.logBoth('info', '📚 Initializing music library (setTimeout 1000ms)...');
        await this.musicLibrary.scanMusicLibrary();
      } catch (error) {
        this.logBoth('warning', `📚 Music library initialization failed: ${error.message}`);
      }
    }, 1000);
  }
  
  checkPhoneConnection() {
    // Initial status check - in real app this would query USB devices
    setTimeout(() => {
      // Mock connection detection
      const isConnected = Math.random() > 0.5; // 50% chance for demo
      this.syncManager.updatePhoneStatus(isConnected, 
        isConnected ? 'iPhone detected' : 'Connect iPhone via USB'
      );
    }, 1000);
  }
  
  addLog(type, message) {
    const logArea = document.getElementById('logArea');
    const time = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-type log-${type}">[${type.toUpperCase()}]</span>
      <span>${message}</span>
    `;
    
    logArea.appendChild(logEntry);
    logArea.scrollTop = logArea.scrollHeight;
    
    // Keep only last 100 log entries
    while (logArea.children.length > 100) {
      logArea.removeChild(logArea.firstChild);
    }
  }
  
  // Helper method for dual logging (console + terminal via IPC)
  logBoth(type, message, prefix = '🎵') {
    // Log to browser console with emoji prefix
    const consoleMessage = `${prefix} ${message}`;
    switch(type) {
      case 'error':
        console.error(consoleMessage);
        break;
      case 'warning':
        console.warn(consoleMessage);
        break;
      case 'info':
      case 'success':
      default:
        console.log(consoleMessage);
        break;
    }
    
    // Also log to UI 
    this.addLog(type, message);
    
    // Send to terminal via main process
    try {
      window.electronAPI.invoke('log-to-terminal', { type, message: `${prefix} ${message}` });
    } catch (error) {
      console.error('Failed to send log to terminal:', error);
    }
  }

  // --- Songs persistence IPC helpers ---
  async toggleFavorite(filePath, isFavorite) {
    try {
      await window.electronAPI.invoke('songs-toggle-favorite', filePath, !!isFavorite);
      this.logBoth('success', `${isFavorite ? 'Added to' : 'Removed from'} favourites: ${filePath}`);
    } catch (error) {
      this.logBoth('error', `Failed to toggle favourite: ${error.message}`);
    }
  }

  async setRating(filePath, rating) {
    try {
      const r = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
      await window.electronAPI.invoke('songs-set-rating', filePath, r);
      this.logBoth('success', `Set rating ${r}/5 for: ${filePath}`);
    } catch (error) {
      this.logBoth('error', `Failed to set rating: ${error.message}`);
    }
  }

  async getAllSongMetadata() {
    try {
      const rows = await window.electronAPI.invoke('songs-get-all-metadata');
      this.logBoth('info', `Loaded song metadata for ${rows.length} songs`);
      return rows;
    } catch (error) {
      this.logBoth('error', `Failed to load song metadata: ${error.message}`);
      return [];
    }
  }

  async getFavorites() {
    try {
      const rows = await window.electronAPI.invoke('songs-get-favorites');
      this.logBoth('info', `Loaded favourites (${rows.length})`);
      return rows;
    } catch (error) {
      this.logBoth('error', `Failed to load favourites: ${error.message}`);
      return [];
    }
  }

  async getTopPlayed(limit = 50) {
    try {
      const rows = await window.electronAPI.invoke('songs-get-top-played', limit);
      this.logBoth('info', `Loaded top played (${rows.length})`);
      return rows;
    } catch (error) {
      this.logBoth('error', `Failed to load top played: ${error.message}`);
      return [];
    }
  }

  async updateSongMetadata(filePath, fieldType, newValue) {
    try {
      const success = await window.electronAPI.invoke('songs-update-metadata', filePath, fieldType, newValue);
      if (success) {
        this.logBoth('success', `Updated ${fieldType} for ${filePath}`);
      } else {
        throw new Error('Update returned false');
      }
      return success;
    } catch (error) {
      this.logBoth('error', `Failed to update metadata: ${error.message}`);
      throw error;
    }
  }

  showInFinder(filePath) {
    // Use Electron's shell to show the file
    this.logBoth('info', `Show in Finder: ${filePath}`);
    window.electronAPI.invoke('show-in-finder', filePath);
  }

  getFileInfo(filePath) {
    // Open the system's file info/properties dialog
    this.logBoth('info', `Get Info: ${filePath}`);
    window.electronAPI.invoke('get-file-info', filePath);
  }
}

// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new RedshiftSyncUI();
});

// Handle window close prevention during transfers
window.addEventListener('beforeunload', (e) => {
  if (window.redshiftUI && window.redshiftUI.syncManager.isTransferring) {
    e.preventDefault();
    e.returnValue = 'Transfer in progress. Are you sure you want to close?';
  }
});
