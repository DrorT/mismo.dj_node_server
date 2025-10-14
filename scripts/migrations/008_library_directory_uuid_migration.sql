-- Migration 008: Library Directory UUID Migration
-- Migrates library_directories table from INTEGER id to UUID (TEXT) id
-- Updates all foreign key references in tracks and file_operations tables

BEGIN TRANSACTION;

-- ============================================================================
-- Step 1: Add UUID column to library_directories table
-- ============================================================================

ALTER TABLE library_directories ADD COLUMN uuid TEXT;

-- ============================================================================
-- Step 2: Backup existing tables
-- ============================================================================

CREATE TABLE library_directories_backup AS SELECT * FROM library_directories;
CREATE TABLE tracks_backup_008 AS SELECT * FROM tracks;
CREATE TABLE file_operations_backup_008 AS SELECT * FROM file_operations;

-- ============================================================================
-- Step 3: Create new library_directories table with UUID primary key
-- ============================================================================

CREATE TABLE library_directories_new (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT,
    is_active BOOLEAN DEFAULT 1,
    is_removable BOOLEAN DEFAULT 0,
    is_available BOOLEAN DEFAULT 1,
    last_scan DATETIME,
    scan_status TEXT DEFAULT 'idle',
    total_files INTEGER DEFAULT 0,
    total_tracks INTEGER DEFAULT 0,
    total_missing INTEGER DEFAULT 0,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    priority INTEGER DEFAULT 0,

    recursive_scan BOOLEAN DEFAULT 1,
    max_depth INTEGER DEFAULT -1,
    scan_patterns TEXT,
    exclude_patterns TEXT,
    follow_symlinks BOOLEAN DEFAULT 0
);

-- ============================================================================
-- Step 4: Create new tracks table with UUID foreign key for library_directory_id
-- ============================================================================

CREATE TABLE tracks_new_008 (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,
    file_size INTEGER,
    file_modified DATETIME,
    file_hash TEXT NOT NULL,
    library_directory_id TEXT,
    relative_path TEXT,
    is_missing BOOLEAN DEFAULT 0,
    missing_since DATETIME,
    duplicate_group_id INTEGER,

    title TEXT,
    artist TEXT,
    album TEXT,
    album_artist TEXT,
    genre TEXT,
    year INTEGER,
    track_number INTEGER,
    comment TEXT,

    duration_seconds REAL,
    sample_rate INTEGER,
    bit_rate INTEGER,
    channels INTEGER,

    bpm REAL,
    musical_key INTEGER,
    mode INTEGER,
    time_signature INTEGER,
    beats_data BLOB,
    downbeats_data BLOB,
    stems_path TEXT,

    danceability REAL,
    energy REAL,
    loudness REAL,
    valence REAL,
    acousticness REAL,
    instrumentalness REAL,
    spectral_centroid REAL,
    spectral_rolloff REAL,
    spectral_bandwidth REAL,
    zero_crossing_rate REAL,

    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_analyzed DATETIME,
    analysis_version INTEGER DEFAULT 1,

    last_played DATETIME,
    play_count INTEGER DEFAULT 0,

    rating INTEGER DEFAULT 0,
    color_tag TEXT,
    energy_level INTEGER,

    FOREIGN KEY (library_directory_id) REFERENCES library_directories_new(id) ON DELETE SET NULL,
    FOREIGN KEY (duplicate_group_id) REFERENCES duplicate_groups(id) ON DELETE SET NULL,

    CHECK (rating >= 0 AND rating <= 5),
    CHECK (energy_level >= 0 AND energy_level <= 10)
);

-- ============================================================================
-- Step 5: Create new file_operations table with UUID foreign keys
-- ============================================================================

CREATE TABLE file_operations_new_008 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL,
    track_id TEXT NOT NULL,
    old_path TEXT,
    new_path TEXT,
    old_library_directory_id TEXT,
    new_library_directory_id TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,

    FOREIGN KEY (track_id) REFERENCES tracks_new_008(id) ON DELETE CASCADE,
    FOREIGN KEY (old_library_directory_id) REFERENCES library_directories_new(id) ON DELETE SET NULL,
    FOREIGN KEY (new_library_directory_id) REFERENCES library_directories_new(id) ON DELETE SET NULL
);

-- Note: Data migration is handled by the Node.js runner script
-- which generates UUIDs for library directories and updates all references

COMMIT;
