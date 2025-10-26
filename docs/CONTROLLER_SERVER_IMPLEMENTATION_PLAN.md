# Controller Server Implementation Plan

**Project**: Mismo DJ Controller Server
**Purpose**: Unified MIDI and HID device handling for DJ controller hardware
**Date**: 2025-10-26
**Status**: Planning Phase

---

## Executive Summary

The Controller Server is a new Node.js-based microservice that will handle all physical controller input (MIDI and HID devices) for the Mismo DJ system. It translates hardware inputs into application actions and provides bidirectional communication for LED feedback, displays, and VU meters.

### Key Goals
1. Support both MIDI and HID DJ controllers simultaneously
2. Provide low-latency routing to Audio Engine, App Server, and Web UI
3. Enable bidirectional communication for visual feedback to controllers
4. Create a flexible, configuration-based mapping system
5. Maintain protocol-agnostic interface for downstream services

---

## Architecture Overview

### System Integration

```
┌──────────────────────────────────────────────┐
│         Physical Controllers                  │
├───────────────────┬──────────────────────────┤
│  MIDI Devices     │  HID Devices             │
│  - Pioneer DDJ-*  │  - Traktor Kontrol S*    │
│  - Numark         │  - Native Instruments    │
│  - Generic MIDI   │  - Custom HID controllers│
└───────────────────┴──────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────┐
│      Controller Server (Node.js)               │
│                                                │
│  ┌──────────────┐      ┌──────────────┐      │
│  │ MIDI Manager │      │ HID Manager  │      │
│  │ (easymidi)   │      │ (node-hid)   │      │
│  └──────────────┘      └──────────────┘      │
│         │                      │              │
│         └──────────┬───────────┘              │
│                    ▼                          │
│         ┌──────────────────────┐             │
│         │  Protocol Translator │             │
│         │  (Normalize inputs)  │             │
│         └──────────────────────┘             │
│                    │                          │
│                    ▼                          │
│         ┌──────────────────────┐             │
│         │   Action Mapper      │             │
│         │  (Config-based)      │             │
│         └──────────────────────┘             │
│                    │                          │
│                    ▼                          │
│         ┌──────────────────────┐             │
│         │   Action Router      │             │
│         │  (Priority queues)   │             │
│         └──────────────────────┘             │
│                    │                          │
│         ┌──────────┼──────────┐              │
│         │          │          │              │
│         ▼          ▼          ▼              │
│    ┌────────┐ ┌────────┐ ┌────────┐        │
│    │Audio WS│ │App WS  │ │UI WS   │        │
│    └────────┘ └────────┘ └────────┘        │
│         │          │          │              │
│         ▼          ▼          ▼              │
│    ┌─────────────────────────────────┐     │
│    │  Feedback Manager               │     │
│    │  (Aggregate state, send to HW)  │     │
│    └─────────────────────────────────┘     │
│                    │                        │
│                    ▼                        │
│         Send LED/Display updates           │
│         back to controllers                │
└────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
   Audio Engine    App Server      Web UI
```

### Communication Protocols

| Connection | Protocol | Direction | Purpose |
|------------|----------|-----------|---------|
| MIDI Hardware | MIDI (USB/DIN) | Bidirectional | Control input, LED output |
| HID Hardware | USB HID | Bidirectional | Control input, display/LED output |
| Audio Engine | WebSocket | Bidirectional | Commands out, state/VU in |
| App Server | WebSocket | Bidirectional | Commands out, library state in |
| Web UI | WebSocket | Send only | State updates for visual feedback |

---

## Phase 1: Project Setup & Basic MIDI Support

**Duration**: 1-2 days
**Goal**: Create foundational server with MIDI device detection and basic input handling

### 1.1 Repository Setup

**New Repository**: `mismo.dj_controller_server`

```
mismo.dj_controller_server/
├── src/
│   ├── server.js                 # Main entry point
│   ├── managers/
│   │   ├── MIDIManager.js        # MIDI device management
│   │   └── HIDManager.js         # HID device management (Phase 2)
│   ├── translators/
│   │   ├── MIDITranslator.js     # MIDI protocol translation
│   │   └── HIDTranslator.js      # HID protocol translation (Phase 2)
│   ├── mapping/
│   │   ├── ActionMapper.js       # Configuration-based mapping
│   │   └── ActionRouter.js       # Route actions to targets
│   ├── websocket/
│   │   ├── AudioEngineClient.js  # WebSocket to Audio Engine
│   │   ├── AppServerClient.js    # WebSocket to App Server
│   │   └── WebUIClient.js        # WebSocket to Web UI
│   ├── feedback/
│   │   └── FeedbackManager.js    # Aggregate state, send to hardware
│   └── utils/
│       ├── logger.js             # Logging utilities
│       └── config.js             # Configuration loader
├── config/
│   ├── devices/
│   │   ├── generic-midi.json     # Generic MIDI mapping
│   │   ├── pioneer-ddj-400.json  # Device-specific mappings
│   │   └── traktor-s4.json       # HID device mapping (Phase 2)
│   └── server.json               # Server configuration
├── test/
│   ├── unit/
│   │   ├── MIDIManager.test.js
│   │   ├── ActionMapper.test.js
│   │   └── ActionRouter.test.js
│   ├── integration/
│   │   └── midi-to-websocket.test.js
│   └── manual/
│       ├── phase1-midi-test.html
│       └── virtual-midi-device.js  # For testing without hardware
├── docs/
│   ├── API.md                    # WebSocket API documentation
│   ├── MAPPINGS.md               # How to create device mappings
│   └── ARCHITECTURE.md           # Technical architecture
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

### 1.2 Dependencies

```json
{
  "name": "mismo-dj-controller-server",
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=24.0.0"
  },
  "dependencies": {
    "easymidi": "^3.0.1",           // MIDI support
    "node-hid": "^3.1.0",           // HID support (Phase 2)
    "ws": "^8.16.0",                // WebSocket client
    "dotenv": "^16.4.1",            // Environment config
    "winston": "^3.11.0"            // Logging
  },
  "devDependencies": {
    "jest": "^29.7.0",              // Testing
    "eslint": "^8.56.0",            // Linting
    "nodemon": "^3.0.3"             // Development
  }
}
```

### 1.3 Core Components

#### MIDIManager.js
**Purpose**: Detect, connect, and manage MIDI devices

```javascript
/**
 * Manages MIDI device connections and event handling
 *
 * Features:
 * - Auto-detect connected MIDI devices
 * - Hot-plug support (detect new devices)
 * - Event emission for normalized MIDI events
 * - Send MIDI output for LED feedback
 */
class MIDIManager extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map(); // deviceId -> { input, output, config }
  }

  // Scan for available MIDI devices
  async scanDevices();

  // Connect to specific device by name
  async connectDevice(deviceName, config);

  // Disconnect device
  async disconnectDevice(deviceId);

  // Send MIDI output (LED, display)
  sendMIDI(deviceId, message);

  // Internal: Handle MIDI input events
  _handleMIDIInput(deviceId, message);

  // Normalize MIDI message to common format
  _normalizeMIDIMessage(rawMessage);
}
```

**Events Emitted**:
- `device:connected` - New device connected
- `device:disconnected` - Device disconnected
- `input` - Normalized input event: `{ deviceId, type, channel, value, rawMessage }`

#### MIDITranslator.js
**Purpose**: Translate MIDI messages to semantic actions

```javascript
/**
 * Translates raw MIDI events into semantic actions
 *
 * Example:
 * Input:  { type: 'noteon', channel: 0, note: 0x10, velocity: 127 }
 * Output: { action: 'play', deck: 'A', value: true }
 */
class MIDITranslator {
  constructor(mapping) {
    this.mapping = mapping; // Device-specific mapping config
  }

  // Translate MIDI event to action
  translate(midiEvent);

  // Reverse: Translate action to MIDI message
  actionToMIDI(action);
}
```

#### ActionMapper.js
**Purpose**: Load and manage device mapping configurations

```javascript
/**
 * Loads device mappings from config files
 * Provides lookup for MIDI/HID -> Action translation
 */
class ActionMapper {
  constructor(configPath) {
    this.mappings = new Map(); // deviceId -> mapping config
  }

  // Load mapping config for device
  async loadMapping(deviceName);

  // Get translator for device
  getTranslator(deviceId);

  // Reload mappings (hot-reload support)
  async reloadMappings();
}
```

**Mapping Config Format** (`config/devices/generic-midi.json`):

```json
{
  "device": {
    "name": "Generic MIDI Controller",
    "protocol": "midi",
    "vendor": "*",
    "product": "*"
  },
  "mappings": {
    "play_a": {
      "midi": {
        "type": "noteon",
        "channel": 0,
        "note": 11
      },
      "action": {
        "type": "transport",
        "command": "play",
        "deck": "A"
      },
      "target": "audio",
      "priority": "high",
      "feedback": {
        "type": "led",
        "midiOut": {
          "type": "noteon",
          "channel": 0,
          "note": 11
        },
        "stateMap": {
          "playing": 127,
          "stopped": 0
        }
      }
    },
    "cue_a": {
      "midi": {
        "type": "noteon",
        "channel": 0,
        "note": 12
      },
      "action": {
        "type": "transport",
        "command": "cue",
        "deck": "A"
      },
      "target": "audio",
      "priority": "high"
    },
    "browse_encoder": {
      "midi": {
        "type": "cc",
        "channel": 0,
        "controller": 22
      },
      "action": {
        "type": "library",
        "command": "browse",
        "direction": "value > 64 ? 'down' : 'up'"
      },
      "target": "app",
      "priority": "normal"
    },
    "load_a": {
      "midi": {
        "type": "noteon",
        "channel": 0,
        "note": 13
      },
      "action": {
        "type": "library",
        "command": "loadTrack",
        "deck": "A"
      },
      "target": "app",
      "priority": "normal"
    }
  }
}
```

#### ActionRouter.js
**Purpose**: Route actions to appropriate WebSocket clients with priority handling

```javascript
/**
 * Routes actions to Audio Engine, App Server, or Web UI
 * Handles priority queuing for time-critical actions
 */
class ActionRouter {
  constructor(wsClients) {
    this.audioClient = wsClients.audio;
    this.appClient = wsClients.app;
    this.uiClient = wsClients.ui;

    this.criticalQueue = [];   // High-priority (jog, play, cue)
    this.normalQueue = [];     // Normal priority (browse, load)
  }

  // Route action based on target
  route(action);

  // Process queues (prioritize critical actions)
  _processQueues();
}
```

#### WebSocket Clients
**Purpose**: Communicate with downstream services

```javascript
/**
 * WebSocket client for Audio Engine
 * Sends: Transport, jog, effect commands
 * Receives: Playback state, VU meters, waveform data
 */
class AudioEngineClient extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
  }

  async connect();
  async disconnect();
  send(action);

  // Event handlers
  _onMessage(data);
  _onClose();
  _onError(error);
}
```

**Similar classes**: `AppServerClient`, `WebUIClient`

### 1.4 Server Entry Point

**src/server.js**:

```javascript
import { MIDIManager } from './managers/MIDIManager.js';
import { ActionMapper } from './mapping/ActionMapper.js';
import { ActionRouter } from './mapping/ActionRouter.js';
import { AudioEngineClient } from './websocket/AudioEngineClient.js';
import { AppServerClient } from './websocket/AppServerClient.js';
import { WebUIClient } from './websocket/WebUIClient.js';
import { FeedbackManager } from './feedback/FeedbackManager.js';
import { logger } from './utils/logger.js';
import { loadConfig } from './utils/config.js';

class ControllerServer {
  async start() {
    logger.info('Starting Mismo DJ Controller Server...');

    // Load configuration
    const config = await loadConfig();

    // Initialize WebSocket clients
    const audioClient = new AudioEngineClient(config.audioEngineUrl);
    const appClient = new AppServerClient(config.appServerUrl);
    const uiClient = new WebUIClient(config.webUIUrl);

    await Promise.all([
      audioClient.connect(),
      appClient.connect(),
      uiClient.connect()
    ]);

    // Initialize routing
    const router = new ActionRouter({
      audio: audioClient,
      app: appClient,
      ui: uiClient
    });

    // Initialize MIDI
    const mapper = new ActionMapper(config.mappingsPath);
    const midiManager = new MIDIManager();

    // Connect MIDI input to router
    midiManager.on('input', async (event) => {
      const translator = mapper.getTranslator(event.deviceId);
      const action = translator.translate(event);
      if (action) {
        await router.route(action);
      }
    });

    // Initialize feedback manager
    const feedbackManager = new FeedbackManager(midiManager, {
      audio: audioClient,
      app: appClient
    });

    // Scan and connect MIDI devices
    await midiManager.scanDevices();

    logger.info('Controller Server started successfully');
  }
}

// Start server
const server = new ControllerServer();
server.start().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
```

### 1.5 Testing Strategy

#### Unit Tests
- **MIDIManager**: Device detection, connection, message normalization
- **MIDITranslator**: MIDI to action translation accuracy
- **ActionMapper**: Config loading, mapping lookup
- **ActionRouter**: Priority queuing, correct routing

#### Integration Tests
- **MIDI to WebSocket flow**: Mock MIDI input → verify WebSocket output
- **Feedback loop**: Mock WebSocket state → verify MIDI output

#### Manual Testing
**phase1-midi-test.html**: Web page that:
- Connects to Controller Server WebSocket
- Displays received actions in real-time
- Shows device connection status
- Allows sending mock state updates to test feedback

**virtual-midi-device.js**: Node.js script that:
- Creates virtual MIDI ports
- Simulates button presses and knob turns
- Allows testing without physical hardware

### 1.6 Deliverables

- [ ] Working MIDI device detection and connection
- [ ] MIDI input translated to semantic actions
- [ ] Actions routed to WebSocket clients (mock/stub)
- [ ] Basic LED feedback (play button LED on/off)
- [ ] Configuration-based mapping system
- [ ] Unit tests passing
- [ ] Manual test HTML page functional
- [ ] Documentation: API.md, MAPPINGS.md

---

## Phase 2: HID Device Support

**Duration**: 2-3 days
**Goal**: Add HID protocol support for controllers with jog wheels and displays

### 2.1 HID Manager Implementation

**Key Differences from MIDI**:
- **Polling-based**: Read device state at regular intervals (1-8ms)
- **State-based**: Receive entire device state, compute deltas
- **Higher resolution**: 10-bit, 14-bit values instead of 7-bit
- **Complex output**: LCD displays, RGB LEDs, multi-segment VU meters

#### HIDManager.js

```javascript
/**
 * Manages HID device connections and polling
 *
 * Features:
 * - Auto-detect HID DJ controllers
 * - High-frequency polling for jog wheels (125Hz+)
 * - State diffing to detect changes
 * - Output for displays and LEDs
 */
class HIDManager extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map(); // deviceId -> { device, config, state, pollInterval }
  }

  // Scan for HID devices (filter by vendor/product ID)
  async scanDevices();

  // Connect to HID device with polling config
  async connectDevice(vendorId, productId, config);

  // Start polling device at specified interval
  _startPolling(deviceId, intervalMs);

  // Read device state and compute delta
  _pollDevice(deviceId);

  // Send output report (display, LEDs)
  sendHID(deviceId, reportId, data);

  // Parse HID input report to structured state
  _parseReport(deviceId, rawData);

  // Compute state changes since last poll
  _computeDelta(deviceId, currentState);
}
```

**Events Emitted**:
- `device:connected` - HID device connected
- `device:disconnected` - HID device disconnected
- `input` - Normalized input event: `{ deviceId, type, control, value, delta, rawState }`

### 2.2 HID Translator

#### HIDTranslator.js

```javascript
/**
 * Translates HID state changes to semantic actions
 *
 * Handles:
 * - Jog wheel deltas (scratch, bend)
 * - High-resolution faders (10-bit, 14-bit)
 * - Button states (with shift/modifier support)
 * - Encoder rotations
 */
class HIDTranslator {
  constructor(mapping) {
    this.mapping = mapping;
    this.modifierState = {}; // Track shift/modifier buttons
  }

  // Translate HID state change to action
  translate(hidEvent);

  // Handle jog wheel deltas
  _translateJog(hidEvent);

  // Handle high-res faders
  _translateFader(hidEvent);

  // Reverse: Translate action to HID output report
  actionToHID(action);
}
```

### 2.3 HID Device Mapping

**Config Format** (`config/devices/traktor-s4.json`):

```json
{
  "device": {
    "name": "Traktor Kontrol S4 MK3",
    "protocol": "hid",
    "vendorId": "0x17cc",
    "productId": "0x1720",
    "polling": {
      "jogWheels": 8,     // 8ms = 125Hz
      "buttons": 16,      // 16ms = 62.5Hz
      "faders": 16
    }
  },
  "parsing": {
    "reportId": 1,
    "reportLength": 64,
    "controls": {
      "jog_a": {
        "bytes": [10, 11],     // Two-byte value
        "type": "delta",       // Relative movement
        "resolution": 16,      // Bits
        "signed": true
      },
      "play_a": {
        "byte": 5,
        "bit": 0,              // Bit 0 of byte 5
        "type": "button"
      },
      "cue_a": {
        "byte": 5,
        "bit": 1,
        "type": "button"
      },
      "crossfader": {
        "bytes": [20, 21],
        "type": "absolute",
        "resolution": 10,      // 10-bit fader
        "min": 0,
        "max": 1023
      },
      "shift_left": {
        "byte": 4,
        "bit": 7,
        "type": "modifier"     // Modifier for other buttons
      }
    }
  },
  "mappings": {
    "jog_a": {
      "action": {
        "type": "jog",
        "deck": "A",
        "mode": "state.shift_left ? 'bend' : 'scratch'"
      },
      "target": "audio",
      "priority": "critical"
    },
    "play_a": {
      "action": {
        "type": "transport",
        "command": "play",
        "deck": "A"
      },
      "target": "audio",
      "priority": "high",
      "feedback": {
        "type": "led",
        "hidOut": {
          "reportId": 0x80,
          "byte": 10,
          "bit": 0
        }
      }
    }
  },
  "outputs": {
    "deck_a_leds": {
      "reportId": 0x80,
      "reportLength": 64,
      "leds": {
        "play": { "byte": 10, "bit": 0 },
        "cue": { "byte": 10, "bit": 1 },
        "sync": { "byte": 10, "bit": 2 }
      }
    },
    "deck_a_display": {
      "reportId": 0x81,
      "reportLength": 32,
      "type": "text",
      "encoding": "ascii",
      "maxLength": 16
    },
    "vu_meter_a": {
      "reportId": 0x80,
      "bytes": [20, 21],
      "type": "level",
      "segments": 15
    }
  }
}
```

### 2.4 Jog Wheel Optimization

**Critical Performance Requirement**: Jog wheels must respond with <5ms latency

```javascript
/**
 * High-priority jog wheel handler
 * Bypasses normal action queue for minimum latency
 */
class JogWheelHandler {
  constructor(audioEngineClient) {
    this.audioClient = audioEngineClient;
    this.lastJogValues = {};
  }

  // Called directly from HIDManager poll loop
  handleJog(deck, rawValue) {
    const delta = this._calculateDelta(deck, rawValue);

    if (delta !== 0) {
      // Send immediately, bypass router queue
      this.audioClient.sendCritical({
        type: 'jog',
        deck,
        delta,
        timestamp: performance.now()
      });
    }

    this.lastJogValues[deck] = rawValue;
  }

  _calculateDelta(deck, rawValue) {
    const last = this.lastJogValues[deck] || rawValue;
    let delta = rawValue - last;

    // Handle wraparound (jog wheels are cyclic)
    if (delta > 32768) delta -= 65536;
    if (delta < -32768) delta += 65536;

    return delta;
  }
}
```

### 2.5 HID Output (Feedback)

#### Display Updates

```javascript
/**
 * Send track title to HID controller display
 */
function sendTrackTitle(deviceId, deck, title) {
  const config = devices.get(deviceId).config;
  const displayConfig = config.outputs[`deck_${deck}_display`];

  // Create HID output report
  const report = Buffer.alloc(displayConfig.reportLength);
  report[0] = displayConfig.reportId;

  // Write ASCII text
  const text = title.padEnd(displayConfig.maxLength).slice(0, displayConfig.maxLength);
  for (let i = 0; i < text.length; i++) {
    report[i + 1] = text.charCodeAt(i);
  }

  hidManager.sendHID(deviceId, displayConfig.reportId, report);
}
```

#### VU Meter Updates

```javascript
/**
 * Send VU meter level to HID controller
 */
function sendVUMeter(deviceId, deck, level) {
  const config = devices.get(deviceId).config;
  const vuConfig = config.outputs[`vu_meter_${deck}`];

  // Map level (0.0-1.0) to segments (0-15)
  const segments = Math.floor(level * vuConfig.segments);

  // Create bitmask for LED segments
  const value = (1 << segments) - 1;  // e.g., 0b0000000000001111 for 4 segments

  const report = Buffer.alloc(64);
  report[0] = vuConfig.reportId;
  report.writeUInt16LE(value, vuConfig.bytes[0]);

  hidManager.sendHID(deviceId, vuConfig.reportId, report);
}
```

### 2.6 Testing

#### HID-Specific Tests
- **Jog wheel delta calculation**: Test wraparound, sign handling
- **High-res fader parsing**: 10-bit, 14-bit value extraction
- **Modifier button logic**: Shift + button combinations
- **Display output**: Text encoding, truncation
- **VU meter output**: Level to segment conversion

#### Performance Tests
- **Jog latency**: Measure input to WebSocket send time (<5ms)
- **Polling rate**: Verify 125Hz polling achieved
- **Queue priority**: Verify jog bypasses normal queue

### 2.7 Deliverables

- [ ] HID device detection and connection
- [ ] High-frequency polling (125Hz for jog wheels)
- [ ] State diffing and delta calculation
- [ ] Jog wheel with critical-priority routing
- [ ] High-resolution fader support (10-bit, 14-bit)
- [ ] Display output (text to LCD)
- [ ] LED and VU meter output
- [ ] Device-specific config for Traktor S4 (or similar)
- [ ] Performance tests passing (jog latency <5ms)
- [ ] Updated manual test page

---

## Phase 3: Feedback System

**Duration**: 2-3 days
**Goal**: Bidirectional communication - receive state from Audio/App servers and update controller LEDs/displays

### 3.1 Feedback Manager

**Purpose**: Aggregate state from all sources and push updates to controllers

```javascript
/**
 * Centralized feedback management
 *
 * Responsibilities:
 * - Subscribe to Audio Engine state (playback, VU, sync, etc.)
 * - Subscribe to App Server state (playlist, selected track, etc.)
 * - Maintain controller state model
 * - Push LED/display updates to controllers
 * - Throttle updates to avoid overwhelming controllers
 */
class FeedbackManager {
  constructor(midiManager, hidManager, wsClients) {
    this.midiManager = midiManager;
    this.hidManager = hidManager;
    this.audioClient = wsClients.audio;
    this.appClient = wsClients.app;

    this.state = {
      deckA: {},
      deckB: {},
      mixer: {},
      library: {}
    };

    this.updateThrottles = new Map();  // Control update frequency
  }

  // Initialize: Subscribe to state updates
  async initialize();

  // Handle audio engine state updates
  _onAudioState(state);

  // Handle app server state updates
  _onAppState(state);

  // Push updates to specific device
  _updateDevice(deviceId);

  // Throttle updates (avoid flooding controller)
  _throttledUpdate(deviceId, controlId, value, intervalMs);
}
```

### 3.2 State Subscriptions

#### Audio Engine State

**WebSocket messages from Audio Engine**:

```javascript
// Subscribe to state updates
audioClient.send({
  type: 'subscribe',
  events: [
    'playback',      // Play/pause state
    'position',      // Track position (throttled to 30Hz)
    'vuMeter',       // VU levels (60Hz)
    'sync',          // Sync/beatmatch state
    'effects',       // Effect on/off states
    'tempo'          // Tempo/pitch values
  ]
});

// Receive state updates
audioClient.on('state', (message) => {
  feedbackManager.handleAudioState(message);
});
```

**Example state message**:
```json
{
  "type": "state",
  "timestamp": 1729950000000,
  "deck": "A",
  "playback": {
    "playing": true,
    "paused": false,
    "cued": false
  },
  "position": {
    "currentTime": 45.234,
    "duration": 180.500,
    "percentage": 0.25
  },
  "vuMeter": {
    "peak": 0.85,
    "rms": 0.67
  },
  "sync": {
    "enabled": true,
    "locked": true
  },
  "tempo": {
    "bpm": 128.5,
    "pitch": 0.02  // +2%
  }
}
```

#### App Server State

**WebSocket messages from App Server**:

```javascript
// Subscribe to library state
appClient.send({
  type: 'subscribe',
  events: [
    'selectedTrack',
    'playlist',
    'browser'
  ]
});

// Receive state updates
appClient.on('state', (message) => {
  feedbackManager.handleAppState(message);
});
```

**Example state message**:
```json
{
  "type": "state",
  "selectedTrack": {
    "id": 1234,
    "title": "Track Title",
    "artist": "Artist Name",
    "bpm": 128,
    "key": "Am"
  },
  "playlist": {
    "id": 5,
    "name": "Main Set",
    "trackCount": 45
  }
}
```

### 3.3 LED Update Logic

```javascript
/**
 * Update play button LED based on playback state
 */
function updatePlayLED(deviceId, deck, state) {
  const device = devices.get(deviceId);
  const mapping = device.config.mappings[`play_${deck}`];

  if (!mapping.feedback) return;

  // Determine LED state
  let ledValue;
  if (state.playing) {
    ledValue = mapping.feedback.stateMap.playing;  // 127 (full brightness)
  } else {
    ledValue = mapping.feedback.stateMap.stopped;  // 0 (off)
  }

  // Send to device
  if (device.protocol === 'midi') {
    midiManager.sendMIDI(deviceId, {
      type: mapping.feedback.midiOut.type,
      channel: mapping.feedback.midiOut.channel,
      note: mapping.feedback.midiOut.note,
      velocity: ledValue
    });
  } else if (device.protocol === 'hid') {
    // HID: Set specific bit in output report
    const report = device.ledReport || Buffer.alloc(64);
    report[0] = mapping.feedback.hidOut.reportId;

    const byte = mapping.feedback.hidOut.byte;
    const bit = mapping.feedback.hidOut.bit;

    if (ledValue > 0) {
      report[byte] |= (1 << bit);   // Set bit
    } else {
      report[byte] &= ~(1 << bit);  // Clear bit
    }

    device.ledReport = report;  // Cache for next update
    hidManager.sendHID(deviceId, report[0], report);
  }
}
```

### 3.4 VU Meter Updates

**High-frequency updates (60Hz)** for real-time visual feedback:

```javascript
/**
 * Update VU meter on controller
 * Throttled to 60Hz to avoid overwhelming USB
 */
class VUMeterUpdater {
  constructor(deviceManager) {
    this.deviceManager = deviceManager;
    this.lastUpdate = {};
    this.updateInterval = 1000 / 60;  // 60Hz = 16.67ms
  }

  update(deviceId, deck, vuLevel) {
    const now = Date.now();
    const key = `${deviceId}-${deck}`;

    // Throttle updates
    if (this.lastUpdate[key] && now - this.lastUpdate[key] < this.updateInterval) {
      return;
    }

    this.lastUpdate[key] = now;

    // Send VU level (0.0 - 1.0)
    this.deviceManager.sendVUMeter(deviceId, deck, vuLevel);
  }
}
```

### 3.5 Waveform Color Feedback

**For advanced HID controllers with RGB LED strips**:

```javascript
/**
 * Send waveform color data to controller LED strip
 * Used for visual representation of upcoming audio
 */
function sendWaveformColors(deviceId, deck, colors) {
  // colors = array of 32 RGB values representing waveform
  const report = Buffer.alloc(98);  // 1 (reportId) + 1 (deck) + 32*3 (RGB)

  report[0] = 0x82;  // Waveform report ID
  report[1] = deck === 'A' ? 0 : 1;

  let offset = 2;
  colors.forEach(color => {
    report[offset++] = color.r;
    report[offset++] = color.g;
    report[offset++] = color.b;
  });

  hidManager.sendHID(deviceId, 0x82, report);
}
```

### 3.6 Testing

#### Feedback Tests
- **LED updates**: Mock playback state → verify MIDI/HID output
- **VU meter**: Mock audio levels → verify VU output values
- **Display updates**: Mock track load → verify display text
- **Throttling**: Verify high-frequency updates are throttled correctly
- **State synchronization**: Initial connection should sync all LEDs to current state

#### Integration Tests
- **Round-trip**: Controller input → Audio Engine → Feedback → LED update
- **Multi-device**: Multiple controllers receive same state updates

### 3.7 Deliverables

- [ ] Feedback Manager with state aggregation
- [ ] Audio Engine state subscriptions working
- [ ] App Server state subscriptions working
- [ ] LED updates (play, cue, sync buttons)
- [ ] VU meter updates (60Hz)
- [ ] Display updates (track title, artist)
- [ ] Throttling logic prevents USB overflow
- [ ] Multi-device feedback support
- [ ] Integration tests passing
- [ ] Updated documentation

---

## Phase 4: Advanced Features & Production Readiness

**Duration**: 2-3 days
**Goal**: Polish, performance optimization, production deployment

### 4.1 Hot-Reload Mapping Configuration

**Allow changing device mappings without server restart**:

```javascript
/**
 * Watch mapping config files and reload on change
 */
class ConfigWatcher {
  constructor(configPath, mapper) {
    this.configPath = configPath;
    this.mapper = mapper;
    this.watcher = null;
  }

  start() {
    this.watcher = fs.watch(this.configPath, { recursive: true }, (eventType, filename) => {
      if (filename.endsWith('.json')) {
        logger.info(`Config changed: ${filename}, reloading...`);
        this.mapper.reloadMapping(filename);
      }
    });
  }

  stop() {
    this.watcher?.close();
  }
}
```

### 4.2 Device Hot-Plug Support

**Auto-detect when controllers are connected/disconnected**:

```javascript
/**
 * Poll for new MIDI/HID devices every 5 seconds
 */
class DeviceWatcher {
  constructor(midiManager, hidManager, mapper) {
    this.midiManager = midiManager;
    this.hidManager = hidManager;
    this.mapper = mapper;
    this.knownDevices = new Set();
  }

  start() {
    setInterval(() => {
      this.checkForChanges();
    }, 5000);
  }

  async checkForChanges() {
    // Scan for new devices
    const currentDevices = await this.getAllDevices();

    // Find newly connected
    const added = currentDevices.filter(d => !this.knownDevices.has(d.id));

    // Find disconnected
    const removed = [...this.knownDevices].filter(id =>
      !currentDevices.some(d => d.id === id)
    );

    // Connect new devices
    for (const device of added) {
      await this.connectDevice(device);
    }

    // Clean up disconnected
    for (const deviceId of removed) {
      this.disconnectDevice(deviceId);
    }

    this.knownDevices = new Set(currentDevices.map(d => d.id));
  }
}
```

### 4.3 Virtual Controller (Testing)

**Create virtual MIDI/HID device for testing without hardware**:

```javascript
/**
 * Virtual MIDI controller that can be controlled via HTTP API
 * Useful for automated testing and development without hardware
 */
class VirtualMIDIController {
  constructor(name) {
    this.name = name;
    this.output = new easymidi.Output(name, true);  // Create virtual port
    this.server = express();

    this.server.post('/press/:button', (req, res) => {
      const button = parseInt(req.params.button);
      this.output.send('noteon', { note: button, velocity: 127, channel: 0 });
      setTimeout(() => {
        this.output.send('noteoff', { note: button, velocity: 0, channel: 0 });
      }, 100);
      res.json({ ok: true });
    });

    this.server.post('/turn/:knob/:value', (req, res) => {
      const knob = parseInt(req.params.knob);
      const value = parseInt(req.params.value);
      this.output.send('cc', { controller: knob, value, channel: 0 });
      res.json({ ok: true });
    });

    this.server.listen(3100, () => {
      console.log(`Virtual controller "${name}" API on port 3100`);
    });
  }
}

// Usage:
// curl -X POST http://localhost:3100/press/11    # Press play button
// curl -X POST http://localhost:3100/turn/22/65  # Turn browse encoder
```

### 4.4 Performance Monitoring

**Track latency and throughput**:

```javascript
/**
 * Performance metrics collection
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      jogLatency: [],        // Input to WebSocket send time
      feedbackLatency: [],   // State update to LED update time
      eventsPerSecond: 0,
      droppedEvents: 0
    };

    this.eventCount = 0;

    // Calculate events per second
    setInterval(() => {
      this.metrics.eventsPerSecond = this.eventCount;
      this.eventCount = 0;

      // Log stats
      this.logStats();
    }, 1000);
  }

  recordJogLatency(startTime) {
    const latency = performance.now() - startTime;
    this.metrics.jogLatency.push(latency);

    // Keep last 1000 samples
    if (this.metrics.jogLatency.length > 1000) {
      this.metrics.jogLatency.shift();
    }

    // Warn if latency exceeds threshold
    if (latency > 5) {
      logger.warn(`High jog latency: ${latency.toFixed(2)}ms`);
    }
  }

  logStats() {
    if (this.metrics.jogLatency.length === 0) return;

    const avg = this.metrics.jogLatency.reduce((a, b) => a + b) / this.metrics.jogLatency.length;
    const max = Math.max(...this.metrics.jogLatency);

    logger.info(`Performance: ${this.metrics.eventsPerSecond} events/sec, ` +
                `jog latency avg=${avg.toFixed(2)}ms max=${max.toFixed(2)}ms, ` +
                `dropped=${this.metrics.droppedEvents}`);
  }
}
```

### 4.5 Error Recovery

**Graceful handling of connection failures**:

```javascript
/**
 * Resilient WebSocket client with auto-reconnect
 */
class ResilientWebSocketClient extends EventEmitter {
  constructor(url, reconnectInterval = 5000) {
    super();
    this.url = url;
    this.reconnectInterval = reconnectInterval;
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
  }

  async connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.connected = true;
        logger.info(`Connected to ${this.url}`);
        this.emit('connected');

        // Clear reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        logger.warn(`Disconnected from ${this.url}, reconnecting...`);
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        logger.error(`WebSocket error: ${error.message}`);
      });

      this.ws.on('message', (data) => {
        this.emit('message', JSON.parse(data));
      });

    } catch (error) {
      logger.error(`Failed to connect to ${this.url}:`, error);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      logger.info(`Reconnecting to ${this.url}...`);
      this.connect();
    }, this.reconnectInterval);
  }

  send(data) {
    if (!this.connected) {
      logger.warn(`Cannot send, not connected to ${this.url}`);
      return false;
    }

    this.ws.send(JSON.stringify(data));
    return true;
  }
}
```

### 4.6 Logging & Debugging

**Comprehensive logging for troubleshooting**:

```javascript
// utils/logger.js
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add context to log messages
export function logWithContext(level, message, context) {
  logger.log(level, message, { context });
}
```

**Debug mode for detailed event logging**:

```javascript
// Enable with: DEBUG=true npm start
if (process.env.DEBUG === 'true') {
  midiManager.on('input', (event) => {
    logger.debug('MIDI input', {
      device: event.deviceId,
      type: event.type,
      raw: event.rawMessage
    });
  });

  actionRouter.on('route', (action) => {
    logger.debug('Action routed', {
      action: action.type,
      target: action.target,
      priority: action.priority
    });
  });
}
```

### 4.7 Docker Deployment

**Dockerfile**:

```dockerfile
FROM node:24-alpine

# Install USB support
RUN apk add --no-cache \
    eudev-dev \
    libusb-dev \
    build-base \
    python3

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY src/ ./src/
COPY config/ ./config/

# Expose monitoring port (optional)
EXPOSE 3100

# Run with device access
CMD ["node", "src/server.js"]
```

**docker-compose.yml**:

```yaml
version: '3.8'

services:
  controller-server:
    build: .
    container_name: mismo-controller-server
    restart: unless-stopped

    # USB device access
    devices:
      - /dev/bus/usb:/dev/bus/usb

    # Required for USB access
    privileged: true

    environment:
      - AUDIO_ENGINE_URL=ws://audio-engine:8080
      - APP_SERVER_URL=ws://app-server:3000
      - WEB_UI_URL=ws://web-ui:8081
      - LOG_LEVEL=info
      - DEBUG=false

    volumes:
      - ./config:/app/config
      - ./logs:/app/logs

    networks:
      - mismo-network

networks:
  mismo-network:
    external: true
```

### 4.8 Documentation

#### API.md
Document WebSocket API for downstream services:
- Action message format
- State subscription format
- Expected responses

#### MAPPINGS.md
Guide for creating device mappings:
- Config file structure
- How to determine MIDI note/CC numbers
- How to parse HID reports (tools, techniques)
- Example mappings for common controllers

#### TROUBLESHOOTING.md
Common issues and solutions:
- Device not detected
- High latency
- LEDs not updating
- HID parsing errors

### 4.9 Deliverables

- [ ] Hot-reload mapping configs
- [ ] Device hot-plug detection
- [ ] Virtual controller for testing
- [ ] Performance monitoring and logging
- [ ] Error recovery (auto-reconnect WebSockets)
- [ ] Docker deployment
- [ ] Complete documentation (API, Mappings, Troubleshooting)
- [ ] Load testing (multiple devices, sustained high event rate)
- [ ] Production-ready logging
- [ ] README with setup instructions

---

## WebSocket API Specification

### Controller Server → Audio Engine

**Action messages sent to Audio Engine**:

```json
{
  "type": "action",
  "priority": "critical" | "high" | "normal",
  "timestamp": 1729950000000,
  "action": {
    "type": "transport" | "jog" | "effect" | "mixer",
    "deck": "A" | "B",
    "command": "play" | "pause" | "cue" | "scratch" | "bend",
    "value": <number>,
    "delta": <number>  // For jog wheels
  }
}
```

**Examples**:

```json
// Play button pressed
{
  "type": "action",
  "priority": "high",
  "action": {
    "type": "transport",
    "deck": "A",
    "command": "play"
  }
}

// Jog wheel scratch
{
  "type": "action",
  "priority": "critical",
  "action": {
    "type": "jog",
    "deck": "A",
    "command": "scratch",
    "delta": -150  // Negative = scratch backwards
  }
}

// Crossfader move
{
  "type": "action",
  "priority": "normal",
  "action": {
    "type": "mixer",
    "command": "crossfader",
    "value": 0.75  // 0.0 = full left, 1.0 = full right
  }
}
```

### Audio Engine → Controller Server

**State updates from Audio Engine**:

```json
{
  "type": "state",
  "timestamp": 1729950000000,
  "deck": "A" | "B",
  "playback": {
    "playing": true,
    "paused": false,
    "cued": false
  },
  "position": {
    "currentTime": 45.234,
    "duration": 180.500
  },
  "vuMeter": {
    "peak": 0.85,
    "rms": 0.67
  },
  "sync": {
    "enabled": true,
    "locked": true
  }
}
```

### Controller Server → App Server

**Action messages sent to App Server**:

```json
{
  "type": "action",
  "priority": "normal",
  "action": {
    "type": "library" | "playlist",
    "command": "browse" | "loadTrack" | "search",
    "deck": "A" | "B",
    "direction": "up" | "down",
    "value": <any>
  }
}
```

**Examples**:

```json
// Browse encoder turned
{
  "type": "action",
  "action": {
    "type": "library",
    "command": "browse",
    "direction": "down"
  }
}

// Load button pressed
{
  "type": "action",
  "action": {
    "type": "library",
    "command": "loadTrack",
    "deck": "A"
  }
}
```

### App Server → Controller Server

**State updates from App Server**:

```json
{
  "type": "state",
  "selectedTrack": {
    "id": 1234,
    "title": "Track Title",
    "artist": "Artist Name",
    "bpm": 128,
    "key": "Am"
  },
  "playlist": {
    "id": 5,
    "name": "Main Set"
  }
}
```

---

## Performance Targets

### Latency Requirements

| Action Type | Target Latency | Maximum Acceptable |
|-------------|----------------|-------------------|
| Jog wheel (scratch) | <3ms | 5ms |
| Transport (play/cue) | <10ms | 20ms |
| Library browse | <50ms | 100ms |
| LED feedback | <20ms | 50ms |
| VU meter update | 16ms (60Hz) | 33ms (30Hz) |
| Display update | <100ms | 200ms |

### Throughput Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Jog events/sec | 500+ | 8ms polling = 125Hz × 4 decks |
| Total events/sec | 1000+ | Multiple controllers active |
| Feedback updates/sec | 240+ | 60Hz VU × 2 decks × 2 controllers |
| Memory usage | <100MB | Steady state |
| CPU usage | <10% | Idle, <30% under load |

---

## Testing Strategy Summary

### Unit Tests
- Protocol parsing (MIDI, HID)
- Action translation
- State diffing
- LED/display encoding

### Integration Tests
- End-to-end: Hardware input → WebSocket output
- Feedback loop: WebSocket state → Hardware output
- Multi-device scenarios

### Performance Tests
- Jog latency measurement
- Sustained high event rate (stress test)
- Memory leak detection (long-running)

### Manual Tests
- Physical controller testing with real hardware
- Virtual controller API testing
- Visual verification of LED/display updates

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| HID report format unknown | High | Use USB sniffing tools (Wireshark), reverse engineer with trial/error |
| Jog latency too high | High | Implement critical-priority bypass queue, direct WebSocket send |
| USB bandwidth saturation | Medium | Throttle feedback updates, batch LED updates |
| Controller disconnects | Medium | Auto-reconnect, maintain state cache |
| WebSocket connection loss | High | Resilient client with auto-reconnect, queue actions during outage |

### Operational Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Multiple controllers conflict | Medium | Device-priority system, clear ownership of decks |
| Config errors crash server | High | Config validation on load, graceful error handling |
| Hot-plug detection fails | Low | Manual reconnect command, periodic scan |

---

## Future Enhancements (Post-MVP)

### Phase 5+
1. **Web-based configuration UI**
   - Visual mapping editor
   - Real-time device state viewer
   - MIDI/HID monitor for learning controls

2. **Advanced mapping features**
   - Conditional mappings (context-aware)
   - Macro support (one button triggers multiple actions)
   - Layer system (shift modes)

3. **Multi-controller coordination**
   - Link faders across controllers
   - Hand-off deck control between controllers
   - Master/slave controller modes

4. **Cloud sync**
   - Sync mappings across installations
   - Share mappings with community
   - Automatic updates for popular controllers

5. **Mobile app integration**
   - Phone/tablet as supplementary controller
   - Touch-based jog wheels
   - Wireless DJ controller

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building the Controller Server, a critical component of the Mismo DJ system. The phased approach allows for incremental development and testing, with each phase delivering tangible value.

**Key Success Factors**:
- Low latency for time-critical actions (jog wheels, transport)
- Flexible configuration system for easy device support
- Robust error handling and recovery
- Comprehensive testing at each phase
- Clear documentation for future maintainers

**Timeline Summary**:
- Phase 1 (MIDI): 1-2 days
- Phase 2 (HID): 2-3 days
- Phase 3 (Feedback): 2-3 days
- Phase 4 (Production): 2-3 days
- **Total: 7-11 days**

This document should be updated as implementation progresses and new insights are gained.
