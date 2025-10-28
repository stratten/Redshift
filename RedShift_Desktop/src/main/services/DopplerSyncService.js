// src/main/services/DopplerSyncService.js - Core Doppler Library Synchronization

const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const { EventEmitter } = require('events');
const pythonBridge = require('./PythonBridge');
const WebSocketPairingService = require('./WebSocketPairingService');
const DopplerDeviceClient = require('./DopplerDeviceClient');
const DopplerSyncAnalysis = require('./doppler-sync/DopplerSyncAnalysis');
const DopplerSyncTransfer = require('./doppler-sync/DopplerSyncTransfer');
const DopplerSyncWebSocket = require('./doppler-sync/DopplerSyncWebSocket');
const DopplerSyncDevice = require('./doppler-sync/DopplerSyncDevice');
const DopplerSyncDatabase = require('./doppler-sync/DopplerSyncDatabase');

// Platform-specific imports
let applescript;
try {
  applescript = require('applescript');
} catch (error) {
  console.log('AppleScript not available on this platform');
}

class DopplerSyncService extends EventEmitter {
  constructor(databaseService, settingsService, musicLibraryCache) {
    super();
    this.db = databaseService;
    this.settings = settingsService;
    this.musicLibraryCache = musicLibraryCache;
    
    // Initialize Python bridge early to show configuration in logs
    pythonBridge.initialize();
    
    this.isScanning = false;
    this.isTransferring = false;
    this.currentSyncSession = null;
    
    // Audio file extensions supported by Doppler
    this.audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4p', '.ogg', '.opus'];
    
    console.log('📱 DopplerSyncService initialized');
  }
  
  /**
   * Get comprehensive sync status - what's on device vs what should be
   */
  async getSyncStatus() {
    return await DopplerSyncAnalysis.analyzeSyncStatus({
      settings: this.settings,
      musicLibraryCache: this.musicLibraryCache,
      db: this.db,
      getLastSyncDate: this.getLastSyncDate.bind(this)
    });
  }
  
  
  /**
   * Start a sync session - transfer new files and clean up orphaned ones
   */
  async startSyncSession(options = {}) {
    if (this.isTransferring) {
      throw new Error('Sync session already in progress');
    }
    
    console.log('📱 Starting Doppler sync session...');
    this.isTransferring = true;
    
    try {
      const syncStatus = await this.getSyncStatus();
      
      this.currentSyncSession = {
        startTime: Date.now(),
        sessionId: crypto.randomUUID(),
        // Store the actual array of files to be transferred
        totalFiles: Array.isArray(syncStatus.newFilesToSync) ? syncStatus.newFilesToSync : [],
        orphanedFiles: syncStatus.orphanedFiles,
        transferred: 0,
        errors: [],
        method: options.transferMethod || this.settings.get('defaultTransferMethod') || 'direct_libimobile'
      };
      
      this.emit('sync-session-started', {
        sessionId: this.currentSyncSession.sessionId,
        newFiles: syncStatus.newFiles,
        orphanedFiles: syncStatus.orphanedFiles,
        method: this.currentSyncSession.method
      });
      
      // Phase 1: Determine files to transfer
      let filesToTransfer = Array.isArray(syncStatus.newFilesToSync) ? syncStatus.newFilesToSync : [];

      // If targeting RedShift Mobile via simulator, de-duplicate against files already on device
      if ((this.currentSyncSession.method || '').toLowerCase() === 'simulator') {
        try {
          const deviceFiles = await this.scanRedshiftMobileDocumentsSimulator();
          const present = new Map(); // name -> Set(size)
          for (const f of deviceFiles) {
            const set = present.get(f.name) || new Set();
            set.add(f.size || 0);
            present.set(f.name, set);
          }
          filesToTransfer = filesToTransfer.filter(f => {
            const set = present.get(f.name);
            return !set || !set.has(f.size || 0);
          });
        } catch (e) {
          console.warn('📱 Simulator presence check failed; proceeding without de-dup:', e?.message || e);
        }
      }

      // Update session totalFiles to the final list to transfer
      this.currentSyncSession.totalFiles = filesToTransfer;
      if (filesToTransfer.length > 0) {
        console.log(`📱 Transferring ${filesToTransfer.length} new files...`);
        await this.transferNewFiles(filesToTransfer, this.currentSyncSession.method);
      }
      
      // Phase 2: Clean up orphaned files (if enabled)
      if (options.cleanupOrphaned && syncStatus.orphanedFiles.length > 0) {
        console.log(`📱 Cleaning up ${syncStatus.orphanedFiles.length} orphaned files...`);
        await this.cleanupOrphanedFiles(syncStatus.orphanedFiles);
      }
      
      // Record sync session
      await this.recordSyncSession();
      
      console.log('📱 Doppler sync session completed successfully');
      this.emit('sync-session-completed', {
        sessionId: this.currentSyncSession.sessionId,
        transferred: this.currentSyncSession.transferred,
        errors: this.currentSyncSession.errors,
        duration: Date.now() - this.currentSyncSession.startTime
      });
      
    } catch (error) {
      console.error('📱 Sync session failed:', error);
      this.emit('sync-session-error', {
        sessionId: this.currentSyncSession?.sessionId,
        error: error.message
      });
      throw error;
      
    } finally {
      this.isTransferring = false;
      this.currentSyncSession = null;
    }
  }
  
  /**
   * Transfer new files to Doppler
   */
  async transferNewFiles(newFiles, method) {
    await DopplerSyncTransfer.transferNewFiles(newFiles, method, {
      emitter: this,
      currentSyncSession: this.currentSyncSession,
      db: this.db,
      markAsTransferred: this.markAsTransferred.bind(this)
    });
  }
  
  /**
   * Scan simulator for existing files
   */
  async scanRedshiftMobileDocumentsSimulator() {
    return await DopplerSyncTransfer.scanRedshiftMobileDocumentsSimulator();
  }
  
  /**
   * Mark file as transferred in database
   */
  async markAsTransferred(file, method) {
    await DopplerSyncTransfer.markAsTransferred(file, method, this.db);
  }
  
  /**
   * Clean up orphaned files from transfer database
   */
  async cleanupOrphanedFiles(orphanedFiles) {
    await DopplerSyncDatabase.cleanupOrphanedFiles(orphanedFiles, this.db, this);
  }
  
  /**
   * Record sync session in database for history tracking
   */
  async recordSyncSession() {
    await DopplerSyncDatabase.recordSyncSession(this.currentSyncSession, this.db);
  }
  
  /**
   * Get last sync date from database
   */
  async getLastSyncDate() {
    return await DopplerSyncDatabase.getLastSyncDate(this.db);
  }
  

  /**
   * Pre-index device library
   */
  async preIndexDeviceLibrary() {
    return await DopplerSyncDevice.preIndexDeviceLibrary({
      getLocalLibraryState: () => DopplerSyncAnalysis.getLocalLibraryState(this.settings, this.musicLibraryCache),
      scanDeviceDocuments: () => DopplerSyncDevice.scanDeviceDocuments({
        pythonBridge: pythonBridge,
        audioExtensions: this.audioExtensions
      }),
      markAsTransferred: this.markAsTransferred.bind(this)
    });
  }
  
  /**
   * Get sync statistics and history
   */
  async getSyncStatistics() {
    return await DopplerSyncDatabase.getSyncStatistics(this.db);
  }
  
  /**
   * Force refresh of transfer database (useful for troubleshooting)
   */
  async refreshTransferDatabase() {
    return await DopplerSyncDatabase.refreshTransferDatabase({
      db: this.db,
      settings: this.settings,
      getTransferredFiles: () => DopplerSyncAnalysis.getTransferredFiles(this.db)
    });
  }

  // ============================================================================
  // DOPPLER WEBSOCKET SYNC METHODS
  // ============================================================================

  /**
   * Save paired Doppler device to database
   */
  async saveDopplerDevice(deviceInfo) {
    await DopplerSyncDatabase.saveDopplerDevice(deviceInfo, this.db);
  }

  /**
   * Get saved Doppler device from database
   */
  async getSavedDopplerDevice() {
    return await DopplerSyncDatabase.getSavedDopplerDevice(this.db);
  }

  /**
   * Forget (delete) a paired Doppler device
   */
  async forgetDopplerDevice(deviceId) {
    await DopplerSyncDatabase.forgetDopplerDevice(deviceId, this.db);
  }

  /**
   * Sync to Doppler via WebSocket (full flow)
   */
  async syncViaDopplerWebSocket(options = {}) {
    return await DopplerSyncWebSocket.syncViaDopplerWebSocket(options, {
      emitter: this,
      getSyncStatus: this.getSyncStatus.bind(this),
      getSavedDopplerDevice: this.getSavedDopplerDevice.bind(this),
      saveDopplerDevice: this.saveDopplerDevice.bind(this),
      markFileAsTransferred: this.markFileAsTransferred.bind(this),
      syncState: this
    });
  }

  /**
   * Mark file as transferred to Doppler device
   */
  async markFileAsTransferred(filePath, method, deviceId) {
    await DopplerSyncWebSocket.markFileAsTransferred(filePath, method, deviceId, this.db);
  }
}

module.exports = DopplerSyncService;
