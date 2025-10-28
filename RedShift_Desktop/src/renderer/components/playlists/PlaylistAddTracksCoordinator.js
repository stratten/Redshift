/**
 * PlaylistAddTracksCoordinator
 * Coordinates the "Add Tracks to Playlist" modal workflow
 */

function openAddTracksModal(
  currentPlaylist,
  addFilters,
  addSelected,
  musicLibrary,
  logCallback,
  populateBrowserCallback,
  applyFiltersCallback,
  updateSelectedUICallback
) {
  if (!currentPlaylist) return;
  
  logCallback('info', '🧩 Opening Add Tracks modal...');
  const modal = document.getElementById('addTracksModal');
  
  // Reset filters
  addFilters.genre = '';
  addFilters.artist = '';
  addFilters.album = '';
  addFilters.global = '';
  
  modal.querySelector('#addGlobalFilter').value = '';
  addSelected.clear();
  
  // Populate browser columns
  populateBrowserCallback();
  applyFiltersCallback();
  
  modal.style.display = 'flex';
  updateSelectedUICallback();
  logCallback('success', '🧩 Add Tracks modal shown');
}

function closeAddTracksModal() {
  const modal = document.getElementById('addTracksModal');
  if (modal) modal.style.display = 'none';
}

function coordinateAddBrowser(musicLibrary, addFilters, callbacks) {
  populateAddBrowser(musicLibrary);
}

function coordinateAddArtists(musicLibrary, addFilters, callbacks) {
  populateAddArtists(musicLibrary, addFilters.genre);
  addFilters.artist = '';
  callbacks.populateAlbums();
}

function coordinateAddAlbums(musicLibrary, addFilters) {
  populateAddAlbums(musicLibrary, addFilters.genre, addFilters.artist);
  addFilters.album = '';
}

function coordinateApplyFilters(
  musicLibrary,
  addFilters,
  addFilteredTracks,
  addSelected,
  renderTracksCallback,
  formatTimeCallback,
  currentPlaylistId,
  logCallback,
  viewPlaylistCallback,
  updateSelectedUICallback
) {
  // Apply filters and get filtered tracks
  const filtered = applyAddFilters(musicLibrary, addFilters);
  
  // Update the filtered tracks array (mutate the passed array)
  addFilteredTracks.length = 0;
  addFilteredTracks.push(...filtered);
  
  // Render the tracks list
  renderAddTracksListHTML(
    addFilteredTracks,
    addSelected,
    formatTimeCallback,
    {
      onAddSingle: true,
      onViewPlaylist: viewPlaylistCallback,
      onCheckboxChange: (filePath, checked) => {
        if (checked) {
          addSelected.add(filePath);
        } else {
          addSelected.delete(filePath);
        }
        updateSelectedUICallback();
      }
    },
    currentPlaylistId,
    logCallback
  );
  
  // Update select-all checkbox
  updateAddSelectAllCheckbox(addFilteredTracks, addSelected);
}

function coordinateSelectAll(checked, addFilteredTracks, addSelected, updateSelectedUICallback, renderTracksCallback) {
  if (checked) {
    addFilteredTracks.forEach(t => addSelected.add(t.path));
  } else {
    addFilteredTracks.forEach(t => addSelected.delete(t.path));
  }
  updateSelectedUICallback();
  renderTracksCallback();
}

