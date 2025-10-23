# Mismo DJ App Server - Library System Client Guide

**Version:** 1.0
**Last Updated:** October 23, 2025
**Status:** Production

---

## Table of Contents

1. [Overview](#overview)
2. [Library Directory Architecture](#library-directory-architecture)
3. [Track Organization & Storage](#track-organization--storage)
4. [Adding Library Directories](#adding-library-directories)
5. [Browsing & Navigation](#browsing--navigation)
6. [Retrieving Tracks](#retrieving-tracks)
7. [Search & Filtering](#search--filtering)
8. [Getting Track Details](#getting-track-details)
9. [Managing Missing Media](#managing-missing-media)
10. [Duplicate Detection](#duplicate-detection)
11. [API Reference](#api-reference)
12. [Performance Considerations](#performance-considerations)
13. [Best Practices](#best-practices)

---

## Overview

The Mismo DJ App Server provides a comprehensive music library management system designed for DJ and music production workflows. The system supports:

- **Multiple independent library roots** - Add unlimited music directories
- **Hierarchical organization** - Organize tracks in nested folders
- **Advanced metadata** - Store audio analysis, BPM, key, energy levels, and more
- **Fast retrieval** - Optimized queries with indexing for 50,000+ track libraries
- **Missing media handling** - Track and restore disconnected drives
- **Duplicate detection** - Identify duplicate files across libraries

### Key Concepts

1. **Library Directory**: An independent root directory containing music files (e.g., `/Music`, `/DJ Pool`, `/Samples`)
2. **Relative Path**: The path of a track relative to its library root (e.g., `Artist/Album/track.mp3`)
3. **Track**: A single audio file with associated metadata and analysis data
4. **Missing Track**: A track whose file is temporarily unavailable (e.g., disconnected external drive)

---

## Library Directory Architecture

### Design Principles

The library system follows a **non-nested architecture**:

- Each library directory is an **independent root**
- Library directories **cannot be nested** within each other
- Tracks within a library use **relative paths** for hierarchical organization
- This design optimizes query performance and simplifies data management

### Example Structure

```
✅ VALID: Independent library directories
/home/user/Music          (Library Directory 1)
/home/user/DJ_Pool        (Library Directory 2)
/media/external/Samples   (Library Directory 3)

❌ INVALID: Nested library directories
/home/user/Music          (Library Directory 1)
/home/user/Music/DJ_Pool  (❌ Cannot be Library Directory 2 - nested!)
```

### Library Directory Schema

Each library directory contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `path` | String | Absolute filesystem path (unique) |
| `name` | String | User-friendly display name |
| `is_active` | Boolean | Whether to include in scans (default: `true`) |
| `is_removable` | Boolean | Tracks external/network drives (default: `false`) |
| `is_available` | Boolean | Current availability status (default: `true`) |
| `priority` | Integer | Scan order priority (default: `0`) |
| `recursive_scan` | Boolean | Scan subdirectories (default: `true`) |
| `max_depth` | Integer | Max subdirectory depth, -1 = unlimited (default: `-1`) |
| `scan_patterns` | JSON Array | File patterns to include (e.g., `["*.mp3", "*.flac"]`) |
| `exclude_patterns` | JSON Array | Patterns to exclude (e.g., `[".*", "desktop.ini"]`) |
| `follow_symlinks` | Boolean | Follow symbolic links (default: `false`) |
| `last_scan` | DateTime | Timestamp of last scan |
| `scan_status` | String | `idle`, `scanning`, or `error` |
| `total_tracks` | Integer | Total tracks in library (auto-updated) |
| `total_missing` | Integer | Count of missing tracks (auto-updated) |
| `date_added` | DateTime | When library was added |

---

## Track Organization & Storage

### Relative Path System

Tracks are organized using **relative paths** from their library directory root:

```
Library Root: /home/user/Music
├── file_path: /home/user/Music/Artist A/Album X/song1.mp3
│   relative_path: "Artist A/Album X/song1.mp3"
│
├── file_path: /home/user/Music/Artist B/song2.mp3
│   relative_path: "Artist B/song2.mp3"
│
└── file_path: /home/user/Music/track.mp3
    relative_path: "" (or NULL - root level)
```

### Folder Hierarchy Examples

**Typical DJ Library Structure:**
```
Library: /DJ_Music
├── House/
│   ├── Deep House/
│   │   └── track.mp3  → relative_path: "House/Deep House/track.mp3"
│   └── Tech House/
│       └── track.mp3  → relative_path: "House/Tech House/track.mp3"
├── Techno/
│   └── track.mp3      → relative_path: "Techno/track.mp3"
└── track.mp3          → relative_path: "" (root level)
```

**Artist/Album Structure:**
```
Library: /Music
├── The Beatles/
│   ├── Abbey Road/
│   │   ├── 01 Come Together.mp3    → "The Beatles/Abbey Road/01 Come Together.mp3"
│   │   └── 02 Something.mp3        → "The Beatles/Abbey Road/02 Something.mp3"
│   └── Revolver/
│       └── 01 Taxman.mp3            → "The Beatles/Revolver/01 Taxman.mp3"
```

### Track Schema (Key Fields)

| Field | Type | Description |
|-------|------|-------------|
| **Identification** | | |
| `id` | UUID | Unique track identifier |
| `file_path` | String | Absolute filesystem path (unique) |
| `relative_path` | String | Path relative to library directory |
| `library_directory_id` | UUID | Parent library directory |
| `file_hash` | String | Audio fingerprint hash (for duplicate detection) |
| **File Properties** | | |
| `file_size` | Integer | File size in bytes |
| `file_modified` | DateTime | Last filesystem modification |
| `is_missing` | Boolean | File currently unavailable |
| `missing_since` | DateTime | When file became unavailable |
| **Metadata** | | |
| `title` | String | Track title |
| `artist` | String | Primary artist |
| `album` | String | Album name |
| `album_artist` | String | Album artist (for compilations) |
| `genre` | String | Genre tag |
| `year` | Integer | Release year |
| `track_number` | Integer | Track number on album |
| `comment` | Text | ID3 comment field |
| **Audio Properties** | | |
| `duration_seconds` | Float | Track duration |
| `sample_rate` | Integer | Sample rate (Hz) |
| `bit_rate` | Integer | Bit rate (kbps) |
| `channels` | Integer | Channel count (1=mono, 2=stereo) |
| **Analysis Data** | | |
| `bpm` | Float | Beats per minute |
| `musical_key` | Integer | Key (0-11, C=0, C#=1, ..., B=11) |
| `mode` | Integer | Mode (0=minor, 1=major) |
| `time_signature` | String | Time signature (e.g., "4/4") |
| `first_beat_offset` | Float | Offset to first beat (seconds) |
| `first_phrase_beat_no` | Integer | Beat number of first phrase |
| `beats_data` | BLOB | Array of beat timestamps |
| `downbeats_data` | BLOB | Array of downbeat timestamps |
| `stems_path` | String | Path to separated stems |
| **Audio Features** | | |
| `danceability` | Float | Danceability score (0-1) |
| `energy` | Float | Energy level (0-1) |
| `arousal` | Float | Arousal level (0-1) |
| `valence` | Float | Musical positivity (0-1) |
| `loudness` | Float | Average loudness (dB) |
| `acousticness` | Float | Acoustic vs electronic (0-1) |
| `instrumentalness` | Float | Vocal vs instrumental (0-1) |
| `spectral_centroid` | Float | Brightness measure |
| `spectral_rolloff` | Float | High-frequency content |
| `spectral_bandwidth` | Float | Frequency range |
| `zero_crossing_rate` | Float | Percussiveness measure |
| **User Metadata** | | |
| `rating` | Integer | User rating (0-5 stars) |
| `color_tag` | String | Color label/tag |
| `energy_level` | Integer | User-defined energy level |
| `play_count` | Integer | Number of plays |
| `last_played` | DateTime | Last play timestamp |
| **Timestamps** | | |
| `date_added` | DateTime | When added to library |
| `date_analyzed` | DateTime | When analysis completed |
| `analysis_version` | String | Analysis engine version |

---

## Adding Library Directories

### Endpoint: Create Library Directory

**POST** `/api/library/directories`

Creates a new library directory root. The system validates that the directory:
- Exists on the filesystem
- Is accessible (read permissions)
- Does not overlap with existing library directories
- Does not nest within existing library directories

#### Request Body

```json
{
  "path": "/absolute/path/to/music/folder",
  "name": "My Music Library",
  "is_active": true,
  "is_removable": false,
  "recursive_scan": true,
  "max_depth": -1,
  "scan_patterns": ["*.mp3", "*.flac", "*.wav", "*.aac", "*.opus", "*.m4a", "*.aif", "*.aiff"],
  "exclude_patterns": [".*", "desktop.ini", "Thumbs.db"],
  "follow_symlinks": false,
  "priority": 0
}
```

#### Required Fields

- `path` - Absolute filesystem path to the directory

#### Optional Fields (with defaults)

- `name` - Display name (defaults to folder name)
- `is_active` - Enable scanning (default: `true`)
- `is_removable` - External/network drive flag (default: `false`)
- `recursive_scan` - Scan subdirectories (default: `true`)
- `max_depth` - Max nesting depth, -1 = unlimited (default: `-1`)
- `scan_patterns` - File patterns to include (default: common audio formats)
- `exclude_patterns` - Patterns to exclude (default: hidden files)
- `follow_symlinks` - Follow symbolic links (default: `false`)
- `priority` - Scan order priority (default: `0`)

#### Response (201 Created)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "path": "/absolute/path/to/music/folder",
  "name": "My Music Library",
  "is_active": true,
  "is_removable": false,
  "is_available": true,
  "priority": 0,
  "recursive_scan": true,
  "max_depth": -1,
  "scan_patterns": ["*.mp3", "*.flac", "*.wav", "*.aac", "*.opus", "*.m4a", "*.aif", "*.aiff"],
  "exclude_patterns": [".*", "desktop.ini", "Thumbs.db"],
  "follow_symlinks": false,
  "last_scan": null,
  "scan_status": "idle",
  "total_tracks": 0,
  "total_missing": 0,
  "date_added": "2025-10-23T12:00:00.000Z"
}
```

#### Error Responses

**400 Bad Request** - Validation errors:
```json
{
  "error": "Directory path is required"
}
```

```json
{
  "error": "Directory does not exist: /invalid/path"
}
```

```json
{
  "error": "Library directories cannot be nested. This path overlaps with existing library: /home/user/Music"
}
```

**409 Conflict** - Directory already exists:
```json
{
  "error": "Library directory already exists: /home/user/Music"
}
```

**500 Internal Server Error** - Database or filesystem error:
```json
{
  "error": "Failed to create library directory",
  "message": "EACCES: permission denied"
}
```

### Validation Rules

#### No Nesting Rule

The system enforces that library directories cannot overlap:

```javascript
// Example validation scenarios

✅ VALID: Independent directories
Library 1: /home/user/Music
Library 2: /home/user/DJ_Pool
Library 3: /media/external/Samples

❌ INVALID: Nested directories
Library 1: /home/user/Music
Library 2: /home/user/Music/DJ_Pool  // ❌ Nested inside Library 1

❌ INVALID: Parent directory of existing library
Library 1: /home/user/Music/House
Library 2: /home/user/Music          // ❌ Parent of Library 1
```

The validation function `validateNoOverlap()` checks:
1. Is the new path a parent of any existing library?
2. Is the new path a child of any existing library?

### Example: Add Multiple Library Directories

```javascript
// Add main music library
const response1 = await fetch('/api/library/directories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: '/home/user/Music',
    name: 'My Music',
    is_removable: false
  })
});
const library1 = await response1.json();

// Add external DJ pool (removable drive)
const response2 = await fetch('/api/library/directories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: '/media/external/DJ_Pool',
    name: 'DJ Pool',
    is_removable: true,  // Mark as external drive
    priority: 1          // Scan after main library
  })
});
const library2 = await response2.json();

// Add sample library with limited depth
const response3 = await fetch('/api/library/directories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: '/home/user/Samples',
    name: 'Sample Library',
    max_depth: 2,        // Only scan 2 levels deep
    scan_patterns: ['*.wav', '*.aif']  // Only WAV and AIF files
  })
});
const library3 = await response3.json();
```

---

## Browsing & Navigation

The directory browser provides hierarchical navigation through your library's folder structure without accessing the filesystem. All data comes from the indexed `relative_path` field for fast retrieval.

### Endpoint: Browse Directory

**GET** `/api/library/directories/:id/browse?path={relative_path}`

Browse folder contents at a specific relative path within a library.

#### Parameters

- `:id` (path parameter) - Library directory UUID
- `path` (query parameter) - Relative path to browse (optional, defaults to root)

#### Examples

```javascript
// Browse library root
GET /api/library/directories/550e8400-e29b-41d4-a716-446655440000/browse

// Browse specific folder
GET /api/library/directories/550e8400-e29b-41d4-a716-446655440000/browse?path=The%20Beatles/Abbey%20Road

// Browse artist folder
GET /api/library/directories/550e8400-e29b-41d4-a716-446655440000/browse?path=House/Deep%20House
```

#### Response (200 OK)

```json
{
  "libraryDirectoryId": "550e8400-e29b-41d4-a716-446655440000",
  "path": "The Beatles/Abbey Road",
  "absolutePath": "/home/user/Music/The Beatles/Abbey Road",
  "folders": [
    {
      "name": "Disc 1",
      "relativePath": "The Beatles/Abbey Road/Disc 1",
      "trackCount": 17,
      "totalSize": 145678900,
      "hasSubfolders": false
    },
    {
      "name": "Disc 2",
      "relativePath": "The Beatles/Abbey Road/Disc 2",
      "trackCount": 9,
      "totalSize": 87654321,
      "hasSubfolders": false
    }
  ],
  "tracks": [
    {
      "id": "track-uuid-1",
      "title": "Come Together",
      "artist": "The Beatles",
      "album": "Abbey Road",
      "file_path": "/home/user/Music/The Beatles/Abbey Road/01 Come Together.mp3",
      "relative_path": "The Beatles/Abbey Road/01 Come Together.mp3",
      "duration_seconds": 259.5,
      "bpm": 83.5,
      "musical_key": 2,
      "file_size": 6234567,
      "is_missing": false
    },
    {
      "id": "track-uuid-2",
      "title": "Something",
      "artist": "The Beatles",
      "album": "Abbey Road",
      "file_path": "/home/user/Music/The Beatles/Abbey Road/02 Something.mp3",
      "relative_path": "The Beatles/Abbey Road/02 Something.mp3",
      "duration_seconds": 182.8,
      "bpm": 66.0,
      "musical_key": 0,
      "file_size": 4321098,
      "is_missing": false
    }
  ],
  "stats": {
    "totalTracks": 26,
    "totalSize": 233333221,
    "folderCount": 2,
    "trackCount": 2
  }
}
```

#### Response Fields

| Field | Description |
|-------|-------------|
| `libraryDirectoryId` | UUID of the library directory |
| `path` | Relative path being browsed |
| `absolutePath` | Full filesystem path |
| `folders[]` | Array of subdirectories at this level |
| `folders[].name` | Folder name |
| `folders[].relativePath` | Full relative path to folder |
| `folders[].trackCount` | Total tracks in folder (including subfolders) |
| `folders[].totalSize` | Total file size in bytes |
| `folders[].hasSubfolders` | Whether folder contains subdirectories |
| `tracks[]` | Array of tracks directly in this folder (not subfolders) |
| `stats.totalTracks` | Total tracks at this level and below |
| `stats.totalSize` | Total size of all tracks (bytes) |
| `stats.folderCount` | Number of immediate subfolders |
| `stats.trackCount` | Number of tracks directly in this folder |

#### Important Notes

1. **Tracks vs Total Tracks**:
   - `tracks[]` contains only tracks **directly in this folder**
   - `stats.totalTracks` counts tracks **in this folder and all subfolders**

2. **Folder Statistics**:
   - Folder `trackCount` includes all tracks in subfolders
   - Calculated recursively for deep hierarchies

3. **Sorting**:
   - Folders are sorted alphabetically by name
   - Tracks are returned in database order (typically by filename)

4. **Missing Tracks**:
   - Only **available tracks** (`is_missing = 0`) are included
   - Missing tracks are excluded from counts and listings

### Endpoint: Get Breadcrumbs

**GET** `/api/library/directories/:id/breadcrumbs?path={relative_path}`

Returns navigation breadcrumbs for a given path.

#### Response (200 OK)

```json
{
  "breadcrumbs": [
    { "name": "Library", "path": "" },
    { "name": "The Beatles", "path": "The Beatles" },
    { "name": "Abbey Road", "path": "The Beatles/Abbey Road" }
  ]
}
```

### Path Traversal Protection

The browser validates all paths to prevent directory traversal attacks:

```javascript
// ✅ VALID
?path=Artist/Album
?path=Genre/Subgenre/Artist

// ❌ INVALID - Returns 400 Bad Request
?path=../../../etc/passwd
?path=Artist/../../../secrets
```

### Example: Building a Folder Navigator

```javascript
class LibraryBrowser {
  constructor(libraryId, apiBase = '/api') {
    this.libraryId = libraryId;
    this.apiBase = apiBase;
    this.currentPath = '';
  }

  async browse(relativePath = '') {
    const url = new URL(`${this.apiBase}/library/directories/${this.libraryId}/browse`, window.location.origin);
    if (relativePath) {
      url.searchParams.set('path', relativePath);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Browse failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.currentPath = data.path;
    return data;
  }

  async navigateToFolder(folderRelativePath) {
    return await this.browse(folderRelativePath);
  }

  async navigateUp() {
    // Go up one level
    const parts = this.currentPath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    return await this.browse(parentPath);
  }

  async navigateToRoot() {
    return await this.browse('');
  }

  async getBreadcrumbs(path = this.currentPath) {
    const url = `${this.apiBase}/library/directories/${this.libraryId}/breadcrumbs?path=${encodeURIComponent(path)}`;
    const response = await fetch(url);
    return await response.json();
  }
}

// Usage
const browser = new LibraryBrowser('550e8400-e29b-41d4-a716-446655440000');

// Browse root
const root = await browser.browse();
console.log(`${root.stats.totalTracks} tracks, ${root.folders.length} folders`);

// Navigate to folder
const folder = await browser.navigateToFolder('House/Deep House');
console.log(`In ${folder.path}: ${folder.tracks.length} tracks`);

// Get breadcrumbs
const breadcrumbs = await browser.getBreadcrumbs();
console.log(breadcrumbs.breadcrumbs);  // [Library, House, Deep House]

// Navigate up
const parent = await browser.navigateUp();
console.log(`Back to: ${parent.path}`);  // "House"
```

---

## Retrieving Tracks

### Endpoint: Get All Tracks

**GET** `/api/tracks`

Retrieve all tracks across all libraries with optional filtering and pagination.

#### Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `library_id` | UUID | Filter by library directory | All libraries |
| `is_missing` | Boolean | Filter by missing status | All tracks |
| `page` | Integer | Page number (1-indexed) | `1` |
| `limit` | Integer | Results per page (max: 1000) | `50` |
| `sort` | String | Sort field (see below) | `date_added` |
| `order` | String | `ASC` or `DESC` | `DESC` |

#### Sort Fields

- `date_added` - When track was added to library
- `artist` - Artist name (alphabetical)
- `title` - Track title (alphabetical)
- `bpm` - Beats per minute (numeric)
- `play_count` - Number of plays (numeric)

#### Response (200 OK)

```json
{
  "tracks": [
    {
      "id": "track-uuid-1",
      "file_path": "/home/user/Music/Artist/Album/track.mp3",
      "relative_path": "Artist/Album/track.mp3",
      "library_directory_id": "library-uuid",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "genre": "House",
      "year": 2024,
      "bpm": 128.0,
      "musical_key": 0,
      "mode": 1,
      "duration_seconds": 320.5,
      "file_size": 7654321,
      "date_added": "2025-10-23T12:00:00.000Z",
      "is_missing": false
    }
  ],
  "total": 1523,
  "page": 1,
  "limit": 50,
  "totalPages": 31
}
```

### Endpoint: Get Tracks by Library

**GET** `/api/library/directories/:id/tracks`

Get all tracks in a specific library directory.

#### Query Parameters

Same as `/api/tracks` (page, limit, sort, order, is_missing)

#### Response

Same structure as `/api/tracks`, but filtered to the specified library.

### Endpoint: Get Single Track

**GET** `/api/tracks/:id`

Retrieve complete details for a single track by UUID.

#### Response (200 OK)

```json
{
  "id": "track-uuid",
  "file_path": "/home/user/Music/Artist/Album/track.mp3",
  "relative_path": "Artist/Album/track.mp3",
  "library_directory_id": "library-uuid",
  "file_size": 7654321,
  "file_modified": "2025-10-20T15:30:00.000Z",
  "file_hash": "sha256:abcdef1234567890...",
  "is_missing": false,
  "missing_since": null,

  "title": "Track Title",
  "artist": "Artist Name",
  "album": "Album Name",
  "album_artist": "Album Artist",
  "genre": "House",
  "year": 2024,
  "track_number": 5,
  "comment": "Original Mix",

  "duration_seconds": 320.5,
  "sample_rate": 44100,
  "bit_rate": 320,
  "channels": 2,

  "bpm": 128.0,
  "musical_key": 0,
  "mode": 1,
  "time_signature": "4/4",
  "first_beat_offset": 0.123,
  "first_phrase_beat_no": 1,
  "stems_path": "/stems/track-uuid",

  "danceability": 0.85,
  "energy": 0.72,
  "arousal": 0.68,
  "valence": 0.75,
  "loudness": -8.5,
  "acousticness": 0.12,
  "instrumentalness": 0.95,
  "spectral_centroid": 1523.45,
  "spectral_rolloff": 4532.12,
  "spectral_bandwidth": 2341.67,
  "zero_crossing_rate": 0.085,

  "rating": 4,
  "color_tag": "red",
  "energy_level": 3,
  "play_count": 12,
  "last_played": "2025-10-22T20:15:00.000Z",

  "date_added": "2025-10-23T12:00:00.000Z",
  "date_analyzed": "2025-10-23T12:05:30.000Z",
  "analysis_version": "1.0.0"
}
```

**Note**: By default, BLOB fields (`beats_data`, `downbeats_data`) are excluded for performance. Use specialized endpoints to retrieve beat data.

#### Error Responses

**404 Not Found** - Track does not exist:
```json
{
  "error": "Track not found"
}
```

### Example: Retrieve Library Tracks

```javascript
// Get all tracks in a library (first page)
const response = await fetch('/api/library/directories/550e8400-e29b-41d4-a716-446655440000/tracks?page=1&limit=100&sort=artist&order=ASC');
const data = await response.json();

console.log(`Found ${data.total} tracks across ${data.totalPages} pages`);
data.tracks.forEach(track => {
  console.log(`${track.artist} - ${track.title} (${track.bpm} BPM)`);
});

// Get next page
const page2 = await fetch('/api/library/directories/550e8400-e29b-41d4-a716-446655440000/tracks?page=2&limit=100&sort=artist&order=ASC');
const data2 = await page2.json();
```

---

## Search & Filtering

### Endpoint: Search Tracks

**GET** `/api/tracks?search={query}`

Search tracks by title, artist, or album name with advanced filtering.

#### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `search` | String | Search title, artist, album | `search=beatles` |
| `artist` | String | Filter by artist (partial match) | `artist=Beatles` |
| `genre` | String | Filter by genre (partial match) | `genre=House` |
| `bpm_min` | Number | Minimum BPM | `bpm_min=120` |
| `bpm_max` | Number | Maximum BPM | `bpm_max=130` |
| `key` | Integer | Musical key (0-11, C=0) | `key=0` |
| `library_id` | UUID | Filter by library | `library_id=550e8400...` |
| `is_missing` | Boolean | Missing tracks only | `is_missing=false` |
| `page` | Integer | Page number | `page=1` |
| `limit` | Integer | Results per page (max: 1000) | `limit=50` |
| `sort` | String | Sort field | `sort=bpm` |
| `order` | String | `ASC` or `DESC` | `order=ASC` |

#### Response (200 OK)

Same structure as `/api/tracks` with filtered results.

### Search Examples

```javascript
// Search by text (searches title, artist, album)
GET /api/tracks?search=abbey%20road

// Filter by BPM range
GET /api/tracks?bpm_min=120&bpm_max=130&sort=bpm&order=ASC

// Filter by genre
GET /api/tracks?genre=House&sort=date_added&order=DESC

// Combine filters
GET /api/tracks?artist=Beatles&bpm_min=100&bpm_max=150&library_id=550e8400-e29b-41d4-a716-446655440000

// Filter by musical key (C major)
GET /api/tracks?key=0&mode=1&sort=bpm

// Get only available tracks (exclude missing)
GET /api/tracks?is_missing=false

// Get only missing tracks
GET /api/tracks?is_missing=true
```

### Musical Key Reference

The `key` parameter uses integer values:

| Key | Value | Key | Value |
|-----|-------|-----|-------|
| C | 0 | F# / Gb | 6 |
| C# / Db | 1 | G | 7 |
| D | 2 | G# / Ab | 8 |
| D# / Eb | 3 | A | 9 |
| E | 4 | A# / Bb | 10 |
| F | 5 | B | 11 |

Mode values:
- `0` = Minor
- `1` = Major

### Example: Advanced Search UI

```javascript
class TrackSearch {
  constructor(apiBase = '/api') {
    this.apiBase = apiBase;
  }

  async search(filters = {}, pagination = {}) {
    const url = new URL(`${this.apiBase}/tracks`, window.location.origin);

    // Add filters
    if (filters.search) url.searchParams.set('search', filters.search);
    if (filters.artist) url.searchParams.set('artist', filters.artist);
    if (filters.genre) url.searchParams.set('genre', filters.genre);
    if (filters.bpm_min) url.searchParams.set('bpm_min', filters.bpm_min);
    if (filters.bpm_max) url.searchParams.set('bpm_max', filters.bpm_max);
    if (filters.key !== undefined) url.searchParams.set('key', filters.key);
    if (filters.library_id) url.searchParams.set('library_id', filters.library_id);
    if (filters.is_missing !== undefined) url.searchParams.set('is_missing', filters.is_missing);

    // Add pagination
    if (pagination.page) url.searchParams.set('page', pagination.page);
    if (pagination.limit) url.searchParams.set('limit', pagination.limit);
    if (pagination.sort) url.searchParams.set('sort', pagination.sort);
    if (pagination.order) url.searchParams.set('order', pagination.order);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return await response.json();
  }

  async searchByBpmRange(min, max, options = {}) {
    return await this.search(
      { bpm_min: min, bpm_max: max, ...options.filters },
      { sort: 'bpm', order: 'ASC', ...options.pagination }
    );
  }

  async searchByKey(key, mode = null, options = {}) {
    const filters = { key, ...options.filters };
    if (mode !== null) filters.mode = mode;

    return await this.search(filters, options.pagination);
  }

  async searchByGenre(genre, options = {}) {
    return await this.search(
      { genre, ...options.filters },
      { sort: 'date_added', order: 'DESC', ...options.pagination }
    );
  }
}

// Usage
const search = new TrackSearch();

// Find tracks 120-130 BPM
const result1 = await search.searchByBpmRange(120, 130);
console.log(`Found ${result1.total} tracks between 120-130 BPM`);

// Find C major tracks
const result2 = await search.searchByKey(0, 1);  // C major
console.log(`Found ${result2.total} tracks in C major`);

// Find House tracks
const result3 = await search.searchByGenre('House', {
  pagination: { limit: 100, page: 1 }
});
console.log(`Found ${result3.total} House tracks`);

// Complex search: House tracks, 125-130 BPM, in library X
const result4 = await search.search({
  genre: 'House',
  bpm_min: 125,
  bpm_max: 130,
  library_id: '550e8400-e29b-41d4-a716-446655440000'
}, {
  page: 1,
  limit: 50,
  sort: 'bpm',
  order: 'ASC'
});
```

---

## Getting Track Details

### Endpoint: Get Beat Data

**GET** `/api/tracks/:id/beats`

Retrieve the array of beat timestamps for a track (from BLOB field).

#### Response (200 OK)

```json
{
  "beats": [
    0.123,
    0.592,
    1.061,
    1.530,
    1.999,
    2.468
  ]
}
```

Beat timestamps are in seconds from the start of the track.

#### Error Responses

**404 Not Found** - Track has no beat data:
```json
{
  "error": "No beat data found for this track"
}
```

### Endpoint: Get Downbeat Data

**GET** `/api/tracks/:id/downbeats`

Retrieve the array of downbeat timestamps (first beat of each measure).

#### Response (200 OK)

```json
{
  "downbeats": [
    0.123,
    1.999,
    3.875,
    5.751
  ]
}
```

Downbeat timestamps are in seconds from the start of the track.

### Endpoint: Get Waveform Data

**GET** `/api/tracks/:id/waveform?zoom={level}`

Retrieve waveform visualization data at specified zoom level.

#### Query Parameters

- `zoom` (optional) - Zoom level (integer), or omit to get all levels

#### Response (200 OK)

```json
{
  "waveform": {
    "1": [0.1, 0.3, 0.5, 0.7, 0.9, ...],
    "2": [0.2, 0.6, 1.0, ...],
    "4": [0.4, 1.2, ...],
    "8": [0.8, 2.4, ...]
  }
}
```

Or with `zoom=2`:
```json
{
  "waveform": [0.2, 0.6, 1.0, ...]
}
```

### Endpoint: Verify Track File

**GET** `/api/tracks/:id/verify`

Verify that the track's file exists and is accessible on the filesystem.

#### Response (200 OK)

```json
{
  "exists": true,
  "readable": true,
  "size": 7654321,
  "modified": "2025-10-20T15:30:00.000Z"
}
```

Or if missing:
```json
{
  "exists": false,
  "readable": false,
  "error": "ENOENT: no such file or directory"
}
```

### Endpoint: Get Track Statistics

**GET** `/api/tracks/stats`

Get aggregate statistics across all tracks in the library.

#### Response (200 OK)

```json
{
  "total": 15234,
  "missing": 12,
  "analyzed": 15100,
  "duplicates": 45,
  "total_size": 52345678900,
  "avg_duration": 285.5
}
```

| Field | Description |
|-------|-------------|
| `total` | Total tracks in database |
| `missing` | Count of missing/unavailable tracks |
| `analyzed` | Count of tracks with analysis data (BPM, key, etc.) |
| `duplicates` | Count of duplicate tracks (same audio hash) |
| `total_size` | Total file size in bytes |
| `avg_duration` | Average track duration in seconds |

### Example: Building a Track Detail View

```javascript
async function getCompleteTrackDetails(trackId) {
  // Get main track data
  const trackResponse = await fetch(`/api/tracks/${trackId}`);
  const track = await trackResponse.json();

  // Get beat data
  const beatsResponse = await fetch(`/api/tracks/${trackId}/beats`);
  const beatsData = await beatsResponse.json();

  // Get downbeat data
  const downbeatsResponse = await fetch(`/api/tracks/${trackId}/downbeats`);
  const downbeatsData = await downbeatsResponse.json();

  // Get waveform data (zoom level 2)
  const waveformResponse = await fetch(`/api/tracks/${trackId}/waveform?zoom=2`);
  const waveformData = await waveformResponse.json();

  // Verify file exists
  const verifyResponse = await fetch(`/api/tracks/${trackId}/verify`);
  const verifyData = await verifyResponse.json();

  return {
    ...track,
    beats: beatsData.beats,
    downbeats: downbeatsData.downbeats,
    waveform: waveformData.waveform,
    fileStatus: verifyData
  };
}

// Usage
const details = await getCompleteTrackDetails('track-uuid');
console.log(`${details.title} by ${details.artist}`);
console.log(`BPM: ${details.bpm}, Key: ${details.musical_key}`);
console.log(`Beats: ${details.beats.length}, Downbeats: ${details.downbeats.length}`);
console.log(`File exists: ${details.fileStatus.exists}`);
```

---

## Managing Missing Media

The system tracks tracks whose files are temporarily unavailable (e.g., disconnected external drives). Missing tracks remain in the database with their metadata but are marked with `is_missing = true`.

### Endpoint: Get Missing Tracks

**GET** `/api/library/directories/:id/missing`

Get all missing tracks in a library with pagination.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | Integer | `1` | Page number |
| `limit` | Integer | `50` | Results per page (max: 1000) |

#### Response (200 OK)

```json
{
  "tracks": [
    {
      "id": "track-uuid",
      "file_path": "/media/external/DJ_Pool/track.mp3",
      "relative_path": "Artist/Album/track.mp3",
      "library_directory_id": "library-uuid",
      "title": "Track Title",
      "artist": "Artist Name",
      "is_missing": true,
      "missing_since": "2025-10-20T08:00:00.000Z",
      "file_size": 7654321,
      "duration_seconds": 320.5
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 50,
  "totalPages": 1
}
```

### Endpoint: Get Missing Track Statistics

**GET** `/api/library/directories/:id/missing/stats`

Get statistics about missing tracks in a library.

#### Response (200 OK)

```json
{
  "total_missing": 45,
  "missing_over_7_days": 12,
  "missing_over_30_days": 8,
  "missing_over_90_days": 2,
  "oldest_missing": "2025-07-15T10:30:00.000Z",
  "total_size": 345678900
}
```

| Field | Description |
|-------|-------------|
| `total_missing` | Total count of missing tracks |
| `missing_over_7_days` | Count missing for more than 7 days |
| `missing_over_30_days` | Count missing for more than 30 days |
| `missing_over_90_days` | Count missing for more than 90 days |
| `oldest_missing` | Timestamp of oldest missing track |
| `total_size` | Total file size of missing tracks (bytes) |

### Endpoint: Cleanup Missing Tracks

**POST** `/api/library/directories/:id/cleanup`

Remove missing tracks from the database that have been unavailable for a specified period.

#### Request Body

```json
{
  "remove_missing_older_than_days": 30,
  "keep_playlists_intact": true,
  "backup_metadata": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `remove_missing_older_than_days` | Integer | `30` | Only remove tracks missing for this many days |
| `keep_playlists_intact` | Boolean | `true` | Don't remove tracks that are in playlists |
| `backup_metadata` | Boolean | `true` | Write JSON backup to library directory before deleting |

#### Response (200 OK)

```json
{
  "removed": 8,
  "kept_for_playlists": 4,
  "backup_path": "/media/external/DJ_Pool/.mismo_backup_2025-10-23.json"
}
```

| Field | Description |
|-------|-------------|
| `removed` | Number of tracks deleted from database |
| `kept_for_playlists` | Number of tracks kept due to playlist membership |
| `backup_path` | Path to backup JSON file (if `backup_metadata = true`) |

#### Backup File Format

```json
{
  "library_directory_id": "library-uuid",
  "library_path": "/media/external/DJ_Pool",
  "backup_date": "2025-10-23T12:00:00.000Z",
  "tracks": [
    {
      "id": "track-uuid",
      "file_path": "/media/external/DJ_Pool/track.mp3",
      "relative_path": "Artist/Album/track.mp3",
      "title": "Track Title",
      "artist": "Artist Name",
      "bpm": 128.0,
      "musical_key": 0,
      "missing_since": "2025-09-15T08:00:00.000Z"
    }
  ]
}
```

### Endpoint: Restore Missing Tracks

**POST** `/api/library/directories/:id/restore`

Check if missing tracks' files have become available again and restore them.

#### Response (200 OK)

```json
{
  "restored": 12,
  "still_missing": 33
}
```

| Field | Description |
|-------|-------------|
| `restored` | Number of tracks successfully restored |
| `still_missing` | Number of tracks still unavailable |

### Endpoint: Mark Track as Missing

**POST** `/api/tracks/:id/mark-missing`

Manually mark a track as missing.

#### Response (200 OK)

```json
{
  "id": "track-uuid",
  "is_missing": true,
  "missing_since": "2025-10-23T12:00:00.000Z"
}
```

### Endpoint: Mark Track as Found

**POST** `/api/tracks/:id/mark-found`

Manually mark a track as found/available.

#### Response (200 OK)

```json
{
  "id": "track-uuid",
  "is_missing": false,
  "missing_since": null
}
```

### Example: Missing Media Workflow

```javascript
class MissingMediaManager {
  constructor(libraryId, apiBase = '/api') {
    this.libraryId = libraryId;
    this.apiBase = apiBase;
  }

  async getStats() {
    const response = await fetch(`${this.apiBase}/library/directories/${this.libraryId}/missing/stats`);
    return await response.json();
  }

  async getMissingTracks(page = 1, limit = 50) {
    const response = await fetch(`${this.apiBase}/library/directories/${this.libraryId}/missing?page=${page}&limit=${limit}`);
    return await response.json();
  }

  async cleanup(options = {}) {
    const response = await fetch(`${this.apiBase}/library/directories/${this.libraryId}/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remove_missing_older_than_days: options.olderThanDays || 30,
        keep_playlists_intact: options.keepPlaylists !== false,
        backup_metadata: options.backup !== false
      })
    });
    return await response.json();
  }

  async restore() {
    const response = await fetch(`${this.apiBase}/library/directories/${this.libraryId}/restore`, {
      method: 'POST'
    });
    return await response.json();
  }

  async checkLibraryAvailability() {
    const response = await fetch(`${this.apiBase}/library/directories/${this.libraryId}/check-availability`, {
      method: 'POST'
    });
    return await response.json();
  }
}

// Usage: External drive workflow
const manager = new MissingMediaManager('external-drive-library-uuid');

// Check if drive is connected
const availability = await manager.checkLibraryAvailability();
console.log(`Library available: ${availability.is_available}`);

if (availability.is_available) {
  // Drive reconnected - restore missing tracks
  const restored = await manager.restore();
  console.log(`Restored ${restored.restored} tracks, ${restored.still_missing} still missing`);
} else {
  // Drive disconnected - check stats
  const stats = await manager.getStats();
  console.log(`${stats.total_missing} tracks missing`);
  console.log(`${stats.missing_over_30_days} missing over 30 days`);

  // Clean up old missing tracks (older than 90 days)
  const cleanup = await manager.cleanup({ olderThanDays: 90 });
  console.log(`Removed ${cleanup.removed} tracks`);
  console.log(`Backup saved to: ${cleanup.backup_path}`);
}
```

---

## Duplicate Detection

The system automatically detects duplicate tracks using audio fingerprinting (file hash). Duplicates are linked via `duplicate_group_id`.

### Endpoint: Get Duplicate Tracks

**GET** `/api/tracks/duplicates/:groupId`

Get all tracks in a duplicate group.

#### Response (200 OK)

```json
{
  "duplicate_group_id": "group-uuid",
  "canonical_track_id": "track-uuid-1",
  "total_duplicates": 3,
  "tracks": [
    {
      "id": "track-uuid-1",
      "file_path": "/Music/original.mp3",
      "relative_path": "Artist/Album/track.mp3",
      "library_directory_id": "library-1",
      "title": "Track Title",
      "artist": "Artist Name",
      "file_size": 7654321,
      "file_hash": "sha256:abcdef...",
      "is_canonical": true
    },
    {
      "id": "track-uuid-2",
      "file_path": "/DJ_Pool/copy.mp3",
      "relative_path": "Artist/track.mp3",
      "library_directory_id": "library-2",
      "title": "Track Title",
      "artist": "Artist Name",
      "file_size": 7654321,
      "file_hash": "sha256:abcdef...",
      "is_canonical": false
    }
  ]
}
```

### Database Schema: Duplicate Groups

```sql
CREATE TABLE duplicate_groups (
    id TEXT PRIMARY KEY,              -- UUID
    canonical_track_id TEXT,          -- Reference to "master" track
    file_hash TEXT NOT NULL,          -- Shared audio hash
    total_duplicates INTEGER,         -- Count of tracks in group
    date_created DATETIME,
    FOREIGN KEY (canonical_track_id) REFERENCES tracks(id)
);
```

### How Duplicates Are Detected

1. **File Hash Computation**: During scanning, each track's audio content is hashed (excluding ID3 tags)
2. **Hash Comparison**: New tracks are compared against existing hashes
3. **Group Creation**: When a duplicate is found:
   - A `duplicate_group` is created (if it doesn't exist)
   - Both tracks are assigned the same `duplicate_group_id`
   - The first analyzed track becomes the canonical track
4. **Analysis Sharing**: Analysis data from the canonical track can be copied to duplicates

### Example: Working with Duplicates

```javascript
async function manageDuplicates(trackId) {
  // Get track details
  const trackResponse = await fetch(`/api/tracks/${trackId}`);
  const track = await trackResponse.json();

  if (!track.duplicate_group_id) {
    console.log('Track has no duplicates');
    return;
  }

  // Get all duplicates in the group
  const dupResponse = await fetch(`/api/tracks/duplicates/${track.duplicate_group_id}`);
  const duplicates = await dupResponse.json();

  console.log(`Found ${duplicates.total_duplicates} copies of this track:`);
  duplicates.tracks.forEach(dup => {
    const status = dup.is_canonical ? '[MASTER]' : '';
    console.log(`${status} ${dup.file_path} (${dup.file_size} bytes)`);
  });

  // Copy analysis from canonical to a duplicate
  const canonical = duplicates.tracks.find(t => t.is_canonical);
  const copy = duplicates.tracks.find(t => !t.is_canonical);

  if (canonical && copy) {
    const copyResponse = await fetch(`/api/tracks/${copy.id}/copy-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_track_id: canonical.id })
    });
    console.log('Analysis copied to duplicate');
  }
}
```

---

## API Reference

### Library Directory Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/library/directories` | List all library directories |
| **GET** | `/api/library/directories?is_active=true` | Filter by active status |
| **GET** | `/api/library/directories?is_available=true` | Filter by availability |
| **GET** | `/api/library/directories/:id` | Get single library directory |
| **POST** | `/api/library/directories` | Create new library directory |
| **PUT** | `/api/library/directories/:id` | Update library settings |
| **DELETE** | `/api/library/directories/:id` | Delete library directory |
| **DELETE** | `/api/library/directories/:id?delete_tracks=true` | Delete library and tracks |
| **POST** | `/api/library/directories/:id/check-availability` | Check if directory exists |
| **POST** | `/api/library/directories/check-all-availability` | Check all directories |
| **GET** | `/api/library/directories/:id/browse` | Browse root directory |
| **GET** | `/api/library/directories/:id/browse?path={path}` | Browse specific folder |
| **GET** | `/api/library/directories/:id/breadcrumbs?path={path}` | Get navigation breadcrumbs |
| **POST** | `/api/library/directories/:id/cleanup` | Cleanup old missing tracks |
| **POST** | `/api/library/directories/:id/restore` | Restore missing tracks |
| **GET** | `/api/library/directories/:id/missing` | Get missing tracks (paginated) |
| **GET** | `/api/library/directories/:id/missing/stats` | Get missing track statistics |

### Track Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/tracks` | List all tracks (with filters/pagination) |
| **GET** | `/api/tracks?search={query}` | Search tracks |
| **GET** | `/api/tracks?artist={artist}` | Filter by artist |
| **GET** | `/api/tracks?genre={genre}` | Filter by genre |
| **GET** | `/api/tracks?bpm_min={min}&bpm_max={max}` | Filter by BPM range |
| **GET** | `/api/tracks?key={key}` | Filter by musical key |
| **GET** | `/api/tracks?library_id={id}` | Filter by library |
| **GET** | `/api/tracks?is_missing={bool}` | Filter by missing status |
| **GET** | `/api/tracks/stats` | Get track statistics |
| **GET** | `/api/tracks/:id` | Get single track |
| **GET** | `/api/tracks/:id/beats` | Get beat data array |
| **GET** | `/api/tracks/:id/downbeats` | Get downbeat data array |
| **GET** | `/api/tracks/:id/waveform` | Get waveform data (all levels) |
| **GET** | `/api/tracks/:id/waveform?zoom={level}` | Get waveform at zoom level |
| **GET** | `/api/tracks/:id/verify` | Verify file exists |
| **POST** | `/api/tracks` | Create track manually |
| **PUT** | `/api/tracks/:id` | Update track metadata |
| **POST** | `/api/tracks/:id/mark-missing` | Mark track as missing |
| **POST** | `/api/tracks/:id/mark-found` | Mark track as found |
| **POST** | `/api/tracks/:id/move` | Move track file |
| **POST** | `/api/tracks/:id/rename` | Rename track file |
| **POST** | `/api/tracks/:id/copy-analysis` | Copy analysis from another track |
| **DELETE** | `/api/tracks/:id` | Delete track from database |
| **DELETE** | `/api/tracks/:id/file` | Delete track file from disk |

### Duplicate Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/tracks/duplicates/:groupId` | Get all tracks in duplicate group |

---

## Performance Considerations

### Database Indexes

The system uses compound indexes for optimal query performance:

```sql
-- Browsing queries
CREATE INDEX idx_tracks_library_path
ON tracks(library_directory_id, relative_path);

-- Browsing with missing filter
CREATE INDEX idx_tracks_browse
ON tracks(library_directory_id, is_missing, relative_path);

-- Individual field indexes
CREATE INDEX idx_tracks_artist ON tracks(artist);
CREATE INDEX idx_tracks_bpm ON tracks(bpm);
CREATE INDEX idx_tracks_key ON tracks(musical_key);
CREATE INDEX idx_tracks_genre ON tracks(genre);
CREATE INDEX idx_tracks_date_added ON tracks(date_added);
CREATE INDEX idx_tracks_library_directory ON tracks(library_directory_id);
CREATE INDEX idx_tracks_file_hash ON tracks(file_hash);
CREATE INDEX idx_tracks_missing ON tracks(is_missing);
```

### Query Performance

**Browse queries** (50,000 track library):
```sql
-- Get folder contents at specific path
SELECT * FROM tracks
WHERE library_directory_id = ?
  AND relative_path LIKE 'Artist/Album/%'
  AND relative_path NOT LIKE 'Artist/Album/%/%'
  AND is_missing = 0;
-- Query time: ~1-5ms (uses idx_tracks_browse)
```

**Folder statistics**:
```sql
-- Count tracks in folder and subfolders
SELECT COUNT(*), SUM(file_size)
FROM tracks
WHERE library_directory_id = ?
  AND relative_path LIKE 'Artist/Album/%'
  AND is_missing = 0;
-- Query time: ~1-5ms (uses idx_tracks_browse)
```

### Optimization Tips

1. **Exclude BLOB Fields**: By default, track queries exclude `beats_data` and `downbeats_data` BLOB fields to reduce overhead. Only fetch beat data when needed via dedicated endpoints.

2. **Pagination**: Always paginate large result sets. Default limit is 50, maximum is 1000.

3. **Filter Early**: Apply filters (`library_id`, `is_missing`, `bpm_min/max`) to reduce result set before sorting.

4. **Index-Friendly Queries**:
   - Use indexed fields in WHERE clauses (`library_directory_id`, `artist`, `bpm`, `key`, `genre`)
   - Sort by indexed fields when possible

5. **Batch Operations**: When processing many tracks, use transactions and batch inserts/updates.

### Scaling Characteristics

| Library Size | Browse Query | Search Query | Scan Time |
|--------------|--------------|--------------|-----------|
| 1,000 tracks | < 1ms | < 5ms | ~30s |
| 10,000 tracks | ~1-2ms | ~10ms | ~5min |
| 50,000 tracks | ~1-5ms | ~20ms | ~25min |
| 100,000 tracks | ~2-10ms | ~50ms | ~50min |

**Note**: Scan times assume SSD storage and include metadata extraction. HDD storage will be slower.

---

## Best Practices

### 1. Library Organization

**DO:**
- ✅ Create separate library directories for different purposes (e.g., "Music", "DJ Pool", "Samples")
- ✅ Use consistent folder structures within each library
- ✅ Mark external drives with `is_removable: true`
- ✅ Set appropriate scan patterns to exclude non-audio files

**DON'T:**
- ❌ Create nested library directories
- ❌ Store non-music files in library directories (use exclude patterns)
- ❌ Change library `path` after creation (delete and recreate instead)

### 2. Searching & Filtering

**DO:**
- ✅ Combine filters to narrow results (e.g., genre + BPM range)
- ✅ Use pagination for large result sets
- ✅ Filter by `is_missing: false` to exclude unavailable tracks
- ✅ Use indexed fields for sorting (artist, bpm, date_added, play_count)

**DON'T:**
- ❌ Request more than 1000 tracks per page
- ❌ Perform full-text search without additional filters

### 3. Missing Media Management

**DO:**
- ✅ Check availability before cleanup: `/api/library/directories/:id/check-availability`
- ✅ Always backup metadata before cleanup (`backup_metadata: true`)
- ✅ Use restore endpoint when drives reconnect
- ✅ Monitor missing track statistics regularly

**DON'T:**
- ❌ Delete missing tracks immediately (use 30+ day threshold)
- ❌ Disable backup metadata option
- ❌ Remove tracks in playlists unless intentional

### 4. Duplicate Handling

**DO:**
- ✅ Review duplicates periodically
- ✅ Designate canonical tracks (best quality copy)
- ✅ Copy analysis data from canonical to duplicates
- ✅ Keep duplicates if they serve different purposes (e.g., different libraries)

**DON'T:**
- ❌ Automatically delete all duplicates (you may want copies in multiple libraries)
- ❌ Delete the canonical track

### 5. Performance Optimization

**DO:**
- ✅ Use filters to reduce query scope
- ✅ Request only needed fields (use default track queries without BLOBs)
- ✅ Fetch beat data separately only when needed
- ✅ Implement client-side caching for frequently accessed data
- ✅ Use pagination for large result sets

**DON'T:**
- ❌ Fetch all tracks without filters
- ❌ Request beat/downbeat data if not needed
- ❌ Perform heavy queries on UI thread

### 6. Error Handling

**DO:**
- ✅ Handle 404 errors (track/library not found)
- ✅ Handle 400 errors (validation failures)
- ✅ Implement retry logic for network errors
- ✅ Check `exists` field in verify responses

**DON'T:**
- ❌ Assume all requests succeed
- ❌ Ignore missing track status in UI
- ❌ Retry immediately on 400/404 errors

---

## Example: Complete Library Management System

```javascript
class MismoDJLibrary {
  constructor(apiBase = '/api') {
    this.apiBase = apiBase;
  }

  // ==================== LIBRARY DIRECTORIES ====================

  async getAllLibraries(filters = {}) {
    const params = new URLSearchParams();
    if (filters.is_active !== undefined) params.set('is_active', filters.is_active);
    if (filters.is_available !== undefined) params.set('is_available', filters.is_available);

    const response = await fetch(`${this.apiBase}/library/directories?${params}`);
    return await response.json();
  }

  async createLibrary(data) {
    const response = await fetch(`${this.apiBase}/library/directories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create library');
    }

    return await response.json();
  }

  async updateLibrary(id, updates) {
    const response = await fetch(`${this.apiBase}/library/directories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return await response.json();
  }

  async deleteLibrary(id, deleteTracks = false) {
    const url = `${this.apiBase}/library/directories/${id}?delete_tracks=${deleteTracks}`;
    const response = await fetch(url, { method: 'DELETE' });
    return await response.json();
  }

  // ==================== BROWSING ====================

  async browse(libraryId, relativePath = '') {
    const params = new URLSearchParams();
    if (relativePath) params.set('path', relativePath);

    const response = await fetch(`${this.apiBase}/library/directories/${libraryId}/browse?${params}`);
    return await response.json();
  }

  async getBreadcrumbs(libraryId, relativePath = '') {
    const params = new URLSearchParams({ path: relativePath });
    const response = await fetch(`${this.apiBase}/library/directories/${libraryId}/breadcrumbs?${params}`);
    return await response.json();
  }

  // ==================== TRACK RETRIEVAL ====================

  async getTracks(filters = {}, pagination = {}) {
    const params = new URLSearchParams();

    // Filters
    if (filters.search) params.set('search', filters.search);
    if (filters.artist) params.set('artist', filters.artist);
    if (filters.genre) params.set('genre', filters.genre);
    if (filters.bpm_min) params.set('bpm_min', filters.bpm_min);
    if (filters.bpm_max) params.set('bpm_max', filters.bpm_max);
    if (filters.key !== undefined) params.set('key', filters.key);
    if (filters.library_id) params.set('library_id', filters.library_id);
    if (filters.is_missing !== undefined) params.set('is_missing', filters.is_missing);

    // Pagination
    if (pagination.page) params.set('page', pagination.page);
    if (pagination.limit) params.set('limit', pagination.limit);
    if (pagination.sort) params.set('sort', pagination.sort);
    if (pagination.order) params.set('order', pagination.order);

    const response = await fetch(`${this.apiBase}/tracks?${params}`);
    return await response.json();
  }

  async getTrack(id) {
    const response = await fetch(`${this.apiBase}/tracks/${id}`);
    if (!response.ok) {
      throw new Error('Track not found');
    }
    return await response.json();
  }

  async getTrackBeats(id) {
    const response = await fetch(`${this.apiBase}/tracks/${id}/beats`);
    if (!response.ok) {
      throw new Error('No beat data available');
    }
    return await response.json();
  }

  async getTrackDownbeats(id) {
    const response = await fetch(`${this.apiBase}/tracks/${id}/downbeats`);
    if (!response.ok) {
      throw new Error('No downbeat data available');
    }
    return await response.json();
  }

  async verifyTrack(id) {
    const response = await fetch(`${this.apiBase}/tracks/${id}/verify`);
    return await response.json();
  }

  // ==================== MISSING MEDIA ====================

  async getMissingTracks(libraryId, page = 1, limit = 50) {
    const response = await fetch(`${this.apiBase}/library/directories/${libraryId}/missing?page=${page}&limit=${limit}`);
    return await response.json();
  }

  async getMissingStats(libraryId) {
    const response = await fetch(`${this.apiBase}/library/directories/${libraryId}/missing/stats`);
    return await response.json();
  }

  async cleanupMissing(libraryId, options = {}) {
    const response = await fetch(`${this.apiBase}/library/directories/${libraryId}/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remove_missing_older_than_days: options.olderThanDays || 30,
        keep_playlists_intact: options.keepPlaylists !== false,
        backup_metadata: options.backup !== false
      })
    });
    return await response.json();
  }

  async restoreMissing(libraryId) {
    const response = await fetch(`${this.apiBase}/library/directories/${libraryId}/restore`, {
      method: 'POST'
    });
    return await response.json();
  }

  // ==================== STATISTICS ====================

  async getTrackStats() {
    const response = await fetch(`${this.apiBase}/tracks/stats`);
    return await response.json();
  }
}

// ==================== USAGE EXAMPLES ====================

const library = new MismoDJLibrary();

// Create libraries
const mainLibrary = await library.createLibrary({
  path: '/home/user/Music',
  name: 'My Music',
  is_removable: false
});

const djPoolLibrary = await library.createLibrary({
  path: '/media/external/DJ_Pool',
  name: 'DJ Pool',
  is_removable: true,
  priority: 1
});

// Browse folders
const rootContents = await library.browse(mainLibrary.id);
console.log(`${rootContents.folders.length} folders, ${rootContents.tracks.length} tracks`);

const folderContents = await library.browse(mainLibrary.id, 'House/Deep House');
console.log(`In Deep House: ${folderContents.stats.totalTracks} tracks`);

// Search tracks
const houseTracks = await library.getTracks({
  genre: 'House',
  bpm_min: 120,
  bpm_max: 130,
  is_missing: false
}, {
  page: 1,
  limit: 100,
  sort: 'bpm',
  order: 'ASC'
});

console.log(`Found ${houseTracks.total} House tracks (120-130 BPM)`);

// Get track details
const track = await library.getTrack(houseTracks.tracks[0].id);
const beats = await library.getTrackBeats(track.id);
console.log(`${track.title}: ${beats.beats.length} beats`);

// Check missing tracks
const missingStats = await library.getMissingStats(djPoolLibrary.id);
if (missingStats.total_missing > 0) {
  console.log(`${missingStats.total_missing} tracks missing`);

  // Try to restore
  const restored = await library.restoreMissing(djPoolLibrary.id);
  console.log(`Restored ${restored.restored} tracks`);

  // Cleanup old missing tracks
  if (missingStats.missing_over_90_days > 0) {
    const cleanup = await library.cleanupMissing(djPoolLibrary.id, {
      olderThanDays: 90,
      backup: true
    });
    console.log(`Cleaned up ${cleanup.removed} tracks`);
  }
}

// Get statistics
const stats = await library.getTrackStats();
console.log(`Total: ${stats.total} tracks, ${stats.missing} missing, ${stats.duplicates} duplicates`);
```

---

## Changelog

**Version 1.0** (October 23, 2025)
- Initial documentation
- Covers library directory management
- Includes track retrieval and filtering
- Documents directory browsing system
- Explains missing media handling
- Details duplicate detection
- Provides complete API reference
- Includes performance considerations and best practices

---

## Support

For issues, questions, or feature requests, please contact the development team or refer to the main project repository.

**Related Documentation:**
- API Integration Guide
- Database Schema Reference
- Audio Analysis Documentation
- Server Configuration Guide

---

*End of Library System Client Guide*
