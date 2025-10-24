#!/usr/bin/env node

/**
 * Test Smart Playlists and Sessions
 * Validates smart playlist evaluator and session service
 */

import { initDatabase, closeDatabase } from '../src/config/database.js';
import config from '../src/config/settings.js';
import * as playlistService from '../src/services/playlist.service.js';
import * as smartPlaylistEvaluator from '../src/services/smartPlaylistEvaluator.service.js';
import * as sessionService from '../src/services/session.service.js';

async function testSmartPlaylistsAndSessions() {
  try {
    console.log('\n🧪 Testing Smart Playlists & Sessions\n');
    console.log('='.repeat(60));

    // Initialize database
    console.log('\n1. Initializing database...');
    initDatabase(config.database.path);
    console.log('   ✅ Database initialized');

    // Test Smart Playlist Evaluator
    console.log('\n2. Testing smart playlist criteria...');
    const criteria = {
      bpm_min: 120,
      bpm_max: 135,
      energy_min: 0.6,
      genres: ['House', 'Techno'],
      sort_by: 'energy',
      sort_order: 'desc',
      limit: 10
    };

    const explanation = smartPlaylistEvaluator.explainCriteria(criteria);
    console.log(`   ✅ Criteria: ${explanation}`);

    const validation = smartPlaylistEvaluator.validateCriteria(criteria);
    console.log(`   ✅ Validation: ${validation.valid ? 'Valid' : 'Invalid'}`);

    // Evaluate criteria
    console.log('\n3. Evaluating criteria...');
    const matchingTracks = smartPlaylistEvaluator.evaluateCriteria(criteria);
    console.log(`   ✅ Found ${matchingTracks.length} matching track(s)`);

    // Create smart playlist
    console.log('\n4. Creating smart playlist...');
    const smartPlaylist = playlistService.createPlaylist({
      name: 'Test Smart Playlist',
      type: 'smart',
      criteria,
      description: 'Auto-populated smart playlist'
    });
    console.log(`   ✅ Created: ${smartPlaylist.name} (${smartPlaylist.id})`);

    // Refresh smart playlist
    console.log('\n5. Refreshing smart playlist...');
    const refreshResult = smartPlaylistEvaluator.refreshSmartPlaylist(smartPlaylist.id);
    console.log(`   ✅ Refreshed: +${refreshResult.addedCount}, -${refreshResult.removedCount}, total: ${refreshResult.total}`);

    // Test Session Service
    console.log('\n6. Starting DJ session...');
    const session = sessionService.startSession('Test Venue', null);
    console.log(`   ✅ Session started: ${session.name} (${session.id})`);
    console.log(`   Venue: ${session.session_venue}`);
    console.log(`   Date: ${new Date(session.session_date * 1000).toISOString()}`);

    // Check active session
    console.log('\n7. Checking active session...');
    const activeSession = sessionService.getActiveSession();
    console.log(`   ✅ Active session: ${activeSession ? activeSession.name : 'None'}`);

    // Get session stats
    console.log('\n8. Getting session statistics...');
    const sessionStats = sessionService.getSessionStats(session.id);
    console.log(`   ✅ Session stats:`);
    console.log(`      Tracks: ${sessionStats.track_count}`);
    console.log(`      Duration: ${sessionStats.session_duration}s`);
    console.log(`      Finalized: ${sessionStats.is_finalized ? 'Yes' : 'No'}`);

    // Finalize session
    console.log('\n9. Finalizing session...');
    const finalized = sessionService.finalizeSession(session.id);
    console.log(`   ✅ Session finalized: ${finalized.name}`);
    console.log(`   Readonly: ${finalized.is_readonly ? 'Yes' : 'No'}`);

    // Test auto-finalize
    console.log('\n10. Testing auto-finalize (should find 0 inactive sessions)...');
    const autoFinalized = sessionService.autoFinalizeInactiveSessions(4);
    console.log(`   ✅ Auto-finalized ${autoFinalized.length} session(s)`);

    // Convert smart playlist to static
    console.log('\n11. Converting smart playlist to static...');
    const converted = smartPlaylistEvaluator.convertToStatic(smartPlaylist.id);
    console.log(`   ✅ Converted: ${converted.name} (now type: ${converted.type})`);

    // Cleanup
    console.log('\n12. Cleaning up...');
    playlistService.deletePlaylist(smartPlaylist.id);
    playlistService.deletePlaylist(session.id);
    console.log(`   ✅ Deleted test playlists`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!\n');

    closeDatabase();

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSmartPlaylistsAndSessions();
