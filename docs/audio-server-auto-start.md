# Audio Server Auto-Start and Monitoring

## Overview

The app server now automatically starts, monitors, and manages the C++ audio server lifecycle. This provides seamless integration with automatic startup, health monitoring, crash recovery, and graceful shutdown.

## Features

### 1. Automatic Startup
- Starts audio server executable on app server initialization
- Non-blocking parallel startup (doesn't delay other services)
- Configurable executable path for different build configurations
- WebSocket-based health checks to verify readiness

### 2. Health Monitoring
- Periodic health checks via WebSocket connection tests
- Configurable monitoring interval (default: 30 seconds)
- Automatic detection of server crashes/failures
- Real-time status reporting

### 3. Crash Recovery
- Automatic restart on unexpected failures
- Exponential backoff with restart limits
- Restart counter with time window (5 restarts within 5 minutes)
- Prevents infinite restart loops

### 4. Graceful Shutdown
- Properly terminates audio server on app shutdown
- SIGTERM for graceful cleanup
- SIGKILL fallback after timeout
- Ensures no orphaned processes

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Audio Server Configuration
AUDIO_SERVER_HTTP_URL=http://127.0.0.1:8080
AUDIO_SERVER_HTTP_PORT=8080
AUDIO_SERVER_WS_URL=ws://localhost:8080
AUDIO_SERVER_WS_PORT=8080
AUDIO_SERVER_AUTO_START=true
AUDIO_SERVER_AUTO_RESTART=true
AUDIO_SERVER_STARTUP_TIMEOUT_MS=10000
AUDIO_SERVER_HEALTH_CHECK_INTERVAL=30000
AUDIO_SERVER_MAX_RESTARTS=5
AUDIO_SERVER_EXECUTABLE_PATH=/path/to/MismoDJ
AUDIO_SERVER_WORKING_DIR=/path/to/build/directory
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `AUDIO_SERVER_HTTP_URL` | `http://127.0.0.1:8080` | Base HTTP URL (for future HTTP endpoints) |
| `AUDIO_SERVER_HTTP_PORT` | `8080` | HTTP port number |
| `AUDIO_SERVER_WS_URL` | `ws://localhost:8080` | WebSocket URL for client connections |
| `AUDIO_SERVER_WS_PORT` | `8080` | WebSocket port number |
| `AUDIO_SERVER_AUTO_START` | `true` | Enable automatic startup |
| `AUDIO_SERVER_AUTO_RESTART` | `true` | Enable crash recovery |
| `AUDIO_SERVER_STARTUP_TIMEOUT_MS` | `10000` | Max time to wait for startup (ms) |
| `AUDIO_SERVER_HEALTH_CHECK_INTERVAL` | `30000` | Health check frequency (ms) |
| `AUDIO_SERVER_MAX_RESTARTS` | `5` | Max restarts within time window |
| `AUDIO_SERVER_EXECUTABLE_PATH` | *required* | Path to audio server executable |
| `AUDIO_SERVER_WORKING_DIR` | *optional* | Working directory for process |

### Changing Build Configuration

The executable path is configurable to support different build types:

**Debug Build (Development):**
```bash
AUDIO_SERVER_EXECUTABLE_PATH=/home/chester/dev/music/mismo.dj_audio_server/build/MismoDJ_artefacts/Debug/MismoDJ
AUDIO_SERVER_WORKING_DIR=/home/chester/dev/music/mismo.dj_audio_server/build
```

**Release Build (Production):**
```bash
AUDIO_SERVER_EXECUTABLE_PATH=/home/chester/dev/music/mismo.dj_audio_server/build/MismoDJ_artefacts/Release/MismoDJ
AUDIO_SERVER_WORKING_DIR=/home/chester/dev/music/mismo.dj_audio_server/build
```

**Installed Location:**
```bash
AUDIO_SERVER_EXECUTABLE_PATH=/usr/local/bin/MismoDJ
AUDIO_SERVER_WORKING_DIR=/usr/local/share/mismo-dj
```

## Architecture

### Services

#### 1. `audioServer.service.js`
Manages the audio server process lifecycle:

- **Process Management**: Spawns and monitors the C++ executable
- **Health Checks**: WebSocket connection tests
- **Auto-Restart**: Handles crash recovery with limits
- **Logging**: Captures stdout/stderr to log file

Key Methods:
- `initializeAsync()` - Non-blocking startup
- `waitForReady(timeout)` - Wait for server readiness
- `checkHealth()` - WebSocket health check
- `start()` - Start the server process
- `stop()` - Gracefully stop the server
- `restart()` - Restart the server
- `getStatus()` - Get current status

#### 2. `audioServerClient.service.js`
Handles WebSocket communication:

- **Connection Management**: Connects when server is ready
- **Message Handling**: Processes track info requests
- **Auto-Reconnect**: Handles connection failures
- **Integration**: Coordinates with analysis queue

Modified Behavior:
- Waits for `audioServerService.isReady` before connecting
- Uses `waitForReady()` to ensure server availability

### Startup Flow

```
Time  | Event
------|--------------------------------------------------------
0ms   | ✓ App server starts listening on port 3000
0ms   | → Initializing Python analysis server (background)
0ms   | → Initializing C++ audio server (background)
0ms   | → Starting library directory scans
0ms   | Audio server process spawning...
~500ms| Audio server WebSocket ready
~500ms| ✓ Audio server health check passed
~500ms| ✓ Audio server ready
~500ms| → Connecting to audio server WebSocket
~600ms| ✓ Audio server WebSocket client connected
~19s  | ✓ Analysis server ready (models loading)
~24s  | ✓ Analysis queue initialized
```

**Total Blocking Time**: **0 seconds** - App server is immediately responsive!

### Health Check Implementation

Since the audio server only exposes a WebSocket interface (no HTTP health endpoint), health checks are performed by attempting a WebSocket connection:

```javascript
async checkHealth() {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${this.wsPort}`);

    ws.on('open', () => {
      ws.close();
      resolve(true); // Server is healthy
    });

    ws.on('error', () => {
      resolve(false); // Server is down
    });
  });
}
```

**Why WebSocket instead of HTTP?**
- Audio server is primarily a WebSocket server
- No HTTP endpoints currently implemented
- WebSocket connection test is sufficient for health validation
- Fast and lightweight (< 100ms)

### Crash Recovery Logic

When a crash is detected:

1. **Check Restart Window**: Reset counter if outside 5-minute window
2. **Check Restart Limit**: Give up if max restarts exceeded
3. **Increment Counter**: Track restart attempts
4. **Delay Before Restart**: Wait 2 seconds
5. **Attempt Restart**: Call `start()` method

```javascript
// Example: Server crashes twice in quick succession
Crash 1: restartCount = 1/5, waiting 2s, restarting...
Crash 2: restartCount = 2/5, waiting 2s, restarting...
... (continues up to 5 times)
Crash 6: restartCount = 6/5, GIVING UP - manual intervention required
```

After 5 minutes without crashes, the counter resets to 0.

## Logging

### Log Files

Audio server logs are written to: `logs/audio_server.log`

Format:
```
=== Audio Server Started: 2025-10-14T17:19:05.123Z ===

[STDOUT] JUCE v8.0.10
[STDOUT] ✅ Mixer ready with Deck A and Deck B
[STDOUT] WebSocket server listening on port 8080
[STDOUT] ✓ WebSocket server started on ws://localhost:8080

=== Audio Server Exited: 2025-10-14T17:25:32.456Z (code: 0, signal: SIGTERM) ===
```

### Application Logs

Key log messages:

```
# Startup
[INFO]: Initializing C++ audio server (background)...
[INFO]: Starting audio server: /path/to/MismoDJ
[INFO]: Waiting for audio server to be ready...
[INFO]: ✓ Audio server started successfully
[INFO]: Starting audio server health monitoring (interval: 30000ms)
[INFO]: ✓ Audio server ready

# Health Monitoring
[DEBUG]: Audio server health check passed
[WARN]: Audio server health check failed, attempting restart...

# Crash Recovery
[WARN]: Audio server crashed, attempting auto-restart...
[INFO]: Restarting audio server (attempt 1/5)...
[ERROR]: Audio server has crashed 5 times within 300s, giving up

# Shutdown
[INFO]: Stopping audio server...
[INFO]: Audio server stopped
```

## API Endpoints

### Get Audio Server Status

```http
GET /api/audio-server/status
```

**Response:**
```json
{
  "httpUrl": "http://127.0.0.1:8080",
  "httpPort": "8080",
  "wsPort": "8080",
  "executablePath": "/path/to/MismoDJ",
  "isHealthy": true,
  "isProcessRunning": true,
  "isReady": true,
  "autoStart": true,
  "autoRestart": true,
  "pid": 12345,
  "restartCount": 0,
  "maxRestarts": 5,
  "healthMonitoring": true
}
```

### Control Endpoints

```http
POST /api/audio-server/start
POST /api/audio-server/stop
POST /api/audio-server/restart
```

*(These endpoints would need to be implemented in routes)*

## Troubleshooting

### Audio Server Won't Start

**Check executable path:**
```bash
ls -la $AUDIO_SERVER_EXECUTABLE_PATH
# Should show executable file
```

**Check permissions:**
```bash
chmod +x /path/to/MismoDJ
```

**Check logs:**
```bash
tail -f logs/audio_server.log
```

### Health Checks Failing

**Verify WebSocket port is available:**
```bash
netstat -an | grep 8080
# Should show LISTEN on port 8080
```

**Test WebSocket connection manually:**
```bash
wscat -c ws://localhost:8080
# Should connect successfully
```

### Too Many Restarts

**Check crash logs:**
```bash
grep "exited with code" logs/audio_server.log
```

**Increase restart limit:**
```bash
AUDIO_SERVER_MAX_RESTARTS=10
```

**Disable auto-restart during debugging:**
```bash
AUDIO_SERVER_AUTO_RESTART=false
```

### Process Won't Stop

The service uses SIGTERM with a 5-second timeout, then SIGKILL as fallback. If processes persist:

```bash
# Find orphaned processes
ps aux | grep MismoDJ

# Force kill
pkill -9 MismoDJ
```

## Development Workflow

### Debug Build (Current Setup)

```bash
# .env configuration
AUDIO_SERVER_EXECUTABLE_PATH=/home/chester/dev/music/mismo.dj_audio_server/build/MismoDJ_artefacts/Debug/MismoDJ
AUDIO_SERVER_AUTO_START=true
AUDIO_SERVER_AUTO_RESTART=true
```

**Benefits:**
- Automatic startup during development
- Immediate feedback on crashes
- Integrated logging

### Manual Control

Disable auto-start for manual testing:

```bash
# .env
AUDIO_SERVER_AUTO_START=false
AUDIO_SERVER_AUTO_RESTART=false
```

Then start audio server manually:
```bash
cd /home/chester/dev/music/mismo.dj_audio_server/build
./MismoDJ_artefacts/Debug/MismoDJ
```

### Production Deployment

```bash
# .env for production
AUDIO_SERVER_EXECUTABLE_PATH=/opt/mismo-dj/bin/MismoDJ
AUDIO_SERVER_WORKING_DIR=/opt/mismo-dj
AUDIO_SERVER_AUTO_START=true
AUDIO_SERVER_AUTO_RESTART=true
AUDIO_SERVER_MAX_RESTARTS=3
AUDIO_SERVER_HEALTH_CHECK_INTERVAL=60000
```

## Code Examples

### Waiting for Server Readiness

```javascript
import audioServerService from './services/audioServer.service.js';

// Wait for server to be ready (with timeout)
const isReady = await audioServerService.waitForReady(30000);
if (isReady) {
  console.log('Audio server is ready!');
} else {
  console.error('Audio server failed to start');
}
```

### Checking Server Status

```javascript
const status = await audioServerService.getStatus();
console.log('Audio Server Status:', status);
// {
//   isHealthy: true,
//   isProcessRunning: true,
//   isReady: true,
//   pid: 12345,
//   ...
// }
```

### Manual Restart

```javascript
const success = await audioServerService.restart();
if (success) {
  console.log('Audio server restarted successfully');
}
```

## Related Documentation

- [Audio Server Integration](./audio-server-integration.md) (if exists)
- [Non-Blocking Analysis Server Startup](./non-blocking-analysis-server-startup.md)
- [WebSocket Protocol](./websocket-protocol.md) (if exists)

## Future Enhancements

Potential improvements:

1. **HTTP Health Endpoint**: Add HTTP `/health` to audio server for simpler checks
2. **Metrics Collection**: Track uptime, restart frequency, connection count
3. **Status Dashboard**: Real-time UI showing server health
4. **Graceful Reload**: Hot-reload configuration without full restart
5. **Multiple Instances**: Support for multiple audio server instances
6. **Process Supervisor**: Integration with systemd or PM2 for production
