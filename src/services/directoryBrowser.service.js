import { promises as fs } from 'fs';
import path from 'path';
import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import * as libraryDirService from './libraryDirectory.service.js';

/**
 * Directory Browser Service
 * Browse subdirectories and tracks within library directories
 */

/**
 * Browse a directory within a library directory
 * Returns folders and tracks at the specified path
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {string} relativePath - Relative path within library (e.g., "Artist/Album")
 * @returns {Promise<Object>} Directory contents with folders and tracks
 */
export async function browseDirectory(libraryDirectoryId, relativePath = '') {
  try {
    const db = getDatabase();

    // Get library directory
    const libraryDir = libraryDirService.getDirectoryById(libraryDirectoryId);

    if (!libraryDir) {
      throw new Error(`Library directory ${libraryDirectoryId} not found`);
    }

    // Build absolute path
    const absolutePath = relativePath
      ? path.join(libraryDir.path, relativePath)
      : libraryDir.path;

    // Validate path is within library directory (prevent traversal)
    const normalizedLibPath = path.normalize(libraryDir.path);
    const normalizedTargetPath = path.normalize(absolutePath);

    if (!normalizedTargetPath.startsWith(normalizedLibPath)) {
      throw new Error('Path traversal detected');
    }

    // Check if directory exists
    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Directory not found');
      }
      throw error;
    }

    // Get subdirectories
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const folders = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const folderRelPath = relativePath
          ? path.join(relativePath, entry.name)
          : entry.name;

        // Get folder statistics from database
        const stats = await getFolderStats(libraryDirectoryId, folderRelPath);

        folders.push({
          name: entry.name,
          relativePath: folderRelPath,
          trackCount: stats.trackCount,
          totalSize: stats.totalSize,
          hasSubfolders: stats.hasSubfolders,
        });
      }
    }

    // Get tracks at this level from database
    const tracks = getTracksAtPath(libraryDirectoryId, relativePath);

    // Calculate current directory stats
    const currentStats = await getCurrentDirectoryStats(libraryDirectoryId, relativePath);

    return {
      libraryDirectoryId,
      path: relativePath,
      absolutePath,
      folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
      tracks: tracks.sort((a, b) => (a.artist || '').localeCompare(b.artist || '')),
      stats: {
        totalTracks: currentStats.totalTracks,
        totalSize: currentStats.totalSize,
        folderCount: folders.length,
        trackCount: tracks.length,
      },
    };
  } catch (error) {
    logger.error(`Error browsing directory ${libraryDirectoryId}/${relativePath}:`, error);
    throw error;
  }
}

/**
 * Get statistics for a folder
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {string} folderRelPath - Relative path to folder
 * @returns {Promise<Object>} Folder statistics
 */
async function getFolderStats(libraryDirectoryId, folderRelPath) {
  const db = getDatabase();

  // Get all tracks in this folder and subfolders
  const stats = db.prepare(`
    SELECT
      COUNT(*) as trackCount,
      SUM(file_size) as totalSize
    FROM tracks
    WHERE library_directory_id = ?
      AND (
        relative_path = ?
        OR relative_path LIKE ?
      )
      AND is_missing = 0
  `).get(
    libraryDirectoryId,
    folderRelPath,
    `${folderRelPath}/%`
  );

  // Check if folder has subfolders (only count non-missing tracks)
  const hasSubfolders = db.prepare(`
    SELECT COUNT(DISTINCT
      SUBSTR(relative_path, ?, INSTR(SUBSTR(relative_path, ?), '/'))
    ) as count
    FROM tracks
    WHERE library_directory_id = ?
      AND relative_path LIKE ?
      AND relative_path != ?
      AND is_missing = 0
  `).get(
    folderRelPath.length + 2, // Skip folder path and /
    folderRelPath.length + 2,
    libraryDirectoryId,
    `${folderRelPath}/%`,
    folderRelPath
  );

  return {
    trackCount: stats.trackCount || 0,
    totalSize: stats.totalSize || 0,
    hasSubfolders: hasSubfolders.count > 0,
  };
}

/**
 * Get tracks at a specific path (not in subfolders)
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {string} relativePath - Relative path
 * @returns {Array} Tracks at this path
 */
function getTracksAtPath(libraryDirectoryId, relativePath) {
  const db = getDatabase();

  // If root path, get tracks with no directory separator in relative_path
  if (!relativePath) {
    return db.prepare(`
      SELECT * FROM tracks
      WHERE library_directory_id = ?
        AND (
          relative_path NOT LIKE '%/%'
          OR relative_path IS NULL
        )
        AND is_missing = 0
      ORDER BY artist, album, track_number
    `).all(libraryDirectoryId);
  }

  // Get tracks exactly at this path (not in subfolders)
  const tracks = db.prepare(`
    SELECT * FROM tracks
    WHERE library_directory_id = ?
      AND relative_path LIKE ?
      AND relative_path NOT LIKE ?
      AND is_missing = 0
    ORDER BY artist, album, track_number
  `).all(
    libraryDirectoryId,
    `${relativePath}/%`,
    `${relativePath}/%/%`
  );

  return tracks;
}

/**
 * Get current directory statistics (tracks at this level + all subfolders)
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {string} relativePath - Relative path
 * @returns {Promise<Object>} Statistics
 */
async function getCurrentDirectoryStats(libraryDirectoryId, relativePath) {
  const db = getDatabase();

  if (!relativePath) {
    // Root level - all tracks in library
    const stats = db.prepare(`
      SELECT
        COUNT(*) as totalTracks,
        SUM(file_size) as totalSize
      FROM tracks
      WHERE library_directory_id = ?
        AND is_missing = 0
    `).get(libraryDirectoryId);

    return {
      totalTracks: stats.totalTracks || 0,
      totalSize: stats.totalSize || 0,
    };
  }

  // Specific path - tracks at this level and below
  const stats = db.prepare(`
    SELECT
      COUNT(*) as totalTracks,
      SUM(file_size) as totalSize
    FROM tracks
    WHERE library_directory_id = ?
      AND (
        relative_path = ?
        OR relative_path LIKE ?
      )
      AND is_missing = 0
  `).get(
    libraryDirectoryId,
    relativePath,
    `${relativePath}/%`
  );

  return {
    totalTracks: stats.totalTracks || 0,
    totalSize: stats.totalSize || 0,
  };
}

/**
 * Get breadcrumb path for navigation
 *
 * @param {string} relativePath - Current relative path
 * @returns {Array} Breadcrumb items
 */
export function getBreadcrumbs(relativePath) {
  if (!relativePath) {
    return [{ name: 'Library', path: '' }];
  }

  const parts = relativePath.split('/');
  const breadcrumbs = [{ name: 'Library', path: '' }];

  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    breadcrumbs.push({
      name: part,
      path: currentPath,
    });
  }

  return breadcrumbs;
}

/**
 * Search for folders by name within a library directory
 *
 * @param {number} libraryDirectoryId - Library directory ID
 * @param {string} searchQuery - Search query
 * @returns {Array} Matching folders
 */
export function searchFolders(libraryDirectoryId, searchQuery) {
  const db = getDatabase();

  // Get unique folder paths that match the query
  const folders = db.prepare(`
    SELECT DISTINCT
      relative_path
    FROM tracks
    WHERE library_directory_id = ?
      AND relative_path LIKE ?
      AND is_missing = 0
    LIMIT 100
  `).all(libraryDirectoryId, `%${searchQuery}%`);

  return folders.map(f => {
    const parts = f.relative_path.split('/');
    return {
      relativePath: f.relative_path,
      name: parts[parts.length - 1] || parts[parts.length - 2],
      depth: parts.length,
    };
  });
}

export default {
  browseDirectory,
  getBreadcrumbs,
  searchFolders,
};
