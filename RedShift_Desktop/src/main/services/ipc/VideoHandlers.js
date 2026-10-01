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

  ipcMain.handle('prepare-video-playback', h(async (event, payload) => {
    const filePath = validFilePath(payload?.filePath);
    return manager.videoCompatibilityService.preparePlaybackSource(filePath);
  }));

  ipcMain.handle('get-tvmaze-match-candidates', h(async (event, payload) => {
    const seriesKey = validSeriesKey(payload?.seriesKey);
    return manager.tvMazeService.getCandidates(seriesKey);
  }));

  ipcMain.handle('select-tvmaze-match', h(async (event, payload) => {
    const seriesKey = validSeriesKey(payload?.seriesKey);
    const showId = Number(payload?.showId);
    if (!Number.isInteger(showId) || showId <= 0) {
      throw new Error('select-tvmaze-match requires a positive integer showId.');
    }
    await manager.tvMazeService.selectCandidate(seriesKey, showId);
    return { success: true };
  }));

  ipcMain.handle('refresh-tvmaze-series', h(async (event, payload) => {
    const seriesKey = validSeriesKey(payload?.seriesKey);
    await manager.tvMazeService.refreshSeries(seriesKey, payload?.forcePicker === true);
    return { success: true };
  }));

  ipcMain.handle('cache-tvmaze-series-artwork', h(async (event, payload) => {
    const seriesKey = validSeriesKey(payload?.seriesKey);
    void manager.tvMazeService.cacheEpisodeArtwork(seriesKey).catch((error) => {
      manager.emit('log', { type: 'warning', message: `🎬 TVMaze episode artwork failed: ${error.message}` });
    });
    return { success: true };
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

function validSeriesKey(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('TVMaze metadata requests require a seriesKey.');
  }
  return value.trim();
}

function validFilePath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Video playback preparation requires a filePath.');
  }
  return value;
}

module.exports = { registerVideoHandlers };
