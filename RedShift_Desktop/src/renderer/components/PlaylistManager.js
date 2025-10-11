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
  }
  
  setupModalEventListeners() {
    // Create playlist modal
    const createModal = document.getElementById('createPlaylistModal');
    const createBtn = document.getElementById('confirmCreatePlaylist');
    const cancelBtn = document.getElementById('cancelCreatePlaylist');
    
    createBtn.addEventListener('click', () => {
      this.createPlaylist();
    });
    
    cancelBtn.addEventListener('click', () => {
      this.hideCreatePlaylistModal();
    });
    
    // Close modal on background click
    createModal.addEventListener('click', (e) => {
      if (e.target === createModal) {
        this.hideCreatePlaylistModal();
      }
    });
    
    // Handle Enter key in playlist name input
    document.getElementById('playlistNameInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.createPlaylist();
      }
    });
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
    
    if (this.playlists.length === 0) {
      playlistsList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <h3>No playlists yet</h3>
          <p>Create your first playlist to get started</p>
        </div>
      `;
      return;
    }
    
    const playlistsHTML = this.playlists.map(playlist => {
      const trackText = playlist.track_count === 1 ? 'track' : 'tracks';
      
      return `
        <div class="playlist-item" data-playlist-id="${playlist.id}">
          <div class="playlist-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div class="playlist-info">
            <div class="playlist-name">${playlist.name}</div>
            <div class="playlist-details">
              ${playlist.track_count} ${trackText}
              ${playlist.description ? ` • ${playlist.description}` : ''}
            </div>
          </div>
          <div class="playlist-actions">
            <button class="action-btn play-playlist-btn" data-playlist-id="${playlist.id}" title="Play Playlist">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21"></polygon>
              </svg>
            </button>
            <button class="action-btn edit-playlist-btn" data-playlist-id="${playlist.id}" title="Edit Playlist">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="action-btn delete-playlist-btn" data-playlist-id="${playlist.id}" title="Delete Playlist">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    playlistsList.innerHTML = playlistsHTML;
    
    // Add event listeners for playlist actions
    this.setupPlaylistActionListeners();
  }
  
  setupPlaylistActionListeners() {
    const playlistsList = document.getElementById('playlistsList');
    
    playlistsList.addEventListener('click', async (e) => {
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
    const modal = document.getElementById('createPlaylistModal');
    const nameInput = document.getElementById('playlistNameInput');
    const descInput = document.getElementById('playlistDescInput');
    
    // Reset form
    nameInput.value = '';
    descInput.value = '';
    
    modal.style.display = 'flex';
    nameInput.focus();
  }
  
  hideCreatePlaylistModal() {
    document.getElementById('createPlaylistModal').style.display = 'none';
  }
  
  async createPlaylist() {
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
      
      this.ui.logBoth('success', `Created playlist: "${name}"`);
      this.hideCreatePlaylistModal();
      await this.loadPlaylists();
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to create playlist: ${error.message}`);
    }
  }
  
  async deletePlaylist(playlistId) {
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    
    const confirmDelete = confirm(`Delete playlist "${playlist.name}"? This action cannot be undone.`);
    if (!confirmDelete) return;
    
    try {
      await window.electronAPI.invoke('playlist-delete', playlistId);
      this.ui.logBoth('success', `Deleted playlist: "${playlist.name}"`);
      await this.loadPlaylists();
      
      // Clear current playlist view if this was the selected playlist
      if (this.currentPlaylist?.id === playlistId) {
        this.currentPlaylist = null;
        this.currentPlaylistTracks = [];
        this.renderPlaylistTracks();
      }
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to delete playlist: ${error.message}`);
    }
  }
  
  async editPlaylist(playlistId) {
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    
    const newName = prompt('Playlist name:', playlist.name);
    if (newName === null || newName.trim() === playlist.name) return;
    
    if (!newName.trim()) {
      alert('Playlist name cannot be empty');
      return;
    }
    
    try {
      await window.electronAPI.invoke('playlist-update', playlistId, { name: newName.trim() });
      this.ui.logBoth('success', `Renamed playlist to: "${newName.trim()}"`);
      await this.loadPlaylists();
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to update playlist: ${error.message}`);
    }
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
      
      // Set the first track to play
      const firstTrack = tracks[0];
      const musicLibrary = this.ui.musicLibrary.musicLibrary;
      const track = musicLibrary.find(t => t.path === firstTrack.file_path);
      
      if (track) {
        // Load and play the first track
        this.ui.audioPlayer.audioElement.src = `file://${track.path}`;
        this.ui.audioPlayer.audioPlayerState.currentTrack = track;
        
        this.ui.audioPlayer.updateTrackInfo({
          filename: track.name,
          metadata: track.metadata || { 
            common: {
              title: track.name.replace(/\.\w+$/, ''),
              artist: 'Unknown Artist'
            }
          }
        });
        
        await this.ui.audioPlayer.audioElement.play();
        this.ui.logBoth('success', `Playing playlist: "${playlist.name}"`);
        
        // TODO: Set up playlist queue for continuous playback
      } else {
        this.ui.logBoth('warning', `Track not found in library: ${firstTrack.file_path}`);
      }
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to play playlist: ${error.message}`);
    }
  }
  
  renderPlaylistDetails() {
    const detailsArea = document.getElementById('playlistDetails');
    
    if (!this.currentPlaylist) {
      detailsArea.innerHTML = '<p>Select a playlist to view details</p>';
      return;
    }
    
    const createdDate = new Date(this.currentPlaylist.created_date * 1000).toLocaleDateString();
    const trackText = this.currentPlaylist.track_count === 1 ? 'track' : 'tracks';
    
    detailsArea.innerHTML = `
      <div class="playlist-header">
        <h3>${this.currentPlaylist.name}</h3>
        <div class="playlist-metadata">
          <p><strong>Tracks:</strong> ${this.currentPlaylist.track_count} ${trackText}</p>
          <p><strong>Created:</strong> ${createdDate}</p>
          ${this.currentPlaylist.description ? `<p><strong>Description:</strong> ${this.currentPlaylist.description}</p>` : ''}
        </div>
        <div class="playlist-header-actions">
          <button class="btn btn-secondary" id="addTracksBtn">Add Tracks</button>
          <button class="btn btn-primary" onclick="ui.playlistManager.playPlaylist(${this.currentPlaylist.id})">
            Play Playlist
          </button>
          <button class="btn btn-secondary" onclick="ui.playlistManager.exportPlaylist(${this.currentPlaylist.id})">
            Export M3U
          </button>
        </div>
      </div>
    `;
    
    // Wire Add Tracks button
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
  
  renderPlaylistTracks() {
    const tracksArea = document.getElementById('playlistTracks');
    
    if (!this.currentPlaylist || this.currentPlaylistTracks.length === 0) {
      tracksArea.innerHTML = `
        <div class="empty-state">
          <p>No tracks in this playlist</p>
          <p>Drag tracks from your music library to add them</p>
        </div>
      `;
      return;
    }
    
    // Get the full track metadata from the music library
    const musicLibrary = this.ui.musicLibrary.musicLibrary;
    
    const tracksHTML = this.currentPlaylistTracks.map((playlistTrack, index) => {
      // Find the full track object from the music library
      const track = musicLibrary.find(t => t.path === playlistTrack.file_path);
      
      if (!track) {
        // Fallback if track not in library
        const fileName = playlistTrack.file_path.split('/').pop().split('\\').pop();
        const trackName = fileName.replace(/\.[^/.]+$/, '');
        return `
          <tr class="music-row" data-track-id="${playlistTrack.id}">
            <td><div class="track-name">${trackName}</div></td>
            <td><div class="artist-name">Unknown</div></td>
            <td><div class="album-name">Unknown</div></td>
            <td class="col-duration"><div class="duration">--:--</div></td>
            <td class="col-playcount"><div class="play-count">0</div></td>
            <td class="col-favorite"><div class="favorite-control">-</div></td>
            <td class="col-rating"><div class="rating-control">-</div></td>
            <td>
              <div class="track-actions">
                <button class="action-btn primary play-track-btn" data-file-path="${playlistTrack.file_path}" title="Play Track">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,3 19,12 5,21"></polygon>
                  </svg>
                </button>
                <button class="action-btn danger remove-from-playlist-btn" data-track-id="${playlistTrack.id}" title="Remove from Playlist">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }
      
      // Use metadata from the library
      let trackName = track.metadata?.common?.title || track.name.replace(/\.\w+$/, '');
      trackName = trackName.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
      
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const album = track.metadata?.common?.album || 'Unknown Album';
      const duration = track.metadata?.format?.duration ? this.formatTime(track.metadata.format.duration) : '--:--';
      const playCount = this.ui.musicLibrary.playCountByPath.get(track.path) || 0;
      const isFav = this.ui.musicLibrary.favoriteByPath.get(track.path) === true;
      const rating = Number(this.ui.musicLibrary.ratingByPath.get(track.path) || 0);
      
      const favBtn = `
        <span class="fav-display" title="Favorite status">
          ${isFav ? `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>` : `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
              <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24z"/>
            </svg>`}
        </span>`;
      
      const ratingSelect = `
        <select class="rating-select" disabled title="Rating (view only)">
          <option value="">–</option>
          <option value="1" ${rating === 1 ? 'selected' : ''}>1</option>
          <option value="2" ${rating === 2 ? 'selected' : ''}>2</option>
          <option value="3" ${rating === 3 ? 'selected' : ''}>3</option>
          <option value="4" ${rating === 4 ? 'selected' : ''}>4</option>
          <option value="5" ${rating === 5 ? 'selected' : ''}>5</option>
        </select>`;
      
      return `
        <tr class="music-row" data-track-id="${playlistTrack.id}" data-file-path="${track.path}">
          <td><div class="track-name" title="${trackName}">${trackName}</div></td>
          <td><div class="artist-name" title="${artist}">${artist}</div></td>
          <td><div class="album-name" title="${album}">${album}</div></td>
          <td class="col-duration"><div class="duration">${duration}</div></td>
          <td class="col-playcount"><div class="play-count">${playCount}</div></td>
          <td class="col-favorite"><div class="favorite-control">${favBtn}</div></td>
          <td class="col-rating"><div class="rating-control">${ratingSelect}</div></td>
          <td>
            <div class="track-actions">
              <button class="action-btn primary play-track-btn" data-file-path="${track.path}" title="Play Track">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"></polygon>
                </svg>
              </button>
              <button class="action-btn danger remove-from-playlist-btn" data-track-id="${playlistTrack.id}" title="Remove from Playlist">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    tracksArea.innerHTML = `
      <table class="music-table">
        <thead>
          <tr>
            <th class="col-track"><span>Track</span></th>
            <th class="col-artist"><span>Artist</span></th>
            <th class="col-album"><span>Album</span></th>
            <th class="col-duration"><span>Duration</span></th>
            <th class="col-playcount"><span>Plays</span></th>
            <th class="col-favorite"><span>Favorite</span></th>
            <th class="col-rating"><span>Rating</span></th>
            <th class="col-actions"><span>Actions</span></th>
          </tr>
        </thead>
        <tbody>
          ${tracksHTML}
        </tbody>
      </table>
    `;
    
    // Add event listeners for track actions
    this.setupPlaylistTrackListeners();
  }
  
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // --- Add Tracks Modal (Library-like browser) ---
  buildAddTracksModalIfNeeded() {
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
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => { if (e.target === modal) this.hideAddTracksModal(); });
    content.querySelector('#closeAddTracksBtn').addEventListener('click', () => this.hideAddTracksModal());
    content.querySelector('#confirmAddSelectedBtn').addEventListener('click', () => this.addSelectedToPlaylist());
    
    // Wire browser clicks
    content.querySelector('#addGenresList').addEventListener('click', (e) => {
      if (e.target.classList.contains('list-item')) {
        this.addFilters.genre = e.target.dataset.value || '';
        this.updateAddColumnSelection('addGenresList', this.addFilters.genre);
        this.populateAddArtists();
        this.applyAddFilters();
      }
    });
    content.querySelector('#addArtistsList').addEventListener('click', (e) => {
      if (e.target.classList.contains('list-item')) {
        this.addFilters.artist = e.target.dataset.value || '';
        this.updateAddColumnSelection('addArtistsList', this.addFilters.artist);
        this.populateAddAlbums();
        this.applyAddFilters();
      }
    });
    content.querySelector('#addAlbumsList').addEventListener('click', (e) => {
      if (e.target.classList.contains('list-item')) {
        this.addFilters.album = e.target.dataset.value || '';
        this.updateAddColumnSelection('addAlbumsList', this.addFilters.album);
        this.applyAddFilters();
      }
    });
    
    // Global filter
    content.querySelector('#addGlobalFilter').addEventListener('input', (e) => {
      this.addFilters.global = e.target.value.toLowerCase();
      this.applyAddFilters();
    });

    // Select all visible
    content.querySelector('#addSelectAll').addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (checked) {
        this.addFilteredTracks.forEach(t => this.addSelected.add(t.path));
      } else {
        this.addFilteredTracks.forEach(t => this.addSelected.delete(t.path));
      }
      this.updateAddSelectedUI();
      this.renderAddTracksList();
    });
    
    return modal;
  }
  
  showAddTracksModal() {
    if (!this.currentPlaylist) return;
    this.ui.logBoth('info', '🧩 Opening Add Tracks modal...');
    const modal = this.buildAddTracksModalIfNeeded();
    // Reset filters
    this.addFilters = { genre: '', artist: '', album: '', global: '' };
    modal.querySelector('#addGlobalFilter').value = '';
    this.addSelected.clear();
    
    // Populate browser columns
    this.populateAddBrowser();
    this.applyAddFilters();
    
    modal.style.display = 'flex';
    this.updateAddSelectedUI();
    this.ui.logBoth('success', '🧩 Add Tracks modal shown');
  }
  
  hideAddTracksModal() {
    const modal = document.getElementById('addTracksModal');
    if (modal) modal.style.display = 'none';
  }
  
  populateAddBrowser() {
    const all = this.ui.musicLibrary.musicLibrary || [];
    const genres = new Set();
    const artists = new Set();
    const albums = new Set();
    all.forEach(track => {
      genres.add(track.metadata?.common?.genre || 'Unknown Genre');
      artists.add(track.metadata?.common?.artist || 'Unknown Artist');
      albums.add(track.metadata?.common?.album || 'Unknown Album');
    });
    this.populateAddColumn('addGenresList', genres, 'All Genres');
    this.populateAddColumn('addArtistsList', artists, 'All Artists');
    this.populateAddColumn('addAlbumsList', albums, 'All Albums');
  }
  
  populateAddColumn(id, items, allLabel) {
    const el = document.getElementById(id);
    el.innerHTML = `<div class="list-item selected" data-value="">${allLabel}</div>`;
    [...items].sort().forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.dataset.value = item;
      div.textContent = item;
      el.appendChild(div);
    });
  }
  
  updateAddColumnSelection(id, value) {
    const el = document.getElementById(id);
    el.querySelectorAll('.list-item').forEach(n => n.classList.toggle('selected', n.dataset.value === value));
  }
  
  populateAddArtists() {
    const all = this.ui.musicLibrary.musicLibrary || [];
    const set = new Set();
    all.forEach(t => {
      const genre = t.metadata?.common?.genre || 'Unknown Genre';
      const artist = t.metadata?.common?.artist || 'Unknown Artist';
      if (!this.addFilters.genre || genre === this.addFilters.genre) set.add(artist);
    });
    this.populateAddColumn('addArtistsList', set, 'All Artists');
    this.addFilters.artist = '';
    this.populateAddAlbums();
  }
  
  populateAddAlbums() {
    const all = this.ui.musicLibrary.musicLibrary || [];
    const set = new Set();
    all.forEach(t => {
      const genre = t.metadata?.common?.genre || 'Unknown Genre';
      const artist = t.metadata?.common?.artist || 'Unknown Artist';
      const album = t.metadata?.common?.album || 'Unknown Album';
      const gm = !this.addFilters.genre || genre === this.addFilters.genre;
      const am = !this.addFilters.artist || artist === this.addFilters.artist;
      if (gm && am) set.add(album);
    });
    this.populateAddColumn('addAlbumsList', set, 'All Albums');
    this.addFilters.album = '';
  }
  
  applyAddFilters() {
    const all = this.ui.musicLibrary.musicLibrary || [];
    const global = this.addFilters.global;
    this.addFilteredTracks = all.filter(track => {
      let name = track.metadata?.common?.title || track.name || '';
      name = name.replace(/\.[^/.]+$/, '');
      name = name.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
      const genre = track.metadata?.common?.genre || 'Unknown Genre';
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const album = track.metadata?.common?.album || 'Unknown Album';
      const gm = !this.addFilters.genre || genre === this.addFilters.genre;
      const am = !this.addFilters.artist || artist === this.addFilters.artist;
      const albm = !this.addFilters.album || album === this.addFilters.album;
      const glob = !global || name.toLowerCase().includes(global) || artist.toLowerCase().includes(global) || album.toLowerCase().includes(global) || genre.toLowerCase().includes(global);
      return gm && am && albm && glob;
    });
    this.renderAddTracksList();
    // Update select-all checkbox state
    const selectAll = document.getElementById('addSelectAll');
    if (selectAll) {
      const allSelected = this.addFilteredTracks.length > 0 && this.addFilteredTracks.every(t => this.addSelected.has(t.path));
      selectAll.checked = allSelected;
    }
  }
  
  renderAddTracksList() {
    const list = document.getElementById('addTracksList');
    if (!list) return;
    if (!this.addFilteredTracks.length) {
      list.innerHTML = '<div style="padding:16px; font-size:13px; color:#6b7280;">No matching tracks</div>';
      return;
    }
    const rows = this.addFilteredTracks.slice(0, 500).map(t => {
      const title = (t.metadata?.common?.title || t.name || '').replace(/\.[^/.]+$/, '').replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
      const artist = t.metadata?.common?.artist || 'Unknown Artist';
      const album = t.metadata?.common?.album || 'Unknown Album';
      const duration = t.metadata?.format?.duration ? this.formatTime(t.metadata.format.duration) : '--:--';
      const selected = this.addSelected.has(t.path);
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
        try {
          await window.electronAPI.invoke('playlist-add-tracks', this.currentPlaylist.id, [btn.dataset.filePath]);
          this.ui.logBoth('success', 'Track added to playlist');
          await this.viewPlaylist(this.currentPlaylist.id); // refresh counts
        } catch (err) {
          this.ui.logBoth('error', `Failed to add: ${err.message}`);
        }
      });
    });

     // Wire per-row checkboxes
     list.querySelectorAll('.add-select').forEach(cb => {
       cb.addEventListener('change', () => {
         const fp = cb.dataset.filePath;
         if (cb.checked) this.addSelected.add(fp); else this.addSelected.delete(fp);
         this.updateAddSelectedUI();
       });
     });
  }

  updateAddSelectedUI() {
    const countEl = document.getElementById('addSelectedCount');
    const btn = document.getElementById('confirmAddSelectedBtn');
    if (countEl) countEl.textContent = `${this.addSelected.size} selected`;
    if (btn) btn.disabled = this.addSelected.size === 0;
  }

  async addSelectedToPlaylist() {
    if (!this.currentPlaylist || this.addSelected.size === 0) return;
    try {
      const files = Array.from(this.addSelected.values());
      await window.electronAPI.invoke('playlist-add-tracks', this.currentPlaylist.id, files);
      this.ui.logBoth('success', `Added ${files.length} track(s)`);
      this.addSelected.clear();
      this.updateAddSelectedUI();
      await this.viewPlaylist(this.currentPlaylist.id);
    } catch (err) {
      this.ui.logBoth('error', `Failed to add selected: ${err.message}`);
    }
  }
  
  setupPlaylistTrackListeners() {
    const tracksArea = document.getElementById('playlistTracks');
    
    tracksArea.addEventListener('click', async (e) => {
      if (e.target.closest('.play-track-btn')) {
        const filePath = e.target.closest('.play-track-btn').dataset.filePath;
        await this.playTrackFromPlaylist(filePath);
      } else if (e.target.closest('.remove-track-btn')) {
        const trackId = parseInt(e.target.closest('.remove-track-btn').dataset.trackId);
        await this.removeTrackFromPlaylist(trackId);
      }
    });
    
    tracksArea.addEventListener('dblclick', async (e) => {
      const row = e.target.closest('tr');
      if (!row) return;
      
      const playBtn = row.querySelector('.play-track-btn');
      if (playBtn) {
        const filePath = playBtn.dataset.filePath;
        await this.playTrackFromPlaylist(filePath);
      }
    });
  }
  
  async playTrackFromPlaylist(filePath) {
    try {
      const musicLibrary = this.ui.musicLibrary.musicLibrary;
      const track = musicLibrary.find(t => t.path === filePath);
      
      if (track) {
        // Load track via AudioPlayerService for state management
        await window.electronAPI.invoke('audio-load-track', filePath);
        
        // Set up local audio element
        this.ui.audioPlayer.audioElement.src = `file://${track.path}`;
        this.ui.audioPlayer.audioPlayerState.currentTrack = track;
        
        this.ui.audioPlayer.updateTrackInfo({
          filename: track.name,
          metadata: track.metadata || { 
            common: {
              title: track.name.replace(/\.\w+$/, ''),
              artist: 'Unknown Artist'
            }
          }
        });
        
        // Play via IPC (for state management) and local element
        await window.electronAPI.invoke('audio-play');
        await this.ui.audioPlayer.audioElement.play();
        
        this.ui.logBoth('info', `Playing: ${track.name}`);
      } else {
        this.ui.logBoth('warning', `Track not found: ${filePath}`);
      }
    } catch (error) {
      this.ui.logBoth('error', `Failed to play track: ${error.message}`);
    }
  }
  
  async removeTrackFromPlaylist(trackId) {
    if (!this.currentPlaylist) return;
    
    try {
      await window.electronAPI.invoke('playlist-remove-tracks', this.currentPlaylist.id, [trackId]);
      this.ui.logBoth('success', 'Removed track from playlist');
      
      // Reload playlist data
      await this.viewPlaylist(this.currentPlaylist.id);
      await this.loadPlaylists(); // Update the sidebar count
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to remove track: ${error.message}`);
    }
  }
  
  async exportPlaylist(playlistId) {
    try {
      const playlist = this.playlists.find(p => p.id === playlistId);
      if (!playlist) return;
      
      // Use electron's dialog to choose save location
      const defaultPath = `${playlist.name}.m3u`;
      const savePath = prompt(`Export playlist to:`, defaultPath);
      
      if (savePath) {
        await window.electronAPI.invoke('playlist-export-m3u', playlistId, savePath);
        this.ui.logBoth('success', `Exported playlist to: ${savePath}`);
      }
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to export playlist: ${error.message}`);
    }
  }
  
  async importPlaylist() {
    try {
      const filePath = prompt('Enter path to M3U playlist file:');
      if (!filePath) return;
      
      const playlist = await window.electronAPI.invoke('playlist-import-m3u', filePath);
      this.ui.logBoth('success', `Imported playlist: "${playlist.name}"`);
      await this.loadPlaylists();
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to import playlist: ${error.message}`);
    }
  }
  
  // Method to add tracks to playlist (for drag & drop or context menu)
  async addTracksToCurrentPlaylist(filePaths) {
    if (!this.currentPlaylist) {
      this.ui.logBoth('warning', 'No playlist selected');
      return;
    }
    
    try {
      await window.electronAPI.invoke('playlist-add-tracks', this.currentPlaylist.id, filePaths);
      this.ui.logBoth('success', `Added ${filePaths.length} track(s) to "${this.currentPlaylist.name}"`);
      
      // Reload playlist data
      await this.viewPlaylist(this.currentPlaylist.id);
      await this.loadPlaylists(); // Update the sidebar count
      
    } catch (error) {
      this.ui.logBoth('error', `Failed to add tracks: ${error.message}`);
    }
  }
}

// Add path module for filename operations
const path = require ? require('path') : {
  basename: (filePath, ext) => {
    const name = filePath.split('/').pop();
    return ext ? name.replace(ext, '') : name;
  },
  extname: (filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? '.' + parts.pop() : '';
  }
};
