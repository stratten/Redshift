// src/main/services/PythonBridge.js - Bundled Python runtime bridge
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class PythonBridge {
  constructor() {
    this.pythonPath = null;
    this.pymobiledevice3Path = null;
    this._initialized = false;
  }

  /**
   * Initialize paths to bundled Python and pymobiledevice3
   */
  initialize() {
    if (this._initialized) return;

    const isPackaged = app.isPackaged;
    const resourcesPath = isPackaged 
      ? process.resourcesPath 
      : path.join(__dirname, '..', '..', '..', 'resources');

    // Path to bundled Python
    const bundledPythonPath = path.join(resourcesPath, 'python', 'python', 'bin', 'python3');
    
    // Path to pymobiledevice3 in bundled deps
    const bundledPymobiledevice3 = path.join(
      resourcesPath, 
      'python-deps', 
      'bin', 
      'pymobiledevice3'
    );

    // Check if bundled Python exists
    if (fs.existsSync(bundledPythonPath)) {
      this.pythonPath = bundledPythonPath;
      console.log('✅ Using bundled Python:', this.pythonPath);
    } else {
      // Fall back to system Python
      this.pythonPath = 'python3';
      console.log('⚠️  Bundled Python not found, using system python3');
    }

    // Set pymobiledevice3 path
    if (fs.existsSync(bundledPymobiledevice3)) {
      this.pymobiledevice3Path = bundledPymobiledevice3;
      console.log('✅ Using bundled pymobiledevice3');
    } else {
      // For development, use system-installed pymobiledevice3
      this.pymobiledevice3Path = null;
      console.log('⚠️  Bundled pymobiledevice3 not found, will try system installation');
    }

    this._initialized = true;
  }

  /**
   * Get the command to run pymobiledevice3
   * @param {string} subcommand - e.g., "afc ls /Documents"
   * @returns {string} - Full command to execute
   */
  getPymobiledevice3Command(subcommand) {
    if (!this._initialized) this.initialize();

    if (this.pymobiledevice3Path) {
      // Use bundled version with bundled Python
      // Set PYTHONPATH to include bundled dependencies
      // pymobiledevice3Path is already: resources/python-deps/bin/pymobiledevice3
      // So we just need to go up one directory to get to python-deps/
      const pythonDepsPath = path.dirname(path.dirname(this.pymobiledevice3Path));
      
      // Quote paths to handle spaces in directory names
      const pythonPath = `"${this.pythonPath}"`;
      
      // Use -m to run pymobiledevice3 as a module with PYTHONPATH set
      return `PYTHONPATH="${pythonDepsPath}" ${pythonPath} -m pymobiledevice3 ${subcommand}`;
    } else {
      // Try system installations
      return [
        `pymobiledevice3 ${subcommand}`,           // pipx install
        `python3 -m pymobiledevice3 ${subcommand}` // pip install
      ];
    }
  }

  /**
   * Get Python executable path
   * @returns {string}
   */
  getPythonPath() {
    if (!this._initialized) this.initialize();
    return this.pythonPath;
  }
}

// Export singleton instance
module.exports = new PythonBridge();
