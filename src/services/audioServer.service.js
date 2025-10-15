import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import WebSocket from 'ws';
import logger from '../utils/logger.js';

/**
 * Audio Server Service
 * Manages the C++ audio server lifecycle - health checks, startup, shutdown, monitoring
 */

class AudioServerService {
  constructor() {
    this.serverProcess = null;
    this.httpUrl = process.env.AUDIO_SERVER_HTTP_URL || 'http://127.0.0.1:8080';
    this.httpPort = process.env.AUDIO_SERVER_HTTP_PORT || '8080';
    this.wsPort = process.env.AUDIO_SERVER_WS_PORT || '8080'; // Same port for HTTP and WS
    this.autoStart = process.env.AUDIO_SERVER_AUTO_START === 'true';
    this.autoRestart = process.env.AUDIO_SERVER_AUTO_RESTART === 'true';
    this.startupTimeout = parseInt(process.env.AUDIO_SERVER_STARTUP_TIMEOUT_MS || '10000');
    this.executablePath = process.env.AUDIO_SERVER_EXECUTABLE_PATH;
    this.workingDir = process.env.AUDIO_SERVER_WORKING_DIR;
    this.isReady = false;
    this.startupPromise = null;
    this.logStream = null;
    this.logFilePath = 'logs/audio_server.log';
    this.healthCheckInterval = null;
    this.healthCheckIntervalMs = parseInt(process.env.AUDIO_SERVER_HEALTH_CHECK_INTERVAL || '30000'); // 30s
    this.restartCount = 0;
    this.maxRestarts = parseInt(process.env.AUDIO_SERVER_MAX_RESTARTS || '5');
    this.restartWindowMs = 300000; // 5 minutes - reset counter after this time
    this.lastRestartTime = null;
  }

  /**
   * Initialize the audio server on app startup
   * Checks health and auto-starts if configured
   */
  async initialize() {
    logger.info('Initializing audio server...');

    // Check if server is already running
    const isRunning = await this.checkHealth();

    if (isRunning) {
      logger.info('Audio server is already running');
      this.isReady = true;

      // Start health monitoring
      if (this.autoRestart) {
        this.startHealthMonitoring();
      }

      return true;
    }

    // Auto-start if configured
    if (this.autoStart) {
      logger.info('Audio server not running, attempting to auto-start...');
      return await this.start();
    } else {
      logger.warn('Audio server not running and auto-start is disabled');
      return false;
    }
  }

  /**
   * Initialize the audio server in background (non-blocking)
   * Returns immediately while server starts in background
   * @returns {Promise<boolean>} Promise that resolves when server is ready
   */
  initializeAsync() {
    logger.info('Initializing audio server (non-blocking)...');

    // Return the initialization promise without awaiting it
    const initPromise = this._initializeInBackground();

    return initPromise;
  }

  /**
   * Internal method for background initialization
   * @private
   */
  async _initializeInBackground() {
    try {
      // Check if server is already running
      const isRunning = await this.checkHealth();

      if (isRunning) {
        logger.info('Audio server is already running');
        this.isReady = true;

        // Start health monitoring
        if (this.autoRestart) {
          this.startHealthMonitoring();
        }

        return true;
      }

      // Auto-start if configured
      if (this.autoStart) {
        logger.info('Audio server not running, attempting to auto-start...');
        return await this.start();
      } else {
        logger.warn('Audio server not running and auto-start is disabled');
        return false;
      }
    } catch (error) {
      logger.error('Error during background initialization:', error);
      return false;
    }
  }

  /**
   * Wait for the server to be ready
   * Can be called multiple times safely - will return immediately if already ready
   * @param {number} timeout - Optional timeout in milliseconds (default: 60000)
   * @returns {Promise<boolean>} True if server is ready
   */
  async waitForReady(timeout = 60000) {
    // If already ready, return immediately
    if (this.isReady) {
      return true;
    }

    // If startup is in progress, wait for it
    if (this.startupPromise) {
      try {
        return await this.startupPromise;
      } catch (error) {
        return false;
      }
    }

    // Otherwise, check health with timeout
    const startTime = Date.now();
    const interval = 500; // Check every 500ms

    while (Date.now() - startTime < timeout) {
      const isHealthy = await this.checkHealth();
      if (isHealthy) {
        this.isReady = true;
        return true;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return false;
  }

  /**
   * Check if the audio server is healthy
   *
   * NOTE: We check if the app server client is connected rather than creating
   * a new WebSocket connection. Creating new connections for health checks
   * causes unnecessary connect/disconnect cycles that pollute logs and waste resources.
   *
   * If the app server client is connected, we know the audio server is healthy.
   * If not connected, we do a one-time connection test (not periodic).
   *
   * @returns {Promise<boolean>} True if server is healthy
   */
  async checkHealth() {
    // Import audioServerClientService to check connection status
    const audioServerClientService = (await import('./audioServerClient.service.js')).default;

    // If the app server client is connected, the audio server is healthy
    if (audioServerClientService.isConnected()) {
      logger.debug('Audio server health check passed (using existing connection)');
      return true;
    }

    // If not connected and we're marked as ready, it means we lost connection
    if (this.isReady) {
      logger.warn('Audio server client not connected, but server was marked as ready');
      return false;
    }

    // Otherwise, do a one-time WebSocket test (for initial startup only)
    return new Promise((resolve) => {
      let ws = null;
      const timeout = setTimeout(() => {
        if (ws) {
          ws.close();
        }
        logger.debug('Audio server health check timed out');
        resolve(false);
      }, 3000);

      try {
        const wsUrl = `ws://127.0.0.1:${this.wsPort}`;
        ws = new WebSocket(wsUrl);

        ws.on('open', () => {
          clearTimeout(timeout);
          logger.debug('Audio server health check passed (one-time connection test)');
          ws.close();
          resolve(true);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          logger.debug('Audio server health check failed:', error.message);
          resolve(false);
        });

        ws.on('close', () => {
          // Already handled in open/error handlers
        });
      } catch (error) {
        clearTimeout(timeout);
        logger.debug('Audio server health check failed:', error.message);
        resolve(false);
      }
    });
  }

  /**
   * Start the audio server process
   * @returns {Promise<boolean>} True if server started successfully
   */
  async start() {
    // If already starting, return the existing promise
    if (this.startupPromise) {
      logger.info('Audio server startup already in progress...');
      return this.startupPromise;
    }

    // Validate configuration
    if (!this.executablePath) {
      const error = 'Cannot start audio server: AUDIO_SERVER_EXECUTABLE_PATH not configured';
      logger.error(error);
      throw new Error(error);
    }

    // Create startup promise
    this.startupPromise = this._startServerProcess();

    try {
      const result = await this.startupPromise;
      return result;
    } finally {
      this.startupPromise = null;
    }
  }

  /**
   * Internal method to start the server process
   * @private
   */
  async _startServerProcess() {
    try {
      // Create logs directory if it doesn't exist
      await mkdir(dirname(this.logFilePath), { recursive: true });

      // Create log stream
      this.logStream = createWriteStream(this.logFilePath, { flags: 'a' });
      this.logStream.write(`\n\n=== Audio Server Started: ${new Date().toISOString()} ===\n\n`);

      logger.info(`Starting audio server: ${this.executablePath}`);
      if (this.workingDir) {
        logger.info(`Working directory: ${this.workingDir}`);
      }

      // Build environment variables
      const env = {
        ...process.env,
      };

      // Spawn the process
      this.serverProcess = spawn(this.executablePath, [], {
        cwd: this.workingDir || undefined,
        env: env,
        stdio: ['ignore', 'pipe', 'pipe'], // Don't pipe stdin, do pipe stdout/stderr
      });

      // Handle process output
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.info(`[Audio Server] ${output}`);
          if (this.logStream) {
            this.logStream.write(`[STDOUT] ${output}\n`);
          }
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          // Write to log file
          if (this.logStream) {
            this.logStream.write(`[STDERR] ${output}\n`);
          }

          // C++ servers often log to stderr, so don't treat everything as error
          if (output.includes('ERROR') || output.includes('Exception') || output.includes('error')) {
            logger.error(`[Audio Server] ${output}`);
          } else {
            logger.info(`[Audio Server] ${output}`);
          }
        }
      });

      // Handle process exit
      this.serverProcess.on('exit', (code, signal) => {
        logger.info(`Audio server process exited with code ${code}, signal ${signal}`);
        if (this.logStream) {
          this.logStream.write(`\n=== Audio Server Exited: ${new Date().toISOString()} (code: ${code}, signal: ${signal}) ===\n`);
          this.logStream.end();
          this.logStream = null;
        }
        this.serverProcess = null;
        this.isReady = false;

        // Auto-restart if enabled and not a normal shutdown
        if (this.autoRestart && code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
          logger.warn('Audio server crashed, attempting auto-restart...');
          this.handleCrash();
        }
      });

      this.serverProcess.on('error', (error) => {
        logger.error('Audio server process error:', error);
        if (this.logStream) {
          this.logStream.write(`\n=== Audio Server Error: ${new Date().toISOString()} ===\n${error.stack}\n`);
          this.logStream.end();
          this.logStream = null;
        }
        this.serverProcess = null;
        this.isReady = false;
      });

      // Wait for server to be ready
      logger.info('Waiting for audio server to be ready...');
      const isReady = await this._waitForReady(this.startupTimeout);

      if (isReady) {
        logger.info('✓ Audio server started successfully');
        this.isReady = true;

        // Start health monitoring
        if (this.autoRestart) {
          this.startHealthMonitoring();
        }

        return true;
      } else {
        logger.error('✗ Audio server failed to start within timeout');
        await this.stop();
        return false;
      }
    } catch (error) {
      logger.error('Error starting audio server:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Wait for the server to become ready
   * @private
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} True if server became ready
   */
  async _waitForReady(timeout) {
    const startTime = Date.now();
    const interval = 500; // Check every 500ms

    while (Date.now() - startTime < timeout) {
      // Check if process is still running
      if (this.serverProcess && this.serverProcess.exitCode !== null) {
        logger.error('Audio server process exited prematurely');
        return false;
      }

      // Check health
      const isHealthy = await this.checkHealth();
      if (isHealthy) {
        return true;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return false;
  }

  /**
   * Start health monitoring
   * Periodically checks if server is alive and restarts if needed
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      return; // Already monitoring
    }

    logger.info(`Starting audio server health monitoring (interval: ${this.healthCheckIntervalMs}ms)`);

    this.healthCheckInterval = setInterval(async () => {
      const isHealthy = await this.checkHealth();

      if (!isHealthy && this.isReady) {
        logger.warn('Audio server health check failed, attempting restart...');
        this.isReady = false;
        this.handleCrash();
      }
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Stopped audio server health monitoring');
    }
  }

  /**
   * Handle server crash/failure with restart logic
   */
  async handleCrash() {
    const now = Date.now();

    // Reset restart counter if outside restart window
    if (this.lastRestartTime && (now - this.lastRestartTime > this.restartWindowMs)) {
      this.restartCount = 0;
    }

    // Check if we've exceeded max restarts
    if (this.restartCount >= this.maxRestarts) {
      logger.error(`Audio server has crashed ${this.restartCount} times within ${this.restartWindowMs / 1000}s, giving up`);
      logger.error('Please check the audio server logs and restart manually');
      return;
    }

    this.restartCount++;
    this.lastRestartTime = now;

    logger.info(`Restarting audio server (attempt ${this.restartCount}/${this.maxRestarts})...`);

    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      await this.start();
    } catch (error) {
      logger.error('Failed to restart audio server:', error);
    }
  }

  /**
   * Stop the audio server process
   * @returns {Promise<void>}
   */
  async stop() {
    // Stop health monitoring
    this.stopHealthMonitoring();

    if (!this.serverProcess) {
      logger.info('Audio server is not running');
      return;
    }

    logger.info('Stopping audio server...');

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        logger.warn('Audio server did not stop gracefully, killing process');
        if (this.serverProcess) {
          this.serverProcess.kill('SIGKILL');
        }
        if (this.logStream) {
          this.logStream.end();
          this.logStream = null;
        }
        resolve();
      }, 5000); // 5 second timeout for graceful shutdown

      this.serverProcess.once('exit', () => {
        clearTimeout(timeoutId);
        logger.info('Audio server stopped');
        this.serverProcess = null;
        this.isReady = false;
        if (this.logStream) {
          this.logStream.end();
          this.logStream = null;
        }
        resolve();
      });

      // Send SIGTERM for graceful shutdown
      this.serverProcess.kill('SIGTERM');
    });
  }

  /**
   * Restart the audio server
   * @returns {Promise<boolean>} True if server restarted successfully
   */
  async restart() {
    logger.info('Restarting audio server...');
    await this.stop();
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.start();
  }

  /**
   * Get server status
   * @returns {Object} Status object
   */
  async getStatus() {
    const isHealthy = await this.checkHealth();
    const isProcessRunning = this.serverProcess !== null && this.serverProcess.exitCode === null;

    return {
      httpUrl: this.httpUrl,
      httpPort: this.httpPort,
      wsPort: this.wsPort,
      executablePath: this.executablePath,
      isHealthy,
      isProcessRunning,
      isReady: this.isReady,
      autoStart: this.autoStart,
      autoRestart: this.autoRestart,
      pid: this.serverProcess?.pid || null,
      restartCount: this.restartCount,
      maxRestarts: this.maxRestarts,
      healthMonitoring: this.healthCheckInterval !== null,
    };
  }
}

// Create singleton instance
const audioServerService = new AudioServerService();

export default audioServerService;
