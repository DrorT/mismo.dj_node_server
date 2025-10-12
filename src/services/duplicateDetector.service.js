import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Duplicate Detector Service
 * Handles duplicate detection based on file hash
 */

/**
 * Check if file hash exists and assign to duplicate group
 * This is called during import to auto-detect duplicates
 *
 * @param {number} trackId - Track ID to check
 * @returns {Object|null} Duplicate group info or null
 */
export function checkAndAssignDuplicateGroup(trackId) {
  try {
    const db = getDatabase();

    // Get track's file hash
    const track = db.prepare('SELECT id, file_hash, file_path FROM tracks WHERE id = ?').get(trackId);

    if (!track || !track.file_hash) {
      return null;
    }

    // Check if duplicate group exists for this hash
    let duplicateGroup = db.prepare('SELECT * FROM duplicate_groups WHERE file_hash = ?').get(track.file_hash);

    if (duplicateGroup) {
      // Duplicate group exists - add track to it
      const updateTrack = db.prepare('UPDATE tracks SET duplicate_group_id = ? WHERE id = ?');
      updateTrack.run(duplicateGroup.id, trackId);

      // Update total count
      const updateGroup = db.prepare('UPDATE duplicate_groups SET total_duplicates = total_duplicates + 1 WHERE id = ?');
      updateGroup.run(duplicateGroup.id);

      logger.info(`Track ${trackId} assigned to duplicate group ${duplicateGroup.id}`);

      return {
        groupId: duplicateGroup.id,
        isNewGroup: false,
        totalDuplicates: duplicateGroup.total_duplicates + 1,
      };
    } else {
      // Check if this is the first occurrence (no other tracks with same hash)
      const existingTrack = db.prepare('SELECT id FROM tracks WHERE file_hash = ? AND id != ?').get(track.file_hash, trackId);

      if (existingTrack) {
        // Create new duplicate group
        const insertGroup = db.prepare(`
          INSERT INTO duplicate_groups (file_hash, canonical_track_id, total_duplicates)
          VALUES (?, ?, 2)
        `);

        const result = insertGroup.run(track.file_hash, existingTrack.id, 2);
        const groupId = result.lastInsertRowid;

        // Assign both tracks to the group
        const updateTracks = db.prepare('UPDATE tracks SET duplicate_group_id = ? WHERE id IN (?, ?)');
        updateTracks.run(groupId, existingTrack.id, trackId);

        logger.info(`Created duplicate group ${groupId} for tracks ${existingTrack.id} and ${trackId}`);

        return {
          groupId,
          isNewGroup: true,
          totalDuplicates: 2,
        };
      }
    }

    // No duplicates found
    return null;
  } catch (error) {
    logger.error(`Error checking duplicate for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Scan entire library for duplicates
 * Finds all tracks with matching hashes and creates/updates duplicate groups
 *
 * @returns {Object} {groupsCreated, tracksProcessed}
 */
export function scanLibraryForDuplicates() {
  try {
    const db = getDatabase();

    logger.info('Starting full library duplicate scan...');

    // Clear existing duplicate assignments
    db.prepare('UPDATE tracks SET duplicate_group_id = NULL').run();
    db.prepare('DELETE FROM duplicate_groups').run();

    // Find all hashes that have duplicates
    const duplicateHashes = db.prepare(`
      SELECT file_hash, COUNT(*) as count
      FROM tracks
      WHERE file_hash IS NOT NULL
      GROUP BY file_hash
      HAVING count > 1
    `).all();

    let groupsCreated = 0;
    let tracksProcessed = 0;

    for (const { file_hash, count } of duplicateHashes) {
      // Get all tracks with this hash
      const tracks = db.prepare('SELECT id, file_path FROM tracks WHERE file_hash = ? ORDER BY id').all(file_hash);

      if (tracks.length > 1) {
        // Create duplicate group with first track as canonical
        const insertGroup = db.prepare(`
          INSERT INTO duplicate_groups (file_hash, canonical_track_id, total_duplicates)
          VALUES (?, ?, ?)
        `);

        const result = insertGroup.run(file_hash, tracks[0].id, tracks.length);
        const groupId = result.lastInsertRowid;

        // Assign all tracks to the group
        const trackIds = tracks.map(t => t.id);
        const placeholders = trackIds.map(() => '?').join(',');
        const updateTracks = db.prepare(`UPDATE tracks SET duplicate_group_id = ? WHERE id IN (${placeholders})`);
        updateTracks.run(groupId, ...trackIds);

        groupsCreated++;
        tracksProcessed += tracks.length;

        logger.info(`Created duplicate group ${groupId} with ${tracks.length} tracks`);
      }
    }

    logger.info(`Duplicate scan complete: ${groupsCreated} groups created, ${tracksProcessed} tracks processed`);

    return {
      groupsCreated,
      tracksProcessed,
      duplicateHashes: duplicateHashes.length,
    };
  } catch (error) {
    logger.error('Error scanning library for duplicates:', error);
    throw error;
  }
}

/**
 * Get all duplicate groups
 *
 * @param {Object} options - Query options
 * @returns {Array} Array of duplicate groups with track info
 */
export function getAllDuplicateGroups(options = {}) {
  try {
    const db = getDatabase();
    const { page = 1, limit = 50 } = options;

    // Get total count
    const { count } = db.prepare('SELECT COUNT(*) as count FROM duplicate_groups').get();

    // Get groups with pagination
    const offset = (page - 1) * limit;
    const groups = db.prepare(`
      SELECT
        dg.*,
        COUNT(t.id) as track_count,
        GROUP_CONCAT(t.file_path, '||') as file_paths
      FROM duplicate_groups dg
      LEFT JOIN tracks t ON t.duplicate_group_id = dg.id
      GROUP BY dg.id
      ORDER BY dg.total_duplicates DESC, dg.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return {
      groups,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  } catch (error) {
    logger.error('Error getting duplicate groups:', error);
    throw error;
  }
}

/**
 * Get duplicate group by ID with all tracks
 *
 * @param {number} groupId - Duplicate group ID
 * @returns {Object|null} Duplicate group with tracks
 */
export function getDuplicateGroupById(groupId) {
  try {
    const db = getDatabase();

    const group = db.prepare('SELECT * FROM duplicate_groups WHERE id = ?').get(groupId);

    if (!group) {
      return null;
    }

    // Get all tracks in this group
    const tracks = db.prepare(`
      SELECT
        t.*,
        ld.path as library_path,
        CASE WHEN t.id = ? THEN 1 ELSE 0 END as is_canonical
      FROM tracks t
      LEFT JOIN library_directories ld ON ld.id = t.library_directory_id
      WHERE t.duplicate_group_id = ?
      ORDER BY is_canonical DESC, t.file_size DESC, t.bit_rate DESC
    `).all(group.canonical_track_id, groupId);

    return {
      ...group,
      tracks,
    };
  } catch (error) {
    logger.error(`Error getting duplicate group ${groupId}:`, error);
    throw error;
  }
}

/**
 * Resolve duplicates by selecting canonical track
 *
 * @param {number} groupId - Duplicate group ID
 * @param {number} canonicalTrackId - Track to keep as canonical
 * @param {Object} options - Resolution options
 * @returns {Promise<Object>} Resolution result
 */
export async function resolveDuplicates(groupId, canonicalTrackId, options = {}) {
  try {
    const db = getDatabase();
    const {
      deleteFiles = false,  // Whether to delete duplicate files from disk
      keepMetadata = true,  // Whether to merge metadata
      updatePlaylists = true,  // Whether to update playlists
    } = options;

    // Get group and all tracks
    const group = getDuplicateGroupById(groupId);

    if (!group) {
      throw new Error(`Duplicate group ${groupId} not found`);
    }

    // Verify canonical track is in this group
    const canonicalTrack = group.tracks.find(t => t.id === canonicalTrackId);

    if (!canonicalTrack) {
      throw new Error(`Track ${canonicalTrackId} is not in duplicate group ${groupId}`);
    }

    const duplicateTracks = group.tracks.filter(t => t.id !== canonicalTrackId);

    logger.info(`Resolving duplicate group ${groupId}, keeping track ${canonicalTrackId}`);

    // Start transaction
    const transaction = db.transaction(() => {
      // Update canonical track in group
      db.prepare('UPDATE duplicate_groups SET canonical_track_id = ? WHERE id = ?')
        .run(canonicalTrackId, groupId);

      // Merge metadata if requested
      if (keepMetadata) {
        mergeMetadata(canonicalTrackId, duplicateTracks);
      }

      // Update playlists if requested
      if (updatePlaylists) {
        updatePlaylistReferences(canonicalTrackId, duplicateTracks.map(t => t.id));
      }

      // Remove duplicates from database
      const duplicateIds = duplicateTracks.map(t => t.id);
      const placeholders = duplicateIds.map(() => '?').join(',');

      if (duplicateIds.length > 0) {
        db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...duplicateIds);
      }

      // Update group total
      db.prepare('UPDATE duplicate_groups SET total_duplicates = 1 WHERE id = ?').run(groupId);

      // Remove canonical track from group (no longer a duplicate)
      db.prepare('UPDATE tracks SET duplicate_group_id = NULL WHERE id = ?').run(canonicalTrackId);

      // Delete the group since there are no more duplicates
      db.prepare('DELETE FROM duplicate_groups WHERE id = ?').run(groupId);
    });

    transaction();

    // Delete files from disk if requested
    const deletedFiles = [];
    if (deleteFiles) {
      const fs = await import('fs/promises');

      for (const track of duplicateTracks) {
        try {
          await fs.unlink(track.file_path);
          deletedFiles.push(track.file_path);
          logger.info(`Deleted duplicate file: ${track.file_path}`);
        } catch (error) {
          logger.error(`Failed to delete file ${track.file_path}:`, error.message);
        }
      }
    }

    logger.info(`Resolved duplicate group ${groupId}, removed ${duplicateTracks.length} duplicates`);

    return {
      success: true,
      canonicalTrackId,
      duplicatesRemoved: duplicateTracks.length,
      filesDeleted: deletedFiles.length,
      deletedFiles,
    };
  } catch (error) {
    logger.error(`Error resolving duplicate group ${groupId}:`, error);
    throw error;
  }
}

/**
 * Merge metadata from duplicate tracks into canonical track
 * Takes the best quality data from all duplicates
 *
 * @param {number} canonicalTrackId - Canonical track ID
 * @param {Array} duplicateTracks - Duplicate tracks
 */
function mergeMetadata(canonicalTrackId, duplicateTracks) {
  try {
    const db = getDatabase();

    // Get canonical track
    const canonical = db.prepare('SELECT * FROM tracks WHERE id = ?').get(canonicalTrackId);

    const updates = {};
    const fieldsToMerge = [
      'title', 'artist', 'album', 'album_artist', 'genre', 'year',
      'track_number', 'comment', 'bpm', 'musical_key', 'rating'
    ];

    // For each field, take non-null value from any duplicate if canonical is null
    for (const field of fieldsToMerge) {
      if (!canonical[field]) {
        for (const dup of duplicateTracks) {
          if (dup[field]) {
            updates[field] = dup[field];
            break;
          }
        }
      }
    }

    // Take highest rating
    const ratings = [canonical.rating || 0, ...duplicateTracks.map(t => t.rating || 0)];
    updates.rating = Math.max(...ratings);

    // Update canonical track if we have any updates
    if (Object.keys(updates).length > 0) {
      const fields = Object.keys(updates).map(f => `${f} = ?`).join(', ');
      const values = Object.values(updates);

      db.prepare(`UPDATE tracks SET ${fields} WHERE id = ?`).run(...values, canonicalTrackId);

      logger.info(`Merged metadata into canonical track ${canonicalTrackId}`);
    }
  } catch (error) {
    logger.error(`Error merging metadata:`, error);
    throw error;
  }
}

/**
 * Update playlist references to point to canonical track
 *
 * @param {number} canonicalTrackId - Canonical track ID
 * @param {Array<number>} duplicateTrackIds - IDs of duplicate tracks
 */
function updatePlaylistReferences(canonicalTrackId, duplicateTrackIds) {
  try {
    const db = getDatabase();

    if (duplicateTrackIds.length === 0) {
      return;
    }

    const placeholders = duplicateTrackIds.map(() => '?').join(',');

    // Update all playlist entries that reference duplicate tracks
    const stmt = db.prepare(`
      UPDATE playlist_tracks
      SET track_id = ?
      WHERE track_id IN (${placeholders})
    `);

    const result = stmt.run(canonicalTrackId, ...duplicateTrackIds);

    if (result.changes > 0) {
      logger.info(`Updated ${result.changes} playlist references to canonical track ${canonicalTrackId}`);
    }
  } catch (error) {
    logger.error('Error updating playlist references:', error);
    throw error;
  }
}

/**
 * Get duplicate statistics
 *
 * @returns {Object} Statistics about duplicates
 */
export function getDuplicateStats() {
  try {
    const db = getDatabase();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_groups,
        SUM(total_duplicates) as total_duplicate_tracks,
        AVG(total_duplicates) as avg_duplicates_per_group,
        MAX(total_duplicates) as max_duplicates_in_group
      FROM duplicate_groups
    `).get();

    // Get duplicate tracks total file size (wasted space)
    const sizeStats = db.prepare(`
      SELECT
        SUM(t.file_size) as total_duplicate_size
      FROM tracks t
      INNER JOIN duplicate_groups dg ON t.duplicate_group_id = dg.id
      WHERE t.id != dg.canonical_track_id
    `).get();

    return {
      ...stats,
      wasted_space_bytes: sizeStats.total_duplicate_size || 0,
    };
  } catch (error) {
    logger.error('Error getting duplicate stats:', error);
    throw error;
  }
}

export default {
  checkAndAssignDuplicateGroup,
  scanLibraryForDuplicates,
  getAllDuplicateGroups,
  getDuplicateGroupById,
  resolveDuplicates,
  getDuplicateStats,
};
