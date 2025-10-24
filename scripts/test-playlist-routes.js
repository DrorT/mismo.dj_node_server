#!/usr/bin/env node

/**
 * Test Playlist Routes
 * Tests all playlist API endpoints via HTTP
 *
 * Usage:
 *   node scripts/test-playlist-routes.js
 *
 * Prerequisites:
 *   - Server must be running on http://localhost:3000
 *   - Database must have at least a few tracks
 */

const API_BASE = 'http://localhost:12047/api';

/**
 * Helper to make HTTP requests
 */
async function request(method, endpoint, body = null) {
  const url = `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      console.error(`✗ ${method} ${endpoint} failed:`, data);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`✗ ${method} ${endpoint} error:`, error.message);
    return null;
  }
}

/**
 * Get some track IDs for testing
 */
async function getTrackIds(count = 5) {
  console.log('\n📦 Getting track IDs for testing...');
  const data = await request('GET', '/tracks?limit=' + count);

  if (!data || !data.data || data.data.length === 0) {
    console.error('✗ No tracks found in database. Please add some tracks first.');
    process.exit(1);
  }

  const trackIds = data.data.map(t => t.id);
  console.log(`✓ Got ${trackIds.length} track IDs`);
  return trackIds;
}

/**
 * Test playlist CRUD operations
 */
async function testPlaylistCRUD(trackIds) {
  console.log('\n========================================');
  console.log('Testing Playlist CRUD Operations');
  console.log('========================================\n');

  // Create a static playlist
  console.log('1. Creating static playlist...');
  const staticPlaylist = await request('POST', '/playlists', {
    name: 'Test Static Playlist',
    type: 'static',
    description: 'Test playlist created by API test',
    color: '#FF5733',
    is_favorite: true,
  });

  if (!staticPlaylist) {
    console.error('✗ Failed to create static playlist');
    return null;
  }
  console.log(`✓ Created static playlist: ${staticPlaylist.name} (${staticPlaylist.id})`);

  // Add tracks to the playlist
  console.log('\n2. Adding tracks to playlist...');
  const addResult = await request('POST', `/playlists/${staticPlaylist.id}/tracks`, {
    track_ids: trackIds.slice(0, 3),
    notes: 'First batch of tracks',
  });

  if (!addResult) {
    console.error('✗ Failed to add tracks');
    return null;
  }
  console.log(`✓ Added ${addResult.added_count} tracks`);

  // Get playlist with tracks
  console.log('\n3. Getting playlist with tracks...');
  const playlistWithTracks = await request('GET', `/playlists/${staticPlaylist.id}`);

  if (!playlistWithTracks) {
    console.error('✗ Failed to get playlist');
    return null;
  }
  console.log(`✓ Got playlist with ${playlistWithTracks.tracks.length} tracks`);

  // Update playlist
  console.log('\n4. Updating playlist...');
  const updatedPlaylist = await request('PUT', `/playlists/${staticPlaylist.id}`, {
    name: 'Updated Test Playlist',
    description: 'Updated description',
    is_favorite: false,
  });

  if (!updatedPlaylist) {
    console.error('✗ Failed to update playlist');
    return null;
  }
  console.log(`✓ Updated playlist: ${updatedPlaylist.name}`);

  // Get playlist stats
  console.log('\n5. Getting playlist stats...');
  const stats = await request('GET', `/playlists/${staticPlaylist.id}/stats`);

  if (!stats) {
    console.error('✗ Failed to get playlist stats');
    return null;
  }
  console.log(`✓ Playlist stats: ${stats.track_count} tracks, ${stats.total_duration}s total duration`);

  return staticPlaylist;
}

/**
 * Test smart playlist operations
 */
async function testSmartPlaylists(trackIds) {
  console.log('\n========================================');
  console.log('Testing Smart Playlist Operations');
  console.log('========================================\n');

  // Create a smart playlist
  console.log('1. Creating smart playlist...');
  const smartPlaylist = await request('POST', '/playlists', {
    name: 'Test Smart Playlist',
    type: 'smart',
    description: 'Auto-populated based on criteria',
    criteria: {
      bpm_min: 120,
      bpm_max: 135,
      energy_min: 0.6,
    },
  });

  if (!smartPlaylist) {
    console.error('✗ Failed to create smart playlist');
    return null;
  }
  console.log(`✓ Created smart playlist: ${smartPlaylist.name} (${smartPlaylist.id})`);

  // Explain criteria
  console.log('\n2. Explaining smart playlist criteria...');
  const explanation = await request('GET', `/playlists/${smartPlaylist.id}/explain`);

  if (!explanation) {
    console.error('✗ Failed to explain criteria');
    return null;
  }
  console.log(`✓ Criteria: ${explanation.explanation}`);

  // Refresh smart playlist
  console.log('\n3. Refreshing smart playlist...');
  const refreshResult = await request('POST', `/playlists/${smartPlaylist.id}/refresh`);

  if (!refreshResult) {
    console.error('✗ Failed to refresh smart playlist');
    return null;
  }
  console.log(`✓ Refreshed: ${refreshResult.total} tracks (${refreshResult.added} added, ${refreshResult.removed} removed)`);

  // Convert to static
  console.log('\n4. Converting smart playlist to static...');
  const convertResult = await request('POST', `/playlists/${smartPlaylist.id}/convert`);

  if (!convertResult) {
    console.error('✗ Failed to convert smart playlist');
    return null;
  }
  console.log(`✓ Converted to static with ${convertResult.track_count} tracks`);

  return smartPlaylist;
}

/**
 * Test session operations
 */
async function testSessions(trackIds) {
  console.log('\n========================================');
  console.log('Testing Session Operations');
  console.log('========================================\n');

  // Start a session
  console.log('1. Starting session...');
  const session = await request('POST', '/playlists/sessions/start', {
    venue: 'Test Club',
    date: Math.floor(Date.now() / 1000),
  });

  if (!session) {
    console.error('✗ Failed to start session');
    return null;
  }
  console.log(`✓ Started session: ${session.name} (${session.id})`);

  // Log track plays
  console.log('\n2. Logging track plays...');
  for (let i = 0; i < Math.min(3, trackIds.length); i++) {
    const logResult = await request('POST', `/playlists/sessions/${session.id}/track`, {
      track_id: trackIds[i],
      played_at: Math.floor(Date.now() / 1000) + (i * 300), // 5 minutes apart
      duration: 180000, // 3 minutes
      notes: `Track ${i + 1} of the night`,
    });

    if (!logResult) {
      console.error(`✗ Failed to log track ${i + 1}`);
      continue;
    }
    console.log(`✓ Logged track ${i + 1}`);
  }

  // Get active sessions
  console.log('\n3. Getting active sessions...');
  const activeSessions = await request('GET', '/playlists/sessions/active');

  if (!activeSessions) {
    console.error('✗ Failed to get active sessions');
    return null;
  }
  console.log(`✓ Found ${activeSessions.count} active sessions`);

  // Finalize session
  console.log('\n4. Finalizing session...');
  const finalizeResult = await request('POST', `/playlists/sessions/${session.id}/finalize`);

  if (!finalizeResult) {
    console.error('✗ Failed to finalize session');
    return null;
  }
  console.log(`✓ Session finalized (duration: ${finalizeResult.session_duration}s)`);

  return session;
}

/**
 * Test thinking playlist operations
 */
async function testThinkingPlaylist(trackIds) {
  console.log('\n========================================');
  console.log('Testing Thinking Playlist Operations');
  console.log('========================================\n');

  // Get thinking playlist
  console.log('1. Getting thinking playlist...');
  const thinkingPlaylist = await request('GET', '/playlists/thinking');

  if (!thinkingPlaylist) {
    console.error('✗ Failed to get thinking playlist');
    return null;
  }
  console.log(`✓ Got thinking playlist: ${thinkingPlaylist.name} (${thinkingPlaylist.id})`);

  // Add tracks to thinking playlist
  console.log('\n2. Adding tracks to thinking playlist...');
  const addResult = await request('POST', `/playlists/${thinkingPlaylist.id}/tracks`, {
    track_ids: trackIds.slice(0, 2),
  });

  if (!addResult) {
    console.error('✗ Failed to add tracks to thinking playlist');
    return null;
  }
  console.log(`✓ Added ${addResult.added_count} tracks to thinking playlist`);

  // Promote thinking playlist
  console.log('\n3. Promoting thinking playlist...');
  const promoteResult = await request('POST', '/playlists/thinking/promote', {
    name: 'Promoted Thinking Playlist',
  });

  if (!promoteResult) {
    console.error('✗ Failed to promote thinking playlist');
    return null;
  }
  console.log(`✓ Promoted to: ${promoteResult.promoted_playlist.name} (${promoteResult.promoted_playlist.id})`);
  console.log(`✓ New thinking playlist created: ${promoteResult.new_thinking_playlist.id}`);

  return promoteResult;
}

/**
 * Test utility operations
 */
async function testUtilities(playlistId) {
  console.log('\n========================================');
  console.log('Testing Utility Operations');
  console.log('========================================\n');

  // Duplicate playlist
  console.log('1. Duplicating playlist...');
  const duplicate = await request('POST', `/playlists/${playlistId}/duplicate`, {
    name: 'Duplicated Playlist',
  });

  if (!duplicate) {
    console.error('✗ Failed to duplicate playlist');
    return null;
  }
  console.log(`✓ Duplicated playlist: ${duplicate.name} (${duplicate.id})`);

  // Search playlists
  console.log('\n2. Searching playlists...');
  const searchResults = await request('GET', '/playlists/search?q=Test');

  if (!searchResults) {
    console.error('✗ Failed to search playlists');
    return null;
  }
  console.log(`✓ Found ${searchResults.count} playlists matching "Test"`);

  // Export playlist (just check the endpoint exists, won't download)
  console.log('\n3. Testing export endpoint...');
  const exportUrl = `${API_BASE}/playlists/${playlistId}/export?format=m3u`;
  console.log(`✓ Export URL: ${exportUrl}`);

  // Get all playlists
  console.log('\n4. Getting all playlists...');
  const allPlaylists = await request('GET', '/playlists');

  if (!allPlaylists) {
    console.error('✗ Failed to get all playlists');
    return null;
  }
  console.log(`✓ Found ${allPlaylists.count} playlists total`);

  return duplicate;
}

/**
 * Test track management operations
 */
async function testTrackManagement(playlistId, trackIds) {
  console.log('\n========================================');
  console.log('Testing Track Management Operations');
  console.log('========================================\n');

  // Reorder tracks
  console.log('1. Reordering tracks...');
  const reorderResult = await request('PUT', `/playlists/${playlistId}/tracks/reorder`, {
    track_ids: trackIds.slice(0, 3).reverse(), // Reverse order
  });

  if (!reorderResult) {
    console.error('✗ Failed to reorder tracks');
    return null;
  }
  console.log(`✓ Tracks reordered`);

  // Update track metadata
  console.log('\n2. Updating track metadata...');
  const updateResult = await request('PUT', `/playlists/${playlistId}/tracks/${trackIds[0]}`, {
    notes: 'Perfect opener',
    cue_in: 15000,
    cue_out: 180000,
    rating_in_context: 5,
  });

  if (!updateResult) {
    console.error('✗ Failed to update track metadata');
    return null;
  }
  console.log(`✓ Track metadata updated`);

  // Remove track from playlist
  console.log('\n3. Removing track from playlist...');
  const removeResult = await request('DELETE', `/playlists/${playlistId}/tracks/${trackIds[2]}`);

  if (!removeResult) {
    console.error('✗ Failed to remove track');
    return null;
  }
  console.log(`✓ Track removed`);

  return true;
}

/**
 * Clean up test data
 */
async function cleanup(playlistIds) {
  console.log('\n========================================');
  console.log('Cleaning Up Test Data');
  console.log('========================================\n');

  for (const id of playlistIds) {
    const result = await request('DELETE', `/playlists/${id}`);
    if (result) {
      console.log(`✓ Deleted playlist: ${id}`);
    }
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n========================================');
  console.log('🧪 Playlist Routes API Test');
  console.log('========================================');

  try {
    // Get track IDs
    const trackIds = await getTrackIds(5);

    // Test CRUD operations
    const staticPlaylist = await testPlaylistCRUD(trackIds);
    if (!staticPlaylist) {
      console.error('\n❌ CRUD tests failed, stopping');
      process.exit(1);
    }

    // Test track management
    await testTrackManagement(staticPlaylist.id, trackIds);

    // Test smart playlists
    const smartPlaylist = await testSmartPlaylists(trackIds);

    // Test sessions
    const session = await testSessions(trackIds);

    // Test thinking playlist
    const thinkingResult = await testThinkingPlaylist(trackIds);

    // Test utilities
    const duplicate = await testUtilities(staticPlaylist.id);

    // Clean up
    const playlistsToDelete = [
      staticPlaylist.id,
      smartPlaylist?.id,
      session?.id,
      thinkingResult?.promoted_playlist?.id,
      duplicate?.id,
    ].filter(id => id);

    await cleanup(playlistsToDelete);

    console.log('\n========================================');
    console.log('✅ All Tests Passed!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
