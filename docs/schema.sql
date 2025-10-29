-- Mismo DJ Database Schema
-- SQLite 3
-- Updated for Multi-Directory Library Support

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- Schema Version Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Initial version
INSERT OR IGNORE INTO schema_version (version, description) VALUES (1, 'Initial MVP schema');
INSERT OR IGNORE INTO schema_version (version, description) VALUES (2, 'Added multi-directory library support, duplicate detection, and file operations');
INSERT OR IGNORE INTO schema_version (version, description) VALUES (11, 'Added audible time fields (audible_start_time, audible_end_time)');
INSERT OR IGNORE INTO schema_version (version, description) VALUES (15, 'Add hot_cues table for track cue points');
INSERT OR IGNORE INTO schema_version (version, description) VALUES (16, 'Allow multiple hot cue sources per cue index');

-- ============================================================================
-- Library Directories Table (Updated to UUID - Migration 008)
-- ============================================================================
CREATE TABLE IF NOT EXISTS library_directories (
    id TEXT PRIMARY KEY,                     -- UUID after migration 008
    path TEXT NOT NULL UNIQUE,
    name TEXT,                               -- User-friendly name
    is_active BOOLEAN DEFAULT 1,             -- Enable/disable scanning
    is_removable BOOLEAN DEFAULT 0,          -- Track external/network drives
    is_available BOOLEAN DEFAULT 1,          -- For disconnected media
    last_scan DATETIME,
    scan_status TEXT DEFAULT 'idle',         -- idle, scanning, error
    total_files INTEGER DEFAULT 0,
    total_tracks INTEGER DEFAULT 0,
    total_missing INTEGER DEFAULT 0,         -- Count of missing tracks
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    priority INTEGER DEFAULT 0,              -- Scan order priority

    -- Scanning configuration
    recursive_scan BOOLEAN DEFAULT 1,
    max_depth INTEGER DEFAULT -1,            -- -1 = unlimited depth
    scan_patterns TEXT,                      -- JSON array of file patterns
    exclude_patterns TEXT,                   -- JSON array of exclude patterns
    follow_symlinks BOOLEAN DEFAULT 0
);

-- Indices for library directories
CREATE INDEX IF NOT EXISTS idx_library_directories_active ON library_directories(is_active);
CREATE INDEX IF NOT EXISTS idx_library_directories_priority ON library_directories(priority DESC);

-- ============================================================================
-- Duplicate Groups Table (Updated for UUID tracks - Migration 005)
-- ============================================================================
CREATE TABLE IF NOT EXISTS duplicate_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash TEXT NOT NULL UNIQUE,
    canonical_track_id TEXT,              -- Preferred version of the track (UUID after migration 005)
    total_duplicates INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (canonical_track_id) REFERENCES tracks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_duplicate_groups_hash ON duplicate_groups(file_hash);

-- ============================================================================
-- Tracks Table (Updated with UUID support - Migration 005)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tracks (
    -- Primary key (UUID after migration 005)
    id TEXT PRIMARY KEY,

    -- File information
    file_path TEXT NOT NULL UNIQUE,
    file_size INTEGER,
    file_modified DATETIME,
    file_hash TEXT NOT NULL,                 -- Audio fingerprint hash for duplicate detection
    library_directory_id TEXT,               -- Reference to library directory (UUID after migration 008)
    relative_path TEXT,                      -- Path relative to library directory
    is_missing BOOLEAN DEFAULT 0,           -- For disconnected media
    missing_since DATETIME,                  -- When track became unavailable
    duplicate_group_id INTEGER,              -- Link duplicate tracks together

    -- Basic metadata (from file tags)
    title TEXT,
    artist TEXT,
    album TEXT,
    album_artist TEXT,
    genre TEXT,
    year INTEGER,
    track_number INTEGER,
    comment TEXT,

    -- Audio properties
    duration_seconds REAL,
    sample_rate INTEGER,
    bit_rate INTEGER,
    channels INTEGER,

    -- Musical analysis (from Python server - Essentia)
    bpm REAL,
    musical_key INTEGER,                    -- Key number (0-11, C=0)
    mode INTEGER,                           -- 0=minor, 1=major
    time_signature INTEGER,
    beats_data BLOB,
    downbeats_data BLOB,
    first_beat_offset REAL,                 -- Time offset in seconds to first beat
    first_phrase_beat_no INTEGER,           -- Beat number where first musical phrase starts
    audible_start_time REAL,                -- Time in seconds when audible content begins
    audible_end_time REAL,                  -- Time in seconds when audible content ends
    stems_path TEXT,

    -- Audio features (from Essentia)
    danceability REAL,
    energy REAL,
    loudness REAL,
    valence REAL,
    arousal REAL,
    acousticness REAL,
    instrumentalness REAL,
    spectral_centroid REAL,
    spectral_rolloff REAL,
    spectral_bandwidth REAL,
    zero_crossing_rate REAL,

    -- Library management
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_analyzed DATETIME,
    analysis_version INTEGER DEFAULT 1,

    -- Performance tracking
    last_played DATETIME,
    play_count INTEGER DEFAULT 0,

    -- User metadata
    rating INTEGER DEFAULT 0,
    color_tag TEXT,
    energy_level INTEGER,

    -- Foreign keys
    FOREIGN KEY (library_directory_id) REFERENCES library_directories(id) ON DELETE SET NULL,
    FOREIGN KEY (duplicate_group_id) REFERENCES duplicate_groups(id) ON DELETE SET NULL,

    -- Constraints
    CHECK (rating >= 0 AND rating <= 5),
    CHECK (energy_level >= 0 AND energy_level <= 10)
);

-- Enhanced indices for fast searching
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm);
CREATE INDEX IF NOT EXISTS idx_tracks_key ON tracks(musical_key);
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
CREATE INDEX IF NOT EXISTS idx_tracks_date_added ON tracks(date_added);
CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_library_directory ON tracks(library_directory_id);
CREATE INDEX IF NOT EXISTS idx_tracks_file_hash ON tracks(file_hash);
CREATE INDEX IF NOT EXISTS idx_tracks_missing ON tracks(is_missing);
CREATE INDEX IF NOT EXISTS idx_tracks_duplicate_group ON tracks(duplicate_group_id);

-- ============================================================================
-- Playlists Table (Updated to UUID - Migration 007)
-- ============================================================================
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,                    -- UUID after migration 007
    name TEXT NOT NULL,
    description TEXT,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modified DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Playlist metadata
    is_smart BOOLEAN DEFAULT 0,
    smart_criteria TEXT,                    -- JSON criteria for smart playlists

    -- Appearance
    color TEXT,
    icon TEXT
);

CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists(name);

-- ============================================================================
-- Playlist Tracks Junction Table (Updated for UUIDs - Migrations 005, 007)
-- ============================================================================
CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL,             -- UUID after migration 007
    track_id TEXT NOT NULL,                -- UUID after migration 005
    position INTEGER NOT NULL,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,

    PRIMARY KEY (playlist_id, track_id),
    UNIQUE (playlist_id, position)
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position
    ON playlist_tracks(playlist_id, position);

-- ============================================================================
-- Waveforms Table (Hash-based storage - Migration 006)
-- ============================================================================
CREATE TABLE IF NOT EXISTS waveforms (
    file_hash TEXT NOT NULL,              -- Audio file hash (from tracks table)
    zoom_level INTEGER NOT NULL,           -- 0=overview, 1-3=zoom levels
    sample_rate INTEGER,
    samples_per_point INTEGER,
    num_points INTEGER,
    data BLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (file_hash, zoom_level)   -- Composite primary key
);

CREATE INDEX IF NOT EXISTS idx_waveforms_hash ON waveforms(file_hash);

-- ============================================================================
-- File Operations Log Table (Updated for UUIDs - Migrations 005, 008)
-- ============================================================================
CREATE TABLE IF NOT EXISTS file_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL,          -- 'move', 'rename', 'delete', 'copy'
    track_id TEXT NOT NULL,                -- UUID after migration 005
    old_path TEXT,
    new_path TEXT,
    old_library_directory_id TEXT,         -- UUID after migration 008
    new_library_directory_id TEXT,         -- UUID after migration 008
    status TEXT DEFAULT 'pending',         -- 'pending', 'completed', 'failed'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,

    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (old_library_directory_id) REFERENCES library_directories(id) ON DELETE SET NULL,
    FOREIGN KEY (new_library_directory_id) REFERENCES library_directories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_file_operations_track ON file_operations(track_id);
CREATE INDEX IF NOT EXISTS idx_file_operations_status ON file_operations(status);
CREATE INDEX IF NOT EXISTS idx_file_operations_created ON file_operations(created_at);

-- ============================================================================
-- Settings Table (Updated)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    type TEXT DEFAULT 'string',            -- 'string', 'int', 'float', 'bool', 'json'
    category TEXT,
    description TEXT
);

-- Default settings (updated - removed single library_path)
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
    ('auto_analyze', 'true', 'bool', 'library', 'Automatically analyze new tracks'),
    ('recursive_scan', 'true', 'bool', 'library', 'Recursively scan library directories'),
    ('watch_directories', 'true', 'bool', 'library', 'Watch directories for changes'),
    ('max_concurrent_scans', '2', 'int', 'library', 'Maximum concurrent directory scans'),
    
    ('analysis_server_url', 'http://localhost:5000', 'string', 'analysis', 'Python analysis server URL'),
    ('auto_analyze_new_tracks', 'true', 'bool', 'analysis', 'Automatically analyze new tracks'),
    ('analysis_priority', 'normal', 'string', 'analysis', 'Analysis priority: low, normal, high'),
    ('enable_stem_separation', 'false', 'bool', 'analysis', 'Enable stem separation (slower)'),
    ('max_concurrent_analysis', '2', 'int', 'analysis', 'Maximum concurrent analysis jobs'),
    
    ('audio_engine_url', 'http://localhost:8080', 'string', 'audio', 'Audio engine communication URL'),
    ('master_volume', '0.8', 'float', 'audio', 'Master output volume (0.0 - 1.0)'),
    ('buffer_size', '512', 'int', 'audio', 'Audio buffer size in samples'),
    
    ('database_path', '~/MismoDJ/library.db', 'string', 'performance', 'Database file path'),
    ('waveform_cache_size', '100', 'int', 'performance', 'Waveform cache size'),
    
    ('ui_theme', 'dark', 'string', 'ui', 'UI theme: dark or light'),
    ('show_waveforms', 'true', 'bool', 'ui', 'Show waveforms in interface'),
    
    ('missing_tracks_cleanup_days', '30', 'int', 'maintenance', 'Days before offering to remove missing tracks'),
    ('duplicate_detection_enabled', 'true', 'bool', 'maintenance', 'Enable duplicate detection'),
    ('auto_cleanup_duplicates', 'false', 'bool', 'maintenance', 'Automatically resolve duplicates');

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- View for tracks with library directory info
CREATE VIEW IF NOT EXISTS tracks_with_library AS
SELECT 
    t.*,
    ld.name as library_name,
    ld.path as library_path,
    ld.is_removable as library_is_removable,
    ld.is_available as library_is_available,
    dg.canonical_track_id,
    dg.total_duplicates
FROM tracks t
LEFT JOIN library_directories ld ON t.library_directory_id = ld.id
LEFT JOIN duplicate_groups dg ON t.duplicate_group_id = dg.id;

-- View for library directory statistics
CREATE VIEW IF NOT EXISTS library_stats AS
SELECT 
    ld.*,
    COUNT(t.id) as actual_track_count,
    COUNT(CASE WHEN t.is_missing = 1 THEN 1 END) as actual_missing_count,
    MIN(t.date_added) as oldest_track_date,
    MAX(t.date_added) as newest_track_date,
    SUM(t.file_size) as total_size_bytes
FROM library_directories ld
LEFT JOIN tracks t ON ld.id = t.library_directory_id
GROUP BY ld.id;

-- View for duplicates with track info
CREATE VIEW IF NOT EXISTS duplicates_with_tracks AS
SELECT 
    dg.*,
    t1.title as canonical_title,
    t1.artist as canonical_artist,
    t1.file_path as canonical_path,
    GROUP_CONCAT(t2.id) as duplicate_track_ids,
    COUNT(t2.id) + 1 as total_duplicate_count
FROM duplicate_groups dg
LEFT JOIN tracks t1 ON dg.canonical_track_id = t1.id
LEFT JOIN tracks t2 ON dg.id = t2.duplicate_group_id AND t2.id != dg.canonical_track_id
GROUP BY dg.id;

-- ============================================================================
-- Hot Cues Table (Migration 015)
-- ============================================================================
CREATE TABLE IF NOT EXISTS hot_cues (
    id TEXT PRIMARY KEY,                    -- UUID for the hot cue
    track_id TEXT NOT NULL,                 -- Foreign key to tracks table
    cue_index INTEGER NOT NULL,             -- Cue index (0-7)
    position REAL NOT NULL,                 -- Position in seconds

    -- Optional properties
    name TEXT,                              -- Optional label/name
    color TEXT,                             -- UI color (hex format)

    -- Loop properties
    is_loop BOOLEAN DEFAULT 0,              -- Whether this is a loop cue
    loop_end REAL,                          -- End position if loop (seconds)
    auto_loop BOOLEAN DEFAULT 0,            -- Auto-activate on trigger

    -- Source metadata
    source TEXT DEFAULT 'user',             -- Source: 'user', 'mixedInKey', 'rekordbox', 'serato', 'virtual dj'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key constraint
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,

    -- Constraints
    CHECK (cue_index >= 0 AND cue_index <= 7),
    CHECK (position >= 0),
    CHECK (loop_end IS NULL OR loop_end > position)
);

-- Indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_hot_cues_track ON hot_cues(track_id);
-- Unique constraint: Allow multiple sources for same cue index (Migration 016)
CREATE UNIQUE INDEX IF NOT EXISTS idx_hot_cues_track_index_source ON hot_cues(track_id, cue_index, source);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_hot_cues_timestamp
AFTER UPDATE ON hot_cues
BEGIN
    UPDATE hot_cues SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- Triggers for Data Integrity
-- ============================================================================

-- Update library directory statistics when tracks are added/removed
CREATE TRIGGER IF NOT EXISTS update_library_stats_on_track_insert
AFTER INSERT ON tracks
WHEN NEW.library_directory_id IS NOT NULL
BEGIN
    UPDATE library_directories 
    SET total_tracks = (
        SELECT COUNT(*) FROM tracks 
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 0
    ),
    total_missing = (
        SELECT COUNT(*) FROM tracks 
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 1
    )
    WHERE id = NEW.library_directory_id;
END;

CREATE TRIGGER IF NOT EXISTS update_library_stats_on_track_delete
AFTER DELETE ON tracks
WHEN OLD.library_directory_id IS NOT NULL
BEGIN
    UPDATE library_directories 
    SET total_tracks = (
        SELECT COUNT(*) FROM tracks 
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 0
    ),
    total_missing = (
        SELECT COUNT(*) FROM tracks 
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 1
    )
    WHERE id = OLD.library_directory_id;
END;

-- Update old library directory stats when track is updated
CREATE TRIGGER IF NOT EXISTS update_library_stats_on_track_update_old
AFTER UPDATE OF library_directory_id, is_missing ON tracks
WHEN OLD.library_directory_id IS NOT NULL
BEGIN
    UPDATE library_directories
    SET total_tracks = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 0
    ),
    total_missing = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 1
    )
    WHERE id = OLD.library_directory_id;
END;

-- Update new library directory stats when track directory changes
CREATE TRIGGER IF NOT EXISTS update_library_stats_on_track_update_new
AFTER UPDATE OF library_directory_id, is_missing ON tracks
WHEN NEW.library_directory_id IS NOT NULL AND NEW.library_directory_id != OLD.library_directory_id
BEGIN
    UPDATE library_directories
    SET total_tracks = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 0
    ),
    total_missing = (
        SELECT COUNT(*) FROM tracks
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 1
    )
    WHERE id = NEW.library_directory_id;
END;

-- Update duplicate group statistics
CREATE TRIGGER IF NOT EXISTS update_duplicate_group_on_track_insert
AFTER INSERT ON tracks
WHEN NEW.duplicate_group_id IS NOT NULL
BEGIN
    UPDATE duplicate_groups 
    SET total_duplicates = (
        SELECT COUNT(*) FROM tracks 
        WHERE duplicate_group_id = NEW.duplicate_group_id
    )
    WHERE id = NEW.duplicate_group_id;
END;

CREATE TRIGGER IF NOT EXISTS update_duplicate_group_on_track_delete
AFTER DELETE ON tracks
WHEN OLD.duplicate_group_id IS NOT NULL
BEGIN
    UPDATE duplicate_groups 
    SET total_duplicates = (
        SELECT COUNT(*) FROM tracks 
        WHERE duplicate_group_id = OLD.duplicate_group_id
    )
    WHERE id = OLD.duplicate_group_id;
    
    -- Remove duplicate group if no tracks remain
    DELETE FROM duplicate_groups 
    WHERE id = OLD.duplicate_group_id 
    AND (SELECT COUNT(*) FROM tracks WHERE duplicate_group_id = OLD.duplicate_group_id) = 0;
END;
