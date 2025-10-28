// src/main/services/doppler-sync/DopplerSyncAnalysis.js
// Handles sync status analysis, file comparison, and health metrics

const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

/**
 * Get comprehensive sync status - what's on device vs what should be
 * @param {Object} context - Context object with dependencies
 * @param {Object} context.settings - Settings service
 * @param {Object} context.musicLibraryCache - Music library cache service
 * @param {Object} context.db - Database service
 * @param {Function} context.getLastSyncDate - Function to get last sync date
 * @returns {Promise<Object>} Sync status object
 */
async function analyzeSyncStatus(context) {
  console.log('📱 Analyzing Doppler sync status...');
  
  try {
    const localLibrary = await getLocalLibraryState(context.settings, context.musicLibraryCache);
    const transferredFiles = await getTransferredFiles(context.db);
    const orphanedFiles = findOrphanedFiles(transferredFiles, localLibrary);
    const newFiles = await findNewFiles(localLibrary, transferredFiles);
    
    const syncStatus = {
      localFiles: localLibrary.length,
      transferredFiles: transferredFiles.length,
      newFiles: newFiles.length,
      orphanedFiles: orphanedFiles.length,
      totalSizeNew: newFiles.reduce((sum, file) => sum + (file.size || 0), 0),
      lastSyncDate: await context.getLastSyncDate(),
      syncHealth: calculateSyncHealth(localLibrary.length, transferredFiles.length, orphanedFiles.length)
    };
    
    console.log(`📱 Sync Status: ${syncStatus.localFiles} local, ${syncStatus.transferredFiles} synced, ${syncStatus.newFiles} new, ${syncStatus.orphanedFiles} orphaned`);
    
    return {
      ...syncStatus,
      newFilesToSync: newFiles,
      orphanedFilesToRemove: orphanedFiles
    };
    
  } catch (error) {
    console.error('📱 Error analyzing sync status:', error);
    throw error;
  }
}

/**
 * Get current state of local music library using cache
 * @param {Object} settings - Settings service
 * @param {Object} musicLibraryCache - Music library cache service
 * @returns {Promise<Array>} Array of local library files
 */
async function getLocalLibraryState(settings, musicLibraryCache) {
  const musicPath = settings.get('musicLibraryPath') || settings.get('masterLibraryPath');
  
  if (!musicPath) {
    throw new Error('No music library path configured');
  }
  
  // Use music library cache for efficient scanning
  const cachedFiles = await musicLibraryCache.scanMusicLibrary(musicPath);
  
  return cachedFiles.map(file => ({
    path: file.path,
    relativePath: path.relative(musicPath, file.path),
    name: file.name,
    size: file.size,
    modified: file.modified,
    hash: null, // Will be calculated when needed
    metadata: file.metadata
  }));
}

/**
 * Get all files that have been transferred to Doppler
 * @param {Object} db - Database service
 * @returns {Promise<Array>} Array of transferred files
 */
async function getTransferredFiles(db) {
  return await db.query(`
    SELECT 
      file_path,
      file_hash,
      file_size,
      last_modified,
      transferred_date,
      transfer_method
    FROM transferred_files 
    ORDER BY transferred_date DESC
  `);
}

/**
 * Find files that exist in transfer database but not in local library (orphaned)
 * @param {Array} transferredFiles - Array of transferred files
 * @param {Array} localLibrary - Array of local library files
 * @returns {Array} Array of orphaned files
 */
function findOrphanedFiles(transferredFiles, localLibrary) {
  const localPaths = new Set(localLibrary.map(f => f.relativePath));
  
  return transferredFiles.filter(transferred => {
    return !localPaths.has(transferred.file_path);
  });
}

/**
 * Find files in local library that haven't been transferred yet
 * @param {Array} localLibrary - Array of local library files
 * @param {Array} transferredFiles - Array of transferred files
 * @returns {Promise<Array>} Array of new files to transfer
 */
async function findNewFiles(localLibrary, transferredFiles) {
  const transferredPaths = new Set(transferredFiles.map(f => f.file_path));
  const transferredHashes = new Set(transferredFiles.map(f => f.file_hash));
  
  const newFiles = [];
  
  for (const localFile of localLibrary) {
    // Skip if already transferred by path
    if (transferredPaths.has(localFile.relativePath)) {
      continue;
    }
    
    // Calculate hash for duplicate detection
    try {
      const hash = await calculateFileHash(localFile.path);
      localFile.hash = hash;
      
      // Skip if already transferred by hash (duplicate detection)
      if (transferredHashes.has(hash)) {
        continue;
      }
      
      newFiles.push(localFile);
      
    } catch (error) {
      console.warn(`📱 Could not hash file ${localFile.path}:`, error.message);
      // Include file without hash - better to sync than miss it
      newFiles.push(localFile);
    }
  }
  
  return newFiles;
}

/**
 * Calculate SHA-256 hash of a file for duplicate detection
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} SHA-256 hash of the file
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Calculate sync health score (0-100)
 * @param {number} localFiles - Number of local files
 * @param {number} transferredFiles - Number of transferred files
 * @param {number} orphanedFiles - Number of orphaned files
 * @returns {number} Health score 0-100
 */
function calculateSyncHealth(localFiles, transferredFiles, orphanedFiles) {
  if (localFiles === 0) return 100; // No files to sync
  
  const syncRatio = Math.min(transferredFiles / localFiles, 1);
  const orphanPenalty = Math.min(orphanedFiles / Math.max(transferredFiles, 1), 0.5);
  
  return Math.max(0, Math.round((syncRatio - orphanPenalty) * 100));
}

module.exports = {
  analyzeSyncStatus,
  getLocalLibraryState,
  getTransferredFiles,
  findOrphanedFiles,
  findNewFiles,
  calculateFileHash,
  calculateSyncHealth
};

