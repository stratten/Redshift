/**
 * TrackEventHandlers.js
 * Shared, reusable event handler setup for track interactions
 * Used across Music Library, Artists, Albums, and Playlists views
 */

/**
 * Setup favorite button event handlers
 * @param {HTMLElement} container - The container element to search within
 * @param {Function} getTrackByIndex - Function that takes an index and returns the track object
 * @param {Object} musicLibrary - Reference to the music library with favoriteByPath Map
 * @param {Function} setFavoriteStatusFn - Function to save favorite status to backend
 */
function setupFavoriteHandlers(container, getTrackByIndex, musicLibrary, setFavoriteStatusFn) {
  const favoriteButtons = container.querySelectorAll('.fav-toggle-btn');
  favoriteButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      const currentlyFavorite = musicLibrary.favoriteByPath.get(track.path) === true;
      const newStatus = !currentlyFavorite;
      
      // Update in music library
      musicLibrary.favoriteByPath.set(track.path, newStatus);
      
      // Save to backend
      await setFavoriteStatusFn(track.path, newStatus);
      
      // Update button visual state
      btn.dataset.fav = newStatus ? '1' : '0';
      const svg = btn.querySelector('svg');
      if (newStatus) {
        svg.setAttribute('fill', '#f59e0b');
        svg.setAttribute('stroke', '#f59e0b');
      } else {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', '#9ca3af');
      }
    });
  });
}

/**
 * Setup rating dropdown event handlers
 * @param {HTMLElement} container - The container element to search within
 * @param {Function} getTrackByIndex - Function that takes an index and returns the track object
 * @param {Object} musicLibrary - Reference to the music library with ratingByPath Map
 * @param {Function} setRatingFn - Function to save rating to backend
 */
function setupRatingHandlers(container, getTrackByIndex, musicLibrary, setRatingFn) {
  const ratingSelects = container.querySelectorAll('.rating-select');
  ratingSelects.forEach(select => {
    select.addEventListener('change', async (e) => {
      const index = parseInt(select.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      const rating = select.value ? parseInt(select.value) : null;
      
      // Update in music library
      if (rating === null) {
        musicLibrary.ratingByPath.delete(track.path);
      } else {
        musicLibrary.ratingByPath.set(track.path, rating);
      }
      
      // Save to backend
      await setRatingFn(track.path, rating);
    });
  });
}

/**
 * Setup play button event handlers
 * @param {HTMLElement} container - The container element to search within
 * @param {Function} getTrackByIndex - Function that takes an index and returns the track object
 * @param {Object} audioPlayer - Reference to the audio player
 * @param {Array} contextTracks - Array of tracks for playback context
 * @param {string} contextType - Type of context ('library', 'artist', 'album', 'playlist', etc.)
 */
function setupPlayButtonHandlers(container, getTrackByIndex, audioPlayer, contextTracks, contextType) {
  const playButtons = container.querySelectorAll('.play-track-btn');
  playButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      try {
        // Find the actual index in the context tracks
        const contextIndex = contextTracks.findIndex(t => t.path === track.path);
        if (contextIndex === -1) {
          console.error('Track not found in context:', track.path);
          return;
        }
        
        audioPlayer.setPlaybackContext(contextType, contextTracks, contextIndex);
        await audioPlayer.playTrack(track.path, track);
      } catch (error) {
        console.error('Error playing track:', error);
      }
    });
  });
}

/**
 * Setup add to queue button event handlers
 * @param {HTMLElement} container - The container element to search within
 * @param {Function} getTrackByIndex - Function that takes an index and returns the track object
 * @param {Object} audioPlayer - Reference to the audio player
 * @param {Function} logFn - Optional logging function
 */
function setupQueueButtonHandlers(container, getTrackByIndex, audioPlayer, logFn) {
  const queueButtons = container.querySelectorAll('.add-to-queue-btn');
  queueButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      audioPlayer.addToQueue(track);
      if (logFn) {
        logFn('info', `Added "${track.metadata?.common?.title || track.name}" to queue`);
      }
    });
  });
}

/**
 * Setup add to playlist button event handlers
 * @param {HTMLElement} container - The container element to search within
 * @param {Function} getTrackByIndex - Function that takes an index and returns the track object
 * @param {Object} playlistManager - Reference to the playlist manager
 */
function setupPlaylistButtonHandlers(container, getTrackByIndex, playlistManager) {
  const playlistButtons = container.querySelectorAll('.add-to-playlist-btn');
  playlistButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      playlistManager.openAddTracksModal([track]);
    });
  });
}

/**
 * Setup all track action handlers at once (convenience function)
 * @param {Object} options - Configuration object with all necessary references
 */
function setupAllTrackActionHandlers(options) {
  const {
    container,
    getTrackByIndex,
    musicLibrary,
    audioPlayer,
    playlistManager,
    contextTracks,
    contextType,
    setFavoriteStatusFn,
    setRatingFn,
    logFn
  } = options;
  
  setupFavoriteHandlers(container, getTrackByIndex, musicLibrary, setFavoriteStatusFn);
  setupRatingHandlers(container, getTrackByIndex, musicLibrary, setRatingFn);
  setupPlayButtonHandlers(container, getTrackByIndex, audioPlayer, contextTracks, contextType);
  setupQueueButtonHandlers(container, getTrackByIndex, audioPlayer, logFn);
  setupPlaylistButtonHandlers(container, getTrackByIndex, playlistManager);
}

/**
 * Setup delegated event handlers (more efficient for large tables)
 * Uses a single event listener on the container that handles all button clicks
 * @param {Object} options - Configuration object with all necessary references
 */
function setupDelegatedTrackActionHandlers(options) {
  const {
    container,
    getTrackByIndex,
    musicLibrary,
    audioPlayer,
    playlistManager,
    contextTracks,
    contextType,
    setFavoriteStatusFn,
    setRatingFn,
    logFn
  } = options;
  
  // Single click handler for all action buttons (event delegation)
  container.addEventListener('click', async (e) => {
    // Handle favorite button clicks
    const favBtn = e.target.closest('.fav-toggle-btn');
    if (favBtn) {
      e.stopPropagation();
      const index = parseInt(favBtn.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      const currentlyFavorite = musicLibrary.favoriteByPath.get(track.path) === true;
      const newStatus = !currentlyFavorite;
      
      // Update in music library
      musicLibrary.favoriteByPath.set(track.path, newStatus);
      
      // Save to backend
      await setFavoriteStatusFn(track.path, newStatus);
      
      // Update button visual state
      favBtn.dataset.fav = newStatus ? '1' : '0';
      const svg = favBtn.querySelector('svg');
      if (newStatus) {
        svg.setAttribute('fill', '#f59e0b');
        svg.setAttribute('stroke', '#f59e0b');
      } else {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', '#9ca3af');
      }
      return;
    }
    
    // Handle play button clicks
    const playBtn = e.target.closest('.play-track-btn');
    if (playBtn) {
      e.stopPropagation();
      const index = parseInt(playBtn.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      try {
        const contextIndex = contextTracks.findIndex(t => t.path === track.path);
        if (contextIndex === -1) {
          console.error('Track not found in context:', track.path);
          return;
        }
        
        audioPlayer.setPlaybackContext(contextType, contextTracks, contextIndex);
        await audioPlayer.playTrack(track.path, track);
      } catch (error) {
        console.error('Error playing track:', error);
      }
      return;
    }
    
    // Handle add to queue button clicks
    const queueBtn = e.target.closest('.add-to-queue-btn');
    if (queueBtn) {
      e.stopPropagation();
      const index = parseInt(queueBtn.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      audioPlayer.addToQueue(track);
      if (logFn) {
        logFn('info', `Added "${track.metadata?.common?.title || track.name}" to queue`);
      }
      return;
    }
    
    // Handle add to playlist button clicks
    const playlistBtn = e.target.closest('.add-to-playlist-btn');
    if (playlistBtn) {
      e.stopPropagation();
      const index = parseInt(playlistBtn.dataset.index);
      const track = getTrackByIndex(index);
      if (!track) return;
      
      playlistManager.openAddTracksModal([track]);
      return;
    }
  });
  
  // Delegated rating change handler
  const handleRatingSelect = async (e) => {
    const select = e.target.closest('.rating-select');
    if (!select) return;
    
    // Deduplicate if both input and change fire
    const newVal = select.value;
    if (select.dataset._lastValue === newVal) return;
    select.dataset._lastValue = newVal;
    
    const index = parseInt(select.dataset.index);
    const track = getTrackByIndex(index);
    if (!track) return;
    
    const rating = select.value ? parseInt(select.value) : null;
    
    // Update in music library
    if (rating === null) {
      musicLibrary.ratingByPath.delete(track.path);
    } else {
      musicLibrary.ratingByPath.set(track.path, rating);
    }
    
    // Save to backend
    await setRatingFn(track.path, rating);
  };
  
  container.addEventListener('input', handleRatingSelect);
  container.addEventListener('change', handleRatingSelect);
}

