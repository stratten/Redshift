// src/renderer/renderer.js - Main UI Orchestrator (Refactored)

class RedshiftSyncUI {
  constructor() {
    // Initialize services first (no dependencies)
    this.logger = new LoggingService();
    this.songsMetadata = new SongsMetadataManager(this.logger);
    this.usbSyncDashboard = new USBSyncDashboard(this.logger);
    
    // Initialize components (depend on services)
    this.audioPlayer = new AudioPlayer(this);
    this.musicLibrary = new MusicLibrary(this);
    this.artistsView = new ArtistsView(this);
    this.albumsView = new AlbumsView(this);
    this.syncManager = new SyncManager(this);
    this.settingsManager = new SettingsManager(this);
    this.playlistManager = new PlaylistManager(this);
    this.dopplerSync = new DopplerSync(this);
    this.deviceManager = new DeviceManager(this);
    
    // Initialize IPC event manager (depends on components)
    this.ipcEventManager = new IPCEventManager(this);
    
    // Initialize UI
    this.initializeUI();
    this.setupEventListeners();
    this.ipcEventManager.setupListeners();
    
    // Check initial USB device status
    this.checkUSBDeviceStatus();
    
    // Auto-scan library on startup
    setTimeout(async () => {
      this.logger.logBoth('info', '🚀 RedShift music player UI initialized');
      
      try {
        this.logger.logBoth('info', '🚀 Auto-scanning music library on startup...');
        await this.musicLibrary.scanMusicLibrary();
      } catch (error) {
        this.logger.logBoth('warning', `🚀 Auto-scan failed: ${error.message}`);
      }
    }, 500);
  }
  
  initializeUI() {
    // Initialize tab switching
    this.setupTabSwitching();
    
    // Load initial settings
    this.settingsManager.loadSettings();
    
    // Load settings and auto-scan music library
    this.initializeMusicLibrary();
    
    // Initialize Artists view
    this.artistsView.initialize();
    
    // Initialize Albums view
    this.albumsView.initialize();

    // Initialize column resizing for music table once DOM is ready
    setTimeout(() => this.setupColumnResizing(), 0);
  }
  
  setupTabSwitching() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tabId = item.dataset.tab;
        const subtabId = item.dataset.subtab; // For music subtabs
        
        // Update active nav item
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Update page title based on subtab or tab
        const titles = {
          'usb-sync': 'USB Sync',
          'doppler-sync': 'Doppler Sync',
          'history': 'Transfer History',
          'settings': 'Settings'
        };
        
        const subtabTitles = {
          'library': 'All Music',
          'artists': 'Artists',
          'albums': 'Albums',
          'playlists': 'Playlists',
          'recentlyPlayed': 'Recently Played'
        };
        
        if (subtabId && subtabTitles[subtabId]) {
          document.getElementById('pageTitle').textContent = subtabTitles[subtabId];
        } else {
          document.getElementById('pageTitle').textContent = titles[tabId] || 'Music Player';
        }
        
        // Show/hide tab-specific header actions
        const usbSyncActions = document.getElementById('usbSyncActions');
        const musicActions = document.getElementById('musicActions');
        if (usbSyncActions) usbSyncActions.style.display = tabId === 'usb-sync' ? 'flex' : 'none';
        if (musicActions) musicActions.style.display = tabId === 'music' ? 'flex' : 'none';
        
        // Show/hide tab content
        tabContents.forEach(content => {
          content.style.display = 'none';
        });
        document.getElementById(`${tabId}Tab`).style.display = 'block';
        
        // Handle music subtabs from sidebar
        if (tabId === 'music' && subtabId) {
          this.switchMusicSubtab(subtabId);
        } else if (tabId === 'history') {
          this.syncManager.loadTransferHistory();
        }
      });
    });
  }
  
  switchMusicSubtab(subtabId) {
    const subtabContents = document.querySelectorAll('.subtab-content');
    
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
    } else if (subtabId === 'artists') {
      // Refresh artists view with current library data
      if (this.musicLibrary && this.musicLibrary.musicLibrary) {
        this.artistsView.refresh(this.musicLibrary.musicLibrary);
      }
    } else if (subtabId === 'albums') {
      // Refresh albums view with current library data
      if (this.musicLibrary && this.musicLibrary.musicLibrary) {
        this.albumsView.refresh(this.musicLibrary.musicLibrary);
      }
    }
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
        } else if (subtabId === 'artists') {
          // Refresh artists view with current library data
          if (this.musicLibrary && this.musicLibrary.musicLibrary) {
            this.artistsView.refresh(this.musicLibrary.musicLibrary);
          }
        } else if (subtabId === 'albums') {
          // Refresh albums view with current library data
          if (this.musicLibrary && this.musicLibrary.musicLibrary) {
            this.albumsView.refresh(this.musicLibrary.musicLibrary);
          }
        }
      });
    });
  }
  
  setupEventListeners() {
    // Scan for Devices buttons (header and empty state)
    const scanDevicesBtn = document.getElementById('scanDevicesBtn');
    const scanDevicesBtnEmpty = document.getElementById('scanDevicesBtnEmpty');
    
    const scanHandler = async () => {
      this.logger.logBoth('info', 'Scanning for connected devices...');
      await this.checkUSBDeviceStatus();
    };
    
    if (scanDevicesBtn) {
      scanDevicesBtn.addEventListener('click', scanHandler);
    }
    if (scanDevicesBtnEmpty) {
      scanDevicesBtnEmpty.addEventListener('click', scanHandler);
    }
    
    // Setup drag-and-drop for music library
    this.setupDragAndDrop();
  }
  
  /**
   * Setup drag-and-drop handlers for adding music to library
   */
  setupDragAndDrop() {
    const musicTable = document.getElementById('musicTable');
    const musicTab = document.querySelector('[data-tab="music"]');
    
    if (!musicTable) {
      console.warn('Music table not found for drag-and-drop setup');
      return;
    }
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      musicTable.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    // Visual feedback when dragging over
    musicTable.addEventListener('dragenter', (e) => {
      // Only show feedback if we're on the music tab
      if (musicTab && musicTab.classList.contains('active')) {
        musicTable.style.opacity = '0.6';
        musicTable.style.border = '2px dashed #3b82f6';
      }
    });
    
    musicTable.addEventListener('dragleave', (e) => {
      // Only if leaving the music table itself
      if (e.target === musicTable) {
        musicTable.style.opacity = '1';
        musicTable.style.border = '';
      }
    });
    
    musicTable.addEventListener('drop', async (e) => {
      musicTable.style.opacity = '1';
      musicTable.style.border = '';
      
      // Only handle drops if we're on the music tab
      if (!musicTab || !musicTab.classList.contains('active')) {
        return;
      }
      
      const files = Array.from(e.dataTransfer.files);
      
      if (files.length === 0) {
        return;
      }
      
      this.logger.logBoth('info', `📥 Dropped ${files.length} item(s) into library`);
      
      try {
        const paths = files.map(f => f.path);
        const result = await window.electronAPI.invoke('add-files-to-library', { paths });
        
        if (result.success) {
          this.logger.logBoth('success', `✅ Added ${result.filesAdded} file(s) to library`);
          
          // Rescan library to pick up new files
          this.logger.logBoth('info', '🔄 Rescanning library...');
          await this.musicLibrary.scanMusicLibrary();
        } else {
          this.logger.logBoth('error', `❌ Failed to add files: ${result.error}`);
        }
      } catch (error) {
        this.logger.logBoth('error', `❌ Error adding files to library: ${error.message}`);
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
    let leftTh = null;
    let rightTh = null;
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
      if (newLeft < leftMin || newRight < rightMin) return;
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
        this.logger.logBoth('info', '📚 Initializing music library...');
        await this.musicLibrary.scanMusicLibrary();
      } catch (error) {
        this.logger.logBoth('warning', `📚 Music library initialization failed: ${error.message}`);
      }
    }, 1000);
  }

  // Legacy compatibility methods (delegated to services/managers)
  addLog(type, message) {
    this.logger.addLog(type, message);
  }
  
  logBoth(type, message, prefix = '🎵') {
    this.logger.logBoth(type, message, prefix);
  }

  async toggleFavorite(filePath, isFavorite) {
    return this.songsMetadata.toggleFavorite(filePath, isFavorite);
  }

  async setRating(filePath, rating) {
    return this.songsMetadata.setRating(filePath, rating);
  }

  async getAllSongMetadata() {
    return this.songsMetadata.getAllSongMetadata();
  }

  async getFavorites() {
    return this.songsMetadata.getFavorites();
  }

  async getTopPlayed(limit = 50) {
    return this.songsMetadata.getTopPlayed(limit);
  }

  async updateSongMetadata(filePath, fieldType, newValue) {
    return this.songsMetadata.updateSongMetadata(filePath, fieldType, newValue);
  }

  showInFinder(filePath) {
    this.songsMetadata.showInFinder(filePath);
  }

  getFileInfo(filePath) {
    this.songsMetadata.getFileInfo(filePath);
  }

  updateUSBSyncDeviceStatus(connected, deviceName = '') {
    // Legacy method - deprecated, device cards are now created via usb-device-scanned events
  }

  async checkUSBDeviceStatus() {
    try {
      const status = await window.electronAPI.invoke('usb-sync-get-status');
      console.log('📱 Initial USB device status:', status);
      
      if (status.isConnected && status.connectedDevices && status.connectedDevices.length > 0) {
        const device = status.connectedDevices[0];
        const deviceLabel = device.deviceName || device.deviceType || 'iOS Device';
        console.log('📱 Device connected at startup:', deviceLabel);
        
        // Trigger a device scan since the device was already connected
        console.log('📱 Triggering device scan for already-connected device');
        await window.electronAPI.invoke('usb-sync-rescan');
      }
    } catch (error) {
      this.logger.logBoth('warning', `Failed to check USB device status: ${error.message}`);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.redshiftUI = new RedshiftSyncUI();
});

// Handle window close prevention during transfers
window.addEventListener('beforeunload', (e) => {
  if (window.redshiftUI && window.redshiftUI.syncManager.isTransferring) {
    e.preventDefault();
    e.returnValue = 'Transfer in progress. Are you sure you want to close?';
  }
});
