// src/main/services/ipc/VideoHandlers.js
// IPC handlers for the local desktop video library.

function registerVideoHandlers(ipcMain, manager, waitReady) {
  const h = (fn) => async (...args) => { await waitReady(); return fn(...args); };

  ipcMain.handle('scan-video-library', h(async () => {
    if (!manager.videoLibraryPath) {
      throw new Error('No video library path configured. Set one in Settings.');
    }
    return manager.videoLibraryCache.scanVideoLibrary(manager.videoLibraryPath);
  }));

  ipcMain.handle('get-all-videos', h(async () => {
    return manager.videoLibraryCache.getAllVideos();
  }));

  ipcMain.handle('update-video-progress', h(async (event, payload) => {
    if (!payload || !payload.filePath) {
      throw new Error('update-video-progress requires a filePath');
    }
    return manager.videoLibraryCache.updatePlaybackState(payload.filePath, payload);
  }));

  ipcMain.handle('add-videos-to-library', h(async (event, { paths }) => {
    if (!manager.videoLibraryPath) {
      return { success: false, error: 'No video library path configured. Set one in Settings.' };
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      return { success: false, error: 'No video files were provided.' };
    }

    try {
      const filesAdded = await manager.videoLibraryCache.importPaths(paths, manager.videoLibraryPath);
      return { success: true, filesAdded };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }));
}

module.exports = { registerVideoHandlers };
