import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { generateUUID, isValidUUID } from '../utils/uuid.js';
import * as playlistTrackService from './playlistTrack.service.js';

/**
 * Playlist Service
 * Manages playlist records in the database
 * Supports 4 playlist types: static, smart, session, temp
 */

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new playlist
 * @param {Object} playlistData - Playlist metadata
 * @param {string} playlistData.name - Playlist name (required)
 * @param {string} playlistData.type - Playlist type: static, smart, session, temp (default: static)
 * @param {string} playlistData.description - Optional description
 * @param {string} playlistData.color - Optional color (hex format #RRGGBB)
 * @param {string} playlistData.icon - Optional icon identifier
 * @param {Object} playlistData.criteria - Smart playlist criteria (required for smart playlists)
 * @param {string} playlistData.session_venue - Session venue (for session playlists)
 * @param {number} playlistData.session_date - Session date Unix timestamp (for session playlists)
 * @param {boolean} playlistData.is_temporary - Mark as temporary (for temp playlists)
 * @param {boolean} playlistData.is_readonly - Mark as readonly (for finalized sessions)
 * @param {boolean} playlistData.is_favorite - Mark as favorite
 * @returns {Object} Created playlist
 */
export function createPlaylist(playlistData) {
  try {
    const db = getDatabase();

    // Generate UUID
    const id = generateUUID();
    const now = Math.floor(Date.now() / 1000);

    // Extract and validate data
    const {
      name,
      type = 'static',
      description = null,
      color = null,
      icon = null,
      criteria = null,
      session_venue = null,
      session_date = null,
      session_duration = null,
      is_temporary = false,
      is_readonly = false,
      is_favorite = false,
    } = playlistData;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      throw new Error('Playlist name is required');
    }

    // Validate type
    const validTypes = ['static', 'smart', 'session', 'temp'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid playlist type: ${type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate smart playlist has criteria
    if (type === 'smart' && !criteria) {
      throw new Error('Smart playlists must have criteria');
    }

    // Serialize criteria if provided
    const criteriaJson = criteria ? JSON.stringify(criteria) : null;

    // Insert playlist
    const stmt = db.prepare(`
      INSERT INTO playlists (
        id, name, type, description, color, icon,
        smart_criteria, session_date, session_venue, session_duration,
        is_temporary, is_readonly, is_favorite,
        created_at, updated_at,
        is_smart
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      name,
      type,
      description,
      color,
      icon,
      criteriaJson,
      session_date,
      session_venue,
      session_duration,
      is_temporary ? 1 : 0,
      is_readonly ? 1 : 0,
      is_favorite ? 1 : 0,
      now,
      now,
      type === 'smart' ? 1 : 0 // Backward compatibility
    );

    logger.info(`Created ${type} playlist: ${name} (${id})`);

    // Return created playlist
    return getPlaylistById(id, false);
  } catch (error) {
    logger.error('Error creating playlist:', error);
    throw error;
  }
}

/**
 * Get playlist by ID
 * @param {string} id - Playlist UUID
 * @param {boolean} includeTracks - Include tracks in response (default: true)
 * @returns {Object|null} Playlist or null
 */
export function getPlaylistById(id, includeTracks = true) {
  try {
    // Validate UUID
    if (!isValidUUID(id)) {
      throw new Error(`Invalid playlist ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();

    // Get playlist
    const stmt = db.prepare('SELECT * FROM playlists WHERE id = ?');
    const playlist = stmt.get(id);

    if (!playlist) {
      return null;
    }

    // Parse criteria if exists
    if (playlist.smart_criteria) {
      try {
        playlist.criteria = JSON.parse(playlist.smart_criteria);
      } catch (error) {
        logger.warn(`Failed to parse criteria for playlist ${id}`);
        playlist.criteria = null;
      }
    }

    // Include tracks if requested
    if (includeTracks) {
      playlist.tracks = playlistTrackService.getPlaylistTracks(id);
    }

    return playlist;
  } catch (error) {
    logger.error(`Error getting playlist ${id}:`, error);
    throw error;
  }
}

/**
 * Get all playlists with optional filtering
 * @param {Object} filters - Filter criteria
 * @param {string} filters.type - Filter by type (static/smart/session/temp)
 * @param {boolean} filters.is_favorite - Filter favorites
 * @param {boolean} filters.is_temporary - Filter temporary
 * @param {string} filters.search - Search by name
 * @returns {Array} Array of playlists
 */
export function getAllPlaylists(filters = {}) {
  try {
    const db = getDatabase();

    let sql = 'SELECT * FROM playlists WHERE 1=1';
    const params = [];

    // Apply filters
    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.is_favorite !== undefined) {
      sql += ' AND is_favorite = ?';
      params.push(filters.is_favorite ? 1 : 0);
    }

    if (filters.is_temporary !== undefined) {
      sql += ' AND is_temporary = ?';
      params.push(filters.is_temporary ? 1 : 0);
    }

    if (filters.search) {
      sql += ' AND name LIKE ?';
      params.push(`%${filters.search}%`);
    }

    // Order by favorites first, then by updated_at desc
    sql += ' ORDER BY is_favorite DESC, updated_at DESC';

    const stmt = db.prepare(sql);
    const playlists = stmt.all(...params);

    // Parse criteria for smart playlists
    playlists.forEach(playlist => {
      if (playlist.smart_criteria) {
        try {
          playlist.criteria = JSON.parse(playlist.smart_criteria);
        } catch (error) {
          logger.warn(`Failed to parse criteria for playlist ${playlist.id}`);
          playlist.criteria = null;
        }
      }

      // Add track count
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?');
      const result = countStmt.get(playlist.id);
      playlist.track_count = result.count;
    });

    return playlists;
  } catch (error) {
    logger.error('Error getting playlists:', error);
    throw error;
  }
}

/**
 * Update playlist metadata
 * @param {string} id - Playlist UUID
 * @param {Object} updates - Fields to update
 * @param {string} updates.name - Playlist name
 * @param {string} updates.description - Description
 * @param {string} updates.color - Color
 * @param {string} updates.icon - Icon
 * @param {boolean} updates.is_favorite - Favorite flag
 * @param {Object} updates.criteria - Smart playlist criteria
 * @returns {Object} Updated playlist
 */
export function updatePlaylist(id, updates) {
  try {
    // Validate UUID
    if (!isValidUUID(id)) {
      throw new Error(`Invalid playlist ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();

    // Get current playlist
    const playlist = getPlaylistById(id, false);
    if (!playlist) {
      throw new Error(`Playlist not found: ${id}`);
    }

    // Check if readonly
    if (playlist.is_readonly && !updates.is_readonly) {
      throw new Error('Cannot modify readonly playlist (finalized session)');
    }

    // Build update query
    const allowedFields = [
      'name',
      'description',
      'color',
      'icon',
      'is_favorite',
      'smart_criteria',
      'session_venue',
      'session_duration',
      'is_readonly',
    ];

    const fields = [];
    const params = [];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        if (key === 'smart_criteria' || key === 'criteria') {
          // Serialize criteria
          fields.push('smart_criteria = ?');
          params.push(updates[key] ? JSON.stringify(updates[key]) : null);
        } else if (key === 'is_favorite' || key === 'is_readonly') {
          // Convert boolean to integer
          fields.push(`${key} = ?`);
          params.push(updates[key] ? 1 : 0);
        } else {
          fields.push(`${key} = ?`);
          params.push(updates[key]);
        }
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add updated_at
    fields.push('updated_at = ?');
    params.push(Math.floor(Date.now() / 1000));

    // Add id for WHERE clause
    params.push(id);

    // Execute update
    const sql = `UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(sql);
    stmt.run(...params);

    logger.info(`Updated playlist: ${id}`, { updates });

    // Return updated playlist
    return getPlaylistById(id, false);
  } catch (error) {
    logger.error(`Error updating playlist ${id}:`, error);
    throw error;
  }
}

/**
 * Delete playlist
 * @param {string} id - Playlist UUID
 * @returns {boolean} Success
 */
export function deletePlaylist(id) {
  try {
    // Validate UUID
    if (!isValidUUID(id)) {
      throw new Error(`Invalid playlist ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();

    // Check if playlist exists
    const playlist = getPlaylistById(id, false);
    if (!playlist) {
      throw new Error(`Playlist not found: ${id}`);
    }

    // Delete playlist (cascade will delete playlist_tracks)
    const stmt = db.prepare('DELETE FROM playlists WHERE id = ?');
    const result = stmt.run(id);

    logger.info(`Deleted playlist: ${playlist.name} (${id})`);

    return result.changes > 0;
  } catch (error) {
    logger.error(`Error deleting playlist ${id}:`, error);
    throw error;
  }
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get playlist statistics
 * @param {string} id - Playlist UUID
 * @returns {Object} Statistics
 */
export function getPlaylistStats(id) {
  try {
    // Validate UUID
    if (!isValidUUID(id)) {
      throw new Error(`Invalid playlist ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();

    // Get basic playlist info
    const playlist = getPlaylistById(id, false);
    if (!playlist) {
      throw new Error(`Playlist not found: ${id}`);
    }

    // Get statistics from tracks
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as track_count,
        SUM(t.duration_seconds) as total_duration,
        AVG(t.bpm) as avg_bpm,
        MIN(t.bpm) as min_bpm,
        MAX(t.bpm) as max_bpm,
        AVG(t.energy) as avg_energy,
        AVG(t.danceability) as avg_danceability
      FROM playlist_tracks pt
      LEFT JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = ? AND t.is_missing = 0
    `);

    const stats = stmt.get(id);

    // Get key distribution
    const keyStmt = db.prepare(`
      SELECT t.musical_key, COUNT(*) as count
      FROM playlist_tracks pt
      LEFT JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = ? AND t.musical_key IS NOT NULL AND t.is_missing = 0
      GROUP BY t.musical_key
      ORDER BY count DESC
    `);
    const keyDistribution = keyStmt.all(id);

    // Get genre distribution
    const genreStmt = db.prepare(`
      SELECT t.genre, COUNT(*) as count
      FROM playlist_tracks pt
      LEFT JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = ? AND t.genre IS NOT NULL AND t.is_missing = 0
      GROUP BY t.genre
      ORDER BY count DESC
      LIMIT 10
    `);
    const genreDistribution = genreStmt.all(id);

    return {
      track_count: stats.track_count || 0,
      total_duration: Math.round(stats.total_duration || 0),
      avg_bpm: stats.avg_bpm ? parseFloat(stats.avg_bpm.toFixed(1)) : null,
      min_bpm: stats.min_bpm || null,
      max_bpm: stats.max_bpm || null,
      avg_energy: stats.avg_energy ? parseFloat(stats.avg_energy.toFixed(2)) : null,
      avg_danceability: stats.avg_danceability ? parseFloat(stats.avg_danceability.toFixed(2)) : null,
      key_distribution: keyDistribution,
      genre_distribution: genreDistribution,
    };
  } catch (error) {
    logger.error(`Error getting stats for playlist ${id}:`, error);
    throw error;
  }
}

/**
 * Get recently updated playlists
 * @param {number} limit - Number of playlists to return
 * @returns {Array} Recently updated playlists
 */
export function getRecentlyUpdated(limit = 10) {
  try {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM playlists
      WHERE is_temporary = 0
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    const playlists = stmt.all(limit);

    // Add track counts
    playlists.forEach(playlist => {
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?');
      const result = countStmt.get(playlist.id);
      playlist.track_count = result.count;

      // Parse criteria if exists
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
    logger.error('Error getting recently updated playlists:', error);
    throw error;
  }
}

/**
 * Get favorite playlists
 * @returns {Array} Favorite playlists
 */
export function getFavorites() {
  try {
    return getAllPlaylists({ is_favorite: true });
  } catch (error) {
    logger.error('Error getting favorite playlists:', error);
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Duplicate playlist
 * @param {string} id - Playlist UUID to duplicate
 * @param {string} newName - Name for duplicated playlist
 * @returns {Object} New playlist
 */
export function duplicatePlaylist(id, newName) {
  try {
    // Validate UUID
    if (!isValidUUID(id)) {
      throw new Error(`Invalid playlist ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();

    // Get original playlist with tracks
    const original = getPlaylistById(id, true);
    if (!original) {
      throw new Error(`Playlist not found: ${id}`);
    }

    // Create new playlist with same data
    const newPlaylist = createPlaylist({
      name: newName,
      type: original.type === 'session' ? 'static' : original.type, // Sessions convert to static
      description: original.description,
      color: original.color,
      icon: original.icon,
      criteria: original.criteria,
      is_favorite: false, // Don't copy favorite flag
      is_temporary: false,
      is_readonly: false,
    });

    // Copy tracks if original has any
    if (original.tracks && original.tracks.length > 0) {
      const trackIds = original.tracks.map(pt => pt.track_id);
      playlistTrackService.addTracksToPlaylist(newPlaylist.id, trackIds);
    }

    logger.info(`Duplicated playlist: ${original.name} → ${newName}`);

    return getPlaylistById(newPlaylist.id, true);
  } catch (error) {
    logger.error(`Error duplicating playlist ${id}:`, error);
    throw error;
  }
}

/**
 * Export playlist to M3U format
 * @param {string} id - Playlist UUID
 * @returns {string} M3U content
 */
export function exportPlaylistM3U(id) {
  try {
    // Validate UUID
    if (!isValidUUID(id)) {
      throw new Error(`Invalid playlist ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();

    // Get playlist with tracks
    const playlist = getPlaylistById(id, true);
    if (!playlist) {
      throw new Error(`Playlist not found: ${id}`);
    }

    // Build M3U content
    let m3u = '#EXTM3U\n';
    m3u += `# Playlist: ${playlist.name}\n`;
    if (playlist.description) {
      m3u += `# Description: ${playlist.description}\n`;
    }
    m3u += `# Exported: ${new Date().toISOString()}\n`;
    m3u += `# Generated by Mismo DJ\n\n`;

    // Add tracks
    if (playlist.tracks && playlist.tracks.length > 0) {
      playlist.tracks.forEach(playlistTrack => {
        const track = playlistTrack.track;
        if (track && !track.is_missing) {
          // Extended M3U format: #EXTINF:duration,artist - title
          const duration = Math.round(track.duration_seconds || 0);
          const artist = track.artist || 'Unknown Artist';
          const title = track.title || 'Unknown Title';

          m3u += `#EXTINF:${duration},${artist} - ${title}\n`;
          m3u += `${track.file_path}\n`;
        }
      });
    }

    return m3u;
  } catch (error) {
    logger.error(`Error exporting playlist ${id} to M3U:`, error);
    throw error;
  }
}

/**
 * Convert smart playlist to static
 * Freezes the current tracks and removes smart criteria
 * @param {string} id - Playlist UUID
 * @returns {Object} Result with track count
 */
export function convertSmartToStatic(id) {
  try {
    // Validate UUID
    if (!isValidUUID(id)) {
      throw new Error(`Invalid playlist ID: ${id} is not a valid UUID`);
    }

    const db = getDatabase();

    // Get playlist
    const playlist = getPlaylistById(id, false);
    if (!playlist) {
      throw new Error(`Playlist not found: ${id}`);
    }

    if (playlist.type !== 'smart') {
      throw new Error('Only smart playlists can be converted to static');
    }

    // Update playlist type and remove criteria
    const updateStmt = db.prepare(`
      UPDATE playlists
      SET type = 'static',
          smart_criteria = NULL,
          updated_at = ?
      WHERE id = ?
    `);

    const now = Math.floor(Date.now() / 1000);
    updateStmt.run(now, id);

    // Get track count
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?');
    const result = countStmt.get(id);

    logger.info(`✓ Converted smart playlist ${id} to static (${result.count} tracks)`);

    return {
      track_count: result.count,
    };
  } catch (error) {
    logger.error(`Error converting smart playlist ${id} to static:`, error);
    throw error;
  }
}

/**
 * Export playlist to JSON format
 * @param {string} id - Playlist UUID
 * @returns {Object} JSON playlist data
 */
export function exportPlaylistJSON(id) {
  try {
    // Validate UUID
    if (!isValidUUID(id)) {
      throw new Error(`Invalid playlist ID: ${id} is not a valid UUID`);
    }

    // Get playlist with tracks and stats
    const playlist = getPlaylistById(id, true);
    if (!playlist) {
      throw new Error(`Playlist not found: ${id}`);
    }

    const stats = getPlaylistStats(id);

    return {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        type: playlist.type,
        description: playlist.description,
        color: playlist.color,
        icon: playlist.icon,
        created_at: playlist.created_at,
        updated_at: playlist.updated_at,
        criteria: playlist.criteria,
      },
      stats,
      tracks: playlist.tracks.map(pt => ({
        position: pt.position,
        notes: pt.notes,
        cue_in: pt.cue_in,
        cue_out: pt.cue_out,
        track: {
          id: pt.track.id,
          title: pt.track.title,
          artist: pt.track.artist,
          album: pt.track.album,
          genre: pt.track.genre,
          bpm: pt.track.bpm,
          musical_key: pt.track.musical_key,
          mode: pt.track.mode,
          duration_seconds: pt.track.duration_seconds,
          file_path: pt.track.file_path,
        },
      })),
      exported_at: new Date().toISOString(),
      exported_by: 'Mismo DJ',
    };
  } catch (error) {
    logger.error(`Error exporting playlist ${id} to JSON:`, error);
    throw error;
  }
}

// ============================================================================
// Temporary Playlist Support
// ============================================================================

/**
 * Get or create the global "Thinking Playlist"
 * @returns {Object} Thinking playlist
 */
export function getThinkingPlaylist() {
  try {
    const db = getDatabase();

    // Try to find existing thinking playlist
    const stmt = db.prepare(`
      SELECT * FROM playlists
      WHERE type = 'temp' AND is_temporary = 1
      LIMIT 1
    `);
    const existing = stmt.get();

    if (existing) {
      return getPlaylistById(existing.id, true);
    }

    // Create new thinking playlist
    logger.info('Creating new thinking playlist');
    return createPlaylist({
      name: 'Thinking Playlist',
      type: 'temp',
      description: 'Temporary playlist for exploring track combinations',
      is_temporary: true,
      icon: 'lightbulb',
    });
  } catch (error) {
    logger.error('Error getting thinking playlist:', error);
    throw error;
  }
}

/**
 * Promote thinking playlist to static
 * @param {string} newName - Name for new static playlist
 * @returns {Object} New static playlist
 */
export function promoteThinkingPlaylist(newName) {
  try {
    const thinkingPlaylist = getThinkingPlaylist();

    // Duplicate as static
    const newPlaylist = duplicatePlaylist(thinkingPlaylist.id, newName);

    // Update type to static directly (bypassing updatePlaylist validation)
    const db = getDatabase();
    const updateStmt = db.prepare(`
      UPDATE playlists
      SET type = 'static',
          is_temporary = 0,
          updated_at = ?
      WHERE id = ?
    `);
    const now = Math.floor(Date.now() / 1000);
    updateStmt.run(now, newPlaylist.id);

    // Clear thinking playlist
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(thinkingPlaylist.id);

    logger.info(`Promoted thinking playlist to static: ${newName}`);

    return {
      promoted_playlist: getPlaylistById(newPlaylist.id, true),
      new_thinking_playlist: getThinkingPlaylist(),
    };
  } catch (error) {
    logger.error('Error promoting thinking playlist:', error);
    throw error;
  }
}
