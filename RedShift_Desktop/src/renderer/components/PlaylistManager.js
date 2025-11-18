// src/renderer/components/PlaylistManager.js - Playlist Management Component

class PlaylistManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.playlists = [];
    this.currentPlaylist = null;
    this.currentPlaylistTracks = [];
    
    // Add-tracks modal state
    this.addFilters = {
      genre: '',
      artist: '',
      album: '',
      global: ''
    };
    this.addFilteredTracks = [];
    this.addSelected = new Set();
    
    this.setupEventListeners();
    this.loadPlaylists();
  }
  
  setupEventListeners() {
    // Create playlist button
    document.getElementById('createPlaylistBtn').addEventListener('click', () => {
      this.showCreatePlaylistModal();
    });
    
    // Import playlist button
    document.getElementById('importPlaylistBtn').addEventListener('click', () => {
      this.importPlaylist();
    });
    
    // Modal event listeners
    this.setupModalEventListeners();
    
    // Listen for play count updates
    window.addEventListener('play-count-incremented', (event) => {
      const { filePath } = event.detail;
      this.updateTrackPlayCountInUI(filePath);
    });
  }
  
  setupModalEventListeners() {
    // Create playlist modal - delegate to CRUD module
    setupCreatePlaylistModalListeners(
      () => this.createPlaylist(),
      () => this.hideCreatePlaylistModal()
    );
  }
  
  async loadPlaylists() {
    try {
      this.playlists = await window.electronAPI.invoke('playlist-get-all');
      this.renderPlaylistsList();
      this.ui.logBoth('info', `Loaded ${this.playlists.length} playlists`);
    } catch (error) {
      this.ui.logBoth('error', `Failed to load playlists: ${error.message}`);
    }
  }
  
  renderPlaylistsList() {
    const playlistsList = document.getElementById('playlistsList');
    
    // Delegate to global renderer
    const html = renderPlaylistsList(this.playlists);
    playlistsList.innerHTML = html;
    
    // Clear and re-add event listeners to prevent stacking
    this.setupPlaylistActionListeners();
  }
  
  setupPlaylistActionListeners() {
    const playlistsList = document.getElementById('playlistsList');
    
    // Clone and replace to remove all old event listeners
    const newPlaylistsList = playlistsList.cloneNode(true);
    playlistsList.parentNode.replaceChild(newPlaylistsList, playlistsList);
    
    newPlaylistsList.addEventListener('click', async (e) => {
      const playlistId = e.target.closest('[data-playlist-id]')?.dataset.playlistId;
      if (!playlistId) return;
      
      const playlistIdNum = parseInt(playlistId);
      
      if (e.target.closest('.play-playlist-btn')) {
        await this.playPlaylist(playlistIdNum);
      } else if (e.target.closest('.edit-playlist-btn')) {
        await this.editPlaylist(playlistIdNum);
      } else if (e.target.closest('.delete-playlist-btn')) {
        await this.deletePlaylist(playlistIdNum);
      } else if (e.target.closest('.playlist-item')) {
        await this.viewPlaylist(playlistIdNum);
      }
    });
  }
  
  showCreatePlaylistModal() {
    showCreatePlaylistModalDialog();
  }
  
  hideCreatePlaylistModal() {
    hideCreatePlaylistModalDialog();
  }
  
  async createPlaylist() {
    await createPlaylistInDB(this.ui.logBoth.bind(this.ui), () => this.loadPlaylists());
  }
  
  async deletePlaylist(playlistId) {
    await deletePlaylistFromDB(
      playlistId,
      this.playlists,
      this.currentPlaylist,
      this.ui.logBoth.bind(this.ui),
      () => this.loadPlaylists(),
      () => {
        this.currentPlaylist = null;
        this.currentPlaylistTracks = [];
        this.renderPlaylistTracks();
      }
    );
  }
  
  async editPlaylist(playlistId) {
    await editPlaylistInDB(playlistId, this.playlists, this.ui.logBoth.bind(this.ui), () => this.loadPlaylists());
  }
  
  async viewPlaylist(playlistId) {
    try {
      this.currentPlaylist = await window.electronAPI.invoke('playlist-get', playlistId);
      this.currentPlaylistTracks = await window.electronAPI.invoke('playlist-get-tracks', playlistId);
      
      this.renderPlaylistDetails();
      this.renderPlaylistTracks();
      
      this.ui.logBoth('info', `Viewing playlist: "${this.currentPlaylist.name}"`);
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to load playlist: ${error.message}`);
    }
  }
  
  async playPlaylist(playlistId) {
    try {
      const tracks = await window.electronAPI.invoke('playlist-get-tracks', playlistId);
      const playlist = this.playlists.find(p => p.id === playlistId);
      
      if (tracks.length === 0) {
        this.ui.logBoth('warning', `Playlist "${playlist.name}" is empty`);
        return;
      }
      
      // Map playlist tracks to full track objects from music library
      const musicLibrary = this.ui.musicLibrary.musicLibrary;
      const playlistTracks = tracks
        .map(playlistTrack => musicLibrary.find(t => t.path === playlistTrack.file_path))
        .filter(track => track !== undefined); // Remove tracks not found in library
      
      if (playlistTracks.length === 0) {
        this.ui.logBoth('warning', `No tracks from playlist "${playlist.name}" found in library`);
        return;
      }
      
      // Set up playback context for continuous playback
      this.ui.audioPlayer.setPlaybackContext(`playlist:${playlistId}`, playlistTracks, 0);
      
      // Play the first track
      const firstTrack = playlistTracks[0];
      await this.ui.audioPlayer.playTrack(firstTrack.path, firstTrack);
      
      this.ui.logBoth('success', `Playing playlist: "${playlist.name}" (${playlistTracks.length} tracks)`);
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to play playlist: ${error.message}`);
    }
  }
  
  renderPlaylistDetails() {
    const detailsArea = document.getElementById('playlistDetails');
    
    // Delegate to global renderer
    const html = renderPlaylistDetailsHTML(this.currentPlaylist);
    detailsArea.innerHTML = html;
    
    // Wire Add Tracks button if playlist is selected
    if (this.currentPlaylist) {
      const addBtn = document.getElementById('addTracksBtn');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          this.ui.logBoth('info', `🧩 Add Tracks clicked for playlist: ${this.currentPlaylist?.name || ''}`);
          this.showAddTracksModal();
        });
      } else {
        this.ui.logBoth('error', 'Add Tracks button not found in DOM');
      }
    }
  }
  
  renderPlaylistTracks() {
    const tracksArea = document.getElementById('playlistTracks');
    
    // Get current track info for now-playing indicator
    const currentTrack = this.ui.audioPlayer?.audioPlayerState?.currentTrack;
    const currentTrackPath = currentTrack?.filePath || currentTrack?.path || null;
    const isPlaying = this.ui.audioPlayer?.audioPlayerState?.isPlaying || false;
    
    // Delegate to global renderer
    const html = renderPlaylistTracksHTML(
      this.currentPlaylist,
      this.currentPlaylistTracks,
      this.ui.musicLibrary.musicLibrary,
      this.formatTime.bind(this),
      this.ui.musicLibrary.playCountByPath,
      this.ui.musicLibrary.favoriteByPath,
      this.ui.musicLibrary.ratingByPath,
      currentTrackPath,
      isPlaying
    );
    
    tracksArea.innerHTML = html;
    
    // Add event listeners for track actions
    this.setupPlaylistTrackListeners();
  }
  
  updateTrackPlayCountInUI(filePath) {
    // Only update if a playlist is currently displayed
    if (!this.currentPlaylist) {
      return;
    }
    
    // Get the updated play count from the MusicLibrary's Map
    const playCount = this.ui.musicLibrary.playCountByPath.get(filePath) || 0;
    
    // Find the row in the playlist table with matching file path
    const tracksArea = document.getElementById('playlistTracks');
    if (!tracksArea) return;
    
    const row = tracksArea.querySelector(`tr[data-file-path="${filePath}"]`);
    if (row) {
      // Update the play count cell
      const playCountCell = row.querySelector('.col-playcount .play-count');
      if (playCountCell) {
        const oldValue = playCountCell.textContent;
        playCountCell.textContent = playCount;
        this.ui.logBoth('success', `🎵 Updated play count in playlist view: ${oldValue} → ${playCount}`);
      }
    }
  }
  
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // --- Add Tracks Modal (Library-like browser) ---
  buildAddTracksModalIfNeeded() {
    // Delegate to global renderer with callbacks
    const modal = buildAddTracksModal({
      onClose: () => this.hideAddTracksModal(),
      onConfirmAdd: () => this.addSelectedToPlaylist(),
      onGenreClick: (value) => {
        this.addFilters.genre = value;
        updateAddColumnSelection('addGenresList', this.addFilters.genre);
        coordinateAddArtists(this.ui.musicLibrary.musicLibrary, this.addFilters, {
          populateAlbums: () => this.populateAddAlbums()
        });
        this.applyAddFilters();
      },
      onArtistClick: (value) => {
        this.addFilters.artist = value;
        updateAddColumnSelection('addArtistsList', this.addFilters.artist);
        this.populateAddAlbums();
        this.applyAddFilters();
      },
      onAlbumClick: (value) => {
        this.addFilters.album = value;
        updateAddColumnSelection('addAlbumsList', this.addFilters.album);
        this.applyAddFilters();
      },
      onGlobalFilter: (value) => {
        this.addFilters.global = value;
        this.applyAddFilters();
      },
      onSelectAll: (checked) => {
        coordinateSelectAll(
          checked,
          this.addFilteredTracks,
          this.addSelected,
          () => this.updateAddSelectedUI(),
          () => this.renderAddTracksList()
        );
      }
    });
    
    return modal;
  }
  
  showAddTracksModal() {
    this.buildAddTracksModalIfNeeded();
    openAddTracksModal(
      this.currentPlaylist,
      this.addFilters,
      this.addSelected,
      this.ui.musicLibrary.musicLibrary,
      this.ui.logBoth.bind(this.ui),
      () => coordinateAddBrowser(this.ui.musicLibrary.musicLibrary, this.addFilters),
      () => this.applyAddFilters(),
      () => this.updateAddSelectedUI()
    );
  }
  
  hideAddTracksModal() {
    closeAddTracksModal();
  }
  
  populateAddBrowser() {
    coordinateAddBrowser(this.ui.musicLibrary.musicLibrary, this.addFilters);
  }
  
  populateAddArtists() {
    coordinateAddArtists(this.ui.musicLibrary.musicLibrary, this.addFilters, {
      populateAlbums: () => this.populateAddAlbums()
    });
  }
  
  populateAddAlbums() {
    coordinateAddAlbums(this.ui.musicLibrary.musicLibrary, this.addFilters);
  }
  
  applyAddFilters() {
    coordinateApplyFilters(
      this.ui.musicLibrary.musicLibrary,
      this.addFilters,
      this.addFilteredTracks,
      this.addSelected,
      () => this.renderAddTracksList(),
      this.formatTime.bind(this),
      this.currentPlaylist.id,
      this.ui.logBoth.bind(this.ui),
      (id) => this.viewPlaylist(id),
      () => this.updateAddSelectedUI()
    );
  }
  
  renderAddTracksList() {
    coordinateApplyFilters(
      this.ui.musicLibrary.musicLibrary,
      this.addFilters,
      this.addFilteredTracks,
      this.addSelected,
      null, // Don't re-render recursively
      this.formatTime.bind(this),
      this.currentPlaylist.id,
      this.ui.logBoth.bind(this.ui),
      (id) => this.viewPlaylist(id),
      () => this.updateAddSelectedUI()
    );
  }

  updateAddSelectedUI() {
    updateAddSelectedUI(this.addSelected.size);
  }

  async addSelectedToPlaylist() {
    await addSelectedTracksToPlaylist(
      this.currentPlaylist?.id,
      this.addSelected,
      (id) => this.viewPlaylist(id),
      () => this.updateAddSelectedUI(),
      this.ui.logBoth.bind(this.ui)
    );
  }
  
  setupPlaylistTrackListeners() {
    const tracksArea = document.getElementById('playlistTracks');
    setupPlaylistTrackListeners(
      tracksArea,
      (filePath) => this.playTrackFromPlaylist(filePath),
      (trackId) => this.removeTrackFromPlaylist(trackId),
      (fromPosition, toPosition) => this.reorderPlaylistTracks(fromPosition, toPosition)
    );
  }
  
  async reorderPlaylistTracks(fromPosition, toPosition) {
    if (!this.currentPlaylist) return;
    
    try {
      // Get all current tracks sorted by position
      const tracks = this.currentPlaylistTracks.slice().sort((a, b) => a.position - b.position);
      
      // Find the track being moved
      const fromIndex = tracks.findIndex(t => t.position === fromPosition);
      const toIndex = tracks.findIndex(t => t.position === toPosition);
      
      if (fromIndex === -1 || toIndex === -1) {
        this.ui.logBoth('error', 'Invalid track positions');
        return;
      }
      
      // Remove the track from its current position
      const [movedTrack] = tracks.splice(fromIndex, 1);
      
      // Insert it at the new position
      tracks.splice(toIndex, 0, movedTrack);
      
      // Create array of track IDs in the new order
      const trackOrder = tracks.map(track => track.id);
      
      // Call backend to reorder
      await window.electronAPI.invoke('playlist-reorder-tracks', this.currentPlaylist.id, trackOrder);
      
      this.ui.logBoth('success', 'Playlist tracks reordered');
      
      // Reload the playlist to show new order
      await this.viewPlaylist(this.currentPlaylist.id);
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to reorder tracks: ${error.message}`);
    }
  }
  
  async playTrackFromPlaylist(filePath) {
    await playTrackFromPlaylist(
      filePath,
      this.currentPlaylist,
      this.currentPlaylistTracks,
      this.ui.musicLibrary.musicLibrary,
      this.ui.audioPlayer,
      this.ui.logBoth.bind(this.ui)
    );
  }
  
  async removeTrackFromPlaylist(trackId) {
    await removeTrackFromPlaylist(
      trackId,
      this.currentPlaylist?.id,
      (id) => this.viewPlaylist(id),
      () => this.loadPlaylists(),
      this.ui.logBoth.bind(this.ui)
    );
  }
  
  async exportPlaylist(playlistId) {
    await exportPlaylist(playlistId, this.playlists, this.ui.logBoth.bind(this.ui));
  }
  
  async importPlaylist() {
    await importPlaylist(() => this.loadPlaylists(), this.ui.logBoth.bind(this.ui));
  }
  
  async addTracksToCurrentPlaylist(filePaths) {
    await addTracksToPlaylist(
      this.currentPlaylist?.id,
      this.currentPlaylist?.name,
      filePaths,
      (id) => this.viewPlaylist(id),
      () => this.loadPlaylists(),
      this.ui.logBoth.bind(this.ui)
    );
  }
}

// Add path module for filename operations
const path = (typeof require !== 'undefined') ? require('path') : {
  basename: (filePath, ext) => {
    const name = filePath.split('/').pop();
    return ext ? name.replace(ext, '') : name;
  },
  extname: (filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? '.' + parts.pop() : '';
  }
};
