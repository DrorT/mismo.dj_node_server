import express from 'express';
import * as libraryDirService from '../services/libraryDirectory.service.js';
import * as directoryBrowserService from '../services/directoryBrowser.service.js';
import * as missingMediaService from '../services/missingMediaHandler.service.js';
import { validate, schemas } from '../utils/validators.js';
import logger from '../utils/logger.js';
import Joi from 'joi';

const router = express.Router();

/**
 * GET /api/library/directories
 * Get all library directories
 */
router.get(
  '/',
  validate(
    Joi.object({
      is_active: Joi.boolean(),
      is_available: Joi.boolean(),
    }),
    'query'
  ),
  async (req, res) => {
    try {
      const directories = libraryDirService.getAllDirectories(req.query);

      res.json({
        success: true,
        count: directories.length,
        data: directories,
      });
    } catch (error) {
      logger.error('Error getting library directories:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve library directories',
      });
    }
  }
);

/**
 * GET /api/library/directories/:id
 * Get library directory by ID
 */
router.get('/:id', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const id = req.validated?.params?.id || parseInt(req.params.id, 10);
    const directory = libraryDirService.getDirectoryById(id);

    if (!directory) {
      return res.status(404).json({
        success: false,
        error: 'Library directory not found',
      });
    }

    res.json({
      success: true,
      data: directory,
    });
  } catch (error) {
    logger.error('Error getting library directory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve library directory',
    });
  }
});

/**
 * POST /api/library/directories
 * Create a new library directory
 */
router.post('/', validate(schemas.libraryDirectory), async (req, res) => {
  try {
    const directory = libraryDirService.createDirectory(req.body);

    res.status(201).json({
      success: true,
      data: directory,
      message: 'Library directory created successfully',
    });
  } catch (error) {
    logger.error('Error creating library directory:', error);

    // Handle specific error cases
    if (error.message.includes('does not exist')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create library directory',
    });
  }
});

/**
 * PUT /api/library/directories/:id
 * Update library directory
 */
router.put('/:id', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const id = req.validated?.params?.id || parseInt(req.params.id, 10);
    const directory = libraryDirService.updateDirectory(id, req.body);

    res.json({
      success: true,
      data: directory,
      message: 'Library directory updated successfully',
    });
  } catch (error) {
    logger.error('Error updating library directory:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update library directory',
    });
  }
});

/**
 * DELETE /api/library/directories/:id
 * Delete library directory
 */
router.delete(
  '/:id',
  validate(schemas.id, 'params'),
  validate(
    Joi.object({
      delete_tracks: Joi.boolean().default(false),
    }),
    'query'
  ),
  async (req, res) => {
    try {
      const id = req.validated?.params?.id || parseInt(req.params.id, 10);
      const { delete_tracks } = req.query;
      const deleted = libraryDirService.deleteDirectory(id, delete_tracks);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Library directory not found',
        });
      }

      res.json({
        success: true,
        message: 'Library directory deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting library directory:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete library directory',
      });
    }
  }
);

/**
 * POST /api/library/directories/:id/check-availability
 * Check if directory path is available
 */
router.post('/:id/check-availability', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const id = req.validated?.params?.id || parseInt(req.params.id, 10);
    const directory = libraryDirService.checkAvailability(id);

    res.json({
      success: true,
      data: directory,
    });
  } catch (error) {
    logger.error('Error checking directory availability:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to check directory availability',
    });
  }
});

/**
 * POST /api/library/directories/check-all-availability
 * Check availability for all directories
 */
router.post('/check-all-availability', async (req, res) => {
  try {
    const directories = libraryDirService.checkAllAvailability();

    res.json({
      success: true,
      count: directories.length,
      data: directories,
    });
  } catch (error) {
    logger.error('Error checking all directory availability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check directory availability',
    });
  }
});

/**
 * GET /api/library/directories/:id/browse
 * Browse subdirectories and tracks within a library directory
 *
 * Query params:
 *   path - Relative path within library (e.g., "Artist/Album")
 */
router.get(
  '/:id/browse',
  validate(schemas.id, 'params'),
  validate(
    Joi.object({
      path: Joi.string().allow('').default(''),
    }),
    'query'
  ),
  async (req, res) => {
    try {
      const id = req.validated?.params?.id || parseInt(req.params.id, 10);
      const relativePath = req.query.path || '';

      const contents = await directoryBrowserService.browseDirectory(id, relativePath);

      res.json({
        success: true,
        data: contents,
      });
    } catch (error) {
      logger.error(`Error browsing directory ${req.params.id}:`, error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes('traversal')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid path',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to browse directory',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/library/directories/:id/cleanup
 * Cleanup missing tracks from a library directory
 *
 * Body:
 * {
 *   "remove_missing_older_than_days": 30,
 *   "keep_playlists_intact": true,
 *   "backup_metadata": true
 * }
 */
router.post(
  '/:id/cleanup',
  validate(schemas.id, 'params'),
  validate(schemas.cleanup, 'body'),
  async (req, res) => {
    try {
      const id = req.validated?.params?.id || parseInt(req.params.id, 10);

      const result = await missingMediaService.cleanupMissingTracks(id, req.body);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(`Error cleaning up missing tracks for directory ${req.params.id}:`, error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to cleanup missing tracks',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/library/directories/:id/restore
 * Restore tracks when media reconnects
 */
router.post('/:id/restore', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const id = req.validated?.params?.id || parseInt(req.params.id, 10);

    const result = await missingMediaService.restoreTracks(id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Error restoring tracks for directory ${req.params.id}:`, error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to restore tracks',
      message: error.message,
    });
  }
});

/**
 * GET /api/library/directories/:id/missing
 * Get missing tracks for a library directory
 */
router.get(
  '/:id/missing',
  validate(schemas.id, 'params'),
  validate(schemas.pagination, 'query'),
  async (req, res) => {
    try {
      const id = req.validated?.params?.id || parseInt(req.params.id, 10);
      const { page = 1, limit = 50 } = req.query;

      const result = missingMediaService.getMissingTracks(id, {
        page: parseInt(page),
        limit: parseInt(limit),
      });

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
      logger.error(`Error getting missing tracks for directory ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to get missing tracks',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/library/directories/:id/missing/stats
 * Get missing track statistics for a library directory
 */
router.get('/:id/missing/stats', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const id = req.validated?.params?.id || parseInt(req.params.id, 10);

    const stats = missingMediaService.getMissingTrackStats(id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(`Error getting missing track stats for directory ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get missing track statistics',
      message: error.message,
    });
  }
});

export default router;
