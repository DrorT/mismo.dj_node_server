import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Waveform Service
 * Storage and retrieval of multi-zoom level waveform data
 *
 * Waveform data structure from Python:
 * {
 *   zoom_level: 0-2,
 *   samples_per_pixel: number,
 *   num_pixels: number,
 *   low_freq_amplitude: Array<number>,
 *   low_freq_intensity: Array<number>,
 *   mid_freq_amplitude: Array<number>,
 *   mid_freq_intensity: Array<number>,
 *   high_freq_amplitude: Array<number>,
 *   high_freq_intensity: Array<number>
 * }
 */

/**
 * Store waveform data for a track
 * @param {number} trackId - Track ID
 * @param {Array<Object>} waveforms - Array of waveform objects
 * @returns {number} Number of waveforms stored
 */
export function storeWaveforms(trackId, waveforms) {
  try {
    if (!Array.isArray(waveforms) || waveforms.length === 0) {
      logger.warn(`No waveforms provided for track ${trackId}`);
      return 0;
    }

    const db = getDatabase();
    let stored = 0;

    // Use transaction for atomic update
    db.transaction(() => {
      // Delete existing waveforms for this track
      const deleteStmt = db.prepare('DELETE FROM waveforms WHERE track_id = ?');
      deleteStmt.run(trackId);

      // Insert new waveforms
      const insertStmt = db.prepare(`
        INSERT INTO waveforms (
          track_id,
          zoom_level,
          sample_rate,
          samples_per_point,
          num_points,
          data
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const waveform of waveforms) {
        // Validate waveform structure
        if (!validateWaveform(waveform)) {
          logger.warn(`Invalid waveform structure for track ${trackId}, zoom level ${waveform.zoom_level}`);
          continue;
        }

        // Store waveform data as JSON BLOB
        // Data can be either arrays or base64 strings - store as-is for efficiency
        const waveformData = {
          low_freq_amplitude: waveform.low_freq_amplitude,
          low_freq_intensity: waveform.low_freq_intensity,
          mid_freq_amplitude: waveform.mid_freq_amplitude,
          mid_freq_intensity: waveform.mid_freq_intensity,
          high_freq_amplitude: waveform.high_freq_amplitude,
          high_freq_intensity: waveform.high_freq_intensity,
        };

        const dataBlob = Buffer.from(JSON.stringify(waveformData));

        insertStmt.run(
          trackId,
          waveform.zoom_level,
          waveform.sample_rate || null,
          waveform.samples_per_pixel,
          waveform.num_pixels,
          dataBlob
        );

        stored++;
      }
    })();

    logger.info(`Stored ${stored} waveforms for track ${trackId}`);
    return stored;
  } catch (error) {
    logger.error(`Error storing waveforms for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Get waveform for a track at a specific zoom level
 * @param {number} trackId - Track ID
 * @param {number} zoomLevel - Zoom level (0-2)
 * @returns {Object|null} Waveform data or null if not found
 */
export function getWaveform(trackId, zoomLevel) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM waveforms
      WHERE track_id = ? AND zoom_level = ?
    `);

    const row = stmt.get(trackId, zoomLevel);
    if (!row) {
      return null;
    }

    // Decode BLOB data
    const waveformData = JSON.parse(row.data.toString());

    return {
      id: row.id,
      track_id: row.track_id,
      zoom_level: row.zoom_level,
      sample_rate: row.sample_rate,
      samples_per_pixel: row.samples_per_point,
      num_pixels: row.num_points,
      ...waveformData,
    };
  } catch (error) {
    logger.error(`Error getting waveform for track ${trackId}, zoom ${zoomLevel}:`, error);
    throw error;
  }
}

/**
 * Get all waveforms for a track
 * @param {number} trackId - Track ID
 * @returns {Array<Object>} Array of waveform objects
 */
export function getAllWaveforms(trackId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM waveforms
      WHERE track_id = ?
      ORDER BY zoom_level ASC
    `);

    const rows = stmt.all(trackId);

    return rows.map(row => {
      // Decode BLOB data
      const waveformData = JSON.parse(row.data.toString());

      return {
        id: row.id,
        track_id: row.track_id,
        zoom_level: row.zoom_level,
        sample_rate: row.sample_rate,
        samples_per_pixel: row.samples_per_point,
        num_pixels: row.num_points,
        ...waveformData,
      };
    });
  } catch (error) {
    logger.error(`Error getting all waveforms for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Delete waveforms for a track
 * @param {number} trackId - Track ID
 * @returns {number} Number of waveforms deleted
 */
export function deleteWaveforms(trackId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM waveforms WHERE track_id = ?');
    const result = stmt.run(trackId);

    logger.info(`Deleted ${result.changes} waveforms for track ${trackId}`);
    return result.changes;
  } catch (error) {
    logger.error(`Error deleting waveforms for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Check if track has waveforms
 * @param {number} trackId - Track ID
 * @returns {boolean} True if track has waveforms
 */
export function hasWaveforms(trackId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM waveforms WHERE track_id = ?
    `);

    const result = stmt.get(trackId);
    return result.count > 0;
  } catch (error) {
    logger.error(`Error checking waveforms for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Validate waveform structure
 * @param {Object} waveform - Waveform object to validate
 * @returns {boolean} True if valid
 */
function validateWaveform(waveform) {
  if (!waveform || typeof waveform !== 'object') {
    return false;
  }

  // Required fields
  const requiredFields = [
    'zoom_level',
    'samples_per_pixel',
    'num_pixels',
    'low_freq_amplitude',
    'low_freq_intensity',
    'mid_freq_amplitude',
    'mid_freq_intensity',
    'high_freq_amplitude',
    'high_freq_intensity',
  ];

  for (const field of requiredFields) {
    if (!(field in waveform)) {
      return false;
    }
  }

  // Validate data fields (accept either arrays or base64 strings)
  const dataFields = [
    'low_freq_amplitude',
    'low_freq_intensity',
    'mid_freq_amplitude',
    'mid_freq_intensity',
    'high_freq_amplitude',
    'high_freq_intensity',
  ];

  for (const field of dataFields) {
    const value = waveform[field];
    // Accept either arrays (legacy) or base64-encoded strings (preferred)
    if (!Array.isArray(value) && typeof value !== 'string') {
      return false;
    }
    // If it's a string, validate it's not empty
    if (typeof value === 'string' && value.length === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Get waveform statistics
 * @returns {Object} Waveform statistics
 */
export function getWaveformStats() {
  try {
    const db = getDatabase();

    // Count tracks with waveforms
    const tracksStmt = db.prepare(`
      SELECT COUNT(DISTINCT track_id) as count FROM waveforms
    `);
    const tracksResult = tracksStmt.get();

    // Count total waveforms
    const totalStmt = db.prepare(`
      SELECT COUNT(*) as count FROM waveforms
    `);
    const totalResult = totalStmt.get();

    // Get storage size
    const sizeStmt = db.prepare(`
      SELECT SUM(LENGTH(data)) as total_bytes FROM waveforms
    `);
    const sizeResult = sizeStmt.get();

    return {
      tracks_with_waveforms: tracksResult.count,
      total_waveforms: totalResult.count,
      storage_bytes: sizeResult.total_bytes || 0,
      storage_mb: ((sizeResult.total_bytes || 0) / (1024 * 1024)).toFixed(2),
    };
  } catch (error) {
    logger.error('Error getting waveform stats:', error);
    throw error;
  }
}

/**
 * Copy waveforms from one track to another
 * @param {number} fromTrackId - Source track ID
 * @param {number} toTrackId - Destination track ID
 * @returns {number} Number of waveforms copied
 */
export function copyWaveforms(fromTrackId, toTrackId) {
  try {
    const db = getDatabase();

    // Use transaction for atomic copy
    let copied = 0;

    db.transaction(() => {
      // Delete existing waveforms for destination track (if any)
      const deleteStmt = db.prepare('DELETE FROM waveforms WHERE track_id = ?');
      deleteStmt.run(toTrackId);

      // Copy waveforms directly from source track using SQL
      // This is more efficient than getAllWaveforms() + re-insert
      const copyStmt = db.prepare(`
        INSERT INTO waveforms (
          track_id,
          zoom_level,
          sample_rate,
          samples_per_point,
          num_points,
          data
        )
        SELECT
          ? as track_id,
          zoom_level,
          sample_rate,
          samples_per_point,
          num_points,
          data
        FROM waveforms
        WHERE track_id = ?
      `);

      const result = copyStmt.run(toTrackId, fromTrackId);
      copied = result.changes;
    })();

    if (copied > 0) {
      logger.info(`Copied ${copied} waveforms from track ${fromTrackId} to track ${toTrackId}`);
    } else {
      logger.debug(`No waveforms to copy from track ${fromTrackId}`);
    }

    return copied;
  } catch (error) {
    logger.error(`Error copying waveforms from ${fromTrackId} to ${toTrackId}:`, error);
    throw error;
  }
}

export default {
  storeWaveforms,
  getWaveform,
  getAllWaveforms,
  deleteWaveforms,
  hasWaveforms,
  getWaveformStats,
  copyWaveforms,
};
