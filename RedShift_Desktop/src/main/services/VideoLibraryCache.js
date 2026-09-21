// src/main/services/VideoLibraryCache.js
// Local desktop video library: filesystem scan, change diffing, and videos table CRUD.

const path = require('path');
const fs = require('fs-extra');
const mm = require('music-metadata');

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'];

class VideoLibraryCache {
  constructor(manager) {
    this.manager = manager;
    this.videoExtensions = VIDEO_EXTENSIONS;
  }

  get db() {
    return this.manager.db;
  }

  emitLog(type, message) {
    try {
      this.manager.emit('log', { type, message });
    } catch (_) {
      // Logging must not interrupt a scan.
    }
  }

  runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (error) {
        if (error) reject(error);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  allSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows);
      });
    });
  }

  async scanVideoLibrary(libraryPath) {
    this.emitLog('info', '🎬 Starting video library scan...');
    const startTime = Date.now();

    const currentFiles = await this.scanFilesystem(libraryPath);
    const cachedRows = await this.getCachedRows();
    const { newFiles, modifiedFiles, unchangedFiles, deletedPaths } = this.compareFiles(currentFiles, cachedRows);

    if (deletedPaths.length > 0) {
      await this.removeVideos(deletedPaths);
    }

    for (const file of [...newFiles, ...modifiedFiles]) {
      await this.upsertVideoFile(file);
    }

    for (const file of unchangedFiles) {
      await this.updateVideoOrganization(file);
    }

    const elapsedMs = Date.now() - startTime;
    this.emitLog(
      'success',
      `🎬 Video scan complete in ${elapsedMs}ms: ${newFiles.length} new, ${modifiedFiles.length} modified, ${deletedPaths.length} removed, ${unchangedFiles.length} unchanged`
    );
    this.manager.emit('video-scan-progress', { phase: 'complete', total: currentFiles.length });

    return this.getAllVideos();
  }

  async scanFilesystem(libraryPath) {
    const videoFiles = [];

    const scanDirectory = async (dirPath) => {
      let entries;
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch (error) {
        this.emitLog('warning', `🎬 Error scanning directory ${dirPath}: ${error.message}`);
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.videoExtensions.includes(ext)) {
            try {
              const stats = await fs.stat(fullPath);
              const relativePath = path.relative(libraryPath, fullPath);
              const embeddedMetadata = await this.extractEmbeddedMetadata(fullPath);
              videoFiles.push({
                path: fullPath,
                name: entry.name,
                relativePath,
                size: stats.size,
                modified: Math.floor(stats.mtime.getTime() / 1000),
                ...classifyVideo(relativePath, entry.name, embeddedMetadata)
              });
            } catch (error) {
              this.emitLog('warning', `🎬 Skipping unavailable video ${fullPath}: ${error.message}`);
            }
          }
        }
      }
    };

    await scanDirectory(libraryPath);
    return videoFiles;
  }

  async extractEmbeddedMetadata(filePath) {
    try {
      const metadata = await mm.parseFile(filePath, { duration: false, skipCovers: true });
      return parseEmbeddedMetadata(metadata);
    } catch (_) {
      // Embedded tags are optional enrichment. Unreadable or unsupported containers still
      // participate in folder and filename classification.
      return null;
    }
  }

  async getCachedRows() {
    const rows = await this.allSql('SELECT file_path, file_size, modified_time FROM videos');
    return rows.map((row) => ({ path: row.file_path, size: row.file_size, modified: row.modified_time }));
  }

  compareFiles(currentFiles, cachedRows) {
    const cachedMap = new Map(cachedRows.map((row) => [row.path, row]));
    const currentPaths = new Set(currentFiles.map((file) => file.path));
    const newFiles = [];
    const modifiedFiles = [];
    const unchangedFiles = [];

    for (const file of currentFiles) {
      const cached = cachedMap.get(file.path);
      if (!cached) {
        newFiles.push(file);
      } else if (cached.modified !== file.modified || cached.size !== file.size) {
        modifiedFiles.push(file);
      } else {
        unchangedFiles.push(file);
      }
    }

    const deletedPaths = cachedRows.filter((row) => !currentPaths.has(row.path)).map((row) => row.path);
    return { newFiles, modifiedFiles, unchangedFiles, deletedPaths };
  }

  async removeVideos(filePaths) {
    if (filePaths.length === 0) return;
    const placeholders = filePaths.map(() => '?').join(',');
    await this.runSql(`DELETE FROM videos WHERE file_path IN (${placeholders})`, filePaths);
    this.emitLog('success', `🎬 Removed ${filePaths.length} deleted video(s) from the library`);
  }

  async upsertVideoFile(file) {
    const classification = classificationFor(file);
    const update = await this.runSql(
      `UPDATE videos SET file_name = ?, relative_path = ?, file_size = ?, modified_time = ?, title = ?, content_kind = ?, series_title = ?, series_key = ?, season_number = ?, episode_start = ?, episode_end = ?, group_source = ?, duration = NULL, width = NULL, height = NULL, playback_supported = NULL, last_position_seconds = 0, watched = 0, modified_date = strftime('%s','now') WHERE file_path = ?`,
      [
        file.name,
        file.relativePath,
        file.size,
        file.modified,
        classification.title,
        classification.contentKind,
        classification.seriesTitle,
        classification.seriesKey,
        classification.seasonNumber,
        classification.episodeStart,
        classification.episodeEnd,
        classification.groupSource,
        file.path
      ]
    );

    if (update.changes === 0) {
      await this.runSql(
        `INSERT INTO videos (file_path, file_name, relative_path, file_size, modified_time, title, content_kind, series_title, series_key, season_number, episode_start, episode_end, group_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          file.path,
          file.name,
          file.relativePath,
          file.size,
          file.modified,
          classification.title,
          classification.contentKind,
          classification.seriesTitle,
          classification.seriesKey,
          classification.seasonNumber,
          classification.episodeStart,
          classification.episodeEnd,
          classification.groupSource
        ]
      );
    }
  }

  async updateVideoOrganization(file) {
    const classification = classificationFor(file);
    await this.runSql(
      `UPDATE videos SET title = ?, content_kind = ?, series_title = ?, series_key = ?, season_number = ?, episode_start = ?, episode_end = ?, group_source = ? WHERE file_path = ?`,
      [
        classification.title,
        classification.contentKind,
        classification.seriesTitle,
        classification.seriesKey,
        classification.seasonNumber,
        classification.episodeStart,
        classification.episodeEnd,
        classification.groupSource,
        file.path
      ]
    );
  }

  async getAllVideos() {
    const rows = await this.allSql('SELECT * FROM videos ORDER BY title COLLATE NOCASE ASC');
    return rows.map((row) => ({
      id: row.id,
      path: row.file_path,
      name: row.file_name,
      relativePath: row.relative_path,
      size: row.file_size,
      modified: row.modified_time,
      title: row.title || row.file_name,
      contentKind: row.content_kind || 'other',
      seriesTitle: row.series_title,
      seriesKey: row.series_key,
      seasonNumber: row.season_number,
      episodeStart: row.episode_start,
      episodeEnd: row.episode_end,
      groupSource: row.group_source || 'unclassified',
      duration: row.duration,
      width: row.width,
      height: row.height,
      playbackSupported: row.playback_supported === null ? null : !!row.playback_supported,
      lastPositionSeconds: row.last_position_seconds || 0,
      watched: !!row.watched
    }));
  }

  async updatePlaybackState(filePath, updates = {}) {
    const fields = [];
    const params = [];

    if (updates.durationSeconds !== undefined && updates.durationSeconds !== null) {
      fields.push('duration = ?');
      params.push(Math.floor(updates.durationSeconds));
    }
    if (updates.width !== undefined && updates.width !== null) {
      fields.push('width = ?');
      params.push(updates.width);
    }
    if (updates.height !== undefined && updates.height !== null) {
      fields.push('height = ?');
      params.push(updates.height);
    }
    if (updates.playbackSupported !== undefined && updates.playbackSupported !== null) {
      fields.push('playback_supported = ?');
      params.push(updates.playbackSupported ? 1 : 0);
    }
    if (updates.positionSeconds !== undefined && updates.positionSeconds !== null) {
      fields.push('last_position_seconds = ?');
      params.push(Math.floor(updates.positionSeconds));
    }
    if (updates.watched !== undefined && updates.watched !== null) {
      fields.push('watched = ?');
      params.push(updates.watched ? 1 : 0);
    }

    if (fields.length === 0) return { changes: 0 };

    fields.push(`modified_date = strftime('%s','now')`);
    params.push(filePath);
    return this.runSql(`UPDATE videos SET ${fields.join(', ')} WHERE file_path = ?`, params);
  }

  async importPaths(paths, libraryPath) {
    let filesAdded = 0;

    const copyDirectory = async (src, dest) => {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          await copyDirectory(srcPath, destPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.videoExtensions.includes(ext)) {
            await fs.copyFile(srcPath, destPath);
            filesAdded += 1;
          }
        }
      }
    };

    for (const itemPath of paths) {
      const stat = await fs.stat(itemPath);
      const itemName = path.basename(itemPath);
      if (stat.isDirectory()) {
        await copyDirectory(itemPath, path.join(libraryPath, itemName));
      } else if (stat.isFile()) {
        const ext = path.extname(itemName).toLowerCase();
        if (this.videoExtensions.includes(ext)) {
          await fs.copyFile(itemPath, path.join(libraryPath, itemName));
          filesAdded += 1;
        }
      }
    }

    this.emitLog('success', `🎬 Added ${filesAdded} video file(s) to the library`);
    return filesAdded;
  }
}

module.exports = VideoLibraryCache;

function classificationFor(file) {
  return file.contentKind ? file : classifyVideo(file.relativePath, file.name);
}

function classifyVideo(relativePath, fileName, embeddedMetadata = null) {
  const pathSegments = relativePath.split(path.sep).filter(Boolean);
  const folderSegments = pathSegments.slice(0, -1);
  const normalizedFolders = folderSegments.map((segment) => segment.trim().toLowerCase());
  const fileStem = fileName.replace(/\.[^/.]+$/, '');
  const episodeInfo = parseEpisodeInfo([...folderSegments, fileStem]);
  const tvRootIndex = normalizedFolders.findIndex((segment) => ['tv', 'tv shows', 'television', 'series', 'shows'].includes(segment));
  const movieRootIndex = normalizedFolders.findIndex((segment) => ['movie', 'movies', 'film', 'films'].includes(segment));

  if (tvRootIndex !== -1 || episodeInfo || embeddedMetadata?.seriesTitle) {
    const folderTitle = tvRootIndex !== -1 ? folderSegments[tvRootIndex + 1] : null;
    const seriesTitle = cleanDisplayTitle(folderTitle || embeddedMetadata?.seriesTitle || episodeInfo?.seriesCandidate || fileStem);
    return {
      title: embeddedMetadata?.title || cleanDisplayTitle(fileStem),
      contentKind: 'tv',
      seriesTitle,
      seriesKey: normalizeKey(seriesTitle),
      seasonNumber: episodeInfo?.seasonNumber ?? embeddedMetadata?.seasonNumber ?? null,
      episodeStart: episodeInfo?.episodeStart ?? embeddedMetadata?.episodeStart ?? null,
      episodeEnd: episodeInfo?.episodeEnd ?? embeddedMetadata?.episodeEnd ?? null,
      groupSource: tvRootIndex !== -1 ? 'folder' : embeddedMetadata?.seriesTitle && !episodeInfo ? 'embedded' : 'filename'
    };
  }

  return {
    title: embeddedMetadata?.title || cleanDisplayTitle(fileStem),
    contentKind: movieRootIndex !== -1 ? 'movie' : embeddedMetadata?.contentKind || 'other',
    seriesTitle: null,
    seriesKey: null,
    seasonNumber: null,
    episodeStart: null,
    episodeEnd: null,
    groupSource: movieRootIndex !== -1 ? 'folder' : embeddedMetadata ? 'embedded' : 'unclassified'
  };
}

function parseEpisodeInfo(candidates) {
  for (const candidate of [...candidates].reverse()) {
    const seasonEpisode = /(?:^|[.\s_-])s(?:eason)?\s*0*(\d{1,2})[.\s_-]*e(?:pisode)?\s*0*(\d{1,3})(?:[.\s_-]*(?:e(?:pisode)?\s*)?0*(\d{1,3}))?(?=$|[.\s_-])/i.exec(candidate);
    if (seasonEpisode) {
      return {
        seriesCandidate: candidate.slice(0, seasonEpisode.index),
        seasonNumber: Number(seasonEpisode[1]),
        episodeStart: Number(seasonEpisode[2]),
        episodeEnd: seasonEpisode[3] ? Number(seasonEpisode[3]) : null
      };
    }

    const xStyle = /(?:^|[.\s_-])(\d{1,2})x(\d{1,3})(?:[.\s_-]*(\d{1,3}))?(?=$|[.\s_-])/i.exec(candidate);
    if (xStyle) {
      return {
        seriesCandidate: candidate.slice(0, xStyle.index),
        seasonNumber: Number(xStyle[1]),
        episodeStart: Number(xStyle[2]),
        episodeEnd: xStyle[3] ? Number(xStyle[3]) : null
      };
    }
  }

  return null;
}

function cleanDisplayTitle(value) {
  return String(value || '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value) {
  return cleanDisplayTitle(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseEmbeddedMetadata(metadata) {
  const nativeTags = Object.values(metadata.native || {}).flat();
  const common = metadata.common || {};
  const tagValue = (...identifiers) => {
    const normalizedIdentifiers = identifiers.map(normalizeTagIdentifier);
    const tag = nativeTags.find((entry) => normalizedIdentifiers.includes(normalizeTagIdentifier(entry.id)));
    return tag ? tag.value : undefined;
  };
  const title = cleanDisplayTitle(common.title || tagValue('title', '©nam'));
  const seriesTitle = cleanDisplayTitle(tagValue('tvsh', 'tvshow', 'show', 'series'));
  const seasonNumber = positiveInteger(tagValue('tvsn', 'season', 'seasonnumber'));
  const episodeStart = positiveInteger(tagValue('tves', 'episode', 'episodenumber', 'partnumber'));
  const mediaType = String(tagValue('stik', 'mediatype', 'contenttype') || '').toLowerCase();
  const contentKind = mediaType.includes('tv') || seriesTitle || seasonNumber || episodeStart
    ? 'tv'
    : mediaType.includes('movie') || mediaType === '9'
      ? 'movie'
      : null;

  if (!title && !seriesTitle && !seasonNumber && !episodeStart && !contentKind) return null;
  return { title: title || null, seriesTitle: seriesTitle || null, seasonNumber, episodeStart, episodeEnd: null, contentKind };
}

function normalizeTagIdentifier(value) {
  return String(value || '').replace(/[^a-z0-9©]+/gi, '').toLowerCase();
}

function positiveInteger(value) {
  const match = String(value ?? '').match(/\d+/);
  return match && Number(match[0]) > 0 ? Number(match[0]) : null;
}

module.exports.classifyVideo = classifyVideo;
module.exports.parseEmbeddedMetadata = parseEmbeddedMetadata;
