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

  # File hashing (xxHash for fast duplicate detection)
  npm install xxhash-addon

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
  - Quick hash for fast screening ✅
  - Batch processing support ✅
  - **NOTE**: Currently hashing full file (audio-only hashing is TODO for better duplicate detection)

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

- [ ] Create file watcher service (`src/services/fileWatcher.js`)
  - Use `chokidar` to watch library directories
  - Detect new files → auto-import
  - Detect modified files → re-analyze
  - Detect deleted files → mark as deleted or remove
  - Detect directory availability changes
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

- [ ] Implement track service (`src/services/trackService.js`)
  - CRUD operations
  - Pagination support
  - Advanced filtering (artist, genre, BPM range, key, etc.)
  - Search functionality (full-text search)
  - Sorting options

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

- [ ] Create duplicate detector service (`src/services/duplicateDetector.js`)
  - Check if file hash exists in `duplicate_groups`
  - If exists: assign track to existing group
  - If new and first occurrence: create new group
  - Auto-detect duplicates during import
  - Batch duplicate detection for existing library

- [ ] Implement duplicate management routes (`src/routes/duplicates.js`)

  ```javascript
  GET    /api/duplicates                   - List all duplicate groups
  GET    /api/duplicates/:id              - Get duplicate group with tracks
  POST   /api/duplicates/:id/resolve      - Resolve duplicates
  POST   /api/duplicates/scan             - Scan entire library for duplicates
  ```

- [ ] Create duplicate resolution logic
  - Select canonical track (best quality, preferred location)
  - Merge metadata from duplicates
  - Update playlists to reference canonical track
  - Optionally delete duplicate files
  - Log resolution actions

### Day 10: File Operations

- [ ] Create file operations service (`src/services/fileOperations.js`)
  - **Move track**: Move file to new location
    - Validate destination path
    - Check disk space
    - Execute file move
    - Update database (path, library_directory_id, relative_path)
    - Log operation
    - Rollback on failure

  - **Rename track**: Rename file
    - Validate new filename
    - Execute file rename
    - Update database
    - Log operation

  - **Delete track**: Delete file from disk
    - Require confirmation flag
    - Execute file delete
    - Remove from database or mark as deleted
    - Remove from playlists
    - Log operation

- [ ] Add file operation routes

  ```javascript
  POST   /api/tracks/:id/move
  POST   /api/tracks/:id/rename
  DELETE /api/tracks/:id/file
  ```

- [ ] Implement file operation queue
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

## Phase 4: Playlist Management (Days 12-13)

### Day 12: Playlist CRUD

- [ ] Create playlists route (`src/routes/playlists.js`)

  ```javascript
  GET    /api/playlists                      - List all playlists
  GET    /api/playlists/:id                  - Get playlist with tracks
  POST   /api/playlists                      - Create playlist
  PUT    /api/playlists/:id                  - Update playlist
  DELETE /api/playlists/:id                  - Delete playlist
  ```

- [ ] Implement playlist service (`src/services/playlistService.js`)
  - CRUD operations
  - Load playlist with tracks (JOIN query)
  - Handle smart playlists (evaluate criteria)
  - Playlist statistics (duration, track count)

### Day 13: Playlist Track Management

- [ ] Add playlist track routes

  ```javascript
  POST   /api/playlists/:id/tracks           - Add tracks to playlist
  DELETE /api/playlists/:id/tracks/:trackId  - Remove track from playlist
  PUT    /api/playlists/:id/tracks/reorder   - Reorder tracks
  ```

- [ ] Implement track management logic
  - Add multiple tracks at once
  - Maintain position ordering
  - Reorder tracks (update positions)
  - Remove tracks (resequence positions)
  - Handle deleted tracks gracefully

- [ ] Implement smart playlist evaluation
  - Parse JSON criteria
  - Build SQL query from criteria
  - Auto-update when criteria changes
  - Refresh on track changes

---

## Phase 5: Analysis Integration (Days 14-16)

### Day 14: Python Server Communication

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

### Day 15: Analysis Endpoints

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
    - Generate job ID
    - Send to Python server
    - Return job ID to client

  - **Receive callback**:
    - Validate job ID
    - Parse analysis results
    - Update track in database
    - Send WebSocket update
    - Mark job as complete

### Day 16: Progressive Analysis Updates

- [ ] Handle multi-stage analysis
  - **Stage 1: Basic** (~5-10s)
    - BPM, key, mode, time signature
    - Audio features (energy, danceability, etc.)
    - Update database immediately

  - **Stage 2: Beats** (~20-30s)
    - Beat grid, downbeats
    - Store as BLOB

  - **Stage 3: Stems** (~60-90s)
    - Separated audio stems
    - Save files to disk
    - Store paths in database

  - **Waveform Data** (received from Python)
    - Multi-zoom level waveform data
    - Store in database as BLOB
    - Serve to frontend for visualization

- [ ] Send WebSocket updates for each stage
  ```javascript
  {
    "event": "analysis:progress",
    "data": {
      "jobId": "abc-123",
      "trackId": 456,
      "stage": "beats",
      "progress": 0.65,
      "partialResults": { /* ... */ }
    }
  }
  ```

---

## Phase 6: WebSocket Real-Time Updates (Days 17-18)

### Day 17: WebSocket Server Setup

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

### Day 18: Implement All WebSocket Events

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

---

## Phase 7: Audio Engine Integration (Days 19-20)

### Day 19: C++ Communication Interface

- [ ] Decide on communication method
  - **Option A**: HTTP REST (simplest)
  - **Option B**: Unix Socket (lower latency)
  - **Option C**: Shared JSON file (simplest, good for read-heavy)

- [ ] Implement selected method
  - **If REST**: Create endpoint for C++ to query track info
  - **If Unix Socket**: Create socket server and message protocol
  - **If Shared File**: Create file writer that updates on DB changes

- [ ] Create audio engine routes (if using REST)
  ```javascript
  GET /api/tracks/:id/file          - Get track file path and metadata
  GET /api/tracks/:id/waveform      - Get waveform data
  POST /api/tracks/:id/load         - Log track load event
  ```

### Day 20: Waveform Management

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

## Phase 8: Testing & Quality Assurance (Days 21-24)

### Day 21: Unit Tests

- [ ] Set up Jest testing framework
- [ ] Write unit tests for services
  - Database service tests
  - Library directory service tests
  - File scanner tests
  - Duplicate detector tests
  - File operations tests
  - Playlist service tests

### Day 22: Integration Tests

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

### Day 23: Performance Testing

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

### Day 24: Security Audit

- [ ] Security review
  - Path traversal prevention
  - SQL injection prevention (use prepared statements)
  - Input validation on all endpoints
  - Rate limiting
  - CORS configuration
  - File operation safety checks
  - Error message sanitization

---

## Phase 9: Documentation & Polish (Days 25-26)

### Day 25: API Documentation

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

### Day 26: Code Cleanup & README

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

  # C++ Audio Engine
  AUDIO_ENGINE_URL=http://localhost:8080

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

## Phase 10: Deployment & Integration (Days 27-28)

### Day 27: Deployment Preparation

- [ ] Create production configuration
- [ ] Set up database backups
- [ ] Configure logging for production
- [ ] Create systemd service file (Linux) or equivalent
- [ ] Set up monitoring and health checks

### Day 28: Integration Testing

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

- **Phase 1**: Days 1-3 (Setup)
- **Phase 2**: Days 4-7 (Library Management)
- **Phase 3**: Days 8-11 (Tracks & Duplicates)
- **Phase 4**: Days 12-13 (Playlists)
- **Phase 5**: Days 14-16 (Analysis)
- **Phase 6**: Days 17-18 (WebSocket)
- **Phase 7**: Days 19-20 (Audio Engine)
- **Phase 8**: Days 21-24 (Testing)
- **Phase 9**: Days 25-26 (Documentation)
- **Phase 10**: Days 27-28 (Deployment)

**Total: ~28 working days (5-6 weeks)**

---

# Future features

- Allow client to ask for quick analysis of a file - when a file is loaded into a deck
