import EventEmitter from 'events';
import logger from '../utils/logger.js';
import pythonClientService from './pythonClient.service.js';
import analysisServerService from './analysisServer.service.js';
import * as analysisJobService from './analysisJob.service.js';
import { getTrackById } from './track.service.js';

/**
 * Analysis Queue Service
 * Manages the queue of analysis jobs with priority, concurrency control, and retry logic
 *
 * Features:
 * - Priority queue (high > normal > low)
 * - Configurable concurrent job limit
 * - Exponential backoff retry
 * - Resume interrupted jobs on startup
 * - Event-driven architecture
 */

class AnalysisQueueService extends EventEmitter {
  constructor() {
    super();
    this.maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_ANALYSIS || '2');
    this.retryDelayMs = parseInt(process.env.ANALYSIS_RETRY_DELAY_MS || '5000');
    this.isProcessing = false;
    this.processingJobs = new Set(); // Track currently processing job IDs
  }

  /**
   * Initialize the queue service
   * Resumes any interrupted jobs
   */
  async initialize() {
    logger.info('Initializing analysis queue service...', {
      maxConcurrentJobs: this.maxConcurrentJobs,
    });

    try {
      // Check for jobs that were processing when server shut down
      const interruptedJobs = analysisJobService.getProcessingJobs();

      if (interruptedJobs.length > 0) {
        logger.info(`Found ${interruptedJobs.length} interrupted jobs, requeueing...`);

        for (const job of interruptedJobs) {
          // Reset to queued status
          analysisJobService.updateJobStatus(job.job_id, 'queued');
        }
      }

      // Log queue stats
      const stats = analysisJobService.getQueueStats();
      logger.info('Analysis queue initialized', stats);

      // Start processing
      this.startProcessing();
    } catch (error) {
      logger.error('Error initializing analysis queue:', error);
      throw error;
    }
  }

  /**
   * Request analysis for a track
   * @param {number} trackId - Track ID
   * @param {Object} options - Analysis options
   * @param {string} priority - Priority: 'low', 'normal', 'high'
   * @param {Object} callback_metadata - Optional callback metadata
   * @param {boolean} force - If true, re-analyze even if already completed
   * @returns {Promise<Object>} Created/existing job
   */
  async requestAnalysis(trackId, options = {}, priority = 'normal', callback_metadata = null, force = false) {
    try {
      // Get track info (exclude BLOBs for performance)
      const track = getTrackById(trackId);
      if (!track) {
        throw new Error(`Track ${trackId} not found`);
      }

      // Use track hash as job ID
      const jobId = track.file_hash;

      // Check if job already exists
      let job = analysisJobService.getJobById(jobId);

      if (job) {
        // Job exists - check status
        if (job.status === 'queued' || job.status === 'processing') {
          logger.info(`Analysis job already queued/processing: ${jobId}`);
          return job;
        }

        if (job.status === 'completed') {
          if (force) {
            logger.info(`Force re-analyzing completed track: ${jobId}`);
            analysisJobService.deleteJob(jobId);
          } else {
            logger.info(`Track already analyzed: ${jobId}`);
            return job;
          }
        }

        // If failed or cancelled, allow retry by deleting old job
        if (job.status === 'failed' || job.status === 'cancelled') {
          logger.info(`Retrying failed/cancelled analysis: ${jobId}`);
          analysisJobService.deleteJob(jobId);
        }
      }

      // Default options for Phase 4
      const analysisOptions = {
        basic_features: options.basic_features !== false,
        characteristics: options.characteristics !== false,
        genre: options.genre || false,
        stems: options.stems || false,
        segments: options.segments || false,
        transitions: options.transitions || false,
      };

      // Create new job
      job = analysisJobService.createJob({
        job_id: jobId,
        track_id: trackId,
        file_path: track.file_path,
        options: analysisOptions,
        priority,
        callback_metadata,
      });

      logger.info(`Queued analysis job: ${jobId}`, {
        track_id: trackId,
        priority,
        options: analysisOptions,
        has_callback: !!callback_metadata,
      });

      // Emit event
      this.emit('job:queued', job);

      // Trigger processing
      this.processQueue();

      return job;
    } catch (error) {
      logger.error(`Error requesting analysis for track ${trackId}:`, error);
      throw error;
    }
  }

  /**
   * Start processing the queue
   */
  startProcessing() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    logger.info('Analysis queue processing started');

    // Process queue immediately and then periodically
    this.processQueue();

    // Set up periodic queue processing (every 5 seconds)
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 5000);
  }

  /**
   * Stop processing the queue
   */
  stopProcessing() {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('Analysis queue processing stopped');
  }

  /**
   * Process the queue - send jobs to Python server
   */
  async processQueue() {
    try {
      // Check if we have capacity for more jobs
      const availableSlots = this.maxConcurrentJobs - this.processingJobs.size;

      if (availableSlots <= 0) {
        return; // At capacity
      }

      // Check if analysis server is ready
      if (!analysisServerService.isReady) {
        logger.debug('Analysis server not ready yet, waiting before processing queue');
        return;
      }

      // Check if Python server is available
      const isAvailable = await pythonClientService.checkAvailability();
      if (!isAvailable) {
        logger.debug('Python server not available, skipping queue processing');
        return;
      }

      // Get queued jobs
      const queuedJobs = analysisJobService.getQueuedJobs(availableSlots);

      if (queuedJobs.length === 0) {
        return; // No jobs to process
      }

      logger.debug(`Processing ${queuedJobs.length} queued jobs...`);

      // Process each job
      for (const job of queuedJobs) {
        await this.processJob(job);
      }
    } catch (error) {
      logger.error('Error processing queue:', error);
    }
  }

  /**
   * Process a single job
   * @param {Object} job - Job to process
   */
  async processJob(job) {
    try {
      // Mark as processing
      analysisJobService.updateJobStatus(job.job_id, 'processing');
      this.processingJobs.add(job.job_id);

      logger.info(`Processing analysis job: ${job.job_id}`, {
        track_id: job.track_id,
        priority: job.priority,
        retry_count: job.retry_count,
      });

      // Emit event
      this.emit('job:processing', job);

      // Send to Python server
      await pythonClientService.requestAnalysis({
        file_path: job.file_path,
        track_hash: job.job_id,
        options: job.options,
      });

      // Python server will send callbacks as analysis progresses
      // The job stays in 'processing' state until we receive completion callback

    } catch (error) {
      logger.error(`Error processing job ${job.job_id}:`, error);

      // Handle failure with retry logic
      await this.handleJobFailure(job, error.message);
    }
  }

  /**
   * Handle job completion (called by callback handler)
   * @param {string} jobId - Job ID
   */
  async handleJobCompletion(jobId) {
    try {
      // Update status
      analysisJobService.updateJobStatus(jobId, 'completed');
      this.processingJobs.delete(jobId);

      const job = analysisJobService.getJobById(jobId);

      logger.info(`Analysis job completed: ${jobId}`, {
        track_id: job?.track_id,
        progress: job?.progress_percent,
      });

      // Emit event
      this.emit('job:completed', job);

      // Process next job
      this.processQueue();
    } catch (error) {
      logger.error(`Error handling job completion for ${jobId}:`, error);
    }
  }

  /**
   * Handle job failure with retry logic
   * @param {Object} job - Failed job
   * @param {string} errorMessage - Error message
   */
  async handleJobFailure(job, errorMessage) {
    try {
      this.processingJobs.delete(job.job_id);

      // Increment retry count
      const updatedJob = analysisJobService.incrementRetryCount(
        job.job_id,
        errorMessage
      );

      if (!updatedJob) {
        // Max retries reached, job is now marked as failed
        logger.error(`Job ${job.job_id} failed after ${job.max_retries} attempts`);
        this.emit('job:failed', job);
        return;
      }

      // Calculate exponential backoff delay
      const retryDelay = this.retryDelayMs * Math.pow(2, updatedJob.retry_count - 1);

      logger.info(`Job ${job.job_id} will retry after ${retryDelay}ms`, {
        retry_count: updatedJob.retry_count,
        max_retries: updatedJob.max_retries,
      });

      // Schedule retry
      setTimeout(() => {
        this.processQueue();
      }, retryDelay);

      // Emit event
      this.emit('job:retry', updatedJob);
    } catch (error) {
      logger.error(`Error handling job failure for ${job.job_id}:`, error);
    }
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job ID
   * @returns {Promise<boolean>} True if cancelled
   */
  async cancelJob(jobId) {
    try {
      const job = analysisJobService.getJobById(jobId);
      if (!job) {
        logger.warn(`Job ${jobId} not found for cancellation`);
        return false;
      }

      // If processing, try to cancel on Python server
      if (job.status === 'processing') {
        await pythonClientService.cancelAnalysis(jobId);
        this.processingJobs.delete(jobId);
      }

      // Update status
      analysisJobService.updateJobStatus(jobId, 'cancelled');

      logger.info(`Cancelled analysis job: ${jobId}`);

      // Emit event
      this.emit('job:cancelled', job);

      // Process next job
      this.processQueue();

      return true;
    } catch (error) {
      logger.error(`Error cancelling job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    const stats = analysisJobService.getQueueStats();

    return {
      isProcessing: this.isProcessing,
      maxConcurrentJobs: this.maxConcurrentJobs,
      processingCount: this.processingJobs.size,
      queuedCount: stats.queued.total,
      stats,
    };
  }

  /**
   * Re-analyze multiple tracks with basic features
   * @param {Array<string>} trackIds - Array of track IDs to re-analyze
   * @param {Object} options - Analysis options (defaults to basic_features only)
   * @param {string} priority - Priority level
   * @returns {Promise<Object>} Summary of queued jobs
   */
  async bulkReanalyze(trackIds, options = { basic_features: true, characteristics: false }, priority = 'normal') {
    const results = {
      queued: 0,
      failed: 0,
      errors: [],
    };

    logger.info(`Starting bulk re-analysis for ${trackIds.length} tracks`);

    for (const trackId of trackIds) {
      try {
        await this.requestAnalysis(trackId, options, priority, null, true); // force = true
        results.queued++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          trackId,
          error: error.message,
        });
        logger.error(`Failed to queue re-analysis for track ${trackId}:`, error);
      }
    }

    logger.info(`Bulk re-analysis complete: ${results.queued} queued, ${results.failed} failed`);
    return results;
  }

  /**
   * Clean up old completed/failed jobs
   * @param {number} olderThanDays - Delete jobs older than this many days
   * @returns {number} Number of jobs deleted
   */
  cleanupOldJobs(olderThanDays = 7) {
    return analysisJobService.cleanupOldJobs(olderThanDays);
  }
}

// Create singleton instance
const analysisQueueService = new AnalysisQueueService();

export default analysisQueueService;
