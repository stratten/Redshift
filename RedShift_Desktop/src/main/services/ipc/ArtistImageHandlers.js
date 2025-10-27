// src/main/services/ipc/ArtistImageHandlers.js
// IPC handlers for artist image caching (MusicBrainz integration)

const path = require('path');

function registerArtistImageHandlers(ipcMain) {
  /**
   * Save artist image to disk
   */
  ipcMain.handle('save-artist-image', async (event, { artistName, dataUrl }) => {
    const fs = require('fs').promises;
    const crypto = require('crypto');
    
    try {
      // Create artist images directory in app data
      const { app } = require('electron');
      const artistImagesDir = path.join(app.getPath('userData'), 'artist-images');
      await fs.mkdir(artistImagesDir, { recursive: true });
      
      // Create a safe filename from artist name
      const safeFilename = artistName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const hash = crypto.createHash('md5').update(artistName).digest('hex').substring(0, 8);
      const filename = `${safeFilename}_${hash}`;
      
      if (!dataUrl) {
        // Save a marker file to indicate we tried and failed
        const markerPath = path.join(artistImagesDir, `${filename}.failed`);
        await fs.writeFile(markerPath, artistName);
        console.log(`💾 Saved failed marker for: ${artistName}`);
        return { success: true, path: null };
      }
      
      // Extract the base64 data and format from data URL
      const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid data URL format');
      }
      
      const [, format, base64Data] = matches;
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Save the image file
      const imagePath = path.join(artistImagesDir, `${filename}.${format}`);
      await fs.writeFile(imagePath, buffer);
      
      // Save mapping file to restore original artist name
      const mappingPath = path.join(artistImagesDir, `${filename}.meta`);
      await fs.writeFile(mappingPath, artistName);
      
      console.log(`💾 Saved image for ${artistName}: ${imagePath}`);
      return { success: true, path: imagePath };
    } catch (error) {
      console.error(`Failed to save artist image for ${artistName}:`, error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Load all artist images from disk
   */
  ipcMain.handle('load-artist-image-cache', async () => {
    const fs = require('fs').promises;
    
    try {
      const { app } = require('electron');
      const artistImagesDir = path.join(app.getPath('userData'), 'artist-images');
      
      // Create directory if it doesn't exist
      try {
        await fs.mkdir(artistImagesDir, { recursive: true });
      } catch (err) {
        // Directory might already exist
      }
      
      const files = await fs.readdir(artistImagesDir);
      const cache = {};
      
      for (const file of files) {
        const filePath = path.join(artistImagesDir, file);
        
        if (file.endsWith('.failed')) {
          // This is a failed lookup marker
          const artistName = await fs.readFile(filePath, 'utf8');
          cache[artistName] = null;
          continue;
        }
        
        // Skip non-image files
        if (!file.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          continue;
        }
        
        // Extract artist name from filename (everything before the hash)
        const baseFilename = file.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
        const parts = baseFilename.split('_');
        const hash = parts.pop(); // Remove hash
        const safeName = parts.join('_');
        
        // Read the image and convert to base64 data URL
        const buffer = await fs.readFile(filePath);
        const ext = path.extname(file).substring(1);
        const mimeType = ext === 'jpg' ? 'jpeg' : ext;
        const base64 = buffer.toString('base64');
        const dataUrl = `data:image/${mimeType};base64,${base64}`;
        
        // We need to reverse the safe filename back to original
        // For now, we'll create a mapping file
        const mappingPath = path.join(artistImagesDir, `${baseFilename}.meta`);
        try {
          const originalName = await fs.readFile(mappingPath, 'utf8');
          cache[originalName] = dataUrl;
        } catch (err) {
          // No mapping file, skip this image
          console.warn(`No mapping file for ${file}, skipping`);
        }
      }
      
      console.log(`🎨 Loaded ${Object.keys(cache).length} artist images from disk`);
      return cache;
    } catch (error) {
      console.error('Failed to load artist image cache:', error);
      return {};
    }
  });
}

module.exports = { registerArtistImageHandlers };

