import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Analysis Job Service
 * Database operations for tracking analysis job state, queue, and retry logic
 */

/**
 * Create a new analysis job
 * @param {Object} jobData - Job data
 * @param {string} jobData.job_id - Unique job ID (track hash)
 * @param {number} jobData.track_id - Track ID
 * @param {string} jobData.file_path - File path
 * @param {Object} jobData.options - Analysis options
 * @param {string} jobData.priority - Priority: 'low', 'normal', 'high'
 * @param {Object} jobData.callback_metadata - Optional callback metadata (JSON)
 * @returns {Object} Created job
 */
export function createJob({ job_id, track_id, file_path, options, priority = 'normal', callback_metadata = null }) {
  try {
    const db = getDatabase();

    // Calculate total stages based on options
    let stages_total = 0;
    if (options.basic_features) stages_total++;
    if (options.characteristics) stages_total++;
    if (options.genre) stages_total++;
    if (options.stems) stages_total++;
    if (options.segments) stages_total++;
    if (options.transitions) stages_total++;

    const stmt = db.prepare(`
      INSERT INTO analysis_jobs (
        job_id, track_id, file_path, status, priority,
        options, stages_completed, stages_total, callback_metadata
      ) VALUES (?, ?, ?, 'queued', ?, ?, '[]', ?, ?)
    `);

    const result = stmt.run(
      job_id,
      track_id,
      file_path,
      priority,
      JSON.stringify(options),
      stages_total,
      callback_metadata ? JSON.stringify(callback_metadata) : null
    );

    logger.info(`Created analysis job: ${job_id}`, {
      track_id,
      priority,
      stages_total,
      has_callback: !!callback_metadata,
    });

    return getJobById(job_id);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      logger.warn(`Analysis job already exists: ${job_id}`);
      return getJobById(job_id);
    }
    logger.error('Error creating analysis job:', error);
    throw error;
  }
}

/**
 * Get job by job ID
 * @param {string} jobId - Job ID (track hash)
 * @returns {Object|null} Job data or null if not found
 */
export function getJobById(jobId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM analysis_jobs WHERE job_id = ?
    `);

    const job = stmt.get(jobId);
    if (!job) return null;

    // Parse JSON fields
    job.options = JSON.parse(job.options);
    job.stages_completed = JSON.parse(job.stages_completed || '[]');
    if (job.callback_metadata) {
      job.callback_metadata = JSON.parse(job.callback_metadata);
    }

    return job;
  } catch (error) {
    logger.error(`Error getting job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Get job by track ID
 * @param {number} trackId - Track ID
 * @returns {Object|null} Most recent job for the track
 */
export function getJobByTrackId(trackId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM analysis_jobs
      WHERE track_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const job = stmt.get(trackId);
    if (!job) return null;

    // Parse JSON fields
    job.options = JSON.parse(job.options);
    job.stages_completed = JSON.parse(job.stages_completed || '[]');
    if (job.callback_metadata) {
      job.callback_metadata = JSON.parse(job.callback_metadata);
    }

    return job;
  } catch (error) {
    logger.error(`Error getting job for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Get all queued jobs ordered by priority
 * @param {number} limit - Maximum number of jobs to return
 * @returns {Array} Array of jobs
 */
export function getQueuedJobs(limit = 100) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM analysis_jobs
      WHERE status = 'queued'
      ORDER BY
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at ASC
      LIMIT ?
    `);

    const jobs = stmt.all(limit);

    // Parse JSON fields
    return jobs.map(job => ({
      ...job,
      options: JSON.parse(job.options),
      stages_completed: JSON.parse(job.stages_completed || '[]'),
      callback_metadata: job.callback_metadata ? JSON.parse(job.callback_metadata) : null,
    }));
  } catch (error) {
    logger.error('Error getting queued jobs:', error);
    throw error;
  }
}

/**
 * Get all processing jobs
 * @returns {Array} Array of processing jobs
 */
export function getProcessingJobs() {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM analysis_jobs
      WHERE status = 'processing'
      ORDER BY started_at ASC
    `);

    const jobs = stmt.all();

    // Parse JSON fields
    return jobs.map(job => ({
      ...job,
      options: JSON.parse(job.options),
      stages_completed: JSON.parse(job.stages_completed || '[]'),
      callback_metadata: job.callback_metadata ? JSON.parse(job.callback_metadata) : null,
    }));
  } catch (error) {
    logger.error('Error getting processing jobs:', error);
    throw error;
  }
}

/**
 * Update job status
 * @param {string} jobId - Job ID
 * @param {string} status - New status
 * @returns {boolean} True if updated
 */
export function updateJobStatus(jobId, status) {
  try {
    const db = getDatabase();

    const updates = ['status = ?', 'last_updated = CURRENT_TIMESTAMP'];
    const params = [status];

    // Set started_at when moving to processing
    if (status === 'processing') {
      updates.push('started_at = CURRENT_TIMESTAMP');
    }

    // Set completed_at when finished
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    params.push(jobId);

    const stmt = db.prepare(`
      UPDATE analysis_jobs
      SET ${updates.join(', ')}
      WHERE job_id = ?
    `);

    const result = stmt.run(...params);

    if (result.changes > 0) {
      logger.debug(`Updated job ${jobId} status to ${status}`);
      return true;
    }

    logger.warn(`Job ${jobId} not found for status update`);
    return false;
  } catch (error) {
    logger.error(`Error updating job ${jobId} status:`, error);
    throw error;
  }
}

/**
 * Update job progress
 * @param {string} jobId - Job ID
 * @param {string} stage - Completed stage name
 * @returns {Object|null} Updated job or null if not found
 */
export function updateJobProgress(jobId, stage) {
  try {
    const db = getDatabase();

    // Get current job
    const job = getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for progress update`);
      return null;
    }

    // Add stage if not already completed
    const stagesCompleted = job.stages_completed;
    if (!stagesCompleted.includes(stage)) {
      stagesCompleted.push(stage);
    }

    // Calculate progress percentage (capped at 100%)
    const progressPercent = Math.min(100, Math.round((stagesCompleted.length / job.stages_total) * 100));

    const stmt = db.prepare(`
      UPDATE analysis_jobs
      SET
        stages_completed = ?,
        progress_percent = ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE job_id = ?
    `);

    stmt.run(
      JSON.stringify(stagesCompleted),
      progressPercent,
      jobId
    );

    logger.debug(`Updated job ${jobId} progress: ${progressPercent}%`, {
      stage,
      stages_completed: stagesCompleted.length,
      stages_total: job.stages_total,
    });

    return getJobById(jobId);
  } catch (error) {
    logger.error(`Error updating job ${jobId} progress:`, error);
    throw error;
  }
}

/**
 * Increment retry count for a job
 * @param {string} jobId - Job ID
 * @param {string} errorMessage - Error message
 * @returns {Object|null} Updated job or null if max retries reached
 */
export function incrementRetryCount(jobId, errorMessage) {
  try {
    const db = getDatabase();

    // Get current job
    const job = getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for retry increment`);
      return null;
    }

    const newRetryCount = job.retry_count + 1;

    // Check if max retries reached
    if (newRetryCount >= job.max_retries) {
      logger.warn(`Job ${jobId} exceeded max retries (${job.max_retries})`);

      const stmt = db.prepare(`
        UPDATE analysis_jobs
        SET
          status = 'failed',
          retry_count = ?,
          last_error = ?,
          completed_at = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP
        WHERE job_id = ?
      `);

      stmt.run(newRetryCount, errorMessage, jobId);
      return null;
    }

    // Increment retry count and reset to queued
    const stmt = db.prepare(`
      UPDATE analysis_jobs
      SET
        status = 'queued',
        retry_count = ?,
        last_error = ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE job_id = ?
    `);

    stmt.run(newRetryCount, errorMessage, jobId);

    logger.info(`Job ${jobId} retry count incremented to ${newRetryCount}/${job.max_retries}`);
    return getJobById(jobId);
  } catch (error) {
    logger.error(`Error incrementing retry count for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Delete a job
 * @param {string} jobId - Job ID
 * @returns {boolean} True if deleted
 */
export function deleteJob(jobId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM analysis_jobs WHERE job_id = ?');
    const result = stmt.run(jobId);

    if (result.changes > 0) {
      logger.info(`Deleted analysis job: ${jobId}`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Error deleting job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Get queue statistics
 * @returns {Object} Queue stats
 */
export function getQueueStats() {
  try {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT
        status,
        priority,
        COUNT(*) as count
      FROM analysis_jobs
      WHERE status IN ('queued', 'processing')
      GROUP BY status, priority
    `);

    const results = stmt.all();

    const stats = {
      queued: { total: 0, high: 0, normal: 0, low: 0 },
      processing: { total: 0, high: 0, normal: 0, low: 0 },
    };

    results.forEach(row => {
      stats[row.status][row.priority] = row.count;
      stats[row.status].total += row.count;
    });

    return stats;
  } catch (error) {
    logger.error('Error getting queue stats:', error);
    throw error;
  }
}

/**
 * Clean up old completed/failed jobs
 * @param {number} olderThanDays - Delete jobs older than this many days
 * @returns {number} Number of jobs deleted
 */
export function cleanupOldJobs(olderThanDays = 7) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      DELETE FROM analysis_jobs
      WHERE status IN ('completed', 'failed', 'cancelled')
      AND completed_at < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(olderThanDays);

    logger.info(`Cleaned up ${result.changes} old analysis jobs`);
    return result.changes;
  } catch (error) {
    logger.error('Error cleaning up old jobs:', error);
    throw error;
  }
}

export default {
  createJob,
  getJobById,
  getJobByTrackId,
  getQueuedJobs,
  getProcessingJobs,
  updateJobStatus,
  updateJobProgress,
  incrementRetryCount,
  deleteJob,
  getQueueStats,
  cleanupOldJobs,
};
