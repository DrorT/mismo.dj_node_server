# Playlist System Design Document

## Overview

This document outlines the playlist system for Mismo DJ, designed to support various types of playlists that DJs need for music organization, set preparation, and performance tracking.

**Status**: Design phase - to be implemented after Phase 5 (Analysis Integration)

**Why after Analysis?** The analysis server will provide rich metadata (BPM, key, energy, danceability, etc.) that will make smart playlists and intelligent playlist features much more powerful. Building playlists after analysis means we can leverage this data from day one.

---

## Playlist Types

### 1. Static Playlists (Manual)
**Description**: Traditional manually-curated playlists where the user explicitly adds/removes tracks.

**Use Cases**:
- Genre collections (e.g., "Deep House", "Techno", "Warm-up Tracks")
- Energy-level collections (e.g., "Peak Time", "Chill", "Bangers")
- Venue-specific sets (e.g., "Club XYZ - Friday Nights")
- Mood-based collections (e.g., "Dark & Moody", "Uplifting", "Vocal Tracks")
- Pre-planned performance sets

**Key Features**:
- Manual track management (add, remove, reorder)
- Fixed ordering (drag-and-drop reordering)
- Can contain the same track multiple times
- Optional metadata: description, color, icon
- Can be marked as favorite (pinned to top)

**Database Fields**:
```javascript
{
  type: 'static',
  name: string,
  description: string,
  color: string,
  icon: string,
  is_favorite: boolean
}
```

---

### 2. Smart/Dynamic Playlists (Auto-Generated)
**Description**: Playlists that automatically populate based on criteria, updating as the library changes.

**Use Cases**:
- BPM-based (e.g., "128-132 BPM House")
- Key-based (e.g., "Tracks in A minor")
- Recently added (e.g., "Last 30 days")
- Play statistics (e.g., "Most played", "Never played", "Favorites")
- Energy-based (e.g., "High energy > 0.8")
- Combination criteria (e.g., "Techno, 130-135 BPM, High Energy")
- Missing metadata (e.g., "Tracks without BPM", "Need to tag")

**Key Features**:
- JSON-based criteria storage
- Auto-updates when tracks match/unmatch criteria
- Read-only track list (edit criteria, not tracks)
- Can use ANY track metadata field
- Supports complex AND/OR logic

**Database Fields**:
```javascript
{
  type: 'smart',
  name: string,
  description: string,
  criteria: {
    // Metadata filters
    bpm_min: number,
    bpm_max: number,
    key: number,      // Camelot key number
    mode: number,     // 0 = minor, 1 = major
    genres: string[],
    energy_min: number,
    energy_max: number,
    danceability_min: number,
    valence_min: number,  // Musical positivity

    // Date filters
    date_added_after: timestamp,
    date_added_before: timestamp,

    // Play stats
    play_count_min: number,
    play_count_max: number,
    last_played_before: timestamp,
    last_played_after: timestamp,

    // Quality filters
    rating_min: number,
    bitrate_min: number,

    // Library filters
    library_directory_id: number,
    relative_path_contains: string,

    // Analysis filters
    is_analyzed: boolean,
    has_stems: boolean,

    // Combine with AND/OR
    logic: 'and' | 'or',

    // Sorting
    sort_by: string,
    sort_order: 'asc' | 'desc',

    // Limit
    limit: number  // e.g., "Top 100 most played"
  }
}
```

**Criteria Examples**:
```javascript
// "Peak Time Techno"
{
  genres: ['Techno'],
  bpm_min: 130,
  bpm_max: 140,
  energy_min: 0.7,
  sort_by: 'energy',
  sort_order: 'desc'
}

// "Recent High-Quality Tracks"
{
  date_added_after: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days
  bitrate_min: 320,
  rating_min: 4,
  sort_by: 'date_added',
  sort_order: 'desc'
}

// "Never Played House"
{
  genres: ['House', 'Deep House', 'Tech House'],
  play_count_max: 0,
  is_analyzed: true,
  sort_by: 'date_added',
  sort_order: 'desc'
}

// "Needs Review"
{
  is_analyzed: false,
  logic: 'or',
  // OR tracks with no rating
  rating_min: null
}
```

---

### 3. Session History Playlists (Auto-Generated)
**Description**: Automatically created playlists that track what was played in each DJ session.

**Use Cases**:
- Performance history tracking
- Recreating past sets
- Analyzing what works for specific venues/crowds
- Sharing setlists
- Personal performance statistics

**Key Features**:
- Auto-created when a track is "played" (loaded into deck + played for X seconds)
- One playlist per session (date + optional venue)
- Read-only after session ends
- Tracks have timestamps (when played)
- Tracks may have play duration (partial plays)
- Can be converted to static playlist for editing
- Can be named/renamed after creation

**Database Fields**:
```javascript
{
  type: 'session',
  name: string,  // e.g., "Session - 2025-10-12 - Club XYZ"
  session_date: timestamp,
  session_venue: string,
  session_duration: number,  // Total session time in seconds
  is_readonly: boolean,      // True once session is finalized
}
```

**Playlist Track Fields** (for session history):
```javascript
{
  played_at: timestamp,      // When track was played
  play_duration: number,     // How long it played (seconds)
  notes: string             // Optional DJ notes
}
```

**Session Creation Logic**:
- Auto-create new session playlist when first track is played
- Session is considered "active" for X hours (configurable, default: 4 hours)
- If no tracks played for X hours, session auto-finalizes (becomes read-only)
- User can manually finalize session
- User can manually split session (start new session)

---

### 4. Temporary/Thinking Playlists
**Description**: Lightweight temporary playlists for exploring track combinations while browsing.

**Use Cases**:
- Testing track combinations before committing to a playlist
- "Shopping cart" while browsing library
- Quick collection of tracks to analyze together
- Temporary workspace for set preparation

**Key Features**:
- Quick add/remove (no confirmation)
- Can be promoted to permanent static playlist
- Can be discarded entirely
- Optional: Auto-clear when app closes
- Optional: Multiple thinking playlists (e.g., "Thinking 1", "Thinking 2")

**Database Fields**:
```javascript
{
  type: 'temp',
  name: string,  // e.g., "Thinking Playlist"
  is_temporary: boolean,  // Always true
  auto_clear_on_exit: boolean
}
```

**Implementation Options**:
- **Option A**: Single global thinking playlist per user
- **Option B**: Multiple named temporary playlists
- **Option C**: Thinking playlist is NOT saved to DB, only in memory

**Recommendation**: Option A for MVP, Option B for future enhancement.

---

### 5. Crate/Collection Playlists (Optional - Future)
**Description**: Organizational system where tracks can belong to multiple collections, with optional folder hierarchy.

**Use Cases**:
- Genre crates (e.g., "House" > "Deep House", "Tech House")
- Label crates (e.g., "Anjunadeep", "Drumcode")
- Project-based organization (e.g., "2025 Spring Tour")

**Key Features**:
- Tracks can be in multiple crates (many-to-many)
- Crates can be nested (folder structure)
- Hybrid between tags and playlists

**Why Deferred?**
- Adds complexity to data model
- Can be simulated with multiple static playlists
- Can be added later without breaking existing playlists

---

## Database Schema

### Playlists Table
```sql
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('static', 'smart', 'session', 'temp')),
    description TEXT,

    -- Visual organization
    color TEXT,  -- Hex color (e.g., '#FF5733')
    icon TEXT,   -- Icon identifier (e.g., 'star', 'fire', 'music')

    -- Smart playlist criteria (JSON)
    criteria TEXT,  -- Store as JSON string, NULL for non-smart playlists

    -- Session metadata
    session_date INTEGER,     -- Unix timestamp
    session_venue TEXT,
    session_duration INTEGER, -- Total seconds

    -- Flags
    is_temporary INTEGER DEFAULT 0,
    is_readonly INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,

    -- Timestamps
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed INTEGER
);

-- Indexes
CREATE INDEX idx_playlists_type ON playlists(type);
CREATE INDEX idx_playlists_temporary ON playlists(is_temporary);
CREATE INDEX idx_playlists_session_date ON playlists(session_date);
CREATE INDEX idx_playlists_favorite ON playlists(is_favorite);
```

### Playlist Tracks Table (Junction)
```sql
CREATE TABLE playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,

    -- Ordering (NULL for smart playlists)
    position INTEGER,

    -- Timestamps
    added_at INTEGER NOT NULL,
    played_at INTEGER,      -- For session history
    play_duration INTEGER,  -- Seconds (for session history)

    -- Per-track metadata
    notes TEXT,             -- DJ notes about this track in this playlist
    cue_in INTEGER,         -- Custom start point (milliseconds)
    cue_out INTEGER,        -- Custom end point (milliseconds)
    rating_in_context INTEGER, -- How well it worked in THIS context (1-5)

    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,

    -- Prevent duplicate tracks in same playlist (except for static playlists where duplicates may be intentional)
    -- We'll handle this in application logic instead of a unique constraint
);

-- Indexes
CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX idx_playlist_tracks_track ON playlist_tracks(track_id);
CREATE INDEX idx_playlist_tracks_position ON playlist_tracks(playlist_id, position);
CREATE INDEX idx_playlist_tracks_played ON playlist_tracks(played_at);
CREATE INDEX idx_playlist_tracks_added ON playlist_tracks(added_at);
```

---

## API Endpoints

### Playlist CRUD
```javascript
GET    /api/playlists                      // List all playlists
GET    /api/playlists/:id                  // Get playlist with tracks
POST   /api/playlists                      // Create playlist
PUT    /api/playlists/:id                  // Update playlist metadata
DELETE /api/playlists/:id                  // Delete playlist
GET    /api/playlists/:id/stats            // Get playlist statistics
```

**Request/Response Examples**:

```javascript
// POST /api/playlists - Create static playlist
{
  "name": "Peak Time Techno",
  "type": "static",
  "description": "High-energy tracks for peak time",
  "color": "#FF5733",
  "icon": "fire"
}

// POST /api/playlists - Create smart playlist
{
  "name": "Recent High Energy",
  "type": "smart",
  "description": "Last 30 days, high energy",
  "criteria": {
    "date_added_after": 1709251200000,
    "energy_min": 0.7,
    "sort_by": "date_added",
    "sort_order": "desc",
    "limit": 100
  }
}

// GET /api/playlists/:id - Response
{
  "id": 1,
  "name": "Peak Time Techno",
  "type": "static",
  "description": "High-energy tracks for peak time",
  "color": "#FF5733",
  "icon": "fire",
  "is_favorite": false,
  "track_count": 42,
  "total_duration": 10800,  // seconds
  "created_at": 1709251200000,
  "updated_at": 1709251200000,
  "last_accessed": 1709251200000,
  "tracks": [
    {
      "id": 123,
      "position": 0,
      "added_at": 1709251200000,
      "notes": "Great opener",
      "track": {
        "id": 123,
        "title": "Track Name",
        "artist": "Artist Name",
        "bpm": 132,
        "key": 7,
        // ... full track metadata
      }
    }
    // ... more tracks
  ]
}
```

### Playlist Track Management
```javascript
POST   /api/playlists/:id/tracks           // Add track(s) to playlist
DELETE /api/playlists/:id/tracks/:trackId  // Remove track from playlist
PUT    /api/playlists/:id/tracks/reorder   // Reorder tracks
PUT    /api/playlists/:id/tracks/:trackId  // Update track metadata (notes, cue points)
```

**Request/Response Examples**:

```javascript
// POST /api/playlists/:id/tracks - Add tracks
{
  "track_ids": [123, 456, 789],
  "position": 5,  // Insert at position 5 (optional, default: append)
  "notes": "Test these together"  // Optional, applies to all tracks
}

// PUT /api/playlists/:id/tracks/reorder - Reorder tracks
{
  "track_ids": [789, 123, 456]  // New order (must include all track IDs)
}

// PUT /api/playlists/:id/tracks/:trackId - Update track metadata
{
  "notes": "Great transition from previous track",
  "cue_in": 30000,   // Start at 30 seconds
  "cue_out": 240000, // End at 4 minutes
  "rating_in_context": 5
}
```

### Smart Playlist Operations
```javascript
GET    /api/playlists/:id/refresh          // Force refresh smart playlist
POST   /api/playlists/:id/convert          // Convert smart → static
```

### Session History
```javascript
POST   /api/playlists/sessions/start       // Start new session
POST   /api/playlists/sessions/:id/track   // Log track play
POST   /api/playlists/sessions/:id/finalize // Finalize session (make read-only)
GET    /api/playlists/sessions/active      // Get active session (if any)
```

**Request/Response Examples**:

```javascript
// POST /api/playlists/sessions/start
{
  "venue": "Club XYZ",
  "date": 1709251200000  // Optional, defaults to now
}

// Response
{
  "id": 42,
  "name": "Session - 2025-10-12 - Club XYZ",
  "type": "session",
  "session_date": 1709251200000,
  "session_venue": "Club XYZ",
  "is_readonly": false
}

// POST /api/playlists/sessions/:id/track - Log played track
{
  "track_id": 123,
  "played_at": 1709251200000,  // Optional, defaults to now
  "play_duration": 180,        // Optional, how long it played
  "notes": "Crowd loved this"
}
```

### Utility Endpoints
```javascript
GET    /api/playlists/:id/export           // Export as M3U/JSON/CSV
POST   /api/playlists/:id/duplicate        // Duplicate playlist
POST   /api/playlists/:id/merge            // Merge with another playlist
GET    /api/playlists/search               // Search playlists by name
```

---

## Service Layer Architecture

### PlaylistService
```javascript
class PlaylistService {
  // CRUD
  async create(playlistData);
  async getById(id, includeTracks = true);
  async getAll(filters = {});
  async update(id, updates);
  async delete(id);

  // Statistics
  async getStats(id);  // track count, duration, etc.
  async getRecentlyUpdated(limit = 10);
  async getFavorites();

  // Smart playlists
  async evaluateCriteria(criteria);  // Returns matching track IDs
  async refreshSmartPlaylist(id);
  async convertToStatic(id);  // Convert smart → static

  // Session history
  async startSession(venue, date);
  async logTrackPlay(sessionId, trackId, playedAt, duration);
  async finalizeSession(sessionId);
  async getActiveSession();

  // Utility
  async duplicate(id, newName);
  async merge(id1, id2, strategy = 'union');  // union, intersection, or append
  async export(id, format = 'm3u');  // m3u, json, csv
}
```

### PlaylistTrackService
```javascript
class PlaylistTrackService {
  // Track management
  async addTracks(playlistId, trackIds, position = null);
  async removeTrack(playlistId, trackId);
  async reorder(playlistId, newOrder);
  async updateTrackMetadata(playlistId, trackId, metadata);

  // Queries
  async getTracksByPlaylist(playlistId, sortBy = 'position');
  async getPlaylistsByTrack(trackId);  // Which playlists contain this track?

  // Validation
  async validateTrackExists(trackId);
  async checkDuplicate(playlistId, trackId);
}
```

### SmartPlaylistEvaluator
```javascript
class SmartPlaylistEvaluator {
  async buildQuery(criteria);  // Convert JSON criteria → SQL query
  async evaluate(criteria);    // Execute query, return track IDs
  async explainQuery(criteria); // Return human-readable explanation

  // Helper methods
  _buildWhereClause(criteria);
  _buildOrderClause(criteria);
  _buildLimitClause(criteria);
}
```

---

## WebSocket Events

```javascript
// Playlist events
{
  event: 'playlist:created',
  data: { playlist: { id, name, type, ... } }
}

{
  event: 'playlist:updated',
  data: { playlist: { id, name, ... } }
}

{
  event: 'playlist:deleted',
  data: { playlistId: 42 }
}

// Track events
{
  event: 'playlist:track:added',
  data: { playlistId: 42, trackId: 123, position: 5 }
}

{
  event: 'playlist:track:removed',
  data: { playlistId: 42, trackId: 123 }
}

{
  event: 'playlist:track:reordered',
  data: { playlistId: 42, trackIds: [789, 123, 456] }
}

// Smart playlist events
{
  event: 'playlist:smart:refreshed',
  data: { playlistId: 42, trackCount: 87, addedTracks: 5, removedTracks: 2 }
}

// Session events
{
  event: 'session:started',
  data: { sessionId: 42, venue: 'Club XYZ', date: 1709251200000 }
}

{
  event: 'session:track:played',
  data: { sessionId: 42, trackId: 123, playedAt: 1709251200000 }
}

{
  event: 'session:finalized',
  data: { sessionId: 42, trackCount: 42, duration: 7200 }
}
```

---

## Implementation Strategy

### Phase 1: Core Playlist CRUD (Day 1)
- Database schema migration
- Basic playlist CRUD (static playlists only)
- Add/remove/reorder tracks
- API endpoints
- Service layer
- Unit tests

### Phase 2: Smart Playlists (Day 2)
- Criteria evaluator
- Query builder
- Auto-refresh logic
- Convert smart → static
- Integration tests

### Phase 3: Session History (Day 3)
- Session management
- Track play logging
- Auto-create/finalize sessions
- Session statistics

### Phase 4: Temporary Playlists (Day 3)
- Thinking playlist implementation
- Promote to permanent
- Auto-clear logic

### Phase 5: Advanced Features (Day 4)
- Duplicate playlist
- Merge playlists
- Export playlists
- Search playlists
- WebSocket events
- Performance optimization

---

## Design Decisions

### Decision 1: Allow Duplicate Tracks in Static Playlists?
**Options**:
- A) No duplicates (enforce unique constraint)
- B) Allow duplicates (useful for sets where you want to play a track twice)

**Chosen**: B - Allow duplicates in static playlists
**Rationale**: DJs sometimes plan to play a track multiple times in a set (e.g., callback to opening track). We'll handle this in UI by showing warnings, but allow it in the database.

### Decision 2: Smart Playlist Refresh Strategy
**Options**:
- A) Refresh on every read (always current, slow)
- B) Refresh on track change (fast read, eventual consistency)
- C) Manual refresh only (fast, but may be stale)

**Chosen**: B - Refresh on track change (with debouncing)
**Rationale**: Best balance of freshness and performance. When tracks are added/updated/deleted, refresh affected smart playlists after 5-second debounce.

### Decision 3: Session Auto-Finalization
**Options**:
- A) Never auto-finalize (user must manually finalize)
- B) Auto-finalize after X hours of inactivity
- C) Auto-finalize at end of day (midnight)

**Chosen**: B - Auto-finalize after 4 hours of inactivity
**Rationale**: Most DJ sets are 1-4 hours. Auto-finalizing after 4 hours of no activity makes sense. User can still manually finalize earlier.

### Decision 4: Thinking Playlist Persistence
**Options**:
- A) In-memory only (lost on restart)
- B) Persist to DB, auto-clear on app restart
- C) Persist to DB, keep across restarts

**Chosen**: C - Persist to DB, keep across restarts
**Rationale**: User may be building a set over multiple sessions. Don't lose their work. User can manually clear when done.

---

## Future Enhancements

### Phase 2 (After MVP)
- Playlist folders/hierarchy
- Collaborative playlists (multi-user)
- Playlist templates
- Auto-generate playlists from criteria presets
- Playlist analytics (most played playlist, etc.)

### Phase 3 (Advanced)
- Playlist recommendations (based on listening history)
- Auto-arrange playlist by harmonic mixing rules
- AI-powered playlist generation ("Create 2-hour deep house set")
- Playlist versioning (track changes over time)
- Sync playlists to external services (Spotify, Rekordbox, Serato)

---

## Questions to Resolve

1. **Track Context Metadata**: Should we allow per-playlist track metadata (notes, cue points, ratings)? This adds complexity but is very useful.
   - **Recommendation**: Yes, add in Phase 1. It's a key DJ workflow feature.

2. **Smart Playlist Limits**: Should smart playlists have a max track count to prevent performance issues?
   - **Recommendation**: Yes, enforce a default limit of 1000 tracks (configurable).

3. **Session Splitting**: If a DJ plays an afternoon set and then an evening set, should these be separate sessions?
   - **Recommendation**: Yes, allow manual "finalize and start new session" action.

4. **Playlist Colors**: Should we support custom colors or have a predefined palette?
   - **Recommendation**: Predefined palette for MVP (easier UI), custom colors in Phase 2.

5. **M3U Export**: Should we support extended M3U with metadata?
   - **Recommendation**: Yes, export as extended M3U with `#EXTINF` tags.

---

## Success Metrics

- [ ] Static playlists fully functional
- [ ] Smart playlists correctly evaluate all criteria types
- [ ] Session history auto-creates and finalizes properly
- [ ] Temporary playlists can be promoted to permanent
- [ ] All API endpoints tested and documented
- [ ] WebSocket events firing correctly
- [ ] Performance: 1000-track playlist loads in < 100ms
- [ ] Export to M3U format works correctly

---

## Open Questions for Chester

1. Do you want to support **playlist folders** (e.g., "Gigs/2025/Club XYZ") in Phase 1, or save for later?
2. Should **session history** auto-start when you load a track, or require manual "start session" action?
3. Do you want **multiple temporary playlists** (e.g., "Thinking 1", "Thinking 2"), or just one global thinking playlist?
4. Should smart playlists support **nested criteria** (e.g., "(Genre = House OR Genre = Techno) AND BPM > 128")?
5. Do you want to **import playlists** from M3U/Rekordbox/Serato, or just export?

---

*This document will be updated as decisions are made and implementation progresses.*
