/**
 * ArtistAlbumsRenderer.js
 * Rendering logic for the artist album selection view
 */

/**
 * Render the album selection view
 * @param {Object} artist - Artist object with tracks
 * @param {Array} albumGroups - Array of {album, tracks} objects
 * @returns {string} HTML string for album selection view
 */
function renderArtistAlbumsView(artist, albumGroups) {
  const songText = artist.songCount === 1 ? 'song' : 'songs';
  const albumText = artist.albumCount === 1 ? 'album' : 'albums';
  
  // Prefer artist image from MusicBrainz, fall back to album art, then icon
  let artistImage;
  if (artist.artistImage) {
    artistImage = `<img src="${artist.artistImage}" alt="${escapeHtml(artist.name)}" class="artist-image" />`;
  } else if (artist.albumArt) {
    artistImage = `<img src="${artist.albumArt}" alt="${escapeHtml(artist.name)}" class="artist-image" />`;
  } else {
    artistImage = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
         <circle cx="12" cy="12" r="10"></circle>
         <circle cx="12" cy="12" r="3"></circle>
       </svg>`;
  }

  let html = `
    <div class="artist-albums-view">
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
            <h2 class="artist-detail-name">${escapeHtml(artist.name)}</h2>
            <div class="artist-detail-stats">
              ${artist.songCount} ${songText} • ${artist.albumCount} ${albumText}
            </div>
          </div>
        </div>
      </div>
      
      <div class="albums-grid">
        ${renderAllSongsCard(artist.songCount)}
        ${albumGroups.map(({ album, tracks }) => renderAlbumCard(album, tracks)).join('')}
      </div>
    </div>
  `;

  return html;
}

/**
 * Render the "All Songs" special card
 * @param {number} songCount - Total number of songs
 * @returns {string} HTML string for all songs card
 */
function renderAllSongsCard(songCount) {
  const songText = songCount === 1 ? 'song' : 'songs';
  
  return `
    <div class="album-card all-songs-card" data-album-name="__ALL_SONGS__">
      <div class="album-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
      </div>
      <div class="album-info">
        <div class="album-name">All Songs</div>
        <div class="album-track-count">${songCount} ${songText}</div>
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
 * Render an album card
 * @param {string} albumName - Album name
 * @param {Array} tracks - Array of tracks in the album
 * @returns {string} HTML string for album card
 */
function renderAlbumCard(albumName, tracks) {
  const trackCount = tracks.length;
  const trackText = trackCount === 1 ? 'track' : 'tracks';
  
  // Get album art from first track that has it (use same approach as AlbumsView)
  let albumArt = null;
  for (const track of tracks) {
    if (track.metadata?.albumArt?.thumbnail) {
      albumArt = track.metadata.albumArt.thumbnail;
      break;
    }
  }
  
  const albumIcon = albumArt 
    ? `<img src="${albumArt}" alt="${escapeHtml(albumName)}" class="album-image" />`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
         <circle cx="12" cy="12" r="10"></circle>
         <circle cx="12" cy="12" r="3"></circle>
       </svg>`;
  
  return `
    <div class="album-card" data-album-name="${escapeHtml(albumName)}">
      <div class="album-icon">
        ${albumIcon}
      </div>
      <div class="album-info">
        <div class="album-name">${escapeHtml(albumName)}</div>
        <div class="album-track-count">${trackCount} ${trackText}</div>
      </div>
      <div class="album-arrow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </div>
  `;
}

