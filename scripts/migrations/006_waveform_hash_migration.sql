-- Migration 006: Waveform Hash-Based Storage
-- Changes waveforms table to use file_hash as primary identifier instead of track_id
-- This eliminates duplicate waveform storage for identical audio files

-- This migration assumes migration 005 (UUID track IDs) has already been applied

BEGIN TRANSACTION;

-- ============================================================================
-- Step 1: Create backup of waveforms table
-- ============================================================================

CREATE TABLE waveforms_backup_006 AS SELECT * FROM waveforms;

-- ============================================================================
-- Step 2: Create new waveforms table with hash-based schema
-- ============================================================================

CREATE TABLE waveforms_new (
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

-- ============================================================================
-- Step 3: Migrate waveform data to new table
-- ============================================================================

-- Migrate waveforms using track_id to lookup file_hash
-- If multiple tracks have the same hash, only one waveform is kept per zoom level
INSERT INTO waveforms_new (
    file_hash,
    zoom_level,
    sample_rate,
    samples_per_point,
    num_points,
    data
)
SELECT DISTINCT
    t.file_hash,
    w.zoom_level,
    w.sample_rate,
    w.samples_per_point,
    w.num_points,
    w.data
FROM waveforms w
INNER JOIN tracks t ON w.track_id = t.id
-- If duplicates exist for same hash+zoom_level, keep the most recently created
GROUP BY t.file_hash, w.zoom_level
HAVING w.id = MAX(w.id);

-- ============================================================================
-- Step 4: Drop old table and rename new one
-- ============================================================================

DROP TABLE waveforms;
ALTER TABLE waveforms_new RENAME TO waveforms;

-- ============================================================================
-- Step 5: Create indexes for performance
-- ============================================================================

-- Primary key already creates an index on (file_hash, zoom_level)
-- Add index on file_hash alone for quick lookups
CREATE INDEX idx_waveforms_hash ON waveforms(file_hash);

-- ============================================================================
-- Step 6: Update schema version
-- ============================================================================

INSERT INTO schema_version (version, description) VALUES
    (6, 'Migrated waveforms table to use file_hash instead of track_id');

COMMIT;
