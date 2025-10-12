/**
 * Duplicate Detection Integration Test
 *
 * Tests that the scanner correctly identifies files with identical audio
 * but different metadata as duplicates based on their audio hash.
 */

import { scanLibrary, findDuplicatesByHash } from '../src/services/scanner.service.js';
import trackService from '../src/services/track.service.js';
import path from 'path';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

async function runTest() {
  log('╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║             DUPLICATE DETECTION INTEGRATION TEST           ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  const testDir = path.join(process.env.HOME, 'Music', 'test');

  log('\nTest directory: ' + testDir, 'blue');
  log('This should contain:', 'blue');
  log('  - soul makosa.mp3 (original metadata)', 'blue');
  log('  - soul makosa - test.mp3 (modified metadata, same audio)', 'blue');

  try {
    log('\n1. Scanning test directory...', 'yellow');
    const results = await scanLibrary();

    log(`   ✓ Scan completed`, 'green');
    log(`   Found ${results.added} new tracks`, 'green');
    log(`   Updated ${results.updated} existing tracks`, 'green');

    log('\n2. Querying for duplicate hashes...', 'yellow');
    const duplicates = findDuplicatesByHash();

    if (duplicates.length === 0) {
      log('   ⚠ No duplicates found', 'yellow');
      log('   This could mean:', 'yellow');
      log('     - The test files are not in the scanned directories', 'yellow');
      log('     - The files are not actually duplicates', 'yellow');
      log('     - The audio hash is working correctly but they differ', 'yellow');
    } else {
      log(`   ✓ Found ${duplicates.length} sets of duplicates`, 'green');

      for (const dup of duplicates) {
        log(`\n   Duplicate group (hash: ${dup.file_hash}):`, 'cyan');
        const tracks = trackService.getTracksByHash(dup.file_hash);

        for (const track of tracks) {
          log(`     - ${track.file_path}`, 'blue');
          log(`       Title: ${track.title}`, 'blue');
          log(`       Artist: ${track.artist}`, 'blue');
        }
      }
    }

    log('\n3. Checking specific test files...', 'yellow');
    const allTracks = trackService.getAllTracks();
    const soulMakosaFiles = allTracks.filter(t =>
      t.file_path.includes('soul makosa')
    );

    if (soulMakosaFiles.length === 0) {
      log('   ⚠ Test files not found in database', 'yellow');
      log('   Make sure the test directory is in your library paths', 'yellow');
    } else {
      log(`   Found ${soulMakosaFiles.length} "soul makosa" files:`, 'green');

      const hashes = new Set();
      for (const track of soulMakosaFiles) {
        log(`\n   ${track.file_path}`, 'blue');
        log(`   Hash: ${track.file_hash}`, 'blue');
        log(`   Title: ${track.title}`, 'blue');
        hashes.add(track.file_hash);
      }

      if (soulMakosaFiles.length >= 2) {
        if (hashes.size === 1) {
          log('\n   ✓ SUCCESS: Both files have the same hash!', 'green');
          log('   Audio-only hashing is working correctly!', 'green');
        } else {
          log('\n   ✗ FAIL: Files have different hashes', 'red');
          log('   This means the audio content differs or hashing failed', 'red');
        }
      }
    }

    log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║                      TEST COMPLETE                         ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  } catch (error) {
    log(`\n✗ Test failed: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  }
}

runTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
