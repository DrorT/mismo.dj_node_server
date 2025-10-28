# Stem Generation Flow Documentation

## Overview

This document describes how stem generation works in the Mismo DJ system, from the moment the audio engine requests a track until stems are delivered.

## Architecture

The system consists of three main components:

1. **Audio Engine (C++)** - JUCE-based audio player that loads and plays stems
2. **App Server (Node.js)** - Orchestrates requests and manages track metadata
3. **Analysis Server (Python)** - Performs AI-based stem separation using Demucs

```
Audio Engine (C++)
    ↕ WebSocket
App Server (Node.js)
    ↕ HTTP/REST + Callbacks
Analysis Server (Python/Demucs)
```

## Complete Flow

### 1. Audio Engine Requests Track

**When**: User loads a track in the audio engine

**WebSocket Message**:
```json
{
  "command": "getTrackInfo",
  "trackId": "uuid-of-track",
  "stems": true,
  "requestId": "optional-request-id"
}
```

**Handler**: `audioServerClient.service.js:handleGetTrackInfo()`

---

### 2. App Server Checks Track Status

**Location**: [audioServerClient.service.js:289-421](../src/services/audioServerClient.service.js#L289-L421)

The app server queries the database for track metadata:

```javascript
const track = await this.trackService.getTrackById(trackId);
const libraryDirectory = await this.libraryDirectoryService.getDirectoryById(
  track.library_directory_id
);
const absolutePath = path.join(libraryDirectory.path, track.relative_path);
```

---

### 3. Always Queue Stem Generation

**Important**: We do **NOT** store stems in the database because the analysis server cleans up old jobs to save disk space. Stems are ephemeral and generated on-demand.

**Step 1**: Create high-priority analysis job

**Location**: [audioServerClient.service.js:367-376](../src/services/audioServerClient.service.js#L367-L376)

```javascript
await this.analysisQueueService.requestAnalysis(
  track.id,
  { stems: true, basic_features: false, characteristics: false },
  'high',  // ⚡ HIGH PRIORITY - will jump ahead of background analysis
  {
    type: 'audio_server_stems',
    trackId: trackId,
    requestId: message.requestId,
  }
);
```

**Step 2**: Send immediate response (without stems)

```json
{
  "success": true,
  "trackId": "uuid",
  "filePath": "/absolute/path/to/track.mp3",
  "bpm": 128,
  "key": "5",
  "mode": "1"
  // No stems field - they'll come via separate stemsReady notification
}
```

Audio engine receives track metadata and loads the original file while waiting for stems.

---

### 4. Analysis Queue Processing

**Location**: [analysisQueue.service.js:191-229](../src/services/analysisQueue.service.js#L191-L229)

The queue service:
1. Checks how many jobs are currently processing
2. Gets available slots (`maxConcurrentJobs - processingJobs.size`)
3. Fetches queued jobs **ordered by priority**:
   - `high` priority → 1
   - `normal` priority → 2
   - `low` priority → 3

**SQL Query**:
```sql
SELECT * FROM analysis_jobs
WHERE status = 'queued'
ORDER BY
  CASE priority
    WHEN 'high' THEN 1
    WHEN 'normal' THEN 2
    WHEN 'low' THEN 3
  END,
  created_at ASC
LIMIT ?
```

**Result**: Stem generation jobs jump ahead of any normal/low priority background analysis!

---

### 5. Send to Python Analysis Server

**Location**: [analysisQueue.service.js:235-266](../src/services/analysisQueue.service.js#L235-L266)

**HTTP Request**:
```http
POST http://127.0.0.1:8000/jobs
Content-Type: application/json

{
  "file_path": "/absolute/path/to/track.mp3",
  "track_hash": "file-content-hash",
  "options": {
    "basic_features": false,
    "characteristics": false,
    "stems": true
  },
  "callback_url": "http://app-server:3000/api/analysis/callback",
  "stem_delivery_mode": "path"
}
```

**Configuration**: [pythonClient.service.js:66](../src/services/pythonClient.service.js#L66)

---

### 6. Python Server Performs Stem Separation

**Location**: Analysis server uses **Demucs (htdemucs model)**

**Process**:
1. Load audio file into memory
2. Run Demucs neural network (GPU accelerated if available)
3. Separate into 4 stems:
   - **bass** - Low-frequency bass and sub-bass
   - **drums** - Percussion and drum sounds
   - **other** - Remaining instrumental elements
   - **vocals** - Singing and vocal elements
4. Save stems as WAV files (PCM_S encoding)
5. Create ZIP archive with all stems

**Output Directory Structure**:
```
/jobs/{job_id}/
├── stems/
│   ├── bass.wav
│   ├── drums.wav
│   ├── other.wav
│   └── vocals.wav
├── stems.zip
└── stems.json
```

**Processing Time**: ~30-60 seconds for a 3-minute track (GPU), 2-5 minutes (CPU)

---

### 7. Python Server Sends Callback

**When**: Immediately after stems are saved to disk

**HTTP Callback**:
```http
POST http://app-server:3000/api/analysis/callback
Content-Type: application/json

{
  "job_id": "file-hash",
  "stage": "stems",
  "status": "completed",
  "timestamp": "2025-10-27T12:34:56.789Z",
  "data": {
    "delivery_mode": "path",
    "stems": {
      "bass": "/absolute/path/to/jobs/hash/stems/bass.wav",
      "drums": "/absolute/path/to/jobs/hash/stems/drums.wav",
      "other": "/absolute/path/to/jobs/hash/stems/other.wav",
      "vocals": "/absolute/path/to/jobs/hash/stems/vocals.wav"
    },
    "processing_time": 45.3
  }
}
```

**Callback Implementation**: Python analysis server [callbacks.py:40-163](../../mismo.dj_analysis_server/mismo_server_project/src/callbacks.py#L40-L163)

---

### 8. App Server Receives Callback

**Route Handler**: [analysis.routes.js:407](../src/routes/analysis.routes.js#L407)

```javascript
case 'stems':
  await analysisCallbackService.handleStems(job_id, data);
  break;
```

---

### 9. Forward Stems to Audio Engine (WebSocket Push)

**Location**: [analysisCallback.service.js:239-245](../src/services/analysisCallback.service.js#L239-L245)

**Important**: App server does **NOT** store stems in database. It only forwards them to the audio engine.

```javascript
// Forward stems directly to audio engine (if this request came from audio engine)
if (job.callback_metadata && job.callback_metadata.type === 'audio_server_stems') {
  await handleCallback(job, data);
  logger.info(`✓ Forwarded stems to audio engine for job ${jobId}`);
}
```

**WebSocket Message to Audio Engine**:
```json
{
  "success": true,
  "type": "stemsReady",
  "requestId": "original-request-id",
  "trackId": "uuid",
  "stems": {
    "bass": "/absolute/path/to/jobs/hash/stems/bass.wav",
    "drums": "/absolute/path/to/jobs/hash/stems/drums.wav",
    "other": "/absolute/path/to/jobs/hash/stems/other.wav",
    "vocals": "/absolute/path/to/jobs/hash/stems/vocals.wav"
  }
}
```

**Implementation**: [audioServerClient.service.js:594-621](../src/services/audioServerClient.service.js#L594-L621)

**Key Point**: Stems are forwarded immediately - audio engine must load them before the analysis server cleans up the job directory.

---

### 10. Audio Engine Loads Stems

**Audio Engine**:
1. Receives `stemsReady` message via WebSocket
2. Extracts absolute paths for each stem
3. **Immediately loads** each stem file into separate audio buffers:
   - `bass.wav` → Bass channel
   - `drums.wav` → Drums channel
   - `other.wav` → Other channel
   - `vocals.wav` → Vocals channel
4. User can now:
   - Solo/mute individual stems
   - Adjust volume of each stem independently
   - Apply effects per stem
   - Crossfade between stems

**Critical**: Audio engine must load stems immediately upon receiving the notification, as the analysis server may clean up these files after a retention period (e.g., 1 hour, 24 hours, etc.).

---

## Priority System

### Why High Priority for Stem Requests?

When a user loads a track in the audio engine, they expect stems **immediately**. Background analysis jobs (scanning library, updating metadata) should not delay this.

**Priority Levels**:
- **`high`**: User-initiated requests (audio engine track load, manual analysis request)
- **`normal`**: Automatic analysis (new track detected, metadata update)
- **`low`**: Optional features (genre classification, transition detection)

**Code Location**: [audioServerClient.service.js:370](../src/services/audioServerClient.service.js#L370)

```javascript
await this.analysisQueueService.requestAnalysis(
  track.id,
  { stems: true, basic_features: false, characteristics: false },
  'high',  // ⚡ HIGH PRIORITY
  { ... }
);
```

**Queue Processing**: [analysisQueue.service.js:210-220](../src/services/analysisQueue.service.js#L210-L220)

---

## Error Handling

### Network Errors

If the callback fails to deliver:
- Python server retries with exponential backoff (3 attempts)
- App server can query job status: `GET /api/analysis/jobs/{job_id}`

### Analysis Failures

If Demucs fails (corrupted audio, unsupported format):
- Python server sends error callback: `{"stage": "stems", "status": "failed", "error": {...}}`
- App server marks job as failed with retry logic
- Audio engine receives error notification

### Audio Engine Disconnected

If audio engine disconnects before stems are ready:
- Stems are still generated and stored in database
- Next time track is loaded, stems are immediately available (case 3a)

---

## Performance Characteristics

### Loading Track with Stems
1. **Track info response**: ~5-10ms (database query + file system check)
2. **Queue job creation**: ~2-5ms (database insert)
3. **Python server accepts job**: ~50-100ms (HTTP request)
4. **Stem separation**: ~30-60s (GPU) or 2-5min (CPU)
5. **Callback delivery**: ~50-100ms (HTTP callback)
6. **WebSocket notification**: ~1-2ms
7. **Audio engine loads stems**: ~100-500ms (4 file reads)

**Total**: 30-60 seconds from request to stems loaded

**Note**: Stems are NOT cached - they're generated fresh each time. This is intentional to save disk space on the analysis server.

---

## Configuration

### Environment Variables

**App Server** (`.env`):
```bash
# Python Analysis Server
PYTHON_SERVER_URL=http://127.0.0.1:8000
PYTHON_SERVER_AUTO_START=true

# Analysis Queue
MAX_CONCURRENT_ANALYSIS=2       # Parallel jobs (increase for more cores)
ANALYSIS_TIMEOUT_MS=300000      # 5 minutes per job

# Audio Server WebSocket
AUDIO_SERVER_WS_URL=ws://localhost:8080
```

**Python Server** (`.env`):
```bash
# Stem Separation
DEMUCS_MODEL=htdemucs           # Model: htdemucs, htdemucs_ft, htdemucs_6s
DEMUCS_DEVICE=cuda              # cuda (GPU) or cpu
KEEP_DEMUCS_LOADED=true         # Keep model in memory for faster processing

# Output
JOBS_DIR=/path/to/jobs          # Where stems are saved
STEM_FORMAT=wav                 # Output format (wav only for now)
```

---

## Future Enhancements

### Planned Features
1. **Streaming Stems**: Send stem chunks as they're generated (reduce latency)
2. **Stem Caching Strategy**: LRU cache with configurable size limits
3. **Cloud Storage**: Upload stems to S3/B2 for remote access
4. **6-Stem Mode**: Use `htdemucs_6s` model for piano/guitar separation
5. **Stem Previews**: Generate low-quality stems for quick preview

### Audio Engine Integration
- **Stem Waveforms**: Display separate waveforms for each stem
- **Stem EQ**: Per-stem equalizer controls
- **Stem Effects**: Apply reverb, delay, filters to individual stems
- **Stem Export**: Save remixed stems as new track

---

## Troubleshooting

### Stems Not Generating

**Check**:
1. Python server is running: `GET http://localhost:8000/health`
2. Job is in queue: `GET /api/analysis/queue`
3. Check logs: `tail -f logs/app-server.log`
4. Demucs model is installed: Check Python server startup logs

### Slow Stem Generation

**Solutions**:
1. Use GPU (`DEMUCS_DEVICE=cuda`)
2. Keep model loaded (`KEEP_DEMUCS_LOADED=true`)
3. Increase queue concurrency (`MAX_CONCURRENT_ANALYSIS=4` if you have 8+ cores)

### Audio Engine Not Receiving Stems

**Check**:
1. WebSocket connection: Look for `[WS-KEEPALIVE]` in logs
2. Callback metadata: Check job has `callback_metadata.type === 'audio_server_stems'`
3. Stems data format: Verify database `stems_path` is valid JSON

---

## Key Files Reference

| File | Purpose |
|------|---------|
| [audioServerClient.service.js](../src/services/audioServerClient.service.js) | WebSocket communication with audio engine |
| [analysisQueue.service.js](../src/services/analysisQueue.service.js) | Priority queue with concurrency control |
| [pythonClient.service.js](../src/services/pythonClient.service.js) | HTTP requests to Python analysis server |
| [analysisCallback.service.js](../src/services/analysisCallback.service.js) | Receives and processes analysis results |
| [track.service.js](../src/services/track.service.js) | Database operations for track metadata |
| [analysis.routes.js](../src/routes/analysis.routes.js) | REST API endpoints for analysis |

---

## Summary

The stem generation flow is designed for **minimal latency** and **high priority** for user-initiated requests:

1. ⚡ **Immediate response** to audio engine with track metadata
2. 🚀 **High-priority queue** for stem generation (jumps ahead of background jobs)
3. 🤖 **AI-powered separation** with Demucs neural network
4. 📤 **Direct forwarding** - app server passes stems through without storing
5. 🔔 **Push notification** via WebSocket when stems are ready
6. 🎵 **Individual file paths** for each stem (bass, drums, other, vocals)
7. 💾 **Ephemeral stems** - analysis server cleans up to save space

**Result**: Users can start playing tracks immediately, with stems loading seamlessly in the background!

**Key Architectural Decision**: Stems are NOT stored in the database. The app server is a pure orchestrator - it forwards stem paths from the analysis server to the audio engine. This keeps the app server stateless and allows the analysis server to manage disk space efficiently.
