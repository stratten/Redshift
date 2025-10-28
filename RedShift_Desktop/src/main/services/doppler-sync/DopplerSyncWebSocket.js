// src/main/services/doppler-sync/DopplerSyncWebSocket.js
// Handles WebSocket-based sync with Doppler devices

const fs = require('fs-extra');
const WebSocketPairingService = require('../WebSocketPairingService');
const DopplerDeviceClient = require('../DopplerDeviceClient');
const DopplerSyncAnalysis = require('./DopplerSyncAnalysis');

/**
 * Sync to Doppler via WebSocket (full flow)
 * @param {Object} options - Sync options
 * @param {Object} context - Context object with dependencies
 * @param {Object} context.emitter - Event emitter
 * @param {Object} context.getSyncStatus - Function to get sync status
 * @param {Function} context.getSavedDopplerDevice - Function to get saved device
 * @param {Function} context.saveDopplerDevice - Function to save device info
 * @param {Function} context.markFileAsTransferred - Function to mark file as transferred
 * @param {Object} context.syncState - Sync state object to track isTransferring
 * @returns {Promise<Object>} Sync results
 */
async function syncViaDopplerWebSocket(options, context) {
  if (context.syncState.isTransferring) {
    throw new Error('Transfer already in progress');
  }

  context.syncState.isTransferring = true;
  let pairingService = null;
  let deviceClient = null;

  try {
    console.log('📱 Starting Doppler WebSocket sync...');
    context.emitter.emit('sync-started', { method: 'doppler_websocket' });

    // Step 1: Get device connection (pair or reconnect)
    let lanUrl;
    let device;

    // Check if LAN URL was provided from recent pairing
    if (options.lanUrl && options.deviceId) {
      // Use provided LAN URL (from just-completed pairing)
      lanUrl = options.lanUrl;
      device = { id: options.deviceId, name: 'iPhone' };
      console.log(`📱 Using LAN URL from pairing: ${lanUrl}`);
      context.emitter.emit('sync-status', { message: 'Connected to device...' });
      
    } else {
      // Try to reconnect to saved device
      const savedDevice = await context.getSavedDopplerDevice();

      if (savedDevice && !options.forcePair) {
        // Reconnect to saved device
        console.log(`📱 Reconnecting to saved device: ${savedDevice.name}`);
        context.emitter.emit('sync-status', { message: `Connecting to ${savedDevice.name}...` });

        pairingService = new WebSocketPairingService();
        await pairingService.connect();

        try {
          device = await pairingService.getSavedDevice(savedDevice);
          const result = await pairingService.confirmDevice(device, true);
          lanUrl = result.lanUrl;

          // Update last_connected timestamp
          await context.saveDopplerDevice({
            id: device.id,
            name: device.name || savedDevice.name,
            pushToken: result.pushToken
          });

        } catch (error) {
          console.warn('⚠️  Reconnection failed, will need to pair:', error.message);
          context.emitter.emit('sync-status', { message: 'Reconnection failed - pairing required' });
          
          // Clean up and signal pairing needed
          pairingService.disconnect();
          context.syncState.isTransferring = false;
          throw new Error('PAIRING_REQUIRED');
        }

      } else {
        // Signal that pairing is required
        console.log('📱 No saved device - pairing required');
        context.syncState.isTransferring = false;
        throw new Error('PAIRING_REQUIRED');
      }
    }

    // Step 2: Connect to device and get device info
    console.log(`📱 Connecting to device at: ${lanUrl}`);
    context.emitter.emit('sync-status', { message: 'Connected to device, checking compatibility...' });

    deviceClient = new DopplerDeviceClient(lanUrl);
    await deviceClient.getDeviceInfo();

    // Step 3: Get files to sync
    const syncStatus = await context.getSyncStatus();
    const filesToSync = syncStatus.newFilesToSync || [];

    if (filesToSync.length === 0) {
      console.log('✅ No new files to sync');
      context.emitter.emit('sync-completed', { transferred: 0, failed: 0 });
      context.syncState.isTransferring = false;
      return { transferred: 0, failed: 0, skipped: 0 };
    }

    // Limit batch size to avoid connection timeouts
    const BATCH_SIZE = 100; // Sync max 100 files at a time
    const totalFiles = filesToSync.length;
    const filesToSyncNow = filesToSync.slice(0, BATCH_SIZE);
    
    console.log(`📱 Found ${totalFiles} files to sync (syncing ${filesToSyncNow.length} in this batch)`);
    context.emitter.emit('sync-status', { 
      message: `Uploading ${filesToSyncNow.length} of ${totalFiles} files...`,
      total: filesToSyncNow.length
    });

    // Step 4: Upload files with progress tracking
    // Extract file paths from file objects
    const filePaths = filesToSyncNow.map(f => f.path);
    const successfulUploads = []; // Track successful uploads
    
    const results = await deviceClient.uploadFiles(
      filePaths,
      // Progress callback
      (progress) => {
        context.emitter.emit('file-progress', {
          current: progress.current,
          total: progress.total,
          file: progress.file,
          status: progress.status
        });
      },
      // File complete callback
      async (result) => {
        if (result.success) {
          // Track successful upload (don't mark as transferred yet)
          successfulUploads.push({
            index: result.index,
            file: result.file
          });
          
          context.emitter.emit('file-completed', {
            file: result.file,
            index: result.index
          });
        } else {
          context.emitter.emit('file-failed', {
            file: result.file,
            error: result.error,
            index: result.index
          });
        }
      }
    );

    // Step 5: Mark files as transferred ONLY if sync completed successfully
    // If there were connection errors, don't mark anything as transferred
    const hadConnectionError = results.errors.some(e => 
      e.error.includes('ECONNRESET') || 
      e.error.includes('ECONNREFUSED') || 
      e.error.includes('ETIMEDOUT')
    );

    if (hadConnectionError) {
      console.warn('⚠️  Connection error detected - treating all uploads as failed');
      console.warn(`⚠️  ${results.uploaded} files were uploaded before connection died`);
      console.warn('⚠️  Will retry all files in next sync');
      
      context.emitter.emit('sync-error', { 
        error: 'Connection lost during sync - no files marked as transferred. Please try again.',
        partialUploads: results.uploaded
      });
      
      context.syncState.isTransferring = false;
      throw new Error('CONNECTION_LOST');
    }

    // No connection errors - mark successful uploads as transferred
    console.log(`✅ Marking ${successfulUploads.length} files as transferred...`);
    for (const upload of successfulUploads) {
      const fileObject = filesToSyncNow[upload.index];
      const filePath = fileObject.path;
      await context.markFileAsTransferred(filePath, 'doppler_websocket', device.id);
    }

    console.log(`✅ Doppler WebSocket sync complete`);
    console.log(`   Uploaded: ${results.uploaded}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Remaining: ${totalFiles - filesToSyncNow.length}`);

    context.emitter.emit('sync-completed', {
      transferred: results.uploaded,
      failed: results.failed,
      remaining: totalFiles - filesToSyncNow.length,
      errors: results.errors
    });

    context.syncState.isTransferring = false;
    return results;

  } catch (error) {
    console.error('❌ Doppler WebSocket sync failed:', error);
    context.syncState.isTransferring = false;
    context.emitter.emit('sync-error', { error: error.message });
    throw error;

  } finally {
    // Clean up connections
    if (pairingService) {
      pairingService.disconnect();
    }
  }
}

/**
 * Mark file as transferred to Doppler device
 * @param {string} filePath - Path to the file
 * @param {string} method - Transfer method
 * @param {string} deviceId - Device ID
 * @param {Object} db - Database service
 */
async function markFileAsTransferred(filePath, method, deviceId, db) {
  try {
    const stats = await fs.stat(filePath);
    const hash = await DopplerSyncAnalysis.calculateFileHash(filePath);
    const now = Math.floor(Date.now() / 1000);

    await db.run(
      `INSERT OR REPLACE INTO transferred_files 
       (file_path, file_hash, file_size, last_modified, transferred_date, transfer_method, device_id, transfer_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        filePath,
        hash,
        stats.size,
        Math.floor(stats.mtimeMs / 1000),
        now,
        method,
        deviceId,
        'completed'
      ]
    );
  } catch (error) {
    console.error(`❌ Error marking file as transferred: ${filePath}`, error);
    throw error;
  }
}

module.exports = {
  syncViaDopplerWebSocket,
  markFileAsTransferred
};

