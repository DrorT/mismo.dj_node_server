import WebSocket from 'ws';
import logger from '../utils/logger.js';
import path from 'path';
import audioServerService from './audioServer.service.js';

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
    this.pingInterval = null;
    this.pingIntervalMs = parseInt(process.env.AUDIO_SERVER_PING_INTERVAL || '30000'); // 30 seconds

    // Services will be injected during initialization
    this.trackService = null;
    this.libraryDirectoryService = null;
    this.analysisQueueService = null;
  }

  /**
   * Initialize the service with required dependencies
   * @param {Object} services - Required services
   * @param {Object} services.trackService - Track service for database queries
   * @param {Object} services.libraryDirectoryService - Library directory service
   * @param {Object} services.analysisQueueService - Analysis queue service for requesting analysis
   */
  initialize({ trackService, libraryDirectoryService, analysisQueueService }) {
    if (this.isInitialized) {
      logger.warn('AudioServerClientService already initialized');
      return;
    }

    this.trackService = trackService;
    this.libraryDirectoryService = libraryDirectoryService;
    this.analysisQueueService = analysisQueueService;
    this.isInitialized = true;

    logger.info('AudioServerClientService initialized');
  }

  /**
   * Connect to the audio server WebSocket
   * @returns {Promise<void>}
   */
  async connect() {
    const attemptId = Date.now();
    logger.info(`[WS-CONNECT-${attemptId}] Connection attempt initiated`);

    if (!this.isInitialized) {
      logger.error(`[WS-CONNECT-${attemptId}] Cannot connect: service not initialized`);
      throw new Error('AudioServerClientService must be initialized before connecting');
    }

    if (this.isConnecting) {
      logger.warn(`[WS-CONNECT-${attemptId}] Already connecting, aborting this attempt`);
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.warn(`[WS-CONNECT-${attemptId}] Already connected, aborting this attempt`);
      return;
    }

    // Wait for audio server to be ready before connecting
    if (!audioServerService.isReady) {
      logger.info(`[WS-CONNECT-${attemptId}] Waiting for audio server to be ready...`);
      const isReady = await audioServerService.waitForReady(30000); // Wait up to 30s
      if (!isReady) {
        logger.error(`[WS-CONNECT-${attemptId}] Audio server not ready after 30s timeout`);
        throw new Error('Audio server is not ready');
      }
      logger.info(`[WS-CONNECT-${attemptId}] Audio server is ready`);
    }

    this.isConnecting = true;
    logger.info(`[WS-CONNECT-${attemptId}] Creating WebSocket connection to ${this.serverUrl}`);

    try {
      this.ws = new WebSocket(this.serverUrl);
      logger.info(`[WS-CONNECT-${attemptId}] WebSocket object created, setting up event handlers`);

      // Set up event handlers
      this.ws.on('open', this.handleOpen.bind(this));
      this.ws.on('message', this.handleMessage.bind(this));
      this.ws.on('close', this.handleClose.bind(this));
      this.ws.on('error', this.handleError.bind(this));
      this.ws.on('ping', this.handlePing.bind(this));
      this.ws.on('pong', this.handlePong.bind(this));

      // Wait for connection to open or fail
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          logger.error(`[WS-CONNECT-${attemptId}] Connection timeout after 5s`);
          reject(new Error('Connection timeout'));
        }, 5000);

        this.ws.once('open', () => {
          clearTimeout(timeout);
          logger.info(`[WS-CONNECT-${attemptId}] Connection opened successfully`);
          resolve();
        });

        this.ws.once('error', error => {
          clearTimeout(timeout);
          logger.error(`[WS-CONNECT-${attemptId}] Connection error:`, error.message);
          reject(error);
        });
      });
    } catch (error) {
      this.isConnecting = false;
      logger.error(`[WS-CONNECT-${attemptId}] Connection failed:`, error.message);
      throw error;
    }
  }

  /**
   * Handle WebSocket connection open
   */
  handleOpen() {
    this.isConnecting = false;
    this.currentReconnectDelay = this.reconnectDelay; // Reset backoff

    const connectionId = Date.now();
    logger.info(`[WS-${connectionId}] WebSocket connection opened`);

    // IMMEDIATELY send identification message
    this.ws.send(
      JSON.stringify({
        type: 'appServerIdentify',
      })
    );
    logger.info(`[WS-${connectionId}] Sent appServerIdentify message`);

    // Start keepalive pings to prevent idle timeout
    this.startPingInterval();
    logger.info(`[WS-${connectionId}] Started keepalive pings (every ${this.pingIntervalMs}ms)`);

    logger.info(`[WS-${connectionId}] ✓ Connected to audio server`);
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Buffer} data - Raw message data
   */
  async handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      if (message && (!message.event || message.event !== 'deckStateUpdate'))
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
    const reasonStr = reason ? reason.toString() : 'none';
    logger.warn(`[WS-CLOSE] Connection to audio server closed`);
    logger.warn(`[WS-CLOSE]   Code: ${code}`);
    logger.warn(`[WS-CLOSE]   Reason: ${reasonStr}`);
    logger.warn(`[WS-CLOSE]   Reconnect enabled: ${this.shouldReconnect}`);

    this.ws = null;
    this.isConnecting = false;

    // Stop ping interval
    this.stopPingInterval();

    // Attempt reconnection with exponential backoff
    if (this.shouldReconnect) {
      logger.info(`[WS-CLOSE] Scheduling reconnection in ${this.currentReconnectDelay}ms`);
      this.scheduleReconnect();
    } else {
      logger.info(`[WS-CLOSE] Reconnect disabled, not reconnecting`);
    }
  }

  /**
   * Handle WebSocket errors
   * @param {Error} error - Error object
   */
  handleError(error) {
    logger.error('[WS-ERROR] Audio server WebSocket error:', error.message);
    logger.error('[WS-ERROR]   Error code:', error.code || 'none');
    logger.error('[WS-ERROR]   Error type:', error.type || 'none');
    if (error.stack) {
      logger.error('[WS-ERROR]   Stack:', error.stack);
    }
    // Don't set isConnecting to false here - let handleClose do it
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      logger.warn('[WS-RECONNECT] Reconnection already scheduled, skipping');
      return; // Already scheduled
    }

    logger.info(`[WS-RECONNECT] Scheduling reconnection in ${this.currentReconnectDelay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      logger.info('[WS-RECONNECT] Attempting reconnection now');

      try {
        await this.connect();
        logger.info('[WS-RECONNECT] Reconnection successful');
      } catch (error) {
        logger.error('[WS-RECONNECT] Reconnection failed:', error.message);
        // Increase delay with exponential backoff
        const oldDelay = this.currentReconnectDelay;
        this.currentReconnectDelay = Math.min(
          this.currentReconnectDelay * 2,
          this.maxReconnectDelay
        );
        logger.info(
          `[WS-RECONNECT] Increasing backoff delay from ${oldDelay}ms to ${this.currentReconnectDelay}ms`
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
        logger.warn(`Track not analyzed: ${trackId}, requesting analysis`);

        // Create analysis job with callback metadata to notify audio server when done
        try {
          await this.analysisQueueService.requestAnalysis(
            track.id,
            { basic_features: true, characteristics: false },
            'high', // High priority for audio server requests
            {
              type: 'audio_server_track_info',
              trackId: trackId,
              requestId: message.requestId,
            }
          );

          logger.info(
            `Analysis job created for track ${trackId}, will notify audio server when complete`
          );
          this.sendError(trackId, 'Analysis in progress');
        } catch (error) {
          logger.error(`Failed to create analysis job for track ${trackId}:`, error);
          this.sendError(trackId, 'Failed to start analysis');
        }
        return;
      }

      // Check if stems are requested and not available
      if (stems && !track.stems_path) {
        logger.info(
          `Stems requested for track ${trackId} but not available, creating stem separation job`
        );

        // Create stem separation job with callback metadata
        try {
          await this.analysisQueueService.requestAnalysis(
            track.id,
            { stems: true, basic_features: false, characteristics: false },
            'normal', // Normal priority for stem separation (it's slow)
            {
              type: 'audio_server_stems',
              trackId: trackId,
              requestId: message.requestId,
            }
          );

          logger.info(
            `Stem separation job created for track ${trackId}, will notify audio server when ready`
          );
        } catch (error) {
          logger.error(`Failed to create stem separation job for track ${trackId}:`, error);
        }

        // Note: We don't return here - we still send the track info without stems
        // The audio server will receive stems later via a separate notification
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

      // Include stems if requested and available
      if (stems) {
        if (track.stems_path) {
          // Stems are available - include the path
          response.stems_path = track.stems_path;
          logger.info(`Including stems path for track ${trackId}: ${track.stems_path}`);
        } else {
          // Stems not available yet (job created above)
          response.stems_path = null;
          logger.info(`Stems not available for track ${trackId}, job created`);
        }
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
   * Start sending periodic pings to keep connection alive
   */
  startPingInterval() {
    // Clear any existing interval
    this.stopPingInterval();

    logger.info(`[WS-KEEPALIVE] Starting keepalive (ping every ${this.pingIntervalMs}ms)`);

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          const timestamp = Date.now();
          this.ws.ping();
          logger.info(`[WS-KEEPALIVE] Sent ping to audio server at ${timestamp}`);
        } catch (error) {
          logger.error('[WS-KEEPALIVE] Error sending ping to audio server:', error.message);
        }
      } else {
        const state = this.ws ? this.ws.readyState : 'null';
        logger.warn(`[WS-KEEPALIVE] Cannot send ping, socket state: ${state}`);
      }
    }, this.pingIntervalMs);
  }

  /**
   * Stop the ping interval
   */
  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      logger.info('[WS-KEEPALIVE] Stopped WebSocket keepalive');
    }
  }

  /**
   * Handle ping from audio server (auto-respond with pong)
   */
  handlePing() {
    const timestamp = Date.now();
    logger.info(`[WS-KEEPALIVE] Received ping from audio server at ${timestamp} (auto-ponging)`);
    // The 'ws' library automatically responds to pings with pongs
  }

  /**
   * Handle pong from audio server
   */
  handlePong() {
    const timestamp = Date.now();
    logger.info(`[WS-KEEPALIVE] Received pong from audio server at ${timestamp}`);
  }

  /**
   * Disconnect from the audio server
   */
  disconnect() {
    this.shouldReconnect = false;

    // Stop ping interval
    this.stopPingInterval();

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

  /**
   * Send track info to audio server (called after analysis completes)
   * @param {string} trackId - Track UUID
   * @param {string} requestId - Original request ID (optional)
   */
  async sendTrackInfo(trackId, requestId = null) {
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
        requestId: requestId,
        trackId: trackId,
        filePath: absolutePath,
        bpm: track.bpm || 0,
        key: String(track.musical_key),
        mode: String(track.mode),
        beats_data: beatsData,
        downbeats_data: downbeatsData,
      };

      this.send(response);
      logger.info(`✓ Sent track info for ${trackId} (${track.title} by ${track.artist})`);
    } catch (error) {
      logger.error(`Error sending track info for ${trackId}:`, error);
      this.sendError(trackId, 'Internal server error');
    }
  }

  /**
   * Send stems notification to audio server (called after stem separation completes)
   * @param {string} trackId - Track UUID
   * @param {string} stemsPath - Path to stems directory
   * @param {string} requestId - Original request ID (optional)
   */
  async sendStemsReady(trackId, stemsPath, requestId = null) {
    try {
      if (!this.isConnected()) {
        logger.warn(`Cannot send stems notification: not connected to audio server`);
        return;
      }

      // Send notification that stems are ready
      const response = {
        success: true,
        type: 'stemsReady',
        requestId: requestId,
        trackId: trackId,
        stems_path: stemsPath,
      };

      this.send(response);
      logger.info(`✓ Notified audio server that stems are ready for track ${trackId}`);
    } catch (error) {
      logger.error(`Error sending stems notification for ${trackId}:`, error);
    }
  }
}

// Export singleton instance
const audioServerClientService = new AudioServerClientService();
export default audioServerClientService;
