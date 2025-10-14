import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import * as libraryDirService from './libraryDirectory.service.js';
import * as metadataService from './metadata.service.js';
import * as hashService from './hash.service.js';
import * as trackService from './track.service.js';
import analysisQueueService from './analysisQueue.service.js';
import logger from '../utils/logger.js';
import config from '../config/settings.js';

/**
 * Scanner Service
 * Scans library directories for audio files and extracts metadata
 * Implements hybrid scanning strategy (fast + full)
 */

// Active scan operations
const activeScans = new Map();

/**
 * Scan a library directory
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Scan results
 */
export async function scanLibraryDirectory(libraryDirectoryId, options = {}) {
  const {
    strategy = 'hybrid', // 'fast', 'full', 'hybrid'
    priority = 'normal',
    onProgress = null,
  } = options;

  try {
    // Get library directory
    const directory = libraryDirService.getDirectoryById(libraryDirectoryId);
    if (!directory) {
      throw new Error(`Library directory not found: ${libraryDirectoryId}`);
    }

    if (!directory.is_active) {
      throw new Error(`Library directory is not active: ${libraryDirectoryId}`);
    }

    if (!directory.is_available) {
      throw new Error(`Library directory is not available: ${libraryDirectoryId}`);
    }

    // Check if already scanning
    if (activeScans.has(libraryDirectoryId)) {
      throw new Error(`Scan already in progress for directory: ${libraryDirectoryId}`);
    }

    // Mark as scanning
    libraryDirService.updateScanStatus(libraryDirectoryId, 'scanning');

    const scanInfo = {
      libraryDirectoryId,
      directory,
      strategy,
      startTime: Date.now(),
      filesFound: 0,
      filesProcessed: 0,
      tracksAdded: 0,
      tracksUpdated: 0,
      errors: [],
    };

    activeScans.set(libraryDirectoryId, scanInfo);

    try {
      // Execute scan based on strategy
      let results;
      switch (strategy) {
        case 'fast':
          results = await fastScan(directory, scanInfo, onProgress);
          break;
        case 'full':
          results = await fullScan(directory, scanInfo, onProgress);
          break;
        case 'hybrid':
        default:
          results = await hybridScan(directory, scanInfo, onProgress);
          break;
      }

      // Mark as idle
      libraryDirService.updateScanStatus(libraryDirectoryId, 'idle');

      activeScans.delete(libraryDirectoryId);

      logger.info(`Scan completed for directory ${libraryDirectoryId}: ${results.tracksAdded} added, ${results.tracksUpdated} updated`);

      return results;
    } catch (error) {
      // Mark as error
      libraryDirService.updateScanStatus(libraryDirectoryId, 'error');
      activeScans.delete(libraryDirectoryId);
      throw error;
    }
  } catch (error) {
    logger.error(`Error scanning directory ${libraryDirectoryId}:`, error);
    throw error;
  }
}

/**
 * Fast Scan: Only check file existence and basic info
 * Quick pass to update missing status and add new files
 */
async function fastScan(directory, scanInfo, onProgress) {
  logger.info(`Starting fast scan: ${directory.name}`);

  // Find all audio files
  const files = await findAudioFiles(directory);
  scanInfo.filesFound = files.length;

  if (onProgress) {
    onProgress({
      stage: 'scanning',
      ...scanInfo,
    });
  }

  // Get existing tracks for this directory
  const existingTracks = trackService.getTracksByLibrary(directory.id);
  const existingPaths = new Set(existingTracks.map(t => t.file_path));

  // Track files found
  const foundPaths = new Set(files);

  // Mark missing tracks
  for (const track of existingTracks) {
    if (!foundPaths.has(track.file_path)) {
      trackService.markTrackMissing(track.id);
    } else if (track.is_missing) {
      trackService.markTrackFound(track.id);
    }
  }

  // Add new files (without metadata extraction)
  for (const filePath of files) {
    if (!existingPaths.has(filePath)) {
      try {
        const fileInfo = metadataService.getBasicFileInfo(filePath);
        const hash = await hashService.calculateQuickHash(filePath);

        const track = trackService.upsertTrack({
          ...fileInfo,
          file_hash: hash,
          library_directory_id: directory.id,
          relative_path: path.relative(directory.path, filePath),
          is_missing: false,
        });

        scanInfo.tracksAdded++;

        // Check if another track with same hash already has analysis data
        const analyzedTrack = trackService.getAnalyzedTrackByHash(hash);
        if (analyzedTrack && analyzedTrack.id !== track.id) {
          // Copy analysis data from the analyzed track
          try {
            trackService.copyAnalysisData(analyzedTrack.id, track.id);
            logger.debug(`Copied analysis data from track ${analyzedTrack.id} to track ${track.id}`);
          } catch (error) {
            logger.warn(`Failed to copy analysis data to track ${track.id}:`, error.message);
          }
        } else {
          // Queue track for analysis (basic_features + characteristics only)
          try {
            await analysisQueueService.requestAnalysis(track.id, {
              basic_features: true,
              characteristics: true,
            }, 'normal');
            logger.debug(`Queued analysis for new track: ${track.id}`);
          } catch (error) {
            logger.warn(`Failed to queue analysis for track ${track.id}:`, error.message);
          }
        }
      } catch (error) {
        logger.warn(`Fast scan error for ${filePath}:`, error.message);
        scanInfo.errors.push({ file: filePath, error: error.message });
      }
    }

    scanInfo.filesProcessed++;

    if (onProgress && scanInfo.filesProcessed % 10 === 0) {
      onProgress({
        stage: 'processing',
        ...scanInfo,
      });
    }
  }

  const duration = Date.now() - scanInfo.startTime;

  return {
    strategy: 'fast',
    filesFound: scanInfo.filesFound,
    filesProcessed: scanInfo.filesProcessed,
    tracksAdded: scanInfo.tracksAdded,
    tracksUpdated: scanInfo.tracksUpdated,
    errors: scanInfo.errors,
    durationMs: duration,
  };
}

/**
 * Full Scan: Extract full metadata and calculate file hashes
 * Comprehensive scan with metadata extraction
 */
async function fullScan(directory, scanInfo, onProgress) {
  logger.info(`Starting full scan: ${directory.name}`);

  // Find all audio files
  const files = await findAudioFiles(directory);
  scanInfo.filesFound = files.length;

  if (onProgress) {
    onProgress({
      stage: 'scanning',
      ...scanInfo,
    });
  }

  // Process each file
  for (const filePath of files) {
    try {
      // Extract metadata
      const metadata = await metadataService.extractMetadata(filePath);

      // Calculate audio-only hash (excludes metadata for better duplicate detection)
      const hash = await hashService.calculateAudioHash(filePath);

      // Upsert track
      const track = trackService.upsertTrack({
        ...metadata,
        file_hash: hash,
        library_directory_id: directory.id,
        relative_path: path.relative(directory.path, filePath),
        is_missing: false,
      });

      const isNew = track.date_added === track.date_modified;
      if (isNew) {
        scanInfo.tracksAdded++;

        // Check if another track with same hash already has analysis data
        const analyzedTrack = trackService.getAnalyzedTrackByHash(hash);
        if (analyzedTrack && analyzedTrack.id !== track.id) {
          // Copy analysis data from the analyzed track
          try {
            trackService.copyAnalysisData(analyzedTrack.id, track.id);
            logger.debug(`Copied analysis data from track ${analyzedTrack.id} to track ${track.id}`);
          } catch (error) {
            logger.warn(`Failed to copy analysis data to track ${track.id}:`, error.message);
          }
        } else {
          // Queue track for analysis (basic_features + characteristics only)
          try {
            await analysisQueueService.requestAnalysis(track.id, {
              basic_features: true,
              characteristics: true,
            }, 'normal');
            logger.debug(`Queued analysis for new track: ${track.id}`);
          } catch (error) {
            logger.warn(`Failed to queue analysis for track ${track.id}:`, error.message);
          }
        }
      } else {
        scanInfo.tracksUpdated++;
      }
    } catch (error) {
      logger.warn(`Full scan error for ${filePath}:`, error.message);
      scanInfo.errors.push({ file: filePath, error: error.message });
    }

    scanInfo.filesProcessed++;

    if (onProgress && scanInfo.filesProcessed % 5 === 0) {
      onProgress({
        stage: 'processing',
        ...scanInfo,
      });
    }
  }

  const duration = Date.now() - scanInfo.startTime;

  return {
    strategy: 'full',
    filesFound: scanInfo.filesFound,
    filesProcessed: scanInfo.filesProcessed,
    tracksAdded: scanInfo.tracksAdded,
    tracksUpdated: scanInfo.tracksUpdated,
    errors: scanInfo.errors,
    durationMs: duration,
  };
}

/**
 * Hybrid Scan: Fast scan followed by metadata extraction for new/changed files
 * Best balance of speed and completeness
 */
async function hybridScan(directory, scanInfo, onProgress) {
  logger.info(`Starting hybrid scan: ${directory.name}`);

  // Find all audio files
  const files = await findAudioFiles(directory);
  scanInfo.filesFound = files.length;

  if (onProgress) {
    onProgress({
      stage: 'scanning',
      ...scanInfo,
    });
  }

  // Get existing tracks
  const existingTracks = trackService.getTracksByLibrary(directory.id);
  const tracksByPath = new Map(existingTracks.map(t => [t.file_path, t]));

  // Mark missing tracks
  const foundPaths = new Set(files);
  for (const track of existingTracks) {
    if (!foundPaths.has(track.file_path)) {
      trackService.markTrackMissing(track.id);
    } else if (track.is_missing) {
      trackService.markTrackFound(track.id);
    }
  }

  // Process files
  for (const filePath of files) {
    try {
      const existingTrack = tracksByPath.get(filePath);
      const stats = fs.statSync(filePath);

      // Check if file is new or modified
      const isNew = !existingTrack;
      const isModified =
        existingTrack &&
        new Date(existingTrack.file_modified).getTime() !== stats.mtime.getTime();

      if (isNew || isModified) {
        // Extract full metadata
        const metadata = await metadataService.extractMetadata(filePath);
        // Calculate audio-only hash (excludes metadata for better duplicate detection)
        const hash = await hashService.calculateAudioHash(filePath);

        const track = trackService.upsertTrack({
          ...metadata,
          file_hash: hash,
          library_directory_id: directory.id,
          relative_path: path.relative(directory.path, filePath),
          is_missing: false,
        });

        if (isNew) {
          scanInfo.tracksAdded++;

          // Check if another track with same hash already has analysis data
          const analyzedTrack = trackService.getAnalyzedTrackByHash(hash);
          if (analyzedTrack && analyzedTrack.id !== track.id) {
            // Copy analysis data from the analyzed track
            try {
              trackService.copyAnalysisData(analyzedTrack.id, track.id);
              logger.debug(`Copied analysis data from track ${analyzedTrack.id} to track ${track.id}`);
            } catch (error) {
              logger.warn(`Failed to copy analysis data to track ${track.id}:`, error.message);
            }
          } else {
            // Queue track for analysis (basic_features + characteristics only)
            try {
              await analysisQueueService.requestAnalysis(track.id, {
                basic_features: true,
                characteristics: true,
              }, 'normal');
              logger.debug(`Queued analysis for new track: ${track.id}`);
            } catch (error) {
              logger.warn(`Failed to queue analysis for track ${track.id}:`, error.message);
            }
          }
        } else {
          scanInfo.tracksUpdated++;
        }
      }
    } catch (error) {
      logger.warn(`Hybrid scan error for ${filePath}:`, error.message);
      scanInfo.errors.push({ file: filePath, error: error.message });
    }

    scanInfo.filesProcessed++;

    if (onProgress && scanInfo.filesProcessed % 10 === 0) {
      onProgress({
        stage: 'processing',
        ...scanInfo,
      });
    }
  }

  const duration = Date.now() - scanInfo.startTime;

  return {
    strategy: 'hybrid',
    filesFound: scanInfo.filesFound,
    filesProcessed: scanInfo.filesProcessed,
    tracksAdded: scanInfo.tracksAdded,
    tracksUpdated: scanInfo.tracksUpdated,
    errors: scanInfo.errors,
    durationMs: duration,
  };
}

/**
 * Find all audio files in directory
 * @param {Object} directory - Library directory
 * @returns {Promise<Array>} Array of file paths
 */
async function findAudioFiles(directory) {
  const extensions = config.library.audioFileExtensions;

  // Build glob pattern
  const patterns = directory.scan_patterns || extensions.map(ext => `**/*${ext}`);

  const options = {
    cwd: directory.path,
    absolute: true,
    nocase: true,
    follow: directory.follow_symlinks,
    ignore: directory.exclude_patterns || [],
    nodir: true, // Exclude directories from results
  };

  // Handle max_depth
  if (directory.max_depth >= 0 && !directory.recursive_scan) {
    options.maxDepth = directory.max_depth;
  } else if (!directory.recursive_scan) {
    options.maxDepth = 0;
  }

  const files = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, options);
    files.push(...matches);
  }

  // Remove duplicates and sort
  return [...new Set(files)].sort();
}

/**
 * Get active scan status
 * @param {number} libraryDirectoryId - Library directory ID
 * @returns {Object|null} Scan info or null
 */
export function getScanStatus(libraryDirectoryId) {
  return activeScans.get(libraryDirectoryId) || null;
}

/**
 * Get all active scans
 * @returns {Array} Array of active scan info
 */
export function getAllActiveScans() {
  return Array.from(activeScans.values());
}

/**
 * Cancel an active scan
 * @param {number} libraryDirectoryId - Library directory ID
 * @returns {boolean} True if cancelled
 */
export function cancelScan(libraryDirectoryId) {
  if (activeScans.has(libraryDirectoryId)) {
    activeScans.delete(libraryDirectoryId);
    libraryDirService.updateScanStatus(libraryDirectoryId, 'idle');
    logger.info(`Scan cancelled for directory: ${libraryDirectoryId}`);
    return true;
  }
  return false;
}

export default {
  scanLibraryDirectory,
  getScanStatus,
  getAllActiveScans,
  cancelScan,
};
