// DeviceConnectionHelper.js - Device connection utility functions

/**
 * Helper class for device connection information
 */
class DeviceConnectionHelper {
  constructor(deviceMonitorService) {
    this.deviceMonitorService = deviceMonitorService;
  }

  /**
   * Check if iOS device is connected (uses existing DeviceMonitorService)
   */
  isDeviceConnected() {
    const status = this.deviceMonitorService.getStatus();
    return status.hasIOSDevice;
  }

  /**
   * Get the name of the connected device
   */
  getConnectedDeviceName() {
    const status = this.deviceMonitorService.getStatus();
    if (status.hasIOSDevice && status.connectedDevices && status.connectedDevices.length > 0) {
      const device = status.connectedDevices[0];
      return device.deviceName || device.deviceType || 'iOS Device';
    }
    return 'iOS Device';
  }

  /**
   * Get the first connected device's info (id, name, etc.)
   * Creates a unique device ID from productId if not present
   */
  getConnectedDeviceInfo() {
    const status = this.deviceMonitorService.getStatus();
    if (status.hasIOSDevice && status.connectedDevices && status.connectedDevices.length > 0) {
      const device = status.connectedDevices[0];
      
      // Create a unique device ID from productId (which identifies the device model/type)
      // This ensures different device types get different IDs
      const deviceId = device.deviceId || device.productId || 'unknown';
      
      return {
        deviceId: String(deviceId),
        deviceName: device.deviceName || device.deviceType || 'iOS Device',
        deviceType: device.deviceType || 'iOS Device',
        deviceModel: device.deviceModel || ''
      };
    }
    return {
      deviceId: 'unknown',
      deviceName: 'iOS Device',
      deviceType: 'iOS Device',
      deviceModel: ''
    };
  }

  /**
   * Get device by device ID from connected devices
   * @param {string} deviceId - The device ID (productId)
   * @returns {object|null} Device info or null
   */
  getConnectedDeviceByDeviceId(deviceId) {
    const devices = this.deviceMonitorService.getConnectedDevices();
    const device = Array.from(devices.values()).find(d => String(d.productId) === deviceId);
    return device || null;
  }

  /**
   * Get current device scan status (for refreshing UI)
   * @param {Map} deviceFiles - Map of device files
   */
  getDeviceStatus(deviceFiles) {
    return {
      isConnected: this.isDeviceConnected(),
      filesOnDevice: deviceFiles.size
    };
  }
}

module.exports = DeviceConnectionHelper;

