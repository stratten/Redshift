// RedShiftUSBSyncService.js - USB file sync with RedShift Mobile
const { EventEmitter } = require('events');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const path = require('path');

/**
 * Handles USB sync with RedShift Mobile app
 * Uses ifuse to mount device and copy files directly
 */
class RedShiftUSBSyncService extends EventEmitter {
  constructor(database, musicLibraryCache, deviceMonitorService) {
    super();
    this.db = database;
    this.musicLibraryCache = musicLibraryCache;
    this.deviceMonitorService = deviceMonitorService;
    
    this.mountPoint = '/tmp/redshift_iphone';
    
    // Cache for device scan results (to avoid rescanning for import)
    this.deviceScanCache = new Map(); // deviceId -> { timestamp, scanResult }
    this.isMounted = false;
    this.isSyncing = false;
    this.deviceFiles = new Map(); // Cache of files on device (legacy - for single device)
    this.deviceFilesMap = new Map(); // Map of deviceId -> Map of files (for multi-device)
    this.lastScannedDevices = new Map(); // Track last scan results to prevent duplicate emissions
    
      // Listen for device connection events
      if (this.deviceMonitorService && this.deviceMonitorService.eventEmitter) {
        this.deviceMonitorService.eventEmitter.on('phone-connected', (deviceInfo) => {
          // Use productId as unique device identifier (it's unique per USB interface)
          // Scan this specific device when it connects
          if (deviceInfo && deviceInfo.productId) {
            const deviceId = String(deviceInfo.productId);
            this.scanSpecificDevice(deviceId, deviceInfo);
          } else {
            // Fallback: scan all connected devices
            this.scanAllDevices();
          }
        });
      }
    
    console.log('📱 RedShiftUSBSyncService initialized');
  }

  /**
   * Check if iOS device is connected (uses existing DeviceMonitorService)
   */
  isDeviceConnected() {
    const status = this.deviceMonitorService.getStatus();
    return status.hasIOSDevice;
  }

  /**
   * Get the name of the connected device
   */
  getConnectedDeviceName() {
    const status = this.deviceMonitorService.getStatus();
    if (status.hasIOSDevice && status.connectedDevices && status.connectedDevices.length > 0) {
      const device = status.connectedDevices[0];
      return device.deviceName || device.deviceType || 'iOS Device';
    }
    return 'iOS Device';
  }

  /**
   * Get the first connected device's info (id, name, etc.)
   * Creates a unique device ID from productId if not present
   */
  getConnectedDeviceInfo() {
    const status = this.deviceMonitorService.getStatus();
    if (status.hasIOSDevice && status.connectedDevices && status.connectedDevices.length > 0) {
      const device = status.connectedDevices[0];
      
      // Create a unique device ID from productId (which identifies the device model/type)
      // This ensures different device types get different IDs
      const deviceId = device.deviceId || device.productId || 'unknown';
      
      return {
        deviceId: String(deviceId),
        deviceName: device.deviceName || device.deviceType || 'iOS Device',
        deviceType: device.deviceType || 'iOS Device',
        deviceModel: device.deviceModel || ''
      };
    }
    return {
      deviceId: 'unknown',
      deviceName: 'iOS Device',
      deviceType: 'iOS Device',
      deviceModel: ''
    };
  }

  /**
   * Get current device scan status (for refreshing UI)
   */
  getDeviceStatus() {
    return {
      isConnected: this.isDeviceConnected(),
      filesOnDevice: this.deviceFiles.size
    };
  }

  /**
   * Re-emit device scan status (useful for UI refresh after window loads)
   * Note: This should only re-emit if we actually have scan results cached
   */
  async refreshDeviceStatus() {
    console.log(`🔄 refreshDeviceStatus called`);
    // Scan all connected devices
    if (!this.isDeviceConnected()) {
      console.log('⚠️  No device connected, skipping refresh');
      return;
    }
    
    console.log('🔄 Rescanning all connected devices...');
    await this.scanAllDevices();
  }

  /**
   * Get list of tracks that need to be synced
   */
  async getUnsyncedTracks() {
    try {
      // Get all tracks from the library
      const allTracks = await this.musicLibraryCache.getAllMetadata();
      
      // Filter to only tracks not on the device
      const unsyncedTracks = allTracks.filter(track => {
        const fileName = path.basename(track.path);
        const deviceFile = this.deviceFiles.get(fileName);
        
        // Track is unsynced if it's not on device or file size doesn't match
        if (!deviceFile) return true;
        
        // Check file size match
        const fs = require('fs');
        try {
          const stats = fs.statSync(track.path);
          return stats.size !== deviceFile.size;
        } catch {
          return true; // If we can't stat the file, include it
        }
      });
      
      // Return tracks with useful metadata for display
      return unsyncedTracks.map(track => ({
        name: path.basename(track.path),
        path: track.path,
        title: track.title || path.basename(track.path),
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Unknown Album',
        size: track.size || 0
      }));
      
    } catch (error) {
      console.error('Failed to get unsynced tracks:', error);
      return [];
    }
  }

  /**
   * Scan all connected devices
   */
  async scanAllDevices() {
    const status = this.deviceMonitorService.getStatus();
    if (!status.hasIOSDevice || !status.connectedDevices || status.connectedDevices.length === 0) {
      console.log('📱 No devices to scan');
      return;
    }
    
    console.log(`📱 Scanning ${status.connectedDevices.length} connected device(s)...`);
    
    // Scan each device SEQUENTIALLY (not in parallel) to avoid race conditions
    // where pymobiledevice3 might query the same device for both productIds
    // Use productId as unique identifier (it's unique per USB interface)
    for (const device of status.connectedDevices) {
      const deviceId = String(device.productId || 'unknown');
      await this.scanSpecificDevice(deviceId, device);
    }
  }

  /**
   * Scan a specific device by its product ID
   */
  async scanSpecificDevice(deviceId, deviceInfo) {
    try {
      console.log(`🔍 Scanning device ${deviceId} (${deviceInfo.deviceName || 'iOS Device'})...`);
      
      const scriptPath = path.join(__dirname, '../../../scripts/list-device-files.py');
      const pythonPath = path.join(__dirname, '../../../resources/python/python/bin/python3');
      
      // Pass UDID to Python script to query specific device (if available)
      // UDID is needed by pymobiledevice3 to target the right device
      // But we use productId as the card identifier since multiple productIds can have same UDID
      const udid = deviceInfo.udid || '';
      const command = udid 
        ? `"${pythonPath}" "${scriptPath}" "${udid}"`
        : `"${pythonPath}" "${scriptPath}"`;
      
      console.log(`  📱 Querying productId ${deviceId} via${udid ? ` UDID ${udid.substr(0, 8)}...` : ' default connection'}`);
      const { stdout } = await execAsync(command);
      const result = JSON.parse(stdout);
      
      // Check if the result is an error response
      if (result.error === 'APP_NOT_INSTALLED') {
        console.warn(`📱 RedShift Mobile app not found on device ${deviceId}`);
        this.deviceFilesMap.set(String(deviceId), new Map());
        
        const eventData = {
          deviceId: String(deviceId),
          deviceName: deviceInfo.deviceName || deviceInfo.deviceType || 'iOS Device',
          deviceType: deviceInfo.deviceType || 'iOS Device',
          deviceModel: deviceInfo.deviceModel || '',
          filesOnDevice: 0,
          totalTracks: 0,
          unsyncedTracks: 0,
          appInstalled: false
        };
        
        // Only emit if data has changed
        const lastScan = this.lastScannedDevices.get(String(deviceId));
        const dataChanged = !lastScan || 
          lastScan.appInstalled !== false ||
          lastScan.deviceName !== eventData.deviceName;
        
        if (dataChanged) {
          this.lastScannedDevices.set(String(deviceId), eventData);
          this.emit('device-scanned', eventData);
        }
        
        return new Map();
      }
      
      // Create a map of filename -> file info for this device
      const fileMap = new Map();
      if (Array.isArray(result)) {
        result.forEach(file => {
          fileMap.set(file.name, file);
        });
      }
      
      // Store this device's files
      this.deviceFilesMap.set(String(deviceId), fileMap);
      
      console.log(`📱 Found ${fileMap.size} files on device ${deviceId}`);
      
      // Get total library count
      const tracks = await this.musicLibraryCache.getAllMetadata();
      const totalTracks = tracks.length;
      const unsyncedTracks = totalTracks - fileMap.size;
      
      // Emit event with comprehensive stats for this specific device
      const eventData = { 
        deviceId: String(deviceId),
        deviceName: deviceInfo.deviceName || deviceInfo.deviceType || 'iOS Device',
        deviceType: deviceInfo.deviceType || 'iOS Device',
        deviceModel: deviceInfo.deviceModel || '',
        filesOnDevice: fileMap.size,
        totalTracks: totalTracks,
        unsyncedTracks: unsyncedTracks,
        appInstalled: true
      };
      
      // Only emit if data has changed (prevent duplicate/conflicting emissions)
      const lastScan = this.lastScannedDevices.get(String(deviceId));
      const dataChanged = !lastScan || 
        lastScan.filesOnDevice !== eventData.filesOnDevice ||
        lastScan.appInstalled !== eventData.appInstalled ||
        lastScan.deviceName !== eventData.deviceName;
      
      if (dataChanged) {
        console.log(`📡 Emitting device-scanned event for device ${deviceId}:`, eventData);
        this.lastScannedDevices.set(String(deviceId), eventData);
        this.emit('device-scanned', eventData);
      } else {
        console.log(`📡 Skipping duplicate device-scanned event for device ${deviceId}`);
      }
      
      return fileMap;
      
    } catch (error) {
      // Command failed - likely app not installed or other error
      console.warn(`⚠️  Could not scan device ${deviceId}:`, error.message);
      this.deviceFilesMap.set(String(deviceId), new Map());
      
      // Generic error - assume app not installed
      console.warn(`📱 RedShift Mobile app not found on device ${deviceId}`);
      
      const eventData = {
        deviceId: String(deviceId),
        deviceName: deviceInfo.deviceName || deviceInfo.deviceType || 'iOS Device',
        deviceType: deviceInfo.deviceType || 'iOS Device',
        deviceModel: deviceInfo.deviceModel || '',
        filesOnDevice: 0,
        totalTracks: 0,
        unsyncedTracks: 0,
        appInstalled: false
      };
      
      // Only emit if data has changed
      const lastScan = this.lastScannedDevices.get(String(deviceId));
      const dataChanged = !lastScan || 
        lastScan.appInstalled !== false ||
        lastScan.deviceName !== eventData.deviceName;
      
      if (dataChanged) {
        this.lastScannedDevices.set(String(deviceId), eventData);
        this.emit('device-scanned', eventData);
      }
      
      return new Map();
    }
  }

  /**
   * Scan device files (legacy method - scans first device only)
   * Kept for backward compatibility
   */
  async scanDeviceFiles() {
    try {
      console.log('🔍 Scanning device files...');
      const scriptPath = path.join(__dirname, '../../../scripts/list-device-files.py');
      const pythonPath = path.join(__dirname, '../../../resources/python/python/bin/python3');
      
      const { stdout } = await execAsync(`"${pythonPath}" "${scriptPath}"`);
      const result = JSON.parse(stdout);
      
      // Check if the result is an error response
      if (result.error === 'APP_NOT_INSTALLED') {
        console.warn('📱 RedShift Mobile app not found on this device');
        this.deviceFiles = new Map();
        
        // Get device info from deviceMonitorService
        const deviceInfo = this.getConnectedDeviceInfo();
        
        this.emit('device-scanned', {
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.deviceName,
          deviceType: deviceInfo.deviceType,
          deviceModel: deviceInfo.deviceModel,
          filesOnDevice: 0,
          totalTracks: 0,
          unsyncedTracks: 0,
          appInstalled: false
        });
        return this.deviceFiles;
      }
      
      // Create a map of filename -> file info for quick lookup
      const fileMap = new Map();
      if (Array.isArray(result)) {
        result.forEach(file => {
          fileMap.set(file.name, file);
        });
      }
      
      this.deviceFiles = fileMap;
      console.log(`📱 Found ${fileMap.size} files on device`);
      
      // Get total library count
      const tracks = await this.musicLibraryCache.getAllMetadata();
      const totalTracks = tracks.length;
      const unsyncedTracks = totalTracks - fileMap.size;
      
      // Get device info from deviceMonitorService
      const deviceInfo = this.getConnectedDeviceInfo();
      
      // Emit event with comprehensive stats (app is installed if we got here)
      const eventData = { 
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        deviceModel: deviceInfo.deviceModel,
        filesOnDevice: fileMap.size,
        totalTracks: totalTracks,
        unsyncedTracks: unsyncedTracks,
        appInstalled: true
      };
      console.log('📡 Emitting device-scanned event:', eventData);
      this.emit('device-scanned', eventData);
      
      return fileMap;
      
    } catch (error) {
      // Command failed - likely app not installed or other error
      console.warn('⚠️  Could not scan device files:', error.message);
      this.deviceFiles = new Map();
      
      // Try to parse error output
      try {
        const errorData = JSON.parse(error.stdout || '{}');
        if (errorData.error === 'APP_NOT_INSTALLED') {
          console.warn('📱 RedShift Mobile app not found on this device');
          const deviceInfo = this.getConnectedDeviceInfo();
          this.emit('device-scanned', {
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName,
            deviceType: deviceInfo.deviceType,
            deviceModel: deviceInfo.deviceModel,
            filesOnDevice: 0,
            totalTracks: 0,
            unsyncedTracks: 0,
            appInstalled: false
          });
          return this.deviceFiles;
        }
      } catch {}
      
      // Generic error - assume app not installed
      console.warn('📱 RedShift Mobile app not found on this device');
      const deviceInfo = this.getConnectedDeviceInfo();
      this.emit('device-scanned', {
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        deviceModel: deviceInfo.deviceModel,
        filesOnDevice: 0,
        totalTracks: 0,
        unsyncedTracks: 0,
        appInstalled: false
      });
      
      return this.deviceFiles;
    }
  }

  /**
   * Push file directly to iOS app using pymobiledevice3
   */
  async pushFileToDevice(localPath, destFileName) {
    try {
      const bundleId = 'com.redshiftplayer.mobile';
      const remotePath = `Documents/Music/${destFileName}`;
      const pythonPath = path.join(__dirname, '../../../resources/python/python/bin/python3');
      
      // Use bundled Python to run pymobiledevice3
      const cmd = `"${pythonPath}" -m pymobiledevice3 apps push "${bundleId}" "${localPath}" "${remotePath}"`;
      
      await execAsync(cmd);
      console.log(`✅ Pushed: ${destFileName}`);
      
    } catch (error) {
      throw new Error(`Failed to push ${destFileName}: ${error.message}`);
    }
  }

  /**
   * Main sync function - copy all music files and playlists to device
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
      const deviceFiles = this.deviceFilesMap.get(deviceId);
      if (!deviceFiles) {
        throw new Error(`No device files found for device ${deviceId}. Please rescan the device.`);
      }
      console.log(`📱 Using cached device scan for ${deviceId}: ${deviceFiles.size} files on device`);
      
      // Filter to only tracks that need syncing
      const tracksToSync = tracks.filter(track => {
        const fileName = path.basename(track.path);
        const onDevice = deviceFiles.get(fileName);
        
        if (!onDevice) {
          return true; // Not on device, needs sync
        }
        
        // Check if file size matches (simple check for same file)
        try {
          const localStat = fs.statSync(track.path);
          if (localStat.size !== onDevice.size) {
            return true; // Different size, needs sync
          }
        } catch {
          return true; // Can't stat local file, try to sync anyway
        }
        
        return false; // Already on device with same size
      });
      
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

      let transferred = 0;
      let failed = 0;
      let skipped = 0;

      // Push each file that needs syncing
      for (let i = 0; i < tracksToSync.length; i++) {
        const track = tracksToSync[i];
        const fileName = path.basename(track.path);

        try {
          if (!await fs.pathExists(track.path)) {
            console.warn(`⚠️  Source file not found: ${track.path}`);
            failed++;
            continue;
          }

          console.log(`📤 [${i + 1}/${totalTracks}] ${fileName}`);
          await this.pushFileToDevice(track.path, fileName);
          transferred++;

          this.emit('sync-progress', {
            deviceId,
            current: i + 1,
            total: totalTracks,
            fileName,
            status: 'copied',
            transferred,
            failed
          });

        } catch (error) {
          // Check if file already exists (not an error, just skip)
          if (error.message && error.message.includes('already exists')) {
            skipped++;
            console.log(`⏭️  Already on device: ${fileName}`);
          } else {
            console.error(`❌ Failed: ${fileName} - ${error.message}`);
            failed++;
          }
          
          this.emit('sync-progress', {
            deviceId,
            current: i + 1,
            total: totalTracks,
            fileName,
            status: error.message.includes('already exists') ? 'skipped' : 'failed',
            transferred,
            failed,
            skipped
          });
        }
      }

      console.log(`✅ Sync complete: ${transferred} transferred, ${skipped} skipped, ${failed} failed`);
      this.emit('sync-completed', { deviceId, transferred, failed, skipped, total: totalTracks });

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
   * Scan device's general music library (not just RedShift app)
   * @param {string} deviceId - The device ID (productId)
   */
  async scanDeviceMusicLibrary(deviceId) {
    console.log(`🎵 Scanning device music library for ${deviceId}...`);
    
    try {
      // Get device info
      const devices = this.deviceMonitorService.getConnectedDevices();
      const device = Array.from(devices.values()).find(d => String(d.productId) === deviceId);
      
      if (!device || !device.udid) {
        throw new Error(`Device ${deviceId} not found or UDID not available`);
      }
      
      // Use Python script to list device music with metadata extraction
      const pythonPath = path.join(__dirname, '../../../resources/python/python/bin/python3');
      const scriptPath = path.join(__dirname, '../../../reference/list-device-music.py');
      
      console.log(`📱 Running metadata extraction for device ${device.udid}`);
      console.log(`⏳ This will take several minutes to extract metadata from all files...`);
      
      // Use spawn instead of exec to get real-time progress updates
      const result = await new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonPath, [scriptPath, device.udid]);
        
        let stdoutData = '';
        let stderrData = '';
        
        // Handle stdout (final result)
        pythonProcess.stdout.on('data', (data) => {
          stdoutData += data.toString();
        });
        
        // Handle stderr (progress updates)
        pythonProcess.stderr.on('data', (data) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              const progress = JSON.parse(line);
              if (progress.stage === 'metadata_extraction') {
                console.log(`📊 Extracting metadata from ${progress.total} files...`);
                this.emit('device-scan-progress', {
                  deviceId,
                  stage: 'starting',
                  total: progress.total,
                  message: `Extracting metadata from ${progress.total} files...`
                });
              } else if (progress.stage === 'extracting') {
                // Log sample track info if available
                if (progress.sample) {
                  console.log(`📊 Progress: ${progress.current}/${progress.total} (${progress.percent}%) - Sample: "${progress.sample.title}" by "${progress.sample.artist}"`);
                } else {
                  console.log(`📊 Progress: ${progress.current}/${progress.total} (${progress.percent}%)`);
                }
                
                this.emit('device-scan-progress', {
                  deviceId,
                  stage: 'extracting',
                  current: progress.current,
                  total: progress.total,
                  percent: progress.percent,
                  message: `Extracting metadata: ${progress.current}/${progress.total} (${progress.percent}%)`
                });
              }
            } catch (e) {
              // Not JSON, just log it
              console.log(`📱 ${line}`);
            }
          }
        });
        
        // Handle process completion
        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Python script exited with code ${code}`));
            return;
          }
          
          try {
            const result = JSON.parse(stdoutData.trim());
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse Python output: ${e.message}`));
          }
        });
        
        // Handle errors
        pythonProcess.on('error', (error) => {
          reject(error);
        });
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to scan device music library');
      }
      
      console.log(`🎵 Found ${result.total} music files on device`);
      console.log(`📊 ${result.with_metadata || 0} files have metadata extracted`);
      
      // Get local library tracks
      const localTracks = await this.musicLibraryCache.getAllMetadata();
      console.log(`📚 Local library has ${localTracks.length} tracks`);
      
      // Debug: Check structure of first local track
      if (localTracks.length > 0) {
        console.log(`📋 Sample local track structure:`, JSON.stringify(localTracks[0], null, 2).substring(0, 800));
      }
      
      // Create lookup structures for local tracks
      // 1. Artist + Title + Album (primary method - most reliable)
      const localTrackMetadata = new Set();
      const localTrackMetadataLoose = new Set(); // Without album for partial matches
      
      localTracks.forEach(t => {
        // The metadata_json is spread directly onto the track object
        // So it's t.common.artist, NOT t.metadata.common.artist
        const artist = (t.common?.artist || '').toLowerCase().trim();
        const title = (t.common?.title || '').toLowerCase().trim();
        const album = (t.common?.album || '').toLowerCase().trim();
        
        if (artist && title) {
          // Full metadata match
          if (album) {
            localTrackMetadata.add(`${artist}|||${title}|||${album}`);
          }
          // Also add without album for loose matching
          localTrackMetadataLoose.add(`${artist}|||${title}`);
        }
      });
      
      console.log(`🎵 Local tracks with full metadata: ${localTrackMetadata.size}`);
      console.log(`🎵 Local tracks with artist+title: ${localTrackMetadataLoose.size}`);
      
      // Debug: Show some local track metadata
      if (localTrackMetadata.size > 0) {
        const samples = Array.from(localTrackMetadata).slice(0, 3);
        console.log(`📋 Sample local metadata entries:`);
        samples.forEach(s => console.log(`  - ${s}`));
      }
      
      // 2. File size set (fallback for files without metadata)
      const localTrackSizes = new Set(localTracks.map(t => t.size));
      console.log(`📏 Local track sizes: ${localTrackSizes.size} unique sizes`);
      
      // Debug: Show some sample device files with metadata
      const sampleDevice = result.files.slice(0, 5);
      console.log(`📱 Sample device files:`);
      sampleDevice.forEach(f => {
        const meta = f.metadata;
        if (meta) {
          console.log(`  - ${f.name}: "${meta.title}" by "${meta.artist}" (${meta.album})`);
        } else {
          console.log(`  - ${f.name}: NO METADATA (${f.size} bytes)`);
        }
      });
      
      // Find files not in local library using metadata comparison
      let metadataMatches = 0;
      let looseMetadataMatches = 0;
      let sizeMatches = 0;
      let noMetadataCount = 0;
      
      const notInLibrary = result.files.filter(f => {
        // If device file has metadata, use it for comparison
        if (f.metadata && f.metadata.artist && f.metadata.title) {
          const artist = (f.metadata.artist || '').toLowerCase().trim();
          const title = (f.metadata.title || '').toLowerCase().trim();
          const album = (f.metadata.album || '').toLowerCase().trim();
          
          // Try full match first (artist + title + album)
          if (album && localTrackMetadata.has(`${artist}|||${title}|||${album}`)) {
            metadataMatches++;
            return false;
          }
          
          // Try loose match (artist + title only)
          if (localTrackMetadataLoose.has(`${artist}|||${title}`)) {
            looseMetadataMatches++;
            return false;
          }
          
          // Not found by metadata
          return true;
        } else {
          noMetadataCount++;
          // No metadata on device file, fall back to size comparison
          if (localTrackSizes.has(f.size)) {
            sizeMatches++;
            return false;
          }
          return true;
        }
      });
      
      console.log(`🔍 Duplicate detection results:`);
      console.log(`  - ${metadataMatches} files matched by artist+title+album`);
      console.log(`  - ${looseMetadataMatches} files matched by artist+title only`);
      console.log(`  - ${sizeMatches} files matched by size (no metadata)`);
      console.log(`  - ${noMetadataCount} device files had no metadata`);
      console.log(`  - ${notInLibrary.length} files not in local library`);
      
      // Show some examples of files not in library
      const sampleNotInLibrary = notInLibrary.slice(0, 10);
      console.log(`📋 Sample files NOT in library:`);
      sampleNotInLibrary.forEach(f => {
        if (f.metadata) {
          console.log(`  - "${f.metadata.title}" by "${f.metadata.artist}" (${f.metadata.album || 'no album'})`);
        } else {
          console.log(`  - ${f.name} (${f.size} bytes, no metadata)`);
        }
      });
      
      const scanResult = {
        success: true,
        totalOnDevice: result.total,
        notInLibrary: notInLibrary.length,
        files: result.files,
        filesNotInLibrary: notInLibrary
      };
      
      // Cache the scan result for 5 minutes
      this.deviceScanCache.set(deviceId, {
        timestamp: Date.now(),
        scanResult: scanResult
      });
      
      return scanResult;
      
    } catch (error) {
      console.error(`❌ Failed to scan device music library: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import/pull music files from device's general music library to desktop
   * @param {string} deviceId - The device ID (productId)
   * @param {string} libraryPath - Destination library path on desktop
   */
  async importFromDevice(deviceId, libraryPath) {
    console.log(`📥 Starting import from device ${deviceId} to ${libraryPath}`);
    
    if (!libraryPath) {
      throw new Error('Library path not specified');
    }
    
    // Get device info
    const devices = this.deviceMonitorService.getConnectedDevices();
    const device = Array.from(devices.values()).find(d => String(d.productId) === deviceId);
    
    if (!device || !device.udid) {
      throw new Error(`Device ${deviceId} not found or UDID not available`);
    }
    
    // Check if we have a recent scan cached (within 5 minutes)
    const cached = this.deviceScanCache.get(deviceId);
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    let scanResult;
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`📱 Using cached scan results from ${Math.round((Date.now() - cached.timestamp) / 1000)}s ago`);
      scanResult = cached.scanResult;
    } else {
      console.log(`📱 Scanning device music library...`);
      scanResult = await this.scanDeviceMusicLibrary(deviceId);
    }
    
    if (!scanResult.success || scanResult.files.length === 0) {
      throw new Error('No music files found on device');
    }
    
    console.log(`📥 Found ${scanResult.files.length} music files on device`);
    console.log(`📥 ${scanResult.notInLibrary} files not in local library`);
    
    // Use the pre-filtered list from scan results
    const filesToImport = scanResult.filesNotInLibrary || [];
    
    if (filesToImport.length === 0) {
      console.log(`✅ All device music already in library`);
      return {
        success: true,
        copied: 0,
        skipped: scanResult.files.length,
        errors: 0,
        total: scanResult.files.length
      };
    }
    
    console.log(`📥 Importing ${filesToImport.length} new files...`);
    
    // Use Python script to pull files from device
    const pythonPath = path.join(__dirname, '../../../resources/python/python/bin/python3');
    const scriptPath = path.join(__dirname, '../../../reference/pull-device-music.py');
    
    let copiedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Pull each file
    for (let i = 0; i < filesToImport.length; i++) {
      const fileInfo = filesToImport[i];
      
      try {
        // Sanitize filename
        const filename = path.basename(fileInfo.name);
        const destPath = path.join(libraryPath, filename);
        
        // Check if file already exists
        if (await fs.pathExists(destPath)) {
          const destStats = await fs.stat(destPath);
          if (destStats.size === fileInfo.size) {
            skippedCount++;
            continue;
          }
        }
        
        // Call Python script to pull this specific file
        const cmd = `"${pythonPath}" "${scriptPath}" "${device.udid}" "${fileInfo.path}" "${destPath}"`;
        
        console.log(`  📥 [${i + 1}/${filesToImport.length}] Pulling: ${filename}`);
        await execAsync(cmd);
        
        copiedCount++;
        
        // Emit progress
        this.emit('import-progress', {
          deviceId,
          current: i + 1,
          total: filesToImport.length,
          filename,
          copied: copiedCount,
          skipped: skippedCount,
          errors: errorCount
        });

    } catch (error) {
        console.error(`  ❌ Failed to pull ${fileInfo.name}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`✅ Import complete: ${copiedCount} copied, ${skippedCount} skipped, ${errorCount} errors`);
    
    return {
      success: true,
      copied: copiedCount,
      skipped: skippedCount,
      errors: errorCount,
      total: filesToImport.length
    };
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
