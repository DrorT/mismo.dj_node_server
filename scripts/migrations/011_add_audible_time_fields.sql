-- Migration 011: Add Audible Time Fields
-- Adds audibleStartTime and audibleEndTime to tracks table
-- These fields indicate when audible content begins and ends (in seconds)

-- Add audibleStartTime field (time in seconds when audible content begins)
ALTER TABLE tracks ADD COLUMN audible_start_time REAL;

-- Add audibleEndTime field (time in seconds when audible content ends)
ALTER TABLE tracks ADD COLUMN audible_end_time REAL;

-- Update schema version
INSERT INTO schema_version (version, description) VALUES (11, 'Added audible time fields (audible_start_time, audible_end_time)');
