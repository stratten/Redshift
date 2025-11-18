/**
 * MusicLibraryEventHandlers
 * Handles all event listener setup for the Music Library
 * - Table click events (play, queue, playlist, favorite, rating)
 * - Row selection & editing
 * - Double-click playback
 * - Context menu
 * - Filter inputs
 * - Browser columns
 * - Sort headers
 * - Playback listeners
 * - Scan progress
 */

/**
 * Setup all event listeners for the music table (one-time setup)
 * @param {HTMLElement} tableBody - Table body element
 * @param {Object} context - Context object with references
 * @param {Array} context.musicLibrary - Full music library array
 * @param {Array} context.filteredTracks - Filtered tracks array
 * @param {Object} context.audioPlayer - Audio player instance
 * @param {Object} context.editingState - Editing state object
 * @param {Function} context.getPlaybackContext - Function to get playback context
 * @param {Function} context.updateTrackPlayCountInUI - Function to update play count
 * @param {Function} context.enterEditMode - Function to enter edit mode
 * @param {Function} context.playTrackFromMenu - Function to play from menu
 * @param {Function} context.confirmDelete - Function to confirm delete
 * @param {Function} context.toggleFavorite - Function to toggle favorite
 * @param {Function} context.setRating - Function to set rating
 * @param {Function} context.getFileInfo - Function to get file info
 * @param {Function} context.showInFinder - Function to show in finder
 * @param {Map} context.favoriteByPath - Favorite map
 * @param {Map} context.ratingByPath - Rating map
 * @param {Function} context.logBoth - Logging function
 */
function setupMusicTableEventListeners(tableBody, context) {
  context.logBoth('info', `🎯 Adding click event listeners to table`);
  
  // Get playback context name for this view
  const playbackContext = context.getPlaybackContext();
  
  // Use shared delegated event handlers for favorites, ratings, and action buttons
  setupDelegatedTrackActionHandlers({
    container: tableBody,
    getTrackByIndex: (index) => context.musicLibrary[index],
    musicLibrary: {
      favoriteByPath: context.favoriteByPath,
      ratingByPath: context.ratingByPath
    },
    audioPlayer: context.audioPlayer,
    playlistManager: { openAddTracksModal: (tracks) => {
      // Music library uses showPlaylistPickerModal instead of playlist manager
      const track = tracks[0];
      const button = event.target.closest('.add-to-playlist-btn');
      if (button && track) {
        showPlaylistPickerModal(button, track.path, track.name, context.logBoth);
      }
    }},
    contextTracks: context.filteredTracks,
    contextType: playbackContext,
    setFavoriteStatusFn: context.toggleFavorite,
    setRatingFn: context.setRating,
    logFn: context.logBoth
  });

  // Row selection and inline editing
  tableBody.addEventListener('click', (e) => {
    // Ignore clicks when editing - let the input handle them
    if (context.editingState.editingCell) return;
    
    const row = e.target.closest('.music-row');
    if (!row) return;
    
    const rowIndex = parseInt(row.dataset.index);
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - context.editingState.lastClickTime;
    
    // Check if click is on an editable cell
    const editableCell = e.target.closest('.track-name, .artist-name, .album-name');
    
    // If clicking on already selected row's editable cell after delay, enter edit mode
    if (editableCell && context.editingState.selectedRowIndex === rowIndex && timeSinceLastClick > 500) {
      context.enterEditMode(editableCell, rowIndex);
      return;
    }
    
    // Update selection
    document.querySelectorAll('.music-row').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    context.editingState.selectedRowIndex = rowIndex;
    context.editingState.lastClickTime = currentTime;
    context.editingState.lastClickedCell = editableCell;
  });

  // Double-click handler for playing tracks directly
  tableBody.addEventListener('dblclick', async (e) => {
    // Ignore if we're editing
    if (context.editingState.editingCell) return;
    
    context.logBoth('info', `🎯 Table double-click detected on:`, e.target.tagName, e.target.className);
    
    // Find the row that was double-clicked
    const row = e.target.closest('.music-row');
    if (!row) {
      context.logBoth('warning', `🎯 Double-click was not on a music row`);
      return;
    }
    
    const index = parseInt(row.dataset.index);
    const track = context.musicLibrary[index];
    
    if (!track) {
      context.logBoth('error', `🎯 No track found at index ${index}`);
      return;
    }
    
    context.logBoth('info', `🎯 Double-click playing track: ${track.name}`);
    
    try {
      // Determine current context and set playback context  
      const currentTrackIndex = context.filteredTracks.findIndex(t => t.path === track.path);
      context.logBoth('info', `🎯 Found track at filtered index: ${currentTrackIndex}`);
      
      const playbackContext = context.getPlaybackContext();
      context.logBoth('info', `🎯 Got playback context: ${playbackContext}`);
      
      context.logBoth('info', `🎯 Setting playback context: ${playbackContext} with ${context.filteredTracks.length} tracks`);
      context.audioPlayer.setPlaybackContext(playbackContext, context.filteredTracks, currentTrackIndex);
      
      // Use the enhanced playTrack method
      await context.audioPlayer.playTrack(track.path, track);
      
      context.logBoth('success', `🎯 Double-click track loaded and playing: ${track.name}`);
    } catch (error) {
      context.logBoth('error', `🎯 Error playing track via double-click: ${error.message}`);
      context.logBoth('error', `🎯 Error stack: ${error.stack}`);
    }
  });
  
  // Context menu handler
  tableBody.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = e.target.closest('.music-row');
    if (!row) return;
    
    const index = parseInt(row.dataset.index);
    const track = context.musicLibrary[index];
    if (!track) return;
    
    showTrackContextMenu(e.clientX, e.clientY, track, index, {
      onPlay: () => context.playTrackFromMenu(track),
      onAddToQueue: () => context.audioPlayer.addToQueue(track),
      onGetInfo: () => context.getFileInfo(track.path),
      onShowInFinder: () => context.showInFinder(track.path),
      onAddToPlaylist: () => showPlaylistPickerModal(null, track.path, track.name, context.logBoth, { x: e.clientX, y: e.clientY }),
      onDelete: () => context.confirmDelete(track, index)
    });
  });
}

/**
 * Setup playback event listeners (track ended, play count updates)
 * @param {Object} context - Context object
 * @param {Function} context.loadSongMetadata - Function to reload metadata
 * @param {Function} context.loadRecentlyPlayed - Function to load recently played
 * @param {Function} context.updateTrackPlayCountInUI - Function to update UI
 * @param {Map} context.playCountByPath - Play count map
 * @param {Function} context.logBoth - Logging function
 */
function setupPlaybackEventListeners(context) {
  // Listen for track ended event to refresh Recently Played
  window.electronAPI.on('audio-track-ended', async (data) => {
    context.logBoth('success', '🔄 Track ended event received - triggering UI refresh');
    context.logBoth('info', `   Track: ${data?.track?.filePath || 'unknown'}`);
    
    // Reload metadata to get updated play counts and last_played timestamps
    context.logBoth('info', '📊 Reloading song metadata from database...');
    await context.loadSongMetadata();
    context.logBoth('success', '✅ Song metadata reloaded');
    
    // Check which subtab is currently visible and refresh it
    const librarySubtab = document.getElementById('librarySubtab');
    const recentlyPlayedTab = document.getElementById('recentlyPlayedSubtab');
    
    const libraryVisible = librarySubtab && librarySubtab.style.display !== 'none';
    const recentlyPlayedVisible = recentlyPlayedTab && recentlyPlayedTab.style.display !== 'none';
    
    context.logBoth('info', `   Library tab visible: ${libraryVisible ? 'YES' : 'NO'}`);
    context.logBoth('info', `   Recently Played tab visible: ${recentlyPlayedVisible ? 'YES' : 'NO'}`);
    
    if (libraryVisible && data?.track?.filePath) {
      context.logBoth('info', '🔄 Updating play count for track in library view...');
      context.updateTrackPlayCountInUI(data.track.filePath);
      context.logBoth('success', '✅ Play count updated in library view');
    }
    
    if (recentlyPlayedVisible) {
      context.logBoth('info', '🔄 Refreshing Recently Played view...');
      await context.loadRecentlyPlayed();
      context.logBoth('success', '✅ Recently Played view refreshed');
    }
  });
  
  // Listen for immediate play count increment event (from AudioPlayerPlayback)
  window.addEventListener('play-count-incremented', (event) => {
    const { filePath } = event.detail;
    context.logBoth('info', `🔔 Play count increment event received for: ${filePath}`);
    
    // Immediately increment the play count in our local Map
    const currentCount = context.playCountByPath.get(filePath) || 0;
    const newCount = currentCount + 1;
    context.playCountByPath.set(filePath, newCount);
    context.logBoth('success', `📊 Updated playCountByPath Map: ${currentCount} → ${newCount}`);
    
    // Update the UI immediately
    const librarySubtab = document.getElementById('librarySubtab');
    const libraryVisible = librarySubtab && librarySubtab.style.display !== 'none';
    
    if (libraryVisible) {
      context.logBoth('info', '🔄 Updating play count in UI...');
      context.updateTrackPlayCountInUI(filePath);
    }
  });
  
  context.logBoth('success', '✅ Playback listeners initialized for auto-refresh');
}

/**
 * Setup library scan progress listener
 * @param {Function} logBoth - Logging function (not used but kept for consistency)
 */
function setupScanProgressEventListener(logBoth) {
  // Listen for library scan progress events
  window.electronAPI.on('library-scan-progress', (data) => {
    const progressBar = document.getElementById('scanProgressBar');
    const progressMessage = document.getElementById('scanProgressMessage');
    const progressCount = document.getElementById('scanProgressCount');
    const progressFill = document.getElementById('scanProgressFill');
    
    if (data.phase === 'metadata' && data.total > 0) {
      // Show progress bar
      progressBar.style.display = 'block';
      
      // Update message and count
      progressMessage.textContent = data.message || 'Processing files...';
      progressCount.textContent = `${data.current}/${data.total}`;
      
      // Update progress bar fill
      const percentage = (data.current / data.total) * 100;
      progressFill.style.width = `${percentage}%`;
      
    } else if (data.phase === 'complete') {
      // Hide progress bar after a brief delay
      setTimeout(() => {
        progressBar.style.display = 'none';
      }, 1000);
    }
  });
}

/**
 * Setup filter input event listeners
 * @param {Function} applyFilters - Function to apply filters
 * @param {Function} logBoth - Logging function
 */
function setupFilterEventListeners(applyFilters, logBoth) {
  logBoth('info', '🎵 Setting up music table filters');
  try {
    // Global filter
    const globalFilter = document.getElementById('globalFilter');
    if (globalFilter) globalFilter.addEventListener('input', () => applyFilters());

    // Text column filters
    const columnFilters = document.querySelectorAll('.column-filter');
    if (columnFilters && columnFilters.length) {
      columnFilters.forEach(filter => {
        filter.addEventListener('input', () => applyFilters());
      });
    }

    // Favorite star filter
    const favBtn = document.getElementById('favoriteFilterBtn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        const pressed = favBtn.getAttribute('aria-pressed') === 'true';
        favBtn.setAttribute('aria-pressed', pressed ? 'false' : 'true');
        applyFilters();
      });
    }

    // Rating dropdown filter
    const ratingSelect = document.getElementById('ratingFilter');
    if (ratingSelect) ratingSelect.addEventListener('change', () => applyFilters());
  } catch (err) {
    logBoth('warning', `🎵 Filter setup partial failure: ${err.message}`);
  }
  
  logBoth('info', '🎵 Music table filters setup complete');
}

/**
 * Setup library browser (genre/artist/album) event listeners
 * @param {Function} selectGenre - Function to handle genre selection
 * @param {Function} selectArtist - Function to handle artist selection
 * @param {Function} selectAlbum - Function to handle album selection
 */
function setupLibraryBrowserEventListeners(selectGenre, selectArtist, selectAlbum) {
  // Setup click listeners for each column
  document.getElementById('genresList').addEventListener('click', (e) => {
    if (e.target.classList.contains('list-item')) {
      selectGenre(e.target.dataset.value);
    }
  });
  
  document.getElementById('artistsList').addEventListener('click', (e) => {
    if (e.target.classList.contains('list-item')) {
      selectArtist(e.target.dataset.value);
    }
  });
  
  document.getElementById('albumsList').addEventListener('click', (e) => {
    if (e.target.classList.contains('list-item')) {
      selectAlbum(e.target.dataset.value);
    }
  });
}

/**
 * Setup sort header click listeners
 * @param {Object} sortState - Sort state object
 * @param {Function} onSortChange - Callback when sort changes
 * @param {Function} logBoth - Logging function
 */
function setupSortHeaderEventListeners(sortState, onSortChange, logBoth) {
  // Bind sorting strictly to the label spans (and the indicator inside them),
  // not the whole TH, so clicks on filter inputs do not toggle sorting
  const headerTrack = document.querySelector('th.col-track .column-header span');
  const headerArtist = document.querySelector('th.col-artist .column-header span');
  const headerAlbum = document.querySelector('th.col-album .column-header span');
  let headerDuration = document.querySelector('th.col-duration span');
  if (!headerDuration) {
    // Wrap the plain text in a span so we can prepend the indicator and attach listeners
    const th = document.querySelector('th.col-duration');
    if (th) {
      const text = th.textContent.trim() || 'Duration';
      th.textContent = '';
      const span = document.createElement('span');
      span.textContent = text;
      th.appendChild(span);
      headerDuration = span;
    }
  }
  const headerPlaycount = document.querySelector('th.col-playcount .column-header span');
  
  const attach = (el, field) => {
    if (!el) return;
    el.style.cursor = 'pointer';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const triggerSort = () => {
      // Toggle direction if same field, otherwise default to asc
      if (sortState.sortField === field) {
        sortState.sortDirection = sortState.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.sortField = field;
        sortState.sortDirection = 'asc';
      }
      logBoth('info', `🎵 Sorting by ${sortState.sortField} (${sortState.sortDirection})`);
      onSortChange();
    };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSort();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerSort();
      }
    });
  };
  
  attach(headerTrack, 'track');
  attach(headerArtist, 'artist');
  attach(headerAlbum, 'album');
  attach(headerDuration, 'duration');
  attach(headerPlaycount, 'playcount');
}

