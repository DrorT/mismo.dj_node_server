#!/usr/bin/env node

/**
 * Migration Runner
 * Applies SQL migration files to the database
 *
 * Usage:
 *   node scripts/run-migration.js <migration-file>
 *   node scripts/run-migration.js migrations/012_enhance_playlists_schema.sql
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, closeDatabase, getDatabase } from '../src/config/database.js';
import config from '../src/config/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run a migration file
 * @param {string} migrationPath - Path to migration SQL file
 */
async function runMigration(migrationPath) {
  try {
    // Resolve migration file path
    const fullPath = path.isAbsolute(migrationPath)
      ? migrationPath
      : path.resolve(process.cwd(), migrationPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Migration file not found: ${fullPath}`);
    }

    console.log(`\n📦 Running migration: ${path.basename(fullPath)}`);
    console.log(`   File: ${fullPath}`);

    // Initialize database
    console.log(`\n🔌 Connecting to database: ${config.database.path}`);
    initDatabase(config.database.path);
    const db = getDatabase();

    // Check current schema version
    const currentVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
    console.log(`   Current schema version: ${currentVersion.version}`);

    // Read migration file
    console.log(`\n📄 Reading migration file...`);
    let migrationSql = fs.readFileSync(fullPath, 'utf8');

    // Remove comments for cleaner execution
    migrationSql = migrationSql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    migrationSql = migrationSql.replace(/--[^\n]*/g, '');

    // Execute migration in a transaction
    console.log(`\n🚀 Executing migration...`);

    try {
      db.exec('BEGIN TRANSACTION');
      db.exec(migrationSql);
      db.exec('COMMIT');
      console.log(`   ✅ Migration executed successfully`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    // Check new schema version
    const newVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
    console.log(`\n📊 Schema version updated: ${currentVersion.version} → ${newVersion.version}`);

    // Get migration description
    const migrationInfo = db.prepare('SELECT * FROM schema_version WHERE version = ?').get(newVersion.version);
    if (migrationInfo) {
      console.log(`   Description: ${migrationInfo.description}`);
    }

    // Verify playlists table structure
    console.log(`\n🔍 Verifying playlists table structure...`);
    const playlistsInfo = db.prepare('PRAGMA table_info(playlists)').all();
    console.log(`   Columns: ${playlistsInfo.map(col => col.name).join(', ')}`);

    // Verify playlist_tracks table structure
    console.log(`\n🔍 Verifying playlist_tracks table structure...`);
    const playlistTracksInfo = db.prepare('PRAGMA table_info(playlist_tracks)').all();
    console.log(`   Columns: ${playlistTracksInfo.map(col => col.name).join(', ')}`);

    // List new indexes
    console.log(`\n📑 Verifying indexes...`);
    const playlistIndexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='playlists'
      ORDER BY name
    `).all();
    console.log(`   Playlists indexes: ${playlistIndexes.map(idx => idx.name).join(', ')}`);

    const playlistTrackIndexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='playlist_tracks'
      ORDER BY name
    `).all();
    console.log(`   Playlist tracks indexes: ${playlistTrackIndexes.map(idx => idx.name).join(', ')}`);

    // List triggers
    console.log(`\n⚡ Verifying triggers...`);
    const triggers = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='trigger' AND tbl_name='playlists'
      ORDER BY name
    `).all();
    console.log(`   Triggers: ${triggers.map(t => t.name).join(', ')}`);

    console.log(`\n✅ Migration completed successfully!\n`);

    // Close database
    closeDatabase();

  } catch (error) {
    console.error(`\n❌ Migration failed:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Main execution
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.js <migration-file>');
  console.error('Example: node scripts/run-migration.js migrations/012_enhance_playlists_schema.sql');
  process.exit(1);
}

runMigration(migrationFile);
