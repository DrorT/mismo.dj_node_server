import { parseFile } from 'music-metadata';
import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Metadata Extraction Service
 * Extracts metadata from audio files using music-metadata library
 */

/**
 * Extract metadata from an audio file
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Extracted metadata
 */
export async function extractMetadata(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const metadata = await parseFile(filePath, {
      duration: true,
      skipCovers: true, // Skip cover art to improve performance
    });

    // Extract relevant fields
    const extracted = {
      // File information
      file_path: filePath,
      file_size: stats.size,
      file_modified: stats.mtime.toISOString(),

      // Basic metadata
      title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
      artist: metadata.common.artist || metadata.common.artists?.join(', ') || null,
      album: metadata.common.album || null,
      album_artist: metadata.common.albumartist || null,
      genre: metadata.common.genre?.join(', ') || null,
      year: metadata.common.year || null,
      track_number: metadata.common.track?.no || null,
      comment: metadata.common.comment?.join(' ') || null,

      // Audio properties
      duration_seconds: metadata.format.duration || null,
      sample_rate: metadata.format.sampleRate || null,
      bit_rate: metadata.format.bitrate || null,
      channels: metadata.format.numberOfChannels || null,
    };

    return extracted;
  } catch (error) {
    logger.error(`Error extracting metadata from ${filePath}:`, error);
    throw error;
  }
}

/**
 * Extract metadata from multiple files
 * @param {Array<string>} filePaths - Array of file paths
 * @param {Function} onProgress - Progress callback (index, total, filePath)
 * @returns {Promise<Array>} Array of extracted metadata with errors
 */
export async function extractMetadataBatch(filePaths, onProgress = null) {
  const results = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];

    if (onProgress) {
      onProgress(i + 1, filePaths.length, filePath);
    }

    try {
      const metadata = await extractMetadata(filePath);
      results.push({
        success: true,
        filePath,
        metadata,
      });
    } catch (error) {
      logger.warn(`Failed to extract metadata from ${filePath}:`, error.message);
      results.push({
        success: false,
        filePath,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Check if file is a supported audio format
 * @param {string} filePath - Path to file
 * @param {Array<string>} supportedExtensions - Array of supported extensions
 * @returns {boolean} True if supported
 */
export function isSupportedAudioFile(filePath, supportedExtensions) {
  const ext = path.extname(filePath).toLowerCase();
  return supportedExtensions.includes(ext);
}

/**
 * Get basic file info without full metadata extraction
 * @param {string} filePath - Path to file
 * @returns {Object} Basic file information
 */
export function getBasicFileInfo(filePath) {
  try {
    const stats = fs.statSync(filePath);

    return {
      file_path: filePath,
      file_size: stats.size,
      file_modified: stats.mtime.toISOString(),
      file_name: path.basename(filePath),
      file_ext: path.extname(filePath),
    };
  } catch (error) {
    logger.error(`Error getting file info for ${filePath}:`, error);
    throw error;
  }
}

/**
 * Validate audio file (check if readable and has valid format)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<boolean>} True if valid
 */
export async function validateAudioFile(filePath) {
  try {
    await parseFile(filePath, {
      duration: false,
      skipCovers: true,
      skipPostHeaders: true,
    });
    return true;
  } catch (error) {
    logger.debug(`Invalid audio file ${filePath}:`, error.message);
    return false;
  }
}

export default {
  extractMetadata,
  extractMetadataBatch,
  isSupportedAudioFile,
  getBasicFileInfo,
  validateAudioFile,
};
