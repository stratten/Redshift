/**
 * ArtistDetailRenderer.js
 * Rendering logic for the artist detail view (track listings)
 */

/**
 * Render the artist detail view with track listings
 * @param {Object} artist - Artist object
 * @param {Array} displayGroups - Array of {album, tracks} objects to display
 * @param {string|null} selectedAlbum - Currently selected album name (null for all songs)
 * @param {Map} favoriteByPath - Map of path -> favorite status
 * @param {Map} ratingByPath - Map of path -> rating value
 * @param {Map} playCountByPath - Map of path -> play count
 * @param {string|null} currentTrackPath - Path of currently playing track
 * @param {boolean} isPlaying - Whether audio is currently playing
 * @returns {string} HTML string for detail view
 */
function renderArtistDetailView(artist, displayGroups, selectedAlbum, favoriteByPath = new Map(), ratingByPath = new Map(), playCountByPath = new Map(), currentTrackPath = null, isPlaying = false) {
  const totalTracks = displayGroups.reduce((sum, g) => sum + g.tracks.length, 0);
  const songText = totalTracks === 1 ? 'song' : 'songs';
  
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
    <div class="artist-detail-view">
      <div class="artist-detail-header">
        <button id="backToAlbums" class="btn-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Back to Albums
        </button>
        
        <div class="artist-detail-info">
          <div class="artist-detail-icon">
            ${artistImage}
          </div>
          <div>
            <h2 class="artist-detail-name">${escapeHtml(artist.name)}</h2>
            ${selectedAlbum 
              ? `<div class="artist-detail-album">${escapeHtml(selectedAlbum)}</div>`
              : ''}
            <div class="artist-detail-stats">
              ${totalTracks} ${songText}
            </div>
          </div>
        </div>
      </div>
      
      <div class="artist-albums">
  `;

  // Render each album group
  displayGroups.forEach(({ album, tracks }) => {
    html += renderArtistAlbumGroup(album, tracks, favoriteByPath, ratingByPath, playCountByPath, currentTrackPath, isPlaying);
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Render an album group with its tracks
 * @param {string} album - Album name
 * @param {Array} tracks - Array of track objects
 * @param {Map} favoriteByPath - Map of path -> favorite status
 * @param {Map} ratingByPath - Map of path -> rating value
 * @param {Map} playCountByPath - Map of path -> play count
 * @param {string|null} currentTrackPath - Path of currently playing track
 * @param {boolean} isPlaying - Whether audio is currently playing
 * @returns {string} HTML string for album group
 */
function renderArtistAlbumGroup(album, tracks, favoriteByPath, ratingByPath, playCountByPath, currentTrackPath, isPlaying) {
  const trackCount = tracks.length;
  const trackText = trackCount === 1 ? 'track' : 'tracks';
  
  // Get album art from first track that has it (use same approach as AlbumsView and ArtistAlbumsRenderer)
  let albumArt = null;
  for (const track of tracks) {
    if (track.metadata?.albumArt?.thumbnail) {
      albumArt = track.metadata.albumArt.thumbnail;
      break;
    }
  }
  
  const albumArtHTML = albumArt 
    ? `<img src="${albumArt}" alt="${escapeHtml(album)}" class="album-group-art" />`
    : `<div class="album-group-art-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </div>`;
  
  return `
    <div class="album-group">
      <div class="album-group-header">
        ${albumArtHTML}
        <div class="album-group-info">
          <h3 class="album-group-name">${escapeHtml(album)}</h3>
          <span class="album-group-count">${trackCount} ${trackText}</span>
        </div>
      </div>
      
      <table class="artist-tracks-table music-table">
        <thead>
          <tr>
            <th class="col-nowplaying"></th>
            <th class="track-col">Track</th>
            <th class="artist-col">Artist</th>
            <th class="album-col">Album</th>
            <th class="duration-col">Duration</th>
            <th class="col-playcount">Plays</th>
            <th class="col-favourite">Favorite</th>
            <th class="col-rating">Rating</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${tracks.map((track, index) => renderArtistTrackRow(track, index, favoriteByPath, ratingByPath, playCountByPath, currentTrackPath, isPlaying)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render a single track row
 * @param {Object} track - Track object
 * @param {number} index - Track index within this view
 * @param {Map} favoriteByPath - Map of path -> favorite status
 * @param {Map} ratingByPath - Map of path -> rating value
 * @param {Map} playCountByPath - Map of path -> play count
 * @param {string|null} currentTrackPath - Path of currently playing track
 * @param {boolean} isPlaying - Whether audio is currently playing
 * @returns {string} HTML string for track row
 */
function renderArtistTrackRow(track, index, favoriteByPath, ratingByPath, playCountByPath, currentTrackPath, isPlaying) {
  // Extract data from metadata (same way MusicLibrary does)
  const title = track.metadata?.common?.title || track.name?.replace(/\.\w+$/, '') || 'Unknown Track';
  const artist = track.metadata?.common?.artist || 'Unknown Artist';
  const album = track.metadata?.common?.album || 'Unknown Album';
  const duration = track.metadata?.format?.duration || 0;
  
  // Check if this is the currently playing track
  const isCurrentTrack = currentTrackPath && track.path === currentTrackPath;
  const nowPlayingIcon = isCurrentTrack ? (isPlaying 
    ? '<span class="now-playing-icon playing">♫</span>' 
    : '<span class="now-playing-icon paused">❙❙</span>') 
    : '';
  
  return `
    <tr class="track-row ${isCurrentTrack ? 'now-playing' : ''}" data-index="${index}" data-path="${escapeHtml(track.path)}">
      <td class="col-nowplaying">${nowPlayingIcon}</td>
      <td class="track-name">${escapeHtml(title)}</td>
      <td class="track-artist">${escapeHtml(artist)}</td>
      <td class="track-album">${escapeHtml(album)}</td>
      <td class="track-duration">${formatDuration(duration)}</td>
      ${renderTrackInteractiveColumns(index, track, favoriteByPath, ratingByPath, playCountByPath)}
    </tr>
  `;
}

