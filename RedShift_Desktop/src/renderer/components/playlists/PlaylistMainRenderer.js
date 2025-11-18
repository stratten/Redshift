/**
 * PlaylistMainRenderer
 * Handles rendering of main playlist UI components
 * - Playlists list/grid
 * - Playlist details header
 * - Playlist tracks table
 */

/**
 * Render the playlists list/grid view
 * @param {Array} playlists - Array of playlist objects
 * @returns {string} HTML string for playlists list
 */
function renderPlaylistsList(playlists) {
  if (playlists.length === 0) {
    return `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <h3>No playlists yet</h3>
        <p>Create your first playlist to get started</p>
      </div>
    `;
  }
  
  const playlistsHTML = playlists.map(playlist => {
    const trackText = playlist.track_count === 1 ? 'track' : 'tracks';
    
    return `
      <div class="playlist-item" data-playlist-id="${playlist.id}">
        <div class="playlist-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        </div>
        <div class="playlist-info">
          <div class="playlist-name">${playlist.name}</div>
          <div class="playlist-details">
            ${playlist.track_count} ${trackText}
            ${playlist.description ? ` • ${playlist.description}` : ''}
          </div>
        </div>
        <div class="playlist-actions">
          <button class="action-btn play-playlist-btn" data-playlist-id="${playlist.id}" title="Play Playlist">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
          </button>
          <button class="action-btn edit-playlist-btn" data-playlist-id="${playlist.id}" title="Edit Playlist">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete-playlist-btn" data-playlist-id="${playlist.id}" title="Delete Playlist">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  return playlistsHTML;
}

/**
 * Render the playlist details header section
 * @param {Object|null} currentPlaylist - Current playlist object or null
 * @returns {string} HTML string for playlist details header
 */
function renderPlaylistDetailsHTML(currentPlaylist) {
  if (!currentPlaylist) {
    return '<p>Select a playlist to view details</p>';
  }
  
  const createdDate = new Date(currentPlaylist.created_date * 1000).toLocaleDateString();
  const trackText = currentPlaylist.track_count === 1 ? 'track' : 'tracks';
  
  return `
    <div class="playlist-header">
      <h3>${currentPlaylist.name}</h3>
      <div class="playlist-metadata">
        <p><strong>Tracks:</strong> ${currentPlaylist.track_count} ${trackText}</p>
        <p><strong>Created:</strong> ${createdDate}</p>
        ${currentPlaylist.description ? `<p><strong>Description:</strong> ${currentPlaylist.description}</p>` : ''}
      </div>
      <div class="playlist-header-actions">
        <button class="btn btn-secondary" id="addTracksBtn">Add Tracks</button>
        <button class="btn btn-primary" onclick="ui.playlistManager.playPlaylist(${currentPlaylist.id})">
          Play Playlist
        </button>
        <button class="btn btn-secondary" onclick="ui.playlistManager.exportPlaylist(${currentPlaylist.id})">
          Export M3U
        </button>
      </div>
    </div>
  `;
}

/**
 * Render a single track row for the playlist tracks table
 * @param {Object} playlistTrack - Playlist track entry
 * @param {Object|null} track - Full track object from music library (null if not found)
 * @param {Function} formatTime - Function to format duration
 * @param {Map} playCountByPath - Map of play counts by file path
 * @param {Map} favoriteByPath - Map of favorite status by file path
 * @param {Map} ratingByPath - Map of ratings by file path
 * @param {string|null} currentTrackPath - Path of currently playing track
 * @param {boolean} isPlaying - Whether audio is currently playing
 * @returns {string} HTML string for track row
 */
function renderPlaylistTrackRow(playlistTrack, track, formatTime, playCountByPath, favoriteByPath, ratingByPath, currentTrackPath, isPlaying) {
  if (!track) {
    // Fallback if track not in library
    const fileName = playlistTrack.file_path.split('/').pop().split('\\').pop();
    const trackName = fileName.replace(/\.[^/.]+$/, '');
    return `
      <tr class="music-row playlist-track-row" draggable="true" data-track-id="${playlistTrack.id}" data-position="${playlistTrack.position}">
        <td class="col-nowplaying"></td>
        <td><div class="track-name">${trackName}</div></td>
        <td><div class="artist-name">Unknown</div></td>
        <td><div class="album-name">Unknown</div></td>
        <td class="col-duration"><div class="duration">--:--</div></td>
        <td class="col-playcount"><div class="play-count">0</div></td>
        <td class="col-favorite"><div class="favorite-control">-</div></td>
        <td class="col-rating"><div class="rating-control">-</div></td>
        <td>
          <div class="track-actions">
            <button class="action-btn primary play-track-btn" data-file-path="${playlistTrack.file_path}" title="Play Track">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21"></polygon>
              </svg>
            </button>
            <button class="action-btn danger remove-from-playlist-btn" data-track-id="${playlistTrack.id}" title="Remove from Playlist">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }
  
  // Use metadata from the library
  let trackName = track.metadata?.common?.title || track.name.replace(/\.\w+$/, '');
  trackName = trackName.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
  
  const artist = track.metadata?.common?.artist || 'Unknown Artist';
  const album = track.metadata?.common?.album || 'Unknown Album';
  const duration = track.metadata?.format?.duration ? formatTime(track.metadata.format.duration) : '--:--';
  const playCount = playCountByPath.get(track.path) || 0;
  const isFav = favoriteByPath.get(track.path) === true;
  const rating = Number(ratingByPath.get(track.path) || 0);
  
  const favBtn = `
    <span class="fav-display" title="Favorite status">
      ${isFav ? `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>` : `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
          <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24z"/>
        </svg>`}
    </span>`;
  
  const ratingSelect = `
    <select class="rating-select" disabled title="Rating (view only)">
      <option value="">–</option>
      <option value="1" ${rating === 1 ? 'selected' : ''}>1</option>
      <option value="2" ${rating === 2 ? 'selected' : ''}>2</option>
      <option value="3" ${rating === 3 ? 'selected' : ''}>3</option>
      <option value="4" ${rating === 4 ? 'selected' : ''}>4</option>
      <option value="5" ${rating === 5 ? 'selected' : ''}>5</option>
    </select>`;
  
  // Check if this is the currently playing track
  const isCurrentTrack = currentTrackPath && track.path === currentTrackPath;
  const nowPlayingIcon = isCurrentTrack ? (isPlaying 
    ? '<span class="now-playing-icon playing">♫</span>' 
    : '<span class="now-playing-icon paused">❙❙</span>') 
    : '';
  
  return `
    <tr class="music-row playlist-track-row ${isCurrentTrack ? 'now-playing' : ''}" draggable="true" data-track-id="${playlistTrack.id}" data-file-path="${track.path}" data-position="${playlistTrack.position}">
      <td class="col-nowplaying">${nowPlayingIcon}</td>
      <td><div class="track-name" title="${trackName}">${trackName}</div></td>
      <td><div class="artist-name" title="${artist}">${artist}</div></td>
      <td><div class="album-name" title="${album}">${album}</div></td>
      <td class="col-duration"><div class="duration">${duration}</div></td>
      <td class="col-playcount"><div class="play-count">${playCount}</div></td>
      <td class="col-favorite"><div class="favorite-control">${favBtn}</div></td>
      <td class="col-rating"><div class="rating-control">${ratingSelect}</div></td>
      <td>
        <div class="track-actions">
          <button class="action-btn primary play-track-btn" data-file-path="${track.path}" title="Play Track">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
          </button>
          <button class="action-btn danger remove-from-playlist-btn" data-track-id="${playlistTrack.id}" title="Remove from Playlist">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

/**
 * Render the playlist tracks table
 * @param {Object|null} currentPlaylist - Current playlist object
 * @param {Array} currentPlaylistTracks - Array of tracks in current playlist
 * @param {Array} musicLibrary - Full music library array
 * @param {Function} formatTime - Function to format duration
 * @param {Map} playCountByPath - Map of play counts by file path
 * @param {Map} favoriteByPath - Map of favorite status by file path
 * @param {Map} ratingByPath - Map of ratings by file path
 * @param {string|null} currentTrackPath - Path of currently playing track
 * @param {boolean} isPlaying - Whether audio is currently playing
 * @returns {string} HTML string for tracks table
 */
function renderPlaylistTracksHTML(currentPlaylist, currentPlaylistTracks, musicLibrary, formatTime, playCountByPath, favoriteByPath, ratingByPath, currentTrackPath = null, isPlaying = false) {
  if (!currentPlaylist || currentPlaylistTracks.length === 0) {
    return `
      <div class="empty-state">
        <p>No tracks in this playlist</p>
        <p>Drag tracks from your music library to add them</p>
      </div>
    `;
  }
  
  const tracksHTML = currentPlaylistTracks.map((playlistTrack, index) => {
    // Find the full track object from the music library
    const track = musicLibrary.find(t => t.path === playlistTrack.file_path);
    return renderPlaylistTrackRow(playlistTrack, track, formatTime, playCountByPath, favoriteByPath, ratingByPath, currentTrackPath, isPlaying);
  }).join('');
  
  return `
    <table class="music-table">
      <thead>
        <tr>
          <th class="col-nowplaying"></th>
          <th class="col-track"><span>Track</span></th>
          <th class="col-artist"><span>Artist</span></th>
          <th class="col-album"><span>Album</span></th>
          <th class="col-duration"><span>Duration</span></th>
          <th class="col-playcount"><span>Plays</span></th>
          <th class="col-favorite"><span>Favorite</span></th>
          <th class="col-rating"><span>Rating</span></th>
          <th class="col-actions"><span>Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${tracksHTML}
      </tbody>
    </table>
  `;
}

