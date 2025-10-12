import express from 'express';
import analysisServerService from '../services/analysisServer.service.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/analysis/status
 * Get analysis server status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await analysisServerService.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error getting analysis server status:', error);
    res.status(500).json({
      error: 'Failed to get analysis server status',
      message: error.message,
    });
  }
});

/**
 * POST /api/analysis/start
 * Start the analysis server
 */
router.post('/start', async (req, res) => {
  try {
    logger.info('Manual start request for analysis server');
    const started = await analysisServerService.start();

    if (started) {
      res.json({
        message: 'Analysis server started successfully',
        status: await analysisServerService.getStatus(),
      });
    } else {
      res.status(500).json({
        error: 'Failed to start analysis server',
        message: 'Server did not become ready within timeout',
      });
    }
  } catch (error) {
    logger.error('Error starting analysis server:', error);
    res.status(500).json({
      error: 'Failed to start analysis server',
      message: error.message,
    });
  }
});

/**
 * POST /api/analysis/stop
 * Stop the analysis server
 */
router.post('/stop', async (req, res) => {
  try {
    logger.info('Manual stop request for analysis server');
    await analysisServerService.stop();
    res.json({
      message: 'Analysis server stopped successfully',
    });
  } catch (error) {
    logger.error('Error stopping analysis server:', error);
    res.status(500).json({
      error: 'Failed to stop analysis server',
      message: error.message,
    });
  }
});

/**
 * POST /api/analysis/restart
 * Restart the analysis server
 */
router.post('/restart', async (req, res) => {
  try {
    logger.info('Manual restart request for analysis server');
    const started = await analysisServerService.restart();

    if (started) {
      res.json({
        message: 'Analysis server restarted successfully',
        status: await analysisServerService.getStatus(),
      });
    } else {
      res.status(500).json({
        error: 'Failed to restart analysis server',
        message: 'Server did not become ready within timeout',
      });
    }
  } catch (error) {
    logger.error('Error restarting analysis server:', error);
    res.status(500).json({
      error: 'Failed to restart analysis server',
      message: error.message,
    });
  }
});

/**
 * GET /api/analysis/health
 * Check if analysis server is healthy
 */
router.get('/health', async (req, res) => {
  try {
    const isHealthy = await analysisServerService.checkHealth();

    if (isHealthy) {
      res.json({
        status: 'healthy',
        message: 'Analysis server is responding',
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        message: 'Analysis server is not responding',
      });
    }
  } catch (error) {
    logger.error('Error checking analysis server health:', error);
    res.status(500).json({
      error: 'Failed to check analysis server health',
      message: error.message,
    });
  }
});

export default router;
