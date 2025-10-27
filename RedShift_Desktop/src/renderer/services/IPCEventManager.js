// IPCEventManager.js - Centralize all IPC event listener setup

class IPCEventManager {
  constructor(ui) {
    this.ui = ui;
  }
  
  /**
   * Setup all IPC event listeners
   */
  setupListeners() {
    this.setupPhoneConnectionEvents();
    this.setupFileSystemEvents();
    this.setupScanEvents();
    this.setupTransferEvents();
    this.setupUSBSyncEvents();
    this.setupDeviceScanEvents();
    this.setupLogEvents();
    this.setupAudioPlayerEvents();
  }
  
  setupPhoneConnectionEvents() {
    window.electronAPI.on('phone-connected', (data) => {
      console.log('📱 phone-connected event received:', data);
      const deviceLabel = data.deviceName || data.deviceType || 'iOS Device';
      this.ui.updateUSBSyncDeviceStatus(true, deviceLabel);
    });
    
    window.electronAPI.on('phone-disconnected', (data) => {
      console.log('📱 phone-disconnected event received:', data);
      this.ui.updateUSBSyncDeviceStatus(false);
    });
  }
  
  setupFileSystemEvents() {
    window.electronAPI.on('file-added', (data) => {
      this.ui.logger.addLog('info', `New file detected: ${data.path.split('/').pop()}`);
    });
    
    window.electronAPI.on('file-changed', (data) => {
      this.ui.logger.addLog('info', `File modified: ${data.path.split('/').pop()}`);
    });
  }
  
  setupScanEvents() {
    window.electronAPI.on('scan-started', () => {
      this.ui.syncManager.updateScanState(true);
    });
    
    window.electronAPI.on('scan-completed', (data) => {
      this.ui.syncManager.updateScanState(false);
      this.ui.syncManager.updateSyncData(data);
    });
    
    window.electronAPI.on('scan-error', (data) => {
      this.ui.syncManager.updateScanState(false);
      this.ui.logger.addLog('error', `Scan failed: ${data.error}`);
    });
  }
  
  setupTransferEvents() {
    window.electronAPI.on('transfer-started', (data) => {
      this.ui.syncManager.updateTransferState(true);
      this.ui.syncManager.showTransferProgress(data.total, data.method);
    });
    
    window.electronAPI.on('transfer-progress', (data) => {
      this.ui.syncManager.updateTransferProgress(data.current, data.total, data.currentFile);
    });
    
    window.electronAPI.on('transfer-completed', (data) => {
      this.ui.syncManager.updateTransferState(false);
      this.ui.syncManager.hideTransferModal();
      this.ui.logger.addLog('success', `Transfer completed: ${data.transferred} files via ${data.method}`);
      // Clear current files and rescan
      this.ui.syncManager.currentFiles = [];
      this.ui.syncManager.updateFilesList();
      this.ui.syncManager.updateStats();
    });
    
    window.electronAPI.on('transfer-error', (data) => {
      this.ui.syncManager.updateTransferState(false);
      this.ui.syncManager.hideTransferModal();
      this.ui.logger.addLog('error', `Transfer failed: ${data.error}`);
    });
  }
  
  setupUSBSyncEvents() {
    window.electronAPI.on('usb-device-scanned', (data) => {
      this.ui.logger.logBoth('info', `📡 Device scanned: ${data.deviceName || 'iOS Device'}`);
      this.ui.logger.logBoth('info', `   Device ID: ${data.deviceId}`);
      this.ui.logger.logBoth('info', `   App Installed: ${data.appInstalled}`);
      this.ui.logger.logBoth('info', `   Files: ${data.filesOnDevice}/${data.totalTracks}`);
      
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
      
      this.ui.deviceManager.addOrUpdateDevice(deviceId, deviceData);
    });
    
    window.electronAPI.on('usb-sync-started', () => {
      this.ui.logger.logBoth('info', '🔄 USB sync started...');
      this.ui.deviceManager.showDeviceProgress('primary', 0, 'Preparing to sync...');
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
      
      this.ui.deviceManager.updateDeviceProgress(deviceId, percent, statusText);
    });
    
    window.electronAPI.on('usb-sync-completed', (data) => {
      const deviceId = data.deviceId || 'primary';
      const transferred = data.transferred || 0;
      const skipped = data.skipped || 0;
      const failed = data.failed || 0;
      const total = data.total || 0;
      
      this.ui.logger.logBoth('success', `✅ USB sync completed: ${transferred} transferred, ${skipped} skipped, ${failed} failed (${total} total)`);
      
      this.ui.deviceManager.updateDeviceProgress(deviceId, 100, `✅ Complete: ${transferred} files synced to device`);
      
      setTimeout(() => {
        this.ui.deviceManager.hideDeviceProgress(deviceId);
        // Rescan the device to update stats
        window.electronAPI.invoke('usb-sync-rescan');
      }, 3000);
    });
    
    window.electronAPI.on('usb-sync-failed', (error) => {
      const deviceId = error.deviceId || 'primary';
      this.ui.logger.logBoth('error', `❌ USB sync failed: ${error.message || error}`);
      this.ui.deviceManager.updateDeviceProgress(deviceId, 0, `❌ Sync failed: ${error.message || error}`);
      setTimeout(() => {
        this.ui.deviceManager.hideDeviceProgress(deviceId);
      }, 3000);
    });
  }
  
  setupDeviceScanEvents() {
    window.electronAPI.on('device-scan-progress', (data) => {
      if (data.deviceId === this.ui.deviceManager.currentScanningDevice) {
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
  }
  
  setupLogEvents() {
    window.electronAPI.on('log', (data) => {
      this.ui.logger.addLog(data.type, data.message);
    });
  }
  
  setupAudioPlayerEvents() {
    window.electronAPI.on('audio-state-changed', (data) => {
      console.log('🎵 Audio state changed:', data);
      this.ui.audioPlayer.updateAudioPlayerState(data);
    });
    
    window.electronAPI.on('audio-track-loaded', (data) => {
      console.log('🎵 Track loaded:', data);
      this.ui.audioPlayer.updateTrackInfo(data.track);
    });
    
    window.electronAPI.on('audio-play', (data) => {
      console.log('🎵 Audio play event:', data);
      this.ui.audioPlayer.updatePlaybackState(true);
    });
    
    window.electronAPI.on('audio-pause', (data) => {
      console.log('🎵 Audio pause event:', data);
      this.ui.audioPlayer.updatePlaybackState(false);
    });
    
    window.electronAPI.on('audio-stop', (data) => {
      console.log('🎵 Audio stop event:', data);
      this.ui.audioPlayer.updatePlaybackState(false);
      this.ui.audioPlayer.updateProgress(0, this.ui.audioPlayer.audioPlayerState.duration);
    });
    
    // Disable external progress writes to avoid fighting with local HTML5 audio clock
    window.electronAPI.on('audio-position-changed', (data) => {
      // Intentionally no-op to prevent jitter after seeks
    });
    
    window.electronAPI.on('audio-volume-changed', (data) => {
      console.log('🎵 Volume changed:', data);
      this.ui.audioPlayer.updateVolumeUI(data.volume, data.isMuted);
    });
    
    window.electronAPI.on('audio-queue-changed', (data) => {
      console.log('🎵 Queue changed:', data);
      this.ui.audioPlayer.updateQueueUI(data.queue, data.currentIndex);
    });
    
    window.electronAPI.on('audio-track-ended', (data) => {
      console.log('🎵 Track ended:', data);
    });
    
    window.electronAPI.on('audio-error', (data) => {
      console.error('🎵 Audio error:', data);
      this.ui.logger.addLog('error', `Audio error: ${data.error}`);
    });

    // Reflect shuffle/repeat changes immediately from main
    window.electronAPI.on('audio-shuffle-changed', (data) => {
      if (data && typeof data.shuffleMode === 'boolean') {
        this.ui.audioPlayer.updateShuffleButton(data.shuffleMode);
      }
    });
    
    window.electronAPI.on('audio-repeat-changed', (data) => {
      if (data && data.repeatMode) {
        this.ui.audioPlayer.updateRepeatButton(data.repeatMode);
      }
    });
  }
}

