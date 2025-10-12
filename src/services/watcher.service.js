import chokidar from 'chokidar';
import path from 'path';
import logger from '../utils/logger.js';
import * as libraryDirService from './libraryDirectory.service.js';
import * as trackService from './track.service.js';
import * as metadataService from './metadata.service.js';
import * as hashService from './hash.service.js';
import config from '../config/settings.js';
import fs from 'fs/promises';

/**
 * File Watcher Service
 * Monitors library directories for changes and updates the database in real-time
 */

// Store active watchers by library directory ID
const activeWatchers = new Map();

// Debounce timers for file changes
const debounceTimers = new Map();
const DEBOUNCE_DELAY = 1000; // 1 second delay to avoid rapid-fire updates

/**
 * Check if file is an audio file
 */
function isAudioFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return config.library.audioFileExtensions.includes(ext);
}

/**
 * Process a file addition
 */
async function handleFileAdd(filePath, directoryId, directoryPath) {
  try {
    logger.info(`File watcher: New file detected - ${filePath}`);

    // Get file stats
    const stats = await fs.stat(filePath);
    const relativePath = path.relative(directoryPath, filePath);

    // Extract metadata
    const metadata = await metadataService.extractMetadata(filePath);

    // Calculate hash
    const hash = await hashService.calculateFileHash(filePath);

    // Create track data
    const trackData = {
      file_path: filePath,
      file_size: stats.size,
      file_modified: stats.mtime.toISOString(),
      file_hash: hash,
      library_directory_id: directoryId,
      relative_path: relativePath,
      is_missing: false,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      album_artist: metadata.albumArtist,
      genre: metadata.genre,
      year: metadata.year,
      track_number: metadata.trackNumber,
      comment: metadata.comment,
      duration_seconds: metadata.duration,
      sample_rate: metadata.sampleRate,
      bit_rate: metadata.bitRate,
      channels: metadata.channels,
    };

    // Insert/update track
    const track = trackService.upsertTrack(trackData);
    logger.info(`File watcher: Track added/updated - ${track.title || filePath}`);
  } catch (error) {
    logger.error(`File watcher: Error processing added file ${filePath}:`, error);
  }
}

/**
 * Process a file change
 */
async function handleFileChange(filePath, directoryId, directoryPath) {
  try {
    logger.info(`File watcher: File changed - ${filePath}`);

    // Check if track exists in database
    const existingTrack = trackService.getTrackByPath(filePath);
    if (!existingTrack) {
      // If not in DB, treat as new file
      await handleFileAdd(filePath, directoryId, directoryPath);
      return;
    }

    // Get file stats
    const stats = await fs.stat(filePath);

    // Check if file was actually modified (not just accessed)
    const lastModified = new Date(stats.mtime).getTime();
    const dbModified = new Date(existingTrack.file_modified).getTime();

    if (Math.abs(lastModified - dbModified) < 1000) {
      // Less than 1 second difference, likely a false alarm
      return;
    }

    // Re-extract metadata and hash
    const metadata = await metadataService.extractMetadata(filePath);
    const hash = await hashService.calculateFileHash(filePath);

    // Update track
    const trackData = {
      file_path: filePath,
      file_size: stats.size,
      file_modified: stats.mtime.toISOString(),
      file_hash: hash,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      album_artist: metadata.albumArtist,
      genre: metadata.genre,
      year: metadata.year,
      track_number: metadata.trackNumber,
      comment: metadata.comment,
      duration_seconds: metadata.duration,
      sample_rate: metadata.sampleRate,
      bit_rate: metadata.bitRate,
      channels: metadata.channels,
    };

    const track = trackService.upsertTrack(trackData);
    logger.info(`File watcher: Track updated - ${track.title || filePath}`);
  } catch (error) {
    logger.error(`File watcher: Error processing changed file ${filePath}:`, error);
  }
}

/**
 * Process a file deletion
 */
async function handleFileUnlink(filePath) {
  try {
    logger.info(`File watcher: File deleted - ${filePath}`);

    // Check if track exists
    const track = trackService.getTrackByPath(filePath);
    if (!track) {
      return;
    }

    // Mark as missing instead of deleting
    trackService.upsertTrack({
      file_path: filePath,
      is_missing: true,
      missing_since: new Date().toISOString(),
    });

    logger.info(`File watcher: Track marked as missing - ${track.title || filePath}`);
  } catch (error) {
    logger.error(`File watcher: Error processing deleted file ${filePath}:`, error);
  }
}

/**
 * Debounced file event handler
 */
function debouncedHandler(event, filePath, handler, ...args) {
  // Clear existing timer
  const key = `${event}:${filePath}`;
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key));
  }

  // Set new timer
  const timer = setTimeout(() => {
    handler(filePath, ...args);
    debounceTimers.delete(key);
  }, DEBOUNCE_DELAY);

  debounceTimers.set(key, timer);
}

/**
 * Start watching a library directory
 */
export function watchDirectory(directoryId) {
  try {
    // Check if already watching
    if (activeWatchers.has(directoryId)) {
      logger.warn(`File watcher: Directory ${directoryId} is already being watched`);
      return;
    }

    // Get directory info
    const directory = libraryDirService.getDirectoryById(directoryId);
    if (!directory) {
      throw new Error(`Library directory not found: ${directoryId}`);
    }

    if (!directory.is_active || !directory.is_available) {
      throw new Error(`Directory is not active or available: ${directoryId}`);
    }

    logger.info(`File watcher: Starting watch on ${directory.name} (${directory.path})`);

    // Configure watcher
    const watchOptions = {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true, // Don't trigger events for existing files
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2 seconds for file to stabilize
        pollInterval: 100,
      },
      depth: directory.max_depth >= 0 ? directory.max_depth : undefined,
      followSymlinks: directory.follow_symlinks,
    };

    // Create watcher
    const watcher = chokidar.watch(directory.path, watchOptions);

    // Set up event handlers
    watcher
      .on('add', (filePath) => {
        if (isAudioFile(filePath)) {
          debouncedHandler('add', filePath, handleFileAdd, directoryId, directory.path);
        }
      })
      .on('change', (filePath) => {
        if (isAudioFile(filePath)) {
          debouncedHandler('change', filePath, handleFileChange, directoryId, directory.path);
        }
      })
      .on('unlink', (filePath) => {
        if (isAudioFile(filePath)) {
          debouncedHandler('unlink', filePath, handleFileUnlink);
        }
      })
      .on('error', (error) => {
        logger.error(`File watcher error for directory ${directoryId}:`, error);
      })
      .on('ready', () => {
        logger.info(`File watcher: Ready and watching ${directory.name}`);
      });

    // Store watcher
    activeWatchers.set(directoryId, {
      watcher,
      directory,
      startTime: Date.now(),
    });

    return watcher;
  } catch (error) {
    logger.error(`File watcher: Error starting watch for directory ${directoryId}:`, error);
    throw error;
  }
}

/**
 * Stop watching a library directory
 */
export async function unwatchDirectory(directoryId) {
  try {
    const watcherInfo = activeWatchers.get(directoryId);
    if (!watcherInfo) {
      logger.warn(`File watcher: Directory ${directoryId} is not being watched`);
      return false;
    }

    logger.info(`File watcher: Stopping watch on ${watcherInfo.directory.name}`);

    await watcherInfo.watcher.close();
    activeWatchers.delete(directoryId);

    return true;
  } catch (error) {
    logger.error(`File watcher: Error stopping watch for directory ${directoryId}:`, error);
    throw error;
  }
}

/**
 * Start watching all active and available directories
 */
export function watchAllDirectories() {
  try {
    logger.info('File watcher: Starting watchers for all active directories...');

    const directories = libraryDirService.getAllDirectories({
      is_active: true,
      is_available: true,
    });

    let successCount = 0;
    for (const dir of directories) {
      try {
        watchDirectory(dir.id);
        successCount++;
      } catch (error) {
        logger.error(`File watcher: Failed to watch directory ${dir.name}:`, error);
      }
    }

    logger.info(`File watcher: Started watching ${successCount}/${directories.length} directories`);
    return successCount;
  } catch (error) {
    logger.error('File watcher: Error starting watchers:', error);
    throw error;
  }
}

/**
 * Stop watching all directories
 */
export async function unwatchAllDirectories() {
  try {
    logger.info('File watcher: Stopping all watchers...');

    const directoryIds = Array.from(activeWatchers.keys());
    let successCount = 0;

    for (const id of directoryIds) {
      try {
        await unwatchDirectory(id);
        successCount++;
      } catch (error) {
        logger.error(`File watcher: Failed to stop watching directory ${id}:`, error);
      }
    }

    logger.info(`File watcher: Stopped ${successCount}/${directoryIds.length} watchers`);
    return successCount;
  } catch (error) {
    logger.error('File watcher: Error stopping watchers:', error);
    throw error;
  }
}

/**
 * Get status of active watchers
 */
export function getWatcherStatus() {
  const watchers = [];

  for (const [id, info] of activeWatchers.entries()) {
    watchers.push({
      directoryId: id,
      directoryName: info.directory.name,
      directoryPath: info.directory.path,
      uptime: Date.now() - info.startTime,
      startTime: new Date(info.startTime).toISOString(),
    });
  }

  return {
    activeCount: watchers.length,
    watchers,
  };
}

/**
 * Check if a directory is being watched
 */
export function isWatching(directoryId) {
  return activeWatchers.has(directoryId);
}
