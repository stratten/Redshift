// src/main/services/ipc/DeviceHandlers.js
// IPC handlers for device monitoring and USB sync

function registerDeviceHandlers(ipcMain, manager) {
  ipcMain.handle('get-device-status', async () => manager.deviceMonitorService.getStatus());
  ipcMain.handle('get-connected-devices', async () => manager.deviceMonitorService.getConnectedDevices());
  
  ipcMain.handle('scan-device-music-library', async (event, { deviceId }) => {
    try {
      if (!manager.redshiftUSBSyncService) {
        return { success: false, error: 'USB sync service not initialized' };
      }
      
      const result = await manager.redshiftUSBSyncService.scanDeviceMusicLibrary(deviceId);
      return result;
    } catch (error) {
      console.error('❌ Error scanning device music library:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('import-from-device', async (event, { deviceId }) => {
    try {
      const libraryPath = manager.settings.masterLibraryPath;
      if (!libraryPath) {
        return { success: false, error: 'Library path not configured' };
      }
      
      const result = await manager.redshiftUSBSyncService.importFromDevice(deviceId, libraryPath);
      return result;
    } catch (error) {
      console.error('❌ Error importing from device:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerDeviceHandlers };

