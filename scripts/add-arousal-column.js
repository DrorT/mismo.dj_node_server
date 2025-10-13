#!/usr/bin/env node

/**
 * Add Arousal Column to Tracks Table
 *
 * This script adds the 'arousal' column to the tracks table to store
 * the arousal characteristic from audio analysis. Arousal measures the
 * energy/excitement level of a track (high arousal = energetic/exciting,
 * low arousal = calm/relaxed).
 *
 * Usage: node scripts/add-arousal-column.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../data/library.db');

console.log('='.repeat(70));
console.log('Adding Arousal Column to Tracks Table');
console.log('='.repeat(70));
console.log(`Database: ${DB_PATH}\n`);

// Open database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/**
 * Check if column exists
 */
function columnExists(tableName, columnName) {
  const result = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return result.some(col => col.name === columnName);
}

// ============================================================================
// Main execution
// ============================================================================

try {
  // Check if arousal column already exists
  if (columnExists('tracks', 'arousal')) {
    console.log('✓ Column "arousal" already exists - no migration needed');
  } else {
    console.log('Adding column "arousal" to tracks table...');

    // Add arousal column (REAL type for floating point values)
    db.prepare('ALTER TABLE tracks ADD COLUMN arousal REAL').run();

    console.log('✓ Successfully added "arousal" column');

    // Show column info
    console.log('\nColumn details:');
    const columnInfo = db.prepare("PRAGMA table_info(tracks)").all()
      .find(col => col.name === 'arousal');
    console.log(`  Name: ${columnInfo.name}`);
    console.log(`  Type: ${columnInfo.type}`);
    console.log(`  Nullable: ${columnInfo.notnull === 0 ? 'YES' : 'NO'}`);
    console.log(`  Default: ${columnInfo.dflt_value || 'NULL'}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✓ Migration completed successfully!');
  console.log('='.repeat(70));

} catch (error) {
  console.error('\n✗ Migration failed:', error);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
