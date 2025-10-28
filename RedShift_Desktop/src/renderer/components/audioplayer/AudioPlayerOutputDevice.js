// src/renderer/components/AudioPlayerOutputDevice.js - Audio Output Device Selection

class AudioPlayerOutputDevice {
  constructor(audioPlayer) {
    this.player = audioPlayer;
    this.availableOutputDevices = [];
    this.currentOutputDeviceId = 'default';
  }
  
  async initialize() {
    try {
      // Check if setSinkId is supported
      if (!this.player.audioElement.setSinkId) {
        this.player.ui.logBoth('warning', '🔊 Audio output device selection not supported in this browser');
        return;
      }
      
      // Load saved device preference
      const savedDeviceId = localStorage.getItem('audio-output-device');
      if (savedDeviceId) {
        this.currentOutputDeviceId = savedDeviceId;
      }
      
      // Enumerate devices
      await this.refreshOutputDevices();
      
      // Apply saved device
      if (this.currentOutputDeviceId && this.currentOutputDeviceId !== 'default') {
        await this.setOutputDevice(this.currentOutputDeviceId);
      }
      
      // Listen for device changes
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.refreshOutputDevices();
      });
      
      this.player.ui.logBoth('success', '🔊 Audio output device management initialized');
    } catch (error) {
      this.player.ui.logBoth('error', `Failed to initialize output devices: ${error.message}`);
    }
  }
  
  async refreshOutputDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableOutputDevices = devices.filter(device => device.kind === 'audiooutput');
      
      this.player.ui.logBoth('info', `🔊 Found ${this.availableOutputDevices.length} audio output devices`);
      
      // Update UI if output device selector is open
      this.updateUI();
      
      return this.availableOutputDevices;
    } catch (error) {
      this.player.ui.logBoth('error', `Failed to enumerate output devices: ${error.message}`);
      return [];
    }
  }
  
  async setOutputDevice(deviceId) {
    try {
      if (!this.player.audioElement.setSinkId) {
        throw new Error('setSinkId not supported');
      }
      
      await this.player.audioElement.setSinkId(deviceId);
      this.currentOutputDeviceId = deviceId;
      
      // Save preference
      localStorage.setItem('audio-output-device', deviceId);
      
      const device = this.availableOutputDevices.find(d => d.deviceId === deviceId);
      const deviceName = device ? device.label : (deviceId === 'default' ? 'Default' : 'Unknown');
      
      this.player.ui.logBoth('success', `🔊 Audio output set to: ${deviceName}`);
      
      // Update UI
      this.updateUI();
      
      return true;
    } catch (error) {
      this.player.ui.logBoth('error', `Failed to set output device: ${error.message}`);
      return false;
    }
  }
  
  updateUI() {
    const deviceList = document.getElementById('outputDeviceList');
    if (!deviceList) return;
    
    deviceList.innerHTML = '';
    
    // Add default device
    const defaultItem = document.createElement('div');
    defaultItem.className = 'device-item';
    if (this.currentOutputDeviceId === 'default') {
      defaultItem.classList.add('active');
    }
    defaultItem.innerHTML = `
      <div class="device-item-info">
        <div class="device-item-name">System Default</div>
      </div>
      ${this.currentOutputDeviceId === 'default' ? '<span class="device-check">✓</span>' : ''}
    `;
    defaultItem.addEventListener('click', () => {
      this.setOutputDevice('default');
      this.hideDropdown();
    });
    deviceList.appendChild(defaultItem);
    
    // Add available devices
    this.availableOutputDevices.forEach(device => {
      const item = document.createElement('div');
      item.className = 'device-item';
      if (this.currentOutputDeviceId === device.deviceId) {
        item.classList.add('active');
      }
      item.innerHTML = `
        <div class="device-item-info">
          <div class="device-item-name">${device.label || 'Unknown Device'}</div>
        </div>
        ${this.currentOutputDeviceId === device.deviceId ? '<span class="device-check">✓</span>' : ''}
      `;
      item.addEventListener('click', () => {
        this.setOutputDevice(device.deviceId);
        this.hideDropdown();
      });
      deviceList.appendChild(item);
    });
  }
  
  setupEventListeners() {
    // Toggle dropdown button
    const btn = document.getElementById('outputDeviceBtn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshOutputDevices');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.refreshOutputDevices();
      });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const selector = document.getElementById('outputDeviceSelector');
      const dropdown = document.getElementById('outputDeviceDropdown');
      if (selector && !selector.contains(e.target) && dropdown && dropdown.classList.contains('show')) {
        this.hideDropdown();
      }
    });
  }
  
  toggleDropdown() {
    const dropdown = document.getElementById('outputDeviceDropdown');
    const btn = document.getElementById('outputDeviceBtn');
    if (!dropdown || !btn) return;
    
    const isShowing = dropdown.classList.contains('show');
    if (isShowing) {
      this.hideDropdown();
    } else {
      this.showDropdown();
    }
  }
  
  showDropdown() {
    const dropdown = document.getElementById('outputDeviceDropdown');
    const btn = document.getElementById('outputDeviceBtn');
    if (dropdown && btn) {
      // Calculate position relative to viewport since dropdown is now position: fixed
      const btnRect = btn.getBoundingClientRect();
      dropdown.style.top = `${btnRect.bottom + 8}px`;
      dropdown.style.right = `${window.innerWidth - btnRect.right}px`;
      
      this.refreshOutputDevices();
      dropdown.classList.add('show');
      btn.classList.add('active');
    }
  }
  
  hideDropdown() {
    const dropdown = document.getElementById('outputDeviceDropdown');
    const btn = document.getElementById('outputDeviceBtn');
    if (dropdown && btn) {
      dropdown.classList.remove('show');
      btn.classList.remove('active');
    }
  }
}

