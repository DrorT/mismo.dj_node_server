#!/usr/bin/env node

/**
 * Test Playlist Services
 * Quick validation that playlist services work correctly
 */

import { initDatabase, closeDatabase } from '../src/config/database.js';
import config from '../src/config/settings.js';
import * as playlistService from '../src/services/playlist.service.js';
import * as playlistTrackService from '../src/services/playlistTrack.service.js';
import logger from '../src/utils/logger.js';

async function testPlaylistServices() {
  try {
    console.log('\n🧪 Testing Playlist Services\n');
    console.log('='.repeat(60));

    // Initialize database
    console.log('\n1. Initializing database...');
    initDatabase(config.database.path);
    console.log('   ✅ Database initialized');

    // Test 1: Create static playlist
    console.log('\n2. Creating static playlist...');
    const staticPlaylist = playlistService.createPlaylist({
      name: 'Test Static Playlist',
      type: 'static',
      description: 'This is a test playlist',
      color: '#FF5733',
      icon: 'music',
    });
    console.log(`   ✅ Created: ${staticPlaylist.name} (${staticPlaylist.id})`);
    console.log(`   Type: ${staticPlaylist.type}`);

    // Test 2: Create smart playlist
    console.log('\n3. Creating smart playlist...');
    const smartPlaylist = playlistService.createPlaylist({
      name: 'Test Smart Playlist',
      type: 'smart',
      description: 'Auto-populated based on criteria',
      criteria: {
        bpm_min: 120,
        bpm_max: 135,
        energy_min: 0.7,
        genres: ['House', 'Techno'],
        limit: 50,
      },
    });
    console.log(`   ✅ Created: ${smartPlaylist.name} (${smartPlaylist.id})`);
    console.log(`   Criteria: BPM 120-135, Energy > 0.7`);

    // Test 3: Get all playlists
    console.log('\n4. Fetching all playlists...');
    const allPlaylists = playlistService.getAllPlaylists();
    console.log(`   ✅ Found ${allPlaylists.length} playlist(s)`);
    allPlaylists.forEach(p => {
      console.log(`      - ${p.name} (${p.type}) - ${p.track_count} tracks`);
    });

    // Test 4: Update playlist
    console.log('\n5. Updating playlist...');
    const updated = playlistService.updatePlaylist(staticPlaylist.id, {
      description: 'Updated description',
      is_favorite: true,
    });
    console.log(`   ✅ Updated: ${updated.name}`);
    console.log(`   Favorite: ${updated.is_favorite ? 'Yes' : 'No'}`);

    // Test 5: Get thinking playlist
    console.log('\n6. Getting thinking playlist...');
    const thinkingPlaylist = playlistService.getThinkingPlaylist();
    console.log(`   ✅ Thinking playlist: ${thinkingPlaylist.name} (${thinkingPlaylist.id})`);
    console.log(`   Type: ${thinkingPlaylist.type}, Temporary: ${thinkingPlaylist.is_temporary ? 'Yes' : 'No'}`);

    // Test 6: Get playlist stats
    console.log('\n7. Getting playlist statistics...');
    const stats = playlistService.getPlaylistStats(staticPlaylist.id);
    console.log(`   ✅ Stats for ${staticPlaylist.name}:`);
    console.log(`      Tracks: ${stats.track_count}`);
    console.log(`      Duration: ${stats.total_duration}s`);
    console.log(`      Avg BPM: ${stats.avg_bpm || 'N/A'}`);

    // Test 7: Export to M3U
    console.log('\n8. Exporting to M3U...');
    const m3u = playlistService.exportPlaylistM3U(staticPlaylist.id);
    console.log(`   ✅ M3U export (${m3u.split('\n').length} lines):`);
    console.log(`      ${m3u.split('\n').slice(0, 5).join('\n      ')}`);

    // Test 8: Duplicate playlist
    console.log('\n9. Duplicating playlist...');
    const duplicate = playlistService.duplicatePlaylist(staticPlaylist.id, 'Duplicate Test Playlist');
    console.log(`   ✅ Duplicated: ${duplicate.name} (${duplicate.id})`);

    // Test 9: Delete playlists
    console.log('\n10. Cleaning up test playlists...');
    playlistService.deletePlaylist(staticPlaylist.id);
    playlistService.deletePlaylist(smartPlaylist.id);
    playlistService.deletePlaylist(duplicate.id);
    console.log(`   ✅ Deleted test playlists`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!\n');

    // Close database
    closeDatabase();

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPlaylistServices();
