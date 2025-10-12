#!/usr/bin/env node

/**
 * Migration Script: Merge Overlapping Library Directories
 *
 * This script detects and merges nested library directories.
 * It reassigns all tracks from child directories to their parent directories
 * and updates relative paths accordingly.
 *
 * Problem:
 * - Library directory 3: /home/chester/Music (parent)
 * - Library directory 4: /home/chester/Music/test (child)
 *
 * Solution:
 * - Reassign all tracks from directory 4 to directory 3
 * - Update relative paths to include "test/" prefix
 * - Remove directory 4 entry
 *
 * Usage: node scripts/migrate-overlapping-directories.js [--dry-run]
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../data/library.db');
const isDryRun = process.argv.includes('--dry-run');

console.log('='.repeat(70));
console.log('Migration: Merge Overlapping Library Directories');
console.log('='.repeat(70));
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will modify database)'}`);
console.log(`Database: ${DB_PATH}`);
console.log('');

// Open database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/**
 * Find overlapping directories
 * @returns {Array} Array of {parent, child} pairs
 */
function findOverlappingDirectories() {
  const directories = db.prepare('SELECT id, path, name FROM library_directories ORDER BY path').all();
  const overlaps = [];

  for (let i = 0; i < directories.length; i++) {
    for (let j = 0; j < directories.length; j++) {
      if (i === j) continue;

      const parentPath = path.resolve(directories[i].path);
      const childPath = path.resolve(directories[j].path);

      // Check if j is a subdirectory of i
      if (childPath.startsWith(parentPath + path.sep)) {
        overlaps.push({
          parent: directories[i],
          child: directories[j],
          relativePath: path.relative(parentPath, childPath),
        });
      }
    }
  }

  return overlaps;
}

/**
 * Merge child directory into parent
 * @param {Object} parent - Parent directory
 * @param {Object} child - Child directory
 * @param {string} relativePath - Relative path from parent to child
 */
function mergeDirectories(parent, child, relativePath) {
  console.log(`\nMerging directory ${child.id} (${child.path}) into ${parent.id} (${parent.path})`);
  console.log(`Relative path: ${relativePath}`);

  // Get tracks from child directory
  const childTracks = db.prepare('SELECT id, relative_path FROM tracks WHERE library_directory_id = ?').all(child.id);

  console.log(`Found ${childTracks.length} tracks in child directory`);

  if (childTracks.length === 0) {
    console.log('No tracks to migrate');
  } else {
    // Update tracks
    const updateStmt = db.prepare(`
      UPDATE tracks
      SET library_directory_id = ?,
          relative_path = ?
      WHERE id = ?
    `);

    const transaction = db.transaction((tracks) => {
      for (const track of tracks) {
        // Calculate new relative path
        const newRelativePath = track.relative_path
          ? path.join(relativePath, track.relative_path)
          : relativePath;

        if (isDryRun) {
          console.log(`  [DRY RUN] Would update track ${track.id}: ${track.relative_path} -> ${newRelativePath}`);
        } else {
          updateStmt.run(parent.id, newRelativePath, track.id);
          console.log(`  Updated track ${track.id}: ${track.relative_path} -> ${newRelativePath}`);
        }
      }
    });

    transaction(childTracks);
  }

  // Delete child directory
  if (isDryRun) {
    console.log(`[DRY RUN] Would delete library directory ${child.id} (${child.name})`);
  } else {
    const deleteStmt = db.prepare('DELETE FROM library_directories WHERE id = ?');
    deleteStmt.run(child.id);
    console.log(`✓ Deleted library directory ${child.id} (${child.name})`);
  }
}

/**
 * Verify migration
 */
function verifyMigration() {
  console.log('\n' + '='.repeat(70));
  console.log('Verification');
  console.log('='.repeat(70));

  const overlaps = findOverlappingDirectories();

  if (overlaps.length === 0) {
    console.log('✓ No overlapping directories found');
    return true;
  } else {
    console.log(`✗ Still found ${overlaps.length} overlapping directories:`);
    for (const overlap of overlaps) {
      console.log(`  - ${overlap.child.path} inside ${overlap.parent.path}`);
    }
    return false;
  }
}

/**
 * Show statistics
 */
function showStatistics() {
  console.log('\n' + '='.repeat(70));
  console.log('Current Library Statistics');
  console.log('='.repeat(70));

  const directories = db.prepare(`
    SELECT
      ld.id,
      ld.path,
      ld.name,
      COUNT(t.id) as track_count
    FROM library_directories ld
    LEFT JOIN tracks t ON ld.id = t.library_directory_id
    GROUP BY ld.id
    ORDER BY ld.id
  `).all();

  console.log('\nLibrary Directories:');
  for (const dir of directories) {
    console.log(`  ${dir.id}. ${dir.name}`);
    console.log(`     Path: ${dir.path}`);
    console.log(`     Tracks: ${dir.track_count}`);
  }

  const totalTracks = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
  console.log(`\nTotal tracks: ${totalTracks.count}`);
}

// ============================================================================
// Main execution
// ============================================================================

try {
  // Show initial statistics
  showStatistics();

  // Find overlapping directories
  console.log('\n' + '='.repeat(70));
  console.log('Detecting Overlapping Directories');
  console.log('='.repeat(70));

  const overlaps = findOverlappingDirectories();

  if (overlaps.length === 0) {
    console.log('✓ No overlapping directories found. Migration not needed.');
    process.exit(0);
  }

  console.log(`Found ${overlaps.length} overlapping directory pair(s):\n`);
  for (const overlap of overlaps) {
    console.log(`  Parent: ${overlap.parent.id} - ${overlap.parent.path}`);
    console.log(`  Child:  ${overlap.child.id} - ${overlap.child.path}`);
    console.log(`  Relative: ${overlap.relativePath}\n`);
  }

  // Perform migration
  console.log('='.repeat(70));
  console.log('Migration');
  console.log('='.repeat(70));

  for (const overlap of overlaps) {
    mergeDirectories(overlap.parent, overlap.child, overlap.relativePath);
  }

  // Verify
  if (!isDryRun) {
    const success = verifyMigration();

    if (success) {
      showStatistics();
      console.log('\n' + '='.repeat(70));
      console.log('✓ Migration completed successfully!');
      console.log('='.repeat(70));
    } else {
      console.error('\n✗ Migration verification failed. Please check the database.');
      process.exit(1);
    }
  } else {
    console.log('\n' + '='.repeat(70));
    console.log('DRY RUN complete. No changes were made.');
    console.log('Run without --dry-run to apply changes.');
    console.log('='.repeat(70));
  }

} catch (error) {
  console.error('\n✗ Migration failed:', error);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
