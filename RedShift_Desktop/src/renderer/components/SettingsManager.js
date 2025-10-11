// src/renderer/components/SettingsManager.js - Settings Management Component

class SettingsManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Browse music library path button
    document.getElementById('browseMusicBtn').addEventListener('click', () => {
      this.browseForDirectory('musicLibraryPath');
    });
    
    // Browse sync library path button (advanced)
    document.getElementById('browseSyncBtn').addEventListener('click', () => {
      this.browseForDirectory('masterLibraryPath');
    });
    
    // Advanced settings toggle
    document.getElementById('advancedToggle').addEventListener('click', () => {
      this.toggleAdvancedSettings();
    });
    
    // Clear cache button
    document.getElementById('clearCacheBtn').addEventListener('click', () => {
      this.clearMusicCache();
    });
  }
  
  async loadSettings() {
    try {
      const settings = await window.electronAPI.invoke('get-settings');
      
      // Main music library path (primary setting)
      const musicPath = settings.musicLibraryPath || settings.masterLibraryPath || '';
      document.getElementById('musicLibraryPathInput').value = musicPath;
      
      // Advanced sync path (only if different from music path)
      const syncPath = settings.masterLibraryPath && settings.masterLibraryPath !== musicPath ? settings.masterLibraryPath : '';
      document.getElementById('syncLibraryPathInput').value = syncPath;
      
      // Legacy display
      if (document.getElementById('libraryPath')) {
        document.getElementById('libraryPath').textContent = musicPath || 'Not set';
      }
      
      this.ui.logBoth('info', `Music Library: ${musicPath || 'Not set'}`);
      if (syncPath) {
        this.ui.logBoth('info', `Separate Sync Library: ${syncPath}`);
      }
      
      // Auto-set music library path if we have a master library path but no music library path
      if (!settings.musicLibraryPath && settings.masterLibraryPath) {
        this.ui.logBoth('info', 'Auto-configuring music library path...');
        await window.electronAPI.invoke('update-setting', 'musicLibraryPath', settings.masterLibraryPath);
        document.getElementById('musicLibraryPathInput').value = settings.masterLibraryPath;
      }
      
      // Load cache stats
      this.loadCacheStats();
    } catch (error) {
      this.ui.addLog('error', `Failed to load settings: ${error.message}`);
    }
  }
  
  async browseForDirectory(settingKey = 'musicLibraryPath') {
    try {
      this.ui.logBoth('info', `Browsing for directory: ${settingKey}`);
      const newPath = await window.electronAPI.invoke('choose-directory', settingKey);
      if (newPath) {
        if (settingKey === 'musicLibraryPath') {
          document.getElementById('musicLibraryPathInput').value = newPath;
          // Also update the legacy display
          if (document.getElementById('libraryPath')) {
            document.getElementById('libraryPath').textContent = newPath;
          }
          this.ui.logBoth('success', `Music library path updated: ${newPath}`);

          // Keep masterLibraryPath in sync unless user explicitly set a separate sync path
          const currentSyncPath = (document.getElementById('syncLibraryPathInput').value || '').trim();
          if (!currentSyncPath) {
            try {
              await window.electronAPI.invoke('update-setting', 'masterLibraryPath', newPath);
              this.ui.logBoth('info', 'Kept sync library path in sync with music library path');
            } catch (e) {
              this.ui.logBoth('warning', `Could not sync masterLibraryPath: ${e.message}`);
            }
          }
        } else if (settingKey === 'masterLibraryPath') {
          document.getElementById('syncLibraryPathInput').value = newPath;
          this.ui.logBoth('success', `Sync library path updated: ${newPath}`);

          // If primary music path is empty, mirror to musicLibraryPath so app has a single source of truth
          const currentMusicPath = (document.getElementById('musicLibraryPathInput').value || '').trim();
          if (!currentMusicPath) {
            try {
              await window.electronAPI.invoke('update-setting', 'musicLibraryPath', newPath);
              document.getElementById('musicLibraryPathInput').value = newPath;
              if (document.getElementById('libraryPath')) {
                document.getElementById('libraryPath').textContent = newPath;
              }
              this.ui.logBoth('info', 'Set primary music path from sync path');
            } catch (e) {
              this.ui.logBoth('warning', `Could not set musicLibraryPath: ${e.message}`);
            }
          }
        }
      }
    } catch (error) {
      this.ui.logBoth('error', `Failed to update library path: ${error.message}`);
    }
  }
  
  toggleAdvancedSettings() {
    const advancedSection = document.getElementById('advancedSettings');
    const toggleBtn = document.getElementById('advancedToggle');
    
    if (advancedSection.style.display === 'none') {
      advancedSection.style.display = 'block';
      toggleBtn.textContent = '▼ Advanced Settings';
    } else {
      advancedSection.style.display = 'none';
      toggleBtn.textContent = '▶ Advanced Settings';
    }
  }
  
  async loadCacheStats() {
    try {
      const stats = await window.electronAPI.invoke('get-cache-stats');
      const cacheStatsDiv = document.getElementById('cacheStats');
      
      if (stats.totalFiles > 0) {
        const oldestDate = new Date(stats.oldestCache * 1000).toLocaleDateString();
        const newestDate = new Date(stats.newestCache * 1000).toLocaleDateString();
        
        cacheStatsDiv.innerHTML = `
          <p style="margin: 0 0 4px 0;"><strong>Cached files:</strong> ${stats.totalFiles}</p>
          <p style="margin: 0 0 4px 0;"><strong>Cache created:</strong> ${oldestDate}</p>
          <p style="margin: 0;"><strong>Last updated:</strong> ${newestDate}</p>
        `;
      } else {
        cacheStatsDiv.innerHTML = '<p style="margin: 0;">No cached files yet. Cache will be built on first scan.</p>';
      }
    } catch (error) {
      document.getElementById('cacheStats').innerHTML = '<p style="margin: 0; color: #e53e3e;">Error loading cache stats</p>';
      console.warn('Failed to load cache stats:', error);
    }
  }
  
  async clearMusicCache() {
    try {
      const confirmClear = confirm('Clear music library cache? This will rebuild the cache on next scan, which may take longer.');
      if (!confirmClear) return;
      
      this.ui.logBoth('info', 'Clearing music library cache...');
      await window.electronAPI.invoke('clear-music-cache');
      this.ui.logBoth('success', 'Music library cache cleared successfully');
      
      // Refresh cache stats
      this.loadCacheStats();
      
      // Suggest rescanning
      const rescan = confirm('Cache cleared. Would you like to rescan the music library now?');
      if (rescan) {
        this.ui.musicLibrary.scanMusicLibrary();
      }
    } catch (error) {
      this.ui.logBoth('error', `Failed to clear cache: ${error.message}`);
    }
  }
}
