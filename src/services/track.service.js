import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import * as waveformService from './waveform.service.js';
import { generateUUID, isValidUUID } from '../utils/uuid.js';

/**
 * Track Service
 * Manages track records in the database
 */

/**
 * Get columns for track SELECT queries
 * @param {boolean} excludeBlobs - If true, excludes BLOB fields (beats_data, downbeats_data)
 * @returns {string} Column list for SELECT statement
 */
function getTrackColumns(excludeBlobs = false) {
  if (excludeBlobs) {
    // Exclude BLOB fields for API responses to reduce memory usage and network overhead
    return `
      id, file_path, file_size, file_modified, file_hash,
      library_directory_id, relative_path, is_missing, missing_since, duplicate_group_id,
      title, artist, album, album_artist, genre, year, track_number, comment,
      duration_seconds, sample_rate, bit_rate, channels,
      bpm, musical_key, mode, time_signature, first_beat_offset, first_phrase_beat_no, stems_path,
      danceability, energy, loudness, valence, arousal, acousticness, instrumentalness,
      spectral_centroid, spectral_rolloff, spectral_bandwidth, zero_crossing_rate,
      date_added, date_analyzed, analysis_version,
      last_played, play_count, rating, color_tag, energy_level
    `;
  }
  return '*';
}

/**
 * Get track by ID
 * @param {string} id - Track UUID
 * @param {boolean} excludeBlobs - If true, excludes BLOB fields from result (default: true)
 * @returns {Object|null} Track or null
 */
export function getTrackById(id, excludeBlobs = true) {
  try {
    // Validate UUID format
    if (!isValidUUID(id)) {
      throw new Error(`Invalid track ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();
    const columns = getTrackColumns(excludeBlobs);
    const stmt = db.prepare(`SELECT ${columns} FROM tracks WHERE id = ?`);
    return stmt.get(id) || null;
  } catch (error) {
    logger.error(`Error getting track ${id}:`, error);
    throw error;
  }
}

/**
 * Get beats data for a track
 * @param {string} id - Track UUID
 * @returns {Array|null} Beats array or null
 */
export function getTrackBeats(id) {
  try {
    if (!isValidUUID(id)) {
      throw new Error(`Invalid track ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();
    const stmt = db.prepare('SELECT beats_data FROM tracks WHERE id = ?');
    const result = stmt.get(id);

    if (!result || !result.beats_data) {
      return null;
    }

    try {
      return JSON.parse(result.beats_data);
    } catch (error) {
      logger.warn(`Failed to parse beats_data for track ${id}`);
      return null;
    }
  } catch (error) {
    logger.error(`Error getting beats for track ${id}:`, error);
    throw error;
  }
}

/**
 * Get downbeats data for a track
 * @param {string} id - Track UUID
 * @returns {Array|null} Downbeats array or null
 */
export function getTrackDownbeats(id) {
  try {
    if (!isValidUUID(id)) {
      throw new Error(`Invalid track ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();
    const stmt = db.prepare('SELECT downbeats_data FROM tracks WHERE id = ?');
    const result = stmt.get(id);

    if (!result || !result.downbeats_data) {
      return null;
    }

    try {
      return JSON.parse(result.downbeats_data);
    } catch (error) {
      logger.warn(`Failed to parse downbeats_data for track ${id}`);
      return null;
    }
  } catch (error) {
    logger.error(`Error getting downbeats for track ${id}:`, error);
    throw error;
  }
}

/**
 * Get track by file path
 * @param {string} filePath - File path
 * @returns {Object|null} Track or null
 */
export function getTrackByPath(filePath) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM tracks WHERE file_path = ?');
    return stmt.get(filePath) || null;
  } catch (error) {
    logger.error(`Error getting track by path ${filePath}:`, error);
    throw error;
  }
}

/**
 * Get tracks by library directory
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {Object} filters - Optional filters
 * @param {boolean} excludeBlobs - If true, excludes BLOB fields from results
 * @returns {Array} Array of tracks
 */
export function getTracksByLibrary(libraryDirectoryId, filters = {}, excludeBlobs = true) {
  try {
    const db = getDatabase();
    const columns = getTrackColumns(excludeBlobs);
    let sql = `SELECT ${columns} FROM tracks WHERE library_directory_id = ?`;
    const params = [libraryDirectoryId];

    if (filters.is_missing !== undefined) {
      sql += ' AND is_missing = ?';
      params.push(filters.is_missing ? 1 : 0);
    }

    sql += ' ORDER BY artist, album, track_number';

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  } catch (error) {
    logger.error(`Error getting tracks for library ${libraryDirectoryId}:`, error);
    throw error;
  }
}

/**
 * Search tracks
 * @param {Object} filters - Search filters
 * @param {Object} pagination - Pagination options
 * @param {boolean} excludeBlobs - If true, excludes BLOB fields from results
 * @returns {Object} {tracks, total}
 */
export function searchTracks(filters = {}, pagination = {}, excludeBlobs = true) {
  try {
    const db = getDatabase();
    const { page = 1, limit = 50, sort = 'date_added', order = 'DESC' } = pagination;

    const columns = getTrackColumns(excludeBlobs);
    let sql = `SELECT ${columns} FROM tracks WHERE 1=1`;
    const params = [];

    // Apply filters
    if (filters.artist) {
      sql += ' AND artist LIKE ?';
      params.push(`%${filters.artist}%`);
    }

    if (filters.genre) {
      sql += ' AND genre LIKE ?';
      params.push(`%${filters.genre}%`);
    }

    if (filters.bpm_min) {
      sql += ' AND bpm >= ?';
      params.push(filters.bpm_min);
    }

    if (filters.bpm_max) {
      sql += ' AND bpm <= ?';
      params.push(filters.bpm_max);
    }

    if (filters.key !== undefined) {
      sql += ' AND musical_key = ?';
      params.push(filters.key);
    }

    if (filters.library_id) {
      sql += ' AND library_directory_id = ?';
      params.push(filters.library_id);
    }

    if (filters.is_missing !== undefined) {
      sql += ' AND is_missing = ?';
      params.push(filters.is_missing ? 1 : 0);
    }

    if (filters.search) {
      sql += ' AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)';
      const searchParam = `%${filters.search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    // Get total count
    const countSql = sql.replace(/SELECT .+ FROM/, 'SELECT COUNT(*) as count FROM');
    const countStmt = db.prepare(countSql);
    const { count } = countStmt.get(...params);

    // Apply sorting
    const validSortFields = ['date_added', 'artist', 'title', 'bpm', 'play_count'];
    const sortField = validSortFields.includes(sort) ? sort : 'date_added';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${sortField} ${sortOrder}`;

    // Apply pagination
    const offset = (page - 1) * limit;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(sql);
    const tracks = stmt.all(...params);

    return {
      tracks,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  } catch (error) {
    logger.error('Error searching tracks:', error);
    throw error;
  }
}

/**
 * Create or update a track
 * @param {Object} trackData - Track data
 * @returns {Object} Created/updated track
 */
export function upsertTrack(trackData) {
  try {
    const db = getDatabase();

    // Check if track exists by file path
    const existing = getTrackByPath(trackData.file_path);

    if (existing) {
      // Update existing track
      const fields = [];
      const params = [];

      // Only update provided fields
      const updateableFields = [
        'file_size',
        'file_modified',
        'file_hash',
        'library_directory_id',
        'relative_path',
        'is_missing',
        'title',
        'artist',
        'album',
        'album_artist',
        'genre',
        'year',
        'track_number',
        'comment',
        'duration_seconds',
        'sample_rate',
        'bit_rate',
        'channels',
      ];

      for (const field of updateableFields) {
        if (trackData[field] !== undefined) {
          fields.push(`${field} = ?`);
          // Convert boolean to integer for SQLite
          let value = trackData[field];
          if (field === 'is_missing' && typeof value === 'boolean') {
            value = value ? 1 : 0;
          }
          params.push(value);
        }
      }

      if (fields.length > 0) {
        params.push(existing.id);
        const stmt = db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...params);
      }

      return getTrackById(existing.id);
    } else {
      // Insert new track with generated UUID
      const trackId = generateUUID();

      const stmt = db.prepare(`
        INSERT INTO tracks (
          id, file_path, file_size, file_modified, file_hash,
          library_directory_id, relative_path, is_missing,
          title, artist, album, album_artist, genre, year, track_number, comment,
          duration_seconds, sample_rate, bit_rate, channels
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        trackId,
        trackData.file_path,
        trackData.file_size || null,
        trackData.file_modified || null,
        trackData.file_hash,
        trackData.library_directory_id || null,
        trackData.relative_path || null,
        trackData.is_missing ? 1 : 0, // Convert boolean to integer
        trackData.title || null,
        trackData.artist || null,
        trackData.album || null,
        trackData.album_artist || null,
        trackData.genre || null,
        trackData.year || null,
        trackData.track_number || null,
        trackData.comment || null,
        trackData.duration_seconds || null,
        trackData.sample_rate || null,
        trackData.bit_rate || null,
        trackData.channels || null
      );

      logger.info(`Track created with UUID ${trackId}: ${trackData.file_path}`);

      return getTrackById(trackId);
    }
  } catch (error) {
    logger.error('Error upserting track:', error);
    throw error;
  }
}

/**
 * Update track metadata
 * @param {string} id - Track UUID
 * @param {Object} updates - Metadata updates
 * @returns {Object} Updated track
 */
export function updateTrackMetadata(id, updates) {
  try {
    const db = getDatabase();

    const fields = [];
    const params = [];

    const updateableFields = [
      'title',
      'artist',
      'album',
      'album_artist',
      'genre',
      'year',
      'track_number',
      'comment',
      'rating',
      'color_tag',
      'energy_level',
      // Analysis fields
      'bpm',
      'musical_key',
      'mode',
      'time_signature',
      'beats_data',
      'downbeats_data',
      'first_beat_offset',
      'first_phrase_beat_no',
      'stems_path',
      'danceability',
      'energy',
      'loudness',
      'valence',
      'arousal',
      'acousticness',
      'instrumentalness',
      'spectral_centroid',
      'spectral_rolloff',
      'spectral_bandwidth',
      'zero_crossing_rate',
      'date_analyzed',
      'analysis_version',
    ];

    for (const field of updateableFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }

    if (fields.length > 0) {
      params.push(id);
      const stmt = db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...params);
    }

    return getTrackById(id);
  } catch (error) {
    logger.error(`Error updating track metadata ${id}:`, error);
    throw error;
  }
}

/**
 * Mark track as missing
 * @param {string} id - Track UUID
 * @returns {Object} Updated track
 */
export function markTrackMissing(id) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE tracks
      SET is_missing = 1, missing_since = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);

    return getTrackById(id);
  } catch (error) {
    logger.error(`Error marking track missing ${id}:`, error);
    throw error;
  }
}

/**
 * Mark track as found
 * @param {string} id - Track UUID
 * @returns {Object} Updated track
 */
export function markTrackFound(id) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE tracks
      SET is_missing = 0, missing_since = NULL
      WHERE id = ?
    `);
    stmt.run(id);

    return getTrackById(id);
  } catch (error) {
    logger.error(`Error marking track found ${id}:`, error);
    throw error;
  }
}

/**
 * Delete track
 * @param {string} id - Track UUID
 * @returns {boolean} True if deleted
 */
export function deleteTrack(id) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM tracks WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes > 0) {
      logger.info(`Track deleted: ${id}`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Error deleting track ${id}:`, error);
    throw error;
  }
}

/**
 * Get tracks with duplicate group info
 * @param {number} duplicateGroupId - Duplicate group ID
 * @returns {Array} Tracks in duplicate group
 */
export function getTracksByDuplicateGroup(duplicateGroupId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM tracks WHERE duplicate_group_id = ?');
    return stmt.all(duplicateGroupId);
  } catch (error) {
    logger.error(`Error getting tracks for duplicate group ${duplicateGroupId}:`, error);
    throw error;
  }
}

/**
 * Get track count statistics
 * @returns {Object} Statistics
 */
export function getTrackStats() {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN is_missing = 1 THEN 1 END) as missing,
        COUNT(CASE WHEN date_analyzed IS NOT NULL THEN 1 END) as analyzed,
        COUNT(CASE WHEN duplicate_group_id IS NOT NULL THEN 1 END) as duplicates,
        SUM(file_size) as total_size,
        AVG(duration_seconds) as avg_duration
      FROM tracks
    `);

    return stmt.get();
  } catch (error) {
    logger.error('Error getting track stats:', error);
    throw error;
  }
}

/**
 * Get an analyzed track by file hash
 * @param {string} fileHash - File hash
 * @returns {Object|null} Analyzed track or null
 */
export function getAnalyzedTrackByHash(fileHash) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM tracks
      WHERE file_hash = ?
        AND date_analyzed IS NOT NULL
        AND bpm IS NOT NULL
      LIMIT 1
    `);
    return stmt.get(fileHash) || null;
  } catch (error) {
    logger.error(`Error getting analyzed track by hash ${fileHash}:`, error);
    throw error;
  }
}

/**
 * Copy analysis data from one track to another
 * @param {string} fromTrackId - Source track UUID
 * @param {string} toTrackId - Destination track UUID
 * @returns {boolean} True if copied successfully
 */
export function copyAnalysisData(fromTrackId, toTrackId) {
  try {
    const db = getDatabase();

    // Get source track analysis data (including BLOBs)
    const sourceTrack = getTrackById(fromTrackId, false);
    if (!sourceTrack || !sourceTrack.date_analyzed) {
      logger.warn(`Source track ${fromTrackId} has no analysis data to copy`);
      return false;
    }

    // Copy all analysis fields
    const stmt = db.prepare(`
      UPDATE tracks SET
        bpm = ?,
        musical_key = ?,
        mode = ?,
        time_signature = ?,
        beats_data = ?,
        downbeats_data = ?,
        first_beat_offset = ?,
        first_phrase_beat_no = ?,
        danceability = ?,
        energy = ?,
        loudness = ?,
        valence = ?,
        arousal = ?,
        acousticness = ?,
        instrumentalness = ?,
        spectral_centroid = ?,
        spectral_rolloff = ?,
        spectral_bandwidth = ?,
        zero_crossing_rate = ?,
        date_analyzed = ?,
        analysis_version = ?
      WHERE id = ?
    `);

    stmt.run(
      sourceTrack.bpm,
      sourceTrack.musical_key,
      sourceTrack.mode,
      sourceTrack.time_signature,
      sourceTrack.beats_data,
      sourceTrack.downbeats_data,
      sourceTrack.first_beat_offset,
      sourceTrack.first_phrase_beat_no,
      sourceTrack.danceability,
      sourceTrack.energy,
      sourceTrack.loudness,
      sourceTrack.valence,
      sourceTrack.arousal,
      sourceTrack.acousticness,
      sourceTrack.instrumentalness,
      sourceTrack.spectral_centroid,
      sourceTrack.spectral_rolloff,
      sourceTrack.spectral_bandwidth,
      sourceTrack.zero_crossing_rate,
      sourceTrack.date_analyzed,
      sourceTrack.analysis_version,
      toTrackId
    );

    // Also copy waveforms
    try {
      const waveformCount = waveformService.copyWaveforms(fromTrackId, toTrackId);
      logger.info(
        `Copied analysis data and ${waveformCount} waveforms from track ${fromTrackId} to track ${toTrackId}`
      );
    } catch (error) {
      logger.warn(`Failed to copy waveforms from ${fromTrackId} to ${toTrackId}:`, error.message);
      logger.info(
        `Copied analysis data from track ${fromTrackId} to track ${toTrackId} (waveforms failed)`
      );
    }

    return true;
  } catch (error) {
    logger.error(`Error copying analysis data from ${fromTrackId} to ${toTrackId}:`, error);
    throw error;
  }
}

export default {
  getTrackById,
  getTrackBeats,
  getTrackDownbeats,
  getTrackByPath,
  getTracksByLibrary,
  searchTracks,
  upsertTrack,
  updateTrackMetadata,
  markTrackMissing,
  markTrackFound,
  deleteTrack,
  getTracksByDuplicateGroup,
  getTrackStats,
  getAnalyzedTrackByHash,
  copyAnalysisData,
};
