# Python Analysis Server Integration

## Overview

The Mismo DJ Node.js backend automatically manages the Python analysis server lifecycle, including startup, health monitoring, and graceful shutdown. This document describes the integration architecture, configuration, and operational details.

---

## Architecture

### Components

1. **Analysis Server Service** (`src/services/analysisServer.service.js`)
   - Manages Python server process lifecycle
   - Monitors server health
   - Handles auto-start and graceful shutdown
   - Dynamically updates allowed file paths from library directories

2. **Server Integration** (`src/server.js`)
   - Initializes analysis server on Node.js startup
   - Stops analysis server on graceful shutdown
   - Continues operation if analysis server fails (graceful degradation)

3. **API Endpoints** (`src/routes/analysis.routes.js`)
   - Manual control and status endpoints
   - Health check proxy

4. **Library Directory Integration** (`src/services/libraryDirectory.service.js`)
   - Auto-restarts analysis server when library directories change
   - Ensures allowed paths are always current

---

## Configuration

### Environment Variables

All configuration is managed through environment variables in `.env`:

```bash
# Python Analysis Server
PYTHON_SERVER_URL=http://127.0.0.1:8000
PYTHON_SERVER_PORT=8000
PYTHON_SERVER_AUTO_START=true
PYTHON_SERVER_STARTUP_TIMEOUT_MS=60000
PYTHON_SERVER_PYTHON_PATH=/home/chester/dev/music/mismo.dj_analysis_server/mismo_server/bin/python
PYTHON_SERVER_APP_DIR=/home/chester/dev/music/mismo.dj_analysis_server/mismo_server_project
MAX_CONCURRENT_ANALYSIS=2
ANALYSIS_MAX_RETRIES=3
ANALYSIS_TIMEOUT_MS=300000
```

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `PYTHON_SERVER_URL` | string | `http://127.0.0.1:8000` | Base URL for analysis server API calls |
| `PYTHON_SERVER_PORT` | number | `8000` | Port number where Python server will listen |
| `PYTHON_SERVER_AUTO_START` | boolean | `true` | Automatically start Python server if not running |
| `PYTHON_SERVER_STARTUP_TIMEOUT_MS` | number | `60000` | Maximum time (ms) to wait for server startup |
| `PYTHON_SERVER_PYTHON_PATH` | string | Required | Absolute path to Python virtual environment binary |
| `PYTHON_SERVER_APP_DIR` | string | Required | Absolute path to Python server source directory |
| `MAX_CONCURRENT_ANALYSIS` | number | `2` | Maximum concurrent analysis jobs |
| `ANALYSIS_MAX_RETRIES` | number | `3` | Maximum retry attempts for failed analysis |
| `ANALYSIS_TIMEOUT_MS` | number | `300000` | Timeout for individual analysis jobs (5 minutes) |

---

## Startup Process

### 1. Node.js Server Initialization

When the Node.js server starts:

```javascript
// Server startup sequence
1. Initialize database
2. Start Express HTTP server
3. Initialize Python analysis server (async)
   ↓
   ├─ Check if already running (health check)
   │  └─ If healthy → Done
   └─ If not running → Auto-start (if enabled)
      ├─ Get active library directories
      ├─ Build allowed paths list
      ├─ Spawn Python process with environment variables
      ├─ Wait for health check to pass
      └─ Mark as ready or timeout
4. Continue with startup scans and file watchers
```

### 2. Python Server Startup

The Python analysis server is started with this command:

```bash
MISMO_ALLOW_FILE_PATHS=true \
MISMO_ALLOWED_PATH_PREFIXES='["/path/to/library1", "/path/to/library2"]' \
<PYTHON_SERVER_PYTHON_PATH> -m uvicorn src.app:app \
  --host 127.0.0.1 \
  --port <PYTHON_SERVER_PORT>
```

**Working Directory**: `PYTHON_SERVER_APP_DIR`

**Environment Variables Passed**:
- `MISMO_ALLOW_FILE_PATHS`: Set to `"true"` to enable file path validation
- `MISMO_ALLOWED_PATH_PREFIXES`: JSON array of allowed directory paths from active library directories

### 3. Health Check Process

The Node.js server polls the Python server's `/health` endpoint every 500ms until:
- Health check succeeds (status 200 + `{"status": "ok"}`)
- Timeout is reached (configured by `PYTHON_SERVER_STARTUP_TIMEOUT_MS`)

**Health Check Endpoint**: `GET http://127.0.0.1:8000/health`

**Expected Response**:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "jobs_queued": 0,
  "jobs_processing": 0
}
```

### 4. Startup Timeline

Typical startup sequence with timings:

```
0s    - Node.js spawns Python process
3s    - TensorFlow initialization begins
4s    - TensorFlow CPU optimizations loaded
5s    - Uvicorn server process started
      - FastAPI application startup begins
15s   - ML models loading:
      - beat_this (BPM detection) on CUDA
      - BasicFeaturesAnalyzer
      - CharacteristicsAnalyzer
      - Genre classifier (discogs-effnet-bs64-1)
      - DJTransitionAnalyzer
19s   - Demucs model (htdemucs) loaded on CUDA
      - Job manager started
      - Application startup complete
20s   - Uvicorn running and accepting requests
      - /health endpoint available
20-25s - First successful health check
```

**Total startup time**: ~20-25 seconds

### 5. Timeout Considerations

The `PYTHON_SERVER_STARTUP_TIMEOUT_MS` parameter should account for:

1. **Python process spawn**: ~1-2 seconds
2. **TensorFlow initialization**: ~3-5 seconds
3. **ML model loading**: ~15-20 seconds (varies by hardware)
4. **Health check polling**: 500ms intervals

**Recommended timeout**:
- **Development (CPU)**: 60000ms (60 seconds)
- **Production (GPU)**: 45000ms (45 seconds) - faster with CUDA
- **Low-end hardware**: 90000ms (90 seconds)

**What happens on timeout**:
- Python process is killed (SIGTERM, then SIGKILL after 5s)
- Node.js server continues running with analysis features disabled
- Manual start available via API: `POST /api/analysis/start`
- Auto-retry on next Node.js restart

---

## Runtime Behavior

### Graceful Degradation

If the Python analysis server fails to start or crashes:
- ✅ Node.js server continues running normally
- ⚠️ Analysis features are disabled
- ℹ️ Status available via: `GET /api/analysis/status`
- 🔄 Manual restart via: `POST /api/analysis/restart`

### Health Monitoring

The Node.js server performs health checks:
- **During startup**: Every 500ms until timeout
- **Runtime**: On-demand via API calls
- **No continuous polling**: Relies on process monitoring

### Process Monitoring

The analysis server service monitors the Python process:
- **stdout/stderr capture**: Logs are prefixed with `[Analysis Server]`
- **Exit detection**: Automatic cleanup on process exit
- **Error handling**: Distinguishes errors vs normal output

### Library Directory Changes

When library directories are added or removed:

```javascript
1. Library directory created/deleted
2. Update database
3. Trigger analysis server update:
   ├─ Get new list of active directories
   ├─ Build new allowed paths array
   └─ Restart Python server with new paths
```

**Note**: This ensures the Python server only has access to currently active library directories.

---

## API Endpoints

### Status and Control

#### Get Server Status
```http
GET /api/analysis/status
```

**Response**:
```json
{
  "url": "http://127.0.0.1:8000",
  "port": "8000",
  "isHealthy": true,
  "isProcessRunning": true,
  "isReady": true,
  "autoStart": true,
  "pid": 12345
}
```

#### Check Health
```http
GET /api/analysis/health
```

**Response** (healthy):
```json
{
  "status": "healthy",
  "message": "Analysis server is responding"
}
```

**Response** (unhealthy):
```json
{
  "status": "unhealthy",
  "message": "Analysis server is not responding"
}
```
**Status Code**: 503 Service Unavailable

#### Start Server
```http
POST /api/analysis/start
```

**Response** (success):
```json
{
  "message": "Analysis server started successfully",
  "status": {
    "url": "http://127.0.0.1:8000",
    "isHealthy": true,
    "isReady": true,
    "pid": 12345
  }
}
```

**Response** (failure):
```json
{
  "error": "Failed to start analysis server",
  "message": "Server did not become ready within timeout"
}
```
**Status Code**: 500 Internal Server Error

#### Stop Server
```http
POST /api/analysis/stop
```

**Response**:
```json
{
  "message": "Analysis server stopped successfully"
}
```

#### Restart Server
```http
POST /api/analysis/restart
```

**Response** (success):
```json
{
  "message": "Analysis server restarted successfully",
  "status": {
    "url": "http://127.0.0.1:8000",
    "isHealthy": true,
    "isReady": true,
    "pid": 12346
  }
}
```

---

## Logs

### Log Format

Analysis server logs are prefixed with `[Analysis Server]` and color-coded:

```log
2025-10-12 14:32:31 info: [Analysis Server] INFO:     Started server process [114934]
2025-10-12 14:32:31 info: [Analysis Server] 2025-10-12 14:32:31,890 - src.app - INFO - Starting Mismo Audio Analysis Server
2025-10-12 14:32:46 info: [Analysis Server] 2025-10-12 14:32:46,770 - src.analysis.basic_features - INFO - beat_this initialized on cuda
2025-10-12 14:32:47 info: [Analysis Server] INFO:     Application startup complete.
```

### Log Levels

- **INFO**: Normal operation (startup, shutdown, model loading)
- **ERROR**: Critical errors that prevent operation
- **WARN**: Non-critical issues (GPU not available, retries)

### Common Log Messages

**Startup Success**:
```log
info: Initializing Python analysis server...
info: Starting analysis server with allowed paths: ["/path/to/music"]
info: Starting analysis server: /path/to/python -m uvicorn src.app:app --host 127.0.0.1 --port 8000
info: [Analysis Server] INFO:     Application startup complete.
info: ✓ Analysis server ready
```

**Startup Failure**:
```log
error: ✗ Analysis server failed to start within timeout
warn: ⚠ Analysis server not available - analysis features will be disabled
```

**Graceful Shutdown**:
```log
info: SIGTERM received, starting graceful shutdown...
info: Stopping analysis server...
info: Analysis server stopped
```

---

## Troubleshooting

### Server Fails to Start

**Symptom**: `✗ Analysis server failed to start within timeout`

**Causes**:
1. Python path is incorrect
2. App directory is incorrect
3. Python dependencies not installed
4. Timeout too short for hardware

**Solutions**:
```bash
# 1. Verify Python path
$ ls -la $PYTHON_SERVER_PYTHON_PATH
-rwxr-xr-x 1 user user 123 python*  # Should exist and be executable

# 2. Verify app directory contains src/app.py
$ ls $PYTHON_SERVER_APP_DIR/src/app.py
src/app.py  # Should exist

# 3. Check Python dependencies
$ $PYTHON_SERVER_PYTHON_PATH -m pip list | grep uvicorn
uvicorn  # Should be installed

# 4. Increase timeout in .env
PYTHON_SERVER_STARTUP_TIMEOUT_MS=90000  # 90 seconds
```

### Health Check Fails

**Symptom**: Server starts but health check never passes

**Causes**:
1. Port already in use
2. Firewall blocking localhost
3. Python server crashes after startup

**Solutions**:
```bash
# 1. Check if port is in use
$ netstat -tlnp | grep 8000
# If occupied, change PYTHON_SERVER_PORT

# 2. Test health endpoint manually
$ curl http://127.0.0.1:8000/health
{"status":"ok","version":"0.1.0",...}  # Should return this

# 3. Check Python server logs
$ tail -f logs/app.log
# Look for errors after "Application startup complete"
```

### Server Crashes After Startup

**Symptom**: Server starts successfully but crashes during operation

**Causes**:
1. Out of memory (models too large)
2. GPU errors (CUDA issues)
3. File permission errors

**Solutions**:
```bash
# 1. Check memory usage
$ free -h
# If low, reduce MAX_CONCURRENT_ANALYSIS or disable Demucs

# 2. Check GPU status
$ nvidia-smi  # For NVIDIA GPUs
$ rocm-smi    # For AMD GPUs

# 3. Check file permissions
$ ls -ld /path/to/music
drwxr-xr-x  # Should be readable
```

### Allowed Paths Not Working

**Symptom**: Analysis server rejects file paths that should be allowed

**Causes**:
1. Library directories not marked as active
2. Paths not normalized correctly
3. Server not restarted after directory change

**Solutions**:
```bash
# 1. Check active library directories
$ curl http://localhost:3000/api/library/directories
# Verify is_active: true

# 2. Restart analysis server
$ curl -X POST http://localhost:3000/api/analysis/restart

# 3. Check Python server logs for allowed paths
# Should see: MISMO_ALLOWED_PATH_PREFIXES='["/path1","/path2"]'
```

---

## Best Practices

### Configuration

1. **Use absolute paths**: Always use full paths for `PYTHON_SERVER_PYTHON_PATH` and `PYTHON_SERVER_APP_DIR`
2. **Virtual environment**: Always use a Python virtual environment, not system Python
3. **Timeout tuning**: Set timeout based on your hardware (slower = longer timeout)
4. **Port selection**: Avoid common ports (3000, 5000, 8080) to prevent conflicts

### Operations

1. **Monitor logs**: Check logs after startup to ensure all models load successfully
2. **Health checks**: Periodically check `/api/analysis/status` in production
3. **Graceful shutdown**: Always use proper shutdown (SIGTERM) to allow cleanup
4. **Resource limits**: Set `MAX_CONCURRENT_ANALYSIS` based on available RAM/GPU

### Development

1. **Disable auto-start**: Set `PYTHON_SERVER_AUTO_START=false` during development to start manually
2. **Increase timeout**: Use 90-120s timeout when debugging model loading
3. **Log level**: Set `LOG_LEVEL=debug` for detailed health check logs
4. **Test manually**: Use `curl` to test health endpoint before relying on auto-start

---

## Security Considerations

### File Path Restrictions

The `MISMO_ALLOWED_PATH_PREFIXES` environment variable restricts which files the Python server can access:

- ✅ Only active library directories are included
- ✅ Automatically updated when directories change
- ✅ Server restarts with new permissions
- ⚠️ Paths are validated but not sandboxed at OS level

### Network Security

- Server binds to `127.0.0.1` (localhost only) by default
- Not accessible from external networks
- No authentication required for local access
- Consider firewall rules if exposing externally

### Process Security

- Python server runs as same user as Node.js server
- No privilege escalation
- Inherits Node.js process permissions
- File access limited to user permissions

---

## Performance Considerations

### Startup Time

Factors affecting startup time:
- **Hardware**: CPU vs GPU (GPU is ~2x faster)
- **Model loading**: ~15-20 seconds for all ML models
- **Disk speed**: SSD recommended for faster model loading
- **RAM**: 8GB minimum, 16GB recommended

### Runtime Performance

- **Concurrent jobs**: Set `MAX_CONCURRENT_ANALYSIS` based on CPU/GPU cores
- **Memory usage**: ~2-4GB per analysis job (depends on track length)
- **GPU acceleration**: Significant speedup for BPM detection and stem separation
- **Queue management**: Jobs are queued if max concurrent limit reached

---

## Future Enhancements

Planned improvements for analysis server integration:

1. **Continuous health monitoring**: Periodic background health checks
2. **Auto-restart on crash**: Automatic recovery from unexpected crashes
3. **Progress streaming**: Real-time analysis progress via WebSockets
4. **Resource monitoring**: CPU/GPU/Memory usage tracking
5. **Multiple server support**: Load balancing across multiple analysis servers
6. **Offline mode**: Queue analysis jobs when server is unavailable

---

## See Also

- [Python Analysis Server Documentation](https://github.com/mismo-dj/analysis-server)
- [API Documentation](./api-documentation.md)
- [Deployment Guide](./deployment.md)
- [Configuration Reference](./.env.example)
