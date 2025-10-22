/**
 * AlbumsView Component
 * Manages the Albums list and detail views
 */
class AlbumsView {
  constructor(ui) {
    this.ui = ui;
    this.container = null;
    this.albums = [];
    this.filteredAlbums = [];
    this.selectedAlbum = null;
    this.currentView = 'list'; // 'list' or 'detail'
    this.sortBy = 'album'; // 'album', 'artist', 'trackCount'
    this.sortDirection = 'asc'; // 'asc' or 'desc'
    this.searchTerm = ''; // Local search term for album filtering
  }

  /**
   * Initialize the albums view
   */
  initialize() {
    this.container = document.getElementById('albumsViewContainer');
    if (!this.container) {
      console.error('Albums view container not found');
      return;
    }

    this.setupEventListeners();
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Local album search filter
    const albumSearchInput = document.getElementById('albumSearchInput');
    if (albumSearchInput) {
      albumSearchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value;
        this.filterAlbums(this.searchTerm);
      });
    }

    // Event delegation for dynamically created elements
    if (this.container) {
      this.container.addEventListener('click', (e) => {
        // Sort select
        const sortSelect = e.target.closest('#albumSortBy');
        if (sortSelect) {
          this.sortBy = sortSelect.value;
          this.sortAndRenderAlbums();
          return;
        }

        // Sort direction button
        const sortBtn = e.target.closest('#albumSortDirection');
        if (sortBtn) {
          this.toggleSortDirection();
          this.sortAndRenderAlbums();
          return;
        }

        // Album card click
        const albumCard = e.target.closest('.album-card');
        if (albumCard) {
          const albumName = albumCard.dataset.albumName;
          const artistName = albumCard.dataset.artistName;
          if (albumName && artistName) {
            this.showAlbumDetail(albumName, artistName);
          }
          return;
        }

        // Back button
        const backBtn = e.target.closest('#backToAlbums');
        if (backBtn) {
          this.currentView = 'list';
          this.selectedAlbum = null;
          this.renderListView();
          return;
        }
      });
    }
  }

  /**
   * Process tracks into album-centric data
   */
  processAlbums(tracks) {
    const albumMap = new Map();
    
    tracks.forEach(track => {
      const albumName = track.metadata?.common?.album || 'Unknown Album';
      const duration = track.metadata?.common?.duration || track.duration || 0;
      
      // Use album name as unique key - group all tracks from same album together
      // regardless of featuring artists
      const albumKey = albumName;
      
      if (!albumMap.has(albumKey)) {
        // Get album artist (prefer albumartist tag, fall back to artist)
        const artistName = track.metadata?.common?.albumartist || 
                          track.metadata?.common?.artist || 
                          'Unknown Artist';
        
        // Get album art - use the same property structure as the mini player
        let albumArt = null;
        if (track.metadata?.albumArt?.thumbnail) {
          albumArt = track.metadata.albumArt.thumbnail;
        }
        
        albumMap.set(albumKey, {
          album: albumName,
          artist: artistName,
          tracks: [],
          totalDuration: 0,
          albumArt: albumArt
        });
      }
      
      const albumData = albumMap.get(albumKey);
      albumData.tracks.push(track);
      albumData.totalDuration += duration;
      
      // Update album art if current track has it and we don't have one yet
      if (!albumData.albumArt && track.metadata?.albumArt?.thumbnail) {
        albumData.albumArt = track.metadata.albumArt.thumbnail;
      }
    });
    
    // Convert to array and add computed properties
    this.albums = Array.from(albumMap.values()).map(album => ({
      ...album,
      trackCount: album.tracks.length
    }));

    console.log(`💿 Processed ${this.albums.length} albums from ${tracks.length} tracks`);
  }

  /**
   * Filter albums based on search query
   */
  filterAlbums(query) {
    if (!query || query.trim() === '') {
      this.filteredAlbums = [...this.albums];
    } else {
      const searchTerm = query.toLowerCase();
      this.filteredAlbums = this.albums.filter(album => 
        album.album.toLowerCase().includes(searchTerm) ||
        album.artist.toLowerCase().includes(searchTerm)
      );
    }
    
    // Only re-render the grid portion, not the entire view (to preserve input focus)
    this.sortAlbums();
    this.renderAlbumsGrid();
  }

  /**
   * Sort albums based on current sort settings
   */
  sortAlbums() {
    const multiplier = this.sortDirection === 'asc' ? 1 : -1;
    
    this.filteredAlbums.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'album':
          // Put "Unknown Album" at the end regardless of sort direction
          if (a.album === 'Unknown Album') return 1;
          if (b.album === 'Unknown Album') return -1;
          comparison = a.album.localeCompare(b.album);
          break;
        case 'artist':
          comparison = a.artist.localeCompare(b.artist);
          break;
        case 'trackCount':
          comparison = a.trackCount - b.trackCount;
          break;
      }
      
      return comparison * multiplier;
    });
  }

  /**
   * Sort and render albums
   */
  sortAndRenderAlbums() {
    this.sortAlbums();
    if (this.currentView === 'list') {
      this.renderListView();
    }
  }

  /**
   * Toggle sort direction
   */
  toggleSortDirection() {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    
    // Update UI button
    const btn = document.getElementById('albumSortDirection');
    if (btn) {
      btn.innerHTML = this.sortDirection === 'asc' 
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
    }
    
    this.sortAndRenderAlbums();
  }

  /**
   * Render the albums list view
   */
  renderListView() {
    if (!this.container) return;

    let html = `
      <div class="albums-list-view">
        <div class="albums-controls">
          <div class="search-filter-controls">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input 
              type="text" 
              id="albumSearchInput" 
              placeholder="Filter albums..." 
              value="${this.escapeHtml(this.searchTerm)}"
              class="search-input"
            />
          </div>
          <div class="sort-controls">
            <label>Sort by:</label>
            <select id="albumSortBy" class="sort-select">
              <option value="album" ${this.sortBy === 'album' ? 'selected' : ''}>Album Name</option>
              <option value="artist" ${this.sortBy === 'artist' ? 'selected' : ''}>Artist Name</option>
              <option value="trackCount" ${this.sortBy === 'trackCount' ? 'selected' : ''}>Track Count</option>
            </select>
            <button id="albumSortDirection" class="btn-icon sort-direction">
              ${this.sortDirection === 'asc' 
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>'}
            </button>
          </div>
        </div>
        
        <div class="albums-grid">
    `;

    // Only group by letter when sorting by album name
    if (this.sortBy === 'album') {
      const grouped = this.groupAlbumsByLetter();
      
      // Render each letter group
      for (const [letter, albums] of grouped) {
        html += `
          <div class="album-letter-group">
            <div class="album-letter-header">${letter}</div>
        `;
        
        albums.forEach(album => {
          html += this.renderAlbumCard(album);
        });
        
        html += `</div>`;
      }
    } else {
      // For other sorting, just render all albums in order without letter grouping
      this.filteredAlbums.forEach(album => {
        html += this.renderAlbumCard(album);
      });
    }

    html += `
        </div>
        
        <div class="albums-footer">
          ${this.filteredAlbums.length} album${this.filteredAlbums.length !== 1 ? 's' : ''} • 
          ${this.filteredAlbums.reduce((sum, a) => sum + a.trackCount, 0)} tracks
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    
    // Re-attach event listeners for new elements
    this.setupEventListeners();
  }

  /**
   * Render only the albums grid (not controls) - used for filtering to preserve input focus
   */
  renderAlbumsGrid() {
    const gridContainer = document.querySelector('.albums-grid');
    const footerContainer = document.querySelector('.albums-footer');
    
    if (!gridContainer || !footerContainer) {
      // If grid doesn't exist yet, render the full view
      this.renderListView();
      return;
    }
    
    // Build grid HTML
    let gridHtml = '';
    
    if (this.sortBy === 'album') {
      const grouped = this.groupAlbumsByLetter();
      
      for (const [letter, albums] of grouped) {
        gridHtml += `
          <div class="album-letter-group">
            <div class="album-letter-header">${letter}</div>
        `;
        
        albums.forEach(album => {
          gridHtml += this.renderAlbumCard(album);
        });
        
        gridHtml += `</div>`;
      }
    } else {
      this.filteredAlbums.forEach(album => {
        gridHtml += this.renderAlbumCard(album);
      });
    }
    
    // Update only the grid and footer
    gridContainer.innerHTML = gridHtml;
    footerContainer.innerHTML = `
      ${this.filteredAlbums.length} album${this.filteredAlbums.length !== 1 ? 's' : ''} • 
      ${this.filteredAlbums.reduce((sum, a) => sum + a.trackCount, 0)} tracks
    `;
  }

  /**
   * Group albums by first letter
   */
  groupAlbumsByLetter() {
    const groups = new Map();
    
    this.filteredAlbums.forEach(album => {
      let letter = album.album.charAt(0).toUpperCase();
      
      // Handle special cases
      if (album.album === 'Unknown Album') {
        letter = '?';
      } else if (!/[A-Z]/.test(letter)) {
        letter = '#'; // Numbers and symbols
      }
      
      if (!groups.has(letter)) {
        groups.set(letter, []);
      }
      groups.get(letter).push(album);
    });
    
    // Sort groups by letter
    return new Map([...groups.entries()].sort((a, b) => {
      if (a[0] === '?') return 1;
      if (b[0] === '?') return -1;
      if (a[0] === '#') return this.sortBy === 'album' ? -1 : 0;
      if (b[0] === '#') return this.sortBy === 'album' ? 1 : 0;
      return a[0].localeCompare(b[0]);
    }));
  }

  /**
   * Render a single album card
   */
  renderAlbumCard(album) {
    const trackText = album.trackCount === 1 ? 'track' : 'tracks';
    
    // Render album art if available, otherwise show icon
    const albumImage = album.albumArt 
      ? `<img src="${album.albumArt}" alt="${this.escapeHtml(album.album)}" class="album-image" />`
      : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
           <rect x="3" y="3" width="18" height="18" rx="2"></rect>
           <circle cx="12" cy="12" r="3"></circle>
         </svg>`;
    
    return `
      <div class="album-card" data-album-name="${this.escapeHtml(album.album)}" data-artist-name="${this.escapeHtml(album.artist)}">
        <div class="album-icon">
          ${albumImage}
        </div>
        <div class="album-info">
          <div class="album-name">${this.escapeHtml(album.album)}</div>
          <div class="album-artist">${this.escapeHtml(album.artist)}</div>
          <div class="album-stats">
            ${album.trackCount} ${trackText}
          </div>
        </div>
        <div class="album-arrow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
    `;
  }

  /**
   * Show album detail view
   */
  showAlbumDetail(albumName, artistName) {
    // Find the album by name only (since we now group by album name)
    this.selectedAlbum = this.albums.find(a => a.album === albumName);
    
    if (!this.selectedAlbum) {
      console.error('Album not found:', albumName);
      return;
    }
    
    this.currentView = 'detail';
    this.renderDetailView();
  }

  /**
   * Render album detail view
   */
  renderDetailView() {
    if (!this.container || !this.selectedAlbum) return;

    const album = this.selectedAlbum;
    
    // Sort tracks by track number
    const sortedTracks = [...album.tracks].sort((a, b) => {
      const trackA = a.metadata?.common?.track?.no || 9999;
      const trackB = b.metadata?.common?.track?.no || 9999;
      return trackA - trackB;
    });
    
    const totalDuration = this.formatDuration(album.totalDuration);
    const trackText = album.trackCount === 1 ? 'track' : 'tracks';
    
    // Render album art if available, otherwise show icon
    const albumImage = album.albumArt 
      ? `<img src="${album.albumArt}" alt="${this.escapeHtml(album.album)}" class="album-image" />`
      : `<svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
           <rect x="3" y="3" width="18" height="18" rx="2"></rect>
           <circle cx="12" cy="12" r="3"></circle>
         </svg>`;

    let html = `
      <div class="album-detail-view">
        <div class="album-detail-header">
          <button id="backToAlbums" class="btn-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back to Albums
          </button>
          
          <div class="album-detail-info">
            <div class="album-detail-icon">
              ${albumImage}
            </div>
            <div>
              <h2 class="album-detail-name">${this.escapeHtml(album.album)}</h2>
              <div class="album-detail-artist">${this.escapeHtml(album.artist)}</div>
              <div class="album-detail-stats">
                ${album.trackCount} ${trackText} • ${totalDuration}
              </div>
            </div>
          </div>
        </div>
        
        <div class="album-tracks">
          <table class="album-tracks-table">
            <thead>
              <tr>
                <th class="track-no">#</th>
                <th class="track-name">Track</th>
                <th class="track-duration">Duration</th>
              </tr>
            </thead>
            <tbody>
    `;

    // Render each track
    sortedTracks.forEach((track, index) => {
      html += this.renderTrackRow(track, index + 1);
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    
    // Setup track table interactions
    this.setupTrackTableListeners();
  }

  /**
   * Render a single track row
   */
  renderTrackRow(track, trackNo) {
    const title = track.metadata?.common?.title || track.name?.replace(/\.\w+$/, '') || 'Unknown Track';
    const duration = track.metadata?.format?.duration || 0;
    const displayTrackNo = track.metadata?.common?.track?.no || trackNo;
    
    return `
      <tr class="track-row" data-path="${this.escapeHtml(track.path)}">
        <td class="track-no">${displayTrackNo}</td>
        <td class="track-name">${this.escapeHtml(title)}</td>
        <td class="track-duration">${this.formatDuration(duration)}</td>
      </tr>
    `;
  }

  /**
   * Set up track table listeners for playback
   */
  setupTrackTableListeners() {
    const trackRows = this.container.querySelectorAll('.track-row');
    
    trackRows.forEach((row, index) => {
      row.addEventListener('dblclick', async () => {
        const path = row.dataset.path;
        
        // Find the track in the selected album's tracks
        const track = this.selectedAlbum.tracks.find(t => t.path === path);
        
        if (!track) {
          console.error('Track not found:', path);
          return;
        }
        
        try {
          // Set playback context to this album's tracks
          this.ui.audioPlayer.setPlaybackContext('album', this.selectedAlbum.tracks, index);
          
          // Play the track
          await this.ui.audioPlayer.playTrack(track.path, track);
          
          console.log(`▶️ Playing track from album view: ${track.metadata?.common?.title || track.name}`);
        } catch (error) {
          console.error('Error playing track from album view:', error);
        }
      });
    });
  }

  /**
   * Refresh the albums view with new track data
   */
  refresh(tracks) {
    if (!tracks || tracks.length === 0) {
      this.albums = [];
      this.filteredAlbums = [];
      if (this.container) {
        this.container.innerHTML = '<div class="empty-state">No albums found</div>';
      }
      return;
    }

    this.processAlbums(tracks);
    this.filteredAlbums = [...this.albums];
    this.sortAndRenderAlbums();
  }

  /**
   * Format duration in seconds to MM:SS
   */
  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

