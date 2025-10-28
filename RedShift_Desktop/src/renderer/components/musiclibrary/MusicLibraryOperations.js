/**
 * MusicLibraryOperations
 * Handles all business logic operations for the music library
 * - Library scanning
 * - Metadata loading
 * - Track playback
 * - Track deletion
 * - Inline editing
 * - UI updates
 */

/**
 * Scan the music library
 * @param {Function} logBoth - Logging function
 * @returns {Promise<Array>} Array of scanned tracks
 */
async function scanMusicLibraryFiles(logBoth) {
  logBoth('info', '🔍 Starting music library scan...');
  
  try {
    // Use the dedicated music library scan
    const tracks = await window.electronAPI.invoke('scan-music-library');
    logBoth('info', `🔍 Raw scan result:`, tracks ? `${tracks.length} items` : 'null/undefined');
    
    const musicLibrary = tracks || [];
    logBoth('success', `🔍 Stored ${musicLibrary.length} tracks in musicLibrary array`);
    
    // Debug: Log first few tracks
    if (musicLibrary.length > 0) {
      logBoth('info', `🔍 Sample tracks:`, musicLibrary.slice(0, 3).map(t => t.name || t.path));
    }
    
    return musicLibrary;
  } catch (error) {
    logBoth('error', `🔍 Music library scan failed: ${error.message}`);
    return [];
  }
}

/**
 * Load song metadata from database
 * @param {Function} getAllSongMetadata - Function to fetch all metadata
 * @param {Map} favoriteByPath - Map to populate with favorites
 * @param {Map} ratingByPath - Map to populate with ratings
 * @param {Map} playCountByPath - Map to populate with play counts
 * @param {Function} logBoth - Logging function
 */
async function loadAllSongMetadata(getAllSongMetadata, favoriteByPath, ratingByPath, playCountByPath, logBoth) {
  try {
    const metadataRows = await getAllSongMetadata();
    
    favoriteByPath.clear();
    ratingByPath.clear();
    playCountByPath.clear();
    
    if (Array.isArray(metadataRows)) {
      metadataRows.forEach(row => {
        if (!row || !row.file_path) return;
        
        if (row.is_favorite === 1) {
          favoriteByPath.set(row.file_path, true);
        }
        
        if (typeof row.rating === 'number' && row.rating > 0) {
          ratingByPath.set(row.file_path, row.rating);
        }
        
        if (typeof row.play_count === 'number') {
          playCountByPath.set(row.file_path, row.play_count);
        }
      });
    }
    
    logBoth('info', `🎵 Loaded metadata: ${favoriteByPath.size} favorites, ${ratingByPath.size} ratings, ${playCountByPath.size} play counts`);
  } catch (err) {
    logBoth('error', `🎵 Failed to load song metadata: ${err.message}`);
  }
}

/**
 * Load recently played tracks
 * @param {number} limit - Maximum number of tracks to load
 * @param {Array} musicLibrary - Full music library array
 * @param {Function} logBoth - Logging function
 * @returns {Promise<Array>} Array of recently played tracks
 */
async function loadRecentlyPlayedTracks(limit, musicLibrary, logBoth) {
  try {
    logBoth('info', 'Loading recently played tracks...');
    
    const recentlyPlayedData = await window.electronAPI.invoke('songs-get-recently-played', limit);
    
    if (!recentlyPlayedData || recentlyPlayedData.length === 0) {
      logBoth('info', 'No recently played tracks found');
      return [];
    }
    
    // Map the database rows to track objects by matching with the music library
    const recentTracks = recentlyPlayedData.map(row => {
      const track = musicLibrary.find(t => t.path === row.file_path);
      if (track) {
        return {
          ...track,
          lastPlayed: row.last_played,
          playCount: row.play_count || 0
        };
      }
      return null;
    }).filter(t => t !== null);
    
    logBoth('success', `Loaded ${recentTracks.length} recently played tracks`);
    return recentTracks;
    
  } catch (error) {
    logBoth('error', `Failed to load recently played: ${error.message}`);
    return [];
  }
}

/**
 * Setup event listeners for recently played view
 * @param {Array} tracks - Array of recently played tracks
 * @param {Object} audioPlayer - Audio player instance
 */
function setupRecentlyPlayedEventListeners(tracks, audioPlayer) {
  const playButtons = document.querySelectorAll('.play-recently-played-btn');
  const queueButtons = document.querySelectorAll('.add-to-queue-recently-played-btn');
  
  playButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const index = parseInt(button.dataset.index);
      const track = tracks[index];
      if (track) {
        // Set playback context for continuous playback
        audioPlayer.setPlaybackContext('recently-played', tracks, index);
        await audioPlayer.playTrack(track.path, track);
      }
    });
  });
  
  queueButtons.forEach(button => {
    button.addEventListener('click', () => {
      const index = parseInt(button.dataset.index);
      const track = tracks[index];
      if (track) {
        audioPlayer.addToQueue(track);
      }
    });
  });
}

/**
 * Play a track from context menu
 * @param {Object} track - Track object
 * @param {Array} filteredTracks - Current filtered tracks array
 * @param {Function} getPlaybackContext - Function to get playback context
 * @param {Object} audioPlayer - Audio player instance
 * @param {Function} logBoth - Logging function
 */
async function playTrackFromContextMenu(track, filteredTracks, getPlaybackContext, audioPlayer, logBoth) {
  try {
    logBoth('info', `🎵 Context menu: Playing track: ${track.name}`);
    
    // Determine current context and set playback context
    const currentTrackIndex = filteredTracks.findIndex(t => t.path === track.path);
    logBoth('info', `🎵 Found track at filtered index: ${currentTrackIndex}`);
    
    const context = getPlaybackContext();
    logBoth('info', `🎵 Setting playback context: ${context} with ${filteredTracks.length} tracks`);
    audioPlayer.setPlaybackContext(context, filteredTracks, currentTrackIndex);
    
    // Play the track
    await audioPlayer.playTrack(track.path, track);
    
    logBoth('success', `🎵 Context menu track loaded and playing: ${track.name}`);
  } catch (error) {
    logBoth('error', `🎵 Error playing track from context menu: ${error.message}`);
  }
}

/**
 * Delete a track from library with confirmation
 * @param {Object} track - Track object
 * @param {number} index - Track index
 * @param {Function} logBoth - Logging function
 * @param {Function} onDeleteSuccess - Callback when deletion succeeds
 */
async function deleteTrackFromLibrary(track, index, logBoth, onDeleteSuccess) {
  if (confirm(`Delete "${track.name}" from library?\n\nThis will permanently delete the file from your computer. This action cannot be undone.`)) {
    try {
      logBoth('info', `Deleting: ${track.name}`);
      const result = await window.electronAPI.invoke('library-delete-track', track.path);
      
      if (result.success) {
        logBoth('success', `Deleted: ${track.name}`);
        if (onDeleteSuccess) {
          onDeleteSuccess(track.path);
        }
      } else {
        logBoth('error', `Failed to delete: ${result.message}`);
      }
    } catch (error) {
      logBoth('error', `Error deleting track: ${error.message}`);
    }
  }
}

/**
 * Enter inline edit mode for a cell
 * @param {HTMLElement} cell - Cell element to edit
 * @param {number} rowIndex - Row index
 * @param {Array} musicLibrary - Full music library array
 * @param {Object} editingState - Current editing state object
 * @param {Function} logBoth - Logging function
 */
function enterInlineEditMode(cell, rowIndex, musicLibrary, editingState, logBoth) {
  // Don't re-enter edit mode if already editing this cell
  if (editingState.editingCell && editingState.editingCell.cell === cell) {
    return;
  }
  
  if (editingState.editingCell) {
    // Exit current edit without saving
    exitInlineEditMode(editingState, logBoth, false);
  }
  
  const track = musicLibrary[rowIndex];
  if (!track) return;
  
  const fieldType = cell.classList.contains('track-name') ? 'title' :
                   cell.classList.contains('artist-name') ? 'artist' : 'album';
  
  const currentValue = cell.textContent.trim();
  logBoth('info', `📝 Edit mode: ${fieldType} = "${currentValue}"`);
  
  // Replace cell content with input
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.className = 'inline-edit-input';
  input.style.cssText = 'width: 100%; padding: 2px 4px; border: 1px solid #5a67d8; border-radius: 2px; font-size: 11px;';
  
  cell.textContent = '';
  cell.appendChild(input);
  input.focus();
  input.select(); // Select all text for easy editing
  
  editingState.editingCell = { cell, input, fieldType, rowIndex, originalValue: currentValue };
  
  // Log input value changes to terminal
  input.addEventListener('input', () => {
    logBoth('info', `⌨️  Input changed to: "${input.value}"`);
  });
}

/**
 * Exit inline edit mode
 * @param {Object} editingState - Current editing state object
 * @param {Function} logBoth - Logging function
 * @param {boolean} save - Whether to save the changes
 * @param {string|null} capturedValue - Optional captured value to use instead of reading from input
 * @param {Function} updateSongMetadata - Function to update metadata in database
 * @param {Array} musicLibrary - Full music library array
 */
async function exitInlineEditMode(editingState, logBoth, save, capturedValue = null, updateSongMetadata = null, musicLibrary = null) {
  if (!editingState.editingCell) {
    return;
  }
  
  const { cell, input, fieldType, rowIndex, originalValue } = editingState.editingCell;
  
  // Use the captured value if provided, otherwise read from input
  const rawValue = capturedValue !== null ? capturedValue : input.value;
  const newValue = rawValue.trim();
  
  logBoth('info', `📤 Exit edit: "${originalValue}" → "${newValue}" (${newValue !== originalValue ? 'CHANGED' : 'unchanged'})`);
  
  // Clear editing state FIRST to prevent re-entry
  editingState.editingCell = null;
  
  // Restore display
  cell.textContent = save && newValue ? newValue : originalValue;
  
  // Save to backend if changed
  if (save && newValue && newValue !== originalValue && updateSongMetadata && musicLibrary) {
    const track = musicLibrary[rowIndex];
    if (track) {
      try {
        await updateSongMetadata(track.path, fieldType, newValue);
        // Update local data
        if (fieldType === 'title') {
          track.metadata.common.title = newValue;
        } else if (fieldType === 'artist') {
          track.metadata.common.artist = newValue;
        } else if (fieldType === 'album') {
          track.metadata.common.album = newValue;
        }
        logBoth('success', `Updated ${fieldType} to: ${newValue}`);
      } catch (err) {
        logBoth('error', `Failed to update ${fieldType}: ${err.message}`);
        cell.textContent = originalValue; // Revert on error
      }
    }
  }
}

/**
 * Update play count in UI for a specific track
 * @param {string} filePath - File path of track
 * @param {Map} playCountByPath - Map of play counts
 * @param {Array} musicLibrary - Full music library array
 * @param {Function} logBoth - Logging function
 */
function updateTrackPlayCountDisplay(filePath, playCountByPath, musicLibrary, logBoth) {
  // Get the updated play count from the Map (not from track object)
  const playCount = playCountByPath.get(filePath) || 0;
  
  logBoth('info', `   Retrieved play count from Map: ${playCount}`);
  
  // Find the track's index in the music library
  const trackIndex = musicLibrary.findIndex(t => t.path === filePath);
  if (trackIndex === -1) {
    logBoth('warning', `   Track not found in musicLibrary for path: ${filePath}`);
    return;
  }
  
  logBoth('info', `   Track found at index ${trackIndex} in musicLibrary`);
  
  // Find the row in the DOM using data-index attribute
  const tableBody = document.getElementById('musicTableBody');
  if (!tableBody) {
    logBoth('warning', `   Table body not found`);
    return;
  }
  
  const row = tableBody.querySelector(`tr[data-index="${trackIndex}"]`);
  if (row) {
    logBoth('info', `   ✓ Found matching row in DOM`);
    
    // Update the play count cell
    const playCountCell = row.querySelector('.col-playcount .play-count');
    if (playCountCell) {
      const oldValue = playCountCell.textContent;
      playCountCell.textContent = playCount;
      logBoth('success', `   ✅ Updated play count: ${oldValue} → ${playCount}`);
    } else {
      logBoth('warning', `   Play count cell not found in row`);
    }
  } else {
    logBoth('warning', `   ⚠️ No row found with data-index="${trackIndex}"`);
  }
}

