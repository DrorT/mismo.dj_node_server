# Database Migrations

This directory contains database migration scripts for the Mismo DJ App Server.

## Overview

The database schema evolves over time as new features are added. Migrations ensure that existing databases can be upgraded without data loss.

## Migration Scripts

### Migration 005: Track UUID Migration
**File**: `005_track_uuid_migration.sql`
**Runner**: `../run-migration-005.js`
**Purpose**: Migrates tracks table from INTEGER id to UUID (TEXT) id

**Why?**
- Enables multi-source and distributed architecture
- Prevents ID collisions across multiple app servers
- Supports future federation features

**Changes**:
- Track IDs changed from auto-incrementing integers to UUIDs
- All foreign key references updated (analysis_jobs, playlist_tracks, waveforms, file_operations, duplicate_groups)
- All indexes and triggers recreated
- Views updated to work with UUID keys

**Running the migration**:
```bash
# Migrate the default database
node scripts/run-migration-005.js

# Migrate a specific database
node scripts/run-migration-005.js /path/to/library.db
```

**Rollback**:
The migration creates an automatic backup at `<database>.backup-before-migration-005`. To rollback:
```bash
cp data/library.db.backup-before-migration-005 data/library.db
```

**Duration**: ~1-5 seconds for 50k tracks

---

### Migration 006: Waveform Hash-Based Storage
**File**: `006_waveform_hash_migration.sql`
**Runner**: `../run-migration-006.js`
**Purpose**: Changes waveforms table to use file_hash instead of track_id

**Why?**
- Eliminates duplicate waveform storage for identical audio files
- Reduces storage requirements by 70-90% when duplicates exist
- Waveforms automatically shared across duplicate tracks

**Changes**:
- Waveforms table primary key changed from (track_id, zoom_level) to (file_hash, zoom_level)
- Duplicate waveforms consolidated (one per unique audio hash)
- No foreign key to tracks table (waveforms are independent of track records)

**Running the migration**:
```bash
# Migrate the default database (requires migration 005 first!)
node scripts/run-migration-006.js

# Migrate a specific database
node scripts/run-migration-006.js /path/to/library.db
```

**Prerequisites**: Migration 005 must be completed first

**Rollback**:
The migration creates an automatic backup at `<database>.backup-before-migration-006`. To rollback:
```bash
cp data/library.db.backup-before-migration-006 data/library.db
```

**Duration**: ~1-2 seconds for 10k waveforms

---

## Migration Order

Migrations must be run in numerical order:

1. **001-002**: Initial schema (applied automatically on database initialization)
2. **003**: Analysis jobs table (applied automatically)
3. **004**: Callback metadata field (applied automatically)
4. **005**: Track UUID migration ← **Run this first**
5. **006**: Waveform hash-based storage ← **Run this second**

## Application Code Changes

### Migration 005 Changes

The following code changes were made to support UUID track IDs:

1. **Track Service** ([src/services/track.service.js](../../src/services/track.service.js))
   - `upsertTrack()` now generates UUIDs for new tracks
   - `getTrackById()` validates UUID format
   - All track ID parameters changed from `number` to `string`

2. **UUID Utility** ([src/utils/uuid.js](../../src/utils/uuid.js))
   - `generateUUID()` - Generate new UUIDs using Node.js crypto
   - `isValidUUID()` - Validate UUID format

3. **Validators** ([src/utils/validators.js](../../src/utils/validators.js))
   - Updated `schemas.id` to validate UUID format instead of integer

### Migration 006 Changes

The following code changes were made to support hash-based waveforms:

1. **Waveform Service** ([src/services/waveform.service.js](../../src/services/waveform.service.js))
   - `storeWaveforms(fileHash, waveforms)` - Now takes file_hash instead of track_id
   - `getWaveformByHash(fileHash, zoomLevel)` - New function for hash-based retrieval
   - `getWaveform(trackId, zoomLevel)` - Backward compatible (looks up file_hash from track)
   - `getAllWaveformsByHash(fileHash)` - New function for hash-based retrieval
   - `copyWaveforms()` - Now a no-op (waveforms automatically shared)

2. **Analysis Callback Service** ([src/services/analysisCallback.service.js](../../src/services/analysisCallback.service.js))
   - Updated to store waveforms using file_hash (jobId) instead of track_id

## Pre-Migration Checklist

Before running migrations:

- [ ] **Backup your database**
  ```bash
  cp data/library.db data/library.db.manual-backup
  ```

- [ ] **Stop the app server**
  ```bash
  # Stop any running instances
  pkill -f "node src/server.js"
  ```

- [ ] **Check disk space** (migrations create backups)
  ```bash
  du -h data/library.db
  df -h data/
  ```

- [ ] **Test on a copy first** (recommended)
  ```bash
  cp data/library.db data/library-test.db
  node scripts/run-migration-005.js data/library-test.db
  node scripts/run-migration-006.js data/library-test.db
  ```

## Post-Migration Checklist

After running migrations:

- [ ] **Verify migration succeeded**
  - Check console output for "MIGRATION COMPLETED SUCCESSFULLY"
  - Check schema version: `sqlite3 data/library.db "SELECT * FROM schema_version;"`

- [ ] **Test the application**
  ```bash
  npm start
  ```

- [ ] **Verify track operations**
  - Create a new track (scan a file)
  - Retrieve track by ID
  - Update track metadata
  - Delete a track

- [ ] **Verify waveform operations**
  - Request analysis for a track
  - Retrieve waveforms for a track
  - Check waveform sharing for duplicate tracks

- [ ] **Check logs for errors**
  ```bash
  tail -f logs/app.log
  ```

- [ ] **Delete backups** (once verified working)
  ```bash
  rm data/library.db.backup-before-migration-005
  rm data/library.db.backup-before-migration-006
  ```

## Troubleshooting

### Migration 005 Fails

**Error**: "Database locked"
```bash
# Kill any processes using the database
lsof data/library.db
pkill -f "node src/server.js"
```

**Error**: "tracks.id must be UUID format"
- This usually means migration 005 wasn't completed successfully
- Check schema version: `sqlite3 data/library.db "PRAGMA table_info(tracks);"`
- Look for `id TEXT PRIMARY KEY` (UUID) vs `id INTEGER PRIMARY KEY` (old)

### Migration 006 Fails

**Error**: "Migration 005 must be completed first"
- Run migration 005 before migration 006
- Check schema version: should be at least 5

**Error**: "no such column: file_hash"
- Waveforms table doesn't have file_hash column
- This means you're running migration 006 before the new schema is in place
- Ensure migration 005 completed successfully

### Application Errors After Migration

**Error**: "Invalid track ID: X is not a valid UUID"
- Old code trying to use integer track IDs
- Update all code that calls `getTrackById()` to use UUIDs
- Check routes, controllers, and services

**Error**: "no such column: track_id in waveforms"
- Old code trying to access waveforms by track_id
- Use `getWaveform(trackId, zoomLevel)` which handles the hash lookup
- Or use `getWaveformByHash(fileHash, zoomLevel)` directly

## Schema Version History

| Version | Description | Migration Script |
|---------|-------------|------------------|
| 1 | Initial MVP schema | schema.sql |
| 2 | Multi-directory library support | schema.sql |
| 3 | Analysis jobs table | 003_analysis_jobs.sql |
| 4 | Callback metadata field | 004_add_callback_metadata.sql |
| 5 | Track UUID migration | 005_track_uuid_migration.sql |
| 6 | Waveform hash-based storage | 006_waveform_hash_migration.sql |

## Best Practices

1. **Always backup before migrating**
2. **Test on a copy of production data first**
3. **Run migrations during low-traffic periods**
4. **Monitor logs after migration**
5. **Keep backups until verified working** (at least 24 hours)
6. **Document any custom modifications** in this README

## Future Migrations

When creating new migrations:

1. **Numbering**: Use next sequential number (e.g., `007_feature_name.sql`)
2. **Naming**: Descriptive name (e.g., `007_add_playlist_sharing.sql`)
3. **Runner Script**: Create corresponding `run-migration-XXX.js`
4. **Transactions**: Wrap all changes in a transaction for atomicity
5. **Backups**: Always create backups before modifying data
6. **Rollback**: Provide rollback instructions
7. **Documentation**: Update this README with:
   - Purpose and rationale
   - Changes made
   - Running instructions
   - Prerequisites
   - Code changes required
   - Testing checklist

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review migration logs in console output
3. Inspect database with SQLite CLI: `sqlite3 data/library.db`
4. Restore from backup if necessary
5. Report issues on GitHub with:
   - Migration script and version
   - Error message and stack trace
   - Database statistics (track count, size, etc.)
   - Operating system and Node.js version
