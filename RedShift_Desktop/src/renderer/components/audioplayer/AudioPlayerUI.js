// src/renderer/components/AudioPlayerUI.js - Audio Player UI Updates

class AudioPlayerUI {
  constructor(audioPlayer) {
    this.player = audioPlayer; // Reference to main AudioPlayer
  }
  
  updateTrackInfo(track) {
    this.player.ui.logBoth('info', `Updating track info UI: ${track?.filename || 'No track'}`);
    
    // Update the header compact display (new location)
    const titleMini = document.getElementById('trackTitleMini');
    const artistMini = document.getElementById('trackArtistMini');
    const albumArtMini = document.getElementById('albumArtMini');
    
    if (track && track.metadata) {
      const title = track.metadata.common?.title || track.filename || 'Unknown Track';
      const artist = track.metadata.common?.artist || 'Unknown Artist';
      
      if (titleMini) {
        titleMini.textContent = title;
        // Measure against the wrapper, not the inline text node itself
        setTimeout(() => {
          const wrapper = titleMini.parentElement;
          const isClipped = wrapper ? (titleMini.scrollWidth > wrapper.clientWidth) : false;
          titleMini.classList.toggle('marquee-active', isClipped);
          if (!isClipped) titleMini.style.transform = 'translateX(0)';
        }, 0);
      }
      if (artistMini) {
        artistMini.textContent = artist;
        setTimeout(() => {
          const wrapper = artistMini.parentElement;
          const isClipped = wrapper ? (artistMini.scrollWidth > wrapper.clientWidth) : false;
          artistMini.classList.toggle('marquee-active', isClipped);
          if (!isClipped) artistMini.style.transform = 'translateX(0)';
        }, 0);
      }
      
      // Update compact album art
      if (albumArtMini) {
        if (track.metadata.albumArt && track.metadata.albumArt.thumbnail) {
          albumArtMini.innerHTML = `<img src="${track.metadata.albumArt.thumbnail}" alt="Album Art" class="clickable-album-art">`;
          // Add click handler to show enlarged album art
          const artImg = albumArtMini.querySelector('img');
          if (artImg) {
            artImg.style.cursor = 'pointer';
            artImg.onclick = () => this.showAlbumArtModal(track);
          }
        } else {
          // Reset to default icon
          albumArtMini.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          `;
        }
      }
      
      this.player.ui.logBoth('info', `Updated track info: "${title}" by "${artist}"`);
    } else {
      // No track loaded
      if (titleMini) { titleMini.textContent = 'No track loaded'; titleMini.classList.remove('marquee-active'); }
      if (artistMini) { artistMini.textContent = 'Select a track to start playing'; artistMini.classList.remove('marquee-active'); }
      
      if (albumArtMini) {
        albumArtMini.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        `;
      }
    }
    
    // Update now-playing indicator in all visible track lists
    if (this.player.ui.musicLibrary) {
      this.player.ui.musicLibrary.renderMusicTable();
    }
    if (this.player.ui.albumsView && this.player.ui.albumsView.selectedAlbum) {
      this.player.ui.albumsView.renderDetailView();
    }
    if (this.player.ui.artistsView && this.player.ui.artistsView.selectedArtist) {
      this.player.ui.artistsView.renderDetailView();
    }
    if (this.player.ui.playlistManager && this.player.ui.playlistManager.currentPlaylist) {
      this.player.ui.playlistManager.renderPlaylistTracks();
    }
  }
  
  showAlbumArtModal(track) {
    const modal = document.getElementById('albumArtModal');
    const modalImage = document.getElementById('albumArtModalImage');
    const modalTitle = document.getElementById('albumArtModalTitle');
    const modalArtist = document.getElementById('albumArtModalArtist');
    const modalAlbum = document.getElementById('albumArtModalAlbum');
    const closeBtn = document.getElementById('closeAlbumArtModal');
    
    if (!modal || !track) return;
    
    // Use full-size album art if available, otherwise use thumbnail
    const artSrc = track.metadata.albumArt?.fullSize || track.metadata.albumArt?.thumbnail;
    
    if (artSrc) {
      modalImage.src = artSrc;
      modalTitle.textContent = track.metadata.common?.title || track.filename || 'Unknown Track';
      modalArtist.textContent = track.metadata.common?.artist || 'Unknown Artist';
      modalAlbum.textContent = track.metadata.common?.album || 'Unknown Album';
      
      modal.style.display = 'flex';
      
      // Close on button click
      closeBtn.onclick = () => {
        modal.style.display = 'none';
      };
      
      // Close on outside click
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      };
      
      // Close on Escape key
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          modal.style.display = 'none';
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
      
      this.player.ui.logBoth('info', 'Album art modal opened');
    }
  }
  
  updatePlaybackState(isPlaying) {
    console.log('🎵 Updating playback state:', isPlaying);
    this.player.audioPlayerState.isPlaying = isPlaying;
    
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const playPauseBtn = document.getElementById('playPauseBtn');
    
    if (isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      playPauseBtn.title = 'Pause';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      playPauseBtn.title = 'Play';
    }
    
    // Update now-playing indicator in all visible track lists
    if (this.player.ui.musicLibrary) {
      this.player.ui.musicLibrary.renderMusicTable();
    }
    if (this.player.ui.albumsView && this.player.ui.albumsView.selectedAlbum) {
      this.player.ui.albumsView.renderDetailView();
    }
    if (this.player.ui.artistsView && this.player.ui.artistsView.selectedArtist) {
      this.player.ui.artistsView.renderDetailView();
    }
    if (this.player.ui.playlistManager && this.player.ui.playlistManager.currentPlaylist) {
      this.player.ui.playlistManager.renderPlaylistTracks();
    }
  }
  
  updateProgress(position, duration) {
    this.player.audioPlayerState.position = position;
    this.player.audioPlayerState.duration = duration;
    
    // Update progress bar (compact header version)
    const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;
    
    const progressBar = document.getElementById('progressBar');
    const progressSlider = document.getElementById('progressSlider');
    const currentTime = document.getElementById('currentTime');
    const totalTime = document.getElementById('totalTime');
    
    // Update progress bar
    if (progressBar) {
      progressBar.style.width = `${progressPercentage}%`;
    }
    
    // Only update slider if we're not seeking to prevent conflicts
    if (progressSlider && !this.player.isSeeking) {
      progressSlider.value = progressPercentage;
    }
    
    // Update time displays with throttling to reduce DOM updates
    if (currentTime) {
      const newTimeText = this.formatTime(position);
      if (currentTime.textContent !== newTimeText) {
        currentTime.textContent = newTimeText;
      }
    }
    
    if (totalTime) {
      const newDurationText = this.formatTime(duration);
      if (totalTime.textContent !== newDurationText) {
        totalTime.textContent = newDurationText;
      }
    }
  }
  
  updateVolumeUI(volume, isMuted) {
    console.log('🎵 Updating volume UI:', volume, 'muted:', isMuted);
    
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');
    const muteIcon = document.getElementById('muteIcon');
    
    volumeSlider.value = volume * 100;
    
    if (isMuted || volume === 0) {
      volumeIcon.style.display = 'none';
      muteIcon.style.display = 'block';
    } else {
      volumeIcon.style.display = 'block';
      muteIcon.style.display = 'none';
    }
  }
  
  updateShuffleButton(shuffleMode) {
    console.log('🎵 Updating shuffle button:', shuffleMode);
    const shuffleBtn = document.getElementById('shuffleBtn');
    
    if (shuffleMode) {
      shuffleBtn.classList.add('active');
      shuffleBtn.title = 'Shuffle On';
    } else {
      shuffleBtn.classList.remove('active');
      shuffleBtn.title = 'Shuffle Off';
    }
  }
  
  updateRepeatButton(repeatMode) {
    console.log('🎵 Updating repeat button:', repeatMode);
    const repeatBtn = document.getElementById('repeatBtn');
    
    repeatBtn.classList.remove('repeat-none', 'repeat-all', 'repeat-one');
    repeatBtn.classList.add(`repeat-${repeatMode}`);
    
    const titles = {
      'none': 'Repeat Off',
      'all': 'Repeat All',
      'one': 'Repeat One'
    };
    repeatBtn.title = titles[repeatMode] || 'Repeat Off';
  }
  
  updateQueueUI(queue, currentIndex) {
    console.log('🎵 Updating queue UI:', queue.length, 'tracks, current index:', currentIndex);
    this.player.audioPlayerState.queue = queue;
    this.player.audioPlayerState.queueIndex = currentIndex;
    
    const queueList = document.getElementById('queueList');
    
    if (queue.length === 0) {
      queueList.innerHTML = `
        <div class="empty-state small">
          <p>No tracks in queue</p>
        </div>
      `;
      return;
    }
    
    const queueHTML = queue.map((track, index) => {
      const isActive = index === currentIndex;
      const trackName = track.metadata?.common?.title || path.basename(track.filePath);
      const artistName = track.metadata?.common?.artist || 'Unknown Artist';
      
      return `
        <div class="queue-item ${isActive ? 'active' : ''}" data-index="${index}">
          <div class="queue-track-info">
            <div class="queue-track-name">${trackName}</div>
            <div class="queue-track-artist">${artistName}</div>
          </div>
          <button class="queue-remove-btn" data-index="${index}" title="Remove from queue">×</button>
        </div>
      `;
    }).join('');
    
    queueList.innerHTML = queueHTML;
    
    // Add click listeners for queue items
    queueList.addEventListener('click', async (e) => {
      if (e.target.matches('.queue-remove-btn')) {
        const index = parseInt(e.target.dataset.index);
        console.log('🎵 Remove from queue clicked for index:', index);
        // TODO: Implement remove from queue
      } else if (e.target.closest('.queue-item')) {
        const index = parseInt(e.target.closest('.queue-item').dataset.index);
        console.log('🎵 Queue item clicked, loading track at index:', index);
        try {
          const track = queue[index];
          await window.electronAPI.invoke('audio-load-track', track.filePath);
          await window.electronAPI.invoke('audio-play');
        } catch (error) {
          console.error('🎵 Error loading track from queue:', error);
          this.player.ui.addLog('error', `Error loading track: ${error.message}`);
        }
      }
    });
  }
  
  formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

