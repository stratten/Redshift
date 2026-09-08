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

  function addTrackToArtist(artistName, role, track) {
    const key = normalizeArtistKey(artistName);
    if (!key) return;

    if (!artistMap.has(key)) {
      artistMap.set(key, {
        name: artistName,
        primaryTracks: [],
        featuredTracks: []
      });
    }

    const artist = artistMap.get(key);
    const tracksForRole = role === 'primary' ? artist.primaryTracks : artist.featuredTracks;
    if (!tracksForRole.includes(track)) {
      tracksForRole.push(track);
    }
  }

  tracks.forEach(track => {
    const artistCredit = parseTrackArtistCredit(
      track.metadata?.common?.artist,
      track.metadata?.common?.title
    );

    artistCredit.primaryArtists.forEach(artistName => {
      addTrackToArtist(artistName, 'primary', track);
    });

    artistCredit.featuredArtists.forEach(artistName => {
      addTrackToArtist(artistName, 'featured', track);
    });
  });

  return Array.from(artistMap.values()).map(artist => {
    const tracksForArtist = Array.from(new Set(artist.primaryTracks.concat(artist.featuredTracks)));
    const albums = new Set();
    let totalDuration = 0;
    let albumArt = null;

    artist.primaryTracks.forEach(track => {
      const albumName = track.metadata?.common?.album;
      if (albumName) {
        albums.add(albumName);
      }
    });

    tracksForArtist.forEach(track => {
      const duration = track.metadata?.common?.duration || track.duration || 0;
      totalDuration += duration;

      if (!albumArt && track.metadata?.common?.picture?.length > 0) {
        const picture = track.metadata.common.picture[0];
        albumArt = `data:${picture.format};base64,${picture.data.toString('base64')}`;
      }
    });

    const cachedImage = musicBrainzService.imageCache.get(artist.name);

    return {
      name: artist.name,
      primaryTracks: artist.primaryTracks,
      featuredTracks: artist.featuredTracks,
      tracks: tracksForArtist,
      primarySongCount: artist.primaryTracks.length,
      featuredSongCount: artist.featuredTracks.length,
      songCount: tracksForArtist.length,
      albumCount: albums.size,
      albums: Array.from(albums),
      totalDuration,
      albumArt,
      artistImage: cachedImage || null
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

