// LoggingService.js - Centralized logging utilities

class LoggingService {
  constructor() {
    this.logArea = document.getElementById('logArea');
  }
  
  /**
   * Add a log entry to the UI log area
   * @param {string} type - Log type: 'info', 'success', 'warning', 'error'
   * @param {string} message - Log message
   */
  addLog(type, message) {
    if (!this.logArea) {
      // Log area removed from UI, skip DOM logging
      return;
    }
    
    const time = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-type log-${type}">[${type.toUpperCase()}]</span>
      <span>${message}</span>
    `;
    
    this.logArea.appendChild(logEntry);
    this.logArea.scrollTop = this.logArea.scrollHeight;
    
    // Keep only last 100 log entries
    while (this.logArea.children.length > 100) {
      this.logArea.removeChild(this.logArea.firstChild);
    }
  }
  
  /**
   * Log to both browser console, UI, and terminal
   * @param {string} type - Log type: 'info', 'success', 'warning', 'error'
   * @param {string} message - Log message
   * @param {string} prefix - Emoji prefix (default: '🎵')
   */
  logBoth(type, message, prefix = '🎵') {
    // Log to browser console with emoji prefix
    const consoleMessage = `${prefix} ${message}`;
    switch(type) {
      case 'error':
        console.error(consoleMessage);
        break;
      case 'warning':
        console.warn(consoleMessage);
        break;
      case 'info':
      case 'success':
      default:
        console.log(consoleMessage);
        break;
    }
    
    // Also log to UI 
    this.addLog(type, message);
    
    // Send to terminal via main process
    try {
      window.electronAPI.invoke('log-to-terminal', { type, message: `${prefix} ${message}` });
    } catch (error) {
      console.error('Failed to send log to terminal:', error);
    }
  }
}

