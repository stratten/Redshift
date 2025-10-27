// src/main/services/ipc/index.js
// Main IPC registration - orchestrates all handler modules

const { attachEventForwarders } = require('./EventForwarders');
const { registerLibraryHandlers } = require('./LibraryHandlers');
const { registerSettingsHandlers } = require('./SettingsHandlers');
const { registerDeviceHandlers } = require('./DeviceHandlers');
const { registerAudioHandlers } = require('./AudioHandlers');
const { registerPlaylistHandlers } = require('./PlaylistHandlers');
const { registerSyncHandlers } = require('./SyncHandlers');
const { registerArtistImageHandlers } = require('./ArtistImageHandlers');

/**
 * Register all IPC handlers
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 * @param {Object} manager - Application manager with all services
 */
function registerAllIpc(ipcMain, manager) {
  // Wait for core services to be ready
  const waitReady = async () => {
    if (manager.initPromise) {
      await manager.initPromise; // do not swallow init errors
    }
    const required = [
      ['settings', () => !!manager.settings],
      ['musicLibraryCache', () => !!manager.musicLibraryCache],
      ['playlistService', () => !!manager.playlistService],
      ['dopplerSyncService', () => !!manager.dopplerSyncService],
    ];
    const deadline = Date.now() + 10000; // allow up to 10s for cold starts
    let lastLoggedAt = 0;
    while (Date.now() < deadline) {
      const missing = required.filter(([_, ok]) => !ok()).map(([name]) => name);
      if (missing.length === 0) return;
      const now = Date.now();
      if (now - lastLoggedAt > 500) {
        console.log(`[IPC] waitReady: missing -> ${missing.join(', ')}`);
        lastLoggedAt = now;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    const missing = required.filter(([_, ok]) => !ok()).map(([name]) => name);
    if (manager._initError) {
      throw new Error(`Initialization failed: ${manager._initError.message || manager._initError}`);
    }
    throw new Error(`Core services not ready after timeout: ${missing.join(', ')}`);
  };

  // Register all handler modules
  registerLibraryHandlers(ipcMain, manager, waitReady);
  registerSettingsHandlers(ipcMain, manager);
  registerDeviceHandlers(ipcMain, manager);
  registerAudioHandlers(ipcMain, manager, waitReady);
  registerPlaylistHandlers(ipcMain, manager, waitReady);
  registerSyncHandlers(ipcMain, manager, waitReady);
  registerArtistImageHandlers(ipcMain);

  console.log('✅ All IPC handlers registered');
}

module.exports = { registerAllIpc, attachEventForwarders };

