import express from 'express';
import analysisServerService from '../services/analysisServer.service.js';
import analysisQueueService from '../services/analysisQueue.service.js';
import pythonClientService from '../services/pythonClient.service.js';
import * as analysisJobService from '../services/analysisJob.service.js';
import * as analysisCallbackService from '../services/analysisCallback.service.js';
import * as waveformService from '../services/waveform.service.js';
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

// ============================================================================
// Analysis Request Endpoints
// ============================================================================

/**
 * POST /api/analysis/request
 * Request analysis for a track
 *
 * Body:
 * {
 *   track_id: string (UUID),
 *   options?: {
 *     basic_features?: boolean,
 *     characteristics?: boolean,
 *     genre?: boolean,
 *     stems?: boolean,
 *     segments?: boolean,
 *     transitions?: boolean
 *   },
 *   priority?: 'low' | 'normal' | 'high',
 *   force?: boolean  // Force re-analysis even if already completed
 * }
 */
router.post('/request', async (req, res) => {
  try {
    const { track_id, options = {}, priority = 'normal', force = false } = req.body;

    // Validate track_id
    if (!track_id || typeof track_id !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'track_id must be a string (UUID)',
      });
    }

    // Validate priority
    if (!['low', 'normal', 'high'].includes(priority)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'priority must be low, normal, or high',
      });
    }

    logger.info(`Analysis request for track ${track_id}`, { options, priority, force });

    // Queue the job
    const job = await analysisQueueService.requestAnalysis(
      track_id,
      options,
      priority,
      null,
      force
    );

    res.json({
      message: 'Analysis requested successfully',
      job: {
        job_id: job.job_id,
        track_id: job.track_id,
        status: job.status,
        priority: job.priority,
        progress_percent: job.progress_percent,
        created_at: job.created_at,
      },
    });
  } catch (error) {
    logger.error('Error requesting analysis:', error);
    res.status(500).json({
      error: 'Failed to request analysis',
      message: error.message,
    });
  }
});

/**
 * POST /api/analysis/reanalyze
 * Bulk re-analyze tracks (forces re-analysis even if already completed)
 *
 * Body:
 * {
 *   track_ids?: Array<string>,  // Specific track IDs to re-analyze
 *   library_id?: string,         // Or all tracks in a library
 *   all?: boolean,               // Or all tracks in database
 *   options?: {
 *     basic_features?: boolean,  // Default: true
 *     characteristics?: boolean  // Default: false
 *   },
 *   priority?: 'low' | 'normal' | 'high'
 * }
 */
router.post('/reanalyze', async (req, res) => {
  try {
    const { track_ids, library_id, all = false, options, priority = 'normal' } = req.body;
    const trackService = await import('../services/track.service.js');

    // Determine which tracks to re-analyze
    let trackIds = [];

    if (track_ids && Array.isArray(track_ids)) {
      trackIds = track_ids;
    } else if (library_id) {
      const libraryTracks = trackService.getTracksByLibrary(library_id);
      trackIds = libraryTracks.map(t => t.id);
    } else if (all) {
      const allTracks = trackService.searchTracks({}, { page: 1, limit: 999999 });
      trackIds = allTracks.tracks.map(t => t.id);
    } else {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Must provide track_ids, library_id, or all=true',
      });
    }

    if (trackIds.length === 0) {
      return res.status(400).json({
        error: 'No tracks found',
        message: 'No tracks match the specified criteria',
      });
    }

    logger.info(`Bulk re-analysis requested for ${trackIds.length} tracks`);

    // Default options: only basic_features for efficiency
    const analysisOptions = {
      basic_features: options?.basic_features !== false,
      characteristics: options?.characteristics === true,
    };

    // Queue re-analysis
    const results = await analysisQueueService.bulkReanalyze(trackIds, analysisOptions, priority);

    res.json({
      message: `Re-analysis queued for ${results.queued} tracks`,
      summary: {
        total_requested: trackIds.length,
        queued: results.queued,
        failed: results.failed,
        errors: results.errors,
      },
    });
  } catch (error) {
    logger.error('Error bulk re-analyzing tracks:', error);
    res.status(500).json({
      error: 'Failed to queue bulk re-analysis',
      message: error.message,
    });
  }
});

/**
 * GET /api/analysis/jobs/:jobId
 * Get status of an analysis job
 */
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = analysisJobService.getJobById(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No analysis job found with ID: ${jobId}`,
      });
    }

    res.json({ job });
  } catch (error) {
    logger.error(`Error getting job status for ${req.params.jobId}:`, error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/analysis/jobs/:jobId
 * Cancel an analysis job
 */
router.delete('/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const cancelled = await analysisQueueService.cancelJob(jobId);

    if (!cancelled) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No analysis job found with ID: ${jobId}`,
      });
    }

    res.json({
      message: 'Job cancelled successfully',
      job_id: jobId,
    });
  } catch (error) {
    logger.error(`Error cancelling job ${req.params.jobId}:`, error);
    res.status(500).json({
      error: 'Failed to cancel job',
      message: error.message,
    });
  }
});

/**
 * GET /api/analysis/queue
 * Get analysis queue status
 */
router.get('/queue', async (req, res) => {
  try {
    const status = analysisQueueService.getStatus();
    const stats = analysisJobService.getQueueStats();

    res.json({
      queue: status,
      stats,
    });
  } catch (error) {
    logger.error('Error getting queue status:', error);
    res.status(500).json({
      error: 'Failed to get queue status',
      message: error.message,
    });
  }
});

// ============================================================================
// Callback Endpoint (called by Python server)
// ============================================================================

/**
 * POST /api/analysis/callback
 * Receive analysis results from Python server
 *
 * Body:
 * {
 *   job_id: string,
 *   stage: 'basic_features' | 'characteristics' | 'genre' | 'stems' | 'segments' | 'transitions' | 'job_completed' | 'job_failed' | 'error',
 *   data: Object
 * }
 */
router.post('/callback', async (req, res) => {
  try {
    const { job_id, stage, data, status } = req.body;

    // Validate request
    if (!job_id || !stage) {
      return res.status(400).json({
        error: 'Invalid callback',
        message: 'job_id and stage are required',
      });
    }

    // Debug: Log full request body with multiple approaches
    // logger.info('=== CALLBACK DEBUG START ===');
    // logger.info(`Body keys: ${Object.keys(req.body).join(', ')}`);
    // logger.info(`Body type: ${typeof req.body}`);
    // logger.info(`Body constructor: ${req.body?.constructor?.name}`);
    // logger.info(`Body stringify: ${JSON.stringify(req.body)}`);
    // logger.info(`Data keys: ${data ? Object.keys(data).join(', ') : 'no data'}`);
    // logger.info(`Data type: ${typeof data}`);
    // if (data) {
    //   logger.info(`Data stringify: ${JSON.stringify(data)}`);
    // }
    // logger.info('=== CALLBACK DEBUG END ===');
    logger.info(`Received callback for job ${job_id}, stage: ${stage}, status: ${status}`);

    // Route to appropriate handler
    switch (stage) {
      case 'basic_features':
        await analysisCallbackService.handleBasicFeatures(job_id, data);
        break;

      case 'characteristics':
        await analysisCallbackService.handleCharacteristics(job_id, data);
        break;

      case 'genre':
        await analysisCallbackService.handleGenre(job_id, data);
        break;

      case 'stems':
        await analysisCallbackService.handleStems(job_id, data);
        break;

      case 'segments':
        await analysisCallbackService.handleSegments(job_id, data);
        break;

      case 'transitions':
        await analysisCallbackService.handleTransitions(job_id, data);
        break;

      case 'job_completed':
        await analysisCallbackService.handleJobCompleted(job_id, data);
        break;

      case 'job_failed':
        await analysisCallbackService.handleAnalysisError(job_id, data?.error || 'Job failed');
        break;

      case 'error':
        await analysisCallbackService.handleAnalysisError(job_id, data?.error || 'Unknown error');
        break;

      default:
        logger.warn(`Unknown callback stage: ${stage}`);
        return res.status(400).json({
          error: 'Invalid callback',
          message: `Unknown stage: ${stage}`,
        });
    }

    res.json({
      message: 'Callback processed successfully',
      job_id,
      stage,
    });
  } catch (error) {
    logger.error('Error processing callback:', error);
    res.status(500).json({
      error: 'Failed to process callback',
      message: error.message,
    });
  }
});

// ============================================================================
// Waveform Endpoints
// ============================================================================

/**
 * GET /api/analysis/waveforms/:trackId
 * Get all waveforms for a track
 */
router.get('/waveforms/:trackId', async (req, res) => {
  try {
    const trackId = req.params.trackId;

    if (!trackId || trackId.trim() === '') {
      return res.status(400).json({
        error: 'Invalid track ID',
        message: 'Track ID is required',
      });
    }

    const waveforms = waveformService.getAllWaveforms(trackId);

    res.json({
      track_id: trackId,
      waveforms,
    });
  } catch (error) {
    logger.error(`Error getting waveforms for track ${req.params.trackId}:`, error);
    res.status(500).json({
      error: 'Failed to get waveforms',
      message: error.message,
    });
  }
});

/**
 * GET /api/analysis/waveforms/:trackId/:zoomLevel
 * Get waveform for a track at a specific zoom level
 */
router.get('/waveforms/:trackId/:zoomLevel', async (req, res) => {
  try {
    const trackId = req.params.trackId;
    const zoomLevel = parseInt(req.params.zoomLevel);

    if (!trackId || trackId.trim() === '') {
      return res.status(400).json({
        error: 'Invalid track ID',
        message: 'Track ID is required',
      });
    }

    if (isNaN(zoomLevel)) {
      return res.status(400).json({
        error: 'Invalid zoom level',
        message: 'Zoom level must be a number',
      });
    }

    const waveform = waveformService.getWaveform(trackId, zoomLevel);

    if (!waveform) {
      return res.status(404).json({
        error: 'Waveform not found',
        message: `No waveform found for track ${trackId} at zoom level ${zoomLevel}`,
      });
    }

    res.json({ waveform });
  } catch (error) {
    logger.error(`Error getting waveform for track ${req.params.trackId}:`, error);
    res.status(500).json({
      error: 'Failed to get waveform',
      message: error.message,
    });
  }
});

export default router;
