// src/main/services/WebSocketPairingService.js - Doppler Wi-Fi Transfer Pairing
const { EventEmitter } = require('events');
const WebSocket = require('ws');
const crypto = require('crypto');
const QRCode = require('qrcode');

// UUID v4 generator (CommonJS compatible)
function uuidv4() {
  return crypto.randomUUID();
}

const API_DOMAIN = 'doppler-transfer.com';
const PAIRING_TIMEOUT = 60000; // 60 seconds

/**
 * Handles pairing with Doppler's Wi-Fi Transfer service
 * Based on reverse-engineered protocol from doppler-transfer.com
 */
class WebSocketPairingService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.code = null;
    this.sessionId = null;
    this.messageQueue = [];
    this.connected = false;
  }

  /**
   * Connect to Doppler Transfer pairing service
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.sessionId = uuidv4();
      const wsUrl = `wss://${API_DOMAIN}/api/v1/code?id=${this.sessionId}`;
      
      console.log('📱 Connecting to Doppler pairing service...');
      console.log(`   Session ID: ${this.sessionId}`);
      
      this.ws = new WebSocket(wsUrl);
      
      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.cleanup();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.ws.on('open', () => {
        console.log('✅ WebSocket connected');
        this.connected = true;
        clearTimeout(timeout);
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📨 Received message:', message);
          
          // Handle code assignment
          if (message.type === 'code' || message.code) {
            this.code = message.code;
            this.emit('code-received', this.code);
            console.log(`🔢 Pairing code: ${this.code}`);
            resolve({ code: this.code, sessionId: this.sessionId });
          } else {
            // Queue other messages for later processing
            this.messageQueue.push(message);
            this.emit('message', message);
          }
        } catch (error) {
          console.error('❌ Failed to parse message:', error);
          this.emit('error', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.emit('error', error);
        clearTimeout(timeout);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('📱 WebSocket closed');
        this.connected = false;
        this.emit('disconnected');
      });
    });
  }

  /**
   * Get the 6-digit pairing code
   */
  getPairingCode() {
    return this.code;
  }

  /**
   * Generate QR code as data URL
   */
  async generateQRCode() {
    if (!this.code) {
      throw new Error('No pairing code available');
    }
    
    try {
      // QR code contains just the 6-digit code
      const qrDataUrl = await QRCode.toDataURL(this.code, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 300,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      return qrDataUrl;
    } catch (error) {
      console.error('❌ QR code generation failed:', error);
      throw error;
    }
  }

  /**
   * Wait for device to pair using the code
   */
  async waitForDevice(timeoutMs = PAIRING_TIMEOUT) {
    return new Promise((resolve, reject) => {
      console.log('⏳ Waiting for device to pair...');
      
      const timeout = setTimeout(() => {
        reject(new Error('Device pairing timeout'));
      }, timeoutMs);

      const checkQueue = () => {
        // Look for device 'exists' message with device ID
        const existsMsgIndex = this.messageQueue.findIndex(
          msg => msg.type === 'exists' && msg.device
        );
        
        if (existsMsgIndex !== -1) {
          const existsMsg = this.messageQueue.splice(existsMsgIndex, 1)[0];
          clearTimeout(timeout);
          console.log('✅ Device paired:', existsMsg);
          // Return device info in expected format
          resolve({
            id: existsMsg.device,
            name: existsMsg.name || 'iPhone',
            push_token: existsMsg.push_token
          });
        }
      };

      // Check existing queue
      checkQueue();

      // Listen for new messages
      const messageHandler = (message) => {
        if (message.type === 'exists' && message.device) {
          clearTimeout(timeout);
          this.removeListener('message', messageHandler);
          console.log('✅ Device paired:', message);
          // Return device info in expected format
          resolve({
            id: message.device,
            name: message.name || 'iPhone',
            push_token: message.push_token
          });
        }
      };

      this.on('message', messageHandler);

      // Also check queue periodically in case message arrived before listener
      const queueCheck = setInterval(() => {
        checkQueue();
      }, 100);

      // Clean up interval on completion
      const cleanup = () => clearInterval(queueCheck);
      this.once('disconnected', cleanup);
      setTimeout(cleanup, timeoutMs);
    });
  }

  /**
   * Confirm device pairing and get LAN URL
   */
  async confirmDevice(device, isSaved = true) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        return reject(new Error('Not connected to pairing service'));
      }

      console.log('📱 Confirming device pairing...');

      // Prepare confirmation message
      const confirmation = {
        ...device,
        is_saved: isSaved
      };

      // Send confirmation
      this.ws.send(JSON.stringify(confirmation), (error) => {
        if (error) {
          console.error('❌ Failed to send confirmation:', error);
          return reject(error);
        }
        console.log('✅ Confirmation sent');
      });

      // Wait for LAN URL response
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for LAN URL'));
      }, 10000);

      let lanUrl = null;
      let pushToken = null;
      let messagesReceived = 0;
      
      const lanUrlHandler = (message) => {
        // Look for LAN URL
        if (message.url_lan || message.lan_url) {
          lanUrl = message.url_lan || message.lan_url;
          console.log('✅ Received LAN URL:', lanUrl);
          messagesReceived++;
        }
        
        // Look for push token (might be in same or different message)
        if (message.push_token) {
          pushToken = message.push_token;
          console.log('✅ Received push token');
          messagesReceived++;
        }
        
        // If we have both (or just LAN URL after timeout), resolve
        // Push token might not always be present for initial pairing
        if (lanUrl) {
          clearTimeout(timeout);
          this.removeListener('message', lanUrlHandler);
          
          // Use device ID as fallback for push_token if not provided
          resolve({
            lanUrl,
            pushToken: pushToken || { deviceId: device.id, token: this.sessionId },
            device
          });
        }
      };

      this.on('message', lanUrlHandler);
    });
  }

  /**
   * Reconnect to saved device using push token
   */
  async getSavedDevice(deviceInfo) {
    if (!deviceInfo || !deviceInfo.push_token) {
      throw new Error('Invalid device info - push_token required');
    }

    console.log('📱 Requesting reconnection to saved device...');

    // First, connect to get a new pairing code
    await this.connect();

    // Send request for specific device
    const request = {
      code: this.code,
      push_token: deviceInfo.push_token
    };

    try {
      const response = await fetch(`https://${API_DOMAIN}/api/v0/request-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      // The endpoint returns 500 on success (weird but that's how it works)
      if (response.status !== 200 && response.status !== 500) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      console.log('✅ Push notification sent to device');
      console.log('   User should open Doppler app...');

      // Wait for device to respond
      const device = await this.waitForDevice();
      
      // Verify it's the same device
      if (device.id !== deviceInfo.id) {
        throw new Error('Different device responded - expected ' + deviceInfo.id);
      }

      return device;

    } catch (error) {
      console.error('❌ Failed to reconnect to saved device:', error);
      throw error;
    }
  }

  /**
   * Disconnect and clean up
   */
  disconnect() {
    console.log('📱 Disconnecting pairing service...');
    this.cleanup();
  }

  /**
   * Clean up WebSocket and resources
   */
  cleanup() {
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    
    this.connected = false;
    this.messageQueue = [];
    this.code = null;
  }
}

module.exports = WebSocketPairingService;
