-- Migration 016: Update hot_cues to support multiple sources per cue index
-- Date: 2025-10-29
-- Purpose: Allow multiple hot cues at same index from different sources (user, rekordbox, serato, etc.)

-- Drop the old unique constraint
DROP INDEX IF EXISTS idx_hot_cues_track_index;

-- Recreate it to include source in the uniqueness constraint
CREATE UNIQUE INDEX idx_hot_cues_track_index_source ON hot_cues(track_id, cue_index, source);

-- Update schema version
INSERT INTO schema_version (version, description) VALUES (16, 'Allow multiple hot cue sources per cue index');
