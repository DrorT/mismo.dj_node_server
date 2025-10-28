-- Migration 014: Add is_stems boolean to waveforms table
-- Allows storing waveform data for both original track and stems
-- Stems waveforms contain data for all 4 stems (vocals, drums, bass, other) in the data BLOB

-- ============================================================================
-- Recreate waveforms table with is_stems column
-- ============================================================================

-- Note: SQLite doesn't support ALTER TABLE to modify PRIMARY KEY,
-- so we need to recreate the table

-- Step 1: Create new table with is_stems
CREATE TABLE IF NOT EXISTS waveforms_new (
    file_hash TEXT NOT NULL,
    zoom_level INTEGER NOT NULL,
    is_stems INTEGER NOT NULL DEFAULT 0,  -- 0 = original audio, 1 = stems (vocals, drums, bass, other)
    sample_rate INTEGER,
    samples_per_point INTEGER,
    num_points INTEGER,
    data BLOB NOT NULL,  -- For stems: JSON with vocals_amplitude, drums_amplitude, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (file_hash, zoom_level, is_stems),
    CHECK (is_stems IN (0, 1))
);

-- Step 2: Copy existing data (all existing waveforms are original, not stems)
INSERT INTO waveforms_new (file_hash, zoom_level, is_stems, sample_rate, samples_per_point, num_points, data, created_at, updated_at)
SELECT file_hash, zoom_level, 0, sample_rate, samples_per_point, num_points, data, created_at, updated_at
FROM waveforms;

-- Step 3: Drop old table
DROP TABLE waveforms;

-- Step 4: Rename new table
ALTER TABLE waveforms_new RENAME TO waveforms;

-- Step 5: Create indices
CREATE INDEX IF NOT EXISTS idx_waveforms_hash ON waveforms(file_hash);
CREATE INDEX IF NOT EXISTS idx_waveforms_hash_stems ON waveforms(file_hash, is_stems);

-- ============================================================================
-- Update schema version
-- ============================================================================

INSERT INTO schema_version (version, description) VALUES
    (14, 'Add stem_type to waveforms table to support storing stem waveforms');
