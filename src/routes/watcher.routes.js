import express from 'express';
import * as watcherService from '../services/watcher.service.js';
import { validate, schemas } from '../utils/validators.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/watcher/status
 * Get status of all active file watchers
 */
router.get('/status', (req, res) => {
  try {
    const status = watcherService.getWatcherStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error getting watcher status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get watcher status',
    });
  }
});

/**
 * POST /api/watcher/start/:id
 * Start watching a specific library directory
 */
router.post('/start/:id', validate(schemas.id, 'params'), (req, res) => {
  try {
    const id = req.validated?.params?.id || parseInt(req.params.id, 10);

    // Check if already watching
    if (watcherService.isWatching(id)) {
      return res.status(400).json({
        success: false,
        error: `Directory ${id} is already being watched`,
      });
    }

    watcherService.watchDirectory(id);

    res.json({
      success: true,
      message: `Started watching directory ${id}`,
    });
  } catch (error) {
    logger.error('Error starting watcher:', error);

    if (error.message.includes('not found') || error.message.includes('not active')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to start watcher',
    });
  }
});

/**
 * POST /api/watcher/stop/:id
 * Stop watching a specific library directory
 */
router.post('/stop/:id', validate(schemas.id, 'params'), async (req, res) => {
  try {
    const id = req.validated?.params?.id || parseInt(req.params.id, 10);

    const stopped = await watcherService.unwatchDirectory(id);

    if (!stopped) {
      return res.status(404).json({
        success: false,
        error: `Directory ${id} is not being watched`,
      });
    }

    res.json({
      success: true,
      message: `Stopped watching directory ${id}`,
    });
  } catch (error) {
    logger.error('Error stopping watcher:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop watcher',
    });
  }
});

/**
 * POST /api/watcher/start-all
 * Start watching all active library directories
 */
router.post('/start-all', (req, res) => {
  try {
    const count = watcherService.watchAllDirectories();

    res.json({
      success: true,
      message: `Started watching ${count} directories`,
      count,
    });
  } catch (error) {
    logger.error('Error starting all watchers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start watchers',
    });
  }
});

/**
 * POST /api/watcher/stop-all
 * Stop watching all library directories
 */
router.post('/stop-all', async (req, res) => {
  try {
    const count = await watcherService.unwatchAllDirectories();

    res.json({
      success: true,
      message: `Stopped watching ${count} directories`,
      count,
    });
  } catch (error) {
    logger.error('Error stopping all watchers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop watchers',
    });
  }
});

export default router;
