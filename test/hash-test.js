/**
 * Hash Test Script
 *
 * This script tests whether hashing considers metadata or only audio data.
 *
 * Test approach:
 * 1. Create two identical audio files
 * 2. Modify metadata on one of them
 * 3. Hash both files with current implementation
 * 4. Compare hashes - they SHOULD match if only audio is hashed
 *                     - they WILL differ if metadata is included (current bug)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import hashService from '../src/services/hash.service.js';
import * as mm from 'music-metadata';
import NodeID3 from 'node-id3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * Generate a simple WAV file with known audio data
 * WAV format is simple: RIFF header + fmt chunk + data chunk
 */
function generateWAVFile(outputPath, durationSeconds = 1) {
  const sampleRate = 44100;
  const numChannels = 2;
  const bitsPerSample = 16;
  const numSamples = sampleRate * durationSeconds;

  // Generate sine wave at 440Hz (A note)
  const samples = [];
  const frequency = 440;
  for (let i = 0; i < numSamples; i++) {
    const value = Math.sin(2 * Math.PI * frequency * i / sampleRate);
    const sample = Math.floor(value * 32767); // Convert to 16-bit PCM
    samples.push(sample);
  }

  // Build WAV file
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20);  // audio format (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
  buffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write audio samples
  let offset = 44;
  for (const sample of samples) {
    // Write same sample to both channels
    buffer.writeInt16LE(sample, offset);
    buffer.writeInt16LE(sample, offset + 2);
    offset += 4;
  }

  return buffer;
}

/**
 * Test 1: WAV files (no metadata in standard WAV format)
 */
async function testWAVFiles() {
  log('\n=== Test 1: WAV Files (Baseline) ===', 'cyan');
  log('WAV files typically have no metadata, so hashes should always match', 'yellow');

  const testDir = path.join(__dirname, 'temp-hash-test');
  await fs.mkdir(testDir, { recursive: true });

  const file1 = path.join(testDir, 'test1.wav');
  const file2 = path.join(testDir, 'test2.wav');

  // Generate identical audio
  const wavData = generateWAVFile(file1, 0.1); // 0.1 second for speed
  await fs.writeFile(file1, wavData);
  await fs.writeFile(file2, wavData);

  // Hash both files
  const hash1 = await hashService.calculateFileHash(file1);
  const hash2 = await hashService.calculateFileHash(file2);

  log(`File 1 hash: ${hash1}`);
  log(`File 2 hash: ${hash2}`);

  if (hash1 === hash2) {
    log('✓ PASS: Identical audio produces identical hashes', 'green');
  } else {
    log('✗ FAIL: Identical audio produces different hashes', 'red');
  }

  // Cleanup
  await fs.rm(testDir, { recursive: true });

  return hash1 === hash2;
}

/**
 * Test 2: MP3 files with different ID3 tags
 * This is the critical test - same audio, different metadata
 */
async function testMP3WithDifferentTags() {
  log('\n=== Test 2: MP3 Files with Different Metadata ===', 'cyan');
  log('This tests if metadata is included in the hash', 'yellow');

  const testDir = path.join(__dirname, 'temp-hash-test');
  await fs.mkdir(testDir, { recursive: true });

  // Use the test files provided by Chester
  const file1 = path.join(process.env.HOME, 'Music', 'test', 'soul makosa.mp3');
  const file2 = path.join(process.env.HOME, 'Music', 'test', 'soul makosa - test.mp3');

  // Check if test files exist
  try {
    await fs.access(file1);
    await fs.access(file2);
    log('Using existing test files:', 'blue');
    log(`  File 1: ${file1}`, 'blue');
    log(`  File 2: ${file2}`, 'blue');
  } catch (error) {
    log('⚠ Test files not found:', 'yellow');
    log(`  Expected: ${file1}`, 'yellow');
    log(`  Expected: ${file2}`, 'yellow');
    log('Please ensure these files exist with identical audio but different metadata', 'yellow');
    log('Skipping MP3 test...', 'yellow');
    await fs.rm(testDir, { recursive: true }).catch(() => {});
    return null;
  }

  // Display metadata for both files
  log('\nFile 1 metadata:');
  const meta1 = await mm.parseFile(file1);
  log(`  Title: ${meta1.common.title || 'N/A'}`);
  log(`  Artist: ${meta1.common.artist || 'N/A'}`);

  log('\nFile 2 metadata:');
  const meta2 = await mm.parseFile(file2);
  log(`  Title: ${meta2.common.title || 'N/A'}`);
  log(`  Artist: ${meta2.common.artist || 'N/A'}`);

  // Hash both files with current implementation
  log('\nHashing with current implementation (includes all file data):', 'blue');
  const hash1Full = await hashService.calculateFileHash(file1);
  const hash2Full = await hashService.calculateFileHash(file2);

  log(`File 1 hash: ${hash1Full}`);
  log(`File 2 hash: ${hash2Full}`);

  if (hash1Full === hash2Full) {
    log('✓ Hashes match (metadata NOT included)', 'green');
  } else {
    log('✗ Hashes differ (metadata IS included) - THIS IS THE BUG', 'red');
  }

  // Try audio-only hashing with improved implementation
  log('\nHashing with improved audio-only implementation:', 'blue');
  log('(Skips ID3v2 at start and ID3v1/APE at end)', 'blue');

  const hash1Audio = await hashService.calculateAudioHash(file1);
  const hash2Audio = await hashService.calculateAudioHash(file2);

  log(`File 1 audio hash: ${hash1Audio}`);
  log(`File 2 audio hash: ${hash2Audio}`);

  if (hash1Audio === hash2Audio) {
    log('✓ PASS: Audio hashes match (metadata excluded)', 'green');
  } else {
    log('✗ FAIL: Audio hashes differ (implementation incomplete)', 'red');
  }

  // Cleanup
  await fs.rm(testDir, { recursive: true });

  return {
    fullHashMatches: hash1Full === hash2Full,
    audioHashMatches: hash1Audio === hash2Audio
  };
}

/**
 * Get ID3v2 tag size from MP3 file
 * ID3v2 structure: "ID3" (3 bytes) + version (2 bytes) + flags (1 byte) + size (4 bytes)
 * Size is stored as synchsafe integer (7 bits per byte)
 */
async function getID3v2Size(filePath) {
  const buffer = Buffer.alloc(10);
  const file = await fs.open(filePath, 'r');

  try {
    await file.read(buffer, 0, 10, 0);

    // Check for ID3v2 header
    if (buffer.toString('utf8', 0, 3) !== 'ID3') {
      return 0; // No ID3v2 tag
    }

    // Decode synchsafe integer (4 bytes, 7 bits each)
    const size = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];

    // Total size = header (10 bytes) + tag data
    return size + 10;
  } finally {
    await file.close();
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║         HASH SERVICE TEST - Metadata vs Audio Data        ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  log('\nPurpose: Verify if hashing includes metadata or only audio data');
  log('Expected behavior: Duplicate audio should have same hash regardless of metadata\n');

  const results = {
    wav: false,
    mp3: null
  };

  try {
    // Test 1: WAV files
    results.wav = await testWAVFiles();

    // Test 2: MP3 files
    results.mp3 = await testMP3WithDifferentTags();

    // Summary
    log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║                       TEST SUMMARY                         ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');

    log('\n1. WAV files (baseline):');
    if (results.wav) {
      log('   ✓ PASS: Identical audio produces identical hashes', 'green');
    } else {
      log('   ✗ FAIL: Something is wrong with basic hashing', 'red');
    }

    log('\n2. MP3 files with different metadata:');
    if (results.mp3 === null) {
      log('   ⊘ SKIPPED: No sample MP3 file available', 'yellow');
    } else {
      if (results.mp3.fullHashMatches) {
        log('   ✓ Full file hash: Metadata NOT included', 'green');
      } else {
        log('   ✗ Full file hash: Metadata IS included (BUG CONFIRMED)', 'red');
      }

      if (results.mp3.audioHashMatches) {
        log('   ✓ Audio-only hash: Works correctly', 'green');
      } else {
        log('   ⚠ Audio-only hash: Needs more work', 'yellow');
      }
    }

    // Recommendation
    log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║                      RECOMMENDATIONS                       ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');

    if (results.mp3 && !results.mp3.fullHashMatches) {
      log('\n⚠ ISSUE CONFIRMED: Current implementation hashes entire file', 'yellow');
      log('\nFor duplicate detection, you need to:');
      log('1. Hash only the audio data, not metadata');
      log('2. Skip format-specific metadata headers:');
      log('   - MP3: Skip ID3v2 tags at start, ID3v1 tags at end (128 bytes)');
      log('   - FLAC: Skip VORBIS_COMMENT blocks');
      log('   - M4A/AAC: Skip metadata atoms');
      log('3. Use music-metadata library to find where audio data starts');
      log('4. Update scanner/watcher to use audio-only hashing');
      log('\nWithout this, files with same audio but different tags will not');
      log('be detected as duplicates!', 'red');
    } else if (results.mp3 === null) {
      log('\n⚠ Cannot fully test without sample MP3 file', 'yellow');
      log('Place a sample MP3 at test/sample.mp3 to run full tests');
    } else {
      log('\n✓ Hashing appears to be working correctly', 'green');
    }

  } catch (error) {
    log(`\n✗ Test failed with error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
