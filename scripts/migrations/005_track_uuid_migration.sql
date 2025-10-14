-- Migration 005: Track UUID Migration
-- Migrates tracks table from INTEGER id to UUID (TEXT) id
-- Updates all foreign key references throughout the database

-- This migration is wrapped in a transaction for atomicity
-- If any step fails, the entire migration is rolled back

BEGIN TRANSACTION;

-- ============================================================================
-- Step 1: Add UUID column to tracks table
-- ============================================================================

-- Add UUID column (nullable initially for migration)
ALTER TABLE tracks ADD COLUMN uuid TEXT;

-- ============================================================================
-- Step 2: Backup existing tables before migration
-- ============================================================================

-- Create backup tables (in case rollback is needed)
CREATE TABLE tracks_backup AS SELECT * FROM tracks;
CREATE TABLE analysis_jobs_backup AS SELECT * FROM analysis_jobs;
CREATE TABLE playlist_tracks_backup AS SELECT * FROM playlist_tracks;
CREATE TABLE waveforms_backup AS SELECT * FROM waveforms;
CREATE TABLE file_operations_backup AS SELECT * FROM file_operations;
CREATE TABLE duplicate_groups_backup AS SELECT * FROM duplicate_groups;

-- ============================================================================
-- Step 3: Create new tables with UUID-based foreign keys
-- ============================================================================

-- New tracks table with UUID as primary key
CREATE TABLE tracks_new (
    -- Primary key (UUID)
    id TEXT PRIMARY KEY,

    -- File information
    file_path TEXT NOT NULL UNIQUE,
    file_size INTEGER,
    file_modified DATETIME,
    file_hash TEXT NOT NULL,
    library_directory_id INTEGER,
    relative_path TEXT,
    is_missing BOOLEAN DEFAULT 0,
    missing_since DATETIME,
    duplicate_group_id INTEGER,

    -- Basic metadata
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

    -- Musical analysis
    bpm REAL,
    musical_key INTEGER,
    mode INTEGER,
    time_signature INTEGER,
    beats_data BLOB,
    downbeats_data BLOB,
    stems_path TEXT,

    -- Audio features
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

-- New duplicate_groups table with UUID foreign key
CREATE TABLE duplicate_groups_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash TEXT NOT NULL UNIQUE,
    canonical_track_id TEXT,
    total_duplicates INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (canonical_track_id) REFERENCES tracks_new(id) ON DELETE SET NULL
);

-- New analysis_jobs table with UUID foreign key
CREATE TABLE analysis_jobs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    track_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    priority TEXT DEFAULT 'normal',
    options TEXT NOT NULL,
    stages_completed TEXT,
    stages_total INTEGER DEFAULT 2,
    progress_percent INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    callback_metadata TEXT,

    FOREIGN KEY (track_id) REFERENCES tracks_new(id) ON DELETE CASCADE,

    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    CHECK (priority IN ('low', 'normal', 'high')),
    CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

-- New playlist_tracks table with UUID foreign key
CREATE TABLE playlist_tracks_new (
    playlist_id INTEGER NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks_new(id) ON DELETE CASCADE,

    PRIMARY KEY (playlist_id, track_id),
    UNIQUE (playlist_id, position)
);

-- New waveforms table with UUID foreign key
CREATE TABLE waveforms_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT NOT NULL,
    zoom_level INTEGER NOT NULL,
    sample_rate INTEGER,
    samples_per_point INTEGER,
    num_points INTEGER,
    data BLOB NOT NULL,

    FOREIGN KEY (track_id) REFERENCES tracks_new(id) ON DELETE CASCADE,
    UNIQUE (track_id, zoom_level)
);

-- New file_operations table with UUID foreign key
CREATE TABLE file_operations_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL,
    track_id TEXT NOT NULL,
    old_path TEXT,
    new_path TEXT,
    old_library_directory_id INTEGER,
    new_library_directory_id INTEGER,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,

    FOREIGN KEY (track_id) REFERENCES tracks_new(id) ON DELETE CASCADE,
    FOREIGN KEY (old_library_directory_id) REFERENCES library_directories(id) ON DELETE SET NULL,
    FOREIGN KEY (new_library_directory_id) REFERENCES library_directories(id) ON DELETE SET NULL
);

-- ============================================================================
-- Step 4: Migrate data to new tables
-- ============================================================================

-- Note: UUIDs will be generated by the migration runner script
-- This SQL creates the structure; the Node.js migration runner will:
-- 1. Generate UUID for each track
-- 2. Update the uuid column
-- 3. Migrate data to new tables with UUID mappings
-- 4. Complete the migration

-- ============================================================================
-- Step 5: Create indexes on new tables
-- ============================================================================

-- Tracks indexes
CREATE INDEX idx_tracks_new_artist ON tracks_new(artist);
CREATE INDEX idx_tracks_new_bpm ON tracks_new(bpm);
CREATE INDEX idx_tracks_new_key ON tracks_new(musical_key);
CREATE INDEX idx_tracks_new_genre ON tracks_new(genre);
CREATE INDEX idx_tracks_new_date_added ON tracks_new(date_added);
CREATE INDEX idx_tracks_new_play_count ON tracks_new(play_count DESC);
CREATE INDEX idx_tracks_new_library_directory ON tracks_new(library_directory_id);
CREATE INDEX idx_tracks_new_file_hash ON tracks_new(file_hash);
CREATE INDEX idx_tracks_new_missing ON tracks_new(is_missing);
CREATE INDEX idx_tracks_new_duplicate_group ON tracks_new(duplicate_group_id);

-- Duplicate groups indexes
CREATE INDEX idx_duplicate_groups_new_hash ON duplicate_groups_new(file_hash);

-- Analysis jobs indexes
CREATE INDEX idx_analysis_jobs_new_job_id ON analysis_jobs_new(job_id);
CREATE INDEX idx_analysis_jobs_new_track_id ON analysis_jobs_new(track_id);
CREATE INDEX idx_analysis_jobs_new_status ON analysis_jobs_new(status);
CREATE INDEX idx_analysis_jobs_new_priority ON analysis_jobs_new(priority DESC);
CREATE INDEX idx_analysis_jobs_new_created ON analysis_jobs_new(created_at);

-- Playlist tracks indexes
CREATE INDEX idx_playlist_tracks_new_position ON playlist_tracks_new(playlist_id, position);

-- Waveforms indexes
CREATE INDEX idx_waveforms_new_track ON waveforms_new(track_id);

-- File operations indexes
CREATE INDEX idx_file_operations_new_track ON file_operations_new(track_id);
CREATE INDEX idx_file_operations_new_status ON file_operations_new(status);
CREATE INDEX idx_file_operations_new_created ON file_operations_new(created_at);

-- ============================================================================
-- Step 6: Update views
-- ============================================================================

DROP VIEW IF EXISTS tracks_with_library;
CREATE VIEW tracks_with_library AS
SELECT
    t.*,
    ld.name as library_name,
    ld.path as library_path,
    ld.is_removable as library_is_removable,
    ld.is_available as library_is_available,
    dg.canonical_track_id,
    dg.total_duplicates
FROM tracks_new t
LEFT JOIN library_directories ld ON t.library_directory_id = ld.id
LEFT JOIN duplicate_groups_new dg ON t.duplicate_group_id = dg.id;

DROP VIEW IF EXISTS duplicates_with_tracks;
CREATE VIEW duplicates_with_tracks AS
SELECT
    dg.*,
    t1.title as canonical_title,
    t1.artist as canonical_artist,
    t1.file_path as canonical_path,
    GROUP_CONCAT(t2.id) as duplicate_track_ids,
    COUNT(t2.id) + 1 as total_duplicate_count
FROM duplicate_groups_new dg
LEFT JOIN tracks_new t1 ON dg.canonical_track_id = t1.id
LEFT JOIN tracks_new t2 ON dg.id = t2.duplicate_group_id AND t2.id != dg.canonical_track_id
GROUP BY dg.id;

-- ============================================================================
-- Step 7: Recreate triggers for new tables
-- ============================================================================

DROP TRIGGER IF EXISTS update_library_stats_on_track_insert;
CREATE TRIGGER update_library_stats_on_track_insert
AFTER INSERT ON tracks_new
WHEN NEW.library_directory_id IS NOT NULL
BEGIN
    UPDATE library_directories
    SET total_tracks = (
        SELECT COUNT(*) FROM tracks_new
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 0
    ),
    total_missing = (
        SELECT COUNT(*) FROM tracks_new
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 1
    )
    WHERE id = NEW.library_directory_id;
END;

DROP TRIGGER IF EXISTS update_library_stats_on_track_delete;
CREATE TRIGGER update_library_stats_on_track_delete
AFTER DELETE ON tracks_new
WHEN OLD.library_directory_id IS NOT NULL
BEGIN
    UPDATE library_directories
    SET total_tracks = (
        SELECT COUNT(*) FROM tracks_new
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 0
    ),
    total_missing = (
        SELECT COUNT(*) FROM tracks_new
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 1
    )
    WHERE id = OLD.library_directory_id;
END;

DROP TRIGGER IF EXISTS update_library_stats_on_track_update_old;
CREATE TRIGGER update_library_stats_on_track_update_old
AFTER UPDATE OF library_directory_id, is_missing ON tracks_new
WHEN OLD.library_directory_id IS NOT NULL
BEGIN
    UPDATE library_directories
    SET total_tracks = (
        SELECT COUNT(*) FROM tracks_new
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 0
    ),
    total_missing = (
        SELECT COUNT(*) FROM tracks_new
        WHERE library_directory_id = OLD.library_directory_id AND is_missing = 1
    )
    WHERE id = OLD.library_directory_id;
END;

DROP TRIGGER IF EXISTS update_library_stats_on_track_update_new;
CREATE TRIGGER update_library_stats_on_track_update_new
AFTER UPDATE OF library_directory_id, is_missing ON tracks_new
WHEN NEW.library_directory_id IS NOT NULL AND NEW.library_directory_id != OLD.library_directory_id
BEGIN
    UPDATE library_directories
    SET total_tracks = (
        SELECT COUNT(*) FROM tracks_new
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 0
    ),
    total_missing = (
        SELECT COUNT(*) FROM tracks_new
        WHERE library_directory_id = NEW.library_directory_id AND is_missing = 1
    )
    WHERE id = NEW.library_directory_id;
END;

DROP TRIGGER IF EXISTS update_duplicate_group_on_track_insert;
CREATE TRIGGER update_duplicate_group_on_track_insert
AFTER INSERT ON tracks_new
WHEN NEW.duplicate_group_id IS NOT NULL
BEGIN
    UPDATE duplicate_groups_new
    SET total_duplicates = (
        SELECT COUNT(*) FROM tracks_new
        WHERE duplicate_group_id = NEW.duplicate_group_id
    )
    WHERE id = NEW.duplicate_group_id;
END;

DROP TRIGGER IF EXISTS update_duplicate_group_on_track_delete;
CREATE TRIGGER update_duplicate_group_on_track_delete
AFTER DELETE ON tracks_new
WHEN OLD.duplicate_group_id IS NOT NULL
BEGIN
    UPDATE duplicate_groups_new
    SET total_duplicates = (
        SELECT COUNT(*) FROM tracks_new
        WHERE duplicate_group_id = OLD.duplicate_group_id
    )
    WHERE id = OLD.duplicate_group_id;

    -- Remove duplicate group if no tracks remain
    DELETE FROM duplicate_groups_new
    WHERE id = OLD.duplicate_group_id
    AND (SELECT COUNT(*) FROM tracks_new WHERE duplicate_group_id = OLD.duplicate_group_id) = 0;
END;

-- ============================================================================
-- Step 8: Update schema version
-- ============================================================================

INSERT INTO schema_version (version, description) VALUES
    (5, 'Migrated tracks table from INTEGER id to UUID (TEXT) id');

-- Migration will be committed by the Node.js migration runner after data migration
-- DO NOT COMMIT HERE - the runner will handle it

COMMIT;
