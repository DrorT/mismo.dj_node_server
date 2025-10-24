import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { isValidUUID } from '../utils/uuid.js';
import * as playlistService from './playlist.service.js';
import * as playlistTrackService from './playlistTrack.service.js';

/**
 * Smart Playlist Evaluator Service
 * Converts JSON criteria to SQL queries and evaluates smart playlists
 */

// ============================================================================
// Criteria Evaluation
// ============================================================================

/**
 * Evaluate criteria and return matching track IDs
 * @param {Object} criteria - Smart playlist criteria
 * @returns {Array<string>} Array of track UUIDs
 */
export function evaluateCriteria(criteria) {
  try {
    const db = getDatabase();

    // Build SQL query from criteria
    const { sql, params } = buildSQLQuery(criteria);

    // Execute query
    const stmt = db.prepare(sql);
    const results = stmt.all(...params);

    logger.debug(`Smart playlist criteria matched ${results.length} tracks`);

    return results.map(row => row.id);
  } catch (error) {
    logger.error('Error evaluating smart playlist criteria:', error);
    throw error;
  }
}

/**
 * Build SQL query from criteria
 * @param {Object} criteria - Smart playlist criteria
 * @returns {Object} { sql, params } - Prepared statement components
 */
export function buildSQLQuery(criteria) {
  try {
    // Start with base SELECT
    let sql = 'SELECT id FROM tracks';
    const params = [];

    // Build WHERE clause
    const { where, whereParams } = buildWhereClause(criteria);
    if (where) {
      sql += ` ${where}`;
      params.push(...whereParams);
    }

    // Build ORDER BY clause
    const orderClause = buildOrderClause(criteria);
    if (orderClause) {
      sql += ` ${orderClause}`;
    }

    // Build LIMIT clause
    const limitClause = buildLimitClause(criteria);
    if (limitClause) {
      sql += ` ${limitClause}`;
    }

    return { sql, params };
  } catch (error) {
    logger.error('Error building SQL query from criteria:', error);
    throw error;
  }
}

/**
 * Build WHERE clause from criteria
 * @param {Object} criteria - Smart playlist criteria
 * @returns {Object} { where, whereParams } - WHERE clause and parameters
 */
function buildWhereClause(criteria) {
  const conditions = [];
  const params = [];

  // BPM range
  if (criteria.bpm_min !== undefined && criteria.bpm_min !== null) {
    conditions.push('bpm >= ?');
    params.push(criteria.bpm_min);
  }
  if (criteria.bpm_max !== undefined && criteria.bpm_max !== null) {
    conditions.push('bpm <= ?');
    params.push(criteria.bpm_max);
  }

  // Musical key
  if (criteria.key !== undefined && criteria.key !== null) {
    conditions.push('musical_key = ?');
    params.push(criteria.key);
  }

  // Mode (major/minor)
  if (criteria.mode !== undefined && criteria.mode !== null) {
    conditions.push('mode = ?');
    params.push(criteria.mode);
  }

  // Genre (IN clause for array)
  if (criteria.genres && Array.isArray(criteria.genres) && criteria.genres.length > 0) {
    const placeholders = criteria.genres.map(() => '?').join(',');
    conditions.push(`genre IN (${placeholders})`);
    params.push(...criteria.genres);
  }

  // Energy range
  if (criteria.energy_min !== undefined && criteria.energy_min !== null) {
    conditions.push('energy >= ?');
    params.push(criteria.energy_min);
  }
  if (criteria.energy_max !== undefined && criteria.energy_max !== null) {
    conditions.push('energy <= ?');
    params.push(criteria.energy_max);
  }

  // Danceability
  if (criteria.danceability_min !== undefined && criteria.danceability_min !== null) {
    conditions.push('danceability >= ?');
    params.push(criteria.danceability_min);
  }

  // Valence (musical positivity)
  if (criteria.valence_min !== undefined && criteria.valence_min !== null) {
    conditions.push('valence >= ?');
    params.push(criteria.valence_min);
  }

  // Arousal
  if (criteria.arousal_min !== undefined && criteria.arousal_min !== null) {
    conditions.push('arousal >= ?');
    params.push(criteria.arousal_min);
  }

  // Date added range
  if (criteria.date_added_after !== undefined && criteria.date_added_after !== null) {
    conditions.push('date_added >= ?');
    params.push(criteria.date_added_after);
  }
  if (criteria.date_added_before !== undefined && criteria.date_added_before !== null) {
    conditions.push('date_added <= ?');
    params.push(criteria.date_added_before);
  }

  // Play count range
  if (criteria.play_count_min !== undefined && criteria.play_count_min !== null) {
    conditions.push('play_count >= ?');
    params.push(criteria.play_count_min);
  }
  if (criteria.play_count_max !== undefined && criteria.play_count_max !== null) {
    conditions.push('play_count <= ?');
    params.push(criteria.play_count_max);
  }

  // Last played
  if (criteria.last_played_before !== undefined && criteria.last_played_before !== null) {
    conditions.push('(last_played <= ? OR last_played IS NULL)');
    params.push(criteria.last_played_before);
  }
  if (criteria.last_played_after !== undefined && criteria.last_played_after !== null) {
    conditions.push('last_played >= ?');
    params.push(criteria.last_played_after);
  }

  // Rating
  if (criteria.rating_min !== undefined && criteria.rating_min !== null) {
    conditions.push('rating >= ?');
    params.push(criteria.rating_min);
  }

  // Bitrate
  if (criteria.bitrate_min !== undefined && criteria.bitrate_min !== null) {
    conditions.push('bit_rate >= ?');
    params.push(criteria.bitrate_min);
  }

  // Library directory
  if (criteria.library_directory_id) {
    if (isValidUUID(criteria.library_directory_id)) {
      conditions.push('library_directory_id = ?');
      params.push(criteria.library_directory_id);
    }
  }

  // Relative path contains
  if (criteria.relative_path_contains) {
    conditions.push('relative_path LIKE ?');
    params.push(`%${criteria.relative_path_contains}%`);
  }

  // Is analyzed
  if (criteria.is_analyzed !== undefined && criteria.is_analyzed !== null) {
    if (criteria.is_analyzed) {
      conditions.push('date_analyzed IS NOT NULL');
    } else {
      conditions.push('date_analyzed IS NULL');
    }
  }

  // Has stems
  if (criteria.has_stems !== undefined && criteria.has_stems !== null) {
    if (criteria.has_stems) {
      conditions.push('stems_path IS NOT NULL');
    } else {
      conditions.push('stems_path IS NULL');
    }
  }

  // Always exclude missing tracks
  conditions.push('is_missing = 0');

  // Combine conditions with AND
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where, whereParams: params };
}

/**
 * Build ORDER BY clause from criteria
 * @param {Object} criteria - Smart playlist criteria
 * @returns {string} ORDER BY clause
 */
function buildOrderClause(criteria) {
  if (!criteria.sort_by) {
    return 'ORDER BY date_added DESC';
  }

  // Valid sort fields
  const validSortFields = [
    'bpm', 'musical_key', 'mode', 'energy', 'danceability', 'valence', 'arousal',
    'date_added', 'date_analyzed', 'play_count', 'last_played', 'rating',
    'artist', 'title', 'album', 'genre', 'year',
    'duration_seconds', 'bit_rate', 'sample_rate'
  ];

  if (!validSortFields.includes(criteria.sort_by)) {
    logger.warn(`Invalid sort field: ${criteria.sort_by}, defaulting to date_added`);
    return 'ORDER BY date_added DESC';
  }

  const order = criteria.sort_order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return `ORDER BY ${criteria.sort_by} ${order}`;
}

/**
 * Build LIMIT clause from criteria
 * @param {Object} criteria - Smart playlist criteria
 * @returns {string} LIMIT clause
 */
function buildLimitClause(criteria) {
  if (!criteria.limit) {
    return '';
  }

  const limit = parseInt(criteria.limit);
  if (isNaN(limit) || limit <= 0) {
    return '';
  }

  // Cap at 1000 tracks for performance
  const cappedLimit = Math.min(limit, 1000);

  return `LIMIT ${cappedLimit}`;
}

// ============================================================================
// Smart Playlist Operations
// ============================================================================

/**
 * Refresh smart playlist (re-evaluate and update tracks)
 * @param {string} playlistId - Playlist UUID
 * @returns {Object} { added, removed, total } - Change summary
 */
export function refreshSmartPlaylist(playlistId) {
  try {
    // Validate playlist ID
    if (!isValidUUID(playlistId)) {
      throw new Error(`Invalid playlist ID: ${playlistId}`);
    }

    const db = getDatabase();

    // Get playlist
    const playlist = playlistService.getPlaylistById(playlistId, true);
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistId}`);
    }

    // Verify it's a smart playlist
    if (playlist.type !== 'smart') {
      throw new Error(`Playlist ${playlistId} is not a smart playlist (type: ${playlist.type})`);
    }

    // Get criteria
    const criteria = playlist.criteria;
    if (!criteria) {
      throw new Error(`Smart playlist ${playlistId} has no criteria`);
    }

    // Evaluate criteria to get matching track IDs
    const matchingTrackIds = evaluateCriteria(criteria);

    // Get current tracks in playlist
    const currentTracks = playlist.tracks || [];
    const currentTrackIds = currentTracks.map(pt => pt.track_id);

    // Calculate differences
    const currentSet = new Set(currentTrackIds);
    const matchingSet = new Set(matchingTrackIds);

    const toAdd = matchingTrackIds.filter(id => !currentSet.has(id));
    const toRemove = currentTrackIds.filter(id => !matchingSet.has(id));

    // Apply changes in transaction
    db.exec('BEGIN TRANSACTION');

    try {
      // Remove tracks that no longer match
      for (const trackId of toRemove) {
        playlistTrackService.removeTrackFromPlaylist(playlistId, trackId);
      }

      // Add new matching tracks
      if (toAdd.length > 0) {
        playlistTrackService.addTracksToPlaylist(playlistId, toAdd);
      }

      db.exec('COMMIT');

      logger.info(`Refreshed smart playlist ${playlistId}: +${toAdd.length}, -${toRemove.length}, total: ${matchingTrackIds.length}`);

      return {
        added: toAdd,
        removed: toRemove,
        total: matchingTrackIds.length,
        addedCount: toAdd.length,
        removedCount: toRemove.length
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error(`Error refreshing smart playlist ${playlistId}:`, error);
    throw error;
  }
}

/**
 * Convert smart playlist to static
 * @param {string} playlistId - Playlist UUID
 * @returns {Object} Converted playlist
 */
export function convertToStatic(playlistId) {
  try {
    // Validate playlist ID
    if (!isValidUUID(playlistId)) {
      throw new Error(`Invalid playlist ID: ${playlistId}`);
    }

    // Get playlist
    const playlist = playlistService.getPlaylistById(playlistId, false);
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistId}`);
    }

    // Verify it's a smart playlist
    if (playlist.type !== 'smart') {
      throw new Error(`Playlist ${playlistId} is not a smart playlist (type: ${playlist.type})`);
    }

    // Update playlist type to static and remove criteria
    const updated = playlistService.updatePlaylist(playlistId, {
      smart_criteria: null
    });

    // Also update the type field
    const db = getDatabase();
    db.prepare('UPDATE playlists SET type = ?, is_smart = 0 WHERE id = ?').run('static', playlistId);

    logger.info(`Converted smart playlist to static: ${playlistId}`);

    return playlistService.getPlaylistById(playlistId, false);
  } catch (error) {
    logger.error(`Error converting smart playlist ${playlistId} to static:`, error);
    throw error;
  }
}

// ============================================================================
// Criteria Explanation
// ============================================================================

/**
 * Generate human-readable explanation of criteria
 * @param {Object} criteria - Smart playlist criteria
 * @returns {string} Human-readable description
 */
export function explainCriteria(criteria) {
  try {
    const parts = [];

    // BPM
    if (criteria.bpm_min !== undefined || criteria.bpm_max !== undefined) {
      if (criteria.bpm_min && criteria.bpm_max) {
        parts.push(`BPM between ${criteria.bpm_min} and ${criteria.bpm_max}`);
      } else if (criteria.bpm_min) {
        parts.push(`BPM at least ${criteria.bpm_min}`);
      } else if (criteria.bpm_max) {
        parts.push(`BPM up to ${criteria.bpm_max}`);
      }
    }

    // Key
    if (criteria.key !== undefined && criteria.key !== null) {
      const keyNames = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
      const keyName = keyNames[criteria.key] || criteria.key;
      parts.push(`Key: ${keyName}`);
    }

    // Mode
    if (criteria.mode !== undefined && criteria.mode !== null) {
      parts.push(criteria.mode === 1 ? 'Major' : 'Minor');
    }

    // Genres
    if (criteria.genres && criteria.genres.length > 0) {
      parts.push(`Genres: ${criteria.genres.join(', ')}`);
    }

    // Energy
    if (criteria.energy_min !== undefined || criteria.energy_max !== undefined) {
      if (criteria.energy_min && criteria.energy_max) {
        parts.push(`Energy ${criteria.energy_min}-${criteria.energy_max}`);
      } else if (criteria.energy_min) {
        parts.push(`Energy at least ${criteria.energy_min}`);
      } else if (criteria.energy_max) {
        parts.push(`Energy up to ${criteria.energy_max}`);
      }
    }

    // Danceability
    if (criteria.danceability_min !== undefined && criteria.danceability_min !== null) {
      parts.push(`Danceability at least ${criteria.danceability_min}`);
    }

    // Valence
    if (criteria.valence_min !== undefined && criteria.valence_min !== null) {
      parts.push(`Positivity at least ${criteria.valence_min}`);
    }

    // Arousal
    if (criteria.arousal_min !== undefined && criteria.arousal_min !== null) {
      parts.push(`Arousal at least ${criteria.arousal_min}`);
    }

    // Date added
    if (criteria.date_added_after !== undefined || criteria.date_added_before !== undefined) {
      if (criteria.date_added_after && criteria.date_added_before) {
        const after = new Date(criteria.date_added_after * 1000).toLocaleDateString();
        const before = new Date(criteria.date_added_before * 1000).toLocaleDateString();
        parts.push(`Added between ${after} and ${before}`);
      } else if (criteria.date_added_after) {
        const after = new Date(criteria.date_added_after * 1000).toLocaleDateString();
        parts.push(`Added after ${after}`);
      } else if (criteria.date_added_before) {
        const before = new Date(criteria.date_added_before * 1000).toLocaleDateString();
        parts.push(`Added before ${before}`);
      }
    }

    // Play count
    if (criteria.play_count_min !== undefined || criteria.play_count_max !== undefined) {
      if (criteria.play_count_min && criteria.play_count_max) {
        parts.push(`Played ${criteria.play_count_min}-${criteria.play_count_max} times`);
      } else if (criteria.play_count_min) {
        parts.push(`Played at least ${criteria.play_count_min} times`);
      } else if (criteria.play_count_max) {
        parts.push(`Played at most ${criteria.play_count_max} times`);
      }
    }

    // Rating
    if (criteria.rating_min !== undefined && criteria.rating_min !== null) {
      parts.push(`Rating at least ${criteria.rating_min}/5`);
    }

    // Bitrate
    if (criteria.bitrate_min !== undefined && criteria.bitrate_min !== null) {
      parts.push(`Bitrate at least ${criteria.bitrate_min}kbps`);
    }

    // Is analyzed
    if (criteria.is_analyzed !== undefined && criteria.is_analyzed !== null) {
      parts.push(criteria.is_analyzed ? 'Analyzed tracks' : 'Unanalyzed tracks');
    }

    // Has stems
    if (criteria.has_stems !== undefined && criteria.has_stems !== null) {
      parts.push(criteria.has_stems ? 'Has stems' : 'No stems');
    }

    // Sorting
    if (criteria.sort_by) {
      const order = criteria.sort_order === 'asc' ? 'ascending' : 'descending';
      parts.push(`Sorted by ${criteria.sort_by} (${order})`);
    }

    // Limit
    if (criteria.limit) {
      parts.push(`Limited to ${criteria.limit} tracks`);
    }

    // Default message if no criteria
    if (parts.length === 0) {
      return 'All tracks (no filters applied)';
    }

    return parts.join(', ');
  } catch (error) {
    logger.error('Error explaining criteria:', error);
    return 'Unable to explain criteria';
  }
}

/**
 * Validate criteria object
 * @param {Object} criteria - Criteria to validate
 * @returns {Object} { valid, errors } - Validation result
 */
export function validateCriteria(criteria) {
  const errors = [];

  if (!criteria || typeof criteria !== 'object') {
    return { valid: false, errors: ['Criteria must be an object'] };
  }

  // Validate BPM range
  if (criteria.bpm_min !== undefined && (typeof criteria.bpm_min !== 'number' || criteria.bpm_min < 0)) {
    errors.push('bpm_min must be a positive number');
  }
  if (criteria.bpm_max !== undefined && (typeof criteria.bpm_max !== 'number' || criteria.bpm_max < 0)) {
    errors.push('bpm_max must be a positive number');
  }
  if (criteria.bpm_min && criteria.bpm_max && criteria.bpm_min > criteria.bpm_max) {
    errors.push('bpm_min must be less than or equal to bpm_max');
  }

  // Validate key
  if (criteria.key !== undefined && (typeof criteria.key !== 'number' || criteria.key < 0 || criteria.key > 11)) {
    errors.push('key must be a number between 0 and 11');
  }

  // Validate mode
  if (criteria.mode !== undefined && (criteria.mode !== 0 && criteria.mode !== 1)) {
    errors.push('mode must be 0 (minor) or 1 (major)');
  }

  // Validate genres
  if (criteria.genres !== undefined && !Array.isArray(criteria.genres)) {
    errors.push('genres must be an array');
  }

  // Validate energy range
  if (criteria.energy_min !== undefined && (typeof criteria.energy_min !== 'number' || criteria.energy_min < 0 || criteria.energy_min > 1)) {
    errors.push('energy_min must be a number between 0 and 1');
  }
  if (criteria.energy_max !== undefined && (typeof criteria.energy_max !== 'number' || criteria.energy_max < 0 || criteria.energy_max > 1)) {
    errors.push('energy_max must be a number between 0 and 1');
  }

  // Validate limit
  if (criteria.limit !== undefined && (typeof criteria.limit !== 'number' || criteria.limit <= 0)) {
    errors.push('limit must be a positive number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
