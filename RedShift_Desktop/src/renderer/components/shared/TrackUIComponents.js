/**
 * TrackUIComponents.js
 * Shared, reusable UI components for track rows across the application
 * Styled to match the main music library appearance
 */

/**
 * Render a favorite button for a track
 * @param {number} index - Track index in the library/list
 * @param {boolean} isFavorite - Whether track is favorited
 * @returns {string} HTML string for favorite button
 */
function renderFavoriteButton(index, isFavorite) {
  return `
    <button class="action-btn fav-toggle-btn" data-index="${index}" data-fav="${isFavorite ? '1' : '0'}" title="Toggle favourite">
      ${isFavorite ? `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>` : `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
          <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24z"/>
        </svg>`}
    </button>`;
}

/**
 * Render a rating dropdown for a track
 * @param {number} index - Track index in the library/list
 * @param {number} rating - Current rating (0-5)
 * @returns {string} HTML string for rating dropdown
 */
function renderRatingDropdown(index, rating) {
  return `
    <select class="rating-select" data-index="${index}" title="Set rating">
      <option value="">–</option>
      <option value="1" ${rating === 1 ? 'selected' : ''}>1</option>
      <option value="2" ${rating === 2 ? 'selected' : ''}>2</option>
      <option value="3" ${rating === 3 ? 'selected' : ''}>3</option>
      <option value="4" ${rating === 4 ? 'selected' : ''}>4</option>
      <option value="5" ${rating === 5 ? 'selected' : ''}>5</option>
    </select>`;
}

/**
 * Render action buttons for a track (play, add to queue, add to playlist)
 * @param {number} index - Track index in the library/list
 * @returns {string} HTML string for action buttons
 */
function renderTrackActionButtons(index) {
  return `
    <div class="track-actions">
      <button class="action-btn primary play-track-btn" data-index="${index}" title="Play Track">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21"></polygon>
        </svg>
      </button>
      <button class="action-btn add-to-queue-btn" data-index="${index}" title="Add to Queue">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button class="action-btn add-to-playlist-btn" data-index="${index}" title="Add to Playlist">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="5" width="14" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="12" x2="16" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="16"></line>
        </svg>
      </button>
    </div>`;
}

/**
 * Render all interactive columns for a track (play count, favorite, rating, actions)
 * This is a convenience function that combines all the interactive elements
 * @param {number} index - Track index in the library/list
 * @param {Object} track - Track object with path property
 * @param {Map} favoriteByPath - Map of path -> favorite status
 * @param {Map} ratingByPath - Map of path -> rating value
 * @param {Map} playCountByPath - Map of path -> play count
 * @returns {string} HTML string for all interactive columns (4 <td> elements)
 */
function renderTrackInteractiveColumns(index, track, favoriteByPath, ratingByPath, playCountByPath) {
  const isFavorite = favoriteByPath.get(track.path) === true;
  const rating = Number(ratingByPath.get(track.path) || 0);
  const playCount = Number(playCountByPath.get(track.path) || 0);
  
  return `
      <td class="col-playcount">
        <div class="play-count">${playCount}</div>
      </td>
      <td class="col-favorite">
        <div class="favorite-control">${renderFavoriteButton(index, isFavorite)}</div>
      </td>
      <td class="col-rating">
        <div class="rating-control">${renderRatingDropdown(index, rating)}</div>
      </td>
      <td>
        ${renderTrackActionButtons(index)}
      </td>`;
}

/**
 * Update play count display in UI for a specific track
 * @param {HTMLElement} container - Container element to search within
 * @param {string} filePath - Path to the track file
 * @param {Map} playCountByPath - Map of path -> play count
 */
function updateTrackPlayCountInUI(container, filePath, playCountByPath) {
  if (!container) return;
  
  // Get the updated play count
  const playCount = playCountByPath.get(filePath) || 0;
  
  // Find the row with matching file path
  const row = container.querySelector(`tr[data-path="${filePath}"]`);
  if (!row) return;
  
  // Find and update the play count cell
  const playCountCell = row.querySelector('.play-count');
  if (playCountCell) {
    playCountCell.textContent = playCount;
  }
}

/**
 * Escape HTML to prevent XSS (shared utility)
 */
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

