# Remote Deployment Integration Guide

## Overview

This guide provides instructions for integrating the Analysis Server with an App Server running on a **different machine**. The analysis server now supports both:

1. **Co-located deployment** (same machine) - Uses file paths for maximum efficiency
2. **Remote deployment** (different machines) - Transfers audio data over HTTP

Both modes work simultaneously - the analysis server automatically adapts based on the `stem_delivery_mode` parameter.

---

## Architecture

```
┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│   Audio Engine      │◄──────│    App Server       │       │  Analysis Server    │
│   (C++ JUCE)        │ WS    │   (Node.js)         │       │   (Python/FastAPI)  │
│   Any Machine       │       │   Any Machine       │◄──────│   Any Machine       │
└─────────────────────┘       └─────────────────────┘ HTTP  └─────────────────────┘
```

**Key Points:**
- All three components can run on different machines
- App Server sends audio file content to Analysis Server (not file paths)
- Analysis Server returns stem audio data in callbacks (not file paths)
- Audio Engine receives base64-encoded stem audio via WebSocket

---

## Changes Made to Analysis Server

### 1. Enhanced Stem Delivery Modes

The analysis server now supports three modes for delivering stems:

| Mode | Use Case | Stem Data Location |
|------|----------|-------------------|
| `poll` | Legacy polling | Client polls `GET /jobs/{id}/stems` |
| `path` | Co-located servers (same machine) | Returns file paths on local disk |
| `callback` | **Remote servers (different machines)** | Returns base64-encoded audio data in callback |

### 2. Callback with Audio Data

When `stem_delivery_mode: 'callback'` is specified, the stems callback now includes:

```json
{
  "job_id": "track-hash",
  "stage": "stems",
  "status": "completed",
  "timestamp": "2025-10-29T12:34:56.789Z",
  "data": {
    "delivery_mode": "callback",
    "stems": {
      "bass": "<base64-encoded-wav-data>",
      "drums": "<base64-encoded-wav-data>",
      "other": "<base64-encoded-wav-data>",
      "vocals": "<base64-encoded-wav-data>"
    },
    "waveforms": [...],
    "processing_time": 45.3,
    "model": "htdemucs",
    "format": "wav",
    "encoding": "base64"
  }
}
```

**Important:**
- Each stem is base64-encoded WAV audio (typically 10-30 MB per stem)
- The callback payload will be large (40-120 MB total for 4 stems)
- Ensure your app server can handle large POST request bodies

---

## Integration Steps for App Server

### Step 1: Update Job Submission (Send Audio Content)

**Current Implementation (Co-located):**
```javascript
// pythonClient.service.js
const requestBody = {
  file_path: "/absolute/path/to/track.mp3",
  track_hash: "abc123",
  options: { stems: true },
  callback_url: "http://app-server:3000/api/analysis/callback",
  stem_delivery_mode: 'path'  // ❌ Only works when co-located
};
```

**New Implementation (Remote):**
```javascript
// pythonClient.service.js
async requestAnalysis({ file_path, track_hash, options = {} }) {
  const fs = await import('fs/promises');
  const path = await import('path');
  const FormData = require('form-data');

  // Determine deployment mode
  const isRemote = process.env.ANALYSIS_SERVER_REMOTE === 'true';

  if (isRemote) {
    // REMOTE MODE: Send file content via multipart upload
    const fileContent = await fs.readFile(file_path);
    const form = new FormData();

    form.append('file', fileContent, {
      filename: path.basename(file_path),
      contentType: 'audio/mpeg', // Detect based on extension
    });
    form.append('track_hash', track_hash);
    form.append('options', JSON.stringify(options));
    form.append('callback_url', this.callbackUrl);
    form.append('stem_delivery_mode', 'callback'); // ✅ Use callback mode

    const response = await axios.post(
      `${this.serverUrl}/jobs`,
      form,
      {
        headers: form.getHeaders(),
        timeout: this.timeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return response.data;
  } else {
    // CO-LOCATED MODE: Send file path (existing code)
    const requestBody = {
      file_path,
      track_hash,
      options,
      callback_url: this.callbackUrl,
      stem_delivery_mode: 'path', // ✅ Use path mode
    };

    const response = await axios.post(
      `${this.serverUrl}/jobs`,
      requestBody,
      {
        timeout: this.timeout,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return response.data;
  }
}
```

### Step 2: Handle Stem Callbacks (Receive Audio Data)

**Current Implementation (Co-located):**
```javascript
// analysisCallback.service.js
export async function handleStems(jobId, data) {
  // data.delivery_mode === 'path'
  // data.stems = { bass: '/path/...', drums: '/path/...', ... }

  // Forward file paths to audio engine
  await audioServerClientService.sendStemsReady(trackId, data, requestId);
}
```

**New Implementation (Remote):**
```javascript
// analysisCallback.service.js
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export async function handleStems(jobId, data) {
  try {
    const job = analysisJobService.getJobById(jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found for stems callback`);
      return;
    }

    if (data.delivery_mode === 'callback') {
      // REMOTE MODE: Decode base64 audio data and save to temp files
      logger.info(`Received base64-encoded stems for job ${jobId}`);

      const tempDir = path.join(os.tmpdir(), 'mismo-stems', jobId);
      await fs.mkdir(tempDir, { recursive: true });

      const stemPaths = {};

      for (const [stemType, base64Data] of Object.entries(data.stems)) {
        if (!base64Data) {
          logger.warn(`Stem ${stemType} is null, skipping`);
          continue;
        }

        try {
          // Decode base64 to buffer
          const audioBuffer = Buffer.from(base64Data, 'base64');

          // Save to temp file
          const tempFilePath = path.join(tempDir, `${stemType}.wav`);
          await fs.writeFile(tempFilePath, audioBuffer);

          stemPaths[stemType] = tempFilePath;

          logger.info(`Saved stem ${stemType} to ${tempFilePath} (${audioBuffer.length} bytes)`);
        } catch (error) {
          logger.error(`Failed to decode stem ${stemType}:`, error);
        }
      }

      // Store stem waveforms in database (for UI)
      if (data.waveforms && Array.isArray(data.waveforms) && data.waveforms.length > 0) {
        const track = trackService.getTrackById(job.track_id);
        if (track && track.file_hash) {
          waveformService.storeStemWaveforms(track.file_hash, data.waveforms);
          logger.info(`Stored ${data.waveforms.length} stem waveform zoom levels`);
        }
      }

      // Update job progress
      analysisJobService.updateJobProgress(jobId, 'stems');

      // Forward temp file paths to audio engine
      if (job.callback_metadata && job.callback_metadata.type === 'audio_server_stems') {
        await audioServerClientService.sendStemsReady(
          job.callback_metadata.trackId,
          {
            delivery_mode: 'path', // Convert back to path mode for audio engine
            stems: stemPaths,
            processing_time: data.processing_time,
          },
          job.callback_metadata.requestId
        );

        logger.info(`✓ Forwarded stem paths to audio engine for job ${jobId}`);

        // Schedule cleanup of temp files after audio engine loads them
        setTimeout(async () => {
          try {
            await fs.rm(tempDir, { recursive: true, force: true });
            logger.info(`Cleaned up temp stems directory: ${tempDir}`);
          } catch (error) {
            logger.error(`Failed to cleanup temp stems:`, error);
          }
        }, 60000); // 60 seconds - give audio engine time to load
      }

    } else if (data.delivery_mode === 'path') {
      // CO-LOCATED MODE: Use file paths directly (existing code)
      logger.info(`Received file paths for stems: ${jobId}`);

      // Store waveforms
      if (data.waveforms && Array.isArray(data.waveforms) && data.waveforms.length > 0) {
        const track = trackService.getTrackById(job.track_id);
        if (track && track.file_hash) {
          waveformService.storeStemWaveforms(track.file_hash, data.waveforms);
        }
      }

      // Update job progress
      analysisJobService.updateJobProgress(jobId, 'stems');

      // Forward file paths to audio engine
      if (job.callback_metadata && job.callback_metadata.type === 'audio_server_stems') {
        await audioServerClientService.sendStemsReady(
          job.callback_metadata.trackId,
          data,
          job.callback_metadata.requestId
        );
      }
    }

  } catch (error) {
    logger.error(`Error handling stems for job ${jobId}:`, error);
    throw error;
  }
}
```

### Step 3: Update Audio Engine Communication

The audio engine communication doesn't need major changes - it still receives file paths. However, in remote mode, these are **temporary** file paths:

```javascript
// audioServerClient.service.js - No changes needed!
async sendStemsReady(trackId, stemsData, requestId = null) {
  // stemsData.stems = { bass: '/tmp/path/...', drums: '/tmp/path/...', ... }

  const response = {
    success: true,
    type: 'stemsReady',
    requestId: requestId,
    trackId: trackId,
    stems: stemsData.stems,  // Audio engine gets temp file paths
  };

  this.send(response);
}
```

**Important:** The audio engine must load stems **immediately** when it receives the `stemsReady` notification, as temp files are cleaned up after 60 seconds.

---

## Configuration

### App Server Environment Variables

Add these to your `.env` file:

```bash
# Analysis Server Configuration
ANALYSIS_SERVER_REMOTE=true                    # Set to 'true' for remote deployment
PYTHON_SERVER_URL=http://analysis-host:8000    # Remote analysis server URL

# For co-located deployment (same machine):
# ANALYSIS_SERVER_REMOTE=false
# PYTHON_SERVER_URL=http://127.0.0.1:8000
```

### Analysis Server Environment Variables

The analysis server doesn't need special configuration - it works in both modes automatically. However, ensure these are set:

```bash
# Analysis Server .env
MISMO_ALLOW_FILE_PATHS=true                    # Allow file_path in JSON requests (co-located)
MISMO_ALLOWED_PATH_PREFIXES='["/home/music"]'  # Allowed directories (co-located only)

# Callback settings (works for both modes)
CALLBACK_TIMEOUT=30.0                          # HTTP callback timeout
CALLBACK_RETRIES=3                             # Number of retry attempts
CALLBACK_RETRY_DELAY=2.0                       # Initial retry delay
```

---

## Request/Response Examples

### Remote Mode (Different Machines)

#### 1. Submit Job with Audio Content

**Request:**
```http
POST http://analysis-server:8000/jobs
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="track.mp3"
Content-Type: audio/mpeg

<binary audio data>
--boundary
Content-Disposition: form-data; name="track_hash"

abc123def456
--boundary
Content-Disposition: form-data; name="options"

{"stems": true, "basic_features": false, "characteristics": false}
--boundary
Content-Disposition: form-data; name="callback_url"

http://app-server:3000/api/analysis/callback
--boundary
Content-Disposition: form-data; name="stem_delivery_mode"

callback
--boundary--
```

**Response:**
```json
{
  "job_id": "abc123def456",
  "status": "queued",
  "track_hash": "abc123def456",
  "created_at": "2025-10-29T12:00:00Z",
  "callback_url": "http://app-server:3000/api/analysis/callback",
  "stem_delivery_mode": "callback"
}
```

#### 2. Receive Stems Callback

**Callback from Analysis Server:**
```http
POST http://app-server:3000/api/analysis/callback
Content-Type: application/json
X-Mismo-Job-ID: abc123def456
X-Mismo-Stage: stems

{
  "job_id": "abc123def456",
  "stage": "stems",
  "status": "completed",
  "timestamp": "2025-10-29T12:01:30.789Z",
  "data": {
    "delivery_mode": "callback",
    "stems": {
      "bass": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
      "drums": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
      "other": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
      "vocals": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
    },
    "waveforms": [
      {
        "zoom_level": 1,
        "stem_type": "bass",
        "data": [0.5, 0.3, ...]
      }
    ],
    "processing_time": 45.3,
    "model": "htdemucs",
    "format": "wav",
    "encoding": "base64"
  }
}
```

### Co-located Mode (Same Machine)

#### 1. Submit Job with File Path

**Request:**
```http
POST http://127.0.0.1:8000/jobs
Content-Type: application/json

{
  "file_path": "/home/music/library/track.mp3",
  "track_hash": "abc123def456",
  "options": {
    "stems": true,
    "basic_features": false,
    "characteristics": false
  },
  "callback_url": "http://127.0.0.1:3000/api/analysis/callback",
  "stem_delivery_mode": "path"
}
```

**Response:**
```json
{
  "job_id": "abc123def456",
  "status": "queued",
  "track_hash": "abc123def456",
  "created_at": "2025-10-29T12:00:00Z",
  "callback_url": "http://127.0.0.1:3000/api/analysis/callback",
  "stem_delivery_mode": "path"
}
```

#### 2. Receive Stems Callback

**Callback from Analysis Server:**
```http
POST http://127.0.0.1:3000/api/analysis/callback
Content-Type: application/json

{
  "job_id": "abc123def456",
  "stage": "stems",
  "status": "completed",
  "timestamp": "2025-10-29T12:01:30.789Z",
  "data": {
    "delivery_mode": "path",
    "stems": {
      "bass": "/jobs/abc123def456/stems/bass.wav",
      "drums": "/jobs/abc123def456/stems/drums.wav",
      "other": "/jobs/abc123def456/stems/other.wav",
      "vocals": "/jobs/abc123def456/stems/vocals.wav"
    },
    "waveforms": [...],
    "processing_time": 45.3,
    "model": "htdemucs"
  }
}
```

---

## Performance Considerations

### Payload Sizes

| Stem Duration | Format | Single Stem Size | Total Callback Size (4 stems) |
|---------------|--------|------------------|-------------------------------|
| 3 minutes | WAV (44.1kHz, 16-bit, stereo) | ~30 MB | ~120 MB |
| 5 minutes | WAV (44.1kHz, 16-bit, stereo) | ~50 MB | ~200 MB |
| 10 minutes | WAV (44.1kHz, 16-bit, stereo) | ~100 MB | ~400 MB |

**Base64 Encoding Overhead:** +33% (base64 is 4/3 the size of binary)

### Network Transfer

```
Co-located Mode (file paths):
  - Request:  ~500 bytes (JSON with file path)
  - Response: ~1 KB (file paths only)
  - Total:    ~1.5 KB
  - Transfer: Instant (<1ms)

Remote Mode (audio data):
  - Request:  ~10 MB (original audio file)
  - Response: ~160 MB (4 stems, base64-encoded)
  - Total:    ~170 MB
  - Transfer: ~17 seconds @ 100 Mbps, ~3 seconds @ 500 Mbps
```

**Recommendations:**
1. Use **Gigabit network** (1000 Mbps) between servers for best performance
2. Consider **compression** for stems (future enhancement)
3. Keep stems **under 5 minutes** when possible
4. For longer tracks, consider **streaming** or **chunked transfer** (future)

### Timeout Configuration

```javascript
// App Server - Increase timeout for large callback payloads
app.use(express.json({ limit: '500mb' }));  // Default is 100kb!
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Axios client timeout for job submission
const response = await axios.post(url, data, {
  timeout: 60000,  // 60 seconds for file upload
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});
```

---

## Error Handling

### Network Failures

**Scenario:** Callback delivery fails due to network issues

**Analysis Server Behavior:**
- Retries 3 times with exponential backoff (2s, 4s, 8s)
- Logs error and marks callback as failed
- Stems remain available via `GET /jobs/{id}/stems` endpoint

**App Server Response:**
```javascript
// Implement polling fallback if callback fails
async function ensureStemsReceived(jobId, timeout = 120000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const job = analysisJobService.getJobById(jobId);

    if (job.stages_completed.includes('stems')) {
      return true;  // Callback was received
    }

    // Check if callback failed - poll as fallback
    if (Date.now() - job.started_at > 60000) {
      logger.warn(`Callback not received for ${jobId}, polling analysis server`);

      const stemsData = await pythonClient.getStemsData(jobId);
      if (stemsData) {
        await handleStems(jobId, stemsData);
        return true;
      }
    }

    await sleep(2000);
  }

  return false;
}
```

### Large Payload Failures

**Scenario:** Callback payload exceeds server limits

**Error Response:**
```json
{
  "error": "PayloadTooLargeError",
  "message": "Request entity too large",
  "limit": "100mb",
  "received": "160mb"
}
```

**Solution:**
```javascript
// Increase body parser limits
app.use(express.json({ limit: '500mb' }));
```

---

## Migration Guide

### From Co-located to Remote

1. **Update Environment:**
   ```bash
   # .env
   ANALYSIS_SERVER_REMOTE=true
   PYTHON_SERVER_URL=http://remote-analysis:8000
   ```

2. **Update Request Body Parsing:**
   ```javascript
   app.use(express.json({ limit: '500mb' }));
   ```

3. **Deploy Analysis Server:**
   - Copy analysis server to remote machine
   - Configure firewall to allow port 8000
   - Start analysis server: `uvicorn src.app:app --host 0.0.0.0 --port 8000`

4. **Test Connectivity:**
   ```bash
   curl http://remote-analysis:8000/health
   ```

5. **Verify Stem Delivery:**
   - Submit test job
   - Check callback is received
   - Confirm stem audio data is valid
   - Verify audio engine receives stems

### From Remote to Co-located

1. **Update Environment:**
   ```bash
   # .env
   ANALYSIS_SERVER_REMOTE=false
   PYTHON_SERVER_URL=http://127.0.0.1:8000
   ```

2. **Restart Services:**
   - No code changes needed!
   - App server automatically switches to `path` mode
   - Analysis server uses local file system

---

## Troubleshooting

### Issue: "Request entity too large"

**Cause:** Body parser limit too small

**Solution:**
```javascript
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
```

### Issue: Callback timeout

**Cause:** Network too slow, payload too large

**Solutions:**
1. Check network speed: `iperf3 -c remote-analysis`
2. Increase callback timeout on analysis server:
   ```bash
   CALLBACK_TIMEOUT=60.0  # Increase from 30s to 60s
   ```
3. Use faster network (1 Gbps recommended)

### Issue: Stems not received by audio engine

**Cause:** Temp files deleted before audio engine loaded them

**Solution:** Increase cleanup delay:
```javascript
setTimeout(async () => {
  await fs.rm(tempDir, { recursive: true });
}, 120000);  // Increase from 60s to 120s
```

### Issue: Base64 decoding error

**Cause:** Corrupted data during transmission

**Solution:**
1. Check callback logs for errors
2. Verify network stability
3. Enable callback retry:
   ```bash
   CALLBACK_RETRIES=5  # Increase retries
   ```

---

## Testing

### Test Co-located Mode

```bash
# Start analysis server
cd analysis_server
source venv/bin/activate
uvicorn src.app:app --reload

# Start app server
cd app_server
npm start

# Submit test job (should use file_path + path mode)
curl -X POST http://localhost:3000/api/tracks/123/analyze \
  -H "Content-Type: application/json"
```

### Test Remote Mode

```bash
# Set remote mode
echo "ANALYSIS_SERVER_REMOTE=true" >> .env

# Restart app server
npm restart

# Submit test job (should use multipart + callback mode)
curl -X POST http://localhost:3000/api/tracks/123/analyze \
  -H "Content-Type: application/json"

# Monitor callback
tail -f logs/app-server.log | grep "stems"
```

---

## Summary

### Key Changes

| Component | Change | Impact |
|-----------|--------|--------|
| **Analysis Server** | Added base64 stem encoding in callbacks | ✅ Complete |
| **App Server** | Must send audio content (not paths) | ⚠️ TODO |
| **App Server** | Must decode base64 stems | ⚠️ TODO |
| **App Server** | Must increase body parser limits | ⚠️ TODO |
| **Audio Engine** | No changes needed | ✅ Works as-is |

### Deployment Modes

| Mode | Request | Callback | Performance | Use Case |
|------|---------|----------|-------------|----------|
| **Co-located** | file_path | stem paths | Fast (paths only) | Single server |
| **Remote** | file content | base64 audio | Slower (network transfer) | Distributed system |

### Next Steps for App Server Team

1. ✅ **Read this guide** thoroughly
2. ⚠️ **Implement Step 1**: Update job submission to send audio content
3. ⚠️ **Implement Step 2**: Handle base64-encoded stems in callbacks
4. ⚠️ **Update configuration**: Add `ANALYSIS_SERVER_REMOTE` environment variable
5. ⚠️ **Increase limits**: Set body parser limit to 500 MB
6. ⚠️ **Test both modes**: Verify co-located and remote work correctly
7. ⚠️ **Monitor performance**: Check network transfer times
8. ⚠️ **Deploy**: Move analysis server to remote machine

**Questions?** Contact the analysis server team or file an issue on GitHub.

---

## Appendix: Code Templates

### Template: Multipart File Upload (App Server)

```javascript
// utils/multipartUpload.js
import FormData from 'form-data';
import fs from 'fs/promises';
import path from 'path';

/**
 * Create multipart form data for audio file upload
 */
export async function createAudioUploadForm(filePath, metadata) {
  const form = new FormData();

  // Read file content
  const fileContent = await fs.readFile(filePath);
  const filename = path.basename(filePath);

  // Detect content type from extension
  const ext = path.extname(filename).toLowerCase();
  const contentTypeMap = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
  };
  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  // Append file
  form.append('file', fileContent, {
    filename: filename,
    contentType: contentType,
  });

  // Append metadata
  form.append('track_hash', metadata.track_hash);
  form.append('options', JSON.stringify(metadata.options));

  if (metadata.callback_url) {
    form.append('callback_url', metadata.callback_url);
  }

  if (metadata.stem_delivery_mode) {
    form.append('stem_delivery_mode', metadata.stem_delivery_mode);
  }

  return form;
}
```

### Template: Base64 Stem Decoder (App Server)

```javascript
// utils/stemDecoder.js
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Decode base64-encoded stems and save to temp files
 */
export async function decodeStemsToTempFiles(stems, jobId) {
  const tempDir = path.join(os.tmpdir(), 'mismo-stems', jobId);
  await fs.mkdir(tempDir, { recursive: true });

  const stemPaths = {};

  for (const [stemType, base64Data] of Object.entries(stems)) {
    if (!base64Data) {
      logger.warn(`Stem ${stemType} is null, skipping`);
      continue;
    }

    try {
      // Decode base64 to buffer
      const audioBuffer = Buffer.from(base64Data, 'base64');

      // Save to temp file
      const tempFilePath = path.join(tempDir, `${stemType}.wav`);
      await fs.writeFile(tempFilePath, audioBuffer);

      stemPaths[stemType] = tempFilePath;

      logger.info(`Decoded stem ${stemType}: ${audioBuffer.length} bytes → ${tempFilePath}`);
    } catch (error) {
      logger.error(`Failed to decode stem ${stemType}:`, error);
    }
  }

  return { stemPaths, tempDir };
}

/**
 * Clean up temp stem files
 */
export async function cleanupTempStems(tempDir, delayMs = 60000) {
  setTimeout(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.info(`Cleaned up temp stems: ${tempDir}`);
    } catch (error) {
      logger.error(`Failed to cleanup temp stems: ${tempDir}`, error);
    }
  }, delayMs);
}
```

---

**Document Version:** 1.0
**Last Updated:** 2025-10-29
**Analysis Server Version:** 0.1.0+remote
