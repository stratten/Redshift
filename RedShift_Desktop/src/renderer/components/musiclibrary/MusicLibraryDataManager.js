/**
 * MusicLibraryDataManager
 * Handles data processing, filtering, sorting, and browser management
 * - Library browser (genre/artist/album columns)
 * - Filtering logic
 * - Sorting logic
 * - Utility functions
 */

/**
 * Format seconds to MM:SS time string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted time string
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Populate the three-column library browser
 * @param {Array} musicLibrary - Full music library array
 * @param {Function} logBoth - Logging function
 */
function populateLibraryBrowserColumns(musicLibrary, logBoth) {
  if (!musicLibrary || musicLibrary.length === 0) return;
  
  // Get unique genres, artists, and albums
  const genres = new Set();
  const artists = new Set();
  const albums = new Set();
  
  musicLibrary.forEach(track => {
    const genre = track.metadata?.common?.genre || 'Unknown Genre';
    const artist = track.metadata?.common?.artist || 'Unknown Artist';
    const album = track.metadata?.common?.album || 'Unknown Album';
    genres.add(genre);
    artists.add(artist);
    albums.add(album);
  });
  
  // Populate genres column
  populateBrowserColumn('genresList', genres, 'All Genres');
  
  // Populate artists column
  populateBrowserColumn('artistsList', artists, 'All Artists');
  
  // Populate albums column
  populateBrowserColumn('albumsList', albums, 'All Albums');
  
  logBoth('info', `🎵 Populated browser: ${genres.size} genres, ${artists.size} artists, ${albums.size} albums`);
}

/**
 * Populate a single browser column
 * @param {string} columnId - Column element ID
 * @param {Set} items - Set of items to display
 * @param {string} allLabel - Label for "all" option
 */
function populateBrowserColumn(columnId, items, allLabel) {
  const column = document.getElementById(columnId);
  if (!column) return;
  
  column.innerHTML = `<div class="list-item selected" data-value="">${allLabel}</div>`;
  
  [...items].sort().forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.dataset.value = item;
    div.textContent = item;
    column.appendChild(div);
  });
}

/**
 * Update column selection state
 * @param {string} columnId - Column element ID
 * @param {string} value - Selected value
 */
function updateBrowserColumnSelection(columnId, value) {
  const column = document.getElementById(columnId);
  if (!column) return;
  
  column.querySelectorAll('.list-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.value === value);
  });
}

/**
 * Update artists column based on selected genre
 * @param {Array} musicLibrary - Full music library array
 * @param {string} selectedGenre - Currently selected genre
 */
function updateArtistsForSelectedGenre(musicLibrary, selectedGenre) {
  const filteredArtists = new Set();
  
  musicLibrary.forEach(track => {
    const genre = track.metadata?.common?.genre || 'Unknown Genre';
    const artist = track.metadata?.common?.artist || 'Unknown Artist';
    
    if (!selectedGenre || genre === selectedGenre) {
      filteredArtists.add(artist);
    }
  });
  
  populateBrowserColumn('artistsList', filteredArtists, 'All Artists');
}

/**
 * Update albums column based on selected genre and artist
 * @param {Array} musicLibrary - Full music library array
 * @param {string} selectedGenre - Currently selected genre
 * @param {string} selectedArtist - Currently selected artist
 */
function updateAlbumsForSelectedArtist(musicLibrary, selectedGenre, selectedArtist) {
  const filteredAlbums = new Set();
  
  musicLibrary.forEach(track => {
    const genre = track.metadata?.common?.genre || 'Unknown Genre';
    const artist = track.metadata?.common?.artist || 'Unknown Artist';
    const album = track.metadata?.common?.album || 'Unknown Album';
    
    const genreMatch = !selectedGenre || genre === selectedGenre;
    const artistMatch = !selectedArtist || artist === selectedArtist;
    
    if (genreMatch && artistMatch) {
      filteredAlbums.add(album);
    }
  });
  
  populateBrowserColumn('albumsList', filteredAlbums, 'All Albums');
}

/**
 * Apply all filters to the music library
 * @param {Array} musicLibrary - Full music library array
 * @param {Object} browserState - Browser selection state {selectedGenre, selectedArtist, selectedAlbum}
 * @param {Map} favoriteByPath - Map of favorite status by file path
 * @param {Map} ratingByPath - Map of ratings by file path
 * @returns {Array} Filtered tracks
 */
function applyLibraryFilters(musicLibrary, browserState, favoriteByPath, ratingByPath) {
  if (!musicLibrary || musicLibrary.length === 0) return [];
  
  const globalFilter = document.getElementById('globalFilter')?.value.toLowerCase() || '';
  const trackFilter = document.querySelector('.column-filter[data-column="track"]')?.value.toLowerCase() || '';
  const artistFilter = document.querySelector('.column-filter[data-column="artist"]')?.value.toLowerCase() || '';
  const albumFilter = document.querySelector('.column-filter[data-column="album"]')?.value.toLowerCase() || '';
  const favPressed = document.getElementById('favoriteFilterBtn')?.getAttribute('aria-pressed') === 'true';
  const favFilter = favPressed ? 'yes' : '';
  const ratingFilter = parseInt(document.getElementById('ratingFilter')?.value || '', 10);
  
  const filteredTracks = musicLibrary.filter(track => {
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
    const favState = favoriteByPath.get(track.path) === true;
    const favMatch = !favFilter || (favFilter === 'yes' ? favState : !favState);
    const ratingValue = Number(ratingByPath.get(track.path) || 0);
    const ratingMatch = isNaN(ratingFilter) || ratingFilter <= 0 ? true : ratingValue === ratingFilter;
    
    // Check browser selections
    const genreBrowserMatch = !browserState.selectedGenre || genre === browserState.selectedGenre;
    const artistBrowserMatch = !browserState.selectedArtist || artist === browserState.selectedArtist;
    const albumBrowserMatch = !browserState.selectedAlbum || album === browserState.selectedAlbum;
    
    // Check global filter (OR across all fields)
    const globalMatch = !globalFilter || 
      trackName.includes(globalFilter) || 
      genre.toLowerCase().includes(globalFilter) ||
      artist.toLowerCase().includes(globalFilter) || 
      album.toLowerCase().includes(globalFilter);
    
    return trackMatch && artistMatch && albumMatch && favMatch && ratingMatch &&
      genreBrowserMatch && artistBrowserMatch && albumBrowserMatch && globalMatch;
  });
  
  return filteredTracks;
}

/**
 * Get sortable value from a track for a given field
 * @param {Object} track - Track object
 * @param {string} field - Field to sort by ('track', 'artist', 'album', 'duration', 'playcount')
 * @param {Map} playCountByPath - Map of play counts by file path
 * @returns {string|number} Sortable value
 */
function getTrackSortValue(track, field, playCountByPath) {
  if (field === 'duration') {
    return Number(track.metadata?.format?.duration || 0);
  }
  
  if (field === 'playcount') {
    // Play count is stored in the Map, not on the track object
    return Number(playCountByPath.get(track.path) || 0);
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

/**
 * Sort filtered tracks by field and direction
 * @param {Array} filteredTracks - Array of tracks to sort (modified in place)
 * @param {string} sortField - Field to sort by
 * @param {string} sortDirection - Sort direction ('asc' or 'desc')
 * @param {Map} playCountByPath - Map of play counts by file path
 */
function sortFilteredLibraryTracks(filteredTracks, sortField, sortDirection, playCountByPath) {
  const dir = sortDirection === 'asc' ? 1 : -1;
  
  filteredTracks.sort((a, b) => {
    const va = getTrackSortValue(a, sortField, playCountByPath);
    const vb = getTrackSortValue(b, sortField, playCountByPath);
    
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * dir;
  });
}

/**
 * Get header element for a sort field
 * @param {string} field - Sort field name
 * @returns {HTMLElement|null} Header element
 */
function getHeaderElementForSortField(field) {
  switch (field) {
    case 'track': return document.querySelector('th.col-track .column-header span') || document.querySelector('th.col-track');
    case 'artist': return document.querySelector('th.col-artist .column-header span') || document.querySelector('th.col-artist');
    case 'album': return document.querySelector('th.col-album .column-header span') || document.querySelector('th.col-album');
    case 'duration': return document.querySelector('th.col-duration .column-header span') || document.querySelector('th.col-duration');
    case 'playcount': return document.querySelector('th.col-playcount .column-header span') || document.querySelector('th.col-playcount');
    default: return null;
  }
}

/**
 * Update sort indicator arrows in table headers
 * @param {string} sortField - Current sort field
 * @param {string} sortDirection - Current sort direction ('asc' or 'desc')
 */
function updateLibrarySortIndicators(sortField, sortDirection) {
  // Remove existing indicators
  document.querySelectorAll('th.col-track, th.col-artist, th.col-album, th.col-duration, th.col-playcount')
    .forEach(th => {
      th.removeAttribute('aria-sort');
      const existing = th.querySelector('.sort-indicator');
      if (existing) existing.remove();
    });
  
  const host = getHeaderElementForSortField(sortField);
  if (!host) return;
  
  // Determine TH for aria-sort, but insert indicator inside the label span when available
  const th = host.closest ? (host.closest('th') || host) : host;
  th.setAttribute('aria-sort', sortDirection === 'asc' ? 'ascending' : 'descending');
  
  const indicator = document.createElement('span');
  indicator.className = 'sort-indicator';
  indicator.textContent = sortDirection === 'asc' ? '▲' : '▼';
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

/**
 * Determine playback context based on active filters/selections
 * @param {Object} browserState - Browser selection state {selectedGenre, selectedArtist, selectedAlbum}
 * @returns {string} Playback context description
 */
function determinePlaybackContext(browserState) {
  if (browserState.selectedGenre && browserState.selectedArtist && browserState.selectedAlbum) {
    return `album: ${browserState.selectedAlbum}`;
  } else if (browserState.selectedGenre && browserState.selectedArtist) {
    return `artist: ${browserState.selectedArtist}`;
  } else if (browserState.selectedGenre) {
    return `genre: ${browserState.selectedGenre}`;
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

