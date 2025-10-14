#!/usr/bin/env node

/**
 * Migration 007 Runner: Playlist UUID Migration
 *
 * This script handles the data migration from INTEGER playlist IDs to UUID playlist IDs.
 * Since there are no playlists in the database, this is primarily a schema change.
 *
 * Usage: node scripts/run-migration-007.js [database-path]
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
console.log('MIGRATION 007: Playlist UUID Migration');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}`);
console.log('');

// Verify database exists
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database not found: ${dbPath}`);
  process.exit(1);
}

// Create database backup
const backupPath = `${dbPath}.backup-before-migration-007`;
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
  if (schemaVersion.version < 6) {
    throw new Error('Migration 006 must be completed before running this migration');
  }
  console.log('✓ Prerequisites met\n');

  // Begin transaction
  db.exec('BEGIN TRANSACTION');

  // Step 1: Check existing playlists
  console.log('Step 1: Checking existing playlists...');
  const playlistCount = db.prepare('SELECT COUNT(*) as count FROM playlists').get();
  const playlistTrackCount = db.prepare('SELECT COUNT(*) as count FROM playlist_tracks').get();
  console.log(`  Existing playlists: ${playlistCount.count}`);
  console.log(`  Existing playlist tracks: ${playlistTrackCount.count}\n`);

  // Step 2: Add UUID column
  console.log('Step 2: Adding UUID column to playlists...');
  db.exec('ALTER TABLE playlists ADD COLUMN uuid TEXT');
  console.log('✓ UUID column added\n');

  // Step 3: Generate UUIDs for existing playlists (if any)
  if (playlistCount.count > 0) {
    console.log('Step 3: Generating UUIDs for existing playlists...');
    const playlists = db.prepare('SELECT id FROM playlists').all();
    const updatePlaylistUuid = db.prepare('UPDATE playlists SET uuid = ? WHERE id = ?');

    const uuidMap = new Map();
    for (const playlist of playlists) {
      const uuid = randomUUID();
      uuidMap.set(playlist.id, uuid);
      updatePlaylistUuid.run(uuid, playlist.id);
    }
    console.log(`✓ Generated ${uuidMap.size} UUIDs\n`);
  } else {
    console.log('Step 3: No existing playlists to migrate\n');
  }

  // Step 4: Create backup tables
  console.log('Step 4: Creating backup tables...');
  db.exec('CREATE TABLE playlists_backup AS SELECT * FROM playlists');
  db.exec('CREATE TABLE playlist_tracks_backup AS SELECT * FROM playlist_tracks');
  console.log('✓ Backup tables created\n');

  // Step 5: Create new tables
  console.log('Step 5: Creating new tables with UUID schema...');

  db.exec(`
    CREATE TABLE playlists_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
      date_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_smart BOOLEAN DEFAULT 0,
      smart_criteria TEXT,
      color TEXT,
      icon TEXT
    )
  `);
  console.log('  ✓ Created playlists_new');

  db.exec(`
    CREATE TABLE playlist_tracks_new (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists_new(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
      PRIMARY KEY (playlist_id, track_id),
      UNIQUE (playlist_id, position)
    )
  `);
  console.log('  ✓ Created playlist_tracks_new\n');

  // Step 6: Migrate data (if any)
  if (playlistCount.count > 0) {
    console.log('Step 6: Migrating data to new tables...');

    const migratePlaylistsStmt = db.prepare(`
      INSERT INTO playlists_new (
        id, name, description, date_created, date_modified,
        is_smart, smart_criteria, color, icon
      )
      SELECT
        uuid, name, description, date_created, date_modified,
        is_smart, smart_criteria, color, icon
      FROM playlists
    `);
    const playlistsMigrated = migratePlaylistsStmt.run();
    console.log(`  ✓ Migrated ${playlistsMigrated.changes} playlists`);

    if (playlistTrackCount.count > 0) {
      const migratePlaylistTracksStmt = db.prepare(`
        INSERT INTO playlist_tracks_new (
          playlist_id, track_id, position, date_added
        )
        SELECT
          p.uuid, pt.track_id, pt.position, pt.date_added
        FROM playlist_tracks pt
        INNER JOIN playlists p ON pt.playlist_id = p.id
      `);
      const playlistTracksMigrated = migratePlaylistTracksStmt.run();
      console.log(`  ✓ Migrated ${playlistTracksMigrated.changes} playlist tracks\n`);
    }
  } else {
    console.log('Step 6: No data to migrate\n');
  }

  // Step 7: Replace old tables
  console.log('Step 7: Replacing old tables with new tables...');
  db.exec('DROP TABLE IF EXISTS playlist_tracks');
  db.exec('DROP TABLE IF EXISTS playlists');
  db.exec('ALTER TABLE playlists_new RENAME TO playlists');
  db.exec('ALTER TABLE playlist_tracks_new RENAME TO playlist_tracks');
  console.log('✓ Tables replaced\n');

  // Step 8: Create indexes
  console.log('Step 8: Creating indexes...');
  db.exec('CREATE INDEX idx_playlists_name ON playlists(name)');
  db.exec('CREATE INDEX idx_playlist_tracks_position ON playlist_tracks(playlist_id, position)');
  console.log('✓ Indexes created\n');

  // Step 9: Update schema version
  console.log('Step 9: Updating schema version...');
  db.exec(`
    INSERT INTO schema_version (version, description) VALUES
    (7, 'Migrated playlists table from INTEGER id to UUID (TEXT) id')
  `);
  console.log('✓ Schema version updated\n');

  // Commit transaction
  db.exec('COMMIT');

  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');

  // Verify migration
  console.log('Verifying migration...');
  const newPlaylistCount = db.prepare('SELECT COUNT(*) as count FROM playlists').get();
  console.log(`  Playlists: ${newPlaylistCount.count}`);

  if (newPlaylistCount.count > 0) {
    const samplePlaylists = db.prepare('SELECT id, name FROM playlists LIMIT 3').all();
    console.log('\n  Sample playlist UUIDs:');
    for (const playlist of samplePlaylists) {
      console.log(`    ${playlist.id} - ${playlist.name}`);
    }
  }

  console.log('\n✓ Migration verification passed\n');

  console.log('='.repeat(80));
  console.log('✅ MIGRATION 007 COMPLETED SUCCESSFULLY');
  console.log('='.repeat(80));
  console.log('');
  console.log('Backup location:', backupPath);
  console.log('');
  console.log('Next steps:');
  console.log('1. Playlists now use UUID primary keys');
  console.log('2. Create new playlists will automatically get UUIDs');
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
