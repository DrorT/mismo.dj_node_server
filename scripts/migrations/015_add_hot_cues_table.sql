-- Migration 015: Add hot_cues table
-- Date: 2025-10-29
-- Purpose: Add hot cue storage for tracks (8 cue points per track)

-- Create hot_cues table
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

    -- Ensure unique cue index per track
    UNIQUE(track_id, cue_index),

    -- Constraints
    CHECK (cue_index >= 0 AND cue_index <= 7),
    CHECK (position >= 0),
    CHECK (loop_end IS NULL OR loop_end > position)
);

-- Indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_hot_cues_track ON hot_cues(track_id);
CREATE INDEX IF NOT EXISTS idx_hot_cues_track_index ON hot_cues(track_id, cue_index);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_hot_cues_timestamp
AFTER UPDATE ON hot_cues
BEGIN
    UPDATE hot_cues SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update schema version
INSERT INTO schema_version (version, description) VALUES (15, 'Add hot_cues table for track cue points');
