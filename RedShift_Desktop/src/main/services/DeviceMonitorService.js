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
        const deviceInfo = this.getDeviceInfo(idProduct);
        const deviceKey = `${idVendor}:${idProduct}`;
        
        // Check if this device is already tracked (to prevent duplicate events during polling)
        if (this.connectedDevices.has(deviceKey)) {
          return; // Already tracking this device, skip (silent)
        }
        
        console.log(`  ✨ New ${deviceInfo.type} detected: ${deviceKey}`);
        
        // Track the device
        this.connectedDevices.set(deviceKey, {
          vendorId: idVendor,
          productId: idProduct,
          deviceType: deviceInfo.type,
          deviceName: deviceInfo.name,
          connectedAt: Date.now()
        });
        
        // Emit events based on device type
        if (deviceInfo.isIOS) {
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
   * Try to query actual device info via ideviceinfo for accurate detection
   */
  getDeviceInfo(productId) {
    // Try to get actual device info from ideviceinfo command
    try {
      const { execSync } = require('child_process');
      const output = execSync('ideviceinfo -k DeviceClass -k ProductType', { 
        encoding: 'utf8', 
        timeout: 2000 
      });
      
      const lines = output.trim().split('\n');
      let deviceClass = null;
      let productType = null;
      
      for (const line of lines) {
        if (line.startsWith('DeviceClass:')) {
          deviceClass = line.split(':')[1].trim();
        } else if (line.startsWith('ProductType:')) {
          productType = line.split(':')[1].trim();
        }
      }
      
      // DeviceClass is the most accurate: "iPhone", "iPad", "iPod", "Watch", etc.
      if (deviceClass) {
        return {
          name: productType || deviceClass,
          type: deviceClass,
          isIOS: ['iPhone', 'iPad', 'iPod'].includes(deviceClass)
        };
      }
    } catch (e) {
      // Fall back to product ID lookup if ideviceinfo fails
      console.log('⚠️  ideviceinfo failed, falling back to USB product ID lookup');
    }
    
    // Fallback: Use product ID lookup
    const deviceName = this.IOS_DEVICE_PRODUCT_IDS[productId];
    
    if (deviceName) {
      const type = deviceName.includes('iPad') ? 'iPad' : 'iPhone';
      return {
        name: deviceName,
        type: type,
        isIOS: true
      };
    }
    
    // Unknown Apple device
    return {
      name: `Apple Device (0x${productId.toString(16)})`,
      type: 'Unknown',
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
      if (device.deviceType === 'iPhone' || device.deviceType === 'iPad') {
        return true;
      }
    }
    return false;
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
