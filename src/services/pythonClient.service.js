import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import config from '../config/settings.js';

/**
 * Python Client Service
 * Handles HTTP communication with the Python analysis server
 *
 * This service sends analysis requests to the Python server and handles responses.
 * The Python server will send callbacks when analysis stages complete.
 */

class PythonClientService {
  constructor() {
    this.serverUrl = process.env.PYTHON_SERVER_URL || 'http://127.0.0.1:8000';
    this.callbackUrl = null; // Will be set based on Node server URL
    this.timeout = parseInt(process.env.PYTHON_REQUEST_TIMEOUT_MS || '30000');
    this.isRemote = process.env.ANALYSIS_SERVER_REMOTE === 'true';
  }

  /**
   * Initialize the service with callback URL
   * @param {string} nodeServerUrl - URL of this Node server for callbacks
   */
  initialize(nodeServerUrl) {
    this.callbackUrl = `${nodeServerUrl}/api/analysis/callback`;
    const mode = this.isRemote ? 'REMOTE' : 'LOCAL';
    logger.info(`Python client initialized in ${mode} mode with callback URL: ${this.callbackUrl}`);
  }

  /**
   * Request analysis for a track
   * @param {Object} params - Analysis request parameters
   * @param {string} params.file_path - Absolute path to audio file
   * @param {string} params.track_hash - Unique hash identifying the track
   * @param {Object} params.options - Analysis options
   * @param {boolean} params.options.basic_features - Extract tempo, key, beats, etc.
   * @param {boolean} params.options.characteristics - Extract danceability, energy, etc.
   * @param {boolean} params.options.genre - Genre classification
   * @param {boolean} params.options.stems - Stem separation
   * @param {boolean} params.options.segments - Track segmentation
   * @param {boolean} params.options.transitions - Transition points
   * @returns {Promise<Object>} Response from Python server
   */
  async requestAnalysis({ file_path, track_hash, options = {} }) {
    try {
      // Default to basic features and characteristics for Phase 4
      const analysisOptions = {
        basic_features: options.basic_features !== false,
        characteristics: options.characteristics !== false,
        genre: options.genre || false,
        stems: options.stems || false,
        segments: options.segments || false,
        transitions: options.transitions || false,
      };

      const mode = this.isRemote ? 'REMOTE' : 'LOCAL';
      logger.info(`Requesting analysis for track: ${track_hash} (${mode} mode)`, {
        file_path,
        options: analysisOptions,
      });

      if (this.isRemote) {
        // REMOTE MODE: Send file content via multipart upload
        return await this._requestAnalysisRemote(file_path, track_hash, analysisOptions);
      } else {
        // LOCAL MODE: Send file path via JSON (existing behavior)
        return await this._requestAnalysisLocal(file_path, track_hash, analysisOptions);
      }
    } catch (error) {
      logger.error(`Failed to request analysis for track: ${track_hash}`, {
        error: error.message,
        code: error.code,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw error;
    }
  }

  /**
   * Request analysis in local mode (co-located servers)
   * Sends file path via JSON request
   * @private
   */
  async _requestAnalysisLocal(file_path, track_hash, analysisOptions) {
    const requestBody = {
      file_path,
      track_hash,
      options: analysisOptions,
      callback_url: this.callbackUrl,
      stem_delivery_mode: 'path', // Use path mode for local
    };

    const response = await axios.post(
      `${this.serverUrl}/jobs`,
      requestBody,
      {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info(`Analysis request accepted for track: ${track_hash} (local mode)`, {
      job_id: response.data.job_id,
    });

    return response.data;
  }

  /**
   * Request analysis in remote mode (different machines)
   * Sends file content via multipart upload
   * @private
   */
  async _requestAnalysisRemote(file_path, track_hash, analysisOptions) {
    // Read file content
    const fileContent = await fs.readFile(file_path);
    const filename = path.basename(file_path);
    const ext = path.extname(filename).toLowerCase();

    // Detect content type from extension
    const contentTypeMap = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.aif': 'audio/aiff',
      '.aiff': 'audio/aiff',
      '.alac': 'audio/mp4',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Create multipart form data
    const form = new FormData();
    form.append('file', fileContent, {
      filename: filename,
      contentType: contentType,
    });
    form.append('track_hash', track_hash);
    form.append('options', JSON.stringify(analysisOptions));
    form.append('callback_url', this.callbackUrl);
    form.append('stem_delivery_mode', 'callback'); // Use callback mode for remote

    logger.info(`Uploading audio file to remote analysis server: ${filename} (${fileContent.length} bytes)`);

    const response = await axios.post(
      `${this.serverUrl}/jobs`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 60000, // 60 seconds for file upload
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    logger.info(`Analysis request accepted for track: ${track_hash} (remote mode)`, {
      job_id: response.data.job_id,
      file_size: fileContent.length,
    });

    return response.data;
  }

  /**
   * Get analysis status from Python server
   * @param {string} jobId - Job ID (track hash)
   * @returns {Promise<Object>} Job status
   */
  async getAnalysisStatus(jobId) {
    try {
      const response = await axios.get(
        `${this.serverUrl}/jobs/${jobId}`,
        {
          timeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug(`Job not found on Python server: ${jobId}`);
        return null;
      }

      logger.error(`Failed to get analysis status for job: ${jobId}`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cancel an analysis job on the Python server
   * @param {string} jobId - Job ID (track hash)
   * @returns {Promise<boolean>} True if cancelled successfully
   */
  async cancelAnalysis(jobId) {
    try {
      await axios.delete(
        `${this.serverUrl}/jobs/${jobId}`,
        {
          timeout: 5000,
        }
      );

      logger.info(`Cancelled analysis job: ${jobId}`);
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug(`Job not found on Python server: ${jobId}`);
        return false;
      }

      logger.error(`Failed to cancel analysis job: ${jobId}`, {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Check if Python server is available
   * @returns {Promise<boolean>} True if server is available
   */
  async checkAvailability() {
    try {
      const response = await axios.get(
        `${this.serverUrl}/health`,
        {
          timeout: 5000,
        }
      );

      return response.status === 200 && response.data?.status === 'ok';
    } catch (error) {
      logger.debug('Python server not available:', error.message);
      return false;
    }
  }

  /**
   * Get server statistics
   * @returns {Promise<Object|null>} Server stats or null if unavailable
   */
  async getServerStats() {
    try {
      const response = await axios.get(
        `${this.serverUrl}/stats`,
        {
          timeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      logger.debug('Failed to get server stats:', error.message);
      return null;
    }
  }
}

// Create singleton instance
const pythonClientService = new PythonClientService();

export default pythonClientService;
