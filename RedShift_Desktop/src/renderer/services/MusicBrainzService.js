/**
 * MusicBrainz Service
 * Fetches artist images and metadata from MusicBrainz API
 * No API key required, 1 request per second rate limit
 */
class MusicBrainzService {
  constructor() {
    this.baseUrl = 'https://musicbrainz.org/ws/2';
    this.coverArtUrl = 'https://coverartarchive.org';
    this.imageCache = new Map(); // artistName -> imageUrl (or null if not found)
    this.attemptedLookups = new Set(); // artistName -> tracks what we've tried
    this.pendingRequests = new Map(); // artistName -> Promise
    this.lastRequestTime = 0;
    this.minRequestInterval = 1100; // 1.1 seconds to be safe with rate limit
    
    // Load cache from localStorage
    this.loadCache();
  }

  /**
   * Load cached artist images from file system via IPC
   */
  async loadCache() {
    try {
      // Request list of cached artist images from main process
      const cacheData = await window.electronAPI.invoke('load-artist-image-cache');
      
      if (cacheData) {
        this.imageCache = new Map(Object.entries(cacheData));
        this.attemptedLookups = new Set(Object.keys(cacheData));
        
        const successCount = Array.from(this.imageCache.values()).filter(v => v !== null).length;
        console.log(`🎨 Loaded artist image cache: ${successCount} images, ${this.attemptedLookups.size} total lookups`);
      }
    } catch (error) {
      console.error(`Failed to load artist image cache: ${error.message}`);
    }
  }

  /**
   * Save image to file system via IPC
   * @param {string} artistName - The artist name
   * @param {string} dataUrl - Base64 data URL
   */
  async saveArtistImage(artistName, dataUrl) {
    try {
      if (!dataUrl) {
        // Save null to indicate we attempted but found nothing
        await window.electronAPI.invoke('save-artist-image', { artistName, dataUrl: null });
        return;
      }
      
      // Save the base64 data URL to a file
      await window.electronAPI.invoke('save-artist-image', { artistName, dataUrl });
      console.log(`💾 Saved image for: ${artistName}`);
    } catch (error) {
      console.error(`Failed to save image for ${artistName}:`, error);
    }
  }

  /**
   * Legacy method - no longer saves to localStorage
   */
  saveCache() {
    // Cache is now saved per-image via saveArtistImage
    // Keep this method for compatibility but it does nothing
  }

  /**
   * Rate limit requests to 1 per second
   */
  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get artist image URL by artist name
   * @param {string} artistName - The artist's name
   * @returns {Promise<string|null>} - Base64 data URL or null if not found
   */
  async getArtistImage(artistName) {
    if (!artistName || artistName === 'Unknown Artist') {
      return null;
    }

    // Check cache first - only return if it's actual base64 data (starts with 'data:')
    if (this.imageCache.has(artistName)) {
      const cached = this.imageCache.get(artistName);
      // If it's null (failed lookup) or valid base64 data, return it
      if (cached === null || (cached && cached.startsWith('data:'))) {
        return cached;
      }
      // If it's a URL (old cache format), clear it and re-download
      console.log(`🔄 Cached URL found for ${artistName}, re-downloading as base64...`);
      this.imageCache.delete(artistName);
      this.attemptedLookups.delete(artistName);
    }

    // Check if request is already pending
    if (this.pendingRequests.has(artistName)) {
      return this.pendingRequests.get(artistName);
    }

    // Create new request
    const requestPromise = this.fetchArtistImage(artistName);
    this.pendingRequests.set(artistName, requestPromise);

    try {
      const imageData = await requestPromise;
      this.imageCache.set(artistName, imageData);
      this.attemptedLookups.add(artistName);
      
      // Save to file system
      await this.saveArtistImage(artistName, imageData);
      
      return imageData;
    } finally {
      this.pendingRequests.delete(artistName);
    }
  }

  /**
   * Force refresh an artist's image (bypass cache)
   * @param {string} artistName - The artist's name
   * @param {boolean} forceRetry - If true, will retry even if previously attempted
   * @returns {Promise<string|null>} - Image URL or null
   */
  async refreshArtistImage(artistName, forceRetry = false) {
    if (!artistName || artistName === 'Unknown Artist') {
      return null;
    }

    // Remove from cache if force retry
    if (forceRetry) {
      this.imageCache.delete(artistName);
      this.attemptedLookups.delete(artistName);
    }

    return this.getArtistImage(artistName);
  }

  /**
   * Check if we've attempted to fetch an artist's image
   * @param {string} artistName - The artist's name
   * @returns {boolean}
   */
  hasAttempted(artistName) {
    return this.attemptedLookups.has(artistName);
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    const total = this.attemptedLookups.size;
    const successful = Array.from(this.imageCache.values()).filter(v => v !== null).length;
    const failed = total - successful;
    
    return {
      total,
      successful,
      failed,
      pending: this.pendingRequests.size
    };
  }

  /**
   * Resolve Wikimedia Commons file page URL to actual image URL
   * @private
   */
  async getWikimediaImageUrl(pageUrl) {
    try {
      // Extract filename from URL like: https://commons.wikimedia.org/wiki/File:Fall_Out_Boy_2006_1.jpg
      const match = pageUrl.match(/File:(.+)$/);
      if (!match) {
        console.warn(`Could not extract filename from Wikimedia URL: ${pageUrl}`);
        return null;
      }
      
      const filename = decodeURIComponent(match[1]);
      console.log(`📄 Extracted filename: ${filename}`);
      
      // Use Wikimedia API to get actual image URL
      const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
      
      await this.rateLimit();
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        console.warn(`Failed to fetch Wikimedia API: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      
      if (!data.query || !data.query.pages) {
        console.warn('No pages in Wikimedia API response');
        return null;
      }
      
      // Get the first (and should be only) page
      const pages = Object.values(data.query.pages);
      if (pages.length === 0 || !pages[0].imageinfo || pages[0].imageinfo.length === 0) {
        console.warn('No image info in Wikimedia API response');
        return null;
      }
      
      const imageUrl = pages[0].imageinfo[0].url;
      console.log(`🖼️  Wikimedia API returned image URL: ${imageUrl}`);
      return imageUrl;
    } catch (error) {
      console.error(`Error resolving Wikimedia URL ${pageUrl}:`, error);
      return null;
    }
  }

  /**
   * Download image and convert to base64 data URL
   * @private
   */
  async downloadAndConvertImage(imageUrl) {
    try {
      console.log(`🔽 Downloading image from: ${imageUrl}`);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn(`Failed to download image: ${response.status}`);
        return null;
      }

      const blob = await response.blob();
      console.log(`📦 Downloaded blob: ${blob.size} bytes, type: ${blob.type}`);
      
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result); // Returns data:image/...;base64,...
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Verify it's actually a data URL
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        console.error(`❌ Invalid data URL generated from ${imageUrl}`);
        return null;
      }
      
      console.log(`✅ Converted to data URL: ${dataUrl.substring(0, 50)}...`);
      return dataUrl;
    } catch (error) {
      console.error(`❌ Error downloading image from ${imageUrl}:`, error);
      return null;
    }
  }

  /**
   * Fetch artist image from MusicBrainz
   * @private
   */
  async fetchArtistImage(artistName) {
    try {
      await this.rateLimit();

      // Search for artist
      const searchUrl = `${this.baseUrl}/artist/?query=${encodeURIComponent(artistName)}&fmt=json&limit=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'RedShiftMusicPlayer/1.0.0 (https://github.com/stratten/redshift)'
        }
      });

      if (!searchResponse.ok) {
        console.warn(`MusicBrainz search failed for "${artistName}": ${searchResponse.status}`);
        return null;
      }

      const searchData = await searchResponse.json();

      if (!searchData.artists || searchData.artists.length === 0) {
        console.log(`No MusicBrainz entry found for artist: ${artistName}`);
        return null;
      }

      const artist = searchData.artists[0];
      const mbid = artist.id;

      // Get artist details with relationships
      await this.rateLimit();
      
      const detailsUrl = `${this.baseUrl}/artist/${mbid}?inc=url-rels&fmt=json`;
      
      const detailsResponse = await fetch(detailsUrl, {
        headers: {
          'User-Agent': 'RedShiftMusicPlayer/1.0.0 (https://github.com/yourusername/redshift)'
        }
      });

      if (!detailsResponse.ok) {
        console.warn(`Failed to get artist details for "${artistName}": ${detailsResponse.status}`);
        return null;
      }

      const detailsData = await detailsResponse.json();

      // Look for image URLs in relationships
      if (detailsData.relations) {
        // Prefer images from specific sites
        const imageTypes = [
          'image',
          'picture',
          'bandcamp',
          'official homepage',
          'wikipedia',
          'wikidata',
          'discogs'
        ];

        for (const imageType of imageTypes) {
          const relation = detailsData.relations.find(r => 
            r.type === imageType || 
            (r.url && r.url.resource && (
              r.url.resource.includes('wikimedia') ||
              r.url.resource.includes('wikipedia') ||
              r.url.resource.includes('wikidata')
            ))
          );

          if (relation && relation.url && relation.url.resource) {
            const url = relation.url.resource;
            
            // Handle Wikimedia Commons file pages
            if (url.includes('commons.wikimedia.org/wiki/File:')) {
              console.log(`🔗 Found Wikimedia Commons file page for ${artistName}: ${url}`);
              const imageUrl = await this.getWikimediaImageUrl(url);
              if (imageUrl) {
                console.log(`✅ Resolved Wikimedia URL to direct image: ${imageUrl}`);
                const dataUrl = await this.downloadAndConvertImage(imageUrl);
                if (dataUrl) {
                  console.log(`✅ Downloaded and converted Wikimedia image for ${artistName}`);
                  return dataUrl;
                }
              }
              continue; // Try next image type if this failed
            }
            
            // Skip other Wikipedia wiki pages (not direct images)
            if (url.includes('wikipedia.org/wiki/')) {
              console.log(`⏭️  Skipping Wikipedia page URL for ${artistName}: ${url}`);
              continue;
            }
            
            // Only try to download direct image links
            if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
              console.log(`✅ Found image URL for ${artistName}, downloading...`);
              const dataUrl = await this.downloadAndConvertImage(url);
              if (dataUrl) {
                console.log(`✅ Downloaded and converted image for ${artistName}`);
                return dataUrl;
              }
            }
          }
        }
      }

      // Try to get release group art as fallback
      await this.rateLimit();
      
      const releaseGroupUrl = `${this.baseUrl}/release-group?artist=${mbid}&fmt=json&limit=1`;
      
      const releaseGroupResponse = await fetch(releaseGroupUrl, {
        headers: {
          'User-Agent': 'RedShiftMusicPlayer/1.0.0 (https://github.com/yourusername/redshift)'
        }
      });

      if (releaseGroupResponse.ok) {
        const releaseGroupData = await releaseGroupResponse.json();
        
        if (releaseGroupData['release-groups'] && releaseGroupData['release-groups'].length > 0) {
          const releaseGroupId = releaseGroupData['release-groups'][0].id;
          
          // Try to get cover art
          const coverArtUrl = `${this.coverArtUrl}/release-group/${releaseGroupId}`;
          
          try {
            await this.rateLimit();
            const coverArtResponse = await fetch(coverArtUrl);
            
            if (coverArtResponse.ok) {
              const coverArtData = await coverArtResponse.json();
              
              if (coverArtData.images && coverArtData.images.length > 0) {
                // Use the front cover or first available image
                const image = coverArtData.images.find(img => img.front) || coverArtData.images[0];
                const imageUrl = image.thumbnails?.large || image.thumbnails?.small || image.image;
                
                console.log(`✅ Found cover art URL for ${artistName}, downloading...`);
                const dataUrl = await this.downloadAndConvertImage(imageUrl);
                if (dataUrl) {
                  console.log(`✅ Downloaded and converted cover art for ${artistName}`);
                  return dataUrl;
                }
              }
            }
          } catch (error) {
            // Cover art might not be available
            console.log(`No cover art found for ${artistName}`);
          }
        }
      }

      console.log(`❌ No image found for artist: ${artistName}`);
      return null;

    } catch (error) {
      console.error(`Error fetching image for "${artistName}":`, error);
      return null;
    }
  }

  /**
   * Batch fetch images for multiple artists
   * @param {string[]} artistNames - Array of artist names
   * @returns {Promise<Map<string, string|null>>} - Map of artist names to image URLs
   */
  async batchGetArtistImages(artistNames) {
    const results = new Map();
    
    for (const artistName of artistNames) {
      if (artistName && artistName !== 'Unknown Artist') {
        const imageUrl = await this.getArtistImage(artistName);
        results.set(artistName, imageUrl);
      }
    }
    
    return results;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.imageCache.clear();
    localStorage.removeItem('musicbrainz_artist_cache');
    console.log('🗑️ Cleared MusicBrainz cache');
  }
}

