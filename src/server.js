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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

app.use('/api/settings', settingsRoutes);
app.use('/api/library/directories', libraryDirectoryRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/watcher', watcherRoutes);

// Import services for startup scan and file watching
import * as libraryDirService from './services/libraryDirectory.service.js';
import * as scannerService from './services/scanner.service.js';
import * as watcherService from './services/watcher.service.js';

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

const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(`Server running on http://${config.server.host}:${config.server.port}`);
  logger.info(`Environment: ${config.server.env}`);

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

    // Stop file watchers
    try {
      await watcherService.unwatchAllDirectories();
      logger.info('File watchers stopped');
    } catch (error) {
      logger.error('Error stopping file watchers:', error);
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
