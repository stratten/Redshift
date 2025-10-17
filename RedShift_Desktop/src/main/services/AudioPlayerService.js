// src/main/services/AudioPlayerService.js - Audio Playback Management Service
const path = require('path');
const fs = require('fs-extra');
const mm = require('music-metadata');
const Jimp = require('jimp');

class AudioPlayerService {
  constructor(eventEmitter, settings) {
    this.eventEmitter = eventEmitter;
    this.settings = settings;
    
    // Audio state
    this.currentTrack = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.volume = 1.0;
    this.position = 0; // Current position in seconds
    this.duration = 0; // Track duration in seconds
    this.isMuted = false;
    this.previousVolume = 1.0;
    
    // Playback modes
    this.shuffleMode = false;
    this.repeatMode = 'none'; // 'none', 'one', 'all'
    
    // Queue management
    this.queue = [];
    this.queueIndex = 0;
    this.originalQueue = []; // For shuffle mode
    this.playHistory = [];
    
    // Supported audio formats
    this.audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4p', '.ogg', '.opus'];
    
    // Metadata cache
    this.metadataCache = new Map();
    this.albumArtCache = new Map();
    
    // Track loading state
    this.isLoading = false;
    this.loadingProgress = 0;
    
    console.log('AudioPlayerService initialized');
  }
  
  /**
   * Load and play a track by file path
   */
  async loadTrack(filePath) {
    try {
      this.isLoading = true;
      this.eventEmitter.emit('audio-loading-start', { filePath });
      
      // Validate file exists and is audio
      if (!await fs.pathExists(filePath)) {
        throw new Error(`Audio file not found: ${filePath}`);
      }
      
      const ext = path.extname(filePath).toLowerCase();
      if (!this.audioExtensions.includes(ext)) {
        throw new Error(`Unsupported audio format: ${ext}`);
      }
      
      // Extract metadata if not cached
      let metadata = this.metadataCache.get(filePath);
      if (!metadata) {
        metadata = await this.extractMetadata(filePath);
        this.metadataCache.set(filePath, metadata);
      }
      
      // Stop current playback
      await this.stop();
      
      // Set current track
      this.currentTrack = {
        filePath: filePath,
        filename: path.basename(filePath),
        metadata: metadata,
        loadedAt: Date.now()
      };
      
      this.duration = metadata.format.duration || 0;
      this.position = 0;
      this.isLoading = false;
      
      // Emit track loaded event
      this.eventEmitter.emit('audio-track-loaded', {
        track: this.currentTrack,
        duration: this.duration
      });
      
      this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
      
      return this.currentTrack;
      
    } catch (error) {
      this.isLoading = false;
      this.eventEmitter.emit('audio-error', { 
        error: error.message, 
        filePath: filePath 
      });
      throw error;
    }
  }
  
  /**
   * Play the current track or resume if paused
   */
  async play() {
    try {
      if (!this.currentTrack) {
        throw new Error('No track loaded');
      }
      
      if (this.isPaused) {
        // Resume playback
        this.isPaused = false;
        this.isPlaying = true;
      } else {
        // Start playback from beginning or current position
        this.isPlaying = true;
        this.isPaused = false;
        
        // Start position tracking
        this.startPositionTracking();
      }
      
      this.eventEmitter.emit('audio-play', {
        track: this.currentTrack,
        position: this.position
      });
      
      this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
      
      // Add to play history
      this.addToPlayHistory(this.currentTrack);
      
    } catch (error) {
      this.eventEmitter.emit('audio-error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Pause playback
   */
  async pause() {
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    this.isPaused = true;
    
    this.stopPositionTracking();
    
    this.eventEmitter.emit('audio-pause', {
      track: this.currentTrack,
      position: this.position
    });
    
    this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
  }
  
  /**
   * Stop playback
   */
  async stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.position = 0;
    
    this.stopPositionTracking();
    
    this.eventEmitter.emit('audio-stop', {
      track: this.currentTrack
    });
    
    this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
  }
  
  /**
   * Seek to specific position in seconds
   */
  async seek(positionSeconds) {
    if (!this.currentTrack) return;
    
    this.position = Math.max(0, Math.min(positionSeconds, this.duration));
    
    this.eventEmitter.emit('audio-seek', {
      track: this.currentTrack,
      position: this.position
    });
    
    this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
  }
  
  /**
   * Set volume (0.0 to 1.0)
   */
  async setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    
    // Update settings
    if (this.settings) {
      this.settings.volume = this.volume;
    }
    
    this.eventEmitter.emit('audio-volume-changed', {
      volume: this.volume,
      isMuted: this.isMuted
    });
    
    this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
  }
  
  /**
   * Toggle mute
   */
  async toggleMute() {
    if (this.isMuted) {
      this.isMuted = false;
      this.volume = this.previousVolume;
    } else {
      this.previousVolume = this.volume;
      this.isMuted = true;
      this.volume = 0;
    }
    
    this.eventEmitter.emit('audio-volume-changed', {
      volume: this.volume,
      isMuted: this.isMuted
    });
    
    this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
  }
  
  /**
   * Play next track in queue
   */
  async playNext() {
    if (this.queue.length === 0) return;
    
    if (this.repeatMode === 'one') {
      // Repeat current track
      await this.seek(0);
      await this.play();
      return;
    }
    
    this.queueIndex++;
    
    if (this.queueIndex >= this.queue.length) {
      if (this.repeatMode === 'all') {
        this.queueIndex = 0;
      } else {
        // End of queue
        await this.stop();
        this.eventEmitter.emit('audio-queue-ended');
        return;
      }
    }
    
    const nextTrack = this.queue[this.queueIndex];
    await this.loadTrack(nextTrack.filePath);
    await this.play();
  }
  
  /**
   * Play previous track in queue
   */
  async playPrevious() {
    if (this.queue.length === 0) return;
    
    // If more than 3 seconds into track, restart current track
    if (this.position > 3) {
      await this.seek(0);
      return;
    }
    
    this.queueIndex--;
    
    if (this.queueIndex < 0) {
      if (this.repeatMode === 'all') {
        this.queueIndex = this.queue.length - 1;
      } else {
        this.queueIndex = 0;
        await this.seek(0);
        return;
      }
    }
    
    const previousTrack = this.queue[this.queueIndex];
    await this.loadTrack(previousTrack.filePath);
    await this.play();
  }
  
  /**
   * Set queue and start playback
   */
  async setQueue(tracks, startIndex = 0) {
    this.queue = tracks.map(track => ({
      filePath: typeof track === 'string' ? track : track.filePath,
      metadata: track.metadata || null
    }));
    
    this.originalQueue = [...this.queue];
    this.queueIndex = startIndex;
    
    if (this.shuffleMode) {
      this.shuffleQueue();
    }
    
    this.eventEmitter.emit('audio-queue-changed', {
      queue: this.queue,
      currentIndex: this.queueIndex
    });
    
    if (this.queue.length > 0) {
      await this.loadTrack(this.queue[this.queueIndex].filePath);
    }
  }
  
  /**
   * Add track to queue
   */
  async addToQueue(track) {
    const trackObj = {
      filePath: typeof track === 'string' ? track : track.filePath,
      metadata: track.metadata || null
    };
    
    this.queue.push(trackObj);
    
    this.eventEmitter.emit('audio-queue-changed', {
      queue: this.queue,
      currentIndex: this.queueIndex
    });
  }
  
  /**
   * Toggle shuffle mode
   */
  async toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    
    if (this.shuffleMode) {
      this.shuffleQueue();
    } else {
      // Restore original order
      this.queue = [...this.originalQueue];
      // Find current track in unshuffled queue
      if (this.currentTrack) {
        this.queueIndex = this.queue.findIndex(track => 
          track.filePath === this.currentTrack.filePath
        );
      }
    }
    
    this.eventEmitter.emit('audio-shuffle-changed', {
      shuffleMode: this.shuffleMode,
      queue: this.queue,
      currentIndex: this.queueIndex
    });
    
    this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
  }
  
  /**
   * Set repeat mode
   */
  async setRepeatMode(mode) {
    if (!['none', 'one', 'all'].includes(mode)) {
      throw new Error(`Invalid repeat mode: ${mode}`);
    }
    
    this.repeatMode = mode;
    
    this.eventEmitter.emit('audio-repeat-changed', {
      repeatMode: this.repeatMode
    });
    
    this.eventEmitter.emit('audio-state-changed', this.getPlayerState());
  }
  
  /**
   * Extract metadata from audio file
   */
  async extractMetadata(filePath) {
    try {
      const metadata = await mm.parseFile(filePath);
      
      // Extract album art if present
      let albumArt = null;
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        albumArt = await this.processAlbumArt(metadata.common.picture[0], filePath);
      }
      
      return {
        format: {
          duration: metadata.format.duration,
          bitrate: metadata.format.bitrate,
          sampleRate: metadata.format.sampleRate,
          codec: metadata.format.codec,
          container: metadata.format.container
        },
        common: {
          title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
          artist: metadata.common.artist || 'Unknown Artist',
          album: metadata.common.album || 'Unknown Album',
          year: metadata.common.year,
          track: metadata.common.track,
          genre: metadata.common.genre ? metadata.common.genre.join(', ') : undefined,
          albumartist: metadata.common.albumartist
        },
        albumArt: albumArt
      };
      
    } catch (error) {
      console.error(`Error extracting metadata from ${filePath}:`, error);
      
      // Return basic metadata
      return {
        format: { duration: 0 },
        common: {
          title: path.basename(filePath, path.extname(filePath)),
          artist: 'Unknown Artist',
          album: 'Unknown Album'
        },
        albumArt: null
      };
    }
  }
  
  /**
   * Process album art and create thumbnail
   */
  async processAlbumArt(pictureData, filePath) {
    try {
      const cacheKey = `${filePath}_${pictureData.data.length}`;
      
      if (this.albumArtCache.has(cacheKey)) {
        return this.albumArtCache.get(cacheKey);
      }
      
      // Create thumbnail using Jimp (resized for mini player)
      const image = await Jimp.read(pictureData.data);
      const thumbnail = await image.resize(150, 150).getBufferAsync(Jimp.MIME_JPEG);
      
      // Use original image data for fullSize to preserve quality in modal
      const fullSizeData = pictureData.data;
      
      const albumArt = {
        format: pictureData.format,
        thumbnail: `data:image/jpeg;base64,${thumbnail.toString('base64')}`,
        fullSize: `data:${pictureData.format};base64,${fullSizeData.toString('base64')}`,
        originalSize: pictureData.data.length
      };
      
      this.albumArtCache.set(cacheKey, albumArt);
      return albumArt;
      
    } catch (error) {
      console.error('Error processing album art:', error);
      return null;
    }
  }
  
  /**
   * Start position tracking for playback
   */
  startPositionTracking() {
    this.stopPositionTracking(); // Clear any existing interval
    
    this.positionInterval = setInterval(() => {
      if (this.isPlaying && !this.isPaused) {
        this.position += 0.1; // Update every 100ms
        
        // Check if track ended
        if (this.position >= this.duration) {
          this.position = this.duration;
          this.handleTrackEnded();
        }
        
        // Emit position update every second
        if (Math.floor(this.position * 10) % 10 === 0) {
          this.eventEmitter.emit('audio-position-changed', {
            position: this.position,
            duration: this.duration
          });
        }
      }
    }, 100);
  }
  
  /**
   * Stop position tracking
   */
  stopPositionTracking() {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }
  
  /**
   * Handle track ended
   */
  async handleTrackEnded() {
    await this.stop();
    
    this.eventEmitter.emit('audio-track-ended', {
      track: this.currentTrack
    });
    
    // Auto-play next track
    await this.playNext();
  }
  
  /**
   * Shuffle the current queue
   */
  shuffleQueue() {
    if (this.queue.length <= 1) return;
    
    const currentTrack = this.currentTrack;
    const currentTrackPath = currentTrack ? currentTrack.filePath : null;
    
    // Fisher-Yates shuffle
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    
    // Move current track to front if playing
    if (currentTrackPath) {
      const currentIndex = this.queue.findIndex(track => track.filePath === currentTrackPath);
      if (currentIndex > 0) {
        const track = this.queue.splice(currentIndex, 1)[0];
        this.queue.unshift(track);
      }
      this.queueIndex = 0;
    }
  }
  
  /**
   * Add track to play history
   */
  addToPlayHistory(track) {
    this.playHistory.unshift({
      ...track,
      playedAt: Date.now()
    });
    
    // Keep only last 100 tracks
    if (this.playHistory.length > 100) {
      this.playHistory = this.playHistory.slice(0, 100);
    }
  }
  
  /**
   * Get current player state
   */
  getPlayerState() {
    return {
      currentTrack: this.currentTrack,
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      isLoading: this.isLoading,
      position: this.position,
      duration: this.duration,
      volume: this.volume,
      isMuted: this.isMuted,
      shuffleMode: this.shuffleMode,
      repeatMode: this.repeatMode,
      queue: this.queue,
      queueIndex: this.queueIndex,
      queueLength: this.queue.length
    };
  }
  
  /**
   * Get play history
   */
  getPlayHistory(limit = 50) {
    return this.playHistory.slice(0, limit);
  }
  
  /**
   * Clear queue
   */
  async clearQueue() {
    this.queue = [];
    this.originalQueue = [];
    this.queueIndex = 0;
    
    this.eventEmitter.emit('audio-queue-changed', {
      queue: this.queue,
      currentIndex: this.queueIndex
    });
  }
  
  /**
   * Cleanup service
   */
  cleanup() {
    this.stopPositionTracking();
    this.metadataCache.clear();
    this.albumArtCache.clear();
    console.log('AudioPlayerService cleaned up');
  }
}

module.exports = AudioPlayerService;
