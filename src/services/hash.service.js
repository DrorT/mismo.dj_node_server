import xxhash from 'xxhash-wasm';
import fs from 'fs';
import logger from '../utils/logger.js';

/**
 * Hash Service
 * Generates hashes for audio files for duplicate detection
 * Uses xxHash (WebAssembly) for fast hashing - no native dependencies!
 */

const HASH_CHUNK_SIZE = 64 * 1024; // 64KB chunks

// Initialize xxhash-wasm (lazy initialization)
let xxhashModule = null;
async function getHasherModule() {
  if (!xxhashModule) {
    xxhashModule = await xxhash();
  }
  return xxhashModule;
}

/**
 * Calculate xxHash for entire file
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} Hex hash string
 */
export async function calculateFileHash(filePath) {
  const xxh = await getHasherModule();

  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(filePath, {
        highWaterMark: HASH_CHUNK_SIZE,
      });

      const chunks = [];

      stream.on('data', chunk => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        try {
          // Concatenate all chunks
          const buffer = Buffer.concat(chunks);
          // Create hasher and update with buffer
          const hasher = xxh.create64();
          hasher.update(buffer);
          // Get hash as hex string
          const hash = hasher.digest().toString(16);
          resolve(hash);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', error => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Calculate xxHash for audio data only (skip metadata headers)
 * This provides better duplicate detection for same audio with different tags
 * @param {string} filePath - Path to audio file
 * @param {number} skipBytes - Bytes to skip from start (metadata)
 * @returns {Promise<string>} Hex hash string
 */
export async function calculateAudioHash(filePath, skipBytes = 0) {
  const xxh = await getHasherModule();

  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(filePath, {
        start: skipBytes,
        highWaterMark: HASH_CHUNK_SIZE,
      });

      const chunks = [];

      stream.on('data', chunk => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const hasher = xxh.create64();
          hasher.update(buffer);
          const hash = hasher.digest().toString(16);
          resolve(hash);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', error => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Calculate a quick hash of first N bytes for fast comparison
 * Useful for initial duplicate screening
 * @param {string} filePath - Path to file
 * @param {number} bytes - Number of bytes to hash (default 1MB)
 * @returns {Promise<string>} Hex hash string
 */
export async function calculateQuickHash(filePath, bytes = 1024 * 1024) {
  const xxh = await getHasherModule();

  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(filePath, {
        end: bytes - 1,
        highWaterMark: HASH_CHUNK_SIZE,
      });

      const chunks = [];

      stream.on('data', chunk => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const hasher = xxh.create64();
          hasher.update(buffer);
          const hash = hasher.digest().toString(16);
          resolve(hash);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', error => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Calculate hash for multiple files
 * @param {Array<string>} filePaths - Array of file paths
 * @param {Function} onProgress - Progress callback (index, total, filePath, hash)
 * @param {string} hashType - Type of hash: 'file', 'audio', or 'quick'
 * @returns {Promise<Array>} Array of {filePath, hash, success, error}
 */
export async function calculateHashBatch(
  filePaths,
  onProgress = null,
  hashType = 'file'
) {
  const results = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];

    try {
      let hash;

      switch (hashType) {
        case 'audio':
          // For MP3, skip ID3v2 tag (up to 10 bytes header + variable size)
          // For simplicity, we'll use file hash for now
          // TODO: Implement proper audio-only hashing per format
          hash = await calculateFileHash(filePath);
          break;
        case 'quick':
          hash = await calculateQuickHash(filePath);
          break;
        default:
          hash = await calculateFileHash(filePath);
      }

      results.push({
        success: true,
        filePath,
        hash,
      });

      if (onProgress) {
        onProgress(i + 1, filePaths.length, filePath, hash);
      }
    } catch (error) {
      logger.warn(`Failed to hash ${filePath}:`, error.message);
      results.push({
        success: false,
        filePath,
        error: error.message,
      });

      if (onProgress) {
        onProgress(i + 1, filePaths.length, filePath, null);
      }
    }
  }

  return results;
}

/**
 * Estimate time to hash file based on size
 * @param {number} fileSize - File size in bytes
 * @param {number} bytesPerSecond - Estimated hashing speed (default 100MB/s)
 * @returns {number} Estimated seconds
 */
export function estimateHashTime(fileSize, bytesPerSecond = 100 * 1024 * 1024) {
  return fileSize / bytesPerSecond;
}

/**
 * Get hash algorithm info
 * @returns {Object} Algorithm information
 */
export function getHashAlgorithmInfo() {
  return {
    algorithm: 'xxHash64 (WebAssembly)',
    digestSize: 64,
    performance: 'Very fast (GB/s)',
    collision: 'Low probability',
    cryptographic: false,
    useCase: 'Duplicate detection, integrity checks',
    implementation: 'xxhash-wasm (no native dependencies)',
  };
}

export default {
  calculateFileHash,
  calculateAudioHash,
  calculateQuickHash,
  calculateHashBatch,
  estimateHashTime,
  getHashAlgorithmInfo,
};
