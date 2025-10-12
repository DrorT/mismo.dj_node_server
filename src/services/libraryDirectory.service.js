import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import fs from 'fs-extra';
import path from 'path';

/**
 * Library Directory Service
 * Manages library directories - the root folders where music files are stored
 */

/**
 * Get all library directories
 * @param {Object} filters - Optional filters
 * @returns {Array} Array of library directories
 */
export function getAllDirectories(filters = {}) {
  try {
    const db = getDatabase();
    let sql = 'SELECT * FROM library_directories';
    const conditions = [];
    const params = [];

    if (filters.is_active !== undefined) {
      conditions.push('is_active = ?');
      params.push(filters.is_active ? 1 : 0);
    }

    if (filters.is_available !== undefined) {
      conditions.push('is_available = ?');
      params.push(filters.is_available ? 1 : 0);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY priority DESC, name ASC';

    const stmt = db.prepare(sql);
    const directories = stmt.all(...params);

    return directories.map(parseDirectory);
  } catch (error) {
    logger.error('Error getting library directories:', error);
    throw error;
  }
}

/**
 * Get library directory by ID
 * @param {number} id - Directory ID
 * @returns {Object|null} Library directory or null
 */
export function getDirectoryById(id) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM library_directories WHERE id = ?');
    const directory = stmt.get(id);

    return directory ? parseDirectory(directory) : null;
  } catch (error) {
    logger.error(`Error getting library directory ${id}:`, error);
    throw error;
  }
}

/**
 * Get library directory by path
 * @param {string} dirPath - Directory path
 * @returns {Object|null} Library directory or null
 */
export function getDirectoryByPath(dirPath) {
  try {
    const db = getDatabase();
    const normalized = path.resolve(dirPath);
    const stmt = db.prepare('SELECT * FROM library_directories WHERE path = ?');
    const directory = stmt.get(normalized);

    return directory ? parseDirectory(directory) : null;
  } catch (error) {
    logger.error(`Error getting library directory by path ${dirPath}:`, error);
    throw error;
  }
}

/**
 * Validate that a directory path doesn't overlap with existing library directories
 * @param {string} dirPath - Directory path to validate
 * @param {number} excludeId - Optional directory ID to exclude from validation (for updates)
 * @throws {Error} If path overlaps with existing directory
 */
export function validateNoOverlap(dirPath, excludeId = null) {
  const normalizedPath = path.resolve(dirPath);
  const allDirs = getAllDirectories();

  for (const dir of allDirs) {
    // Skip the directory we're updating
    if (excludeId && dir.id === excludeId) {
      continue;
    }

    const existingPath = path.resolve(dir.path);

    // Check if new path is inside existing directory
    if (normalizedPath.startsWith(existingPath + path.sep)) {
      throw new Error(
        `Cannot add directory '${normalizedPath}' because it is a subdirectory of existing library directory '${existingPath}' (${dir.name}). ` +
        `Nested library directories are not allowed. Consider using only the parent directory '${existingPath}'.`
      );
    }

    // Check if existing directory is inside new path
    if (existingPath.startsWith(normalizedPath + path.sep)) {
      throw new Error(
        `Cannot add directory '${normalizedPath}' because it contains existing library directory '${existingPath}' (${dir.name}). ` +
        `Nested library directories are not allowed. Consider removing the subdirectory first.`
      );
    }

    // Check if paths are exactly the same
    if (normalizedPath === existingPath) {
      throw new Error(`Directory already exists in library: ${normalizedPath}`);
    }
  }
}

/**
 * Create a new library directory
 * @param {Object} data - Directory data
 * @returns {Object} Created directory
 */
export function createDirectory(data) {
  try {
    const db = getDatabase();

    // Normalize and validate path
    const normalizedPath = path.resolve(data.path);

    // Check if path exists
    if (!fs.existsSync(normalizedPath)) {
      throw new Error(`Directory does not exist: ${normalizedPath}`);
    }

    // Check if directory is actually a directory
    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${normalizedPath}`);
    }

    // Validate no overlap with existing directories
    validateNoOverlap(normalizedPath);

    // Prepare data
    const dirData = {
      path: normalizedPath,
      name: data.name || path.basename(normalizedPath),
      is_active: data.is_active !== undefined ? data.is_active : true,
      is_removable: data.is_removable !== undefined ? data.is_removable : false,
      is_available: true,
      priority: data.priority || 0,
      recursive_scan: data.recursive_scan !== undefined ? data.recursive_scan : true,
      max_depth: data.max_depth !== undefined ? data.max_depth : -1,
      scan_patterns: data.scan_patterns ? JSON.stringify(data.scan_patterns) : null,
      exclude_patterns: data.exclude_patterns ? JSON.stringify(data.exclude_patterns) : null,
      follow_symlinks: data.follow_symlinks !== undefined ? data.follow_symlinks : false,
    };

    const stmt = db.prepare(`
      INSERT INTO library_directories (
        path, name, is_active, is_removable, is_available,
        priority, recursive_scan, max_depth, scan_patterns,
        exclude_patterns, follow_symlinks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      dirData.path,
      dirData.name,
      dirData.is_active ? 1 : 0,
      dirData.is_removable ? 1 : 0,
      dirData.is_available ? 1 : 0,
      dirData.priority,
      dirData.recursive_scan ? 1 : 0,
      dirData.max_depth,
      dirData.scan_patterns,
      dirData.exclude_patterns,
      dirData.follow_symlinks ? 1 : 0
    );

    logger.info(`Library directory created: ${dirData.name} (${dirData.path})`);

    return getDirectoryById(result.lastInsertRowid);
  } catch (error) {
    logger.error('Error creating library directory:', error);
    throw error;
  }
}

/**
 * Update library directory
 * @param {number} id - Directory ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated directory
 */
export function updateDirectory(id, updates) {
  try {
    const db = getDatabase();

    // Get existing directory
    const existing = getDirectoryById(id);
    if (!existing) {
      throw new Error(`Library directory not found: ${id}`);
    }

    // Build update query
    const fields = [];
    const params = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }

    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(updates.is_active ? 1 : 0);
    }

    if (updates.is_available !== undefined) {
      fields.push('is_available = ?');
      params.push(updates.is_available ? 1 : 0);
    }

    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      params.push(updates.priority);
    }

    if (updates.recursive_scan !== undefined) {
      fields.push('recursive_scan = ?');
      params.push(updates.recursive_scan ? 1 : 0);
    }

    if (updates.max_depth !== undefined) {
      fields.push('max_depth = ?');
      params.push(updates.max_depth);
    }

    if (updates.scan_patterns !== undefined) {
      fields.push('scan_patterns = ?');
      params.push(updates.scan_patterns ? JSON.stringify(updates.scan_patterns) : null);
    }

    if (updates.exclude_patterns !== undefined) {
      fields.push('exclude_patterns = ?');
      params.push(updates.exclude_patterns ? JSON.stringify(updates.exclude_patterns) : null);
    }

    if (updates.follow_symlinks !== undefined) {
      fields.push('follow_symlinks = ?');
      params.push(updates.follow_symlinks ? 1 : 0);
    }

    if (fields.length === 0) {
      return existing;
    }

    params.push(id);

    const stmt = db.prepare(`
      UPDATE library_directories
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...params);

    logger.info(`Library directory updated: ${id}`);

    return getDirectoryById(id);
  } catch (error) {
    logger.error(`Error updating library directory ${id}:`, error);
    throw error;
  }
}

/**
 * Delete library directory
 * @param {number} id - Directory ID
 * @param {boolean} deleteTracks - Whether to delete associated tracks
 * @returns {boolean} True if deleted
 */
export function deleteDirectory(id, deleteTracks = false) {
  try {
    const db = getDatabase();

    const directory = getDirectoryById(id);
    if (!directory) {
      return false;
    }

    if (deleteTracks) {
      // Delete all tracks in this directory
      const deleteTracksStmt = db.prepare('DELETE FROM tracks WHERE library_directory_id = ?');
      deleteTracksStmt.run(id);
      logger.info(`Deleted tracks for library directory: ${id}`);
    } else {
      // Set tracks to orphaned state (library_directory_id = NULL)
      const orphanTracksStmt = db.prepare(
        'UPDATE tracks SET library_directory_id = NULL, is_missing = 1 WHERE library_directory_id = ?'
      );
      orphanTracksStmt.run(id);
      logger.info(`Orphaned tracks for library directory: ${id}`);
    }

    // Delete the directory
    const stmt = db.prepare('DELETE FROM library_directories WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes > 0) {
      logger.info(`Library directory deleted: ${id} (${directory.name})`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Error deleting library directory ${id}:`, error);
    throw error;
  }
}

/**
 * Check directory availability (if path exists)
 * @param {number} id - Directory ID
 * @returns {Object} Updated directory with availability status
 */
export function checkAvailability(id) {
  try {
    const directory = getDirectoryById(id);
    if (!directory) {
      throw new Error(`Library directory not found: ${id}`);
    }

    const isAvailable = fs.existsSync(directory.path);

    if (isAvailable !== directory.is_available) {
      updateDirectory(id, { is_available: isAvailable });
      logger.info(`Library directory availability changed: ${id} -> ${isAvailable}`);
    }

    return getDirectoryById(id);
  } catch (error) {
    logger.error(`Error checking availability for directory ${id}:`, error);
    throw error;
  }
}

/**
 * Check availability for all directories
 * @returns {Array} Array of directories with updated availability
 */
export function checkAllAvailability() {
  try {
    const directories = getAllDirectories();
    const results = [];

    for (const dir of directories) {
      const updated = checkAvailability(dir.id);
      results.push(updated);
    }

    return results;
  } catch (error) {
    logger.error('Error checking all directory availability:', error);
    throw error;
  }
}

/**
 * Update scan status
 * @param {number} id - Directory ID
 * @param {string} status - Scan status (idle, scanning, error)
 * @returns {Object} Updated directory
 */
export function updateScanStatus(id, status) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE library_directories
      SET scan_status = ?, last_scan = CASE WHEN ? = 'idle' THEN CURRENT_TIMESTAMP ELSE last_scan END
      WHERE id = ?
    `);

    stmt.run(status, status, id);

    return getDirectoryById(id);
  } catch (error) {
    logger.error(`Error updating scan status for directory ${id}:`, error);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse directory data (convert JSON fields)
 * @param {Object} directory - Raw directory from database
 * @returns {Object} Parsed directory
 */
function parseDirectory(directory) {
  return {
    ...directory,
    is_active: Boolean(directory.is_active),
    is_removable: Boolean(directory.is_removable),
    is_available: Boolean(directory.is_available),
    recursive_scan: Boolean(directory.recursive_scan),
    follow_symlinks: Boolean(directory.follow_symlinks),
    scan_patterns: directory.scan_patterns ? JSON.parse(directory.scan_patterns) : null,
    exclude_patterns: directory.exclude_patterns ? JSON.parse(directory.exclude_patterns) : null,
  };
}

export default {
  getAllDirectories,
  getDirectoryById,
  getDirectoryByPath,
  createDirectory,
  updateDirectory,
  deleteDirectory,
  checkAvailability,
  checkAllAvailability,
  updateScanStatus,
  validateNoOverlap,
};
