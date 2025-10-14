# Mismo DJ Node.js Backend - Detailed Implementation Plan

## Project Overview

Build a Node.js backend server that manages a multi-directory music library with duplicate detection, file operations, library scanning, and coordination with Python analysis server.

---

## Phase 1: Project Setup & Core Infrastructure (Days 1-3)

### Day 1: Project Initialization

- [ ] Initialize npm project
  - Create `package.json` with project metadata
  - Set up TypeScript configuration (recommended) or use plain JavaScript
  - Configure ESLint and Prettier for code quality

- [ ] Install core dependencies

  ```bash
  # Database
  npm install better-sqlite3

  # Web server
  npm install express cors
  npm install ws

  # File operations
  npm install chokidar fs-extra glob

  # Metadata extraction
  npm install music-metadata

  # HTTP client
  npm install axios

  # File hashing (xxHash for fast duplicate detection) - not used replace with wasm xxhash
  # npm install xxhash-addon

  # Utilities
  npm install dotenv winston joi

  # Development
  npm install --save-dev nodemon jest @types/node
  ```

- [ ] Create project structure

  ```
  nodejs-backend/
  ├── src/
  │   ├── server.js
  │   ├── config/
  │   │   ├── database.js
  │   │   └── settings.js
  │   ├── routes/
  │   ├── services/
  │   ├── websocket/
  │   └── utils/
  ├── migrations/
  ├── tests/
  ├── .env.example
  └── README.md
  ```

- [ ] Set up environment configuration
  - Create `.env.example` with all configuration options
  - Create `.env` for local development
  - Configure paths, ports, URLs

### Day 2: Database Setup

- [ ] Implement database connection service (`src/config/database.js`)
  - Initialize SQLite connection with `better-sqlite3`
  - Enable foreign key constraints
  - Configure connection pooling/caching
  - Add error handling and logging

- [ ] Create database initialization script
  - Load and execute `schema.sql`
  - Create all tables, indexes, views, triggers
  - Insert default settings
  - Verify schema version tracking

- [ ] Verify database schema version
  - Confirm schema version 1 is applied
  - Set up future migration capability (if needed later)

- [ ] Create database utility functions
  - Query helpers (select, insert, update, delete)
  - Transaction management
  - Prepared statement caching
  - Error handling wrapper

### Day 3: Core Express Server & Basic API

- [ ] Set up Express server (`src/server.js`)
  - Initialize Express app
  - Configure middleware (CORS, body-parser, etc.)
  - Set up request logging
  - Error handling middleware
  - 404 handler

- [ ] Implement logging system (`src/utils/logger.js`)
  - Configure Winston with file and console transports
  - Set up log levels (debug, info, warn, error)
  - Add request logging
  - Structured logging format

- [ ] Create validation utilities (`src/utils/validators.js`)
  - Use Joi for request validation schemas
  - Common validators (paths, IDs, pagination, etc.)
  - Validation middleware factory

- [ ] Implement settings API (`src/routes/settings.js`)

  ```javascript
  GET    /api/settings          - Get all settings
  GET    /api/settings/:key     - Get single setting
  PUT    /api/settings/:key     - Update setting
  ```

- [ ] Create settings service (`src/services/settingsService.js`)
  - Load settings from database
  - Cache settings in memory
  - Type conversion (string → int/float/bool/json)
  - Update and persist settings

---

## Phase 2: Library Directory Management (Days 4-7) ✅ COMPLETE

### Day 4: Library Directory CRUD ✅

- [x] Create library directories route (`src/routes/libraryDirectory.routes.js`) ✅

  ```javascript
  GET    /api/library/directories           - List all library directories ✅
  POST   /api/library/directories           - Add new library directory ✅
  GET    /api/library/directories/:id       - Get single directory ✅
  PUT    /api/library/directories/:id       - Update directory settings ✅
  DELETE /api/library/directories/:id       - Remove directory ✅
  POST   /api/library/directories/:id/check-availability - Check availability ✅
  ```

- [x] Implement library directory service (`src/services/libraryDirectory.service.js`) ✅
  - CRUD operations for library directories ✅
  - Path validation and normalization ✅
  - Detect if path is on removable media ✅
  - Check directory availability ✅
  - Load directory statistics ✅
  - **NOTE**: Statistics endpoint not exposed yet (can be added later)

### Day 5: File Scanner Implementation ✅

- [x] Create file scanner service (`src/services/scanner.service.js`) ✅
  - Recursive directory traversal ✅
  - File pattern matching (glob patterns) ✅
  - Exclude pattern support ✅
  - Max depth limiting ✅
  - Scan progress tracking ✅
  - Cancel scan capability ✅
  - **NOTE**: Pause/resume not implemented (not critical for MVP)

- [x] Implement metadata extractor (`src/services/metadata.service.js`) ✅
  - Use `music-metadata` to extract: ✅
    - Title, artist, album, genre, year ✅
    - Duration, sample rate, bit rate, channels ✅
    - Track number, album artist, comments ✅
  - Handle missing/corrupt metadata gracefully ✅
  - Fallback to filename parsing ✅
  - **NOTE**: Album art extraction deferred (not critical for MVP)

- [x] Create file hash service (`src/services/hash.service.js`) ✅
  - Calculate audio content hash using xxHash (WebAssembly) ✅
  - Full file hashing ✅
  - Audio-only hashing (excludes metadata for duplicate detection) ✅
  - Quick hash for fast screening ✅
  - Batch processing support ✅
  - Format-specific metadata skipping (MP3 ID3v2/v1, FLAC, etc.) ✅

### Day 6: Hybrid Scanning Strategy ✅

- [x] Implement hybrid scanner workflow ✅
  - **Fast Scan**: Quick file check, minimal metadata ✅
  - **Full Scan**: Complete metadata extraction ✅
  - **Hybrid Scan**: Smart scan (only new/modified files) ✅
    - Find all audio files in directory ✅
    - Extract basic metadata ✅
    - Calculate file hash ✅
    - Insert tracks into database ✅
    - Mark as "not analyzed" ✅
    - **NOTE**: Progress updates via WebSocket - deferred to Phase 6

  - **Phase 2: Background Analysis Queue** - Deferred to Phase 5
    - Queue unanalyzed tracks (coming in Phase 5)
    - Send to Python analysis server (coming in Phase 5)
    - Process in batches (coming in Phase 5)
    - Handle analysis callbacks (coming in Phase 5)
    - Update database with results (coming in Phase 5)

- [x] Add scan endpoint (`src/routes/scan.routes.js`) ✅

  ```javascript
  POST   /api/scan/library/:id         - Start scan ✅
  GET    /api/scan/library/:id/status  - Get scan status ✅
  GET    /api/scan/active              - List active scans ✅
  DELETE /api/scan/library/:id         - Cancel scan ✅
  {
    "strategy": "hybrid",    // or "fast" or "full" ✅
    "priority": "normal"     // accepted but not used yet
  }
  ```

- [x] Implement concurrent scan management ✅
  - Track active scans ✅
  - Limit concurrent scans (configurable) ✅
  - Prevent duplicate scans ✅
  - **NOTE**: Priority-based queue not implemented (not critical for MVP)

### Day 7: File Watcher ⏸️ DEFERRED

- [x] Create file watcher service (`src/services/fileWatcher.js`) ✅
  - Use `chokidar` to watch library directories ✅
  - Detect new files → auto-import ✅
  - Detect modified files → re-analyze ✅
  - Detect deleted files → mark as deleted or remove ✅
  - Detect directory availability changes ✅
  - Handle removable media disconnect/reconnect
  - **STATUS**: Dependencies installed (chokidar), implementation deferred to Phase 3

- [ ] Implement removable media detection
  - Detect when removable drive disconnects
  - Mark directory as `is_available = false`
  - Mark all tracks as `is_missing = true`
  - Send WebSocket event `library:media:disconnected`
  - Auto-restore when media reconnects
  - **STATUS**: Database fields ready, logic not implemented yet

---

## Phase 3: Track Management & Duplicate Detection (Days 8-11)

### Day 8: Track CRUD API

- [ ] Create tracks route (`src/routes/tracks.js`)

  ```javascript
  GET    /api/tracks              - List all tracks (paginated, filtered)
  GET    /api/tracks/:id          - Get single track
  POST   /api/tracks              - Add new track manually
  PUT    /api/tracks/:id          - Update track metadata
  DELETE /api/tracks/:id          - Delete track from database
  GET    /api/tracks/search       - Search tracks
  ```

- [x] Implement track service (`src/services/trackService.js`) ✅
  - CRUD operations ✅
  - Pagination support ✅
  - Advanced filtering (artist, genre, BPM range, key, etc.) ✅
  - Search functionality (full-text search) ✅
  - Sorting options ✅

- [ ] Add track query filters
  ```javascript
  GET /api/tracks?artist=Daft+Punk
  GET /api/tracks?bpm_min=120&bpm_max=130
  GET /api/tracks?key=7&mode=1
  GET /api/tracks?library_id=1
  GET /api/tracks?is_missing=true
  GET /api/tracks?duplicate_group_id=5
  GET /api/tracks?sort=bpm&order=desc&page=1&limit=50
  ```

### Day 9: Duplicate Detection

- [x] Create duplicate detector service (`src/services/duplicateDetector.js`)
  - Check if file hash exists in `duplicate_groups` ✅
  - If exists: assign track to existing group ✅
  - If new and first occurrence: create new group ✅
  - Auto-detect duplicates during import ✅
  - Batch duplicate detection for existing library ✅

- [x Implement duplicate management routes (`src/routes/duplicates.js`)

  ```javascript
  GET    /api/duplicates                   - List all duplicate groups
  GET    /api/duplicates/:id              - Get duplicate group with tracks
  POST   /api/duplicates/:id/resolve      - Resolve duplicates
  POST   /api/duplicates/scan             - Scan entire library for duplicates
  ```

- [x] Create duplicate resolution logic
  - Select canonical track (best quality, preferred location)
  - Merge metadata from duplicates
  - Update playlists to reference canonical track
  - Optionally delete duplicate files
  - Log resolution actions

### Day 10: File Operations

- [x] Create file operations service (`src/services/fileOperations.js`)
  - **Move track**: Move file to new location ✅
    - Validate destination path
    - Check disk space
    - Execute file move
    - Update database (path, library_directory_id, relative_path)
    - Log operation
    - Rollback on failure

  - **Rename track**: Rename file ✅
    - Validate new filename
    - Execute file rename
    - Update database
    - Log operation

  - **Delete track**: Delete file from disk ✅
    - Require confirmation flag
    - Execute file delete
    - Remove from database or mark as deleted
    - Remove from playlists
    - Log operation

- [x] Add file operation routes

  ```javascript
  POST   /api/tracks/:id/move
  POST   /api/tracks/:id/rename
  DELETE /api/tracks/:id/file
  ```

- [x] Implement file operation queue
  - Queue operations to prevent conflicts
  - Process one operation at a time per file
  - Retry failed operations
  - Track operation status
  - Send WebSocket progress updates

### Day 11: Directory Browser & Missing Media

- [ ] Create directory browser service (`src/services/directoryBrowser.js`)
  - Browse subdirectories within library directory
  - List folders and tracks at each level
  - Calculate folder statistics (track count, size)
  - Support any directory structure
  - Use relative_path for queries

- [ ] Add directory browsing endpoint

  ```javascript
  GET /api/library/directories/:id/browse?path=subfolder/artist
  ```

- [ ] Implement missing media handler (`src/services/missingMediaHandler.js`)
  - Mark tracks as missing when directory unavailable
  - Cleanup missing tracks after N days
  - Option to keep metadata vs. full delete
  - Restore tracks when media reconnected
  - Export metadata before cleanup

- [ ] Add cleanup endpoint
  ```javascript
  POST /api/library/directories/:id/cleanup
  {
    "remove_missing_older_than_days": 30,
    "keep_playlists_intact": true,
    "backup_metadata": true
  }
  ```

---

## Phase 4: Analysis Integration (Days 12-15)

**Note**: Moved before playlists so that smart playlists can leverage rich analysis metadata (BPM, key, energy, danceability, etc.) from day one.

### Day 12: Python Server Communication

- [ ] Create Python client service (`src/services/pythonClient.js`)
  - HTTP client for Python analysis server
  - Send analysis requests
  - Receive progressive updates
  - Handle timeouts and retries
  - Connection health checks

- [ ] Implement analysis queue service (`src/services/analysisQueue.js`)
  - Queue tracks for analysis
  - Priority queue (user-requested > auto-analyze)
  - **Limit concurrent analysis jobs (configurable, default: 2)**
  - **Retry failed analysis with exponential backoff**
  - **Max retry attempts (configurable, default: 3)**
  - Track job status (queued, processing, completed, failed)
  - Resume interrupted analysis on server restart
  - Store partial results
  - Handle Python server unavailability gracefully

### Day 13: Analysis Endpoints

- [ ] Create analysis routes (`src/routes/analysis.js`)

  ```javascript
  POST   /api/analysis/request         - Request analysis for track
  GET    /api/analysis/status/:jobId   - Get analysis status
  POST   /api/analysis/callback        - Receive results from Python
  GET    /api/analysis/queue           - View analysis queue
  DELETE /api/analysis/jobs/:jobId     - Cancel analysis job
  ```

- [ ] Implement analysis workflow
  - **Request analysis**:
    - Add job to queue
    - Hash is used as jobId
    - Send to Python server

  - **Receive callback**:
    - Validate job ID
    - Parse analysis results
    - Update track in database
    - Send WebSocket update, if relevant
    - Mark job as complete

### Day 14: Progressive Analysis Updates & Waveform Data

These are all the analysis stages -
{
"all": true, // Run all analyses (overrides individual flags)
"basic_features": true, // Tempo, key, beats, downbeats
"characteristics": true, // Danceability, energy, etc.
"genre": true, // Genre classification
"stems": true, // Stem separation (Demucs)
"segments": true, // Track segmentation
"transitions": true // Potential transition points
}

segments relies on stems and transitions relies on most previous analysis

- [ ] Handle multi-stage analysis
  - **Stage 1: Basic** (~5-10s)
    - ask for basic_features and characteristics
    - get callback for each
    - Keep all data in DB immidiately
    - data in basic_features also include waveform data

  - **Waveform Data**
    - Multi-zoom level waveform data
    - Store in database as BLOB
    - Serve to frontend for visualization

request format -
{
"file_path": "/mnt/audio/tracks/song.mp3",
"track_hash": "unique-track-id",
"options": {
"basic_features": true,
"characteristics": true
},
"callback_url": "https://myserver.com/callbacks",
"stem_delivery_mode": "path"
}

basic_features json format -
{
"key": 5,
"key_name": "F",
"mode": 1,
"mode_name": "major",
"key_strength": 0.7572953104972839,
"tempo": 130.4347826086961,
"beats": [
0.04,
0.52,
...
],
"downbeats": [
0.04,
1.96,
...
],
"beat_consistency": 0.9756163159093526,
"num_beats": 473,
"num_downbeats": 119,
"waveforms": [
{
"zoom_level": 0,
"samples_per_pixel": 9705,
"num_pixels": 1000,
"low_freq_amplitude": ...,
"low_freq_intensity": ...,
"mid_freq_amplitude": ...,
"mid_freq_intensity": ...,
"high_freq_amplitude": ...,
"high_freq_intensity": ...,
},
{
"zoom_level": 1,
"samples_per_pixel": 2426,
"num_pixels": 4000,
"low_freq_amplitude": ...,
"low_freq_intensity": ...,
"mid_freq_amplitude": ...,
"mid_freq_intensity": ...,
"high_freq_amplitude": ...,
"high_freq_intensity": ...,
},
{
"zoom_level": 2,
"samples_per_pixel": 606,
"num_pixels": 16000,
"low_freq_amplitude": ...,
"low_freq_intensity": ...,
"mid_freq_amplitude": ...,
"mid_freq_intensity": ...,
"high_freq_amplitude": ...,
"high_freq_intensity": ...,
}
]
}

characteristics json format -
{
"danceability": true,
"valence": 6.4851484298706055,
"arousal": 6.506827354431152,
"energy": -6.548165017682132,
"loudness": -12.012717247009277,
"acousticness": false,
"instrumentalness": false,
"processing_time": 2.6578464949998306
}

### Day 15: Stems

Stems are used for further analysis and for client getting stems access
If analysis is idle (all files have gone through basic and characteristics analysis), run the rest of the analysis for each file - this includes stems, in this case stems will not be perserved

If client asks for stems - put the stems request at highest priority, get stems from analysis and send to client

- when getting paths, read stems audio data and send to client, stems are not perserved on disk

---

## Phase 4.5: Audio Server Integration (Days 15.5-16)

**Note**: This phase provides the C++ audio server with track metadata and analysis data via WebSocket connection. Required before the audio server can implement tempo control and deck synchronization features.

### Day 15.5: WebSocket Client for Audio Server

- [ ] Create audio server WebSocket client service (`src/services/audioServerClient.js`)
  - Connect to audio server WebSocket (default: ws://localhost:8080)
  - Handle connection lifecycle (connect, disconnect, reconnect)
  - Implement exponential backoff for reconnection attempts
  - Gracefully handle audio server unavailability
  - Optional: Token-based authentication for production

- [ ] Implement message protocol handler
  - Listen for incoming `getTrackInfo` requests from audio server
  - Parse and validate incoming JSON messages
  - Send JSON responses back to audio server
  - Handle malformed messages gracefully
  - Log all requests and responses

- [ ] Create audio server routes (if using REST as fallback)
  ```javascript
  GET /api/audio-server/tracks/:id  - Get track info via REST (fallback)
  ```

### Day 16: Track Info Service for Audio Server

- [ ] Implement `getTrackInfo` command handler
  - **Input**: `{ command: "getTrackInfo", trackId: "uuid", stems: false }`
  - **Validate**: Track ID format and existence
  - **Query database** for track metadata and analysis data
  - **Return success response**:
    ```json
    {
      "success": true,
      "trackId": "uuid",
      "filePath": "/absolute/path/to/track.mp3",
      "bpm": 128.5,
      "key": "Am",
      "mode": "minor",
      "beats_data": [0.0, 0.468, 0.937, ...],
      "downbeats_data": [0.0, 1.873, 3.746, ...]
    }
    ```
  - **Return error response** for failures:
    ```json
    {
      "success": false,
      "trackId": "uuid",
      "error": "Track not found"
    }
    ```

- [ ] Handle edge cases
  - Track exists but file missing on disk → `"Track file missing"`
  - Track exists but not analyzed yet → `"Analysis not complete"`
  - Invalid track ID format → `"Invalid track ID"`
  - File permission issues → `"Permission denied"`

- [ ] Add track info utility functions
  - Convert relative path to absolute path
  - Load beats and downbeats from database
  - Handle missing analysis data gracefully (return empty arrays)
  - Validate file accessibility before returning path

### Testing & Validation

- [ ] Create WebSocket test client
  - Test connection establishment
  - Send `getTrackInfo` commands
  - Verify response format
  - Test error scenarios

- [ ] Integration test with audio server
  - Ensure audio server can connect
  - Request track info for test tracks
  - Verify file paths are accessible from audio server
  - Test with tracks at different analysis stages

- [ ] Performance testing
  - Test response time for track info requests
  - Verify no memory leaks with long-running connections
  - Test concurrent requests from audio server

### Configuration

Add to `.env`:

```env
# Audio Server WebSocket (App Server connects TO Audio Server)
AUDIO_SERVER_WS_URL=ws://localhost:8080
AUDIO_SERVER_RECONNECT_DELAY=1000
AUDIO_SERVER_MAX_RECONNECT_DELAY=30000
AUDIO_SERVER_AUTH_TOKEN=optional-token-for-production
```

---

## Phase 5: Playlist Management (Days 17-20)

**Note**: Moved after analysis integration so smart playlists can use rich metadata (BPM, key, energy, etc.) from day one. See [playlists-design.md](./playlists-design.md) for detailed design document.

### Day 17: Core Playlist CRUD & Database Schema

- [ ] Create database migration for playlists

  ```sql
  CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('static', 'smart', 'session', 'temp')),
    description TEXT,
    color TEXT,
    icon TEXT,
    criteria TEXT,  -- JSON for smart playlists
    session_date INTEGER,
    session_venue TEXT,
    session_duration INTEGER,
    is_temporary INTEGER DEFAULT 0,
    is_readonly INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed INTEGER
  );

  CREATE TABLE playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    position INTEGER,
    added_at INTEGER NOT NULL,
    played_at INTEGER,
    play_duration INTEGER,
    notes TEXT,
    cue_in INTEGER,
    cue_out INTEGER,
    rating_in_context INTEGER,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
  );
  ```

- [ ] Create playlists route (`src/routes/playlists.js`)

  ```javascript
  GET    /api/playlists                      - List all playlists
  GET    /api/playlists/:id                  - Get playlist with tracks
  POST   /api/playlists                      - Create playlist
  PUT    /api/playlists/:id                  - Update playlist metadata
  DELETE /api/playlists/:id                  - Delete playlist
  GET    /api/playlists/:id/stats            - Get playlist statistics
  ```

- [ ] Implement playlist service (`src/services/playlistService.js`)
  - CRUD operations for static playlists
  - Load playlist with tracks (JOIN query)
  - Playlist statistics (duration, track count)
  - Favorite/unfavorite playlists

### Day 18: Playlist Track Management

- [ ] Add playlist track routes

  ```javascript
  POST   /api/playlists/:id/tracks           - Add tracks to playlist
  DELETE /api/playlists/:id/tracks/:trackId  - Remove track from playlist
  PUT    /api/playlists/:id/tracks/reorder   - Reorder tracks
  PUT    /api/playlists/:id/tracks/:trackId  - Update track metadata (notes, cues)
  ```

- [ ] Implement playlist track service (`src/services/playlistTrackService.js`)
  - Add multiple tracks at once
  - Maintain position ordering
  - Reorder tracks (update positions)
  - Remove tracks (resequence positions)
  - Update per-track metadata (notes, cue points, rating)
  - Handle deleted tracks gracefully

- [ ] Implement temporary/thinking playlist
  - Single "Thinking Playlist" (type = 'temp')
  - Auto-create if doesn't exist
  - Quick add/remove tracks
  - Promote to permanent static playlist

### Day 19: Smart Playlists

- [ ] Create smart playlist evaluator (`src/services/smartPlaylistEvaluator.js`)
  - Parse JSON criteria
  - Build SQL query from criteria
  - Support filters: BPM, key, mode, genre, energy, danceability, date added, play count, rating, etc.
  - Support complex criteria (AND/OR logic)
  - Support sorting and limits
  - Explain query (human-readable description)

- [ ] Add smart playlist endpoints

  ```javascript
  POST   /api/playlists/:id/refresh          - Force refresh smart playlist
  POST   /api/playlists/:id/convert          - Convert smart → static
  GET    /api/playlists/:id/explain          - Explain smart playlist criteria
  ```

- [ ] Implement auto-refresh logic
  - Refresh affected smart playlists when tracks change
  - Debounce refresh (5-second delay)
  - Background refresh job
  - Track last_refreshed timestamp

### Day 20: Session History Playlists

- [ ] Create session management service (`src/services/sessionService.js`)
  - Start new session (auto-create playlist)
  - Log track plays
  - Auto-finalize after X hours of inactivity
  - Manual finalize
  - Get active session

- [ ] Add session endpoints

  ```javascript
  POST   /api/playlists/sessions/start       - Start new session
  POST   /api/playlists/sessions/:id/track   - Log track play
  POST   /api/playlists/sessions/:id/finalize - Finalize session
  GET    /api/playlists/sessions/active      - Get active session
  ```

- [ ] Implement session auto-management
  - Auto-create session on first track play (if no active session)
  - Track inactivity timer
  - Auto-finalize after 4 hours of inactivity
  - Make session read-only after finalization
  - Update session duration on finalization

- [ ] Add utility endpoints

  ```javascript
  POST   /api/playlists/:id/duplicate        - Duplicate playlist
  POST   /api/playlists/:id/merge            - Merge with another playlist
  GET    /api/playlists/:id/export           - Export as M3U/JSON
  GET    /api/playlists/search               - Search playlists by name
  ```

---

## Phase 6: WebSocket Real-Time Updates (Days 21-22)

### Day 21: WebSocket Server Setup

- [ ] Create WebSocket server (`src/websocket/server.js`)
  - Initialize WebSocket server with `ws`
  - Handle client connections
  - Client authentication (optional)
  - Connection management
  - Heartbeat/ping-pong for connection health

- [ ] Implement event broadcaster
  - Broadcast to all connected clients
  - Broadcast to specific client
  - Event filtering by subscription
  - Message batching for bulk operations
  - Rate limiting

### Day 22: Implement All WebSocket Events

- [ ] Track events

  ```javascript
  track: added;
  track: updated;
  track: deleted;
  track: moved;
  track: missing;
  track: restored;
  ```

- [ ] Library events

  ```javascript
  library: directory: added;
  library: directory: updated;
  library: directory: removed;
  library: directory: scan: started;
  library: directory: scan: progress;
  library: directory: scan: complete;
  library: media: connected;
  library: media: disconnected;
  ```

- [ ] Analysis events

  ```javascript
  analysis: started;
  analysis: progress;
  analysis: complete;
  analysis: failed;
  ```

- [ ] Duplicate events

  ```javascript
  duplicate: detected;
  duplicate: resolved;
  ```

- [ ] File operation events

  ```javascript
  file_operation: started;
  file_operation: progress;
  file_operation: complete;
  file_operation: failed;
  ```

- [ ] Playlist events

  ```javascript
  playlist: created;
  playlist: updated;
  playlist: deleted;
  playlist: track: added;
  playlist: track: removed;
  playlist: track: reordered;
  playlist: smart: refreshed;
  session: started;
  session: track: played;
  session: finalized;
  ```

---

## Phase 7: Audio Engine Integration (Days 23-24)

**Note**: Phase 4.5 already implements WebSocket communication with the audio server. This phase covers additional integration features if needed.

### Day 23: Extended Audio Engine Features (Optional)

- [ ] Add REST API fallback endpoints (if WebSocket is insufficient)

  ```javascript
  GET /api/tracks/:id/file          - Get track file path and metadata
  POST /api/tracks/:id/load         - Log track load event
  POST /api/tracks/:id/playback     - Log playback events
  ```

- [ ] Implement track event logging
  - Log when tracks are loaded into decks
  - Log playback start/stop events
  - Track play count and last played timestamp
  - Update session playlists with play events

### Day 24: Waveform Management

- [ ] Implement waveform routes

  ```javascript
  GET  /api/tracks/:id/waveform?zoom=0   - Get waveform at zoom level
  POST /api/tracks/:id/waveform          - Generate/update waveform
  ```

- [ ] Create waveform service
  - Load waveform from database
  - Generate waveform (call C++ or Python)
  - Cache waveforms
  - Serve waveform data in efficient format

---

## Phase 8: Testing & Quality Assurance (Days 25-28)

### Day 25: Unit Tests

- [ ] Set up Jest testing framework
- [ ] Write unit tests for services
  - Database service tests
  - Library directory service tests
  - File scanner tests
  - Duplicate detector tests
  - File operations tests
  - Playlist service tests
  - Audio server WebSocket tests

### Day 26: Integration Tests

- [ ] Write integration tests
  - Full library scan workflow
  - Duplicate detection workflow
  - File operation workflow
  - Analysis request workflow
  - Playlist management workflow

- [ ] Test error scenarios
  - Database errors
  - File system errors
  - Network errors (Python server down)
  - Invalid input
  - Concurrent operations
  - Audio server WebSocket communication

### Day 27: Performance Testing

- [ ] Load testing
  - Test with large library (10k+ tracks)
  - Concurrent scan performance
  - API response times
  - WebSocket scalability
  - Database query optimization

- [ ] Optimize slow operations
  - Add database indexes where needed
  - Optimize complex queries
  - Add caching where appropriate
  - Profile and fix bottlenecks
  - WebSocket message throughput for audio server

### Day 28: Security Audit

- [ ] Security review
  - Path traversal prevention
  - SQL injection prevention (use prepared statements)
  - Input validation on all endpoints
  - Rate limiting
  - CORS configuration
  - File operation safety checks
  - Error message sanitization

---

## Phase 9: Documentation & Polish (Days 29-30)

### Day 29: API Documentation

- [ ] Create comprehensive API documentation
  - All endpoints with examples
  - Request/response formats
  - Error codes and messages
  - WebSocket event reference
  - Rate limiting information

- [ ] Create developer documentation
  - Architecture overview
  - Database schema documentation
  - Service descriptions
  - Configuration guide
  - Deployment guide
  - Audio server WebSocket API documentation

### Day 30: Code Cleanup & README

- [ ] Code cleanup
  - Remove unused code
  - Consistent code style
  - Add JSDoc comments
  - Refactor complex functions

- [ ] Create comprehensive README
  - Project overview
  - Installation instructions
  - Configuration guide
  - Running the server
  - Development setup
  - Testing instructions
  - Troubleshooting

- [ ] Create `.env.example` with all settings

  ```env
  # Server
  PORT=3000
  NODE_ENV=development

  # Database
  DATABASE_PATH=./data/library.db

  # Python Analysis Server
  PYTHON_SERVER_URL=http://localhost:5000
  MAX_CONCURRENT_ANALYSIS=2

  # C++ Audio Server WebSocket (App Server connects TO Audio Server)
  AUDIO_SERVER_WS_URL=ws://localhost:8080
  AUDIO_SERVER_RECONNECT_DELAY=1000
  AUDIO_SERVER_MAX_RECONNECT_DELAY=30000
  AUDIO_SERVER_AUTH_TOKEN=optional-token-for-production

  # Library Settings
  MAX_CONCURRENT_SCANS=2
  AUTO_ANALYZE_NEW_TRACKS=true

  # Duplicate Detection
  DUPLICATE_DETECTION_ENABLED=true
  DUPLICATE_HASH_ALGORITHM=sha256

  # File Operations
  CONFIRM_FILE_DELETES=true
  LOG_FILE_OPERATIONS=true

  # Logging
  LOG_LEVEL=info
  LOG_FILE=./logs/app.log
  ```

---

## Phase 10: Deployment & Integration (Days 31-32)

### Day 31: Deployment Preparation

- [ ] Create production configuration
- [ ] Set up database backups
- [ ] Configure logging for production
- [ ] Create systemd service file (Linux) or equivalent
- [ ] Set up monitoring and health checks
- [ ] Configure audio server WebSocket for production

### Day 32: Integration Testing

- [ ] Test integration with C++ audio engine
- [ ] Test integration with Python analysis server
- [ ] Test with real music library
- [ ] End-to-end testing with frontend
- [ ] Performance testing under load
- [ ] Fix any integration issues

---

## Deliverables Checklist

### Code

- [ ] Fully functional Node.js backend server
- [ ] All API endpoints implemented
- [ ] WebSocket server with real-time updates
- [ ] Database schema with migrations
- [ ] Comprehensive test suite

### Documentation

- [ ] API documentation
- [ ] Architecture documentation
- [ ] Database schema documentation
- [ ] README with setup instructions
- [ ] Configuration guide

### Quality

- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] No security vulnerabilities
- [ ] Performance benchmarks met
- [ ] Code review complete

---

## Risk Mitigation

### Technical Risks

1. **Large Library Performance**: Mitigated by hybrid scanning, pagination, indexing
2. **File Hash Calculation**: Mitigated by background processing, caching
3. **Python Server Downtime**: Mitigated by queue persistence, retry logic
4. **Database Corruption**: Mitigated by regular backups, transactions
5. **Concurrent File Operations**: Mitigated by operation queue, locking

### Development Risks

1. **Scope Creep**: Stick to design document, defer nice-to-have features
2. **Timeline Slippage**: Prioritize core features, test incrementally
3. **Integration Issues**: Early integration testing, clear contracts

---

## Success Criteria

1. ✅ All API endpoints functional and documented
2. ✅ Multi-directory library support working
3. ✅ Duplicate detection accurate and fast
4. ✅ File operations safe and reliable
5. ✅ WebSocket real-time updates working
6. ✅ Integration with Python and C++ components successful
7. ✅ Performance acceptable with 10k+ track library
8. ✅ Test coverage > 80%
9. ✅ Security audit passed
10. ✅ Documentation complete

---

## Post-Launch Enhancements (Future)

- Advanced smart playlist criteria builder
- Batch file operations (move/rename multiple tracks)
- Library analytics and reports
- Track version history
- Collaborative playlists
- Mobile app API support
- Cloud storage integration
- Machine learning for auto-tagging
- Advanced duplicate detection (acoustic fingerprinting)
- Multi-user support with authentication

---

## Timeline Summary

- **Phase 1**: Days 1-3 (Setup) ✅ COMPLETE
- **Phase 2**: Days 4-7 (Library Management) ✅ COMPLETE
- **Phase 3**: Days 8-11 (Tracks & Duplicates) ✅ COMPLETE
- **Phase 4**: Days 12-15 (Analysis Integration) - **MOVED UP** to leverage metadata for playlists
- **Phase 4.5**: Days 15.5-16 (Audio Server Integration) - **NEW** WebSocket communication with C++ audio server
- **Phase 5**: Days 17-20 (Playlist Management) - **MOVED DOWN** to use analysis data
- **Phase 6**: Days 21-22 (WebSocket Real-Time Updates)
- **Phase 7**: Days 23-24 (Extended Audio Engine Features)
- **Phase 8**: Days 25-28 (Testing)
- **Phase 9**: Days 29-30 (Documentation)
- **Phase 10**: Days 31-32 (Deployment)

**Total: ~32 working days (6-7 weeks)**

### Phase Order Rationale

**Why Analysis (Phase 4) Before Playlists (Phase 5)?**

The Python analysis server provides rich metadata that makes playlists significantly more powerful:

- **Smart playlists** can filter by BPM, key, energy, danceability, valence
- **Session history** can include energy flow analysis
- **Recommendations** can be based on harmonic mixing, energy levels
- **Auto-arrangement** can consider key compatibility and energy progression

By implementing analysis first, we can build playlist features that leverage this data from day one, rather than retrofitting it later.

---

# extras and fixes -

- [x] waveforms should be saved based on the track hash, this way 2 copies of same track share the same waveform data
- [x] Allow client to ask for quick analysis of a file - when a file is loaded into a deck
- [x] when checking for pending analysis jobs check the file is not missing - close the job if missing
- [x] change track id to UUID - not consecutive - so we can have tracks from multiple sources, withotu fear of repetition
- do not wait on analysis server on startup, at the moment it is a blocking command slowing the startup
- start the audio server on startup - after startup connect to it, monitor for crashes
- have a command from client to restart audio and analysis servers - helps with updates

# Future features

- rating icon - smiley, dancing couple, raging face
- search for tracks that match musically to current track, as next track, recommend based on drop, increase or decrease energy, etc
- pull info from other sources - discogs, spotify, google music, tunebat, 1001tracklist
