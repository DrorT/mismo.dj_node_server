-- Migration 010: Add arousal column to tracks table
-- Arousal is a musical characteristic representing energy/intensity level

-- Add arousal field (numeric characteristic from Essentia analysis)
ALTER TABLE tracks ADD COLUMN arousal REAL;

-- Update schema version
INSERT INTO schema_version (version, description) VALUES (10, 'Added arousal column to tracks table');
