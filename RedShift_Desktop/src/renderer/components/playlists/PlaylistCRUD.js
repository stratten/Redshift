/**
 * PlaylistCRUD
 * Create, Read, Update, Delete operations for playlists
 */

function showCreatePlaylistModalDialog() {
  const modal = document.getElementById('createPlaylistModal');
  const nameInput = document.getElementById('playlistNameInput');
  const descInput = document.getElementById('playlistDescInput');
  
  // Reset form
  nameInput.value = '';
  descInput.value = '';
  
  modal.style.display = 'flex';
  nameInput.focus();
}

function hideCreatePlaylistModalDialog() {
  document.getElementById('createPlaylistModal').style.display = 'none';
}

async function createPlaylistInDB(logCallback, loadPlaylistsCallback) {
  const nameInput = document.getElementById('playlistNameInput');
  const descInput = document.getElementById('playlistDescInput');
  
  const name = nameInput.value.trim();
  if (!name) {
    alert('Please enter a playlist name');
    nameInput.focus();
    return;
  }
  
  try {
    const playlist = await window.electronAPI.invoke('playlist-create', 
      name, 
      descInput.value.trim(), 
      true  // Default to sync-enabled (can be changed later via sync settings)
    );
    
    logCallback('success', `Created playlist: "${name}"`);
    hideCreatePlaylistModalDialog();
    await loadPlaylistsCallback();
    
  } catch (error) {
    logCallback('error', `Failed to create playlist: ${error.message}`);
  }
}

async function deletePlaylistFromDB(playlistId, playlists, currentPlaylist, logCallback, loadPlaylistsCallback, clearCurrentPlaylistCallback) {
  const playlist = playlists.find(p => p.id === playlistId);
  if (!playlist) return;
  
  const confirmDelete = confirm(`Delete playlist "${playlist.name}"? This action cannot be undone.`);
  if (!confirmDelete) return;
  
  try {
    await window.electronAPI.invoke('playlist-delete', playlistId);
    logCallback('success', `Deleted playlist: "${playlist.name}"`);
    await loadPlaylistsCallback();
    
    // Clear current playlist view if this was the selected playlist
    if (currentPlaylist?.id === playlistId) {
      clearCurrentPlaylistCallback();
    }
    
  } catch (error) {
    logCallback('error', `Failed to delete playlist: ${error.message}`);
  }
}

async function editPlaylistInDB(playlistId, playlists, logCallback, loadPlaylistsCallback) {
  const playlist = playlists.find(p => p.id === playlistId);
  if (!playlist) return;
  
  const newName = prompt('Playlist name:', playlist.name);
  if (newName === null || newName.trim() === playlist.name) return;
  
  if (!newName.trim()) {
    alert('Playlist name cannot be empty');
    return;
  }
  
  try {
    await window.electronAPI.invoke('playlist-update', playlistId, { name: newName.trim() });
    logCallback('success', `Renamed playlist to: "${newName.trim()}"`);
    await loadPlaylistsCallback();
    
  } catch (error) {
    logCallback('error', `Failed to update playlist: ${error.message}`);
  }
}

function setupCreatePlaylistModalListeners(createCallback, hideCallback) {
  const createModal = document.getElementById('createPlaylistModal');
  const createBtn = document.getElementById('confirmCreatePlaylist');
  const cancelBtn = document.getElementById('cancelCreatePlaylist');
  
  createBtn.addEventListener('click', () => {
    createCallback();
  });
  
  cancelBtn.addEventListener('click', () => {
    hideCallback();
  });
  
  // Close modal on background click
  createModal.addEventListener('click', (e) => {
    if (e.target === createModal) {
      hideCallback();
    }
  });
  
  // Handle Enter key in playlist name input
  document.getElementById('playlistNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      createCallback();
    }
  });
}

