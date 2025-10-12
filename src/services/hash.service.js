import xxhash from 'xxhash-wasm';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import * as mm from 'music-metadata';

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
 * Get audio data boundaries for a file (skipping metadata)
 * Returns { start, end } byte positions for the actual audio data
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{start: number, end: number|null}>}
 */
async function getAudioDataBoundaries(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stats = await fs.promises.stat(filePath);
  const fileSize = stats.size;

  let start = 0;
  let end = null; // null means read to end

  try {
    if (ext === '.mp3') {
      // MP3: Skip ID3v2 at start and ID3v1 at end
      const buffer = Buffer.alloc(10);
      const fd = await fs.promises.open(filePath, 'r');

      try {
        // Check for ID3v2 header at start
        await fd.read(buffer, 0, 10, 0);
        if (buffer.toString('utf8', 0, 3) === 'ID3') {
          // Decode synchsafe integer
          const size = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
          start = size + 10; // Header is 10 bytes + tag size
        }

        // Check for ID3v1 tag at end (always 128 bytes if present)
        const id3v1Buffer = Buffer.alloc(3);
        await fd.read(id3v1Buffer, 0, 3, fileSize - 128);
        if (id3v1Buffer.toString('utf8', 0, 3) === 'TAG') {
          end = fileSize - 128;
        }

        // Check for APEv2 tag at end (before ID3v1 if present)
        const apeBuffer = Buffer.alloc(8);
        const apeCheckPos = end ? end - 32 : fileSize - 32;
        await fd.read(apeBuffer, 0, 8, apeCheckPos);
        if (apeBuffer.toString('utf8', 0, 8) === 'APETAGEX') {
          // APE tag found, need to read size
          const sizeBuffer = Buffer.alloc(4);
          await fd.read(sizeBuffer, 0, 4, apeCheckPos + 12);
          const apeSize = sizeBuffer.readUInt32LE(0);
          end = apeCheckPos - apeSize + 32;
        }
      } finally {
        await fd.close();
      }
    } else if (ext === '.flac') {
      // FLAC: Skip metadata blocks, keep only audio frames
      // FLAC starts with "fLaC" marker, followed by metadata blocks
      // We can use music-metadata to find where audio starts
      const metadata = await mm.parseFile(filePath);
      // For FLAC, we'll use a simpler approach: skip first 4KB (covers most metadata)
      // A more precise implementation would parse FLAC block headers
      start = 4096; // Conservative estimate
    } else if (ext === '.m4a' || ext === '.aac' || ext === '.mp4') {
      // M4A/AAC: Complex atom structure
      // Use music-metadata to understand structure
      // For now, we'll hash the whole file as atom structure is complex
      // A proper implementation would parse the atom tree
      start = 0;
      end = null;
    } else if (ext === '.wav' || ext === '.aif' || ext === '.aiff') {
      // WAV/AIFF: Metadata is usually in separate chunks
      // The 'data' chunk contains the actual audio
      // For simplicity, we'll hash from start since metadata is minimal
      // and usually doesn't change between duplicates
      start = 0;
      end = null;
    } else if (ext === '.ogg' || ext === '.opus') {
      // OGG/Opus: Vorbis comments in separate page
      // Would need Ogg page parsing for precision
      // For now, hash from start
      start = 0;
      end = null;
    } else {
      // Unknown format: hash entire file
      start = 0;
      end = null;
    }
  } catch (error) {
    logger.warn(`Failed to parse audio boundaries for ${filePath}: ${error.message}`);
    // Fall back to full file
    start = 0;
    end = null;
  }

  return { start, end };
}

/**
 * Calculate xxHash for audio data only (skip metadata headers)
 * This provides better duplicate detection for same audio with different tags
 * Automatically detects file format and skips appropriate metadata
 * @param {string} filePath - Path to audio file
 * @returns {Promise<string>} Hex hash string
 */
export async function calculateAudioHash(filePath) {
  const xxh = await getHasherModule();
  const { start, end } = await getAudioDataBoundaries(filePath);

  return new Promise((resolve, reject) => {
    try {
      const streamOptions = {
        start,
        highWaterMark: HASH_CHUNK_SIZE,
      };

      if (end !== null) {
        streamOptions.end = end - 1; // createReadStream end is inclusive
      }

      const stream = fs.createReadStream(filePath, streamOptions);
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
 * @param {string} hashType - Type of hash: 'audio' (default), 'file', or 'quick'
 *                            'audio': Hash only audio data (best for duplicate detection)
 *                            'file': Hash entire file including metadata
 *                            'quick': Hash first 1MB only (fast screening)
 * @returns {Promise<Array>} Array of {filePath, hash, success, error}
 */
export async function calculateHashBatch(
  filePaths,
  onProgress = null,
  hashType = 'audio'
) {
  const results = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];

    try {
      let hash;

      switch (hashType) {
        case 'audio':
          // Hash only audio data, excluding metadata
          hash = await calculateAudioHash(filePath);
          break;
        case 'quick':
          hash = await calculateQuickHash(filePath);
          break;
        case 'file':
          // Hash entire file including metadata
          hash = await calculateFileHash(filePath);
          break;
        default:
          // Default to audio hashing for better duplicate detection
          hash = await calculateAudioHash(filePath);
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
