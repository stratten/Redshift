// src/main/services/AppSettingsService.js
// Loads/saves app settings JSON and provides helpers

const fs = require('fs-extra');
const path = require('path');

class AppSettingsService {
  constructor(electronApp, appDataSubdir = 'Redshift') {
    this.app = electronApp;
    // Normalize settings to live directly under userData to avoid nested paths like .../redshift/Redshift
    this.userDataPath = this.app.getPath('userData');
    this.appDataPath = this.userDataPath;
    this.settingsPath = path.join(this.appDataPath, 'settings.json');
    // Legacy nested location kept for migration
    this.legacyAppDataPath = path.join(this.userDataPath, appDataSubdir);
    this.legacySettingsPath = path.join(this.legacyAppDataPath, 'settings.json');
    this.settings = null;
  }

  async ensureDirs() {
    await fs.ensureDir(this.appDataPath);
  }

  async load(defaults) {
    await this.ensureDirs();
    await this._maybeMigrateLegacySettings();
    const baseDefaults = { ...(defaults || {}) };
    if (await fs.pathExists(this.settingsPath)) {
      try {
        // Guard against empty files which cause JSON.parse errors
        const raw = await fs.readFile(this.settingsPath, 'utf8');
        if (!raw || raw.trim().length === 0) {
          throw new SyntaxError('settings.json is empty');
        }

        const saved = await fs.readJson(this.settingsPath);
        this.settings = { ...baseDefaults, ...saved };
      } catch (error) {
        // Backup the corrupt/empty file and regenerate defaults
        await this._backupCorruptSettingsFile(error);
        this.settings = { ...baseDefaults };
        await this.save();
      }
    } else {
      this.settings = { ...baseDefaults };
      await this.save();
    }
    return this.settings;
  }

  async save() {
    await fs.writeJson(this.settingsPath, this.settings, { spaces: 2 });
  }

  async _backupCorruptSettingsFile(error) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = this.settingsPath.replace(/\.json$/i, `.${timestamp}.corrupt.json`);
      if (await fs.pathExists(this.settingsPath)) {
        await fs.move(this.settingsPath, backupPath, { overwrite: false });
      }
    } catch (_) {
      // Intentionally swallow backup errors to avoid blocking startup
    }
  }

  async _maybeMigrateLegacySettings() {
    try {
      const hasCurrent = await fs.pathExists(this.settingsPath);
      const hasLegacy = await fs.pathExists(this.legacySettingsPath);
      if (!hasCurrent && hasLegacy) {
        await fs.ensureDir(path.dirname(this.settingsPath));
        await fs.move(this.legacySettingsPath, this.settingsPath, { overwrite: true });
        // Attempt to clean up empty legacy directory (best-effort)
        try {
          const entries = await fs.readdir(this.legacyAppDataPath);
          if (!entries || entries.length === 0) {
            await fs.remove(this.legacyAppDataPath);
          }
        } catch (_) {}
      }
    } catch (_) {
      // Best-effort migration; ignore failures
    }
  }
}

module.exports = AppSettingsService;


