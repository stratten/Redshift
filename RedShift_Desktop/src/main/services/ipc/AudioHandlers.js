// src/main/services/ipc/AudioHandlers.js
// IPC handlers for audio playback control

const { incrementPlayCount } = require('./DatabaseHelpers');

function registerAudioHandlers(ipcMain, manager, waitReady) {
  const h = (fn) => async (...args) => { await waitReady(); return fn(...args); };

  // Audio playback controls
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
  
  // Track ended notification - increments play count
  ipcMain.handle('audio-track-ended-notify', async (event, trackPath) => {
    try {
      await waitReady();
      console.log(`[Audio] Track ended notification received for: ${trackPath}`);
      await incrementPlayCount(manager, trackPath);
      return true;
    } catch (error) {
      console.error('[Audio] Failed to increment play count:', error);
      return false;
    }
  });

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
}

module.exports = { registerAudioHandlers };

