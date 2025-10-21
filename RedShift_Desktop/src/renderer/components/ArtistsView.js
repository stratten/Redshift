/**
 * ArtistsView Component
 * Handles the Artists tab - displays artists list and artist detail views
 */

class ArtistsView {
  constructor(ui) {
    this.ui = ui;
    this.artists = [];
    this.filteredArtists = [];
    this.currentView = 'list'; // 'list' or 'detail'
    this.selectedArtist = null;
    this.sortBy = 'name'; // 'name', 'songCount', 'albumCount'
    this.sortDirection = 'asc'; // 'asc' or 'desc'
    
    // DOM elements (will be set when tab is initialized)
    this.container = null;
  }

  /**
   * Initialize the Artists view
   */
  initialize() {
    this.container = document.getElementById('artistsViewContainer');
    if (!this.container) {
      console.error('Artists view container not found');
      return;
    }
    
    this.setupEventListeners();
    console.log('🎨 Artists view initialized');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Global search filter (shared with main music library)
    const globalFilter = document.getElementById('globalFilter');
    if (globalFilter) {
      globalFilter.addEventListener('input', () => {
        // Only filter artists if we're on the artists subtab
        const artistsSubtab = document.getElementById('artistsSubtab');
        if (artistsSubtab && artistsSubtab.style.display !== 'none' && this.currentView === 'list') {
          this.filterArtists(globalFilter.value);
        }
      });
    }
    
    // Sort dropdown change
    const sortSelect = document.getElementById('artistSortBy');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this.sortBy = sortSelect.value;
        this.sortAndRenderArtists();
      });
    }

    // Sort direction toggle
    const sortDirectionBtn = document.getElementById('artistSortDirection');
    if (sortDirectionBtn) {
      sortDirectionBtn.addEventListener('click', () => {
        this.toggleSortDirection();
      });
    }

    // Back to artists button (in detail view)
    document.addEventListener('click', (e) => {
      if (e.target.closest('#backToArtists')) {
        this.showArtistList();
      }
    });

    // Artist card clicks
    this.container.addEventListener('click', (e) => {
      const artistCard = e.target.closest('.artist-card');
      if (artistCard && this.currentView === 'list') {
        const artistName = artistCard.dataset.artistName;
        this.showArtistDetail(artistName);
      }
    });
  }

  /**
   * Refresh artists data from tracks
   */
  refresh(tracks) {
    this.processArtists(tracks);
    this.filteredArtists = [...this.artists];
    this.sortAndRenderArtists();
  }

  /**
   * Process tracks into artist data structure
   */
  processArtists(tracks) {
    const artistMap = new Map();
    
    tracks.forEach(track => {
      // Extract artist from metadata (same way MusicLibrary does)
      const artistName = track.metadata?.common?.artist || 'Unknown Artist';
      const albumName = track.metadata?.common?.album || null;
      const duration = track.metadata?.common?.duration || track.duration || 0;
      
      if (!artistMap.has(artistName)) {
        artistMap.set(artistName, {
          name: artistName,
          tracks: [],
          albums: new Set(),
          totalDuration: 0
        });
      }
      
      const artistData = artistMap.get(artistName);
      artistData.tracks.push(track);
      if (albumName) {
        artistData.albums.add(albumName);
      }
      artistData.totalDuration += duration;
    });
    
    // Convert to array and add computed properties
    this.artists = Array.from(artistMap.values()).map(artist => ({
      ...artist,
      songCount: artist.tracks.length,
      albumCount: artist.albums.size,
      albums: Array.from(artist.albums)
    }));

    console.log(`🎨 Processed ${this.artists.length} artists from ${tracks.length} tracks`);
  }

  /**
   * Filter artists based on search query
   */
  filterArtists(query) {
    if (!query || query.trim() === '') {
      this.filteredArtists = [...this.artists];
    } else {
      const searchTerm = query.toLowerCase();
      this.filteredArtists = this.artists.filter(artist => 
        artist.name.toLowerCase().includes(searchTerm)
      );
    }
    
    this.sortAndRenderArtists();
  }

  /**
   * Sort artists based on current sort settings
   */
  sortArtists() {
    const multiplier = this.sortDirection === 'asc' ? 1 : -1;
    
    this.filteredArtists.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'name':
          // Put "Unknown Artist" at the end regardless of sort direction
          if (a.name === 'Unknown Artist') return 1;
          if (b.name === 'Unknown Artist') return -1;
          comparison = a.name.localeCompare(b.name);
          break;
        case 'songCount':
          comparison = a.songCount - b.songCount;
          break;
        case 'albumCount':
          comparison = a.albumCount - b.albumCount;
          break;
      }
      
      return comparison * multiplier;
    });
  }

  /**
   * Sort and render artists
   */
  sortAndRenderArtists() {
    this.sortArtists();
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
    const btn = document.getElementById('artistSortDirection');
    if (btn) {
      btn.innerHTML = this.sortDirection === 'asc' 
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
    }
    
    this.sortAndRenderArtists();
  }

  /**
   * Render the artists list view
   */
  renderListView() {
    if (!this.container) return;

    // Group artists by first letter
    const grouped = this.groupArtistsByLetter();
    
    let html = `
      <div class="artists-list-view">
        <div class="artists-controls">
          <div class="sort-controls">
            <label>Sort by:</label>
            <select id="artistSortBy" class="sort-select">
              <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>Name</option>
              <option value="songCount" ${this.sortBy === 'songCount' ? 'selected' : ''}>Song Count</option>
              <option value="albumCount" ${this.sortBy === 'albumCount' ? 'selected' : ''}>Album Count</option>
            </select>
            <button id="artistSortDirection" class="btn-icon sort-direction">
              ${this.sortDirection === 'asc' 
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>'}
            </button>
          </div>
        </div>
        
        <div class="artists-grid">
    `;

    // Render each letter group
    for (const [letter, artists] of grouped) {
      html += `
        <div class="artist-letter-group">
          <div class="artist-letter-header">${letter}</div>
      `;
      
      artists.forEach(artist => {
        html += this.renderArtistCard(artist);
      });
      
      html += `</div>`;
    }

    html += `
        </div>
        
        <div class="artists-footer">
          ${this.filteredArtists.length} artist${this.filteredArtists.length !== 1 ? 's' : ''} • 
          ${this.filteredArtists.reduce((sum, a) => sum + a.songCount, 0)} tracks
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    
    // Re-attach event listeners for new elements
    this.setupEventListeners();
  }

  /**
   * Group artists by first letter
   */
  groupArtistsByLetter() {
    const groups = new Map();
    
    this.filteredArtists.forEach(artist => {
      let letter = artist.name.charAt(0).toUpperCase();
      
      // Handle special cases
      if (artist.name === 'Unknown Artist') {
        letter = '?'; // Will be sorted to end
      } else if (!/[A-Z]/.test(letter)) {
        letter = '#'; // Numbers and symbols
      }
      
      if (!groups.has(letter)) {
        groups.set(letter, []);
      }
      groups.get(letter).push(artist);
    });
    
    // Sort groups by letter
    return new Map([...groups.entries()].sort((a, b) => {
      if (a[0] === '?') return 1;
      if (b[0] === '?') return -1;
      if (a[0] === '#') return this.sortBy === 'name' ? -1 : 0;
      if (b[0] === '#') return this.sortBy === 'name' ? 1 : 0;
      return a[0].localeCompare(b[0]);
    }));
  }

  /**
   * Render a single artist card
   */
  renderArtistCard(artist) {
    const songText = artist.songCount === 1 ? 'song' : 'songs';
    const albumText = artist.albumCount === 1 ? 'album' : 'albums';
    
    return `
      <div class="artist-card" data-artist-name="${this.escapeHtml(artist.name)}">
        <div class="artist-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </div>
        <div class="artist-info">
          <div class="artist-name">${this.escapeHtml(artist.name)}</div>
          <div class="artist-stats">
            ${artist.songCount} ${songText}${artist.albumCount > 0 ? ` • ${artist.albumCount} ${albumText}` : ''}
          </div>
        </div>
        <div class="artist-arrow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
    `;
  }

  /**
   * Show artist detail view
   */
  showArtistDetail(artistName) {
    this.selectedArtist = this.artists.find(a => a.name === artistName);
    if (!this.selectedArtist) {
      console.error('Artist not found:', artistName);
      return;
    }
    
    this.currentView = 'detail';
    this.renderDetailView();
  }

  /**
   * Render artist detail view
   */
  renderDetailView() {
    if (!this.container || !this.selectedArtist) return;

    const artist = this.selectedArtist;
    
    // Group tracks by album
    const albumGroups = this.groupTracksByAlbum(artist.tracks);
    
    const totalDuration = this.formatDuration(artist.totalDuration);
    const songText = artist.songCount === 1 ? 'song' : 'songs';
    const albumText = artist.albumCount === 1 ? 'album' : 'albums';

    let html = `
      <div class="artist-detail-view">
        <div class="artist-detail-header">
          <button id="backToArtists" class="btn-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back to Artists
          </button>
          
          <div class="artist-detail-info">
            <div class="artist-detail-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </div>
            <div>
              <h2 class="artist-detail-name">${this.escapeHtml(artist.name)}</h2>
              <div class="artist-detail-stats">
                ${artist.songCount} ${songText} • ${artist.albumCount} ${albumText} • ${totalDuration}
              </div>
            </div>
          </div>
        </div>
        
        <div class="artist-albums">
    `;

    // Render each album group
    albumGroups.forEach(({ album, tracks }) => {
      html += this.renderAlbumGroup(album, tracks);
    });

    html += `
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    
    // Setup track table interactions
    this.setupTrackTableListeners();
  }

  /**
   * Group tracks by album
   */
  groupTracksByAlbum(tracks) {
    const albumMap = new Map();
    
    tracks.forEach(track => {
      const album = track.metadata?.common?.album || 'Unknown Album';
      if (!albumMap.has(album)) {
        albumMap.set(album, []);
      }
      albumMap.get(album).push(track);
    });
    
    // Convert to array and sort tracks within each album
    return Array.from(albumMap.entries()).map(([album, albumTracks]) => ({
      album,
      tracks: albumTracks.sort((a, b) => {
        // Sort by track number if available
        const trackA = a.metadata?.common?.track?.no || 9999;
        const trackB = b.metadata?.common?.track?.no || 9999;
        return trackA - trackB;
      })
    }));
  }

  /**
   * Render an album group with its tracks
   */
  renderAlbumGroup(album, tracks) {
    const trackCount = tracks.length;
    const trackText = trackCount === 1 ? 'track' : 'tracks';
    
    return `
      <div class="album-group">
        <div class="album-group-header">
          <h3 class="album-group-name">${this.escapeHtml(album)}</h3>
          <span class="album-group-count">${trackCount} ${trackText}</span>
        </div>
        
        <table class="artist-tracks-table">
          <thead>
            <tr>
              <th class="track-col">Track</th>
              <th class="artist-col">Artist</th>
              <th class="album-col">Album</th>
              <th class="duration-col">Duration</th>
            </tr>
          </thead>
          <tbody>
            ${tracks.map(track => this.renderTrackRow(track)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render a single track row
   */
  renderTrackRow(track) {
    // Extract data from metadata (same way MusicLibrary does)
    const title = track.metadata?.common?.title || track.name?.replace(/\.\w+$/, '') || 'Unknown Track';
    const artist = track.metadata?.common?.artist || 'Unknown Artist';
    const album = track.metadata?.common?.album || 'Unknown Album';
    const duration = track.metadata?.common?.duration || track.duration || 0;
    
    return `
      <tr class="track-row" data-path="${this.escapeHtml(track.path)}">
        <td class="track-name">${this.escapeHtml(title)}</td>
        <td class="track-artist">${this.escapeHtml(artist)}</td>
        <td class="track-album">${this.escapeHtml(album)}</td>
        <td class="track-duration">${this.formatDuration(duration)}</td>
      </tr>
    `;
  }

  /**
   * Setup event listeners for track table
   */
  setupTrackTableListeners() {
    const trackRows = this.container.querySelectorAll('.track-row');
    
    trackRows.forEach(row => {
      row.addEventListener('dblclick', () => {
        const path = row.dataset.path;
        // Trigger play via the main UI
        if (this.ui.musicLibrary) {
          this.ui.musicLibrary.playTrackByPath(path);
        }
      });
    });
  }

  /**
   * Show artists list view
   */
  showArtistList() {
    this.currentView = 'list';
    this.selectedArtist = null;
    this.renderListView();
  }

  /**
   * Format duration in seconds to human-readable string
   */
  formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show/hide the artists view
   */
  show() {
    if (this.container) {
      this.container.style.display = 'block';
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }
}

