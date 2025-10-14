-- Migration 007: Playlist UUID Migration
-- Migrates playlists table from INTEGER id to UUID (TEXT) id
-- Updates playlist_tracks foreign key references

BEGIN TRANSACTION;

-- ============================================================================
-- Step 1: Add UUID column to playlists table
-- ============================================================================

ALTER TABLE playlists ADD COLUMN uuid TEXT;

-- ============================================================================
-- Step 2: Backup existing tables
-- ============================================================================

CREATE TABLE playlists_backup AS SELECT * FROM playlists;
CREATE TABLE playlist_tracks_backup AS SELECT * FROM playlist_tracks;

-- ============================================================================
-- Step 3: Create new playlists table with UUID primary key
-- ============================================================================

CREATE TABLE playlists_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modified DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_smart BOOLEAN DEFAULT 0,
    smart_criteria TEXT,

    color TEXT,
    icon TEXT
);

-- ============================================================================
-- Step 4: Create new playlist_tracks table with UUID foreign key
-- ============================================================================

CREATE TABLE playlist_tracks_new (
    playlist_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (playlist_id) REFERENCES playlists_new(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,

    PRIMARY KEY (playlist_id, track_id),
    UNIQUE (playlist_id, position)
);

-- ============================================================================
-- Step 5: Drop old tables and rename new ones
-- ============================================================================

DROP TABLE IF EXISTS playlist_tracks;
DROP TABLE IF EXISTS playlists;

ALTER TABLE playlists_new RENAME TO playlists;
ALTER TABLE playlist_tracks_new RENAME TO playlist_tracks;

-- ============================================================================
-- Step 6: Create indexes
-- ============================================================================

CREATE INDEX idx_playlists_name ON playlists(name);
CREATE INDEX idx_playlist_tracks_position ON playlist_tracks(playlist_id, position);

-- ============================================================================
-- Step 7: Update schema version
-- ============================================================================

INSERT INTO schema_version (version, description) VALUES
    (7, 'Migrated playlists table from INTEGER id to UUID (TEXT) id');

COMMIT;
