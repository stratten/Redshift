// src/main/services/MusicLibraryCache.js - Smart Music Library Caching

const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const fsp = require('fs').promises; // low-level FS ops (open/read/truncate)

class MusicLibraryCache {
  constructor(appDataPath, audioPlayerService) {
    this.appDataPath = appDataPath;
    this.audioPlayerService = audioPlayerService;
    this.cachePath = path.join(appDataPath, 'music_cache.db');
    this.songsDbPath = path.join(appDataPath, 'sync_database.db');
    this.db = null;
    this.songsDb = null;
    this.audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4p', '.ogg', '.opus'];
  }
  
  async initialize() {
    this.audioPlayerService.eventEmitter.emit('log', { 
      type: 'info', 
      message: '🎵 Initializing music library cache...' 
    });
    
    // Create cache database
    this.db = new sqlite3.Database(this.cachePath);
    // Open main songs database (created by Database.initializeDatabase)
    this.songsDb = new sqlite3.Database(this.songsDbPath);
    
    await this.createTables();
    this.audioPlayerService.eventEmitter.emit('log', { 
      type: 'success', 
      message: '🎵 Music cache database initialized' 
    });
  }
  
  createTables() {
    return new Promise((resolve, reject) => {
      const createSql = `
        CREATE TABLE IF NOT EXISTS music_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT UNIQUE NOT NULL,
          file_name TEXT NOT NULL,
          relative_path TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          modified_time INTEGER NOT NULL,
          metadata_json TEXT,
          album_art_path TEXT,
          user_title TEXT,
          user_artist TEXT,
          user_album TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_file_path ON music_files(file_path);
        CREATE INDEX IF NOT EXISTS idx_modified_time ON music_files(modified_time);
      `;
      
      this.db.exec(createSql, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  
  /**
   * Smart library scan - only processes new/changed files
   */
  async scanMusicLibrary(libraryPath) {
    this.audioPlayerService.eventEmitter.emit('log', { 
      type: 'info', 
      message: '🎵 Starting smart music library scan...' 
    });
    const startTime = Date.now();
    
    // Step 1: Scan filesystem for all audio files
    const currentFiles = await this.scanFilesystem(libraryPath);
    this.audioPlayerService.eventEmitter.emit('log', { 
      type: 'info', 
      message: `🎵 Found ${currentFiles.length} audio files in filesystem` 
    });
    
    // Step 2: Get cached files from database
    const cachedFiles = await this.getCachedFiles();
    this.audioPlayerService.eventEmitter.emit('log', { 
      type: 'info', 
      message: `🎵 Found ${cachedFiles.length} files in cache` 
    });
    
    // Step 3: Determine which files need processing
    const { newFiles, modifiedFiles, deletedFiles, unchangedFiles } = await this.compareFiles(currentFiles, cachedFiles);
    
    this.audioPlayerService.eventEmitter.emit('log', { 
      type: 'info', 
      message: `🎵 File analysis:\n      - New files: ${newFiles.length}\n      - Modified files: ${modifiedFiles.length}\n      - Deleted files: ${deletedFiles.length}\n      - Unchanged files: ${unchangedFiles.length}` 
    });
    
    // Step 4: Remove deleted files from cache
    if (deletedFiles.length > 0) {
      await this.removeDeletedFiles(deletedFiles);
    }
    
    // Step 5: Process only new and modified files
    const filesToProcess = [...newFiles, ...modifiedFiles];
    const processedFiles = [];
    
    if (filesToProcess.length > 0) {
      this.audioPlayerService.eventEmitter.emit('log', { 
        type: 'info', 
        message: `🎵 Processing metadata for ${filesToProcess.length} files...` 
      });
      
      // Emit scan start event
      this.audioPlayerService.eventEmitter.emit('library-scan-progress', {
        phase: 'metadata',
        current: 0,
        total: filesToProcess.length,
        message: 'Extracting metadata...'
      });
      
      // Process files in parallel batches of 50 for speed
      const BATCH_SIZE = 50;
      for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
        const batch = filesToProcess.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (file) => {
            try {
              const metadata = await this.audioPlayerService.extractMetadata(file.path);
              const fileWithMetadata = {
                ...file,
                metadata: metadata,
                isMusic: true,
                type: 'audio'
              };
              
              // Cache the file with metadata
              await this.cacheFile(fileWithMetadata);
              return fileWithMetadata;
              
            } catch (error) {
              this.audioPlayerService.eventEmitter.emit('log', { 
                type: 'warning', 
                message: `🎵 Failed to extract metadata for ${file.name}: ${error.message}` 
              });
              
              // Cache with basic metadata
              const basicFile = {
                ...file,
                metadata: {
                  format: { duration: 0 },
                  common: {
                    title: file.name.replace(/\.\w+$/, ''),
                    artist: 'Unknown Artist',
                    album: 'Unknown Album'
                  }
                },
                isMusic: true,
                type: 'audio'
              };
              
              await this.cacheFile(basicFile);
              return basicFile;
            }
          })
        );
        
        // Collect successful results from batch
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            processedFiles.push(result.value);
          }
        }
        
        const currentProgress = Math.min(i + BATCH_SIZE, filesToProcess.length);
        
        // Emit progress update
        this.audioPlayerService.eventEmitter.emit('library-scan-progress', {
          phase: 'metadata',
          current: currentProgress,
          total: filesToProcess.length,
          message: `Processing ${currentProgress}/${filesToProcess.length} files...`
        });
        
        if (i + BATCH_SIZE < filesToProcess.length) {
          this.audioPlayerService.eventEmitter.emit('log', { 
            type: 'info', 
            message: `🎵 Processed ${currentProgress}/${filesToProcess.length} files...` 
          });
        }
      }
      
      // Emit completion
      this.audioPlayerService.eventEmitter.emit('library-scan-progress', {
        phase: 'complete',
        current: filesToProcess.length,
        total: filesToProcess.length,
        message: 'Scan complete'
      });
    }
    
    // Step 6: Load unchanged files from cache
    const cachedFilesWithMetadata = await this.loadCachedFiles(unchangedFiles);
    
    // Step 7: Combine all files
    const allFiles = [...processedFiles, ...cachedFilesWithMetadata];
    
    const endTime = Date.now();
    this.audioPlayerService.eventEmitter.emit('log', { 
      type: 'success', 
      message: `🎵 Smart scan complete in ${endTime - startTime}ms:\n      - Total files: ${allFiles.length}\n      - Processed: ${filesToProcess.length}\n      - From cache: ${unchangedFiles.length}` 
    });
    
    // Upsert all scanned files into main songs table (transactional)
    try {
      await this.upsertSongs(allFiles);
    } catch (error) {
      this.audioPlayerService.eventEmitter.emit('log', { 
        type: 'warning', 
        message: `🎵 Failed to upsert songs into main DB: ${error.message}` 
      });
    }

    return allFiles;
  }
  
  async scanFilesystem(libraryPath) {
    const audioFiles = [];
    
    const scanDirectory = async (dirPath) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (this.audioExtensions.includes(ext)) {
              const stats = await fs.stat(fullPath);
              const relativePath = path.relative(libraryPath, fullPath);
              
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
      } catch (error) {
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'warning', 
          message: `🎵 Error scanning directory ${dirPath}: ${error.message}` 
        });
      }
    };
    
    await scanDirectory(libraryPath);
    return audioFiles;
  }
  
  async getCachedFiles() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT file_path, file_name, relative_path, file_size, modified_time FROM music_files`;
      
      this.db.all(sql, [], (error, rows) => {
        if (error) {
          reject(error);
        } else {
          const cachedFiles = rows.map(row => ({
            path: row.file_path,
            name: row.file_name,
            relativePath: row.relative_path,
            size: row.file_size,
            modified: row.modified_time
          }));
          resolve(cachedFiles);
        }
      });
    });
  }

  /**
   * Get all cached files with metadata
   */
  async getAllMetadata() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT file_path, file_name, file_size, metadata_json FROM music_files`;
      
      this.db.all(sql, [], (error, rows) => {
        if (error) {
          reject(error);
        } else {
          const files = rows.map(row => {
            const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
            return {
              path: row.file_path,
              name: row.file_name,
              size: row.file_size,
              ...metadata
            };
          });
          resolve(files);
        }
      });
    });
  }
  
  async compareFiles(currentFiles, cachedFiles) {
    const cachedMap = new Map();
    cachedFiles.forEach(file => {
      cachedMap.set(file.path, file);
    });
    
    const currentMap = new Map();
    currentFiles.forEach(file => {
      currentMap.set(file.path, file);
    });
    
    const newFiles = [];
    const modifiedFiles = [];
    const unchangedFiles = [];
    
    // Find new and modified files
    for (const currentFile of currentFiles) {
      const cachedFile = cachedMap.get(currentFile.path);
      
      if (!cachedFile) {
        // New file
        newFiles.push(currentFile);
      } else if (cachedFile.modified !== currentFile.modified || cachedFile.size !== currentFile.size) {
        // Modified file
        modifiedFiles.push(currentFile);
      } else {
        // Unchanged file
        unchangedFiles.push(currentFile);
      }
    }
    
    // Find deleted files
    const deletedFiles = [];
    for (const cachedFile of cachedFiles) {
      if (!currentMap.has(cachedFile.path)) {
        deletedFiles.push(cachedFile);
      }
    }
    
    return { newFiles, modifiedFiles, deletedFiles, unchangedFiles };
  }
  
  async removeDeletedFiles(deletedFiles) {
    for (const file of deletedFiles) {
      await this.removeCachedFile(file.path);
    }
    this.audioPlayerService.eventEmitter.emit('log', { 
      type: 'success', 
      message: `🎵 Removed ${deletedFiles.length} deleted files from cache` 
    });
  }
  
  async cacheFile(file) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO music_files 
        (file_path, file_name, relative_path, file_size, modified_time, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `;
      
      const metadataJson = JSON.stringify(file.metadata);
      
      // Debug logging for MURDER PLOT
      if (file.name === 'MURDER PLOT.mp3') {
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `💾 cacheFile() called for MURDER PLOT.mp3:` 
        });
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `   Title in metadata: ${file.metadata?.common?.title}` 
        });
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `   Full metadata: ${JSON.stringify(file.metadata?.common, null, 2)}` 
        });
      }
      
      this.db.run(sql, [
        file.path,
        file.name,
        file.relativePath,
        file.size,
        file.modified,
        metadataJson
      ], (error) => {
        if (error) {
          this.audioPlayerService.eventEmitter.emit('log', { 
            type: 'error', 
            message: `❌ cacheFile() failed for ${file.name}: ${error.message || error}` 
          });
          reject(error);
        } else {
          if (file.name === 'MURDER PLOT.mp3') {
            this.audioPlayerService.eventEmitter.emit('log', { 
              type: 'success', 
              message: `   ✅ Successfully wrote to music_files cache` 
            });
          }
          resolve();
        }
      });
    });
  }
  
  async loadCachedFiles(files) {
    if (files.length === 0) return [];
    
    return new Promise((resolve, reject) => {
      const placeholders = files.map(() => '?').join(',');
      const sql = `SELECT * FROM music_files WHERE file_path IN (${placeholders})`;
      const filePaths = files.map(f => f.path);
      
      this.db.all(sql, filePaths, (error, rows) => {
        if (error) {
          reject(error);
        } else {
          const cachedFiles = rows.map(row => ({
            path: row.file_path,
            name: row.file_name,
            relativePath: row.relative_path,
            size: row.file_size,
            modified: row.modified_time,
            metadata: JSON.parse(row.metadata_json || '{}'),
            isMusic: true,
            type: 'audio'
          }));
          resolve(cachedFiles);
        }
      });
    });
  }
  
  async removeCachedFile(filePath) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM music_files WHERE file_path = ?`;
      
      this.db.run(sql, [filePath], function(error) {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
  
  async getCacheStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_files,
          MIN(created_at) as oldest_cache,
          MAX(updated_at) as newest_cache
        FROM music_files
      `;
      
      this.db.get(sql, [], (error, row) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            totalFiles: row.total_files,
            oldestCache: row.oldest_cache,
            newestCache: row.newest_cache
          });
        }
      });
    });
  }
  
  async clearCache() {
    const self = this;
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM music_files`;
      
      self.db.run(sql, [], function(error) {
        if (error) {
          reject(error);
        } else {
          self.audioPlayerService.eventEmitter.emit('log', { 
            type: 'success', 
            message: `🎵 Cleared cache of ${this.changes} files` 
          });
          resolve();
        }
      });
    });
  }
  
  /**
   * Write metadata updates directly to the audio file's ID3 tags
   */
  async updateFileMetadata(filePath, updates, libraryPath) {
    try {
      const NodeID3 = require('node-id3');
      
      // Read current tags from ALL formats (use music-metadata to get the authoritative version)
      const mm = require('music-metadata');
      const currentMetadata = await mm.parseFile(filePath);
      const currentTags = currentMetadata.common;
      
      // Build COMPLETE tag object (preserve all fields, update only what changed)
      const tags = {
        title: updates.title !== undefined ? updates.title : (currentTags.title || path.basename(filePath, path.extname(filePath))),
        artist: updates.artist !== undefined ? updates.artist : (currentTags.artist || 'Unknown Artist'),
        album: updates.album !== undefined ? updates.album : (currentTags.album || 'Unknown Album'),
        year: currentTags.year || undefined,
        trackNumber: currentTags.track?.no || undefined,
        genre: Array.isArray(currentTags.genre) ? currentTags.genre.join(', ') : currentTags.genre,
        albumartist: currentTags.albumartist || undefined,
        comment: currentTags.comment ? (Array.isArray(currentTags.comment) ? currentTags.comment.join(' ') : currentTags.comment) : undefined
      };
      
      // Log what's changing
      if (updates.title !== undefined) {
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `📝 Updating title: "${currentTags.title}" → "${updates.title}"` 
        });
      }
      if (updates.artist !== undefined) {
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `📝 Updating artist: "${currentTags.artist}" → "${updates.artist}"` 
        });
      }
      if (updates.album !== undefined) {
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `📝 Updating album: "${currentTags.album}" → "${updates.album}"` 
        });
      }
      
      if (Object.keys(tags).length === 0) {
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'warning', 
          message: '⚠️  No metadata updates provided' 
        });
        return { success: false, message: 'No updates provided' };
      }
      
      // FIRST: Remove legacy tag blocks in-place without remuxing
      this.audioPlayerService.eventEmitter.emit('log', { 
        type: 'info', 
        message: `🗑️  Removing existing tag blocks (APEv2/ID3v1/ID3v2) from: ${path.basename(filePath)}` 
      });
      
      try {
        // Remove ID3v2 header first using node-id3 (safe in-place)
        NodeID3.removeTags(filePath);
        
        const id3v1Removed = await removeId3v1InPlace(filePath);
        if (id3v1Removed) {
          this.audioPlayerService.eventEmitter.emit('log', { 
            type: 'success', 
            message: '✅ Removed ID3v1 footer in-place' 
          });
        }
        const apeFooterRemoved = await removeApeFooterInPlace(filePath);
        if (apeFooterRemoved) {
          this.audioPlayerService.eventEmitter.emit('log', { 
            type: 'success', 
            message: '✅ Removed APEv2 footer in-place' 
          });
        }
        const apeHeaderRemoved = await removeApeHeaderInPlace(filePath);
        if (apeHeaderRemoved) {
          this.audioPlayerService.eventEmitter.emit('log', { 
            type: 'success', 
            message: '✅ Removed APEv2 header in-place' 
          });
        }
      } catch (tagRemovalError) {
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'warning', 
          message: `⚠️  Tag removal encountered error: ${tagRemovalError.message}` 
        });
        // Continue anyway - we'll try to write new tags
      }
      
      // THEN: Write fresh ID3 tags
      const success = NodeID3.write(tags, filePath);
      
      if (success) {
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'success', 
          message: `✅ Successfully wrote ID3 tags to: ${path.basename(filePath)}` 
        });
        
        // Clear any cached metadata for this file
        if (this.audioPlayerService.metadataCache) {
          this.audioPlayerService.metadataCache.delete(filePath);
          this.audioPlayerService.eventEmitter.emit('log', { 
            type: 'info', 
            message: `🗑️  Cleared metadata cache for: ${path.basename(filePath)}` 
          });
        }
        
        // Small delay to ensure file write is flushed to disk
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Re-read the file to update cache with new metadata
        const stats = await fs.stat(filePath);
        const metadata = await this.audioPlayerService.extractMetadata(filePath);
        
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `📖 Re-read metadata after write:` 
        });
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `   Title: ${metadata.common?.title}` 
        });
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'info', 
          message: `   Artist: ${metadata.common?.artist}` 
        });
        
        // Compute relative path from library root (or use empty string if not provided)
        const relativePath = libraryPath ? path.relative(libraryPath, filePath) : '';
        
        // Update cache with all required fields
        await this.cacheFile({
          path: filePath,
          name: path.basename(filePath),
          relativePath: relativePath,
          size: stats.size,
          modified: Math.floor(stats.mtime.getTime() / 1000),
          metadata
        });
        
        // ALSO update the songs table (the one used by the UI)
        await this.upsertSongs([{
          path: filePath,
          name: path.basename(filePath),
          relativePath: relativePath,
          size: stats.size,
          modified: Math.floor(stats.mtime.getTime() / 1000),
          metadata
        }]);
        
        this.audioPlayerService.eventEmitter.emit('log', { 
          type: 'success', 
          message: `✅ Cache updated for: ${path.basename(filePath)}` 
        });
        
        return { success: true, metadata };
      } else {
        throw new Error('Failed to write ID3 tags');
      }
      
    } catch (error) {
      this.audioPlayerService.eventEmitter.emit('log', { 
        type: 'error', 
        message: `❌ Failed to update file metadata for ${path.basename(filePath)}: ${error.message || error}` 
      });
      throw error;
    }
  }
  
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.songsDb) {
      this.songsDb.close();
      this.songsDb = null;
    }
  }
}

module.exports = MusicLibraryCache;

// --- Low-level helpers ---
/**
 * Remove APEv2 tag in-place (no re-mux) if present at end of file.
 * Returns true if a tag was found and removed, false if no APE footer found.
 */
async function removeApeFooterInPlace(filePath) {
  let fd;
  try {
    const stat = await fsp.stat(filePath);
    const footerSize = 32; // APEv2 footer is 32 bytes ending with 'APETAGEX'
    if (stat.size <= footerSize) return false;

    fd = await fsp.open(filePath, 'r');
    const footer = Buffer.alloc(footerSize);
    await fd.read(footer, 0, footerSize, stat.size - footerSize);
    
    // Footer layout: 0-7 'APETAGEX', 8-11 version, 12-15 size (LE, tag size WITHOUT footer), 16-19 item count, 20-23 flags
    const magic = footer.slice(0, 8).toString('ascii');
    if (magic !== 'APETAGEX') {
      await fd.close();
      return false;
    }
    
    const tagSize = footer.readUInt32LE(12); // Size of tag data (excluding footer)
    const flags = footer.readUInt32LE(20);
    const hasHeader = (flags & 0x80000000) !== 0; // Bit 31 indicates header presence
    
    // Total size to remove: tag data + footer (32 bytes) + optional header (32 bytes)
    const totalSize = tagSize + footerSize + (hasHeader ? 32 : 0);
    
    // Sanity checks
    if (tagSize <= 0 || tagSize > stat.size || totalSize > stat.size) {
      await fd.close();
      return false;
    }
    
    await fd.close();
    fd = null;
    
    const newLength = stat.size - totalSize;
    await fsp.truncate(filePath, newLength);
    return true;
  } catch (err) {
    if (fd) {
      try { await fd.close(); } catch {}
    }
    return false;
  }
}

/**
 * Remove APEv2 header in-place (rare but possible). The header is also 32 bytes
 * starting with 'APETAGEX' at the beginning, with total size at offset 12.
 * We remove the entire header block by copying the file contents down.
 */
async function removeApeHeaderInPlace(filePath) {
  let fd;
  try {
    fd = await fsp.open(filePath, 'r+');
    const headerSize = 32;
    const header = Buffer.alloc(headerSize);
    await fd.read(header, 0, headerSize, 0);
    
    const magic = header.slice(0, 8).toString('ascii');
    if (magic !== 'APETAGEX') {
      await fd.close();
      return false;
    }
    
    const tagSize = header.readUInt32LE(12); // Size of tag data (excluding header)
    const totalSize = tagSize + headerSize; // Header + tag data
    
    if (tagSize <= 0 || totalSize <= 0) {
      await fd.close();
      return false;
    }
    
    // Shift file contents down by totalSize bytes
    const stat = await fd.stat();
    if (totalSize >= stat.size) {
      await fd.close();
      return false;
    }
    
    const remain = stat.size - totalSize;
    const bufSize = 64 * 1024;
    const buffer = Buffer.allocUnsafe(bufSize);
    let readPos = totalSize;
    let writePos = 0;
    
    while (readPos < stat.size) {
      const toRead = Math.min(bufSize, stat.size - readPos);
      const { bytesRead } = await fd.read(buffer, 0, toRead, readPos);
      if (bytesRead <= 0) break;
      await fd.write(buffer, 0, bytesRead, writePos);
      readPos += bytesRead;
      writePos += bytesRead;
    }
    
    await fd.truncate(remain);
    await fd.close();
    fd = null;
    return true;
  } catch (err) {
    if (fd) {
      try { await fd.close(); } catch {}
    }
    return false;
  }
}

/**
 * Remove ID3v1 tag (128-byte footer starting with 'TAG') in-place if present
 */
async function removeId3v1InPlace(filePath) {
  let fd;
  try {
    const stat = await fsp.stat(filePath);
    const size = 128;
    if (stat.size <= size) return false;
    
    fd = await fsp.open(filePath, 'r');
    const buf = Buffer.alloc(size);
    await fd.read(buf, 0, size, stat.size - size);
    
    if (buf.slice(0, 3).toString('ascii') !== 'TAG') {
      await fd.close();
      return false;
    }
    
    await fd.close();
    fd = null;
    
    await fsp.truncate(filePath, stat.size - size);
    return true;
  } catch (err) {
    if (fd) {
      try { await fd.close(); } catch {}
    }
    return false;
  }
}

// --- Helpers for songs DB upsert ---
MusicLibraryCache.prototype.runSongsSql = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.songsDb.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

MusicLibraryCache.prototype.execSongsSql = function(sql) {
  return new Promise((resolve, reject) => {
    this.songsDb.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

MusicLibraryCache.prototype.upsertSongs = async function(files) {
  if (!this.songsDb || !files || files.length === 0) return;
  await this.execSongsSql('BEGIN TRANSACTION');
  try {
    for (const file of files) {
      if (!file || !file.path) continue;
      // Only consider audio files
      const ext = path.extname(file.path).toLowerCase();
      if (!this.audioExtensions.includes(ext)) continue;

      const filePath = file.path;
      const fileName = file.name || path.basename(file.path);
      const relativePath = file.relativePath || null;
      const metadata = file.metadata || {};
      const fmt = metadata.format || {};
      const com = metadata.common || {};
      const duration = Math.floor(fmt.duration || 0);
      const title = com.title || fileName.replace(/\.[^/.]+$/, '');
      const artist = com.artist || null;
      const album = com.album || null;
      const albumArtist = com.albumartist || null;
      const year = com.year || null;
      const trackNumber = (com.track && (com.track.no || com.track.number)) ? (com.track.no || com.track.number) : null;
      const genre = com.genre ? (Array.isArray(com.genre) ? com.genre.join(', ') : String(com.genre)) : null;
      const bitrate = fmt.bitrate || null;
      const sampleRate = fmt.sampleRate || null;
      const codec = fmt.codec || fmt.container || null;

      // UPDATE first; INSERT if no row
      const update = await this.runSongsSql(`
        UPDATE songs SET
          file_name = ?,
          relative_path = ?,
          duration = ?,
          title = ?,
          artist = ?,
          album = ?,
          album_artist = ?,
          year = ?,
          track_number = ?,
          genre = ?,
          bitrate = ?,
          sample_rate = ?,
          codec = ?,
          modified_date = strftime('%s','now')
        WHERE file_path = ?
      `, [fileName, relativePath, duration, title, artist, album, albumArtist, year, trackNumber, genre, bitrate, sampleRate, codec, filePath]);

      if (update.changes === 0) {
        await this.runSongsSql(`
          INSERT INTO songs (
            file_path, file_name, relative_path, duration, title, artist, album, album_artist,
            year, track_number, genre, bitrate, sample_rate, codec
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [filePath, fileName, relativePath, duration, title, artist, album, albumArtist, year, trackNumber, genre, bitrate, sampleRate, codec]);
      }
    }
    await this.execSongsSql('COMMIT');
  } catch (err) {
    try { await this.execSongsSql('ROLLBACK'); } catch (_) {}
    throw err;
  }
};
