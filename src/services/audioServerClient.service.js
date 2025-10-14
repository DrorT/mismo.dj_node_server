import WebSocket from 'ws';
import logger from '../utils/logger.js';
import path from 'path';

/**
 * Audio Server WebSocket Client Service
 * Handles WebSocket communication with the C++ audio server
 *
 * This service connects to the audio server's WebSocket endpoint and responds
 * to getTrackInfo requests by providing track metadata and analysis data.
 */

class AudioServerClientService {
  constructor() {
    this.ws = null;
    this.serverUrl = process.env.AUDIO_SERVER_WS_URL || 'ws://localhost:8080';
    this.reconnectDelay = parseInt(process.env.AUDIO_SERVER_RECONNECT_DELAY || '1000');
    this.maxReconnectDelay = parseInt(process.env.AUDIO_SERVER_MAX_RECONNECT_DELAY || '30000');
    this.currentReconnectDelay = this.reconnectDelay;
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.shouldReconnect = true;
    this.messageHandlers = new Map();
    this.isInitialized = false;

    // Services will be injected during initialization
    this.trackService = null;
    this.libraryDirectoryService = null;
  }

  /**
   * Initialize the service with required dependencies
   * @param {Object} services - Required services
   * @param {Object} services.trackService - Track service for database queries
   * @param {Object} services.libraryDirectoryService - Library directory service
   */
  initialize({ trackService, libraryDirectoryService }) {
    if (this.isInitialized) {
      logger.warn('AudioServerClientService already initialized');
      return;
    }

    this.trackService = trackService;
    this.libraryDirectoryService = libraryDirectoryService;
    this.isInitialized = true;

    logger.info('AudioServerClientService initialized');
  }

  /**
   * Connect to the audio server WebSocket
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.isInitialized) {
      throw new Error('AudioServerClientService must be initialized before connecting');
    }

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      logger.debug('Already connected or connecting to audio server');
      return;
    }

    this.isConnecting = true;
    logger.info(`Connecting to audio server at ${this.serverUrl}...`);

    try {
      this.ws = new WebSocket(this.serverUrl);

      // Set up event handlers
      this.ws.on('open', this.handleOpen.bind(this));
      this.ws.on('message', this.handleMessage.bind(this));
      this.ws.on('close', this.handleClose.bind(this));
      this.ws.on('error', this.handleError.bind(this));

      // Wait for connection to open or fail
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        this.ws.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.ws.once('error', error => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Handle WebSocket connection open
   */
  handleOpen() {
    this.isConnecting = false;
    this.currentReconnectDelay = this.reconnectDelay; // Reset backoff

    // IMMEDIATELY send identification message
    this.ws.send(
      JSON.stringify({
        type: 'appServerIdentify',
      })
    );

    logger.info('✓ Connected to audio server');
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Buffer} data - Raw message data
   */
  async handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      logger.info(`Received message from audio server: ${data}`);

      if (message.event) {
        // TODO: in the future deal with server event messages, at the moment ignore
        return;
      }

      if (message.success && !message.success) {
        // TODO: in the future maybe check if these message are relevant to us, at the moment does not seem relevant
        return;
      }

      if (message.success && message.message === 'App server registered successfully') {
        logger.info('✓ Successfully registered with audio server');
        return;
      }

      if (message.type && message.type === 'welcome') {
        logger.info('connected to audio server version:', message.version);
        return;
      }

      // Validate message structure
      if (!message.command) {
        logger.warn(`Received message without command field: ${data}`);
        this.sendError(null, 'Invalid message format: missing command field');
        return;
      }

      // Route message to appropriate handler
      switch (message.command) {
        case 'getTrackInfo':
          await this.handleGetTrackInfo(message);
          break;
        default:
          logger.warn(`Unknown command: ${message.command}`);
          this.sendError(message.trackId || null, `Unknown command: ${message.command}`);
      }
    } catch (error) {
      logger.error('Error parsing message from audio server:', error);
      this.sendError(null, 'Failed to parse message');
    }
  }

  /**
   * Handle WebSocket connection close
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  handleClose(code, reason) {
    logger.info(`Connection to audio server closed (code: ${code}, reason: ${reason || 'none'})`);
    this.ws = null;
    this.isConnecting = false;

    // Attempt reconnection with exponential backoff
    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket errors
   * @param {Error} error - Error object
   */
  handleError(error) {
    logger.error('Audio server WebSocket error:', error.message);
    // Don't set isConnecting to false here - let handleClose do it
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    logger.info(`Scheduling reconnection in ${this.currentReconnectDelay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed:', error.message);
        // Increase delay with exponential backoff
        this.currentReconnectDelay = Math.min(
          this.currentReconnectDelay * 2,
          this.maxReconnectDelay
        );
        this.scheduleReconnect();
      }
    }, this.currentReconnectDelay);
  }

  /**
   * Handle getTrackInfo command from audio server
   * @param {Object} message - Message object
   * @param {string} message.trackId - Track UUID
   * @param {boolean} message.stems - Whether to include stems
   */
  async handleGetTrackInfo(message) {
    const { trackId, stems = false } = message;

    if (!trackId) {
      logger.warn('getTrackInfo request missing trackId');
      this.sendError(null, 'Missing trackId parameter');
      return;
    }

    try {
      // Get track from database
      const track = await this.trackService.getTrackById(trackId);

      if (!track) {
        logger.warn(`Track not found: ${trackId}`);
        this.sendError(trackId, 'Track not found');
        return;
      }

      // Build absolute file path
      const libraryDirectory = await this.libraryDirectoryService.getDirectoryById(
        track.library_directory_id
      );
      if (!libraryDirectory) {
        logger.error(`Library directory not found for track ${trackId}`);
        this.sendError(trackId, 'Library directory not found');
        return;
      }

      const absolutePath = path.join(libraryDirectory.path, track.relative_path);

      // Check if file exists and is accessible
      const fs = await import('fs/promises');
      try {
        await fs.access(absolutePath);
      } catch (error) {
        logger.warn(`Track file not accessible: ${absolutePath}`);
        this.sendError(trackId, 'Track file missing');
        return;
      }

      // Check if track has been analyzed
      const hasAnalysis = track.bpm && track.bpm > 0;
      if (!hasAnalysis) {
        logger.warn(`Track not analyzed: ${trackId}`);
        this.sendError(trackId, 'Analysis not complete');
        return;
      }

      // Parse beats and downbeats data
      let beatsData = [];
      let downbeatsData = [];

      if (track.beats_data) {
        try {
          beatsData = JSON.parse(track.beats_data);
        } catch (error) {
          logger.warn(`Failed to parse beats_data for track ${trackId}`);
        }
      }

      if (track.downbeats_data) {
        try {
          downbeatsData = JSON.parse(track.downbeats_data);
        } catch (error) {
          logger.warn(`Failed to parse downbeats_data for track ${trackId}`);
        }
      }

      // Send success response
      const response = {
        success: true,
        requestId: message.requestId,
        trackId: trackId,
        filePath: absolutePath,
        bpm: track.bpm || 0,
        key: String(track.musical_key),
        mode: String(track.mode),
        beats_data: beatsData,
        downbeats_data: downbeatsData,
      };

      // TODO: Handle stems in future phase
      if (stems) {
        response.stems = [];
      }

      this.send(response);
      logger.info(`✓ Sent track info for ${trackId} (${track.title} by ${track.artist})`);
    } catch (error) {
      logger.error(`Error handling getTrackInfo for ${trackId}:`, error);
      this.sendError(trackId, 'Internal server error');
    }
  }

  /**
   * Send a message to the audio server
   * @param {Object} message - Message object to send
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error('Cannot send message: WebSocket not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
      logger.debug('Sent message to audio server:', message);
    } catch (error) {
      logger.error('Error sending message to audio server:', error);
    }
  }

  /**
   * Send an error response to the audio server
   * @param {string|null} trackId - Track ID (if available)
   * @param {string} errorMessage - Error message
   */
  sendError(trackId, errorMessage) {
    this.send({
      success: false,
      trackId: trackId || '',
      error: errorMessage,
    });
  }

  /**
   * Disconnect from the audio server
   */
  disconnect() {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      logger.info('Disconnecting from audio server...');
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
  }

  /**
   * Check if connected to audio server
   * @returns {boolean}
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      serverUrl: this.serverUrl,
      reconnectDelay: this.currentReconnectDelay,
    };
  }
}

// Export singleton instance
const audioServerClientService = new AudioServerClientService();
export default audioServerClientService;
