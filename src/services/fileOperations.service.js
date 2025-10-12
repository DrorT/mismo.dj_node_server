import { promises as fs } from 'fs';
import path from 'path';
import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import * as trackService from './track.service.js';

/**
 * File Operations Service
 * Handles safe file operations (move, rename, delete) with database updates
 */

/**
 * Move track file to a new location
 * Updates database with new path
 *
 * @param {number} trackId - Track ID
 * @param {string} destinationPath - New file path
 * @param {number|null} newLibraryDirectoryId - New library directory ID (optional)
 * @returns {Promise<Object>} Updated track
 */
export async function moveTrack(trackId, destinationPath, newLibraryDirectoryId = null) {
  const db = getDatabase();

  try {
    // Get track
    const track = trackService.getTrackById(trackId);

    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    // Validate destination path
    const destDir = path.dirname(destinationPath);

    try {
      await fs.access(destDir);
    } catch (error) {
      throw new Error(`Destination directory does not exist: ${destDir}`);
    }

    // Check if destination file already exists
    try {
      await fs.access(destinationPath);
      throw new Error(`Destination file already exists: ${destinationPath}`);
    } catch (error) {
      // File doesn't exist - good!
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Check disk space (get file size and available space)
    const stats = await fs.stat(track.file_path);
    const destStats = await fs.statfs(destDir);
    const availableSpace = destStats.bavail * destStats.bsize;

    if (stats.size > availableSpace) {
      throw new Error('Insufficient disk space at destination');
    }

    logger.info(`Moving track ${trackId} from ${track.file_path} to ${destinationPath}`);

    // Perform the move operation
    try {
      await fs.rename(track.file_path, destinationPath);
    } catch (error) {
      // If rename fails (different filesystem), try copy + delete
      if (error.code === 'EXDEV') {
        logger.info('Cross-device move detected, using copy + delete');
        await fs.copyFile(track.file_path, destinationPath);
        await fs.unlink(track.file_path);
      } else {
        throw error;
      }
    }

    // Update database
    const updates = {
      file_path: destinationPath,
      file_modified: new Date().toISOString(),
    };

    // Calculate new relative path if library directory is provided
    if (newLibraryDirectoryId !== null) {
      const libraryDir = db.prepare('SELECT * FROM library_directories WHERE id = ?').get(newLibraryDirectoryId);

      if (libraryDir) {
        updates.library_directory_id = newLibraryDirectoryId;
        updates.relative_path = path.relative(libraryDir.path, destinationPath);
      }
    }

    // Update track
    const fields = Object.keys(updates).map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);

    db.prepare(`UPDATE tracks SET ${fields} WHERE id = ?`).run(...values, trackId);

    logger.info(`Track ${trackId} moved successfully`);

    return trackService.getTrackById(trackId);
  } catch (error) {
    logger.error(`Error moving track ${trackId}:`, error);

    // Attempt rollback if file was moved
    try {
      await fs.access(destinationPath);
      await fs.rename(destinationPath, track.file_path);
      logger.info('Rolled back file move after error');
    } catch (rollbackError) {
      // Rollback failed or not needed
    }

    throw error;
  }
}

/**
 * Rename track file
 * Updates database with new filename
 * Preserves the original file extension
 *
 * @param {number} trackId - Track ID
 * @param {string} newName - New filename (without path, extension will be preserved from original)
 * @returns {Promise<Object>} Updated track
 */
export async function renameTrack(trackId, newName) {
  try {
    // Get track
    const track = trackService.getTrackById(trackId);

    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    // Validate new name
    if (!newName || newName.includes('/') || newName.includes('\\')) {
      throw new Error('Invalid filename');
    }

    // Build new path with preserved extension
    const oldPath = track.file_path;
    const dir = path.dirname(oldPath);
    const oldExt = path.extname(oldPath); // Get original extension (e.g., ".mp3")

    // Remove extension from newName if user provided it
    const newNameWithoutExt = newName.replace(/\.[^.]+$/, '');

    // Build new filename with original extension
    const newFilename = newNameWithoutExt + oldExt;
    const newPath = path.join(dir, newFilename);

    // Check if file with new name already exists
    try {
      await fs.access(newPath);
      throw new Error(`File already exists: ${newFilename}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    logger.info(`Renaming track ${trackId} from ${path.basename(oldPath)} to ${newFilename}`);

    // Rename file
    await fs.rename(oldPath, newPath);

    // Update database
    const db = getDatabase();

    // Update file_path and relative_path
    const updates = {
      file_path: newPath,
      file_modified: new Date().toISOString(),
    };

    if (track.library_directory_id) {
      const libraryDir = db.prepare('SELECT * FROM library_directories WHERE id = ?').get(track.library_directory_id);

      if (libraryDir) {
        updates.relative_path = path.relative(libraryDir.path, newPath);
      }
    }

    const fields = Object.keys(updates).map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);

    db.prepare(`UPDATE tracks SET ${fields} WHERE id = ?`).run(...values, trackId);

    logger.info(`Track ${trackId} renamed successfully`);

    return trackService.getTrackById(trackId);
  } catch (error) {
    logger.error(`Error renaming track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Delete track file from disk and database
 * Requires confirmation flag for safety
 *
 * @param {number} trackId - Track ID
 * @param {boolean} confirm - Confirmation flag (must be true)
 * @param {Object} options - Deletion options
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteTrack(trackId, confirm, options = {}) {
  const {
    removeFromPlaylists = true,  // Whether to remove from playlists
    deleteFile = true,           // Whether to delete file from disk
  } = options;

  try {
    if (!confirm) {
      throw new Error('Deletion must be confirmed');
    }

    // Get track
    const track = trackService.getTrackById(trackId);

    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    logger.info(`Deleting track ${trackId} (${track.file_path})`);

    const db = getDatabase();

    // Start transaction
    const transaction = db.transaction(() => {
      // Remove from playlists if requested
      if (removeFromPlaylists) {
        db.prepare('DELETE FROM playlist_tracks WHERE track_id = ?').run(trackId);
        logger.info(`Removed track ${trackId} from all playlists`);
      }

      // Remove from database
      db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
      logger.info(`Removed track ${trackId} from database`);
    });

    transaction();

    // Delete file from disk if requested
    if (deleteFile) {
      try {
        await fs.unlink(track.file_path);
        logger.info(`Deleted file: ${track.file_path}`);
      } catch (error) {
        logger.error(`Failed to delete file ${track.file_path}:`, error.message);

        // File deletion failed, but database was updated
        return {
          success: true,
          trackId,
          filePath: track.file_path,
          fileDeleted: false,
          warning: 'Track removed from database but file deletion failed',
        };
      }
    }

    return {
      success: true,
      trackId,
      filePath: track.file_path,
      fileDeleted: deleteFile,
    };
  } catch (error) {
    logger.error(`Error deleting track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Batch move tracks to a new directory
 *
 * @param {Array<number>} trackIds - Track IDs to move
 * @param {string} destinationDir - Destination directory
 * @param {number|null} newLibraryDirectoryId - New library directory ID
 * @returns {Promise<Object>} Results
 */
export async function batchMoveTracks(trackIds, destinationDir, newLibraryDirectoryId = null) {
  const results = {
    succeeded: [],
    failed: [],
  };

  // Validate destination directory exists
  try {
    await fs.access(destinationDir);
  } catch (error) {
    throw new Error(`Destination directory does not exist: ${destinationDir}`);
  }

  for (const trackId of trackIds) {
    try {
      const track = trackService.getTrackById(trackId);

      if (!track) {
        results.failed.push({
          trackId,
          error: 'Track not found',
        });
        continue;
      }

      // Build destination path
      const filename = path.basename(track.file_path);
      const destPath = path.join(destinationDir, filename);

      // Move track
      const updated = await moveTrack(trackId, destPath, newLibraryDirectoryId);

      results.succeeded.push({
        trackId,
        oldPath: track.file_path,
        newPath: updated.file_path,
      });
    } catch (error) {
      logger.error(`Failed to move track ${trackId}:`, error);

      results.failed.push({
        trackId,
        error: error.message,
      });
    }
  }

  logger.info(`Batch move completed: ${results.succeeded.length} succeeded, ${results.failed.length} failed`);

  return results;
}

/**
 * Verify track file exists and is accessible
 *
 * @param {number} trackId - Track ID
 * @returns {Promise<Object>} Verification result
 */
export async function verifyTrackFile(trackId) {
  try {
    const track = trackService.getTrackById(trackId);

    if (!track) {
      return {
        exists: false,
        error: 'Track not found in database',
      };
    }

    try {
      const stats = await fs.stat(track.file_path);

      return {
        exists: true,
        filePath: track.file_path,
        size: stats.size,
        modified: stats.mtime,
        accessible: true,
      };
    } catch (error) {
      logger.warn(`Track ${trackId} file not accessible: ${track.file_path}`);

      return {
        exists: false,
        filePath: track.file_path,
        error: error.message,
        accessible: false,
      };
    }
  } catch (error) {
    logger.error(`Error verifying track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Get file operation statistics
 *
 * @returns {Object} Statistics
 */
export function getFileOperationStats() {
  // This could be enhanced to track operation history
  // For now, just return basic info

  return {
    message: 'File operations are handled synchronously',
    queuedOperations: 0,
  };
}

export default {
  moveTrack,
  renameTrack,
  deleteTrack,
  batchMoveTracks,
  verifyTrackFile,
  getFileOperationStats,
};
