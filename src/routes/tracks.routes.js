import express from 'express';
import * as trackService from '../services/track.service.js';
import * as fileOpsService from '../services/fileOperations.service.js';
import * as waveformService from '../services/waveform.service.js';
import logger from '../utils/logger.js';
import { validate, schemas } from '../utils/validators.js';

const router = express.Router();

/**
 * GET /api/tracks
 * List all tracks with pagination and filtering
 */
router.get('/', validate(schemas.trackQuery, 'query'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      sort = 'date_added',
      order = 'DESC',
      artist,
      genre,
      bpm_min,
      bpm_max,
      key,
      library_id,
      is_missing,
      search,
    } = req.query;

    const filters = {};
    if (artist) filters.artist = artist;
    if (genre) filters.genre = genre;
    if (bpm_min) filters.bpm_min = parseInt(bpm_min);
    if (bpm_max) filters.bpm_max = parseInt(bpm_max);
    if (key !== undefined) filters.key = parseInt(key);
    if (library_id) filters.library_id = parseInt(library_id);
    if (is_missing !== undefined) filters.is_missing = is_missing === 'true';
    if (search) filters.search = search;

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order: order.toUpperCase(),
    };

    const result = trackService.searchTracks(filters, pagination);

    res.json({
      success: true,
      data: result.tracks,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    logger.error('Error listing tracks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list tracks',
      message: error.message,
    });
  }
});

/**
 * GET /api/tracks/search
 * Search tracks (same as GET /api/tracks with search parameter)
 */
router.get('/search', validate(schemas.trackQuery, 'query'), async (req, res) => {
  try {
    const { q, page = 1, limit = 50, sort = 'date_added', order = 'DESC' } = req.query;

    const filters = { search: q };
    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order: order.toUpperCase(),
    };

    const result = trackService.searchTracks(filters, pagination);

    res.json({
      success: true,
      data: result.tracks,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    logger.error('Error searching tracks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search tracks',
      message: error.message,
    });
  }
});

/**
 * GET /api/tracks/stats
 * Get track statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = trackService.getTrackStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting track stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get track statistics',
      message: error.message,
    });
  }
});

/**
 * GET /api/tracks/:id/waveform
 * Get waveform data for a track
 *
 * Query Parameters:
 * - zoom: number (0-2, optional) - Specific zoom level to retrieve
 *
 * If zoom parameter is provided, returns waveform for that specific zoom level.
 * If zoom parameter is omitted, returns all available waveforms for the track.
 *
 * Response formats:
 * Single zoom level:
 * {
 *   "success": true,
 *   "data": {
 *     "file_hash": "abc123...",
 *     "zoom_level": 1,
 *     "sample_rate": 44100,
 *     "samples_per_pixel": 512,
 *     "num_pixels": 1800,
 *     "low_freq_amplitude": [...],
 *     "low_freq_intensity": [...],
 *     "mid_freq_amplitude": [...],
 *     "mid_freq_intensity": [...],
 *     "high_freq_amplitude": [...],
 *     "high_freq_intensity": [...]
 *   }
 * }
 *
 * All zoom levels:
 * {
 *   "success": true,
 *   "data": {
 *     "file_hash": "abc123...",
 *     "waveforms": [
 *       { zoom_level: 0, ... },
 *       { zoom_level: 1, ... },
 *       { zoom_level: 2, ... }
 *     ]
 *   }
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track doesn't exist or has no waveform data
 * - 400 Bad Request: Invalid zoom level (must be 0-2)
 * - 500 Internal Server Error: Database error
 */
router.get(
  '/:id/waveform',
  validate(schemas.trackId, 'params'),
  validate(schemas.waveformQuery, 'query'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { zoom } = req.query;

      // Check if track exists
      const track = trackService.getTrackById(id);
      if (!track) {
        return res.status(404).json({
          success: false,
          error: 'Track not found',
          message: `Track with ID ${id} does not exist`,
        });
      }

      // If zoom level specified, return single waveform
      if (zoom !== undefined) {
        const zoomLevel = parseInt(zoom);
        const waveform = waveformService.getWaveform(id, zoomLevel);

        if (!waveform) {
          return res.status(404).json({
            success: false,
            error: 'Waveform not found',
            message: `No waveform data available for track ${id} at zoom level ${zoomLevel}`,
          });
        }

        res.json({
          success: true,
          data: waveform,
        });
      } else {
        // Return all waveforms for this track
        const waveforms = waveformService.getAllWaveforms(id);

        if (!waveforms || waveforms.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Waveform not found',
            message: `No waveform data available for track ${id}`,
          });
        }

        res.json({
          success: true,
          data: {
            file_hash: track.file_hash,
            waveforms: waveforms,
          },
        });
      }
    } catch (error) {
      logger.error(`Error getting waveform for track ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to get waveform',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/tracks/:id/stems/waveform
 * Get stem waveform data for a track
 *
 * Query Parameters:
 * - zoom: (optional) Zoom level (0=overview, 1=normal, 2=detailed)
 *
 * Response contains waveform data for all 4 stems (vocals, drums, bass, other).
 * If zoom parameter is provided, returns waveform for that specific zoom level.
 * If zoom parameter is omitted, returns all available stem waveforms for the track.
 *
 * Each waveform object contains:
 * - zoom_level: 0 (overview), 1 (normal), or 2 (detailed)
 * - sample_rate: Audio sample rate
 * - samples_per_pixel: Number of audio samples per pixel
 * - num_pixels: Total number of pixels in the waveform
 * - vocals_amplitude: Float32 array of vocal stem amplitudes
 * - vocals_intensity: Float32 array of vocal stem intensities
 * - drums_amplitude: Float32 array of drum stem amplitudes
 * - drums_intensity: Float32 array of drum stem intensities
 * - bass_amplitude: Float32 array of bass stem amplitudes
 * - bass_intensity: Float32 array of bass stem intensities
 * - other_amplitude: Float32 array of other stem amplitudes
 * - other_intensity: Float32 array of other stem intensities
 *
 * Success Response:
 * {
 *   "success": true,
 *   "data": {
 *     "zoom_level": 1,
 *     "sample_rate": 44100,
 *     "samples_per_pixel": 512,
 *     "num_pixels": 2048,
 *     "is_stems": true,
 *     "vocals_amplitude": [...],
 *     "vocals_intensity": [...],
 *     ...
 *   }
 * }
 *
 * OR when zoom is omitted:
 * {
 *   "success": true,
 *   "data": {
 *     "waveforms": [...]
 *   }
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track doesn't exist or has no stem waveform data
 * - 500 Internal Server Error: Database or server error
 */
router.get(
  '/:id/stems/waveform',
  validate(schemas.trackId, 'params'),
  validate(schemas.waveformQuery, 'query'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { zoom } = req.query;

      // Check if track exists
      const track = trackService.getTrackById(id);
      if (!track) {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Track with ID ${id} not found`,
        });
      }

      // If zoom level specified, return single stem waveform
      if (zoom !== undefined) {
        const zoomLevel = parseInt(zoom, 10);
        const waveform = waveformService.getStemWaveform(id, zoomLevel);

        if (!waveform) {
          return res.status(404).json({
            success: false,
            error: 'Not Found',
            message: `No stem waveform data available for track ${id} at zoom level ${zoomLevel}`,
          });
        }

        return res.json({
          success: true,
          data: waveform,
        });
      } else {
        // Return all stem waveforms for this track
        const waveforms = waveformService.getAllStemWaveforms(id);

        if (!waveforms || waveforms.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Not Found',
            message: `No stem waveform data available for track ${id}`,
          });
        }

        return res.json({
          success: true,
          data: {
            waveforms: waveforms,
          },
        });
      }
    } catch (error) {
      logger.error(`Error getting stem waveform for track ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to get stem waveform',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/tracks/:id/verify
 * Verify track file exists and is accessible
 */
router.get('/:id/verify', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await fileOpsService.verifyTrackFile(id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Error verifying track ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify track',
      message: error.message,
    });
  }
});

/**
 * POST /api/tracks/:id/mark-missing
 * Mark track as missing
 */
router.post('/:id/mark-missing', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;

    const track = trackService.getTrackById(id);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
      });
    }

    const updatedTrack = trackService.markTrackMissing(id);

    res.json({
      success: true,
      data: updatedTrack,
      message: 'Track marked as missing',
    });
  } catch (error) {
    logger.error(`Error marking track missing ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark track as missing',
      message: error.message,
    });
  }
});

/**
 * POST /api/tracks/:id/mark-found
 * Mark track as found
 */
router.post('/:id/mark-found', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;

    const track = trackService.getTrackById(id);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
      });
    }

    const updatedTrack = trackService.markTrackFound(id);

    res.json({
      success: true,
      data: updatedTrack,
      message: 'Track marked as found',
    });
  } catch (error) {
    logger.error(`Error marking track found ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark track as found',
      message: error.message,
    });
  }
});

/**
 * POST /api/tracks/:id/move
 * Move track file to new location
 *
 * Body:
 * {
 *   "destination_path": "/path/to/new/location/file.mp3",
 *   "library_directory_id": 2 (optional)
 * }
 */
router.post(
  '/:id/move',
  validate(schemas.trackId, 'params'),
  validate(schemas.fileMove, 'body'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { destination_path, library_directory_id } = req.body;

      const updatedTrack = await fileOpsService.moveTrack(
        id,
        destination_path,
        library_directory_id ? parseInt(library_directory_id) : null
      );

      res.json({
        success: true,
        data: updatedTrack,
        message: 'Track moved successfully',
      });
    } catch (error) {
      logger.error(`Error moving track ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to move track',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/tracks/:id/rename
 * Rename track file
 *
 * Body:
 * {
 *   "new_name": "new-filename.mp3"
 * }
 */
router.post(
  '/:id/rename',
  validate(schemas.trackId, 'params'),
  validate(schemas.fileRename, 'body'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { new_name } = req.body;

      const updatedTrack = await fileOpsService.renameTrack(id, new_name);

      res.json({
        success: true,
        data: updatedTrack,
        message: 'Track renamed successfully',
      });
    } catch (error) {
      logger.error(`Error renaming track ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to rename track',
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/tracks/:id/file
 * Delete track file from disk
 * Requires confirmation in body: { "confirm": true }
 */
router.delete(
  '/:id/file',
  validate(schemas.trackId, 'params'),
  validate(schemas.fileDelete, 'body'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { confirm } = req.body;

      const result = await fileOpsService.deleteTrack(id, confirm, {
        deleteFile: true,
        removeFromPlaylists: true,
      });

      res.json({
        success: true,
        data: result,
        message: 'Track deleted successfully',
      });
    } catch (error) {
      logger.error(`Error deleting track file ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete track',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/tracks/:id/beats
 * Get beats data for a track
 */
router.get('/:id/beats', validate(schemas.trackId, 'params'), async (req, res) => {
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

    // Get beats data
    const beats = trackService.getTrackBeats(id);

    if (!beats) {
      return res.status(404).json({
        success: false,
        error: 'Beats data not found',
        message: `No beats data available for track ${id}`,
      });
    }

    res.json({
      success: true,
      data: {
        track_id: id,
        beats: beats,
        count: beats.length,
      },
    });
  } catch (error) {
    logger.error(`Error getting beats for track ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get beats data',
      message: error.message,
    });
  }
});

/**
 * GET /api/tracks/:id/downbeats
 * Get downbeats data for a track
 */
router.get('/:id/downbeats', validate(schemas.trackId, 'params'), async (req, res) => {
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

    // Get downbeats data
    const downbeats = trackService.getTrackDownbeats(id);

    if (!downbeats) {
      return res.status(404).json({
        success: false,
        error: 'Downbeats data not found',
        message: `No downbeats data available for track ${id}`,
      });
    }

    res.json({
      success: true,
      data: {
        track_id: id,
        downbeats: downbeats,
        count: downbeats.length,
      },
    });
  } catch (error) {
    logger.error(`Error getting downbeats for track ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get downbeats data',
      message: error.message,
    });
  }
});

/**
 * POST /api/tracks/:id/first-beat-offset
 * Update first beat offset for a track
 *
 * Body:
 * {
 *   "first_beat_offset": 0.123 (number, seconds)
 * }
 *
 * This endpoint updates the first beat offset in the database and notifies
 * the audio engine via WebSocket so it can update its internal state.
 *
 * Response: 200 OK
 * {
 *   "success": true,
 *   "data": {
 *     "id": "track-uuid",
 *     "first_beat_offset": 0.123,
 *     ...other track fields
 *   },
 *   "message": "First beat offset updated"
 * }
 *
 * Error Responses:
 * - 404 Not Found: Track doesn't exist
 * - 400 Bad Request: Invalid first_beat_offset value
 * - 500 Internal Server Error: Database error
 */
router.post(
  '/:id/first-beat-offset',
  validate(schemas.trackId, 'params'),
  validate(schemas.firstBeatOffsetUpdate, 'body'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { first_beat_offset } = req.body;

      // Check if track exists
      const track = trackService.getTrackById(id);
      if (!track) {
        return res.status(404).json({
          success: false,
          error: 'Track not found',
          message: `Track with ID ${id} does not exist`,
        });
      }

      // Update the first beat offset in the database
      const updatedTrack = trackService.updateTrackMetadata(id, {
        first_beat_offset: first_beat_offset,
      });

      // Notify audio engine via WebSocket
      try {
        const audioServerClientService = (await import('../services/audioServerClient.service.js'))
          .default;

        if (audioServerClientService.isConnected()) {
          audioServerClientService.send({
            command: 'updateFirstBeatOffset',
            trackId: id,
            firstBeatOffset: first_beat_offset,
          });
          logger.info(
            `✓ Notified audio engine of first beat offset update for track ${id}: ${first_beat_offset}s`
          );
        } else {
          logger.warn(
            `Audio engine not connected, skipping notification for track ${id} first beat offset update`
          );
        }
      } catch (error) {
        logger.error(
          `Error notifying audio engine of first beat offset update for track ${id}:`,
          error
        );
        // Don't fail the request if notification fails - the DB update succeeded
      }

      res.json({
        success: true,
        data: updatedTrack,
        message: 'First beat offset updated',
      });
    } catch (error) {
      logger.error(`Error updating first beat offset for track ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to update first beat offset',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/tracks/:id
 * Get single track by ID
 */
router.get('/:id', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;
    const track = trackService.getTrackById(id);

    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        message: `Track with ID ${id} does not exist`,
      });
    }

    res.json({
      success: true,
      data: track,
    });
  } catch (error) {
    logger.error(`Error getting track ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get track',
      message: error.message,
    });
  }
});

/**
 * POST /api/tracks
 * Add new track manually
 */
router.post('/', validate(schemas.trackCreate, 'body'), async (req, res) => {
  try {
    const trackData = req.body;

    // Basic validation - file must exist
    const fs = await import('fs/promises');
    try {
      await fs.access(trackData.file_path);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file path',
        message: 'The specified file does not exist',
      });
    }

    const track = trackService.upsertTrack(trackData);

    res.status(201).json({
      success: true,
      data: track,
      message: 'Track created successfully',
    });
  } catch (error) {
    logger.error('Error creating track:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create track',
      message: error.message,
    });
  }
});

/**
 * PUT /api/tracks/:id
 * Update track metadata
 */
router.put(
  '/:id',
  validate(schemas.trackId, 'params'),
  validate(schemas.trackUpdate, 'body'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if track exists
      const existingTrack = trackService.getTrackById(id);
      if (!existingTrack) {
        return res.status(404).json({
          success: false,
          error: 'Track not found',
          message: `Track with ID ${id} does not exist`,
        });
      }

      const updatedTrack = trackService.updateTrackMetadata(id, updates);

      res.json({
        success: true,
        data: updatedTrack,
        message: 'Track updated successfully',
      });
    } catch (error) {
      logger.error(`Error updating track ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to update track',
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/tracks/:id
 * Delete track from database (not from disk)
 */
router.delete('/:id', validate(schemas.trackId, 'params'), async (req, res) => {
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

    const deleted = trackService.deleteTrack(id);

    if (deleted) {
      res.json({
        success: true,
        message: 'Track deleted from database',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete track',
      });
    }
  } catch (error) {
    logger.error(`Error deleting track ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete track',
      message: error.message,
    });
  }
});

export default router;
