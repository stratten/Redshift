// src/renderer/components/AudioPlayerQueue.js - Audio Player Queue Management

class AudioPlayerQueue {
  constructor(audioPlayer) {
    this.player = audioPlayer; // Reference to main AudioPlayer
  }
  
  /**
   * Update the "Up Next" preview in the mini-player
   * Shows next 2-3 tracks from the queue
   */
  updateQueuePreview() {
    const upNextPreview = document.getElementById('upNextPreview');
    const upNextTracks = document.getElementById('upNextTracks');
    
    if (!upNextPreview || !upNextTracks) return;
    
    // Get the next tracks (from current position in context) - just show 2 for compact view
    const nextTracks = this.getUpcomingTracks(2);
    
    if (nextTracks.length === 0) {
      upNextPreview.style.visibility = 'hidden';
      upNextPreview.style.opacity = '0';
      return;
    }
    
    // Show the preview
    upNextPreview.style.visibility = 'visible';
    upNextPreview.style.opacity = '1';
    
    // Render the tracks
    upNextTracks.innerHTML = nextTracks.map((track, index) => {
      const title = track.metadata?.common?.title || track.name || 'Unknown Track';
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const artSrc = track.metadata?.albumArt?.thumbnail;
      
      return `
        <div class="up-next-track-item" data-track-index="${this.player.audioPlayerState.currentTrackIndex + index + 1}">
          <span class="up-next-track-number">${index + 1}</span>
          <div class="up-next-track-art">
            ${artSrc 
              ? `<img src="${artSrc}" alt="Album Art">` 
              : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                   <path d="M9 18V5l12-2v13"></path>
                   <circle cx="6" cy="18" r="3"></circle>
                   <circle cx="18" cy="16" r="3"></circle>
                 </svg>`
            }
          </div>
          <div class="up-next-track-info">
            <div class="up-next-track-title">${title}</div>
            <div class="up-next-track-artist">${artist}</div>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click listeners to up-next tracks
    const trackItems = upNextTracks.querySelectorAll('.up-next-track-item');
    trackItems.forEach((item) => {
      item.addEventListener('click', async () => {
        const trackIndex = parseInt(item.dataset.trackIndex);
        this.player.audioPlayerState.currentTrackIndex = trackIndex;
        const track = this.player.audioPlayerState.currentContextTracks[trackIndex];
        if (track) {
          await this.player.playTrack(track.path, track);
        }
      });
    });
  }
  
  /**
   * Get upcoming tracks from the current context
   * @param {number} count - Number of tracks to retrieve
   * @returns {Array} Array of upcoming tracks
   */
  getUpcomingTracks(count = 3) {
    if (!this.player.audioPlayerState.currentContextTracks || this.player.audioPlayerState.currentContextTracks.length === 0) {
      return [];
    }
    
    const tracks = this.player.audioPlayerState.currentContextTracks;
    const currentIndex = this.player.audioPlayerState.currentTrackIndex;
    const upcomingTracks = [];
    
    for (let i = 1; i <= count; i++) {
      let nextIndex = currentIndex + i;
      
      // Handle wrap-around for repeat all mode
      if (nextIndex >= tracks.length) {
        if (this.player.audioPlayerState.repeatMode === 'all') {
          nextIndex = nextIndex % tracks.length;
        } else {
          break; // No more tracks
        }
      }
      
      if (tracks[nextIndex]) {
        upcomingTracks.push(tracks[nextIndex]);
      }
    }
    
    return upcomingTracks;
  }
  
  /**
   * Show the full queue modal
   */
  showQueueModal() {
    const modal = document.getElementById('queueModal');
    if (!modal) return;
    
    // Render the queue
    this.renderQueueModal();
    
    // Show modal
    modal.style.display = 'flex';
    
    // Setup event listeners
    this.setupQueueModalListeners();
    
    this.player.ui.logBoth('info', 'Queue modal opened');
  }
  
  /**
   * Hide the queue modal
   */
  hideQueueModal() {
    const modal = document.getElementById('queueModal');
    if (modal) {
      modal.style.display = 'none';
      this.player.ui.logBoth('info', 'Queue modal closed');
    }
  }
  
  /**
   * Render the queue modal with current track and upcoming tracks
   */
  renderQueueModal() {
    // Update current track display
    const queueCurrentTrack = document.getElementById('queueCurrentTrack');
    if (queueCurrentTrack && this.player.audioPlayerState.currentTrack) {
      const track = this.player.audioPlayerState.currentTrack;
      const title = track.metadata?.common?.title || track.filename || 'Unknown Track';
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const artSrc = track.metadata?.albumArt?.thumbnail;
      
      queueCurrentTrack.innerHTML = `
        <div class="queue-track-info">
          <div class="queue-track-art">
            ${artSrc 
              ? `<img src="${artSrc}" alt="Album Art">` 
              : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                   <path d="M9 18V5l12-2v13"></path>
                   <circle cx="6" cy="18" r="3"></circle>
                   <circle cx="18" cy="16" r="3"></circle>
                 </svg>`
            }
          </div>
          <div class="queue-track-details">
            <div class="queue-track-title">${title}</div>
            <div class="queue-track-artist">${artist}</div>
          </div>
        </div>
      `;
    }
    
    // Update queue list
    const queueTrackList = document.getElementById('queueTrackList');
    const queueCount = document.getElementById('queueCount');
    
    if (!queueTrackList) return;
    
    const upcomingTracks = this.getUpcomingTracks(50); // Show up to 50 tracks in queue
    
    // Update count
    if (queueCount) {
      queueCount.textContent = `(${upcomingTracks.length})`;
    }
    
    if (upcomingTracks.length === 0) {
      queueTrackList.innerHTML = `
        <div class="queue-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <p>Queue is empty</p>
          <p class="queue-empty-hint">Tracks will appear here when you add them to the queue</p>
        </div>
      `;
      return;
    }
    
    // Render queue items
    queueTrackList.innerHTML = upcomingTracks.map((track, index) => {
      const title = track.metadata?.common?.title || track.name || 'Unknown Track';
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const artSrc = track.metadata?.albumArt?.thumbnail;
      const actualIndex = this.player.audioPlayerState.currentTrackIndex + index + 1;
      
      return `
        <div class="queue-track-item" draggable="true" data-queue-index="${actualIndex}">
          <span class="queue-track-number">${index + 1}</span>
          <div class="queue-track-art">
            ${artSrc 
              ? `<img src="${artSrc}" alt="Album Art">` 
              : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                   <path d="M9 18V5l12-2v13"></path>
                   <circle cx="6" cy="18" r="3"></circle>
                   <circle cx="18" cy="16" r="3"></circle>
                 </svg>`
            }
          </div>
          <div class="queue-track-info">
            <div class="queue-track-title">${title}</div>
            <div class="queue-track-artist">${artist}</div>
          </div>
          <div class="queue-track-actions">
            <button class="queue-track-btn queue-remove-btn" data-queue-index="${actualIndex}" title="Remove from queue">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Setup drag and drop for reordering
    this.setupQueueDragAndDrop();
  }
  
  /**
   * Setup event listeners for the queue modal
   */
  setupQueueModalListeners() {
    // Close button
    const closeBtn = document.getElementById('closeQueueModal');
    if (closeBtn) {
      closeBtn.onclick = () => this.hideQueueModal();
    }
    
    // Clear queue button
    const clearBtn = document.getElementById('clearQueueBtn');
    if (clearBtn) {
      clearBtn.onclick = () => this.clearQueue();
    }
    
    // Click outside to close
    const modal = document.getElementById('queueModal');
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) {
          this.hideQueueModal();
        }
      };
    }
    
    // Escape key to close
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.hideQueueModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
    
    // Remove track buttons
    const queueTrackList = document.getElementById('queueTrackList');
    if (queueTrackList) {
      queueTrackList.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.queue-remove-btn');
        if (removeBtn) {
          const queueIndex = parseInt(removeBtn.dataset.queueIndex);
          this.removeFromQueue(queueIndex);
        }
      });
      
      // Click track to play
      queueTrackList.addEventListener('click', async (e) => {
        const trackItem = e.target.closest('.queue-track-item');
        if (trackItem && !e.target.closest('.queue-remove-btn')) {
          const queueIndex = parseInt(trackItem.dataset.queueIndex);
          this.player.audioPlayerState.currentTrackIndex = queueIndex;
          const track = this.player.audioPlayerState.currentContextTracks[queueIndex];
          if (track) {
            await this.player.playTrack(track.path, track);
            this.renderQueueModal(); // Update modal to reflect new current track
          }
        }
      });
    }
  }
  
  /**
   * Setup drag and drop for queue reordering
   */
  setupQueueDragAndDrop() {
    const queueItems = document.querySelectorAll('.queue-track-item');
    let draggedItem = null;
    
    queueItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      
      item.addEventListener('dragend', (e) => {
        item.classList.remove('dragging');
        draggedItem = null;
      });
      
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (draggedItem && draggedItem !== item) {
          item.classList.add('drag-over');
        }
      });
      
      item.addEventListener('dragleave', (e) => {
        item.classList.remove('drag-over');
      });
      
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        
        if (draggedItem && draggedItem !== item) {
          const fromIndex = parseInt(draggedItem.dataset.queueIndex);
          const toIndex = parseInt(item.dataset.queueIndex);
          this.reorderQueue(fromIndex, toIndex);
        }
      });
    });
  }
  
  /**
   * Remove a track from the queue
   * @param {number} index - Index of the track in currentContextTracks to remove
   */
  removeFromQueue(index) {
    if (!this.player.audioPlayerState.currentContextTracks || index < 0 || index >= this.player.audioPlayerState.currentContextTracks.length) {
      this.player.ui.logBoth('warning', 'Invalid queue index');
      return;
    }
    
    const track = this.player.audioPlayerState.currentContextTracks[index];
    this.player.audioPlayerState.currentContextTracks.splice(index, 1);
    
    // Adjust current index if needed
    if (index < this.player.audioPlayerState.currentTrackIndex) {
      this.player.audioPlayerState.currentTrackIndex--;
    } else if (index === this.player.audioPlayerState.currentTrackIndex) {
      // If removing current track, we might need to handle playback
      // For now, just adjust the index
      if (this.player.audioPlayerState.currentTrackIndex >= this.player.audioPlayerState.currentContextTracks.length) {
        this.player.audioPlayerState.currentTrackIndex = this.player.audioPlayerState.currentContextTracks.length - 1;
      }
    }
    
    this.player.ui.logBoth('info', `Removed from queue: ${track.name || 'Unknown Track'}`);
    
    // Update both preview and modal
    this.updateQueuePreview();
    if (document.getElementById('queueModal').style.display === 'flex') {
      this.renderQueueModal();
    }
  }
  
  /**
   * Clear all tracks from the queue
   */
  clearQueue() {
    if (!this.player.audioPlayerState.currentContextTracks || this.player.audioPlayerState.currentContextTracks.length === 0) {
      this.player.ui.logBoth('info', 'Queue is already empty');
      return;
    }
    
    if (confirm('Clear all upcoming tracks from the queue?')) {
      // Keep only the current track
      const currentTrack = this.player.audioPlayerState.currentContextTracks[this.player.audioPlayerState.currentTrackIndex];
      if (currentTrack) {
        this.player.audioPlayerState.currentContextTracks = [currentTrack];
        this.player.audioPlayerState.currentTrackIndex = 0;
      } else {
        this.player.audioPlayerState.currentContextTracks = [];
        this.player.audioPlayerState.currentTrackIndex = -1;
      }
      
      this.player.ui.logBoth('info', 'Queue cleared');
      
      // Update both preview and modal
      this.updateQueuePreview();
      this.renderQueueModal();
    }
  }
  
  /**
   * Reorder queue by moving a track from one position to another
   * @param {number} fromIndex - Original index in currentContextTracks
   * @param {number} toIndex - Target index in currentContextTracks
   */
  reorderQueue(fromIndex, toIndex) {
    if (!this.player.audioPlayerState.currentContextTracks || 
        fromIndex < 0 || fromIndex >= this.player.audioPlayerState.currentContextTracks.length ||
        toIndex < 0 || toIndex >= this.player.audioPlayerState.currentContextTracks.length) {
      this.player.ui.logBoth('warning', 'Invalid reorder indices');
      return;
    }
    
    const tracks = this.player.audioPlayerState.currentContextTracks;
    const [movedTrack] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, movedTrack);
    
    // Adjust current index if needed
    if (fromIndex === this.player.audioPlayerState.currentTrackIndex) {
      this.player.audioPlayerState.currentTrackIndex = toIndex;
    } else if (fromIndex < this.player.audioPlayerState.currentTrackIndex && toIndex >= this.player.audioPlayerState.currentTrackIndex) {
      this.player.audioPlayerState.currentTrackIndex--;
    } else if (fromIndex > this.player.audioPlayerState.currentTrackIndex && toIndex <= this.player.audioPlayerState.currentTrackIndex) {
      this.player.audioPlayerState.currentTrackIndex++;
    }
    
    this.player.ui.logBoth('info', `Reordered queue: moved track from ${fromIndex} to ${toIndex}`);
    
    // Update both preview and modal
    this.updateQueuePreview();
    this.renderQueueModal();
  }
  
  /**
   * Add a track to the queue
   * @param {Object} track - The track object to add
   */
  addToQueue(track) {
    if (!track) {
      this.player.ui.logBoth('warning', 'Invalid track');
      return;
    }
    
    // If no current context, create one with the current track and the new track
    if (!this.player.audioPlayerState.currentContextTracks || this.player.audioPlayerState.currentContextTracks.length === 0) {
      if (this.player.audioPlayerState.currentTrack) {
        this.player.audioPlayerState.currentContextTracks = [this.player.audioPlayerState.currentTrack, track];
        this.player.audioPlayerState.currentTrackIndex = 0;
        this.player.audioPlayerState.currentContext = 'queue';
      } else {
        // No current track, just add this one
        this.player.audioPlayerState.currentContextTracks = [track];
        this.player.audioPlayerState.currentTrackIndex = 0;
        this.player.audioPlayerState.currentContext = 'queue';
      }
    } else {
      // Add track to the end of the queue
      this.player.audioPlayerState.currentContextTracks.push(track);
    }
    
    const trackName = track.metadata?.common?.title || track.name || 'Unknown Track';
    this.player.ui.logBoth('success', `Added to queue: ${trackName}`);
    
    // Update queue UI
    this.updateQueuePreview();
    if (document.getElementById('queueModal').style.display === 'flex') {
      this.renderQueueModal();
    }
  }
}

