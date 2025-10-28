/**
 * ArtistListRenderer.js
 * Rendering logic for the artists list view
 */

/**
 * Render the full artist list view with controls and grid
 * @param {Object} viewState - View state object containing artists, sort settings, etc.
 * @param {Object} musicBrainzService - MusicBrainz service for cache stats
 * @returns {string} HTML string for the list view
 */
function renderArtistListView(viewState, musicBrainzService) {
  const { filteredArtists, sortBy, sortDirection, searchTerm } = viewState;
  
  // Get cache stats for display
  const cacheStats = musicBrainzService.getCacheStats();
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
            value="${escapeHtml(searchTerm)}"
            class="search-input"
          />
        </div>
        <div class="sort-controls">
          <label>Sort by:</label>
          <select id="artistSortBy" class="sort-select">
            <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Name</option>
            <option value="songCount" ${sortBy === 'songCount' ? 'selected' : ''}>Song Count</option>
            <option value="albumCount" ${sortBy === 'albumCount' ? 'selected' : ''}>Album Count</option>
          </select>
          <button id="artistSortDirection" class="btn-icon sort-direction">
            ${sortDirection === 'asc' 
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
  if (sortBy === 'name') {
    const grouped = groupArtistsByLetter(filteredArtists, sortBy);
    
    // Render each letter group
    for (const [letter, artists] of grouped) {
      html += `
        <div class="artist-letter-group">
          <div class="artist-letter-header">${letter}</div>
      `;
      
      artists.forEach(artist => {
        html += renderArtistCard(artist);
      });
      
      html += `</div>`;
    }
  } else {
    // For numeric sorting, just render all artists in order without letter grouping
    filteredArtists.forEach(artist => {
      html += renderArtistCard(artist);
    });
  }

  const totalSongs = filteredArtists.reduce((sum, a) => sum + a.songCount, 0);
  
  html += `
      </div>
      
      <div class="artists-footer">
        ${filteredArtists.length} artist${filteredArtists.length !== 1 ? 's' : ''} • 
        ${totalSongs} tracks
      </div>
    </div>
  `;

  return html;
}

/**
 * Render just the artists grid (for filtering without losing input focus)
 * @param {Object} viewState - View state object
 * @returns {string} HTML string for the grid
 */
function renderArtistGridOnly(viewState) {
  const { filteredArtists, sortBy } = viewState;
  let gridHtml = '';

  if (sortBy === 'name') {
    const grouped = groupArtistsByLetter(filteredArtists, sortBy);
    
    for (const [letter, artists] of grouped) {
      gridHtml += `
        <div class="artist-letter-group">
          <div class="artist-letter-header">${letter}</div>
      `;
      
      artists.forEach(artist => {
        gridHtml += renderArtistCard(artist);
      });
      
      gridHtml += `</div>`;
    }
  } else {
    filteredArtists.forEach(artist => {
      gridHtml += renderArtistCard(artist);
    });
  }
  
  return gridHtml;
}

/**
 * Render the footer stats
 * @param {Array} filteredArtists - Filtered array of artists
 * @returns {string} HTML string for footer
 */
function renderArtistFooter(filteredArtists) {
  const totalSongs = filteredArtists.reduce((sum, a) => sum + a.songCount, 0);
  
  return `
    ${filteredArtists.length} artist${filteredArtists.length !== 1 ? 's' : ''} • 
    ${totalSongs} tracks
  `;
}

/**
 * Group artists by first letter
 * @param {Array} artists - Array of artists
 * @param {string} sortBy - Current sort mode
 * @returns {Map} Map of letter -> artists array
 */
function groupArtistsByLetter(artists, sortBy) {
  const groups = new Map();
  
  artists.forEach(artist => {
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
    if (a[0] === '#') return sortBy === 'name' ? -1 : 0;
    if (b[0] === '#') return sortBy === 'name' ? 1 : 0;
    return a[0].localeCompare(b[0]);
  }));
}

/**
 * Render a single artist card
 * @param {Object} artist - Artist object
 * @returns {string} HTML string for artist card
 */
function renderArtistCard(artist) {
  const songText = artist.songCount === 1 ? 'song' : 'songs';
  const albumText = artist.albumCount === 1 ? 'album' : 'albums';
  
  // Prefer artist image from MusicBrainz, fall back to album art, then icon
  let artistImage;
  if (artist.artistImage) {
    artistImage = `<img src="${artist.artistImage}" alt="${escapeHtml(artist.name)}" class="artist-image" />`;
  } else if (artist.albumArt) {
    artistImage = `<img src="${artist.albumArt}" alt="${escapeHtml(artist.name)}" class="artist-image" />`;
  } else {
    artistImage = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
         <circle cx="12" cy="12" r="10"></circle>
         <circle cx="12" cy="12" r="3"></circle>
       </svg>`;
  }
  
  return `
    <div class="artist-card" data-artist-name="${escapeHtml(artist.name)}">
      <div class="artist-icon">
        ${artistImage}
      </div>
      <div class="artist-info">
        <div class="artist-name">${escapeHtml(artist.name)}</div>
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

