import express from 'express';
import * as hotCueService from '../services/hotCue.service.js';
import * as trackService from '../services/track.service.js';
import logger from '../utils/logger.js';
import { validate, schemas } from '../utils/validators.js';

const router = express.Router();

/**
 * GET /api/tracks/:id/hot-cues
 * Get all hot cues for a track
 *
 * Query Parameters:
 * - source: string (optional) - Filter by source ('user', 'rekordbox', 'serato', etc.)
 *
 * Response: 200 OK
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "uuid",
 *       "track_id": "track-uuid",
 *       "cue_index": 0,
 *       "position": 10.5,
 *       "name": "Intro",
 *       "color": "#ff4444",
 *       "is_loop": false,
 *       "loop_end": null,
 *       "auto_loop": false,
 *       "source": "user",
 *       "created_at": "2025-10-29T...",
 *       "updated_at": "2025-10-29T..."
 *     }
 *   ]
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track doesn't exist
 * - 500 Internal Server Error: Database error
 */
router.get('/:id/hot-cues', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;
    const { source } = req.query;

    // Check if track exists
    const track = trackService.getTrackById(id);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        message: `Track with ID ${id} does not exist`,
      });
    }

    // Get hot cues for the track (optionally filtered by source)
    const hotCues = hotCueService.getTrackHotCues(id, { source });

    res.json({
      success: true,
      data: hotCues,
    });
  } catch (error) {
    logger.error(`Error getting hot cues for track ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get hot cues',
      message: error.message,
    });
  }
});

/**
 * GET /api/tracks/:id/hot-cues/:index
 * Get a specific hot cue by index
 *
 * Query Parameters:
 * - source: string (optional) - Source to query (defaults to 'user')
 *
 * Response: 200 OK
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "track_id": "track-uuid",
 *     "cue_index": 0,
 *     "position": 10.5,
 *     ...
 *   }
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track or hot cue doesn't exist
 * - 400 Bad Request: Invalid index (must be 0-7)
 * - 500 Internal Server Error: Database error
 */
router.get('/:id/hot-cues/:index', validate(schemas.hotCueIndex, 'params'), async (req, res) => {
  try {
    const { id, index } = req.params;
    const { source = 'user' } = req.query;
    const cueIndex = parseInt(index);

    // Check if track exists
    const track = trackService.getTrackById(id);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        message: `Track with ID ${id} does not exist`,
      });
    }

    // Get the hot cue for the specified source
    const hotCue = hotCueService.getHotCue(id, cueIndex, source);

    if (!hotCue) {
      return res.status(404).json({
        success: false,
        error: 'Hot cue not found',
        message: `Hot cue at index ${cueIndex} from source '${source}' does not exist for track ${id}`,
      });
    }

    res.json({
      success: true,
      data: hotCue,
    });
  } catch (error) {
    logger.error(`Error getting hot cue ${req.params.index} for track ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get hot cue',
      message: error.message,
    });
  }
});

/**
 * POST /api/tracks/:id/hot-cues/:index
 * Create or update a hot cue at the specified index
 *
 * Body:
 * {
 *   "position": 10.5,           // Required: Position in seconds
 *   "name": "Intro",            // Optional: Label/name
 *   "color": "#ff4444",         // Optional: UI color (hex format)
 *   "isLoop": false,            // Optional: Whether this is a loop cue
 *   "loopEnd": 20.5,            // Optional: End position if loop (seconds)
 *   "autoLoop": false,          // Optional: Auto-activate on trigger
 *   "source": "user"            // Optional: Source of the cue
 * }
 *
 * Response: 200 OK
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "track_id": "track-uuid",
 *     "cue_index": 0,
 *     "position": 10.5,
 *     ...
 *   },
 *   "message": "Hot cue created/updated successfully"
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track doesn't exist
 * - 400 Bad Request: Invalid data or validation error
 * - 500 Internal Server Error: Database error
 */
router.post(
  '/:id/hot-cues/:index',
  validate(schemas.hotCueIndex, 'params'),
  validate(schemas.hotCueCreate, 'body'),
  async (req, res) => {
    try {
      const { id, index } = req.params;
      const cueIndex = parseInt(index);
      const cueData = req.body;

      // Check if track exists
      const track = trackService.getTrackById(id);
      if (!track) {
        return res.status(404).json({
          success: false,
          error: 'Track not found',
          message: `Track with ID ${id} does not exist`,
        });
      }

      // Create or update the hot cue
      const hotCue = hotCueService.setHotCue(id, cueIndex, cueData);

      res.json({
        success: true,
        data: hotCue,
        message: 'Hot cue saved successfully',
      });
    } catch (error) {
      logger.error(`Error setting hot cue ${req.params.index} for track ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to set hot cue',
        message: error.message,
      });
    }
  }
);

/**
 * PUT /api/tracks/:id/hot-cues/:index
 * Update an existing hot cue (partial update)
 *
 * Body: At least one field must be provided
 * {
 *   "position": 10.5,           // Optional: Position in seconds
 *   "name": "Intro",            // Optional: Label/name
 *   "color": "#ff4444",         // Optional: UI color (hex format)
 *   "isLoop": false,            // Optional: Whether this is a loop cue
 *   "loopEnd": 20.5,            // Optional: End position if loop (seconds)
 *   "autoLoop": false,          // Optional: Auto-activate on trigger
 *   "source": "user"            // Optional: Source of the cue
 * }
 *
 * Response: 200 OK
 * {
 *   "success": true,
 *   "data": { ... },
 *   "message": "Hot cue updated successfully"
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track or hot cue doesn't exist
 * - 400 Bad Request: Invalid data or no fields provided
 * - 500 Internal Server Error: Database error
 */
router.put(
  '/:id/hot-cues/:index',
  validate(schemas.hotCueIndex, 'params'),
  validate(schemas.hotCueUpdate, 'body'),
  async (req, res) => {
    try {
      const { id, index } = req.params;
      const cueIndex = parseInt(index);
      const updates = req.body;

      // Check if track exists
      const track = trackService.getTrackById(id);
      if (!track) {
        return res.status(404).json({
          success: false,
          error: 'Track not found',
          message: `Track with ID ${id} does not exist`,
        });
      }

      // Check if hot cue exists
      const existingCue = hotCueService.getHotCue(id, cueIndex);
      if (!existingCue) {
        return res.status(404).json({
          success: false,
          error: 'Hot cue not found',
          message: `Hot cue at index ${cueIndex} does not exist for track ${id}`,
        });
      }

      // Merge existing data with updates
      const cueData = {
        position: updates.position !== undefined ? updates.position : existingCue.position,
        name: updates.name !== undefined ? updates.name : existingCue.name,
        color: updates.color !== undefined ? updates.color : existingCue.color,
        isLoop: updates.isLoop !== undefined ? updates.isLoop : Boolean(existingCue.is_loop),
        loopEnd: updates.loopEnd !== undefined ? updates.loopEnd : existingCue.loop_end,
        autoLoop: updates.autoLoop !== undefined ? updates.autoLoop : Boolean(existingCue.auto_loop),
        source: updates.source !== undefined ? updates.source : existingCue.source,
      };

      // Update the hot cue
      const hotCue = hotCueService.setHotCue(id, cueIndex, cueData);

      res.json({
        success: true,
        data: hotCue,
        message: 'Hot cue updated successfully',
      });
    } catch (error) {
      logger.error(
        `Error updating hot cue ${req.params.index} for track ${req.params.id}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: 'Failed to update hot cue',
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/tracks/:id/hot-cues/:index
 * Remove a hot cue
 *
 * Query Parameters:
 * - source: string (optional) - Source to remove (defaults to 'user')
 *
 * Response: 200 OK
 * {
 *   "success": true,
 *   "message": "Hot cue removed successfully"
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track or hot cue doesn't exist
 * - 400 Bad Request: Invalid index
 * - 500 Internal Server Error: Database error
 */
router.delete(
  '/:id/hot-cues/:index',
  validate(schemas.hotCueIndex, 'params'),
  async (req, res) => {
    try {
      const { id, index } = req.params;
      const { source = 'user' } = req.query;
      const cueIndex = parseInt(index);

      // Check if track exists
      const track = trackService.getTrackById(id);
      if (!track) {
        return res.status(404).json({
          success: false,
          error: 'Track not found',
          message: `Track with ID ${id} does not exist`,
        });
      }

      // Remove the hot cue for the specified source
      const removed = hotCueService.removeHotCue(id, cueIndex, source);

      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Hot cue not found',
          message: `Hot cue at index ${cueIndex} from source '${source}' does not exist for track ${id}`,
        });
      }

      res.json({
        success: true,
        message: 'Hot cue removed successfully',
      });
    } catch (error) {
      logger.error(
        `Error removing hot cue ${req.params.index} for track ${req.params.id}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: 'Failed to remove hot cue',
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/tracks/:id/hot-cues
 * Remove all hot cues for a track
 *
 * Response: 200 OK
 * {
 *   "success": true,
 *   "message": "Removed 5 hot cues"
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track doesn't exist
 * - 500 Internal Server Error: Database error
 */
router.delete('/:id/hot-cues', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if track exists
    const track = trackService.getTrackById(id);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        message: `Track with ID ${id} does not exist`,
      });
    }

    // Remove all hot cues
    const count = hotCueService.removeAllHotCues(id);

    res.json({
      success: true,
      message: `Removed ${count} hot cue${count === 1 ? '' : 's'}`,
      count: count,
    });
  } catch (error) {
    logger.error(`Error removing all hot cues for track ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove hot cues',
      message: error.message,
    });
  }
});

export default router;
