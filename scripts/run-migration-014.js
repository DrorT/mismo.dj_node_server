#!/usr/bin/env node

/**
 * Migration 014: Add is_stems boolean to waveforms table
 *
 * This migration allows storing waveform data for both:
 * - Original track waveforms (is_stems = 0)
 * - Stems waveforms with all 4 stems together (is_stems = 1)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_PATH = process.env.DATABASE_PATH || './data/library.db';
const MIGRATION_FILE = path.join(__dirname, 'migrations', '014_add_stem_type_to_waveforms.sql');

console.log('='.repeat(80));
console.log('Migration 014: Add is_stems boolean to waveforms table');
console.log('='.repeat(80));
console.log();

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ Database not found: ${DB_PATH}`);
  process.exit(1);
}

// Open database
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

try {
  // Check current schema version
  const currentVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
  console.log(`Current schema version: ${currentVersion.version}`);

  if (currentVersion.version >= 14) {
    console.log('✓ Migration 014 already applied');
    process.exit(0);
  }

  // Check current waveform count
  const waveformCount = db.prepare('SELECT COUNT(*) as count FROM waveforms').get();
  console.log(`Current waveforms count: ${waveformCount.count}`);

  // Read migration SQL
  const migrationSQL = fs.readFileSync(MIGRATION_FILE, 'utf8');

  // Execute migration in a transaction
  console.log();
  console.log('Executing migration...');
  console.log();

  const transaction = db.transaction(() => {
    // Remove comments and split into statements
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    let stepNum = 0;
    statements.forEach((stmt) => {
      stepNum++;

      if (stmt.toLowerCase().includes('create table') && stmt.toLowerCase().includes('waveforms_new')) {
        console.log(`  [Step ${stepNum}] Creating new waveforms table with is_stems...`);
      } else if (stmt.toLowerCase().includes('insert into waveforms_new')) {
        console.log(`  [Step ${stepNum}] Copying ${waveformCount.count} waveforms to new table...`);
      } else if (stmt.toLowerCase().includes('drop table')) {
        console.log(`  [Step ${stepNum}] Dropping old waveforms table...`);
      } else if (stmt.toLowerCase().includes('alter table')) {
        console.log(`  [Step ${stepNum}] Renaming new table...`);
      } else if (stmt.toLowerCase().includes('create index')) {
        const indexName = stmt.match(/idx_\w+/)?.[0] || 'index';
        console.log(`  [Step ${stepNum}] Creating index: ${indexName}...`);
      } else if (stmt.toLowerCase().includes('insert into schema_version')) {
        console.log(`  [Step ${stepNum}] Updating schema version to 14...`);
      }

      try {
        db.prepare(stmt).run();
      } catch (error) {
        console.error(`    Error in statement: ${stmt.substring(0, 100)}...`);
        throw error;
      }
    });
  });

  transaction();

  // Verify migration
  const newVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
  const newWaveformCount = db.prepare('SELECT COUNT(*) as count FROM waveforms').get();
  const schema = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type='table' AND name='waveforms'
  `).get();

  console.log();
  console.log('✓ Migration completed successfully!');
  console.log();
  console.log('Verification:');
  console.log(`  - Schema version: ${newVersion.version}`);
  console.log(`  - Waveforms migrated: ${newWaveformCount.count}/${waveformCount.count}`);
  console.log(`  - is_stems column added: ${schema.sql.includes('is_stems') ? 'YES' : 'NO'}`);

  // Check for is_stems in schema
  if (schema.sql.includes('is_stems')) {
    console.log();
    console.log('✓ is_stems column successfully added to waveforms table');
    console.log('  0 = original audio, 1 = stems (vocals, drums, bass, other)');
  }

} catch (error) {
  console.error();
  console.error('❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
