// src/main/services/WindowManager.js
// Encapsulates BrowserWindow creation and window state persistence (position/size/maximized)

const { BrowserWindow, screen } = require('electron');

class WindowManager {
  constructor(settings, saveSettingsFn) {
    this.settings = settings || {};
    this.saveSettings = typeof saveSettingsFn === 'function' ? saveSettingsFn : async () => {};
    this.mainWindow = null;
    this._saveTimer = null;
  }

  // Compute initial bounds from saved settings, with safe clamping to visible area
  getInitialBounds() {
    let bounds = this.settings.windowBounds || { width: 1200, height: 800 };
    try {
      const display = screen.getDisplayMatching({
        x: typeof bounds.x === 'number' ? bounds.x : 0,
        y: typeof bounds.y === 'number' ? bounds.y : 0,
        width: bounds.width || 1200,
        height: bounds.height || 800
      });
      const wa = display.workArea;
      const width = Math.min(Math.max(bounds.width || 1200, 400), wa.width);
      const height = Math.min(Math.max(bounds.height || 800, 300), wa.height);
      const hasXY = typeof bounds.x === 'number' && typeof bounds.y === 'number';
      if (!hasXY) {
        // Center if no x/y persisted
        const cx = wa.x + Math.max(0, Math.floor((wa.width - width) / 2));
        const cy = wa.y + Math.max(0, Math.floor((wa.height - height) / 2));
        return { x: cx, y: cy, width, height };
      }
      const minMargin = 12; // keep some space visible on every edge
      const maxX = wa.x + wa.width - minMargin - width;
      const maxY = wa.y + wa.height - minMargin - height;
      const x = Math.min(Math.max(bounds.x, wa.x), Math.max(wa.x, maxX));
      const y = Math.min(Math.max(bounds.y, wa.y), Math.max(wa.y, maxY));
      return { x, y, width, height };
    } catch (_) {
      return { width: 1200, height: 800 };
    }
  }

  queueSaveWindowState() {
    // Keep debounce available if we need it elsewhere, but we also persist immediately
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.persistWindowState('debounced'), 250);
  }

  persistWindowState(source = 'immediate') {
    try {
      if (!this.mainWindow) return;
      const isMax = this.mainWindow.isMaximized();
      const b = isMax ? this.mainWindow.getNormalBounds() : this.mainWindow.getBounds();
      // Update local copy (best effort) for consumers that read it directly
      if (this.settings) {
        this.settings.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
        this.settings.isMaximized = isMax;
      }
      const msg = `[WindowManager] ${source} save → x=${b.x} y=${b.y} w=${b.width} h=${b.height} maximized=${isMax}`;
      console.log(msg);
      // Immediate persist via injected saver; pass patch so owner can merge
      if (this.saveSettings) this.saveSettings({
        windowBounds: { x: b.x, y: b.y, width: b.width, height: b.height },
        isMaximized: isMax
      });
    } catch (err) {
      console.warn('[WindowManager] persistWindowState error:', err?.message || err);
    }
  }

  createMainWindow(options) {
    const initial = this.getInitialBounds();
    const {
      indexPath, // required: absolute path to index.html
      preloadPath, // required: absolute path to preload.js
      iconPath, // optional: path to app icon
      minWidth = 800,
      minHeight = 600,
      titleBarStyle = 'hiddenInset',
      showOnReady = true
    } = options || {};

    console.log('[WindowManager] restoring', JSON.stringify({ initialBounds: initial, isMaximized: this.settings?.isMaximized }));

    const windowConfig = {
      ...(typeof initial.x === 'number' && typeof initial.y === 'number' ? { x: initial.x, y: initial.y } : {}),
      width: initial.width,
      height: initial.height,
      minWidth,
      minHeight,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: preloadPath
      },
      titleBarStyle,
      show: false
    };

    // Add icon if provided (works in dev mode)
    if (iconPath) {
      windowConfig.icon = iconPath;
    }

    this.mainWindow = new BrowserWindow(windowConfig);

    // Load UI
    if (!indexPath) throw new Error('WindowManager.createMainWindow requires indexPath');
    this.mainWindow.loadFile(indexPath);

    // Show + restore maximized state
    this.mainWindow.once('ready-to-show', () => {
      if (showOnReady) this.mainWindow.show();
      if (this.settings.isMaximized) {
        this.mainWindow.maximize();
      }
      // Post-show corrective setBounds in case OS/WM adjusted placement
      try {
        const b = this.settings.windowBounds;
        if (b && typeof b.x === 'number' && typeof b.y === 'number') {
          const current = this.mainWindow.getBounds();
          const sizable = !this.mainWindow.isMaximized();
          if (sizable && (current.x !== b.x || current.y !== b.y || current.width !== b.width || current.height !== b.height)) {
            console.log('[WindowManager] corrective setBounds', JSON.stringify({ from: current, to: b }));
            this.mainWindow.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
          }
        }
      } catch (_) {}
    });

    // Persist state
    this.mainWindow.on('move', () => this.persistWindowState('move'));
    this.mainWindow.on('resize', () => this.persistWindowState('resize'));
    this.mainWindow.on('maximize', () => this.persistWindowState('maximize'));
    this.mainWindow.on('unmaximize', () => this.persistWindowState('unmaximize'));

    // Ensure we persist at close even if user never moved/resized
    this.mainWindow.on('close', () => this.persistWindowState('close'));

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }
}

module.exports = WindowManager;


