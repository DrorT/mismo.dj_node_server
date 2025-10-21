#!/usr/bin/env node

/**
 * Re-analyze Tracks Script
 *
 * This script re-analyzes tracks with the latest analysis algorithms.
 * Useful when the analysis server is updated with new features or improvements.
 *
 * Usage:
 *   npm run reanalyze:all              # Re-analyze all tracks
 *   npm run reanalyze:library <id>     # Re-analyze tracks in a specific library
 *   node scripts/reanalyze-tracks.js --track-ids uuid1,uuid2,uuid3
 *
 * Options:
 *   --all                  Re-analyze all tracks in database
 *   --library <id>         Re-analyze all tracks in a specific library directory
 *   --track-ids <ids>      Comma-separated list of track UUIDs
 *   --basic-features       Include basic features analysis (default: true)
 *   --characteristics      Include characteristics analysis (default: false)
 *   --priority <level>     Priority level: low, normal, high (default: normal)
 *   --dry-run              Show what would be re-analyzed without actually doing it
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  all: args.includes('--all'),
  library: null,
  trackIds: null,
  basicFeatures: !args.includes('--no-basic-features'),
  characteristics: args.includes('--characteristics'),
  priority: 'normal',
  dryRun: args.includes('--dry-run'),
};

// Parse --library <id>
const libraryIndex = args.indexOf('--library');
if (libraryIndex !== -1 && args[libraryIndex + 1]) {
  options.library = args[libraryIndex + 1];
}

// Parse --track-ids <ids>
const trackIdsIndex = args.indexOf('--track-ids');
if (trackIdsIndex !== -1 && args[trackIdsIndex + 1]) {
  options.trackIds = args[trackIdsIndex + 1].split(',').map(id => id.trim());
}

// Parse --priority <level>
const priorityIndex = args.indexOf('--priority');
if (priorityIndex !== -1 && args[priorityIndex + 1]) {
  options.priority = args[priorityIndex + 1];
}

// Validate options
if (!options.all && !options.library && !options.trackIds) {
  console.error('Error: Must specify --all, --library <id>, or --track-ids <ids>');
  console.error('');
  console.error('Usage:');
  console.error('  node scripts/reanalyze-tracks.js --all');
  console.error('  node scripts/reanalyze-tracks.js --library <library-id>');
  console.error('  node scripts/reanalyze-tracks.js --track-ids uuid1,uuid2,uuid3');
  process.exit(1);
}

async function main() {
  console.log('🔄 Mismo DJ Track Re-Analysis Tool\n');

  // Import services (must be done after env is loaded)
  const { initDatabase } = await import('../src/config/database.js');
  const trackService = await import('../src/services/track.service.js');
  const analysisQueueService = (await import('../src/services/analysisQueue.service.js')).default;

  // Initialize database
  const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', 'data', 'library.db');
  initDatabase(dbPath);
  console.log('✓ Database initialized\n');

  // Determine which tracks to re-analyze
  let trackIds = [];

  if (options.trackIds) {
    trackIds = options.trackIds;
    console.log(`📋 Re-analyzing ${trackIds.length} specific track(s)`);
  } else if (options.library) {
    const libraryTracks = trackService.getTracksByLibrary(options.library);
    trackIds = libraryTracks.map(t => t.id);
    console.log(`📚 Re-analyzing ${trackIds.length} track(s) from library ${options.library}`);
  } else if (options.all) {
    const allTracks = trackService.searchTracks({}, { page: 1, limit: 999999 });
    trackIds = allTracks.tracks.map(t => t.id);
    console.log(`🌍 Re-analyzing ALL ${trackIds.length} track(s) in database`);
  }

  if (trackIds.length === 0) {
    console.log('⚠️  No tracks found to re-analyze');
    process.exit(0);
  }

  // Show analysis options
  console.log('\n📊 Analysis Options:');
  console.log(`   Basic Features: ${options.basicFeatures ? '✓' : '✗'}`);
  console.log(`   Characteristics: ${options.characteristics ? '✓' : '✗'}`);
  console.log(`   Priority: ${options.priority}`);

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN MODE - No actual analysis will be performed');
    console.log(`\nWould re-analyze ${trackIds.length} track(s)`);
    process.exit(0);
  }

  // Confirm with user
  console.log(`\n⚠️  This will re-analyze ${trackIds.length} track(s).`);
  console.log('   All existing analysis data (BPM, beats, downbeats, etc.) will be updated.');
  console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...');

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n🚀 Starting re-analysis...\n');

  // Queue re-analysis
  const analysisOptions = {
    basic_features: options.basicFeatures,
    characteristics: options.characteristics,
  };

  const results = await analysisQueueService.bulkReanalyze(
    trackIds,
    analysisOptions,
    options.priority
  );

  // Display results
  console.log('\n✅ Re-analysis Queued\n');
  console.log(`   Total Requested: ${trackIds.length}`);
  console.log(`   Successfully Queued: ${results.queued}`);
  console.log(`   Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(err => {
      console.log(`   Track ${err.trackId}: ${err.error}`);
    });
  }

  console.log('\n💡 Track progress with: GET /api/analysis/queue');
  console.log('   Or view job details: GET /api/analysis/jobs/<job_id>\n');

  process.exit(0);
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
