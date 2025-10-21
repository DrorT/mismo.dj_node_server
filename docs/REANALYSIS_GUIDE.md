# Track Re-Analysis Guide

This guide explains how to re-analyze tracks when the analysis server is updated with new features or improvements.

## Why Re-Analyze?

Re-analysis is necessary when:

1. **New analysis fields are added** (e.g., `firstBeatOffset`, `firstPhraseBeatNo`)
2. **Analysis algorithms are improved** (more accurate BPM detection, better beat tracking, etc.)
3. **Existing analysis data needs to be updated** (all fields are refreshed, not just new ones)

**Important**: Re-analysis **updates all data**, including BPM, beats, downbeats, and other analysis fields. The new data replaces the old data completely.

---

## Methods for Re-Analysis

### Method 1: CLI Script (Recommended for Bulk Operations)

The CLI script provides an easy way to re-analyze tracks from the command line.

#### Re-analyze ALL tracks

```bash
npm run reanalyze:all
```

Or with more control:

```bash
node scripts/reanalyze-tracks.js --all --priority normal
```

#### Re-analyze tracks in a specific library

```bash
npm run reanalyze:library <library-id>
```

Or:

```bash
node scripts/reanalyze-tracks.js --library <library-id>
```

#### Re-analyze specific tracks

```bash
node scripts/reanalyze-tracks.js --track-ids uuid1,uuid2,uuid3
```

#### Dry run (preview without executing)

```bash
npm run reanalyze:dry-run
```

Or:

```bash
node scripts/reanalyze-tracks.js --all --dry-run
```

#### Advanced options

```bash
node scripts/reanalyze-tracks.js \
  --all \
  --characteristics \
  --priority high \
  --dry-run
```

**Options:**
- `--all` - Re-analyze all tracks in database
- `--library <id>` - Re-analyze all tracks in a specific library directory
- `--track-ids <ids>` - Comma-separated list of track UUIDs
- `--basic-features` - Include basic features analysis (default: true)
- `--no-basic-features` - Exclude basic features analysis
- `--characteristics` - Include characteristics analysis (default: false)
- `--priority <level>` - Priority level: `low`, `normal`, `high` (default: `normal`)
- `--dry-run` - Show what would be re-analyzed without actually doing it

---

### Method 2: HTTP API (Recommended for Web UI)

The HTTP API allows you to trigger re-analysis from a web interface or external tools.

#### Re-analyze ALL tracks

```bash
curl -X POST http://localhost:3000/api/analysis/reanalyze \
  -H "Content-Type: application/json" \
  -d '{
    "all": true,
    "priority": "normal"
  }'
```

#### Re-analyze tracks in a specific library

```bash
curl -X POST http://localhost:3000/api/analysis/reanalyze \
  -H "Content-Type: application/json" \
  -d '{
    "library_id": "library-uuid-here",
    "priority": "normal"
  }'
```

#### Re-analyze specific tracks

```bash
curl -X POST http://localhost:3000/api/analysis/reanalyze \
  -H "Content-Type: application/json" \
  -d '{
    "track_ids": ["uuid1", "uuid2", "uuid3"],
    "priority": "high"
  }'
```

#### Advanced options

```bash
curl -X POST http://localhost:3000/api/analysis/reanalyze \
  -H "Content-Type: application/json" \
  -d '{
    "all": true,
    "options": {
      "basic_features": true,
      "characteristics": true
    },
    "priority": "low"
  }'
```

**Request Body:**
```javascript
{
  "track_ids": ["uuid1", "uuid2"],  // Optional: Specific track IDs
  "library_id": "library-uuid",     // Optional: All tracks in a library
  "all": true,                      // Optional: All tracks in database
  "options": {
    "basic_features": true,         // Default: true
    "characteristics": false        // Default: false
  },
  "priority": "normal"              // low | normal | high
}
```

**Response:**
```javascript
{
  "message": "Re-analysis queued for 150 tracks",
  "summary": {
    "total_requested": 150,
    "queued": 150,
    "failed": 0,
    "errors": []
  }
}
```

---

### Method 3: Single Track Re-Analysis

Re-analyze a single track with the `force` flag:

```bash
curl -X POST http://localhost:3000/api/analysis/request \
  -H "Content-Type: application/json" \
  -d '{
    "track_id": "track-uuid-here",
    "force": true,
    "priority": "high"
  }'
```

**Request Body:**
```javascript
{
  "track_id": "uuid",               // Required: Track UUID
  "force": true,                    // Required: Force re-analysis
  "options": {
    "basic_features": true,         // Default: true
    "characteristics": false        // Default: false
  },
  "priority": "normal"              // low | normal | high
}
```

---

## Monitoring Progress

### Check queue status

```bash
curl http://localhost:3000/api/analysis/queue
```

**Response:**
```javascript
{
  "queue": {
    "isProcessing": true,
    "maxConcurrentJobs": 2,
    "processingCount": 2,
    "queuedCount": 148
  },
  "stats": {
    "queued": { "high": 0, "normal": 148, "low": 0, "total": 148 },
    "processing": { "high": 0, "normal": 2, "low": 0, "total": 2 }
  }
}
```

### Check specific job status

```bash
curl http://localhost:3000/api/analysis/jobs/<job-id>
```

**Response:**
```javascript
{
  "job": {
    "job_id": "file-hash",
    "track_id": "track-uuid",
    "status": "processing",
    "priority": "normal",
    "progress_percent": 50,
    "stages_completed": ["basic_features"],
    "created_at": "2025-10-21T10:30:00Z",
    "started_at": "2025-10-21T10:30:15Z"
  }
}
```

---

## Best Practices

### 1. **Use Dry Run First**

Always test with `--dry-run` to see what will be re-analyzed:

```bash
node scripts/reanalyze-tracks.js --all --dry-run
```

### 2. **Start with Low Priority**

For bulk operations, use `low` priority to avoid overwhelming the analysis server:

```bash
node scripts/reanalyze-tracks.js --all --priority low
```

### 3. **Re-analyze During Off-Hours**

Large re-analysis operations can take hours/days. Schedule them during periods of low usage.

### 4. **Monitor System Resources**

The analysis server is CPU-intensive. Monitor system load:

```bash
# Check analysis server health
curl http://localhost:3000/api/analysis/health

# Check queue status
curl http://localhost:3000/api/analysis/queue
```

### 5. **Only Basic Features by Default**

Unless you need updated characteristics (danceability, energy, etc.), only re-analyze basic features:

```bash
node scripts/reanalyze-tracks.js --all --no-characteristics
```

This is **much faster** and sufficient for getting new fields like `firstBeatOffset`.

---

## Example: Re-Analyzing for New Fields

After adding `firstBeatOffset` and `firstPhraseBeatNo` to the analysis server:

### Step 1: Dry run to check

```bash
npm run reanalyze:dry-run
```

Output:
```
🔄 Mismo DJ Track Re-Analysis Tool

🌍 Re-analyzing ALL 523 track(s) in database

📊 Analysis Options:
   Basic Features: ✓
   Characteristics: ✗
   Priority: normal

🔍 DRY RUN MODE - No actual analysis will be performed

Would re-analyze 523 track(s)
```

### Step 2: Start re-analysis

```bash
npm run reanalyze:all
```

Output:
```
🔄 Mismo DJ Track Re-Analysis Tool

🌍 Re-analyzing ALL 523 track(s) in database

📊 Analysis Options:
   Basic Features: ✓
   Characteristics: ✗
   Priority: normal

⚠️  This will re-analyze 523 track(s).
   All existing analysis data (BPM, beats, downbeats, etc.) will be updated.

Press Ctrl+C to cancel, or wait 5 seconds to continue...

🚀 Starting re-analysis...

✅ Re-analysis Queued

   Total Requested: 523
   Successfully Queued: 523
   Failed: 0

💡 Track progress with: GET /api/analysis/queue
   Or view job details: GET /api/analysis/jobs/<job_id>
```

### Step 3: Monitor progress

```bash
# Check queue status
curl http://localhost:3000/api/analysis/queue

# Or use watch to monitor in real-time
watch -n 5 'curl -s http://localhost:3000/api/analysis/queue | json_pp'
```

---

## Troubleshooting

### Re-analysis not starting

1. Check if analysis server is running:
   ```bash
   curl http://localhost:3000/api/analysis/health
   ```

2. Check queue status:
   ```bash
   curl http://localhost:3000/api/analysis/queue
   ```

3. Restart analysis server if needed:
   ```bash
   curl -X POST http://localhost:3000/api/analysis/restart
   ```

### Jobs stuck in "processing"

Check if any jobs are stuck:

```bash
curl http://localhost:3000/api/analysis/queue
```

If jobs are stuck for more than 10 minutes, restart the analysis server:

```bash
curl -X POST http://localhost:3000/api/analysis/restart
```

### Out of memory errors

Reduce concurrency in `.env`:

```env
MAX_CONCURRENT_ANALYSIS=1
```

Then restart the app server.

---

## FAQ

**Q: Will re-analysis change my BPM values?**
A: Yes, all analysis data is recalculated. Improved algorithms may produce slightly different (more accurate) BPM values.

**Q: How long does re-analysis take?**
A: Approximately 2-5 seconds per track for basic features, 10-15 seconds with characteristics. For 1000 tracks with 2 concurrent jobs, expect 30-90 minutes.

**Q: Can I cancel re-analysis?**
A: Yes, cancel individual jobs:
```bash
curl -X DELETE http://localhost:3000/api/analysis/jobs/<job-id>
```

**Q: Will my playlists be affected?**
A: No, playlists reference tracks by ID and are not affected by re-analysis.

**Q: What if some tracks fail?**
A: Failed tracks are logged in the response. You can retry them individually or investigate the error.

---

## Summary

- **CLI Script**: Best for bulk operations, simple command-line interface
- **HTTP API**: Best for web UI integration, programmatic control
- **Single Track**: Best for testing or fixing individual tracks
- **Always use `--dry-run` first** to preview operations
- **Monitor progress** with `/api/analysis/queue`
- **Only basic features by default** for faster re-analysis
