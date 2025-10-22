// src/renderer/renderer.js - Main UI Manager (Refactored)

class RedshiftSyncUI {
  constructor() {
    // Initialize components
    this.audioPlayer = new AudioPlayer(this);
    this.musicLibrary = new MusicLibrary(this);
    this.artistsView = new ArtistsView(this);
    this.albumsView = new AlbumsView(this);
    this.syncManager = new SyncManager(this);
    this.settingsManager = new SettingsManager(this);
    this.playlistManager = new PlaylistManager(this);
    this.dopplerSync = new DopplerSync(this);
    
    this.initializeUI();
    this.setupEventListeners();
    this.setupIPCListeners();
    
    // Check initial USB device status
    this.checkUSBDeviceStatus();
    
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
      this.logBoth('info', 'Scanning for connected devices...');
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
      
      this.logBoth('info', `📥 Dropped ${files.length} item(s) into library`);
      
      try {
        const paths = files.map(f => f.path);
        const result = await window.electronAPI.invoke('add-files-to-library', { paths });
        
        if (result.success) {
          this.logBoth('success', `✅ Added ${result.filesAdded} file(s) to library`);
          
          // Rescan library to pick up new files
          this.logBoth('info', '🔄 Rescanning library...');
          await this.musicLibrary.scanMusicLibrary();
        } else {
          this.logBoth('error', `❌ Failed to add files: ${result.error}`);
        }
      } catch (error) {
        this.logBoth('error', `❌ Error adding files to library: ${error.message}`);
      }
    });
  }
  
  setupIPCListeners() {
    // Phone connection status
    window.electronAPI.on('phone-connected', (data) => {
      console.log('📱 phone-connected event received:', data);
      // Update USB sync status
      const deviceLabel = data.deviceName || data.deviceType || 'iOS Device';
      this.updateUSBSyncDeviceStatus(true, deviceLabel);
    });
    
    window.electronAPI.on('phone-disconnected', (data) => {
      console.log('📱 phone-disconnected event received:', data);
      // Update USB sync status
      this.updateUSBSyncDeviceStatus(false);
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
    
    // USB Sync events
    window.electronAPI.on('usb-device-scanned', (data) => {
      this.logBoth('info', `📡 Device scanned: ${data.deviceName || 'iOS Device'}`);
      this.logBoth('info', `   Device ID: ${data.deviceId}`);
      this.logBoth('info', `   App Installed: ${data.appInstalled}`);
      this.logBoth('info', `   Files: ${data.filesOnDevice}/${data.totalTracks}`);
      
      // Use the actual device ID from the event (convert to string to be safe)
      const deviceId = String(data.deviceId || 'unknown');
      const deviceData = {
        deviceName: data.deviceName || 'iOS Device',
        deviceType: data.deviceType || 'iOS Device',
        deviceModel: data.deviceModel || '',
        totalTracks: data.totalTracks || 0,
        filesOnDevice: data.filesOnDevice || 0,
        unsyncedTracks: data.unsyncedTracks || 0,
        appInstalled: data.appInstalled !== false
      };
      
      this.addOrUpdateDevice(deviceId, deviceData);
    });
    
    window.electronAPI.on('usb-sync-started', () => {
      this.logBoth('info', '🔄 USB sync started...');
      this.showDeviceProgress('primary', 0, 'Preparing to sync...');
    });
    
    window.electronAPI.on('usb-sync-progress', (data) => {
      const deviceId = data.deviceId || 'primary';
      const percent = Math.round((data.current / data.total) * 100);
      
      let statusText = '';
      if (data.status === 'starting') {
        const alreadyOnDevice = data.alreadyOnDevice || 0;
        if (alreadyOnDevice > 0) {
          statusText = `${alreadyOnDevice} already on device, syncing ${data.total} new/changed tracks...`;
        } else {
          statusText = `Preparing to sync ${data.total} tracks...`;
        }
      } else {
        const transferred = data.transferred || 0;
        const failed = data.failed || 0;
        const skipped = data.skipped || 0;
        statusText = `[${data.current}/${data.total}] ${transferred} sent • ${skipped} skipped • ${failed} failed`;
      }
      
      this.updateDeviceProgress(deviceId, percent, statusText);
    });
    
    window.electronAPI.on('usb-sync-completed', (data) => {
      const deviceId = data.deviceId || 'primary';
      const transferred = data.transferred || 0;
      const skipped = data.skipped || 0;
      const failed = data.failed || 0;
      const total = data.total || 0;
      
      this.logBoth('success', `✅ USB sync completed: ${transferred} transferred, ${skipped} skipped, ${failed} failed (${total} total)`);
      
      this.updateDeviceProgress(deviceId, 100, `✅ Complete: ${transferred} files synced to device`);
      
      setTimeout(() => {
        this.hideDeviceProgress(deviceId);
        // Rescan the device to update stats
        window.electronAPI.invoke('usb-sync-rescan');
      }, 3000);
    });
    
    window.electronAPI.on('usb-sync-failed', (error) => {
      const deviceId = error.deviceId || 'primary';
      this.logBoth('error', `❌ USB sync failed: ${error.message || error}`);
      this.updateDeviceProgress(deviceId, 0, `❌ Sync failed: ${error.message || error}`);
      setTimeout(() => {
        this.hideDeviceProgress(deviceId);
      }, 3000);
    });
    
    // Device scan progress
    window.electronAPI.on('device-scan-progress', (data) => {
      if (data.deviceId === this.currentScanningDevice) {
        const card = document.getElementById(`device-card-${data.deviceId}`);
        if (!card) return;
        
        const scanMusicBtn = card.querySelector('.device-scan-music-btn');
        if (scanMusicBtn) {
          scanMusicBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            ${data.percent}% (${data.current}/${data.total})
          `;
        }
      }
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
  
  addLog(type, message) {
    const logArea = document.getElementById('logArea');
    if (!logArea) {
      // Log area removed from UI, skip DOM logging
      return;
    }
    
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
      // Build updates object with the field being changed
      const updates = {};
      updates[fieldType] = newValue;
      
      // Call the new IPC handler that writes to actual audio files
      const result = await window.electronAPI.invoke('update-track-metadata', filePath, updates);
      
      if (result.success) {
        this.logBoth('success', `✅ Wrote ID3 tags to file: ${fieldType} = "${newValue}"`);
        return true;
      } else {
        throw new Error(result.message || 'Update failed');
      }
    } catch (error) {
      this.logBoth('error', `Failed to update file metadata: ${error.message}`);
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

  // USB Sync Methods
  async startUSBSync() {
    const btn = document.getElementById('usbSyncBtn');
    btn.disabled = true;

    try {
      // Events will handle all the progress updates
      await window.electronAPI.invoke('usb-sync-start');
    } catch (error) {
      // Error is already logged by event handler
    } finally {
      btn.disabled = false;
    }
  }

  async rescanDevice() {
    console.log('🔄 rescanDevice() called');
    const btn = document.getElementById('rescanDeviceBtn');
    const statusSubtext = document.getElementById('usbSyncDeviceSubtext');
    
    console.log('🔄 Button element:', btn);
    
    if (btn) {
      btn.disabled = true;
    }
    if (statusSubtext) {
      statusSubtext.textContent = 'Rescanning device...';
      statusSubtext.style.color = '';
    }
    
    try {
      console.log('🔄 Invoking usb-sync-rescan...');
      await window.electronAPI.invoke('usb-sync-rescan');
      console.log('🔄 Rescan completed');
      this.logBoth('info', '🔄 Device rescan triggered');
    } catch (error) {
      console.error('🔄 Rescan error:', error);
      this.logBoth('error', `Failed to rescan: ${error.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
      }
    }
  }

  // Device Cards Management
  connectedDevices = new Map(); // Store device data by UDID or identifier

  createDeviceCard(deviceId, deviceData) {
    this.logBoth('info', `🎨 Creating device card for: ${deviceId}`);
    this.logBoth('info', `   deviceData received: ${JSON.stringify(deviceData)}`);
    
    const card = document.createElement('div');
    card.className = 'device-card';
    card.id = `device-card-${deviceId}`;
    card.dataset.deviceId = deviceId;
    
    const { deviceName = 'iOS Device', totalTracks = 0, filesOnDevice = 0, unsyncedTracks = 0, appInstalled = true } = deviceData;
    
    this.logBoth('info', `   Using deviceName: ${deviceName}`);
    
    card.innerHTML = `
      <div class="device-card-header">
        <div class="device-card-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5a67d8" stroke-width="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
        </div>
        <div class="device-card-info">
          <h3 class="device-card-name">${deviceName}</h3>
          <p class="device-card-status">${appInstalled ? 'RedShift Mobile installed' : 'RedShift Mobile not found'}</p>
        </div>
      </div>
      
      <div class="device-card-stats">
        <div class="device-stat">
          <div class="device-stat-value">${totalTracks}</div>
          <div class="device-stat-label">Total Tracks</div>
        </div>
        <div class="device-stat">
          <div class="device-stat-value">${filesOnDevice}</div>
          <div class="device-stat-label">On Device</div>
        </div>
        <div class="device-stat">
          <div class="device-stat-value">${unsyncedTracks}</div>
          <div class="device-stat-label">To Sync</div>
        </div>
        <div class="device-stat device-music-stat" style="display: none;">
          <div class="device-stat-value" id="deviceMusicCount-${deviceId}">-</div>
          <div class="device-stat-label">On Device</div>
        </div>
        <div class="device-stat device-import-stat" style="display: none;">
          <div class="device-stat-value" id="deviceImportCount-${deviceId}">-</div>
          <div class="device-stat-label">Not in Library</div>
        </div>
      </div>
      
      <div class="device-card-actions">
        <button class="btn btn-primary device-sync-btn" data-device-id="${deviceId}" ${!appInstalled ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6"></path>
            <path d="M23 20v-6h-6"></path>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"></path>
            <path d="M3.51 15a9 9 0 0 0 14.85 4.36L23 14"></path>
          </svg>
          Push to Device
        </button>
        <button class="btn btn-secondary device-scan-music-btn" data-device-id="${deviceId}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          Scan Device Music
        </button>
        <button class="btn btn-success device-import-btn" data-device-id="${deviceId}" style="display: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Import from Device
        </button>
        <button class="btn btn-secondary device-rescan-btn" data-device-id="${deviceId}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Rescan App
        </button>
      </div>
      
      <div class="device-card-progress" style="display: none;">
        <div class="device-progress-bar">
          <div class="device-progress-fill" style="width: 0%;"></div>
        </div>
        <p class="device-progress-text">Preparing sync...</p>
      </div>
    `;
    
    // Add event listeners
    const syncBtn = card.querySelector('.device-sync-btn');
    const scanMusicBtn = card.querySelector('.device-scan-music-btn');
    const importBtn = card.querySelector('.device-import-btn');
    const rescanBtn = card.querySelector('.device-rescan-btn');
    
    syncBtn.addEventListener('click', () => this.startDeviceSync(deviceId));
    scanMusicBtn.addEventListener('click', () => this.scanDeviceMusic(deviceId));
    importBtn.addEventListener('click', () => this.importFromDevice(deviceId));
    rescanBtn.addEventListener('click', () => this.rescanDevice(deviceId));
    
    return card;
  }
  
  async scanDeviceMusic(deviceId) {
    this.logBoth('info', `🎵 Scanning device music library for: ${deviceId}`);
    
    const card = document.getElementById(`device-card-${deviceId}`);
    if (!card) return;
    
    const scanMusicBtn = card.querySelector('.device-scan-music-btn');
    const originalText = scanMusicBtn.innerHTML;
    
    try {
      // Show scanning status
      scanMusicBtn.disabled = true;
      scanMusicBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        Scanning...
      `;
      
      // Store the device ID for progress updates
      this.currentScanningDevice = deviceId;
      
      const result = await window.electronAPI.invoke('scan-device-music-library', { deviceId });
      
      if (result.success) {
        this.logBoth('success', `✅ Found ${result.totalOnDevice} music files on device, ${result.notInLibrary} not in library`);
        
        // Update stats
        const musicCountEl = document.getElementById(`deviceMusicCount-${deviceId}`);
        const importCountEl = document.getElementById(`deviceImportCount-${deviceId}`);
        const musicStatEl = card.querySelector('.device-music-stat');
        const importStatEl = card.querySelector('.device-import-stat');
        const importBtn = card.querySelector('.device-import-btn');
        
        if (musicCountEl) {
          musicCountEl.textContent = result.totalOnDevice;
          musicStatEl.style.display = 'block';
        }
        
        if (importCountEl) {
          importCountEl.textContent = result.notInLibrary;
          importStatEl.style.display = 'block';
        }
        
        // Show import button if there are files to import
        if (result.notInLibrary > 0 && importBtn) {
          importBtn.style.display = 'inline-flex';
        }
      } else {
        this.logBoth('error', `❌ Failed to scan device music: ${result.error}`);
      }
    } catch (error) {
      this.logBoth('error', `❌ Error scanning device music: ${error.message}`);
    } finally {
      // Restore button
      scanMusicBtn.disabled = false;
      scanMusicBtn.innerHTML = originalText;
    }
  }
  
  async importFromDevice(deviceId) {
    this.logBoth('info', `📥 Starting import from device: ${deviceId}`);
    
    try {
      const result = await window.electronAPI.invoke('import-from-device', { deviceId });
      
      if (result.success) {
        this.logBoth('success', `✅ Import complete: ${result.copied} files copied, ${result.skipped} skipped, ${result.errors} errors`);
        
        // Rescan library to pick up new files
        this.logBoth('info', '🔄 Rescanning library...');
        await this.musicLibrary.scanMusicLibrary();
      } else {
        this.logBoth('error', `❌ Import failed: ${result.error}`);
      }
    } catch (error) {
      this.logBoth('error', `❌ Error importing from device: ${error.message}`);
    }
  }

  updateDevicesContainer() {
    const container = document.getElementById('connectedDevicesContainer');
    if (!container) return;
    
    const emptyState = container.querySelector('.empty-devices-state');
    
    if (this.connectedDevices.size === 0) {
      // Show empty state
      if (emptyState) {
        emptyState.style.display = 'block';
      }
      // Remove all device cards
      container.querySelectorAll('.device-card').forEach(card => card.remove());
    } else {
      // Hide empty state
      if (emptyState) {
        emptyState.style.display = 'none';
      }
      
      // Update or create device cards
      this.connectedDevices.forEach((deviceData, deviceId) => {
        let card = document.getElementById(`device-card-${deviceId}`);
        if (!card) {
          card = this.createDeviceCard(deviceId, deviceData);
          container.appendChild(card);
        } else {
          this.updateDeviceCard(deviceId, deviceData);
        }
      });
    }
  }

  updateDeviceCard(deviceId, deviceData) {
    const card = document.getElementById(`device-card-${deviceId}`);
    if (!card) return;
    
    const { totalTracks = 0, filesOnDevice = 0, unsyncedTracks = 0, appInstalled = true } = deviceData;
    
    // Update stats (all three visible stats)
    const stats = card.querySelectorAll('.device-stat-value');
    if (stats[0]) stats[0].textContent = totalTracks;     // Total Tracks
    if (stats[1]) stats[1].textContent = filesOnDevice;   // On Device
    if (stats[2]) stats[2].textContent = unsyncedTracks;  // To Sync
    
    // Update status
    const status = card.querySelector('.device-card-status');
    if (status) {
      status.textContent = appInstalled ? 'RedShift Mobile installed' : 'RedShift Mobile not found';
    }
    
    // Update sync button
    const syncBtn = card.querySelector('.device-sync-btn');
    if (syncBtn) {
      syncBtn.disabled = !appInstalled;
    }
  }

  addOrUpdateDevice(deviceId, deviceData) {
    this.connectedDevices.set(deviceId, deviceData);
    this.updateDevicesContainer();
  }

  removeDevice(deviceId) {
    this.connectedDevices.delete(deviceId);
    const card = document.getElementById(`device-card-${deviceId}`);
    if (card) {
      card.remove();
    }
    this.updateDevicesContainer();
  }

  async startDeviceSync(deviceId) {
    this.logBoth('info', `Starting sync for device: ${deviceId}`);
    
    try {
      // Show progress UI
      this.showDeviceProgress(deviceId, 0, 'Starting sync...');
      
      await window.electronAPI.invoke('usb-sync-start', { deviceId });
    } catch (error) {
      this.logBoth('error', `Sync failed: ${error.message}`);
      this.hideDeviceProgress(deviceId);
    }
  }

  async rescanDevice(deviceId) {
    this.logBoth('info', `Rescanning device: ${deviceId}`);
    try {
      await window.electronAPI.invoke('usb-sync-rescan');
    } catch (error) {
      this.logBoth('error', `Failed to rescan device: ${error.message}`);
    }
  }

  showDeviceProgress(deviceId, percent = 0, text = '') {
    const card = document.getElementById(`device-card-${deviceId}`);
    if (!card) return;
    
    const progressDiv = card.querySelector('.device-card-progress');
    if (progressDiv) {
      progressDiv.style.display = 'block';
    }
    
    this.updateDeviceProgress(deviceId, percent, text);
  }

  updateDeviceProgress(deviceId, percent, text) {
    const card = document.getElementById(`device-card-${deviceId}`);
    if (!card) return;
    
    const progressFill = card.querySelector('.device-progress-fill');
    const progressText = card.querySelector('.device-progress-text');
    
    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }
    if (progressText) {
      progressText.textContent = text;
    }
  }

  hideDeviceProgress(deviceId) {
    const card = document.getElementById(`device-card-${deviceId}`);
    if (!card) return;
    
    const progressDiv = card.querySelector('.device-card-progress');
    if (progressDiv) {
        progressDiv.style.display = 'none';
    }
  }

  updateUSBSyncDeviceStatus(connected, deviceName = '') {
    // Legacy method - deprecated, device cards are now created via usb-device-scanned events
    // This method is no longer used but kept for compatibility
  }

  async checkUSBDeviceStatus() {
    try {
      const status = await window.electronAPI.invoke('usb-sync-get-status');
      console.log('📱 Initial USB device status:', status);
      
      if (status.isConnected && status.connectedDevices && status.connectedDevices.length > 0) {
        const device = status.connectedDevices[0];
        const deviceLabel = device.deviceName || device.deviceType || 'iOS Device';
        console.log('📱 Device connected at startup:', deviceLabel);
        this.updateUSBSyncDeviceStatus(true, deviceLabel);
        
        // Trigger a device scan since the device was already connected
        console.log('📱 Triggering device scan for already-connected device');
        await window.electronAPI.invoke('usb-sync-rescan');
      } else {
        this.updateUSBSyncDeviceStatus(false);
      }
    } catch (error) {
      this.logBoth('warning', `Failed to check USB device status: ${error.message}`);
    }
  }

  updateUSBSyncDashboard(syncedCount, totalCount, unsyncedCount) {
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

  hideUSBSyncDashboard() {
    const overview = document.getElementById('usbSyncOverview');
    const tracksList = document.getElementById('usbTracksList');
    
    if (overview) {
      overview.style.display = 'none';
    }
    if (tracksList) {
      tracksList.style.display = 'none';
    }
  }

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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
