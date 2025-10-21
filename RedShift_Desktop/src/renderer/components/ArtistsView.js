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
    this.searchTerm = ''; // Local search term for artist filtering
    
    // DOM elements (will be set when tab is initialized)
    this.container = null;
    
    // MusicBrainz service for fetching artist images
    this.musicBrainzService = new MusicBrainzService();
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
    // Local artist search filter
    const artistSearchInput = document.getElementById('artistSearchInput');
    if (artistSearchInput) {
      artistSearchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value;
        this.filterArtists(this.searchTerm);
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
      
      // Fetch images button
      const fetchBtn = e.target.closest('#fetchArtistImages');
      if (fetchBtn) {
        this.startFetchingImages();
      }
      
      // Retry failed button
      const retryBtn = e.target.closest('#retryFailedImages');
      if (retryBtn) {
        this.retryFailedImages();
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
    this.artists = Array.from(artistMap.values()).map(artist => {
      // Find album art from the artist's tracks (fallback)
      let albumArt = null;
      for (const track of artist.tracks) {
        if (track.metadata?.common?.picture && track.metadata.common.picture.length > 0) {
          const picture = track.metadata.common.picture[0];
          albumArt = `data:${picture.format};base64,${picture.data.toString('base64')}`;
          break;
        }
      }
      
      // Check if we have a cached artist image
      const cachedImage = this.musicBrainzService.imageCache.get(artist.name);
      
      return {
        ...artist,
        songCount: artist.tracks.length,
        albumCount: artist.albums.size,
        albums: Array.from(artist.albums),
        albumArt: albumArt,
        artistImage: cachedImage || null // Load from cache if available
      };
    });

    console.log(`🎨 Processed ${this.artists.length} artists from ${tracks.length} tracks`);
    
    // Auto-fetch for new artists (not yet attempted)
    this.fetchNewArtistImages();
  }

  /**
   * Fetch images only for artists we haven't attempted yet
   */
  async fetchNewArtistImages() {
    // Filter to only artists we haven't attempted
    const newArtists = this.artists.filter(artist => 
      artist.name !== 'Unknown Artist' && 
      !this.musicBrainzService.hasAttempted(artist.name)
    );
    
    if (newArtists.length === 0) {
      this.ui.logBoth('info', '🎨 No new artists to fetch images for');
      return;
    }
    
    this.ui.logBoth('info', `🎨 Auto-fetching images for ${newArtists.length} new artist(s)...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < newArtists.length; i++) {
      const artist = newArtists[i];
      this.ui.logBoth('info', `🎨 [${i + 1}/${newArtists.length}] Fetching image for: ${artist.name}`);
      
      try {
        const imageUrl = await this.musicBrainzService.getArtistImage(artist.name);
        
        if (imageUrl) {
          successCount++;
          artist.artistImage = imageUrl;
          this.updateArtistCardImage(artist.name, imageUrl);
          this.ui.logBoth('success', `✅ Found image for: ${artist.name}`);
        } else {
          failCount++;
          this.ui.logBoth('warning', `❌ No image found for: ${artist.name}`);
        }
      } catch (error) {
        failCount++;
        this.ui.logBoth('error', `❌ Failed to fetch image for ${artist.name}: ${error.message}`);
      }
    }
    
    this.ui.logBoth('success', `✅ Finished auto-fetching: ${successCount} successful, ${failCount} failed`);
  }

  /**
   * Fetch artist images from MusicBrainz (user-triggered, fetches all)
   */
  async fetchArtistImages() {
    const artistsToFetch = this.artists.filter(a => a.name !== 'Unknown Artist');
    
    this.ui.logBoth('info', `🎨 Fetching images for all ${artistsToFetch.length} artist(s)...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < artistsToFetch.length; i++) {
      const artist = artistsToFetch[i];
      this.ui.logBoth('info', `🎨 [${i + 1}/${artistsToFetch.length}] Fetching image for: ${artist.name}`);
      
      try {
        const imageUrl = await this.musicBrainzService.getArtistImage(artist.name);
        
        if (imageUrl) {
          successCount++;
          artist.artistImage = imageUrl;
          this.updateArtistCardImage(artist.name, imageUrl);
          this.ui.logBoth('success', `✅ Found image for: ${artist.name}`);
        } else {
          failCount++;
          this.ui.logBoth('warning', `❌ No image found for: ${artist.name}`);
        }
      } catch (error) {
        failCount++;
        this.ui.logBoth('error', `❌ Failed to fetch image for ${artist.name}: ${error.message}`);
      }
    }
    
    this.ui.logBoth('success', `✅ Finished fetching all images: ${successCount} successful, ${failCount} failed`);
    this.renderListView(); // Refresh to update button states
  }

  /**
   * Start fetching images (user-triggered via button)
   */
  async startFetchingImages() {
    const btn = document.getElementById('fetchArtistImages');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        Fetching...
      `;
    }
    
    await this.fetchArtistImages();
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        Fetch Images
      `;
    }
  }

  /**
   * Retry failed artist image lookups
   */
  async retryFailedImages() {
    const failedArtists = this.artists.filter(artist => 
      artist.name !== 'Unknown Artist' && 
      this.musicBrainzService.hasAttempted(artist.name) &&
      !this.musicBrainzService.imageCache.get(artist.name) // null means failed
    );
    
    if (failedArtists.length === 0) {
      this.ui.logBoth('info', '🎨 No failed artists to retry');
      return;
    }
    
    this.ui.logBoth('info', `🎨 Retrying ${failedArtists.length} failed artist(s)...`);
    
    const btn = document.getElementById('retryFailedImages');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Retrying...';
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < failedArtists.length; i++) {
      const artist = failedArtists[i];
      this.ui.logBoth('info', `🔄 [${i + 1}/${failedArtists.length}] Retrying: ${artist.name}`);
      
      try {
        const imageUrl = await this.musicBrainzService.refreshArtistImage(artist.name, true);
        
        if (imageUrl) {
          successCount++;
          artist.artistImage = imageUrl;
          this.updateArtistCardImage(artist.name, imageUrl);
          this.ui.logBoth('success', `✅ Found image on retry: ${artist.name}`);
        } else {
          failCount++;
          this.ui.logBoth('warning', `❌ Still no image for: ${artist.name}`);
        }
      } catch (error) {
        failCount++;
        this.ui.logBoth('error', `❌ Retry failed for ${artist.name}: ${error.message}`);
      }
    }
    
    this.ui.logBoth('success', `✅ Finished retrying: ${successCount} successful, ${failCount} still failed`);
    this.renderListView(); // Refresh to update button states
  }

  /**
   * Update a specific artist card's image in the DOM
   */
  updateArtistCardImage(artistName, imageUrl) {
    if (this.currentView !== 'list') return;
    
    const card = this.container.querySelector(`.artist-card[data-artist-name="${this.escapeHtml(artistName)}"]`);
    if (!card) return;
    
    const iconDiv = card.querySelector('.artist-icon');
    if (!iconDiv) return;
    
    // Replace SVG with image
    iconDiv.innerHTML = `<img src="${imageUrl}" alt="${this.escapeHtml(artistName)}" class="artist-image" />`;
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
    
    // Only re-render the grid portion, not the entire view (to preserve input focus)
    this.sortArtists();
    this.renderArtistsGrid();
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

    // Get cache stats for display
    const cacheStats = this.musicBrainzService.getCacheStats();
    const statsText = cacheStats.total > 0 
      ? `${cacheStats.successful} of ${cacheStats.total} artists`
      : 'No images fetched yet';

    let html = `
      <div class="artists-list-view">
        <div class="artists-controls">
          <div class="search-filter-controls">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input 
              type="text" 
              id="artistSearchInput" 
              placeholder="Filter artists..." 
              value="${this.escapeHtml(this.searchTerm)}"
              class="search-input"
            />
          </div>
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
          <div class="image-controls">
            <span class="image-stats">${statsText}</span>
            <button id="fetchArtistImages" class="btn btn-secondary" title="Fetch artist images from MusicBrainz">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              Fetch Images
            </button>
            ${cacheStats.failed > 0 ? `
              <button id="retryFailedImages" class="btn btn-secondary" title="Retry failed artist lookups">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                Retry Failed (${cacheStats.failed})
              </button>
            ` : ''}
          </div>
        </div>
        
        <div class="artists-grid">
    `;

    // Only group by letter when sorting by name
    if (this.sortBy === 'name') {
      const grouped = this.groupArtistsByLetter();
      
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
    } else {
      // For numeric sorting, just render all artists in order without letter grouping
      this.filteredArtists.forEach(artist => {
        html += this.renderArtistCard(artist);
      });
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
   * Render only the artists grid (not controls) - used for filtering to preserve input focus
   */
  renderArtistsGrid() {
    const gridContainer = document.querySelector('.artists-grid');
    const footerContainer = document.querySelector('.artists-footer');
    
    if (!gridContainer || !footerContainer) {
      // If grid doesn't exist yet, render the full view
      this.renderListView();
      return;
    }
    
    // Build grid HTML
    let gridHtml = '';
    
    if (this.sortBy === 'name') {
      const grouped = this.groupArtistsByLetter();
      
      for (const [letter, artists] of grouped) {
        gridHtml += `
          <div class="artist-letter-group">
            <div class="artist-letter-header">${letter}</div>
        `;
        
        artists.forEach(artist => {
          gridHtml += this.renderArtistCard(artist);
        });
        
        gridHtml += `</div>`;
      }
    } else {
      this.filteredArtists.forEach(artist => {
        gridHtml += this.renderArtistCard(artist);
      });
    }
    
    // Update only the grid and footer
    gridContainer.innerHTML = gridHtml;
    footerContainer.innerHTML = `
      ${this.filteredArtists.length} artist${this.filteredArtists.length !== 1 ? 's' : ''} • 
      ${this.filteredArtists.reduce((sum, a) => sum + a.songCount, 0)} tracks
    `;
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
    
    // Prefer artist image from MusicBrainz, fall back to album art, then icon
    let artistImage;
    if (artist.artistImage) {
      artistImage = `<img src="${artist.artistImage}" alt="${this.escapeHtml(artist.name)}" class="artist-image" />`;
    } else if (artist.albumArt) {
      artistImage = `<img src="${artist.albumArt}" alt="${this.escapeHtml(artist.name)}" class="artist-image" />`;
    } else {
      artistImage = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
           <circle cx="12" cy="12" r="10"></circle>
           <circle cx="12" cy="12" r="3"></circle>
         </svg>`;
    }
    
    return `
      <div class="artist-card" data-artist-name="${this.escapeHtml(artist.name)}">
        <div class="artist-icon">
          ${artistImage}
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
    
    const songText = artist.songCount === 1 ? 'song' : 'songs';
    const albumText = artist.albumCount === 1 ? 'album' : 'albums';
    
    // Prefer artist image from MusicBrainz, fall back to album art, then icon
    let artistImage;
    if (artist.artistImage) {
      artistImage = `<img src="${artist.artistImage}" alt="${this.escapeHtml(artist.name)}" class="artist-image" />`;
    } else if (artist.albumArt) {
      artistImage = `<img src="${artist.albumArt}" alt="${this.escapeHtml(artist.name)}" class="artist-image" />`;
    } else {
      artistImage = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
           <circle cx="12" cy="12" r="10"></circle>
           <circle cx="12" cy="12" r="3"></circle>
         </svg>`;
    }

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
              ${artistImage}
            </div>
            <div>
              <h2 class="artist-detail-name">${this.escapeHtml(artist.name)}</h2>
              <div class="artist-detail-stats">
                ${artist.songCount} ${songText} • ${artist.albumCount} ${albumText}
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

