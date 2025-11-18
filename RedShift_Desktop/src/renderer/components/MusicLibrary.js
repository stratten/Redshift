// src/renderer/components/MusicLibrary.js - Music Library Component

class MusicLibrary {
  constructor(uiManager) {
    this.ui = uiManager;
    this.musicLibrary = [];
    this.filteredTracks = [];
    
    // Per-song UI state
    this.favoriteByPath = new Map();
    this.ratingByPath = new Map();
    this.playCountByPath = new Map();
    
    // Browser state
    this.selectedGenre = '';
    this.selectedArtist = '';
    this.selectedAlbum = '';
    
    // Track if click listener has been added to prevent duplicates
    this.clickListenerAdded = false;
    
    // Sorting state (default: by artist ascending)
    this.sortField = 'artist'; // 'track' | 'artist' | 'album' | 'duration'
    this.sortDirection = 'asc'; // 'asc' | 'desc'
    this.sortListenerAdded = false;
    
    // Inline editing state
    this.selectedRowIndex = null;
    this.lastClickTime = 0;
    this.lastClickedCell = null;
    this.editingCell = null;
    
    this.setupEventListeners();
    this.setupScanProgressListener();
    this.setupPlaybackListeners();
  }
  
  setupPlaybackListeners() {
    setupPlaybackEventListeners({
      loadSongMetadata: this.loadSongMetadata.bind(this),
      loadRecentlyPlayed: this.loadRecentlyPlayed.bind(this),
      updateTrackPlayCountInUI: this.updateTrackPlayCountInUI.bind(this),
      playCountByPath: this.playCountByPath,
      logBoth: this.ui.logBoth.bind(this.ui)
    });
  }
  
  updateTrackPlayCountInUI(filePath) {
    updateTrackPlayCountDisplay(
      filePath,
      this.playCountByPath,
      this.musicLibrary,
      this.ui.logBoth.bind(this.ui)
    );
  }
  
  setupScanProgressListener() {
    setupScanProgressEventListener(this.ui.logBoth.bind(this.ui));
  }
  
  setupEventListeners() {
    // Refresh Music Library button
    const scanMusicBtn = document.getElementById('scanMusicBtn');
    if (scanMusicBtn) {
      this.ui.logBoth('info', 'Setting up Refresh Library button listener');
      scanMusicBtn.addEventListener('click', async () => {
        this.ui.logBoth('info', 'Refresh Library button clicked');
        try {
          await this.scanMusicLibrary();
        } catch (error) {
          this.ui.logBoth('error', `Music library refresh error: ${error.message}`);
        }
      });
    } else {
      this.ui.logBoth('error', 'scanMusicBtn element not found!');
    }
    
    this.setupMusicTableFilters();
    this.setupSortHandlers();
  }
  
  async scanMusicLibrary() {
    this.musicLibrary = await scanMusicLibraryFiles(this.ui.logBoth.bind(this.ui));
    await this.loadSongMetadata();
    this.updateMusicLibraryUI();
  }

  async loadSongMetadata() {
    await loadAllSongMetadata(
      this.ui.getAllSongMetadata.bind(this.ui),
      this.favoriteByPath,
      this.ratingByPath,
      this.playCountByPath,
      this.ui.logBoth.bind(this.ui)
    );
  }
  
  updateMusicLibraryUI() {
    this.ui.logBoth('info', `🎵 Updating music library table with ${this.musicLibrary.length} tracks`);
    
    // Update track count
    const trackCountElement = document.getElementById('trackCount');
    if (trackCountElement) {
      trackCountElement.textContent = `${this.musicLibrary.length} track${this.musicLibrary.length !== 1 ? 's' : ''}`;
      this.ui.logBoth('info', `🎵 Updated track count display: ${trackCountElement.textContent}`);
    } else {
      this.ui.logBoth('warning', `🎵 trackCount element not found in DOM`);
    }
    
    const tableBody = document.getElementById('musicTableBody');
    if (!tableBody) {
      this.ui.logBoth('error', `🎵 musicTableBody element not found in DOM!`);
      return;
    }
    
    if (this.musicLibrary.length === 0) {
      this.ui.logBoth('info', `🎵 No tracks found, showing empty state`);
      tableBody.innerHTML = `
        <tr class="empty-state-row">
          <td colspan="7">
            <div class="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
              <h3>No music found</h3>
              <p>Make sure your music library path is set correctly in Settings</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    this.ui.logBoth('info', `🎵 Proceeding with table rendering for ${this.musicLibrary.length} tracks`);
    
    // Populate three-column browser
    this.populateLibraryBrowser();
    
    // Store the filtered tracks for easy access
    this.filteredTracks = [...this.musicLibrary];
    this.ui.logBoth('info', `🎵 Set filteredTracks array: ${this.filteredTracks.length} tracks`);
    
    // Apply default/current sort before rendering
    this.sortFilteredTracks();
    
    this.renderMusicTable();
  }
  
  renderMusicTable() {
    const tableBody = document.getElementById('musicTableBody');
    if (!tableBody) {
      this.ui.logBoth('error', `🎵 musicTableBody not found in renderMusicTable!`);
      return;
    }
    
    // Get current track info from audio player
    const currentTrack = this.ui.audioPlayer?.audioPlayerState?.currentTrack;
    const currentTrackPath = currentTrack?.filePath || currentTrack?.path || null;
    const isPlaying = this.ui.audioPlayer?.audioPlayerState?.isPlaying || false;
    
    // Use the renderer module to generate HTML
    const result = renderMusicTableHTML(
      this.filteredTracks,
      this.musicLibrary,
      this.favoriteByPath,
      this.ratingByPath,
      this.playCountByPath,
      this.formatTime.bind(this),
      this.ui.logBoth.bind(this.ui),
      currentTrackPath,
      isPlaying
    );
    
    tableBody.innerHTML = result.tableHTML;
    
    this.ui.logBoth('info', `🎵 Table HTML set. Current tableBody.children.length: ${tableBody.children.length}`);
    
    // Debug: Check if action buttons are in the DOM
    const actionButtons = tableBody.querySelectorAll('.action-btn');
    this.ui.logBoth('info', `🎵 Found ${actionButtons.length} action buttons in DOM`);
    
    const playButtons = tableBody.querySelectorAll('.play-track-btn');
    this.ui.logBoth('info', `🎵 Found ${playButtons.length} play buttons in DOM`);
    
    // Add click listeners for table actions (only once)
    if (!this.clickListenerAdded) {
      this.clickListenerAdded = true;
      
      setupMusicTableEventListeners(tableBody, {
        musicLibrary: this.musicLibrary,
        filteredTracks: this.filteredTracks,
        audioPlayer: this.ui.audioPlayer,
        editingState: {
          editingCell: this.editingCell,
          selectedRowIndex: this.selectedRowIndex,
          lastClickTime: this.lastClickTime,
          lastClickedCell: this.lastClickedCell
        },
        getPlaybackContext: this.getPlaybackContext.bind(this),
        updateTrackPlayCountInUI: this.updateTrackPlayCountInUI.bind(this),
        enterEditMode: this.enterEditMode.bind(this),
        playTrackFromMenu: this.playTrackFromMenu.bind(this),
        confirmDelete: this.confirmDelete.bind(this),
        toggleFavorite: this.ui.toggleFavorite.bind(this.ui),
        setRating: this.ui.setRating.bind(this.ui),
        getFileInfo: this.ui.getFileInfo.bind(this.ui),
        showInFinder: this.ui.showInFinder.bind(this.ui),
        favoriteByPath: this.favoriteByPath,
        ratingByPath: this.ratingByPath,
        logBoth: this.ui.logBoth.bind(this.ui)
      });
    } else {
      this.ui.logBoth('info', `🎯 Click listeners already exist, skipping`);
    }
  }
  
  setupMusicTableFilters() {
    setupFilterEventListeners(
      this.applyFilters.bind(this),
      this.ui.logBoth.bind(this.ui)
    );
    
    // Three-column browser
    this.setupLibraryBrowser();
    
    // Ensure initial sort indicators reflect default state
    this.updateSortIndicators();
  }
  
  setupLibraryBrowser() {
    // Initialize browser state
    this.selectedGenre = '';
    this.selectedArtist = '';
    this.selectedAlbum = '';
    
    // Setup click listeners for each column
    setupLibraryBrowserEventListeners(
      this.selectGenre.bind(this),
      this.selectArtist.bind(this),
      this.selectAlbum.bind(this)
    );
  }
  
  populateLibraryBrowser() {
    populateLibraryBrowserColumns(this.musicLibrary, this.ui.logBoth.bind(this.ui));
  }
  
  selectGenre(genre) {
    this.selectedGenre = genre;
    updateBrowserColumnSelection('genresList', genre);
    this.updateArtistsForGenre();
    this.applyFilters();
  }
  
  selectArtist(artist) {
    this.selectedArtist = artist;
    updateBrowserColumnSelection('artistsList', artist);
    this.updateAlbumsForArtist();
    this.applyFilters();
  }
  
  selectAlbum(album) {
    this.selectedAlbum = album;
    updateBrowserColumnSelection('albumsList', album);
    this.applyFilters();
  }
  
  updateArtistsForGenre() {
    updateArtistsForSelectedGenre(this.musicLibrary, this.selectedGenre);
    this.selectedArtist = ''; // Reset artist selection
    this.updateAlbumsForArtist();
  }
  
  updateAlbumsForArtist() {
    updateAlbumsForSelectedArtist(this.musicLibrary, this.selectedGenre, this.selectedArtist);
    this.selectedAlbum = ''; // Reset album selection
  }
  
  applyFilters() {
    if (!this.musicLibrary || this.musicLibrary.length === 0) return;
    
    const browserState = {
      selectedGenre: this.selectedGenre,
      selectedArtist: this.selectedArtist,
      selectedAlbum: this.selectedAlbum
    };
    
    this.filteredTracks = applyLibraryFilters(
      this.musicLibrary,
      browserState,
      this.favoriteByPath,
      this.ratingByPath
    );
    
    // Update track count
    document.getElementById('trackCount').textContent = 
      `${this.filteredTracks.length} of ${this.musicLibrary.length} track${this.musicLibrary.length !== 1 ? 's' : ''}`;
    
    // Apply current sort to filtered results
    this.sortFilteredTracks();
    
    this.renderMusicTable();
  }
  
  formatTime(seconds) {
    return formatDuration(seconds);
  }

  // Determine the current playback context based on active filters
  getPlaybackContext() {
    const browserState = {
      selectedGenre: this.selectedGenre,
      selectedArtist: this.selectedArtist,
      selectedAlbum: this.selectedAlbum
    };
    return determinePlaybackContext(browserState);
  }
  
  // Sorting helpers
  setupSortHandlers() {
    if (this.sortListenerAdded) return;
    this.sortListenerAdded = true;
    
    const sortState = {
      sortField: this.sortField,
      sortDirection: this.sortDirection
    };
    
    setupSortHeaderEventListeners(
      sortState,
      () => {
        // Update our instance variables when sort changes
        this.sortField = sortState.sortField;
        this.sortDirection = sortState.sortDirection;
        this.sortFilteredTracks();
        this.renderMusicTable();
        this.updateSortIndicators();
      },
      this.ui.logBoth.bind(this.ui)
    );
    
    // Draw initial indicators
    this.updateSortIndicators();
  }
  
  sortFilteredTracks() {
    sortFilteredLibraryTracks(
      this.filteredTracks,
      this.sortField,
      this.sortDirection,
      this.playCountByPath
    );
  }
  
  updateSortIndicators() {
    updateLibrarySortIndicators(this.sortField, this.sortDirection);
  }

  enterEditMode(cell, rowIndex) {
    const editingState = { editingCell: this.editingCell };
    
    enterInlineEditMode(
      cell,
      rowIndex,
      this.musicLibrary,
      editingState,
      this.ui.logBoth.bind(this.ui)
    );
    
    this.editingCell = editingState.editingCell;
    
    // If we entered edit mode, set up event listeners
    if (this.editingCell) {
      const input = this.editingCell.input;
      
      // Save on blur or Enter
      input.addEventListener('blur', () => {
        const valueAtBlur = input.value;
        this.ui.logBoth('info', `👁️  Blur captured: "${valueAtBlur}"`);
        setTimeout(() => this.exitEditMode(true, valueAtBlur), 10);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const valueAtEnter = e.target.value;
          this.ui.logBoth('info', `⏎  Enter captured: "${valueAtEnter}"`);
          e.preventDefault();
          this.exitEditMode(true, valueAtEnter);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.exitEditMode(false);
        }
      });
    }
  }
  
  async exitEditMode(save, capturedValue = null) {
    const editingState = { editingCell: this.editingCell };
    
    await exitInlineEditMode(
      editingState,
      this.ui.logBoth.bind(this.ui),
      save,
      capturedValue,
      this.ui.updateSongMetadata.bind(this.ui),
      this.musicLibrary
    );
    
    this.editingCell = editingState.editingCell;
  }
  
  
  async playTrackFromMenu(track) {
    await playTrackFromContextMenu(
      track,
      this.filteredTracks,
      this.getPlaybackContext.bind(this),
      this.ui.audioPlayer,
      this.ui.logBoth.bind(this.ui)
    );
  }
  
  async confirmDelete(track, index) {
    await deleteTrackFromLibrary(
      track,
      index,
      this.ui.logBoth.bind(this.ui),
      (deletedPath) => {
        // Remove from local array
        this.musicLibrary = this.musicLibrary.filter(t => t.path !== deletedPath);
        // Refresh the music library view
        this.updateMusicLibraryUI();
      }
    );
  }
  
  async loadRecentlyPlayed(limit = 50) {
    const recentTracks = await loadRecentlyPlayedTracks(
      limit,
      this.musicLibrary,
      this.ui.logBoth.bind(this.ui)
    );
    this.renderRecentlyPlayed(recentTracks);
  }
  
  renderRecentlyPlayed(tracks) {
    const tableBody = document.getElementById('recentlyPlayedTableBody');
    const countElement = document.getElementById('recentlyPlayedCount');
    
    if (!tableBody) {
      this.ui.logBoth('error', 'Recently played table body not found');
      return;
    }
    
    // Use the renderer module to generate HTML
    const result = renderRecentlyPlayedHTML(tracks, this.formatTime.bind(this));
    
    // Update count
    if (countElement) {
      countElement.textContent = `${result.count} ${result.count === 1 ? 'track' : 'tracks'}`;
    }
    
    tableBody.innerHTML = result.html;
    
    // Add event listeners for play and add to queue buttons
    this.setupRecentlyPlayedListeners(tracks);
  }
  
  setupRecentlyPlayedListeners(tracks) {
    setupRecentlyPlayedEventListeners(tracks, this.ui.audioPlayer);
  }
  
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
