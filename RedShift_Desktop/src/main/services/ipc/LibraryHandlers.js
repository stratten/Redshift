// src/main/services/ipc/LibraryHandlers.js
// IPC handlers for library scanning and file operations

const path = require('path');

function registerLibraryHandlers(ipcMain, manager, waitReady) {
  const h = (fn) => async (...args) => { await waitReady(); return fn(...args); };

  // Library scan / transfer
  ipcMain.handle('scan-library', async () => manager.scanMasterLibrary());
  ipcMain.handle('scan-music-library', h(async () => manager.scanMusicLibrary()));
  ipcMain.handle('transfer-files', async (event, files, method) => manager.transferFiles(files, method));
  ipcMain.handle('get-transfer-history', async () => manager.getTransferHistory());
  
  ipcMain.handle('add-files-to-library', async (event, { paths }) => {
    const fs = require('fs').promises;
    
    try {
      const libraryPath = manager.settings.masterLibraryPath;
      if (!libraryPath) {
        return { success: false, error: 'Library path not configured' };
      }
      
      console.log(`📥 Adding ${paths.length} items to library: ${libraryPath}`);
      
      let filesAdded = 0;
      const audioExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma'];
      
      // Recursive function to copy directory
      async function copyDirectory(src, dest) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          
          if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (audioExtensions.includes(ext)) {
              await fs.copyFile(srcPath, destPath);
              filesAdded++;
              console.log(`  ✓ Copied: ${entry.name}`);
            }
          }
        }
      }
      
      // Process each dropped path
      for (const itemPath of paths) {
        const stat = await fs.stat(itemPath);
        const itemName = path.basename(itemPath);
        
        if (stat.isDirectory()) {
          // Copy entire directory
          const destPath = path.join(libraryPath, itemName);
          console.log(`📁 Copying directory: ${itemName}`);
          await copyDirectory(itemPath, destPath);
        } else if (stat.isFile()) {
          // Copy single file (if it's an audio file)
          const ext = path.extname(itemName).toLowerCase();
          if (audioExtensions.includes(ext)) {
            const destPath = path.join(libraryPath, itemName);
            await fs.copyFile(itemPath, destPath);
            filesAdded++;
            console.log(`  ✓ Copied: ${itemName}`);
          }
        }
      }
      
      console.log(`✅ Added ${filesAdded} audio files to library`);
      return { success: true, filesAdded };
    } catch (error) {
      console.error('❌ Error adding files to library:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerLibraryHandlers };

