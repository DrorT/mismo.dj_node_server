import { promises as fs } from 'fs';
import path from 'path';
import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import * as libraryDirService from './libraryDirectory.service.js';

/**
 * Missing Media Handler Service
 * Handles cleanup of missing tracks and restoration when media reconnects
 */

/**
 * Cleanup missing tracks from a library directory
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} Cleanup results
 */
export async function cleanupMissingTracks(libraryDirectoryId, options = {}) {
  const {
    remove_missing_older_than_days = 30,
    keep_playlists_intact = true,
    backup_metadata = true,
  } = options;

  try {
    const db = getDatabase();

    // Get library directory
    const libraryDir = libraryDirService.getDirectoryById(libraryDirectoryId);

    if (!libraryDir) {
      throw new Error(`Library directory ${libraryDirectoryId} not found`);
    }

    logger.info(`Starting cleanup for library ${libraryDir.name} (ID: ${libraryDirectoryId})`);

    // Calculate date threshold
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - remove_missing_older_than_days);
    const thresholdISO = thresholdDate.toISOString();

    // Get tracks that have been missing longer than threshold
    const missingTracks = db.prepare(`
      SELECT * FROM tracks
      WHERE library_directory_id = ?
        AND is_missing = 1
        AND missing_since < ?
    `).all(libraryDirectoryId, thresholdISO);

    if (missingTracks.length === 0) {
      logger.info('No tracks to cleanup');
      return {
        success: true,
        tracksRemoved: 0,
        metadataBackedUp: false,
        message: 'No tracks to cleanup',
      };
    }

    logger.info(`Found ${missingTracks.length} tracks to cleanup`);

    // Backup metadata if requested
    let backupPath = null;
    if (backup_metadata) {
      backupPath = await backupTrackMetadata(libraryDir, missingTracks);
      logger.info(`Metadata backed up to: ${backupPath}`);
    }

    // Start transaction
    const result = db.transaction(() => {
      // Remove tracks from playlists if not keeping playlists intact
      if (!keep_playlists_intact) {
        const trackIds = missingTracks.map(t => t.id);
        const placeholders = trackIds.map(() => '?').join(',');
        const deletePlaylistTracks = db.prepare(`
          DELETE FROM playlist_tracks
          WHERE track_id IN (${placeholders})
        `);
        deletePlaylistTracks.run(...trackIds);
      }

      // Delete tracks from database
      const trackIds = missingTracks.map(t => t.id);
      const placeholders = trackIds.map(() => '?').join(',');
      const deleteTracks = db.prepare(`
        DELETE FROM tracks
        WHERE id IN (${placeholders})
      `);
      deleteTracks.run(...trackIds);

      return {
        success: true,
        tracksRemoved: missingTracks.length,
        metadataBackedUp: backup_metadata,
        backupPath,
        message: `Removed ${missingTracks.length} missing tracks`,
      };
    });

    result(); // Execute transaction

    logger.info(`Cleanup complete: removed ${missingTracks.length} tracks`);

    return {
      success: true,
      tracksRemoved: missingTracks.length,
      metadataBackedUp: backup_metadata,
      backupPath,
      message: `Removed ${missingTracks.length} missing tracks`,
    };
  } catch (error) {
    logger.error(`Error cleaning up missing tracks for library ${libraryDirectoryId}:`, error);
    throw error;
  }
}

/**
 * Backup track metadata to JSON file
 *
 * @param {Object} libraryDir - Library directory object
 * @param {Array} tracks - Tracks to backup
 * @returns {Promise<string>} Path to backup file
 */
async function backupTrackMetadata(libraryDir, tracks) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `missing-tracks-backup-${timestamp}.json`;
    const backupPath = path.join(libraryDir.path, backupFilename);

    const backup = {
      timestamp: new Date().toISOString(),
      libraryDirectory: {
        id: libraryDir.id,
        name: libraryDir.name,
        path: libraryDir.path,
      },
      trackCount: tracks.length,
      tracks: tracks.map(t => ({
        id: t.id,
        file_path: t.file_path,
        relative_path: t.relative_path,
        file_hash: t.file_hash,
        title: t.title,
        artist: t.artist,
        album: t.album,
        album_artist: t.album_artist,
        genre: t.genre,
        year: t.year,
        track_number: t.track_number,
        duration_seconds: t.duration_seconds,
        bpm: t.bpm,
        musical_key: t.musical_key,
        rating: t.rating,
        play_count: t.play_count,
        date_added: t.date_added,
        missing_since: t.missing_since,
      })),
    };

    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf8');

    return backupPath;
  } catch (error) {
    logger.error('Error backing up metadata:', error);
    throw error;
  }
}

/**
 * Mark all tracks in a directory as missing
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @returns {number} Number of tracks marked as missing
 */
export function markDirectoryTracksAsMissing(libraryDirectoryId) {
  try {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE tracks
      SET is_missing = 1, missing_since = CURRENT_TIMESTAMP
      WHERE library_directory_id = ?
        AND is_missing = 0
    `).run(libraryDirectoryId);

    logger.info(`Marked ${result.changes} tracks as missing in library ${libraryDirectoryId}`);

    return result.changes;
  } catch (error) {
    logger.error(`Error marking tracks as missing for library ${libraryDirectoryId}:`, error);
    throw error;
  }
}

/**
 * Restore tracks when media reconnects
 * Checks if files exist and marks them as found
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @returns {Promise<Object>} Restoration results
 */
export async function restoreTracks(libraryDirectoryId) {
  try {
    const db = getDatabase();

    // Get library directory
    const libraryDir = libraryDirService.getDirectoryById(libraryDirectoryId);

    if (!libraryDir) {
      throw new Error(`Library directory ${libraryDirectoryId} not found`);
    }

    // Get all missing tracks
    const missingTracks = db.prepare(`
      SELECT * FROM tracks
      WHERE library_directory_id = ?
        AND is_missing = 1
    `).all(libraryDirectoryId);

    if (missingTracks.length === 0) {
      return {
        success: true,
        tracksRestored: 0,
        message: 'No missing tracks to restore',
      };
    }

    logger.info(`Checking ${missingTracks.length} missing tracks for restoration`);

    let restoredCount = 0;

    // Check each track
    for (const track of missingTracks) {
      try {
        await fs.access(track.file_path);

        // File exists - mark as found
        db.prepare(`
          UPDATE tracks
          SET is_missing = 0, missing_since = NULL
          WHERE id = ?
        `).run(track.id);

        restoredCount++;
        logger.info(`Restored track: ${track.file_path}`);
      } catch (error) {
        // File still missing - skip
      }
    }

    logger.info(`Restored ${restoredCount} of ${missingTracks.length} missing tracks`);

    return {
      success: true,
      tracksRestored: restoredCount,
      totalMissing: missingTracks.length,
      message: `Restored ${restoredCount} tracks`,
    };
  } catch (error) {
    logger.error(`Error restoring tracks for library ${libraryDirectoryId}:`, error);
    throw error;
  }
}

/**
 * Get missing track statistics for a library directory
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @returns {Object} Missing track statistics
 */
export function getMissingTrackStats(libraryDirectoryId) {
  try {
    const db = getDatabase();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_missing,
        COUNT(CASE WHEN missing_since < datetime('now', '-7 days') THEN 1 END) as missing_over_7_days,
        COUNT(CASE WHEN missing_since < datetime('now', '-30 days') THEN 1 END) as missing_over_30_days,
        COUNT(CASE WHEN missing_since < datetime('now', '-90 days') THEN 1 END) as missing_over_90_days,
        MIN(missing_since) as oldest_missing,
        SUM(file_size) as total_size
      FROM tracks
      WHERE library_directory_id = ?
        AND is_missing = 1
    `).get(libraryDirectoryId);

    return stats;
  } catch (error) {
    logger.error(`Error getting missing track stats for library ${libraryDirectoryId}:`, error);
    throw error;
  }
}

/**
 * Get all missing tracks for a library directory
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {Object} options - Query options
 * @returns {Array} Missing tracks
 */
export function getMissingTracks(libraryDirectoryId, options = {}) {
  try {
    const db = getDatabase();
    const { page = 1, limit = 50 } = options;

    const offset = (page - 1) * limit;

    const tracks = db.prepare(`
      SELECT * FROM tracks
      WHERE library_directory_id = ?
        AND is_missing = 1
      ORDER BY missing_since ASC
      LIMIT ? OFFSET ?
    `).all(libraryDirectoryId, limit, offset);

    const { count } = db.prepare(`
      SELECT COUNT(*) as count FROM tracks
      WHERE library_directory_id = ?
        AND is_missing = 1
    `).get(libraryDirectoryId);

    return {
      tracks,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  } catch (error) {
    logger.error(`Error getting missing tracks for library ${libraryDirectoryId}:`, error);
    throw error;
  }
}

export default {
  cleanupMissingTracks,
  markDirectoryTracksAsMissing,
  restoreTracks,
  getMissingTrackStats,
  getMissingTracks,
};
