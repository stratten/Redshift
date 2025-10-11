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
  }
  
  setupScanProgressListener() {
    // Listen for library scan progress events
    window.electronAPI.on('library-scan-progress', (data) => {
      const progressBar = document.getElementById('scanProgressBar');
      const progressMessage = document.getElementById('scanProgressMessage');
      const progressCount = document.getElementById('scanProgressCount');
      const progressFill = document.getElementById('scanProgressFill');
      
      if (data.phase === 'metadata' && data.total > 0) {
        // Show progress bar
        progressBar.style.display = 'block';
        
        // Update message and count
        progressMessage.textContent = data.message || 'Processing files...';
        progressCount.textContent = `${data.current}/${data.total}`;
        
        // Update progress bar fill
        const percentage = (data.current / data.total) * 100;
        progressFill.style.width = `${percentage}%`;
        
      } else if (data.phase === 'complete') {
        // Hide progress bar after a brief delay
        setTimeout(() => {
          progressBar.style.display = 'none';
        }, 1000);
      }
    });
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
    this.ui.logBoth('info', '🔍 Starting music library scan...');
    
    try {
      // Use the dedicated music library scan
      const tracks = await window.electronAPI.invoke('scan-music-library');
      this.ui.logBoth('info', `🔍 Raw scan result:`, tracks ? `${tracks.length} items` : 'null/undefined');
      
      this.musicLibrary = tracks || [];
      this.ui.logBoth('success', `🔍 Stored ${this.musicLibrary.length} tracks in musicLibrary array`);
      
      // Debug: Log first few tracks
      if (this.musicLibrary.length > 0) {
        this.ui.logBoth('info', `🔍 Sample tracks:`, this.musicLibrary.slice(0, 3).map(t => t.name || t.path));
      }
      
      await this.loadSongMetadata();
      this.updateMusicLibraryUI();
    } catch (error) {
      this.ui.logBoth('error', `🔍 Music library scan failed: ${error.message}`);
    }
  }

  async loadSongMetadata() {
    try {
      const metadataRows = await this.ui.getAllSongMetadata();
      
      this.favoriteByPath.clear();
      this.ratingByPath.clear();
      this.playCountByPath.clear();
      
      if (Array.isArray(metadataRows)) {
        metadataRows.forEach(row => {
          if (!row || !row.file_path) return;
          
          if (row.is_favorite === 1) {
            this.favoriteByPath.set(row.file_path, true);
          }
          
          if (typeof row.rating === 'number' && row.rating > 0) {
            this.ratingByPath.set(row.file_path, row.rating);
          }
          
          if (typeof row.play_count === 'number') {
            this.playCountByPath.set(row.file_path, row.play_count);
          }
        });
      }
      
      this.ui.logBoth('info', `🎵 Loaded metadata: ${this.favoriteByPath.size} favorites, ${this.ratingByPath.size} ratings, ${this.playCountByPath.size} play counts`);
    } catch (err) {
      this.ui.logBoth('error', `🎵 Failed to load song metadata: ${err.message}`);
    }
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
    this.ui.logBoth('info', `🎵 renderMusicTable called with ${this.filteredTracks.length} filtered tracks`);
    
    const tableBody = document.getElementById('musicTableBody');
    if (!tableBody) {
      this.ui.logBoth('error', `🎵 musicTableBody not found in renderMusicTable!`);
      return;
    }
    
    if (this.filteredTracks.length === 0) {
      this.ui.logBoth('warning', `🎵 No filtered tracks to render`);
      tableBody.innerHTML = '<tr><td colspan="7">No tracks match current filters</td></tr>';
      return;
    }
    
    this.ui.logBoth('info', `🎵 Building HTML for ${this.filteredTracks.length} tracks...`);
    
    const tableHTML = this.filteredTracks.map((track, index) => {
      // Use metadata title first, then clean up filename
      let trackName = track.metadata?.common?.title || track.name.replace(/\.\w+$/, '');
      
      // Remove track numbers from display (patterns like "01. ", "1 - ", "01 ", etc.)
      trackName = trackName.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
      
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const album = track.metadata?.common?.album || 'Unknown Album';
      const duration = track.metadata?.format?.duration ? this.formatTime(track.metadata.format.duration) : '--:--';
      const originalIndex = this.musicLibrary.indexOf(track); // Get original index for data references
      const isFav = this.favoriteByPath.get(track.path) === true;
      const rating = Number(this.ratingByPath.get(track.path) || 0);
      const playCount = Number(this.playCountByPath.get(track.path) || 0);
      
      const favBtn = `
        <button class="action-btn fav-toggle-btn" data-index="${originalIndex}" data-fav="${isFav ? '1' : '0'}" title="Toggle favourite">
          ${isFav ? `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>` : `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
              <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24z"/>
            </svg>`}
        </button>`;

      const ratingSelect = `
        <select class="rating-select" data-index="${originalIndex}" title="Set rating">
          <option value="">–</option>
          <option value="1" ${rating === 1 ? 'selected' : ''}>1</option>
          <option value="2" ${rating === 2 ? 'selected' : ''}>2</option>
          <option value="3" ${rating === 3 ? 'selected' : ''}>3</option>
          <option value="4" ${rating === 4 ? 'selected' : ''}>4</option>
          <option value="5" ${rating === 5 ? 'selected' : ''}>5</option>
        </select>`;

      return `
        <tr class="music-row" data-index="${originalIndex}">
          <td>
            <div class="track-name" title="${trackName}">${trackName}</div>
          </td>
          <td>
            <div class="artist-name" title="${artist}">${artist}</div>
          </td>
          <td>
            <div class="album-name" title="${album}">${album}</div>
          </td>
          <td class="col-duration">
            <div class="duration">${duration}</div>
          </td>
          <td class="col-playcount">
            <div class="play-count">${playCount}</div>
          </td>
          <td class="col-favorite">
            <div class="favorite-control">${favBtn}</div>
          </td>
          <td class="col-rating">
            <div class="rating-control">${ratingSelect}</div>
          </td>
          <td>
            <div class="track-actions">
              <button class="action-btn primary play-track-btn" data-index="${originalIndex}" title="Play Track">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"></polygon>
                </svg>
              </button>
              <button class="action-btn add-to-queue-btn" data-index="${originalIndex}" title="Add to Queue">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <button class="action-btn add-to-playlist-btn" data-index="${originalIndex}" title="Add to Playlist">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="5" width="14" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    this.ui.logBoth('info', `🎵 Generated ${tableHTML.length} characters of HTML`);
    this.ui.logBoth('info', `🎵 Sample HTML (first 200 chars): ${tableHTML.substring(0, 200)}...`);
    
    tableBody.innerHTML = tableHTML;
    
    this.ui.logBoth('info', `🎵 Table HTML set. Current tableBody.children.length: ${tableBody.children.length}`);
    
    // Debug: Check if action buttons are in the DOM
    const actionButtons = tableBody.querySelectorAll('.action-btn');
    this.ui.logBoth('info', `🎵 Found ${actionButtons.length} action buttons in DOM`);
    
    const playButtons = tableBody.querySelectorAll('.play-track-btn');
    this.ui.logBoth('info', `🎵 Found ${playButtons.length} play buttons in DOM`);
    
    // Add click listeners for table actions (only once)
    if (!this.clickListenerAdded) {
      this.ui.logBoth('info', `🎯 Adding click event listeners to table`);
      this.clickListenerAdded = true;
      
      // Single click handler for inline controls and action buttons
      tableBody.addEventListener('click', async (e) => {
        this.ui.logBoth('info', `🎯 Table click detected on:`, e.target.tagName, e.target.className);
        
        // Favourite toggle
        const favBtn = e.target.closest('.fav-toggle-btn');
        if (favBtn) {
          const index = parseInt(favBtn.dataset.index);
          const track = this.musicLibrary[index];
          if (track) {
            const current = favBtn.getAttribute('data-fav') === '1';
            const next = !current;
            try {
              await this.ui.toggleFavorite(track.path, next);
              this.favoriteByPath.set(track.path, next);
              favBtn.setAttribute('data-fav', next ? '1' : '0');
              favBtn.innerHTML = next ? `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>` : `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                  <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24z"/>
                </svg>`;
            } catch (err) {
              this.ui.logBoth('error', `Failed to toggle favourite: ${err.message}`);
            }
          }
          return;
        }

        // Rating handled via dedicated input/change listeners below
        
        const button = e.target.closest('.play-track-btn, .add-to-queue-btn, .add-to-playlist-btn');
        if (!button) {
          this.ui.logBoth('info', `🎯 Click was not on an action button`);
          return;
        }
        
        this.ui.logBoth('info', `🎯 Action button clicked:`, button.className);
      
      const index = parseInt(button.dataset.index);
      const track = this.musicLibrary[index];
      
        if (button.classList.contains('play-track-btn')) {
          this.ui.logBoth('info', `🎵 Playing track: ${track.name}`);
          
          try {
            // Determine current context and set playback context
            const currentTrackIndex = this.filteredTracks.findIndex(t => t.path === track.path);
            this.ui.logBoth('info', `🎵 Found track at filtered index: ${currentTrackIndex}`);
            
            const context = this.getPlaybackContext();
            this.ui.logBoth('info', `🎵 Got playback context: ${context}`);
            
            this.ui.logBoth('info', `🎵 Setting playback context: ${context} with ${this.filteredTracks.length} tracks`);
            this.ui.audioPlayer.setPlaybackContext(context, this.filteredTracks, currentTrackIndex);
            
            // Use the enhanced playTrack method
            await this.ui.audioPlayer.playTrack(track.path, track);
            
            this.ui.logBoth('info', `🎵 Track loaded and playing: ${track.name}`);
          } catch (error) {
            this.ui.logBoth('error', `🎵 Error playing track: ${error.message}`);
            this.ui.logBoth('error', `🎵 Error stack: ${error.stack}`);
          }
        } else if (button.classList.contains('add-to-queue-btn')) {
        this.ui.logBoth('info', `🎵 Add to queue clicked: ${track.name}`);
        
        // TODO: Implement queue functionality
        this.ui.logBoth('info', `🎵 Added "${track.name}" to queue (queue not implemented yet)`);
      } else if (button.classList.contains('add-to-playlist-btn')) {
        // Show inline playlist picker near the button
        try {
          await this.showPlaylistPicker(button, track.path, track.name);
        } catch (err) {
          this.ui.logBoth('error', `🎵 Failed to open playlist picker: ${err.message}`);
        }
      }
    });

      // Dedicated rating change handler (fires immediately on selection)
      const handleRatingSelect = async (e) => {
        const select = e.target && e.target.closest ? e.target.closest('.rating-select') : null;
        if (!select) return;
        // Deduplicate if both input and change fire
        const newVal = select.value;
        if (select.dataset._lastValue === newVal) return;
        select.dataset._lastValue = newVal;
        const index = parseInt(select.getAttribute('data-index'));
        const rating = parseInt(newVal) || 0;
        const track = this.musicLibrary[index];
        if (!track) return;
        try {
          await this.ui.setRating(track.path, rating);
          this.ratingByPath.set(track.path, rating);
        } catch (err) {
          this.ui.logBoth('error', `Failed to set rating: ${err.message}`);
        }
      };

      tableBody.addEventListener('input', handleRatingSelect);
      tableBody.addEventListener('change', handleRatingSelect);
    
        // Row selection and inline editing
        tableBody.addEventListener('click', (e) => {
          // Ignore clicks when editing - let the input handle them
          if (this.editingCell) return;
          
          const row = e.target.closest('.music-row');
          if (!row) return;
          
          const rowIndex = parseInt(row.dataset.index);
          const currentTime = Date.now();
          const timeSinceLastClick = currentTime - this.lastClickTime;
          
          // Check if click is on an editable cell
          const editableCell = e.target.closest('.track-name, .artist-name, .album-name');
          
          // If clicking on already selected row's editable cell after delay, enter edit mode
          if (editableCell && this.selectedRowIndex === rowIndex && timeSinceLastClick > 500) {
            this.enterEditMode(editableCell, rowIndex);
            return;
          }
          
          // Update selection
          document.querySelectorAll('.music-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          this.selectedRowIndex = rowIndex;
          this.lastClickTime = currentTime;
          this.lastClickedCell = editableCell;
        });
    
        // Double-click handler for playing tracks directly
        tableBody.addEventListener('dblclick', async (e) => {
          // Ignore if we're editing
          if (this.editingCell) return;
          
          this.ui.logBoth('info', `🎯 Table double-click detected on:`, e.target.tagName, e.target.className);
          
          // Find the row that was double-clicked
          const row = e.target.closest('.music-row');
          if (!row) {
            this.ui.logBoth('warning', `🎯 Double-click was not on a music row`);
            return;
          }
          
          const index = parseInt(row.dataset.index);
          const track = this.musicLibrary[index];
          
          if (!track) {
            this.ui.logBoth('error', `🎯 No track found at index ${index}`);
            return;
          }
          
          this.ui.logBoth('info', `🎯 Double-click playing track: ${track.name}`);
          
          try {
            // Determine current context and set playback context  
            const currentTrackIndex = this.filteredTracks.findIndex(t => t.path === track.path);
            this.ui.logBoth('info', `🎯 Found track at filtered index: ${currentTrackIndex}`);
            
            const context = this.getPlaybackContext();
            this.ui.logBoth('info', `🎯 Got playback context: ${context}`);
            
            this.ui.logBoth('info', `🎯 Setting playback context: ${context} with ${this.filteredTracks.length} tracks`);
            this.ui.audioPlayer.setPlaybackContext(context, this.filteredTracks, currentTrackIndex);
            
            // Use the enhanced playTrack method
            await this.ui.audioPlayer.playTrack(track.path, track);
            
            this.ui.logBoth('success', `🎯 Double-click track loaded and playing: ${track.name}`);
          } catch (error) {
            this.ui.logBoth('error', `🎯 Error playing track via double-click: ${error.message}`);
            this.ui.logBoth('error', `🎯 Error stack: ${error.stack}`);
          }
        });
        
        // Context menu handler
        tableBody.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const row = e.target.closest('.music-row');
          if (!row) return;
          
          const index = parseInt(row.dataset.index);
          const track = this.musicLibrary[index];
          if (!track) return;
          
          this.showContextMenu(e.clientX, e.clientY, track, index);
        });
    
    } else {
      this.ui.logBoth('info', `🎯 Click listeners already exist, skipping`);
    }
  }
  
  setupMusicTableFilters() {
    this.ui.logBoth('info', '🎵 Setting up music table filters');
    try {
      // Global filter
      const globalFilter = document.getElementById('globalFilter');
      if (globalFilter) globalFilter.addEventListener('input', () => this.applyFilters());

      // Text column filters
      const columnFilters = document.querySelectorAll('.column-filter');
      if (columnFilters && columnFilters.length) {
        columnFilters.forEach(filter => {
          filter.addEventListener('input', () => this.applyFilters());
        });
      }

      // Favorite star filter
      const favBtn = document.getElementById('favoriteFilterBtn');
      if (favBtn) {
        favBtn.addEventListener('click', () => {
          const pressed = favBtn.getAttribute('aria-pressed') === 'true';
          favBtn.setAttribute('aria-pressed', pressed ? 'false' : 'true');
          this.applyFilters();
        });
      }

      // Rating dropdown filter
      const ratingSelect = document.getElementById('ratingFilter');
      if (ratingSelect) ratingSelect.addEventListener('change', () => this.applyFilters());
    } catch (err) {
      this.ui.logBoth('warning', `🎵 Filter setup partial failure: ${err.message}`);
    }

    // Three-column browser
    this.setupLibraryBrowser();
    
    this.ui.logBoth('info', '🎵 Music table filters setup complete');
    
    // Ensure initial sort indicators reflect default state
    this.updateSortIndicators();
  }
  
  setupLibraryBrowser() {
    // Initialize browser state
    this.selectedGenre = '';
    this.selectedArtist = '';
    this.selectedAlbum = '';
    
    // Setup click listeners for each column
    document.getElementById('genresList').addEventListener('click', (e) => {
      if (e.target.classList.contains('list-item')) {
        this.selectGenre(e.target.dataset.value);
      }
    });
    
    document.getElementById('artistsList').addEventListener('click', (e) => {
      if (e.target.classList.contains('list-item')) {
        this.selectArtist(e.target.dataset.value);
      }
    });
    
    document.getElementById('albumsList').addEventListener('click', (e) => {
      if (e.target.classList.contains('list-item')) {
        this.selectAlbum(e.target.dataset.value);
      }
    });
  }
  
  populateLibraryBrowser() {
    if (!this.musicLibrary || this.musicLibrary.length === 0) return;
    
    // Get unique genres, artists, and albums
    const genres = new Set();
    const artists = new Set();
    const albums = new Set();
    
    this.musicLibrary.forEach(track => {
      const genre = track.metadata?.common?.genre || 'Unknown Genre';
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const album = track.metadata?.common?.album || 'Unknown Album';
      genres.add(genre);
      artists.add(artist);
      albums.add(album);
    });
    
    // Populate genres column
    this.populateColumn('genresList', genres, 'All Genres');
    
    // Populate artists column
    this.populateColumn('artistsList', artists, 'All Artists');
    
    // Populate albums column
    this.populateColumn('albumsList', albums, 'All Albums');
    
    this.ui.logBoth('info', `🎵 Populated browser: ${genres.size} genres, ${artists.size} artists, ${albums.size} albums`);
  }
  
  populateColumn(columnId, items, allLabel) {
    const column = document.getElementById(columnId);
    column.innerHTML = `<div class="list-item selected" data-value="">${allLabel}</div>`;
    
    [...items].sort().forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.dataset.value = item;
      div.textContent = item;
      column.appendChild(div);
    });
  }
  
  selectGenre(genre) {
    this.selectedGenre = genre;
    this.updateColumnSelection('genresList', genre);
    this.updateArtistsForGenre();
    this.applyFilters();
  }
  
  selectArtist(artist) {
    this.selectedArtist = artist;
    this.updateColumnSelection('artistsList', artist);
    this.updateAlbumsForArtist();
    this.applyFilters();
  }
  
  selectAlbum(album) {
    this.selectedAlbum = album;
    this.updateColumnSelection('albumsList', album);
    this.applyFilters();
  }
  
  updateColumnSelection(columnId, value) {
    const column = document.getElementById(columnId);
    column.querySelectorAll('.list-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.value === value);
    });
  }
  
  updateArtistsForGenre() {
    // Filter artists based on selected genre
    const filteredArtists = new Set();
    
    this.musicLibrary.forEach(track => {
      const genre = track.metadata?.common?.genre || 'Unknown Genre';
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      
      if (!this.selectedGenre || genre === this.selectedGenre) {
        filteredArtists.add(artist);
      }
    });
    
    this.populateColumn('artistsList', filteredArtists, 'All Artists');
    this.selectedArtist = ''; // Reset artist selection
    this.updateAlbumsForArtist();
  }
  
  updateAlbumsForArtist() {
    // Filter albums based on selected genre and artist
    const filteredAlbums = new Set();
    
    this.musicLibrary.forEach(track => {
      const genre = track.metadata?.common?.genre || 'Unknown Genre';
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const album = track.metadata?.common?.album || 'Unknown Album';
      
      const genreMatch = !this.selectedGenre || genre === this.selectedGenre;
      const artistMatch = !this.selectedArtist || artist === this.selectedArtist;
      
      if (genreMatch && artistMatch) {
        filteredAlbums.add(album);
      }
    });
    
    this.populateColumn('albumsList', filteredAlbums, 'All Albums');
    this.selectedAlbum = ''; // Reset album selection
  }
  
  applyFilters() {
    if (!this.musicLibrary || this.musicLibrary.length === 0) return;
    
    const globalFilter = document.getElementById('globalFilter').value.toLowerCase();
    const trackFilter = document.querySelector('.column-filter[data-column="track"]').value.toLowerCase();
    const artistFilter = document.querySelector('.column-filter[data-column="artist"]').value.toLowerCase();
    const albumFilter = document.querySelector('.column-filter[data-column="album"]').value.toLowerCase();
    const favPressed = document.getElementById('favoriteFilterBtn')?.getAttribute('aria-pressed') === 'true';
    const favFilter = favPressed ? 'yes' : '';
    const ratingFilter = parseInt(document.getElementById('ratingFilter')?.value || '', 10);
    
    this.filteredTracks = this.musicLibrary.filter(track => {
      // Use metadata title first, then clean up filename
      let trackName = track.metadata?.common?.title || track.name.replace(/\.\w+$/, '');
      trackName = trackName.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '').toLowerCase(); // Remove track numbers
      
      const genre = track.metadata?.common?.genre || 'Unknown Genre';
      const artist = track.metadata?.common?.artist || 'Unknown Artist';
      const album = track.metadata?.common?.album || 'Unknown Album';
      
      // Check column-specific filters
      const trackMatch = !trackFilter || trackName.includes(trackFilter);
      const artistMatch = !artistFilter || artist.toLowerCase().includes(artistFilter);
      const albumMatch = !albumFilter || album.toLowerCase().includes(albumFilter);
      // Favorite/rating filters (use our cached maps if available)
      const favState = this.favoriteByPath.get(track.path) === true;
      const favMatch = !favFilter || (favFilter === 'yes' ? favState : !favState);
      const ratingValue = Number(this.ratingByPath.get(track.path) || 0);
      const ratingMatch = isNaN(ratingFilter) || ratingFilter <= 0 ? true : ratingValue === ratingFilter;
      
      // Check browser selections
      const genreBrowserMatch = !this.selectedGenre || genre === this.selectedGenre;
      const artistBrowserMatch = !this.selectedArtist || artist === this.selectedArtist;
      const albumBrowserMatch = !this.selectedAlbum || album === this.selectedAlbum;
      
      // Check global filter (OR across all fields)
      const globalMatch = !globalFilter || 
        trackName.includes(globalFilter) || 
        genre.toLowerCase().includes(globalFilter) ||
        artist.toLowerCase().includes(globalFilter) || 
        album.toLowerCase().includes(globalFilter);
      
      return trackMatch && artistMatch && albumMatch && favMatch && ratingMatch &&
        genreBrowserMatch && artistBrowserMatch && albumBrowserMatch && globalMatch;
    });
    
    // Update track count
    document.getElementById('trackCount').textContent = 
      `${this.filteredTracks.length} of ${this.musicLibrary.length} track${this.musicLibrary.length !== 1 ? 's' : ''}`;
    
    // Apply current sort to filtered results
    this.sortFilteredTracks();
    
    this.renderMusicTable();
  }
  
  formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async showPlaylistPicker(anchorEl, filePath, displayName) {
    // Remove existing picker if any
    const existing = document.getElementById('playlistPicker');
    if (existing) existing.remove();
    
    // Fetch playlists
    let playlists = [];
    try {
      playlists = await window.electronAPI.invoke('playlist-get-all');
    } catch (err) {
      this.ui.logBoth('error', `Failed to load playlists: ${err.message}`);
    }
    
    // Determine which playlists already contain this track (best-effort)
    const containsById = new Map();
    try {
      if (playlists && playlists.length) {
        const checks = await Promise.all(playlists.map(async (pl) => {
          try {
            const tracks = await window.electronAPI.invoke('playlist-get-tracks', pl.id);
            const exists = Array.isArray(tracks) && tracks.some(t => t.file_path === filePath);
            return { id: pl.id, exists };
          } catch (_) {
            return { id: pl.id, exists: false };
          }
        }));
        checks.forEach(c => containsById.set(c.id, c.exists));
      }
    } catch (err) {
      // Non-fatal; continue without indicators
      this.ui.logBoth('warning', `Playlist contains check failed: ${err.message}`);
    }
    
    // Build picker
    const picker = document.createElement('div');
    picker.id = 'playlistPicker';
    picker.style.position = 'fixed';
    picker.style.zIndex = '1100';
    picker.style.background = '#ffffff';
    picker.style.border = '1px solid #e2e8f0';
    picker.style.borderRadius = '8px';
    picker.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
    picker.style.minWidth = '240px';
    picker.style.maxHeight = '280px';
    picker.style.overflowY = 'auto';
    picker.style.padding = '6px';
    
    const header = document.createElement('div');
    header.textContent = 'Add to playlist';
    header.style.fontSize = '12px';
    header.style.fontWeight = '600';
    header.style.color = '#374151';
    header.style.margin = '6px 6px 8px 6px';
    picker.appendChild(header);
    
    // Create button helper
    const makeItem = (label, onClick, opts = {}) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.textAlign = 'left';
      btn.style.padding = '8px 10px';
      btn.style.paddingRight = '28px'; // reserve space for right-side indicator
      btn.style.fontSize = '13px';
      btn.style.border = 'none';
      btn.style.background = 'transparent';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.style.position = 'relative';
      btn.addEventListener('mouseover', () => btn.style.background = '#f3f4f6');
      btn.addEventListener('mouseout', () => btn.style.background = 'transparent');
      btn.addEventListener('click', onClick);
      if (opts.already) {
        // Right-aligned checkbox indicator that does not shift the label
        const indicator = document.createElement('span');
        indicator.setAttribute('aria-label', 'Already in this playlist');
        indicator.title = 'Already in this playlist';
        indicator.style.position = 'absolute';
        indicator.style.right = '8px';
        indicator.style.top = '50%';
        indicator.style.transform = 'translateY(-50%)';
        indicator.style.display = 'inline-flex';
        indicator.style.alignItems = 'center';
        indicator.style.justifyContent = 'center';
        indicator.style.width = '16px';
        indicator.style.height = '16px';
        indicator.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#22c55e" stroke-width="2">
            <rect x="2" y="2" width="16" height="16" rx="3" ry="3" stroke="#22c55e" fill="none"></rect>
            <path d="M6 10l3 3 5-6" stroke="#22c55e" fill="none"></path>
          </svg>`;
        btn.appendChild(indicator);
      }
      return btn;
    };
    
    if (playlists && playlists.length) {
      playlists.forEach(pl => {
        const already = containsById.get(pl.id) === true;
        picker.appendChild(makeItem(pl.name, async () => {
          try {
            await window.electronAPI.invoke('playlist-add-tracks', pl.id, [filePath]);
            this.ui.logBoth('success', `Added to playlist: ${pl.name}`);
          } catch (err) {
            this.ui.logBoth('error', `Failed to add to playlist: ${err.message}`);
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
    
    picker.appendChild(makeItem('Create new playlist…', async () => {
      try {
        const name = prompt('New playlist name:');
        if (name && name.trim()) {
          const created = await window.electronAPI.invoke('playlist-create', name.trim(), '');
          await window.electronAPI.invoke('playlist-add-tracks', created.id, [filePath]);
          this.ui.logBoth('success', `Created playlist and added: ${name.trim()}`);
        }
      } catch (err) {
        this.ui.logBoth('error', `Failed to create/add: ${err.message}`);
      } finally {
        picker.remove();
      }
    }));
    
    document.body.appendChild(picker);
    
    // Position near anchor button with viewport clamping
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
    if (top + height + padding > vh) {
      // place above the anchor if bottom overflows
      top = Math.max(padding, Math.round(rect.top - height - 6));
    }
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
    
    // Close on outside click or escape
    const onDocClick = (ev) => {
      if (!picker.contains(ev.target)) {
        picker.remove();
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
      }
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        picker.remove();
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKey);
    }, 0);
  }
  // Determine the current playback context based on active filters
  getPlaybackContext() {
    if (this.selectedGenre && this.selectedArtist && this.selectedAlbum) {
      return `album: ${this.selectedAlbum}`;
    } else if (this.selectedGenre && this.selectedArtist) {
      return `artist: ${this.selectedArtist}`;
    } else if (this.selectedGenre) {
      return `genre: ${this.selectedGenre}`;
    } else {
      // Use the main global filter input present in the UI
      const globalSearchEl = document.getElementById('globalFilter');
      if (globalSearchEl) {
        const globalSearch = globalSearchEl.value.trim();
        if (globalSearch) {
          return `search: ${globalSearch}`;
        }
      }
      return 'library: all tracks';
    }
  }
  
  // Sorting helpers
  setupSortHandlers() {
    if (this.sortListenerAdded) return;
    this.sortListenerAdded = true;
    
    // Bind sorting strictly to the label spans (and the indicator inside them),
    // not the whole TH, so clicks on filter inputs do not toggle sorting
    const headerTrack = document.querySelector('th.col-track .column-header span');
    const headerArtist = document.querySelector('th.col-artist .column-header span');
    const headerAlbum = document.querySelector('th.col-album .column-header span');
    let headerDuration = document.querySelector('th.col-duration span');
    if (!headerDuration) {
      // Wrap the plain text in a span so we can prepend the indicator and attach listeners
      const th = document.querySelector('th.col-duration');
      if (th) {
        const text = th.textContent.trim() || 'Duration';
        th.textContent = '';
        const span = document.createElement('span');
        span.textContent = text;
        th.appendChild(span);
        headerDuration = span;
      }
    }
    
    const attach = (el, field) => {
      if (!el) return;
      el.style.cursor = 'pointer';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      const triggerSort = () => {
        // Toggle direction if same field, otherwise default to asc
        if (this.sortField === field) {
          this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortField = field;
          this.sortDirection = 'asc';
        }
        this.ui.logBoth('info', `🎵 Sorting by ${this.sortField} (${this.sortDirection})`);
        this.sortFilteredTracks();
        this.renderMusicTable();
        this.updateSortIndicators();
      };
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerSort();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerSort();
        }
      });
    };
    
    attach(headerTrack, 'track');
    attach(headerArtist, 'artist');
    attach(headerAlbum, 'album');
    attach(headerDuration, 'duration');
    
    // Draw initial indicators
    this.updateSortIndicators();
  }
  
  getSortValue(track, field) {
    if (field === 'duration') {
      return Number(track.metadata?.format?.duration || 0);
    }
    
    // Derive display names similar to render logic
    if (field === 'track') {
      let name = track.metadata?.common?.title || track.name || '';
      name = name.replace(/\.[^/.]+$/, ''); // strip extension
      name = name.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, ''); // drop track numbers
      return name.toLowerCase();
    }
    if (field === 'artist') {
      return (track.metadata?.common?.artist || 'Unknown Artist').toLowerCase();
    }
    if (field === 'album') {
      return (track.metadata?.common?.album || 'Unknown Album').toLowerCase();
    }
    return '';
  }
  
  sortFilteredTracks() {
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const field = this.sortField;
    
    this.filteredTracks.sort((a, b) => {
      const va = this.getSortValue(a, field);
      const vb = this.getSortValue(b, field);
      
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * dir;
    });
  }

  getHeaderElementByField(field) {
    // Prefer the inner label span so we can prepend the indicator LEFT of the text,
    // keeping the input below due to column flex layout.
    switch (field) {
      case 'track': return document.querySelector('th.col-track .column-header span') || document.querySelector('th.col-track');
      case 'artist': return document.querySelector('th.col-artist .column-header span') || document.querySelector('th.col-artist');
      case 'album': return document.querySelector('th.col-album .column-header span') || document.querySelector('th.col-album');
      case 'duration': return document.querySelector('th.col-duration');
      default: return null;
    }
  }
  
  updateSortIndicators() {
    // Remove existing indicators
    document.querySelectorAll('th.col-track, th.col-artist, th.col-album, th.col-duration')
      .forEach(th => {
        th.removeAttribute('aria-sort');
        const existing = th.querySelector('.sort-indicator');
        if (existing) existing.remove();
      });
    
    const field = this.sortField;
    const dir = this.sortDirection;
    const host = this.getHeaderElementByField(field);
    if (!host) return;
    
    // Determine TH for aria-sort, but insert indicator inside the label span when available
    const th = host.closest ? (host.closest('th') || host) : host;
    th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
    
    const indicator = document.createElement('span');
    indicator.className = 'sort-indicator';
    indicator.textContent = dir === 'asc' ? '▲' : '▼';
    indicator.style.marginRight = '6px';
    indicator.style.fontSize = '10px';
    indicator.style.color = '#6b7280';
    indicator.style.userSelect = 'none';
    
    // If the header has a span label, prepend inside the span so it sits LEFT of the text
    if (host && host !== th) {
      host.prepend(indicator);
    } else {
      th.insertBefore(indicator, th.firstChild);
    }
  }

  enterEditMode(cell, rowIndex) {
    if (this.editingCell) this.exitEditMode(false);
    
    const track = this.musicLibrary[rowIndex];
    if (!track) return;
    
    const fieldType = cell.classList.contains('track-name') ? 'title' :
                     cell.classList.contains('artist-name') ? 'artist' : 'album';
    
    const currentValue = cell.textContent;
    
    // Replace cell content with input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'inline-edit-input';
    input.style.cssText = 'width: 100%; padding: 2px 4px; border: 1px solid #5a67d8; border-radius: 2px; font-size: 11px;';
    
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    
    this.editingCell = { cell, input, fieldType, rowIndex, originalValue: currentValue };
    
    // Save on blur or Enter
    input.addEventListener('blur', () => this.exitEditMode(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.exitEditMode(true);
      } else if (e.key === 'Escape') {
        this.exitEditMode(false);
      }
    });
  }
  
  async exitEditMode(save) {
    if (!this.editingCell) return;
    
    const { cell, input, fieldType, rowIndex, originalValue } = this.editingCell;
    const newValue = input.value.trim();
    
    // Restore display
    cell.textContent = save && newValue ? newValue : originalValue;
    
    // Save to backend if changed
    if (save && newValue && newValue !== originalValue) {
      const track = this.musicLibrary[rowIndex];
      if (track) {
        try {
          await this.ui.updateSongMetadata(track.path, fieldType, newValue);
          // Update local data
          if (fieldType === 'title') {
            track.metadata.common.title = newValue;
          } else if (fieldType === 'artist') {
            track.metadata.common.artist = newValue;
          } else if (fieldType === 'album') {
            track.metadata.common.album = newValue;
          }
          this.ui.logBoth('success', `Updated ${fieldType} to: ${newValue}`);
        } catch (err) {
          this.ui.logBoth('error', `Failed to update ${fieldType}: ${err.message}`);
          cell.textContent = originalValue; // Revert on error
        }
      }
    }
    
    this.editingCell = null;
  }
  
  showContextMenu(x, y, track, index) {
    // Remove any existing context menu
    const existing = document.getElementById('trackContextMenu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.id = 'trackContextMenu';
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 4px 0;
      min-width: 180px;
      z-index: 10000;
      font-size: 13px;
    `;
    
    const menuItems = [
      { label: 'Get Info', action: () => this.ui.getFileInfo(track.path) },
      { label: 'Show in Finder', action: () => this.ui.showInFinder(track.path) },
      { separator: true },
      { label: 'Add to Playlist', action: () => this.showPlaylistPicker(null, track.path, track.name) },
      { separator: true },
      { label: 'Delete from Library', action: () => this.confirmDelete(track, index), danger: true }
    ];
    
    menuItems.forEach(item => {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height: 1px; background: #e5e7eb; margin: 4px 0;';
        menu.appendChild(sep);
      } else {
        const menuItem = document.createElement('div');
        menuItem.textContent = item.label;
        menuItem.style.cssText = `
          padding: 6px 12px;
          cursor: pointer;
          color: ${item.danger ? '#ef4444' : '#374151'};
        `;
        menuItem.addEventListener('mouseenter', () => {
          menuItem.style.background = item.danger ? '#fee2e2' : '#f3f4f6';
        });
        menuItem.addEventListener('mouseleave', () => {
          menuItem.style.background = 'transparent';
        });
        menuItem.addEventListener('click', () => {
          item.action();
          menu.remove();
        });
        menu.appendChild(menuItem);
      }
    });
    
    document.body.appendChild(menu);
    
    // Close on click outside
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }
  
  confirmDelete(track, index) {
    if (confirm(`Delete "${track.name}" from library?\n\nThis will remove the file from your music library.`)) {
      this.ui.logBoth('info', `Delete: ${track.name}`);
      // TODO: Implement delete functionality
    }
  }
}
