# WebSocket Keepalive Fix - Audio Server Connection

## Problem

The app server was experiencing periodic disconnections from the audio server after approximately 2 minutes of inactivity. The logs showed:

```
[Audio Server] Cannot request track info: app server not connected
✗ Failed to get track info: App server not connected
```

## Root Cause

The C++ audio server has a WebSocket idle timeout configured:

**File**: `mismo.dj_audio_server/Source/Network/WebSocketServer.cpp:824`
```cpp
.idleTimeout = 120,  // 2 minutes idle timeout
```

The Node.js app server did not have any keepalive mechanism, so after 2 minutes without message activity, the audio server would automatically close the connection.

## Solution

Implemented a **WebSocket ping/pong keepalive mechanism** in the app server client:

### Changes Made

**File**: `src/services/audioServerClient.service.js`

1. **Added ping interval configuration** (line 26-27):
   - Default: 30 seconds (configurable via `AUDIO_SERVER_PING_INTERVAL`)
   - This is well below the 120-second timeout

2. **Implemented ping interval methods**:
   - `startPingInterval()`: Sends periodic pings to keep connection alive
   - `stopPingInterval()`: Cleans up interval on disconnect
   - `handlePing()`: Auto-responds to pings from server (handled by ws library)
   - `handlePong()`: Logs pong responses for debugging

3. **Integrated into connection lifecycle**:
   - Starts ping interval immediately after connection opens
   - Stops ping interval when connection closes
   - Properly cleaned up on manual disconnect

### Configuration

Added new environment variable to `.env.example`:

```bash
# WebSocket client (App Server connects TO Audio Server)
AUDIO_SERVER_PING_INTERVAL=30000  # Send ping every 30 seconds
```

**Recommended values**:
- Minimum: 10000 (10 seconds)
- Default: 30000 (30 seconds) - safe margin below 120s timeout
- Maximum: 60000 (60 seconds) - still below timeout but less overhead

## How It Works

1. **App server connects** to audio server WebSocket
2. **Sends identification message**: `{"type": "appServerIdentify"}`
3. **Starts ping interval**: Every 30 seconds (by default)
4. **Sends WebSocket ping frame**: Not a JSON message, uses native WS ping
5. **Audio server responds with pong**: Resets the idle timeout counter
6. **Connection stays alive**: As long as pings continue every <120 seconds

## WebSocket Ping vs JSON Messages

The implementation uses **WebSocket control frames** (ping/pong), not JSON messages:

- **Ping/Pong frames**: Native WebSocket protocol, minimal overhead
- **Automatic handling**: The `ws` library automatically responds to pings with pongs
- **No application logic needed**: Transparent to message handlers
- **Efficient**: Very small frames, no JSON parsing overhead

## Testing the Fix

To verify the fix works:

1. **Start both servers**:
   ```bash
   # Terminal 1: Start audio server (or let app server auto-start it)
   cd ~/dev/music/mismo.dj_audio_server/build/MismoDJ_artefacts/Debug
   ./MismoDJ

   # Terminal 2: Start app server
   cd ~/dev/music/mismo.dj_app_server
   npm start
   ```

2. **Monitor the logs**:
   ```bash
   tail -f logs/app.log | grep -E "(ping|pong|Connected|closed)"
   ```

3. **Expected behavior**:
   - Initial connection: `✓ Connected to audio server`
   - Every 30 seconds: `Sent ping to audio server` (debug level)
   - Pong responses: `Received pong from audio server` (debug level)
   - **No disconnections** after 2 minutes

4. **Wait for 5+ minutes** without any track loading activity
   - Connection should remain stable
   - No "app server not connected" errors

5. **Test with track loading**:
   - Load a track in the UI
   - Should work immediately (no reconnection delay)

## Performance Impact

**Minimal overhead**:
- Ping frame: ~2 bytes
- Pong frame: ~2 bytes
- Total: 4 bytes every 30 seconds = ~0.13 bytes/second
- CPU: Negligible (simple timer + frame send)

**Benefits**:
- Eliminates reconnection delays
- Prevents request failures during idle periods
- Maintains stable connection for real-time track loading

## Alternative Solutions Considered

1. **Increase audio server timeout**: Would require C++ code changes, rebuild
2. **JSON heartbeat messages**: More overhead, requires message parsing
3. **Disable timeout entirely**: Not recommended for production (resource leaks)
4. **Reactive reconnection only**: Current behavior (causes request failures)

The ping/pong approach is the **standard WebSocket keepalive pattern** and has minimal impact.

## Future Improvements

Potential enhancements (not implemented):

1. **Adaptive ping interval**: Increase frequency if connection seems unstable
2. **Pong timeout detection**: Detect if server stops responding to pings
3. **Connection health metrics**: Track ping/pong latency for monitoring
4. **Configurable per environment**: Different intervals for dev vs production

---

**Date**: 2025-10-14
**Issue**: Audio server WebSocket disconnections after 2 minutes
**Status**: Fixed
**Files Modified**:
- `src/services/audioServerClient.service.js`
- `.env.example`
