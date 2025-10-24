import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { isValidUUID } from '../utils/uuid.js';
import * as playlistService from './playlist.service.js';
import * as playlistTrackService from './playlistTrack.service.js';

/**
 * Session Service
 * Manages DJ session playlists for performance tracking
 */

// ============================================================================
// Session Management
// ============================================================================

/**
 * Start a new DJ session
 * @param {string|null} venue - Venue name (optional)
 * @param {number|null} date - Session date Unix timestamp (optional, defaults to now)
 * @returns {Object} Created session playlist
 */
export function startSession(venue = null, date = null) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const sessionDate = date || now;

    // Generate name
    const dateStr = new Date(sessionDate * 1000).toISOString().split('T')[0];
    const name = venue
      ? `Session - ${dateStr} - ${venue}`
      : `Session - ${dateStr}`;

    // Create session playlist
    const session = playlistService.createPlaylist({
      name,
      type: 'session',
      session_date: sessionDate,
      session_venue: venue,
      is_readonly: false,
      description: 'DJ session history',
      icon: 'calendar',
    });

    logger.info(`Session started: ${session.name} (${session.id})`, { venue, date: sessionDate });

    return session;
  } catch (error) {
    logger.error('Error starting session:', error);
    throw error;
  }
}

/**
 * Log track play in session
 * @param {string} sessionId - Session playlist UUID
 * @param {string} trackId - Track UUID
 * @param {number|null} playedAt - Timestamp when played (optional, defaults to now)
 * @param {number|null} duration - Play duration in seconds (optional)
 * @param {string|null} notes - Optional notes
 * @returns {Object} Logged play record
 */
export function logTrackPlay(sessionId, trackId, playedAt = null, duration = null, notes = null) {
  try {
    // Validate UUIDs
    if (!isValidUUID(sessionId)) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }
    if (!isValidUUID(trackId)) {
      throw new Error(`Invalid track ID: ${trackId}`);
    }

    const db = getDatabase();

    // Verify session exists and is a session playlist
    const session = playlistService.getPlaylistById(sessionId, false);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.type !== 'session') {
      throw new Error(`Playlist ${sessionId} is not a session (type: ${session.type})`);
    }

    // Check if readonly
    if (session.is_readonly) {
      throw new Error('Cannot add tracks to finalized session');
    }

    const now = Math.floor(Date.now() / 1000);
    const timestamp = playedAt || now;

    // Check if track already in session
    const existing = playlistTrackService.checkDuplicate(sessionId, trackId);

    if (existing) {
      // Update existing entry with new play time
      const updateStmt = db.prepare(`
        UPDATE playlist_tracks
        SET played_at = ?, play_duration = ?, notes = ?
        WHERE playlist_id = ? AND track_id = ?
      `);
      updateStmt.run(timestamp, duration, notes, sessionId, trackId);

      logger.info(`Updated track play in session ${sessionId}: ${trackId}`);
    } else {
      // Add track to session
      playlistTrackService.addTracksToPlaylist(sessionId, [trackId], null, notes);

      // Update played_at and play_duration
      const updateStmt = db.prepare(`
        UPDATE playlist_tracks
        SET played_at = ?, play_duration = ?
        WHERE playlist_id = ? AND track_id = ?
      `);
      updateStmt.run(timestamp, duration, sessionId, trackId);

      logger.info(`Logged track play in session ${sessionId}: ${trackId}`);
    }

    // Return updated record
    const recordStmt = db.prepare(`
      SELECT * FROM playlist_tracks
      WHERE playlist_id = ? AND track_id = ?
    `);
    return recordStmt.get(sessionId, trackId);
  } catch (error) {
    logger.error(`Error logging track play in session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Finalize session (make readonly)
 * @param {string} sessionId - Session playlist UUID
 * @returns {Object} Finalized session
 */
export function finalizeSession(sessionId) {
  try {
    // Validate session ID
    if (!isValidUUID(sessionId)) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }

    const db = getDatabase();

    // Get session
    const session = playlistService.getPlaylistById(sessionId, true);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Verify it's a session playlist
    if (session.type !== 'session') {
      throw new Error(`Playlist ${sessionId} is not a session (type: ${session.type})`);
    }

    // Check if already finalized
    if (session.is_readonly) {
      logger.info(`Session ${sessionId} already finalized`);
      return session;
    }

    // Calculate session duration
    const tracks = session.tracks || [];
    let sessionDuration = 0;

    if (tracks.length > 0) {
      // Find first and last played times
      const playTimes = tracks
        .filter(pt => pt.played_at !== null)
        .map(pt => pt.played_at);

      if (playTimes.length > 0) {
        const firstPlayed = Math.min(...playTimes);
        const lastPlayed = Math.max(...playTimes);
        sessionDuration = lastPlayed - firstPlayed;

        // Add duration of last track if available
        const lastTrack = tracks.find(pt => pt.played_at === lastPlayed);
        if (lastTrack && lastTrack.play_duration) {
          sessionDuration += lastTrack.play_duration;
        }
      }
    }

    // Mark as readonly and set duration
    playlistService.updatePlaylist(sessionId, {
      is_readonly: true,
      session_duration: sessionDuration,
    });

    logger.info(`Finalized session ${sessionId}: ${tracks.length} tracks, ${sessionDuration}s duration`);

    return playlistService.getPlaylistById(sessionId, false);
  } catch (error) {
    logger.error(`Error finalizing session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Get active session (if any)
 * Active = type='session', is_readonly=false, updated in last 4 hours
 * @returns {Object|null} Active session or null
 */
export function getActiveSession() {
  try {
    const db = getDatabase();

    // Get all non-readonly sessions
    const stmt = db.prepare(`
      SELECT * FROM playlists
      WHERE type = 'session' AND is_readonly = 0
      ORDER BY session_date DESC, updated_at DESC
      LIMIT 1
    `);

    const session = stmt.get();

    if (!session) {
      return null;
    }

    // Check if session is still active (last update within 4 hours)
    const fourHoursAgo = Math.floor(Date.now() / 1000) - (4 * 3600);
    if (session.updated_at < fourHoursAgo) {
      logger.info(`Session ${session.id} is inactive (last update ${session.updated_at}), auto-finalizing`);
      finalizeSession(session.id);
      return null;
    }

    // Parse criteria if exists
    if (session.smart_criteria) {
      try {
        session.criteria = JSON.parse(session.smart_criteria);
      } catch (error) {
        session.criteria = null;
      }
    }

    return session;
  } catch (error) {
    logger.error('Error getting active session:', error);
    throw error;
  }
}

/**
 * Check if session is active
 * @param {string} sessionId - Session playlist UUID
 * @returns {boolean} True if session is active (not finalized and recently updated)
 */
export function isSessionActive(sessionId) {
  try {
    // Validate session ID
    if (!isValidUUID(sessionId)) {
      return false;
    }

    const session = playlistService.getPlaylistById(sessionId, false);
    if (!session || session.type !== 'session') {
      return false;
    }

    // Check if readonly
    if (session.is_readonly) {
      return false;
    }

    // Check if updated recently (within 4 hours)
    const fourHoursAgo = Math.floor(Date.now() / 1000) - (4 * 3600);
    return session.updated_at >= fourHoursAgo;
  } catch (error) {
    logger.error(`Error checking if session ${sessionId} is active:`, error);
    return false;
  }
}

/**
 * Auto-finalize inactive sessions
 * Sessions are inactive if last update was > inactivityHours ago
 * @param {number} inactivityHours - Hours of inactivity before finalization (default: 4)
 * @returns {Array<string>} Finalized session IDs
 */
export function autoFinalizeInactiveSessions(inactivityHours = 4) {
  try {
    const db = getDatabase();
    const cutoffTime = Math.floor(Date.now() / 1000) - (inactivityHours * 3600);

    // Find sessions that haven't been updated recently
    const stmt = db.prepare(`
      SELECT id FROM playlists
      WHERE type = 'session'
        AND is_readonly = 0
        AND updated_at < ?
    `);

    const inactiveSessions = stmt.all(cutoffTime);
    const finalized = [];

    for (const session of inactiveSessions) {
      try {
        finalizeSession(session.id);
        finalized.push(session.id);
      } catch (error) {
        logger.error(`Failed to auto-finalize session ${session.id}:`, error);
      }
    }

    if (finalized.length > 0) {
      logger.info(`Auto-finalized ${finalized.length} inactive session(s)`);
    }

    return finalized;
  } catch (error) {
    logger.error('Error auto-finalizing inactive sessions:', error);
    throw error;
  }
}

/**
 * Get session statistics
 * @param {string} sessionId - Session playlist UUID
 * @returns {Object} Session statistics
 */
export function getSessionStats(sessionId) {
  try {
    // Validate session ID
    if (!isValidUUID(sessionId)) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }

    const db = getDatabase();

    // Get session with tracks
    const session = playlistService.getPlaylistById(sessionId, true);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.type !== 'session') {
      throw new Error(`Playlist ${sessionId} is not a session`);
    }

    const tracks = session.tracks || [];

    // Calculate statistics
    const stats = {
      track_count: tracks.length,
      session_duration: session.session_duration || 0,
      venue: session.session_venue,
      date: session.session_date,
      is_finalized: session.is_readonly === 1,
    };

    if (tracks.length > 0) {
      // Get play times
      const playTimes = tracks
        .filter(pt => pt.played_at !== null)
        .map(pt => pt.played_at);

      if (playTimes.length > 0) {
        stats.first_track_time = Math.min(...playTimes);
        stats.last_track_time = Math.max(...playTimes);
      }

      // Average BPM
      const bpms = tracks
        .filter(pt => pt.track && pt.track.bpm)
        .map(pt => pt.track.bpm);
      if (bpms.length > 0) {
        stats.avg_bpm = parseFloat((bpms.reduce((a, b) => a + b, 0) / bpms.length).toFixed(1));
      }

      // Average energy
      const energies = tracks
        .filter(pt => pt.track && pt.track.energy !== null)
        .map(pt => pt.track.energy);
      if (energies.length > 0) {
        stats.avg_energy = parseFloat((energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(2));
      }

      // Genre distribution
      const genres = {};
      tracks.forEach(pt => {
        if (pt.track && pt.track.genre) {
          genres[pt.track.genre] = (genres[pt.track.genre] || 0) + 1;
        }
      });
      stats.genre_distribution = Object.entries(genres)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);
    }

    return stats;
  } catch (error) {
    logger.error(`Error getting session stats for ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Get all sessions
 * @param {Object} filters - Filter criteria
 * @param {boolean} filters.finalized_only - Only finalized sessions
 * @param {number} filters.limit - Limit results
 * @returns {Array} Sessions
 */
export function getAllSessions(filters = {}) {
  try {
    const db = getDatabase();

    let sql = 'SELECT * FROM playlists WHERE type = ?';
    const params = ['session'];

    if (filters.finalized_only) {
      sql += ' AND is_readonly = 1';
    }

    sql += ' ORDER BY session_date DESC, created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = db.prepare(sql);
    const sessions = stmt.all(...params);

    // Add track counts
    sessions.forEach(session => {
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?');
      const result = countStmt.get(session.id);
      session.track_count = result.count;
    });

    return sessions;
  } catch (error) {
    logger.error('Error getting all sessions:', error);
    throw error;
  }
}
