// src/renderer/components/SyncManager.js - Sync Management Component

class SyncManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.currentFiles = [];
    this.isScanning = false;
    this.isTransferring = false;
    this.selectedTransferMethod = 'direct_libimobile';
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Scan Library button
    document.getElementById('scanBtn').addEventListener('click', () => {
      this.scanLibrary();
    });
    
    // Start Sync button
    document.getElementById('syncBtn').addEventListener('click', () => {
      if (this.currentFiles.length > 0) {
        this.showTransferModal();
      }
    });
    
    // Transfer method selection
    document.getElementById('transferMethodSelect').addEventListener('change', (e) => {
      this.selectedTransferMethod = e.target.value;
    });
    
    // Transfer modal handlers
    this.setupTransferModalListeners();
  }
  
  setupTransferModalListeners() {
    const modal = document.getElementById('transferModal');
    const startBtn = document.getElementById('startTransferBtn');
    const cancelBtn = document.getElementById('cancelTransferBtn');
    const optionCards = document.querySelectorAll('.option-card');
    
    // Option selection
    optionCards.forEach(card => {
      card.addEventListener('click', () => {
        optionCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedTransferMethod = card.dataset.method;
      });
    });
    
    // Start transfer
    startBtn.addEventListener('click', () => {
      this.startTransfer();
    });
    
    // Cancel transfer
    cancelBtn.addEventListener('click', () => {
      this.hideTransferModal();
    });
    
    // Close modal on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideTransferModal();
      }
    });
  }
  
  updateScanState(scanning) {
    this.isScanning = scanning;
    const scanBtn = document.getElementById('scanBtn');
    const scanIcon = scanBtn.querySelector('svg');
    
    if (scanning) {
      scanBtn.disabled = true;
      scanIcon.classList.add('spinning');
      scanBtn.querySelector('span') ? scanBtn.querySelector('span').textContent = 'Scanning...' : null;
    } else {
      scanBtn.disabled = false;
      scanIcon.classList.remove('spinning');
      scanBtn.querySelector('span') ? scanBtn.querySelector('span').textContent = 'Scan Library' : null;
    }
  }
  
  updateTransferState(transferring) {
    this.isTransferring = transferring;
    this.updateSyncButtonState();
  }
  
  updateSyncButtonState() {
    const syncBtn = document.getElementById('syncBtn');
    
    // Sync button is disabled during scanning/transferring or if no files to sync
    syncBtn.disabled = this.isScanning || 
                      this.isTransferring || 
                      this.currentFiles.length === 0;
  }
  
  async scanLibrary() {
    if (this.isScanning) return;
    
    try {
      this.ui.addLog('info', 'Starting library scan...');
      await window.electronAPI.invoke('scan-library');
    } catch (error) {
      this.ui.addLog('error', `Scan failed: ${error.message}`);
    }
  }
  
  updateSyncData(data) {
    this.currentFiles = [...data.newFiles, ...data.modifiedFiles];
    
    this.updateStats(data);
    this.updateFilesList();
    this.updateSyncButtonState();
    
    if (this.currentFiles.length > 0) {
      this.ui.addLog('success', `Found ${this.currentFiles.length} files to sync`);
    } else {
      this.ui.addLog('info', 'Library is up to date');
    }
  }
  
  updateStats(data = null) {
    if (!data) {
      // Clear stats
      document.getElementById('newFilesCount').textContent = '0';
      document.getElementById('modifiedFilesCount').textContent = '0';
      document.getElementById('totalSize').textContent = '0 MB';
      return;
    }
    
    document.getElementById('newFilesCount').textContent = data.newFiles?.length || 0;
    document.getElementById('modifiedFilesCount').textContent = data.modifiedFiles?.length || 0;
    
    const totalSizeMB = (data.totalSize / (1024 * 1024)).toFixed(1);
    document.getElementById('totalSize').textContent = `${totalSizeMB} MB`;
  }
  
  updateFilesList() {
    const filesList = document.getElementById('filesList');
    
    if (this.currentFiles.length === 0) {
      filesList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <h3>No files to sync</h3>
          <p>All files are up to date</p>
        </div>
      `;
      return;
    }
    
    const filesHTML = this.currentFiles.map(file => {
      const isNew = !file.hash; // New files don't have hash calculated yet
      const sizeKB = (file.size / 1024).toFixed(1);
      
      return `
        <div class="file-item">
          <div class="file-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5a67d8" stroke-width="2">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-details">${sizeKB} KB • ${file.relativePath}</div>
          </div>
          <div class="file-status ${isNew ? 'status-new' : 'status-modified'}">
            ${isNew ? 'New' : 'Modified'}
          </div>
        </div>
      `;
    }).join('');
    
    filesList.innerHTML = filesHTML;
  }
  
  showTransferModal() {
    const modal = document.getElementById('transferModal');
    const fileCount = document.getElementById('transferFileCount');
    
    fileCount.textContent = this.currentFiles.length;
    modal.style.display = 'flex';
    
    // Reset modal state
    document.getElementById('transferProgress').style.display = 'none';
    document.getElementById('startTransferBtn').disabled = false;
  }
  
  hideTransferModal() {
    document.getElementById('transferModal').style.display = 'none';
  }
  
  showTransferProgress(total, method) {
    const progressDiv = document.getElementById('transferProgress');
    const startBtn = document.getElementById('startTransferBtn');
    const cancelBtn = document.getElementById('cancelTransferBtn');
    
    progressDiv.style.display = 'block';
    startBtn.disabled = true;
    cancelBtn.disabled = true;
    
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').textContent = 'Preparing transfer...';
  }
  
  updateTransferProgress(current, total, currentFile) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    const percentage = (current / total) * 100;
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${current}/${total} - ${currentFile || 'Processing...'}`;
  }
  
  async startTransfer() {
    try {
      this.ui.addLog('info', `Starting transfer via ${this.selectedTransferMethod}...`);
      
      await window.electronAPI.invoke('transfer-files', this.currentFiles, this.selectedTransferMethod);
      
    } catch (error) {
      this.ui.addLog('error', `Transfer failed: ${error.message}`);
      this.hideTransferModal();
    }
  }
  
  async loadTransferHistory() {
    try {
      const history = await window.electronAPI.invoke('get-transfer-history');
      const historyList = document.getElementById('historyList');
      
      if (history.length === 0) {
        historyList.innerHTML = `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12,6 12,12 16,14"></polyline>
            </svg>
            <h3>No transfer history</h3>
            <p>Your transfer history will appear here</p>
          </div>
        `;
        return;
      }
      
      const historyHTML = history.map(session => {
        const date = new Date(session.session_date * 1000).toLocaleString();
        const sizeMB = (session.total_size / (1024 * 1024)).toFixed(1);
        const duration = session.duration_seconds ? `${session.duration_seconds}s` : 'Unknown';
        
        return `
          <div class="file-item">
            <div class="file-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22,4 12,14.01 9,11.01"></polyline>
              </svg>
            </div>
            <div class="file-info">
              <div class="file-name">${session.files_transferred}/${session.files_queued} files transferred</div>
              <div class="file-details">${date} • ${sizeMB} MB • ${duration} • ${session.transfer_method}</div>
            </div>
          </div>
        `;
      }).join('');
      
      historyList.innerHTML = historyHTML;
      
    } catch (error) {
      this.ui.addLog('error', `Failed to load transfer history: ${error.message}`);
    }
  }
}
