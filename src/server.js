import express from 'express';
import cors from 'cors';
import config, { validateConfig } from './config/settings.js';
import { initDatabase, closeDatabase } from './config/database.js';
import logger, { logRequest } from './utils/logger.js';

// Validate configuration on startup
try {
  validateConfig();
  logger.info('Configuration validated successfully');
} catch (error) {
  logger.error('Configuration validation failed:', error);
  process.exit(1);
}

// Initialize database
try {
  initDatabase(config.database.path);
  logger.info('Database initialized successfully');
} catch (error) {
  logger.error('Database initialization failed:', error);
  process.exit(1);
}

// Create Express app
const app = express();

// ============================================================================
// Middleware
// ============================================================================

// CORS
app.use(cors({
  origin: config.security.corsOrigin,
  credentials: true,
}));

// Body parsing
// Use large limits to support remote analysis mode with base64-encoded stems (~500MB)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logRequest(req, res, duration);
  });

  next();
});

// ============================================================================
// Routes
// ============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.env,
  });
});

// API routes
import settingsRoutes from './routes/settings.routes.js';
import libraryDirectoryRoutes from './routes/libraryDirectory.routes.js';
import scanRoutes from './routes/scan.routes.js';
import watcherRoutes from './routes/watcher.routes.js';
import tracksRoutes from './routes/tracks.routes.js';
import duplicatesRoutes from './routes/duplicates.routes.js';
import analysisRoutes from './routes/analysis.routes.js';
import playlistRoutes from './routes/playlist.routes.js';
import hotCuesRoutes from './routes/hotCues.routes.js';

app.use('/api/settings', settingsRoutes);
app.use('/api/library/directories', libraryDirectoryRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/watcher', watcherRoutes);
app.use('/api/tracks', hotCuesRoutes); // Hot cues mounted under /api/tracks/:id/hot-cues
app.use('/api/tracks', tracksRoutes);
app.use('/api/duplicates', duplicatesRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/playlists', playlistRoutes);

// Import services for startup scan and file watching
import * as libraryDirService from './services/libraryDirectory.service.js';
import * as scannerService from './services/scanner.service.js';
import * as watcherService from './services/watcher.service.js';
import analysisServerService from './services/analysisServer.service.js';
import analysisQueueService from './services/analysisQueue.service.js';
import pythonClientService from './services/pythonClient.service.js';
import audioServerService from './services/audioServer.service.js';
import audioServerClientService from './services/audioServerClient.service.js';

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  // Don't expose internal errors in production
  const message = config.server.env === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(err.status || 500).json({
    error: 'Server error',
    message,
  });
});

// ============================================================================
// Startup Analysis Queue
// ============================================================================

/**
 * Queue all unanalyzed tracks for analysis on startup
 * This ensures all existing tracks eventually get analyzed
 */
async function queueUnanalyzedTracks() {
  try {
    logger.info('Queueing unanalyzed tracks for analysis...');

    // Import track service
    const trackService = await import('./services/track.service.js');

    // Get all tracks that haven't been analyzed yet
    // A track is considered unanalyzed if it has no date_analyzed or missing key analysis fields
    const db = (await import('./config/database.js')).getDatabase();
    const unanalyzedTracks = db.prepare(`
      SELECT id, file_path
      FROM tracks
      WHERE is_missing = 0
        AND (
          date_analyzed IS NULL
          OR bpm IS NULL
          OR musical_key IS NULL
        )
    `).all();

    if (unanalyzedTracks.length === 0) {
      logger.info('No unanalyzed tracks found');
      return;
    }

    logger.info(`Found ${unanalyzedTracks.length} unanalyzed tracks, queueing for analysis...`);

    // Queue each track for analysis (with low priority for background processing)
    let queuedCount = 0;
    let errorCount = 0;

    for (const track of unanalyzedTracks) {
      try {
        await analysisQueueService.requestAnalysis(track.id, {
          basic_features: true,
          characteristics: true,
        }, 'low'); // Low priority for startup analysis
        queuedCount++;
      } catch (error) {
        logger.warn(`Failed to queue track ${track.id} for analysis:`, error.message);
        errorCount++;
      }
    }

    logger.info(`Startup analysis queue complete: ${queuedCount} queued, ${errorCount} errors`);
  } catch (error) {
    logger.error('Error queueing unanalyzed tracks:', error);
  }
}

// ============================================================================
// Startup Scan
// ============================================================================

/**
 * Scan all active library directories on startup
 * This helps keep the database synchronized with the file system
 */
async function performStartupScan() {
  try {
    logger.info('Starting automatic scan of active library directories...');

    // Get all active and available directories
    const directories = libraryDirService.getAllDirectories({
      is_active: true,
      is_available: true,
    });

    if (directories.length === 0) {
      logger.info('No active library directories found to scan');
      return;
    }

    logger.info(`Found ${directories.length} active library directories to scan`);

    // Start scanning each directory (non-blocking)
    for (const dir of directories) {
      logger.info(`Initiating scan for: ${dir.name} (${dir.path})`);

      // Start scan in background (don't await)
      scannerService.scanLibraryDirectory(dir.id, {
        strategy: 'hybrid', // Use hybrid strategy for balance of speed and accuracy
        priority: 'low',    // Low priority for startup scans
      }).then(results => {
        logger.info(`Startup scan completed for ${dir.name}: ${results.tracksAdded} added, ${results.tracksUpdated} updated`);
      }).catch(error => {
        logger.error(`Startup scan failed for ${dir.name}:`, error);
      });
    }

    logger.info('Startup scans initiated (running in background)');
  } catch (error) {
    logger.error('Error during startup scan:', error);
  }
}

// ============================================================================
// Server Startup
// ============================================================================

const server = app.listen(config.server.port, config.server.host, async () => {
  logger.info(`Server running on http://${config.server.host}:${config.server.port}`);
  logger.info(`Environment: ${config.server.env}`);

  // Initialize stem cache
  const stemCacheService = (await import('./services/stemCache.service.js')).default;
  await stemCacheService.initialize();

  // Start analysis server initialization in background (non-blocking)
  const analysisServerInitPromise = (async () => {
    try {
      const isRemoteMode = process.env.ANALYSIS_SERVER_REMOTE === 'true';

      if (isRemoteMode) {
        // Remote mode: Don't start local analysis server, monitor remote server health
        logger.info('Analysis server running in REMOTE mode - skipping local server startup');

        // Initialize Python client with callback URL
        // Use CALLBACK_HOST if set, otherwise fall back to detecting from server.host
        let callbackHost = process.env.CALLBACK_HOST;
        if (!callbackHost || callbackHost.trim() === '') {
          callbackHost = config.server.host === '0.0.0.0' ? '127.0.0.1' : config.server.host;
          logger.info(`CALLBACK_HOST not set, using auto-detected: ${callbackHost}`);
        } else {
          logger.info(`Using configured CALLBACK_HOST: ${callbackHost}`);
        }
        const nodeServerUrl = `http://${callbackHost}:${config.server.port}`;
        pythonClientService.initialize(nodeServerUrl);

        // Initialize remote mode with health monitoring
        const isAvailable = await analysisServerService.initializeRemoteMode();

        // Initialize analysis queue
        await analysisQueueService.initialize();
        logger.info('✓ Analysis queue initialized');

        // Queue all unanalyzed tracks for analysis
        setTimeout(() => {
          queueUnanalyzedTracks();
        }, 5000);

        return isAvailable;
      } else {
        // Local mode: Start and manage local analysis server
        logger.info('Initializing Python analysis server (background, LOCAL mode)...');
        const serverStarted = await analysisServerService.initializeAsync();
        if (serverStarted) {
          logger.info('✓ Analysis server ready');

          // Initialize Python client with callback URL
          // Use CALLBACK_HOST if set, otherwise use 127.0.0.1 for local mode
          let callbackHost = process.env.CALLBACK_HOST;
          if (!callbackHost || callbackHost.trim() === '') {
            callbackHost = config.server.host === '0.0.0.0' ? '127.0.0.1' : config.server.host;
          }
          const nodeServerUrl = `http://${callbackHost}:${config.server.port}`;
          pythonClientService.initialize(nodeServerUrl);

          // Initialize analysis queue
          await analysisQueueService.initialize();
          logger.info('✓ Analysis queue initialized');

          // Queue all unanalyzed tracks for analysis
          // Do this after a short delay to let the startup scan complete first
          setTimeout(() => {
            queueUnanalyzedTracks();
          }, 5000); // Wait 5 seconds for startup scan to start

          return true;
        } else {
          logger.warn('⚠ Analysis server not available - analysis features will be disabled');
          return false;
        }
      }
    } catch (error) {
      logger.error('✗ Failed to initialize analysis server:', error);
      logger.warn('Analysis features will be disabled');
      return false;
    }
  })();

  // Continue with other initialization tasks in parallel (don't await analysis server)

  // Start audio server initialization in background (non-blocking)
  const audioServerInitPromise = (async () => {
    try {
      logger.info('Initializing C++ audio server (background)...');
      const serverStarted = await audioServerService.initializeAsync();
      if (serverStarted) {
        logger.info('✓ Audio server ready');

        // Import track service for audio server client
        const trackService = await import('./services/track.service.js');

        // Initialize audio server WebSocket client
        audioServerClientService.initialize({
          trackService: trackService,
          libraryDirectoryService: libraryDirService,
          analysisQueueService: analysisQueueService
        });

        // Connect to audio server (will wait for server to be ready)
        try {
          await audioServerClientService.connect();
          logger.info('✓ Audio server WebSocket client connected');
        } catch (error) {
          logger.warn('⚠ Failed to connect to audio server - will retry automatically:', error.message);
        }

        return true;
      } else {
        logger.warn('⚠ Audio server not available - audio features will be disabled');
        return false;
      }
    } catch (error) {
      logger.error('✗ Failed to initialize audio server:', error);
      logger.warn('Audio features will be disabled');
      return false;
    }
  })();

  // Perform startup scan and initialize file watchers after server is ready
  setTimeout(() => {
    performStartupScan();

    // Start file watchers after startup scan completes
    setTimeout(() => {
      try {
        watcherService.watchAllDirectories();
      } catch (error) {
        logger.error('Failed to start file watchers:', error);
      }
    }, 2000); // Wait 2 seconds for scans to start
  }, 1000); // Wait 1 second to ensure server is fully ready
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function gracefulShutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    // Stop analysis queue
    try {
      analysisQueueService.stopProcessing();
      logger.info('Analysis queue stopped');
    } catch (error) {
      logger.error('Error stopping analysis queue:', error);
    }

    // Stop analysis server
    if (process.env.ANALYSIS_SERVER_REMOTE === 'true') {
      // Remote mode: Stop health monitoring
      try {
        analysisServerService.stopRemoteHealthMonitoring();
        logger.info('Remote analysis server monitoring stopped');
      } catch (error) {
        logger.error('Error stopping remote monitoring:', error);
      }
    } else {
      // Local mode: Stop local server process
      try {
        await analysisServerService.stop();
        logger.info('Analysis server stopped');
      } catch (error) {
        logger.error('Error stopping analysis server:', error);
      }
    }

    // Stop file watchers
    try {
      await watcherService.unwatchAllDirectories();
      logger.info('File watchers stopped');
    } catch (error) {
      logger.error('Error stopping file watchers:', error);
    }

    // Disconnect from audio server WebSocket
    try {
      audioServerClientService.disconnect();
      logger.info('Audio server client disconnected');
    } catch (error) {
      logger.error('Error disconnecting audio server client:', error);
    }

    // Stop audio server process
    try {
      await audioServerService.stop();
      logger.info('Audio server stopped');
    } catch (error) {
      logger.error('Error stopping audio server:', error);
    }

    // Close database connection
    closeDatabase();

    // Exit process
    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection:', { reason, promise });
});

export default app;
