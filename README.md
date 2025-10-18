# Mismo DJ Backend Server

Node.js backend server for Mismo DJ - A professional DJ application with multi-directory music library management, duplicate detection, file operations, and music analysis integration.

## Features

- **Multi-Directory Library Management**: Support for multiple library directories with individual configurations
- **Duplicate Detection**: Automatic detection and management of duplicate audio files using xxHash
- **Music Analysis Integration**: Integration with Python analysis server for BPM, key detection, and audio features
- **File Operations**: Safe file move, rename, and delete operations with logging
- **Real-time Updates**: WebSocket support for real-time library updates
- **Playlist Management**: Create and manage playlists with smart playlist support
- **Removable Media Support**: Track and handle disconnected/reconnected external drives

## Tech Stack

- **Runtime**: Node.js with ES Modules
- **Database**: SQLite (better-sqlite3)
- **Web Framework**: Express.js
- **WebSocket**: ws library
- **File Watching**: chokidar
- **Music Metadata**: music-metadata
- **Hash Algorithm**: xxhash-addon
- **Logging**: Winston

## Project Structure

```
mismo.dj_app_server/
├── src/
│   ├── config/
│   │   ├── database.js       # Database connection and initialization
│   │   └── settings.js       # Application configuration
│   ├── routes/               # API route handlers
│   ├── services/             # Business logic services
│   ├── websocket/            # WebSocket server
│   ├── utils/
│   │   ├── logger.js         # Logging utilities
│   │   └── validators.js     # Request validation
│   └── server.js             # Main application entry point
├── docs/
│   ├── schema.sql            # Database schema
│   ├── plan.md               # Development plan
│   └── nodejs_backend_design.md
├── migrations/               # Database migrations
├── tests/                    # Test files
├── data/                     # Database files (gitignored)
└── logs/                     # Application logs (gitignored)
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/DrorT/mismo.dj_node_server.git
cd mismo.dj_app_server
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

Edit the `.env` file to configure the application. Key settings include:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_PATH=./data/library.db

# Python Analysis Server
PYTHON_SERVER_URL=http://127.0.0.1:8000
PYTHON_SERVER_PORT=8000
PYTHON_SERVER_AUTO_START=true
PYTHON_SERVER_STARTUP_TIMEOUT_MS=60000
PYTHON_SERVER_PYTHON_PATH=/path/to/mismo_server/bin/python
PYTHON_SERVER_APP_DIR=/path/to/mismo_server_project
MAX_CONCURRENT_ANALYSIS=2

# Library Settings
MAX_CONCURRENT_SCANS=2
AUTO_ANALYZE_NEW_TRACKS=true

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

See `.env.example` for all available configuration options.

### Python Analysis Server Setup

The Node.js server automatically manages the Python analysis server lifecycle. Configure the following variables in `.env`:

- `PYTHON_SERVER_PYTHON_PATH`: Path to Python virtual environment binary
- `PYTHON_SERVER_APP_DIR`: Path to Python server source directory (mismo_server_project)
- `PYTHON_SERVER_STARTUP_TIMEOUT_MS`: Startup timeout in milliseconds (recommended: 60000)

**📖 See [Analysis Server Integration Guide](docs/analysis-server-integration.md) for detailed setup and troubleshooting.**

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Run Tests
```bash
npm test
```

### Code Linting
```bash
npm run lint
npm run lint:fix
```

## API Endpoints

### Health Check
```
GET /health
```

Returns server health status.

### Settings API ✅
```
GET    /api/settings              # List all settings
GET    /api/settings/:key         # Get single setting
PUT    /api/settings/:key         # Update setting
PUT    /api/settings              # Bulk update settings
DELETE /api/settings/:key         # Delete setting
```

### Library Directories API ✅
```
GET    /api/library/directories                    # List all directories
GET    /api/library/directories/:id                # Get directory by ID
POST   /api/library/directories                    # Add new directory
PUT    /api/library/directories/:id                # Update directory
DELETE /api/library/directories/:id                # Delete directory
POST   /api/library/directories/:id/check-availability  # Check if path exists
```

### Scanner API ✅
```
POST   /api/scan/library/:id                       # Start scan
GET    /api/scan/library/:id/status                # Get scan status
GET    /api/scan/active                            # List active scans
DELETE /api/scan/library/:id                       # Cancel scan
```

### Tracks API ✅
```
GET    /api/tracks                             # List all tracks (paginated, filtered)
GET    /api/tracks/search?q=query              # Search tracks
GET    /api/tracks/stats                       # Get track statistics
GET    /api/tracks/:id                         # Get single track
GET    /api/tracks/:id/waveform?zoom={0-2}     # Get waveform data (optional zoom level)
GET    /api/tracks/:id/verify                  # Verify track file exists
POST   /api/tracks                             # Add new track manually
PUT    /api/tracks/:id                         # Update track metadata
DELETE /api/tracks/:id                         # Delete track from database
POST   /api/tracks/:id/mark-missing            # Mark track as missing
POST   /api/tracks/:id/mark-found              # Mark track as found
POST   /api/tracks/:id/move                    # Move track file
POST   /api/tracks/:id/rename                  # Rename track file
DELETE /api/tracks/:id/file                    # Delete track file from disk
```

**Query Parameters for GET /api/tracks:**
- `page`, `limit` - Pagination
- `sort` - Sort field (date_added, artist, title, bpm, play_count)
- `order` - Sort order (ASC, DESC)
- `artist`, `genre` - Filter by artist or genre
- `bpm_min`, `bpm_max` - Filter by BPM range
- `key` - Filter by musical key (0-11)
- `library_id` - Filter by library directory
- `is_missing` - Filter missing tracks (true/false)
- `search` - Full-text search

**Waveform Endpoint:**
- `GET /api/tracks/:id/waveform?zoom=1` - Returns waveform at specific zoom level (0-2)
- `GET /api/tracks/:id/waveform` - Returns all waveform zoom levels
- Waveforms include 6 frequency bands (low/mid/high amplitude + intensity)
- Uses hash-based deduplication (waveforms shared across duplicate tracks)

### Duplicates API ✅
```
GET    /api/duplicates                    # List all duplicate groups
GET    /api/duplicates/:id                # Get duplicate group with tracks
POST   /api/duplicates/:id/resolve        # Resolve duplicates
POST   /api/duplicates/scan               # Scan entire library for duplicates
```

### Analysis Server API ✅
```
GET    /api/analysis/status               # Get analysis server status
GET    /api/analysis/health               # Check if server is healthy
POST   /api/analysis/start                # Manually start analysis server
POST   /api/analysis/stop                 # Stop analysis server
POST   /api/analysis/restart              # Restart analysis server
```

**📖 See [Analysis Server Integration Guide](docs/analysis-server-integration.md) for detailed information.**

### Coming Soon
- Playlist management (`/api/playlists`)
- WebSocket for real-time updates
- Analysis job management (`/api/analysis/jobs`)

## Testing

See [TESTING.md](TESTING.md) for detailed testing instructions.

**Quick Test:**
1. Start the server: `npm start`
2. Open `test-phase2.html` in your browser
3. Test all Phase 2 features interactively

Full API documentation will be available in [docs/API.md](docs/API.md).

## Database Schema

The application uses SQLite with the following main tables:

- `library_directories` - Library directory configurations
- `tracks` - Music track metadata and analysis results
- `playlists` - Playlist definitions
- `playlist_tracks` - Playlist track associations
- `duplicate_groups` - Duplicate file groupings
- `waveforms` - Waveform data for visualization
- `file_operations` - File operation history
- `settings` - Application settings

See [docs/schema.sql](docs/schema.sql) for the complete schema.

## Development

### Phase 1 Status ✅

- [x] Project initialization
- [x] Database setup and schema
- [x] Core Express server
- [x] Logging system
- [x] Configuration management
- [x] Request validation

### Phase 2 Status ✅

- [x] Settings API (complete CRUD)
- [x] Library directory service & API
- [x] Metadata extraction service
- [x] Audio file hash service (xxHash64)
- [x] Track service (database operations)
- [x] File scanner with 3 strategies (fast/full/hybrid)
- [x] Scan progress tracking
- [x] Interactive HTML test page

### Next Steps (Phase 3)

- [ ] WebSocket server for real-time updates
- [ ] File watcher service (chokidar)
- [ ] Track API routes
- [ ] Duplicate detection engine
- [ ] Python analysis server integration
- [ ] Playlist management

See [docs/plan.md](docs/plan.md) for the complete development plan.

## Contributing

Please read the development plan and design documents before contributing.

## License

ISC

## Contact

For issues and feature requests, please use the GitHub issue tracker.
