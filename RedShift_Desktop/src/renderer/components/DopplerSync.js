// src/renderer/components/DopplerSync.js - Doppler Sync Management UI

class DopplerSync {
  constructor(ui) {
    this.ui = ui;
    this.syncStatus = null;
    this.isTransferring = false;
    this.pairedDevice = null;
    
    this.setupEventListeners();
    this.setupIPCListeners();
    this.setupWebSocketSyncListeners();
    
    // Auto-load sync status
    this.loadSyncStatus();
  }
  
  setupEventListeners() {
    // Get sync status button
    const getSyncStatusBtn = document.getElementById('getSyncStatusBtn');
    if (getSyncStatusBtn) {
      getSyncStatusBtn.addEventListener('click', () => {
        this.loadSyncStatus();
      });
    }
    
    // Start sync button (USB)
    const startSyncBtn = document.getElementById('startSyncBtn');
    if (startSyncBtn) {
      startSyncBtn.addEventListener('click', () => {
        this.startSync();
      });
    }
    
    // Start WebSocket sync button (Wi-Fi)
    const startWebSocketSyncBtn = document.getElementById('startWebSocketSyncBtn');
    if (startWebSocketSyncBtn) {
      startWebSocketSyncBtn.addEventListener('click', async () => {
        // Always show pairing modal for manual Wi-Fi sync
        await this.showPairingModal();
      });
    }
    
    // Refresh database button
    const refreshDbBtn = document.getElementById('refreshDbBtn');
    if (refreshDbBtn) {
      refreshDbBtn.addEventListener('click', () => {
        this.refreshDatabase();
      });
    }
    
    // View statistics button
    const viewStatsBtn = document.getElementById('viewStatsBtn');
    if (viewStatsBtn) {
      viewStatsBtn.addEventListener('click', () => {
        this.loadStatistics();
      });
    }

    // Pre-index device button (added alongside existing sync controls if present)
    const preindexBtn = document.getElementById('preindexDeviceBtn');
    if (preindexBtn) {
      preindexBtn.addEventListener('click', () => this.preindexDevice());
    }
  }
  
  setupIPCListeners() {
    // Listen for Doppler sync events
    window.electronAPI.on('doppler-sync-started', (data) => {
      this.onSyncStarted(data);
    });
    
    window.electronAPI.on('doppler-sync-completed', (data) => {
      this.onSyncCompleted(data);
    });
    
    window.electronAPI.on('doppler-sync-error', (data) => {
      this.onSyncError(data);
    });
    
    window.electronAPI.on('doppler-transfer-progress', (data) => {
      this.onTransferProgress(data);
    });
    
    window.electronAPI.on('doppler-file-transferred', (data) => {
      this.onFileTransferred(data);
    });
    
    window.electronAPI.on('doppler-transfer-error', (data) => {
      this.onTransferError(data);
    });
    
    window.electronAPI.on('doppler-orphan-cleaned', (data) => {
      this.onOrphanCleaned(data);
    });
  }

  async preindexDevice() {
    try {
      this.ui.logBoth('info', '📱 Pre-indexing device library (detect existing files)...');
      const result = await window.electronAPI.invoke('doppler-preindex-device');
      this.ui.logBoth('success', `📱 Pre-indexed: ${result.matched}/${result.localFiles} matched on device`);
      await this.loadSyncStatus();
    } catch (error) {
      this.ui.logBoth('error', `📱 Pre-index failed: ${error.message}`);
    }
  }
  
  async loadSyncStatus() {
    try {
      this.ui.logBoth('info', '📱 Loading Doppler sync status...');
      
      const status = await window.electronAPI.invoke('doppler-get-sync-status');
      this.syncStatus = status;
      
      this.updateSyncStatusUI(status);
      this.ui.logBoth('success', `📱 Sync status loaded: ${status.localFiles} local, ${status.transferredFiles} synced, ${status.newFiles} new`);
      
    } catch (error) {
      this.ui.logBoth('error', `📱 Failed to load sync status: ${error.message}`);
    }
  }
  
  updateSyncStatusUI(status) {
    // Update sync health indicator
    const healthIndicator = document.getElementById('syncHealthIndicator');
    if (healthIndicator) {
      healthIndicator.textContent = `${status.syncHealth}%`;
      healthIndicator.className = `sync-health ${this.getSyncHealthClass(status.syncHealth)}`;
    }
    
    // Update file counts
    this.updateElement('localFilesCount', status.localFiles);
    this.updateElement('transferredFilesCount', status.transferredFiles);
    this.updateElement('newFilesCount', status.newFiles);
    this.updateElement('orphanedFilesCount', status.orphanedFiles);
    
    // Update size info
    if (status.totalSizeNew > 0) {
      this.updateElement('newFilesSize', this.formatBytes(status.totalSizeNew));
    }
    
    // Update last sync date
    if (status.lastSyncDate) {
      this.updateElement('lastSyncDate', new Date(status.lastSyncDate).toLocaleString());
    } else {
      this.updateElement('lastSyncDate', 'Never');
    }
    
    // Enable/disable sync button
    const startSyncBtn = document.getElementById('startSyncBtn');
    if (startSyncBtn) {
      startSyncBtn.disabled = status.newFiles === 0 || this.isTransferring;
      startSyncBtn.textContent = status.newFiles > 0 ? 
        `Sync ${status.newFiles} New Files` : 
        'No Files to Sync';
    }
    
    // Show detailed file lists if available
    this.updateFilesList('newFilesList', status.newFilesToSync);
    this.updateFilesList('orphanedFilesList', status.orphanedFilesToRemove);
  }
  
  async startSync() {
    if (this.isTransferring) {
      this.ui.logBoth('warning', '📱 Sync already in progress');
      return;
    }
    
    if (!this.syncStatus || this.syncStatus.newFiles === 0) {
      this.ui.logBoth('warning', '📱 No new files to sync');
      return;
    }
    
    try {
      this.isTransferring = true;
      this.updateSyncButton(true);
      
      // Read selected transfer method from UI (default to USB if missing)
      let transferMethod = 'direct_libimobile';
      const methodSelect = document.getElementById('transferMethodSelect');
      if (methodSelect && methodSelect.value) {
        transferMethod = methodSelect.value;
      }
      const options = { transferMethod, cleanupOrphaned: true };
      
      this.ui.logBoth('info', `📱 Starting Doppler sync (${transferMethod}) for ${this.syncStatus.newFiles} files...`);
      
      await window.electronAPI.invoke('doppler-start-sync', options);
      
    } catch (error) {
      this.ui.logBoth('error', `📱 Failed to start sync: ${error.message}`);
      this.isTransferring = false;
      this.updateSyncButton(false);
    }
  }
  
  async refreshDatabase() {
    try {
      this.ui.logBoth('info', '📱 Refreshing transfer database...');
      
      const result = await window.electronAPI.invoke('doppler-refresh-database');
      this.ui.logBoth('success', `📱 Database refreshed. Cleaned ${result.cleanedFiles} orphaned records.`);
      
      // Reload sync status after refresh
      await this.loadSyncStatus();
      
    } catch (error) {
      this.ui.logBoth('error', `📱 Failed to refresh database: ${error.message}`);
    }
  }
  
  async loadStatistics() {
    try {
      this.ui.logBoth('info', '📱 Loading sync statistics...');
      
      const stats = await window.electronAPI.invoke('doppler-get-statistics');
      this.updateStatisticsUI(stats);
      this.ui.logBoth('success', '📱 Statistics loaded');
      
    } catch (error) {
      this.ui.logBoth('error', `📱 Failed to load statistics: ${error.message}`);
    }
  }
  
  updateStatisticsUI(stats) {
    // Update method statistics
    const methodStats = document.getElementById('methodStats');
    if (methodStats && stats.byMethod) {
      methodStats.innerHTML = stats.byMethod.map(method => `
        <div class="method-stat">
          <strong>${method.transfer_method}:</strong> 
          ${method.total_files_transferred} files, 
          ${this.formatBytes(method.total_bytes_transferred)}
        </div>
      `).join('');
    }
    
    // Update recent sessions
    const recentSessions = document.getElementById('recentSessions');
    if (recentSessions && stats.recentSessions) {
      recentSessions.innerHTML = stats.recentSessions.map(session => `
        <div class="session-item">
          <span class="session-date">${new Date(session.session_date * 1000).toLocaleDateString()}</span>
          <span class="session-files">${session.files_transferred}/${session.files_queued} files</span>
          <span class="session-method">${session.transfer_method}</span>
        </div>
      `).join('');
    }
    
    // Update total transferred count
    if (stats.totalTransferred) {
      this.updateElement('totalTransferredCount', stats.totalTransferred.count);
    }
  }
  
  // Event handlers
  onSyncStarted(data) {
    this.ui.logBoth('info', `📱 Sync session started: ${data.newFiles} new files, ${data.orphanedFiles} orphaned`);
    this.isTransferring = true;
    this.updateSyncButton(true);
    this.updateProgress(0, data.newFiles);
  }
  
  onSyncCompleted(data) {
    this.ui.logBoth('success', `📱 Sync completed: ${data.transferred} files transferred in ${Math.round(data.duration / 1000)}s`);
    this.isTransferring = false;
    this.updateSyncButton(false);
    this.updateProgress(100, 100);
    
    // Reload sync status to reflect changes
    setTimeout(() => this.loadSyncStatus(), 1000);
  }
  
  onSyncError(data) {
    this.ui.logBoth('error', `📱 Sync failed: ${data.error}`);
    this.isTransferring = false;
    this.updateSyncButton(false);
  }
  
  onTransferProgress(data) {
    this.ui.logBoth('info', `📱 Progress: ${data.current}/${data.total} - ${data.file}`);
    this.updateProgress(data.current, data.total);
  }
  
  onFileTransferred(data) {
    this.ui.logBoth('success', `📱 Transferred: ${data.file} (${this.formatBytes(data.size)})`);
  }
  
  onTransferError(data) {
    this.ui.logBoth('error', `📱 Transfer failed: ${data.file} - ${data.error}`);
  }
  
  onOrphanCleaned(data) {
    this.ui.logBoth('info', `📱 Cleaned orphaned file: ${data.file}`);
  }
  
  // UI helpers
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }
  
  updateSyncButton(isTransferring) {
    const button = document.getElementById('startSyncBtn');
    if (button) {
      button.disabled = isTransferring;
      button.textContent = isTransferring ? 'Syncing...' : 'Start Sync';
    }
  }
  
  updateProgress(current, total) {
    const progressBar = document.getElementById('syncProgressBar');
    const progressText = document.getElementById('syncProgressText');
    
    if (progressBar) {
      const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
      progressBar.style.width = `${percentage}%`;
    }
    
    if (progressText) {
      progressText.textContent = `${current}/${total}`;
    }
  }
  
  getSyncHealthClass(health) {
    if (health >= 90) return 'excellent';
    if (health >= 70) return 'good';
    if (health >= 50) return 'fair';
    return 'poor';
  }
  
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  updateFilesList(listId, files) {
    const list = document.getElementById(listId);
    if (!list || !files) return;
    
    if (files.length === 0) {
      list.innerHTML = '<p class="empty-list">No files</p>';
      return;
    }
    
    list.innerHTML = files.slice(0, 10).map(file => `
      <div class="file-item">
        <span class="file-name">${file.name || file.file_path}</span>
        <span class="file-size">${this.formatBytes(file.size || 0)}</span>
      </div>
    `).join('');
    
    if (files.length > 10) {
      list.innerHTML += `<p class="more-files">...and ${files.length - 10} more files</p>`;
    }
  }

  // ============================================================================
  // DOPPLER WEBSOCKET PAIRING & SYNC
  // ============================================================================

  /**
   * Show pairing modal and initiate pairing
   */
  async showPairingModal() {
    // Create modal HTML
    const modalHTML = `
      <div id="dopplerPairingModal" class="modal-overlay">
        <div class="modal-content doppler-pairing-modal">
          <div class="modal-header">
            <h2>Pair with Doppler</h2>
            <button id="closePairingModalBtn" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div id="pairingStep1" class="pairing-step">
              <p>1. Open Doppler app on your iPhone</p>
              <p>2. Tap <strong>Import → Import from Wi-Fi</strong></p>
              <p>3. Scan this QR code:</p>
              
              <div class="qr-code-container">
                <img id="pairingQRCode" src="" alt="QR Code" />
              </div>
              
              <div class="pairing-code-display">
                <p>Or enter code manually:</p>
                <div class="code-digits" id="pairingCodeDigits">------</div>
              </div>
              
              <div class="pairing-status">
                <div class="spinner"></div>
                <p id="pairingStatusText">Waiting for device...</p>
              </div>
            </div>
            
            <div id="pairingStep2" class="pairing-step" style="display: none;">
              <div class="success-icon">✅</div>
              <h3>Device Paired Successfully!</h3>
              <p>Connected to <strong id="pairedDeviceName">iPhone</strong></p>
              <p>You can now sync your music library.</p>
            </div>
          </div>
          <div class="modal-footer">
            <button id="cancelPairingBtn" class="btn btn-secondary">Cancel</button>
            <button id="startSyncAfterPairingBtn" class="btn btn-primary" style="display: none;">Start Sync</button>
          </div>
        </div>
      </div>
    `;
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Setup event listeners for modal buttons
    document.getElementById('closePairingModalBtn').addEventListener('click', () => this.cancelPairing());
    document.getElementById('cancelPairingBtn').addEventListener('click', () => this.cancelPairing());
    document.getElementById('startSyncAfterPairingBtn').addEventListener('click', () => this.startWebSocketSync());
    
    try {
      // Start pairing process
      this.ui.logBoth('info', '📱 Starting Doppler pairing...');
      
      const { code, qrDataUrl } = await window.electronAPI.invoke('doppler-pair-start');
      
      // Display QR code and pairing code
      document.getElementById('pairingQRCode').src = qrDataUrl;
      document.getElementById('pairingCodeDigits').textContent = code;
      
      this.ui.logBoth('info', `📱 Pairing code: ${code}`);
      
      // Wait for device to pair
      const device = await window.electronAPI.invoke('doppler-pair-wait');
      
      this.ui.logBoth('success', `✅ Device paired: ${device.name}`);
      
      // Confirm pairing and save device
      const result = await window.electronAPI.invoke('doppler-pair-confirm', true);
      
      // Update UI to show success
      document.getElementById('pairingStep1').style.display = 'none';
      document.getElementById('pairingStep2').style.display = 'block';
      document.getElementById('pairedDeviceName').textContent = device.name;
      document.getElementById('cancelPairingBtn').style.display = 'none';
      document.getElementById('startSyncAfterPairingBtn').style.display = 'inline-block';
      
      // Save pairing result with LAN URL for immediate sync
      this.pairedDevice = {
        ...device,
        lanUrl: result.lanUrl,
        pushToken: result.pushToken
      };
      
    } catch (error) {
      console.error('Pairing failed:', error);
      this.ui.logBoth('error', `❌ Pairing failed: ${error.message}`);
      this.closePairingModal();
    }
  }

  /**
   * Close pairing modal
   */
  closePairingModal() {
    const modal = document.getElementById('dopplerPairingModal');
    if (modal) {
      modal.remove();
    }
  }

  /**
   * Cancel active pairing
   */
  async cancelPairing() {
    try {
      await window.electronAPI.invoke('doppler-pair-cancel');
      this.ui.logBoth('info', '📱 Pairing cancelled');
      this.closePairingModal();
    } catch (error) {
      console.error('Failed to cancel pairing:', error);
      this.closePairingModal();
    }
  }

  /**
   * Start WebSocket sync (after pairing or with saved device)
   */
  async startWebSocketSync() {
    this.closePairingModal();
    
    if (this.isTransferring) {
      this.ui.logBoth('warning', '📱 Sync already in progress');
      return;
    }
    
    try {
      this.isTransferring = true;
      this.ui.logBoth('info', '📱 Starting Doppler WebSocket sync...');
      
      // Show progress modal
      this.showSyncProgressModal();
      
      // Start sync (pass LAN URL if we just paired)
      const syncOptions = {};
      if (this.pairedDevice && this.pairedDevice.lanUrl) {
        syncOptions.lanUrl = this.pairedDevice.lanUrl;
        syncOptions.deviceId = this.pairedDevice.id;
      }
      
      const result = await window.electronAPI.invoke('doppler-sync-websocket', syncOptions);
      
      this.ui.logBoth('success', `✅ Sync complete: ${result.uploaded} uploaded, ${result.failed} failed`);
      this.isTransferring = false;
      
      // Reload sync status
      await this.loadSyncStatus();
      
      // Close progress modal
      this.closeSyncProgressModal();
      
    } catch (error) {
      this.isTransferring = false;
      this.closeSyncProgressModal();
      
      if (error.message && error.message.includes('PAIRING_REQUIRED')) {
        // No saved device, need to pair first
        this.ui.logBoth('info', '📱 No paired device found - starting pairing...');
        await this.showPairingModal();
      } else {
        this.ui.logBoth('error', `❌ Sync failed: ${error.message}`);
      }
    }
  }

  /**
   * Show sync progress modal
   */
  showSyncProgressModal() {
    const modalHTML = `
      <div id="dopplerSyncProgressModal" class="modal-overlay">
        <div class="modal-content doppler-sync-modal">
          <div class="modal-header">
            <h2>Syncing to Doppler</h2>
          </div>
          <div class="modal-body">
            <div class="sync-progress-container">
              <div class="progress-bar">
                <div class="progress-fill" id="syncProgressBar" style="width: 0%"></div>
              </div>
              <div class="progress-text">
                <p id="syncProgressText">Preparing...</p>
                <p id="syncProgressCount">0 / 0 files</p>
              </div>
              <div class="current-file">
                <p id="syncCurrentFile"></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * Update sync progress
   */
  updateSyncProgress(current, total, file) {
    const progressBar = document.getElementById('syncProgressBar');
    const progressText = document.getElementById('syncProgressText');
    const progressCount = document.getElementById('syncProgressCount');
    const currentFile = document.getElementById('syncCurrentFile');
    
    if (progressBar) {
      const percentage = (current / total) * 100;
      progressBar.style.width = `${percentage}%`;
    }
    
    if (progressText) {
      progressText.textContent = `Uploading...`;
    }
    
    if (progressCount) {
      progressCount.textContent = `${current} / ${total} files`;
    }
    
    if (currentFile && file) {
      currentFile.textContent = file;
    }
  }

  /**
   * Close sync progress modal
   */
  closeSyncProgressModal() {
    const modal = document.getElementById('dopplerSyncProgressModal');
    if (modal) {
      modal.remove();
    }
  }

  /**
   * Setup WebSocket sync event listeners
   */
  setupWebSocketSyncListeners() {
    // Sync started
    window.electronAPI.on('doppler-ws-sync-started', (data) => {
      this.ui.logBoth('info', '📱 WebSocket sync started');
    });
    
    // Sync status updates
    window.electronAPI.on('doppler-ws-sync-status', (data) => {
      if (data.message) {
        this.ui.logBoth('info', `📱 ${data.message}`);
      }
    });
    
    // File progress
    window.electronAPI.on('doppler-ws-file-progress', (data) => {
      this.updateSyncProgress(data.current, data.total, data.file);
    });
    
    // File completed
    window.electronAPI.on('doppler-ws-file-completed', (data) => {
      this.ui.logBoth('info', `✅ Uploaded: ${data.file}`);
    });
    
    // File failed
    window.electronAPI.on('doppler-ws-file-failed', (data) => {
      this.ui.logBoth('error', `❌ Failed: ${data.file} - ${data.error}`);
    });
    
    // Sync completed
    window.electronAPI.on('doppler-ws-sync-completed', (data) => {
      this.ui.logBoth('success', `✅ Sync complete: ${data.transferred} uploaded, ${data.failed} failed`);
      this.isTransferring = false;
    });
    
    // Sync error
    window.electronAPI.on('doppler-ws-sync-error', (data) => {
      this.ui.logBoth('error', `❌ Sync error: ${data.error}`);
      this.isTransferring = false;
    });
  }
}

// Export for use in renderer.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DopplerSync;
}
