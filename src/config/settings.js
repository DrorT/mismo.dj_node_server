import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

/**
 * Application configuration settings
 */
const config = {
  // Server
  server: {
    port: parseInt(process.env.PORT, 10) || 12047,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },

  // Database
  database: {
    path: process.env.DATABASE_PATH || './data/library.db',
  },

  // Python Analysis Server
  analysis: {
    serverUrl: process.env.PYTHON_SERVER_URL || 'http://localhost:5000',
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_ANALYSIS, 10) || 2,
    maxRetries: parseInt(process.env.ANALYSIS_MAX_RETRIES, 10) || 3,
    timeoutMs: parseInt(process.env.ANALYSIS_TIMEOUT_MS, 10) || 300000,
  },

  // Library Settings
  library: {
    maxConcurrentScans: parseInt(process.env.MAX_CONCURRENT_SCANS, 10) || 2,
    autoAnalyzeNewTracks: process.env.AUTO_ANALYZE_NEW_TRACKS === 'true',
    audioFileExtensions: (process.env.AUDIO_FILE_EXTENSIONS || '.mp3,.flac,.wav,.m4a,.aac,.ogg,.wma,.aif,.aiff,.opus,.alac')
      .split(',')
      .map(ext => ext.trim()),
  },

  // Duplicate Detection
  duplicates: {
    enabled: process.env.DUPLICATE_DETECTION_ENABLED !== 'false',
    hashAlgorithm: process.env.DUPLICATE_HASH_ALGORITHM || 'xxhash',
  },

  // File Operations
  fileOps: {
    confirmDeletes: process.env.CONFIRM_FILE_DELETES !== 'false',
    logOperations: process.env.LOG_FILE_OPERATIONS !== 'false',
    backup: process.env.FILE_OPERATION_BACKUP !== 'false',
  },

  // WebSocket
  websocket: {
    port: parseInt(process.env.WS_PORT, 10) || 3001,
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 30000,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
    maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 7,
    maxSize: parseInt(process.env.LOG_MAX_SIZE, 10) || 10485760, // 10MB
  },

  // Security
  security: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    apiRateLimit: parseInt(process.env.API_RATE_LIMIT, 10) || 100,
  },

  // File Watcher
  fileWatcher: {
    enabled: process.env.FILE_WATCHER_ENABLED !== 'false',
    debounceMs: parseInt(process.env.FILE_WATCHER_DEBOUNCE_MS, 10) || 1000,
  },
};

/**
 * Validate configuration
 */
export function validateConfig() {
  const errors = [];

  if (!config.server.port || config.server.port < 1 || config.server.port > 65535) {
    errors.push('Invalid server port');
  }

  if (!config.database.path) {
    errors.push('Database path not configured');
  }

  if (config.analysis.maxConcurrent < 1) {
    errors.push('MAX_CONCURRENT_ANALYSIS must be >= 1');
  }

  if (config.library.maxConcurrentScans < 1) {
    errors.push('MAX_CONCURRENT_SCANS must be >= 1');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
}

export default config;
