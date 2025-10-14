-- Migration 004: Add callback_metadata to analysis_jobs
-- Adds field to store information about where to send results when job completes

-- Add callback_metadata column to analysis_jobs table
ALTER TABLE analysis_jobs ADD COLUMN callback_metadata TEXT;

-- Update schema version
INSERT INTO schema_version (version, description) VALUES
    (4, 'Added callback_metadata field to analysis_jobs for result notifications');
