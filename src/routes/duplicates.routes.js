import express from 'express';
import * as duplicateService from '../services/duplicateDetector.service.js';
import logger from '../utils/logger.js';
import { validate, schemas } from '../utils/validators.js';

const router = express.Router();

/**
 * GET /api/duplicates
 * List all duplicate groups with pagination
 */
router.get('/', validate(schemas.pagination, 'query'), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const result = duplicateService.getAllDuplicateGroups({
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      data: result.groups,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    logger.error('Error listing duplicate groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list duplicate groups',
      message: error.message,
    });
  }
});

/**
 * GET /api/duplicates/stats
 * Get duplicate statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = duplicateService.getDuplicateStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting duplicate stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get duplicate statistics',
      message: error.message,
    });
  }
});

/**
 * GET /api/duplicates/:id
 * Get duplicate group with all tracks
 */
router.get('/:id', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const { id } = req.params;
    const group = duplicateService.getDuplicateGroupById(parseInt(id));

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Duplicate group not found',
        message: `Duplicate group with ID ${id} does not exist`,
      });
    }

    res.json({
      success: true,
      data: group,
    });
  } catch (error) {
    logger.error(`Error getting duplicate group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get duplicate group',
      message: error.message,
    });
  }
});

/**
 * POST /api/duplicates/:id/resolve
 * Resolve duplicates by selecting canonical track
 *
 * Body:
 * {
 *   "canonicalTrackId": number,
 *   "deleteFiles": boolean (optional, default: false),
 *   "keepMetadata": boolean (optional, default: true),
 *   "updatePlaylists": boolean (optional, default: true)
 * }
 */
router.post('/:id/resolve', validate(schemas.id, 'params'), validate(schemas.resolveDuplicates, 'body'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      canonicalTrackId,
      deleteFiles = false,
      keepMetadata = true,
      updatePlaylists = true,
    } = req.body;

    // Validate canonical track ID
    if (!canonicalTrackId || typeof canonicalTrackId !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'canonicalTrackId is required and must be a number',
      });
    }

    const result = duplicateService.resolveDuplicates(parseInt(id), canonicalTrackId, {
      deleteFiles,
      keepMetadata,
      updatePlaylists,
    });

    res.json({
      success: true,
      data: result,
      message: `Resolved duplicate group, kept track ${canonicalTrackId}`,
    });
  } catch (error) {
    logger.error(`Error resolving duplicate group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve duplicates',
      message: error.message,
    });
  }
});

/**
 * POST /api/duplicates/scan
 * Scan entire library for duplicates
 */
router.post('/scan', async (req, res) => {
  try {
    logger.info('Starting duplicate scan...');

    const result = duplicateService.scanLibraryForDuplicates();

    res.json({
      success: true,
      data: result,
      message: `Scan complete: ${result.groupsCreated} duplicate groups found`,
    });
  } catch (error) {
    logger.error('Error scanning for duplicates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan for duplicates',
      message: error.message,
    });
  }
});

export default router;
