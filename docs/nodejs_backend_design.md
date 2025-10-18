# Node.js Backend Server - Requirements & Specification

## Overview

The Node.js backend server is the **data and business logic layer** for Mismo DJ. It handles all non-real-time operations including database management, file system operations, multi-directory library management, duplicate detection, file operations, and coordination between the Python analysis server and the C++ audio engine.

## Architecture Position

```
┌─────────────────┐
│   Web Frontend  │
│   (React/Vue)   │
└────────┬────────┘
         │
         ├─── WebSocket (data updates) ───┐
         │                                 │
         └─── REST API (CRUD ops) ────────┤
                                           ▼
                                  ┌────────────────┐
                                  │   Node.js      │
                                  │   Backend      │
                                  └────────┬───────┘
                                           │
         ┌──────────────┬──────────────────┼──────────────┬──────────────┬──────────────┐
         │              │                  │              │              │              │
         ▼              ▼                  ▼              ▼              ▼              ▼
    ┌────────┐    ┌─────────┐      ┌──────────┐   ┌──────────┐   ┌─────────┐   ┌─────────────┐
    │ SQLite │    │Library  │      │  Python  │   │   C++    │   │  File   │   │ File Hash   │
    │   DB   │    │Manager  │      │ Analysis │   │  Audio   │   │ Watcher │   │  Service    │
    │        │    │         │      │  Server  │   │  Engine  │   │         │   │             │
    └────────┘    └─────────┘      └──────────┘   └──────────┘   └─────────┘   └─────────────┘
```

## Core Responsibilities

### 1. Database Management (SQLite)

**Primary Role**: Centralized data storage and retrieval for all application data with support for multiple library directories.

#### Database Schema

The backend manages the following tables (see full schema at end of document):

1. **`library_directories`** - Multiple library locations

   - Directory path and user-friendly name
   - Scanning configuration (recursive, depth, patterns)
   - Status tracking (available, scanning, missing counts)
   - Removable media support

2. **`tracks`** - Music track metadata (enhanced)

   - File information (path, size, modification date)
   - **Library directory reference** and relative path
   - **File hash** for duplicate detection
   - Missing media tracking
   - Duplicate group reference
   - All original metadata and analysis fields

3. **`duplicate_groups`** - Duplicate track management

   - File hash grouping
   - Canonical track selection
   - Duplicate count tracking

4. **`file_operations`** - File operation logging

   - Move, rename, delete operations
   - Status tracking and error handling
   - Operation history

5. **`playlists`** - User-created playlists

   - Basic info (name, description, dates)
   - Smart playlist support (criteria stored as JSON)
   - Appearance (color, icon)

6. **`playlist_tracks`** - Many-to-many junction table

   - Links tracks to playlists with ordering

7. **`waveforms`** - Pre-generated waveform data

   - Multiple zoom levels (0-3)
   - Binary data stored as BLOB
   - Linked to tracks

8. **`settings`** - Application configuration

   - Key-value store with type information
   - Categorized settings

9. **`schema_version`** - Database migrations tracking

#### Database Operations

**CRUD for Tracks:**

```javascript
// Create
POST /api/tracks
{
  "filePath": "/music/song.mp3",
  "title": "Track Title",
  "artist": "Artist Name",
  // ... other metadata
}

// Read
GET /api/tracks/:id
GET /api/tracks?artist=Daft+Punk&bpm_min=120&bpm_max=130
GET /api/tracks?library_id=1              // Filter by library directory
GET /api/tracks?is_missing=true           // Filter missing tracks
GET /api/tracks?duplicate_group_id=5      // Filter by duplicate group

// Update
PUT /api/tracks/:id
{
  "rating": 5,
  "colorTag": "#FF0000"
}

// Delete
DELETE /api/tracks/:id
```

**CRUD for Playlists:**

```javascript
// Create playlist
POST /api/playlists
{
  "name": "Friday Night",
  "description": "High energy tracks",
  "color": "#3498db"
}

// Add tracks to playlist
POST /api/playlists/:id/tracks
{
  "trackIds": [123, 456, 789]
}

// Reorder tracks
PUT /api/playlists/:id/tracks/reorder
{
  "trackId": 456,
  "newPosition": 2
}
```

**Search & Filtering:**

```javascript
GET /api/tracks/search?q=daft+punk
GET /api/tracks?genre=House&bpm_min=125&bpm_max=135
GET /api/tracks?key=7&mode=1  // Key of G major
GET /api/tracks?sort=bpm&order=asc
```

---

### 2. Multi-Directory Library Management & File Operations

**Responsibilities:**

- Manage multiple library directories with individual settings
- Scan directories for audio files with hybrid approach (fast initial + background analysis)
- Extract basic metadata from audio files
- Detect new/modified/deleted files across multiple directories
- Watch directories for changes with removable media support
- Import tracks into database with duplicate detection using file hashes
- Handle missing media for disconnected drives
- File operations (move, rename, delete) with proper logging
- Subdirectory browsing and management

#### Library Directory Management

**Add Library Directory:**

```javascript
POST /api/library/directories
{
  "path": "/home/user/Music",
  "name": "Main Library",
  "settings": {
    "recursive_scan": true,
    "max_depth": -1,
    "scan_patterns": ["*.mp3", "*.flac", "*.wav"],
    "exclude_patterns": [".*", "Podcasts/*"],
    "priority": 1
  }
}

// Response:
{
  "success": true,
  "data": {
    "id": 1,
    "path": "/home/user/Music",
    "name": "Main Library",
    "is_active": true,
    "is_removable": false,
    "total_tracks": 0,
    "scan_status": "idle"
  }
}
```

**Directory Browsing:**

```javascript
GET /api/library/directories/:id/browse?path=pop/artist

// Response:
{
  "directoryId": 1,
  "currentPath": "pop/artist",
  "contents": {
    "directories": [
      {
        "name": "Album1",
        "path": "pop/artist/Album1",
        "trackCount": 12,
        "totalSize": "120MB"
      }
    ],
    "tracks": [
      {
        "id": 123,
        "filename": "song1.mp3",
        "title": "Song 1",
        "artist": "Artist",
        "size": "10MB",
        "duration": 240
      }
    ]
  }
}
```

#### File Operations

**Move Track:**

```javascript
POST /api/tracks/:id/move
{
  "newPath": "/music/Electronic/House/track.mp3",
  "updateLibraryDirectory": true
}

// Response:
{
  "success": true,
  "data": {
    "trackId": 123,
    "oldPath": "/music/pop/track.mp3",
    "newPath": "/music/Electronic/House/track.mp3",
    "operationId": "op-123"
  }
}
```

**Rename Track:**

```javascript
POST /api/tracks/:id/rename
{
  "newName": "New Track Name.mp3",
  "updateMetadata": true
}
```

**Delete Track File:**

```javascript
DELETE /api/tracks/:id/file
{
  "confirm": true,
  "reason": "user_request"
}
```

#### Hybrid Scanning Strategy

**Phase 1: Fast Initial Scan**

- Extract basic metadata (title, artist, duration, etc.)
- Calculate file hash for duplicate detection
- Add tracks to database quickly
- Queue for background analysis

**Phase 2: Background Analysis**

- Send tracks to Python analysis server
- Progressive updates via WebSocket
- Throttled to minimize system impact
- Resumable if interrupted

```javascript
POST /api/library/directories/:id/scan
{
  "strategy": "hybrid",
  "priority": "normal"
}

// WebSocket Progress Updates:
{
  "event": "library:directory:scan:progress",
  "data": {
    "directoryId": 1,
    "directoryName": "Main Library",
    "progress": 0.65,
    "filesScanned": 500,
    "tracksAdded": 23,
    "stage": "initial_scan"
  }
}
```

#### Subdirectory Handling

The system uses a **Flat Storage with Path Extraction** approach:

- Store full file paths for flexible operations
- Extract relative paths for directory browsing
- Support any directory structure organization
- Efficient directory tree queries

```sql
-- Example queries for subdirectory operations
-- Get all tracks in a subdirectory
SELECT * FROM tracks
WHERE relative_path LIKE 'pop/%'
AND library_directory_id = 1;

-- Get directory tree for browsing
SELECT DISTINCT
    substr(relative_path, 1, instr(relative_path, '/') - 1) as genre
FROM tracks
WHERE library_directory_id = 1;
```

#### Missing Media Management

**Automatic Detection:**

- File watcher detects directory disconnection
- Mark all tracks in directory as `is_missing = 1`
- Set `missing_since` timestamp
- Update library directory `is_available = false`
- Notify frontend via WebSocket

**Cleanup Options:**

```javascript
POST /api/library/directories/:id/cleanup
{
  "options": {
    "remove_missing_older_than_days": 30,
    "keep_playlists_intact": true,
    "backup_metadata": true
  }
}
```

---

### 3. Duplicate Detection & Resolution

**Role:** Identify and manage duplicate tracks using audio fingerprinting

#### Duplicate Detection Workflow

```javascript
1. Track imported into database
       ↓
2. Calculate audio file hash
       ↓
3. Check if hash exists in duplicate_groups
       ↓
4. If found: assign to existing duplicate group
       ↓
5. If new: create new duplicate group
       ↓
6. Notify user of duplicates found
```

#### File Hash Calculation

```javascript
// Audio fingerprinting service
async function calculateAudioHash(filePath) {
  const audioBuffer = await readFileAsBuffer(filePath);
  const hash = crypto.createHash("sha256");

  // Use audio data for hash, not file contents
  const audioData = extractAudioData(audioBuffer);
  hash.update(audioData);

  return hash.digest("hex");
}
```

#### Duplicate Management API

```javascript
// List all duplicate groups
GET /api/duplicates

// Response:
{
  "duplicates": [
    {
      "groupId": 1,
      "fileHash": "abc123...",
      "canonicalTrackId": 123,
      "tracks": [
        { "id": 123, "path": "/music/main/track.mp3", "quality": "high" },
        { "id": 456, "path": "/music/backup/track.mp3", "quality": "low" }
      ],
      "totalDuplicates": 2
    }
  ]
}

// Resolve duplicates
POST /api/duplicates/:id/resolve
{
  "action": "merge",
  "canonicalTrackId": 123,
  "keepMetadataFrom": 456,
  "deleteOthers": false
}
```

---

### 4. Analysis Coordination (Python Server Integration)

**Role:** Bridge between file system and Python analysis server

#### Analysis Workflow

```javascript
1. New track added to DB
       ↓
2. Node.js queues track for analysis
       ↓
3. Send file path to Python server
       ↓
4. Python analyzes (BPM, key, features, stems)
       ↓
5. Python sends progressive updates
       ↓
6. Node.js updates DB with results
       ↓
7. Notify frontend via WebSocket
```

#### API Endpoints

**Request Analysis:**

```javascript
POST /api/analysis/request
{
  "trackId": 123,
  "analysisTypes": ["basic", "beats", "stems"],
  "priority": "normal"
}

// Response:
{
  "jobId": "abc-123-def",
  "trackId": 123,
  "status": "queued",
  "estimatedTime": 60  // seconds
}
```

**Query Analysis Status:**

```javascript
GET /api/analysis/status/:jobId

// Response:
{
  "jobId": "abc-123-def",
  "trackId": 123,
  "status": "processing",
  "progress": 0.65,
  "stage": "beats",
  "partialResults": {
    "bpm": 128.5,
    "key": 7,
    "mode": 1
  }
}
```

**Receive Analysis Results (Callback from Python):**

```javascript
POST /api/analysis/callback
{
  "jobId": "abc-123-def",
  "trackId": 123,
  "stage": "basic",
  "results": {
    "bpm": 128.5,
    "musicalKey": 7,
    "mode": 1,
    "timeSignature": 4,
    "danceability": 0.82,
    "energy": 0.75,
    "loudness": -5.3,
    "valence": 0.68,
    "acousticness": 0.12,
    "instrumentalness": 0.05,
    "spectralCentroid": 1850.3,
    "spectralRolloff": 4200.1,
    "spectralBandwidth": 2100.5,
    "zeroCrossingRate": 0.08
  }
}
```

**Progressive Updates:** The Python server sends updates as analysis progresses:

1. **Basic** (~5-10s): BPM, key, mode, audio features
2. **Beats** (~20-30s): Beat grid, downbeats
3. **Stems** (~60-90s): Separated audio stems (vocals, drums, bass, other)

---

### 5. Audio Engine Communication (C++ IPC)

**Role:** Provide track file paths and metadata to C++ audio engine

#### Communication Methods

**Option A: HTTP REST (Simple)**

```javascript
// C++ requests track info when user loads it
GET /api/tracks/:id/file

// Response:
{
  "trackId": 123,
  "filePath": "/home/user/Music/track.mp3",
  "duration": 240.5,
  "bpm": 128.5,
  "key": 7,
  "mode": 1
}
```

**Option B: Unix Socket (Lower Latency)**

```javascript
// Node.js listens on Unix socket
// C++ sends track load request
{
  "command": "getTrackPath",
  "trackId": 123
}

// Node.js responds
{
  "trackId": 123,
  "filePath": "/home/user/Music/track.mp3",
  "metadata": { /* ... */ }
}
```

**Option C: Shared State (Best for Frequent Access)**

- Node.js writes track list to shared JSON file
- C++ reads from file when needed
- Node.js updates file when DB changes

---

### 6. REST API (Primary Frontend Interface)

#### Complete API Specification

**Tracks**

```javascript
GET    /api/tracks              - List all tracks (with pagination, filtering)
                                  Query params: artist, genre, bpm_min, bpm_max, key,
                                  library_id, is_missing, search, page, limit
GET    /api/tracks/search       - Search tracks by query parameter q
GET    /api/tracks/stats        - Get track statistics (total, by genre, by key, etc.)
GET    /api/tracks/:id          - Get single track by ID
GET    /api/tracks/:id/waveform - Get all waveforms for a track (zoom levels 0-2)
                                  Query param: zoom (optional, 0-2)
                                  - Without zoom: returns all waveform levels
                                  - With zoom: returns specific zoom level
                                  Waveforms include 6 frequency bands:
                                  low/mid/high_freq_amplitude and intensity
                                  Uses hash-based deduplication for storage efficiency
GET    /api/tracks/:id/verify   - Verify track file exists and is accessible
POST   /api/tracks              - Add new track manually (validates file exists)
PUT    /api/tracks/:id          - Update track metadata
DELETE /api/tracks/:id          - Delete track from database (not disk)
POST   /api/tracks/:id/mark-missing - Mark track as missing
POST   /api/tracks/:id/mark-found   - Mark track as found (when media reconnects)
POST   /api/tracks/:id/move     - Move track file to new location
                                  Body: { newPath, library_directory_id }
POST   /api/tracks/:id/rename   - Rename track file
                                  Body: { newName }
DELETE /api/tracks/:id/file     - Delete track file from disk (requires confirmation)
                                  Body: { confirm: true }
```

**Playlists** *(Not yet implemented)*

```javascript
GET    /api/playlists           - List all playlists
GET    /api/playlists/:id       - Get playlist with tracks
POST   /api/playlists           - Create playlist
PUT    /api/playlists/:id       - Update playlist
DELETE /api/playlists/:id       - Delete playlist
POST   /api/playlists/:id/tracks        - Add tracks
DELETE /api/playlists/:id/tracks/:trackId - Remove track
PUT    /api/playlists/:id/tracks/reorder - Reorder tracks
```

**Library Directories**

```javascript
GET    /api/library/directories           - List all library directories
                                            Query params: is_active, is_available
GET    /api/library/directories/:id       - Get single library directory by ID
POST   /api/library/directories           - Add new library directory
                                            Body: { path, name, settings }
PUT    /api/library/directories/:id       - Update directory settings
DELETE /api/library/directories/:id       - Remove directory
                                            Query param: delete_tracks (boolean)
POST   /api/library/directories/:id/check-availability
                                          - Check if directory path is available
POST   /api/library/directories/check-all-availability
                                          - Check availability for all directories
GET    /api/library/directories/:id/browse
                                          - Browse subdirectories and tracks
                                            Query param: path (relative path within library)
POST   /api/library/directories/:id/cleanup
                                          - Cleanup missing tracks
                                            Body: { remove_missing_older_than_days,
                                                   keep_playlists_intact, backup_metadata }
POST   /api/library/directories/:id/restore
                                          - Restore tracks when media reconnects
GET    /api/library/directories/:id/missing
                                          - Get missing tracks for a library directory
GET    /api/library/directories/:id/missing/stats
                                          - Get missing track statistics
```

**Scanning**

```javascript
POST   /api/scan/library/:id    - Start scanning a library directory
                                  Body: { strategy: 'hybrid'|'fast'|'full',
                                         priority: 'low'|'normal'|'high' }
                                  Returns: 202 Accepted (async operation)
GET    /api/scan/library/:id/status - Get scan status for a library directory
GET    /api/scan/active         - Get all active scans
DELETE /api/scan/library/:id    - Cancel an active scan
```

**File Watching**

```javascript
GET    /api/watcher/status      - Get status of all active file watchers
POST   /api/watcher/start/:id   - Start watching a specific library directory
POST   /api/watcher/stop/:id    - Stop watching a specific library directory
POST   /api/watcher/start-all   - Start watching all active library directories
POST   /api/watcher/stop-all    - Stop watching all library directories
```

**Duplicate Management**

```javascript
GET    /api/duplicates          - List all duplicate groups (with pagination)
                                  Query params: page, limit
GET    /api/duplicates/stats    - Get duplicate statistics
GET    /api/duplicates/:id      - Get duplicate group with all tracks
POST   /api/duplicates/:id/resolve
                                - Resolve duplicates by selecting canonical track
                                  Body: { canonicalTrackId, deleteFiles,
                                         keepMetadata, updatePlaylists }
POST   /api/duplicates/scan     - Scan entire library for duplicates
```

**Analysis Server**

```javascript
# Server Management
GET    /api/analysis/status     - Get analysis server status
POST   /api/analysis/start      - Start the analysis server
POST   /api/analysis/stop       - Stop the analysis server
POST   /api/analysis/restart    - Restart the analysis server
GET    /api/analysis/health     - Check if analysis server is healthy

# Analysis Requests
POST   /api/analysis/request    - Request analysis for a track
                                  Body: { trackId, analysisTypes: [...], priority }
                                  Analysis types: basic_features, characteristics,
                                  genre, stems, segments, transitions
GET    /api/analysis/jobs/:jobId - Get status of an analysis job
DELETE /api/analysis/jobs/:jobId - Cancel an analysis job
GET    /api/analysis/queue      - Get analysis queue status

# Callback (from Python server)
POST   /api/analysis/callback   - Receive results from Python (internal)
                                  Body: { jobId, trackId, stage, results, progress }
                                  Stages: basic_features, characteristics, genre, stems,
                                  segments, transitions, job_completed, job_failed, error

# Waveforms (NOTE: Waveform retrieval is now under /api/tracks/:id/waveform)
# The Python server still generates waveforms and sends them via callback,
# but clients should use the tracks endpoint to retrieve them.
```

**Settings**

```javascript
GET    /api/settings            - Get all settings
                                  Query param: category (filter by category)
GET    /api/settings/categories - Get all setting categories
GET    /api/settings/:key       - Get single setting by key
PUT    /api/settings/:key       - Update a single setting
                                  Body: { value, type, category, description }
                                  Types: string, int, float, bool, json
PUT    /api/settings            - Update multiple settings at once
                                  Body: { settings: [...] }
DELETE /api/settings/:key       - Delete a setting
```

---

### 7. WebSocket Server (Real-Time Updates)

**Purpose:** Push real-time updates to frontend when data changes

#### Events to Broadcast

**Track Events:**

```javascript
// Track added
{
  "event": "track:added",
  "data": {
    "trackId": 123,
    "track": { /* full track object */ }
  }
}

// Track updated (analysis complete, user edits, etc.)
{
  "event": "track:updated",
  "data": {
    "trackId": 123,
    "changes": {
      "bpm": 128.5,
      "musicalKey": 7,
      "dateAnalyzed": "2025-10-09T14:30:00Z"
    }
  }
}

// Track deleted
{
  "event": "track:deleted",
  "data": {
    "trackId": 123
  }
}

// Track moved
{
  "event": "track:moved",
  "data": {
    "trackId": 123,
    "oldPath": "/music/old/track.mp3",
    "newPath": "/music/new/track.mp3"
  }
}

// Track missing (disconnected media)
{
  "event": "track:missing",
  "data": {
    "trackId": 456,
    "path": "/media/external/track.mp3",
    "directoryId": 2
  }
}
```

**Analysis Events:**

```javascript
// Analysis started
{
  "event": "analysis:started",
  "data": {
    "jobId": "abc-123",
    "trackId": 123
  }
}

// Analysis progress
{
  "event": "analysis:progress",
  "data": {
    "jobId": "abc-123",
    "trackId": 123,
    "progress": 0.45,
    "stage": "beats"
  }
}

// Analysis complete
{
  "event": "analysis:complete",
  "data": {
    "jobId": "abc-123",
    "trackId": 123,
    "results": { /* analysis results */ }
  }
}
```

**Library Events:**

```javascript
// Directory added
{
  "event": "library:directory:added",
  "data": { "directory": { /* directory info */ } }
}

// Directory scan started
{
  "event": "library:directory:scan:started",
  "data": {
    "directoryId": 1,
    "directoryName": "Main Library"
  }
}

// Directory scan progress
{
  "event": "library:directory:scan:progress",
  "data": {
    "directoryId": 1,
    "directoryName": "Main Library",
    "progress": 0.65,
    "filesScanned": 500,
    "tracksAdded": 23,
    "stage": "initial_scan"
  }
}

// Directory scan complete
{
  "event": "library:directory:scan:complete",
  "data": {
    "directoryId": 1,
    "filesScanned": 1000,
    "tracksAdded": 45,
    "duration": "12.5s"
  }
}

// Removable media connected
{
  "event": "library:media:connected",
  "data": {
    "path": "/media/external/EDM",
    "suggestedName": "EDM Collection"
  }
}

// Removable media disconnected
{
  "event": "library:media:disconnected",
  "data": {
    "directoryId": 2,
    "directoryName": "EDM Collection",
    "tracksAffected": 150
  }
}
```

**Duplicate Events:**

```javascript
// Duplicate detected
{
  "event": "duplicate:detected",
  "data": {
    "groupId": 1,
    "trackIds": [123, 456],
    "fileHash": "abc123..."
  }
}

// Duplicate resolved
{
  "event": "duplicate:resolved",
  "data": {
    "groupId": 1,
    "canonicalTrackId": 123,
    "action": "merged"
  }
}
```

---

### 8. Configuration Management

**Settings Storage:**

- Stored in `settings` table in SQLite
- Typed values (string, int, float, bool, json)
- Categories for organization

**Default Settings:**

```javascript
{
  // Library Management
  "auto_analyze": true,
  "recursive_scan": true,
  "watch_directories": true,
  "max_concurrent_scans": 2,
  "scan_priority_order": true,
  "auto_detect_removable_drives": true,

  // Analysis
  "analysis_server_url": "http://localhost:5000",
  "auto_analyze_new_tracks": true,
  "analysis_priority": "normal",
  "enable_stem_separation": false,
  "max_concurrent_analysis": 2,

  // Duplicate Detection
  "duplicate_detection_enabled": true,
  "auto_cleanup_duplicates": false,
  "duplicate_hash_algorithm": "sha256",

  // File Operations
  "confirm_file_deletes": true,
  "log_file_operations": true,
  "file_operation_timeout": 30000,

  // Missing Media
  "missing_tracks_cleanup_days": 30,
  "auto_restore_missing_tracks": true,

  // Audio Engine
  "audio_engine_url": "http://localhost:8080",
  "master_volume": 0.8,
  "buffer_size": 512,

  // Performance
  "database_path": "~/MismoDJ/library.db",
  "waveform_cache_size": 100,

  // UI
  "ui_theme": "dark",
  "show_waveforms": true
}
```

---

## Technology Stack Recommendations

### Required NPM Packages

**Database:**

- `better-sqlite3` - Fast synchronous SQLite binding
  - OR `sqlite3` - Asynchronous SQLite (slower but non-blocking)

**Web Server:**

- `express` - HTTP REST API framework
- `ws` - Fast WebSocket server
  - OR `socket.io` - Higher-level WebSocket with fallbacks

**File Operations:**

- `chokidar` - File system watcher (cross-platform)
- `glob` or `fast-glob` - File pattern matching
- `fs-extra` - Enhanced file system utilities

**Metadata Extraction:**

- `music-metadata` - Best overall audio metadata parser
  - OR `jsmediatags` - Lighter, MP3-focused

**HTTP Client (for Python server):**

- `axios` - Simple HTTP client
  - OR `node-fetch` - Fetch API for Node.js

**Audio Hashing:**

- `crypto` (built-in) - SHA-256 hashing
- `node-ffmpeg` or `music-metadata` - Audio data extraction

**Utilities:**

- `dotenv` - Environment variable management
- `winston` - Logging framework
- `joi` - Request validation

**Development:**

- `nodemon` - Auto-restart on changes
- `jest` - Testing framework

---

## Project Structure

```javascript
nodejs-backend/
├── src/
│   ├── server.js              # Main entry point
│   ├── config/
│   │   ├── database.js        # SQLite connection
│   │   └── settings.js        # App settings
│   ├── routes/
│   │   ├── tracks.js          # Track API routes
│   │   ├── playlists.js       # Playlist API routes
│   │   ├── library.js         # Library management routes
│   │   ├── libraryDirectories.js # Library directory routes
│   │   ├── duplicates.js      # Duplicate management routes
│   │   ├── analysis.js        # Analysis coordination routes
│   │   └── settings.js        # Settings API routes
│   ├── services/
│   │   ├── database.js        # Database operations
│   │   ├── libraryManager.js  # Multi-directory management
│   │   ├── fileScanner.js     # Directory scanning
│   │   ├── fileWatcher.js     # File system monitoring
│   │   ├── metadataExtractor.js  # Audio metadata extraction
│   │   ├── fileHashService.js # Audio fingerprinting
│   │   ├── duplicateDetector.js # Duplicate detection logic
│   │   ├── fileOperations.js  # File move/rename/delete
│   │   ├── missingMediaHandler.js # Disconnected media management
│   │   ├── directoryBrowser.js # Directory browsing service
│   │   ├── analysisQueue.js   # Analysis job queue
│   │   └── pythonClient.js    # Python server communication
│   ├── websocket/
│   │   └── server.js          # WebSocket event broadcaster
│   └── utils/
│       ├── logger.js          # Logging utilities
│       ├── validators.js      # Request validation
│       └── fileUtils.js       # File operation utilities
├── migrations/
│   ├── 001_initial_schema.sql # Original schema
│   └── 002_multi_directory_support.sql # Multi-directory updates
├── tests/
│   ├── tracks.test.js
│   ├── playlists.test.js
│   ├── libraryDirectories.test.js
│   ├── duplicates.test.js
│   └── fileScanner.test.js
├── package.json
├── .env.example
└── README.md
```

---

## API Response Formats

### Success Response

```javascript
{
  "success": true,
  "data": {
    // Response data
  },
  "meta": {
    "timestamp": "2025-10-09T14:30:00Z",
    "requestId": "abc-123-def"
  }
}
```

### Error Response

```javascript
{
  "success": false,
  "error": {
    "code": "TRACK_NOT_FOUND",
    "message": "Track with ID 999 not found",
    "details": null
  },
  "meta": {
    "timestamp": "2025-10-09T14:30:00Z",
    "requestId": "abc-123-def"
  }
}
```

### Paginated Response

```javascript
{
  "success": true,
  "data": [
    // Array of items
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 1234,
    "totalPages": 25,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## Performance Considerations

### Database Optimization

- Use prepared statements for all queries
- Create indices on frequently searched fields
- Use transactions for bulk operations
- Vacuum database periodically
- Utilize database views for complex queries

### Multi-Directory Scanning

- Concurrent scanning with configurable limits
- Priority-based scanning order
- Throttled I/O operations to prevent system overload
- Background processing for large libraries
- Resume interrupted scans

### Duplicate Detection

- Efficient hash calculation using audio data
- Index optimization for hash lookups
- Lazy duplicate group loading
- Batch duplicate resolution
- Progressive duplicate detection during import

### File Operations

- Queued file operations to prevent conflicts
- Transaction-based database updates
- Rollback on file operation failures
- Background processing for large operations
- Operation logging for audit trails

### Analysis Queue

- Prioritize user-requested analysis
- Batch analysis requests
- Limit concurrent Python server requests
- Store partial results to resume interrupted analysis
- Progressive updates via WebSocket

### WebSocket Efficiency

- Only broadcast to subscribed clients
- Throttle high-frequency updates
- Use message batching for bulk operations
- Event filtering by client subscriptions

---

## Security Considerations

### File System Access

- Validate all file paths to prevent directory traversal
- Restrict access to configured music directories only
- Sanitize file names before database insertion
- Check file permissions before operations
- Handle symlink security

### File Operations

- Confirm destructive operations (delete)
- Log all file operations for audit
- Validate destination paths for moves
- Check disk space before operations
- Rollback on failures

### API Security

- Rate limiting on all endpoints
- Input validation on all requests
- CORS configuration for web frontend
- Optional: JWT authentication for multi-user setups
- Request size limits

### Database

- Use parameterized queries (prevent SQL injection)
- Regular backups
- Encryption at rest (optional)
- Access control on database file

### Audio Hash Security

- Use cryptographic hash functions (SHA-256)
- Secure hash storage and comparison
- Prevent hash collision attacks
- Hash salt for additional security (optional)

---

## Database Schema Reference

See `schema.sql` for the complete updated database schema including:

- Multi-directory library support
- Duplicate detection tables
- File operations logging
- Enhanced indexing and triggers
- Database views for common queries

---

## Development Phases

### Phase 1: Core Infrastructure (Week 1)

- Set up Express server
- SQLite database connection with updated schema
- Basic CRUD for tracks (enhanced)
- Basic CRUD for playlists
- Settings API (updated)
- Library directory management API

### Phase 2: Library Management (Week 2)

- Multi-directory file scanner implementation
- Metadata extraction with file hashing
- Directory watcher with removable media support
- Import workflow with duplicate detection
- Subdirectory browsing service

### Phase 3: File Operations & Duplicates (Week 3)

- File operations service (move, rename, delete)
- Duplicate detection and resolution tools
- Missing media handling
- File operations queue and logging
- Directory cleanup utilities

### Phase 4: Analysis Integration (Week 4)

- Python server client
- Analysis queue with hybrid scanning
- Callback endpoint
- Progressive update handling
- WebSocket integration for analysis progress

### Phase 5: Real-Time Features (Week 5)

- WebSocket server with all new events
- Event broadcasting for multi-directory operations
- Frontend integration testing
- Real-time duplicate detection notifications
- Missing media status updates

### Phase 6: Polish & Testing (Week 6)

- Error handling for all new features
- Input validation for new APIs
- Performance optimization for multi-directory scanning
- Unit tests for all new services
- Integration tests for file operations
- Load testing for large libraries

---

## Next Steps

1. **Create separate Node.js repository** (if not already done)
2. **Initialize npm project** with required dependencies
3. **Implement database schema migration system** for v2 updates
4. **Build REST API endpoints** for library directories and file operations
5. **Implement core services**: library manager, file hash service, duplicate detector
6. **Test integration** with C++ audio engine and Python analysis server
7. **Build frontend components** for multi-directory management
8. **Performance testing** with large music libraries
9. **Security audit** of file operations and path handling
10. **Documentation** for new APIs and services

---

## Benefits of Updated Design

1. **Flexibility**: Users can organize music across multiple locations
2. **Scalability**: Handles large libraries with removable media
3. **Data Integrity**: Duplicate detection prevents library bloat
4. **User Control**: File operations with proper safety measures
5. **Performance**: Hybrid scanning balances speed and system impact
6. **Robustness**: Handles disconnected media gracefully
7. **Maintainability**: Clean separation of concerns in services
8. **Professional**: Suitable for DJs with complex, multi-location music collections

This updated design provides a production-ready, professional-grade music library management system that can handle the complex needs of modern DJs while maintaining excellent performance and user experience. EOF
