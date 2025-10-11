// src/main/services/MusicLibraryCache.js - Smart Music Library Caching

const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

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
    console.log('🎵 Initializing music library cache...');
    
    // Create cache database
    this.db = new sqlite3.Database(this.cachePath);
    // Open main songs database (created by Database.initializeDatabase)
    this.songsDb = new sqlite3.Database(this.songsDbPath);
    
    await this.createTables();
    console.log('🎵 Music cache database initialized');
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
    console.log('🎵 Starting smart music library scan...');
    const startTime = Date.now();
    
    // Step 1: Scan filesystem for all audio files
    const currentFiles = await this.scanFilesystem(libraryPath);
    console.log(`🎵 Found ${currentFiles.length} audio files in filesystem`);
    
    // Step 2: Get cached files from database
    const cachedFiles = await this.getCachedFiles();
    console.log(`🎵 Found ${cachedFiles.length} files in cache`);
    
    // Step 3: Determine which files need processing
    const { newFiles, modifiedFiles, deletedFiles, unchangedFiles } = await this.compareFiles(currentFiles, cachedFiles);
    
    console.log(`🎵 File analysis:
      - New files: ${newFiles.length}
      - Modified files: ${modifiedFiles.length}  
      - Deleted files: ${deletedFiles.length}
      - Unchanged files: ${unchangedFiles.length}`);
    
    // Step 4: Remove deleted files from cache
    if (deletedFiles.length > 0) {
      await this.removeDeletedFiles(deletedFiles);
    }
    
    // Step 5: Process only new and modified files
    const filesToProcess = [...newFiles, ...modifiedFiles];
    const processedFiles = [];
    
    if (filesToProcess.length > 0) {
      console.log(`🎵 Processing metadata for ${filesToProcess.length} files...`);
      
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
              console.warn(`🎵 Failed to extract metadata for ${file.name}:`, error.message);
              
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
          console.log(`🎵 Processed ${currentProgress}/${filesToProcess.length} files...`);
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
    console.log(`🎵 Smart scan complete in ${endTime - startTime}ms:
      - Total files: ${allFiles.length}
      - Processed: ${filesToProcess.length}
      - From cache: ${unchangedFiles.length}`);
    
    // Upsert all scanned files into main songs table (transactional)
    try {
      await this.upsertSongs(allFiles);
    } catch (error) {
      console.warn('🎵 Failed to upsert songs into main DB:', error.message);
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
        console.warn(`🎵 Error scanning directory ${dirPath}:`, error.message);
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
    console.log(`🎵 Removed ${deletedFiles.length} deleted files from cache`);
  }
  
  async cacheFile(file) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO music_files 
        (file_path, file_name, relative_path, file_size, modified_time, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `;
      
      const metadataJson = JSON.stringify(file.metadata);
      
      this.db.run(sql, [
        file.path,
        file.name,
        file.relativePath,
        file.size,
        file.modified,
        metadataJson
      ], function(error) {
        if (error) {
          reject(error);
        } else {
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
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM music_files`;
      
      this.db.run(sql, [], function(error) {
        if (error) {
          reject(error);
        } else {
          console.log(`🎵 Cleared cache of ${this.changes} files`);
          resolve();
        }
      });
    });
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
