// DeviceScanManager.js - Device scanning and file discovery
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const path = require('path');

/**
 * Handles scanning of connected iOS devices for RedShift app files
 */
class DeviceScanManager {
  constructor(deviceMonitorService, musicLibraryCache, eventEmitter) {
    this.deviceMonitorService = deviceMonitorService;
    this.musicLibraryCache = musicLibraryCache;
    this.eventEmitter = eventEmitter;
    
    // Cache for device files
    this.deviceFiles = new Map(); // Legacy - for single device
    this.deviceFilesMap = new Map(); // Map of deviceId -> Map of files (for multi-device)
    this.lastScannedDevices = new Map(); // Track last scan results to prevent duplicate emissions
  }

  /**
   * Re-emit device scan status (useful for UI refresh after window loads)
   * Note: This should only re-emit if we actually have scan results cached
   */
  async refreshDeviceStatus() {
    console.log(`🔄 refreshDeviceStatus called`);
    // Scan all connected devices
    const status = this.deviceMonitorService.getStatus();
    if (!status.hasIOSDevice) {
      console.log('⚠️  No device connected, skipping refresh');
      return;
    }
    
    console.log('🔄 Rescanning all connected devices...');
    await this.scanAllDevices();
  }

  /**
   * Scan all connected devices
   */
  async scanAllDevices() {
    const status = this.deviceMonitorService.getStatus();
    if (!status.hasIOSDevice || !status.connectedDevices || status.connectedDevices.length === 0) {
      console.log('📱 No devices to scan');
      return;
    }
    
    console.log(`📱 Scanning ${status.connectedDevices.length} connected device(s)...`);
    
    // Scan each device SEQUENTIALLY (not in parallel) to avoid race conditions
    // where pymobiledevice3 might query the same device for both productIds
    // Use productId as unique identifier (it's unique per USB interface)
    for (const device of status.connectedDevices) {
      const deviceId = String(device.productId || 'unknown');
      await this.scanSpecificDevice(deviceId, device);
    }
  }

  /**
   * Scan a specific device by its product ID
   */
  async scanSpecificDevice(deviceId, deviceInfo) {
    try {
      console.log(`🔍 Scanning device ${deviceId} (${deviceInfo.deviceName || 'iOS Device'})...`);
      
      // Use correct paths for packaged vs dev
      const { app } = require('electron');
      const isPackaged = app.isPackaged;
      
      const scriptPath = isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'list-device-files.py')
        : path.join(__dirname, '../../../../scripts', 'list-device-files.py');
      
      const pythonPath = isPackaged
        ? path.join(process.resourcesPath, 'python', 'python', 'bin', 'python3')
        : path.join(__dirname, '../../../../resources', 'python', 'python', 'bin', 'python3');
      
      // Pass UDID to Python script to query specific device (if available)
      // UDID is needed by pymobiledevice3 to target the right device
      // But we use productId as the card identifier since multiple productIds can have same UDID
      const udid = deviceInfo.udid || '';
      const command = udid 
        ? `"${pythonPath}" "${scriptPath}" "${udid}"`
        : `"${pythonPath}" "${scriptPath}"`;
      
      console.log(`  📱 Querying productId ${deviceId} via${udid ? ` UDID ${udid.substr(0, 8)}...` : ' default connection'}`);
      console.log(`  🐍 Using Python: ${pythonPath}`);
      console.log(`  📜 Using script: ${scriptPath}`);
      const { stdout } = await execAsync(command);
      const result = JSON.parse(stdout);
      
      // Check if the result is an error response
      if (result.error === 'APP_NOT_INSTALLED') {
        console.warn(`📱 RedShift Mobile app not found on device ${deviceId}`);
        this.deviceFilesMap.set(String(deviceId), new Map());
        
        const eventData = {
          deviceId: String(deviceId),
          deviceName: deviceInfo.deviceName || deviceInfo.deviceType || 'iOS Device',
          deviceType: deviceInfo.deviceType || 'iOS Device',
          deviceModel: deviceInfo.deviceModel || '',
          filesOnDevice: 0,
          totalTracks: 0,
          unsyncedTracks: 0,
          appInstalled: false
        };
        
        // Only emit if data has changed
        const lastScan = this.lastScannedDevices.get(String(deviceId));
        const dataChanged = !lastScan || 
          lastScan.appInstalled !== false ||
          lastScan.deviceName !== eventData.deviceName;
        
        if (dataChanged) {
          this.lastScannedDevices.set(String(deviceId), eventData);
          this.eventEmitter.emit('device-scanned', eventData);
        }
        
        return new Map();
      }
      
      // Create a map of filename -> file info for this device
      const fileMap = new Map();
      if (Array.isArray(result)) {
        result.forEach(file => {
          fileMap.set(file.name, file);
        });
      }
      
      // Store this device's files
      this.deviceFilesMap.set(String(deviceId), fileMap);
      
      console.log(`📱 Found ${fileMap.size} files on device ${deviceId}`);
      
      // Get total library count
      const tracks = await this.musicLibraryCache.getAllMetadata();
      const totalTracks = tracks.length;
      const unsyncedTracks = totalTracks - fileMap.size;
      
      // Emit event with comprehensive stats for this specific device
      const eventData = { 
        deviceId: String(deviceId),
        deviceName: deviceInfo.deviceName || deviceInfo.deviceType || 'iOS Device',
        deviceType: deviceInfo.deviceType || 'iOS Device',
        deviceModel: deviceInfo.deviceModel || '',
        filesOnDevice: fileMap.size,
        totalTracks: totalTracks,
        unsyncedTracks: unsyncedTracks,
        appInstalled: true
      };
      
      // Only emit if data has changed (prevent duplicate/conflicting emissions)
      const lastScan = this.lastScannedDevices.get(String(deviceId));
      const dataChanged = !lastScan || 
        lastScan.filesOnDevice !== eventData.filesOnDevice ||
        lastScan.appInstalled !== eventData.appInstalled ||
        lastScan.deviceName !== eventData.deviceName;
      
      if (dataChanged) {
        console.log(`📡 Emitting device-scanned event for device ${deviceId}:`, eventData);
        this.lastScannedDevices.set(String(deviceId), eventData);
        this.eventEmitter.emit('device-scanned', eventData);
      } else {
        console.log(`📡 Skipping duplicate device-scanned event for device ${deviceId}`);
      }
      
      return fileMap;
      
    } catch (error) {
      // Command failed - likely app not installed or other error
      console.warn(`⚠️  Could not scan device ${deviceId}:`, error.message);
      this.deviceFilesMap.set(String(deviceId), new Map());
      
      // Generic error - assume app not installed
      console.warn(`📱 RedShift Mobile app not found on device ${deviceId}`);
      
      const eventData = {
        deviceId: String(deviceId),
        deviceName: deviceInfo.deviceName || deviceInfo.deviceType || 'iOS Device',
        deviceType: deviceInfo.deviceType || 'iOS Device',
        deviceModel: deviceInfo.deviceModel || '',
        filesOnDevice: 0,
        totalTracks: 0,
        unsyncedTracks: 0,
        appInstalled: false
      };
      
      // Only emit if data has changed
      const lastScan = this.lastScannedDevices.get(String(deviceId));
      const dataChanged = !lastScan || 
        lastScan.appInstalled !== false ||
        lastScan.deviceName !== eventData.deviceName;
      
      if (dataChanged) {
        this.lastScannedDevices.set(String(deviceId), eventData);
        this.eventEmitter.emit('device-scanned', eventData);
      }
      
      return new Map();
    }
  }

  /**
   * Scan device files (legacy method - scans first device only)
   * Kept for backward compatibility
   * @param {Function} getConnectedDeviceInfo - Function to get device info
   */
  async scanDeviceFiles(getConnectedDeviceInfo) {
    try {
      console.log('🔍 Scanning device files...');
      
      // Use correct paths for packaged vs dev
      const { app } = require('electron');
      const isPackaged = app.isPackaged;
      
      const scriptPath = isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'list-device-files.py')
        : path.join(__dirname, '../../../../scripts', 'list-device-files.py');
      
      const pythonPath = isPackaged
        ? path.join(process.resourcesPath, 'python', 'python', 'bin', 'python3')
        : path.join(__dirname, '../../../../resources', 'python', 'python', 'bin', 'python3');
      
      console.log(`  🐍 Using Python: ${pythonPath}`);
      console.log(`  📜 Using script: ${scriptPath}`);
      
      const { stdout } = await execAsync(`"${pythonPath}" "${scriptPath}"`);
      const result = JSON.parse(stdout);
      
      // Check if the result is an error response
      if (result.error === 'APP_NOT_INSTALLED') {
        console.warn('📱 RedShift Mobile app not found on this device');
        this.deviceFiles = new Map();
        
        // Get device info from deviceMonitorService
        const deviceInfo = getConnectedDeviceInfo();
        
        this.eventEmitter.emit('device-scanned', {
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.deviceName,
          deviceType: deviceInfo.deviceType,
          deviceModel: deviceInfo.deviceModel,
          filesOnDevice: 0,
          totalTracks: 0,
          unsyncedTracks: 0,
          appInstalled: false
        });
        return this.deviceFiles;
      }
      
      // Create a map of filename -> file info for quick lookup
      const fileMap = new Map();
      if (Array.isArray(result)) {
        result.forEach(file => {
          fileMap.set(file.name, file);
        });
      }
      
      this.deviceFiles = fileMap;
      console.log(`📱 Found ${fileMap.size} files on device`);
      
      // Get total library count
      const tracks = await this.musicLibraryCache.getAllMetadata();
      const totalTracks = tracks.length;
      const unsyncedTracks = totalTracks - fileMap.size;
      
      // Get device info from deviceMonitorService
      const deviceInfo = getConnectedDeviceInfo();
      
      // Emit event with comprehensive stats (app is installed if we got here)
      const eventData = { 
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        deviceModel: deviceInfo.deviceModel,
        filesOnDevice: fileMap.size,
        totalTracks: totalTracks,
        unsyncedTracks: unsyncedTracks,
        appInstalled: true
      };
      console.log('📡 Emitting device-scanned event:', eventData);
      this.eventEmitter.emit('device-scanned', eventData);
      
      return fileMap;
      
    } catch (error) {
      // Command failed - likely app not installed or other error
      console.warn('⚠️  Could not scan device files:', error.message);
      this.deviceFiles = new Map();
      
      // Try to parse error output
      try {
        const errorData = JSON.parse(error.stdout || '{}');
        if (errorData.error === 'APP_NOT_INSTALLED') {
          console.warn('📱 RedShift Mobile app not found on this device');
          const deviceInfo = getConnectedDeviceInfo();
          this.eventEmitter.emit('device-scanned', {
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName,
            deviceType: deviceInfo.deviceType,
            deviceModel: deviceInfo.deviceModel,
            filesOnDevice: 0,
            totalTracks: 0,
            unsyncedTracks: 0,
            appInstalled: false
          });
          return this.deviceFiles;
        }
      } catch {}
      
      // Generic error - assume app not installed
      console.warn('📱 RedShift Mobile app not found on this device');
      const deviceInfo = getConnectedDeviceInfo();
      this.eventEmitter.emit('device-scanned', {
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        deviceModel: deviceInfo.deviceModel,
        filesOnDevice: 0,
        totalTracks: 0,
        unsyncedTracks: 0,
        appInstalled: false
      });
      
      return this.deviceFiles;
    }
  }

  /**
   * Get device files for a specific device
   * @param {string} deviceId - Device ID
   * @returns {Map} Map of files on device
   */
  getDeviceFiles(deviceId) {
    return this.deviceFilesMap.get(deviceId) || new Map();
  }

  /**
   * Get legacy device files (for backward compatibility)
   * @returns {Map} Map of files on device
   */
  getLegacyDeviceFiles() {
    return this.deviceFiles;
  }
}

module.exports = DeviceScanManager;

