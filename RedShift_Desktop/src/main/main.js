// src/main/main.js - Electron Main Process
const { app, BrowserWindow, ipcMain, dialog, shell, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const chokidar = require('chokidar');
const { execSync, spawn } = require('child_process');
const mm = require('music-metadata');
const Jimp = require('jimp');
const { EventEmitter } = require('events');

// Services
const SyncService = require('./services/SyncService');
const DopplerSyncService = require('./services/DopplerSyncService');
const DeviceMonitorService = require('./services/DeviceMonitorService');
const AudioPlayerService = require('./services/AudioPlayerService');
const MusicLibraryCache = require('./services/MusicLibraryCache');
const PlaylistService = require('./services/PlaylistService');
const WindowManager = require('./services/WindowManager');
const MediaKeysService = require('./services/MediaKeysService');
const RedShiftUSBSyncService = require('./services/RedShiftUSBSyncService');
const { registerAllIpc, attachEventForwarders } = require('./services/ipc');
const { initializeDatabase } = require('./services/Database');
const FileWatcher = require('./services/FileWatcher');
const AppSettingsService = require('./services/AppSettingsService');

// Platform-specific imports
let applescript;
try {
  applescript = require('applescript');
} catch (error) {
  console.log('AppleScript not available on this platform');
}

class RedshiftSyncManager extends EventEmitter {
  constructor() {
    super();
    this.mainWindow = null;
    this.db = null;
    this.watcher = null;
    this.syncService = null;
    this.dopplerSyncService = null;
    this.deviceMonitorService = null;
    this.audioPlayerService = null;
    this.musicLibraryCache = null;
    this.playlistService = null;
    this.mediaKeysService = null;
    this.redshiftUSBSyncService = null;
    this.ipcHandlersSetup = false;
    
    // Paths
    this.appDataPath = path.join(app.getPath('userData'), 'Redshift');
    this.dbPath = path.join(this.appDataPath, 'sync_database.db');
    this.settingsPath = path.join(this.appDataPath, 'settings.json'); // legacy path (kept for continuity)
    
    // Default music library paths by platform
    const defaultMusicPaths = {
      darwin: app.getPath('music'),           // macOS - Use Electron's music path
      win32: app.getPath('music'),            // Windows
      linux: path.join(app.getPath('home'), 'Music')  // Linux fallback
    };
    
    this.defaultMasterLibraryPath = defaultMusicPaths[process.platform] || defaultMusicPaths.linux;
    this.masterLibraryPath = this.defaultMasterLibraryPath; // Will be updated from settings
    
    // Audio file extensions
    this.audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4p', '.ogg', '.opus'];
    
    // Audio player state
    this.currentTrack = null;
    this.isPlaying = false;
    this.volume = 1.0;
    this.position = 0;
    this.queue = [];
    this.queueIndex = 0;
    
    this.initPromise = this.initializeApp();
  }
  
  async initializeApp() {
    // Create app data directory
    await fs.ensureDir(this.appDataPath);
    
    // Load settings via AppSettingsService
    const defaultSettings = {
      masterLibraryPath: this.defaultMasterLibraryPath,
      musicLibraryPath: null,
      defaultTransferMethod: 'direct_libimobile',
      theme: 'dark',
      volume: 1.0,
      shuffleMode: false,
      repeatMode: 'none',
      lastWindowSize: { width: 1200, height: 800 },
      windowBounds: { width: 1200, height: 800 },
      isMaximized: false
    };
    this.settingsService = new AppSettingsService(app);
    this.settings = await this.settingsService.load(defaultSettings);
    // Update instance vars from settings
    this.masterLibraryPath = this.settings.masterLibraryPath;
    this.volume = this.settings.volume;
    
    // Ensure music library directory exists
    await fs.ensureDir(this.masterLibraryPath);
    
    // Initialize database (must complete before services are created)
    await this.initializeDatabase();
    
    // Initialize services
    await this.initializeServices();
    // IPC registration occurs in createWindow to guarantee availability before renderer executes
    // Mark init as complete
    this._initialized = true;
    
    // Start file system watcher
    this.fileWatcher = new FileWatcher(this);
    this.fileWatcher.start(this.masterLibraryPath);
  }
  
  async initializeDatabase() {
    this.db = await initializeDatabase(this.dbPath);
  }
  
  async initializeServices() {
    // Initialize sync service with database, settings, and event emitter
    this.syncService = new SyncService(this.db, this.settings, this);
    
    // Initialize device monitoring service
    this.deviceMonitorService = new DeviceMonitorService(this);
    
    // Initialize audio player service
    this.audioPlayerService = new AudioPlayerService(this, this.settings);
    
    // Initialize music library cache
    this.musicLibraryCache = new MusicLibraryCache(this.appDataPath, this.audioPlayerService);
    await this.musicLibraryCache.initialize();
    
    // Initialize Doppler sync service (enhanced sync management)
    const mockDatabaseService = {
      query: (...args) => new Promise((resolve, reject) => {
        this.db.all(...args, (err, rows) => err ? reject(err) : resolve(rows));
      }),
      run: (...args) => new Promise((resolve, reject) => {
        this.db.run(...args, function(err) {
          err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes });
        });
      }),
      get: (...args) => new Promise((resolve, reject) => {
        this.db.get(...args, (err, row) => err ? reject(err) : resolve(row));
      })
    };
    
    const mockSettingsService = {
      get: (key) => key ? this.settings[key] : this.settings
    };
    
    this.dopplerSyncService = new DopplerSyncService(mockDatabaseService, mockSettingsService, this.musicLibraryCache);
    
    // Initialize playlist service
    this.playlistService = new PlaylistService(this.db, this.settings, this);
    
    // Initialize media keys service
    this.mediaKeysService = new MediaKeysService(this);
    
    // Initialize USB sync service
    this.redshiftUSBSyncService = new RedShiftUSBSyncService(this.db, this.musicLibraryCache, this.deviceMonitorService, this.playlistService);
    
    // Set up event listeners for services via consolidated bridge
    attachEventForwarders(this);
    
    // Start device monitoring
    this.deviceMonitorService.startMonitoring();
  }
  
  // setup*Events were consolidated into AppBridge.attachEventForwarders
  
  async loadSettings() { /* replaced by AppSettingsService in initializeApp */ }
  
  async saveSettings(patch = null) {
    try {
      if (patch) Object.assign(this.settings, patch);
      await this.settingsService.save();
      console.log('[Settings] Saved:', JSON.stringify({
        windowBounds: this.settings.windowBounds,
        isMaximized: this.settings.isMaximized
      }));
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  }
  
  async updateSetting(key, value) {
    this.settings[key] = value;
    
    // Update instance variables for critical settings
    if (key === 'masterLibraryPath') {
      this.masterLibraryPath = value;
      await fs.ensureDir(this.masterLibraryPath);
      this.startFileWatcher(); // Restart watcher with new path
    } else if (key === 'volume') {
      this.volume = value;
    }
    
    await this.saveSettings();
    
    // Notify renderer of setting change
    this.sendToRenderer('setting-updated', { key, value });
  }

  async chooseDirectory(settingKey = 'masterLibraryPath') {
    const result = await dialog.showOpenDialog(this.mainWindow, {
      properties: ['openDirectory'],
      title: settingKey === 'musicLibraryPath' ? 'Select Music Library Directory' : 'Select Master Library Directory'
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      await this.updateSetting(settingKey, selectedPath);
      return selectedPath;
    }
    return null;
  }
  
  startFileWatcher() { this.fileWatcher?.start(this.masterLibraryPath); }
  
  // File event handlers moved into FileWatcher service
  
  
  // Sync methods now delegated to SyncService
  async scanMasterLibrary() {
    return await this.syncService.scanMasterLibrary();
  }
  
  async scanMusicLibrary() {
    console.log('🎵 Starting smart music library scan...');
    
    // Use musicLibraryPath if set, fallback to masterLibraryPath
    const musicPath = this.settings.musicLibraryPath || this.settings.masterLibraryPath;
    
    if (!musicPath) {
      const errorMsg = 'No music library path configured. Please set a music library path in Settings.';
      console.error('🎵', errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('🎵 Music library path:', musicPath);
    
    // Auto-set musicLibraryPath to masterLibraryPath if not already set
    if (!this.settings.musicLibraryPath && this.settings.masterLibraryPath) {
      console.log('🎵 Auto-setting music library path to master library path');
      await this.updateSetting('musicLibraryPath', this.settings.masterLibraryPath);
    }
    
    // Use smart caching to only process new/changed files
    try {
      const filesWithMetadata = await this.musicLibraryCache.scanMusicLibrary(musicPath);
      console.log(`🎵 Smart scan complete: ${filesWithMetadata.length} total files`);
      return filesWithMetadata;
    } catch (error) {
      console.error('🎵 Smart scan failed:', error);
      throw error;
    }
  }
  
  async transferFiles(files, method) {
    return await this.syncService.transferFiles(files, method);
  }
  
  async getTransferHistory() {
    return await this.syncService.getTransferHistory();
  }
  
  
  sendToRenderer(channel, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // Skip logging for high-frequency events to reduce noise
      if (channel !== 'audio-position-changed') {
        console.log(`📤 Sending to renderer: ${channel}`, data);
      }
      this.mainWindow.webContents.send(channel, data);
    } else {
      // Skip warning for position updates when window is closed (expected behavior)
      if (channel !== 'audio-position-changed') {
        console.warn(`⚠️  Cannot send ${channel} - window not ready or destroyed`);
      }
    }
  }
  
  createWindow() {
    // Delegate to WindowManager
    if (!this.windowManager) {
      this.windowManager = new WindowManager(this.settings, (patch) => this.saveSettings(patch));
    } else {
      this.windowManager.settings = this.settings; // keep in sync
    }
    
    // Use app logo for window icon (works in dev mode)
    const iconPath = path.join(__dirname, '../../Assets/Redshift Logo - 1024.png');
    
    this.mainWindow = this.windowManager.createMainWindow({
      indexPath: path.join(__dirname, '../renderer/index.built.html'),
      preloadPath: path.join(__dirname, 'preload.js'),
      iconPath: iconPath,
      minWidth: 800,
      minHeight: 600,
      titleBarStyle: 'hiddenInset',
      showOnReady: true
    });
    
    // Stop audio position tracking when window closes to prevent sending updates to destroyed window
    this.mainWindow.on('close', () => {
      if (this.audioPlayerService) {
        this.audioPlayerService.stopPositionTracking();
      }
    });
    
    // Ensure IPC handlers are registered before renderer loads/preload invokes
    if (!this.ipcHandlersSetup) {
      registerAllIpc(ipcMain, this);
      this.ipcHandlersSetup = true;
    }
    
    // When renderer is ready, refresh device status if device is connected
    this.mainWindow.webContents.on('did-finish-load', () => {
      if (this.redshiftUSBSyncService) {
        // Small delay to ensure renderer listeners are set up
        setTimeout(() => {
          this.redshiftUSBSyncService.refreshDeviceStatus();
        }, 100);
      }
    });
  }
  
  setupIPCHandlers() { /* replaced by AppBridge.registerIpc */ }
}

// App lifecycle
const syncManager = new RedshiftSyncManager();

app.whenReady().then(async () => {
  // Set dock icon on macOS (works in dev mode too)
  if (process.platform === 'darwin') {
    try {
      const iconPath = path.join(__dirname, '../../Assets/Redshift Logo - 1024.png');
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        app.dock.setIcon(icon);
      }
    } catch (err) {
      console.log('Could not set dock icon:', err.message);
    }
  }
  
  // Ensure settings are loaded before window creation
  if (syncManager.initPromise) {
    try { await syncManager.initPromise; } catch (_) {}
  }
  syncManager.createWindow();
  
  // Register media keys
  if (syncManager.mediaKeysService) {
    syncManager.mediaKeysService.register();
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      syncManager.createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (syncManager.mediaKeysService) {
    syncManager.mediaKeysService.unregister();
  }
  if (syncManager.fileWatcher) {
    syncManager.fileWatcher.stop();
  }
  if (syncManager.deviceMonitorService) {
    syncManager.deviceMonitorService.stopMonitoring();
  }
  if (syncManager.audioPlayerService) {
    syncManager.audioPlayerService.cleanup();
  }
  if (syncManager.musicLibraryCache) {
    syncManager.musicLibraryCache.close();
  }
  if (syncManager.db) {
    syncManager.db.close();
  }
});