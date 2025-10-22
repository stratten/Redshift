// src/main/preload.js - Secure bridge between main and renderer processes
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // IPC invoke methods (async)
  invoke: (channel, ...args) => {
    const validChannels = [
      'scan-library',
      'scan-music-library',
      'add-files-to-library',
      'transfer-files', 
      'get-settings',
      'update-setting',
      'choose-directory',
      'get-transfer-history',
      'update-settings',
      'get-library-stats',
      'mark-file-transferred',
      'remove-transferred-file',
      'log-to-terminal',
      'get-device-status',
      'get-connected-devices',
      'scan-device-music-library',
      'import-from-device',
      // Audio player IPC channels
      'audio-load-track',
      'audio-play',
      'audio-pause',
      'audio-stop',
      'audio-seek',
      'audio-set-volume',
      'audio-toggle-mute',
      'audio-play-next',
      'audio-play-previous',
      'audio-set-queue',
      'audio-add-to-queue',
      'audio-toggle-shuffle',
      'audio-set-repeat',
        'audio-get-state',
        'audio-get-play-history',
        'audio-clear-queue',
        'get-cache-stats',
        'clear-music-cache',
        'update-track-metadata',
        'library-delete-track',
        // Playlist management
        'playlist-create',
        'playlist-get-all',
        'playlist-get',
        'playlist-update',
        'playlist-delete',
        'playlist-add-tracks',
        'playlist-remove-tracks',
        'playlist-get-tracks',
        'playlist-reorder-tracks',
        'playlist-export-m3u',
        'playlist-import-m3u',
        'playlist-get-for-sync',
        // Doppler sync management
        'doppler-get-sync-status',
        'doppler-start-sync',
        'doppler-get-statistics',
        'doppler-refresh-database',
        'doppler-get-transferred-files',
      'doppler-preindex-device',
      // Doppler WebSocket pairing & sync
      'doppler-pair-start',
      'doppler-pair-wait',
      'doppler-pair-confirm',
      'doppler-pair-cancel',
      'doppler-get-device',
      'doppler-forget-device',
      'doppler-sync-websocket',
      // USB sync
      'usb-sync-start',
      'usb-sync-rescan',
      'usb-sync-get-status',
      'usb-sync-get-unsynced-tracks',
      // Artist images
      'save-artist-image',
      'load-artist-image-cache',
      // Songs persistence
      'songs-get-all-metadata',
      'songs-toggle-favorite',
      'songs-set-rating',
      'songs-get-favorites',
      'songs-get-recently-played',
      'songs-get-top-played',
      'audio-track-ended-notify',
      'songs-update-metadata',
      'show-in-finder',
      'get-file-info'
    ];
    
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Invalid IPC channel: ${channel}`);
  },
  
  // IPC send methods (fire and forget)
  send: (channel, ...args) => {
    const validChannels = [
      'app-quit',
      'minimize-window',
      'maximize-window',
      'show-about-dialog'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      throw new Error(`Invalid IPC channel: ${channel}`);
    }
  },
  
  // IPC listeners (receive messages from main process)
  on: (channel, callback) => {
    const validChannels = [
      'phone-connected',
      'phone-disconnected',
      'file-added',
      'file-changed',
      'file-deleted',
      'scan-started',
      'scan-completed',
      'scan-error',
      'scan-progress',
      'transfer-started',
      'transfer-progress',
      'transfer-completed',
      'transfer-error',
      'log',
      'settings-updated',
      'library-changed',
      // Audio player events
      'audio-state-changed',
      'audio-track-loaded',
      'audio-play',
      'audio-pause',
      'audio-stop',
      'audio-position-changed',
      'audio-volume-changed',
      'audio-queue-changed',
      'audio-track-ended',
      'audio-error',
      'audio-shuffle-changed',
      'audio-repeat-changed',
      'library-scan-progress',
      'media-key-press',
      // Doppler sync events
      'doppler-sync-started',
      'doppler-sync-completed',
      'doppler-sync-error',
      'doppler-transfer-progress',
      'doppler-file-transferred',
      'doppler-transfer-error',
      'doppler-orphan-cleaned',
      // Doppler WebSocket sync events
      'doppler-ws-sync-started',
      'doppler-ws-sync-status',
      'doppler-ws-file-progress',
      'doppler-ws-file-completed',
      'doppler-ws-file-failed',
      'doppler-ws-sync-completed',
      'doppler-ws-sync-error',
      // USB sync events
      'usb-device-scanned',
      'usb-sync-started',
      'usb-sync-progress',
      'usb-sync-completed',
      'usb-sync-failed',
      'device-scan-progress'
    ];
    
    if (validChannels.includes(channel)) {
      // Strip event as it includes sender information
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    } else {
      throw new Error(`Invalid IPC channel: ${channel}`);
    }
  },
  
  // Remove listeners
  removeListener: (channel, callback) => {
    const validChannels = [
      'phone-connected',
      'phone-disconnected', 
      'file-added',
      'file-changed',
      'file-deleted',
      'scan-started',
      'scan-completed',
      'scan-error',
      'scan-progress',
      'transfer-started',
      'transfer-progress',
      'transfer-completed',
      'transfer-error',
      'log',
      'settings-updated',
      'library-changed',
      // Audio player events
      'audio-state-changed',
      'audio-track-loaded',
      'audio-play',
      'audio-pause',
      'audio-stop',
      'audio-position-changed',
      'audio-volume-changed',
      'audio-queue-changed',
      'audio-track-ended',
      'audio-error',
      'audio-shuffle-changed',
      'audio-repeat-changed',
      'library-scan-progress',
      // Doppler sync events
      'doppler-sync-started',
      'doppler-sync-completed',
      'doppler-sync-error',
      'doppler-transfer-progress',
      'doppler-file-transferred',
      'doppler-transfer-error',
      'doppler-orphan-cleaned',
      // Doppler WebSocket sync events
      'doppler-ws-sync-started',
      'doppler-ws-sync-status',
      'doppler-ws-file-progress',
      'doppler-ws-file-completed',
      'doppler-ws-file-failed',
      'doppler-ws-sync-completed',
      'doppler-ws-sync-error',
      // USB sync events
      'usb-device-scanned',
      'usb-sync-started',
      'usb-sync-progress',
      'usb-sync-completed',
      'usb-sync-failed',
      'device-scan-progress'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
  
  // Utility methods
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: (name) => ipcRenderer.invoke('get-app-path', name),
  showErrorDialog: (title, message) => ipcRenderer.invoke('show-error-dialog', title, message),
  showInfoDialog: (title, message) => ipcRenderer.invoke('show-info-dialog', title, message),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
  
  // File system operations (limited and secure)
  readFileStats: (filePath) => ipcRenderer.invoke('read-file-stats', filePath),
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  
  // Database operations
  getDatabaseStats: () => ipcRenderer.invoke('get-database-stats'),
  clearTransferHistory: () => ipcRenderer.invoke('clear-transfer-history'),
  exportData: (type) => ipcRenderer.invoke('export-data', type),
  importData: (filePath, type) => ipcRenderer.invoke('import-data', filePath, type)
});

// Expose some Node.js APIs in a controlled way
contextBridge.exposeInMainWorld('nodeAPI', {
  platform: process.platform,
  arch: process.arch,
  versions: process.versions
});

// Add security logging
contextBridge.exposeInMainWorld('security', {
  log: (message) => {
    console.log(`[SECURITY] ${new Date().toISOString()}: ${message}`);
  }
});

// Prevent the renderer process from accessing Node.js APIs directly
delete window.require;
delete window.exports;
delete window.module;

// Log successful preload initialization
console.log('[PRELOAD] Context bridge established successfully');