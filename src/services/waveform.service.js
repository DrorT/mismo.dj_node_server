import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Waveform Service
 * Storage and retrieval of multi-zoom level waveform data
 *
 * NOTE: After migration 006, waveforms are stored by file_hash instead of track_id.
 * This eliminates duplicate waveforms for identical audio files.
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
 * Store waveform data by file hash
 * @param {string} fileHash - Audio file hash
 * @param {Array<Object>} waveforms - Array of waveform objects
 * @returns {number} Number of waveforms stored
 */
export function storeWaveforms(fileHash, waveforms) {
  try {
    if (!Array.isArray(waveforms) || waveforms.length === 0) {
      logger.warn(`No waveforms provided for hash ${fileHash}`);
      return 0;
    }

    const db = getDatabase();
    let stored = 0;

    // Use transaction for atomic update
    db.transaction(() => {
      // Delete existing waveforms for this hash
      const deleteStmt = db.prepare('DELETE FROM waveforms WHERE file_hash = ?');
      deleteStmt.run(fileHash);

      // Insert new waveforms
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO waveforms (
          file_hash,
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
          logger.warn(`Invalid waveform structure for hash ${fileHash}, zoom level ${waveform.zoom_level}`);
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
          fileHash,
          waveform.zoom_level,
          waveform.sample_rate || null,
          waveform.samples_per_pixel,
          waveform.num_pixels,
          dataBlob
        );

        stored++;
      }
    })();

    logger.info(`Stored ${stored} waveforms for hash ${fileHash}`);
    return stored;
  } catch (error) {
    logger.error(`Error storing waveforms for hash ${fileHash}:`, error);
    throw error;
  }
}

/**
 * Store stem waveforms by file hash
 * Stems contain waveforms for vocals, drums, bass, and other
 * @param {string} fileHash - Audio file hash
 * @param {Array<Object>} waveforms - Array of stem waveform objects
 * @returns {number} Number of waveforms stored
 */
export function storeStemWaveforms(fileHash, waveforms) {
  try {
    if (!Array.isArray(waveforms) || waveforms.length === 0) {
      logger.warn(`No stem waveforms provided for hash ${fileHash}`);
      return 0;
    }

    const db = getDatabase();
    let stored = 0;

    // Use transaction for atomic update
    db.transaction(() => {
      // Delete existing stem waveforms for this hash (is_stems = 1)
      const deleteStmt = db.prepare('DELETE FROM waveforms WHERE file_hash = ? AND is_stems = 1');
      deleteStmt.run(fileHash);

      // Insert new stem waveforms
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO waveforms (
          file_hash,
          zoom_level,
          is_stems,
          sample_rate,
          samples_per_point,
          num_points,
          data
        ) VALUES (?, ?, 1, ?, ?, ?, ?)
      `);

      for (const waveform of waveforms) {
        // Stem waveform structure from analysis server:
        // {
        //   zoom_level,
        //   samples_per_pixel,
        //   num_pixels,
        //   vocals_amplitude, vocals_intensity,
        //   drums_amplitude, drums_intensity,
        //   bass_amplitude, bass_intensity,
        //   other_amplitude, other_intensity
        // }

        // Store waveform data as JSON BLOB containing all 4 stems
        const stemWaveformData = {
          vocals_amplitude: waveform.vocals_amplitude,
          vocals_intensity: waveform.vocals_intensity,
          drums_amplitude: waveform.drums_amplitude,
          drums_intensity: waveform.drums_intensity,
          bass_amplitude: waveform.bass_amplitude,
          bass_intensity: waveform.bass_intensity,
          other_amplitude: waveform.other_amplitude,
          other_intensity: waveform.other_intensity,
        };

        const dataBlob = Buffer.from(JSON.stringify(stemWaveformData));

        insertStmt.run(
          fileHash,
          waveform.zoom_level,
          waveform.sample_rate || null,
          waveform.samples_per_pixel,
          waveform.num_pixels,
          dataBlob
        );

        stored++;
      }
    })();

    logger.info(`Stored ${stored} stem waveforms for hash ${fileHash}`);
    return stored;
  } catch (error) {
    logger.error(`Error storing stem waveforms for hash ${fileHash}:`, error);
    throw error;
  }
}

/**
 * Get stem waveforms by file hash at a specific zoom level
 * @param {string} fileHash - Audio file hash
 * @param {number} zoomLevel - Zoom level (0-2)
 * @returns {Object|null} Stem waveform data or null if not found
 */
export function getStemWaveformByHash(fileHash, zoomLevel) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM waveforms
      WHERE file_hash = ? AND zoom_level = ? AND is_stems = 1
    `);

    const row = stmt.get(fileHash, zoomLevel);
    if (!row) {
      return null;
    }

    // Decode BLOB data (contains all 4 stems: vocals, drums, bass, other)
    const stemData = JSON.parse(row.data.toString());

    return {
      file_hash: row.file_hash,
      zoom_level: row.zoom_level,
      sample_rate: row.sample_rate,
      samples_per_pixel: row.samples_per_point,
      num_pixels: row.num_points,
      is_stems: true,
      ...stemData, // vocals_amplitude, vocals_intensity, drums_amplitude, etc.
    };
  } catch (error) {
    logger.error(`Error getting stem waveform for hash ${fileHash}, zoom ${zoomLevel}:`, error);
    throw error;
  }
}

/**
 * Get stem waveforms for a track at a specific zoom level
 * @param {string} trackId - Track UUID
 * @param {number} zoomLevel - Zoom level (0-2)
 * @returns {Object|null} Stem waveform data or null if not found
 */
export function getStemWaveform(trackId, zoomLevel) {
  try {
    const db = getDatabase();

    // Get file_hash for the track
    const trackStmt = db.prepare('SELECT file_hash FROM tracks WHERE id = ?');
    const track = trackStmt.get(trackId);

    if (!track) {
      logger.warn(`Track ${trackId} not found`);
      return null;
    }

    return getStemWaveformByHash(track.file_hash, zoomLevel);
  } catch (error) {
    logger.error(`Error getting stem waveform for track ${trackId}, zoom ${zoomLevel}:`, error);
    throw error;
  }
}

/**
 * Get all stem waveforms by file hash
 * @param {string} fileHash - Audio file hash
 * @returns {Array<Object>} Array of stem waveform objects
 */
export function getAllStemWaveformsByHash(fileHash) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM waveforms
      WHERE file_hash = ? AND is_stems = 1
      ORDER BY zoom_level ASC
    `);

    const rows = stmt.all(fileHash);

    return rows.map(row => {
      // Decode BLOB data (contains all 4 stems)
      const stemData = JSON.parse(row.data.toString());

      return {
        file_hash: row.file_hash,
        zoom_level: row.zoom_level,
        sample_rate: row.sample_rate,
        samples_per_pixel: row.samples_per_point,
        num_pixels: row.num_points,
        is_stems: true,
        ...stemData,
      };
    });
  } catch (error) {
    logger.error(`Error getting all stem waveforms for hash ${fileHash}:`, error);
    throw error;
  }
}

/**
 * Get all stem waveforms for a track
 * @param {string} trackId - Track UUID
 * @returns {Array<Object>} Array of stem waveform objects
 */
export function getAllStemWaveforms(trackId) {
  try {
    const db = getDatabase();

    // Get file_hash for the track
    const trackStmt = db.prepare('SELECT file_hash FROM tracks WHERE id = ?');
    const track = trackStmt.get(trackId);

    if (!track) {
      logger.warn(`Track ${trackId} not found`);
      return [];
    }

    return getAllStemWaveformsByHash(track.file_hash);
  } catch (error) {
    logger.error(`Error getting all stem waveforms for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Get waveform by file hash at a specific zoom level
 * @param {string} fileHash - Audio file hash
 * @param {number} zoomLevel - Zoom level (0-2)
 * @returns {Object|null} Waveform data or null if not found
 */
export function getWaveformByHash(fileHash, zoomLevel) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM waveforms
      WHERE file_hash = ? AND zoom_level = ? AND is_stems = 0
    `);

    const row = stmt.get(fileHash, zoomLevel);
    if (!row) {
      return null;
    }

    // Decode BLOB data
    const waveformData = JSON.parse(row.data.toString());

    return {
      file_hash: row.file_hash,
      zoom_level: row.zoom_level,
      sample_rate: row.sample_rate,
      samples_per_pixel: row.samples_per_point,
      num_pixels: row.num_points,
      ...waveformData,
    };
  } catch (error) {
    logger.error(`Error getting waveform for hash ${fileHash}, zoom ${zoomLevel}:`, error);
    throw error;
  }
}

/**
 * Get waveform for a track at a specific zoom level (backward compatible)
 * @param {string} trackId - Track UUID
 * @param {number} zoomLevel - Zoom level (0-2)
 * @returns {Object|null} Waveform data or null if not found
 */
export function getWaveform(trackId, zoomLevel) {
  try {
    const db = getDatabase();

    // Get file_hash for the track
    const trackStmt = db.prepare('SELECT file_hash FROM tracks WHERE id = ?');
    const track = trackStmt.get(trackId);

    if (!track) {
      logger.warn(`Track ${trackId} not found`);
      return null;
    }

    return getWaveformByHash(track.file_hash, zoomLevel);
  } catch (error) {
    logger.error(`Error getting waveform for track ${trackId}, zoom ${zoomLevel}:`, error);
    throw error;
  }
}

/**
 * Get all waveforms by file hash
 * @param {string} fileHash - Audio file hash
 * @returns {Array<Object>} Array of waveform objects
 */
export function getAllWaveformsByHash(fileHash) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM waveforms
      WHERE file_hash = ? AND is_stems = 0
      ORDER BY zoom_level ASC
    `);

    const rows = stmt.all(fileHash);

    return rows.map(row => {
      // Decode BLOB data
      const waveformData = JSON.parse(row.data.toString());

      return {
        file_hash: row.file_hash,
        zoom_level: row.zoom_level,
        sample_rate: row.sample_rate,
        samples_per_pixel: row.samples_per_point,
        num_pixels: row.num_points,
        ...waveformData,
      };
    });
  } catch (error) {
    logger.error(`Error getting all waveforms for hash ${fileHash}:`, error);
    throw error;
  }
}

/**
 * Get all waveforms for a track (backward compatible)
 * @param {string} trackId - Track UUID
 * @returns {Array<Object>} Array of waveform objects
 */
export function getAllWaveforms(trackId) {
  try {
    const db = getDatabase();

    // Get file_hash for the track
    const trackStmt = db.prepare('SELECT file_hash FROM tracks WHERE id = ?');
    const track = trackStmt.get(trackId);

    if (!track) {
      logger.warn(`Track ${trackId} not found`);
      return [];
    }

    return getAllWaveformsByHash(track.file_hash);
  } catch (error) {
    logger.error(`Error getting all waveforms for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Delete waveforms by file hash
 * WARNING: This will affect all tracks with the same audio hash!
 * @param {string} fileHash - Audio file hash
 * @returns {number} Number of waveforms deleted
 */
export function deleteWaveformsByHash(fileHash) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM waveforms WHERE file_hash = ?');
    const result = stmt.run(fileHash);

    logger.info(`Deleted ${result.changes} waveforms for hash ${fileHash}`);
    return result.changes;
  } catch (error) {
    logger.error(`Error deleting waveforms for hash ${fileHash}:`, error);
    throw error;
  }
}

/**
 * Delete waveforms for a track (no-op with hash-based storage)
 * NOTE: With hash-based storage, waveforms are shared across duplicate tracks
 * This function is kept for backward compatibility but does nothing.
 * @param {string} trackId - Track UUID
 * @returns {number} Always returns 0
 */
export function deleteWaveforms(trackId) {
  logger.info(`deleteWaveforms() called for track ${trackId} - no-op with hash-based storage`);
  return 0;
}

/**
 * Check if file hash has waveforms
 * @param {string} fileHash - Audio file hash
 * @returns {boolean} True if hash has waveforms
 */
export function hasWaveformsByHash(fileHash) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM waveforms WHERE file_hash = ?
    `);

    const result = stmt.get(fileHash);
    return result.count > 0;
  } catch (error) {
    logger.error(`Error checking waveforms for hash ${fileHash}:`, error);
    throw error;
  }
}

/**
 * Check if track has waveforms
 * @param {string} trackId - Track UUID
 * @returns {boolean} True if track has waveforms
 */
export function hasWaveforms(trackId) {
  try {
    const db = getDatabase();

    // Get file_hash for the track
    const trackStmt = db.prepare('SELECT file_hash FROM tracks WHERE id = ?');
    const track = trackStmt.get(trackId);

    if (!track) {
      logger.warn(`Track ${trackId} not found`);
      return false;
    }

    return hasWaveformsByHash(track.file_hash);
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

    // Count unique audio hashes with waveforms
    const hashesStmt = db.prepare(`
      SELECT COUNT(DISTINCT file_hash) as count FROM waveforms
    `);
    const hashesResult = hashesStmt.get();

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

    // Count tracks that have waveforms (via their file_hash)
    const tracksWithWaveformsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM tracks
      WHERE file_hash IN (SELECT DISTINCT file_hash FROM waveforms)
    `);
    const tracksWithWaveformsResult = tracksWithWaveformsStmt.get();

    return {
      unique_audio_hashes: hashesResult.count,
      tracks_with_waveforms: tracksWithWaveformsResult.count,
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
 * Copy waveforms from one track to another (no-op with hash-based storage)
 * NOTE: With hash-based storage, waveforms are automatically shared across duplicate tracks
 * This function is kept for backward compatibility but does nothing.
 * @param {string} fromTrackId - Source track UUID
 * @param {string} toTrackId - Destination track UUID
 * @returns {number} Always returns 0
 */
export function copyWaveforms(fromTrackId, toTrackId) {
  logger.info(`copyWaveforms() called from ${fromTrackId} to ${toTrackId} - no-op with hash-based storage`);
  logger.info('Waveforms are automatically shared for tracks with the same file_hash');
  return 0;
}

export default {
  storeWaveforms,
  storeStemWaveforms,
  getWaveform,
  getWaveformByHash,
  getAllWaveforms,
  getAllWaveformsByHash,
  deleteWaveforms,
  deleteWaveformsByHash,
  hasWaveforms,
  hasWaveformsByHash,
  getWaveformStats,
  copyWaveforms,
};
