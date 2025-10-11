// src/main/services/SyncService.js - iPhone Sync Management Service
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const { shell } = require('electron');
const mm = require('music-metadata');
const NodeID3 = require('node-id3');

// Platform-specific imports
let applescript;
try {
  applescript = require('applescript');
} catch (error) {
  console.log('AppleScript not available on this platform');
}

class SyncService {
  constructor(database, settings, eventEmitter) {
    this.db = database;
    this.settings = settings;
    this.eventEmitter = eventEmitter;
    
    this.isTransferring = false;
    this.transferQueue = [];
    this.currentTransfer = null;
    
    // Audio file extensions
    this.audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4p', '.ogg', '.opus'];
  }
  
  /**
   * Calculate SHA-256 hash of a file for duplicate detection
   */
  calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }
  
  /**
   * Scan master library and identify files that need syncing
   */
  async scanMasterLibrary() {
    this.eventEmitter.emit('scan-started');
    this.eventEmitter.emit('log', { type: 'info', message: 'Starting library scan...' });
    
    try {
      const audioFiles = [];
      const masterLibraryPath = this.settings.masterLibraryPath;
      
      const scanDirectory = async (dirPath) => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (this.audioExtensions.includes(ext)) {
              const stats = await fs.stat(fullPath);
              const relativePath = path.relative(masterLibraryPath, fullPath);
              
              audioFiles.push({
                path: fullPath,
                relativePath: relativePath,
                size: stats.size,
                modified: Math.floor(stats.mtime.getTime() / 1000),
                name: entry.name
              });
            }
          }
        }
      };
      
      await scanDirectory(masterLibraryPath);
      
      this.eventEmitter.emit('log', { 
        type: 'success', 
        message: `Scan complete: ${audioFiles.length} audio files found` 
      });
      
      // Compare with database to find new/modified files
      const syncCandidates = await this.identifySyncCandidates(audioFiles);
      
      this.eventEmitter.emit('scan-completed', syncCandidates);
      return syncCandidates;
      
    } catch (error) {
      this.eventEmitter.emit('scan-error', { error: error.message });
      this.eventEmitter.emit('log', { 
        type: 'error', 
        message: `Scan failed: ${error.message}` 
      });
      throw error;
    }
  }
  
  /**
   * Compare scanned files with database to identify sync candidates
   */
  async identifySyncCandidates(audioFiles) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT file_path, file_hash, file_size, last_modified FROM transferred_files', 
        async (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          
          const transferred = {};
          rows.forEach(row => {
            transferred[row.file_path] = {
              hash: row.file_hash,
              size: row.file_size,
              modified: row.last_modified
            };
          });
          
          const candidates = {
            newFiles: [],
            modifiedFiles: [],
            totalSize: 0,
            totalFiles: 0
          };
          
          for (const file of audioFiles) {
            if (!transferred[file.relativePath]) {
              // New file
              candidates.newFiles.push(file);
              candidates.totalSize += file.size;
            } else {
              const transferredInfo = transferred[file.relativePath];
              
              // Check if modified
              if (file.size !== transferredInfo.size || 
                  file.modified !== transferredInfo.modified) {
                
                // Calculate hash to confirm difference
                try {
                  const currentHash = await this.calculateFileHash(file.path);
                  if (currentHash !== transferredInfo.hash) {
                    file.hash = currentHash;
                    candidates.modifiedFiles.push(file);
                    candidates.totalSize += file.size;
                  }
                } catch (error) {
                  console.error(`Error hashing file ${file.path}:`, error);
                }
              }
            }
          }
          
          candidates.totalFiles = candidates.newFiles.length + candidates.modifiedFiles.length;
          resolve(candidates);
        });
    });
  }
  
  /**
   * Transfer files to iPhone using specified method
   */
  async transferFiles(files, method = 'direct_libimobile') {
    if (this.isTransferring) {
      throw new Error('Transfer already in progress');
    }
    
    this.isTransferring = true;
    this.transferQueue = [...files];
    this.currentTransfer = { method, startTime: Date.now() };
    
    this.eventEmitter.emit('transfer-started', { 
      total: files.length, 
      method: method 
    });
    
    try {
      // Prepare normalized staging copies (do not mutate originals)
      const filesForTransfer = await this.prepareNormalizedStaging(files);
      switch (method) {
        case 'direct_libimobile':
          await this.transferViaLibimobile(filesForTransfer);
          break;
        case 'direct_pymobile':
          await this.transferViaPyMobile(filesForTransfer);
          break;
        case 'itunes_protocol':
          await this.transferViaHouseArrest(filesForTransfer);
          break;
        case 'simulator':
          await this.transferViaSimulator(filesForTransfer);
          break;
        case 'files_app':
          await this.transferViaFilesApp(filesForTransfer);
          break;
        default:
          throw new Error(`Unknown transfer method: ${method}`);
      }
      
      // Mark files as transferred in database
      for (const file of files) {
        await this.markAsTransferred(file, method);
      }
      
      // Log transfer session
      await this.logTransferSession(files.length, method);
      
      this.isTransferring = false;
      this.currentTransfer = null;
      
      this.eventEmitter.emit('transfer-completed', { 
        transferred: files.length,
        method: method 
      });
      
    } catch (error) {
      this.isTransferring = false;
      this.currentTransfer = null;
      this.eventEmitter.emit('transfer-error', { error: error.message });
      throw error;
    } finally {
      // Cleanup staging directory if created
      if (this.currentTransfer && this.currentTransfer.stagingDir) {
        try { await fs.remove(this.currentTransfer.stagingDir); } catch (_) {}
      }
    }
  }

  /**
   * Transfer directly into the iOS Simulator app container (development only)
   */
  async transferViaSimulator(files) {
    this.eventEmitter.emit('log', {
      type: 'info',
      message: 'Starting simulator transfer...'
    });

    try {
      // Get app container for booted simulator
      // Bundle ID must match the iOS app. Using com.redshift.mobile per current project
      const bundleId = 'com.redshift.mobile';
      const { execSync } = require('child_process');
      const container = execSync(`xcrun simctl get_app_container booted ${bundleId} data`, {
        encoding: 'utf8'
      }).trim();

      if (!container) {
        throw new Error('Failed to locate simulator app container. Is a simulator booted and the app installed?');
      }

      const targetDir = path.join(container, 'Documents', 'Music');
      await fs.ensureDir(targetDir);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dest = path.join(targetDir, file.name);
        await fs.copy(file.path, dest);

        this.eventEmitter.emit('transfer-progress', {
          current: i + 1,
          total: files.length,
          currentFile: file.name
        });

        this.eventEmitter.emit('log', {
          type: 'info',
          message: `Transferred to simulator: ${file.name}`
        });
      }

      this.eventEmitter.emit('log', {
        type: 'success',
        message: 'Simulator transfer complete. Open the app and Rescan Library.'
      });
    } catch (error) {
      throw new Error(`Simulator transfer failed: ${error.message}`);
    }
  }

  /**
   * Create normalized staging copies for transfer. Writes key ID3 tags for MP3 only.
   * Original files are never modified.
   */
  async prepareNormalizedStaging(files) {
    const appDataPath = this.settings.appDataPath || path.join(require('electron').app.getPath('userData'), 'Redshift');
    const stagingRoot = path.join(appDataPath, 'normalized_staging');
    await fs.ensureDir(stagingRoot);
    const sessionDir = path.join(stagingRoot, String(Date.now()));
    await fs.ensureDir(sessionDir);
    if (this.currentTransfer) this.currentTransfer.stagingDir = sessionDir;

    const staged = [];
    for (const file of files) {
      const destPath = path.join(sessionDir, file.name);
      await fs.copy(file.path, destPath);

      // Write normalized tags for MP3 copies only
      if (path.extname(file.name).toLowerCase() === '.mp3') {
        try {
          const md = await mm.parseFile(file.path);
          const common = md.common || {};
          const baseTitle = path.basename(file.path, path.extname(file.path));
          const joinedArtists = Array.isArray(common.artists) ? common.artists.filter(Boolean).join(', ') : undefined;
          const title = (common.title || baseTitle) || undefined;
          const artist = (common.artist || joinedArtists) || undefined;
          const albumartist = (common.albumartist || common.artist || joinedArtists) || undefined;
          const album = (common.album || albumartist) || undefined;
          const genre = Array.isArray(common.genre) ? common.genre.filter(Boolean).join(', ') : (common.genre || undefined);
          const year = common.year || undefined;

          const tags = {
            title,
            artist,
            album,
            performerInfo: albumartist, // TPE2 (album artist)
            genre,
            year
          };
          // Remove undefined keys to avoid writing empty frames
          Object.keys(tags).forEach(k => tags[k] === undefined && delete tags[k]);
          if (Object.keys(tags).length > 0) {
            NodeID3.update(tags, destPath);
          }
        } catch (e) {
          // Best-effort; ignore tag write failures
        }
      }

      const stats = await fs.stat(destPath);
      staged.push({
        ...file,
        path: destPath,
        size: stats.size
      });
    }
    return staged;
  }
  
  /**
   * Transfer via libimobiledevice (macOS/Linux - fastest method)
   */
  async transferViaLibimobile(files) {
    this.eventEmitter.emit('log', { 
      type: 'info', 
      message: 'Starting direct transfer via libimobiledevice...' 
    });
    
    try {
      // Create mount point
      const appDataPath = this.settings.appDataPath || path.join(require('electron').app.getPath('userData'), 'Redshift');
      const mountPoint = path.join(appDataPath, 'iphone_mount');
      await fs.ensureDir(mountPoint);
      
      // Mount Doppler app container (non-sandboxed allows direct device access)
      execSync(`ifuse --container com.brushedtype.doppler "${mountPoint}"`);
      
      // Transfer files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const targetPath = path.join(mountPoint, 'Documents', file.name);
        
        await fs.copy(file.path, targetPath);
        
        this.eventEmitter.emit('transfer-progress', {
          current: i + 1,
          total: files.length,
          currentFile: file.name
        });
        
        this.eventEmitter.emit('log', { 
          type: 'info', 
          message: `Transferred: ${file.name}` 
        });
      }
      
      // Unmount
      execSync(`umount "${mountPoint}"`);
      
    } catch (error) {
      throw new Error(`Direct transfer failed: ${error.message}`);
    }
  }
  
  /**
   * Transfer via pymobiledevice3 (cross-platform Python method)
   */
  async transferViaPyMobile(files) {
    this.eventEmitter.emit('log', { 
      type: 'info', 
      message: 'Starting transfer via pymobiledevice3...' 
    });
    
    try {
      // Start tunnel (if not already running)
      const tunnelProcess = spawn('python3', ['-m', 'pymobiledevice3', 'remote', 'start-tunnel'], {
        detached: true,
        stdio: 'ignore'
      });
      
      // Wait for tunnel to establish
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Transfer files using AFC (Apple File Conduit)
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        execSync(`python3 -m pymobiledevice3 afc push "${file.path}" "/Documents/${file.name}" --bundle-id com.brushedtype.doppler`);
        
        this.eventEmitter.emit('transfer-progress', {
          current: i + 1,
          total: files.length,
          currentFile: file.name
        });
        
        this.eventEmitter.emit('log', { 
          type: 'info', 
          message: `Transferred: ${file.name}` 
        });
      }
      
    } catch (error) {
      throw new Error(`pymobiledevice3 transfer failed: ${error.message}`);
    }
  }
  
  /**
   * Transfer via iTunes House Arrest protocol
   */
  async transferViaHouseArrest(files) {
    this.eventEmitter.emit('log', { 
      type: 'info', 
      message: 'Starting transfer via iTunes protocol...' 
    });
    
    try {
      // Use house_arrest to access app sandbox (non-sandboxed gives us more options)
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        execSync(`ideviceafc put "${file.path}" "/Documents/${file.name}" --bundle-id com.brushedtype.doppler`);
        
        this.eventEmitter.emit('transfer-progress', {
          current: i + 1,
          total: files.length,
          currentFile: file.name
        });
        
        this.eventEmitter.emit('log', { 
          type: 'info', 
          message: `Transferred: ${file.name}` 
        });
      }
      
    } catch (error) {
      throw new Error(`iTunes protocol transfer failed: ${error.message}`);
    }
  }
  
  /**
   * Transfer via iOS Files app (manual fallback method)
   */
  async transferViaFilesApp(files) {
    const appDataPath = this.settings.appDataPath || path.join(require('electron').app.getPath('userData'), 'Redshift');
    const stagingDir = path.join(appDataPath, 'staging');
    await fs.ensureDir(stagingDir);
    
    // Clear staging directory
    await fs.emptyDir(stagingDir);
    
    this.eventEmitter.emit('log', { 
      type: 'info', 
      message: 'Preparing files for iOS Files app import...' 
    });
    
    // Copy files to staging area (non-sandboxed allows any destination)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const stagingPath = path.join(stagingDir, file.name);
      
      await fs.copy(file.path, stagingPath);
      
      this.eventEmitter.emit('transfer-progress', {
        current: i + 1,
        total: files.length,
        currentFile: file.name
      });
    }
    
    // Open staging directory in system file manager
    shell.showItemInFolder(stagingDir);
    
    this.eventEmitter.emit('log', { 
      type: 'success', 
      message: `Files prepared in staging directory. Import via iOS Files app -> Doppler` 
    });
  }
  
  /**
   * Mark file as successfully transferred in database
   */
  async markAsTransferred(file, method) {
    const hash = file.hash || await this.calculateFileHash(file.path);
    const now = Math.floor(Date.now() / 1000);
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT OR REPLACE INTO transferred_files 
        (file_path, file_hash, file_size, last_modified, transferred_date, transfer_method)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [file.relativePath, hash, file.size, file.modified, now, method], 
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }
  
  /**
   * Log transfer session for history tracking
   */
  async logTransferSession(filesTransferred, method) {
    const now = Math.floor(Date.now() / 1000);
    const duration = this.currentTransfer ? 
      Math.floor((Date.now() - this.currentTransfer.startTime) / 1000) : 0;
    const totalSize = this.transferQueue.reduce((sum, file) => sum + file.size, 0);
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO transfer_sessions 
        (session_date, files_queued, files_transferred, total_size, duration_seconds, transfer_method)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [now, this.transferQueue.length, filesTransferred, totalSize, duration, method],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }
  
  /**
   * Get transfer history for UI display
   */
  async getTransferHistory(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM transfer_sessions 
        ORDER BY session_date DESC 
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  /**
   * Cancel ongoing transfer
   */
  cancelTransfer() {
    if (this.isTransferring) {
      this.isTransferring = false;
      this.currentTransfer = null;
      this.eventEmitter.emit('transfer-cancelled');
      this.eventEmitter.emit('log', { 
        type: 'warning', 
        message: 'Transfer cancelled by user' 
      });
    }
  }
  
  /**
   * Get current transfer status
   */
  getTransferStatus() {
    return {
      isTransferring: this.isTransferring,
      currentTransfer: this.currentTransfer,
      queueLength: this.transferQueue.length
    };
  }
}

module.exports = SyncService;
