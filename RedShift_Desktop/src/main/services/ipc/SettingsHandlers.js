// src/main/services/ipc/SettingsHandlers.js
// IPC handlers for application settings

function registerSettingsHandlers(ipcMain, manager) {
  ipcMain.handle('get-settings', async () => ({
    ...manager.settings,
    databasePath: manager.dbPath,
    appDataPath: manager.appDataPath
  }));
  
  ipcMain.handle('update-setting', async (event, key, value) => {
    await manager.updateSetting(key, value);
    return manager.settings;
  });
  
  ipcMain.handle('choose-directory', async (event, settingKey = 'masterLibraryPath') => {
    const result = await manager.chooseDirectory(settingKey);
    return result;
  });
}

module.exports = { registerSettingsHandlers };

