// src/main/services/VideoCompatibilityService.js - Native-player compatibility cache for unsupported audio codecs.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const BROWSER_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le']);

class VideoCompatibilityService {
  constructor(manager, options = {}) {
    this.manager = manager;
    this.ffmpegPath = options.ffmpegPath || ffmpegPath;
    this.ffprobePath = options.ffprobePath || ffprobePath;
    this.cacheDir = options.cacheDir || path.join(manager.appDataPath, 'video-compatibility');
    this.probeFile = options.probeFile || ((filePath) => this.probeWithFfprobe(filePath));
    this.transcodeFile = options.transcodeFile || ((sourcePath, outputPath, mediaInfo, onProgress) => this.transcodeWithFfmpeg(sourcePath, outputPath, mediaInfo, onProgress));
    this.preparePromises = new Map();
  }

  async initialize() {
    await fs.ensureDir(this.cacheDir);
  }

  async preparePlaybackSource(filePath) {
    const mediaInfo = await this.probeFile(filePath);
    const audioStream = mediaInfo.streams.find((stream) => stream.codec_type === 'audio');
    if (!audioStream || isBrowserAudioCompatible(audioStream.codec_name)) {
      return {
        playbackPath: filePath,
        transcoded: false,
        audioCodec: audioStream?.codec_name || null
      };
    }

    const stats = await fs.stat(filePath);
    const cachePath = this.cachePathFor(filePath, stats);
    if (await fs.pathExists(cachePath)) {
      return {
        playbackPath: cachePath,
        transcoded: true,
        audioCodec: audioStream.codec_name
      };
    }

    if (this.preparePromises.has(cachePath)) return this.preparePromises.get(cachePath);

    const preparePromise = this.createCompatibleCopy(filePath, cachePath, mediaInfo, audioStream.codec_name);
    this.preparePromises.set(cachePath, preparePromise);
    try {
      return await preparePromise;
    } finally {
      this.preparePromises.delete(cachePath);
    }
  }

  cachePathFor(filePath, stats) {
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${filePath}\0${stats.size}\0${stats.mtimeMs}`)
      .digest('hex');
    return path.join(this.cacheDir, `${cacheKey}.mp4`);
  }

  async createCompatibleCopy(sourcePath, cachePath, mediaInfo, audioCodec) {
    const partialPath = cachePath.replace(/\.mp4$/, '.partial.mp4');
    await fs.remove(partialPath);

    try {
      await this.transcodeFile(sourcePath, partialPath, mediaInfo, (progress) => {
        this.manager.emit('video-compatibility-progress', { sourcePath, ...progress });
      });
      await fs.move(partialPath, cachePath, { overwrite: true });
      this.manager.emit('video-compatibility-ready', { sourcePath, playbackPath: cachePath, audioCodec });
      return { playbackPath: cachePath, transcoded: true, audioCodec };
    } catch (error) {
      await fs.remove(partialPath);
      throw new Error(`Could not create a compatible audio copy: ${error.message}`);
    }
  }

  async probeWithFfprobe(filePath) {
    const output = await runProcess(this.ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,codec_name,profile',
      '-of', 'json',
      filePath
    ]);
    const metadata = JSON.parse(output);
    if (!Array.isArray(metadata.streams)) {
      throw new Error('ffprobe returned no stream metadata.');
    }
    return metadata;
  }

  async transcodeWithFfmpeg(sourcePath, outputPath, mediaInfo, onProgress) {
    const videoStream = mediaInfo.streams.find((stream) => stream.codec_type === 'video');
    const durationSeconds = Number(mediaInfo.format?.duration);
    let progressBuffer = '';
    const args = [
      '-y',
      '-progress', 'pipe:1',
      '-nostats',
      '-i', sourcePath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-map_metadata', '0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-ac', '2',
      '-b:a', '192k'
    ];
    if (videoStream?.codec_name === 'hevc') args.push('-tag:v', 'hvc1');
    args.push('-movflags', '+faststart', outputPath);
    await runProcess(this.ffmpegPath, args, {
      onStdout: (chunk) => {
        progressBuffer += chunk;
        const lines = progressBuffer.split(/\r?\n/);
        progressBuffer = lines.pop();
        for (const line of lines) {
          const progress = parseProgressLine(line, durationSeconds);
          if (progress && onProgress) onProgress(progress);
        }
      }
    });
    if (onProgress) onProgress({ percent: 100, seconds: durationSeconds, durationSeconds });
  }
}

function isBrowserAudioCompatible(codecName) {
  return BROWSER_AUDIO_CODECS.has(String(codecName || '').toLowerCase());
}

function parseProgressLine(line, durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const [key, value] = line.split('=');
  if (key !== 'out_time' || !value) return null;
  const seconds = parseTimestamp(value);
  if (!Number.isFinite(seconds)) return null;
  return {
    percent: Math.min(100, Math.max(0, Math.floor((seconds / durationSeconds) * 100))),
    seconds,
    durationSeconds
  };
}

function parseTimestamp(value) {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited with code ${code}.`));
    });
  });
}

module.exports = VideoCompatibilityService;
module.exports.isBrowserAudioCompatible = isBrowserAudioCompatible;
module.exports.parseProgressLine = parseProgressLine;
