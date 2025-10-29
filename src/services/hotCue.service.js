import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { generateUUID } from '../utils/uuid.js';

/**
 * Hot Cue Service
 * Manages hot cue points for tracks
 */

/**
 * Get all hot cues for a track
 * @param {string} trackId - Track UUID
 * @param {Object} options - Query options
 * @param {string} [options.source] - Filter by source (optional)
 * @returns {Array<Object>} Array of hot cue objects
 */
export function getTrackHotCues(trackId, options = {}) {
  try {
    const db = getDatabase();

    let query = `
      SELECT
        id,
        track_id,
        cue_index,
        position,
        name,
        color,
        is_loop,
        loop_end,
        auto_loop,
        source,
        created_at,
        updated_at
      FROM hot_cues
      WHERE track_id = ?
    `;

    const params = [trackId];

    // Filter by source if provided
    if (options.source) {
      query += ' AND source = ?';
      params.push(options.source);
    }

    query += ' ORDER BY source ASC, cue_index ASC';

    const hotCues = db.prepare(query).all(...params);

    return hotCues;
  } catch (error) {
    logger.error(`Error getting hot cues for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Get a specific hot cue by track ID, index, and source
 * @param {string} trackId - Track UUID
 * @param {number} cueIndex - Cue index (0-7)
 * @param {string} [source='user'] - Source of the hot cue
 * @returns {Object|null} Hot cue object or null if not found
 */
export function getHotCue(trackId, cueIndex, source = 'user') {
  try {
    const db = getDatabase();
    const hotCue = db
      .prepare(
        `
      SELECT
        id,
        track_id,
        cue_index,
        position,
        name,
        color,
        is_loop,
        loop_end,
        auto_loop,
        source,
        created_at,
        updated_at
      FROM hot_cues
      WHERE track_id = ? AND cue_index = ? AND source = ?
    `
      )
      .get(trackId, cueIndex, source);

    return hotCue || null;
  } catch (error) {
    logger.error(`Error getting hot cue ${cueIndex} (${source}) for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Create or update a hot cue
 * @param {string} trackId - Track UUID
 * @param {number} cueIndex - Cue index (0-7)
 * @param {Object} cueData - Hot cue data
 * @param {number} cueData.position - Position in seconds (required)
 * @param {string} [cueData.name] - Optional label/name
 * @param {string} [cueData.color] - UI color (hex format)
 * @param {boolean} [cueData.isLoop] - Whether this is a loop cue
 * @param {number} [cueData.loopEnd] - End position if loop (seconds)
 * @param {boolean} [cueData.autoLoop] - Auto-activate on trigger
 * @param {string} [cueData.source] - Source of the cue point
 * @returns {Object} Created or updated hot cue object
 */
export function setHotCue(trackId, cueIndex, cueData) {
  try {
    // Validate cue index
    if (cueIndex < 0 || cueIndex > 7) {
      throw new Error('Cue index must be between 0 and 7');
    }

    // Validate position
    if (typeof cueData.position !== 'number' || cueData.position < 0) {
      throw new Error('Position must be a non-negative number');
    }

    // Validate loop end if provided
    if (cueData.isLoop && cueData.loopEnd !== undefined && cueData.loopEnd !== null) {
      if (cueData.loopEnd <= cueData.position) {
        throw new Error('Loop end must be greater than position');
      }
    }

    const db = getDatabase();
    const source = cueData.source || 'user';

    // Check if hot cue already exists for this source
    const existingCue = getHotCue(trackId, cueIndex, source);

    if (existingCue) {
      // Update existing hot cue
      const stmt = db.prepare(`
        UPDATE hot_cues
        SET
          position = ?,
          name = ?,
          color = ?,
          is_loop = ?,
          loop_end = ?,
          auto_loop = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE track_id = ? AND cue_index = ? AND source = ?
      `);

      stmt.run(
        cueData.position,
        cueData.name || null,
        cueData.color || null,
        cueData.isLoop ? 1 : 0,
        cueData.loopEnd || null,
        cueData.autoLoop ? 1 : 0,
        trackId,
        cueIndex,
        source
      );

      logger.info(`✓ Updated hot cue ${cueIndex} (${source}) for track ${trackId}`);
      return getHotCue(trackId, cueIndex, source);
    } else {
      // Insert new hot cue
      const id = generateUUID();
      const stmt = db.prepare(`
        INSERT INTO hot_cues (
          id,
          track_id,
          cue_index,
          position,
          name,
          color,
          is_loop,
          loop_end,
          auto_loop,
          source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        trackId,
        cueIndex,
        cueData.position,
        cueData.name || null,
        cueData.color || null,
        cueData.isLoop ? 1 : 0,
        cueData.loopEnd || null,
        cueData.autoLoop ? 1 : 0,
        source
      );

      logger.info(`✓ Created hot cue ${cueIndex} (${source}) for track ${trackId}`);
      return getHotCue(trackId, cueIndex, source);
    }
  } catch (error) {
    logger.error(`Error setting hot cue ${cueIndex} for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Remove a hot cue
 * @param {string} trackId - Track UUID
 * @param {number} cueIndex - Cue index (0-7)
 * @param {string} [source='user'] - Source of the hot cue to remove
 * @returns {boolean} True if cue was removed, false if it didn't exist
 */
export function removeHotCue(trackId, cueIndex, source = 'user') {
  try {
    // Validate cue index
    if (cueIndex < 0 || cueIndex > 7) {
      throw new Error('Cue index must be between 0 and 7');
    }

    const db = getDatabase();
    const stmt = db.prepare(`
      DELETE FROM hot_cues
      WHERE track_id = ? AND cue_index = ? AND source = ?
    `);

    const result = stmt.run(trackId, cueIndex, source);

    if (result.changes > 0) {
      logger.info(`✓ Removed hot cue ${cueIndex} (${source}) for track ${trackId}`);
      return true;
    } else {
      logger.warn(`Hot cue ${cueIndex} (${source}) for track ${trackId} does not exist`);
      return false;
    }
  } catch (error) {
    logger.error(`Error removing hot cue ${cueIndex} (${source}) for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Remove all hot cues for a track
 * @param {string} trackId - Track UUID
 * @returns {number} Number of hot cues removed
 */
export function removeAllHotCues(trackId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      DELETE FROM hot_cues
      WHERE track_id = ?
    `);

    const result = stmt.run(trackId);
    logger.info(`✓ Removed ${result.changes} hot cues for track ${trackId}`);
    return result.changes;
  } catch (error) {
    logger.error(`Error removing all hot cues for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Get hot cues for audio engine (minimal data for playback)
 * Only returns index, position, and loop information
 * Uses source preference: user > rekordbox > serato > mixedInKey > virtual dj
 * Returns only one hot cue per index (the highest priority source)
 * @param {string} trackId - Track UUID
 * @param {string} [preferredSource='user'] - Preferred source to use
 * @returns {Array<Object>} Array of simplified hot cue objects for audio engine
 */
export function getHotCuesForAudioEngine(trackId, preferredSource = 'user') {
  try {
    const db = getDatabase();

    // Define source priority (user has highest priority)
    const sourcePriority = {
      'user': 1,
      'rekordbox': 2,
      'serato': 3,
      'mixedInKey': 4,
      'virtual dj': 5,
    };

    // Get all hot cues for the track
    const allHotCues = db
      .prepare(
        `
      SELECT
        cue_index,
        position,
        is_loop,
        loop_end,
        source
      FROM hot_cues
      WHERE track_id = ?
      ORDER BY cue_index ASC, source ASC
    `
      )
      .all(trackId);

    // Group by cue_index and pick the best source for each index
    const cuesByIndex = new Map();

    for (const cue of allHotCues) {
      const existing = cuesByIndex.get(cue.cue_index);
      const currentPriority = sourcePriority[cue.source] || 999;
      const existingPriority = existing ? sourcePriority[existing.source] || 999 : 999;

      // Prefer the specified source if available, otherwise use priority
      if (cue.source === preferredSource) {
        cuesByIndex.set(cue.cue_index, cue);
      } else if (!existing || (currentPriority < existingPriority && existing.source !== preferredSource)) {
        cuesByIndex.set(cue.cue_index, cue);
      }
    }

    // Convert to array and format for audio engine
    return Array.from(cuesByIndex.values())
      .sort((a, b) => a.cue_index - b.cue_index)
      .map(cue => ({
        index: cue.cue_index,
        position: cue.position,
        isLoop: Boolean(cue.is_loop),
        loopEnd: cue.loop_end || undefined,
      }));
  } catch (error) {
    logger.error(`Error getting hot cues for audio engine for track ${trackId}:`, error);
    throw error;
  }
}

export default {
  getTrackHotCues,
  getHotCue,
  setHotCue,
  removeHotCue,
  removeAllHotCues,
  getHotCuesForAudioEngine,
};
