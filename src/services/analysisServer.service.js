import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { createStream } from 'rotating-file-stream';
import axios from 'axios';
import logger from '../utils/logger.js';
import { getAllDirectories } from './libraryDirectory.service.js';

/**
 * Analysis Server Service
 * Manages the Python analysis server lifecycle - health checks, startup, shutdown
 */

class AnalysisServerService {
  constructor() {
    this.serverProcess = null;
    this.serverUrl = process.env.PYTHON_SERVER_URL || 'http://127.0.0.1:8000';
    this.serverPort = process.env.PYTHON_SERVER_PORT || '8000';
    this.autoStart = process.env.PYTHON_SERVER_AUTO_START === 'true';
    this.startupTimeout = parseInt(process.env.PYTHON_SERVER_STARTUP_TIMEOUT_MS || '10000');
    this.pythonPath = process.env.PYTHON_SERVER_PYTHON_PATH;
    this.appDir = process.env.PYTHON_SERVER_APP_DIR;
    this.isReady = false;
    this.startupPromise = null;
    this.logStream = null;
    this.logFilePath = 'logs/analysis.log';

    // Remote mode health monitoring
    this.isRemoteMode = process.env.ANALYSIS_SERVER_REMOTE === 'true';
    this.healthCheckInterval = null;
    this.healthCheckIntervalMs = parseInt(process.env.ANALYSIS_SERVER_HEALTH_CHECK_INTERVAL_MS || '10000'); // 10 seconds
  }

  /**
   * Initialize the analysis server on app startup
   * Checks health and auto-starts if configured
   */
  async initialize() {
    logger.info('Initializing analysis server...');

    // Check if server is already running
    const isRunning = await this.checkHealth();

    if (isRunning) {
      logger.info('Analysis server is already running');
      this.isReady = true;
      return true;
    }

    // Auto-start if configured
    if (this.autoStart) {
      logger.info('Analysis server not running, attempting to auto-start...');
      return await this.start();
    } else {
      logger.warn('Analysis server not running and auto-start is disabled');
      return false;
    }
  }

  /**
   * Initialize the analysis server in background (non-blocking)
   * Returns immediately while server starts in background
   * @returns {Promise<boolean>} Promise that resolves when server is ready
   */
  initializeAsync() {
    logger.info('Initializing analysis server (non-blocking)...');

    // Return the initialization promise without awaiting it
    // The promise will resolve when the server is ready
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
        logger.info('Analysis server is already running');
        this.isReady = true;
        return true;
      }

      // Auto-start if configured
      if (this.autoStart) {
        logger.info('Analysis server not running, attempting to auto-start...');
        return await this.start();
      } else {
        logger.warn('Analysis server not running and auto-start is disabled');
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
   * Check if the analysis server is healthy
   * @returns {Promise<boolean>} True if server is healthy
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.serverUrl}/health`, {
        timeout: 5000,
      });

      // Validate response status and body
      const isHealthy = response.status === 200 &&
                       response.data &&
                       response.data.status === 'ok';

      if (isHealthy) {
        logger.debug('Analysis server health check passed', {
          version: response.data.version,
          jobs_queued: response.data.jobs_queued,
          jobs_processing: response.data.jobs_processing
        });
      }
      return isHealthy;
    } catch (error) {
      logger.debug('Analysis server health check failed:', error.message);
      return false;
    }
  }

  /**
   * Start the analysis server process
   * @returns {Promise<boolean>} True if server started successfully
   */
  async start() {
    // If already starting, return the existing promise
    if (this.startupPromise) {
      logger.info('Analysis server startup already in progress...');
      return this.startupPromise;
    }

    // Validate configuration
    if (!this.pythonPath || !this.appDir) {
      const error = 'Cannot start analysis server: PYTHON_SERVER_PYTHON_PATH or PYTHON_SERVER_APP_DIR not configured';
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

      // Create rotating log stream (10MB per file, keep 7 files like Winston)
      this.logStream = createStream('analysis.log', {
        path: dirname(this.logFilePath),
        size: '10M',      // Rotate at 10MB
        maxFiles: 7,      // Keep 7 rotated files
        compress: false,  // Don't compress old logs
      });
      this.logStream.write(`\n\n=== Analysis Server Started: ${new Date().toISOString()} ===\n\n`);

      // Get allowed path prefixes from library directories
      const directories = getAllDirectories({ is_active: true });
      const allowedPaths = directories.map(dir => dir.path);

      if (allowedPaths.length === 0) {
        logger.warn('No active library directories found. Analysis server will start but cannot process files.');
      }

      logger.info('Starting analysis server with allowed paths:', allowedPaths);

      // Build environment variables
      const env = {
        ...process.env,
        MISMO_ALLOW_FILE_PATHS: 'true',
        MISMO_ALLOWED_PATH_PREFIXES: JSON.stringify(allowedPaths),
      };

      // Build command: python -m uvicorn src.app:app --host 127.0.0.1 --port {port}
      const args = [
        '-m',
        'uvicorn',
        'src.app:app',
        '--host',
        '127.0.0.1',
        '--port',
        this.serverPort,
      ];

      logger.info(`Starting analysis server: ${this.pythonPath} ${args.join(' ')}`);
      logger.info(`Working directory: ${this.appDir}`);

      // Spawn the process
      this.serverProcess = spawn(this.pythonPath, args, {
        cwd: this.appDir,
        env: env,
        stdio: ['ignore', 'pipe', 'pipe'], // Don't pipe stdin, do pipe stdout/stderr
      });

      // Handle process output
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.info(`[Analysis Server] ${output}`);
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

          // Uvicorn logs to stderr by default, so don't treat everything as error
          if (output.includes('ERROR') || output.includes('Exception')) {
            logger.error(`[Analysis Server] ${output}`);
          } else {
            logger.info(`[Analysis Server] ${output}`);
          }
        }
      });

      // Handle process exit
      this.serverProcess.on('exit', (code, signal) => {
        logger.info(`Analysis server process exited with code ${code}, signal ${signal}`);
        if (this.logStream) {
          this.logStream.write(`\n=== Analysis Server Exited: ${new Date().toISOString()} (code: ${code}, signal: ${signal}) ===\n`);
          this.logStream.end();
          this.logStream = null;
        }
        this.serverProcess = null;
        this.isReady = false;
      });

      this.serverProcess.on('error', (error) => {
        logger.error('Analysis server process error:', error);
        if (this.logStream) {
          this.logStream.write(`\n=== Analysis Server Error: ${new Date().toISOString()} ===\n${error.stack}\n`);
          this.logStream.end();
          this.logStream = null;
        }
        this.serverProcess = null;
        this.isReady = false;
      });

      // Wait for server to be ready
      logger.info('Waiting for analysis server to be ready...');
      const isReady = await this._waitForReady(this.startupTimeout);

      if (isReady) {
        logger.info('✓ Analysis server started successfully');
        this.isReady = true;
        return true;
      } else {
        logger.error('✗ Analysis server failed to start within timeout');
        await this.stop();
        return false;
      }
    } catch (error) {
      logger.error('Error starting analysis server:', error);
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
        logger.error('Analysis server process exited prematurely');
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
   * Stop the analysis server process
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.serverProcess) {
      logger.info('Analysis server is not running');
      return;
    }

    logger.info('Stopping analysis server...');

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        logger.warn('Analysis server did not stop gracefully, killing process');
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
        logger.info('Analysis server stopped');
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
   * Restart the analysis server
   * @returns {Promise<boolean>} True if server restarted successfully
   */
  async restart() {
    logger.info('Restarting analysis server...');
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
      url: this.serverUrl,
      port: this.serverPort,
      isHealthy,
      isProcessRunning,
      isReady: this.isReady,
      autoStart: this.autoStart,
      pid: this.serverProcess?.pid || null,
    };
  }

  /**
   * Update allowed path prefixes (when library directories change)
   * This requires a restart to take effect
   * @returns {Promise<boolean>} True if restart was successful
   */
  async updateAllowedPaths() {
    if (!this.serverProcess) {
      logger.info('Analysis server not running, no restart needed');
      return true;
    }

    logger.info('Library directories changed, restarting analysis server...');
    return await this.restart();
  }

  /**
   * Initialize remote mode with health monitoring
   * Continuously checks health and sets isReady flag accordingly
   * @returns {Promise<boolean>} True if remote server is initially reachable
   */
  async initializeRemoteMode() {
    logger.info('Initializing remote analysis server monitoring...');

    // Initial health check
    const isHealthy = await this.checkHealth();

    if (isHealthy) {
      logger.info('✓ Remote analysis server is reachable');
      this.isReady = true;
    } else {
      logger.warn('⚠ Remote analysis server is not reachable - will retry periodically');
      this.isReady = false;
    }

    // Start periodic health monitoring
    this.startRemoteHealthMonitoring();

    return isHealthy;
  }

  /**
   * Start periodic health monitoring for remote server
   * Automatically updates isReady flag based on health status
   */
  startRemoteHealthMonitoring() {
    if (this.healthCheckInterval) {
      return; // Already monitoring
    }

    logger.info(`Starting remote analysis server health monitoring (interval: ${this.healthCheckIntervalMs}ms)`);

    this.healthCheckInterval = setInterval(async () => {
      const isHealthy = await this.checkHealth();

      if (isHealthy && !this.isReady) {
        // Server came back online
        logger.info('✓ Remote analysis server connection restored');
        this.isReady = true;
      } else if (!isHealthy && this.isReady) {
        // Server went offline
        logger.warn('⚠ Remote analysis server connection lost - will retry');
        this.isReady = false;
      }
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop remote health monitoring
   */
  stopRemoteHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Stopped remote analysis server health monitoring');
    }
  }
}

// Create singleton instance
const analysisServerService = new AnalysisServerService();

export default analysisServerService;
