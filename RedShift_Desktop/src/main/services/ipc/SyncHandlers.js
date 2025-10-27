// src/main/services/ipc/SyncHandlers.js
// IPC handlers for Doppler sync, WebSocket sync, and USB sync

const { ensureSongRow, runSql, allSql } = require('./DatabaseHelpers');
const path = require('path');

function registerSyncHandlers(ipcMain, manager, waitReady) {
  const h = (fn) => async (...args) => { await waitReady(); return fn(...args); };

  // Doppler sync
  ipcMain.handle('doppler-get-sync-status', h(async () => manager.dopplerSyncService.getSyncStatus()));
  ipcMain.handle('doppler-start-sync', async (event, options) => manager.dopplerSyncService.startSyncSession(options));
  ipcMain.handle('doppler-get-statistics', async () => manager.dopplerSyncService.getSyncStatistics());
  ipcMain.handle('doppler-refresh-database', async () => manager.dopplerSyncService.refreshTransferDatabase());
  ipcMain.handle('doppler-get-transferred-files', async () => manager.dopplerSyncService.getTransferredFiles());
  ipcMain.handle('doppler-preindex-device', async () => manager.dopplerSyncService.preIndexDeviceLibrary());

  // Songs: favorites, ratings, queries
  ipcMain.handle('songs-toggle-favorite', h(async (event, filePathArg, isFavorite) => {
    const filePath = String(filePathArg || '');
    if (!filePath) return false;
    await ensureSongRow(manager, filePath);
    await runSql(manager.db, `UPDATE songs SET is_favorite = ?, modified_date = strftime('%s','now') WHERE file_path = ?`, [isFavorite ? 1 : 0, filePath]);
    // Confirm persistence via terminal and renderer log
    try {
      const rows = await allSql(manager.db, `SELECT is_favorite, rating FROM songs WHERE file_path = ?`, [filePath]);
      const saved = rows && rows[0] ? rows[0] : {};
      const msg = `[Songs] Saved favourite=${saved.is_favorite ? 1 : 0} rating=${saved.rating ?? 'null'} for ${path.basename(filePath)}`;
      console.log(msg);
      manager.sendToRenderer('log', { type: 'info', message: msg });
    } catch (_) {}
    return true;
  }));

  ipcMain.handle('songs-set-rating', h(async (event, filePathArg, rating) => {
    const filePath = String(filePathArg || '');
    const r = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
    if (!filePath) return false;
    await ensureSongRow(manager, filePath);
    await runSql(manager.db, `UPDATE songs SET rating = ?, modified_date = strftime('%s','now') WHERE file_path = ?`, [r, filePath]);
    // Confirm persistence via terminal and renderer log
    try {
      const rows = await allSql(manager.db, `SELECT is_favorite, rating FROM songs WHERE file_path = ?`, [filePath]);
      const saved = rows && rows[0] ? rows[0] : {};
      const msg = `[Songs] Saved rating=${saved.rating ?? 'null'} favourite=${saved.is_favorite ? 1 : 0} for ${path.basename(filePath)}`;
      console.log(msg);
      manager.sendToRenderer('log', { type: 'info', message: msg });
    } catch (_) {}
    return true;
  }));

  ipcMain.handle('songs-get-all-metadata', h(async () => {
    const rows = await allSql(manager.db, `SELECT file_path, is_favorite, rating, play_count, last_played FROM songs`);
    return rows;
  }));

  ipcMain.handle('songs-get-favorites', h(async () => {
    const rows = await allSql(manager.db, `SELECT * FROM songs WHERE is_favorite = 1 ORDER BY title COLLATE NOCASE`);
    return rows;
  }));

  ipcMain.handle('songs-get-recently-played', h(async (event, limit = 50) => {
    const rows = await allSql(manager.db, `
      SELECT * FROM songs 
      WHERE last_played IS NOT NULL 
      ORDER BY last_played DESC 
      LIMIT ?
    `, [limit]);
    return rows;
  }));

  ipcMain.handle('songs-get-top-played', h(async (event, limit = 50) => {
    const rows = await allSql(manager.db, `
      SELECT * FROM songs 
      WHERE play_count > 0 
      ORDER BY play_count DESC, last_played DESC 
      LIMIT ?
    `, [limit]);
    return rows;
  }));

  // WebSocket pairing
  ipcMain.handle('ws-pairing-start', async () => {
    try {
      await waitReady();
      if (!manager.webSocketPairingService) {
        throw new Error('WebSocket pairing service not initialized');
      }
      await manager.webSocketPairingService.startServer();
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to start WebSocket pairing:', error);
      throw error;
    }
  });

  ipcMain.handle('ws-pairing-stop', async () => {
    try {
      if (!manager.webSocketPairingService) {
        return { success: true };
      }
      await manager.webSocketPairingService.stopServer();
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to stop WebSocket pairing:', error);
      throw error;
    }
  });

  ipcMain.handle('ws-pairing-get-status', async () => {
    try {
      if (!manager.webSocketPairingService) {
        return { running: false, port: null, qrCode: null };
      }
      return manager.webSocketPairingService.getStatus();
    } catch (error) {
      console.error('❌ Failed to get WebSocket pairing status:', error);
      return { running: false, port: null, qrCode: null, error: error.message };
    }
  });

  // USB sync
  ipcMain.handle('usb-sync-start', async (event, { deviceId }) => {
    try {
      await waitReady();
      
      if (!manager.redshiftUSBSyncService) {
        throw new Error('USB sync service not initialized');
      }
      
      if (!deviceId) {
        throw new Error('Device ID is required');
      }
      
      await manager.redshiftUSBSyncService.sync(deviceId);
      
      return { success: true };
    } catch (error) {
      console.error('❌ USB sync failed:', error);
      throw error;
    }
  });

  ipcMain.handle('usb-sync-rescan', async () => {
    console.log('🔄 IPC handler: usb-sync-rescan called');
    try {
      await waitReady();
      console.log('🔄 Manager ready, checking service...');
      
      if (!manager.redshiftUSBSyncService) {
        console.error('❌ USB sync service not initialized');
        throw new Error('USB sync service not initialized');
      }
      
      console.log('🔄 Calling scanDeviceFiles()...');
      await manager.redshiftUSBSyncService.scanDeviceFiles();
      console.log('🔄 scanDeviceFiles() completed');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Device rescan failed:', error);
      throw error;
    }
  });

  ipcMain.handle('usb-sync-get-unsynced-tracks', async () => {
    try {
      await waitReady();
      
      if (!manager.redshiftUSBSyncService) {
        return [];
      }
      
      const unsyncedTracks = await manager.redshiftUSBSyncService.getUnsyncedTracks();
      return unsyncedTracks;
    } catch (error) {
      console.error('❌ Failed to get unsynced tracks:', error);
      return [];
    }
  });

  ipcMain.handle('usb-sync-get-status', async () => {
    console.log('📱 IPC handler: usb-sync-get-status called');
    try {
      await waitReady();
      
      if (!manager.redshiftUSBSyncService) {
        console.log('❌ USB sync service not initialized');
        return { available: false, error: 'USB sync service not initialized' };
      }
      
      const deviceStatus = await manager.deviceMonitorService.getStatus();
      console.log('📱 Device status:', deviceStatus);
      
      const syncStatus = await manager.redshiftUSBSyncService.getStatus();
      console.log('📱 Sync status:', syncStatus);
      
      const result = {
        available: deviceStatus.hasIOSDevice,
        connected: deviceStatus.hasIOSDevice,
        connectedDevices: deviceStatus.connectedDevices,
        ...syncStatus
      };
      
      console.log('📱 Returning status:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to get USB sync status:', error);
      return { available: false, error: error.message };
    }
  });
}

module.exports = { registerSyncHandlers };

