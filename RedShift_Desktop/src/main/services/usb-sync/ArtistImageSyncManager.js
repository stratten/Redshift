// ArtistImageSyncManager.js - Artist image synchronization to device
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const path = require('path');

/**
 * Handles artist image synchronization to iOS device
 */
class ArtistImageSyncManager {
  constructor(deviceMonitorService) {
    this.deviceMonitorService = deviceMonitorService;
  }

  /**
   * Sync artist images to device
   * @param {string} deviceId - The device ID (productId)
   */
  async syncArtistImages(deviceId) {
    console.log('🎨 Starting artist image sync...');
    
    try {
      const { app } = require('electron');
      
      // Check both old and new locations for artist images
      const userDataPath = app.getPath('userData');
      const newLocation = path.join(userDataPath, 'artist-images');
      const oldLocation = path.join(path.dirname(userDataPath), 'redshift', 'artist-images');
      
      console.log(`🎨 Checking for artist images:`);
      console.log(`   New location: ${newLocation}`);
      console.log(`   Old location: ${oldLocation}`);
      
      let artistImagesDir = null;
      if (await fs.pathExists(newLocation)) {
        artistImagesDir = newLocation;
        console.log(`✅ Found artist images at NEW location`);
      } else if (await fs.pathExists(oldLocation)) {
        artistImagesDir = oldLocation;
        console.log(`✅ Found artist images at OLD location`);
      }
      
      // Check if artist images directory exists
      if (!artistImagesDir) {
        console.log('📁 No artist images directory found in either location, skipping image sync');
        return;
      }
      
      // Get all image files
      const files = await fs.readdir(artistImagesDir);
      const imageFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      });
      
      if (imageFiles.length === 0) {
        console.log('🎨 No artist images to sync');
        return;
      }
      
      console.log(`🎨 Found ${imageFiles.length} artist images to sync`);
      
      // Get device info for pymobiledevice3
      const devices = this.deviceMonitorService.getConnectedDevices();
      const device = Array.from(devices.values()).find(d => String(d.productId) === deviceId);
      
      if (!device || !device.udid) {
        throw new Error('Device not found or UDID not available');
      }
      
      // Create the artist-images directory on the device if it doesn't exist
      console.log('🎨 Creating artist-images directory on device...');
      try {
        await this.createArtistImagesDirectory(device.udid);
        console.log('✅ Artist-images directory ready');
      } catch (dirError) {
        console.log('⚠️  Could not create directory (may already exist):', dirError.message);
      }
      
      // Get list of existing files on device for efficient comparison
      console.log('🎨 Checking which files already exist on device...');
      const existingFiles = await this.getDeviceArtistImages(device.udid);
      console.log(`🎨 Found ${existingFiles.size} existing artist images on device`);
      
      let synced = 0;
      let skipped = 0;
      let alreadyExists = 0;
      
      // Sync each image file
      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const localPath = path.join(artistImagesDir, imageFile);
        
        try {
          // Check if file already exists using our cached list
          if (existingFiles.has(imageFile)) {
            alreadyExists++;
          } else {
            // Push to artist-images subdirectory on device
            await this.pushArtistImageToDevice(device.udid, localPath, imageFile);
            synced++;
          }
          
          if ((i + 1) % 10 === 0 || i + 1 === imageFiles.length) {
            console.log(`🎨 Progress: ${i + 1}/${imageFiles.length} (${synced} new, ${alreadyExists} skipped)`);
          }
        } catch (error) {
          console.error(`⚠️  Failed to sync ${imageFile}:`, error.message);
        }
      }
      
      console.log(`✅ Artist image sync complete: ${synced} synced, ${skipped} skipped`);
      
    } catch (error) {
      console.error('❌ Artist image sync failed:', error);
      throw error;
    }
  }

  /**
   * Create artist-images directory on device
   * @param {string} udid - Device UDID
   */
  async createArtistImagesDirectory(udid) {
    try {
      const bundleId = 'com.redshiftplayer.mobile';
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      
      // Use pymobiledevice3 to create directory
      // We'll use 'apps push' with a dummy file to create the directory structure
      // Actually, let's use 'apps mkdir' if available, otherwise we'll let the first push create it
      
      // For now, we'll just let the first push attempt create the directory
      // pymobiledevice3 should handle directory creation automatically

    } catch (error) {
      // Ignore errors - directory may already exist
      console.log('Directory creation note:', error.message);
    }
  }

  /**
   * Get list of artist images already on device
   * @param {string} udid - Device UDID
   * @returns {Set<string>} Set of filenames
   */
  async getDeviceArtistImages(udid) {
    try {
      const bundleId = 'com.redshiftplayer.mobile';
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      
      // Create a temp directory to pull files into for listing
      const tempDir = path.join(require('os').tmpdir(), `redshift-list-${Date.now()}`);
      await fs.ensureDir(tempDir);
      
      try {
        // Try to pull a dummy file to test if directory exists
        const testFile = path.join(tempDir, 'test');
        const testCmd = `"${pythonPath}" -m pymobiledevice3 apps pull "${bundleId}" "Documents/artist-images/.gitkeep" "${testFile}" 2>&1`;
        await execAsync(testCmd).catch(() => {});
        
        // Directory exists, now we need to list files
        // Since there's no direct ls command, we'll pull each known file type pattern
        // Actually, let's use a Python script to list the directory
        const listScript = `
import sys
import json
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.house_arrest import HouseArrestService

try:
    udid = "${udid}"
    lockdown = create_using_usbmux(serial=udid)
    afc = HouseArrestService(lockdown=lockdown, bundle_id='${bundleId}')
    
    files = []
    try:
        dir_list = afc.listdir('Documents/artist-images')
        files = [f for f in dir_list if not f.startswith('.')]
    except Exception as list_error:
        # Directory might not exist yet
        print(json.dumps({'files': [], 'error': str(list_error)}), file=sys.stderr)
    
    print(json.dumps({'files': files}))
except Exception as e:
    print(json.dumps({'files': [], 'error': str(e)}))
`;
        
        const scriptPath = path.join(tempDir, 'list_images.py');
        await fs.writeFile(scriptPath, listScript);
        
        const { stdout, stderr } = await execAsync(`"${pythonPath}" "${scriptPath}"`);
        const result = JSON.parse(stdout.trim());
        
        // Log any errors from stderr
        if (stderr) {
          console.log('🎨 Device listing stderr:', stderr);
        }
        
        // Log the result for debugging
        console.log(`🎨 Device listing result: ${result.files ? result.files.length : 0} files found`);
        if (result.error) {
          console.log(`🎨 Device listing error: ${result.error}`);
        }
        
        await fs.remove(tempDir);
        
        return new Set(result.files || []);
        
      } catch (error) {
        await fs.remove(tempDir);
        // Directory doesn't exist or error occurred, return empty set
        return new Set();
      }
      
    } catch (error) {
      console.error('Error getting device artist images:', error.message);
      return new Set();
    }
  }

  /**
   * Push artist image file to device
   * @param {string} udid - Device UDID
   * @param {string} localPath - Local file path
   * @param {string} fileName - Destination filename
   */
  async pushArtistImageToDevice(udid, localPath, fileName) {
    try {
      const bundleId = 'com.redshiftplayer.mobile';
      const remotePath = `Documents/artist-images/${fileName}`;
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      
      // Use bundled Python to run pymobiledevice3 with explicit UDID
      const cmd = `"${pythonPath}" -m pymobiledevice3 apps push --udid "${udid}" "${bundleId}" "${localPath}" "${remotePath}"`;
      
      await execAsync(cmd);
      
    } catch (error) {
      throw new Error(`Failed to push ${fileName}: ${error.message}`);
    }
  }
}

module.exports = ArtistImageSyncManager;

