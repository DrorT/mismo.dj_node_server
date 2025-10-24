-- Migration 012: Enhance Playlists Schema for Phase 5
-- Adds support for all 4 playlist types: static, smart, session, temp
-- Adds track-level metadata (notes, cue points, play stats)

-- ============================================================================
-- Update Playlists Table
-- ============================================================================

-- Add type column (static/smart/session/temp)
-- Note: SQLite doesn't support ADD COLUMN with CHECK constraints in one statement
-- We'll add the column first, then create a new table with constraints if needed
ALTER TABLE playlists ADD COLUMN type TEXT NOT NULL DEFAULT 'static';

-- Add session-specific columns
ALTER TABLE playlists ADD COLUMN session_date INTEGER;
ALTER TABLE playlists ADD COLUMN session_venue TEXT;
ALTER TABLE playlists ADD COLUMN session_duration INTEGER;

-- Add flags
ALTER TABLE playlists ADD COLUMN is_temporary INTEGER DEFAULT 0;
ALTER TABLE playlists ADD COLUMN is_readonly INTEGER DEFAULT 0;
ALTER TABLE playlists ADD COLUMN is_favorite INTEGER DEFAULT 0;

-- Add timestamps (using INTEGER for Unix timestamps)
-- Note: created_at and updated_at will use date_created and date_modified for now
ALTER TABLE playlists ADD COLUMN created_at INTEGER;
ALTER TABLE playlists ADD COLUMN updated_at INTEGER;
ALTER TABLE playlists ADD COLUMN last_accessed INTEGER;

-- Migrate existing timestamp data to new columns
UPDATE playlists
SET created_at = strftime('%s', date_created),
    updated_at = strftime('%s', date_modified)
WHERE created_at IS NULL;

-- Set default type for existing playlists based on is_smart flag
UPDATE playlists
SET type = CASE
  WHEN is_smart = 1 THEN 'smart'
  ELSE 'static'
END
WHERE type = 'static';

-- ============================================================================
-- Update Playlist Tracks Table
-- ============================================================================

-- Add session history fields
ALTER TABLE playlist_tracks ADD COLUMN played_at INTEGER;
ALTER TABLE playlist_tracks ADD COLUMN play_duration INTEGER;

-- Add per-track metadata
ALTER TABLE playlist_tracks ADD COLUMN notes TEXT;
ALTER TABLE playlist_tracks ADD COLUMN cue_in INTEGER;
ALTER TABLE playlist_tracks ADD COLUMN cue_out INTEGER;
ALTER TABLE playlist_tracks ADD COLUMN rating_in_context INTEGER;

-- ============================================================================
-- Create Indexes for Performance
-- ============================================================================

-- Playlist indexes
CREATE INDEX IF NOT EXISTS idx_playlists_type ON playlists(type);
CREATE INDEX IF NOT EXISTS idx_playlists_temporary ON playlists(is_temporary);
CREATE INDEX IF NOT EXISTS idx_playlists_session_date ON playlists(session_date);
CREATE INDEX IF NOT EXISTS idx_playlists_favorite ON playlists(is_favorite);
CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON playlists(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlists_updated_at ON playlists(updated_at DESC);

-- Playlist tracks indexes
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_played ON playlist_tracks(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_added ON playlist_tracks(date_added DESC);

-- ============================================================================
-- Create Triggers
-- ============================================================================

-- Trigger to update updated_at timestamp on playlist changes
DROP TRIGGER IF EXISTS update_playlist_timestamp;
CREATE TRIGGER update_playlist_timestamp
AFTER UPDATE ON playlists
FOR EACH ROW
BEGIN
  UPDATE playlists
  SET updated_at = strftime('%s', 'now'),
      date_modified = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Trigger to set created_at on new playlists
DROP TRIGGER IF EXISTS set_playlist_created_at;
CREATE TRIGGER set_playlist_created_at
AFTER INSERT ON playlists
FOR EACH ROW
WHEN NEW.created_at IS NULL
BEGIN
  UPDATE playlists
  SET created_at = strftime('%s', 'now'),
      updated_at = strftime('%s', 'now')
  WHERE id = NEW.id;
END;

-- ============================================================================
-- Update Schema Version
-- ============================================================================

INSERT INTO schema_version (version, description)
VALUES (12, 'Enhanced playlists schema for Phase 5: Added type, session fields, flags, and track metadata');

-- ============================================================================
-- Verification Queries (commented out - for manual testing)
-- ============================================================================

-- Verify playlists table structure:
-- PRAGMA table_info(playlists);

-- Verify playlist_tracks table structure:
-- PRAGMA table_info(playlist_tracks);

-- Verify indexes:
-- SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='playlists';
-- SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='playlist_tracks';

-- Verify triggers:
-- SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='playlists';

-- Verify schema version:
-- SELECT * FROM schema_version ORDER BY version DESC LIMIT 1;
