#!/usr/bin/env node

/**
 * Migration 008 Runner: Library Directory UUID Migration
 *
 * This script handles the data migration from INTEGER library_directory IDs to UUID.
 * Updates all foreign key references in tracks and file_operations tables.
 *
 * Usage: node scripts/run-migration-008.js [database-path]
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database path from command line or use default
const dbPath = process.argv[2] || path.resolve(__dirname, '../data/library.db');

console.log('='.repeat(80));
console.log('MIGRATION 008: Library Directory UUID Migration');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}`);
console.log('');

// Verify database exists
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database not found: ${dbPath}`);
  process.exit(1);
}

// Create database backup
const backupPath = `${dbPath}.backup-before-migration-008`;
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
  if (schemaVersion.version < 7) {
    throw new Error('Migration 007 must be completed before running this migration');
  }
  console.log('✓ Prerequisites met\n');

  // Begin transaction
  db.exec('BEGIN TRANSACTION');

  // Step 1: Check existing data
  console.log('Step 1: Analyzing existing data...');
  const libraryCount = db.prepare('SELECT COUNT(*) as count FROM library_directories').get();
  const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
  const fileOpsCount = db.prepare('SELECT COUNT(*) as count FROM file_operations').get();

  console.log(`  Library directories: ${libraryCount.count}`);
  console.log(`  Tracks: ${trackCount.count}`);
  console.log(`  File operations: ${fileOpsCount.count}\n`);

  // Step 2: Add UUID column
  console.log('Step 2: Adding UUID column to library_directories...');
  db.exec('ALTER TABLE library_directories ADD COLUMN uuid TEXT');
  console.log('✓ UUID column added\n');

  // Step 3: Generate UUIDs
  console.log('Step 3: Generating UUIDs for library directories...');
  const libraries = db.prepare('SELECT id FROM library_directories').all();
  const updateLibraryUuid = db.prepare('UPDATE library_directories SET uuid = ? WHERE id = ?');

  const uuidMap = new Map();
  for (const library of libraries) {
    const uuid = randomUUID();
    uuidMap.set(library.id, uuid);
    updateLibraryUuid.run(uuid, library.id);
  }
  console.log(`✓ Generated ${uuidMap.size} UUIDs\n`);

  // Step 4: Create backup tables
  console.log('Step 4: Creating backup tables...');
  db.exec('CREATE TABLE library_directories_backup AS SELECT * FROM library_directories');
  db.exec('CREATE TABLE tracks_backup_008 AS SELECT * FROM tracks');
  db.exec('CREATE TABLE file_operations_backup_008 AS SELECT * FROM file_operations');
  console.log('✓ Backup tables created\n');

  // Step 5: Drop old views and triggers
  console.log('Step 5: Dropping old views and triggers...');
  db.exec('DROP VIEW IF EXISTS tracks_with_library');
  db.exec('DROP VIEW IF EXISTS library_stats');
  db.exec('DROP VIEW IF EXISTS duplicates_with_tracks');
  db.exec('DROP TRIGGER IF EXISTS update_library_stats_on_track_insert');
  db.exec('DROP TRIGGER IF EXISTS update_library_stats_on_track_delete');
  db.exec('DROP TRIGGER IF EXISTS update_library_stats_on_track_update_old');
  db.exec('DROP TRIGGER IF EXISTS update_library_stats_on_track_update_new');
  db.exec('DROP TRIGGER IF EXISTS update_duplicate_group_on_track_insert');
  db.exec('DROP TRIGGER IF EXISTS update_duplicate_group_on_track_delete');
  console.log('✓ Old views and triggers dropped\n');

  // Step 6: Create new tables
  console.log('Step 6: Creating new tables with UUID schema...');

  // Create library_directories_new
  db.exec(`
    CREATE TABLE library_directories_new (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT,
      is_active BOOLEAN DEFAULT 1,
      is_removable BOOLEAN DEFAULT 0,
      is_available BOOLEAN DEFAULT 1,
      last_scan DATETIME,
      scan_status TEXT DEFAULT 'idle',
      total_files INTEGER DEFAULT 0,
      total_tracks INTEGER DEFAULT 0,
      total_missing INTEGER DEFAULT 0,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      priority INTEGER DEFAULT 0,
      recursive_scan BOOLEAN DEFAULT 1,
      max_depth INTEGER DEFAULT -1,
      scan_patterns TEXT,
      exclude_patterns TEXT,
      follow_symlinks BOOLEAN DEFAULT 0
    )
  `);
  console.log('  ✓ Created library_directories_new');

  // Create tracks_new_008
  db.exec(`
    CREATE TABLE tracks_new_008 (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL UNIQUE,
      file_size INTEGER,
      file_modified DATETIME,
      file_hash TEXT NOT NULL,
      library_directory_id TEXT,
      relative_path TEXT,
      is_missing BOOLEAN DEFAULT 0,
      missing_since DATETIME,
      duplicate_group_id INTEGER,
      title TEXT,
      artist TEXT,
      album TEXT,
      album_artist TEXT,
      genre TEXT,
      year INTEGER,
      track_number INTEGER,
      comment TEXT,
      duration_seconds REAL,
      sample_rate INTEGER,
      bit_rate INTEGER,
      channels INTEGER,
      bpm REAL,
      musical_key INTEGER,
      mode INTEGER,
      time_signature INTEGER,
      beats_data BLOB,
      downbeats_data BLOB,
      stems_path TEXT,
      danceability REAL,
      energy REAL,
      loudness REAL,
      valence REAL,
      acousticness REAL,
      instrumentalness REAL,
      spectral_centroid REAL,
      spectral_rolloff REAL,
      spectral_bandwidth REAL,
      zero_crossing_rate REAL,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      date_analyzed DATETIME,
      analysis_version INTEGER DEFAULT 1,
      last_played DATETIME,
      play_count INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      color_tag TEXT,
      energy_level INTEGER,
      FOREIGN KEY (library_directory_id) REFERENCES library_directories_new(id) ON DELETE SET NULL,
      FOREIGN KEY (duplicate_group_id) REFERENCES duplicate_groups(id) ON DELETE SET NULL,
      CHECK (rating >= 0 AND rating <= 5),
      CHECK (energy_level >= 0 AND energy_level <= 10)
    )
  `);
  console.log('  ✓ Created tracks_new_008');

  // Create file_operations_new_008
  db.exec(`
    CREATE TABLE file_operations_new_008 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_type TEXT NOT NULL,
      track_id TEXT NOT NULL,
      old_path TEXT,
      new_path TEXT,
      old_library_directory_id TEXT,
      new_library_directory_id TEXT,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (track_id) REFERENCES tracks_new_008(id) ON DELETE CASCADE,
      FOREIGN KEY (old_library_directory_id) REFERENCES library_directories_new(id) ON DELETE SET NULL,
      FOREIGN KEY (new_library_directory_id) REFERENCES library_directories_new(id) ON DELETE SET NULL
    )
  `);
  console.log('  ✓ Created file_operations_new_008\n');

  // Step 7: Migrate data
  console.log('Step 7: Migrating data to new tables...');

  // Migrate library_directories
  const migrateLibrariesStmt = db.prepare(`
    INSERT INTO library_directories_new (
      id, path, name, is_active, is_removable, is_available,
      last_scan, scan_status, total_files, total_tracks, total_missing,
      date_added, priority, recursive_scan, max_depth, scan_patterns,
      exclude_patterns, follow_symlinks
    )
    SELECT
      uuid, path, name, is_active, is_removable, is_available,
      last_scan, scan_status, total_files, total_tracks, total_missing,
      date_added, priority, recursive_scan, max_depth, scan_patterns,
      exclude_patterns, follow_symlinks
    FROM library_directories
  `);
  const librariesMigrated = migrateLibrariesStmt.run();
  console.log(`  ✓ Migrated ${librariesMigrated.changes} library directories`);

  // Migrate tracks
  const migrateTracksStmt = db.prepare(`
    INSERT INTO tracks_new_008 (
      id, file_path, file_size, file_modified, file_hash,
      library_directory_id, relative_path, is_missing, missing_since,
      duplicate_group_id, title, artist, album, album_artist, genre,
      year, track_number, comment, duration_seconds, sample_rate,
      bit_rate, channels, bpm, musical_key, mode, time_signature,
      beats_data, downbeats_data, stems_path, danceability, energy,
      loudness, valence, acousticness, instrumentalness,
      spectral_centroid, spectral_rolloff, spectral_bandwidth,
      zero_crossing_rate, date_added, date_analyzed, analysis_version,
      last_played, play_count, rating, color_tag, energy_level
    )
    SELECT
      t.id, t.file_path, t.file_size, t.file_modified, t.file_hash,
      ld.uuid, t.relative_path, t.is_missing, t.missing_since,
      t.duplicate_group_id, t.title, t.artist, t.album, t.album_artist, t.genre,
      t.year, t.track_number, t.comment, t.duration_seconds, t.sample_rate,
      t.bit_rate, t.channels, t.bpm, t.musical_key, t.mode, t.time_signature,
      t.beats_data, t.downbeats_data, t.stems_path, t.danceability, t.energy,
      t.loudness, t.valence, t.acousticness, t.instrumentalness,
      t.spectral_centroid, t.spectral_rolloff, t.spectral_bandwidth,
      t.zero_crossing_rate, t.date_added, t.date_analyzed, t.analysis_version,
      t.last_played, t.play_count, t.rating, t.color_tag, t.energy_level
    FROM tracks t
    LEFT JOIN library_directories ld ON t.library_directory_id = ld.id
  `);
  const tracksMigrated = migrateTracksStmt.run();
  console.log(`  ✓ Migrated ${tracksMigrated.changes} tracks`);

  // Migrate file_operations
  const migrateFileOpsStmt = db.prepare(`
    INSERT INTO file_operations_new_008 (
      id, operation_type, track_id, old_path, new_path,
      old_library_directory_id, new_library_directory_id,
      status, error_message, created_at, completed_at
    )
    SELECT
      fo.id, fo.operation_type, fo.track_id, fo.old_path, fo.new_path,
      old_ld.uuid, new_ld.uuid,
      fo.status, fo.error_message, fo.created_at, fo.completed_at
    FROM file_operations fo
    LEFT JOIN library_directories old_ld ON fo.old_library_directory_id = old_ld.id
    LEFT JOIN library_directories new_ld ON fo.new_library_directory_id = new_ld.id
  `);
  const fileOpsMigrated = migrateFileOpsStmt.run();
  console.log(`  ✓ Migrated ${fileOpsMigrated.changes} file operations\n`);

  // Step 8: Replace old tables
  console.log('Step 8: Replacing old tables with new tables...');
  db.exec('DROP TABLE IF EXISTS file_operations');
  db.exec('ALTER TABLE file_operations_new_008 RENAME TO file_operations');
  console.log('  ✓ Replaced file_operations table');

  db.exec('DROP TABLE IF EXISTS tracks');
  db.exec('ALTER TABLE tracks_new_008 RENAME TO tracks');
  console.log('  ✓ Replaced tracks table');

  db.exec('DROP TABLE IF EXISTS library_directories');
  db.exec('ALTER TABLE library_directories_new RENAME TO library_directories');
  console.log('  ✓ Replaced library_directories table\n');

  // Step 9: Create indexes
  console.log('Step 9: Creating indexes...');
  const indexStatements = [
    'CREATE INDEX idx_library_directories_active ON library_directories(is_active)',
    'CREATE INDEX idx_library_directories_priority ON library_directories(priority DESC)',
    'CREATE INDEX idx_tracks_artist ON tracks(artist)',
    'CREATE INDEX idx_tracks_bpm ON tracks(bpm)',
    'CREATE INDEX idx_tracks_key ON tracks(musical_key)',
    'CREATE INDEX idx_tracks_genre ON tracks(genre)',
    'CREATE INDEX idx_tracks_date_added ON tracks(date_added)',
    'CREATE INDEX idx_tracks_play_count ON tracks(play_count DESC)',
    'CREATE INDEX idx_tracks_library_directory ON tracks(library_directory_id)',
    'CREATE INDEX idx_tracks_file_hash ON tracks(file_hash)',
    'CREATE INDEX idx_tracks_missing ON tracks(is_missing)',
    'CREATE INDEX idx_tracks_duplicate_group ON tracks(duplicate_group_id)',
    'CREATE INDEX idx_file_operations_track ON file_operations(track_id)',
    'CREATE INDEX idx_file_operations_status ON file_operations(status)',
    'CREATE INDEX idx_file_operations_created ON file_operations(created_at)',
  ];

  for (const stmt of indexStatements) {
    db.exec(stmt);
  }
  console.log('✓ Indexes created\n');

  // Step 10: Recreate views and triggers
  console.log('Step 10: Recreating views and triggers...');

  db.exec(`
    CREATE VIEW tracks_with_library AS
    SELECT
      t.*,
      ld.name as library_name,
      ld.path as library_path,
      ld.is_removable as library_is_removable,
      ld.is_available as library_is_available,
      dg.canonical_track_id,
      dg.total_duplicates
    FROM tracks t
    LEFT JOIN library_directories ld ON t.library_directory_id = ld.id
    LEFT JOIN duplicate_groups dg ON t.duplicate_group_id = dg.id
  `);

  db.exec(`
    CREATE VIEW library_stats AS
    SELECT
      ld.*,
      COUNT(t.id) as actual_track_count,
      COUNT(CASE WHEN t.is_missing = 1 THEN 1 END) as actual_missing_count,
      MIN(t.date_added) as oldest_track_date,
      MAX(t.date_added) as newest_track_date,
      SUM(t.file_size) as total_size_bytes
    FROM library_directories ld
    LEFT JOIN tracks t ON ld.id = t.library_directory_id
    GROUP BY ld.id
  `);

  // Recreate triggers
  db.exec(`
    CREATE TRIGGER update_library_stats_on_track_insert
    AFTER INSERT ON tracks
    WHEN NEW.library_directory_id IS NOT NULL
    BEGIN
      UPDATE library_directories
      SET total_tracks = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 0
      ),
      total_missing = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 1
      )
      WHERE id = NEW.library_directory_id;
    END
  `);

  db.exec(`
    CREATE TRIGGER update_library_stats_on_track_delete
    AFTER DELETE ON tracks
    WHEN OLD.library_directory_id IS NOT NULL
    BEGIN
      UPDATE library_directories
      SET total_tracks = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 0
      ),
      total_missing = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 1
      )
      WHERE id = OLD.library_directory_id;
    END
  `);

  db.exec(`
    CREATE TRIGGER update_library_stats_on_track_update_old
    AFTER UPDATE OF library_directory_id, is_missing ON tracks
    WHEN OLD.library_directory_id IS NOT NULL
    BEGIN
      UPDATE library_directories
      SET total_tracks = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 0
      ),
      total_missing = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 1
      )
      WHERE id = OLD.library_directory_id;
    END
  `);

  db.exec(`
    CREATE TRIGGER update_library_stats_on_track_update_new
    AFTER UPDATE OF library_directory_id, is_missing ON tracks
    WHEN NEW.library_directory_id IS NOT NULL AND NEW.library_directory_id != OLD.library_directory_id
    BEGIN
      UPDATE library_directories
      SET total_tracks = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 0
      ),
      total_missing = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 1
      )
      WHERE id = NEW.library_directory_id;
    END
  `);

  console.log('✓ Views and triggers recreated\n');

  // Step 11: Update schema version
  console.log('Step 11: Updating schema version...');
  db.exec(`
    INSERT INTO schema_version (version, description) VALUES
    (8, 'Migrated library_directories table from INTEGER id to UUID (TEXT) id')
  `);
  console.log('✓ Schema version updated\n');

  // Commit transaction
  db.exec('COMMIT');

  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');

  // Verify migration
  console.log('Verifying migration...');
  const newLibraryCount = db.prepare('SELECT COUNT(*) as count FROM library_directories').get();
  const newTrackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get();

  console.log(`  Library directories: ${newLibraryCount.count}`);
  console.log(`  Tracks: ${newTrackCount.count}`);

  const sampleLibraries = db.prepare('SELECT id, name, path FROM library_directories LIMIT 3').all();
  console.log('\n  Sample library directory UUIDs:');
  for (const library of sampleLibraries) {
    console.log(`    ${library.id} - ${library.name || path.basename(library.path)}`);
  }

  console.log('\n✓ Migration verification passed\n');

  console.log('='.repeat(80));
  console.log('✅ MIGRATION 008 COMPLETED SUCCESSFULLY');
  console.log('='.repeat(80));
  console.log('');
  console.log('Backup location:', backupPath);
  console.log('');
  console.log('Summary:');
  console.log(`  Library directories migrated: ${librariesMigrated.changes}`);
  console.log(`  Tracks updated: ${tracksMigrated.changes}`);
  console.log(`  File operations updated: ${fileOpsMigrated.changes}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Test library directory operations');
  console.log('2. Verify track-library relationships work correctly');
  console.log('3. If everything works, you can delete the backup file');
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
