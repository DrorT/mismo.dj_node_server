import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Stem Cache Service
 * Caches the last N stem sets locally to avoid re-requesting from analysis server
 *
 * Features:
 * - LRU eviction: least recently used stems deleted when cache is full
 * - Track hash-based lookup
 * - Automatic cache directory management
 * - Configurable cache size
 * - Protection for stems loaded in audio engine decks
 *
 * Cache structure:
 * data/stem_cache/
 *   {track_hash}/
 *     vocals.wav
 *     drums.wav
 *     bass.wav
 *     other.wav
 *     .metadata.json  (timestamp, format, lastAccessed, etc.)
 */

class StemCacheService {
  constructor() {
    this.cacheDir = path.join(process.cwd(), 'data', 'stem_cache');
    this.maxCacheSets = parseInt(process.env.STEM_CACHE_MAX_SETS || '10'); // Cache last 10 stem sets
    this.enabled = process.env.STEM_CACHE_ENABLED !== 'false'; // Enabled by default

    // Services will be injected during initialization
    this.trackService = null;
    this.audioServerClientService = null;
  }

  /**
   * Initialize with required services
   * @param {Object} services - Required services
   * @param {Object} services.trackService - Track service for database queries
   * @param {Object} services.audioServerClientService - Audio server client for deck state
   */
  initialize({ trackService, audioServerClientService }) {
    this.trackService = trackService;
    this.audioServerClientService = audioServerClientService;
    logger.debug('StemCacheService initialized with services');
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
   * Enforce max cache size by removing least recently used entries (LRU)
   * Protects stems that are currently loaded in audio engine decks
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
            isLoaded: this.isLoaded(trackHash), // Check if currently loaded in deck
          });
        } catch (error) {
          // Invalid/corrupted entry, mark for removal (unless loaded)
          cacheEntries.push({
            trackHash,
            cachedAt: 0,
            lastAccessed: 0,
            isLoaded: this.isLoaded(trackHash),
          });
        }
      }

      // Sort by lastAccessed (least recently used first) - LRU eviction
      // Loaded stems are treated as "accessed now" to prevent eviction
      cacheEntries.sort((a, b) => {
        // Loaded stems always come last (most recently used)
        if (a.isLoaded && !b.isLoaded) return 1;
        if (!a.isLoaded && b.isLoaded) return -1;

        // Both loaded or both not loaded: sort by lastAccessed
        return a.lastAccessed - b.lastAccessed;
      });

      // Remove least recently used entries until we're at max size
      // Skip loaded stems (they're protected)
      const toRemove = cacheEntries.length - this.maxCacheSets;
      const removed = [];
      const skipped = [];

      for (let i = 0; i < cacheEntries.length && removed.length < toRemove; i++) {
        const entry = cacheEntries[i];

        if (entry.isLoaded) {
          // Skip loaded stems - they're in use by audio engine
          skipped.push(entry.trackHash);
          logger.info(`Skipping eviction of loaded stems: ${entry.trackHash}`);
          continue;
        }

        await this.remove(entry.trackHash);
        removed.push(entry.trackHash);
      }

      if (removed.length > 0) {
        logger.info(`Evicted ${removed.length} stem sets from cache (LRU)`, {
          removed: removed.slice(0, 3), // Log first 3
          skipped: skipped.length,
          currentSize: cacheEntries.length - removed.length,
          maxSize: this.maxCacheSets,
        });
      }

      if (skipped.length > 0 && removed.length < toRemove) {
        logger.warn(
          `Cache is over limit but cannot evict loaded stems (${skipped.length} protected). ` +
          `Consider increasing STEM_CACHE_MAX_SETS or unloading tracks from decks.`
        );
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
   * Check if stems are currently loaded in audio engine
   * Stems are considered loaded if their track is on deck A or B
   * @param {string} trackHash - Track file hash
   * @returns {boolean}
   */
  isLoaded(trackHash) {
    if (!this.trackService || !this.audioServerClientService) {
      // Services not initialized yet, assume not loaded
      return false;
    }

    try {
      // Get deck state from audio server client
      const deckState = this.audioServerClientService.deckState;
      if (!deckState) return false;

      // Check if this track (by hash) is loaded on deck A or B
      for (const deck of ['A', 'B']) {
        const trackId = deckState[deck]?.trackId;
        if (!trackId) continue;

        // Get track by UUID to check file_hash
        const track = this.trackService.getTrackById(trackId);
        if (track && track.file_hash === trackHash) {
          return true; // This track is loaded on this deck
        }
      }

      return false;
    } catch (error) {
      logger.error(`Error checking if stems are loaded for ${trackHash}:`, error);
      return false; // Assume not loaded on error
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

      // Count how many cached stems are currently loaded
      const loadedCount = cacheEntries.filter(e => this.isLoaded(e.trackHash)).length;

      return {
        enabled: this.enabled,
        currentSets: cacheEntries.length,
        maxSets: this.maxCacheSets,
        totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
        loadedStems: loadedCount,
        entries: cacheEntries.sort((a, b) => new Date(b.lastAccessed || b.cachedAt) - new Date(a.lastAccessed || a.cachedAt)),
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
