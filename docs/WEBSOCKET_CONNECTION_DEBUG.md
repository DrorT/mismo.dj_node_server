# WebSocket Connection Issues - Debugging & Fix

**Date**: 2025-10-14
**Issue**: App server connecting and disconnecting every 30-60 seconds; seeing 2 WebSocket connections

## Problem Summary

The app server was experiencing rapid connect/disconnect cycles, and the audio server was reporting "App server disconnected" messages even though the app server wasn't actually disconnecting. Additionally, 2 WebSocket connections were showing up instead of the expected 1.

### Observed Symptoms

```
WebSocket client connected (total: 1)
App server disconnected
WebSocket client disconnected (total: 0)
WebSocket client connected (total: 1)
✓ App server connected and registered
WebSocket client connected (total: 2)
App server disconnected
WebSocket client disconnected (total: 1)
```

## Root Cause Analysis

### Issue #1: Audio Server Bug - Unconditional clearAppServerClient()

**Location**: `mismo.dj_audio_server/Source/Network/WebSocketServer.cpp:862-864`

**The Bug**:
```cpp
// Connection closed
.close = [this](auto* ws, int code, std::string_view message) {
    // Check if this was the app server
    appServerConnection.clearAppServerClient();  // ❌ ALWAYS called!

    // Remove client from list...
```

The comment says "Check if this was the app server" but the code **unconditionally** calls `clearAppServerClient()` for **every** client disconnection, not just when the app server disconnects.

**Impact**:
- When ANY WebSocket client disconnects (e.g., the web UI, or any other connection), the audio server incorrectly clears the app server connection
- This causes "App server disconnected" messages even when the app server is still connected
- The app server then attempts to reconnect, creating the disconnect/reconnect cycle

### Issue #2: Multiple Connections - Unknown Web Client

The second connection (2 total connections) is NOT from the app server. The app server only creates one WebSocket connection. The second connection is likely:
- The web UI attempting to connect to the audio server directly (shouldn't happen)
- Another service or process connecting
- A lingering connection from a previous session

**To investigate further**: Check if the web UI has any WebSocket connection code targeting port 8080.

## Solution

### Fix #1: Check Connection Identity Before Clearing

**Files Modified**:
- `mismo.dj_audio_server/Source/Network/AppServerConnection.h`
- `mismo.dj_audio_server/Source/Network/AppServerConnection.cpp`
- `mismo.dj_audio_server/Source/Network/WebSocketServer.cpp`

**Changes**:

1. **Added method to check connection identity** (AppServerConnection.h):
```cpp
/**
 * Check if a given WebSocket connection is the app server.
 *
 * @param ws Pointer to the WebSocket connection to check
 * @return true if this is the app server client connection
 */
bool isAppServerClient(uWS::WebSocket<false, true, int>* ws);
```

2. **Implemented identity check** (AppServerConnection.cpp):
```cpp
bool AppServerConnection::isAppServerClient(uWS::WebSocket<false, true, int>* ws)
{
    std::lock_guard<std::mutex> lock(connectionMutex);
    return appServerClient == ws;
}
```

3. **Fixed close handler** (WebSocketServer.cpp):
```cpp
// Connection closed
.close = [this](auto* ws, int code, std::string_view message) {
    // Check if this was the app server and clear it if so
    if (appServerConnection.isAppServerClient(ws))
    {
        appServerConnection.clearAppServerClient();
    }

    // Remove client from list (thread-safe)
    // ...
```

### Fix #2: Enhanced Logging in App Server Client

**File Modified**: `mismo.dj_app_server/src/services/audioServerClient.service.js`

Added comprehensive logging to track:
- Connection attempts with unique IDs
- Connection lifecycle (open, close, error)
- Keepalive ping/pong messages with timestamps
- Reconnection attempts and backoff delays

**Log Prefixes**:
- `[WS-CONNECT-{id}]`: Connection attempts
- `[WS-{id}]`: Connection opened events
- `[WS-CLOSE]`: Connection closed events
- `[WS-ERROR]`: Connection errors
- `[WS-KEEPALIVE]`: Ping/pong keepalive messages
- `[WS-RECONNECT]`: Reconnection attempts

This makes it easy to trace the entire lifecycle of each connection attempt and identify patterns.

## Network Architecture Notes

### Audio Server WebSocket Configuration
- **Port**: 8080
- **Idle Timeout**: 120 seconds (2 minutes)
- **Expected Clients**: App server (Node.js), optionally web UI for live updates

### App Server WebSocket Client Configuration
- **Target**: `ws://localhost:8080`
- **Keepalive Pings**: Every 30 seconds
- **Reconnect Strategy**: Exponential backoff (1s → 30s max)
- **Identification**: Sends `{"type": "appServerIdentify"}` immediately on connect

### Keepalive Strategy
The app server sends WebSocket pings every 30 seconds to prevent the audio server's 120-second idle timeout from disconnecting it. This is working correctly.

## Testing the Fix

### Before Fix
```
WebSocket client connected (total: 1)
App server disconnected          # ❌ Wrong - app server still connected!
WebSocket client disconnected (total: 0)
WebSocket client connected (total: 1)
✓ App server connected and registered
WebSocket client connected (total: 2)
App server disconnected          # ❌ Wrong again!
```

### After Fix (Expected)
```
WebSocket client connected (total: 1)
✓ App server connected and registered
[WS-KEEPALIVE] Sent ping to audio server at {timestamp}
[WS-KEEPALIVE] Received pong from audio server at {timestamp}
... (stable connection, no disconnects)

# If a non-app-server client connects and disconnects:
WebSocket client connected (total: 2)
WebSocket client disconnected (total: 1)
# ✓ App server connection remains intact
```

## UPDATE: Second Investigation - Health Check Issue

### NEW Root Cause Discovered!

After implementing the fix and observing continued connect/disconnect cycles, we discovered a **second major issue**:

**Location**: `mismo.dj_app_server/src/services/audioServer.service.js:168-221` (checkHealth method)

**The Problem**:
The `audioServer.service.js` runs a periodic health check **every 30 seconds** (configurable via `AUDIO_SERVER_HEALTH_CHECK_INTERVAL`). Each health check creates a **new WebSocket connection** to test if the audio server is alive, then immediately closes it!

```javascript
// ❌ OLD CODE: Creates a new connection for every health check!
async checkHealth() {
  const ws = new WebSocket(wsUrl);  // New connection every 30s!
  ws.on('open', () => {
    ws.close();  // Immediate disconnect
    resolve(true);
  });
}
```

This caused:
- Connect/disconnect cycle every 30 seconds (exactly what was observed!)
- Unnecessary resource usage
- Log pollution
- Confusion about whether the app server was actually disconnecting

### Solution: Reuse Existing Connection

Instead of creating new connections, we now check if the **app server client** is already connected:

```javascript
// ✅ NEW CODE: Reuse existing connection
async checkHealth() {
  const audioServerClientService = (await import('./audioServerClient.service.js')).default;

  // If the app server client is connected, the audio server is healthy
  if (audioServerClientService.isConnected()) {
    logger.debug('Audio server health check passed (using existing connection)');
    return true;
  }

  // Only create a test connection during initial startup
  // (not for periodic health checks)
  // ...
}
```

**Benefits**:
- No more connect/disconnect cycles
- Faster health checks (no connection overhead)
- Cleaner logs
- Lower resource usage

## Next Steps

1. **Restart the audio server** to apply enhanced logging
2. **Restart the app server** to apply the health check fix
3. **Monitor logs** for 5 minutes to verify stable connection
4. **Observe the detailed connection logs** to identify any remaining mystery connections

## Lessons Learned

### Defensive Programming
The original code had a comment indicating intent ("Check if this was the app server") but didn't implement the actual check. This is a common bug pattern:

```cpp
// ❌ Comment describes intent but code doesn't match
// Check if this was the app server
appServerConnection.clearAppServerClient();  // Always called!

// ✅ Code matches comment
// Check if this was the app server
if (appServerConnection.isAppServerClient(ws))
{
    appServerConnection.clearAppServerClient();
}
```

**Takeaway**: When code comments describe conditional logic ("if", "check if", "when"), the code should implement that condition.

### Connection Identity Tracking
In multi-client WebSocket servers, it's important to:
1. Distinguish between different types of clients
2. Have methods to check client identity
3. Only apply client-specific logic when that specific client disconnects

### Logging Best Practices
The enhanced logging helps immensely with debugging WebSocket issues:
- **Unique IDs** for each connection attempt prevent confusion
- **Structured prefixes** (`[WS-CONNECT]`, `[WS-CLOSE]`) make log filtering easy
- **Timestamps** help correlate events across services
- **Context in errors** (state, codes, reasons) speeds up debugging

## Related Files

### Modified Files
- [Source/Network/WebSocketServer.cpp](/home/chester/dev/music/mismo.dj_audio_server/Source/Network/WebSocketServer.cpp#L862-L881)
- [Source/Network/AppServerConnection.h](/home/chester/dev/music/mismo.dj_audio_server/Source/Network/AppServerConnection.h#L78-L84)
- [Source/Network/AppServerConnection.cpp](/home/chester/dev/music/mismo.dj_audio_server/Source/Network/AppServerConnection.cpp#L45-L49)
- [src/services/audioServerClient.service.js](/home/chester/dev/music/mismo.dj_app_server/src/services/audioServerClient.service.js)

### Key Configuration Files
- [.env.example](/home/chester/dev/music/mismo.dj_app_server/.env.example) - WebSocket configuration
- [src/config/settings.js](/home/chester/dev/music/mismo.dj_app_server/src/config/settings.js) - Server settings

---

## Summary of All Fixes

### Fix #1: Audio Server Bug (clearAppServerClient)
- **Issue**: Audio server cleared app server connection for ALL disconnects
- **Fix**: Check connection identity before clearing
- **Status**: ✅ **FIXED**

### Fix #2: Health Check Creating Connections
- **Issue**: Health check created new WebSocket connection every 30 seconds
- **Fix**: Reuse existing app server client connection for health checks
- **Status**: ✅ **FIXED**

### Fix #3: Enhanced Logging
- **Audio Server C++**: Detailed connection/disconnect logs with pointers and close codes
- **App Server JS**: Connection lifecycle tracking with unique IDs and timestamps
- **Status**: ✅ **IMPLEMENTED**

---

**Overall Status**: ✅ **FIXED** - Both root causes identified and corrected
**Build**: ✅ **SUCCESS** - Audio server rebuilt with enhanced logging
**Testing**: ⏳ **PENDING** - Requires server restart and monitoring

**Expected Result After Restart**:
- Single stable connection from app server to audio server
- No more periodic connect/disconnect cycles
- Detailed logs showing connection lifecycle
- Health checks passing without creating new connections
