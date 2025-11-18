// src/main/services/DeviceMonitorService.js - USB Device Monitoring Service
let usb;
try {
  usb = require('usb');
  console.log('✅ USB module loaded successfully');
} catch (error) {
  console.error('❌ Failed to load USB module:', error.message);
}

class DeviceMonitorService {
  constructor(eventEmitter) {
    this.eventEmitter = eventEmitter;
    this.isMonitoring = false;
    this.connectedDevices = new Map(); // Track connected Apple devices
    this.pollingInterval = null; // Fallback polling mechanism
    this.currentPollingRate = 3000; // Current polling rate in ms
    this.FAST_POLL_RATE = 3000; // Poll every 3s when no device connected (for quick detection)
    this.SLOW_POLL_RATE = 10000; // Poll every 10s when device is connected (just for disconnection)
    this.syncInProgress = false; // Flag to pause device monitoring during sync
    
    console.log('📱 DeviceMonitorService constructor called');
    console.log('   USB module available:', !!usb);
    console.log('   USB has "on" method:', usb && typeof usb.on === 'function');
    
    // Apple's USB vendor ID
    this.APPLE_VENDOR_ID = 0x05ac;
    
    // iPhone/iPad product IDs
    // Note: Many iPhone models share the same Product ID (e.g., 0x12A8 is used by iPhone 5-13)
    // so we use generic names rather than trying to identify specific models
    this.IOS_DEVICE_PRODUCT_IDS = {
      // iPhones (Normal Mode)
      0x1290: 'iPhone',           // iPhone (1st gen)
      0x1292: 'iPhone',           // iPhone 3G
      0x1294: 'iPhone',           // iPhone 3GS
      0x1297: 'iPhone',           // iPhone 4
      0x1299: 'iPhone',           // iPhone 4S
      0x129a: 'iPhone',           // iPhone 5/5C/5S/6/SE/7/8/X/XR/11/12/13 (shared ID)
      0x12a8: 'iPhone',           // iPhone 5/5C/5S/6/SE/7/8/X/XR/11/12/13 (most common, shared across many models)
      0x12ab: 'iPhone',           // Various iPhone models
      
      // iPads (Normal Mode)
      0x12a0: 'iPad',             // iPad (1st gen)
      0x12a2: 'iPad',             // iPad 2
      0x12a4: 'iPad',             // iPad 3
      0x12a6: 'iPad',             // iPad 4
      0x12a8: 'iPad',             // iPad Air (Note: shares ID with many iPhones)
      0x12aa: 'iPad',             // iPad Air 2
      0x12ac: 'iPad',             // iPad mini
      0x12ae: 'iPad',             // iPad mini 2
      0x12b0: 'iPad',             // iPad mini 3
      0x12b2: 'iPad',             // iPad mini 4
      0x12b4: 'iPad',             // iPad Pro 12.9"
      0x12b6: 'iPad',             // iPad Pro 9.7"
      0x12b8: 'iPad',             // iPad (5th gen)
      0x12ba: 'iPad',             // iPad Pro 10.5"
      0x12bc: 'iPad',             // iPad Pro 12.9" (2nd gen)
      0x12be: 'iPad',             // iPad (6th gen)
      0x12c0: 'iPad',             // iPad Pro 11"
      0x12c2: 'iPad',             // iPad Pro 12.9" (3rd gen)
      0x12c4: 'iPad',             // iPad Air (3rd gen)
      0x12c6: 'iPad',             // iPad mini (5th gen)
      0x12c8: 'iPad',             // iPad (7th gen)
      0x12ca: 'iPad',             // iPad Pro 11" (2nd gen)
      0x12cc: 'iPad',             // iPad Pro 12.9" (4th gen)
      0x12ce: 'iPad',             // iPad Air (4th gen)
      0x12d0: 'iPad',             // iPad (8th gen)
      0x12d2: 'iPad',             // iPad Pro 11" (3rd gen)
      0x12d4: 'iPad',             // iPad Pro 12.9" (5th gen)
      0x12d6: 'iPad',             // iPad (9th gen)
      0x12d8: 'iPad',             // iPad mini (6th gen)
      0x12da: 'iPad',             // iPad Air (5th gen)
      0x12dc: 'iPad',             // iPad Pro 11" (4th gen)
      0x12de: 'iPad',             // iPad Pro 12.9" (6th gen)
      0x12e0: 'iPad',             // iPad (10th gen)
      0x12e2: 'iPad'              // iPad Air (6th gen) and newer models
    };
  }
  
  /**
   * Start monitoring USB devices for Apple products
   */
  startMonitoring() {
    console.log('🚀 startMonitoring() called');
    
    try {
      // Check if USB library is available
      console.log('   Checking USB library availability...');
      if (!usb || typeof usb.getDeviceList !== 'function') {
        console.log('   ❌ USB library not functional (no getDeviceList method)');
        this.eventEmitter.emit('log', { 
          type: 'warning', 
          message: 'USB device monitoring unavailable - library not functional' 
        });
        return false;
      }
      console.log('   ✅ USB library is functional (polling-based)');

      if (this.isMonitoring) {
        console.log('   ⚠️ USB monitoring already active');
        return true;
      }

      // Note: node-usb v2.x doesn't support attach/detach events
      // We'll use polling-only approach
      console.log('   ℹ️  node-usb does not support events, using polling-only approach');
      
      this.isMonitoring = true;
      
      // Scan for already connected devices
      console.log('   🔍 Running initial device scan...');
      this.scanConnectedDevices();
      
      // Start polling with adaptive rate
      this.startPolling();
      
      console.log('   ✅ USB device monitoring fully started (polling mode)');
      this.eventEmitter.emit('log', { 
        type: 'info', 
        message: 'USB device monitoring started (adaptive polling)' 
      });
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to initialize USB monitoring:', error);
      this.eventEmitter.emit('log', { 
        type: 'warning', 
        message: 'USB device monitoring could not be initialized' 
      });
      return false;
    }
  }
  
  /**
   * Stop monitoring USB devices
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    try {
      // Stop polling interval
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
      
      // Remove all listeners to prevent memory leaks
      usb.removeAllListeners('attach');
      usb.removeAllListeners('detach');
      
      this.isMonitoring = false;
      this.connectedDevices.clear();
      
      this.eventEmitter.emit('log', { 
        type: 'info', 
        message: 'USB device monitoring stopped' 
      });
      
    } catch (error) {
      console.error('Error stopping USB monitoring:', error);
    }
  }
  
  /**
   * Start polling with current rate
   */
  startPolling() {
    // Clear any existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    // Determine initial polling rate based on current device state
    const hasDevices = this.connectedDevices.size > 0;
    this.currentPollingRate = hasDevices ? this.SLOW_POLL_RATE : this.FAST_POLL_RATE;
    
    console.log(`   ⏱️  Starting polling at ${this.currentPollingRate}ms interval (${hasDevices ? 'device connected' : 'no devices'})`);
    
    this.pollingInterval = setInterval(() => {
      this.scanConnectedDevices();
    }, this.currentPollingRate);
  }
  
  /**
   * Adjust polling rate based on device connection state
   */
  adjustPollingRate() {
    // Skip adjustment if we're in the middle of a sync operation
    if (this.syncInProgress) {
      return; // Don't mess with device status during active sync
    }
    
    const hasDevices = this.connectedDevices.size > 0;
    const newRate = hasDevices ? this.SLOW_POLL_RATE : this.FAST_POLL_RATE;
    
    // Only restart polling if the rate needs to change
    if (newRate !== this.currentPollingRate) {
      console.log(`   🔄 Adjusting polling rate: ${this.currentPollingRate}ms → ${newRate}ms (${hasDevices ? 'device connected, slow poll' : 'no devices, fast poll'})`);
      this.currentPollingRate = newRate;
      this.startPolling();
    }
  }
  
  /**
   * Handle USB device attachment
   */
  handleDeviceAttach(device) {
    try {
      if (!device.deviceDescriptor) {
        console.log('  ⚠️ handleDeviceAttach: No device descriptor');
        return;
      }
      
      const { idVendor, idProduct } = device.deviceDescriptor;
      
      // Check if it's an Apple device
      if (idVendor === this.APPLE_VENDOR_ID) {
        const deviceKey = `${idVendor}:${idProduct}`;
        
        // Check if this device is already tracked (to prevent duplicate events during polling)
        if (this.connectedDevices.has(deviceKey)) {
          return; // Already tracking this device, skip (silent)
        }
        
        const deviceInfo = this.getDeviceInfo(idProduct);
        
        console.log(`  ✨ New ${deviceInfo.type} detected: ${deviceKey}`);
        
        // Track the device
        this.connectedDevices.set(deviceKey, {
          vendorId: idVendor,
          productId: idProduct,
          deviceType: deviceInfo.type,
          deviceName: deviceInfo.name,
          connectedAt: Date.now(),
          udid: null // Will be fetched asynchronously
        });
        
        // Emit events based on device type
        if (deviceInfo.isIOS) {
          // Try to get the actual device name asynchronously
          this.fetchActualDeviceName(deviceKey, idProduct, deviceInfo.type);
          
          this.eventEmitter.emit('phone-connected', { 
            deviceId: idProduct,
            deviceName: deviceInfo.name,
            deviceType: deviceInfo.type
          });
          
          this.eventEmitter.emit('log', { 
            type: 'success', 
            message: `${deviceInfo.type} detected via USB` 
          });
        } else {
          this.eventEmitter.emit('log', { 
            type: 'info', 
            message: `Apple device detected: ${deviceInfo.name}` 
          });
        }
      }
      
    } catch (error) {
      console.error('Error processing USB attach event:', error);
    }
  }
  
  /**
   * Handle USB device detachment
   */
  handleDeviceDetach(device) {
    try {
      if (!device.deviceDescriptor) {
        return;
      }
      
      const { idVendor, idProduct } = device.deviceDescriptor;
      const deviceKey = `${idVendor}:${idProduct}`;
      
      // Check if it's a tracked Apple device
      if (idVendor === this.APPLE_VENDOR_ID && this.connectedDevices.has(deviceKey)) {
        const deviceInfo = this.connectedDevices.get(deviceKey);
        
        // Remove from tracking
        this.connectedDevices.delete(deviceKey);
        
        // Emit events based on device type
        if (deviceInfo.deviceType === 'iPhone' || deviceInfo.deviceType === 'iPad') {
          this.eventEmitter.emit('phone-disconnected', {
            deviceId: idProduct,
            deviceName: deviceInfo.deviceName
          });
          
          this.eventEmitter.emit('log', { 
            type: 'warning', 
            message: `${deviceInfo.deviceName} disconnected` 
          });
        } else {
          this.eventEmitter.emit('log', { 
            type: 'info', 
            message: `Apple device disconnected: ${deviceInfo.deviceName}` 
          });
        }
      }
      
    } catch (error) {
      console.error('Error processing USB detach event:', error);
    }
  }
  
  /**
   * Scan for already connected Apple devices
   */
  scanConnectedDevices() {
    try {
      const devices = usb.getDeviceList();
      const currentDeviceKeys = new Set();
      const previousDeviceCount = this.connectedDevices.size;
      
      // Only log detailed info if device count changed or no devices connected (for debugging new connections)
      const shouldLogDetails = previousDeviceCount === 0 || devices.length === 0;
      
      // Check for newly connected devices
      for (const device of devices) {
        if (device.deviceDescriptor && device.deviceDescriptor.idVendor === this.APPLE_VENDOR_ID) {
          const deviceKey = `${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct}`;
          currentDeviceKeys.add(deviceKey);
          
          // This will only emit events for new devices
          this.handleDeviceAttach(device);
        }
      }
      
      // Check for disconnected devices (previously tracked but no longer present)
      for (const [deviceKey, deviceInfo] of this.connectedDevices.entries()) {
        if (!currentDeviceKeys.has(deviceKey)) {
          console.log(`  ❌ Device disconnected: ${deviceKey} (${deviceInfo.deviceName})`);
          
          // Device was disconnected
          this.connectedDevices.delete(deviceKey);
          
          // Emit disconnection event
          if (deviceInfo.deviceType === 'iPhone' || deviceInfo.deviceType === 'iPad') {
            this.eventEmitter.emit('phone-disconnected', {
              deviceId: deviceInfo.productId,
              deviceName: deviceInfo.deviceName,
              deviceType: deviceInfo.deviceType
            });
            
            this.eventEmitter.emit('log', { 
              type: 'warning', 
              message: `${deviceInfo.deviceName} disconnected` 
            });
          }
        }
      }
      
      // Adjust polling rate based on whether devices are connected
      this.adjustPollingRate();
      
    } catch (error) {
      console.error('Error scanning connected devices:', error);
    }
  }
  
  /**
   * Get device information from product ID
   * Use ideviceinfo to get ACTUAL device type (iPhone vs iPad)
   */
  getDeviceInfo(productId) {
    // Check if this is a known iOS device by product ID
    const isKnownIOSDevice = this.IOS_DEVICE_PRODUCT_IDS.hasOwnProperty(productId);
    
    // Always try ideviceinfo for accurate detection
    try {
      const { execSync } = require('child_process');
      const output = execSync('ideviceinfo -k DeviceClass -k ProductType -k DeviceName', { 
        encoding: 'utf8', 
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      });
      
      const lines = output.trim().split('\n');
      let deviceClass = null;
      let productType = null;
      let deviceName = null;
      
      for (const line of lines) {
        if (line.includes('DeviceClass:')) {
          deviceClass = line.split(':')[1].trim();
        } else if (line.includes('ProductType:')) {
          productType = line.split(':')[1].trim();
        } else if (line.includes('DeviceName:')) {
          deviceName = line.split(':')[1].trim();
        }
      }
      
      // DeviceClass is the most accurate: "iPhone", "iPad", "iPod", etc.
      if (deviceClass) {
        console.log(`✅ Device detected via ideviceinfo: ${deviceClass} (${productType || 'unknown model'})`);
        return {
          name: deviceName || productType || deviceClass,
          type: deviceClass, // This is the correct type directly from iOS
          isIOS: ['iPhone', 'iPad', 'iPod'].includes(deviceClass)
        };
      }
    } catch (e) {
      console.error('❌ ideviceinfo failed:', e.message);
      console.error('   Device may be locked or not trusted');
    }
    
    // If ideviceinfo failed, check if it's a known iOS device by product ID
    if (isKnownIOSDevice) {
      // Known iOS device (probably locked or not trusted yet)
      const deviceTypeName = this.IOS_DEVICE_PRODUCT_IDS[productId];
      console.log(`  ℹ️  Using fallback: Known ${deviceTypeName} (Product ID: 0x${productId.toString(16)})`);
      return {
        name: 'iOS Device',
        type: 'iOS Device',
        isIOS: true // Still treat as iOS device - it's just locked/not trusted
      };
    }
    
    // Unknown Apple device that failed ideviceinfo (likely accessories like headphones)
    console.log(`  ℹ️  Unknown Apple device (Product ID: 0x${productId.toString(16)}) - ignoring`);
    return {
      name: 'Apple Device',
      type: 'Apple Device',
      isIOS: false
    };
  }
  
  /**
   * Get list of currently connected Apple devices
   */
  getConnectedDevices() {
    return Array.from(this.connectedDevices.values());
  }
  
  /**
   * Check if any iOS devices are connected
   */
  hasConnectedIOSDevice() {
    for (const device of this.connectedDevices.values()) {
      if (device.deviceType === 'iPhone' || 
          device.deviceType === 'iPad' || 
          device.deviceType === 'iOS Device') {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Pause monitoring during sync operations
   */
  pauseForSync() {
    this.syncInProgress = true;
    console.log('   ⏸️  Device monitoring paused for sync operation');
  }

  /**
   * Resume monitoring after sync
   */
  resumeAfterSync() {
    this.syncInProgress = false;
    console.log('   ▶️  Device monitoring resumed');
  }

  /**
   * Fetch the actual device name from the iOS device
   */
  /**
   * Fetch UDIDs for all connected devices
   */
  async fetchAllUDIDs() {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const path = require('path');
      const { app } = require('electron');
      const execAsync = promisify(exec);
      
      // Use correct paths for packaged vs dev
      const isPackaged = app.isPackaged;
      
      const scriptPath = isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'get-device-udids.py')
        : path.join(__dirname, '../../../scripts', 'get-device-udids.py');
      
      const pythonPath = isPackaged
        ? path.join(process.resourcesPath, 'python', 'python', 'bin', 'python3')
        : path.join(__dirname, '../../../resources', 'python', 'python', 'bin', 'python3');
      
      console.log(`  🐍 Using Python: ${pythonPath}`);
      console.log(`  📜 Using script: ${scriptPath}`);
      
      const { stdout } = await execAsync(`"${pythonPath}" "${scriptPath}"`);
      const result = JSON.parse(stdout);
      
      if (result.success && result.devices) {
        return result.devices.map(d => d.udid);
      }
      return [];
    } catch (error) {
      console.error('  ⚠️  Error fetching UDIDs:', error.message);
      return [];
    }
  }

  /**
   * Fetch device info for a specific UDID
   */
  async fetchDeviceInfoByUDID(udid) {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const path = require('path');
      const { app } = require('electron');
      const execAsync = promisify(exec);
      
      // Use correct paths for packaged vs dev
      const isPackaged = app.isPackaged;
      
      const scriptPath = isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'get-device-name.py')
        : path.join(__dirname, '../../../scripts', 'get-device-name.py');
      
      const pythonPath = isPackaged
        ? path.join(process.resourcesPath, 'python', 'python', 'bin', 'python3')
        : path.join(__dirname, '../../../resources', 'python', 'python', 'bin', 'python3');
      
      console.log(`  🐍 Using Python: ${pythonPath}`);
      console.log(`  📜 Using script: ${scriptPath}`);
      
      const { stdout } = await execAsync(`"${pythonPath}" "${scriptPath}" "${udid}"`);
      const result = JSON.parse(stdout);
      
      if (result.success) {
        return {
          name: result.name,
          model: result.model,
          udid: result.udid
        };
      }
      return null;
    } catch (error) {
      console.error(`  ⚠️  Error fetching info for UDID ${udid}:`, error.message);
      return null;
    }
  }

  /**
   * Get UDIDs of USB-connected devices only (not WiFi)
   */
  async getUSBConnectedUDIDs() {
    try {
      const { execSync } = require('child_process');
      const output = execSync('idevice_id -l', { 
        encoding: 'utf8', 
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore']
      });
      
      const udids = output.trim().split('\n').filter(line => line.length > 0);
      return udids;
    } catch (error) {
      return [];
    }
  }

  /**
   * Fetch device names for all connected iOS devices
   * Maps UDIDs to tracked devices
   * Only includes USB-connected devices (filters out WiFi)
   */
  async fetchActualDeviceName(deviceKey, deviceId, deviceType) {
    try {
      // Get USB-only UDIDs (not WiFi)
      const usbUDIDs = await this.getUSBConnectedUDIDs();
      
      if (usbUDIDs.length === 0) {
        console.log('  ⚠️  No USB-connected devices found');
        return;
      }
      
      console.log(`  📱 Found ${usbUDIDs.length} USB-connected device(s)`);
      
      // Get all UDIDs (for comparison)
      const udids = await this.fetchAllUDIDs();
      
      if (udids.length === 0) {
        console.log('  ⚠️  No UDIDs found, using fallback name');
        return;
      }
      
      // Filter to only USB-connected devices
      const usbUDIDSet = new Set(usbUDIDs);
      const usbOnlyUDIDs = udids.filter(udid => usbUDIDSet.has(udid));
      
      // Deduplicate UDIDs
      const uniqueUDIDs = [...new Set(usbOnlyUDIDs)];
      console.log(`  📱 Found ${uniqueUDIDs.length} USB-connected device(s) (filtered from ${udids.length} total)`);
      
      if (uniqueUDIDs.length === 0) {
        console.log('  ⚠️  No USB devices to process (WiFi-only devices filtered out)');
        return;
      }
      
      // Fetch info for each unique USB-connected UDID and assign to devices
      let deviceIndex = 0;
      const deviceEntries = Array.from(this.connectedDevices.entries());
      
      for (const udid of uniqueUDIDs) {
        const deviceInfo = await this.fetchDeviceInfoByUDID(udid);
        
        if (deviceInfo && deviceIndex < deviceEntries.length) {
          const [key, device] = deviceEntries[deviceIndex];
          
          console.log(`  📱 Device ${deviceIndex + 1}: ${deviceInfo.name} (${udid.substr(0, 8)}...)`);
          
          // Update device with UDID and actual name
          device.deviceName = deviceInfo.name;
          device.deviceModel = deviceInfo.model;
          device.udid = deviceInfo.udid;
          device.connectionType = 'USB'; // Mark as USB-connected (we filtered WiFi out)
          this.connectedDevices.set(key, device);
          
          // Emit updated event with full info
          const productId = key.split(':')[1];
          this.eventEmitter.emit('phone-connected', {
            deviceId: parseInt(productId),
            productId: parseInt(productId),
            deviceName: deviceInfo.name,
            deviceType: device.deviceType,
            deviceModel: deviceInfo.model,
            udid: deviceInfo.udid,
            connectionType: 'USB'
          });
          
          deviceIndex++;
        }
      }
    } catch (error) {
      console.log(`  ⚠️  Could not fetch device names: ${error.message}`);
    }
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      connectedDeviceCount: this.connectedDevices.size,
      hasIOSDevice: this.hasConnectedIOSDevice(),
      connectedDevices: this.getConnectedDevices()
    };
  }
}

module.exports = DeviceMonitorService;
