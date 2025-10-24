import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { isValidUUID } from '../utils/uuid.js';
import * as trackService from './track.service.js';

/**
 * Playlist Track Service
 * Manages tracks within playlists
 */

// ============================================================================
// Track Management
// ============================================================================

/**
 * Add tracks to playlist
 * @param {string} playlistId - Playlist UUID
 * @param {Array<string>} trackIds - Array of track UUIDs
 * @param {number|null} position - Position to insert (null = append to end)
 * @param {string|null} notes - Optional notes for all tracks
 * @returns {Array} Added playlist_track records
 */
export function addTracksToPlaylist(playlistId, trackIds, position = null, notes = null) {
  try {
    // Validate UUIDs
    if (!isValidUUID(playlistId)) {
      throw new Error(`Invalid playlist ID: ${playlistId}`);
    }

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      throw new Error('Track IDs must be a non-empty array');
    }

    trackIds.forEach(trackId => {
      if (!isValidUUID(trackId)) {
        throw new Error(`Invalid track ID: ${trackId}`);
      }
    });

    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    // Verify all tracks exist
    trackIds.forEach(trackId => {
      const track = trackService.getTrackById(trackId, true);
      if (!track) {
        throw new Error(`Track not found: ${trackId}`);
      }
    });

    // Get current max position
    const maxPosStmt = db.prepare('SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?');
    const maxPosResult = maxPosStmt.get(playlistId);
    const currentMaxPos = maxPosResult.max_pos !== null ? maxPosResult.max_pos : -1;

    // Determine insert position
    let insertPos = position !== null ? position : currentMaxPos + 1;

    // If inserting in middle, shift existing positions
    if (position !== null && position <= currentMaxPos) {
      const shiftStmt = db.prepare(`
        UPDATE playlist_tracks
        SET position = position + ?
        WHERE playlist_id = ? AND position >= ?
      `);
      shiftStmt.run(trackIds.length, playlistId, position);
    }

    // Insert tracks
    const insertStmt = db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position, date_added, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const addedTracks = [];
    trackIds.forEach((trackId, index) => {
      const pos = insertPos + index;
      insertStmt.run(playlistId, trackId, pos, now, notes);
      addedTracks.push({ playlist_id: playlistId, track_id: trackId, position: pos });
    });

    logger.info(`Added ${trackIds.length} track(s) to playlist ${playlistId}`);

    return addedTracks;
  } catch (error) {
    logger.error(`Error adding tracks to playlist ${playlistId}:`, error);
    throw error;
  }
}

/**
 * Remove track from playlist
 * @param {string} playlistId - Playlist UUID
 * @param {string} trackId - Track UUID
 * @returns {boolean} Success
 */
export function removeTrackFromPlaylist(playlistId, trackId) {
  try {
    // Validate UUIDs
    if (!isValidUUID(playlistId)) {
      throw new Error(`Invalid playlist ID: ${playlistId}`);
    }
    if (!isValidUUID(trackId)) {
      throw new Error(`Invalid track ID: ${trackId}`);
    }

    const db = getDatabase();

    // Get position of track to remove
    const posStmt = db.prepare(`
      SELECT position FROM playlist_tracks
      WHERE playlist_id = ? AND track_id = ?
      LIMIT 1
    `);
    const posResult = posStmt.get(playlistId, trackId);

    if (!posResult) {
      throw new Error(`Track ${trackId} not found in playlist ${playlistId}`);
    }

    const removedPosition = posResult.position;

    // Use transaction to avoid UNIQUE constraint violations
    db.exec('BEGIN TRANSACTION');

    try {
      // Delete track
      const deleteStmt = db.prepare(`
        DELETE FROM playlist_tracks
        WHERE playlist_id = ? AND track_id = ? AND position = ?
      `);
      deleteStmt.run(playlistId, trackId, removedPosition);

      // Resequence positions to fill gap
      // Step 1: Get all tracks after the removed one
      const tracksToUpdate = db.prepare(`
        SELECT track_id, position FROM playlist_tracks
        WHERE playlist_id = ? AND position > ?
        ORDER BY position
      `).all(playlistId, removedPosition);

      // Step 2: Update each position one by one
      const updateStmt = db.prepare(`
        UPDATE playlist_tracks
        SET position = ?
        WHERE playlist_id = ? AND track_id = ?
      `);

      tracksToUpdate.forEach(track => {
        updateStmt.run(track.position - 1, playlistId, track.track_id);
      });

      db.exec('COMMIT');

      logger.info(`Removed track ${trackId} from playlist ${playlistId}`);

      return true;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error(`Error removing track from playlist ${playlistId}:`, error);
    throw error;
  }
}

/**
 * Reorder tracks in playlist
 * @param {string} playlistId - Playlist UUID
 * @param {Array<string>} trackIds - New order of track UUIDs (must include all tracks)
 * @returns {boolean} Success
 */
export function reorderTracks(playlistId, trackIds) {
  try {
    // Validate playlist ID
    if (!isValidUUID(playlistId)) {
      throw new Error(`Invalid playlist ID: ${playlistId}`);
    }

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      throw new Error('Track IDs must be a non-empty array');
    }

    // Validate all track IDs
    trackIds.forEach(trackId => {
      if (!isValidUUID(trackId)) {
        throw new Error(`Invalid track ID: ${trackId}`);
      }
    });

    const db = getDatabase();

    // Get current tracks in playlist
    const currentStmt = db.prepare(`
      SELECT track_id FROM playlist_tracks
      WHERE playlist_id = ?
      ORDER BY position
    `);
    const currentTracks = currentStmt.all(playlistId);

    // Verify all tracks are included
    if (currentTracks.length !== trackIds.length) {
      throw new Error(`Track count mismatch: expected ${currentTracks.length}, got ${trackIds.length}`);
    }

    const currentTrackIds = new Set(currentTracks.map(t => t.track_id));
    const newTrackIds = new Set(trackIds);

    if (currentTrackIds.size !== newTrackIds.size) {
      throw new Error('Reorder must include all existing tracks exactly once');
    }

    for (const trackId of trackIds) {
      if (!currentTrackIds.has(trackId)) {
        throw new Error(`Track ${trackId} not found in playlist`);
      }
    }

    // Update positions in transaction
    // Strategy: Set all positions to negative values first to avoid UNIQUE constraint violations
    db.exec('BEGIN TRANSACTION');

    try {
      // Step 1: Set all positions to negative temporary values
      const tempStmt = db.prepare(`
        UPDATE playlist_tracks
        SET position = ?
        WHERE playlist_id = ? AND track_id = ?
      `);

      trackIds.forEach((trackId, index) => {
        tempStmt.run(-(index + 1), playlistId, trackId);
      });

      // Step 2: Set to final positive positions
      const finalStmt = db.prepare(`
        UPDATE playlist_tracks
        SET position = ?
        WHERE playlist_id = ? AND track_id = ?
      `);

      trackIds.forEach((trackId, index) => {
        finalStmt.run(index, playlistId, trackId);
      });

      db.exec('COMMIT');

      logger.info(`Reordered ${trackIds.length} tracks in playlist ${playlistId}`);

      return true;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error(`Error reordering tracks in playlist ${playlistId}:`, error);
    throw error;
  }
}

/**
 * Update track metadata within playlist
 * @param {string} playlistId - Playlist UUID
 * @param {string} trackId - Track UUID
 * @param {Object} metadata - Metadata to update
 * @param {string} metadata.notes - DJ notes
 * @param {number} metadata.cue_in - Custom start point (milliseconds)
 * @param {number} metadata.cue_out - Custom end point (milliseconds)
 * @param {number} metadata.rating_in_context - Rating (1-5)
 * @returns {Object} Updated record
 */
export function updateTrackMetadata(playlistId, trackId, metadata) {
  try {
    // Validate UUIDs
    if (!isValidUUID(playlistId)) {
      throw new Error(`Invalid playlist ID: ${playlistId}`);
    }
    if (!isValidUUID(trackId)) {
      throw new Error(`Invalid track ID: ${trackId}`);
    }

    const db = getDatabase();

    // Verify track exists in playlist
    const existsStmt = db.prepare(`
      SELECT * FROM playlist_tracks
      WHERE playlist_id = ? AND track_id = ?
      LIMIT 1
    `);
    const existing = existsStmt.get(playlistId, trackId);

    if (!existing) {
      throw new Error(`Track ${trackId} not found in playlist ${playlistId}`);
    }

    // Build update query
    const allowedFields = ['notes', 'cue_in', 'cue_out', 'rating_in_context'];
    const fields = [];
    const params = [];

    Object.keys(metadata).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        params.push(metadata[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add WHERE clause params
    params.push(playlistId, trackId);

    // Execute update
    const sql = `
      UPDATE playlist_tracks
      SET ${fields.join(', ')}
      WHERE playlist_id = ? AND track_id = ?
    `;
    const stmt = db.prepare(sql);
    stmt.run(...params);

    logger.info(`Updated metadata for track ${trackId} in playlist ${playlistId}`);

    // Return updated record
    return existsStmt.get(playlistId, trackId);
  } catch (error) {
    logger.error(`Error updating track metadata in playlist ${playlistId}:`, error);
    throw error;
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all tracks in playlist
 * @param {string} playlistId - Playlist UUID
 * @param {string} sortBy - Sort field (default: 'position')
 * @returns {Array} Tracks with playlist-specific metadata
 */
export function getPlaylistTracks(playlistId, sortBy = 'position') {
  try {
    // Validate playlist ID
    if (!isValidUUID(playlistId)) {
      throw new Error(`Invalid playlist ID: ${playlistId}`);
    }

    const db = getDatabase();

    // Valid sort fields
    const validSortFields = ['position', 'date_added', 'played_at'];
    if (!validSortFields.includes(sortBy)) {
      sortBy = 'position';
    }

    // Get playlist tracks with full track data
    const stmt = db.prepare(`
      SELECT
        pt.playlist_id,
        pt.track_id,
        pt.position,
        pt.date_added,
        pt.played_at,
        pt.play_duration,
        pt.notes,
        pt.cue_in,
        pt.cue_out,
        pt.rating_in_context,
        t.*
      FROM playlist_tracks pt
      LEFT JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
      ORDER BY pt.${sortBy} ASC
    `);

    const rows = stmt.all(playlistId);

    // Format response to separate playlist metadata from track data
    return rows.map(row => ({
      playlist_id: row.playlist_id,
      track_id: row.track_id,
      position: row.position,
      date_added: row.date_added,
      played_at: row.played_at,
      play_duration: row.play_duration,
      notes: row.notes,
      cue_in: row.cue_in,
      cue_out: row.cue_out,
      rating_in_context: row.rating_in_context,
      track: {
        id: row.id,
        file_path: row.file_path,
        file_size: row.file_size,
        file_hash: row.file_hash,
        library_directory_id: row.library_directory_id,
        relative_path: row.relative_path,
        is_missing: row.is_missing,
        title: row.title,
        artist: row.artist,
        album: row.album,
        album_artist: row.album_artist,
        genre: row.genre,
        year: row.year,
        duration_seconds: row.duration_seconds,
        sample_rate: row.sample_rate,
        bit_rate: row.bit_rate,
        channels: row.channels,
        bpm: row.bpm,
        musical_key: row.musical_key,
        mode: row.mode,
        energy: row.energy,
        danceability: row.danceability,
        valence: row.valence,
        arousal: row.arousal,
        date_added: row.date_added,
        date_analyzed: row.date_analyzed,
        play_count: row.play_count,
        last_played: row.last_played,
        rating: row.rating,
      },
    }));
  } catch (error) {
    logger.error(`Error getting tracks for playlist ${playlistId}:`, error);
    throw error;
  }
}

/**
 * Get all playlists containing a track
 * @param {string} trackId - Track UUID
 * @returns {Array} Playlists containing this track
 */
export function getPlaylistsContainingTrack(trackId) {
  try {
    // Validate track ID
    if (!isValidUUID(trackId)) {
      throw new Error(`Invalid track ID: ${trackId}`);
    }

    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT DISTINCT p.*
      FROM playlists p
      INNER JOIN playlist_tracks pt ON p.id = pt.playlist_id
      WHERE pt.track_id = ?
      ORDER BY p.updated_at DESC
    `);

    const playlists = stmt.all(trackId);

    // Parse criteria for smart playlists
    playlists.forEach(playlist => {
      if (playlist.smart_criteria) {
        try {
          playlist.criteria = JSON.parse(playlist.smart_criteria);
        } catch (error) {
          playlist.criteria = null;
        }
      }
    });

    return playlists;
  } catch (error) {
    logger.error(`Error getting playlists for track ${trackId}:`, error);
    throw error;
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate track exists
 * @param {string} trackId - Track UUID
 * @returns {boolean} True if exists
 */
export function validateTrackExists(trackId) {
  try {
    const track = trackService.getTrackById(trackId, true);
    return track !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Check if track already in playlist
 * @param {string} playlistId - Playlist UUID
 * @param {string} trackId - Track UUID
 * @returns {boolean} True if track is in playlist
 */
export function checkDuplicate(playlistId, trackId) {
  try {
    if (!isValidUUID(playlistId) || !isValidUUID(trackId)) {
      return false;
    }

    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM playlist_tracks
      WHERE playlist_id = ? AND track_id = ?
    `);

    const result = stmt.get(playlistId, trackId);
    return result.count > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Clear all tracks from playlist
 * @param {string} playlistId - Playlist UUID
 * @returns {number} Number of tracks removed
 */
export function clearPlaylist(playlistId) {
  try {
    // Validate playlist ID
    if (!isValidUUID(playlistId)) {
      throw new Error(`Invalid playlist ID: ${playlistId}`);
    }

    const db = getDatabase();

    const stmt = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?');
    const result = stmt.run(playlistId);

    logger.info(`Cleared ${result.changes} track(s) from playlist ${playlistId}`);

    return result.changes;
  } catch (error) {
    logger.error(`Error clearing playlist ${playlistId}:`, error);
    throw error;
  }
}
