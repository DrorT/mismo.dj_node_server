-- Migration 013: Remove UNIQUE constraint from analysis_jobs.job_id
-- Allows multiple jobs per track (e.g., stems can be regenerated multiple times)

-- ============================================================================
-- Step 1: Create new table without UNIQUE constraint on job_id
-- ============================================================================

CREATE TABLE IF NOT EXISTS analysis_jobs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,                     -- Track hash (UNIQUE constraint removed)
    track_id TEXT NOT NULL,
    file_path TEXT NOT NULL,

    -- Job state
    status TEXT DEFAULT 'queued',             -- 'queued', 'processing', 'completed', 'failed', 'cancelled'
    priority TEXT DEFAULT 'normal',           -- 'low', 'normal', 'high'

    -- Analysis options
    options TEXT NOT NULL,                     -- JSON: {basic_features, characteristics, etc.}

    -- Progress tracking
    stages_completed TEXT,                     -- JSON array: ['basic_features', 'characteristics']
    stages_total INTEGER DEFAULT 2,            -- Total stages to complete
    progress_percent INTEGER DEFAULT 0,        -- 0-100

    -- Retry logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,

    -- Callback metadata
    callback_metadata TEXT,                    -- JSON: metadata for result callbacks

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,

    -- Constraints
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    CHECK (priority IN ('low', 'normal', 'high')),
    CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

-- ============================================================================
-- Step 2: Copy data from old table to new table
-- ============================================================================

INSERT INTO analysis_jobs_new
SELECT * FROM analysis_jobs;

-- ============================================================================
-- Step 3: Drop old table and rename new table
-- ============================================================================

DROP TABLE analysis_jobs;
ALTER TABLE analysis_jobs_new RENAME TO analysis_jobs;

-- ============================================================================
-- Step 4: Create indices for fast lookups
-- ============================================================================

-- Compound index for finding incomplete jobs by job_id
-- This is the most common query: "find incomplete job for this track hash"
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_job_id_status
    ON analysis_jobs(job_id, status);

-- Index for track_id lookups
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_track_id
    ON analysis_jobs(track_id);

-- Index for queue processing (get queued jobs by priority)
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status_priority
    ON analysis_jobs(status, priority DESC, created_at ASC);

-- Index for created_at (useful for cleanup/reporting)
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created
    ON analysis_jobs(created_at);

-- ============================================================================
-- Update schema version
-- ============================================================================

INSERT INTO schema_version (version, description) VALUES
    (13, 'Remove UNIQUE constraint from job_id to allow multiple jobs per track');
