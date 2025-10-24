/**
 * Playlist Routes
 * RESTful API endpoints for playlist management (Phase 5)
 *
 * Supports 4 playlist types:
 * - static: Manual track curation
 * - smart: Auto-populated based on criteria
 * - session: DJ performance history
 * - temp: Thinking playlist for exploration
 */

import express from 'express';
import { validate, schemas } from '../utils/validators.js';
import * as playlistService from '../services/playlist.service.js';
import * as playlistTrackService from '../services/playlistTrack.service.js';
import * as smartPlaylistService from '../services/smartPlaylistEvaluator.service.js';
import * as sessionService from '../services/session.service.js';

const router = express.Router();

// ============================================================================
// Special Routes (must come before /:id to avoid treating them as IDs)
// ============================================================================

/**
 * GET /api/playlists/search
 * Search playlists by name/description
 *
 * Query Parameters:
 * - q: string (required) - Search query
 *
 * Response: 200 OK
 * {
 *   "playlists": [...],
 *   "count": 5
 * }
 */
router.get('/search',
  validate(schemas.searchPlaylists, 'query'),
  async (req, res) => {
    try {
      const { q } = req.validated?.query || req.query;

      const playlists = playlistService.getAllPlaylists({ search: q });

      res.json({
        playlists,
        count: playlists.length,
      });
    } catch (error) {
      console.error('✗ Failed to search playlists:', error.message);
      res.status(500).json({
        error: 'Failed to search playlists',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/playlists/thinking
 * Get the thinking playlist (auto-create if doesn't exist)
 *
 * Response: 200 OK
 * {
 *   "id": "uuid",
 *   "name": "Thinking Playlist",
 *   "type": "temp",
 *   ...
 * }
 */
router.get('/thinking', async (req, res) => {
  try {
    const thinkingPlaylist = playlistService.getThinkingPlaylist();

    res.json(thinkingPlaylist);
  } catch (error) {
    console.error('✗ Failed to get thinking playlist:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve thinking playlist',
      message: error.message,
    });
  }
});

/**
 * POST /api/playlists/thinking/promote
 * Promote thinking playlist to static playlist
 *
 * Request Body:
 * {
 *   "name": "My New Playlist"
 * }
 *
 * Response: 200 OK
 * {
 *   "promoted_playlist": {...},
 *   "new_thinking_playlist": {...}
 * }
 */
router.post('/thinking/promote',
  validate(schemas.promoteThinkingPlaylist, 'body'),
  async (req, res) => {
    try {
      const { name } = req.body;

      const result = playlistService.promoteThinkingPlaylist(name);

      console.log(`✓ Promoted thinking playlist to "${name}" (${result.promoted_playlist.id})`);

      res.json(result);
    } catch (error) {
      console.error('✗ Failed to promote thinking playlist:', error.message);
      res.status(500).json({
        error: 'Failed to promote thinking playlist',
        message: error.message,
      });
    }
  }
);

// ============================================================================
// Playlist CRUD Operations
// ============================================================================

/**
 * GET /api/playlists
 * Get all playlists with optional filtering
 *
 * Query Parameters:
 * - type: string (optional) - Filter by playlist type (static/smart/session/temp)
 * - is_favorite: boolean (optional) - Filter by favorite status
 * - is_temporary: boolean (optional) - Filter by temporary status
 * - search: string (optional) - Search in playlist name/description
 *
 * Response: 200 OK
 * {
 *   "playlists": [
 *     {
 *       "id": "uuid",
 *       "name": "My Playlist",
 *       "type": "static",
 *       "track_count": 42,
 *       "total_duration": 7200,
 *       "is_favorite": 0,
 *       "created_at": 1729785600,
 *       "updated_at": 1729785600
 *     }
 *   ]
 * }
 */
router.get('/', validate(schemas.playlistQuery, 'query'), async (req, res) => {
  try {
    const { type, is_favorite, is_temporary, search } = req.validated?.query || req.query;

    const filters = {};
    if (type) filters.type = type;
    if (is_favorite !== undefined) filters.is_favorite = is_favorite ? 1 : 0;
    if (is_temporary !== undefined) filters.is_temporary = is_temporary ? 1 : 0;
    if (search) filters.search = search;

    const playlists = playlistService.getAllPlaylists(filters);

    res.json({
      playlists,
      count: playlists.length,
    });
  } catch (error) {
    console.error('✗ Failed to get playlists:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve playlists',
      message: error.message,
    });
  }
});

/**
 * GET /api/playlists/:id
 * Get a single playlist by ID with optional tracks
 *
 * Query Parameters:
 * - include_tracks: boolean (optional) - Include tracks in response (default: true)
 *
 * Response: 200 OK
 * {
 *   "id": "uuid",
 *   "name": "My Playlist",
 *   "type": "static",
 *   "description": "Best tracks for summer",
 *   "tracks": [...] // if include_tracks=true
 * }
 */
router.get('/:id', validate(schemas.playlistId, 'params'), async (req, res) => {
  try {
    const { id } = req.validated?.params || req.params;
    const includeTracks = req.query.include_tracks !== 'false';

    const playlist = playlistService.getPlaylistById(id, includeTracks);

    if (!playlist) {
      return res.status(404).json({
        error: 'Playlist not found',
        message: `No playlist found with ID: ${id}`,
      });
    }

    res.json(playlist);
  } catch (error) {
    console.error(`✗ Failed to get playlist ${req.params.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to retrieve playlist',
      message: error.message,
    });
  }
});

/**
 * POST /api/playlists
 * Create a new playlist
 *
 * Request Body:
 * {
 *   "name": "My Playlist",
 *   "type": "static", // static/smart/session/temp
 *   "description": "Optional description",
 *   "color": "#FF5733",
 *   "icon": "music",
 *   "criteria": {...}, // Required for smart playlists
 *   "session_venue": "Club XYZ", // Optional for sessions
 *   "session_date": 1729785600, // Optional for sessions
 *   "is_favorite": false
 * }
 *
 * Response: 201 Created
 */
router.post('/', validate(schemas.createPlaylist, 'body'), async (req, res) => {
  try {
    const playlistData = req.body;

    const playlist = playlistService.createPlaylist(playlistData);

    console.log(`✓ Created ${playlist.type} playlist: ${playlist.name} (${playlist.id})`);

    res.status(201).json(playlist);
  } catch (error) {
    console.error('✗ Failed to create playlist:', error.message);
    res.status(500).json({
      error: 'Failed to create playlist',
      message: error.message,
    });
  }
});

/**
 * PUT /api/playlists/:id
 * Update a playlist
 *
 * Request Body:
 * {
 *   "name": "Updated Name",
 *   "description": "Updated description",
 *   "color": "#FF5733",
 *   "icon": "music",
 *   "is_favorite": true
 * }
 *
 * Response: 200 OK
 */
router.put('/:id',
  validate(schemas.playlistId, 'params'),
  validate(schemas.updatePlaylist, 'body'),
  async (req, res) => {
    try {
      const { id } = req.validated?.params || req.params;
      const updates = req.body;

      const playlist = playlistService.updatePlaylist(id, updates);

      if (!playlist) {
        return res.status(404).json({
          error: 'Playlist not found',
          message: `No playlist found with ID: ${id}`,
        });
      }

      console.log(`✓ Updated playlist: ${playlist.name} (${id})`);

      res.json(playlist);
    } catch (error) {
      console.error(`✗ Failed to update playlist ${req.params.id}:`, error.message);
      res.status(500).json({
        error: 'Failed to update playlist',
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/playlists/:id
 * Delete a playlist
 *
 * Response: 200 OK
 * {
 *   "message": "Playlist deleted successfully",
 *   "id": "uuid"
 * }
 */
router.delete('/:id', validate(schemas.playlistId, 'params'), async (req, res) => {
  try {
    const { id } = req.validated?.params || req.params;

    const success = playlistService.deletePlaylist(id);

    if (!success) {
      return res.status(404).json({
        error: 'Playlist not found',
        message: `No playlist found with ID: ${id}`,
      });
    }

    console.log(`✓ Deleted playlist: ${id}`);

    res.json({
      message: 'Playlist deleted successfully',
      id,
    });
  } catch (error) {
    console.error(`✗ Failed to delete playlist ${req.params.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to delete playlist',
      message: error.message,
    });
  }
});

/**
 * GET /api/playlists/:id/stats
 * Get playlist statistics
 *
 * Response: 200 OK
 * {
 *   "track_count": 42,
 *   "total_duration": 7200,
 *   "avg_bpm": 125.5,
 *   "key_distribution": {...},
 *   "genre_distribution": {...}
 * }
 */
router.get('/:id/stats', validate(schemas.playlistId, 'params'), async (req, res) => {
  try {
    const { id } = req.validated?.params || req.params;

    const stats = playlistService.getPlaylistStats(id);

    if (!stats) {
      return res.status(404).json({
        error: 'Playlist not found',
        message: `No playlist found with ID: ${id}`,
      });
    }

    res.json(stats);
  } catch (error) {
    console.error(`✗ Failed to get playlist stats ${req.params.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to retrieve playlist statistics',
      message: error.message,
    });
  }
});

// ============================================================================
// Track Management
// ============================================================================

/**
 * POST /api/playlists/:id/tracks
 * Add tracks to a playlist
 *
 * Request Body:
 * {
 *   "track_ids": ["uuid1", "uuid2"],
 *   "position": 5, // Optional, defaults to end
 *   "notes": "Great transition tracks" // Optional
 * }
 *
 * Response: 200 OK
 * {
 *   "message": "Tracks added successfully",
 *   "added_count": 2
 * }
 */
router.post('/:id/tracks',
  validate(schemas.playlistId, 'params'),
  validate(schemas.addTracks, 'body'),
  async (req, res) => {
    try {
      const { id } = req.validated?.params || req.params;
      const { track_ids, position, notes } = req.body;

      playlistTrackService.addTracksToPlaylist(id, track_ids, position, notes);

      console.log(`✓ Added ${track_ids.length} tracks to playlist ${id}`);

      res.json({
        message: 'Tracks added successfully',
        added_count: track_ids.length,
      });
    } catch (error) {
      console.error(`✗ Failed to add tracks to playlist ${req.params.id}:`, error.message);
      res.status(500).json({
        error: 'Failed to add tracks to playlist',
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/playlists/:id/tracks/:trackId
 * Remove a track from a playlist
 *
 * Response: 200 OK
 * {
 *   "message": "Track removed successfully"
 * }
 */
router.delete('/:id/tracks/:trackId',
  validate(schemas.playlistTrackParams, 'params'),
  async (req, res) => {
    try {
      const { id, trackId } = req.validated?.params || req.params;

      const success = playlistTrackService.removeTrackFromPlaylist(id, trackId);

      if (!success) {
        return res.status(404).json({
          error: 'Track not found in playlist',
          message: `Track ${trackId} not found in playlist ${id}`,
        });
      }

      console.log(`✓ Removed track ${trackId} from playlist ${id}`);

      res.json({
        message: 'Track removed successfully',
      });
    } catch (error) {
      console.error(`✗ Failed to remove track from playlist:`, error.message);
      res.status(500).json({
        error: 'Failed to remove track from playlist',
        message: error.message,
      });
    }
  }
);

/**
 * PUT /api/playlists/:id/tracks/reorder
 * Reorder tracks in a playlist
 *
 * Request Body:
 * {
 *   "track_ids": ["uuid1", "uuid2", "uuid3"] // New order
 * }
 *
 * Response: 200 OK
 * {
 *   "message": "Tracks reordered successfully"
 * }
 */
router.put('/:id/tracks/reorder',
  validate(schemas.playlistId, 'params'),
  validate(schemas.reorderTracks, 'body'),
  async (req, res) => {
    try {
      const { id } = req.validated?.params || req.params;
      const { track_ids } = req.body;

      playlistTrackService.reorderTracks(id, track_ids);

      console.log(`✓ Reordered ${track_ids.length} tracks in playlist ${id}`);

      res.json({
        message: 'Tracks reordered successfully',
      });
    } catch (error) {
      console.error(`✗ Failed to reorder tracks in playlist ${req.params.id}:`, error.message);
      res.status(500).json({
        error: 'Failed to reorder tracks',
        message: error.message,
      });
    }
  }
);

/**
 * PUT /api/playlists/:id/tracks/:trackId
 * Update track-specific metadata in a playlist
 *
 * Request Body:
 * {
 *   "notes": "Perfect opener",
 *   "cue_in": 15000,
 *   "cue_out": 180000,
 *   "rating_in_context": 5
 * }
 *
 * Response: 200 OK
 * {
 *   "message": "Track metadata updated successfully"
 * }
 */
router.put('/:id/tracks/:trackId',
  validate(schemas.playlistTrackParams, 'params'),
  validate(schemas.updateTrackMetadata, 'body'),
  async (req, res) => {
    try {
      const { id, trackId } = req.validated?.params || req.params;
      const metadata = req.body;

      const success = playlistTrackService.updateTrackMetadata(id, trackId, metadata);

      if (!success) {
        return res.status(404).json({
          error: 'Track not found in playlist',
          message: `Track ${trackId} not found in playlist ${id}`,
        });
      }

      console.log(`✓ Updated metadata for track ${trackId} in playlist ${id}`);

      res.json({
        message: 'Track metadata updated successfully',
      });
    } catch (error) {
      console.error(`✗ Failed to update track metadata:`, error.message);
      res.status(500).json({
        error: 'Failed to update track metadata',
        message: error.message,
      });
    }
  }
);

// ============================================================================
// Smart Playlist Operations
// ============================================================================

/**
 * POST /api/playlists/:id/refresh
 * Refresh a smart playlist (re-evaluate criteria)
 *
 * Response: 200 OK
 * {
 *   "added": 5,
 *   "removed": 2,
 *   "total": 42
 * }
 */
router.post('/:id/refresh', validate(schemas.playlistId, 'params'), async (req, res) => {
  try {
    const { id } = req.validated?.params || req.params;

    const result = smartPlaylistService.refreshSmartPlaylist(id);

    console.log(`✓ Refreshed smart playlist ${id}: +${result.added} -${result.removed} = ${result.total}`);

    res.json(result);
  } catch (error) {
    console.error(`✗ Failed to refresh smart playlist ${req.params.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to refresh smart playlist',
      message: error.message,
    });
  }
});

/**
 * POST /api/playlists/:id/convert
 * Convert a smart playlist to static (freeze current tracks)
 *
 * Response: 200 OK
 * {
 *   "message": "Smart playlist converted to static",
 *   "track_count": 42
 * }
 */
router.post('/:id/convert', validate(schemas.playlistId, 'params'), async (req, res) => {
  try {
    const { id } = req.validated?.params || req.params;

    const result = playlistService.convertSmartToStatic(id);

    console.log(`✓ Converted smart playlist ${id} to static (${result.track_count} tracks)`);

    res.json({
      message: 'Smart playlist converted to static',
      track_count: result.track_count,
    });
  } catch (error) {
    console.error(`✗ Failed to convert smart playlist ${req.params.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to convert smart playlist',
      message: error.message,
    });
  }
});

/**
 * GET /api/playlists/:id/explain
 * Get human-readable explanation of smart playlist criteria
 *
 * Response: 200 OK
 * {
 *   "explanation": "BPM between 120 and 135, Genres: House, Techno, Energy at least 0.6"
 * }
 */
router.get('/:id/explain', validate(schemas.playlistId, 'params'), async (req, res) => {
  try {
    const { id } = req.validated?.params || req.params;

    const playlist = playlistService.getPlaylistById(id, false);

    if (!playlist) {
      return res.status(404).json({
        error: 'Playlist not found',
        message: `No playlist found with ID: ${id}`,
      });
    }

    if (playlist.type !== 'smart') {
      return res.status(400).json({
        error: 'Invalid playlist type',
        message: 'Only smart playlists have criteria to explain',
      });
    }

    const explanation = smartPlaylistService.explainCriteria(playlist.smart_criteria);

    res.json({
      explanation,
      criteria: playlist.smart_criteria,
    });
  } catch (error) {
    console.error(`✗ Failed to explain smart playlist ${req.params.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to explain smart playlist criteria',
      message: error.message,
    });
  }
});

// ============================================================================
// Session Operations
// ============================================================================

/**
 * POST /api/playlists/sessions/start
 * Start a new DJ session
 *
 * Request Body:
 * {
 *   "venue": "Club XYZ", // Optional
 *   "date": 1729785600 // Optional, defaults to now
 * }
 *
 * Response: 201 Created
 * {
 *   "id": "uuid",
 *   "name": "Session - 2025-10-24 - Club XYZ",
 *   "type": "session",
 *   "session_venue": "Club XYZ",
 *   "session_date": 1729785600
 * }
 */
router.post('/sessions/start',
  validate(schemas.startSession, 'body'),
  async (req, res) => {
    try {
      const { venue, date } = req.body;

      const session = sessionService.startSession(venue, date);

      console.log(`✓ Started session: ${session.name} (${session.id})`);

      res.status(201).json(session);
    } catch (error) {
      console.error('✗ Failed to start session:', error.message);
      res.status(500).json({
        error: 'Failed to start session',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/playlists/sessions/:id/track
 * Log a track play in a session
 *
 * Request Body:
 * {
 *   "track_id": "uuid",
 *   "played_at": 1729785600, // Optional, defaults to now
 *   "duration": 180000, // Optional, milliseconds
 *   "notes": "Great crowd response" // Optional
 * }
 *
 * Response: 200 OK
 * {
 *   "message": "Track play logged successfully"
 * }
 */
router.post('/sessions/:id/track',
  validate(schemas.playlistId, 'params'),
  validate(schemas.logTrackPlay, 'body'),
  async (req, res) => {
    try {
      const { id } = req.validated?.params || req.params;
      const { track_id, played_at, duration, notes } = req.body;

      sessionService.logTrackPlay(id, track_id, played_at, duration, notes);

      console.log(`✓ Logged track ${track_id} in session ${id}`);

      res.json({
        message: 'Track play logged successfully',
      });
    } catch (error) {
      console.error(`✗ Failed to log track play in session ${req.params.id}:`, error.message);
      res.status(500).json({
        error: 'Failed to log track play',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/playlists/sessions/:id/finalize
 * Finalize a session (mark as readonly, calculate duration)
 *
 * Response: 200 OK
 * {
 *   "message": "Session finalized",
 *   "session_duration": 7200
 * }
 */
router.post('/sessions/:id/finalize',
  validate(schemas.playlistId, 'params'),
  async (req, res) => {
    try {
      const { id } = req.validated?.params || req.params;

      const result = sessionService.finalizeSession(id);

      console.log(`✓ Finalized session ${id} (duration: ${result.session_duration}s)`);

      res.json({
        message: 'Session finalized',
        session_duration: result.session_duration,
      });
    } catch (error) {
      console.error(`✗ Failed to finalize session ${req.params.id}:`, error.message);
      res.status(500).json({
        error: 'Failed to finalize session',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/playlists/sessions/active
 * Get all active (non-finalized) sessions
 *
 * Response: 200 OK
 * {
 *   "sessions": [...]
 * }
 */
router.get('/sessions/active', async (req, res) => {
  try {
    const sessions = playlistService.getAllPlaylists({
      type: 'session',
      is_readonly: 0,
    });

    res.json({
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error('✗ Failed to get active sessions:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve active sessions',
      message: error.message,
    });
  }
});

// ============================================================================
// Utility Operations
// ============================================================================

/**
 * POST /api/playlists/:id/duplicate
 * Duplicate a playlist
 *
 * Request Body:
 * {
 *   "name": "Copy of My Playlist"
 * }
 *
 * Response: 201 Created
 * {
 *   "id": "uuid",
 *   "name": "Copy of My Playlist",
 *   ...
 * }
 */
router.post('/:id/duplicate',
  validate(schemas.playlistId, 'params'),
  validate(schemas.duplicatePlaylist, 'body'),
  async (req, res) => {
    try {
      const { id } = req.validated?.params || req.params;
      const { name } = req.body;

      const duplicate = playlistService.duplicatePlaylist(id, name);

      console.log(`✓ Duplicated playlist ${id} as ${duplicate.name} (${duplicate.id})`);

      res.status(201).json(duplicate);
    } catch (error) {
      console.error(`✗ Failed to duplicate playlist ${req.params.id}:`, error.message);
      res.status(500).json({
        error: 'Failed to duplicate playlist',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/playlists/:id/export
 * Export playlist to M3U format
 *
 * Query Parameters:
 * - format: string (optional) - Export format (only 'm3u' supported for now)
 *
 * Response: 200 OK
 * Content-Type: application/x-mpegurl
 * Content-Disposition: attachment; filename="My Playlist.m3u"
 */
router.get('/:id/export',
  validate(schemas.playlistId, 'params'),
  validate(schemas.exportPlaylist, 'query'),
  async (req, res) => {
    try {
      const { id } = req.validated?.params || req.params;
      const format = req.validated?.query?.format || req.query.format || 'm3u';

      if (format !== 'm3u') {
        return res.status(400).json({
          error: 'Invalid export format',
          message: 'Only M3U format is supported',
        });
      }

      const m3uContent = playlistService.exportPlaylistM3U(id);
      const playlist = playlistService.getPlaylistById(id, false);

      res.setHeader('Content-Type', 'application/x-mpegurl');
      res.setHeader('Content-Disposition', `attachment; filename="${playlist.name}.m3u"`);
      res.send(m3uContent);

      console.log(`✓ Exported playlist ${id} as M3U`);
    } catch (error) {
      console.error(`✗ Failed to export playlist ${req.params.id}:`, error.message);
      res.status(500).json({
        error: 'Failed to export playlist',
        message: error.message,
      });
    }
  }
);

export default router;
