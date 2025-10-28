// src/main/services/doppler-sync/DopplerSyncTransfer.js
// Handles file transfer operations to Doppler devices

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const DopplerSyncAnalysis = require('./DopplerSyncAnalysis');

// Platform-specific imports
let applescript;
try {
  applescript = require('applescript');
} catch (e) {
  // AppleScript not available on non-macOS platforms
}

/**
 * Transfer new files to Doppler
 * @param {Array} newFiles - Files to transfer
 * @param {string} method - Transfer method
 * @param {Object} context - Context object with dependencies
 * @param {Object} context.emitter - Event emitter for progress events
 * @param {Object} context.currentSyncSession - Current sync session object
 * @param {Object} context.db - Database service
 * @param {Function} context.markAsTransferred - Function to mark file as transferred
 */
async function transferNewFiles(newFiles, method, context) {
  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i];
    
    try {
      console.log(`📱 Transferring ${i + 1}/${newFiles.length}: ${file.name}`);
      
      context.emitter.emit('transfer-progress', {
        current: i + 1,
        total: newFiles.length,
        file: file.name,
        size: file.size
      });
      
      // Perform the actual transfer
      const success = await transferFile(file, method);
      
      if (success) {
        // Mark as transferred in database
        await context.markAsTransferred(file, method);
        context.currentSyncSession.transferred++;
        
        context.emitter.emit('file-transferred', {
          file: file.name,
          method: method,
          size: file.size
        });
        
      } else {
        throw new Error('Transfer failed without specific error');
      }
      
    } catch (error) {
      console.error(`📱 Failed to transfer ${file.name}:`, error.message);
      context.currentSyncSession.errors.push({
        file: file.name,
        error: error.message
      });
      
      context.emitter.emit('transfer-error', {
        file: file.name,
        error: error.message
      });
    }
  }
}

/**
 * Transfer a single file using the specified method
 * @param {Object} file - File to transfer
 * @param {string} method - Transfer method
 * @returns {Promise<boolean>} True if successful
 */
async function transferFile(file, method) {
  switch (method) {
    case 'direct_libimobile':
      return await transferViaLibimobile(file);
    case 'pymobiledevice3':
      return await transferViaPyMobile(file);
    case 'files_app':
      return await transferViaFilesApp(file);
    case 'itunes':
      return await transferViaItunes(file);
    case 'simulator':
      return await transferViaSimulator(file);
    default:
      throw new Error(`Unknown transfer method: ${method}`);
  }
}

/**
 * Transfer file using libimobiledevice (most reliable)
 * @param {Object} file - File to transfer
 * @returns {Promise<boolean>} True if successful
 */
async function transferViaLibimobile(file) {
  try {
    const command = `idevice_id -l`;
    const devices = execSync(command, { encoding: 'utf8' }).trim().split('\n').filter(id => id);
    
    if (devices.length === 0) {
      throw new Error('No iOS devices connected');
    }
    
    const deviceId = devices[0];
    const targetPath = `/Documents/Imported/${path.basename(file.path)}`;
    
    // Use AFC (Apple File Conduit) to transfer
    const transferCommand = `ifuse -u ${deviceId} /tmp/ios_mount && cp "${file.path}" "/tmp/ios_mount/Doppler${targetPath}" && umount /tmp/ios_mount`;
    
    execSync(transferCommand, { encoding: 'utf8' });
    console.log(`📱 Successfully transferred via libimobile: ${file.name}`);
    
    return true;
    
  } catch (error) {
    console.error('📱 libimobiledevice transfer failed:', error.message);
    return false;
  }
}

/**
 * Transfer file using pymobiledevice3 (Python-based)
 * @param {Object} file - File to transfer
 * @returns {Promise<boolean>} True if successful
 */
async function transferViaPyMobile(file) {
  try {
    const command = `python3 -m pymobiledevice3 afc push "${file.path}" "/Documents/Imported/${path.basename(file.path)}"`;
    execSync(command, { encoding: 'utf8' });
    
    console.log(`📱 Successfully transferred via pymobiledevice3: ${file.name}`);
    return true;
    
  } catch (error) {
    console.error('📱 pymobiledevice3 transfer failed:', error.message);
    return false;
  }
}

/**
 * Transfer file to the iOS Simulator app container (development only)
 * @param {Object} file - File to transfer
 * @returns {Promise<boolean>} True if successful
 */
async function transferViaSimulator(file) {
  try {
    // Bundle ID must match the simulator app
    const bundleId = 'com.redshift.mobile';
    const container = execSync(`xcrun simctl get_app_container booted ${bundleId} data`, {
      encoding: 'utf8'
    }).trim();

    if (!container) {
      throw new Error('Simulator app container not found. Is the simulator booted and app installed?');
    }

    const targetDir = path.join(container, 'Documents', 'Music');
    await fs.ensureDir(targetDir);
    const dest = path.join(targetDir, path.basename(file.path));
    await fs.copy(file.path, dest);

    console.log(`📱 Successfully transferred to simulator: ${file.name}`);
    return true;
  } catch (error) {
    console.error('📱 simulator transfer failed:', error.message);
    return false;
  }
}

/**
 * Read current files from RedShift Mobile app container on the iOS Simulator
 * @returns {Promise<Array>} Array of files in simulator
 */
async function scanRedshiftMobileDocumentsSimulator() {
  try {
    const bundleId = 'com.redshift.mobile';
    const container = execSync(`xcrun simctl get_app_container booted ${bundleId} data`, { encoding: 'utf8' }).trim();
    if (!container) return [];
    const docs = path.join(container, 'Documents', 'Music');
    if (!fs.existsSync(docs)) return [];

    const entries = await fs.readdir(docs, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(docs, entry.name);
      const stat = await fs.stat(full);
      files.push({ name: entry.name, size: stat.size, path: full });
    }
    return files;
  } catch (e) {
    console.warn('📱 Failed to scan simulator documents:', e?.message || e);
    return [];
  }
}

/**
 * Transfer file via Files app (requires manual user interaction)
 * @param {Object} file - File to transfer
 * @returns {Promise<boolean>} True if successful
 */
async function transferViaFilesApp(file) {
  if (process.platform !== 'darwin' || !applescript) {
    throw new Error('Files app transfer only available on macOS with AppleScript');
  }
  
  try {
    const script = `
      tell application "Finder"
        reveal POSIX file "${file.path}"
      end tell
      
      display dialog "Please drag the highlighted file to the Doppler app folder in Files app, then click OK" buttons {"OK"} default button "OK"
    `;
    
    await new Promise((resolve, reject) => {
      applescript.execString(script, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    console.log(`📱 Manual transfer completed: ${file.name}`);
    return true;
    
  } catch (error) {
    console.error('📱 Files app transfer failed:', error.message);
    return false;
  }
}

/**
 * Transfer file via iTunes file sharing (legacy method)
 * @param {Object} file - File to transfer
 * @returns {Promise<boolean>} True if successful
 */
async function transferViaItunes(file) {
  try {
    // This would require iTunes/Music app automation
    // Implementation depends on specific iTunes/Music app version
    throw new Error('iTunes transfer method not yet implemented');
    
  } catch (error) {
    console.error('📱 iTunes transfer failed:', error.message);
    return false;
  }
}

/**
 * Mark file as transferred in database
 * @param {Object} file - File that was transferred
 * @param {string} method - Transfer method used
 * @param {Object} db - Database service
 */
async function markAsTransferred(file, method, db) {
  const hash = file.hash || await DopplerSyncAnalysis.calculateFileHash(file.path);
  
  await db.run(`
    INSERT OR REPLACE INTO transferred_files 
    (file_path, file_hash, file_size, last_modified, transferred_date, transfer_method)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    file.relativePath,
    hash,
    file.size,
    file.modified,
    Math.floor(Date.now() / 1000),
    method
  ]);
  
  console.log(`📱 Marked as transferred: ${file.name}`);
}

module.exports = {
  transferNewFiles,
  transferFile,
  transferViaLibimobile,
  transferViaPyMobile,
  transferViaSimulator,
  scanRedshiftMobileDocumentsSimulator,
  transferViaFilesApp,
  transferViaItunes,
  markAsTransferred
};

