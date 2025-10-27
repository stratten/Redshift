// PlaylistSyncManager.js - Playlist synchronization (bi-directional)
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const path = require('path');

/**
 * Handles playlist synchronization between desktop and iOS device
 */
class PlaylistSyncManager {
  constructor(deviceMonitorService, playlistService, getConnectedDeviceByDeviceId) {
    this.deviceMonitorService = deviceMonitorService;
    this.playlistService = playlistService;
    this.getConnectedDeviceByDeviceId = getConnectedDeviceByDeviceId;
    
    // Temp storage for pulled playlists
    this.pulledPlaylistsDir = null;
  }

  /**
   * Sync playlists to device
   * @param {string} deviceId - The device ID (productId)
   */
  async syncPlaylists(deviceId) {
    console.log('📋 Starting playlist sync...');
    
    try {
      // Get all playlists from desktop
      const playlists = await this.getPlaylistsForSync();
      
      if (playlists.length === 0) {
        console.log('📋 No playlists to sync');
        return;
      }
      
      console.log(`📋 Found ${playlists.length} playlists to sync`);
      
      // Get device info
      const devices = this.deviceMonitorService.getConnectedDevices();
      const device = Array.from(devices.values()).find(d => String(d.productId) === deviceId);
      
      if (!device || !device.udid) {
        throw new Error('Device not found or UDID not available');
      }
      
      // Create Playlists directory on device using Python script
      console.log('📋 Creating Playlists directory on device...');
      try {
        const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
        const tempDir = path.join(require('os').tmpdir(), `redshift-mkdir-${Date.now()}`);
        await fs.ensureDir(tempDir);
        
        const mkdirScript = `
import sys
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.house_arrest import HouseArrestService

try:
    lockdown = create_using_usbmux()
    afc = HouseArrestService(lockdown=lockdown, bundle_id='com.redshiftplayer.mobile')
    
    # Create Playlists directory
    try:
        afc.makedirs('Documents/Playlists')
        print('Directory created')
    except Exception as e:
        # Directory might already exist
        print(f'Directory may already exist: {e}')
    
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
`;
        
        const scriptPath = path.join(tempDir, 'mkdir_playlists.py');
        await fs.writeFile(scriptPath, mkdirScript);
        
        await execAsync(`"${pythonPath}" "${scriptPath}"`);
        await fs.remove(tempDir);
        
        console.log('✅ Playlists directory ready');
      } catch (dirError) {
        console.log('⚠️  Could not create directory (may already exist):', dirError.message);
      }
      
      // Export each playlist as JSON
      for (const playlist of playlists) {
        console.log(`📋 Syncing playlist: ${playlist.name}`);
        await this.pushPlaylistToDevice(device.udid, playlist);
      }
      
      console.log(`✅ Playlist sync complete: ${playlists.length} playlists synced`);
      
    } catch (error) {
      console.error('❌ Playlist sync failed:', error);
      throw error;
    }
  }
  
  /**
   * Get playlists with their tracks for syncing
   */
  async getPlaylistsForSync() {
    // Access the playlist service from the constructor
    if (!this.playlistService) {
      console.log('⚠️  PlaylistService not available, skipping playlist sync');
      return [];
    }
    
    // Get all playlists
    const playlists = await this.playlistService.getAllPlaylists();
    
    // For each playlist, get its tracks
    const playlistsWithTracks = [];
    for (const playlist of playlists) {
      const tracks = await this.playlistService.getPlaylistTracks(playlist.id);
      playlistsWithTracks.push({
        name: playlist.name,
        tracks: tracks.map(t => path.basename(t.file_path)), // Just the filenames
        createdDate: playlist.created_date,
        modifiedDate: playlist.modified_date
      });
    }
    
    return playlistsWithTracks;
  }
  
  /**
   * Pull playlists from device
   * @param {string} deviceId - Device ID
   */
  async pullPlaylistsFromDevice(deviceId) {
    try {
      console.log('📥 Pulling playlists from device...');
      
      const { app } = require('electron');
      const device = this.getConnectedDeviceByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }
      
      const bundleId = 'com.redshiftplayer.mobile';
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      const tempDir = path.join(app.getPath('temp'), 'redshift-playlists-pull');
      await fs.ensureDir(tempDir);
      
      // First, list files in the Playlists directory on device
      // We'll use a Python script to list directory contents
      const listScript = `
import sys
import json
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.afc import AfcService

try:
    udid = "${device.udid}"
    lockdown = create_using_usbmux(serial=udid)
    afc = AfcService(lockdown=lockdown, service_name='com.apple.afc')
    
    # List files in Playlists directory
    try:
        files = afc.listdir('Documents/Playlists')
        json_files = [f for f in files if f.endswith('.json')]
        print(json.dumps({"success": True, "files": json_files}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "files": []}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e), "files": []}))
`;
      
      const listScriptPath = path.join(tempDir, 'list_playlists.py');
      await fs.writeFile(listScriptPath, listScript);
      
      const listCmd = `"${pythonPath}" "${listScriptPath}"`;
      const { stdout } = await execAsync(listCmd);
      const listResult = JSON.parse(stdout.trim());
      
      if (!listResult.success) {
        console.log('⚠️  No playlists found on device or error listing:', listResult.error);
        return;
      }
      
      const jsonFiles = listResult.files;
      console.log(`📋 Found ${jsonFiles.length} playlist files on device`);
      
      // Pull each JSON file
      for (const jsonFile of jsonFiles) {
        try {
          const remotePath = `Documents/Playlists/${jsonFile}`;
          const localPath = path.join(tempDir, jsonFile);
          
          const pullCmd = `"${pythonPath}" -m pymobiledevice3 apps pull --udid "${device.udid}" "${bundleId}" "${remotePath}" "${localPath}"`;
          await execAsync(pullCmd);
          
          console.log(`📥 Pulled: ${jsonFile}`);
        } catch (error) {
          console.error(`❌ Failed to pull ${jsonFile}:`, error.message);
        }
      }
      
      // Store the temp directory path for merge step
      this.pulledPlaylistsDir = tempDir;
      
      console.log(`✅ Pulled ${jsonFiles.length} playlists from device`);
      
    } catch (error) {
      console.error('❌ Failed to pull playlists from device:', error);
      throw error;
    }
  }
  
  /**
   * Merge device playlists with local playlists using "last modified wins" strategy
   */
  async mergePlaylistsWithConflictResolution() {
    try {
      console.log('🔄 Merging playlists with conflict resolution...');
      
      if (!this.pulledPlaylistsDir) {
        console.log('⚠️  No pulled playlists to merge');
        return;
      }

      // Get all pulled JSON files
      const files = await fs.readdir(this.pulledPlaylistsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      console.log(`📋 Processing ${jsonFiles.length} pulled playlists...`);
      
      // Get all local playlists
      const localPlaylists = await this.playlistService.getAllPlaylists();
      const localPlaylistMap = new Map(localPlaylists.map(p => [p.name.toLowerCase(), p]));
      
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      
      for (const jsonFile of jsonFiles) {
        try {
          const filePath = path.join(this.pulledPlaylistsDir, jsonFile);
          const devicePlaylist = await fs.readJson(filePath);
          
          const playlistName = devicePlaylist.name;
          const deviceModified = devicePlaylist.modifiedDate;
          
          console.log(`📋 Processing: ${playlistName} (device modified: ${new Date(deviceModified * 1000).toISOString()})`);
          
          // Check if playlist exists locally
          const localPlaylist = localPlaylistMap.get(playlistName.toLowerCase());
          
          if (!localPlaylist) {
            // New playlist from device - import it
            console.log(`  ✨ New playlist from device: ${playlistName}`);
            await this.playlistService.importPlaylistFromJSON(devicePlaylist);
            imported++;
          } else {
            // Playlist exists on both - compare modification times
            const localModified = localPlaylist.modified_date;
            
            console.log(`  🔄 Conflict detected:`);
            console.log(`     Local: ${new Date(localModified * 1000).toISOString()}`);
            console.log(`     Device: ${new Date(deviceModified * 1000).toISOString()}`);
            
            if (deviceModified > localModified) {
              // Device version is newer - update local
              console.log(`  ✅ Device version is newer - updating local`);
              await this.playlistService.updatePlaylistFromJSON(localPlaylist.id, devicePlaylist);
              updated++;
            } else {
              // Local version is newer or same - keep local
              console.log(`  ⏭️  Local version is newer/same - keeping local`);
              skipped++;
            }
          }
        } catch (error) {
          console.error(`❌ Failed to process ${jsonFile}:`, error.message);
        }
      }
      
      console.log(`✅ Playlist merge complete: ${imported} imported, ${updated} updated, ${skipped} skipped`);
      
      // Clean up temp directory
      await fs.remove(this.pulledPlaylistsDir);
      this.pulledPlaylistsDir = null;
      
    } catch (error) {
      console.error('❌ Failed to merge playlists:', error);
      throw error;
    }
  }
  
  /**
   * Push playlist JSON file to device
   * @param {string} udid - Device UDID
   * @param {object} playlist - Playlist data
   */
  async pushPlaylistToDevice(udid, playlist) {
    try {
      const { app } = require('electron');
      const tmpDir = path.join(app.getPath('temp'), 'redshift-playlists');
      await fs.ensureDir(tmpDir);
      
      // Create JSON file
      const safeFilename = playlist.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const jsonFilename = `${safeFilename}.json`;
      const localPath = path.join(tmpDir, jsonFilename);
      
      await fs.writeJson(localPath, playlist);
      
      // Push to device
      const bundleId = 'com.redshiftplayer.mobile';
      const remotePath = `Documents/Playlists/${jsonFilename}`;
      const pythonPath = path.join(__dirname, '../../../../resources/python/python/bin/python3');
      
      const cmd = `"${pythonPath}" -m pymobiledevice3 apps push --udid "${udid}" "${bundleId}" "${localPath}" "${remotePath}"`;
      
      await execAsync(cmd);
      
      // Clean up temp file
      await fs.remove(localPath);
      
    } catch (error) {
      throw new Error(`Failed to push playlist ${playlist.name}: ${error.message}`);
    }
  }
}

module.exports = PlaylistSyncManager;

