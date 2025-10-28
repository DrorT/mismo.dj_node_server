import logger from '../utils/logger.js';
import * as trackService from './track.service.js';
import * as waveformService from './waveform.service.js';
import * as analysisJobService from './analysisJob.service.js';
import analysisQueueService from './analysisQueue.service.js';
import audioServerClientService from './audioServerClient.service.js';

/**
 * Analysis Callback Service
 * Handles callbacks from Python analysis server with progressive updates
 *
 * The Python server sends callbacks for each analysis stage:
 * - basic_features: tempo, key, beats, downbeats, waveforms
 * - characteristics: danceability, energy, valence, etc.
 * - genre, stems, segments, transitions (Phase 5+)
 */

/**
 * Handle basic_features callback
 * @param {string} jobId - Job ID (track hash)
 * @param {Object} data - Basic features data
 * @returns {Promise<void>}
 */
export async function handleBasicFeatures(jobId, data) {
  try {
    // Log received data structure for debugging
    logger.info(`Received basic_features for job: ${jobId}`, {
      keys: Object.keys(data),
      hasKey: 'key' in data,
      hasKeyName: 'key_name' in data,
      hasTempo: 'tempo' in data,
      hasBeats: 'beats' in data,
      sample: JSON.stringify(data).substring(0, 300)
    });

    // Get job
    const job = analysisJobService.getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for basic_features callback`);
      return;
    }

    // Validate data - make validation more flexible
    if (!data || typeof data !== 'object') {
      logger.error(`Invalid basic_features data structure for job ${jobId}`);
      throw new Error('Invalid basic_features data structure');
    }

    // Extract values with flexible field names (handle different formats)
    const tempo = data.tempo || data.bpm;
    const key = data.key !== undefined ? data.key : data.musical_key;
    const keyName = data.key_name || data.key;
    const mode = data.mode;
    const modeName = data.mode_name;
    const beats = data.beats || [];
    const downbeats = data.downbeats || [];
    const firstBeatOffset = data.firstBeatOffset;
    const firstPhraseBeatNo = data.firstPhraseBeatNo;
    const audibleStartTime = data.audibleStartTime;
    const audibleEndTime = data.audibleEndTime;

    // Log what we extracted
    logger.info(`Extracted basic features:`, {
      tempo, key, keyName, mode, modeName,
      beats_count: beats.length,
      downbeats_count: downbeats.length,
      firstBeatOffset,
      firstPhraseBeatNo,
      audibleStartTime,
      audibleEndTime
    });

    // Prepare track updates
    const trackUpdates = {};

    if (tempo !== undefined) trackUpdates.bpm = tempo;
    if (key !== undefined) trackUpdates.musical_key = key;
    if (mode !== undefined) trackUpdates.mode = mode;
    if (firstBeatOffset !== undefined) trackUpdates.first_beat_offset = firstBeatOffset;
    if (firstPhraseBeatNo !== undefined) trackUpdates.first_phrase_beat_no = firstPhraseBeatNo;
    if (audibleStartTime !== undefined) trackUpdates.audible_start_time = audibleStartTime;
    if (audibleEndTime !== undefined) trackUpdates.audible_end_time = audibleEndTime;

    // Store beats and downbeats as JSON BLOBs if present
    if (beats && beats.length > 0) {
      trackUpdates.beats_data = Buffer.from(JSON.stringify(beats));
    }
    if (downbeats && downbeats.length > 0) {
      trackUpdates.downbeats_data = Buffer.from(JSON.stringify(downbeats));
    }

    // Update track
    trackService.updateTrackMetadata(job.track_id, trackUpdates);

    logger.info(`Updated track ${job.track_id} with basic features`, {
      bpm: tempo,
      key: keyName,
      mode: modeName,
      num_beats: beats.length,
      num_downbeats: downbeats.length,
    });

    // Store waveforms using file_hash (jobId is the file_hash)
    if (data.waveforms && Array.isArray(data.waveforms)) {
      waveformService.storeWaveforms(jobId, data.waveforms);
      logger.info(`Stored ${data.waveforms.length} waveforms for file_hash ${jobId}`);
    }

    // Update job progress
    analysisJobService.updateJobProgress(jobId, 'basic_features');

    // Check if there's a callback to notify (e.g., audio server)
    if (job.callback_metadata) {
      await handleCallback(job, data);
    }

  } catch (error) {
    logger.error(`Error handling basic_features for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Handle characteristics callback
 * @param {string} jobId - Job ID (track hash)
 * @param {Object} data - Characteristics data
 * @returns {Promise<void>}
 */
export async function handleCharacteristics(jobId, data) {
  try {
    logger.info(`Received characteristics for job: ${jobId}`);

    // Get job
    const job = analysisJobService.getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for characteristics callback`);
      return;
    }

    // Validate data
    if (!validateCharacteristics(data)) {
      logger.error(`Invalid characteristics data for job ${jobId}`);
      throw new Error('Invalid characteristics data');
    }

    // Prepare track updates
    const trackUpdates = {
      // Boolean characteristics (stored as 0/1 in SQLite)
      danceability: data.danceability ? 1 : 0,
      acousticness: data.acousticness ? 1 : 0,
      instrumentalness: data.instrumentalness ? 1 : 0,

      // Numeric characteristics
      valence: data.valence,
      arousal: data.arousal,
      energy: data.energy,
      loudness: data.loudness,

      // Spectral features
      spectral_centroid: data.spectral_centroid,
      spectral_rolloff: data.spectral_rolloff,
      zero_crossing_rate: data.zero_crossing_rate,

      // Set analysis timestamp
      date_analyzed: new Date().toISOString(),
    };

    // Update track
    trackService.updateTrackMetadata(job.track_id, trackUpdates);

    logger.info(`Updated track ${job.track_id} with characteristics`, {
      danceability: data.danceability,
      valence: data.valence,
      arousal: data.arousal,
      energy: data.energy,
      spectral_centroid: data.spectral_centroid,
      spectral_rolloff: data.spectral_rolloff,
      zero_crossing_rate: data.zero_crossing_rate,
    });

    // Update job progress
    const updatedJob = analysisJobService.updateJobProgress(jobId, 'characteristics');

    // Check if all stages complete
    if (updatedJob && updatedJob.progress_percent === 100) {
      logger.info(`All analysis stages complete for job ${jobId}`);
      await analysisQueueService.handleJobCompletion(jobId);
    }

  } catch (error) {
    logger.error(`Error handling characteristics for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Handle genre callback (Phase 5)
 * @param {string} jobId - Job ID
 * @param {Object} data - Genre data
 * @returns {Promise<void>}
 */
export async function handleGenre(jobId, data) {
  // Placeholder for Phase 5
  logger.info(`Received genre for job: ${jobId} (not implemented yet)`);
}

/**
 * Handle stems callback
 * @param {string} jobId - Job ID
 * @param {Object} data - Stems data with path
 * @returns {Promise<void>}
 */
export async function handleStems(jobId, data) {
  try {
    logger.info(`Received stems for job: ${jobId}`);

    // Get job
    const job = analysisJobService.getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for stems callback`);
      return;
    }

    // Validate data - Python server sends:
    // { delivery_mode: 'path', stems: { bass: '/path/to/bass.wav', ... }, processing_time: 45.3 }
    if (!data || data.delivery_mode !== 'path' || !data.stems) {
      logger.error(`Invalid stems data for job ${jobId}:`, data);
      throw new Error('Invalid stems data: expected delivery_mode=path with stems object');
    }

    logger.info(`Received stem paths for job ${jobId}:`, data.stems);

    // DO NOT store stems in database - analysis server will clean up old jobs to save space
    // Stems are ephemeral - we only forward them to the audio engine immediately

    // Update job progress
    analysisJobService.updateJobProgress(jobId, 'stems');

    // Forward stems directly to audio engine (if this request came from audio engine)
    if (job.callback_metadata && job.callback_metadata.type === 'audio_server_stems') {
      await handleCallback(job, data);
      logger.info(`✓ Forwarded stems to audio engine for job ${jobId}`);
    } else {
      logger.warn(`Stems generated for job ${jobId} but no audio_server_stems callback - stems will not be delivered`);
    }

  } catch (error) {
    logger.error(`Error handling stems for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Handle segments callback (Phase 5)
 * @param {string} jobId - Job ID
 * @param {Object} data - Segments data
 * @returns {Promise<void>}
 */
export async function handleSegments(jobId, data) {
  // Placeholder for Phase 5
  logger.info(`Received segments for job: ${jobId} (not implemented yet)`);
}

/**
 * Handle transitions callback (Phase 5)
 * @param {string} jobId - Job ID
 * @param {Object} data - Transitions data
 * @returns {Promise<void>}
 */
export async function handleTransitions(jobId, data) {
  // Placeholder for Phase 5
  logger.info(`Received transitions for job: ${jobId} (not implemented yet)`);
}

/**
 * Handle analysis error from Python server
 * @param {string} jobId - Job ID
 * @param {string} errorMessage - Error message
 * @returns {Promise<void>}
 */
export async function handleAnalysisError(jobId, errorMessage) {
  try {
    logger.error(`Analysis error for job ${jobId}:`, errorMessage);

    const job = analysisJobService.getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for error handling`);
      return;
    }

    // Let the queue service handle retry logic
    await analysisQueueService.handleJobFailure(job, errorMessage);

  } catch (error) {
    logger.error(`Error handling analysis error for job ${jobId}:`, error);
  }
}

/**
 * Handle job_completed callback from Python server
 * This indicates all requested features have been analyzed
 *
 * @param {string} jobId - Job identifier
 * @param {Object} data - Completion data (processing time, stages completed, etc.)
 */
export async function handleJobCompleted(jobId, data) {
  try {
    logger.info(`Job ${jobId} completed successfully`, data);

    const job = analysisJobService.getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for completion handling`);
      return;
    }

    // Mark job as completed
    await analysisQueueService.handleJobCompletion(jobId);

  } catch (error) {
    logger.error(`Error handling job completion for ${jobId}:`, error);
  }
}

/**
 * Validate basic_features data structure
 * @param {Object} data - Data to validate
 * @returns {boolean} True if valid
 */
function validateBasicFeatures(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Required fields
  const requiredFields = [
    'key', 'key_name', 'mode', 'mode_name', 'tempo',
    'beats', 'downbeats', 'num_beats', 'num_downbeats'
  ];

  for (const field of requiredFields) {
    if (!(field in data)) {
      logger.warn(`Missing required field: ${field}`);
      return false;
    }
  }

  // Validate arrays
  if (!Array.isArray(data.beats) || !Array.isArray(data.downbeats)) {
    logger.warn('beats and downbeats must be arrays');
    return false;
  }

  return true;
}

/**
 * Validate characteristics data structure
 * @param {Object} data - Data to validate
 * @returns {boolean} True if valid
 */
function validateCharacteristics(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Required fields
  const requiredFields = [
    'danceability', 'valence', 'arousal', 'energy',
    'loudness', 'acousticness', 'instrumentalness'
  ];

  for (const field of requiredFields) {
    if (!(field in data)) {
      logger.warn(`Missing required field: ${field}`);
      return false;
    }
  }

  return true;
}

/**
 * Handle callback notification after analysis completes
 * @param {Object} job - Job data with callback_metadata
 * @param {Object} data - Analysis data (optional, for stems)
 * @returns {Promise<void>}
 */
async function handleCallback(job, data = null) {
  try {
    const { callback_metadata } = job;

    if (!callback_metadata || !callback_metadata.type) {
      logger.warn(`Job ${job.job_id} has invalid callback_metadata`);
      return;
    }

    logger.info(`Processing callback for job ${job.job_id}`, {
      type: callback_metadata.type,
      trackId: callback_metadata.trackId,
    });

    // Handle different callback types
    switch (callback_metadata.type) {
      case 'audio_server_track_info':
        // Notify audio server that track info is now available
        await audioServerClientService.sendTrackInfo(
          callback_metadata.trackId,
          callback_metadata.requestId
        );
        logger.info(`✓ Notified audio server about track ${callback_metadata.trackId}`);
        break;

      case 'audio_server_stems':
        // Notify audio server that stems are ready
        if (data && (data.stems || data.stems_path)) {
          await audioServerClientService.sendStemsReady(
            callback_metadata.trackId,
            data,  // Pass the entire stems data object
            callback_metadata.requestId
          );
          logger.info(`✓ Notified audio server that stems are ready for track ${callback_metadata.trackId}`);
        } else {
          logger.warn(`Stems callback for job ${job.job_id} has no stems data`);
        }
        break;

      default:
        logger.warn(`Unknown callback type: ${callback_metadata.type}`);
    }
  } catch (error) {
    logger.error(`Error handling callback for job ${job.job_id}:`, error);
    // Don't throw - callback errors shouldn't fail the analysis
  }
}

export default {
  handleBasicFeatures,
  handleCharacteristics,
  handleGenre,
  handleStems,
  handleSegments,
  handleTransitions,
  handleAnalysisError,
};
