-- Migration 009: Add Phrase Analysis Fields
-- Adds first_beat_offset and first_phrase_beat_no to tracks table
-- These fields are provided by the analysis server's basic_features response

-- Add first_beat_offset field (time offset in seconds to the first beat)
ALTER TABLE tracks ADD COLUMN first_beat_offset REAL;

-- Add first_phrase_beat_no field (beat number where first musical phrase starts)
ALTER TABLE tracks ADD COLUMN first_phrase_beat_no INTEGER;

-- Update schema version
INSERT INTO schema_version (version, description) VALUES (9, 'Added phrase analysis fields');
