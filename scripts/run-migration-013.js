#!/usr/bin/env node

/**
 * Migration 013: Remove UNIQUE constraint from job_id
 *
 * This migration allows multiple analysis jobs per track, which is needed for:
 * - Regenerating ephemeral data (stems)
 * - Keeping job history
 * - Running different analysis types at different times
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_PATH = process.env.DATABASE_PATH || './data/library.db';
const MIGRATION_FILE = path.join(__dirname, 'migrations', '013_remove_job_id_unique_constraint.sql');

console.log('='.repeat(80));
console.log('Migration 013: Remove UNIQUE constraint from job_id');
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

  if (currentVersion.version >= 13) {
    console.log('✓ Migration 013 already applied');
    process.exit(0);
  }

  // Check current job count
  const jobCount = db.prepare('SELECT COUNT(*) as count FROM analysis_jobs').get();
  console.log(`Current analysis_jobs count: ${jobCount.count}`);

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

      if (stmt.toLowerCase().includes('insert into schema_version')) {
        console.log(`  [Step ${stepNum}] Updating schema version to 13...`);
      } else if (stmt.toLowerCase().includes('create table') && stmt.toLowerCase().includes('analysis_jobs_new')) {
        console.log(`  [Step ${stepNum}] Creating new table without UNIQUE constraint...`);
      } else if (stmt.toLowerCase().includes('insert into analysis_jobs_new')) {
        console.log(`  [Step ${stepNum}] Copying ${jobCount.count} jobs to new table...`);
      } else if (stmt.toLowerCase().includes('drop table')) {
        console.log(`  [Step ${stepNum}] Dropping old table...`);
      } else if (stmt.toLowerCase().includes('alter table')) {
        console.log(`  [Step ${stepNum}] Renaming new table...`);
      } else if (stmt.toLowerCase().includes('create index')) {
        const indexName = stmt.match(/idx_\w+/)?.[0] || 'index';
        console.log(`  [Step ${stepNum}] Creating index: ${indexName}...`);
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
  const newJobCount = db.prepare('SELECT COUNT(*) as count FROM analysis_jobs').get();
  const indices = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='index' AND tbl_name='analysis_jobs'
    ORDER BY name
  `).all();

  console.log();
  console.log('✓ Migration completed successfully!');
  console.log();
  console.log('Verification:');
  console.log(`  - Schema version: ${newVersion.version}`);
  console.log(`  - Jobs migrated: ${newJobCount.count}/${jobCount.count}`);
  console.log(`  - Indices created: ${indices.length}`);
  indices.forEach(idx => console.log(`    • ${idx.name}`));

  // Check for UNIQUE constraint (should be gone)
  const schema = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type='table' AND name='analysis_jobs'
  `).get();

  if (schema.sql.includes('UNIQUE')) {
    console.log();
    console.log('⚠️  WARNING: UNIQUE constraint still present in schema!');
    console.log(schema.sql);
  } else {
    console.log();
    console.log('✓ UNIQUE constraint successfully removed from job_id');
  }

} catch (error) {
  console.error();
  console.error('❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
