# Phase 5: Playlist System - Implementation Plan

**Document Status**: Implementation Ready
**Created**: 2025-10-24
**Target Timeline**: 4-5 days (30-38 hours)
**Implementation Strategy**: Option A - Full Feature Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [4-Day Implementation Plan](#4-day-implementation-plan)
3. [Technical Decisions](#technical-decisions)
4. [File Structure](#file-structure)
5. [Integration Points](#integration-points)
6. [Error Handling](#error-handling)
7. [Performance Considerations](#performance-considerations)
8. [Success Criteria](#success-criteria)
9. [Future Enhancements](#future-enhancements)

---

## Overview

### Goal

Implement a complete playlist management system with **4 playlist types**:

1. **Static Playlists** - Manual track curation
2. **Smart Playlists** - Auto-populated based on criteria
3. **Session History** - Track plays during DJ sessions
4. **Temporary Playlists** - Single "Thinking Playlist" for exploration

### Key Features

- ✅ Full CRUD operations for all playlist types
- ✅ Smart playlist evaluator leveraging rich analysis metadata (BPM, key, energy, danceability, arousal, valence)
- ✅ Session management with auto-finalization
- ✅ Track-level metadata (notes, cue points, ratings)
- ✅ Real-time WebSocket updates
- ✅ M3U export functionality
- ✅ Interactive HTML test client

### Current State

**Database**:
- ✅ Basic `playlists` table exists (UUIDs already in place)
- ✅ Basic `playlist_tracks` table exists
- 🔧 Need to enhance schema for full feature support

**Analysis Data Available**:
- ✅ BPM, key, mode, time signature
- ✅ Energy, danceability, valence, arousal
- ✅ Beats, downbeats, first phrase beat
- ✅ Spectral features (centroid, rolloff, bandwidth)

---

## 4-Day Implementation Plan

### **Day 1: Database Schema + Core Playlist Service** (6-8 hours)

#### 1.1 Database Migration (2 hours)

**File**: `migrations/012_enhance_playlists_schema.sql`

**Schema Enhancements:**

```sql
-- Add new columns to playlists table
ALTER TABLE playlists ADD COLUMN type TEXT NOT NULL DEFAULT 'static'
  CHECK(type IN ('static', 'smart', 'session', 'temp'));
ALTER TABLE playlists ADD COLUMN session_date INTEGER;
ALTER TABLE playlists ADD COLUMN session_venue TEXT;
ALTER TABLE playlists ADD COLUMN session_duration INTEGER;
ALTER TABLE playlists ADD COLUMN is_temporary INTEGER DEFAULT 0;
ALTER TABLE playlists ADD COLUMN is_readonly INTEGER DEFAULT 0;
ALTER TABLE playlists ADD COLUMN is_favorite INTEGER DEFAULT 0;
ALTER TABLE playlists ADD COLUMN created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'));
ALTER TABLE playlists ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'));
ALTER TABLE playlists ADD COLUMN last_accessed INTEGER;

-- Add new columns to playlist_tracks table
ALTER TABLE playlist_tracks ADD COLUMN played_at INTEGER;
ALTER TABLE playlist_tracks ADD COLUMN play_duration INTEGER;
ALTER TABLE playlist_tracks ADD COLUMN notes TEXT;
ALTER TABLE playlist_tracks ADD COLUMN cue_in INTEGER;
ALTER TABLE playlist_tracks ADD COLUMN cue_out INTEGER;
ALTER TABLE playlist_tracks ADD COLUMN rating_in_context INTEGER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_playlists_type ON playlists(type);
CREATE INDEX IF NOT EXISTS idx_playlists_temporary ON playlists(is_temporary);
CREATE INDEX IF NOT EXISTS idx_playlists_session_date ON playlists(session_date);
CREATE INDEX IF NOT EXISTS idx_playlists_favorite ON playlists(is_favorite);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_played ON playlist_tracks(played_at);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_added ON playlist_tracks(added_at);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_playlist_timestamp
AFTER UPDATE ON playlists
BEGIN
  UPDATE playlists SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
```

**Migration Steps**:
1. Read existing schema from database
2. Apply ALTER TABLE statements
3. Create new indexes
4. Create triggers
5. Verify schema version update

#### 1.2 Playlist Service Implementation (4-6 hours)

**File**: `src/services/playlist.service.js`

**Core Functions:**

```javascript
/**
 * Playlist Service
 * Manages playlist records in the database
 */

import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { generateUUID, isValidUUID } from '../utils/uuid.js';

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new playlist
 * @param {Object} playlistData - Playlist metadata
 * @param {string} playlistData.name - Playlist name
 * @param {string} playlistData.type - Playlist type (static/smart/session/temp)
 * @param {string} playlistData.description - Optional description
 * @param {string} playlistData.color - Optional color (hex)
 * @param {string} playlistData.icon - Optional icon identifier
 * @param {Object} playlistData.criteria - Smart playlist criteria (JSON)
 * @param {string} playlistData.session_venue - Session venue (for session type)
 * @param {number} playlistData.session_date - Session date timestamp
 * @returns {Object} Created playlist
 */
export function createPlaylist(playlistData);

/**
 * Get playlist by ID
 * @param {string} id - Playlist UUID
 * @param {boolean} includeTracks - Include tracks in response
 * @returns {Object|null} Playlist or null
 */
export function getPlaylistById(id, includeTracks = true);

/**
 * Get all playlists with optional filtering
 * @param {Object} filters - Filter criteria
 * @param {string} filters.type - Filter by type
 * @param {boolean} filters.is_favorite - Filter favorites
 * @param {boolean} filters.is_temporary - Filter temporary
 * @param {string} filters.search - Search by name
 * @returns {Array} Array of playlists
 */
export function getAllPlaylists(filters = {});

/**
 * Update playlist metadata
 * @param {string} id - Playlist UUID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated playlist
 */
export function updatePlaylist(id, updates);

/**
 * Delete playlist
 * @param {string} id - Playlist UUID
 * @returns {boolean} Success
 */
export function deletePlaylist(id);

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get playlist statistics
 * @param {string} id - Playlist UUID
 * @returns {Object} Statistics (track count, duration, BPM range, key distribution, etc.)
 */
export function getPlaylistStats(id);

/**
 * Get recently updated playlists
 * @param {number} limit - Number of playlists to return
 * @returns {Array} Recently updated playlists
 */
export function getRecentlyUpdated(limit = 10);

/**
 * Get favorite playlists
 * @returns {Array} Favorite playlists
 */
export function getFavorites();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Duplicate playlist
 * @param {string} id - Playlist UUID to duplicate
 * @param {string} newName - Name for duplicated playlist
 * @returns {Object} New playlist
 */
export function duplicatePlaylist(id, newName);

/**
 * Export playlist
 * @param {string} id - Playlist UUID
 * @param {string} format - Export format ('m3u', 'json')
 * @returns {string} Exported playlist data
 */
export function exportPlaylist(id, format = 'm3u');
```

**Implementation Notes**:
- Follow patterns from `track.service.js`
- Use `getDatabase()` for all DB operations
- Validate UUIDs with `isValidUUID()`
- Log all operations with context
- Use prepared statements for queries
- Handle errors gracefully with try/catch

---

### **Day 2: Track Management + Smart Playlists** (8-10 hours)

#### 2.1 Playlist Track Service (3-4 hours)

**File**: `src/services/playlistTrack.service.js`

**Core Functions:**

```javascript
/**
 * Playlist Track Service
 * Manages tracks within playlists
 */

import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { isValidUUID } from '../utils/uuid.js';
import * as trackService from './track.service.js';

// ============================================================================
// Track Management
// ============================================================================

/**
 * Add tracks to playlist
 * @param {string} playlistId - Playlist UUID
 * @param {Array<string>} trackIds - Array of track UUIDs
 * @param {number} position - Position to insert (null = append)
 * @param {string} notes - Optional notes for all tracks
 * @returns {Array} Added playlist_track records
 */
export function addTracksToPlaylist(playlistId, trackIds, position = null, notes = null);

/**
 * Remove track from playlist
 * @param {string} playlistId - Playlist UUID
 * @param {string} trackId - Track UUID
 * @returns {boolean} Success
 */
export function removeTrackFromPlaylist(playlistId, trackId);

/**
 * Reorder tracks in playlist
 * @param {string} playlistId - Playlist UUID
 * @param {Array<string>} trackIds - New order of track UUIDs
 * @returns {boolean} Success
 */
export function reorderTracks(playlistId, trackIds);

/**
 * Update track metadata within playlist
 * @param {string} playlistId - Playlist UUID
 * @param {string} trackId - Track UUID
 * @param {Object} metadata - Metadata to update (notes, cue_in, cue_out, rating_in_context)
 * @returns {Object} Updated record
 */
export function updateTrackMetadata(playlistId, trackId, metadata);

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all tracks in playlist
 * @param {string} playlistId - Playlist UUID
 * @param {string} sortBy - Sort field (default: 'position')
 * @returns {Array} Tracks with playlist-specific metadata
 */
export function getPlaylistTracks(playlistId, sortBy = 'position');

/**
 * Get all playlists containing a track
 * @param {string} trackId - Track UUID
 * @returns {Array} Playlists containing this track
 */
export function getPlaylistsContainingTrack(trackId);

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate track exists
 * @param {string} trackId - Track UUID
 * @returns {boolean} True if exists
 */
export function validateTrackExists(trackId);

/**
 * Check if track already in playlist
 * @param {string} playlistId - Playlist UUID
 * @param {string} trackId - Track UUID
 * @returns {boolean} True if duplicate
 */
export function checkDuplicate(playlistId, trackId);
```

**Position Management Logic**:
- Get max position: `SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = ?`
- Insert at position: Shift all positions >= insert position by 1
- Remove track: Resequence positions to fill gap
- Reorder: Update all positions in transaction

**Key Implementation Details**:
- Allow duplicates in static playlists (no unique constraint enforcement)
- Use transactions for multi-step operations (reorder, bulk add)
- Auto-increment positions when appending
- Resequence positions after removal to avoid gaps

#### 2.2 Smart Playlist Evaluator (5-6 hours)

**File**: `src/services/smartPlaylistEvaluator.service.js`

**Supported Criteria Schema**:

```javascript
{
  // BPM filters
  bpm_min: number,              // e.g., 120
  bpm_max: number,              // e.g., 135

  // Key/mode filters
  key: number,                  // 0-11 (C=0, C#/Db=1, ..., B=11)
  mode: number,                 // 0=minor, 1=major

  // Genre filters
  genres: string[],             // e.g., ['House', 'Tech House']

  // Energy/mood filters
  energy_min: number,           // 0.0-1.0
  energy_max: number,
  danceability_min: number,     // 0.0-1.0
  valence_min: number,          // Musical positivity
  arousal_min: number,          // Energy/excitement level

  // Date filters
  date_added_after: number,     // Unix timestamp
  date_added_before: number,

  // Play stats
  play_count_min: number,
  play_count_max: number,
  last_played_before: number,   // Unix timestamp
  last_played_after: number,

  // Quality filters
  rating_min: number,           // 1-5
  bitrate_min: number,          // kbps

  // Library filters
  library_directory_id: string, // UUID
  relative_path_contains: string,

  // Analysis filters
  is_analyzed: boolean,         // Has been analyzed
  has_stems: boolean,           // Has stems data

  // Sorting & limiting
  sort_by: string,              // Field name (e.g., 'energy', 'bpm', 'date_added')
  sort_order: string,           // 'asc' or 'desc'
  limit: number                 // Max tracks to return
}
```

**Core Functions:**

```javascript
/**
 * Smart Playlist Evaluator
 * Converts JSON criteria to SQL queries
 */

import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Evaluate criteria and return matching track IDs
 * @param {Object} criteria - Smart playlist criteria
 * @returns {Array<string>} Array of track UUIDs
 */
export function evaluateCriteria(criteria);

/**
 * Build SQL query from criteria
 * @param {Object} criteria - Smart playlist criteria
 * @returns {Object} { sql, params } - Prepared statement
 */
export function buildSQLQuery(criteria);

/**
 * Generate human-readable explanation of criteria
 * @param {Object} criteria - Smart playlist criteria
 * @returns {string} Human-readable description
 */
export function explainCriteria(criteria);

/**
 * Refresh smart playlist (re-evaluate and update tracks)
 * @param {string} playlistId - Playlist UUID
 * @returns {Object} { added, removed, total } - Change summary
 */
export function refreshSmartPlaylist(playlistId);

/**
 * Convert smart playlist to static
 * @param {string} playlistId - Playlist UUID
 * @returns {Object} Converted playlist
 */
export function convertToStatic(playlistId);
```

**Query Builder Logic**:

```javascript
function buildWhereClause(criteria) {
  const conditions = [];
  const params = [];

  // BPM range
  if (criteria.bpm_min !== undefined) {
    conditions.push('bpm >= ?');
    params.push(criteria.bpm_min);
  }
  if (criteria.bpm_max !== undefined) {
    conditions.push('bpm <= ?');
    params.push(criteria.bpm_max);
  }

  // Key
  if (criteria.key !== undefined) {
    conditions.push('musical_key = ?');
    params.push(criteria.key);
  }

  // Mode (major/minor)
  if (criteria.mode !== undefined) {
    conditions.push('mode = ?');
    params.push(criteria.mode);
  }

  // Genre (IN clause)
  if (criteria.genres && criteria.genres.length > 0) {
    const placeholders = criteria.genres.map(() => '?').join(',');
    conditions.push(`genre IN (${placeholders})`);
    params.push(...criteria.genres);
  }

  // Energy range
  if (criteria.energy_min !== undefined) {
    conditions.push('energy >= ?');
    params.push(criteria.energy_min);
  }
  if (criteria.energy_max !== undefined) {
    conditions.push('energy <= ?');
    params.push(criteria.energy_max);
  }

  // Danceability
  if (criteria.danceability_min !== undefined) {
    conditions.push('danceability >= ?');
    params.push(criteria.danceability_min);
  }

  // Valence (musical positivity)
  if (criteria.valence_min !== undefined) {
    conditions.push('valence >= ?');
    params.push(criteria.valence_min);
  }

  // Arousal
  if (criteria.arousal_min !== undefined) {
    conditions.push('arousal >= ?');
    params.push(criteria.arousal_min);
  }

  // Date added range
  if (criteria.date_added_after !== undefined) {
    conditions.push('date_added >= ?');
    params.push(criteria.date_added_after);
  }
  if (criteria.date_added_before !== undefined) {
    conditions.push('date_added <= ?');
    params.push(criteria.date_added_before);
  }

  // Play count range
  if (criteria.play_count_min !== undefined) {
    conditions.push('play_count >= ?');
    params.push(criteria.play_count_min);
  }
  if (criteria.play_count_max !== undefined) {
    conditions.push('play_count <= ?');
    params.push(criteria.play_count_max);
  }

  // Last played
  if (criteria.last_played_before !== undefined) {
    conditions.push('last_played <= ?');
    params.push(criteria.last_played_before);
  }
  if (criteria.last_played_after !== undefined) {
    conditions.push('last_played >= ?');
    params.push(criteria.last_played_after);
  }

  // Rating
  if (criteria.rating_min !== undefined) {
    conditions.push('rating >= ?');
    params.push(criteria.rating_min);
  }

  // Bitrate
  if (criteria.bitrate_min !== undefined) {
    conditions.push('bit_rate >= ?');
    params.push(criteria.bitrate_min);
  }

  // Library directory
  if (criteria.library_directory_id) {
    conditions.push('library_directory_id = ?');
    params.push(criteria.library_directory_id);
  }

  // Path contains
  if (criteria.relative_path_contains) {
    conditions.push('relative_path LIKE ?');
    params.push(`%${criteria.relative_path_contains}%`);
  }

  // Is analyzed
  if (criteria.is_analyzed !== undefined) {
    if (criteria.is_analyzed) {
      conditions.push('date_analyzed IS NOT NULL');
    } else {
      conditions.push('date_analyzed IS NULL');
    }
  }

  // Has stems
  if (criteria.has_stems !== undefined) {
    if (criteria.has_stems) {
      conditions.push('stems_path IS NOT NULL');
    } else {
      conditions.push('stems_path IS NULL');
    }
  }

  // Always exclude missing tracks
  conditions.push('is_missing = 0');

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

function buildOrderClause(criteria) {
  if (!criteria.sort_by) return 'ORDER BY date_added DESC';

  const order = criteria.sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const validSortFields = [
    'bpm', 'musical_key', 'energy', 'danceability', 'valence', 'arousal',
    'date_added', 'play_count', 'last_played', 'rating', 'artist', 'title'
  ];

  if (!validSortFields.includes(criteria.sort_by)) {
    return 'ORDER BY date_added DESC';
  }

  return `ORDER BY ${criteria.sort_by} ${order}`;
}

function buildLimitClause(criteria) {
  if (!criteria.limit) return '';
  return `LIMIT ${parseInt(criteria.limit)}`;
}
```

**Implementation Notes**:
- **Simple AND logic only** - All conditions must match (implicit AND between all filters)
- Nested OR logic deferred to Phase 6
- Use prepared statements for all queries (prevent SQL injection)
- Validate criteria before building query
- Cache query results (invalidate on refresh)

---

### **Day 3: Sessions + Temporary Playlists + API Routes** (8-10 hours)

#### 3.1 Session Service (2-3 hours)

**File**: `src/services/session.service.js`

**Core Functions:**

```javascript
/**
 * Session Service
 * Manages DJ session playlists
 */

import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { generateUUID, isValidUUID } from '../utils/uuid.js';
import * as playlistService from './playlist.service.js';
import * as playlistTrackService from './playlistTrack.service.js';

/**
 * Start a new session
 * @param {string} venue - Venue name (optional)
 * @param {number} date - Session date timestamp (optional, defaults to now)
 * @returns {Object} Created session playlist
 */
export function startSession(venue = null, date = null);

/**
 * Log track play in session
 * @param {string} sessionId - Session playlist UUID
 * @param {string} trackId - Track UUID
 * @param {number} playedAt - Timestamp when played (optional, defaults to now)
 * @param {number} duration - Play duration in seconds (optional)
 * @param {string} notes - Optional notes
 * @returns {Object} Logged play record
 */
export function logTrackPlay(sessionId, trackId, playedAt = null, duration = null, notes = null);

/**
 * Finalize session (make readonly)
 * @param {string} sessionId - Session playlist UUID
 * @returns {Object} Finalized session
 */
export function finalizeSession(sessionId);

/**
 * Get active session (if any)
 * @returns {Object|null} Active session or null
 */
export function getActiveSession();

/**
 * Check if session is active
 * @param {string} sessionId - Session playlist UUID
 * @returns {boolean} True if active
 */
export function isSessionActive(sessionId);

/**
 * Auto-finalize inactive sessions (background job)
 * @param {number} inactivityHours - Hours of inactivity before finalization (default: 4)
 * @returns {Array<string>} Finalized session IDs
 */
export function autoFinalizeInactiveSessions(inactivityHours = 4);
```

**Session Creation Logic**:

```javascript
export function startSession(venue = null, date = null) {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const sessionDate = date || now;

  // Generate name
  const dateStr = new Date(sessionDate * 1000).toISOString().split('T')[0];
  const name = venue
    ? `Session - ${dateStr} - ${venue}`
    : `Session - ${dateStr}`;

  const playlistData = {
    name,
    type: 'session',
    session_date: sessionDate,
    session_venue: venue,
    is_readonly: false,
    description: 'DJ session history'
  };

  const session = playlistService.createPlaylist(playlistData);
  logger.info(`Session started: ${session.id}`, { venue, date: sessionDate });

  return session;
}
```

**Auto-Finalization Logic**:

```javascript
export function autoFinalizeInactiveSessions(inactivityHours = 4) {
  const db = getDatabase();
  const cutoffTime = Math.floor(Date.now() / 1000) - (inactivityHours * 3600);

  // Find sessions with last play > inactivityHours ago
  const stmt = db.prepare(`
    SELECT DISTINCT p.id
    FROM playlists p
    JOIN playlist_tracks pt ON p.id = pt.playlist_id
    WHERE p.type = 'session'
      AND p.is_readonly = 0
      AND pt.played_at < ?
  `);

  const inactiveSessions = stmt.all(cutoffTime);
  const finalized = [];

  for (const session of inactiveSessions) {
    finalizeSession(session.id);
    finalized.push(session.id);
  }

  if (finalized.length > 0) {
    logger.info(`Auto-finalized ${finalized.length} inactive sessions`);
  }

  return finalized;
}
```

**Implementation Notes**:
- **Manual start only** - No auto-start on track load (deferred to Phase 6)
- Auto-finalize after 4 hours of inactivity (configurable)
- Background job runs periodically to check for inactive sessions
- Session duration calculated on finalization

#### 3.2 Temporary Playlist Support (1 hour)

**Implementation**:

```javascript
// In playlist.service.js

/**
 * Get or create the global "Thinking Playlist"
 * @returns {Object} Thinking playlist
 */
export function getThinkingPlaylist() {
  const db = getDatabase();

  // Try to find existing thinking playlist
  const existing = db.prepare(`
    SELECT * FROM playlists WHERE type = 'temp' AND is_temporary = 1 LIMIT 1
  `).get();

  if (existing) {
    return existing;
  }

  // Create new thinking playlist
  const playlistData = {
    name: 'Thinking Playlist',
    type: 'temp',
    description: 'Temporary playlist for exploring track combinations',
    is_temporary: true,
    icon: 'lightbulb'
  };

  return createPlaylist(playlistData);
}

/**
 * Promote thinking playlist to static
 * @param {string} newName - Name for new static playlist
 * @returns {Object} New static playlist
 */
export function promoteThinkingPlaylist(newName) {
  const thinkingPlaylist = getThinkingPlaylist();

  // Duplicate as static
  const newPlaylist = duplicatePlaylist(thinkingPlaylist.id, newName);

  // Update type to static
  updatePlaylist(newPlaylist.id, { type: 'static', is_temporary: false });

  // Clear thinking playlist
  const db = getDatabase();
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(thinkingPlaylist.id);

  logger.info(`Promoted thinking playlist to static: ${newName}`);

  return newPlaylist;
}
```

#### 3.3 API Routes Implementation (5-6 hours)

**File**: `src/routes/playlist.routes.js`

**All Endpoints:**

```javascript
import express from 'express';
import * as playlistService from '../services/playlist.service.js';
import * as playlistTrackService from '../services/playlistTrack.service.js';
import * as smartPlaylistEvaluator from '../services/smartPlaylistEvaluator.service.js';
import * as sessionService from '../services/session.service.js';
import logger from '../utils/logger.js';
import { validate, schemas } from '../utils/validators.js';

const router = express.Router();

// ============================================================================
// Playlist CRUD
// ============================================================================

/**
 * GET /api/playlists
 * List all playlists with optional filtering
 */
router.get('/', validate(schemas.playlistQuery, 'query'), async (req, res) => {
  // Implementation
});

/**
 * GET /api/playlists/:id
 * Get single playlist with tracks
 */
router.get('/:id', validate(schemas.uuid, 'params'), async (req, res) => {
  // Implementation
});

/**
 * POST /api/playlists
 * Create new playlist (static/smart/temp)
 */
router.post('/', validate(schemas.createPlaylist, 'body'), async (req, res) => {
  // Implementation
});

/**
 * PUT /api/playlists/:id
 * Update playlist metadata
 */
router.put('/:id', validate(schemas.updatePlaylist, 'body'), async (req, res) => {
  // Implementation
});

/**
 * DELETE /api/playlists/:id
 * Delete playlist
 */
router.delete('/:id', validate(schemas.uuid, 'params'), async (req, res) => {
  // Implementation
});

/**
 * GET /api/playlists/:id/stats
 * Get playlist statistics
 */
router.get('/:id/stats', validate(schemas.uuid, 'params'), async (req, res) => {
  // Implementation
});

// ============================================================================
// Playlist Track Management
// ============================================================================

/**
 * POST /api/playlists/:id/tracks
 * Add tracks to playlist
 * Body: { track_ids: string[], position?: number, notes?: string }
 */
router.post('/:id/tracks', validate(schemas.addTracks, 'body'), async (req, res) => {
  // Implementation
});

/**
 * DELETE /api/playlists/:id/tracks/:trackId
 * Remove track from playlist
 */
router.delete('/:id/tracks/:trackId', validate(schemas.playlistTrack, 'params'), async (req, res) => {
  // Implementation
});

/**
 * PUT /api/playlists/:id/tracks/reorder
 * Reorder tracks
 * Body: { track_ids: string[] }
 */
router.put('/:id/tracks/reorder', validate(schemas.reorderTracks, 'body'), async (req, res) => {
  // Implementation
});

/**
 * PUT /api/playlists/:id/tracks/:trackId
 * Update track metadata (notes, cue points, rating)
 * Body: { notes?: string, cue_in?: number, cue_out?: number, rating_in_context?: number }
 */
router.put('/:id/tracks/:trackId', validate(schemas.updateTrackMetadata, 'body'), async (req, res) => {
  // Implementation
});

// ============================================================================
// Smart Playlists
// ============================================================================

/**
 * POST /api/playlists/:id/refresh
 * Force refresh smart playlist
 */
router.post('/:id/refresh', validate(schemas.uuid, 'params'), async (req, res) => {
  // Implementation
});

/**
 * POST /api/playlists/:id/convert
 * Convert smart playlist to static
 */
router.post('/:id/convert', validate(schemas.uuid, 'params'), async (req, res) => {
  // Implementation
});

/**
 * GET /api/playlists/:id/explain
 * Explain smart playlist criteria
 */
router.get('/:id/explain', validate(schemas.uuid, 'params'), async (req, res) => {
  // Implementation
});

// ============================================================================
// Session History
// ============================================================================

/**
 * POST /api/playlists/sessions/start
 * Start new session
 * Body: { venue?: string, date?: number }
 */
router.post('/sessions/start', validate(schemas.startSession, 'body'), async (req, res) => {
  // Implementation
});

/**
 * POST /api/playlists/sessions/:id/track
 * Log track play in session
 * Body: { track_id: string, played_at?: number, duration?: number, notes?: string }
 */
router.post('/sessions/:id/track', validate(schemas.logTrackPlay, 'body'), async (req, res) => {
  // Implementation
});

/**
 * POST /api/playlists/sessions/:id/finalize
 * Finalize session (make readonly)
 */
router.post('/sessions/:id/finalize', validate(schemas.uuid, 'params'), async (req, res) => {
  // Implementation
});

/**
 * GET /api/playlists/sessions/active
 * Get active session (if any)
 */
router.get('/sessions/active', async (req, res) => {
  // Implementation
});

// ============================================================================
// Utility Endpoints
// ============================================================================

/**
 * POST /api/playlists/:id/duplicate
 * Duplicate playlist
 * Body: { name: string }
 */
router.post('/:id/duplicate', validate(schemas.duplicatePlaylist, 'body'), async (req, res) => {
  // Implementation
});

/**
 * GET /api/playlists/:id/export
 * Export playlist
 * Query: format=m3u|json
 */
router.get('/:id/export', validate(schemas.exportPlaylist, 'query'), async (req, res) => {
  // Implementation
});

/**
 * GET /api/playlists/search
 * Search playlists by name
 * Query: q=search_term
 */
router.get('/search', validate(schemas.searchPlaylists, 'query'), async (req, res) => {
  // Implementation
});

/**
 * GET /api/playlists/thinking
 * Get or create thinking playlist
 */
router.get('/thinking', async (req, res) => {
  // Implementation
});

/**
 * POST /api/playlists/thinking/promote
 * Promote thinking playlist to static
 * Body: { name: string }
 */
router.post('/thinking/promote', validate(schemas.promoteThinkingPlaylist, 'body'), async (req, res) => {
  // Implementation
});

export default router;
```

**Validation Schemas** (add to `src/utils/validators.js`):

```javascript
const playlistSchemas = {
  // Query schemas
  playlistQuery: Joi.object({
    type: Joi.string().valid('static', 'smart', 'session', 'temp'),
    is_favorite: Joi.boolean(),
    is_temporary: Joi.boolean(),
    search: Joi.string().max(200)
  }),

  // Creation schemas
  createPlaylist: Joi.object({
    name: Joi.string().min(1).max(200).required(),
    type: Joi.string().valid('static', 'smart', 'session', 'temp').default('static'),
    description: Joi.string().max(1000),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
    icon: Joi.string().max(50),
    criteria: Joi.object().when('type', {
      is: 'smart',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    }),
    session_venue: Joi.string().max(200),
    session_date: Joi.number().integer()
  }),

  // Update schema
  updatePlaylist: Joi.object({
    name: Joi.string().min(1).max(200),
    description: Joi.string().max(1000),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
    icon: Joi.string().max(50),
    is_favorite: Joi.boolean()
  }),

  // Track operations
  addTracks: Joi.object({
    track_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
    position: Joi.number().integer().min(0),
    notes: Joi.string().max(1000)
  }),

  reorderTracks: Joi.object({
    track_ids: Joi.array().items(Joi.string().uuid()).min(1).required()
  }),

  updateTrackMetadata: Joi.object({
    notes: Joi.string().max(1000),
    cue_in: Joi.number().integer().min(0),
    cue_out: Joi.number().integer().min(0),
    rating_in_context: Joi.number().integer().min(1).max(5)
  }),

  // Session schemas
  startSession: Joi.object({
    venue: Joi.string().max(200),
    date: Joi.number().integer()
  }),

  logTrackPlay: Joi.object({
    track_id: Joi.string().uuid().required(),
    played_at: Joi.number().integer(),
    duration: Joi.number().integer().min(0),
    notes: Joi.string().max(1000)
  }),

  // Utility schemas
  duplicatePlaylist: Joi.object({
    name: Joi.string().min(1).max(200).required()
  }),

  exportPlaylist: Joi.object({
    format: Joi.string().valid('m3u', 'json').default('m3u')
  }),

  promoteThinkingPlaylist: Joi.object({
    name: Joi.string().min(1).max(200).required()
  })
};
```

**Register Routes** in `src/server.js`:

```javascript
import playlistRoutes from './routes/playlist.routes.js';
app.use('/api/playlists', playlistRoutes);
```

---

### **Day 4: WebSocket Events + Testing + Polish** (8-10 hours)

#### 4.1 WebSocket Event Broadcaster (2-3 hours)

**File**: `src/websocket/playlistBroadcaster.js`

**Implementation:**

```javascript
/**
 * Playlist WebSocket Broadcaster
 * Emits real-time events for playlist operations
 */

import logger from '../utils/logger.js';

// Store WebSocket clients
let wsClients = [];

/**
 * Register WebSocket client
 * @param {WebSocket} ws - WebSocket connection
 */
export function registerClient(ws) {
  wsClients.push(ws);
  logger.debug(`WebSocket client registered. Total clients: ${wsClients.length}`);

  ws.on('close', () => {
    wsClients = wsClients.filter(client => client !== ws);
    logger.debug(`WebSocket client disconnected. Total clients: ${wsClients.length}`);
  });
}

/**
 * Broadcast event to all connected clients
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function broadcast(event, data) {
  const message = JSON.stringify({ event, data, timestamp: Date.now() });

  wsClients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });

  logger.debug(`Broadcast event: ${event}`, { recipients: wsClients.length });
}

// ============================================================================
// Playlist Events
// ============================================================================

export function emitPlaylistCreated(playlist) {
  broadcast('playlist:created', { playlist });
}

export function emitPlaylistUpdated(playlist) {
  broadcast('playlist:updated', { playlist });
}

export function emitPlaylistDeleted(playlistId) {
  broadcast('playlist:deleted', { playlistId });
}

// ============================================================================
// Track Events
// ============================================================================

export function emitTrackAdded(playlistId, trackId, position) {
  broadcast('playlist:track:added', { playlistId, trackId, position });
}

export function emitTrackRemoved(playlistId, trackId) {
  broadcast('playlist:track:removed', { playlistId, trackId });
}

export function emitTracksReordered(playlistId, trackIds) {
  broadcast('playlist:track:reordered', { playlistId, trackIds });
}

export function emitTrackMetadataUpdated(playlistId, trackId, metadata) {
  broadcast('playlist:track:metadata_updated', { playlistId, trackId, metadata });
}

// ============================================================================
// Smart Playlist Events
// ============================================================================

export function emitSmartPlaylistRefreshed(playlistId, trackCount, added, removed) {
  broadcast('playlist:smart:refreshed', {
    playlistId,
    trackCount,
    addedCount: added.length,
    removedCount: removed.length,
    added,
    removed
  });
}

export function emitSmartPlaylistConverted(playlistId) {
  broadcast('playlist:smart:converted', { playlistId });
}

// ============================================================================
// Session Events
// ============================================================================

export function emitSessionStarted(session) {
  broadcast('session:started', {
    sessionId: session.id,
    venue: session.session_venue,
    date: session.session_date
  });
}

export function emitTrackPlayed(sessionId, trackId, playedAt) {
  broadcast('session:track:played', { sessionId, trackId, playedAt });
}

export function emitSessionFinalized(sessionId, trackCount, duration) {
  broadcast('session:finalized', { sessionId, trackCount, duration });
}
```

**Integration** - Call broadcasters from services:

```javascript
// Example in playlist.service.js
import * as playlistBroadcaster from '../websocket/playlistBroadcaster.js';

export function createPlaylist(playlistData) {
  // ... create playlist in DB ...

  // Emit event
  playlistBroadcaster.emitPlaylistCreated(newPlaylist);

  return newPlaylist;
}
```

**WebSocket Server Setup** (if not exists):

```javascript
// In src/server.js

import { WebSocketServer } from 'ws';
import { registerClient } from './websocket/playlistBroadcaster.js';

// Create WebSocket server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');
  registerClient(ws);

  ws.on('message', (message) => {
    logger.debug('WebSocket message received:', message);
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Handle upgrade requests
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
```

#### 4.2 HTML Test Client (3-4 hours)

**File**: `test/phase5-playlists-test.html`

**Features:**
- Tabbed interface for testing different playlist types
- Static playlists: Create, add tracks, reorder, delete
- Smart playlists: Create with criteria, view results, refresh
- Session history: Start, log plays, finalize
- Temporary playlist: Add tracks, promote to static
- Statistics viewer
- Export functionality
- Real-time WebSocket event display

**Structure:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Phase 5: Playlist System Tests</title>
  <style>
    /* Styles for tabs, buttons, result displays, etc. */
  </style>
</head>
<body>
  <h1>Phase 5: Playlist System Tests</h1>

  <div class="tabs">
    <button onclick="showTab('static')">Static Playlists</button>
    <button onclick="showTab('smart')">Smart Playlists</button>
    <button onclick="showTab('session')">Session History</button>
    <button onclick="showTab('temp')">Thinking Playlist</button>
    <button onclick="showTab('websocket')">WebSocket Events</button>
  </div>

  <div id="static" class="tab-content">
    <h2>Static Playlists</h2>

    <div class="test-section">
      <h3>Create Static Playlist</h3>
      <input type="text" id="static-name" placeholder="Playlist name">
      <textarea id="static-desc" placeholder="Description"></textarea>
      <button onclick="testCreateStaticPlaylist()">Create</button>
    </div>

    <div class="test-section">
      <h3>Add Tracks to Playlist</h3>
      <input type="text" id="static-playlist-id" placeholder="Playlist ID">
      <textarea id="static-track-ids" placeholder="Track IDs (comma-separated)"></textarea>
      <button onclick="testAddTracks()">Add Tracks</button>
    </div>

    <!-- More test sections -->
  </div>

  <div id="smart" class="tab-content" style="display:none;">
    <h2>Smart Playlists</h2>

    <div class="test-section">
      <h3>Create Smart Playlist</h3>
      <input type="text" id="smart-name" placeholder="Playlist name">

      <h4>Criteria Builder</h4>
      <label>BPM Range:</label>
      <input type="number" id="bpm-min" placeholder="Min"> -
      <input type="number" id="bpm-max" placeholder="Max">

      <label>Energy Range:</label>
      <input type="number" id="energy-min" step="0.1" placeholder="Min (0-1)"> -
      <input type="number" id="energy-max" step="0.1" placeholder="Max (0-1)">

      <label>Genres:</label>
      <input type="text" id="genres" placeholder="House, Techno, etc. (comma-separated)">

      <button onclick="testCreateSmartPlaylist()">Create Smart Playlist</button>
    </div>

    <!-- More test sections -->
  </div>

  <!-- More tab contents -->

  <div id="results" class="results-panel">
    <h3>Results</h3>
    <pre id="results-content"></pre>
  </div>

  <div id="websocket-events" class="events-panel">
    <h3>WebSocket Events (Real-time)</h3>
    <div id="events-content"></div>
  </div>

  <script>
    const API_BASE = 'http://localhost:3000/api';
    let ws;

    // WebSocket connection
    function connectWebSocket() {
      ws = new WebSocket('ws://localhost:3000');

      ws.onopen = () => {
        addEvent('WebSocket connected', 'success');
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        addEvent(message.event, 'info', message.data);
      };

      ws.onerror = (error) => {
        addEvent('WebSocket error', 'error', error);
      };

      ws.onclose = () => {
        addEvent('WebSocket disconnected', 'warning');
        setTimeout(connectWebSocket, 5000); // Reconnect
      };
    }

    connectWebSocket();

    // Test functions
    async function testCreateStaticPlaylist() {
      const name = document.getElementById('static-name').value;
      const description = document.getElementById('static-desc').value;

      try {
        const response = await fetch(`${API_BASE}/playlists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description,
            type: 'static',
            color: '#FF5733',
            icon: 'music'
          })
        });

        const result = await response.json();
        displayResult('Create Static Playlist', result);
      } catch (error) {
        displayError('Create Static Playlist', error);
      }
    }

    async function testCreateSmartPlaylist() {
      const name = document.getElementById('smart-name').value;
      const bpmMin = parseInt(document.getElementById('bpm-min').value);
      const bpmMax = parseInt(document.getElementById('bpm-max').value);
      const energyMin = parseFloat(document.getElementById('energy-min').value);
      const energyMax = parseFloat(document.getElementById('energy-max').value);
      const genres = document.getElementById('genres').value
        .split(',')
        .map(g => g.trim())
        .filter(g => g);

      const criteria = {};
      if (bpmMin) criteria.bpm_min = bpmMin;
      if (bpmMax) criteria.bpm_max = bpmMax;
      if (energyMin) criteria.energy_min = energyMin;
      if (energyMax) criteria.energy_max = energyMax;
      if (genres.length > 0) criteria.genres = genres;
      criteria.sort_by = 'energy';
      criteria.sort_order = 'desc';
      criteria.limit = 100;

      try {
        const response = await fetch(`${API_BASE}/playlists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            type: 'smart',
            description: 'Smart playlist based on criteria',
            criteria
          })
        });

        const result = await response.json();
        displayResult('Create Smart Playlist', result);
      } catch (error) {
        displayError('Create Smart Playlist', error);
      }
    }

    // More test functions...

    function displayResult(testName, result) {
      const content = document.getElementById('results-content');
      content.innerHTML = `
        <strong>${testName}</strong>
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
        <pre>${JSON.stringify(result, null, 2)}</pre>
      `;

      if (result.success) {
        content.classList.add('success');
      } else {
        content.classList.add('error');
      }
    }

    function addEvent(event, type, data) {
      const eventsContent = document.getElementById('events-content');
      const eventDiv = document.createElement('div');
      eventDiv.className = `event ${type}`;
      eventDiv.innerHTML = `
        <span class="event-name">${event}</span>
        <span class="event-time">${new Date().toLocaleTimeString()}</span>
        ${data ? `<pre>${JSON.stringify(data, null, 2)}</pre>` : ''}
      `;
      eventsContent.insertBefore(eventDiv, eventsContent.firstChild);

      // Keep only last 20 events
      while (eventsContent.children.length > 20) {
        eventsContent.removeChild(eventsContent.lastChild);
      }
    }
  </script>
</body>
</html>
```

#### 4.3 Unit Tests (2-3 hours)

**File**: `tests/playlist.service.test.js`

**Test Coverage:**

```javascript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as playlistService from '../src/services/playlist.service.js';
import * as playlistTrackService from '../src/services/playlistTrack.service.js';
import { initDatabase, closeDatabase, getDatabase } from '../src/config/database.js';

describe('Playlist Service', () => {
  beforeEach(() => {
    // Initialize test database
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('createPlaylist', () => {
    it('should create a static playlist', () => {
      const playlistData = {
        name: 'Test Static Playlist',
        type: 'static',
        description: 'Test description'
      };

      const playlist = playlistService.createPlaylist(playlistData);

      expect(playlist).toBeDefined();
      expect(playlist.id).toBeDefined();
      expect(playlist.name).toBe('Test Static Playlist');
      expect(playlist.type).toBe('static');
    });

    it('should create a smart playlist with criteria', () => {
      const playlistData = {
        name: 'Test Smart Playlist',
        type: 'smart',
        criteria: {
          bpm_min: 120,
          bpm_max: 135,
          energy_min: 0.7
        }
      };

      const playlist = playlistService.createPlaylist(playlistData);

      expect(playlist.type).toBe('smart');
      expect(playlist.criteria).toBeDefined();
      const criteria = JSON.parse(playlist.criteria);
      expect(criteria.bpm_min).toBe(120);
    });

    it('should create a session playlist', () => {
      const playlistData = {
        name: 'Test Session',
        type: 'session',
        session_venue: 'Club XYZ',
        session_date: Math.floor(Date.now() / 1000)
      };

      const playlist = playlistService.createPlaylist(playlistData);

      expect(playlist.type).toBe('session');
      expect(playlist.session_venue).toBe('Club XYZ');
    });
  });

  describe('getPlaylistById', () => {
    it('should return playlist without tracks', () => {
      const created = playlistService.createPlaylist({
        name: 'Test',
        type: 'static'
      });

      const playlist = playlistService.getPlaylistById(created.id, false);

      expect(playlist).toBeDefined();
      expect(playlist.tracks).toBeUndefined();
    });

    it('should return playlist with tracks', () => {
      const created = playlistService.createPlaylist({
        name: 'Test',
        type: 'static'
      });

      const playlist = playlistService.getPlaylistById(created.id, true);

      expect(playlist).toBeDefined();
      expect(playlist.tracks).toBeDefined();
      expect(Array.isArray(playlist.tracks)).toBe(true);
    });

    it('should return null for non-existent playlist', () => {
      const playlist = playlistService.getPlaylistById('non-existent-uuid');
      expect(playlist).toBeNull();
    });
  });

  describe('updatePlaylist', () => {
    it('should update playlist name', () => {
      const created = playlistService.createPlaylist({
        name: 'Original Name',
        type: 'static'
      });

      const updated = playlistService.updatePlaylist(created.id, {
        name: 'Updated Name'
      });

      expect(updated.name).toBe('Updated Name');
    });

    it('should mark playlist as favorite', () => {
      const created = playlistService.createPlaylist({
        name: 'Test',
        type: 'static'
      });

      const updated = playlistService.updatePlaylist(created.id, {
        is_favorite: true
      });

      expect(updated.is_favorite).toBe(1);
    });
  });

  describe('deletePlaylist', () => {
    it('should delete playlist', () => {
      const created = playlistService.createPlaylist({
        name: 'To Delete',
        type: 'static'
      });

      const result = playlistService.deletePlaylist(created.id);
      expect(result).toBe(true);

      const deleted = playlistService.getPlaylistById(created.id);
      expect(deleted).toBeNull();
    });

    it('should cascade delete playlist tracks', () => {
      // Test that deleting playlist also deletes associated tracks
    });
  });

  describe('duplicatePlaylist', () => {
    it('should create copy of playlist with new name', () => {
      const original = playlistService.createPlaylist({
        name: 'Original',
        type: 'static',
        description: 'Original description'
      });

      const duplicate = playlistService.duplicatePlaylist(original.id, 'Duplicate');

      expect(duplicate.name).toBe('Duplicate');
      expect(duplicate.description).toBe('Original description');
      expect(duplicate.id).not.toBe(original.id);
    });
  });
});

describe('Playlist Track Service', () => {
  let playlistId;

  beforeEach(() => {
    initDatabase(':memory:');

    // Create test playlist
    const playlist = playlistService.createPlaylist({
      name: 'Test Playlist',
      type: 'static'
    });
    playlistId = playlist.id;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('addTracksToPlaylist', () => {
    it('should add single track to playlist', () => {
      // Create mock track first
      // ...

      const result = playlistTrackService.addTracksToPlaylist(
        playlistId,
        ['track-uuid'],
        null,
        'Test note'
      );

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });

    it('should add multiple tracks at once', () => {
      // Test adding multiple tracks
    });

    it('should insert tracks at specific position', () => {
      // Test position insertion
    });
  });

  describe('removeTrackFromPlaylist', () => {
    it('should remove track and resequence positions', () => {
      // Test removal and position updates
    });
  });

  describe('reorderTracks', () => {
    it('should update all track positions', () => {
      // Test reordering
    });
  });
});
```

**File**: `tests/smartPlaylistEvaluator.test.js`

```javascript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as smartPlaylistEvaluator from '../src/services/smartPlaylistEvaluator.service.js';
import { initDatabase, closeDatabase } from '../src/config/database.js';

describe('Smart Playlist Evaluator', () => {
  beforeEach(() => {
    initDatabase(':memory:');
    // Seed test tracks with various metadata
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('buildSQLQuery', () => {
    it('should build query for BPM range', () => {
      const criteria = { bpm_min: 120, bpm_max: 135 };
      const { sql, params } = smartPlaylistEvaluator.buildSQLQuery(criteria);

      expect(sql).toContain('bpm >= ?');
      expect(sql).toContain('bpm <= ?');
      expect(params).toContain(120);
      expect(params).toContain(135);
    });

    it('should build query for energy and danceability', () => {
      const criteria = { energy_min: 0.7, danceability_min: 0.6 };
      const { sql, params } = smartPlaylistEvaluator.buildSQLQuery(criteria);

      expect(sql).toContain('energy >= ?');
      expect(sql).toContain('danceability >= ?');
    });

    it('should build query for genre list', () => {
      const criteria = { genres: ['House', 'Techno'] };
      const { sql, params } = smartPlaylistEvaluator.buildSQLQuery(criteria);

      expect(sql).toContain('genre IN (?, ?)');
      expect(params).toEqual(['House', 'Techno']);
    });

    it('should combine multiple criteria with AND', () => {
      const criteria = {
        bpm_min: 120,
        energy_min: 0.7,
        key: 5
      };
      const { sql, params } = smartPlaylistEvaluator.buildSQLQuery(criteria);

      expect(sql).toContain('AND');
      expect(params.length).toBe(3);
    });
  });

  describe('evaluateCriteria', () => {
    it('should return matching track IDs', () => {
      const criteria = { bpm_min: 125, bpm_max: 130 };
      const trackIds = smartPlaylistEvaluator.evaluateCriteria(criteria);

      expect(Array.isArray(trackIds)).toBe(true);
      // Verify all returned tracks match criteria
    });

    it('should return empty array for no matches', () => {
      const criteria = { bpm_min: 999, bpm_max: 1000 };
      const trackIds = smartPlaylistEvaluator.evaluateCriteria(criteria);

      expect(trackIds).toEqual([]);
    });

    it('should respect limit parameter', () => {
      const criteria = { bpm_min: 120, limit: 5 };
      const trackIds = smartPlaylistEvaluator.evaluateCriteria(criteria);

      expect(trackIds.length).toBeLessThanOrEqual(5);
    });
  });

  describe('explainCriteria', () => {
    it('should generate human-readable description', () => {
      const criteria = {
        bpm_min: 120,
        bpm_max: 135,
        energy_min: 0.7,
        genres: ['House', 'Techno']
      };

      const explanation = smartPlaylistEvaluator.explainCriteria(criteria);

      expect(explanation).toContain('120-135 BPM');
      expect(explanation).toContain('House, Techno');
      expect(explanation).toContain('energy');
    });
  });
});
```

---

## Technical Decisions

### 1. Allow Duplicate Tracks in Static Playlists?
**Decision**: YES
- DJs may want to play a track multiple times in a set (e.g., callback to opening track)
- No unique constraint on `(playlist_id, track_id)`
- UI will show warning but database allows it

### 2. Smart Playlist Refresh Strategy
**Decision**: Manual + On-Demand
- **Manual refresh**: Explicit API call to `/api/playlists/:id/refresh`
- **On-demand**: Auto-refresh when viewing playlist if stale
- **Future** (Phase 6): Auto-refresh on track changes with debouncing

### 3. Session Auto-Finalization
**Decision**: 4 hours of inactivity
- Configurable via settings table
- Background job checks every hour for inactive sessions
- User can manually finalize earlier via API

### 4. Temporary Playlist Persistence
**Decision**: Persist to DB, keep across restarts
- Single "Thinking Playlist" auto-created on first use
- Type = 'temp', is_temporary = true
- User can manually clear
- Can promote to permanent static playlist

### 5. Smart Playlist Criteria Logic
**Decision**: Simple AND logic only (MVP)
- All criteria must match (implicit AND between all filters)
- No nested OR logic: `(A OR B) AND (C OR D)` deferred to Phase 6
- Keeps implementation simple and query performance fast

### 6. M3U Export Format
**Decision**: Extended M3U with metadata
- `#EXTM3U` header
- `#EXTINF` tags with duration, artist, title
- Absolute file paths
- UTF-8 encoding
- Compatible with most DJ software (Rekordbox, Serato, Traktor)

---

## File Structure

```
mismo.dj_app_server/
├── migrations/
│   └── 012_enhance_playlists_schema.sql       # NEW: Schema updates
├── src/
│   ├── routes/
│   │   └── playlist.routes.js                  # NEW: All playlist endpoints (15 routes)
│   ├── services/
│   │   ├── playlist.service.js                 # NEW: Core playlist CRUD
│   │   ├── playlistTrack.service.js            # NEW: Track management
│   │   ├── smartPlaylistEvaluator.service.js   # NEW: Criteria → SQL query builder
│   │   └── session.service.js                  # NEW: Session management
│   ├── websocket/
│   │   └── playlistBroadcaster.js              # NEW: WebSocket events
│   └── utils/
│       └── validators.js                        # UPDATE: Add playlist schemas
├── tests/
│   ├── playlist.service.test.js                # NEW: Playlist service tests
│   ├── playlistTrack.service.test.js           # NEW: Track service tests
│   └── smartPlaylistEvaluator.test.js          # NEW: Evaluator tests
└── test/
    └── phase5-playlists-test.html              # NEW: Interactive test client
```

**New Files**: 10
**Updated Files**: 2 (`server.js` for routes, `validators.js` for schemas)

---

## Integration Points

### Database
- **Access**: Use `getDatabase()` from `config/database.js`
- **Queries**: All queries use prepared statements
- **Transactions**: Multi-step operations wrapped in transactions
- **UUID Validation**: All IDs validated with `isValidUUID()` from `utils/uuid.js`

### Logging
- **Logger**: Import from `utils/logger.js`
- **Operations**: Log all CRUD operations with context
- **Errors**: Log errors with playlist ID, operation type, and input
- **WebSocket**: Log broadcast events and recipient counts

### Validation
- **Library**: Extends `utils/validators.js`
- **Schemas**: Add Joi schemas for all playlist operations
- **Middleware**: Use `validate()` middleware on all routes
- **Error Handling**: Return 400 with validation details on failure

### WebSocket
- **Broadcaster**: New `websocket/playlistBroadcaster.js` utility
- **Integration**: Call broadcaster functions after database changes
- **Pattern**: Follow existing patterns from scanner/analysis events
- **Error Handling**: Gracefully handle disconnected clients

### Existing Services
- **track.service.js**: Get tracks by IDs for playlist population
- **libraryDirectory.service.js**: Validate library paths (future use)
- **No changes needed**: Existing services remain untouched

---

## Error Handling

### Common Error Scenarios

1. **Playlist Not Found**
   - Status: 404
   - Message: `Playlist with ID {id} not found`
   - Log: Include operation attempted

2. **Track Not Found**
   - Status: 400
   - Message: `Track with ID {id} not found`
   - Log: Include playlist ID and operation

3. **Invalid Criteria**
   - Status: 400
   - Message: Validation error details from Joi
   - Log: Full criteria object for debugging

4. **Playlist is Readonly**
   - Status: 403
   - Message: `Cannot modify finalized session playlist`
   - Log: Session ID and attempted operation

5. **Invalid UUID**
   - Status: 400
   - Message: `Invalid UUID format: {id}`
   - Log: Include field name (playlistId, trackId, etc.)

6. **Database Errors**
   - Status: 500
   - Message: `Internal server error` (production) or error details (development)
   - Log: Full error stack, SQL query, parameters

7. **Position Conflicts**
   - Status: 200 (auto-resolved)
   - Action: Auto-resequence positions
   - Log: Indicate resequencing occurred

8. **Smart Playlist Evaluation Failure**
   - Status: 500
   - Message: `Failed to evaluate smart playlist criteria`
   - Log: Criteria object, SQL query, error details

### Defensive Programming Checklist

Following `CLAUDE.md` guidelines:

- ✅ Validate all UUIDs before database queries
- ✅ Check playlist type before type-specific operations
- ✅ Verify track exists before adding to playlist
- ✅ Handle deleted tracks gracefully (skip missing tracks when loading playlist)
- ✅ Use try/catch for all async operations
- ✅ Log all errors with full context (playlist ID, operation, user input)
- ✅ Return appropriate HTTP status codes
- ✅ Never expose internal errors in production
- ✅ Use prepared statements for all queries (prevent SQL injection)
- ✅ Validate input at route level with Joi schemas

---

## Performance Considerations

### Optimization Strategies

1. **Eager Loading**
   - Join tracks when `includeTracks = true`
   - Single query instead of N+1 queries
   - Use LEFT JOIN to handle playlists with 0 tracks

2. **Pagination**
   - For playlists with 100+ tracks, implement pagination
   - Default: 50 tracks per page
   - Include total count in response

3. **Caching**
   - Cache smart playlist results (invalidate on track changes)
   - Cache playlist statistics (recalculate on update)
   - Use in-memory cache (Map or LRU cache)

4. **Indexes**
   - Ensure indexes on: `(playlist_id, position)`, `track_id`, `type`, `session_date`
   - Compound index for smart playlist queries: `(bpm, energy, musical_key)`
   - Monitor slow queries with SQLite EXPLAIN QUERY PLAN

5. **Batch Operations**
   - Add multiple tracks in single transaction
   - Reorder all positions in single transaction
   - Use bulk INSERT for smart playlist population

6. **Query Optimization**
   - Select only needed columns (avoid SELECT *)
   - Use EXISTS instead of COUNT when checking existence
   - Limit smart playlist results (default: 100 tracks)

### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Get playlist with 100 tracks | < 50ms | Includes track metadata JOIN |
| Smart playlist evaluation (1000+ tracks) | < 500ms | Complex criteria on large library |
| Add 10 tracks to playlist | < 100ms | Batch insert in transaction |
| Reorder 50 tracks | < 150ms | Update all positions in transaction |
| Get playlist statistics | < 100ms | Aggregate queries (COUNT, SUM, AVG) |
| Export M3U (200 tracks) | < 200ms | File path resolution + formatting |

### Monitoring

- Log slow queries (> 100ms) for optimization
- Track WebSocket broadcast performance
- Monitor memory usage for large playlists
- Profile smart playlist evaluation on large libraries

---

## Success Criteria

### Functional Requirements

- ✅ Create all 4 playlist types (static, smart, session, temp)
- ✅ Add/remove/reorder tracks in playlists
- ✅ Smart playlists auto-populate based on criteria leveraging analysis data
- ✅ Sessions can be started, logged, and finalized
- ✅ Temporary playlist can be promoted to permanent
- ✅ Export playlists to M3U format
- ✅ WebSocket events fire for all operations
- ✅ HTML test client covers all features
- ✅ Per-track metadata (notes, cue points, rating) works

### Quality Requirements

- ✅ Unit test coverage > 70%
- ✅ All API endpoints documented with JSDoc comments
- ✅ Error handling follows defensive programming guidelines from CLAUDE.md
- ✅ Performance targets met (see table above)
- ✅ Code follows existing project patterns (track.service.js, etc.)
- ✅ Input validation on all routes with Joi
- ✅ Logging with context for all operations
- ✅ No SQL injection vulnerabilities (prepared statements)

### Integration Requirements

- ✅ Routes registered in `server.js`
- ✅ WebSocket broadcaster integrated
- ✅ Database migration applied successfully
- ✅ No breaking changes to existing services
- ✅ Works with existing track analysis data (BPM, key, energy, etc.)

---

## Future Enhancements (Phase 6+)

As documented in `docs/playlists-future-enhancements.md`:

### Tier 1 - Must-Have Extensions (Phase 6)

1. **Harmonic Mixing Intelligence**
   - Auto-arrange playlist by Camelot Wheel rules
   - Transition scoring (key compatibility, BPM delta, energy flow)
   - Smart insertion suggestions
   - Key clash warnings

2. **Energy Arc Visualization & Planning**
   - Visual energy curve graph
   - Arc templates (warm-up to peak, festival main stage, etc.)
   - Arc validation (warn on sudden jumps)
   - BPM progression graph
   - Dead zone detection

3. **Set Timing & Duration Tools**
   - Target duration ("2-hour set")
   - Time remaining calculator
   - Adjustable track lengths with cue points
   - Time-based sorting
   - Pacing analysis

4. **Intelligent Track Suggestions**
   - "What comes next?" based on current track
   - Gap filling ("need 125 BPM D minor track here")
   - Similar track finder
   - Playlist completion suggestions
   - Avoid repetition warnings

5. **Library Health & Prep Quality Scoring**
   - Track "gig readiness" scoring
   - Playlist health metrics
   - Unready track warnings
   - Custom prep standards
   - Prep checklist per track

6. **Playlist Statistics Dashboard**
   - Key distribution chart
   - BPM histogram
   - Genre breakdown
   - Energy heatmap
   - Era/year distribution

### Tier 2 - Should-Have Enhancements (Phase 7-8)

- Mission system (orphan tracks, overused tracks, quality missions)
- Pattern recognition (artist/genre diversity scoring)
- Advanced smart playlist criteria (nested OR logic)
- Import/export (Rekordbox, Serato, Traktor)
- Bulk operations (merge, arithmetic, batch updates)
- Comparative analytics (playlist similarity, overlap detection)

### Tier 3 - Nice-to-Have Features (Phase 9+)

- Live set mode (real-time tracking during performance)
- Set preparation tools (transition notes, alternative tracks)
- Venue & context tagging
- Personal performance metrics
- Version control for playlists
- Collaboration & sharing

### Tier 4 - Future/Experimental (Phase 10+)

- AI-powered playlist generation
- Weather & time-based suggestions
- Playlist games & challenges
- Social & community features
- ML-based track recommendations

---

## Dependencies

### External Libraries

**Already Installed** ✅:
- `better-sqlite3` - Database operations
- `express` - API routes
- `joi` - Input validation
- `ws` - WebSocket server
- `winston` - Logging

**No new dependencies needed!**

### Data Requirements

**Available** ✅:
- Basic track metadata (title, artist, album, genre)
- Analysis data (BPM, key, energy, arousal, danceability, valence)
- File paths and durations
- Library directory associations

**Future** (not required for MVP):
- Cue points (Phase 6 - audio server integration)
- Play history (Phase 6 - tracking system)
- User accounts (Phase 7+ - multi-user system)

---

## Estimated Effort

| Day | Focus | Hours | Key Deliverables |
|-----|-------|-------|------------------|
| **Day 1** | Database + Core Service | 6-8 | Migration script, playlist.service.js |
| **Day 2** | Track Management + Smart | 8-10 | playlistTrack.service.js, smartPlaylistEvaluator.service.js |
| **Day 3** | Sessions + Routes | 8-10 | session.service.js, playlist.routes.js (15 endpoints) |
| **Day 4** | WebSocket + Testing | 8-10 | playlistBroadcaster.js, test client, unit tests |

**Total**: 30-38 hours (~4-5 full working days)

### Breakdown by Task

- **Database Migration**: 2 hours
- **Playlist Service**: 4-6 hours
- **Playlist Track Service**: 3-4 hours
- **Smart Playlist Evaluator**: 5-6 hours
- **Session Service**: 2-3 hours
- **API Routes**: 5-6 hours
- **WebSocket Integration**: 2-3 hours
- **HTML Test Client**: 3-4 hours
- **Unit Tests**: 2-3 hours
- **Documentation & Polish**: 2-3 hours

---

## Next Steps

### Immediate Actions

1. ✅ Review and approve this implementation plan
2. Start Day 1: Create database migration script
3. Implement playlist.service.js following patterns from track.service.js
4. Test incrementally with SQL queries
5. Commit after each major component

### During Implementation

- Commit after each service/route file is complete
- Test each endpoint with Postman or curl before moving on
- Update HTML test client as features are added
- Write unit tests alongside implementation
- Document JSDoc comments as we code

### After Completion

- Full integration test with HTML test client
- Performance testing with large playlists (100+ tracks)
- Update README.md with new API endpoints
- Create API documentation
- Tag release as Phase 5 complete

---

## Questions & Clarifications

If any issues arise during implementation, refer to:

1. **Design Document**: `docs/playlists-design.md` - Full feature specifications
2. **Future Enhancements**: `docs/playlists-future-enhancements.md` - Deferred features
3. **Existing Patterns**: `src/services/track.service.js` - Code style reference
4. **CLAUDE.md**: Defensive programming standards and error handling

---

**Document Version**: 1.0
**Last Updated**: 2025-10-24
**Status**: Ready for Implementation
**Approved By**: Chester

---

**Ready to implement Phase 5 Playlists! 🎵🎧**
