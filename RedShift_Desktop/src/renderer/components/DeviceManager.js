// DeviceManager.js - Handle all device-related UI and operations

class DeviceManager {
  constructor(ui) {
    this.ui = ui;
    this.logger = ui.logger;
    this.connectedDevices = new Map(); // Store device data by device ID
    this.currentScanningDevice = null;
  }
  
  /**
   * Create a device card UI element
   * @param {string} deviceId - Device identifier
   * @param {Object} deviceData - Device information
   * @returns {HTMLElement} Device card element
   */
  createDeviceCard(deviceId, deviceData) {
    this.logger.logBoth('info', `🎨 Creating device card for: ${deviceId}`);
    this.logger.logBoth('info', `   deviceData received: ${JSON.stringify(deviceData)}`);
    
    const card = document.createElement('div');
    card.className = 'device-card';
    card.id = `device-card-${deviceId}`;
    card.dataset.deviceId = deviceId;
    
    const { deviceName = 'iOS Device', totalTracks = 0, filesOnDevice = 0, unsyncedTracks = 0, appInstalled = true } = deviceData;
    
    this.logger.logBoth('info', `   Using deviceName: ${deviceName}`);
    
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
  
  /**
   * Scan device's general music library
   * @param {string} deviceId - Device identifier
   */
  async scanDeviceMusic(deviceId) {
    this.logger.logBoth('info', `🎵 Scanning device music library for: ${deviceId}`);
    
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
        this.logger.logBoth('success', `✅ Found ${result.totalOnDevice} music files on device, ${result.notInLibrary} not in library`);
        
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
        this.logger.logBoth('error', `❌ Failed to scan device music: ${result.error}`);
      }
    } catch (error) {
      this.logger.logBoth('error', `❌ Error scanning device music: ${error.message}`);
    } finally {
      // Restore button
      scanMusicBtn.disabled = false;
      scanMusicBtn.innerHTML = originalText;
    }
  }
  
  /**
   * Import music from device to local library
   * @param {string} deviceId - Device identifier
   */
  async importFromDevice(deviceId) {
    this.logger.logBoth('info', `📥 Starting import from device: ${deviceId}`);
    
    try {
      const result = await window.electronAPI.invoke('import-from-device', { deviceId });
      
      if (result.success) {
        this.logger.logBoth('success', `✅ Import complete: ${result.copied} files copied, ${result.skipped} skipped, ${result.errors} errors`);
        
        // Rescan library to pick up new files
        this.logger.logBoth('info', '🔄 Rescanning library...');
        await this.ui.musicLibrary.scanMusicLibrary();
      } else {
        this.logger.logBoth('error', `❌ Import failed: ${result.error}`);
      }
    } catch (error) {
      this.logger.logBoth('error', `❌ Error importing from device: ${error.message}`);
    }
  }

  /**
   * Update devices container UI
   */
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

  /**
   * Update device card stats
   * @param {string} deviceId - Device identifier
   * @param {Object} deviceData - Device information
   */
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

  /**
   * Add or update a device
   * @param {string} deviceId - Device identifier
   * @param {Object} deviceData - Device information
   */
  addOrUpdateDevice(deviceId, deviceData) {
    this.connectedDevices.set(deviceId, deviceData);
    this.updateDevicesContainer();
  }

  /**
   * Remove a device
   * @param {string} deviceId - Device identifier
   */
  removeDevice(deviceId) {
    this.connectedDevices.delete(deviceId);
    const card = document.getElementById(`device-card-${deviceId}`);
    if (card) {
      card.remove();
    }
    this.updateDevicesContainer();
  }

  /**
   * Start syncing to a device
   * @param {string} deviceId - Device identifier
   */
  async startDeviceSync(deviceId) {
    this.logger.logBoth('info', `Starting sync for device: ${deviceId}`);
    
    try {
      // Show progress UI
      this.showDeviceProgress(deviceId, 0, 'Starting sync...');
      
      await window.electronAPI.invoke('usb-sync-start', { deviceId });
    } catch (error) {
      this.logger.logBoth('error', `Sync failed: ${error.message}`);
      this.hideDeviceProgress(deviceId);
    }
  }

  /**
   * Rescan a device
   * @param {string} deviceId - Device identifier
   */
  async rescanDevice(deviceId) {
    this.logger.logBoth('info', `Rescanning device: ${deviceId}`);
    try {
      await window.electronAPI.invoke('usb-sync-rescan');
    } catch (error) {
      this.logger.logBoth('error', `Failed to rescan device: ${error.message}`);
    }
  }

  /**
   * Show device progress UI
   * @param {string} deviceId - Device identifier
   * @param {number} percent - Progress percentage
   * @param {string} text - Progress text
   */
  showDeviceProgress(deviceId, percent = 0, text = '') {
    const card = document.getElementById(`device-card-${deviceId}`);
    if (!card) return;
    
    const progressDiv = card.querySelector('.device-card-progress');
    if (progressDiv) {
      progressDiv.style.display = 'block';
    }
    
    this.updateDeviceProgress(deviceId, percent, text);
  }

  /**
   * Update device progress
   * @param {string} deviceId - Device identifier
   * @param {number} percent - Progress percentage
   * @param {string} text - Progress text
   */
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

  /**
   * Hide device progress UI
   * @param {string} deviceId - Device identifier
   */
  hideDeviceProgress(deviceId) {
    const card = document.getElementById(`device-card-${deviceId}`);
    if (!card) return;
    
    const progressDiv = card.querySelector('.device-card-progress');
    if (progressDiv) {
        progressDiv.style.display = 'none';
    }
  }
}

