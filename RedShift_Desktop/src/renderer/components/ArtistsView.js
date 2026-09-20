/**
 * ArtistsView Component
 * Handles the Artists tab - displays artists list and artist detail views
 */

class ArtistsView {
  constructor(ui) {
    this.ui = ui;
    this.artists = [];
    this.filteredArtists = [];
    this.currentView = 'list'; // 'list', 'albums', or 'detail'
    this.selectedArtist = null;
    this.selectedAlbum = null; // Track selected album when viewing single album
    this.selectedCreditRole = 'primary';
    this.panelView = this.loadPanelViewPreference();
    this.sortBy = 'name'; // 'name', 'songCount', 'albumCount'
    this.sortDirection = 'asc'; // 'asc' or 'desc'
    this.searchTerm = ''; // Local search term for artist filtering
    
    // DOM elements (will be set when tab is initialized)
    this.container = null;
    
    // MusicBrainz service for fetching artist images
    this.musicBrainzService = new MusicBrainzService();
    this.persistentListenersAttached = false;
    this.imageFetchPromise = null;
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
    if (!this.persistentListenersAttached) {
      // Listen for play count updates
      window.addEventListener('play-count-incremented', (event) => {
        const { filePath } = event.detail;
        this.updateTrackPlayCountInUI(filePath);
      });
    }
    
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

    if (!this.persistentListenersAttached) {
      // Back navigation buttons
      document.addEventListener('click', (e) => {
        if (e.target.closest('#backToArtists')) {
          this.showArtistList();
        }
        if (e.target.closest('#backToAlbums')) {
          this.showAlbumSelection();
        }
      });
      
      // Artist card clicks and album selection
      this.container.addEventListener('click', (e) => {
        const panelViewButton = e.target.closest('[data-artist-panel-view]');
        if (panelViewButton) {
          this.showPanelView(panelViewButton.dataset.artistPanelView);
          return;
        }

        const artistCard = e.target.closest('.artist-card');
        if (artistCard && this.currentView === 'list') {
          this.showAlbumSelection(artistCard.dataset.artistName);
        }

        const albumCard = e.target.closest('.album-card');
        if (albumCard && (this.currentView === 'albums' || albumCard.closest('.artist-albums-panel-container'))) {
          const albumName = albumCard.dataset.albumName;
          if (albumName === '__ALL_SONGS__') {
            this.showAllSongs();
          } else if (albumName === '__APPEARANCES__') {
            this.showFeaturedSongs();
          } else {
            this.showAlbumDetail(albumName);
          }
        }

        if (e.target.closest('#fetchArtistImages')) {
          this.startFetchingImages();
        }

        if (e.target.closest('#retryFailedImages')) {
          this.retryFailedImages();
        }
      });
      
      this.persistentListenersAttached = true;
    }
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
    // Delegate to global data processor
    this.artists = processArtists(tracks, this.musicBrainzService);

    console.log(`🎨 Processed ${this.artists.length} artists from ${tracks.length} tracks`);
    
    // Auto-fetch for new artists (not yet attempted)
    this.fetchNewArtistImages();
  }

  /**
   * Fetch images only for artists we haven't attempted yet
   */
  async fetchNewArtistImages() {
    if (this.imageFetchPromise) return null;
    updateFetchButtonState(true);
    try {
      return await this.runImageFetch(() => fetchNewArtistImages(
        this.artists,
        this.musicBrainzService,
        this.ui,
        (artistName, imageUrl) => this.updateArtistCardImage(artistName, imageUrl)
      ));
    } finally {
      if (this.currentView === 'list') {
        this.renderListView();
      }
      updateFetchButtonState(false);
    }
  }

  /**
   * Fetch artist images from MusicBrainz (user-triggered, fetches all)
   */
  async fetchArtistImages() {
    const result = await this.runImageFetch(() => fetchAllArtistImages(
      this.artists,
      this.musicBrainzService,
      this.ui,
      (artistName, imageUrl) => this.updateArtistCardImage(artistName, imageUrl)
    ));
    if (result && this.currentView === 'list') {
      this.renderListView();
    }
    return result;
  }

  /**
   * Start fetching images (user-triggered via button)
   */
  async startFetchingImages() {
    if (this.imageFetchPromise) return;
    updateFetchButtonState(true);
    try {
      await this.fetchArtistImages();
    } finally {
      updateFetchButtonState(false);
    }
  }

  /**
   * Retry failed artist image lookups
   */
  async retryFailedImages() {
    if (this.imageFetchPromise) return;
    updateRetryButtonState(true);
    try {
      const result = await this.runImageFetch(() => retryFailedArtistImages(
        this.artists,
        this.musicBrainzService,
        this.ui,
        (artistName, imageUrl) => this.updateArtistCardImage(artistName, imageUrl)
      ));
      if (result && this.currentView === 'list') {
        this.renderListView();
      }
    } finally {
      updateRetryButtonState(false);
    }
  }

  async runImageFetch(fetchOperation) {
    if (this.imageFetchPromise) {
      this.ui.logBoth('info', '🎨 Artist image fetch already in progress');
      return null;
    }

    this.imageFetchPromise = fetchOperation();
    try {
      return await this.imageFetchPromise;
    } finally {
      this.imageFetchPromise = null;
    }
  }

  /**
   * Update a specific artist card's image in the DOM
   */
  updateArtistCardImage(artistName, imageUrl) {
    // Delegate to global image fetcher
    updateArtistCardImage(this.container, this.currentView, artistName, imageUrl);
  }

  /**
   * Filter artists based on search query
   */
  filterArtists(query) {
    // Delegate to global data processor
    this.filteredArtists = filterArtists(this.artists, query);
    
    // Only re-render the grid portion, not the entire view (to preserve input focus)
    this.sortArtists();
    this.renderArtistsGrid();
  }

  /**
   * Sort artists based on current sort settings
   */
  sortArtists() {
    // Delegate to global data processor (modifies array in place)
    sortArtists(this.filteredArtists, this.sortBy, this.sortDirection);
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

    // Delegate to global renderer
    const viewState = {
      filteredArtists: this.filteredArtists,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      searchTerm: this.searchTerm
    };
    
    const html = renderArtistListView(viewState, this.musicBrainzService);
    this.container.innerHTML = html;
    
    // Re-attach event listeners for new elements
    this.setupEventListeners();
    if (this.imageFetchPromise) {
      updateFetchButtonState(true);
    }
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
    
    // Delegate to global renderer
    const viewState = {
      filteredArtists: this.filteredArtists,
      sortBy: this.sortBy
    };
    
    const gridHtml = renderArtistGridOnly(viewState);
    const footerHtml = renderArtistFooter(this.filteredArtists);
    
    // Update only the grid and footer
    gridContainer.innerHTML = gridHtml;
    footerContainer.innerHTML = footerHtml;
  }


  /**
   * Show album selection view for an artist
   */
  showAlbumSelection(artistName) {
    // If no artistName provided, use currently selected artist
    if (artistName) {
      this.selectedArtist = this.artists.find(a => a.name === artistName);
      if (!this.selectedArtist) {
        console.error('Artist not found:', artistName);
        return;
      }
    }
    
    if (!this.selectedArtist) {
      console.error('No artist selected');
      return;
    }
    
    this.selectedAlbum = null; // Clear album selection
    this.selectedCreditRole = this.panelView === 'tracks' ? 'all' : 'primary';
    this.currentView = this.container?.querySelector('.artist-albums-panel-container') ? 'list' : 'albums';
    if (this.panelView === 'tracks') this.renderDetailView();
    else this.renderAlbumsView();
  }

  /**
   * Render album selection view
   */
  renderAlbumsView() {
    if (!this.container || !this.selectedArtist) return;

    const artist = this.selectedArtist;
    
    const primaryAlbumGroups = this.groupTracksByAlbum(artist.primaryTracks);
    const featuredAlbumGroups = this.groupTracksByAlbum(artist.featuredTracks);
    
    const panelContainer = this.container.querySelector('.artist-albums-panel-container');
    if (panelContainer) {
      panelContainer.innerHTML = renderArtistAlbumsPanel(artist, primaryAlbumGroups, featuredAlbumGroups);
      this.container.querySelectorAll('.artist-card').forEach((card) => {
        card.classList.toggle('is-selected', card.dataset.artistName === artist.name);
      });
      return;
    }

    // Preserve the existing full-page behavior until the list renderer provides the panel container.
    this.container.innerHTML = renderArtistAlbumsView(artist, primaryAlbumGroups, featuredAlbumGroups);
  }

  showPanelView(panelView) {
    if (!this.selectedArtist || !['albums', 'tracks'].includes(panelView)) return;
    this.savePanelViewPreference(panelView);
    this.selectedAlbum = null;
    this.selectedCreditRole = panelView === 'tracks' ? 'all' : 'primary';
    this.currentView = 'list';
    if (panelView === 'albums') this.renderAlbumsView();
    else this.renderDetailView();
  }


  /**
   * Show all songs for the artist (grouped by album)
   */
  showAllSongs() {
    if (!this.selectedArtist) return;
    
    this.selectedAlbum = null;
    this.selectedCreditRole = 'all';
    this.savePanelViewPreference('tracks');
    if (this.container?.querySelector('.artist-albums-panel-container')) {
      this.currentView = 'list';
      this.renderDetailView();
      return;
    }
    this.currentView = 'detail';
    this.renderDetailView();
  }

  /**
   * Show tracks where the selected artist is featured.
   */
  showFeaturedSongs() {
    if (!this.selectedArtist) return;

    this.selectedAlbum = null;
    this.selectedCreditRole = 'featured';
    this.savePanelViewPreference('albums');
    if (this.container?.querySelector('.artist-albums-panel-container')) {
      this.currentView = 'list';
      this.renderDetailView();
      return;
    }
    this.currentView = 'detail';
    this.renderDetailView();
  }

  /**
   * Show detail view for a single album
   */
  showAlbumDetail(albumName) {
    if (!this.selectedArtist) return;
    
    this.selectedAlbum = albumName;
    this.selectedCreditRole = 'primary';
    this.savePanelViewPreference('albums');
    if (this.container?.querySelector('.artist-albums-panel-container')) {
      this.currentView = 'list';
      this.renderDetailView();
      return;
    }
    this.currentView = 'detail';
    this.renderDetailView();
  }

  /**
   * Render artist detail view (all songs or single album)
   */
  renderDetailView() {
    if (!this.container || !this.selectedArtist) return;
    const panelContainer = this.container.querySelector('.artist-albums-panel-container');
    if (panelContainer && this.panelView === 'albums' && !this.selectedAlbum && this.selectedCreditRole !== 'featured') {
      this.renderAlbumsView();
      return;
    }

    const artist = this.selectedArtist;
    
    const roleTracks = this.selectedCreditRole === 'featured'
      ? artist.featuredTracks
      : this.selectedCreditRole === 'all'
        ? artist.tracks
        : artist.primaryTracks;
    const albumGroups = this.groupTracksByAlbum(roleTracks);
    
    // Filter to single album if one is selected
    const displayGroups = this.selectedAlbum 
      ? albumGroups.filter(g => g.album === this.selectedAlbum)
      : albumGroups;
    
    // Get favorite, rating, and play count data from music library
    const favoriteByPath = this.ui.musicLibrary?.favoriteByPath || new Map();
    const ratingByPath = this.ui.musicLibrary?.ratingByPath || new Map();
    const playCountByPath = this.ui.musicLibrary?.playCountByPath || new Map();
    
    // Get current track info for now-playing indicator
    const currentTrack = this.ui.audioPlayer?.audioPlayerState?.currentTrack;
    const currentTrackPath = currentTrack?.filePath || currentTrack?.path || null;
    const isPlaying = this.ui.audioPlayer?.audioPlayerState?.isPlaying || false;
    
    if (panelContainer) {
      panelContainer.innerHTML = renderArtistTracksPanel(artist, displayGroups, this.selectedCreditRole, this.selectedAlbum, favoriteByPath, ratingByPath, playCountByPath, currentTrackPath, isPlaying);
      this.container.querySelectorAll('.artist-card').forEach((card) => {
        card.classList.toggle('is-selected', card.dataset.artistName === artist.name);
      });
      this.setupTrackTableListeners();
      this.setupTrackActionListeners();
      return;
    }

    // Delegate to global renderer
    const html = renderArtistDetailView(artist, displayGroups, this.selectedAlbum, this.selectedCreditRole, favoriteByPath, ratingByPath, playCountByPath, currentTrackPath, isPlaying);
    this.container.innerHTML = html;
    
    // Setup track table interactions
    this.setupTrackTableListeners();
    
    // Setup favorite, rating, and action button interactions
    this.setupTrackActionListeners();
  }

  /**
   * Group tracks by album
   */
  groupTracksByAlbum(tracks) {
    // Delegate to global data processor
    return groupTracksByAlbum(tracks);
  }

  getSelectedRoleTracks() {
    if (this.selectedCreditRole === 'featured') return this.selectedArtist.featuredTracks;
    if (this.selectedCreditRole === 'all') return this.selectedArtist.tracks;
    return this.selectedArtist.primaryTracks;
  }

  loadPanelViewPreference() {
    try {
      return localStorage.getItem('redshift.artistPanelView') === 'tracks' ? 'tracks' : 'albums';
    } catch (error) {
      return 'albums';
    }
  }

  savePanelViewPreference(panelView) {
    this.panelView = panelView;
    try {
      localStorage.setItem('redshift.artistPanelView', panelView);
    } catch (error) {
      console.warn('Unable to save artist panel view preference:', error);
    }
  }

  /**
   * Setup event listeners for track table
   */
  setupTrackTableListeners() {
    const trackRows = this.container.querySelectorAll('.track-row');
    
    // Build the playback context based on what's being displayed
    let contextTracks;
    if (this.selectedAlbum) {
      // Single album view - only include tracks from this album
      contextTracks = this.getSelectedRoleTracks().filter(
        t => (t.metadata?.common?.album || 'Unknown Album') === this.selectedAlbum
      );
    } else {
      // All songs view - include all artist's tracks
      contextTracks = this.getSelectedRoleTracks();
    }
    
    trackRows.forEach((row, index) => {
      row.addEventListener('dblclick', async () => {
        const path = row.dataset.path;
        
        // Find the track in the context tracks
        const track = contextTracks.find(t => t.path === path);
        const trackIndex = contextTracks.findIndex(t => t.path === path);
        
        if (!track) {
          console.error('Track not found:', path);
          return;
        }
        
        try {
          // Set playback context to the current view's tracks
          const contextType = this.selectedAlbum ? 'album' : 'artist';
          this.ui.audioPlayer.setPlaybackContext(contextType, contextTracks, trackIndex);
          
          // Play the track
          await this.ui.audioPlayer.playTrack(track.path, track);
          
          const viewContext = this.selectedAlbum ? `album "${this.selectedAlbum}"` : 'artist';
          console.log(`▶️ Playing track from ${viewContext}: ${track.metadata?.common?.title || track.name}`);
        } catch (error) {
          console.error('Error playing track from artist view:', error);
        }
      });
    });
  }

  /**
   * Setup event listeners for track actions (favorite, rating, play, queue, playlist)
   */
  setupTrackActionListeners() {
    // Build track list for this view
    const trackRows = this.container.querySelectorAll('.track-row');
    const tracksByIndex = Array.from(trackRows).map(row => {
      const path = row.dataset.path;
      return this.getSelectedRoleTracks().find(t => t.path === path);
    });
    
    // Build context tracks based on current view
    let contextTracks;
    if (this.selectedAlbum) {
      contextTracks = this.getSelectedRoleTracks().filter(
        t => (t.metadata?.common?.album || 'Unknown Album') === this.selectedAlbum
      );
    } else {
      contextTracks = this.getSelectedRoleTracks();
    }
    
    const contextType = this.selectedAlbum ? 'album' : 'artist';
    
    // Setup all interactive track action handlers using shared functions
    setupAllTrackActionHandlers({
      container: this.container,
      getTrackByIndex: (index) => tracksByIndex[index],
      musicLibrary: this.ui.musicLibrary,
      audioPlayer: this.ui.audioPlayer,
      playlistManager: { openAddTracksModal: (tracks) => {
        // Use showPlaylistPickerModal for adding tracks to playlists
        const track = tracks[0];
        const button = event.target.closest('.add-to-playlist-btn');
        if (button && track) {
          showPlaylistPickerModal(button, track.path, track.name, this.ui.logger.logBoth.bind(this.ui.logger));
        }
      }},
      contextTracks: contextTracks,
      contextType: contextType,
      setFavoriteStatusFn: this.ui.songsMetadata.toggleFavorite.bind(this.ui.songsMetadata),
      setRatingFn: this.ui.songsMetadata.setRating.bind(this.ui.songsMetadata),
      logFn: this.ui.logger.logBoth.bind(this.ui.logger)
    });
  }

  /**
   * Show artists list view
   */
  showArtistList() {
    this.currentView = 'list';
    this.selectedArtist = null;
    this.selectedAlbum = null;
    this.renderListView();
  }

  /**
   * Update play count display in UI for a specific track
   * @param {string} filePath - Path to the track file
   */
  updateTrackPlayCountInUI(filePath) {
    // Only update if we're in detail view showing tracks
    if (this.currentView !== 'detail' || !this.selectedArtist || !this.container) {
      return;
    }

    // Use shared utility to update the UI
    updateTrackPlayCountInUI(this.container, filePath, this.ui.musicLibrary.playCountByPath);
  }

  /**
   * Format duration - delegates to global helper
   */
  formatDuration(seconds) {
    return formatDuration(seconds);
  }

  /**
   * Escape HTML - delegates to global helper
   */
  escapeHtml(text) {
    return escapeHtml(text);
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

