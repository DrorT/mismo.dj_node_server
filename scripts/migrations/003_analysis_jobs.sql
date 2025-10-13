-- Migration 003: Analysis Jobs Table
-- Adds table for tracking analysis job state, queue, and retry logic

-- ============================================================================
-- Analysis Jobs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS analysis_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,              -- Track hash used as job ID
    track_id INTEGER NOT NULL,
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

-- Indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_job_id ON analysis_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_track_id ON analysis_jobs(track_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_priority ON analysis_jobs(priority DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created ON analysis_jobs(created_at);

-- Update schema version
INSERT INTO schema_version (version, description) VALUES
    (3, 'Added analysis jobs table for queue and progress tracking');
