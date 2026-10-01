// src/main/services/VideoThumbnailService.js - Persistent still-image cache for local video-library fallback artwork.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

class VideoThumbnailService {
  constructor(manager, options = {}) {
    this.manager = manager;
    this.ffmpegPath = options.ffmpegPath || ffmpegPath;
    this.cacheDir = options.cacheDir || path.join(manager.appDataPath, 'video-thumbnails');
    this.captureFrame = options.captureFrame || ((sourcePath, outputPath, duration) => this.captureFrameWithFfmpeg(sourcePath, outputPath, duration));
    this.thumbnailPromises = new Map();
  }

  async initialize() {
    await fs.ensureDir(this.cacheDir);
  }

  cachePathFor(file) {
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${file.path}\0${file.size}\0${file.modified}`)
      .digest('hex');
    return path.join(this.cacheDir, `${cacheKey}.jpg`);
  }

  async createThumbnail(file, duration) {
    const cachePath = this.cachePathFor(file);
    if (await fs.pathExists(cachePath)) return cachePath;
    if (this.thumbnailPromises.has(cachePath)) return this.thumbnailPromises.get(cachePath);

    const createPromise = this.createCachedThumbnail(file.path, cachePath, duration);
    this.thumbnailPromises.set(cachePath, createPromise);
    try {
      return await createPromise;
    } finally {
      this.thumbnailPromises.delete(cachePath);
    }
  }

  async createCachedThumbnail(sourcePath, cachePath, duration) {
    const partialPath = cachePath.replace(/\.jpg$/, '.partial.jpg');
    await fs.remove(partialPath);
    try {
      await this.captureFrame(sourcePath, partialPath, duration);
      if (!await fs.pathExists(partialPath)) {
        throw new Error('FFmpeg completed without producing an image frame.');
      }
      await fs.move(partialPath, cachePath, { overwrite: true });
      return cachePath;
    } catch (error) {
      await fs.remove(partialPath);
      throw new Error(`Could not create a video thumbnail: ${error.message}`);
    }
  }

  async captureFrameWithFfmpeg(sourcePath, outputPath, duration) {
    const seekSeconds = thumbnailTimestamp(duration);
    await runProcess(this.ffmpegPath, [
      '-y',
      '-ss', String(seekSeconds),
      '-i', sourcePath,
      '-map', '0:v:0',
      '-frames:v', '1',
      '-vf', 'scale=640:-2',
      '-q:v', '4',
      outputPath
    ]);
  }
}

function thumbnailTimestamp(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 5;
  const preferredTimestamp = Math.min(45, Math.max(3, Math.floor(duration * 0.1)));
  return Math.min(preferredTimestamp, Math.max(0, duration - 0.25));
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited with code ${code}.`));
    });
  });
}

module.exports = VideoThumbnailService;
module.exports.thumbnailTimestamp = thumbnailTimestamp;
