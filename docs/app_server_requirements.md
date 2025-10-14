# App Server Requirements for Audio Server Integration

## Overview

This document specifies the requirements for the Node.js app server to integrate with the C++ audio server for Phase 3.15: Getting Track Data from App Server.

The app server needs to provide track metadata and analysis data (BPM, key, beats, downbeats) to the audio server via a WebSocket connection.

---

## WebSocket Connection

### Server Configuration

The app server must:

1. **Accept WebSocket connections from the audio server**
   - Listen on a configurable port (suggested: `3001` or configurable via environment variable)
   - Accept connections from localhost (or configurable allowed hosts)
   - Handle reconnection attempts gracefully

2. **Authentication** (optional for MVP, recommended for production)
   - If implemented, use token-based authentication
   - Audio server should be able to authenticate on connection

### Connection URL

Example: `ws://localhost:3001/audio-server`

---

## Message Protocol

All messages use JSON format.

### Request: Get Track Info

**From Audio Server → To App Server**

```json
{
  "command": "getTrackInfo",
  "trackId": "uuid-or-track-identifier",
  "stems": false
}
```

**Parameters:**

- `command` (string, required): Always `"getTrackInfo"`
- `trackId` (string, required): The unique identifier for the track in your database
- `stems` (boolean, required): Indicates whether stem-separated audio files should be included
  - `false`: Return only the main track file path (current implementation)
  - `true`: Return main track + stem file paths (future feature - can return empty array for now)

### Response: Track Info Success

**From App Server → To Audio Server**

```json
{
  "success": true,
  "trackId": "uuid-or-track-identifier",
  "filePath": "/absolute/path/to/track.mp3",
  "bpm": 128.5,
  "key": "Am",
  "mode": "minor",
  "beats_data": [0.0, 0.468, 0.937, 1.405, 2.873, ...],
  "downbeats_data": [0.0, 1.873, 3.746, 5.619, ...]
}
```

**Fields:**

- `success` (boolean, required): `true` for successful response
- `trackId` (string, required): Echo back the requested track ID
- `filePath` (string, required): **Absolute file path** to the audio file
  - Must be accessible from the audio server's filesystem
  - Should be normalized (no `..` or symbolic links)
- `bpm` (number, required): Tempo in beats per minute
  - Use the analyzed BPM from your track analysis
  - If not analyzed yet, return `0` or trigger analysis
- `key` (string, required): Musical key in standard notation
  - Examples: `"Am"`, `"C"`, `"F#m"`, `"Bb"`
  - Use empty string `""` if not available
- `mode` (string, required): `"major"` or `"minor"`
  - Use empty string `""` if not available
- `beats_data` (array of numbers, required): Beat positions in seconds
  - Each element represents the timestamp of a beat
  - Must be sorted in ascending order
  - Example: `[0.0, 0.468, 0.937, 1.405, ...]`
  - Return empty array `[]` if not available
- `downbeats_data` (array of numbers, required): Downbeat (bar start) positions in seconds
  - Each element represents the timestamp of a downbeat (first beat of a bar)
  - Must be sorted in ascending order
  - Typically every 4th beat for 4/4 time
  - Example: `[0.0, 1.873, 3.746, ...]`
  - Return empty array `[]` if not available

### Response: Track Info Error

**From App Server → To Audio Server**

```json
{
  "success": false,
  "trackId": "uuid-or-track-identifier",
  "error": "Track not found"
}
```

**Fields:**

- `success` (boolean, required): `false` for error response
- `trackId` (string, required): Echo back the requested track ID
- `error` (string, required): Human-readable error message

**Common Error Messages:**

- `"Track not found"` - Track ID doesn't exist in database
- `"Track file missing"` - Track exists but file not found on filesystem
- `"Analysis not complete"` - Track exists but hasn't been analyzed yet
- `"Invalid track ID"` - Track ID format is invalid
- `"Permission denied"` - Audio server doesn't have permission to access file

---

## Data Requirements

### Track Analysis Data

The app server must have or be able to retrieve:

1. **BPM (Beats Per Minute)**
   - Obtained from audio analysis (e.g., using `librosa`, `essentia`, or similar)
   - Should be the dominant/average BPM of the track

2. **Musical Key and Mode**
   - Key detection (e.g., using `librosa`, `essentia`)
   - Standard notation: `C`, `C#`, `Db`, `D`, etc.
   - Mode: `major` or `minor`

3. **Beat Positions**
   - Beat tracking/detection results
   - Array of timestamps in seconds
   - Should align with the actual beats in the audio

4. **Downbeat Positions**
   - Downbeat tracking results
   - Array of timestamps in seconds
   - Typically aligned with bar boundaries

### File Path Requirements

- Must provide **absolute file paths**
- File must be readable by the audio server process
- Supported formats: MP3, FLAC, WAV, AAC, M4A, OGG, OPUS, WMA

---

## Implementation Checklist

### Required

- [ ] WebSocket server accepting connections from audio server
- [ ] Handle `getTrackInfo` command
- [ ] Return track file path (absolute path)
- [ ] Return BPM data
- [ ] Return key and mode data
- [ ] Return beats_data array
- [ ] Return downbeats_data array
- [ ] Handle track not found errors gracefully
- [ ] Handle file missing errors gracefully
- [ ] Validate track IDs before querying database

### Recommended

- [ ] Connection authentication/authorization
- [ ] Request validation (check required fields)
- [ ] Logging of requests and responses
- [ ] Rate limiting (prevent abuse)
- [ ] Connection timeout handling
- [ ] Graceful handling of audio server disconnection
- [ ] Reconnection support

### Future Enhancements (Not Required for Phase 3.15)

- [ ] Support for `stems: true` parameter
- [ ] Return stem file paths when available
- [ ] Caching of track info responses
- [ ] Batch requests (multiple tracks at once)
- [ ] Progress updates for ongoing analysis

---

## Example Implementation (Node.js/TypeScript)

```typescript
import WebSocket from 'ws';

// WebSocket server setup
const wss = new WebSocket.Server({ port: 3001 });

wss.on('connection', (ws) => {
  console.log('Audio server connected');

  ws.on('message', async (message) => {
    try {
      const request = JSON.parse(message.toString());

      if (request.command === 'getTrackInfo') {
        const trackInfo = await getTrackInfo(request.trackId);

        if (trackInfo) {
          ws.send(JSON.stringify({
            success: true,
            trackId: request.trackId,
            filePath: trackInfo.filePath,
            bpm: trackInfo.bpm,
            key: trackInfo.key,
            mode: trackInfo.mode,
            beats_data: trackInfo.beats,
            downbeats_data: trackInfo.downbeats
          }));
        } else {
          ws.send(JSON.stringify({
            success: false,
            trackId: request.trackId,
            error: 'Track not found'
          }));
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        success: false,
        error: 'Internal server error'
      }));
    }
  });

  ws.on('close', () => {
    console.log('Audio server disconnected');
  });
});

async function getTrackInfo(trackId: string) {
  // Query your database for track information
  // Return track data with all required fields
  const track = await db.tracks.findById(trackId);

  if (!track) {
    return null;
  }

  return {
    filePath: track.absolutePath,
    bpm: track.analysis.bpm || 0,
    key: track.analysis.key || '',
    mode: track.analysis.mode || '',
    beats: track.analysis.beats || [],
    downbeats: track.analysis.downbeats || []
  };
}
```

---

## Testing

### Manual Testing

You can test the WebSocket endpoint using `wscat`:

```bash
npm install -g wscat
wscat -c ws://localhost:3001

# Send test message:
{"command":"getTrackInfo","trackId":"test-track-id","stems":false}
```

### Integration Testing

The audio server will have integration tests that:
1. Connect to your WebSocket server
2. Request track info for known test tracks
3. Verify response format and data validity

### Test Data

Please ensure you have at least one test track with:
- Valid file path
- BPM > 0
- Non-empty key/mode
- Non-empty beats_data and downbeats_data

---

## Questions?

If you have questions about these requirements or need clarification, please refer to:
- Audio server development plan: `docs/development_plan.md`
- Audio server WebSocket API: `docs/websocket_api.md`

---

## Timeline

This integration is required for **Phase 3.15** of the audio server development, which comes before **Phase 3.2: Tempo Control & Sync**.

The audio server will use the track metadata provided by your app server to implement tempo control and deck synchronization features.
