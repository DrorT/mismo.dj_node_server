/**
 * Unit Tests for Playlist Service
 * Tests CRUD operations, statistics, and utility functions
 */

import * as playlistService from '../src/services/playlist.service.js';
import * as playlistTrackService from '../src/services/playlistTrack.service.js';
import { getDatabase, initDatabase, closeDatabase } from '../src/config/database.js';
import fs from 'fs';
import path from 'path';

// Test database path
const TEST_DB_PATH = './test-playlists.db';

describe('Playlist Service', () => {
  beforeAll(() => {
    // Initialize test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    initDatabase(TEST_DB_PATH);

    // Insert test library directory
    const db = getDatabase();
    db.prepare(`
      INSERT INTO library_directories (id, name, path, is_active, is_available)
      VALUES ('test-lib-id', 'Test Library', '/test/path', 1, 1)
    `).run();

    // Insert test tracks
    for (let i = 1; i <= 10; i++) {
      db.prepare(`
        INSERT INTO tracks (
          id, file_path, file_size, file_modified, file_hash,
          library_directory_id, relative_path, is_missing,
          title, artist, album, genre, year,
          duration_seconds, sample_rate, bit_rate, channels,
          bpm, musical_key, mode, energy, danceability,
          date_added, date_analyzed, analysis_version
        ) VALUES (
          'track-${i}', '/test/track${i}.mp3', 1000000, '2025-01-01', 'hash${i}',
          'test-lib-id', 'track${i}.mp3', 0,
          'Track ${i}', 'Artist ${i}', 'Album ${i}', 'House', 2025,
          180, 44100, 320000, 2,
          ${120 + i}, ${i % 12}, ${i % 2}, -5.0, 0.8,
          '2025-01-01 00:00:00', '2025-01-01 00:00:00', 1
        )
      `).run();
    }
  });

  afterAll(() => {
    closeDatabase();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('createPlaylist', () => {
    test('should create a static playlist', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Test Static Playlist',
        type: 'static',
        description: 'A test playlist',
        color: '#FF5733',
        is_favorite: true,
      });

      expect(playlist).toBeDefined();
      expect(playlist.id).toBeDefined();
      expect(playlist.name).toBe('Test Static Playlist');
      expect(playlist.type).toBe('static');
      expect(playlist.description).toBe('A test playlist');
      expect(playlist.color).toBe('#FF5733');
      expect(playlist.is_favorite).toBe(1);
    });

    test('should create a smart playlist with criteria', () => {
      const criteria = {
        bpm_min: 120,
        bpm_max: 130,
        genres: ['House', 'Techno'],
        energy_min: 0.6,
      };

      const playlist = playlistService.createPlaylist({
        name: 'Test Smart Playlist',
        type: 'smart',
        criteria,
      });

      expect(playlist).toBeDefined();
      expect(playlist.type).toBe('smart');
      expect(playlist.smart_criteria).toEqual(criteria);
    });

    test('should throw error if smart playlist created without criteria', () => {
      expect(() => {
        playlistService.createPlaylist({
          name: 'Invalid Smart Playlist',
          type: 'smart',
        });
      }).toThrow();
    });

    test('should throw error if name is missing', () => {
      expect(() => {
        playlistService.createPlaylist({
          type: 'static',
        });
      }).toThrow();
    });

    test('should throw error if name is too long', () => {
      expect(() => {
        playlistService.createPlaylist({
          name: 'A'.repeat(201),
          type: 'static',
        });
      }).toThrow();
    });
  });

  describe('getPlaylistById', () => {
    let testPlaylistId;

    beforeAll(() => {
      const playlist = playlistService.createPlaylist({
        name: 'Get Test Playlist',
        type: 'static',
      });
      testPlaylistId = playlist.id;

      // Add some tracks
      playlistTrackService.addTracksToPlaylist(testPlaylistId, [
        'track-1',
        'track-2',
        'track-3',
      ]);
    });

    test('should get playlist with tracks', () => {
      const playlist = playlistService.getPlaylistById(testPlaylistId, true);

      expect(playlist).toBeDefined();
      expect(playlist.id).toBe(testPlaylistId);
      expect(playlist.name).toBe('Get Test Playlist');
      expect(playlist.tracks).toHaveLength(3);
      expect(playlist.tracks[0].track).toBeDefined();
      expect(playlist.tracks[0].track.title).toBe('Track 1');
    });

    test('should get playlist without tracks', () => {
      const playlist = playlistService.getPlaylistById(testPlaylistId, false);

      expect(playlist).toBeDefined();
      expect(playlist.tracks).toBeUndefined();
    });

    test('should return null for non-existent playlist', () => {
      const playlist = playlistService.getPlaylistById('non-existent-id');

      expect(playlist).toBeNull();
    });

    test('should throw error for invalid UUID', () => {
      expect(() => {
        playlistService.getPlaylistById('not-a-uuid');
      }).toThrow();
    });
  });

  describe('getAllPlaylists', () => {
    beforeAll(() => {
      // Create various playlists for filtering tests
      playlistService.createPlaylist({
        name: 'Filter Test Static',
        type: 'static',
      });

      playlistService.createPlaylist({
        name: 'Filter Test Smart',
        type: 'smart',
        criteria: { bpm_min: 120 },
      });

      playlistService.createPlaylist({
        name: 'Filter Test Favorite',
        type: 'static',
        is_favorite: true,
      });
    });

    test('should get all playlists', () => {
      const playlists = playlistService.getAllPlaylists();

      expect(playlists).toBeDefined();
      expect(playlists.length).toBeGreaterThan(0);
      expect(playlists[0].track_count).toBeDefined();
    });

    test('should filter by type', () => {
      const staticPlaylists = playlistService.getAllPlaylists({ type: 'static' });
      const smartPlaylists = playlistService.getAllPlaylists({ type: 'smart' });

      expect(staticPlaylists.every(p => p.type === 'static')).toBe(true);
      expect(smartPlaylists.every(p => p.type === 'smart')).toBe(true);
    });

    test('should filter by favorite', () => {
      const favorites = playlistService.getAllPlaylists({ is_favorite: true });

      expect(favorites.every(p => p.is_favorite === 1)).toBe(true);
    });

    test('should search by name', () => {
      const results = playlistService.getAllPlaylists({ search: 'Filter Test' });

      expect(results.every(p => p.name.includes('Filter Test'))).toBe(true);
    });

    test('should filter by temporary flag', () => {
      const temp = playlistService.getAllPlaylists({ is_temporary: true });

      expect(temp.every(p => p.is_temporary === 1)).toBe(true);
    });
  });

  describe('updatePlaylist', () => {
    let testPlaylistId;

    beforeAll(() => {
      const playlist = playlistService.createPlaylist({
        name: 'Update Test Playlist',
        type: 'static',
        description: 'Original description',
      });
      testPlaylistId = playlist.id;
    });

    test('should update playlist name', () => {
      const updated = playlistService.updatePlaylist(testPlaylistId, {
        name: 'Updated Name',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.updated_at).toBeGreaterThan(updated.created_at);
    });

    test('should update multiple fields', () => {
      const updated = playlistService.updatePlaylist(testPlaylistId, {
        description: 'New description',
        color: '#00FF00',
        is_favorite: true,
      });

      expect(updated.description).toBe('New description');
      expect(updated.color).toBe('#00FF00');
      expect(updated.is_favorite).toBe(1);
    });

    test('should throw error if no fields provided', () => {
      expect(() => {
        playlistService.updatePlaylist(testPlaylistId, {});
      }).toThrow('No valid fields to update');
    });

    test('should throw error for non-existent playlist', () => {
      expect(() => {
        playlistService.updatePlaylist('non-existent-id', {
          name: 'New Name',
        });
      }).toThrow();
    });
  });

  describe('deletePlaylist', () => {
    test('should delete playlist', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Delete Test Playlist',
        type: 'static',
      });

      const result = playlistService.deletePlaylist(playlist.id);

      expect(result).toBe(true);

      const deleted = playlistService.getPlaylistById(playlist.id);
      expect(deleted).toBeNull();
    });

    test('should return false for non-existent playlist', () => {
      const result = playlistService.deletePlaylist('non-existent-id');

      expect(result).toBe(false);
    });

    test('should cascade delete tracks', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Cascade Delete Test',
        type: 'static',
      });

      playlistTrackService.addTracksToPlaylist(playlist.id, ['track-1', 'track-2']);

      playlistService.deletePlaylist(playlist.id);

      // Verify tracks are deleted
      const db = getDatabase();
      const tracks = db.prepare('SELECT * FROM playlist_tracks WHERE playlist_id = ?')
        .all(playlist.id);

      expect(tracks).toHaveLength(0);
    });
  });

  describe('getPlaylistStats', () => {
    let testPlaylistId;

    beforeAll(() => {
      const playlist = playlistService.createPlaylist({
        name: 'Stats Test Playlist',
        type: 'static',
      });
      testPlaylistId = playlist.id;

      playlistTrackService.addTracksToPlaylist(testPlaylistId, [
        'track-1', // BPM 121, Key 1
        'track-2', // BPM 122, Key 2
        'track-3', // BPM 123, Key 3
        'track-4', // BPM 124, Key 4
        'track-5', // BPM 125, Key 5
      ]);
    });

    test('should return correct track count', () => {
      const stats = playlistService.getPlaylistStats(testPlaylistId);

      expect(stats.track_count).toBe(5);
    });

    test('should calculate total duration', () => {
      const stats = playlistService.getPlaylistStats(testPlaylistId);

      expect(stats.total_duration).toBe(900); // 5 tracks * 180 seconds
    });

    test('should calculate average BPM', () => {
      const stats = playlistService.getPlaylistStats(testPlaylistId);

      expect(stats.avg_bpm).toBe(123); // (121 + 122 + 123 + 124 + 125) / 5
    });

    test('should provide key distribution', () => {
      const stats = playlistService.getPlaylistStats(testPlaylistId);

      expect(stats.key_distribution).toBeDefined();
      expect(stats.key_distribution['1']).toBe(1);
      expect(stats.key_distribution['2']).toBe(1);
    });

    test('should provide genre distribution', () => {
      const stats = playlistService.getPlaylistStats(testPlaylistId);

      expect(stats.genre_distribution).toBeDefined();
      expect(stats.genre_distribution['House']).toBe(5);
    });

    test('should return null for non-existent playlist', () => {
      const stats = playlistService.getPlaylistStats('non-existent-id');

      expect(stats).toBeNull();
    });
  });

  describe('duplicatePlaylist', () => {
    let sourcePlaylistId;

    beforeAll(() => {
      const playlist = playlistService.createPlaylist({
        name: 'Source Playlist',
        type: 'static',
        description: 'Original',
        color: '#FF5733',
      });
      sourcePlaylistId = playlist.id;

      playlistTrackService.addTracksToPlaylist(sourcePlaylistId, [
        'track-1',
        'track-2',
      ]);

      // Add custom notes to first track
      playlistTrackService.updateTrackMetadata(sourcePlaylistId, 'track-1', {
        notes: 'Great opener',
        rating_in_context: 5,
      });
    });

    test('should duplicate playlist with all metadata', () => {
      const duplicate = playlistService.duplicatePlaylist(
        sourcePlaylistId,
        'Duplicated Playlist'
      );

      expect(duplicate.id).not.toBe(sourcePlaylistId);
      expect(duplicate.name).toBe('Duplicated Playlist');
      expect(duplicate.description).toBe('Original');
      expect(duplicate.color).toBe('#FF5733');
      expect(duplicate.type).toBe('static');
    });

    test('should copy all tracks', () => {
      const duplicate = playlistService.duplicatePlaylist(
        sourcePlaylistId,
        'Duplicate with Tracks'
      );

      const tracks = playlistService.getPlaylistById(duplicate.id, true).tracks;

      expect(tracks).toHaveLength(2);
    });

    test('should copy track metadata', () => {
      const duplicate = playlistService.duplicatePlaylist(
        sourcePlaylistId,
        'Duplicate with Metadata'
      );

      const tracks = playlistService.getPlaylistById(duplicate.id, true).tracks;
      const firstTrack = tracks[0];

      expect(firstTrack.notes).toBe('Great opener');
      expect(firstTrack.rating_in_context).toBe(5);
    });

    test('should convert smart playlist to static', () => {
      const smartPlaylist = playlistService.createPlaylist({
        name: 'Smart to Duplicate',
        type: 'smart',
        criteria: { bpm_min: 120 },
      });

      const duplicate = playlistService.duplicatePlaylist(
        smartPlaylist.id,
        'Duplicated Smart'
      );

      expect(duplicate.type).toBe('static');
      expect(duplicate.smart_criteria).toBeNull();
    });
  });

  describe('exportPlaylistM3U', () => {
    let testPlaylistId;

    beforeAll(() => {
      const playlist = playlistService.createPlaylist({
        name: 'Export Test Playlist',
        type: 'static',
        description: 'For export testing',
      });
      testPlaylistId = playlist.id;

      playlistTrackService.addTracksToPlaylist(testPlaylistId, [
        'track-1',
        'track-2',
        'track-3',
      ]);
    });

    test('should generate M3U content', () => {
      const m3u = playlistService.exportPlaylistM3U(testPlaylistId);

      expect(m3u).toContain('#EXTM3U');
      expect(m3u).toContain('# Playlist: Export Test Playlist');
      expect(m3u).toContain('# Description: For export testing');
      expect(m3u).toContain('# Generated by Mismo DJ');
    });

    test('should include track metadata', () => {
      const m3u = playlistService.exportPlaylistM3U(testPlaylistId);

      expect(m3u).toContain('#EXTINF:180,Artist 1 - Track 1');
      expect(m3u).toContain('/test/track1.mp3');
      expect(m3u).toContain('Artist 2 - Track 2');
    });

    test('should handle missing track metadata gracefully', () => {
      // Create playlist with tracks missing metadata
      const db = getDatabase();
      db.prepare(`
        INSERT INTO tracks (
          id, file_path, file_size, file_modified, file_hash,
          library_directory_id, relative_path, is_missing,
          duration_seconds, sample_rate, bit_rate, channels,
          date_added
        ) VALUES (
          'track-no-meta', '/test/nometa.mp3', 1000, '2025-01-01', 'hash',
          'test-lib-id', 'nometa.mp3', 0,
          180, 44100, 320000, 2,
          '2025-01-01 00:00:00'
        )
      `).run();

      const playlist = playlistService.createPlaylist({
        name: 'No Metadata Test',
        type: 'static',
      });

      playlistTrackService.addTracksToPlaylist(playlist.id, ['track-no-meta']);

      const m3u = playlistService.exportPlaylistM3U(playlist.id);

      expect(m3u).toContain('Unknown Artist - Unknown Title');
    });

    test('should skip missing tracks', () => {
      const db = getDatabase();

      // Mark a track as missing
      db.prepare('UPDATE tracks SET is_missing = 1 WHERE id = ?').run('track-1');

      const m3u = playlistService.exportPlaylistM3U(testPlaylistId);

      // Should not contain the missing track
      expect(m3u).not.toContain('/test/track1.mp3');
    });
  });

  describe('getThinkingPlaylist', () => {
    test('should create thinking playlist if not exists', () => {
      const thinking = playlistService.getThinkingPlaylist();

      expect(thinking).toBeDefined();
      expect(thinking.name).toBe('Thinking Playlist');
      expect(thinking.type).toBe('temp');
      expect(thinking.is_temporary).toBe(1);
    });

    test('should return existing thinking playlist', () => {
      const first = playlistService.getThinkingPlaylist();
      const second = playlistService.getThinkingPlaylist();

      expect(first.id).toBe(second.id);
    });
  });

  describe('promoteThinkingPlaylist', () => {
    beforeEach(() => {
      // Clear thinking playlist before each test
      const thinking = playlistService.getThinkingPlaylist();
      const db = getDatabase();
      db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(thinking.id);
    });

    test('should promote thinking playlist to static', () => {
      const thinking = playlistService.getThinkingPlaylist();

      // Add tracks to thinking playlist
      playlistTrackService.addTracksToPlaylist(thinking.id, [
        'track-1',
        'track-2',
      ]);

      const result = playlistService.promoteThinkingPlaylist('Promoted Playlist');

      expect(result.promoted_playlist).toBeDefined();
      expect(result.promoted_playlist.name).toBe('Promoted Playlist');
      expect(result.promoted_playlist.type).toBe('static');
      expect(result.promoted_playlist.is_temporary).toBe(0);
    });

    test('should clear thinking playlist after promotion', () => {
      const thinking = playlistService.getThinkingPlaylist();

      playlistTrackService.addTracksToPlaylist(thinking.id, [
        'track-1',
        'track-2',
      ]);

      const result = playlistService.promoteThinkingPlaylist('Cleared After Promotion');

      // Check new thinking playlist is empty
      const newThinking = playlistService.getPlaylistById(result.new_thinking_playlist.id, true);
      expect(newThinking.tracks).toHaveLength(0);
    });

    test('should return new thinking playlist reference', () => {
      const thinking = playlistService.getThinkingPlaylist();

      const result = playlistService.promoteThinkingPlaylist('New Thinking Test');

      expect(result.new_thinking_playlist).toBeDefined();
      expect(result.new_thinking_playlist.id).toBe(thinking.id);
      expect(result.new_thinking_playlist.type).toBe('temp');
    });
  });

  describe('convertSmartToStatic', () => {
    let smartPlaylistId;

    beforeAll(() => {
      const smart = playlistService.createPlaylist({
        name: 'Convert Test Smart',
        type: 'smart',
        criteria: {
          bpm_min: 120,
          bpm_max: 130,
        },
      });
      smartPlaylistId = smart.id;

      // Add some tracks
      playlistTrackService.addTracksToPlaylist(smartPlaylistId, [
        'track-1',
        'track-2',
        'track-3',
      ]);
    });

    test('should convert smart playlist to static', () => {
      const result = playlistService.convertSmartToStatic(smartPlaylistId);

      expect(result.track_count).toBe(3);

      const playlist = playlistService.getPlaylistById(smartPlaylistId);
      expect(playlist.type).toBe('static');
      expect(playlist.smart_criteria).toBeNull();
    });

    test('should preserve existing tracks', () => {
      const smart = playlistService.createPlaylist({
        name: 'Preserve Tracks Test',
        type: 'smart',
        criteria: { bpm_min: 120 },
      });

      playlistTrackService.addTracksToPlaylist(smart.id, ['track-1', 'track-2']);

      playlistService.convertSmartToStatic(smart.id);

      const playlist = playlistService.getPlaylistById(smart.id, true);
      expect(playlist.tracks).toHaveLength(2);
    });

    test('should throw error for non-smart playlist', () => {
      const staticPlaylist = playlistService.createPlaylist({
        name: 'Static Playlist',
        type: 'static',
      });

      expect(() => {
        playlistService.convertSmartToStatic(staticPlaylist.id);
      }).toThrow('Only smart playlists can be converted to static');
    });
  });

  describe('getFavorites', () => {
    beforeAll(() => {
      playlistService.createPlaylist({
        name: 'Favorite 1',
        type: 'static',
        is_favorite: true,
      });

      playlistService.createPlaylist({
        name: 'Favorite 2',
        type: 'static',
        is_favorite: true,
      });

      playlistService.createPlaylist({
        name: 'Not Favorite',
        type: 'static',
        is_favorite: false,
      });
    });

    test('should return only favorite playlists', () => {
      const favorites = playlistService.getFavorites();

      expect(favorites.every(p => p.is_favorite === 1)).toBe(true);
      expect(favorites.length).toBeGreaterThanOrEqual(2);
    });
  });
});
