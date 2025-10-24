/**
 * Unit Tests for Smart Playlist Evaluator Service
 * Tests criteria evaluation, SQL generation, and explanation
 */

import * as smartPlaylistService from '../src/services/smartPlaylistEvaluator.service.js';
import * as playlistService from '../src/services/playlist.service.js';
import { getDatabase, initDatabase, closeDatabase } from '../src/config/database.js';
import fs from 'fs';

const TEST_DB_PATH = './test-smart-playlists.db';

describe('Smart Playlist Evaluator Service', () => {
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

    // Insert diverse test tracks
    const tracks = [
      { id: '1', bpm: 120, key: 0, mode: 1, genre: 'House', energy: -5.0, danceability: 0.8, valence: 6.5, arousal: 7.0 },
      { id: '2', bpm: 125, key: 5, mode: 1, genre: 'House', energy: -6.0, danceability: 0.9, valence: 7.0, arousal: 7.5 },
      { id: '3', bpm: 130, key: 7, mode: 0, genre: 'Techno', energy: -4.5, danceability: 0.85, valence: 5.5, arousal: 8.0 },
      { id: '4', bpm: 128, key: 2, mode: 1, genre: 'Trance', energy: -5.5, danceability: 0.75, valence: 6.0, arousal: 7.2 },
      { id: '5', bpm: 122, key: 9, mode: 0, genre: 'House', energy: -7.0, danceability: 0.7, valence: 5.0, arousal: 6.5 },
      { id: '6', bpm: 135, key: 11, mode: 1, genre: 'Techno', energy: -4.0, danceability: 0.95, valence: 8.0, arousal: 9.0 },
      { id: '7', bpm: 118, key: 3, mode: 0, genre: 'Deep House', energy: -8.0, danceability: 0.65, valence: 4.5, arousal: 5.5 },
      { id: '8', bpm: 140, key: 6, mode: 1, genre: 'Hard Techno', energy: -3.5, danceability: 0.9, valence: 7.5, arousal: 9.5 },
    ];

    tracks.forEach(t => {
      db.prepare(`
        INSERT INTO tracks (
          id, file_path, file_size, file_modified, file_hash,
          library_directory_id, relative_path, is_missing,
          title, artist, album, genre, year,
          duration_seconds, sample_rate, bit_rate, channels,
          bpm, musical_key, mode, energy, danceability, valence, arousal,
          date_added, date_analyzed, analysis_version
        ) VALUES (
          'track-${t.id}', '/test/track${t.id}.mp3', 1000000, '2025-01-01', 'hash${t.id}',
          'test-lib-id', 'track${t.id}.mp3', 0,
          'Track ${t.id}', 'Artist ${t.id}', 'Album ${t.id}', '${t.genre}', 2025,
          180, 44100, 320000, 2,
          ${t.bpm}, ${t.key}, ${t.mode}, ${t.energy}, ${t.danceability}, ${t.valence}, ${t.arousal},
          '2025-01-01 00:00:00', '2025-01-01 00:00:00', 1
        )
      `).run();
    });
  });

  afterAll(() => {
    closeDatabase();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('evaluateCriteria', () => {
    test('should return all tracks with empty criteria', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({});

      expect(trackIds).toHaveLength(8);
    });

    test('should filter by BPM range', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        bpm_min: 120,
        bpm_max: 130,
      });

      // Should match tracks: 1 (120), 2 (125), 3 (130), 4 (128), 5 (122)
      expect(trackIds.length).toBeGreaterThanOrEqual(5);
      expect(trackIds.length).toBeLessThanOrEqual(5);
    });

    test('should filter by exact BPM', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        bpm_min: 128,
        bpm_max: 128,
      });

      expect(trackIds).toHaveLength(1);
    });

    test('should filter by musical key', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        key: 5,
      });

      // Should match track 2
      expect(trackIds).toHaveLength(1);
      expect(trackIds[0]).toBe('track-2');
    });

    test('should filter by mode', () => {
      const majorTracks = smartPlaylistService.evaluateCriteria({
        mode: 1,
      });

      const minorTracks = smartPlaylistService.evaluateCriteria({
        mode: 0,
      });

      expect(majorTracks.length + minorTracks.length).toBe(8);
    });

    test('should filter by genres (OR logic)', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        genres: ['House', 'Techno'],
      });

      // Should match House and Techno tracks
      expect(trackIds.length).toBeGreaterThanOrEqual(5);
    });

    test('should filter by energy range', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        energy_min: -6.0,
        energy_max: -4.0,
      });

      // Should match tracks with energy between -6 and -4
      expect(trackIds.length).toBeGreaterThan(0);
    });

    test('should filter by danceability', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        danceability_min: 0.8,
      });

      // Should match tracks with danceability >= 0.8
      expect(trackIds.length).toBeGreaterThan(0);
    });

    test('should filter by valence range', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        valence_min: 6.0,
        valence_max: 8.0,
      });

      expect(trackIds.length).toBeGreaterThan(0);
    });

    test('should filter by arousal range', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        arousal_min: 7.0,
        arousal_max: 9.0,
      });

      expect(trackIds.length).toBeGreaterThan(0);
    });

    test('should combine multiple criteria (AND logic)', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        bpm_min: 120,
        bpm_max: 130,
        genres: ['House'],
        energy_min: -6.0,
      });

      // Should match House tracks with BPM 120-130 and energy >= -6.0
      expect(trackIds.length).toBeGreaterThan(0);
      expect(trackIds.length).toBeLessThan(8);
    });

    test('should filter by key and mode together', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        key: 0,
        mode: 1,
      });

      // Should match track 1 (key 0, major)
      expect(trackIds).toHaveLength(1);
      expect(trackIds[0]).toBe('track-1');
    });

    test('should handle very restrictive criteria', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        bpm_min: 200,
        bpm_max: 210,
      });

      // No tracks should match
      expect(trackIds).toHaveLength(0);
    });
  });

  describe('refreshSmartPlaylist', () => {
    test('should add matching tracks on first refresh', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Refresh Test 1',
        type: 'smart',
        criteria: {
          bpm_min: 120,
          bpm_max: 130,
        },
      });

      const result = smartPlaylistService.refreshSmartPlaylist(playlist.id);

      expect(result.added).toBeGreaterThan(0);
      expect(result.removed).toBe(0);
      expect(result.total).toBe(result.added);
    });

    test('should add new tracks when criteria becomes less restrictive', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Refresh Test 2',
        type: 'smart',
        criteria: {
          bpm_min: 125,
          bpm_max: 128,
        },
      });

      // First refresh
      const result1 = smartPlaylistService.refreshSmartPlaylist(playlist.id);
      const firstCount = result1.total;

      // Update criteria to be less restrictive
      playlistService.updatePlaylist(playlist.id, {
        smart_criteria: {
          bpm_min: 120,
          bpm_max: 135,
        },
      });

      // Second refresh
      const result2 = smartPlaylistService.refreshSmartPlaylist(playlist.id);

      expect(result2.total).toBeGreaterThan(firstCount);
      expect(result2.added).toBeGreaterThan(0);
    });

    test('should remove tracks when criteria becomes more restrictive', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Refresh Test 3',
        type: 'smart',
        criteria: {
          bpm_min: 120,
          bpm_max: 140,
        },
      });

      // First refresh
      smartPlaylistService.refreshSmartPlaylist(playlist.id);

      // Update criteria to be more restrictive
      playlistService.updatePlaylist(playlist.id, {
        smart_criteria: {
          bpm_min: 128,
          bpm_max: 130,
        },
      });

      // Second refresh
      const result = smartPlaylistService.refreshSmartPlaylist(playlist.id);

      expect(result.removed).toBeGreaterThan(0);
      expect(result.total).toBeLessThan(result.added + result.removed);
    });

    test('should maintain tracks when criteria stays the same', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Refresh Test 4',
        type: 'smart',
        criteria: {
          genres: ['House'],
        },
      });

      // First refresh
      const result1 = smartPlaylistService.refreshSmartPlaylist(playlist.id);

      // Second refresh without changing criteria
      const result2 = smartPlaylistService.refreshSmartPlaylist(playlist.id);

      expect(result2.added).toBe(0);
      expect(result2.removed).toBe(0);
      expect(result2.total).toBe(result1.total);
    });

    test('should throw error for non-smart playlist', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Not Smart',
        type: 'static',
      });

      expect(() => {
        smartPlaylistService.refreshSmartPlaylist(playlist.id);
      }).toThrow();
    });
  });

  describe('explainCriteria', () => {
    test('should explain empty criteria', () => {
      const explanation = smartPlaylistService.explainCriteria({});

      expect(explanation).toBe('All tracks (no filters applied)');
    });

    test('should explain BPM range', () => {
      const explanation = smartPlaylistService.explainCriteria({
        bpm_min: 120,
        bpm_max: 135,
      });

      expect(explanation).toContain('BPM between 120 and 135');
    });

    test('should explain single BPM', () => {
      const explanation = smartPlaylistService.explainCriteria({
        bpm_min: 128,
      });

      expect(explanation).toContain('BPM at least 128');
    });

    test('should explain genres', () => {
      const explanation = smartPlaylistService.explainCriteria({
        genres: ['House', 'Techno', 'Trance'],
      });

      expect(explanation).toContain('Genres: House, Techno, Trance');
    });

    test('should explain key and mode', () => {
      const explanation = smartPlaylistService.explainCriteria({
        key: 5,
        mode: 1,
      });

      expect(explanation).toContain('Key: F (Major)');
    });

    test('should explain energy range', () => {
      const explanation = smartPlaylistService.explainCriteria({
        energy_min: -6.0,
      });

      expect(explanation).toContain('Energy at least -6');
    });

    test('should explain danceability', () => {
      const explanation = smartPlaylistService.explainCriteria({
        danceability_min: 0.7,
      });

      expect(explanation).toContain('Danceability at least 0.7');
    });

    test('should explain valence range', () => {
      const explanation = smartPlaylistService.explainCriteria({
        valence_min: 5.0,
        valence_max: 8.0,
      });

      expect(explanation).toContain('Valence between 5 and 8');
    });

    test('should explain arousal range', () => {
      const explanation = smartPlaylistService.explainCriteria({
        arousal_min: 7.0,
      });

      expect(explanation).toContain('Arousal at least 7');
    });

    test('should explain date filters', () => {
      const timestamp = 1704067200; // 2024-01-01
      const explanation = smartPlaylistService.explainCriteria({
        date_added_after: timestamp,
      });

      expect(explanation).toContain('Added after');
    });

    test('should explain play count filter', () => {
      const explanation = smartPlaylistService.explainCriteria({
        play_count_min: 5,
      });

      expect(explanation).toContain('Played at least 5 times');
    });

    test('should explain rating filter', () => {
      const explanation = smartPlaylistService.explainCriteria({
        rating_min: 4,
      });

      expect(explanation).toContain('Rating at least 4');
    });

    test('should explain audio properties', () => {
      const explanation = smartPlaylistService.explainCriteria({
        bit_rate_min: 320000,
        duration_min: 180,
        duration_max: 300,
      });

      expect(explanation).toContain('Bitrate at least 320 kbps');
      expect(explanation).toContain('Duration between 180s and 300s');
    });

    test('should explain analysis flags', () => {
      const explanation = smartPlaylistService.explainCriteria({
        is_analyzed: true,
        has_stems: false,
      });

      expect(explanation).toContain('Analyzed tracks only');
      expect(explanation).toContain('Without stems');
    });

    test('should combine multiple criteria explanations', () => {
      const explanation = smartPlaylistService.explainCriteria({
        bpm_min: 120,
        bpm_max: 135,
        genres: ['House'],
        energy_min: -6.0,
        danceability_min: 0.7,
      });

      expect(explanation).toContain('BPM between 120 and 135');
      expect(explanation).toContain('Genres: House');
      expect(explanation).toContain('Energy at least -6');
      expect(explanation).toContain('Danceability at least 0.7');
    });
  });

  describe('getKeyName', () => {
    test('should return correct key names', () => {
      expect(smartPlaylistService.getKeyName(0)).toBe('C');
      expect(smartPlaylistService.getKeyName(1)).toBe('C#/Db');
      expect(smartPlaylistService.getKeyName(2)).toBe('D');
      expect(smartPlaylistService.getKeyName(5)).toBe('F');
      expect(smartPlaylistService.getKeyName(7)).toBe('G');
      expect(smartPlaylistService.getKeyName(11)).toBe('B');
    });

    test('should return "Unknown" for invalid keys', () => {
      expect(smartPlaylistService.getKeyName(12)).toBe('Unknown');
      expect(smartPlaylistService.getKeyName(-1)).toBe('Unknown');
      expect(smartPlaylistService.getKeyName(null)).toBe('Unknown');
    });
  });

  describe('Edge Cases', () => {
    test('should handle null/undefined criteria values', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        bpm_min: null,
        bpm_max: undefined,
        genres: null,
      });

      // Should return all tracks when criteria are null/undefined
      expect(trackIds).toHaveLength(8);
    });

    test('should handle empty genres array', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        genres: [],
      });

      // Empty genres array should be ignored
      expect(trackIds).toHaveLength(8);
    });

    test('should handle inverted ranges gracefully', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        bpm_min: 135,
        bpm_max: 120, // Inverted range
      });

      // Should return no matches
      expect(trackIds).toHaveLength(0);
    });

    test('should handle very large numbers', () => {
      const trackIds = smartPlaylistService.evaluateCriteria({
        bpm_min: 999999,
      });

      expect(trackIds).toHaveLength(0);
    });

    test('should handle negative numbers for energy correctly', () => {
      // Energy is stored as negative dB values
      const trackIds = smartPlaylistService.evaluateCriteria({
        energy_min: -10.0,
        energy_max: -3.0,
      });

      expect(trackIds.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    test('should handle complex criteria efficiently', () => {
      const start = Date.now();

      smartPlaylistService.evaluateCriteria({
        bpm_min: 120,
        bpm_max: 135,
        genres: ['House', 'Techno'],
        key: 5,
        mode: 1,
        energy_min: -6.0,
        danceability_min: 0.7,
        valence_min: 6.0,
        arousal_min: 7.0,
      });

      const duration = Date.now() - start;

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });

    test('should handle multiple refreshes efficiently', () => {
      const playlist = playlistService.createPlaylist({
        name: 'Performance Test',
        type: 'smart',
        criteria: {
          bpm_min: 120,
          bpm_max: 130,
        },
      });

      const start = Date.now();

      // Refresh 10 times
      for (let i = 0; i < 10; i++) {
        smartPlaylistService.refreshSmartPlaylist(playlist.id);
      }

      const duration = Date.now() - start;

      // Should complete 10 refreshes in under 500ms
      expect(duration).toBeLessThan(500);
    });
  });
});
