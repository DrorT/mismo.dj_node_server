import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';

/**
 * Stem Converter Utility
 * Converts stem audio files from FLAC to WAV format using ffmpeg
 *
 * Why WAV?
 * - Uncompressed PCM audio that audio engines can easily decode
 * - No codec dependencies in C++ audio engine
 * - Fast to read and seek (no decompression overhead)
 *
 * Conversion is fast: FLAC→WAV is just decompression (~1-2s per stem)
 */

/**
 * Check if ffmpeg is available
 * @returns {Promise<boolean>}
 */
async function checkFfmpegAvailable() {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);

    ffmpeg.on('error', () => {
      resolve(false);
    });

    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Convert a single stem file from FLAC to WAV
 * @param {string} flacPath - Path to input FLAC file
 * @param {string} wavPath - Path to output WAV file
 * @returns {Promise<void>}
 */
async function convertStemToWav(flacPath, wavPath) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // ffmpeg command: convert FLAC to WAV (PCM 16-bit, 44.1kHz)
    const ffmpeg = spawn('ffmpeg', [
      '-i', flacPath,           // Input file
      '-f', 'wav',              // Output format: WAV
      '-acodec', 'pcm_s16le',   // Audio codec: PCM signed 16-bit little-endian
      '-ar', '44100',           // Sample rate: 44.1kHz (standard CD quality)
      '-ac', '2',               // Channels: stereo
      '-y',                     // Overwrite output file if exists
      wavPath                   // Output file
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`Failed to spawn ffmpeg: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        logger.debug(`Converted ${path.basename(flacPath)} → ${path.basename(wavPath)} in ${duration}ms`);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Convert all stems from FLAC to WAV format
 * Converts stems in parallel for maximum speed
 * Deletes original FLAC files after successful conversion
 *
 * @param {Object} stemPaths - Object with stem types as keys and FLAC file paths as values
 *                             Example: { bass: '/tmp/.../bass.flac', drums: '/tmp/.../drums.flac' }
 * @returns {Promise<Object>} Object with stem types as keys and WAV file paths as values
 *                            Example: { bass: '/tmp/.../bass.wav', drums: '/tmp/.../drums.wav' }
 */
export async function convertStemsToWav(stemPaths) {
  const startTime = Date.now();

  // Check if ffmpeg is available
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    logger.error('ffmpeg not found - cannot convert stems to WAV');
    logger.error('Please install ffmpeg: sudo apt-get install ffmpeg');
    throw new Error('ffmpeg is not installed or not in PATH');
  }

  logger.info(`Converting ${Object.keys(stemPaths).length} stems from FLAC to WAV...`);

  // Convert all stems in parallel
  const conversionPromises = Object.entries(stemPaths).map(async ([stemType, flacPath]) => {
    try {
      // Check if input file exists
      try {
        await fs.access(flacPath);
      } catch {
        throw new Error(`Input file does not exist: ${flacPath}`);
      }

      // Determine output path (same directory, .wav extension)
      const dir = path.dirname(flacPath);
      const wavPath = path.join(dir, `${stemType}.wav`);

      // Convert FLAC → WAV
      await convertStemToWav(flacPath, wavPath);

      // Verify output file was created
      try {
        const stats = await fs.stat(wavPath);
        if (stats.size === 0) {
          throw new Error('Output WAV file is empty');
        }
      } catch (error) {
        throw new Error(`Failed to verify output file: ${error.message}`);
      }

      // Delete original FLAC file
      try {
        await fs.unlink(flacPath);
        logger.debug(`Deleted original FLAC file: ${flacPath}`);
      } catch (error) {
        logger.warn(`Failed to delete FLAC file ${flacPath}:`, error.message);
        // Not critical - continue anyway
      }

      return [stemType, wavPath];
    } catch (error) {
      logger.error(`Failed to convert stem ${stemType}:`, error.message);
      // Return original FLAC path on error (fallback)
      return [stemType, flacPath];
    }
  });

  const results = await Promise.all(conversionPromises);
  const wavPaths = Object.fromEntries(results);

  const duration = Date.now() - startTime;
  const successCount = results.filter(([_, path]) => path.endsWith('.wav')).length;

  logger.info(`✓ Converted ${successCount}/${Object.keys(stemPaths).length} stems to WAV in ${duration}ms`);

  return wavPaths;
}

export default {
  convertStemsToWav,
};
