# Mismo DJ Design Updates - Multi-Directory Library Support

## Completed Changes

### 1. Database Schema Updates (schema.sql) ✅

#### New Tables Added:
- **`library_directories`** - Manage multiple library locations
  - Path, name, scanning configuration
  - Removable media support
  - Statistics tracking (total tracks, missing count)
  - Priority-based scanning

- **`duplicate_groups`** - Duplicate track management
  - File hash grouping
  - Canonical track selection
  - Duplicate count tracking

- **`file_operations`** - File operation logging
  - Move, rename, delete operations
  - Status tracking and error handling
  - Operation history

#### Enhanced Tracks Table:
- Added `file_hash` for duplicate detection
- Added `library_directory_id` for multi-directory support
- Added `relative_path` for subdirectory management
- Added `is_missing` and `missing_since` for disconnected media
- Added `duplicate_group_id` for duplicate linking

#### Updated Settings:
- Removed single `library_path` setting
- Added comprehensive multi-directory settings
- Added duplicate detection and file operation settings

#### Database Views and Triggers:
- `tracks_with_library` view for enhanced queries
- `library_stats` view for directory statistics
- `duplicates_with_tracks` view for duplicate management
- Automatic statistics updates via triggers

### 2. Key Features Implemented

#### Multi-Directory Library Support:
- Store multiple library directories with individual settings
- Recursive scanning with configurable depth
- Priority-based scanning order
- Removable media detection and handling
- Directory availability tracking

#### Duplicate Detection:
- Audio file hash calculation for identical track detection
- Duplicate group management
- Canonical track selection
- Duplicate resolution tools

#### File Operations:
- Move tracks between directories
- Rename track files
- Delete track files with confirmation
- Operation logging and error handling
- Database consistency maintenance

#### Missing Media Management:
- Track disconnected drives and mark files as missing
- Cleanup options for long-missing tracks
- Automatic restoration when media reconnected

#### Subdirectory Handling:
- Store full file paths for flexible operations
- Extract relative paths for directory browsing
- Support any directory structure organization
- Efficient directory tree queries

## API Enhancements Needed

### New Library Management Endpoints:
```
GET    /api/library/directories           - List all library directories
POST   /api/library/directories           - Add new library directory
PUT    /api/library/directories/:id       - Update directory settings
DELETE /api/library/directories/:id       - Remove directory (keep tracks)
POST   /api/library/directories/:id/scan  - Scan specific directory
GET    /api/library/directories/:id/stats - Get directory statistics
GET    /api/library/directories/:id/browse?path=subdir - Browse directory contents
```

### New File Operations Endpoints:
```
POST   /api/tracks/:id/move              - Move track to different directory/folder
POST   /api/tracks/:id/rename            - Rename track file
DELETE /api/tracks/:id/file            - Delete actual file (with confirmation)
POST   /api/library/directories/:id/cleanup - Remove missing tracks from directory
```

### New Duplicate Management Endpoints:
```
GET    /api/duplicates                   - List duplicate groups
POST   /api/duplicates/:id/resolve       - Choose canonical version, merge metadata
GET    /api/duplicates/:id/tracks        - Get all tracks in duplicate group
```

### Enhanced Track Queries:
```
GET /api/tracks?library_id=1              - Filter by library directory
GET /api/tracks?library_source=external   - Filter by removable drives
GET /api/tracks?is_missing=true           - Filter missing tracks
GET /api/tracks?duplicate_group_id=5      - Filter by duplicate group
```

## WebSocket Events Added

### Directory Management Events:
```javascript
{
  "event": "library:directory:added",
  "data": { "directory": { /* directory info */ } }
}

{
  "event": "library:directory:scan:progress",
  "data": {
    "directoryId": 1,
    "directoryName": "Main Library",
    "progress": 0.65,
    "filesScanned": 500,
    "tracksAdded": 23
  }
}

{
  "event": "library:media:connected",
  "data": {
    "path": "/media/external/EDM",
    "suggestedName": "EDM Collection"
  }
}
```

### File Operation Events:
```javascript
{
  "event": "track:moved",
  "data": {
    "trackId": 123,
    "oldPath": "/music/old/track.mp3",
    "newPath": "/music/new/track.mp3"
  }
}

{
  "event": "track:missing",
  "data": {
    "trackId": 456,
    "path": "/media/external/track.mp3",
    "directoryId": 2
  }
}
```

### Duplicate Detection Events:
```javascript
{
  "event": "duplicate:detected",
  "data": {
    "groupId": 1,
    "trackIds": [123, 456],
    "fileHash": "abc123..."
  }
}
```

## Hybrid Scanning Strategy

### Phase 1: Fast Initial Scan
- Extract basic metadata (title, artist, duration, etc.)
- Calculate file hash for duplicate detection
- Add tracks to database quickly
- Queue for background analysis

### Phase 2: Background Analysis
- Send tracks to Python analysis server
- Progressive updates via WebSocket
- Throttled to minimize system impact
- Resumable if interrupted

## Enhanced Project Structure

### New Services Added:
```
src/
├── services/
│   ├── libraryManager.js     # Multi-directory management
│   ├── fileHashService.js    # Audio fingerprinting
│   ├── duplicateDetector.js  # Duplicate detection logic
│   ├── fileOperations.js     # File move/rename/delete
│   ├── missingMediaHandler.js # Disconnected media management
│   └── directoryBrowser.js   # Directory browsing service
```

## Performance Considerations

### Multi-Directory Scanning:
- Concurrent scanning with configurable limits
- Priority-based scanning order
- Throttled I/O operations
- Background processing for large libraries

### Duplicate Detection:
- Efficient hash calculation
- Index optimization for hash lookups
- Lazy duplicate group loading
- Batch duplicate resolution

### File Operations:
- Queued file operations to prevent conflicts
- Transaction-based database updates
- Rollback on file operation failures
- Background processing for large operations

## Security Enhancements

### File System Access:
- Validate all file paths within configured directories
- Prevent directory traversal attacks
- Check file permissions before operations
- Sanitize user-provided paths

### File Operations:
- Confirm destructive operations (delete)
- Log all file operations for audit
- Validate destination paths for moves
- Handle symlink security

## Configuration Management

### New Settings Categories:
```javascript
{
  // Library Management
  "max_concurrent_scans": 2,
  "scan_priority_order": true,
  "auto_detect_removable_drives": true,
  
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
  "auto_restore_missing_tracks": true
}
```

## Next Implementation Steps

1. **Update API routes** with new endpoints
2. **Implement library management service** for directory operations
3. **Create file hash service** for duplicate detection
4. **Build file operations queue** for safe file manipulations
5. **Add missing media detection** and handling
6. **Update WebSocket events** for real-time updates
7. **Enhance frontend integration** for new features
8. **Add comprehensive testing** for all new functionality

## Benefits of Updated Design

1. **Flexibility**: Users can organize music across multiple locations
2. **Scalability**: Handles large libraries with removable media
3. **Data Integrity**: Duplicate detection prevents library bloat
4. **User Control**: File operations with proper safety measures
5. **Performance**: Hybrid scanning balances speed and system impact
6. **Robustness**: Handles disconnected media gracefully
7. **Maintainability**: Clean separation of concerns in services

This updated design provides a professional-grade music library management system suitable for DJs with complex, multi-location music collections.
