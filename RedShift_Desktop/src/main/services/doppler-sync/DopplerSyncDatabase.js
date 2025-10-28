// src/main/services/doppler-sync/DopplerSyncDatabase.js
// Handles database operations for Doppler sync (sessions, statistics, devices)

const path = require('path');
const fs = require('fs-extra');

/**
 * Clean up orphaned files from transfer database
 * @param {Array} orphanedFiles - Files to clean up
 * @param {Object} db - Database service
 * @param {Object} emitter - Event emitter
 */
async function cleanupOrphanedFiles(orphanedFiles, db, emitter) {
  for (const orphaned of orphanedFiles) {
    try {
      await db.run(
        'DELETE FROM transferred_files WHERE file_path = ?',
        [orphaned.file_path]
      );
      
      console.log(`📱 Removed orphaned record: ${orphaned.file_path}`);
      
      emitter.emit('orphan-cleaned', {
        file: orphaned.file_path,
        transferredDate: orphaned.transferred_date
      });
      
    } catch (error) {
      console.error(`📱 Failed to clean orphaned file ${orphaned.file_path}:`, error.message);
    }
  }
}

/**
 * Record sync session in database for history tracking
 * @param {Object} currentSyncSession - Current sync session data
 * @param {Object} db - Database service
 */
async function recordSyncSession(currentSyncSession, db) {
  if (!currentSyncSession) return;
  
  const session = currentSyncSession;
  const duration = Math.floor((Date.now() - session.startTime) / 1000);
  
  await db.run(`
    INSERT INTO transfer_sessions 
    (session_date, files_queued, files_transferred, total_size, duration_seconds, transfer_method)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    Math.floor(session.startTime / 1000),
    session.totalFiles.length,
    session.transferred,
    session.totalFiles.reduce((sum, f) => sum + (f.size || 0), 0),
    duration,
    session.method
  ]);
  
  console.log(`📱 Recorded sync session: ${session.transferred}/${session.totalFiles.length} files transferred`);
}

/**
 * Get last sync date from database
 * @param {Object} db - Database service
 * @returns {Promise<Date|null>} Last sync date or null
 */
async function getLastSyncDate(db) {
  const result = await db.get(`
    SELECT MAX(session_date) as last_sync 
    FROM transfer_sessions
  `);
  
  return result?.last_sync ? new Date(result.last_sync * 1000) : null;
}

/**
 * Get sync statistics and history
 * @param {Object} db - Database service
 * @returns {Promise<Object>} Statistics object
 */
async function getSyncStatistics(db) {
  const stats = await db.query(`
    SELECT 
      COUNT(*) as total_sessions,
      SUM(files_transferred) as total_files_transferred,
      SUM(total_size) as total_bytes_transferred,
      AVG(duration_seconds) as avg_duration,
      MAX(session_date) as last_session_date,
      transfer_method
    FROM transfer_sessions 
    GROUP BY transfer_method
    ORDER BY total_files_transferred DESC
  `);
  
  const recentSessions = await db.query(`
    SELECT *
    FROM transfer_sessions 
    ORDER BY session_date DESC 
    LIMIT 10
  `);
  
  return {
    byMethod: stats,
    recentSessions: recentSessions,
    totalTransferred: await db.get('SELECT COUNT(*) as count FROM transferred_files')
  };
}

/**
 * Force refresh of transfer database (useful for troubleshooting)
 * @param {Object} context - Context object with dependencies
 * @param {Object} context.db - Database service
 * @param {Object} context.settings - Settings service
 * @param {Function} context.getTransferredFiles - Function to get transferred files
 * @returns {Promise<Object>} Refresh results
 */
async function refreshTransferDatabase(context) {
  console.log('📱 Refreshing transfer database...');
  
  // Get all currently transferred files
  const transferred = await context.getTransferredFiles();
  const musicPath = context.settings.get('musicLibraryPath') || context.settings.get('masterLibraryPath');
  
  let cleanedCount = 0;
  
  for (const file of transferred) {
    const fullPath = path.join(musicPath, file.file_path);
    
    if (!await fs.pathExists(fullPath)) {
      // File no longer exists locally, remove from database
      await context.db.run('DELETE FROM transferred_files WHERE file_path = ?', [file.file_path]);
      cleanedCount++;
      console.log(`📱 Cleaned missing file: ${file.file_path}`);
    }
  }
  
  console.log(`📱 Transfer database refresh complete. Cleaned ${cleanedCount} missing files.`);
  return { cleanedFiles: cleanedCount };
}

/**
 * Save paired Doppler device to database
 * @param {Object} deviceInfo - Device information
 * @param {Object} db - Database service
 */
async function saveDopplerDevice(deviceInfo, db) {
  try {
    await db.run(
      `INSERT OR REPLACE INTO doppler_devices (id, name, push_token, last_connected)
       VALUES (?, ?, ?, ?)`,
      [
        deviceInfo.id,
        deviceInfo.name,
        JSON.stringify(deviceInfo.pushToken || deviceInfo.push_token),
        Math.floor(Date.now() / 1000)
      ]
    );
    console.log(`✅ Saved Doppler device: ${deviceInfo.name} (${deviceInfo.id})`);
  } catch (err) {
    console.error('❌ Failed to save Doppler device:', err);
    throw err;
  }
}

/**
 * Get saved Doppler device from database
 * @param {Object} db - Database service
 * @returns {Promise<Object|null>} Device info or null
 */
async function getSavedDopplerDevice(db) {
  try {
    const row = await db.get(
      `SELECT * FROM doppler_devices ORDER BY last_connected DESC LIMIT 1`
    );
    
    if (!row) {
      return null;
    }

    // Parse push_token back to object
    const device = {
      id: row.id,
      name: row.name,
      push_token: JSON.parse(row.push_token),
      last_connected: row.last_connected,
      created_at: row.created_at
    };
    return device;
  } catch (err) {
    console.error('❌ Failed to get Doppler device:', err);
    throw err;
  }
}

/**
 * Forget (delete) a paired Doppler device
 * @param {string} deviceId - Device ID to forget
 * @param {Object} db - Database service
 */
async function forgetDopplerDevice(deviceId, db) {
  try {
    await db.run(
      `DELETE FROM doppler_devices WHERE id = ?`,
      [deviceId]
    );
    console.log(`✅ Forgot Doppler device: ${deviceId}`);
  } catch (err) {
    console.error('❌ Failed to forget Doppler device:', err);
    throw err;
  }
}

module.exports = {
  cleanupOrphanedFiles,
  recordSyncSession,
  getLastSyncDate,
  getSyncStatistics,
  refreshTransferDatabase,
  saveDopplerDevice,
  getSavedDopplerDevice,
  forgetDopplerDevice
};

