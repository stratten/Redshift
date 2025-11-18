/**
 * PlaylistOperations
 * Handles playlist track operations (add, remove, play, import/export)
 */

async function addSelectedTracksToPlaylist(playlistId, selectedPaths, viewPlaylistCallback, updateUICallback, logCallback) {
  if (!playlistId || selectedPaths.size === 0) return;
  try {
    const files = Array.from(selectedPaths.values());
    await window.electronAPI.invoke('playlist-add-tracks', playlistId, files);
    logCallback('success', `Added ${files.length} track(s)`);
    selectedPaths.clear();
    updateUICallback();
    await viewPlaylistCallback(playlistId);
  } catch (err) {
    logCallback('error', `Failed to add selected: ${err.message}`);
  }
}

async function playTrackFromPlaylist(filePath, currentPlaylist, currentPlaylistTracks, musicLibrary, audioPlayer, logCallback) {
  try {
    const track = musicLibrary.find(t => t.path === filePath);
    
    if (track && currentPlaylist) {
      // Map all playlist tracks to full track objects
      const playlistTracks = currentPlaylistTracks
        .map(playlistTrack => musicLibrary.find(t => t.path === playlistTrack.file_path))
        .filter(t => t !== undefined);
      
      // Find the index of the clicked track
      const trackIndex = playlistTracks.findIndex(t => t.path === filePath);
      
      if (trackIndex !== -1) {
        // Set up playback context for continuous playback from this track
        audioPlayer.setPlaybackContext(
          `playlist:${currentPlaylist.id}`, 
          playlistTracks, 
          trackIndex
        );
        
        // Play the selected track
        await audioPlayer.playTrack(track.path, track);
        
        logCallback('info', `Playing: ${track.name} from playlist "${currentPlaylist.name}"`);
      } else {
        logCallback('warning', `Track not found in playlist: ${filePath}`);
      }
    } else {
      logCallback('warning', `Track not found: ${filePath}`);
    }
  } catch (error) {
    logCallback('error', `Failed to play track: ${error.message}`);
  }
}

async function removeTrackFromPlaylist(trackId, playlistId, viewPlaylistCallback, loadPlaylistsCallback, logCallback) {
  if (!playlistId) return;
  
  try {
    await window.electronAPI.invoke('playlist-remove-tracks', playlistId, [trackId]);
    logCallback('success', 'Removed track from playlist');
    
    // Reload playlist data
    await viewPlaylistCallback(playlistId);
    await loadPlaylistsCallback(); // Update the sidebar count
    
  } catch (error) {
    logCallback('error', `Failed to remove track: ${error.message}`);
  }
}

async function exportPlaylist(playlistId, playlists, logCallback) {
  try {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    
    // Use electron's dialog to choose save location
    const defaultPath = `${playlist.name}.m3u`;
    const savePath = prompt(`Export playlist to:`, defaultPath);
    
    if (savePath) {
      await window.electronAPI.invoke('playlist-export-m3u', playlistId, savePath);
      logCallback('success', `Exported playlist to: ${savePath}`);
    }
    
  } catch (error) {
    logCallback('error', `Failed to export playlist: ${error.message}`);
  }
}

async function importPlaylist(loadPlaylistsCallback, logCallback) {
  try {
    const filePath = prompt('Enter path to M3U playlist file:');
    if (!filePath) return;
    
    const playlist = await window.electronAPI.invoke('playlist-import-m3u', filePath);
    logCallback('success', `Imported playlist: "${playlist.name}"`);
    await loadPlaylistsCallback();
    
  } catch (error) {
    logCallback('error', `Failed to import playlist: ${error.message}`);
  }
}

async function addTracksToPlaylist(playlistId, playlistName, filePaths, viewPlaylistCallback, loadPlaylistsCallback, logCallback) {
  if (!playlistId) {
    logCallback('warning', 'No playlist selected');
    return;
  }
  
  try {
    await window.electronAPI.invoke('playlist-add-tracks', playlistId, filePaths);
    logCallback('success', `Added ${filePaths.length} track(s) to "${playlistName}"`);
    
    // Reload playlist data
    await viewPlaylistCallback(playlistId);
    await loadPlaylistsCallback(); // Update the sidebar count
    
  } catch (error) {
    logCallback('error', `Failed to add tracks: ${error.message}`);
  }
}

function setupPlaylistTrackListeners(tracksArea, playTrackCallback, removeTrackCallback, reorderTracksCallback) {
  // Clone and replace to remove all old event listeners
  const newTracksArea = tracksArea.cloneNode(true);
  tracksArea.parentNode.replaceChild(newTracksArea, tracksArea);
  
  newTracksArea.addEventListener('click', async (e) => {
    if (e.target.closest('.play-track-btn')) {
      const filePath = e.target.closest('.play-track-btn').dataset.filePath;
      await playTrackCallback(filePath);
    } else if (e.target.closest('.remove-from-playlist-btn')) {
      const trackId = parseInt(e.target.closest('.remove-from-playlist-btn').dataset.trackId);
      await removeTrackCallback(trackId);
    }
  });
  
  newTracksArea.addEventListener('dblclick', async (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    
    const playBtn = row.querySelector('.play-track-btn');
    if (playBtn) {
      const filePath = playBtn.dataset.filePath;
      await playTrackCallback(filePath);
    }
  });
  
  // Drag and drop for reordering
  let draggedRow = null;
  let draggedPosition = null;
  
  newTracksArea.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.playlist-track-row');
    if (!row) return;
    
    draggedRow = row;
    draggedPosition = parseInt(row.dataset.position);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', row.innerHTML);
  });
  
  newTracksArea.addEventListener('dragend', (e) => {
    const row = e.target.closest('.playlist-track-row');
    if (row) {
      row.classList.remove('dragging');
    }
    // Remove all drag-over classes
    newTracksArea.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
    draggedRow = null;
    draggedPosition = null;
  });
  
  newTracksArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const row = e.target.closest('.playlist-track-row');
    if (!row || row === draggedRow) return;
    
    // Remove drag-over from all rows
    newTracksArea.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
    
    // Add drag-over to current row
    row.classList.add('drag-over');
  });
  
  newTracksArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dropRow = e.target.closest('.playlist-track-row');
    if (!dropRow || !draggedRow || dropRow === draggedRow) return;
    
    const dropPosition = parseInt(dropRow.dataset.position);
    
    // Remove drag-over class
    dropRow.classList.remove('drag-over');
    
    // Call the reorder callback with the source and target positions
    if (reorderTracksCallback) {
      await reorderTracksCallback(draggedPosition, dropPosition);
    }
  });
}

