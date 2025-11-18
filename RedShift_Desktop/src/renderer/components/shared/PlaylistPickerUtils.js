/**
 * PlaylistPickerUtils
 * Shared utilities for playlist picker modal and quick playlist creation
 */

/**
 * Show a quick inline dialog to create a new playlist
 * @param {Function} onSuccess - Callback function called with (playlistId, playlistName) after successful creation
 * @param {Function} logFn - Logging function
 * @returns {void}
 */
function showQuickPlaylistCreationDialog(onSuccess, logFn) {
  // Create a simple inline dialog for playlist name
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const box = document.createElement('div');
  box.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    min-width: 320px;
  `;
  
  box.innerHTML = `
    <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Create New Playlist</h3>
    <input type="text" id="_quickPlaylistName" placeholder="Playlist name" 
      style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; margin-bottom: 16px;">
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="_quickPlaylistCancel" style="padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer;">Cancel</button>
      <button id="_quickPlaylistCreate" style="padding: 8px 16px; border: none; background: #6366f1; color: white; border-radius: 6px; cursor: pointer;">Create</button>
    </div>
  `;
  
  dialog.appendChild(box);
  document.body.appendChild(dialog);
  
  const input = document.getElementById('_quickPlaylistName');
  const cancelBtn = document.getElementById('_quickPlaylistCancel');
  const createBtn = document.getElementById('_quickPlaylistCreate');
  
  input.focus();
  
  const cleanup = () => dialog.remove();
  
  cancelBtn.onclick = cleanup;
  dialog.onclick = (e) => { if (e.target === dialog) cleanup(); };
  
  const create = async () => {
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    
    try {
      const created = await window.electronAPI.invoke('playlist-create', name, '', true);
      logFn('success', `Created playlist: "${name}"`);
      cleanup();
      
      // Refresh the playlists list in the UI
      if (window.redshiftUI && window.redshiftUI.playlistManager) {
        await window.redshiftUI.playlistManager.loadPlaylists();
      }
      
      // Call the success callback with the new playlist info
      if (onSuccess) {
        onSuccess(created.id, name);
      }
    } catch (err) {
      logFn('error', `Failed to create playlist: ${err.message}`);
      cleanup();
    }
  };
  
  createBtn.onclick = create;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') create();
    if (e.key === 'Escape') cleanup();
  };
}

/**
 * Show playlist picker modal to add a track to an existing or new playlist
 * @param {HTMLElement} anchorEl - Element to anchor the picker near
 * @param {string} filePath - Path to the track file
 * @param {string} displayName - Display name of the track
 * @param {Function} logBoth - Logging function
 * @param {Object} mouseCoords - Optional mouse coordinates { x, y } for positioning when no anchor
 */
async function showPlaylistPickerModal(anchorEl, filePath, displayName, logBoth, mouseCoords = null) {
  // Remove existing picker if any
  const existing = document.getElementById('playlistPicker');
  if (existing) existing.remove();
  
  // Fetch playlists
  let playlists = [];
  try {
    playlists = await window.electronAPI.invoke('playlist-get-all');
  } catch (err) {
    logBoth('error', `Failed to load playlists: ${err.message}`);
    return;
  }
  
  // Helper to create menu items
  function makeItem(label, onClick, opts = {}) {
    const item = document.createElement('div');
    item.textContent = label;
    item.style.cssText = `
      padding: 6px 10px;
      font-size: 13px;
      cursor: ${opts.already ? 'default' : 'pointer'};
      border-radius: 4px;
      transition: background 0.1s;
      color: ${opts.already ? '#9ca3af' : '#111827'};
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    if (!opts.already) {
      item.onmouseenter = () => { item.style.background = '#f3f4f6'; };
      item.onmouseleave = () => { item.style.background = 'transparent'; };
      item.onclick = onClick;
    }
    if (opts.already) {
      const check = document.createElement('span');
      check.textContent = '✓';
      check.style.color = '#10b981';
      item.prepend(check);
    }
    return item;
  }
  
  // Check which playlists already contain this track
  let containsById = new Map();
  try {
    for (const pl of playlists) {
      const tracks = await window.electronAPI.invoke('playlist-get-tracks', pl.id);
      const has = tracks.some(t => t.path === filePath);
      containsById.set(pl.id, has);
    }
  } catch (err) {
    logBoth('error', `Failed to check playlist contents: ${err.message}`);
  }
  
  // Create picker UI
  const picker = document.createElement('div');
  picker.id = 'playlistPicker';
  picker.style.cssText = `
    position: fixed;
    z-index: 9999;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 6px 4px;
    min-width: 180px;
    max-width: 260px;
    max-height: 300px;
    overflow-y: auto;
  `;
  
  // Close picker on outside click
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
  
  // Show existing playlists
  if (playlists.length > 0) {
    playlists.forEach(pl => {
      const already = containsById.get(pl.id) === true;
      picker.appendChild(makeItem(pl.name, async () => {
        try {
          await window.electronAPI.invoke('playlist-add-tracks', pl.id, [filePath]);
          logBoth('success', `Added to playlist: ${pl.name}`);
        } catch (err) {
          logBoth('error', `Failed to add to playlist: ${err.message}`);
        } finally {
          picker.remove();
        }
      }, { already }));
    });
  } else {
    const empty = document.createElement('div');
    empty.textContent = 'No playlists yet';
    empty.style.fontSize = '12px';
    empty.style.color = '#6b7280';
    empty.style.padding = '8px 10px';
    picker.appendChild(empty);
  }
  
  // Divider and create new
  const divider = document.createElement('div');
  divider.style.height = '1px';
  divider.style.background = '#e5e7eb';
  divider.style.margin = '6px 4px';
  picker.appendChild(divider);
  
  picker.appendChild(makeItem('Create new playlist…', () => {
    // Close the picker
    picker.remove();
    
    // Show quick creation dialog
    showQuickPlaylistCreationDialog(async (playlistId, playlistName) => {
      // After playlist is created, add the track to it
      try {
        await window.electronAPI.invoke('playlist-add-tracks', playlistId, [filePath]);
        logBoth('success', `Added "${displayName}" to playlist: ${playlistName}`);
      } catch (err) {
        logBoth('error', `Failed to add to playlist: ${err.message}`);
      }
    }, logBoth);
  }));
  
  document.body.appendChild(picker);
  
  // Position near anchor button with viewport clamping
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const padding = 8; // keep some space from edges
    let top = Math.round(rect.bottom + 6);
    let left = Math.round(rect.left);
    
    // Measure and clamp horizontally
    const width = picker.offsetWidth || 260; // fallback to min width
    const height = picker.offsetHeight || 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    if (left + width + padding > vw) {
      left = Math.max(padding, vw - width - padding);
    }
    if (left < padding) {
      left = padding;
    }
    
    // Clamp vertically
    if (top + height + padding > vh) {
      // If doesn't fit below, try above
      const aboveTop = rect.top - height - 6;
      if (aboveTop >= padding) {
        top = aboveTop;
      } else {
        top = Math.max(padding, vh - height - padding);
      }
    }
    if (top < padding) {
      top = padding;
    }
    
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
  } else if (mouseCoords) {
    // Position at mouse coordinates (e.g., from context menu)
    const padding = 8;
    const width = picker.offsetWidth || 260;
    const height = picker.offsetHeight || 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    let left = mouseCoords.x;
    let top = mouseCoords.y + 6; // Slightly below cursor
    
    // Clamp horizontally
    if (left + width + padding > vw) {
      left = Math.max(padding, vw - width - padding);
    }
    if (left < padding) {
      left = padding;
    }
    
    // Clamp vertically
    if (top + height + padding > vh) {
      top = Math.max(padding, vh - height - padding);
    }
    if (top < padding) {
      top = padding;
    }
    
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
  } else {
    // No anchor or coordinates, center on screen
    const width = picker.offsetWidth || 260;
    const height = picker.offsetHeight || 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    const left = Math.round((vw - width) / 2);
    const top = Math.round((vh - height) / 2);
    
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
  }
}

