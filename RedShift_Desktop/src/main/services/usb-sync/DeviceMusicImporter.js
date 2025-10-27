// DeviceMusicImporter.js - Import music from device's general music library
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const path = require('path');

/**
 * Handles scanning and importing music from device's general music library
 * (not just the RedShift app sandbox)
 */
class DeviceMusicImporter {
  constructor(deviceMonitorService, musicLibraryCache, eventEmitter) {
    this.deviceMonitorService = deviceMonitorService;
    this.musicLibraryCache = musicLibraryCache;
    this.eventEmitter = eventEmitter;
    
    // Cache for device scan results (to avoid rescanning for import)
    this.deviceScanCache = new Map(); // deviceId -> { timestamp, scanResult }
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
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      const scriptPath = path.join(__dirname, '../../../../reference/list-device-music.py');
      
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
                this.eventEmitter.emit('device-scan-progress', {
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
                
                this.eventEmitter.emit('device-scan-progress', {
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
    const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
    const scriptPath = path.join(__dirname, '../../../../reference/pull-device-music.py');
    
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
        this.eventEmitter.emit('import-progress', {
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
}

module.exports = DeviceMusicImporter;

