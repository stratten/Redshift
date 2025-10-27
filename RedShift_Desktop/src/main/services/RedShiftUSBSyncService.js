// RedShiftUSBSyncService.js - Main USB sync orchestrator
const { EventEmitter } = require('events');
const path = require('path');

// Import modular components
const DeviceConnectionHelper = require('./usb-sync/DeviceConnectionHelper');
const DeviceScanManager = require('./usb-sync/DeviceScanManager');
const MusicSyncManager = require('./usb-sync/MusicSyncManager');
const ArtistImageSyncManager = require('./usb-sync/ArtistImageSyncManager');
const PlaylistSyncManager = require('./usb-sync/PlaylistSyncManager');
const PlayCountSyncManager = require('./usb-sync/PlayCountSyncManager');
const DeviceMusicImporter = require('./usb-sync/DeviceMusicImporter');

/**
 * Main USB sync service - orchestrates all USB sync operations
 * Delegates to specialized modules for specific tasks
 */
class RedShiftUSBSyncService extends EventEmitter {
  constructor(database, musicLibraryCache, deviceMonitorService, playlistService = null) {
    super();
    this.db = database;
    this.musicLibraryCache = musicLibraryCache;
    this.deviceMonitorService = deviceMonitorService;
    this.playlistService = playlistService;
    
    this.mountPoint = '/tmp/redshift_iphone';
    this.isMounted = false;
    this.isSyncing = false;
    
    // Initialize modular components
    this.connectionHelper = new DeviceConnectionHelper(deviceMonitorService);
    this.scanManager = new DeviceScanManager(deviceMonitorService, musicLibraryCache, this);
    this.musicSync = new MusicSyncManager(musicLibraryCache);
    this.artistImageSync = new ArtistImageSyncManager(deviceMonitorService);
    this.playlistSync = new PlaylistSyncManager(
      deviceMonitorService, 
      playlistService,
      this.getConnectedDeviceByDeviceId.bind(this)
    );
    this.playCountSync = new PlayCountSyncManager(
      database,
      this.getConnectedDeviceByDeviceId.bind(this)
    );
    this.deviceImporter = new DeviceMusicImporter(deviceMonitorService, musicLibraryCache, this);
    
    // Listen for device connection events
    if (this.deviceMonitorService && this.deviceMonitorService.eventEmitter) {
      this.deviceMonitorService.eventEmitter.on('phone-connected', (deviceInfo) => {
        // Use productId as unique device identifier (it's unique per USB interface)
        // Scan this specific device when it connects
        if (deviceInfo && deviceInfo.productId) {
          const deviceId = String(deviceInfo.productId);
          this.scanManager.scanSpecificDevice(deviceId, deviceInfo);
        } else {
          // Fallback: scan all connected devices
          this.scanManager.scanAllDevices();
        }
      });
    }
    
    console.log('📱 RedShiftUSBSyncService initialized');
  }

  // ============================================================================
  // DELEGATION METHODS - Device Connection
  // ============================================================================

  /**
   * Check if iOS device is connected
   */
  isDeviceConnected() {
    return this.connectionHelper.isDeviceConnected();
  }

  /**
   * Get the name of the connected device
   */
  getConnectedDeviceName() {
    return this.connectionHelper.getConnectedDeviceName();
  }

  /**
   * Get the first connected device's info (id, name, etc.)
   */
  getConnectedDeviceInfo() {
    return this.connectionHelper.getConnectedDeviceInfo();
  }

  /**
   * Get device by device ID from connected devices
   */
  getConnectedDeviceByDeviceId(deviceId) {
    return this.connectionHelper.getConnectedDeviceByDeviceId(deviceId);
  }

  /**
   * Get current device scan status (for refreshing UI)
   */
  getDeviceStatus() {
    return this.connectionHelper.getDeviceStatus(this.scanManager.getLegacyDeviceFiles());
  }

  // ============================================================================
  // DELEGATION METHODS - Device Scanning
  // ============================================================================

  /**
   * Re-emit device scan status (useful for UI refresh after window loads)
   */
  async refreshDeviceStatus() {
    return this.scanManager.refreshDeviceStatus();
  }

  /**
   * Scan all connected devices
   */
  async scanAllDevices() {
    return this.scanManager.scanAllDevices();
  }

  /**
   * Scan a specific device by its product ID
   */
  async scanSpecificDevice(deviceId, deviceInfo) {
    return this.scanManager.scanSpecificDevice(deviceId, deviceInfo);
  }

  /**
   * Scan device files (legacy method - scans first device only)
   */
  async scanDeviceFiles() {
    return this.scanManager.scanDeviceFiles(this.getConnectedDeviceInfo.bind(this));
  }

  // ============================================================================
  // DELEGATION METHODS - Music Sync
  // ============================================================================

  /**
   * Get list of tracks that need to be synced
   */
  async getUnsyncedTracks() {
    const deviceFiles = this.scanManager.getLegacyDeviceFiles();
    return this.musicSync.getUnsyncedTracks(deviceFiles);
  }

  // ============================================================================
  // DELEGATION METHODS - Device Music Import
  // ============================================================================

  /**
   * Scan device's general music library (not just RedShift app)
   */
  async scanDeviceMusicLibrary(deviceId) {
    return this.deviceImporter.scanDeviceMusicLibrary(deviceId);
  }

  /**
   * Import/pull music files from device's general music library to desktop
   */
  async importFromDevice(deviceId, libraryPath) {
    return this.deviceImporter.importFromDevice(deviceId, libraryPath);
  }

  // ============================================================================
  // MAIN SYNC ORCHESTRATION
  // ============================================================================

  /**
   * Main sync function - orchestrates all sync operations
   * @param {string} deviceId - The device ID (productId)
   */
  async sync(deviceId) {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    
    // Pause device monitoring during sync to avoid false disconnects
    this.deviceMonitorService.pauseForSync();
    
    this.emit('sync-started', { deviceId });

    try {
      // Check device connection
      const isConnected = this.isDeviceConnected();
      if (!isConnected) {
        throw new Error('No iOS device connected');
      }

      // Get all tracks from local library
      const tracks = await this.musicLibraryCache.getAllMetadata();
      console.log(`🎵 Found ${tracks.length} tracks in local library`);
      
      // Use device-specific cached files
      console.log(`🔍 Looking for device files for deviceId: ${deviceId} (type: ${typeof deviceId})`);
      console.log(`🔍 Available device IDs in cache:`, Array.from(this.scanManager.deviceFilesMap.keys()));
      const deviceFiles = this.scanManager.getDeviceFiles(deviceId);
      if (!deviceFiles) {
        throw new Error(`No device scan found for device ${deviceId}. Please rescan the device.`);
      }
      console.log(`📱 Using cached device scan for ${deviceId}: ${deviceFiles.size} files on device (0 is valid for fresh install)`);
      
      // Get device UDID for pymobiledevice3 commands
      const device = this.getConnectedDeviceByDeviceId(deviceId);
      if (!device || !device.udid) {
        throw new Error(`Device ${deviceId} not found or UDID not available`);
      }
      
      // Filter to only tracks that need syncing
      const tracksToSync = this.musicSync.filterTracksToSync(tracks, deviceFiles);
      
      const totalTracks = tracksToSync.length;
      const alreadyOnDevice = tracks.length - totalTracks;
      
      console.log(`📊 Sync plan: ${totalTracks} to sync, ${alreadyOnDevice} already on device`);
      
      // Emit initial count
      this.emit('sync-progress', {
        deviceId,
        current: 0,
        total: totalTracks,
        fileName: '',
        status: 'starting',
        alreadyOnDevice
      });

      // Sync music files
      const musicResults = await this.musicSync.syncMusicFiles(device.udid, tracksToSync, (progress) => {
        this.emit('sync-progress', {
          deviceId,
          ...progress
        });
      });

      console.log(`✅ Music sync complete: ${musicResults.transferred} transferred, ${musicResults.skipped} skipped, ${musicResults.failed} failed`);
      
      // Now sync artist images
      console.log('🎨 Initiating artist image sync...');
      try {
        await this.artistImageSync.syncArtistImages(deviceId);
        console.log('🎨 Artist image sync completed successfully');
      } catch (imageError) {
        console.error('⚠️  Artist image sync failed (non-fatal):', imageError);
        console.error('Stack trace:', imageError.stack);
        // Don't fail the entire sync if images fail
      }
      
      // Now sync playlists (bi-directional)
      console.log('📋 Initiating bi-directional playlist sync...');
      try {
        // Step 1: Pull playlists from device
        await this.playlistSync.pullPlaylistsFromDevice(deviceId);
        
        // Step 2: Merge with local playlists (last modified wins)
        await this.playlistSync.mergePlaylistsWithConflictResolution();
        
        // Step 3: Push merged playlists back to device
        await this.playlistSync.syncPlaylists(deviceId);
        
        console.log('📋 Bi-directional playlist sync completed successfully');
      } catch (playlistError) {
        console.error('⚠️  Playlist sync failed (non-fatal):', playlistError);
        console.error('Stack trace:', playlistError.stack);
        // Don't fail the entire sync if playlists fail
      }
      
      // Now sync track metadata (bi-directional: play counts, favorites, ratings)
      console.log('📊 Initiating bi-directional track metadata sync...');
      try {
        // Step 1: Pull metadata from device (includes play counts, favorites, ratings)
        await this.playCountSync.pullPlayCountsFromDevice(deviceId);
        
        // Step 2: Merge metadata (add play counts, OR favorites, max ratings)
        await this.playCountSync.mergePlayCounts();
        
        // Step 3: Push desktop metadata to device
        await this.playCountSync.pushMetadataToDevice(device.udid);
        
        console.log('📊 Bi-directional track metadata sync completed successfully');
      } catch (metadataError) {
        console.error('⚠️  Track metadata sync failed (non-fatal):', metadataError);
        console.error('Stack trace:', metadataError.stack);
        // Don't fail the entire sync if metadata sync fails
      }
      
      this.emit('sync-completed', { 
        deviceId, 
        transferred: musicResults.transferred, 
        failed: musicResults.failed, 
        skipped: musicResults.skipped, 
        total: totalTracks 
      });

    } catch (error) {
      console.error('❌ Sync failed:', error);
      this.emit('sync-failed', error);
      throw error;
      
    } finally {
      // Resume device monitoring
      this.deviceMonitorService.resumeAfterSync();
      this.isSyncing = false;
    }
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isSyncing: this.isSyncing,
      isMounted: this.isMounted,
      mountPoint: this.mountPoint
    };
  }
}

module.exports = RedShiftUSBSyncService;
