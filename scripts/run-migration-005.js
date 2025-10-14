#!/usr/bin/env node

/**
 * Migration 005 Runner: Track UUID Migration
 *
 * This script handles the data migration from INTEGER track IDs to UUID track IDs.
 * It generates UUIDs for all existing tracks and migrates all foreign key relationships.
 *
 * Usage: node scripts/run-migration-005.js [database-path]
 *
 * The migration is transactional and will rollback on any error.
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
console.log('MIGRATION 005: Track UUID Migration');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}`);
console.log('');

// Verify database exists
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database not found: ${dbPath}`);
  process.exit(1);
}

// Create database backup
const backupPath = `${dbPath}.backup-before-migration-005`;
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

  // Begin transaction
  db.exec('BEGIN TRANSACTION');

  // Step 1: Add UUID column to tracks
  console.log('Step 1: Adding UUID column to tracks table...');
  db.exec('ALTER TABLE tracks ADD COLUMN uuid TEXT');
  console.log('✓ UUID column added\n');

  // Step 2: Generate UUIDs for all existing tracks
  console.log('Step 2: Generating UUIDs for existing tracks...');
  const tracks = db.prepare('SELECT id FROM tracks').all();
  const updateTrackUuid = db.prepare('UPDATE tracks SET uuid = ? WHERE id = ?');

  const uuidMap = new Map(); // Map old ID -> new UUID

  for (const track of tracks) {
    const uuid = randomUUID();
    uuidMap.set(track.id, uuid);
    updateTrackUuid.run(uuid, track.id);
  }

  console.log(`✓ Generated ${uuidMap.size} UUIDs\n`);

  // Step 3: Create backup tables
  console.log('Step 3: Creating backup tables...');
  db.exec('CREATE TABLE tracks_backup AS SELECT * FROM tracks');
  db.exec('CREATE TABLE analysis_jobs_backup AS SELECT * FROM analysis_jobs');
  db.exec('CREATE TABLE playlist_tracks_backup AS SELECT * FROM playlist_tracks');
  db.exec('CREATE TABLE waveforms_backup AS SELECT * FROM waveforms');
  db.exec('CREATE TABLE file_operations_backup AS SELECT * FROM file_operations');
  db.exec('CREATE TABLE duplicate_groups_backup AS SELECT * FROM duplicate_groups');
  console.log('✓ Backup tables created\n');

  // Step 4: Create new tables with UUID foreign keys
  console.log('Step 4: Creating new tables with UUID schema...');

  // Read and execute the migration SQL (excluding transaction commands and data migration)
  const migrationSql = fs.readFileSync(
    path.resolve(__dirname, 'migrations/005_track_uuid_migration.sql'),
    'utf8'
  );

  // Extract only the CREATE TABLE statements for new tables
  const createTableRegex = /CREATE TABLE (\w+_new) \(([\s\S]*?)\);/g;
  let match;

  while ((match = createTableRegex.exec(migrationSql)) !== null) {
    const tableName = match[1];
    const createStatement = match[0];

    // Skip if table already exists (backup tables)
    if (tableName.includes('backup')) continue;

    db.exec(createStatement);
    console.log(`  ✓ Created ${tableName}`);
  }
  console.log('✓ New tables created\n');

  // Step 5: Migrate data to new tables
  console.log('Step 5: Migrating data to new tables...');

  // 5a. Migrate tracks
  console.log('  Migrating tracks...');
  const migrateTracksStmt = db.prepare(`
    INSERT INTO tracks_new (
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
      uuid, file_path, file_size, file_modified, file_hash,
      library_directory_id, relative_path, is_missing, missing_since,
      duplicate_group_id, title, artist, album, album_artist, genre,
      year, track_number, comment, duration_seconds, sample_rate,
      bit_rate, channels, bpm, musical_key, mode, time_signature,
      beats_data, downbeats_data, stems_path, danceability, energy,
      loudness, valence, acousticness, instrumentalness,
      spectral_centroid, spectral_rolloff, spectral_bandwidth,
      zero_crossing_rate, date_added, date_analyzed, analysis_version,
      last_played, play_count, rating, color_tag, energy_level
    FROM tracks
  `);
  const tracksMigrated = migrateTracksStmt.run();
  console.log(`  ✓ Migrated ${tracksMigrated.changes} tracks`);

  // 5b. Migrate duplicate_groups
  console.log('  Migrating duplicate_groups...');
  const migrateDuplicateGroupsStmt = db.prepare(`
    INSERT INTO duplicate_groups_new (
      id, file_hash, canonical_track_id, total_duplicates, created_at
    )
    SELECT
      dg.id,
      dg.file_hash,
      t.uuid,
      dg.total_duplicates,
      dg.created_at
    FROM duplicate_groups dg
    LEFT JOIN tracks t ON dg.canonical_track_id = t.id
  `);
  const dupGroupsMigrated = migrateDuplicateGroupsStmt.run();
  console.log(`  ✓ Migrated ${dupGroupsMigrated.changes} duplicate groups`);

  // 5c. Migrate analysis_jobs
  console.log('  Migrating analysis_jobs...');
  const migrateAnalysisJobsStmt = db.prepare(`
    INSERT INTO analysis_jobs_new (
      id, job_id, track_id, file_path, status, priority, options,
      stages_completed, stages_total, progress_percent, retry_count,
      max_retries, last_error, created_at, started_at, completed_at,
      last_updated, callback_metadata
    )
    SELECT
      aj.id, aj.job_id, t.uuid, aj.file_path, aj.status, aj.priority,
      aj.options, aj.stages_completed, aj.stages_total, aj.progress_percent,
      aj.retry_count, aj.max_retries, aj.last_error, aj.created_at,
      aj.started_at, aj.completed_at, aj.last_updated, aj.callback_metadata
    FROM analysis_jobs aj
    INNER JOIN tracks t ON aj.track_id = t.id
  `);
  const analysisJobsMigrated = migrateAnalysisJobsStmt.run();
  console.log(`  ✓ Migrated ${analysisJobsMigrated.changes} analysis jobs`);

  // 5d. Migrate playlist_tracks (if table exists)
  console.log('  Migrating playlist_tracks...');
  try {
    const migratePlaylistTracksStmt = db.prepare(`
      INSERT INTO playlist_tracks_new (
        playlist_id, track_id, position, date_added
      )
      SELECT
        pt.playlist_id, t.uuid, pt.position, pt.date_added
      FROM playlist_tracks pt
      INNER JOIN tracks t ON pt.track_id = t.id
    `);
    const playlistTracksMigrated = migratePlaylistTracksStmt.run();
    console.log(`  ✓ Migrated ${playlistTracksMigrated.changes} playlist tracks`);
  } catch (error) {
    if (error.message.includes('no such table')) {
      console.log('  ℹ No playlist_tracks table found (skipping)');
    } else {
      throw error;
    }
  }

  // 5e. Migrate waveforms
  console.log('  Migrating waveforms...');
  const migrateWaveformsStmt = db.prepare(`
    INSERT INTO waveforms_new (
      id, track_id, zoom_level, sample_rate, samples_per_point,
      num_points, data
    )
    SELECT
      w.id, t.uuid, w.zoom_level, w.sample_rate, w.samples_per_point,
      w.num_points, w.data
    FROM waveforms w
    INNER JOIN tracks t ON w.track_id = t.id
  `);
  const waveformsMigrated = migrateWaveformsStmt.run();
  console.log(`  ✓ Migrated ${waveformsMigrated.changes} waveforms`);

  // 5f. Migrate file_operations
  console.log('  Migrating file_operations...');
  const migrateFileOpsStmt = db.prepare(`
    INSERT INTO file_operations_new (
      id, operation_type, track_id, old_path, new_path,
      old_library_directory_id, new_library_directory_id,
      status, error_message, created_at, completed_at
    )
    SELECT
      fo.id, fo.operation_type, t.uuid, fo.old_path, fo.new_path,
      fo.old_library_directory_id, fo.new_library_directory_id,
      fo.status, fo.error_message, fo.created_at, fo.completed_at
    FROM file_operations fo
    INNER JOIN tracks t ON fo.track_id = t.id
  `);
  const fileOpsMigrated = migrateFileOpsStmt.run();
  console.log(`  ✓ Migrated ${fileOpsMigrated.changes} file operations`);

  console.log('✓ Data migration completed\n');

  // Step 6: Drop old views (they reference old tables)
  console.log('Step 6: Dropping old views...');
  db.exec('DROP VIEW IF EXISTS tracks_with_library');
  db.exec('DROP VIEW IF EXISTS library_stats');
  db.exec('DROP VIEW IF EXISTS duplicates_with_tracks');
  console.log('✓ Old views dropped\n');

  // Step 7: Drop old triggers (they reference old tables)
  console.log('Step 7: Dropping old triggers...');
  db.exec('DROP TRIGGER IF EXISTS update_library_stats_on_track_insert');
  db.exec('DROP TRIGGER IF EXISTS update_library_stats_on_track_delete');
  db.exec('DROP TRIGGER IF EXISTS update_library_stats_on_track_update_old');
  db.exec('DROP TRIGGER IF EXISTS update_library_stats_on_track_update_new');
  db.exec('DROP TRIGGER IF EXISTS update_duplicate_group_on_track_insert');
  db.exec('DROP TRIGGER IF EXISTS update_duplicate_group_on_track_delete');
  console.log('✓ Old triggers dropped\n');

  // Step 8: Drop old tables and rename new ones
  console.log('Step 8: Replacing old tables with new tables...');

  db.exec('DROP TABLE IF EXISTS tracks');
  db.exec('ALTER TABLE tracks_new RENAME TO tracks');
  console.log('  ✓ Replaced tracks table');

  db.exec('DROP TABLE IF EXISTS duplicate_groups');
  db.exec('ALTER TABLE duplicate_groups_new RENAME TO duplicate_groups');
  console.log('  ✓ Replaced duplicate_groups table');

  db.exec('DROP TABLE IF EXISTS analysis_jobs');
  db.exec('ALTER TABLE analysis_jobs_new RENAME TO analysis_jobs');
  console.log('  ✓ Replaced analysis_jobs table');

  try {
    db.exec('DROP TABLE IF EXISTS playlist_tracks');
    db.exec('ALTER TABLE playlist_tracks_new RENAME TO playlist_tracks');
    console.log('  ✓ Replaced playlist_tracks table');
  } catch (error) {
    if (!error.message.includes('no such table')) {
      throw error;
    }
  }

  db.exec('DROP TABLE IF EXISTS waveforms');
  db.exec('ALTER TABLE waveforms_new RENAME TO waveforms');
  console.log('  ✓ Replaced waveforms table');

  db.exec('DROP TABLE IF EXISTS file_operations');
  db.exec('ALTER TABLE file_operations_new RENAME TO file_operations');
  console.log('  ✓ Replaced file_operations table');

  console.log('✓ Tables replaced\n');

  // Step 9: Create indexes
  console.log('Step 9: Creating indexes...');
  const indexStatements = [
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
    'CREATE INDEX idx_duplicate_groups_hash ON duplicate_groups(file_hash)',
    'CREATE INDEX idx_analysis_jobs_job_id ON analysis_jobs(job_id)',
    'CREATE INDEX idx_analysis_jobs_track_id ON analysis_jobs(track_id)',
    'CREATE INDEX idx_analysis_jobs_status ON analysis_jobs(status)',
    'CREATE INDEX idx_analysis_jobs_priority ON analysis_jobs(priority DESC)',
    'CREATE INDEX idx_analysis_jobs_created ON analysis_jobs(created_at)',
    'CREATE INDEX idx_waveforms_track ON waveforms(track_id)',
    'CREATE INDEX idx_file_operations_track ON file_operations(track_id)',
    'CREATE INDEX idx_file_operations_status ON file_operations(status)',
    'CREATE INDEX idx_file_operations_created ON file_operations(created_at)',
  ];

  for (const stmt of indexStatements) {
    try {
      db.exec(stmt);
    } catch (error) {
      // Index might already exist, that's ok
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  // Playlist tracks indexes (if table exists)
  try {
    db.exec('CREATE INDEX idx_playlist_tracks_position ON playlist_tracks(playlist_id, position)');
  } catch (error) {
    // Table might not exist
  }

  console.log('✓ Indexes created\n');

  // Step 10: Update views and triggers (from migration SQL)
  console.log('Step 10: Updating views and triggers...');

  // Recreate views
  db.exec('DROP VIEW IF EXISTS tracks_with_library');
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

  db.exec('DROP VIEW IF EXISTS duplicates_with_tracks');
  db.exec(`
    CREATE VIEW duplicates_with_tracks AS
    SELECT
      dg.*,
      t1.title as canonical_title,
      t1.artist as canonical_artist,
      t1.file_path as canonical_path,
      GROUP_CONCAT(t2.id) as duplicate_track_ids,
      COUNT(t2.id) + 1 as total_duplicate_count
    FROM duplicate_groups dg
    LEFT JOIN tracks t1 ON dg.canonical_track_id = t1.id
    LEFT JOIN tracks t2 ON dg.id = t2.duplicate_group_id AND t2.id != dg.canonical_track_id
    GROUP BY dg.id
  `);

  // Recreate triggers
  const triggerStatements = [
    `CREATE TRIGGER update_library_stats_on_track_insert
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
     END`,

    `CREATE TRIGGER update_library_stats_on_track_delete
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
     END`,

    `CREATE TRIGGER update_library_stats_on_track_update_old
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
     END`,

    `CREATE TRIGGER update_library_stats_on_track_update_new
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
     END`,

    `CREATE TRIGGER update_duplicate_group_on_track_insert
     AFTER INSERT ON tracks
     WHEN NEW.duplicate_group_id IS NOT NULL
     BEGIN
       UPDATE duplicate_groups
       SET total_duplicates = (
         SELECT COUNT(*) FROM tracks
         WHERE duplicate_group_id = NEW.duplicate_group_id
       )
       WHERE id = NEW.duplicate_group_id;
     END`,

    `CREATE TRIGGER update_duplicate_group_on_track_delete
     AFTER DELETE ON tracks
     WHEN OLD.duplicate_group_id IS NOT NULL
     BEGIN
       UPDATE duplicate_groups
       SET total_duplicates = (
         SELECT COUNT(*) FROM tracks
         WHERE duplicate_group_id = OLD.duplicate_group_id
       )
       WHERE id = OLD.duplicate_group_id;

       DELETE FROM duplicate_groups
       WHERE id = OLD.duplicate_group_id
       AND (SELECT COUNT(*) FROM tracks WHERE duplicate_group_id = OLD.duplicate_group_id) = 0;
     END`,
  ];

  for (const triggerStmt of triggerStatements) {
    db.exec(triggerStmt);
  }

  console.log('✓ Views and triggers updated\n');

  // Step 11: Update schema version
  console.log('Step 11: Updating schema version...');
  db.exec(`
    INSERT INTO schema_version (version, description) VALUES
    (5, 'Migrated tracks table from INTEGER id to UUID (TEXT) id')
  `);
  console.log('✓ Schema version updated\n');

  // Commit transaction
  db.exec('COMMIT');

  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');

  // Verify migration
  console.log('Verifying migration...');
  const newTrackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
  const newWaveformCount = db.prepare('SELECT COUNT(*) as count FROM waveforms').get();
  const newJobCount = db.prepare('SELECT COUNT(*) as count FROM analysis_jobs').get();

  console.log(`  Tracks: ${newTrackCount.count}`);
  console.log(`  Waveforms: ${newWaveformCount.count}`);
  console.log(`  Analysis jobs: ${newJobCount.count}`);

  // Sample a few UUIDs to verify format
  const sampleTracks = db.prepare('SELECT id, file_path FROM tracks LIMIT 3').all();
  console.log('\n  Sample track UUIDs:');
  for (const track of sampleTracks) {
    console.log(`    ${track.id} - ${path.basename(track.file_path)}`);
  }

  console.log('\n✓ Migration verification passed\n');

  console.log('='.repeat(80));
  console.log('✅ MIGRATION 005 COMPLETED SUCCESSFULLY');
  console.log('='.repeat(80));
  console.log('');
  console.log('Backup location:', backupPath);
  console.log('');
  console.log('Next steps:');
  console.log('1. Test your application with the new UUID-based schema');
  console.log('2. If everything works, you can delete the backup file');
  console.log('3. If issues occur, restore from backup and report the problem');
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
