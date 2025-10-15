# Mismo DJ - Professional DJ Application Platform

Mismo DJ is a distributed DJ application built with modern technologies, separating concerns across specialized servers for optimal performance and maintainability.

## Architecture Overview

### App Server (Node.js/Express)
**Repository**: `mismo.dj_app_server`
**Purpose**: Central hub for music library management and application logic
- Track metadata storage and retrieval (SQLite)
- Library directory management with file system monitoring
- Playlist creation and management
- User preferences and settings
- RESTful API for library operations
- Orchestrates analysis requests to the Python server
- WebSocket communication with audio engine for track data

### Analysis Server (Python/ML)
**Repository**: `mismo.dj_analysis_server`
**Purpose**: Audio analysis and machine learning processing
- BPM detection and key analysis
- Audio feature extraction (energy, mood, etc.)
- Track similarity calculations
- ML-based recommendations and auto-mixing suggestions
- HTTP API called exclusively by App Server
- Asynchronous processing with callback notifications
- Background job queue for batch analysis

### Audio Engine (C++/JUCE)
**Repository**: `mismo.dj_audio_server`
**Purpose**: Real-time audio processing and playback
- Dual-deck audio playback with crossfading
- Real-time effects (EQ, filters, reverb, etc.)
- Beatmatching and tempo sync
- Cue point management and looping
- MIDI controller support for hands-on control
- Low-latency audio output
- WebSocket connection to App Server for track loading

### Web UI (Browser-based)
**Purpose**: User interface and control surface
- Library browsing and search
- Deck control and waveform display
- Playlist management interface
- Effect and mixer controls
- Visual feedback for sync and mixing
- WebSocket connections to both App Server (library) and Audio Engine (playback state)

## Communication Flow

```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Web UI    │◄──────────────────►│ App Server  │
└─────────────┘                    └─────────────┘
      │                                    │
      │                                    │ HTTP/Callbacks
      │                                    │
      │                                    ▼
      │                            ┌──────────────────┐
      │                            │ Analysis Server  │
      │                            └──────────────────┘
      │
      │ WebSocket
      │
      ▼
┌─────────────┐     WebSocket      ┌─────────────┐
│Audio Engine │◄──────────────────►│ App Server  │
└─────────────┘                    └─────────────┘
      │
      │ MIDI Input
      ▼
┌─────────────┐
│MIDI Hardware│
└─────────────┘
```

## Technology Rationale

- **Node.js (App Server)**: Excellent for I/O-heavy library management, native async/await for file operations, fast REST/WebSocket APIs
- **Python (Analysis)**: Rich ML/audio ecosystem (librosa, scikit-learn), perfect for CPU-intensive analysis tasks
- **C++/JUCE (Audio)**: Ultra-low latency audio required for professional DJing, native MIDI support, cross-platform audio APIs
- **WebSockets**: Real-time bidirectional communication for responsive UI and synchronized playback state

This modular architecture allows each component to excel at its specific task while maintaining clean separation of concerns and scalability.
