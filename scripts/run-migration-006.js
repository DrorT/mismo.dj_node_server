#!/usr/bin/env node

/**
 * Migration 006 Runner: Waveform Hash-Based Storage
 *
 * This script migrates the waveforms table from track_id to file_hash as the primary identifier.
 * This eliminates duplicate waveform storage for identical audio files.
 *
 * Usage: node scripts/run-migration-006.js [database-path]
 *
 * Prerequisites: Migration 005 (UUID track IDs) must be completed first.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database path from command line or use default
const dbPath = process.argv[2] || path.resolve(__dirname, '../data/library.db');

console.log('='.repeat(80));
console.log('MIGRATION 006: Waveform Hash-Based Storage');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}`);
console.log('');

// Verify database exists
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database not found: ${dbPath}`);
  process.exit(1);
}

// Create database backup
const backupPath = `${dbPath}.backup-before-migration-006`;
console.log(`Creating backup: ${backupPath}`);
try {
  fs.copyFileSync(dbPath, backupPath);
  console.log('✓ Backup created successfully\n');
} catch (error) {
  console.error(`❌ Failed to create backup: ${error.message}`);
  process.exit(1);
}

// Open database connection
const db = new Database(dbPath);
db.pragma('foreign_keys = OFF'); // Temporarily disable for migration

try {
  console.log('Starting migration...\n');

  // Verify prerequisites
  console.log('Checking prerequisites...');
  const schemaVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
  if (schemaVersion.version < 5) {
    throw new Error('Migration 005 (UUID track IDs) must be completed before running this migration');
  }

  // Check if tracks.id is UUID (TEXT)
  const trackIdType = db.prepare("SELECT typeof(id) as type FROM tracks LIMIT 1").get();
  if (trackIdType.type !== 'text') {
    throw new Error('tracks.id must be UUID (TEXT) type. Run migration 005 first.');
  }
  console.log('✓ Prerequisites met\n');

  // Begin transaction
  db.exec('BEGIN TRANSACTION');

  // Step 1: Analyze current waveform data
  console.log('Step 1: Analyzing current waveform data...');
  const waveformCount = db.prepare('SELECT COUNT(*) as count FROM waveforms').get();
  console.log(`  Current waveforms: ${waveformCount.count}`);

  // Count how many unique file_hash values exist in waveforms
  const uniqueHashCount = db.prepare(`
    SELECT COUNT(DISTINCT t.file_hash) as count
    FROM waveforms w
    INNER JOIN tracks t ON w.track_id = t.id
  `).get();
  console.log(`  Unique audio hashes: ${uniqueHashCount.count}`);

  const estimatedDuplicates = waveformCount.count - uniqueHashCount.count;
  console.log(`  Estimated duplicate waveforms: ${estimatedDuplicates}`);
  console.log(`  Estimated space savings: ${((estimatedDuplicates / waveformCount.count) * 100).toFixed(1)}%\n`);

  // Step 2: Create backup
  console.log('Step 2: Creating backup table...');
  db.exec('CREATE TABLE waveforms_backup_006 AS SELECT * FROM waveforms');
  console.log('✓ Backup table created\n');

  // Step 3: Create new waveforms table
  console.log('Step 3: Creating new waveforms table with hash-based schema...');
  db.exec(`
    CREATE TABLE waveforms_new (
      file_hash TEXT NOT NULL,
      zoom_level INTEGER NOT NULL,
      sample_rate INTEGER,
      samples_per_point INTEGER,
      num_points INTEGER,
      data BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (file_hash, zoom_level)
    )
  `);
  console.log('✓ New table created\n');

  // Step 4: Migrate data
  console.log('Step 4: Migrating waveform data...');
  const migrateResult = db.prepare(`
    INSERT INTO waveforms_new (
      file_hash,
      zoom_level,
      sample_rate,
      samples_per_point,
      num_points,
      data
    )
    SELECT DISTINCT
      t.file_hash,
      w.zoom_level,
      w.sample_rate,
      w.samples_per_point,
      w.num_points,
      w.data
    FROM waveforms w
    INNER JOIN tracks t ON w.track_id = t.id
    GROUP BY t.file_hash, w.zoom_level
    HAVING w.id = MAX(w.id)
  `).run();

  console.log(`  ✓ Migrated ${migrateResult.changes} unique waveforms`);
  console.log(`  Eliminated ${waveformCount.count - migrateResult.changes} duplicates\n`);

  // Step 5: Replace old table
  console.log('Step 5: Replacing old table with new table...');
  db.exec('DROP TABLE waveforms');
  db.exec('ALTER TABLE waveforms_new RENAME TO waveforms');
  console.log('✓ Table replaced\n');

  // Step 6: Create indexes
  console.log('Step 6: Creating indexes...');
  db.exec('CREATE INDEX idx_waveforms_hash ON waveforms(file_hash)');
  console.log('✓ Indexes created\n');

  // Step 7: Update schema version
  console.log('Step 7: Updating schema version...');
  db.exec(`
    INSERT INTO schema_version (version, description) VALUES
    (6, 'Migrated waveforms table to use file_hash instead of track_id')
  `);
  console.log('✓ Schema version updated\n');

  // Commit transaction
  db.exec('COMMIT');

  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');

  // Verify migration
  console.log('Verifying migration...');
  const newWaveformCount = db.prepare('SELECT COUNT(*) as count FROM waveforms').get();
  const hashCount = db.prepare('SELECT COUNT(DISTINCT file_hash) as count FROM waveforms').get();

  console.log(`  Total waveforms: ${newWaveformCount.count}`);
  console.log(`  Unique hashes: ${hashCount.count}`);

  // Sample a few waveforms
  const sampleWaveforms = db.prepare(`
    SELECT w.file_hash, w.zoom_level, w.num_points, t.title, t.artist
    FROM waveforms w
    INNER JOIN tracks t ON w.file_hash = t.file_hash
    LIMIT 3
  `).all();

  console.log('\n  Sample waveforms:');
  for (const wf of sampleWaveforms) {
    console.log(`    ${wf.file_hash.substring(0, 12)}... (zoom ${wf.zoom_level}) - ${wf.artist} - ${wf.title}`);
  }

  console.log('\n✓ Migration verification passed\n');

  console.log('='.repeat(80));
  console.log('✅ MIGRATION 006 COMPLETED SUCCESSFULLY');
  console.log('='.repeat(80));
  console.log('');
  console.log('Backup location:', backupPath);
  console.log('');
  console.log('Summary:');
  console.log(`  Before: ${waveformCount.count} waveforms`);
  console.log(`  After:  ${newWaveformCount.count} waveforms`);
  console.log(`  Saved:  ${waveformCount.count - newWaveformCount.count} duplicate waveforms`);
  console.log(`  Space saved: ${((waveformCount.count - newWaveformCount.count) / waveformCount.count * 100).toFixed(1)}%`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Test waveform retrieval in your application');
  console.log('2. Verify waveforms display correctly for duplicate tracks');
  console.log('3. If everything works, you can delete the backup file');
  console.log('4. If issues occur, restore from backup and report the problem');
  console.log('');

} catch (error) {
  console.error('\n❌ MIGRATION FAILED:', error.message);
  console.error('Stack trace:', error.stack);

  try {
    console.log('\nAttempting rollback...');
    db.exec('ROLLBACK');
    console.log('✓ Transaction rolled back');
  } catch (rollbackError) {
    console.error('❌ Rollback failed:', rollbackError.message);
  }

  console.log('\nRestoring from backup...');
  try {
    fs.copyFileSync(backupPath, dbPath);
    console.log('✓ Database restored from backup');
  } catch (restoreError) {
    console.error('❌ Failed to restore from backup:', restoreError.message);
    console.error('Manual restore required from:', backupPath);
  }

  process.exit(1);
} finally {
  db.close();
}
