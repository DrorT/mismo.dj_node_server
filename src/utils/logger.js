import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';
import config from '../config/settings.js';

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file);
fs.ensureDirSync(logsDir);

/**
 * Custom log format
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }

    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  })
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    // File transport - all logs
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      tailable: true,
    }),

    // File transport - errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      tailable: true,
    }),
  ],
  exitOnError: false,
});

/**
 * Console transport for development
 */
if (config.server.env !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    })
  );
}

/**
 * Create a child logger with a specific module context
 * @param {string} module - Module name
 * @returns {winston.Logger} Child logger
 */
export function createModuleLogger(module) {
  return logger.child({ module });
}

/**
 * Log HTTP request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in ms
 */
export function logRequest(req, res, duration) {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip || req.connection.remoteAddress,
  };

  if (res.statusCode >= 500) {
    logger.error('HTTP Request', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
}

/**
 * Log database operation
 * @param {string} operation - Operation type
 * @param {Object} details - Operation details
 */
export function logDatabaseOperation(operation, details) {
  logger.debug(`Database ${operation}`, details);
}

/**
 * Log file operation
 * @param {string} operation - Operation type
 * @param {string} filePath - File path
 * @param {Object} details - Additional details
 */
export function logFileOperation(operation, filePath, details = {}) {
  logger.info(`File ${operation}`, { filePath, ...details });
}

/**
 * Log WebSocket event
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function logWebSocketEvent(event, data) {
  logger.debug(`WebSocket: ${event}`, data);
}

/**
 * Log analysis event
 * @param {string} stage - Analysis stage
 * @param {number} trackId - Track ID
 * @param {Object} details - Additional details
 */
export function logAnalysis(stage, trackId, details = {}) {
  logger.info(`Analysis [${stage}]`, { trackId, ...details });
}

export default logger;
