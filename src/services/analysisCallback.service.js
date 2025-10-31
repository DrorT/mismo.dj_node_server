import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import axios from 'axios';
import logger from '../utils/logger.js';
import * as trackService from './track.service.js';
import * as waveformService from './waveform.service.js';
import * as analysisJobService from './analysisJob.service.js';
import analysisQueueService from './analysisQueue.service.js';
import audioServerClientService from './audioServerClient.service.js';
import stemCacheService from './stemCache.service.js';
import { convertStemsToWav } from '../utils/stemConverter.js';

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
      sample: JSON.stringify(data).substring(0, 300),
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
      tempo,
      key,
      keyName,
      mode,
      modeName,
      beats_count: beats.length,
      downbeats_count: downbeats.length,
      firstBeatOffset,
      firstPhraseBeatNo,
      audibleStartTime,
      audibleEndTime,
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
 * Re-request stems from analysis server (after download failure)
 * @param {string} jobId - Job ID (file hash)
 * @param {number} trackId - Track database ID
 * @param {Object} callbackMetadata - Callback metadata to preserve
 * @returns {Promise<void>}
 * @private
 */
async function _reRequestStems(jobId, trackId, callbackMetadata) {
  try {
    logger.info(`Re-requesting stems from analysis server for job ${jobId}`);

    const track = trackService.getTrackById(trackId);
    if (!track) {
      logger.error(`Cannot re-request stems: track ${trackId} not found`);
      return;
    }

    // Create new analysis request for stems only
    // Analysis server likely still has stems in cache
    await analysisQueueService.requestAnalysis(
      trackId,
      { stems: true }, // Only request stems
      'high', // High priority for retry
      callbackMetadata, // Preserve original callback metadata
      true // Force re-analysis
    );

    logger.info(`✓ Stems re-requested for job ${jobId}`);
  } catch (error) {
    logger.error(`Failed to re-request stems for job ${jobId}:`, error);
  }
}

/**
 * Handle stems callback
 * @param {string} jobId - Job ID
 * @param {Object} data - Stems data (either paths or base64-encoded audio)
 * @returns {Promise<void>}
 */
export async function handleStems(jobId, data) {
  try {
    logger.info(`=== HANDLE STEMS CALLED ===`, {
      jobId,
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : [],
    });

    // Get job
    const job = analysisJobService.getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for stems callback`);
      return;
    }

    // Check if stems stage was already completed AND job is completed (idempotency check)
    // We allow reprocessing if the job is still 'processing' (in case previous callback failed partway through)
    if (job.stages_completed && job.stages_completed.includes('stems')) {
      if (job.status === 'completed') {
        logger.warn(`!!! IDEMPOTENCY CHECK: Stems already processed and job completed for ${jobId}, skipping duplicate callback`, {
          stages_completed: job.stages_completed,
          job_status: job.status,
          completed_at: job.completed_at,
        });
        return;
      } else {
        logger.warn(`⚠ Stems stage marked complete but job still ${job.status} - allowing reprocessing for ${jobId}`, {
          stages_completed: job.stages_completed,
          job_status: job.status,
          reason: 'Previous attempt may have failed before completion',
        });
        // Continue processing - previous attempt may have failed
      }
    }

    logger.info(`Processing stems for job ${jobId}`);

    // Validate data structure
    if (!data || !data.delivery_mode || !data.stems) {
      logger.error(`Invalid stems data for job ${jobId}:`, data);
      throw new Error('Invalid stems data: missing delivery_mode or stems');
    }

    let stemPaths = null;
    let tempDir = null;

    // Handle different delivery modes
    if (data.delivery_mode === 'callback') {
      // CALLBACK MODE: Check if stems are URLs or base64 data
      const firstStemValue = Object.values(data.stems)[0];
      const isUrlMode = typeof firstStemValue === 'string' &&
                        (firstStemValue.startsWith('http://') || firstStemValue.startsWith('https://'));

      if (isUrlMode) {
        // URL MODE: Download FLAC stems from HTTP endpoints
        logger.info(`Downloading stem files from URLs for job ${jobId} (format: ${data.format || 'flac'})`);

        let result;
        try {
          result = await _downloadStemsFromUrls(jobId, data.stems, data.format || 'flac');
          stemPaths = result.stemPaths;
          tempDir = result.tempDir;
        } catch (downloadError) {
          logger.error(`Fatal error during stem download for job ${jobId}:`, downloadError);

          // Re-request stems from analysis server (likely still in cache)
          if (job.callback_metadata) {
            logger.warn(`Requesting stems again from analysis server (cache should make this fast)...`);
            await _reRequestStems(jobId, job.track_id, job.callback_metadata);
          }

          throw downloadError;
        }

        // Check if all stems downloaded successfully (all-or-nothing requirement)
        const expectedStemCount = Object.keys(data.stems).length;
        const downloadedStemCount = Object.keys(stemPaths).length;

        if (downloadedStemCount < expectedStemCount) {
          logger.error(`Stem download failed: only ${downloadedStemCount}/${expectedStemCount} stems downloaded successfully`);
          logger.error(`Failed stems:`, result.metrics.failedStems);

          // Cleanup partial downloads
          if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
          }

          // Re-request stems from analysis server (likely still in cache)
          if (job.callback_metadata) {
            logger.warn(`Requesting stems again from analysis server (cache should make this fast)...`);
            await _reRequestStems(jobId, job.track_id, job.callback_metadata);
          }

          throw new Error(`Incomplete stem download: ${downloadedStemCount}/${expectedStemCount} stems received. Will retry.`);
        }

        logger.info(`✓ Successfully downloaded all ${downloadedStemCount} stems`);

      } else {
        // BASE64 MODE: Decode base64 audio data and save to temp files
        logger.info(`Processing base64-encoded stems for job ${jobId} (remote mode)`);

        const result = await _decodeStemsToTempFiles(jobId, data.stems);
        stemPaths = result.stemPaths;
        tempDir = result.tempDir;

        logger.info(`Decoded ${Object.keys(stemPaths).length} stems to temp files`);
      }

    } else if (data.delivery_mode === 'path') {
      // LOCAL MODE: Use file paths directly
      logger.info(`Received stem file paths for job ${jobId} (local mode):`, data.stems);
      stemPaths = data.stems;
    } else {
      throw new Error(`Unknown delivery_mode: ${data.delivery_mode}`);
    }

    // Store waveform data in database (for UI visualization)
    if (data.waveforms && Array.isArray(data.waveforms) && data.waveforms.length > 0) {
      const track = trackService.getTrackById(job.track_id);
      if (track && track.file_hash) {
        waveformService.storeStemWaveforms(track.file_hash, data.waveforms);
        logger.info(`Stored ${data.waveforms.length} stem waveform zoom levels`);
      }
    }

    // Convert FLAC stems to WAV (audio engine needs uncompressed PCM)
    // This happens before caching so cache stores WAV files
    const format = data.format || 'flac';
    if (format === 'flac') {
      logger.info(`Converting ${Object.keys(stemPaths).length} FLAC stems to WAV for audio engine compatibility...`);
      try {
        stemPaths = await convertStemsToWav(stemPaths);
        logger.info(`✓ Stems converted to WAV format`);
      } catch (error) {
        logger.error(`Failed to convert stems to WAV:`, error);
        // Continue with FLAC files and hope for the best
        logger.warn(`Proceeding with FLAC files (audio engine may not support them)`);
      }
    }

    // Cache stems for future requests (before forwarding to audio engine)
    // This reduces load on analysis server for repeat requests
    // Note: We cache WAV files (after conversion), so cache hits are instant and audio-engine-ready
    const cachedPaths = await stemCacheService.set(jobId, stemPaths, 'wav');

    // Forward stem paths to audio engine (BEFORE marking stage as complete)
    if (job.callback_metadata && job.callback_metadata.type === 'audio_server_stems') {
      // Audio engine always receives cached WAV paths (persistent, never deleted)
      const audioEngineData = {
        delivery_mode: 'path', // Always use path mode for audio engine
        stems: cachedPaths, // Send cached paths (persistent in data/stem_cache/)
        processing_time: data.processing_time,
      };

      await audioServerClientService.sendStemsReady(
        job.callback_metadata.trackId,
        audioEngineData,
        job.callback_metadata.requestId
      );

      logger.info(`✓ Forwarded cached stem paths to audio engine for job ${jobId}`);

      // Only mark stems stage as complete AFTER successful delivery to audio engine
      analysisJobService.updateJobProgress(jobId, 'stems');
      logger.info(`✓ Marked stems stage as complete for job ${jobId}`);
    } else {
      logger.warn(`Stems generated for job ${jobId} but no audio_server_stems callback - stems will not be delivered`);
      // Do NOT mark stems stage as complete if not delivered to audio engine
      logger.warn(`Not marking stems as complete since they were not delivered`);
    }

    // Cleanup temp files immediately after caching (stems are now in persistent cache)
    if (tempDir) {
      logger.info(`Cleaning up temp directory: ${tempDir}`);
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        logger.info(`✓ Cleaned up temp directory`);
      } catch (error) {
        logger.error(`Failed to cleanup temp directory ${tempDir}:`, error);
      }
    }
  } catch (error) {
    logger.error(`Error handling stems for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Decode base64-encoded stems and save to temp files
 * @param {string} jobId - Job ID
 * @param {Object} stems - Object with stem types as keys and base64 data as values
 * @returns {Promise<{stemPaths: Object, tempDir: string}>}
 * @private
 */
async function _decodeStemsToTempFiles(jobId, stems) {
  const tempDir = path.join(os.tmpdir(), 'mismo-stems', jobId);
  await fs.mkdir(tempDir, { recursive: true });

  const stemPaths = {};

  for (const [stemType, base64Data] of Object.entries(stems)) {
    if (!base64Data) {
      logger.warn(`Stem ${stemType} is null, skipping`);
      continue;
    }

    try {
      // Decode base64 to buffer
      const audioBuffer = Buffer.from(base64Data, 'base64');

      // Save to temp file
      const tempFilePath = path.join(tempDir, `${stemType}.wav`);
      await fs.writeFile(tempFilePath, audioBuffer);

      stemPaths[stemType] = tempFilePath;

      logger.info(`Saved stem ${stemType} to ${tempFilePath} (${audioBuffer.length} bytes)`);
    } catch (error) {
      logger.error(`Failed to decode stem ${stemType}:`, error);
    }
  }

  return { stemPaths, tempDir };
}


/**
 * Download stem files from URLs and save to temp directory
 * Downloads all stems in parallel for maximum speed
 *
 * @param {string} jobId - Job ID
 * @param {Object} stemUrls - Object with stem types as keys and URLs as values
 * @param {string} format - File format (e.g., 'flac', 'wav')
 * @returns {Promise<{stemPaths: Object, tempDir: string, metrics: Object}>}
 * @private
 */
async function _downloadStemsFromUrls(jobId, stemUrls, format = 'flac') {
  const tempDir = path.join(os.tmpdir(), 'mismo-stems', jobId);
  await fs.mkdir(tempDir, { recursive: true });

  const startTime = Date.now();
  const metrics = {
    totalBytes: 0,
    downloadTime: 0,
    stemCount: 0,
    failedStems: [],
  };

  logger.info(`Starting parallel download of ${Object.keys(stemUrls).length} stems for job ${jobId}`);

  // Download all stems in parallel
  const downloadPromises = Object.entries(stemUrls).map(async ([stemType, url]) => {
    if (!url) {
      logger.warn(`Stem ${stemType} has no URL, skipping`);
      metrics.failedStems.push({ stem: stemType, reason: 'No URL provided' });
      return [stemType, null];
    }

    // Validate URL format
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      logger.error(`Invalid URL for stem ${stemType}: ${url}`);
      metrics.failedStems.push({ stem: stemType, reason: 'Invalid URL format' });
      return [stemType, null];
    }

    const stemStartTime = Date.now();

    try {
      logger.info(`Downloading stem ${stemType} from ${url}`);

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60 second timeout per stem
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const audioBuffer = Buffer.from(response.data);
      const tempFilePath = path.join(tempDir, `${stemType}.${format}`);
      await fs.writeFile(tempFilePath, audioBuffer);

      const downloadTime = Date.now() - stemStartTime;
      const sizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(2);
      const speedMbps = ((audioBuffer.length * 8) / (downloadTime / 1000) / 1000000).toFixed(2);

      metrics.totalBytes += audioBuffer.length;
      metrics.stemCount++;

      logger.info(`✓ Downloaded stem ${stemType}: ${sizeMB} MB in ${downloadTime}ms (${speedMbps} Mbps) → ${tempFilePath}`);

      return [stemType, tempFilePath];
    } catch (error) {
      const downloadTime = Date.now() - stemStartTime;
      logger.error(`✗ Failed to download stem ${stemType} from ${url} after ${downloadTime}ms:`, error.message);
      metrics.failedStems.push({ stem: stemType, reason: error.message, url });
      return [stemType, null];
    }
  });

  const results = await Promise.all(downloadPromises);
  const stemPaths = Object.fromEntries(results.filter(([_, path]) => path !== null));

  metrics.downloadTime = Date.now() - startTime;
  const totalMB = (metrics.totalBytes / (1024 * 1024)).toFixed(2);
  const avgSpeedMbps = ((metrics.totalBytes * 8) / (metrics.downloadTime / 1000) / 1000000).toFixed(2);

  // Log summary
  logger.info(`Download complete: ${metrics.stemCount}/${Object.keys(stemUrls).length} stems succeeded, ${totalMB} MB total in ${metrics.downloadTime}ms (${avgSpeedMbps} Mbps avg)`);

  if (metrics.failedStems.length > 0) {
    logger.warn(`Failed stems:`, metrics.failedStems);
  }

  return { stemPaths, tempDir, metrics };
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
    'key',
    'key_name',
    'mode',
    'mode_name',
    'tempo',
    'beats',
    'downbeats',
    'num_beats',
    'num_downbeats',
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
    'danceability',
    'valence',
    'arousal',
    'energy',
    'loudness',
    'acousticness',
    'instrumentalness',
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
            data, // Pass the entire stems data object
            callback_metadata.requestId
          );
          logger.info(
            `✓ Notified audio server that stems are ready for track ${callback_metadata.trackId}`
          );
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
