/**
 * MusicLibraryRenderer
 * Handles all HTML rendering for the Music Library view
 * - Main music table rendering
 * - Recently played view
 * - Context menus
 * - Playlist picker modal
 */

/**
 * Render the main music table with filtered tracks
 * @param {Array} filteredTracks - Array of filtered track objects
 * @param {Array} musicLibrary - Full music library array (for original indices)
 * @param {Map} favoriteByPath - Map of favorite status by file path
 * @param {Map} ratingByPath - Map of ratings by file path
 * @param {Map} playCountByPath - Map of play counts by file path
 * @param {Function} formatTime - Function to format duration
 * @param {Function} logBoth - Logging function
 * @param {string|null} currentTrackPath - Path of currently playing track (optional)
 * @param {boolean} isPlaying - Whether audio is currently playing (optional)
 * @returns {Object} - Object with tableHTML and metadata
 */
function renderMusicTableHTML(filteredTracks, musicLibrary, favoriteByPath, ratingByPath, playCountByPath, formatTime, logBoth, currentTrackPath = null, isPlaying = false) {
  logBoth('info', `🎵 renderMusicTable called with ${filteredTracks.length} filtered tracks`);
  
  if (filteredTracks.length === 0) {
    logBoth('warning', `🎵 No filtered tracks to render`);
    return {
      tableHTML: '<tr><td colspan="7">No tracks match current filters</td></tr>',
      rowCount: 0
    };
  }
  
  logBoth('info', `🎵 Building HTML for ${filteredTracks.length} tracks...`);
  
  const tableHTML = filteredTracks.map((track, index) => {
    // Use metadata title first, then clean up filename
    let trackName = track.metadata?.common?.title || track.name.replace(/\.\w+$/, '');
    
    // Remove track numbers from display (patterns like "01. ", "1 - ", "01 ", etc.)
    trackName = trackName.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
    
    const artist = track.metadata?.common?.artist || 'Unknown Artist';
    const album = track.metadata?.common?.album || 'Unknown Album';
    const duration = track.metadata?.format?.duration ? formatTime(track.metadata.format.duration) : '--:--';
    const originalIndex = musicLibrary.indexOf(track); // Get original index for data references
    
    // Check if this is the currently playing track
    const isCurrentTrack = currentTrackPath && track.path === currentTrackPath;
    const nowPlayingIcon = isCurrentTrack ? (isPlaying 
      ? '<span class="now-playing-icon playing">♫</span>' 
      : '<span class="now-playing-icon paused">❙❙</span>') 
      : '';

    return `
      <tr class="music-row ${isCurrentTrack ? 'now-playing' : ''}" data-index="${originalIndex}">
        <td class="col-nowplaying">${nowPlayingIcon}</td>
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
        ${renderTrackInteractiveColumns(originalIndex, track, favoriteByPath, ratingByPath, playCountByPath)}
      </tr>
    `;
  }).join('');
  
  logBoth('info', `🎵 Generated ${tableHTML.length} characters of HTML`);
  
  return {
    tableHTML,
    rowCount: filteredTracks.length
  };
}

/**
 * Render the recently played tracks view
 * @param {Array} tracks - Array of recently played track objects
 * @param {Function} formatTime - Function to format duration
 * @returns {Object} - Object with HTML and count
 */
function renderRecentlyPlayedHTML(tracks, formatTime) {
  if (tracks.length === 0) {
    return {
      html: `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <h3>No recently played tracks</h3>
              <p>Tracks you play will appear here</p>
            </div>
          </td>
        </tr>
      `,
      count: 0
    };
  }
  
  // Render tracks
  const tracksHTML = tracks.map((track, index) => {
    let trackName = track.metadata?.common?.title || track.name || 'Unknown Track';
    trackName = trackName.replace(/\.\w+$/, '');
    trackName = trackName.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
    
    const artist = track.metadata?.common?.artist || 'Unknown Artist';
    const album = track.metadata?.common?.album || 'Unknown Album';
    const duration = track.metadata?.format?.duration ? formatTime(track.metadata.format.duration) : '--:--';
    const playCount = track.playCount || 0;
    
    // Format last played time
    let lastPlayedText = 'Never';
    if (track.lastPlayed) {
      const lastPlayedDate = new Date(track.lastPlayed * 1000);
      const now = new Date();
      const diffMs = now - lastPlayedDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) {
        lastPlayedText = 'Just now';
      } else if (diffMins < 60) {
        lastPlayedText = `${diffMins}m ago`;
      } else if (diffHours < 24) {
        lastPlayedText = `${diffHours}h ago`;
      } else if (diffDays < 7) {
        lastPlayedText = `${diffDays}d ago`;
      } else {
        lastPlayedText = lastPlayedDate.toLocaleDateString();
      }
    }
    
    return `
      <tr class="music-row" data-index="${index}">
        <td><div class="track-name" title="${trackName}">${trackName}</div></td>
        <td><div class="artist-name" title="${artist}">${artist}</div></td>
        <td><div class="album-name" title="${album}">${album}</div></td>
        <td class="col-duration"><div class="duration">${duration}</div></td>
        <td class="col-last-played"><div class="last-played">${lastPlayedText}</div></td>
        <td class="col-playcount"><div class="play-count">${playCount}</div></td>
        <td>
          <div class="track-actions">
            <button class="action-btn primary play-recently-played-btn" data-index="${index}" title="Play Track">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21"></polygon>
              </svg>
            </button>
            <button class="action-btn secondary add-to-queue-recently-played-btn" data-index="${index}" title="Add to Queue">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  return {
    html: tracksHTML,
    count: tracks.length
  };
}

/**
 * Show context menu for a track
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} track - Track object
 * @param {number} index - Track index
 * @param {Object} callbacks - Object with callback functions
 * @param {Function} callbacks.onPlay - Called when play is selected
 * @param {Function} callbacks.onAddToQueue - Called when add to queue is selected
 * @param {Function} callbacks.onGetInfo - Called when get info is selected
 * @param {Function} callbacks.onShowInFinder - Called when show in finder is selected
 * @param {Function} callbacks.onAddToPlaylist - Called when add to playlist is selected
 * @param {Function} callbacks.onDelete - Called when delete is selected
 */
function showTrackContextMenu(x, y, track, index, callbacks) {
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
    { label: 'Play', action: callbacks.onPlay },
    { label: 'Add to Queue', action: callbacks.onAddToQueue },
    { separator: true },
    { label: 'Get Info', action: callbacks.onGetInfo },
    { label: 'Show in Finder', action: callbacks.onShowInFinder },
    { separator: true },
    { label: 'Add to Playlist', action: callbacks.onAddToPlaylist },
    { separator: true },
    { label: 'Delete from Library', action: callbacks.onDelete, danger: true }
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

// showPlaylistPickerModal moved to shared/PlaylistPickerUtils.js

