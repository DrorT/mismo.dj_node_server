import express from 'express';
import * as scannerService from '../services/scanner.service.js';
import { validate, schemas } from '../utils/validators.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/scan/library/:id
 * Start scanning a library directory
 */
router.post(
  '/library/:id',
  validate(schemas.id, 'params'),
  validate(schemas.scanRequest),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { strategy, priority } = req.body;

      // Check if already scanning
      const status = scannerService.getScanStatus(id);
      if (status) {
        return res.status(409).json({
          success: false,
          error: 'Scan already in progress',
          data: status,
        });
      }

      // Start scan asynchronously
      scannerService
        .scanLibraryDirectory(id, {
          strategy,
          priority,
          onProgress: progress => {
            // TODO: Emit via WebSocket
            logger.debug('Scan progress:', progress);
          },
        })
        .catch(error => {
          logger.error('Scan error:', error);
        });

      res.status(202).json({
        success: true,
        message: 'Scan started',
        data: {
          libraryDirectoryId: id,
          strategy,
        },
      });
    } catch (error) {
      logger.error('Error starting scan:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes('not active') || error.message.includes('not available')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to start scan',
      });
    }
  }
);

/**
 * GET /api/scan/library/:id/status
 * Get scan status for a library directory
 */
router.get('/library/:id/status', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const { id } = req.params;
    const status = scannerService.getScanStatus(id);

    if (!status) {
      return res.json({
        success: true,
        data: {
          scanning: false,
        },
      });
    }

    res.json({
      success: true,
      data: {
        scanning: true,
        ...status,
      },
    });
  } catch (error) {
    logger.error('Error getting scan status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve scan status',
    });
  }
});

/**
 * GET /api/scan/active
 * Get all active scans
 */
router.get('/active', async (req, res) => {
  try {
    const scans = scannerService.getAllActiveScans();

    res.json({
      success: true,
      count: scans.length,
      data: scans,
    });
  } catch (error) {
    logger.error('Error getting active scans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active scans',
    });
  }
});

/**
 * DELETE /api/scan/library/:id
 * Cancel an active scan
 */
router.delete('/library/:id', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const { id } = req.params;
    const cancelled = scannerService.cancelScan(id);

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: 'No active scan found',
      });
    }

    res.json({
      success: true,
      message: 'Scan cancelled',
    });
  } catch (error) {
    logger.error('Error cancelling scan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel scan',
    });
  }
});

export default router;
