import express from 'express';
import * as trackService from '../services/track.service.js';
import * as fileOpsService from '../services/fileOperations.service.js';
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
    const {
      q,
      page = 1,
      limit = 50,
      sort = 'date_added',
      order = 'DESC',
    } = req.query;

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
 * GET /api/tracks/:id
 * Get single track by ID
 */
router.get('/:id', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;
    const track = trackService.getTrackById(parseInt(id));

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
router.put('/:id', validate(schemas.trackId, 'params'), validate(schemas.trackUpdate, 'body'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if track exists
    const existingTrack = trackService.getTrackById(parseInt(id));
    if (!existingTrack) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        message: `Track with ID ${id} does not exist`,
      });
    }

    const updatedTrack = trackService.updateTrackMetadata(parseInt(id), updates);

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
});

/**
 * DELETE /api/tracks/:id
 * Delete track from database (not from disk)
 */
router.delete('/:id', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if track exists
    const track = trackService.getTrackById(parseInt(id));
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        message: `Track with ID ${id} does not exist`,
      });
    }

    const deleted = trackService.deleteTrack(parseInt(id));

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

/**
 * POST /api/tracks/:id/mark-missing
 * Mark track as missing
 */
router.post('/:id/mark-missing', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;

    const track = trackService.getTrackById(parseInt(id));
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
      });
    }

    const updatedTrack = trackService.markTrackMissing(parseInt(id));

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

    const track = trackService.getTrackById(parseInt(id));
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
      });
    }

    const updatedTrack = trackService.markTrackFound(parseInt(id));

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
router.post('/:id/move', validate(schemas.trackId, 'params'), validate(schemas.fileMove, 'body'), async (req, res) => {
  try {
    const { id } = req.params;
    const { destination_path, library_directory_id } = req.body;

    const updatedTrack = await fileOpsService.moveTrack(
      parseInt(id),
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
});

/**
 * POST /api/tracks/:id/rename
 * Rename track file
 *
 * Body:
 * {
 *   "new_name": "new-filename.mp3"
 * }
 */
router.post('/:id/rename', validate(schemas.trackId, 'params'), validate(schemas.fileRename, 'body'), async (req, res) => {
  try {
    const { id } = req.params;
    const { new_name } = req.body;

    const updatedTrack = await fileOpsService.renameTrack(parseInt(id), new_name);

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
});

/**
 * DELETE /api/tracks/:id/file
 * Delete track file from disk
 * Requires confirmation in body: { "confirm": true }
 */
router.delete('/:id/file', validate(schemas.trackId, 'params'), validate(schemas.fileDelete, 'body'), async (req, res) => {
  try {
    const { id } = req.params;
    const { confirm } = req.body;

    const result = await fileOpsService.deleteTrack(parseInt(id), confirm, {
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
});

/**
 * GET /api/tracks/:id/verify
 * Verify track file exists and is accessible
 */
router.get('/:id/verify', validate(schemas.trackId, 'params'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await fileOpsService.verifyTrackFile(parseInt(id));

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

export default router;
