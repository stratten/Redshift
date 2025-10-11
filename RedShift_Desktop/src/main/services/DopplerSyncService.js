// src/main/services/DopplerSyncService.js - Core Doppler Library Synchronization

const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const { EventEmitter } = require('events');
const pythonBridge = require('./PythonBridge');
const WebSocketPairingService = require('./WebSocketPairingService');
const DopplerDeviceClient = require('./DopplerDeviceClient');

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
    console.log('📱 Analyzing Doppler sync status...');
    
    try {
      const localLibrary = await this.getLocalLibraryState();
      const transferredFiles = await this.getTransferredFiles();
      const orphanedFiles = await this.findOrphanedFiles(transferredFiles, localLibrary);
      const newFiles = await this.findNewFiles(localLibrary, transferredFiles);
      
      const syncStatus = {
        localFiles: localLibrary.length,
        transferredFiles: transferredFiles.length,
        newFiles: newFiles.length,
        orphanedFiles: orphanedFiles.length,
        totalSizeNew: newFiles.reduce((sum, file) => sum + (file.size || 0), 0),
        lastSyncDate: await this.getLastSyncDate(),
        syncHealth: this.calculateSyncHealth(localLibrary.length, transferredFiles.length, orphanedFiles.length)
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
   */
  async getLocalLibraryState() {
    const musicPath = this.settings.get('musicLibraryPath') || this.settings.get('masterLibraryPath');
    
    if (!musicPath) {
      throw new Error('No music library path configured');
    }
    
    // Use music library cache for efficient scanning
    const cachedFiles = await this.musicLibraryCache.scanMusicLibrary(musicPath);
    
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
   */
  async getTransferredFiles() {
    return await this.db.query(`
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
   */
  async findOrphanedFiles(transferredFiles, localLibrary) {
    const localPaths = new Set(localLibrary.map(f => f.relativePath));
    
    return transferredFiles.filter(transferred => {
      return !localPaths.has(transferred.file_path);
    });
  }
  
  /**
   * Find files in local library that haven't been transferred yet
   */
  async findNewFiles(localLibrary, transferredFiles) {
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
        const hash = await this.calculateFileHash(localFile.path);
        localFile.hash = hash;
        
        // Skip if already transferred by hash (duplicate detection)
        if (transferredHashes.has(hash)) {
          console.log(`📱 Skipping duplicate file: ${localFile.name} (matches existing hash)`);
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
   */
  async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
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
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      
      try {
        console.log(`📱 Transferring ${i + 1}/${newFiles.length}: ${file.name}`);
        
        this.emit('transfer-progress', {
          current: i + 1,
          total: newFiles.length,
          file: file.name,
          size: file.size
        });
        
        // Perform the actual transfer
        const success = await this.transferFile(file, method);
        
        if (success) {
          // Mark as transferred in database
          await this.markAsTransferred(file, method);
          this.currentSyncSession.transferred++;
          
          this.emit('file-transferred', {
            file: file.name,
            method: method,
            size: file.size
          });
          
        } else {
          throw new Error('Transfer failed without specific error');
        }
        
      } catch (error) {
        console.error(`📱 Failed to transfer ${file.name}:`, error.message);
        this.currentSyncSession.errors.push({
          file: file.name,
          error: error.message
        });
        
        this.emit('transfer-error', {
          file: file.name,
          error: error.message
        });
      }
    }
  }
  
  /**
   * Transfer a single file using the specified method
   */
  async transferFile(file, method) {
    switch (method) {
      case 'direct_libimobile':
        return await this.transferViaLibimobile(file);
      case 'pymobiledevice3':
        return await this.transferViaPyMobile(file);
      case 'files_app':
        return await this.transferViaFilesApp(file);
      case 'itunes':
        return await this.transferViaItunes(file);
      case 'simulator':
        return await this.transferViaSimulator(file);
      default:
        throw new Error(`Unknown transfer method: ${method}`);
    }
  }
  
  /**
   * Transfer file using libimobiledevice (most reliable)
   */
  async transferViaLibimobile(file) {
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
   */
  async transferViaPyMobile(file) {
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
   */
  async transferViaSimulator(file) {
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
   */
  async scanRedshiftMobileDocumentsSimulator() {
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
   */
  async transferViaFilesApp(file) {
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
   */
  async transferViaItunes(file) {
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
   */
  async markAsTransferred(file, method) {
    const hash = file.hash || await this.calculateFileHash(file.path);
    
    await this.db.run(`
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
  
  /**
   * Clean up orphaned files from transfer database
   */
  async cleanupOrphanedFiles(orphanedFiles) {
    for (const orphaned of orphanedFiles) {
      try {
        await this.db.run(
          'DELETE FROM transferred_files WHERE file_path = ?',
          [orphaned.file_path]
        );
        
        console.log(`📱 Removed orphaned record: ${orphaned.file_path}`);
        
        this.emit('orphan-cleaned', {
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
   */
  async recordSyncSession() {
    if (!this.currentSyncSession) return;
    
    const session = this.currentSyncSession;
    const duration = Math.floor((Date.now() - session.startTime) / 1000);
    
    await this.db.run(`
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
   */
  async getLastSyncDate() {
    const result = await this.db.get(`
      SELECT MAX(session_date) as last_sync 
      FROM transfer_sessions
    `);
    
    return result?.last_sync ? new Date(result.last_sync * 1000) : null;
  }
  
  /**
   * Calculate sync health score (0-100)
   */
  calculateSyncHealth(localFiles, transferredFiles, orphanedFiles) {
    if (localFiles === 0) return 100; // No files to sync
    
    const syncRatio = Math.min(transferredFiles / localFiles, 1);
    const orphanPenalty = Math.min(orphanedFiles / Math.max(transferredFiles, 1), 0.5);
    
    return Math.max(0, Math.round((syncRatio - orphanPenalty) * 100));
  }

  /**
   * Pre-index device library: scan Doppler documents on the connected iPhone
   * and mark matching local tracks as already transferred (without copying).
   *
   * Strategy:
   *  - Mount app documents via ifuse (preferred) or fall back to pymobiledevice3 afc ls
   *  - Collect device files (name, size)
   *  - Compare against local library (filename + size) and mark as transferred
   */
  async preIndexDeviceLibrary() {
    const localLibrary = await this.getLocalLibraryState();
    const deviceFiles = await this.scanDeviceDocuments();
    console.log(`📱 Device scan: found ${deviceFiles.length} candidate files on device`);
    if (deviceFiles.length > 0) {
      console.log('📱 Device sample:', deviceFiles.slice(0, 5).map(f => `${f.name} (${f.size || 0})`).join(' | '));
    }

    const normalize = (s) => {
      return (s || '')
        .replace(/\.[^/.]+$/, '')       // drop extension
        .replace(/^\s*\d{1,3}[).\- _]+/, '') // drop leading track numbers like "01 - ", "1) "
        .replace(/[_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };
    
    // Build device name map using normalized basenames
    const deviceMap = new Map(); // normalizedName -> set(sizes)
    deviceFiles.forEach(f => {
      const key = normalize(f.name);
      if (!deviceMap.has(key)) deviceMap.set(key, new Set());
      deviceMap.get(key).add(f.size || 0);
    });
    console.log(`📱 Device index: ${deviceMap.size} unique normalized names`);
    
    let matched = 0;
    for (const lf of localLibrary) {
      const base = lf.name || path.basename(lf.path);
      const size = lf.size || 0;
      const nameKey = normalize(base);
      const title = lf.metadata?.common?.title || '';
      const artist = lf.metadata?.common?.artist || '';
      const altKey = normalize(`${artist} - ${title}`);
      const sizes = deviceMap.get(nameKey) || deviceMap.get(altKey);
      if (sizes && sizes.has(lf.size || 0)) {
        try {
          await this.markAsTransferred(lf, 'preindexed');
          matched++;
        } catch (e) {
          console.warn('📱 preindex mark failed:', e?.message || e);
        }
      } else {
        // Occasionally log a few misses for diagnostics
        if (matched === 0 && Math.random() < 0.005) {
          console.log(`📱 No match for: name="${base}" alt="${artist} - ${title}" size=${size}`);
        }
      }
    }
    console.log(`📱 Pre-index complete: ${matched} files marked present on device`);
    return { matched, deviceFiles: deviceFiles.length, localFiles: localLibrary.length };
  }

  /**
   * Log what directories are accessible via AFC to help debug path issues
   */
  async logAccessibleDirectories() {
    try {
      const cmd = pythonBridge.getPymobiledevice3Command('afc ls /');
      const commandsToTry = Array.isArray(cmd) ? cmd : [cmd];
      
      for (const command of commandsToTry) {
        try {
          console.log('📱 Checking accessible AFC directories...');
          const out = execSync(command, { encoding: 'utf8', timeout: 60000 }); // Increased timeout to 60s
          const dirs = out.trim().split('\n').filter(Boolean);
          console.log(`📱 Found ${dirs.length} accessible directories via AFC:`);
          dirs.forEach(dir => console.log(`   - ${dir}`));
          return; // Success, exit
        } catch (e) {
          console.warn('📱 Failed to list directories:', e?.message || e);
          // Try next command
        }
      }
    } catch (e) {
      console.warn('📱 Could not list AFC directories:', e?.message || e);
    }
  }

  /**
   * Scan Doppler app documents on device and return list of audio files
   */
  async scanDeviceDocuments() {
    console.log('📱 Starting device document scan...');
    
    // First, try to list what directories ARE accessible via AFC
    await this.logAccessibleDirectories();
    
    // Try libimobiledevice + ifuse first (macOS/Linux)
    try {
      console.log('📱 Attempting idevice_id -l...');
      const devices = execSync('idevice_id -l', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      console.log(`📱 Found ${devices.length} devices via idevice_id`);
      if (devices.length > 0) {
        const mountPoint = '/tmp/ios_mount';
        const bundleCandidates = [
          'com.bridgetech.Doppler',
          'com.bridgetech.DopplerBeta',
          'com.okaynokay.Doppler'
        ];
        await fs.ensureDir(mountPoint);
        let mounted = false;
        for (const bid of bundleCandidates) {
          try {
            console.log(`📱 Trying ifuse --documents ${bid}`);
            execSync(`ifuse --documents ${bid} ${mountPoint}`, { encoding: 'utf8' });
            mounted = true;
            const files = await this.walkDeviceDir(mountPoint);
            console.log(`📱 ifuse documents (${bid}) found ${files.length} files`);
            try { execSync(`umount ${mountPoint}`); } catch (_) {}
            return files;
          } catch (_) {
            try { execSync(`umount ${mountPoint}`); } catch (_) {}
          }
        }
        // Fallback: mount root and look for Doppler/Documents
        if (!mounted) {
          try {
            console.log('📱 Trying ifuse (root mount)');
            execSync(`ifuse ${mountPoint}`, { encoding: 'utf8' });
            const candidates = [
              path.join(mountPoint, 'Doppler', 'Documents'),
              path.join(mountPoint, 'Documents')
            ];
            for (const c of candidates) {
              if (await fs.pathExists(c)) {
                const files = await this.walkDeviceDir(c);
                console.log(`📱 ifuse root found ${files.length} files under ${c}`);
                try { execSync(`umount ${mountPoint}`); } catch (_) {}
                return files;
              }
            }
            try { execSync(`umount ${mountPoint}`); } catch (_) {}
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('📱 libimobiledevice/ifuse failed:', e?.message || 'command not found or device not accessible');
    }
    
    // Fallback to pymobiledevice3 afc listing
    // Use bundled Python + pymobiledevice3, or fall back to system installations
    // Try multiple possible paths where Doppler might store files
    // Based on AFC structure: /Music, /Podcasts, /Downloads, /Books are available
    const pathsToTry = [
      '/Music',      // Most likely location for music files
      '/Downloads',  // Alternative location
      '/Books',      // Some apps store audio here
      '/Podcasts',   // Another audio location
    ];
    
    for (const remotePath of pathsToTry) {
      console.log(`📱 Trying path: ${remotePath}`);
      const pymobileCommands = pythonBridge.getPymobiledevice3Command(`afc ls ${remotePath}`);
      const commandsToTry = Array.isArray(pymobileCommands) ? pymobileCommands : [pymobileCommands];
    
    for (const cmd of commandsToTry) {
      try {
        console.log(`📱 Trying: ${cmd}...`);
        const out = execSync(cmd, { encoding: 'utf8', timeout: 60000 }); // Increased timeout to 60s
        console.log(`📱 pymobiledevice3 output length: ${out.length} chars`);
        
        // Parse output - format varies by command, try multiple patterns
        const files = [];
        out.split('\n').forEach(line => {
          // Pattern 1: detailed listing "-rw-r--r-- 12345 filename"
          let m = line.match(/\s(\d+)\s+(.*)$/);
          if (m) {
            const size = parseInt(m[1]);
            const name = m[2].trim();
            const ext = path.extname(name).toLowerCase();
            if (this.audioExtensions.includes(ext)) {
              files.push({ name, size, path: `/Documents/${name}` });
              return;
            }
          }
          
          // Pattern 2: simple listing (just filenames)
          const trimmed = line.trim();
          if (trimmed) {
            const ext = path.extname(trimmed).toLowerCase();
            if (this.audioExtensions.includes(ext)) {
              files.push({ name: trimmed, size: 0, path: `/Documents/${trimmed}` });
            }
          }
        });
        
        console.log(`📱 pymobiledevice3 listed ${files.length} audio files from ${remotePath}`);
        if (files.length > 0) {
          console.log(`📱 Sample files: ${files.slice(0, 3).map(f => f.name).join(', ')}`);
          return files; // Success! Return the files we found
        }
      } catch (e) {
        console.warn(`📱 Failed with "${cmd}":`, e?.message || 'command not found');
      }
    }
    } // End of remotePath loop
    
    console.error('📱 ❌ Could not enumerate device library - all methods failed');
    console.error('📱 Make sure you have either:');
    console.error('📱   1. libimobiledevice + ifuse installed (brew install libimobiledevice ifuse)');
    console.error('📱   2. pymobiledevice3 installed (pip3 install pymobiledevice3)');
    return [];
  }

  async walkDeviceDir(root) {
    const collected = [];
    const walk = async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (_) { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { await walk(full); continue; }
        const ext = path.extname(e.name).toLowerCase();
        if (!this.audioExtensions.includes(ext)) continue;
        let size = 0;
        try { const st = await fs.stat(full); size = st.size; } catch (_) {}
        collected.push({ name: e.name, size, path: full });
      }
    };
    await walk(root);
    return collected;
  }
  
  /**
   * Get sync statistics and history
   */
  async getSyncStatistics() {
    const stats = await this.db.query(`
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
    
    const recentSessions = await this.db.query(`
      SELECT *
      FROM transfer_sessions 
      ORDER BY session_date DESC 
      LIMIT 10
    `);
    
    return {
      byMethod: stats,
      recentSessions: recentSessions,
      totalTransferred: await this.db.get('SELECT COUNT(*) as count FROM transferred_files')
    };
  }
  
  /**
   * Force refresh of transfer database (useful for troubleshooting)
   */
  async refreshTransferDatabase() {
    console.log('📱 Refreshing transfer database...');
    
    // Get all currently transferred files
    const transferred = await this.getTransferredFiles();
    const musicPath = this.settings.get('musicLibraryPath') || this.settings.get('masterLibraryPath');
    
    let cleanedCount = 0;
    
    for (const file of transferred) {
      const fullPath = path.join(musicPath, file.file_path);
      
      if (!await fs.pathExists(fullPath)) {
        // File no longer exists locally, remove from database
        await this.db.run('DELETE FROM transferred_files WHERE file_path = ?', [file.file_path]);
        cleanedCount++;
        console.log(`📱 Cleaned missing file: ${file.file_path}`);
      }
    }
    
    console.log(`📱 Transfer database refresh complete. Cleaned ${cleanedCount} missing files.`);
    return { cleanedFiles: cleanedCount };
  }

  // ============================================================================
  // DOPPLER WEBSOCKET SYNC METHODS
  // ============================================================================

  /**
   * Save paired Doppler device to database
   */
  async saveDopplerDevice(deviceInfo) {
    try {
      await this.db.run(
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
   */
  async getSavedDopplerDevice() {
    try {
      const row = await this.db.get(
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
   */
  async forgetDopplerDevice(deviceId) {
    try {
      await this.db.run(
        `DELETE FROM doppler_devices WHERE id = ?`,
        [deviceId]
      );
      console.log(`✅ Forgot Doppler device: ${deviceId}`);
    } catch (err) {
      console.error('❌ Failed to forget Doppler device:', err);
      throw err;
    }
  }

  /**
   * Sync to Doppler via WebSocket (full flow)
   */
  async syncViaDopplerWebSocket(options = {}) {
    if (this.isTransferring) {
      throw new Error('Transfer already in progress');
    }

    this.isTransferring = true;
    let pairingService = null;
    let deviceClient = null;

    try {
      console.log('📱 Starting Doppler WebSocket sync...');
      this.emit('sync-started', { method: 'doppler_websocket' });

      // Step 1: Get device connection (pair or reconnect)
      let lanUrl;
      let device;

      // Check if LAN URL was provided from recent pairing
      if (options.lanUrl && options.deviceId) {
        // Use provided LAN URL (from just-completed pairing)
        lanUrl = options.lanUrl;
        device = { id: options.deviceId, name: 'iPhone' };
        console.log(`📱 Using LAN URL from pairing: ${lanUrl}`);
        this.emit('sync-status', { message: 'Connected to device...' });
        
      } else {
        // Try to reconnect to saved device
        const savedDevice = await this.getSavedDopplerDevice();

        if (savedDevice && !options.forcePair) {
          // Reconnect to saved device
          console.log(`📱 Reconnecting to saved device: ${savedDevice.name}`);
          this.emit('sync-status', { message: `Connecting to ${savedDevice.name}...` });

          pairingService = new WebSocketPairingService();
          await pairingService.connect();

          try {
            device = await pairingService.getSavedDevice(savedDevice);
            const result = await pairingService.confirmDevice(device, true);
            lanUrl = result.lanUrl;

            // Update last_connected timestamp
            await this.saveDopplerDevice({
              id: device.id,
              name: device.name || savedDevice.name,
              pushToken: result.pushToken
            });

          } catch (error) {
            console.warn('⚠️  Reconnection failed, will need to pair:', error.message);
            this.emit('sync-status', { message: 'Reconnection failed - pairing required' });
            
            // Clean up and signal pairing needed
            pairingService.disconnect();
            this.isTransferring = false;
            throw new Error('PAIRING_REQUIRED');
          }

        } else {
          // Signal that pairing is required
          console.log('📱 No saved device - pairing required');
          this.isTransferring = false;
          throw new Error('PAIRING_REQUIRED');
        }
      }

      // Step 2: Connect to device and get device info
      console.log(`📱 Connecting to device at: ${lanUrl}`);
      this.emit('sync-status', { message: 'Connected to device, checking compatibility...' });

      deviceClient = new DopplerDeviceClient(lanUrl);
      await deviceClient.getDeviceInfo();

      // Step 3: Get files to sync
      const syncStatus = await this.getSyncStatus();
      const filesToSync = syncStatus.newFilesToSync || [];

      if (filesToSync.length === 0) {
        console.log('✅ No new files to sync');
        this.emit('sync-completed', { transferred: 0, failed: 0 });
        this.isTransferring = false;
        return { transferred: 0, failed: 0, skipped: 0 };
      }

      // Limit batch size to avoid connection timeouts
      const BATCH_SIZE = 100; // Sync max 100 files at a time
      const totalFiles = filesToSync.length;
      const filesToSyncNow = filesToSync.slice(0, BATCH_SIZE);
      
      console.log(`📱 Found ${totalFiles} files to sync (syncing ${filesToSyncNow.length} in this batch)`);
      this.emit('sync-status', { 
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
          this.emit('file-progress', {
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
            
            this.emit('file-completed', {
              file: result.file,
              index: result.index
            });
          } else {
            this.emit('file-failed', {
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
        
        this.emit('sync-error', { 
          error: 'Connection lost during sync - no files marked as transferred. Please try again.',
          partialUploads: results.uploaded
        });
        
        this.isTransferring = false;
        throw new Error('CONNECTION_LOST');
      }

      // No connection errors - mark successful uploads as transferred
      console.log(`✅ Marking ${successfulUploads.length} files as transferred...`);
      for (const upload of successfulUploads) {
        const fileObject = filesToSyncNow[upload.index];
        const filePath = fileObject.path;
        await this.markFileAsTransferred(filePath, 'doppler_websocket', device.id);
      }

      console.log(`✅ Doppler WebSocket sync complete`);
      console.log(`   Uploaded: ${results.uploaded}`);
      console.log(`   Failed: ${results.failed}`);
      console.log(`   Remaining: ${totalFiles - filesToSyncNow.length}`);

      this.emit('sync-completed', {
        transferred: results.uploaded,
        failed: results.failed,
        remaining: totalFiles - filesToSyncNow.length,
        errors: results.errors
      });

      this.isTransferring = false;
      return results;

    } catch (error) {
      console.error('❌ Doppler WebSocket sync failed:', error);
      this.isTransferring = false;
      this.emit('sync-error', { error: error.message });
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
   */
  async markFileAsTransferred(filePath, method, deviceId) {
    try {
      const stats = await fs.stat(filePath);
      const hash = await this.calculateFileHash(filePath);
      const now = Math.floor(Date.now() / 1000);

      await this.db.run(
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
}

module.exports = DopplerSyncService;
