import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Stem Cache Service
 * Caches the last N stem sets locally to avoid re-requesting from analysis server
 *
 * Features:
 * - FIFO eviction: oldest stems deleted when cache is full
 * - Track hash-based lookup
 * - Automatic cache directory management
 * - Configurable cache size
 *
 * Cache structure:
 * data/stem_cache/
 *   {track_hash}/
 *     vocals.flac
 *     drums.flac
 *     bass.flac
 *     other.flac
 *     .metadata.json  (timestamp, format, etc.)
 */

class StemCacheService {
  constructor() {
    this.cacheDir = path.join(process.cwd(), 'data', 'stem_cache');
    this.maxCacheSets = parseInt(process.env.STEM_CACHE_MAX_SETS || '10'); // Cache last 10 stem sets
    this.enabled = process.env.STEM_CACHE_ENABLED !== 'false'; // Enabled by default
  }

  /**
   * Initialize cache directory
   */
  async initialize() {
    if (!this.enabled) {
      logger.info('Stem cache is disabled');
      return;
    }

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      logger.info(`Stem cache initialized`, {
        cacheDir: this.cacheDir,
        maxSets: this.maxCacheSets,
      });

      // Clean up on startup if cache exceeds max size
      await this.enforceMaxSize();
    } catch (error) {
      logger.error('Error initializing stem cache:', error);
      this.enabled = false;
    }
  }

  /**
   * Check if stems exist in cache for a track
   * @param {string} trackHash - Track file hash
   * @returns {Promise<Object|null>} Stem paths or null if not cached
   */
  async get(trackHash) {
    if (!this.enabled) return null;

    try {
      const stemDir = path.join(this.cacheDir, trackHash);
      const metadataPath = path.join(stemDir, '.metadata.json');

      // Check if directory and metadata exist
      try {
        await fs.access(stemDir);
        await fs.access(metadataPath);
      } catch {
        return null; // Not in cache
      }

      // Read metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);

      // Verify all stem files exist
      const stemPaths = {};
      let allStemsExist = true;

      for (const [stemType, filename] of Object.entries(metadata.stems)) {
        const stemPath = path.join(stemDir, filename);
        try {
          await fs.access(stemPath);
          stemPaths[stemType] = stemPath;
        } catch {
          allStemsExist = false;
          logger.warn(`Cache miss: stem file missing for ${trackHash}/${stemType}`);
          break;
        }
      }

      if (!allStemsExist) {
        // Cache is corrupted, remove it
        await this.remove(trackHash);
        return null;
      }

      // Update access time
      metadata.lastAccessed = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      logger.info(`✓ Cache hit for track ${trackHash}`, {
        stemCount: Object.keys(stemPaths).length,
        format: metadata.format,
        cachedAt: metadata.cachedAt,
      });

      return stemPaths;
    } catch (error) {
      logger.error(`Error reading from stem cache for ${trackHash}:`, error);
      return null;
    }
  }

  /**
   * Store stems in cache
   * @param {string} trackHash - Track file hash
   * @param {Object} stemPaths - Object with stem types as keys and file paths as values
   * @param {string} format - Audio format (e.g., 'flac', 'wav')
   * @returns {Promise<Object>} Cached stem paths
   */
  async set(trackHash, stemPaths, format = 'flac') {
    if (!this.enabled) return stemPaths;

    try {
      const stemDir = path.join(this.cacheDir, trackHash);
      await fs.mkdir(stemDir, { recursive: true });

      // Copy stems to cache directory
      const cachedPaths = {};
      const metadata = {
        trackHash,
        format,
        stems: {},
        cachedAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      };

      for (const [stemType, sourcePath] of Object.entries(stemPaths)) {
        const filename = `${stemType}.${format}`;
        const destPath = path.join(stemDir, filename);

        // Copy file to cache
        await fs.copyFile(sourcePath, destPath);

        cachedPaths[stemType] = destPath;
        metadata.stems[stemType] = filename;
      }

      // Write metadata
      const metadataPath = path.join(stemDir, '.metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      logger.info(`✓ Cached stems for track ${trackHash}`, {
        stemCount: Object.keys(cachedPaths).length,
        format,
        cacheDir: stemDir,
      });

      // Enforce max cache size (FIFO eviction)
      await this.enforceMaxSize();

      return cachedPaths;
    } catch (error) {
      logger.error(`Error caching stems for ${trackHash}:`, error);
      // Return original paths on error
      return stemPaths;
    }
  }

  /**
   * Remove stems from cache
   * @param {string} trackHash - Track file hash
   */
  async remove(trackHash) {
    try {
      const stemDir = path.join(this.cacheDir, trackHash);
      await fs.rm(stemDir, { recursive: true, force: true });
      logger.debug(`Removed cached stems for ${trackHash}`);
    } catch (error) {
      logger.error(`Error removing cached stems for ${trackHash}:`, error);
    }
  }

  /**
   * Enforce max cache size by removing oldest entries (FIFO)
   */
  async enforceMaxSize() {
    try {
      // Get all cached stem directories
      const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });
      const stemDirs = entries.filter(e => e.isDirectory());

      if (stemDirs.length <= this.maxCacheSets) {
        return; // Cache size is within limit
      }

      // Read metadata for all cached sets to get timestamps
      const cacheEntries = [];

      for (const dir of stemDirs) {
        const trackHash = dir.name;
        const metadataPath = path.join(this.cacheDir, trackHash, '.metadata.json');

        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          cacheEntries.push({
            trackHash,
            cachedAt: new Date(metadata.cachedAt).getTime(),
            lastAccessed: new Date(metadata.lastAccessed || metadata.cachedAt).getTime(),
          });
        } catch (error) {
          // Invalid/corrupted entry, mark for removal
          cacheEntries.push({
            trackHash,
            cachedAt: 0,
            lastAccessed: 0,
          });
        }
      }

      // Sort by cachedAt (oldest first) - FIFO eviction
      cacheEntries.sort((a, b) => a.cachedAt - b.cachedAt);

      // Remove oldest entries until we're at max size
      const toRemove = cacheEntries.length - this.maxCacheSets;
      const removed = [];

      for (let i = 0; i < toRemove; i++) {
        const entry = cacheEntries[i];
        await this.remove(entry.trackHash);
        removed.push(entry.trackHash);
      }

      if (removed.length > 0) {
        logger.info(`Evicted ${removed.length} old stem sets from cache (FIFO)`, {
          removed: removed.slice(0, 3), // Log first 3
          currentSize: cacheEntries.length - removed.length,
          maxSize: this.maxCacheSets,
        });
      }
    } catch (error) {
      logger.error('Error enforcing stem cache max size:', error);
    }
  }

  /**
   * Clear entire cache
   */
  async clear() {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      await fs.mkdir(this.cacheDir, { recursive: true });
      logger.info('Stem cache cleared');
    } catch (error) {
      logger.error('Error clearing stem cache:', error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache stats
   */
  async getStats() {
    try {
      const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });
      const stemDirs = entries.filter(e => e.isDirectory());

      let totalSizeBytes = 0;
      const cacheEntries = [];

      for (const dir of stemDirs) {
        const trackHash = dir.name;
        const stemDir = path.join(this.cacheDir, trackHash);
        const metadataPath = path.join(stemDir, '.metadata.json');

        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(metadataContent);

          // Calculate directory size
          const files = await fs.readdir(stemDir);
          let dirSize = 0;
          for (const file of files) {
            const stat = await fs.stat(path.join(stemDir, file));
            dirSize += stat.size;
          }

          totalSizeBytes += dirSize;
          cacheEntries.push({
            trackHash,
            format: metadata.format,
            stemCount: Object.keys(metadata.stems).length,
            sizeBytes: dirSize,
            cachedAt: metadata.cachedAt,
            lastAccessed: metadata.lastAccessed,
          });
        } catch (error) {
          logger.warn(`Invalid cache entry: ${trackHash}`, error.message);
        }
      }

      return {
        enabled: this.enabled,
        currentSets: cacheEntries.length,
        maxSets: this.maxCacheSets,
        totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
        entries: cacheEntries.sort((a, b) => new Date(b.cachedAt) - new Date(a.cachedAt)),
      };
    } catch (error) {
      logger.error('Error getting stem cache stats:', error);
      return {
        enabled: this.enabled,
        currentSets: 0,
        maxSets: this.maxCacheSets,
        totalSizeMB: 0,
        entries: [],
        error: error.message,
      };
    }
  }
}

// Export singleton instance
const stemCacheService = new StemCacheService();
export default stemCacheService;
