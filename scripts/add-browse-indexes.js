#!/usr/bin/env node

/**
 * Add Optimized Indexes for Directory Browsing
 *
 * This script adds compound indexes to optimize directory browsing queries,
 * especially for LIKE pattern matching on relative_path.
 *
 * Indexes Added:
 * 1. idx_tracks_library_path - Compound index on (library_directory_id, relative_path)
 *    Optimizes: SELECT * FROM tracks WHERE library_directory_id = ? AND relative_path LIKE ?
 *
 * 2. idx_tracks_library_missing_path - Covering index for non-missing tracks
 *    Optimizes: Queries that filter by is_missing = 0 with library browsing
 *
 * Usage: node scripts/add-browse-indexes.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../data/library.db');

console.log('='.repeat(70));
console.log('Adding Optimized Indexes for Directory Browsing');
console.log('='.repeat(70));
console.log(`Database: ${DB_PATH}\n`);

// Open database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/**
 * Check if index exists
 */
function indexExists(indexName) {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name=?"
  ).get(indexName);
  return !!result;
}

/**
 * Add index if it doesn't exist
 */
function addIndexIfNotExists(indexName, sql) {
  if (indexExists(indexName)) {
    console.log(`✓ Index '${indexName}' already exists - skipping`);
    return false;
  }

  console.log(`Creating index '${indexName}'...`);
  const start = Date.now();
  db.prepare(sql).run();
  const duration = Date.now() - start;
  console.log(`✓ Created index '${indexName}' in ${duration}ms`);
  return true;
}

/**
 * Show index statistics
 */
function showStatistics() {
  console.log('\n' + '='.repeat(70));
  console.log('Index Statistics');
  console.log('='.repeat(70));

  const indexes = db.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type='index'
      AND tbl_name='tracks'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  console.log(`\nTotal indexes on 'tracks' table: ${indexes.length}\n`);
  for (const index of indexes) {
    console.log(`  ${index.name}`);
    if (index.sql) {
      console.log(`    ${index.sql}`);
    }
  }

  // Get database size
  const dbSize = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
  console.log(`\nDatabase size: ${(dbSize.size / 1024 / 1024).toFixed(2)} MB`);
}

// ============================================================================
// Main execution
// ============================================================================

try {
  let indexesAdded = 0;

  // Index 1: Compound index on library_directory_id + relative_path
  // This dramatically speeds up browsing queries with LIKE patterns
  if (addIndexIfNotExists(
    'idx_tracks_library_path',
    'CREATE INDEX idx_tracks_library_path ON tracks(library_directory_id, relative_path)'
  )) {
    indexesAdded++;
  }

  // Index 2: Compound index on library_directory_id + is_missing + relative_path
  // This is a covering index for the common browse query pattern
  // Optimizes: SELECT * FROM tracks WHERE library_directory_id = ? AND is_missing = 0 AND relative_path LIKE ?
  if (addIndexIfNotExists(
    'idx_tracks_browse',
    'CREATE INDEX idx_tracks_browse ON tracks(library_directory_id, is_missing, relative_path)'
  )) {
    indexesAdded++;
  }

  // Show statistics
  showStatistics();

  console.log('\n' + '='.repeat(70));
  if (indexesAdded > 0) {
    console.log(`✓ Successfully added ${indexesAdded} new index(es)!`);
  } else {
    console.log('✓ All indexes already exist - no changes needed');
  }
  console.log('='.repeat(70));

  // Run ANALYZE to update query planner statistics
  console.log('\nRunning ANALYZE to update query planner statistics...');
  db.prepare('ANALYZE').run();
  console.log('✓ Query planner statistics updated');

} catch (error) {
  console.error('\n✗ Failed to add indexes:', error);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
