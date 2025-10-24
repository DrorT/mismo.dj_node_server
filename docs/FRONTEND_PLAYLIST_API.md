# Frontend Playlist API Documentation

**Version:** 1.0
**Last Updated:** 2025-10-24
**Base URL:** `http://localhost:12047/api`

---

## Table of Contents

1. [Overview](#overview)
2. [Data Models](#data-models)
3. [API Endpoints](#api-endpoints)
   - [Playlist CRUD](#playlist-crud)
   - [Track Management](#track-management)
   - [Smart Playlists](#smart-playlists)
   - [DJ Sessions](#dj-sessions)
   - [Thinking Playlist](#thinking-playlist)
   - [Utilities](#utilities)
4. [Error Handling](#error-handling)
5. [Code Examples](#code-examples)
6. [Best Practices](#best-practices)

---

## Overview

The Playlist API provides comprehensive management for four types of playlists:

- **Static Playlists** - Manual curation of tracks
- **Smart Playlists** - Auto-populated based on criteria (BPM, key, energy, etc.)
- **Session Playlists** - Track DJ performance history
- **Temporary Playlists** - Single "Thinking Playlist" for exploration

### Key Features

✅ Full CRUD operations on playlists
✅ Add, remove, reorder tracks with per-track metadata
✅ Smart playlist criteria with 20+ filter types
✅ DJ session tracking with automatic finalization
✅ Thinking playlist workflow (explore → promote)
✅ M3U playlist export
✅ Search and duplicate operations

### Authentication

Currently no authentication required. All endpoints are publicly accessible.

---

## Data Models

### Playlist Object

```typescript
interface Playlist {
  // Core fields
  id: string;                      // UUID
  name: string;                    // Playlist name (1-200 chars)
  type: 'static' | 'smart' | 'session' | 'temp';
  description: string | null;      // Optional description

  // Metadata
  color: string | null;            // Hex color code (e.g., "#FF5733")
  icon: string | null;             // Icon identifier
  is_favorite: 0 | 1;              // Boolean as integer
  is_temporary: 0 | 1;             // For thinking playlist
  is_readonly: 0 | 1;              // For finalized sessions

  // Smart playlist specific
  smart_criteria: object | null;   // JSON criteria (see below)

  // Session specific
  session_date: number | null;     // Unix timestamp
  session_venue: string | null;    // Venue name
  session_duration: number | null; // Seconds

  // Stats
  track_count: number;             // Number of tracks (computed)
  total_duration: number;          // Total seconds (computed)

  // Timestamps
  created_at: number;              // Unix timestamp
  updated_at: number;              // Unix timestamp
  last_accessed: number | null;    // Unix timestamp

  // Tracks (if included)
  tracks?: PlaylistTrack[];        // Array of tracks with metadata
}
```

### PlaylistTrack Object

```typescript
interface PlaylistTrack {
  // Junction fields
  playlist_id: string;             // UUID
  track_id: string;                // UUID
  position: number;                // 0-based index
  date_added: number;              // Unix timestamp

  // Per-track metadata
  notes: string | null;            // DJ notes
  cue_in: number | null;           // Custom start (milliseconds)
  cue_out: number | null;          // Custom end (milliseconds)
  rating_in_context: number | null; // 1-5 rating

  // Session specific
  played_at: number | null;        // Unix timestamp
  play_duration: number | null;    // Milliseconds

  // Full track object
  track: Track;                    // Complete track data
}
```

### Track Object (Reference)

```typescript
interface Track {
  id: string;                      // UUID
  file_path: string;               // Absolute path
  relative_path: string;           // Relative to library
  library_directory_id: string;    // UUID

  // Metadata
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;

  // Audio properties
  duration_seconds: number;
  sample_rate: number;
  bit_rate: number;
  channels: number;

  // Analysis (from Python server)
  bpm: number;                     // Beats per minute
  musical_key: number;             // 0-11 (C, C#, D, ..., B)
  mode: 0 | 1;                     // 0=minor, 1=major
  energy: number;                  // -20 to 0 (dB)
  danceability: number;            // 0-1
  valence: number;                 // 0-10 (mood)
  arousal: number;                 // 0-10 (intensity)

  // Other fields omitted for brevity
}
```

### Smart Playlist Criteria

```typescript
interface SmartCriteria {
  // BPM filters
  bpm_min?: number;                // Minimum BPM
  bpm_max?: number;                // Maximum BPM

  // Key filters
  key?: number;                    // 0-11 (C, C#, D, ..., B)
  mode?: 0 | 1;                    // 0=minor, 1=major

  // Genre filters
  genres?: string[];               // Array of genre names

  // Energy/mood filters
  energy_min?: number;             // Minimum energy (dB)
  energy_max?: number;             // Maximum energy (dB)
  danceability_min?: number;       // Minimum danceability (0-1)
  valence_min?: number;            // Minimum valence (0-10)
  valence_max?: number;            // Maximum valence (0-10)
  arousal_min?: number;            // Minimum arousal (0-10)
  arousal_max?: number;            // Maximum arousal (0-10)

  // Date filters
  date_added_after?: number;       // Unix timestamp
  date_added_before?: number;      // Unix timestamp
  date_analyzed_after?: number;    // Unix timestamp

  // Play stats
  play_count_min?: number;         // Minimum plays
  last_played_after?: number;      // Unix timestamp
  rating_min?: number;             // Minimum rating (1-5)

  // Audio properties
  bit_rate_min?: number;           // Minimum bitrate (kbps)
  duration_min?: number;           // Minimum duration (seconds)
  duration_max?: number;           // Maximum duration (seconds)

  // File filters
  library_directory_id?: string;   // UUID of library
  path_contains?: string;          // Substring match on relative_path

  // Analysis flags
  is_analyzed?: boolean;           // Has analysis data
  has_stems?: boolean;             // Has stem files
}
```

**Note:** All criteria are combined with AND logic. A track must match ALL specified criteria to be included.

---

## API Endpoints

### Playlist CRUD

#### List All Playlists

```
GET /playlists
```

**Query Parameters:**
- `type` (optional): Filter by type (`static`, `smart`, `session`, `temp`)
- `is_favorite` (optional): Filter favorites (`true`, `false`)
- `is_temporary` (optional): Filter temporary (`true`, `false`)
- `search` (optional): Search in name/description

**Response:**
```json
{
  "playlists": [
    {
      "id": "uuid",
      "name": "My Playlist",
      "type": "static",
      "track_count": 42,
      "total_duration": 7200,
      "is_favorite": 0,
      "created_at": 1729785600,
      "updated_at": 1729785600
    }
  ],
  "count": 1
}
```

**Status Codes:**
- `200 OK` - Success
- `500 Internal Server Error` - Database error

---

#### Get Single Playlist

```
GET /playlists/:id
```

**Query Parameters:**
- `include_tracks` (optional): Include tracks array (default: `true`)

**Response:**
```json
{
  "id": "uuid",
  "name": "My Playlist",
  "type": "static",
  "description": "Best tracks for summer",
  "color": "#FF5733",
  "is_favorite": 1,
  "track_count": 42,
  "total_duration": 7200,
  "created_at": 1729785600,
  "updated_at": 1729785600,
  "tracks": [
    {
      "playlist_id": "uuid",
      "track_id": "uuid",
      "position": 0,
      "notes": "Great opener",
      "cue_in": 15000,
      "cue_out": 180000,
      "rating_in_context": 5,
      "track": { /* full track object */ }
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

#### Create Playlist

```
POST /playlists
```

**Request Body:**
```json
{
  "name": "My Playlist",
  "type": "static",
  "description": "Optional description",
  "color": "#FF5733",
  "icon": "music",
  "is_favorite": false,
  "criteria": {
    "bpm_min": 120,
    "bpm_max": 135,
    "energy_min": 0.6
  }
}
```

**Required Fields:**
- `name` (string, 1-200 chars)
- `type` (string: `static`, `smart`, `session`, `temp`)
- `criteria` (object, **required** if `type` is `smart`)

**Optional Fields:**
- `description` (string, max 1000 chars)
- `color` (string, hex color)
- `icon` (string, max 50 chars)
- `is_favorite` (boolean)
- `session_venue` (string, for sessions)
- `session_date` (number, unix timestamp, for sessions)

**Response:**
```json
{
  "id": "uuid",
  "name": "My Playlist",
  "type": "static",
  "created_at": 1729785600,
  "updated_at": 1729785600
}
```

**Status Codes:**
- `201 Created` - Success
- `400 Bad Request` - Validation error
- `500 Internal Server Error` - Database error

---

#### Update Playlist

```
PUT /playlists/:id
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "color": "#00FF00",
  "is_favorite": true
}
```

**Updatable Fields:**
- `name` (string)
- `description` (string)
- `color` (string)
- `icon` (string)
- `is_favorite` (boolean)
- `smart_criteria` (object, for smart playlists)
- `session_venue` (string, for sessions)
- `session_duration` (number, for sessions)
- `is_readonly` (boolean, for sessions)

**Notes:**
- Cannot update `type`
- Cannot update readonly (finalized) sessions unless setting `is_readonly: false`
- At least one field must be provided

**Response:**
```json
{
  "id": "uuid",
  "name": "Updated Name",
  "description": "Updated description",
  "updated_at": 1729785700
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Validation error or readonly violation
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

#### Delete Playlist

```
DELETE /playlists/:id
```

**Response:**
```json
{
  "message": "Playlist deleted successfully",
  "id": "uuid"
}
```

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

#### Get Playlist Statistics

```
GET /playlists/:id/stats
```

**Response:**
```json
{
  "track_count": 42,
  "total_duration": 7200,
  "avg_bpm": 125.5,
  "key_distribution": {
    "0": 5,
    "5": 12,
    "7": 8
  },
  "genre_distribution": {
    "House": 20,
    "Techno": 15,
    "Trance": 7
  }
}
```

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

### Track Management

#### Add Tracks to Playlist

```
POST /playlists/:id/tracks
```

**Request Body:**
```json
{
  "track_ids": ["uuid1", "uuid2", "uuid3"],
  "position": 5,
  "notes": "Great transition tracks"
}
```

**Required Fields:**
- `track_ids` (array of UUIDs, min 1)

**Optional Fields:**
- `position` (number, 0-based index) - Defaults to end if not specified
- `notes` (string, max 1000 chars) - Applied to all tracks

**Behavior:**
- Tracks are inserted at `position`, shifting existing tracks down
- If `position` is null or omitted, tracks are appended to the end
- Duplicate tracks are allowed (same track can appear multiple times)
- All tracks must exist in the library

**Response:**
```json
{
  "message": "Tracks added successfully",
  "added_count": 3
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Validation error or tracks don't exist
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

#### Remove Track from Playlist

```
DELETE /playlists/:id/tracks/:trackId
```

**Behavior:**
- Removes the track from the playlist
- Resequences positions to fill the gap
- If track appears multiple times, removes the first occurrence

**Response:**
```json
{
  "message": "Track removed successfully"
}
```

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Track not in playlist
- `500 Internal Server Error` - Database error

---

#### Reorder Tracks

```
PUT /playlists/:id/tracks/reorder
```

**Request Body:**
```json
{
  "track_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Required Fields:**
- `track_ids` (array of UUIDs) - Must include ALL tracks in new order

**Validation:**
- Must include exactly the same tracks currently in the playlist
- Cannot add or remove tracks (use add/remove endpoints)
- Each track must appear exactly once

**Response:**
```json
{
  "message": "Tracks reordered successfully"
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Validation error (missing tracks, extra tracks, etc.)
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

#### Update Track Metadata

```
PUT /playlists/:id/tracks/:trackId
```

**Request Body:**
```json
{
  "notes": "Perfect opener",
  "cue_in": 15000,
  "cue_out": 180000,
  "rating_in_context": 5
}
```

**Optional Fields:**
- `notes` (string, max 1000 chars)
- `cue_in` (number, milliseconds)
- `cue_out` (number, milliseconds)
- `rating_in_context` (number, 1-5)

**Notes:**
- Updates playlist-specific metadata only
- Does not modify the track itself in the library
- At least one field must be provided

**Response:**
```json
{
  "message": "Track metadata updated successfully"
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Validation error
- `404 Not Found` - Track not in playlist
- `500 Internal Server Error` - Database error

---

### Smart Playlists

#### Refresh Smart Playlist

```
POST /playlists/:id/refresh
```

**Behavior:**
- Re-evaluates the smart criteria against the current library
- Adds new tracks that match the criteria
- Removes tracks that no longer match
- Updates `updated_at` timestamp

**Response:**
```json
{
  "added": 5,
  "removed": 2,
  "total": 42
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Not a smart playlist
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

#### Explain Smart Criteria

```
GET /playlists/:id/explain
```

**Response:**
```json
{
  "explanation": "BPM between 120 and 135, Genres: House, Techno, Energy at least 0.6",
  "criteria": {
    "bpm_min": 120,
    "bpm_max": 135,
    "genres": ["House", "Techno"],
    "energy_min": 0.6
  }
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Not a smart playlist
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

#### Convert Smart to Static

```
POST /playlists/:id/convert
```

**Behavior:**
- Freezes the current tracks
- Removes smart criteria
- Changes type from `smart` to `static`
- **Cannot be undone**

**Response:**
```json
{
  "message": "Smart playlist converted to static",
  "track_count": 42
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Not a smart playlist
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

### DJ Sessions

#### Start Session

```
POST /playlists/sessions/start
```

**Request Body:**
```json
{
  "venue": "Club XYZ",
  "date": 1729785600
}
```

**Optional Fields:**
- `venue` (string, max 200 chars)
- `date` (number, unix timestamp) - Defaults to now

**Behavior:**
- Creates a new session playlist
- Auto-generates name: "Session - YYYY-MM-DD - Venue"
- Session is initially not readonly

**Response:**
```json
{
  "id": "uuid",
  "name": "Session - 2025-10-24 - Club XYZ",
  "type": "session",
  "session_venue": "Club XYZ",
  "session_date": 1729785600,
  "is_readonly": 0,
  "created_at": 1729785600
}
```

**Status Codes:**
- `201 Created` - Success
- `400 Bad Request` - Validation error
- `500 Internal Server Error` - Database error

---

#### Log Track Play

```
POST /playlists/sessions/:id/track
```

**Request Body:**
```json
{
  "track_id": "uuid",
  "played_at": 1729785600,
  "duration": 180000,
  "notes": "Great crowd response"
}
```

**Required Fields:**
- `track_id` (UUID)

**Optional Fields:**
- `played_at` (number, unix timestamp) - Defaults to now
- `duration` (number, milliseconds) - Actual play duration
- `notes` (string, max 1000 chars)

**Behavior:**
- Adds track to session if not already present
- Updates `played_at`, `duration`, and `notes` if track already in session
- Updates session's `updated_at` timestamp

**Response:**
```json
{
  "message": "Track play logged successfully"
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Validation error or track doesn't exist
- `404 Not Found` - Session doesn't exist
- `500 Internal Server Error` - Database error

---

#### Finalize Session

```
POST /playlists/sessions/:id/finalize
```

**Behavior:**
- Marks session as readonly
- Calculates session duration from track play times:
  - `duration = (last_track_played_at - first_track_played_at) + last_track_duration`
- Cannot be undone (unless manually setting `is_readonly: false` via update)

**Response:**
```json
{
  "message": "Session finalized",
  "session_duration": 7200
}
```

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Session doesn't exist
- `500 Internal Server Error` - Database error

---

#### Get Active Sessions

```
GET /playlists/sessions/active
```

**Behavior:**
- Returns all sessions where `is_readonly = 0`

**Response:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "name": "Session - 2025-10-24 - Club XYZ",
      "type": "session",
      "session_venue": "Club XYZ",
      "track_count": 15,
      "is_readonly": 0,
      "created_at": 1729785600,
      "updated_at": 1729789200
    }
  ],
  "count": 1
}
```

**Status Codes:**
- `200 OK` - Success
- `500 Internal Server Error` - Database error

---

### Thinking Playlist

#### Get Thinking Playlist

```
GET /playlists/thinking
```

**Behavior:**
- Returns the single global thinking playlist
- Creates it if it doesn't exist
- Always returns `type: "temp"` and `is_temporary: 1`

**Response:**
```json
{
  "id": "uuid",
  "name": "Thinking Playlist",
  "type": "temp",
  "is_temporary": 1,
  "track_count": 5,
  "tracks": [ /* tracks array */ ]
}
```

**Status Codes:**
- `200 OK` - Success
- `500 Internal Server Error` - Database error

---

#### Promote Thinking Playlist

```
POST /playlists/thinking/promote
```

**Request Body:**
```json
{
  "name": "My New Playlist"
}
```

**Required Fields:**
- `name` (string, 1-200 chars)

**Behavior:**
- Duplicates thinking playlist as a new static playlist
- Clears all tracks from the thinking playlist
- Thinking playlist remains available for new exploration

**Response:**
```json
{
  "promoted_playlist": {
    "id": "uuid",
    "name": "My New Playlist",
    "type": "static",
    "is_temporary": 0,
    "track_count": 5
  },
  "new_thinking_playlist": {
    "id": "uuid",
    "name": "Thinking Playlist",
    "type": "temp",
    "track_count": 0
  }
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Validation error
- `500 Internal Server Error` - Database error

---

### Utilities

#### Search Playlists

```
GET /playlists/search?q=query
```

**Query Parameters:**
- `q` (required): Search query (min 1 char)

**Behavior:**
- Searches in playlist `name` and `description` fields
- Case-insensitive
- Uses SQL LIKE with wildcards: `%query%`

**Response:**
```json
{
  "playlists": [ /* array of playlists */ ],
  "count": 5
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Missing query parameter
- `500 Internal Server Error` - Database error

---

#### Duplicate Playlist

```
POST /playlists/:id/duplicate
```

**Request Body:**
```json
{
  "name": "Copy of My Playlist"
}
```

**Required Fields:**
- `name` (string, 1-200 chars)

**Behavior:**
- Creates a new playlist with the same metadata
- Copies all tracks with their playlist-specific metadata
- New playlist is always `type: "static"` (even if source is smart)
- Does not copy readonly status

**Response:**
```json
{
  "id": "uuid",
  "name": "Copy of My Playlist",
  "type": "static",
  "track_count": 42,
  "created_at": 1729785700
}
```

**Status Codes:**
- `201 Created` - Success
- `400 Bad Request` - Validation error
- `404 Not Found` - Source playlist doesn't exist
- `500 Internal Server Error` - Database error

---

#### Export Playlist

```
GET /playlists/:id/export?format=m3u
```

**Query Parameters:**
- `format` (optional): Export format (only `m3u` supported)

**Behavior:**
- Generates extended M3U format with `#EXTINF` tags
- Includes track duration, artist, and title
- Uses absolute file paths
- Sets `Content-Disposition: attachment` header

**Response Headers:**
```
Content-Type: application/x-mpegurl
Content-Disposition: attachment; filename="My Playlist.m3u"
```

**Response Body:**
```
#EXTM3U
# Playlist: My Playlist
# Description: Best tracks for summer
# Exported: 2025-10-24T16:30:00.000Z
# Generated by Mismo DJ

#EXTINF:180,Artist Name - Track Title
/absolute/path/to/track.mp3
#EXTINF:240,Another Artist - Another Track
/absolute/path/to/another-track.mp3
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid format
- `404 Not Found` - Playlist doesn't exist
- `500 Internal Server Error` - Database error

---

## Error Handling

### Error Response Format

All error responses follow this structure:

```json
{
  "error": "Error category",
  "message": "Detailed error message",
  "details": [
    {
      "field": "name",
      "message": "\"name\" is required"
    }
  ]
}
```

**Error Categories:**
- `Validation failed` - Input validation error (400)
- `Not found` - Resource doesn't exist (404)
- `Failed to...` - Operation failed (500)

### Common HTTP Status Codes

- `200 OK` - Success
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid input or validation error
- `404 Not Found` - Resource doesn't exist
- `500 Internal Server Error` - Server-side error

### Validation Errors

The `details` array contains field-level validation errors:

```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "name",
      "message": "\"name\" is required"
    },
    {
      "field": "track_ids",
      "message": "\"track_ids\" must contain at least 1 items"
    }
  ]
}
```

---

## Code Examples

### JavaScript/TypeScript

#### Fetch API (vanilla)

```javascript
const API_BASE = 'http://localhost:12047/api';

// Get all playlists
async function getAllPlaylists() {
  const response = await fetch(`${API_BASE}/playlists`);
  const data = await response.json();
  return data.playlists;
}

// Create a static playlist
async function createPlaylist(name, description) {
  const response = await fetch(`${API_BASE}/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      type: 'static',
      description,
      is_favorite: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Add tracks to playlist
async function addTracks(playlistId, trackIds) {
  const response = await fetch(
    `${API_BASE}/playlists/${playlistId}/tracks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_ids: trackIds }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Create a smart playlist
async function createSmartPlaylist(name, criteria) {
  const response = await fetch(`${API_BASE}/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      type: 'smart',
      criteria,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage examples
try {
  // Create a static playlist
  const playlist = await createPlaylist(
    'Summer Vibes',
    'Best tracks for summer'
  );
  console.log('Created:', playlist);

  // Add some tracks
  await addTracks(playlist.id, [
    'track-uuid-1',
    'track-uuid-2',
    'track-uuid-3',
  ]);

  // Create a smart playlist
  const smartPlaylist = await createSmartPlaylist('High Energy House', {
    bpm_min: 125,
    bpm_max: 135,
    genres: ['House'],
    energy_min: 0.7,
  });
  console.log('Smart playlist:', smartPlaylist);
} catch (error) {
  console.error('Error:', error.message);
}
```

#### Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:12047/api',
  headers: { 'Content-Type': 'application/json' },
});

// Get all playlists
async function getAllPlaylists() {
  const { data } = await api.get('/playlists');
  return data.playlists;
}

// Create playlist
async function createPlaylist(playlistData) {
  const { data } = await api.post('/playlists', playlistData);
  return data;
}

// Update playlist
async function updatePlaylist(id, updates) {
  const { data } = await api.put(`/playlists/${id}`, updates);
  return data;
}

// Delete playlist
async function deletePlaylist(id) {
  const { data } = await api.delete(`/playlists/${id}`);
  return data;
}

// Error handling
try {
  const playlist = await createPlaylist({
    name: 'My Playlist',
    type: 'static',
  });
} catch (error) {
  if (error.response) {
    // Server responded with error
    console.error('Error:', error.response.data.message);
    console.error('Details:', error.response.data.details);
  } else {
    // Network error
    console.error('Network error:', error.message);
  }
}
```

### React Example

```tsx
import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:12047/api';

function PlaylistBrowser() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPlaylists();
  }, []);

  async function loadPlaylists() {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/playlists`);
      const data = await response.json();
      setPlaylists(data.playlists);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this playlist?')) return;

    try {
      await fetch(`${API_BASE}/playlists/${id}`, {
        method: 'DELETE',
      });
      loadPlaylists(); // Refresh list
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Playlists</h1>
      {playlists.map((playlist) => (
        <div key={playlist.id}>
          <h3>{playlist.name}</h3>
          <p>Type: {playlist.type}</p>
          <p>Tracks: {playlist.track_count}</p>
          <button onClick={() => handleDelete(playlist.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

export default PlaylistBrowser;
```

### Vue 3 Example

```vue
<template>
  <div>
    <h1>Playlists</h1>
    <button @click="loadPlaylists">Refresh</button>

    <div v-if="loading">Loading...</div>
    <div v-else-if="error">Error: {{ error }}</div>

    <div v-else>
      <div v-for="playlist in playlists" :key="playlist.id">
        <h3>{{ playlist.name }}</h3>
        <p>{{ playlist.track_count }} tracks</p>
        <button @click="deletePlaylist(playlist.id)">Delete</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const API_BASE = 'http://localhost:12047/api';

const playlists = ref([]);
const loading = ref(false);
const error = ref(null);

async function loadPlaylists() {
  loading.value = true;
  error.value = null;

  try {
    const response = await fetch(`${API_BASE}/playlists`);
    const data = await response.json();
    playlists.value = data.playlists;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function deletePlaylist(id) {
  if (!confirm('Delete this playlist?')) return;

  try {
    await fetch(`${API_BASE}/playlists/${id}`, {
      method: 'DELETE',
    });
    loadPlaylists();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

onMounted(() => {
  loadPlaylists();
});
</script>
```

---

## Best Practices

### 1. Always Validate Input

```javascript
function validatePlaylistName(name) {
  if (!name || name.trim().length === 0) {
    throw new Error('Playlist name is required');
  }
  if (name.length > 200) {
    throw new Error('Playlist name must be 200 characters or less');
  }
  return name.trim();
}
```

### 2. Handle Errors Gracefully

```javascript
async function safeApiCall(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error.response) {
      // Server error
      console.error('Server error:', error.response.data);
      showNotification('error', error.response.data.message);
    } else {
      // Network error
      console.error('Network error:', error);
      showNotification('error', 'Network error. Please check your connection.');
    }
    return null;
  }
}
```

### 3. Cache Playlist Data

```javascript
class PlaylistCache {
  constructor(ttlMs = 60000) {
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      expires: Date.now() + this.ttl,
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  invalidate(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

const cache = new PlaylistCache();

async function getPlaylist(id) {
  // Check cache first
  const cached = cache.get(id);
  if (cached) return cached;

  // Fetch from API
  const response = await fetch(`${API_BASE}/playlists/${id}`);
  const playlist = await response.json();

  // Store in cache
  cache.set(id, playlist);

  return playlist;
}
```

### 4. Batch Operations

```javascript
// Bad: Multiple individual requests
for (const trackId of trackIds) {
  await addTrackToPlaylist(playlistId, trackId);
}

// Good: Single batch request
await addTracksToPlaylist(playlistId, trackIds);
```

### 5. Optimistic Updates

```javascript
async function toggleFavorite(playlist) {
  // Update UI immediately
  const previousState = playlist.is_favorite;
  playlist.is_favorite = playlist.is_favorite ? 0 : 1;
  updateUI(playlist);

  try {
    // Send to server
    await updatePlaylist(playlist.id, {
      is_favorite: playlist.is_favorite === 1,
    });
  } catch (error) {
    // Revert on error
    playlist.is_favorite = previousState;
    updateUI(playlist);
    showError('Failed to update favorite status');
  }
}
```

### 6. Debounce Search

```javascript
import { debounce } from 'lodash';

const searchPlaylists = debounce(async (query) => {
  if (query.length < 2) return;

  const response = await fetch(
    `${API_BASE}/playlists/search?q=${encodeURIComponent(query)}`
  );
  const data = await response.json();
  displayResults(data.playlists);
}, 300);

// Usage
searchInput.addEventListener('input', (e) => {
  searchPlaylists(e.target.value);
});
```

### 7. Implement Retry Logic

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok && response.status >= 500) {
        // Retry on server errors
        if (i < maxRetries - 1) {
          await delay(1000 * Math.pow(2, i)); // Exponential backoff
          continue;
        }
      }

      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await delay(1000 * Math.pow(2, i));
    }
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 8. Use TypeScript for Type Safety

```typescript
interface PlaylistCreateRequest {
  name: string;
  type: 'static' | 'smart' | 'session' | 'temp';
  description?: string;
  color?: string;
  icon?: string;
  is_favorite?: boolean;
  criteria?: SmartCriteria;
}

async function createPlaylist(
  data: PlaylistCreateRequest
): Promise<Playlist> {
  const response = await fetch(`${API_BASE}/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create playlist');
  }

  return await response.json();
}
```

### 9. Monitor Performance

```javascript
async function trackPerformance(operation, fn) {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = performance.now() - start;

    console.log(`${operation} took ${duration.toFixed(2)}ms`);

    // Send to analytics
    analytics.track(operation, { duration });

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`${operation} failed after ${duration.toFixed(2)}ms`);
    throw error;
  }
}

// Usage
const playlists = await trackPerformance(
  'load_playlists',
  () => getAllPlaylists()
);
```

### 10. Implement Proper Loading States

```javascript
function PlaylistManager() {
  const [state, setState] = useState({
    playlists: [],
    loading: false,
    error: null,
    operation: null, // 'loading' | 'creating' | 'updating' | 'deleting'
  });

  async function performOperation(operation, fn) {
    setState(prev => ({ ...prev, loading: true, operation, error: null }));

    try {
      const result = await fn();
      setState(prev => ({ ...prev, loading: false, operation: null }));
      return result;
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        operation: null,
        error: error.message
      }));
      throw error;
    }
  }

  async function createPlaylist(data) {
    return performOperation('creating', async () => {
      const response = await fetch(`${API_BASE}/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await response.json();
    });
  }

  // Render appropriate UI based on state
  if (state.operation === 'creating') return <div>Creating playlist...</div>;
  if (state.operation === 'deleting') return <div>Deleting...</div>;
  if (state.loading) return <div>Loading...</div>;
  if (state.error) return <div>Error: {state.error}</div>;

  return <div>{/* Normal UI */}</div>;
}
```

---

## Appendix

### Musical Key Reference

| Value | Key       |
|-------|-----------|
| 0     | C         |
| 1     | C# / Db   |
| 2     | D         |
| 3     | D# / Eb   |
| 4     | E         |
| 5     | F         |
| 6     | F# / Gb   |
| 7     | G         |
| 8     | G# / Ab   |
| 9     | A         |
| 10    | A# / Bb   |
| 11    | B         |

### Mode Reference

| Value | Mode  |
|-------|-------|
| 0     | Minor |
| 1     | Major |

### Playlist Type Reference

| Type      | Description                           | Features                                    |
|-----------|---------------------------------------|---------------------------------------------|
| `static`  | Manual curation                       | Add/remove tracks, full control             |
| `smart`   | Auto-populated                        | Based on criteria, refreshable              |
| `session` | DJ performance history                | Track plays with timestamps, finalizable    |
| `temp`    | Temporary workspace (thinking)        | Single global instance, promotable          |

---

**Questions or Issues?**
Open an issue on GitHub or contact the development team.

**Last Updated:** 2025-10-24
**API Version:** 1.0
