// src/main/services/DopplerDeviceClient.js - Direct HTTP communication with Doppler device
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const mime = require('mime-types');

/**
 * Client for communicating with Doppler app's local HTTP server
 */
class DopplerDeviceClient {
  constructor(lanUrl) {
    // Remove trailing slash to avoid double slashes in URLs
    this.baseUrl = lanUrl.replace(/\/$/, '');
    this.deviceInfo = null;
  }

  /**
   * Get device info (supported formats, etc.)
   */
  async getDeviceInfo() {
    try {
      const url = `${this.baseUrl}/info`;
      console.log('📱 Fetching device info from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Device info request failed: ${response.status}`);
      }
      
      this.deviceInfo = await response.json();
      console.log('✅ Device info received');
      console.log('   Supported MIME types:', this.deviceInfo.supported_mimetypes?.length || 0);
      console.log('   Known extensions:', this.deviceInfo.known_file_extensions?.length || 0);
      
      return this.deviceInfo;
      
    } catch (error) {
      console.error('❌ Failed to get device info:', error);
      throw error;
    }
  }

  /**
   * Check if file format is supported by device
   */
  async isFormatSupported(filePath) {
    if (!this.deviceInfo) {
      await this.getDeviceInfo();
    }

    const ext = path.extname(filePath).toLowerCase().slice(1); // Remove leading dot
    const mimeType = mime.lookup(filePath);

    // Check file extension
    const extensionSupported = this.deviceInfo.known_file_extensions?.includes(ext);
    
    // Check MIME type (including x- prefixed variants)
    let mimeSupported = false;
    if (mimeType) {
      mimeSupported = this.deviceInfo.supported_mimetypes?.some(supported => {
        if (supported === mimeType) return true;
        
        // Try x- prefixed version (e.g., audio/x-flac)
        const parts = mimeType.split('/');
        const xVersion = `${parts[0]}/x-${parts[1]}`;
        return supported === xVersion;
      });
    }

    const supported = extensionSupported || mimeSupported;
    
    if (!supported) {
      console.warn(`⚠️  File may not be supported: ${path.basename(filePath)}`);
      console.warn(`   Extension: ${ext}, MIME: ${mimeType}`);
    }

    return supported;
  }

  /**
   * Upload a file to the device
   */
  async uploadFile(filePath, onProgress) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileName = path.basename(filePath);
      const fileStats = fs.statSync(filePath);
      const mimeType = mime.lookup(filePath) || 'application/octet-stream';

      console.log(`📤 Uploading: ${fileName}`);
      console.log(`   Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   MIME: ${mimeType}`);

      // Check format support (warning only, don't block)
      await this.isFormatSupported(filePath);

      // Create multipart form data
      const form = new FormData();
      form.append('filename', fileName);
      form.append('file', fs.createReadStream(filePath), {
        filename: fileName,
        contentType: mimeType,
        knownLength: fileStats.size
      });

      // Upload to device
      const url = `${this.baseUrl}/upload`;
      
      return new Promise((resolve, reject) => {
        form.submit(url, (error, response) => {
          if (error) {
            console.error(`❌ Upload failed for ${fileName}:`, error.message);
            return reject(error);
          }

          if (response.statusCode !== 200) {
            const errorMsg = `Upload failed with status ${response.statusCode}`;
            console.error(`❌ ${errorMsg}`);
            return reject(new Error(errorMsg));
          }

          // Consume response body
          let responseData = '';
          response.on('data', chunk => {
            responseData += chunk;
          });

          response.on('end', () => {
            console.log(`✅ Uploaded: ${fileName}`);
            resolve({
              fileName,
              size: fileStats.size,
              response: responseData
            });
          });

          response.on('error', (err) => {
            console.error(`❌ Response error for ${fileName}:`, err);
            reject(err);
          });
        });
      });

    } catch (error) {
      console.error(`❌ Upload error for ${path.basename(filePath)}:`, error);
      throw error;
    }
  }

  /**
   * Upload multiple files with progress tracking
   */
  async uploadFiles(filePaths, onProgress, onFileComplete) {
    const results = {
      total: filePaths.length,
      uploaded: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      
      try {
        // Report progress
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: filePaths.length,
            file: path.basename(filePath),
            status: 'uploading'
          });
        }

        // Upload file
        await this.uploadFile(filePath);
        
        results.uploaded++;

        // Report completion
        if (onFileComplete) {
          onFileComplete({
            file: path.basename(filePath),
            success: true,
            index: i
          });
        }

      } catch (error) {
        results.failed++;
        results.errors.push({
          file: path.basename(filePath),
          error: error.message
        });

        // Report failure
        if (onFileComplete) {
          onFileComplete({
            file: path.basename(filePath),
            success: false,
            error: error.message,
            index: i
          });
        }

        // Continue with next file
        console.log(`⚠️  Skipping failed file, continuing...`);
      }
    }

    return results;
  }

  /**
   * Test connection to device
   */
  async testConnection() {
    try {
      await this.getDeviceInfo();
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = DopplerDeviceClient;
