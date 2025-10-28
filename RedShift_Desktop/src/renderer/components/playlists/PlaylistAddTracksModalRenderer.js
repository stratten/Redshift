/**
 * PlaylistAddTracksModalRenderer
 * Handles rendering of the Add Tracks modal UI
 * - Modal structure and layout
 * - Tracks list within modal
 */

/**
 * Build the Add Tracks modal if it doesn't exist
 * @param {Object} callbacks - Object containing callback functions
 * @param {Function} callbacks.onClose - Called when modal should close
 * @param {Function} callbacks.onConfirmAdd - Called when "Add selected" is clicked
 * @param {Function} callbacks.onGenreClick - Called when genre is selected
 * @param {Function} callbacks.onArtistClick - Called when artist is selected
 * @param {Function} callbacks.onAlbumClick - Called when album is selected
 * @param {Function} callbacks.onGlobalFilter - Called when global filter changes
 * @param {Function} callbacks.onSelectAll - Called when select all checkbox changes
 * @returns {HTMLElement} The modal element
 */
function buildAddTracksModal(callbacks) {
  let modal = document.getElementById('addTracksModal');
  if (modal) return modal;
  
  modal = document.createElement('div');
  modal.id = 'addTracksModal';
  modal.className = 'modal';
  modal.style.display = 'none';
  
  const content = document.createElement('div');
  content.className = 'modal-content';
  content.style.maxWidth = '920px';
  content.style.width = '92%';
  
  content.innerHTML = `
    <div class="modal-header">
      <h3>Add Tracks to Playlist</h3>
    </div>
    <div class="modal-body">
      <div class="global-search" style="margin-bottom: 6px;">
        <input type="text" id="addGlobalFilter" placeholder="Search all tracks..." class="search-input" style="height: 32px;">
      </div>
      <div class="music-browser" id="addBrowser" style="margin-bottom: 8px;">
        <div class="browser-column">
          <div class="column-header"><span>All Genres</span></div>
          <div class="column-list" id="addGenresList"><div class="list-item selected" data-value="">All Genres</div></div>
        </div>
        <div class="browser-column">
          <div class="column-header"><span>All Artists</span></div>
          <div class="column-list" id="addArtistsList"><div class="list-item selected" data-value="">All Artists</div></div>
        </div>
        <div class="browser-column">
          <div class="column-header"><span>All Albums</span></div>
          <div class="column-list" id="addAlbumsList"><div class="list-item selected" data-value="">All Albums</div></div>
        </div>
      </div>
      <div id="addTracksList" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
      </div>
    </div>
    <div class="modal-footer">
      <div style="flex:1; display:flex; align-items:center; gap:8px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#6b7280; cursor:pointer;">
          <input type="checkbox" id="addSelectAll" style="transform: translateY(1px);"> Select all visible
        </label>
        <div id="addSelectedCount" style="font-size:12px; color:#6b7280;">0 selected</div>
      </div>
      <button class="btn btn-secondary" id="closeAddTracksBtn">Close</button>
      <button class="btn btn-primary" id="confirmAddSelectedBtn" disabled>Add selected</button>
    </div>
  `;
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Wire up event listeners with callbacks
  modal.addEventListener('click', (e) => { 
    if (e.target === modal && callbacks.onClose) callbacks.onClose(); 
  });
  
  content.querySelector('#closeAddTracksBtn').addEventListener('click', () => {
    if (callbacks.onClose) callbacks.onClose();
  });
  
  content.querySelector('#confirmAddSelectedBtn').addEventListener('click', () => {
    if (callbacks.onConfirmAdd) callbacks.onConfirmAdd();
  });
  
  // Wire browser clicks
  content.querySelector('#addGenresList').addEventListener('click', (e) => {
    if (e.target.classList.contains('list-item') && callbacks.onGenreClick) {
      const value = e.target.dataset.value || '';
      callbacks.onGenreClick(value);
    }
  });
  
  content.querySelector('#addArtistsList').addEventListener('click', (e) => {
    if (e.target.classList.contains('list-item') && callbacks.onArtistClick) {
      const value = e.target.dataset.value || '';
      callbacks.onArtistClick(value);
    }
  });
  
  content.querySelector('#addAlbumsList').addEventListener('click', (e) => {
    if (e.target.classList.contains('list-item') && callbacks.onAlbumClick) {
      const value = e.target.dataset.value || '';
      callbacks.onAlbumClick(value);
    }
  });
  
  // Global filter
  content.querySelector('#addGlobalFilter').addEventListener('input', (e) => {
    if (callbacks.onGlobalFilter) {
      callbacks.onGlobalFilter(e.target.value.toLowerCase());
    }
  });

  // Select all visible
  content.querySelector('#addSelectAll').addEventListener('change', (e) => {
    if (callbacks.onSelectAll) {
      callbacks.onSelectAll(e.target.checked);
    }
  });
  
  return modal;
}

/**
 * Render the tracks list within the Add Tracks modal
 * @param {Array} filteredTracks - Array of filtered track objects
 * @param {Set} selectedPaths - Set of selected file paths
 * @param {Function} formatTime - Function to format duration
 * @param {Object} callbacks - Object containing callback functions
 * @param {Function} callbacks.onAddSingle - Called when single track "Add" button clicked (filePath)
 * @param {Function} callbacks.onCheckboxChange - Called when checkbox state changes (filePath, checked)
 * @param {Function} callbacks.onViewPlaylist - Called to refresh playlist view (playlistId)
 * @param {number} currentPlaylistId - Current playlist ID for adding tracks
 * @param {Function} logBoth - Logging function
 */
function renderAddTracksListHTML(filteredTracks, selectedPaths, formatTime, callbacks, currentPlaylistId, logBoth) {
  const list = document.getElementById('addTracksList');
  if (!list) return;
  
  if (!filteredTracks.length) {
    list.innerHTML = '<div style="padding:16px; font-size:13px; color:#6b7280;">No matching tracks</div>';
    return;
  }
  
  const rows = filteredTracks.slice(0, 500).map(t => {
    const title = (t.metadata?.common?.title || t.name || '').replace(/\.[^/.]+$/, '').replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
    const artist = t.metadata?.common?.artist || 'Unknown Artist';
    const album = t.metadata?.common?.album || 'Unknown Album';
    const duration = t.metadata?.format?.duration ? formatTime(t.metadata.format.duration) : '--:--';
    const selected = selectedPaths.has(t.path);
    return `
      <div class="playlist-track-item" data-file-path="${t.path}" style="display:flex; align-items:center; gap:12px; padding:8px 12px; border-bottom:1px solid #f1f5f9; ${selected ? 'background:#eef2ff;' : ''}">
        <div style="width:18px; flex-shrink:0; display:flex; justify-content:center;">
          <input type="checkbox" class="add-select" data-file-path="${t.path}" ${selected ? 'checked' : ''}>
        </div>
        <div style="flex:2; font-weight:500; color:#1f2937; overflow:hidden; text-overflow:ellipsis;">${title}</div>
        <div style="flex:1; color:#6b7280; overflow:hidden; text-overflow:ellipsis;">${artist}</div>
        <div style="flex:1; color:#6b7280; overflow:hidden; text-overflow:ellipsis;">${album}</div>
        <div style="width:60px; color:#6b7280;">${duration}</div>
        <div style="flex-shrink:0; display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm add-track-to-pl" data-file-path="${t.path}">Add</button>
        </div>
      </div>`;
  }).join('');
  list.innerHTML = rows;
  
  // Wire add buttons
  list.querySelectorAll('.add-track-to-pl').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (callbacks.onAddSingle) {
        try {
          await window.electronAPI.invoke('playlist-add-tracks', currentPlaylistId, [btn.dataset.filePath]);
          logBoth('success', 'Track added to playlist');
          if (callbacks.onViewPlaylist) {
            await callbacks.onViewPlaylist(currentPlaylistId);
          }
        } catch (err) {
          logBoth('error', `Failed to add: ${err.message}`);
        }
      }
    });
  });

  // Wire per-row checkboxes
  list.querySelectorAll('.add-select').forEach(cb => {
    cb.addEventListener('change', () => {
      if (callbacks.onCheckboxChange) {
        const fp = cb.dataset.filePath;
        callbacks.onCheckboxChange(fp, cb.checked);
      }
    });
  });
}

/**
 * Update the selected tracks count and button state
 * @param {number} selectedCount - Number of selected tracks
 */
function updateAddSelectedUI(selectedCount) {
  const countEl = document.getElementById('addSelectedCount');
  const btn = document.getElementById('confirmAddSelectedBtn');
  if (countEl) countEl.textContent = `${selectedCount} selected`;
  if (btn) btn.disabled = selectedCount === 0;
}

