// src/renderer/components/AudioPlayer.js - Audio Player Component

class AudioPlayer {
  constructor(uiManager) {
    this.ui = uiManager;
    
    // Audio player state
    this.audioPlayerState = {
      isPlaying: false,
      currentTrack: null,
      currentTrackIndex: -1,
      currentContext: null, // 'library', 'album', 'artist', 'genre', 'playlist'
      currentContextTracks: [], // The current list of tracks being played from
      volume: 1.0,
      position: 0,
      duration: 0,
      queue: [],
      shuffleMode: false,
      repeatMode: 'none',
      playbackSpeed: 1.0 // 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x
    };
    
    // HTML5 Audio element for actual playback
    this.audioElement = new Audio();
    this.audioElement.volume = 1.0;
    this.isSeeking = false; // Flag to prevent update conflicts during seeking
    this.lastProgressUpdate = 0; // Throttle progress updates (legacy)
    this.lastDisplayedTime = 0; // For smoothing time display
    this.progressRafId = null; // requestAnimationFrame id for smooth progress
    this.lastRafUpdate = 0; // timestamp of last raf-driven UI write
    
    // Initialize UI updater component
    this.uiUpdater = new AudioPlayerUI(this);
    
    // Initialize queue manager component
    this.queueManager = new AudioPlayerQueue(this);
    
    // Initialize equalizer component (Web Audio API)
    this.equalizer = new AudioPlayerEqualizer(this);
    
    // Initialize output device component
    this.outputDevice = new AudioPlayerOutputDevice(this);
    
    // Initialize playback manager component
    this.playback = new AudioPlayerPlayback(this);
    
    // Initialize controls component
    this.controls = new AudioPlayerControls(this);
    
    // Initialize progress tracking component
    this.progress = new AudioPlayerProgress(this);
    
    this.setupAudioElement();
    
    // Setup Web Audio API for equalizer (must happen after setupAudioElement)
    this.equalizer.setupWebAudio();
    
    this.setupEventListeners();
    this.setupEqualizerListeners();
    this.outputDevice.setupEventListeners();

    // Keyboard shortcuts (playback, seek, volume, modes)
    this.setupKeyboardShortcuts();
    
    // Initialize output device selection
    this.outputDevice.initialize();
  }
  
  setupAudioElement() {
    this.ui.logBoth('info', 'Setting up HTML5 Audio element for playback');
    
    // Audio event listeners
    this.audioElement.addEventListener('loadstart', () => {
      this.ui.logBoth('info', 'Audio loading started');
    });
    
    this.audioElement.addEventListener('loadedmetadata', () => {
      this.audioPlayerState.duration = this.audioElement.duration;
      this.ui.logBoth('info', `Audio metadata loaded, duration: ${this.formatTime(this.audioElement.duration)}`);
      // Reset time tracking for new audio
      this.lastDisplayedTime = 0;
      this.updateProgress(0, this.audioElement.duration);
    });
    
    this.audioElement.addEventListener('canplay', () => {
      this.ui.logBoth('info', 'Audio ready to play');
    });
    
    this.audioElement.addEventListener('play', () => {
      this.audioPlayerState.isPlaying = true;
      this.updatePlaybackState(true);
      // Reset time tracking when playback starts to avoid initial jumps
      this.lastDisplayedTime = this.audioElement.currentTime;
      this.ui.logBoth('info', 'Audio playback started');
    });
    
    this.audioElement.addEventListener('pause', () => {
      this.audioPlayerState.isPlaying = false;
      this.updatePlaybackState(false);
      this.ui.logBoth('info', 'Audio playback paused');
    });
    
    this.audioElement.addEventListener('ended', () => {
      this.audioPlayerState.isPlaying = false;
      this.updatePlaybackState(false);
      const trackName = this.audioPlayerState.currentTrack?.name || 'Unknown';
      this.ui.logBoth('success', `🎵 Track finished playing: ${trackName}`);
      this.handleTrackEnded();
    });
    
    // Replace timeupdate-driven UI with a single rAF loop tied to the local Audio element
    this.audioElement.addEventListener('play', () => this.startProgressLoop());
    this.audioElement.addEventListener('pause', () => this.stopProgressLoop());
    this.audioElement.addEventListener('ended', () => this.stopProgressLoop());
    
    this.audioElement.addEventListener('volumechange', () => {
      this.audioPlayerState.volume = this.audioElement.volume;
      this.updateVolumeUI(this.audioElement.volume, this.audioElement.muted);
    });
    
    this.audioElement.addEventListener('error', (e) => {
      this.ui.logBoth('error', `Audio playback error: ${e.message || 'Unknown error'}`);
    });
  }
  
  setupEventListeners() {
    this.controls.setupEventListeners();
  }

  setupKeyboardShortcuts() {
    this.controls.setupKeyboardShortcuts();
  }
  
  getNextRepeatMode(currentMode) {
    return this.controls.getNextRepeatMode(currentMode);
  }
  
  cyclePlaybackSpeed() {
    this.controls.cyclePlaybackSpeed();
  }
  
  updateSpeedButton(speed) {
    this.controls.updateSpeedButton(speed);
  }
  
  // Equalizer methods (delegated to AudioPlayerEqualizer)
  setEqualizerBand(index, gain) {
    this.equalizer.setEqualizerBand(index, gain);
  }
  
  applyEqualizerPreset(presetName) {
    this.equalizer.applyEqualizerPreset(presetName);
  }
  
  resetEqualizer() {
    this.equalizer.resetEqualizer();
  }
  
  loadEqualizerSettings() {
    this.equalizer.loadEqualizerSettings();
  }
  
  saveEqualizerSettings() {
    this.equalizer.saveEqualizerSettings();
  }
  
  updateEqualizerUI() {
    this.equalizer.updateEqualizerUI();
  }
  
  showEqualizerModal() {
    this.equalizer.showEqualizerModal();
  }
  
  hideEqualizerModal() {
    this.equalizer.hideEqualizerModal();
  }
  
  setupEqualizerListeners() {
    this.equalizer.setupEqualizerListeners();
  }
  
  updateAudioPlayerState(state) {
    console.log('🎵 Updating audio player state:', state);
    
    // Preserve our renderer's path and name in currentTrack (critical for play count tracking)
    const preservedPath = this.audioPlayerState.currentTrack?.path;
    const preservedName = this.audioPlayerState.currentTrack?.name;
    
    this.audioPlayerState = { ...this.audioPlayerState, ...state };
    
    // Restore path and name if they were set (main process doesn't track these)
    if (this.audioPlayerState.currentTrack && preservedPath) {
      this.audioPlayerState.currentTrack.path = preservedPath;
      this.audioPlayerState.currentTrack.name = preservedName || preservedPath.split('/').pop();
    }
    
    // Update UI based on state
    this.updatePlaybackState(state.isPlaying);
    this.updateShuffleButton(state.shuffleMode);
    this.updateRepeatButton(state.repeatMode);
    
    if (state.currentTrack) {
      this.updateTrackInfo(state.currentTrack);
    }
  }
  
  updateTrackInfo(track) {
    this.uiUpdater.updateTrackInfo(track);
  }
  
  showAlbumArtModal(track) {
    this.uiUpdater.showAlbumArtModal(track);
  }
  
  updatePlaybackState(isPlaying) {
    this.uiUpdater.updatePlaybackState(isPlaying);
  }
  
  updateProgress(position, duration) {
    this.uiUpdater.updateProgress(position, duration);
  }
  
  updateVolumeUI(volume, isMuted) {
    this.uiUpdater.updateVolumeUI(volume, isMuted);
  }
  
  updateShuffleButton(shuffleMode) {
    this.uiUpdater.updateShuffleButton(shuffleMode);
  }
  
  updateRepeatButton(repeatMode) {
    this.uiUpdater.updateRepeatButton(repeatMode);
  }
  
  updateQueueUI(queue, currentIndex) {
    this.uiUpdater.updateQueueUI(queue, currentIndex);
  }
  
  formatTime(seconds) {
    return this.uiUpdater.formatTime(seconds);
  }

  // Smooth progress loop using requestAnimationFrame; single source of truth
  startProgressLoop() {
    this.progress.startProgressLoop();
  }

  stopProgressLoop() {
    this.progress.stopProgressLoop();
  }

  // Set the current playback context (what list of tracks we're playing from)
  setPlaybackContext(context, tracks, currentTrackIndex = 0) {
    this.playback.setPlaybackContext(context, tracks, currentTrackIndex);
  }

  // Handle when a track ends - auto-advance to next track
  async handleTrackEnded() {
    await this.playback.handleTrackEnded();
  }

  // Get the next track based on current context and playback mode
  getNextTrack() {
    return this.playback.getNextTrack();
  }

  // Enhanced play track method that works with context
  async playTrack(filePath, track = null) {
    await this.playback.playTrack(filePath, track);
  }

  // Play next track in context
  async playNext() {
    await this.playback.playNext();
  }

  // Play previous track in context
  async playPrevious() {
    await this.playback.playPrevious();
  }

  // ===== QUEUE MANAGEMENT =====
  
  updateQueuePreview() {
    this.queueManager.updateQueuePreview();
  }
  
  getUpcomingTracks(count = 3) {
    return this.queueManager.getUpcomingTracks(count);
  }
  
  showQueueModal() {
    this.queueManager.showQueueModal();
  }
  
  hideQueueModal() {
    this.queueManager.hideQueueModal();
  }
  
  renderQueueModal() {
    this.queueManager.renderQueueModal();
  }
  
  setupQueueModalListeners() {
    this.queueManager.setupQueueModalListeners();
  }
  
  setupQueueDragAndDrop() {
    this.queueManager.setupQueueDragAndDrop();
  }
  
  removeFromQueue(index) {
    this.queueManager.removeFromQueue(index);
  }
  
  clearQueue() {
    this.queueManager.clearQueue();
  }
  
  reorderQueue(fromIndex, toIndex) {
    this.queueManager.reorderQueue(fromIndex, toIndex);
  }
  
  addToQueue(track) {
    this.queueManager.addToQueue(track);
  }
}
