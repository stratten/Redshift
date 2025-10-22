// src/main/services/AppBridge.js
// Consolidated IPC registration and service→renderer event forwarding
const path = require('path');

function attachEventForwarders(manager) {
  if (!manager) return;

  // SyncService events
  if (manager.syncService && manager.syncService.eventEmitter) {
    const ee = manager.syncService.eventEmitter;
    ee.on('scan-started', () => manager.sendToRenderer('scan-started'));
    ee.on('scan-completed', (data) => manager.sendToRenderer('scan-completed', data));
    ee.on('scan-error', (data) => manager.sendToRenderer('scan-error', data));
    ee.on('transfer-started', (data) => manager.sendToRenderer('transfer-started', data));
    ee.on('transfer-progress', (data) => manager.sendToRenderer('transfer-progress', data));
    ee.on('transfer-completed', (data) => manager.sendToRenderer('transfer-completed', data));
    ee.on('transfer-error', (data) => manager.sendToRenderer('transfer-error', data));
    ee.on('transfer-cancelled', () => manager.sendToRenderer('transfer-cancelled'));
    ee.on('log', (data) => manager.sendToRenderer('log', data));
  }

  // DopplerSyncService events
  if (manager.dopplerSyncService && manager.dopplerSyncService.on) {
    const d = manager.dopplerSyncService;
    d.on('sync-session-started', (data) => manager.sendToRenderer('doppler-sync-started', data));
    d.on('sync-session-completed', (data) => manager.sendToRenderer('doppler-sync-completed', data));
    d.on('sync-session-error', (data) => manager.sendToRenderer('doppler-sync-error', data));
    d.on('transfer-progress', (data) => manager.sendToRenderer('doppler-transfer-progress', data));
    d.on('file-transferred', (data) => manager.sendToRenderer('doppler-file-transferred', data));
    d.on('transfer-error', (data) => manager.sendToRenderer('doppler-transfer-error', data));
    d.on('orphan-cleaned', (data) => manager.sendToRenderer('doppler-orphan-cleaned', data));
    
    // WebSocket sync events
    d.on('sync-started', (data) => manager.sendToRenderer('doppler-ws-sync-started', data));
    d.on('sync-status', (data) => manager.sendToRenderer('doppler-ws-sync-status', data));
    d.on('file-progress', (data) => manager.sendToRenderer('doppler-ws-file-progress', data));
    d.on('file-completed', (data) => manager.sendToRenderer('doppler-ws-file-completed', data));
    d.on('file-failed', (data) => manager.sendToRenderer('doppler-ws-file-failed', data));
    d.on('sync-completed', (data) => manager.sendToRenderer('doppler-ws-sync-completed', data));
    d.on('sync-error', (data) => manager.sendToRenderer('doppler-ws-sync-error', data));
  }

  // DeviceMonitorService events
  if (manager.deviceMonitorService && manager.deviceMonitorService.eventEmitter) {
    const de = manager.deviceMonitorService.eventEmitter;
    de.on('phone-connected', (data) => {
      console.log('📡 DeviceMonitor phone-connected event:', data);
      manager.sendToRenderer('phone-connected', data);
    });
    de.on('phone-disconnected', (data) => {
      console.log('📡 DeviceMonitor phone-disconnected event:', data);
      manager.sendToRenderer('phone-disconnected', data);
    });
    de.on('log', (data) => manager.sendToRenderer('log', data));
  }

  // RedShiftUSBSyncService events
  if (manager.redshiftUSBSyncService) {
    const usb = manager.redshiftUSBSyncService;
    usb.on('sync-started', (data) => manager.sendToRenderer('usb-sync-started', data));
    usb.on('sync-progress', (data) => manager.sendToRenderer('usb-sync-progress', data));
    usb.on('sync-completed', (data) => manager.sendToRenderer('usb-sync-completed', data));
    usb.on('sync-failed', (error) => manager.sendToRenderer('usb-sync-failed', error));
    usb.on('device-scanned', (data) => {
      console.log('📡 AppBridge received device-scanned, forwarding to renderer:', data);
      manager.sendToRenderer('usb-device-scanned', data);
    });
    usb.on('device-scan-progress', (data) => {
      manager.sendToRenderer('device-scan-progress', data);
    });
  }

  // AudioPlayerService events
  if (manager.audioPlayerService && manager.audioPlayerService.eventEmitter) {
    const ae = manager.audioPlayerService.eventEmitter;
    // initialize play count tracker state on manager
    if (!manager._playCountState) manager._playCountState = { countedForPath: null };

    ae.on('audio-state-changed', (data) => manager.sendToRenderer('audio-state-changed', data));

    ae.on('audio-track-loaded', async (data) => {
      manager.sendToRenderer('audio-track-loaded', data);
      try {
        await upsertSongFromTrack(manager, data.track);
        // Reset play-counted state for new track
        manager._playCountState.countedForPath = null;
      } catch (err) {
        console.warn('[Songs] upsert on track load failed:', err.message);
      }
    });

    ae.on('audio-play', async (data) => {
      manager.sendToRenderer('audio-play', data);
      // Just upsert the song data when play starts, don't count yet
      try {
        const track = data && data.track ? data.track : null;
        if (track && track.filePath) {
          await upsertSongFromTrack(manager, track);
        }
      } catch (err) {
        console.warn('[Songs] upsert on play failed:', err.message);
      }
    });
    ae.on('audio-pause', (data) => manager.sendToRenderer('audio-pause', data));
    ae.on('audio-stop', (data) => {
      manager.sendToRenderer('audio-stop', data);
      manager._playCountState.countedForPath = null;
    });
    ae.on('audio-seek', (data) => manager.sendToRenderer('audio-seek', data));
    ae.on('audio-volume-changed', (data) => manager.sendToRenderer('audio-volume-changed', data));
    ae.on('audio-queue-changed', (data) => manager.sendToRenderer('audio-queue-changed', data));
    ae.on('audio-shuffle-changed', (data) => manager.sendToRenderer('audio-shuffle-changed', data));
    ae.on('audio-repeat-changed', (data) => manager.sendToRenderer('audio-repeat-changed', data));
    ae.on('audio-position-changed', (data) => manager.sendToRenderer('audio-position-changed', data));
    ae.on('library-scan-progress', (data) => manager.sendToRenderer('library-scan-progress', data));
    ae.on('audio-track-ended', async (data) => {
      manager.sendToRenderer('audio-track-ended', data);
      // Increment play count when track completes
      try {
        const track = data && data.track ? data.track : null;
        if (track && track.filePath && manager._playCountState.countedForPath !== track.filePath) {
          await incrementPlayCount(manager, track.filePath);
          manager._playCountState.countedForPath = track.filePath;
        }
      } catch (err) {
        console.warn('[Songs] play count increment on track end failed:', err.message);
      }
      manager._playCountState.countedForPath = null;
    });
    ae.on('audio-error', (data) => manager.sendToRenderer('audio-error', data));
  }
}

function registerIpc(ipcMain, manager) {
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
  const h = (fn) => async (...args) => { await waitReady(); return fn(...args); };
  // Library scan / transfer
  ipcMain.handle('scan-library', async () => manager.scanMasterLibrary());
  ipcMain.handle('scan-music-library', h(async () => manager.scanMusicLibrary()));
  ipcMain.handle('transfer-files', async (event, files, method) => manager.transferFiles(files, method));
  ipcMain.handle('get-transfer-history', async () => manager.getTransferHistory());
  ipcMain.handle('add-files-to-library', async (event, { paths }) => {
    const fs = require('fs').promises;
    const fsSync = require('fs');
    
    try {
      const libraryPath = manager.settings.masterLibraryPath;
      if (!libraryPath) {
        return { success: false, error: 'Library path not configured' };
      }
      
      console.log(`📥 Adding ${paths.length} items to library: ${libraryPath}`);
      
      let filesAdded = 0;
      const audioExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma'];
      
      // Recursive function to copy directory
      async function copyDirectory(src, dest) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          
          if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (audioExtensions.includes(ext)) {
              await fs.copyFile(srcPath, destPath);
              filesAdded++;
              console.log(`  ✓ Copied: ${entry.name}`);
            }
          }
        }
      }
      
      // Process each dropped path
      for (const itemPath of paths) {
        const stat = await fs.stat(itemPath);
        const itemName = path.basename(itemPath);
        
        if (stat.isDirectory()) {
          // Copy entire directory
          const destPath = path.join(libraryPath, itemName);
          console.log(`📁 Copying directory: ${itemName}`);
          await copyDirectory(itemPath, destPath);
        } else if (stat.isFile()) {
          // Copy single file (if it's an audio file)
          const ext = path.extname(itemName).toLowerCase();
          if (audioExtensions.includes(ext)) {
            const destPath = path.join(libraryPath, itemName);
            await fs.copyFile(itemPath, destPath);
            filesAdded++;
            console.log(`  ✓ Copied: ${itemName}`);
          }
        }
      }
      
      console.log(`✅ Added ${filesAdded} audio files to library`);
      return { success: true, filesAdded };
    } catch (error) {
      console.error('❌ Error adding files to library:', error);
      return { success: false, error: error.message };
    }
  });

  // Settings
  ipcMain.handle('get-settings', async () => ({
    ...manager.settings,
    databasePath: manager.dbPath,
    appDataPath: manager.appDataPath
  }));
  ipcMain.handle('update-setting', async (event, key, value) => { await manager.updateSetting(key, value); return manager.settings; });
  ipcMain.handle('choose-directory', async (event, settingKey = 'masterLibraryPath') => {
    const result = await manager.chooseDirectory(settingKey);
    return result;
  });

  // Device
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

  // Audio
  ipcMain.handle('audio-load-track', async (event, filePath) => manager.audioPlayerService.loadTrack(filePath));
  ipcMain.handle('audio-play', async () => manager.audioPlayerService.play());
  ipcMain.handle('audio-pause', async () => manager.audioPlayerService.pause());
  ipcMain.handle('audio-stop', async () => manager.audioPlayerService.stop());
  ipcMain.handle('audio-seek', async (event, position) => manager.audioPlayerService.seek(position));
  ipcMain.handle('audio-set-volume', async (event, volume) => manager.audioPlayerService.setVolume(volume));
  ipcMain.handle('audio-toggle-mute', async () => manager.audioPlayerService.toggleMute());
  ipcMain.handle('audio-play-next', async () => manager.audioPlayerService.playNext());
  ipcMain.handle('audio-play-previous', async () => manager.audioPlayerService.playPrevious());
  ipcMain.handle('audio-set-queue', async (event, tracks, startIndex) => manager.audioPlayerService.setQueue(tracks, startIndex));
  ipcMain.handle('audio-add-to-queue', async (event, track) => manager.audioPlayerService.addToQueue(track));
  ipcMain.handle('audio-toggle-shuffle', async () => manager.audioPlayerService.toggleShuffle());
  ipcMain.handle('audio-set-repeat', async (event, mode) => manager.audioPlayerService.setRepeatMode(mode));
  ipcMain.handle('audio-get-state', async () => manager.audioPlayerService.getPlayerState());
  ipcMain.handle('audio-get-play-history', async (event, limit) => manager.audioPlayerService.getPlayHistory(limit));
  ipcMain.handle('audio-clear-queue', async () => manager.audioPlayerService.clearQueue());

  // Logger
  ipcMain.handle('log-to-terminal', async (event, { type, message }) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${timestamp} [${type.toUpperCase()}] ${message}`);
    return true;
  });

  // Cache
  ipcMain.handle('get-cache-stats', h(async () => manager.musicLibraryCache.getCacheStats()));
  ipcMain.handle('clear-music-cache', async () => { await manager.musicLibraryCache.clearCache(); return true; });
  
  // Metadata editing - writes to actual audio files
  ipcMain.handle('update-track-metadata', async (event, filePath, updates) => {
    try {
      await waitReady();
      const libraryPath = manager.settings.musicLibraryPath || manager.masterLibraryPath;
      const result = await manager.musicLibraryCache.updateFileMetadata(filePath, updates, libraryPath);
      return result;
    } catch (error) {
      console.error('❌ Failed to update track metadata:', error);
      throw error;
    }
  });
  ipcMain.handle('library-delete-track', async (event, filePath) => {
    try {
      const fs = require('fs-extra');
      const path = require('path');
      
      // Remove from cache/database
      await manager.musicLibraryCache.removeCachedFile(filePath);
      
      // Delete the actual file
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`🗑️ Deleted file: ${filePath}`);
        return { success: true, message: 'Track deleted successfully' };
      } else {
        console.log(`⚠️ File not found: ${filePath}`);
        return { success: false, message: 'File not found' };
      }
    } catch (error) {
      console.error('Error deleting track:', error);
      return { success: false, message: error.message };
    }
  });

  // Playlists
  ipcMain.handle('playlist-create', async (event, name, description, syncToDoppler) => manager.playlistService.createPlaylist(name, description, syncToDoppler));
  ipcMain.handle('playlist-get-all', h(async () => manager.playlistService.getAllPlaylists()));
  ipcMain.handle('playlist-get', h(async (event, playlistId) => manager.playlistService.getPlaylist(playlistId)));
  ipcMain.handle('playlist-update', async (event, playlistId, updates) => manager.playlistService.updatePlaylist(playlistId, updates));
  ipcMain.handle('playlist-delete', async (event, playlistId) => manager.playlistService.deletePlaylist(playlistId));
  ipcMain.handle('playlist-add-tracks', async (event, playlistId, filePaths) => manager.playlistService.addTracksToPlaylist(playlistId, filePaths));
  ipcMain.handle('playlist-remove-tracks', async (event, playlistId, trackIds) => manager.playlistService.removeTracksFromPlaylist(playlistId, trackIds));
  ipcMain.handle('playlist-get-tracks', async (event, playlistId) => manager.playlistService.getPlaylistTracks(playlistId));
  ipcMain.handle('playlist-reorder-tracks', async (event, playlistId, trackOrder) => manager.playlistService.reorderPlaylistTracks(playlistId, trackOrder));
  ipcMain.handle('playlist-export-m3u', async (event, playlistId, filePath) => manager.playlistService.exportPlaylistToM3U(playlistId, filePath));
  ipcMain.handle('playlist-import-m3u', async (event, filePath, playlistName) => manager.playlistService.importPlaylistFromM3U(filePath, playlistName));
  ipcMain.handle('playlist-get-for-sync', async () => manager.playlistService.getPlaylistsForSync());

  // Doppler
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

  ipcMain.handle('songs-get-recently-played', h(async (event, limitArg) => {
    const limit = Math.max(1, Math.min(500, parseInt(limitArg, 10) || 50));
    const rows = await allSql(manager.db, `SELECT * FROM songs WHERE last_played IS NOT NULL ORDER BY last_played DESC LIMIT ?`, [limit]);
    return rows;
  }));

  ipcMain.handle('songs-get-top-played', h(async (event, limitArg) => {
    const limit = Math.max(1, Math.min(500, parseInt(limitArg, 10) || 50));
    const rows = await allSql(manager.db, `SELECT * FROM songs ORDER BY play_count DESC, last_played DESC NULLS LAST LIMIT ?`, [limit]);
    return rows;
  }));
  
  ipcMain.handle('audio-track-ended-notify', h(async (event, filePath) => {
    // Called from renderer when a track actually finishes playing
    try {
      console.log(`[Songs] 📥 Received track-ended notification from renderer`);
      console.log(`[Songs]    File: ${filePath}`);
      
      if (filePath && typeof filePath === 'string') {
        const trackName = path.basename(filePath);
        console.log(`[Songs] 🎵 Processing track ended: ${trackName}`);
        manager.sendToRenderer('log', { type: 'info', message: `🎵 Processing track completion: ${trackName}` });
        
        await incrementPlayCount(manager, filePath);
        
        // Send event to renderer to trigger Recently Played refresh
        manager.sendToRenderer('audio-track-ended', { track: { filePath } });
        console.log(`[Songs] ✅ Track ended processing complete for: ${trackName}`);
        return true;
      } else {
        console.warn(`[Songs] ⚠️ Invalid file path received: ${filePath}`);
        return false;
      }
    } catch (error) {
      console.error(`[Songs] ❌ Error handling track ended: ${error.message}`);
      manager.sendToRenderer('log', { type: 'error', message: `❌ Error updating play count: ${error.message}` });
      return false;
    }
  }));

  ipcMain.handle('songs-update-metadata', h(async (event, filePathArg, fieldType, newValue) => {
    const filePath = String(filePathArg || '');
    if (!filePath || !fieldType || !newValue) return false;
    
    const mm = require('music-metadata');
    const NodeID3 = require('node-id3');
    
    try {
      // Update database
      const dbField = fieldType === 'title' ? 'title' : fieldType === 'artist' ? 'artist' : 'album';
      await ensureSongRow(manager, filePath);
      await runSql(manager.db, `UPDATE songs SET ${dbField} = ?, modified_date = strftime('%s','now') WHERE file_path = ?`, [newValue, filePath]);
      
      // Update file tags
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.mp3') {
        const tags = {};
        if (fieldType === 'title') tags.title = newValue;
        else if (fieldType === 'artist') tags.artist = newValue;
        else if (fieldType === 'album') tags.album = newValue;
        
        const success = NodeID3.update(tags, filePath);
        if (!success) throw new Error('Failed to write ID3 tags');
      }
      // For other formats (m4a, flac, etc.), we'd need different libraries
      // For now, just update the database
      
      const msg = `Updated ${fieldType} to "${newValue}" for ${path.basename(filePath)}`;
      console.log(msg);
      manager.sendToRenderer('log', { type: 'success', message: msg });
      return true;
    } catch (err) {
      const errMsg = `Failed to update ${fieldType}: ${err.message}`;
      console.error(errMsg);
      manager.sendToRenderer('log', { type: 'error', message: errMsg });
      return false;
    }
  }));

  ipcMain.handle('show-in-finder', h(async (event, filePathArg) => {
    const filePath = String(filePathArg || '');
    if (!filePath) return false;
    
    const { shell } = require('electron');
    try {
      shell.showItemInFolder(filePath);
      return true;
    } catch (err) {
      console.error(`Failed to show in Finder: ${err.message}`);
      return false;
    }
  }));

  ipcMain.handle('get-file-info', h(async (event, filePathArg) => {
    const filePath = String(filePathArg || '');
    if (!filePath) return false;
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      // On macOS, use AppleScript to show Get Info
      if (process.platform === 'darwin') {
        const script = `tell application "Finder"
          activate
          reveal POSIX file "${filePath.replace(/"/g, '\\"')}"
          tell application "System Events"
            keystroke "i" using command down
          end tell
        end tell`;
        await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === 'win32') {
        // On Windows, show properties dialog
        await execAsync(`powershell -command "Get-ItemProperty '${filePath}' | Format-List"`);
      } else {
        // Linux fallback - just open the file location
        const { shell } = require('electron');
        shell.showItemInFolder(filePath);
      }
      return true;
    } catch (err) {
      console.error(`Failed to open file info: ${err.message}`);
      return false;
    }
  }));

  // ============================================================================
  // DOPPLER WEBSOCKET PAIRING & SYNC IPC HANDLERS
  // ============================================================================

  /**
   * Start pairing with Doppler device
   * Returns: { code: '123456', qrDataUrl: 'data:image/png;base64,...' }
   */
  ipcMain.handle('doppler-pair-start', async () => {
    try {
      // Clean up any previous active session
      if (manager._currentPairingService) {
        manager._currentPairingService.disconnect();
      }
      manager._currentPairingService = null;
      manager._lastPairedDevice = null;
      manager._activeLanUrl = null;
      manager._activeDeviceId = null;
      
      const WebSocketPairingService = require('./WebSocketPairingService');
      const pairingService = new WebSocketPairingService();
      
      // Store pairing service on manager for later use
      manager._currentPairingService = pairingService;
      
      // Connect and get code
      await pairingService.connect();
      const code = pairingService.getPairingCode();
      const qrDataUrl = await pairingService.generateQRCode();
      
      return { code, qrDataUrl };
    } catch (error) {
      console.error('❌ Failed to start pairing:', error);
      throw error;
    }
  });

  /**
   * Wait for device to pair (after QR code is scanned)
   * Returns: device info
   */
  ipcMain.handle('doppler-pair-wait', async () => {
    try {
      if (!manager._currentPairingService) {
        throw new Error('No active pairing session');
      }
      
      const device = await manager._currentPairingService.waitForDevice();
      manager._lastPairedDevice = device;
      
      return device;
    } catch (error) {
      console.error('❌ Failed to wait for device:', error);
      throw error;
    }
  });

  /**
   * Confirm device pairing and get LAN URL
   * Returns: { lanUrl, pushToken, device }
   */
  ipcMain.handle('doppler-pair-confirm', async (_event, isSaved = true) => {
    try {
      if (!manager._currentPairingService || !manager._lastPairedDevice) {
        throw new Error('No device to confirm');
      }
      
      const result = await manager._currentPairingService.confirmDevice(
        manager._lastPairedDevice,
        isSaved
      );
      
      // Save device to database
      if (isSaved) {
        await manager.dopplerSyncService.saveDopplerDevice({
          id: result.device.id,
          name: result.device.name,
          pushToken: result.pushToken
        });
      }
      
      // Keep pairing service alive for immediate sync
      // Store the LAN URL and device info for the sync operation
      manager._activeLanUrl = result.lanUrl;
      manager._activeDeviceId = result.device.id;
      
      console.log('✅ Pairing confirmed, keeping connection alive for sync');
      
      return result;
    } catch (error) {
      console.error('❌ Failed to confirm pairing:', error);
      throw error;
    }
  });

  /**
   * Cancel active pairing
   */
  ipcMain.handle('doppler-pair-cancel', async () => {
    try {
      if (manager._currentPairingService) {
        manager._currentPairingService.disconnect();
        manager._currentPairingService = null;
        manager._lastPairedDevice = null;
      }
      // Also clean up active session
      manager._activeLanUrl = null;
      manager._activeDeviceId = null;
      return true;
    } catch (error) {
      console.error('❌ Failed to cancel pairing:', error);
      return false;
    }
  });

  /**
   * Get saved Doppler device
   * Returns: device info or null
   */
  ipcMain.handle('doppler-get-device', async () => {
    try {
      await waitReady();
      const device = await manager.dopplerSyncService.getSavedDopplerDevice();
      return device;
    } catch (error) {
      console.error('❌ Failed to get saved device:', error);
      return null;
    }
  });

  /**
   * Forget (delete) saved Doppler device
   */
  ipcMain.handle('doppler-forget-device', async (_event, deviceId) => {
    try {
      await waitReady();
      await manager.dopplerSyncService.forgetDopplerDevice(deviceId);
      return true;
    } catch (error) {
      console.error('❌ Failed to forget device:', error);
      return false;
    }
  });

  /**
   * Start Doppler WebSocket sync
   * Options: { forcePair: boolean }
   */
  ipcMain.handle('doppler-sync-websocket', async (_event, options = {}) => {
    try {
      await waitReady();
      
      // If we have an active pairing session, use it
      if (manager._activeLanUrl && !options.lanUrl) {
        console.log('📱 Using active pairing session');
        options.lanUrl = manager._activeLanUrl;
        options.deviceId = manager._activeDeviceId;
      }
      
      const result = await manager.dopplerSyncService.syncViaDopplerWebSocket(options);
      
      // Clean up after successful sync
      if (manager._currentPairingService) {
        manager._currentPairingService.disconnect();
        manager._currentPairingService = null;
        manager._lastPairedDevice = null;
      }
      manager._activeLanUrl = null;
      manager._activeDeviceId = null;
      
      return result;
    } catch (error) {
      console.error('❌ Doppler WebSocket sync failed:', error);
      
      // Clean up on error too
      if (manager._currentPairingService) {
        manager._currentPairingService.disconnect();
        manager._currentPairingService = null;
        manager._lastPairedDevice = null;
      }
      manager._activeLanUrl = null;
      manager._activeDeviceId = null;
      
      // If pairing is required, return special error code
      if (error.message === 'PAIRING_REQUIRED') {
        throw new Error('PAIRING_REQUIRED');
      }
      
      throw error;
    }
  });

  // ============================================================================
  // REDSHIFT USB SYNC IPC HANDLERS
  // ============================================================================

  /**
   * Start USB sync with connected iPhone
   */
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

  /**
   * Manually rescan connected device
   */
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

  /**
   * Get list of unsynced tracks
   */
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

  /**
   * Get USB sync status
   */
  ipcMain.handle('usb-sync-get-status', async () => {
    console.log('📱 IPC handler: usb-sync-get-status called');
    try {
      await waitReady();
      
      if (!manager.redshiftUSBSyncService) {
        console.log('⚠️  USB sync service not available');
        return { available: false };
      }
      
      const syncStatus = manager.redshiftUSBSyncService.getStatus();
      const deviceStatus = manager.deviceMonitorService.getStatus();
      
      console.log('📱 Device status from monitor:', deviceStatus);
      
      const result = {
        available: true,
        isConnected: deviceStatus.hasIOSDevice,
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

  /**
   * Save artist image to disk
   */
  ipcMain.handle('save-artist-image', async (event, { artistName, dataUrl }) => {
    const fs = require('fs').promises;
    const crypto = require('crypto');
    
    try {
      // Create artist images directory in app data
      const { app } = require('electron');
      const artistImagesDir = path.join(app.getPath('userData'), 'artist-images');
      await fs.mkdir(artistImagesDir, { recursive: true });
      
      // Create a safe filename from artist name
      const safeFilename = artistName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const hash = crypto.createHash('md5').update(artistName).digest('hex').substring(0, 8);
      const filename = `${safeFilename}_${hash}`;
      
      if (!dataUrl) {
        // Save a marker file to indicate we tried and failed
        const markerPath = path.join(artistImagesDir, `${filename}.failed`);
        await fs.writeFile(markerPath, artistName);
        console.log(`💾 Saved failed marker for: ${artistName}`);
        return { success: true, path: null };
      }
      
      // Extract the base64 data and format from data URL
      const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid data URL format');
      }
      
      const [, format, base64Data] = matches;
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Save the image file
      const imagePath = path.join(artistImagesDir, `${filename}.${format}`);
      await fs.writeFile(imagePath, buffer);
      
      // Save mapping file to restore original artist name
      const mappingPath = path.join(artistImagesDir, `${filename}.meta`);
      await fs.writeFile(mappingPath, artistName);
      
      console.log(`💾 Saved image for ${artistName}: ${imagePath}`);
      return { success: true, path: imagePath };
    } catch (error) {
      console.error(`Failed to save artist image for ${artistName}:`, error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Load all artist images from disk
   */
  ipcMain.handle('load-artist-image-cache', async () => {
    const fs = require('fs').promises;
    
    try {
      const { app } = require('electron');
      const artistImagesDir = path.join(app.getPath('userData'), 'artist-images');
      
      // Create directory if it doesn't exist
      try {
        await fs.mkdir(artistImagesDir, { recursive: true });
      } catch (err) {
        // Directory might already exist
      }
      
      const files = await fs.readdir(artistImagesDir);
      const cache = {};
      
      for (const file of files) {
        const filePath = path.join(artistImagesDir, file);
        
        if (file.endsWith('.failed')) {
          // This is a failed lookup marker
          const artistName = await fs.readFile(filePath, 'utf8');
          cache[artistName] = null;
          continue;
        }
        
        // Skip non-image files
        if (!file.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          continue;
        }
        
        // Extract artist name from filename (everything before the hash)
        const baseFilename = file.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
        const parts = baseFilename.split('_');
        const hash = parts.pop(); // Remove hash
        const safeName = parts.join('_');
        
        // Read the image and convert to base64 data URL
        const buffer = await fs.readFile(filePath);
        const ext = path.extname(file).substring(1);
        const mimeType = ext === 'jpg' ? 'jpeg' : ext;
        const base64 = buffer.toString('base64');
        const dataUrl = `data:image/${mimeType};base64,${base64}`;
        
        // We need to reverse the safe filename back to original
        // For now, we'll create a mapping file
        const mappingPath = path.join(artistImagesDir, `${baseFilename}.meta`);
        try {
          const originalName = await fs.readFile(mappingPath, 'utf8');
          cache[originalName] = dataUrl;
        } catch (err) {
          // No mapping file, skip this image
          console.warn(`No mapping file for ${file}, skipping`);
        }
      }
      
      console.log(`🎨 Loaded ${Object.keys(cache).length} artist images from disk`);
      return cache;
    } catch (error) {
      console.error('Failed to load artist image cache:', error);
      return {};
    }
  });
}

module.exports = { registerIpc, attachEventForwarders };
// --- Helpers ---
function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function ensureSongRow(manager, filePath) {
  // Try update modified_date; if no row, insert minimal
  const result = await runSql(manager.db, `UPDATE songs SET modified_date = strftime('%s','now') WHERE file_path = ?`, [filePath]);
  if (result.changes === 0) {
    const fileName = path.basename(filePath);
    await runSql(manager.db, `INSERT INTO songs (file_path, file_name, title) VALUES (?, ?, ?)`, [filePath, fileName, fileName.replace(/\.[^/.]+$/, '')]);
  }
}

async function upsertSongFromTrack(manager, track) {
  if (!track || !track.filePath) return;
  const filePath = track.filePath;
  const fileName = track.filename || path.basename(filePath);
  const m = track.metadata || {};
  const fmt = m.format || {};
  const com = m.common || {};
  const duration = Math.floor((fmt.duration || 0));
  const title = com.title || fileName.replace(/\.[^/.]+$/, '');
  const artist = com.artist || null;
  const album = com.album || null;
  const albumArtist = com.albumartist || null;
  const year = com.year || null;
  const trackNumber = (com.track && (com.track.no || com.track.number)) ? (com.track.no || com.track.number) : null;
  const genre = com.genre ? (Array.isArray(com.genre) ? com.genre.join(', ') : String(com.genre)) : null;
  const bitrate = fmt.bitrate || null;
  const sampleRate = fmt.sampleRate || null;
  const codec = fmt.codec || fmt.container || null;

  // compute relative path if possible
  let relativePath = null;
  try {
    const base = manager.settings.musicLibraryPath || manager.settings.masterLibraryPath;
    if (base && filePath.startsWith(base)) {
      relativePath = path.relative(base, filePath);
    }
  } catch (_) {}

  // UPDATE first; if no changes, INSERT
  const update = await runSql(manager.db, `
    UPDATE songs SET
      file_name = ?,
      relative_path = ?,
      duration = ?,
      title = ?,
      artist = ?,
      album = ?,
      album_artist = ?,
      year = ?,
      track_number = ?,
      genre = ?,
      bitrate = ?,
      sample_rate = ?,
      codec = ?,
      modified_date = strftime('%s','now')
    WHERE file_path = ?
  `, [fileName, relativePath, duration, title, artist, album, albumArtist, year, trackNumber, genre, bitrate, sampleRate, codec, filePath]);

  if (update.changes === 0) {
    await runSql(manager.db, `
      INSERT INTO songs (
        file_path, file_name, relative_path, duration, title, artist, album, album_artist,
        year, track_number, genre, bitrate, sample_rate, codec
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [filePath, fileName, relativePath, duration, title, artist, album, albumArtist, year, trackNumber, genre, bitrate, sampleRate, codec]);
  }
}

async function incrementPlayCount(manager, filePath) {
  const beforeRows = await allSql(manager.db, `SELECT play_count, last_played FROM songs WHERE file_path = ?`, [filePath]);
  const before = beforeRows && beforeRows[0] ? beforeRows[0] : null;
  
  await runSql(manager.db, `
    UPDATE songs
    SET play_count = COALESCE(play_count, 0) + 1,
        last_played = strftime('%s','now'),
        modified_date = strftime('%s','now')
    WHERE file_path = ?
  `, [filePath]);
  
  const afterRows = await allSql(manager.db, `SELECT play_count, last_played FROM songs WHERE file_path = ?`, [filePath]);
  const after = afterRows && afterRows[0] ? afterRows[0] : null;
  
  const msg = `[Songs] ✅ Play count updated for ${path.basename(filePath)}: ${before?.play_count || 0} → ${after?.play_count || 0}, last_played: ${after?.last_played}`;
  console.log(msg);
  manager.sendToRenderer('log', { type: 'success', message: msg });
}

