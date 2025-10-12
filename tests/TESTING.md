# Testing Guide - Phase 2

This guide explains how to test all Phase 2 functionality of the Mismo DJ backend server.

## Prerequisites

1. **Node.js** installed (v18 or higher)
2. **npm** package manager
3. All dependencies installed: `npm install`

## Known Issue: xxhash-addon and ASan

If you encounter the error:
```
ASan runtime does not come first in initial library list
```

This is caused by Address Sanitizer in the Node.js build conflicting with native modules. **Solutions:**

### Option 1: Use a different Node.js build (Recommended)
```bash
# Use nvm to install a standard Node.js build without ASan
nvm install 22
nvm use 22
npm start
```

### Option 2: Run without ASan
```bash
# Explicitly clear LD_PRELOAD
env -u LD_PRELOAD node src/server.js
```

### Option 3: Alternative hash library
If the issue persists, we can replace `xxhash-addon` with a pure JavaScript alternative like `xxhashjs` or use Node's built-in `crypto` module.

## Starting the Server

```bash
# Standard start
npm start

# Development mode with auto-reload
npm run dev

# Start on different port
PORT=3001 npm start
```

The server will start on `http://localhost:3000` by default.

## Testing Methods

### Method 1: Interactive HTML Test Page (Recommended)

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Open the test page:**
   Open `test-phase2.html` in your web browser:
   ```bash
   # On Linux
   xdg-open test-phase2.html

   # On macOS
   open test-phase2.html

   # On Windows
   start test-phase2.html

   # Or serve it with a simple HTTP server
   python3 -m http.server 8080
   # Then visit: http://localhost:8080/test-phase2.html
   ```

3. **Test features:**
   The HTML page provides an interactive interface to test all Phase 2 APIs:
   - Settings management
   - Library directory CRUD operations
   - File scanning with progress monitoring
   - Active scans monitoring
   - Real-time statistics

### Method 2: cURL Commands

#### Health Check
```bash
curl http://localhost:3000/health
```

#### Settings API

**Get all settings:**
```bash
curl http://localhost:3000/api/settings
```

**Get settings by category:**
```bash
curl http://localhost:3000/api/settings?category=library
```

**Get single setting:**
```bash
curl http://localhost:3000/api/settings/max_concurrent_scans
```

**Update setting:**
```bash
curl -X PUT http://localhost:3000/api/settings/max_concurrent_scans \
  -H "Content-Type: application/json" \
  -d '{"value": "3", "type": "int"}'
```

#### Library Directories API

**List all library directories:**
```bash
curl http://localhost:3000/api/library/directories
```

**Add a library directory:**
```bash
curl -X POST http://localhost:3000/api/library/directories \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/path/to/music",
    "name": "My Music",
    "is_active": true,
    "recursive_scan": true
  }'
```

**Get directory by ID:**
```bash
curl http://localhost:3000/api/library/directories/1
```

**Update directory:**
```bash
curl -X PUT http://localhost:3000/api/library/directories/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "is_active": false}'
```

**Delete directory:**
```bash
curl -X DELETE http://localhost:3000/api/library/directories/1
```

**Check directory availability:**
```bash
curl -X POST http://localhost:3000/api/library/directories/1/check-availability
```

#### Scanner API

**Start a scan:**
```bash
curl -X POST http://localhost:3000/api/scan/library/1 \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "hybrid",
    "priority": "normal"
  }'
```

**Check scan status:**
```bash
curl http://localhost:3000/api/scan/library/1/status
```

**Get all active scans:**
```bash
curl http://localhost:3000/api/scan/active
```

**Cancel scan:**
```bash
curl -X DELETE http://localhost:3000/api/scan/library/1
```

### Method 3: Automated Test Script

Create a test script:

```bash
#!/bin/bash
# test-api.sh

API="http://localhost:3000"

echo "=== Testing Health Endpoint ==="
curl -s $API/health | jq

echo -e "\n=== Testing Settings API ==="
curl -s $API/api/settings | jq '.count'

echo -e "\n=== Testing Library Directories ==="
curl -s $API/api/library/directories | jq '.count'

echo -e "\n=== Adding Test Directory ==="
curl -s -X POST $API/api/library/directories \
  -H "Content-Type: application/json" \
  -d '{"path": "./test-music", "name": "Test Library"}' | jq

echo -e "\n=== Listing Directories Again ==="
curl -s $API/api/library/directories | jq '.data[].name'
```

Make it executable and run:
```bash
chmod +x test-api.sh
./test-api.sh
```

## Creating Test Data

### Option 1: Create Empty Test Files

```bash
# Create test directory structure
mkdir -p test-music/artist1/album1
mkdir -p test-music/artist2/album2

# Create dummy MP3 files (empty files for testing)
touch test-music/artist1/album1/song1.mp3
touch test-music/artist1/album1/song2.mp3
touch test-music/artist2/album2/song3.mp3
touch test-music/artist2/album2/song4.flac
```

### Option 2: Use Real Music Files

Copy some actual music files to test proper metadata extraction:

```bash
mkdir -p test-music
cp /path/to/your/music/*.mp3 test-music/
```

### Option 3: Download Test Audio

Download copyright-free music from:
- Archive.org
- Free Music Archive
- Jamendo

## Testing Workflow

1. **Start the server**
   ```bash
   npm start
   ```

2. **Create test data**
   ```bash
   mkdir -p test-music
   touch test-music/test{1..5}.mp3
   ```

3. **Add library directory**
   ```bash
   curl -X POST http://localhost:3000/api/library/directories \
     -H "Content-Type: application/json" \
     -d '{"path": "./test-music", "name": "Test Library"}'
   ```

4. **Start a scan** (note the ID from step 3)
   ```bash
   curl -X POST http://localhost:3000/api/scan/library/1 \
     -H "Content-Type: application/json" \
     -d '{"strategy": "hybrid"}'
   ```

5. **Monitor progress**
   ```bash
   watch -n 1 'curl -s http://localhost:3000/api/scan/library/1/status | jq'
   ```

6. **Check results**
   ```bash
   curl http://localhost:3000/api/library/directories/1 | jq
   ```

## Expected Results

### Successful Health Check
```json
{
  "status": "ok",
  "timestamp": "2025-10-12T05:00:00.000Z",
  "uptime": 123.45,
  "environment": "development"
}
```

### Settings List
```json
{
  "success": true,
  "count": 19,
  "data": [
    {
      "key": "max_concurrent_scans",
      "value": "2",
      "type": "int",
      "category": "library",
      "parsedValue": 2
    }
  ]
}
```

### Library Directory Created
```json
{
  "success": true,
  "data": {
    "id": 1,
    "path": "/absolute/path/to/test-music",
    "name": "Test Library",
    "is_active": true,
    "total_tracks": 0,
    "scan_status": "idle"
  }
}
```

### Scan Started
```json
{
  "success": true,
  "message": "Scan started",
  "data": {
    "libraryDirectoryId": 1,
    "strategy": "hybrid"
  }
}
```

## Troubleshooting

### Server won't start
- Check if port 3000 is already in use: `lsof -i :3000`
- Try a different port: `PORT=3001 npm start`
- Check Node.js version: `node --version` (should be 18+)

### "Database not initialized" error
- Delete and recreate: `rm -f data/library.db && npm start`
- Check file permissions on `data/` directory

### "Directory not found" when adding library
- Use absolute paths: `pwd`/test-music
- Ensure directory exists before adding
- Check read permissions

### Scan not finding files
- Verify audio file extensions match config (see `.env`)
- Check `recursive_scan` is enabled
- Ensure files have proper extensions (.mp3, .flac, etc.)

### Metadata extraction fails
- Verify files are valid audio files (not empty)
- Check file isn't corrupted
- Ensure `music-metadata` can read the format

## Logs

Check application logs:
```bash
# View all logs
cat logs/app.log

# View errors only
cat logs/error.log

# Follow logs in real-time
tail -f logs/app.log
```

## Database Inspection

View database contents:
```bash
sqlite3 data/library.db

# List all tables
.tables

# View library directories
SELECT * FROM library_directories;

# View tracks
SELECT id, title, artist, file_path FROM tracks LIMIT 10;

# Check scan statistics
SELECT
  ld.name,
  ld.total_tracks,
  ld.total_missing,
  ld.scan_status
FROM library_directories ld;
```

## Next Steps

After verifying Phase 2 works:
1. Test with real music library
2. Try different scan strategies (fast, full, hybrid)
3. Test with large directories (1000+ files)
4. Monitor performance and memory usage
5. Test edge cases (disconnected drives, missing files)

## Support

If you encounter issues:
1. Check the logs: `logs/app.log`
2. Verify all dependencies are installed: `npm install`
3. Review the server console output
4. Check the GitHub issues page
