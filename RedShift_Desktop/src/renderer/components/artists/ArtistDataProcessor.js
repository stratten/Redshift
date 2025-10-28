/**
 * ArtistDataProcessor.js
 * Data processing utilities for the Artists view
 * Handles artist data extraction, sorting, filtering, and grouping
 */

/**
 * Process tracks into artist objects with aggregated data
 * @param {Array} tracks - Array of track objects
 * @param {Object} musicBrainzService - MusicBrainz service for cached images
 * @returns {Array} Array of artist objects
 */
function processArtists(tracks, musicBrainzService) {
  const artistMap = new Map();
  
  tracks.forEach(track => {
    // Extract artist from metadata (same way MusicLibrary does)
    const artistName = track.metadata?.common?.artist || 'Unknown Artist';
    const albumName = track.metadata?.common?.album || null;
    const duration = track.metadata?.common?.duration || track.duration || 0;
    
    if (!artistMap.has(artistName)) {
      artistMap.set(artistName, {
        name: artistName,
        tracks: [],
        albums: new Set(),
        totalDuration: 0
      });
    }
    
    const artistData = artistMap.get(artistName);
    artistData.tracks.push(track);
    if (albumName) {
      artistData.albums.add(albumName);
    }
    artistData.totalDuration += duration;
  });
  
  // Convert to array and add computed properties
  return Array.from(artistMap.values()).map(artist => {
    // Find album art from the artist's tracks (fallback)
    let albumArt = null;
    for (const track of artist.tracks) {
      if (track.metadata?.common?.picture && track.metadata.common.picture.length > 0) {
        const picture = track.metadata.common.picture[0];
        albumArt = `data:${picture.format};base64,${picture.data.toString('base64')}`;
        break;
      }
    }
    
    // Check if we have a cached artist image
    const cachedImage = musicBrainzService.imageCache.get(artist.name);
    
    return {
      ...artist,
      songCount: artist.tracks.length,
      albumCount: artist.albums.size,
      albums: Array.from(artist.albums),
      albumArt: albumArt,
      artistImage: cachedImage || null // Load from cache if available
    };
  });
}

/**
 * Filter artists based on search query
 * @param {Array} artists - Array of artist objects
 * @param {string} query - Search query
 * @returns {Array} Filtered array of artists
 */
function filterArtists(artists, query) {
  if (!query || query.trim() === '') {
    return [...artists];
  }
  
  const searchTerm = query.toLowerCase();
  return artists.filter(artist => 
    artist.name.toLowerCase().includes(searchTerm)
  );
}

/**
 * Sort artists based on sort settings
 * @param {Array} artists - Array of artist objects to sort (modified in place)
 * @param {string} sortBy - Sort field ('name', 'songCount', 'albumCount')
 * @param {string} sortDirection - Sort direction ('asc' or 'desc')
 */
function sortArtists(artists, sortBy, sortDirection) {
  const multiplier = sortDirection === 'asc' ? 1 : -1;
  
  artists.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        // Put "Unknown Artist" at the end regardless of sort direction
        if (a.name === 'Unknown Artist') return 1;
        if (b.name === 'Unknown Artist') return -1;
        comparison = a.name.localeCompare(b.name);
        break;
      case 'songCount':
        comparison = a.songCount - b.songCount;
        break;
      case 'albumCount':
        comparison = a.albumCount - b.albumCount;
        break;
    }
    
    return comparison * multiplier;
  });
}

/**
 * Group tracks by album
 * @param {Array} tracks - Array of track objects
 * @returns {Array} Array of {album, tracks} objects
 */
function groupTracksByAlbum(tracks) {
  const albumMap = new Map();
  
  tracks.forEach(track => {
    const album = track.metadata?.common?.album || 'Unknown Album';
    if (!albumMap.has(album)) {
      albumMap.set(album, []);
    }
    albumMap.get(album).push(track);
  });
  
  // Convert to array and sort tracks within each album
  return Array.from(albumMap.entries()).map(([album, albumTracks]) => ({
    album,
    tracks: albumTracks.sort((a, b) => {
      // Sort by track number if available
      const trackA = a.metadata?.common?.track?.no || 9999;
      const trackB = b.metadata?.common?.track?.no || 9999;
      return trackA - trackB;
    })
  }));
}

