/**
 * ArtistImageFetcher.js
 * Handles fetching and updating artist images from MusicBrainz
 */

/**
 * Fetch images for new artists that haven't been attempted yet
 * @param {Array} artists - Array of artist objects
 * @param {Object} musicBrainzService - MusicBrainz service instance
 * @param {Object} ui - UI manager for logging
 * @param {Function} updateCallback - Callback to update artist card image
 * @returns {Promise<Object>} Result with successCount and failCount
 */
async function fetchNewArtistImages(artists, musicBrainzService, ui, updateCallback) {
  // Filter to only artists we haven't attempted
  const newArtists = artists.filter(artist => 
    artist.name !== 'Unknown Artist' && 
    !musicBrainzService.hasAttempted(artist.name)
  );
  
  if (newArtists.length === 0) {
    ui.logBoth('info', '🎨 No new artists to fetch images for');
    return { successCount: 0, failCount: 0 };
  }
  
  ui.logBoth('info', `🎨 Auto-fetching images for ${newArtists.length} new artist(s)...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < newArtists.length; i++) {
    const artist = newArtists[i];
    ui.logBoth('info', `🎨 [${i + 1}/${newArtists.length}] Fetching image for: ${artist.name}`);
    
    try {
      const imageUrl = await musicBrainzService.getArtistImage(artist.name);
      
      if (imageUrl) {
        successCount++;
        artist.artistImage = imageUrl;
        updateCallback(artist.name, imageUrl);
        ui.logBoth('success', `✅ Found image for: ${artist.name}`);
      } else {
        failCount++;
        ui.logBoth('warning', `❌ No image found for: ${artist.name}`);
      }
    } catch (error) {
      failCount++;
      ui.logBoth('error', `❌ Failed to fetch image for ${artist.name}: ${error.message}`);
    }
  }
  
  ui.logBoth('success', `✅ Finished auto-fetching: ${successCount} successful, ${failCount} failed`);
  
  return { successCount, failCount };
}

/**
 * Fetch images for all artists (user-triggered)
 * @param {Array} artists - Array of artist objects
 * @param {Object} musicBrainzService - MusicBrainz service instance
 * @param {Object} ui - UI manager for logging
 * @param {Function} updateCallback - Callback to update artist card image
 * @returns {Promise<Object>} Result with successCount and failCount
 */
async function fetchAllArtistImages(artists, musicBrainzService, ui, updateCallback) {
  const artistsToFetch = artists.filter(a => a.name !== 'Unknown Artist');
  
  ui.logBoth('info', `🎨 Fetching images for all ${artistsToFetch.length} artist(s)...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < artistsToFetch.length; i++) {
    const artist = artistsToFetch[i];
    ui.logBoth('info', `🎨 [${i + 1}/${artistsToFetch.length}] Fetching image for: ${artist.name}`);
    
    try {
      const imageUrl = await musicBrainzService.getArtistImage(artist.name);
      
      if (imageUrl) {
        successCount++;
        artist.artistImage = imageUrl;
        updateCallback(artist.name, imageUrl);
        ui.logBoth('success', `✅ Found image for: ${artist.name}`);
      } else {
        failCount++;
        ui.logBoth('warning', `❌ No image found for: ${artist.name}`);
      }
    } catch (error) {
      failCount++;
      ui.logBoth('error', `❌ Failed to fetch image for ${artist.name}: ${error.message}`);
    }
  }
  
  ui.logBoth('success', `✅ Finished fetching all images: ${successCount} successful, ${failCount} failed`);
  
  return { successCount, failCount };
}

/**
 * Retry fetching images for failed artists
 * @param {Array} artists - Array of artist objects
 * @param {Object} musicBrainzService - MusicBrainz service instance
 * @param {Object} ui - UI manager for logging
 * @param {Function} updateCallback - Callback to update artist card image
 * @returns {Promise<Object>} Result with successCount and failCount
 */
async function retryFailedArtistImages(artists, musicBrainzService, ui, updateCallback) {
  const failedArtists = artists.filter(artist => 
    artist.name !== 'Unknown Artist' && 
    musicBrainzService.hasAttempted(artist.name) &&
    !musicBrainzService.imageCache.get(artist.name) // null means failed
  );
  
  if (failedArtists.length === 0) {
    ui.logBoth('info', '🎨 No failed artists to retry');
    return { successCount: 0, failCount: 0 };
  }
  
  ui.logBoth('info', `🎨 Retrying ${failedArtists.length} failed artist(s)...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < failedArtists.length; i++) {
    const artist = failedArtists[i];
    ui.logBoth('info', `🔄 [${i + 1}/${failedArtists.length}] Retrying: ${artist.name}`);
    
    try {
      const imageUrl = await musicBrainzService.refreshArtistImage(artist.name, true);
      
      if (imageUrl) {
        successCount++;
        artist.artistImage = imageUrl;
        updateCallback(artist.name, imageUrl);
        ui.logBoth('success', `✅ Found image on retry: ${artist.name}`);
      } else {
        failCount++;
        ui.logBoth('warning', `❌ Still no image for: ${artist.name}`);
      }
    } catch (error) {
      failCount++;
      ui.logBoth('error', `❌ Retry failed for ${artist.name}: ${error.message}`);
    }
  }
  
  ui.logBoth('success', `✅ Finished retrying: ${successCount} successful, ${failCount} still failed`);
  
  return { successCount, failCount };
}

/**
 * Update a specific artist card's image in the DOM
 * @param {HTMLElement} container - Container element
 * @param {string} currentView - Current view mode ('list', 'albums', 'detail')
 * @param {string} artistName - Artist name
 * @param {string} imageUrl - Image URL
 */
function updateArtistCardImage(container, currentView, artistName, imageUrl) {
  if (currentView !== 'list' || !container) return;
  
  const card = container.querySelector(`.artist-card[data-artist-name="${escapeHtml(artistName)}"]`);
  if (!card) return;
  
  const iconDiv = card.querySelector('.artist-icon');
  if (!iconDiv) return;
  
  // Replace SVG with image
  iconDiv.innerHTML = `<img src="${imageUrl}" alt="${escapeHtml(artistName)}" class="artist-image" />`;
}

/**
 * Update fetch button UI to show fetching state
 * @param {boolean} isFetching - Whether currently fetching
 */
function updateFetchButtonState(isFetching) {
  const btn = document.getElementById('fetchArtistImages');
  if (!btn) return;
  
  btn.disabled = isFetching;
  btn.innerHTML = isFetching
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         <polyline points="23 4 23 10 17 10"></polyline>
         <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
       </svg>
       Fetching...`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
         <circle cx="8.5" cy="8.5" r="1.5"></circle>
         <polyline points="21 15 16 10 5 21"></polyline>
       </svg>
       Fetch Images`;
}

/**
 * Update retry button UI to show retrying state
 * @param {boolean} isRetrying - Whether currently retrying
 */
function updateRetryButtonState(isRetrying) {
  const btn = document.getElementById('retryFailedImages');
  if (!btn) return;
  
  btn.disabled = isRetrying;
  btn.textContent = isRetrying ? 'Retrying...' : 'Retry Failed';
}

