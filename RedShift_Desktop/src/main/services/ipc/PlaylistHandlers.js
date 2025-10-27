// src/main/services/ipc/PlaylistHandlers.js
// IPC handlers for playlist management

function registerPlaylistHandlers(ipcMain, manager, waitReady) {
  const h = (fn) => async (...args) => { await waitReady(); return fn(...args); };

  ipcMain.handle('playlist-create', async (event, name, description, syncToDoppler) => 
    manager.playlistService.createPlaylist(name, description, syncToDoppler));
  ipcMain.handle('playlist-get-all', h(async () => manager.playlistService.getAllPlaylists()));
  ipcMain.handle('playlist-get', h(async (event, playlistId) => manager.playlistService.getPlaylist(playlistId)));
  ipcMain.handle('playlist-update', async (event, playlistId, updates) => 
    manager.playlistService.updatePlaylist(playlistId, updates));
  ipcMain.handle('playlist-delete', async (event, playlistId) => 
    manager.playlistService.deletePlaylist(playlistId));
  ipcMain.handle('playlist-add-tracks', async (event, playlistId, filePaths) => 
    manager.playlistService.addTracksToPlaylist(playlistId, filePaths));
  ipcMain.handle('playlist-remove-tracks', async (event, playlistId, trackIds) => 
    manager.playlistService.removeTracksFromPlaylist(playlistId, trackIds));
  ipcMain.handle('playlist-get-tracks', async (event, playlistId) => 
    manager.playlistService.getPlaylistTracks(playlistId));
  ipcMain.handle('playlist-reorder-tracks', async (event, playlistId, trackOrder) => 
    manager.playlistService.reorderPlaylistTracks(playlistId, trackOrder));
  ipcMain.handle('playlist-export-m3u', async (event, playlistId, filePath) => 
    manager.playlistService.exportPlaylistToM3U(playlistId, filePath));
  ipcMain.handle('playlist-import-m3u', async (event, filePath, playlistName) => 
    manager.playlistService.importPlaylistFromM3U(filePath, playlistName));
  ipcMain.handle('playlist-get-for-sync', async () => 
    manager.playlistService.getPlaylistsForSync());
}

module.exports = { registerPlaylistHandlers };

