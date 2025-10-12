# Learning Moment: Phase 3 - Duplicate Detection & File Operations

**Date**: October 12, 2025
**Phase**: 3 (Days 9-10)
**Topic**: Duplicate Detection and File Operations Implementation

## Overview

Phase 3 implemented sophisticated duplicate detection based on audio-only hashing and safe file operations with rollback capabilities. This phase demonstrates advanced database transaction management, metadata merging, and file system operations in Node.js.

## What Was Implemented

### Day 9: Duplicate Detection

#### 1. **Duplicate Detector Service** ([duplicateDetector.service.js](../../src/services/duplicateDetector.service.js))

**Key Features:**
- **Hash-based Duplicate Detection**: Uses audio-only file hashes (excluding metadata) to detect true duplicates
- **Automatic Group Assignment**: Tracks are automatically assigned to duplicate groups during import
- **Library-wide Scanning**: Can scan entire library to find all duplicates
- **Smart Resolution**: Merge metadata, update playlists, and optionally delete duplicate files

**Core Functions:**

```javascript
// Auto-detect and assign duplicates during import
checkAndAssignDuplicateGroup(trackId)

// Scan entire library for duplicates
scanLibraryForDuplicates()

// Get duplicate groups with pagination
getAllDuplicateGroups(options)

// Resolve duplicates with options
resolveDuplicates(groupId, canonicalTrackId, options)
```

#### 2. **Duplicate Management Routes** ([duplicates.routes.js](../../src/routes/duplicates.routes.js))

**Endpoints Implemented:**
```
GET    /api/duplicates              - List all duplicate groups (paginated)
GET    /api/duplicates/stats        - Get duplicate statistics
GET    /api/duplicates/:id          - Get duplicate group with all tracks
POST   /api/duplicates/:id/resolve  - Resolve duplicates (keep canonical)
POST   /api/duplicates/scan         - Scan entire library for duplicates
```

**Resolution Options:**
- `deleteFiles`: Delete duplicate files from disk
- `keepMetadata`: Merge metadata from duplicates into canonical track
- `updatePlaylists`: Update all playlist references to canonical track

#### 3. **Metadata Merging Logic**

When resolving duplicates, the system intelligently merges metadata:
- Takes non-null values from duplicates if canonical is missing
- Uses highest rating among all duplicates
- Preserves all valuable metadata

**Example:**
```javascript
// Canonical has: { title: "Song", artist: null, rating: 3 }
// Duplicate 1 has: { title: "Song", artist: "Artist", rating: 4 }
// Duplicate 2 has: { title: "Song", artist: "Other", rating: 2 }

// Result: { title: "Song", artist: "Artist", rating: 4 }
```

### Day 10: File Operations

#### 1. **File Operations Service** ([fileOperations.service.js](../../src/services/fileOperations.service.js))

**Key Features:**
- **Safe Move Operations**: Cross-device support with automatic fallback to copy+delete
- **Disk Space Validation**: Checks available space before moving files
- **Atomic Operations**: Database transactions ensure consistency
- **Rollback Support**: Automatically reverts on failure

**Core Functions:**

```javascript
// Move track to new location
async moveTrack(trackId, destinationPath, newLibraryDirectoryId)

// Rename track file
async renameTrack(trackId, newName)

// Delete track file and remove from database
async deleteTrack(trackId, confirm, options)

// Batch operations
async batchMoveTracks(trackIds, destinationDir, newLibraryDirectoryId)

// Verify file exists and is accessible
async verifyTrackFile(trackId)
```

#### 2. **File Operation Routes** (added to [tracks.routes.js](../../src/routes/tracks.routes.js))

**Endpoints Implemented:**
```
POST   /api/tracks/:id/move         - Move track file
POST   /api/tracks/:id/rename       - Rename track file
DELETE /api/tracks/:id/file         - Delete track file from disk
GET    /api/tracks/:id/verify       - Verify track file exists
```

#### 3. **Safety Features**

**Move Operation Safety:**
- Validates destination directory exists
- Checks if destination file already exists
- Verifies sufficient disk space
- Handles cross-device moves (different filesystems)
- Rolls back on failure

**Delete Operation Safety:**
- Requires explicit confirmation flag
- Option to remove from playlists
- Logs all operations
- Handles file deletion failures gracefully

## Technical Highlights

### 1. **SQLite Transactions**

Used SQLite transactions for atomic operations:

```javascript
const transaction = db.transaction(() => {
  // Update canonical track in group
  db.prepare('UPDATE duplicate_groups SET canonical_track_id = ? WHERE id = ?')
    .run(canonicalTrackId, groupId);

  // Merge metadata
  mergeMetadata(canonicalTrackId, duplicateTracks);

  // Update playlists
  updatePlaylistReferences(canonicalTrackId, duplicateIds);

  // Remove duplicates
  db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...duplicateIds);
});

transaction(); // Execute atomically
```

**Why This Matters:**
- All database changes happen atomically (all or nothing)
- Prevents partial updates if something fails
- Ensures database consistency

### 2. **Cross-Device File Moves**

Handled the case where source and destination are on different filesystems:

```javascript
try {
  await fs.rename(track.file_path, destinationPath);
} catch (error) {
  // If rename fails (different filesystem), use copy + delete
  if (error.code === 'EXDEV') {
    logger.info('Cross-device move detected, using copy + delete');
    await fs.copyFile(track.file_path, destinationPath);
    await fs.unlink(track.file_path);
  } else {
    throw error;
  }
}
```

**Learning:**
- `fs.rename()` fails when moving across filesystems
- Automatic fallback to copy+delete ensures operation succeeds
- User doesn't need to know about this complexity

### 3. **Async/Await with Dynamic Imports**

File operations service uses async/await properly:

```javascript
export async function moveTrack(trackId, destinationPath, newLibraryDirectoryId) {
  // All operations are properly awaited
  const stats = await fs.stat(track.file_path);
  await fs.rename(track.file_path, destinationPath);

  // Database operations are synchronous (better-sqlite3)
  db.prepare('UPDATE tracks SET ...').run(...);

  return trackService.getTrackById(trackId);
}
```

**Best Practice:**
- File system operations are async (use await)
- Database operations are sync (better-sqlite3 design)
- Always handle errors with try/catch

### 4. **Metadata Merging Strategy**

Intelligent metadata merging preserves the best data:

```javascript
function mergeMetadata(canonicalTrackId, duplicateTracks) {
  const canonical = db.prepare('SELECT * FROM tracks WHERE id = ?').get(canonicalTrackId);
  const updates = {};

  const fieldsToMerge = [
    'title', 'artist', 'album', 'album_artist', 'genre',
    'year', 'track_number', 'comment', 'bpm', 'musical_key', 'rating'
  ];

  // For each field, take non-null value from duplicates if canonical is null
  for (const field of fieldsToMerge) {
    if (!canonical[field]) {
      for (const dup of duplicateTracks) {
        if (dup[field]) {
          updates[field] = dup[field];
          break;
        }
      }
    }
  }

  // Take highest rating
  const ratings = [canonical.rating || 0, ...duplicateTracks.map(t => t.rating || 0)];
  updates.rating = Math.max(...ratings);

  // Apply updates
  if (Object.keys(updates).length > 0) {
    const fields = Object.keys(updates).map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE tracks SET ${fields} WHERE id = ?`)
      .run(...Object.values(updates), canonicalTrackId);
  }
}
```

## Testing Results

### Duplicate Detection Test
```bash
curl -X POST http://localhost:3000/api/duplicates/scan
```

**Result:**
```json
{
  "success": true,
  "data": {
    "groupsCreated": 2,
    "tracksProcessed": 8,
    "duplicateHashes": 2
  },
  "message": "Scan complete: 2 duplicate groups found"
}
```

**Found:**
- Group 1: 6 empty test files (song1-6.mp3) with same hash
- Group 2: 2 files (soul makosa.mp3 and soul makosa - test.mp3)

### File Verification Test
```bash
curl http://localhost:3000/api/tracks/1/verify
```

**Result:**
```json
{
  "success": true,
  "data": {
    "exists": true,
    "filePath": "/home/chester/Music/test/3 Doors Down - Here Without You.m4a",
    "size": 5021109,
    "modified": "2024-05-23T22:05:30.000Z",
    "accessible": true
  }
}
```

## Key Learnings

### 1. **Database Design for Duplicates**

The duplicate detection system uses a separate `duplicate_groups` table:

```sql
CREATE TABLE duplicate_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash TEXT NOT NULL UNIQUE,
    canonical_track_id INTEGER,
    total_duplicates INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Why Separate Table?**
- One hash can have multiple track duplicates
- Canonical track can be changed without affecting group
- Easy to query all duplicates
- Supports triggers to auto-update counts

### 2. **Playlist Reference Updates**

When resolving duplicates, we update all playlist references:

```javascript
function updatePlaylistReferences(canonicalTrackId, duplicateTrackIds) {
  const placeholders = duplicateTrackIds.map(() => '?').join(',');

  db.prepare(`
    UPDATE playlist_tracks
    SET track_id = ?
    WHERE track_id IN (${placeholders})
  `).run(canonicalTrackId, ...duplicateTrackIds);
}
```

**Benefits:**
- Playlists automatically reference the canonical track
- No broken playlist entries
- Seamless for the user

### 3. **Error Handling Patterns**

File operations can fail in many ways. Proper error handling:

```javascript
try {
  // Perform operation
  await fs.rename(oldPath, newPath);

  // Update database
  db.prepare('UPDATE tracks ...').run(...);

} catch (error) {
  logger.error('Error moving track:', error);

  // Attempt rollback
  try {
    await fs.rename(newPath, oldPath);
    logger.info('Rolled back file move');
  } catch (rollbackError) {
    // Rollback failed - log and report
  }

  throw error; // Re-throw for route handler
}
```

**Pattern:**
1. Try operation
2. On error, attempt rollback
3. Log everything
4. Re-throw for upper layers

### 4. **Input Validation for File Ops**

File operations are dangerous - validate everything:

```javascript
// Validate filename doesn't contain path separators
if (newName.includes('/') || newName.includes('\\')) {
  throw new Error('Invalid filename');
}

// Check destination doesn't already exist
try {
  await fs.access(destinationPath);
  throw new Error('File already exists');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // Good - file doesn't exist
}

// Validate disk space
const stats = await fs.statfs(destDir);
const availableSpace = stats.bavail * stats.bsize;
if (fileSize > availableSpace) {
  throw new Error('Insufficient disk space');
}
```

## HTML Test Client

Created comprehensive test client at [test/phase-3-test.html](../../test/phase-3-test.html):

**Features:**
- Live server status indicator
- All duplicate detection endpoints
- All file operation endpoints
- Interactive forms for testing
- Visual success/error feedback
- JSON response display
- "Run All Tests" automation

**To Use:**
```bash
npm run serve:test
# Open http://localhost:8080/test/phase-3-test.html
```

## API Documentation Summary

### Duplicate Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/duplicates` | List all duplicate groups |
| GET | `/api/duplicates/stats` | Get duplicate statistics |
| GET | `/api/duplicates/:id` | Get group with all tracks |
| POST | `/api/duplicates/scan` | Scan library for duplicates |
| POST | `/api/duplicates/:id/resolve` | Resolve duplicate group |

### File Operation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tracks/:id/move` | Move track file |
| POST | `/api/tracks/:id/rename` | Rename track file |
| DELETE | `/api/tracks/:id/file` | Delete track file |
| GET | `/api/tracks/:id/verify` | Verify file exists |

## Next Steps

Phase 3 is now complete! The system can:
- ✅ Detect duplicates based on audio-only hash
- ✅ Group duplicates and select canonical track
- ✅ Merge metadata intelligently
- ✅ Update playlist references automatically
- ✅ Move, rename, and delete files safely
- ✅ Rollback on failures
- ✅ Verify file accessibility

**Ready for Phase 4**: Playlist Management (Days 12-13)

## Files Created/Modified

**New Files:**
- `src/services/duplicateDetector.service.js` - Duplicate detection logic
- `src/routes/duplicates.routes.js` - Duplicate management API
- `src/services/fileOperations.service.js` - File operation handlers
- `test/phase-3-test.html` - Interactive test client

**Modified Files:**
- `src/routes/tracks.routes.js` - Added file operation endpoints
- `src/utils/validators.js` - Added duplicate resolution schema
- `src/server.js` - Registered duplicate routes

## Reflections

### What Went Well
- Hash-based duplicate detection works perfectly
- Atomic transactions ensure data consistency
- Cross-device file moves handled gracefully
- Comprehensive error handling and rollback
- Test client makes manual testing easy

### What Could Be Improved
- Could add batch duplicate resolution
- File operation queue for concurrent safety (deferred)
- More sophisticated metadata conflict resolution
- Support for acoustic fingerprinting (future enhancement)

### Performance Considerations
- Duplicate scanning is O(n log n) due to hash indexing
- Database transactions are fast with SQLite
- File operations block (intentional for safety)
- Consider background queue for large batch operations
