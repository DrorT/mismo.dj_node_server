# Playlist System - Future Enhancements

This document outlines creative features and enhancements for the Mismo DJ playlist system beyond the core MVP. These ideas are organized by priority tier and theme to guide future development phases.

**Document Status**: Living document - ideas to be evaluated and prioritized
**Created**: 2025-10-23
**Last Updated**: 2025-10-23

---

## Table of Contents

1. [Tier 1: Must-Have Extensions](#tier-1-must-have-extensions)
2. [Tier 2: Should-Have Enhancements](#tier-2-should-have-enhancements)
3. [Tier 3: Nice-to-Have Features](#tier-3-nice-to-have-features)
4. [Tier 4: Future/Experimental Ideas](#tier-4-futureexperimental-ideas)
5. [Feature Details](#feature-details)

---

## Tier 1: Must-Have Extensions
**Timeline**: Phase 6-7 (Post-MVP Core)

These features significantly enhance the core playlist experience and align with professional DJ workflows.

### 🎯 Harmonic Mixing Intelligence
**Priority**: High | **Complexity**: Medium | **Dependencies**: Key analysis data

- **Auto-arrange playlist by key**: Automatically reorder tracks using Camelot Wheel rules
- **Transition scoring**: Rate how well each track transitions to the next (key compatibility, BPM delta, energy flow)
- **Smart insertion**: When adding a track to a playlist, suggest the best position based on harmonic mixing
- **Key clash warnings**: Flag transitions that will sound bad (e.g., incompatible keys, large BPM jumps)

**Implementation Notes**:
- Requires Camelot Wheel mapping (already have key data from analysis server)
- Transition score algorithm: `score = keyCompatibility * 0.4 + bpmCompatibility * 0.3 + energyFlow * 0.3`
- Real-time validation as tracks are added/moved

---

### 📊 Energy Arc Visualization & Planning
**Priority**: High | **Complexity**: High | **Dependencies**: Energy/arousal analysis data

- **Visual energy curve**: Graph showing energy/arousal over the playlist duration
- **Arc templates**: Pre-built energy curves (e.g., "Warm-up to Peak", "Festival Main Stage", "Deep Journey")
- **Arc validation**: Warn if energy jumps are too sudden or the arc doesn't match intent
- **BPM progression graph**: Visualize BPM changes throughout the set
- **"Dead zones" detection**: Identify spots where energy flatlines for too long

**Implementation Notes**:
- Use Chart.js or D3.js for visualization
- Arc templates stored as JSON curves with target energy values at time intervals
- Validation thresholds: energy jump > 0.3 in single transition = warning
- Dead zone: < 0.1 energy variance over 3+ consecutive tracks

**Energy Arc Template Examples**:
```json
{
  "Warm-up to Peak": {
    "description": "Gradual build from chill to high energy",
    "curve": [
      {"position": 0, "energy": 0.2},
      {"position": 0.25, "energy": 0.4},
      {"position": 0.5, "energy": 0.6},
      {"position": 0.75, "energy": 0.8},
      {"position": 1.0, "energy": 0.9}
    ]
  },
  "Peak Time Hold": {
    "description": "Maintain high energy throughout",
    "curve": [
      {"position": 0, "energy": 0.8},
      {"position": 0.5, "energy": 0.9},
      {"position": 1.0, "energy": 0.85}
    ]
  }
}
```

---

### ⏱️ Set Timing & Duration Tools
**Priority**: High | **Complexity**: Low | **Dependencies**: Track duration data

- **Target duration**: "I need a 2-hour set" - system helps you hit the time
- **Time remaining calculator**: Real-time calculation of total playlist duration
- **Adjustable track lengths**: Mark custom in/out points per track, recalculate total time
- **Time-based sorting**: Auto-arrange to fit a time window (e.g., "trim to 90 minutes")
- **Pacing tools**: "Your average track length is 6 minutes - set will be 2.5 hours"

**Implementation Notes**:
- Store custom in/out points in `playlist_tracks` table
- Use `audible_start_offset_ms` and track duration from analysis
- Real-time WebSocket updates for duration changes
- Auto-suggest track removal/addition to hit target duration

---

### 🎯 Intelligent Track Suggestions
**Priority**: High | **Complexity**: High | **Dependencies**: Full analysis data, ML optional

- **"What comes next?"**: Based on current track's key/BPM/energy, suggest next tracks
- **Gap filling**: "You need a 125 BPM track in D minor here" - system suggests candidates
- **Similar track finder**: "Find tracks like this one" based on audio features
- **Playlist completion**: "This 90-minute set needs 3 more tracks - here are suggestions"
- **Avoid repetition**: Warn when adding similar-sounding tracks too close together

**Implementation Notes**:
- Similarity algorithm uses key, BPM, energy, genre, first_phrase_beat_number
- Repetition detection: same artist within 3 tracks, same key within 2 tracks
- Gap filling queries library with specific criteria
- Optional: Integrate ML embeddings for advanced similarity (future)

---

### 🏥 Library Health & Standards System
**Priority**: High | **Complexity**: Medium | **Dependencies**: Track analysis status

- **Prep quality scoring**: Rate each track's "gig readiness" (has cues, analyzed, tagged, etc.)
- **Playlist health metrics**: % of tracks fully prepped, average quality score
- **"Unready tracks" warning**: Flag tracks in playlists that aren't gig-ready
- **Custom prep standards**: Define what "ready" means (e.g., "must have memory cues, BPM, key")
- **Prep checklist per track**: Visual checklist showing what's missing

**Prep Quality Score Formula**:
```javascript
// Each criterion contributes to total score (0-100)
const prepScore = {
  analyzed: 30,           // Has analysis_id
  hasKey: 15,             // Key detected
  hasBPM: 15,             // BPM detected
  hasEnergy: 10,          // Energy/arousal analyzed
  hasGenre: 10,           // Genre tagged
  hasAudibleStart: 10,    // Audible start detected
  hasFirstPhraseBeat: 10  // First phrase beat detected
};

// Example: Track with analysis, key, BPM, energy = 70/100 "Good"
```

**Prep Standards Configuration**:
```json
{
  "gig_ready": {
    "required": ["analyzed", "hasKey", "hasBPM"],
    "recommended": ["hasEnergy", "hasGenre", "hasAudibleStart"],
    "minScore": 70
  },
  "practice_ready": {
    "required": ["analyzed"],
    "minScore": 30
  }
}
```

---

### 📈 Playlist Statistics Dashboard
**Priority**: High | **Complexity**: Medium | **Dependencies**: Analysis data

- **Key distribution chart**: See all keys represented in the playlist
- **BPM histogram**: Visualize BPM distribution
- **Genre breakdown**: Pie chart of genres
- **Energy heatmap**: See energy distribution across playlist timeline
- **Era/year distribution**: Visualize track release years
- **Label diversity**: How many different labels are represented?
- **Average track age**: How "current" vs. "classic" is the playlist?

**Implementation Notes**:
- Chart.js for all visualizations
- Stats calculated on-demand (cache for large playlists)
- Color-coded key distribution using Camelot Wheel colors
- BPM histogram in 10 BPM buckets

---

## Tier 2: Should-Have Enhancements
**Timeline**: Phase 8-9 (Post-Core Extensions)

Features that enhance workflow efficiency and provide deeper insights.

### 🎯 Mission System for Playlists
**Priority**: Medium | **Complexity**: Medium | **Dependencies**: Track analysis, usage tracking

Inspired by DJ Chris M's "system quality" approach - proactive suggestions to improve library and playlist health.

- **"Orphan tracks" finder**: Tracks never added to any playlist
- **"Overused tracks" detector**: Tracks in too many playlists (redundancy check)
- **Playlist quality missions**:
  - "3 tracks in 'Peak Time' playlist need better analysis"
  - "5 tracks missing key data - re-analyze them"
  - "'Festival Set' has 4 tracks all from same artist - diversify"
- **Stale playlist detection**: Playlists not updated in 30+ days
- **Incomplete sets**: Playlists with < 10 tracks or < 60 minutes duration

**Mission Types**:
1. **Health Missions**: Fix missing/incomplete data
2. **Diversity Missions**: Improve variety in playlists
3. **Curation Missions**: Reduce redundancy, improve quality
4. **Maintenance Missions**: Update stale playlists

**Implementation Notes**:
- Background job runs daily to generate missions
- Missions stored in database with priority/status
- UI shows mission count badge on playlists
- One-click mission actions (e.g., "Re-analyze these 3 tracks")

---

### 🧠 Pattern Recognition & Behavioral Insights
**Priority**: Medium | **Complexity**: High | **Dependencies**: Usage tracking, play history

Learn from DJ's habits and suggest improvements.

- **Artist/genre diversity scoring**: Warn if playlist is 80% one artist or genre
- **Repeated patterns**: "You always use the same 5 tracks to open sets"
- **Energy monotony**: "This playlist's energy is flat - no dynamic range"
- **BPM monotony**: "All tracks are 128 BPM - add variety"
- **Overplayed tracks**: "This track is in 8 playlists - reduce redundancy?"

**Diversity Scoring Formula**:
```javascript
// Higher score = more diverse (0-100)
const diversityScore = {
  artistVariety: uniqueArtists / totalTracks * 40,
  genreVariety: uniqueGenres / totalTracks * 30,
  keyVariety: uniqueKeys / totalTracks * 15,
  bpmRange: (maxBPM - minBPM) / 100 * 15
};
```

**Pattern Detection Examples**:
- Same artist in 3+ consecutive tracks
- Same key for 4+ consecutive tracks
- BPM variance < 5 across entire playlist
- Energy variance < 0.2 across entire playlist

---

### 📊 Progress & Learning System
**Priority**: Medium | **Complexity**: Medium | **Dependencies**: Change tracking

Track how playlists evolve and help DJs improve.

- **Playlist evolution tracking**: See how playlists change over time
- **Version history**: Roll back to previous playlist versions
- **A/B testing**: Create variations of a playlist, compare results
- **"Past performance" data**: If you played this playlist, log how it went (crowd response, notes)
- **Improvement suggestions**: "Last month you averaged 15 tracks/playlist, now 22 - good depth improvement"

**Version History Schema**:
```sql
CREATE TABLE playlist_versions (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot JSON NOT NULL,  -- Full playlist state
  change_summary TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id)
);
```

---

### 🔍 Advanced Smart Playlist Criteria
**Priority**: Medium | **Complexity**: High | **Dependencies**: Query engine enhancement

More powerful filtering for smart playlists.

- **Nested logic**: `(Genre = House OR Genre = Techno) AND (Energy > 0.7 OR BPM > 130)`
- **"Not in playlist" filter**: Exclude tracks already in another playlist
- **Play history filters**: "Never played in last 3 months", "Most played in last week"
- **File modification date**: "Recently updated files" (e.g., tracks you just re-analyzed)
- **Mood-based filters**: If analysis provides valence, filter by mood
- **Audio quality**: Filter by bitrate, sample rate, file format
- **Cue point count**: "Tracks with 3+ memory cues" (future integration with audio server)

**Criteria Query Language (JSON)**:
```json
{
  "operator": "AND",
  "conditions": [
    {
      "operator": "OR",
      "conditions": [
        {"field": "genre", "op": "equals", "value": "House"},
        {"field": "genre", "op": "equals", "value": "Techno"}
      ]
    },
    {
      "operator": "OR",
      "conditions": [
        {"field": "energy", "op": "greaterThan", "value": 0.7},
        {"field": "bpm", "op": "greaterThan", "value": 130}
      ]
    },
    {
      "field": "playlist_membership",
      "op": "notIn",
      "value": [5, 12, 18]  // Playlist IDs to exclude
    }
  ]
}
```

---

### 🔄 Import/Export & Interoperability
**Priority**: Medium | **Complexity**: High | **Dependencies**: Parser libraries

Integrate with other DJ software and music services.

- **Import from Rekordbox XML**: Parse Rekordbox playlists
- **Import from Serato crates**: Parse Serato library
- **Import from Traktor NML**: Parse Traktor playlists
- **Export to M3U8**: Extended M3U with metadata
- **Export to CSV**: For spreadsheet analysis
- **Export to JSON**: For custom tools
- **Spotify playlist import**: Match track names, find local files
- **YouTube Music playlist import**: Same as Spotify

**Import Strategy**:
1. Parse external playlist format
2. Match tracks by metadata (artist + title, fuzzy matching)
3. Create new playlist with matched tracks
4. Report unmatched tracks for manual review

**Export Formats**:
- **M3U8**: Standard with `#EXTINF` metadata
- **CSV**: All track data for analysis
- **JSON**: Full playlist object for backup/migration
- **PDF**: Printable setlist for gigs

---

### 🛠️ Bulk Playlist Operations
**Priority**: Medium | **Complexity**: Low | **Dependencies**: None

Efficient operations for power users.

- **Merge strategies**: Union, intersection, difference, append
- **Playlist arithmetic**: "Create playlist = A + B - C"
- **Batch tag updates**: Add genre/color/notes to all tracks in playlist
- **Batch export**: Export multiple playlists at once
- **Batch duplicate**: Create variations of a playlist quickly
- **Batch delete**: Clean up old playlists in bulk

**Merge Operations**:
```javascript
// Union: All tracks from A and B (no duplicates)
const union = [...new Set([...playlistA.tracks, ...playlistB.tracks])];

// Intersection: Only tracks in both A and B
const intersection = playlistA.tracks.filter(t => playlistB.tracks.includes(t));

// Difference: Tracks in A but not in B
const difference = playlistA.tracks.filter(t => !playlistB.tracks.includes(t));

// Append: A + B (allows duplicates)
const append = [...playlistA.tracks, ...playlistB.tracks];
```

---

### 📊 Comparative Analytics
**Priority**: Medium | **Complexity**: Medium | **Dependencies**: Statistics engine

Understand relationships between playlists.

- **Playlist similarity score**: "This playlist is 60% similar to your 'Peak Time' playlist"
- **Track overlap detector**: Show which tracks appear in multiple playlists
- **Unique tracks per playlist**: Measure playlist distinctiveness
- **Genre drift over time**: See how playlist genres evolve
- **Playlist clustering**: Auto-group similar playlists

**Similarity Algorithm**:
```javascript
// Jaccard similarity for track overlap
const similarity = (playlistA, playlistB) => {
  const tracksA = new Set(playlistA.tracks.map(t => t.id));
  const tracksB = new Set(playlistB.tracks.map(t => t.id));

  const intersection = [...tracksA].filter(id => tracksB.has(id)).length;
  const union = new Set([...tracksA, ...tracksB]).size;

  return intersection / union;  // 0-1 score
};

// Feature-based similarity (key, BPM, energy profiles)
const featureSimilarity = (playlistA, playlistB) => {
  const keyOverlap = calculateKeyDistributionSimilarity(playlistA, playlistB);
  const bpmSimilarity = calculateBPMDistributionSimilarity(playlistA, playlistB);
  const energySimilarity = calculateEnergyProfileSimilarity(playlistA, playlistB);

  return (keyOverlap * 0.3 + bpmSimilarity * 0.3 + energySimilarity * 0.4);
};
```

---

## Tier 3: Nice-to-Have Features
**Timeline**: Phase 10+ (Long-term enhancements)

Features that enhance the user experience but are not critical.

### 🎪 Live Set Mode
**Priority**: Low | **Complexity**: Medium | **Dependencies**: Real-time tracking system

Track performance in real-time during live sets.

- **"Now Playing" tracker**: Mark which track you're currently playing in the playlist
- **Real-time notes**: Add notes during performance ("crowd loved this", "transition was rough")
- **Skipped tracks log**: Mark tracks you skipped and why
- **Crowd response rating**: Rate crowd response 1-5 for each track played
- **Set deviation tracking**: Compare what you planned vs. what you actually played
- **Live reordering**: Adjust playlist on-the-fly based on crowd

**Live Set Schema**:
```sql
CREATE TABLE live_set_sessions (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL,
  venue TEXT,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  notes TEXT,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id)
);

CREATE TABLE live_set_tracks (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  played_at INTEGER,
  skipped INTEGER DEFAULT 0,
  crowd_response INTEGER,  -- 1-5 rating
  notes TEXT,
  FOREIGN KEY (session_id) REFERENCES live_set_sessions(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);
```

---

### 🎨 Set Preparation Tools
**Priority**: Low | **Complexity**: Medium | **Dependencies**: Audio server integration (future)

Tools to rehearse and refine sets.

- **"Practice mode"**: Loop through transitions to rehearse
- **Transition notes**: Per-track notes on how to mix in/out
- **Alternative tracks**: For each track, mark 2-3 alternatives (Plan B if crowd isn't feeling it)
- **"Wildcard slots"**: Mark positions where you'll improvise based on vibe
- **Risk assessment**: Flag risky tracks (new, untested, experimental)

**Transition Notes Schema**:
```sql
CREATE TABLE playlist_track_transitions (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  mix_in_notes TEXT,      -- "Start at breakdown, loop 8 bars"
  mix_out_notes TEXT,     -- "Cut on drop, swap bass at 3:45"
  alternative_track_ids TEXT,  -- JSON array of track IDs
  risk_level INTEGER DEFAULT 0,  -- 0=safe, 1=moderate, 2=risky
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);
```

---

### 🏢 Venue & Context Tagging
**Priority**: Low | **Complexity**: Medium | **Dependencies**: Venue database

Associate playlists with performance context.

- **Venue profiles**: Save venue details (sound system, crowd vibe, typical duration)
- **Playlist-to-venue linking**: "This playlist works at Club XYZ"
- **Crowd type tags**: "College night", "Industry crowd", "Tourist crowd"
- **Time slot tags**: "Opening set", "Peak time", "After-hours"
- **Event type tags**: "Festival", "Wedding", "Underground party"
- **Success tracking**: Rate how well playlist worked at each venue
- **Venue-specific auto-suggestions**: "You're playing Club XYZ - load these playlists"

**Venue Schema**:
```sql
CREATE TABLE venues (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  sound_system_notes TEXT,
  crowd_vibe TEXT,
  typical_duration_minutes INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE playlist_venue_performance (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL,
  venue_id INTEGER NOT NULL,
  event_date INTEGER,
  time_slot TEXT,  -- "Opening", "Peak", "Closing"
  crowd_type TEXT,
  success_rating INTEGER,  -- 1-5
  notes TEXT,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (venue_id) REFERENCES venues(id)
);
```

---

### 📈 Personal Performance Metrics
**Priority**: Low | **Complexity**: Medium | **Dependencies**: Usage tracking

Analytics on DJ behavior and playlist usage.

- **Most played playlists**: Track which playlists you use most
- **Playlist success rate**: % of planned tracks actually played
- **Improvisation score**: How much you deviate from plan
- **Playlist reuse rate**: How many times you reuse vs. create new
- **Average prep time**: Track how long you spend building playlists
- **Favorite track combinations**: Learn which tracks you often play together

**Metrics Examples**:
```javascript
{
  "most_played_playlists": [
    {"playlist_id": 12, "name": "Peak Time Techno", "plays": 45},
    {"playlist_id": 8, "name": "Warm-up Deep House", "plays": 32}
  ],
  "improvisation_score": 0.35,  // 35% deviation from planned playlists
  "playlist_reuse_rate": 0.60,  // Reuses 60% of playlists, creates 40% new
  "avg_prep_time_minutes": 45,
  "favorite_combinations": [
    {"track_a": 123, "track_b": 456, "times_played_together": 12}
  ]
}
```

---

### 🔄 Version Control for Playlists
**Priority**: Low | **Complexity**: High | **Dependencies**: Git-like system

Advanced playlist history and branching.

- **Git-like versioning**: Track every change to a playlist
- **Diff view**: See what changed between versions
- **Branch playlists**: Create variations without losing original
- **Merge playlist branches**: Combine variations
- **Restore previous versions**: Undo destructive changes
- **Change annotations**: Note why you made each change

**Version Control Operations**:
```sql
-- Track all changes to playlists
CREATE TABLE playlist_changes (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL,
  parent_version_id INTEGER,  -- NULL for first version
  change_type TEXT NOT NULL,  -- 'track_added', 'track_removed', 'track_reordered'
  change_data JSON NOT NULL,
  change_message TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (parent_version_id) REFERENCES playlist_changes(id)
);

-- Branch playlists
CREATE TABLE playlist_branches (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL,
  branch_name TEXT NOT NULL,
  branched_from_version_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (branched_from_version_id) REFERENCES playlist_changes(id)
);
```

---

### 🤝 Collaboration & Sharing
**Priority**: Low | **Complexity**: High | **Dependencies**: User system, sharing infrastructure

Multi-user playlist features.

- **B2B playlist builder**: Build shared playlists with other DJs
- **Track claiming**: In B2B sets, mark "I'll play this one"
- **Guest curator mode**: Let others suggest tracks, you approve/reject
- **Playlist templates**: Share playlist structures (not tracks, but the structure/criteria)
- **Public setlists**: Export anonymous setlists for sharing (hide file paths)

**Collaboration Schema**:
```sql
CREATE TABLE playlist_collaborators (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,  -- Future: integrate with user system
  role TEXT NOT NULL,  -- 'owner', 'editor', 'viewer', 'contributor'
  added_at INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id)
);

CREATE TABLE playlist_track_claims (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  claimed_by_user_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);
```

---

## Tier 4: Future/Experimental Ideas
**Timeline**: Phase 12+ (Experimental/R&D)

Cutting-edge, experimental, or just-for-fun features.

### 🤖 Predictive & AI Features
**Priority**: Experimental | **Complexity**: Very High | **Dependencies**: ML models, training data

Machine learning-powered playlist generation and optimization.

- **"Auto-pilot playlist"**: Generate entire playlist from seed track and target duration
- **Style transfer**: "Make this playlist sound more like my 'Dark Techno' style"
- **Crowd predictor**: "This playlist will work well for late-night club sets" (based on energy/BPM/key)
- **"Auto-complete playlist"**: AI fills in missing tracks based on flow
- **Smart re-ordering**: AI optimally arranges tracks for best flow

**ML Approaches**:
1. **Embeddings**: Train model on audio features to create track embeddings
2. **Sequence Learning**: LSTM/Transformer to learn playlist sequencing patterns
3. **Recommendation**: Collaborative filtering based on DJ behavior
4. **Clustering**: K-means on track features to find natural groupings

**Tech Stack**:
- TensorFlow.js for browser-based inference
- Python backend for model training
- Vector database (e.g., Pinecone, Qdrant) for similarity search

---

### ⏰ Weather & Time-Based Smart Features
**Priority**: Fun/Experimental | **Complexity**: Low | **Dependencies**: External APIs

Context-aware playlist suggestions.

- **Time of day playlists**: Auto-suggest based on clock time
- **Season-aware playlists**: Different vibes for summer/winter
- **Holiday playlists**: Auto-surface appropriate playlists for holidays
- **"Throwback Thursday" auto-rotation**: Fun feature to resurface old playlists
- **Weather-based suggestions**: "Rainy day = deeper vibes" (optional fun feature)

**Implementation**:
- Use external weather API (OpenWeatherMap)
- Time/date-based rules engine
- Fuzzy matching for "mood" to weather conditions

---

### 🎮 Playlist Games & Challenges
**Priority**: Fun/Experimental | **Complexity**: Medium | **Dependencies**: Challenge system

Gamify playlist creation to encourage exploration and creativity.

- **"Dig deeper" challenge**: Create playlist using only tracks played < 3 times
- **"One artist, one label" challenge**: Create set from single source
- **"Genre blend" challenge**: Smoothly blend two opposite genres
- **"Crate dive" challenge**: Build set from random 20 tracks
- **"Blind set builder"**: System picks tracks, you arrange them (test your skills)

**Challenge Schema**:
```sql
CREATE TABLE playlist_challenges (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  rules JSON NOT NULL,  -- Challenge constraints
  difficulty TEXT,      -- 'Easy', 'Medium', 'Hard'
  created_at INTEGER NOT NULL
);

CREATE TABLE challenge_completions (
  id INTEGER PRIMARY KEY,
  challenge_id INTEGER NOT NULL,
  playlist_id INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  score INTEGER,        -- Optional scoring system
  FOREIGN KEY (challenge_id) REFERENCES playlist_challenges(id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id)
);
```

---

### 🌐 Social & Community Features
**Priority**: Experimental | **Complexity**: Very High | **Dependencies**: User system, social infrastructure

Community-driven playlist features.

- **Anonymous playlist sharing**: Share structure/vibe, not actual files
- **Playlist challenges**: Community creates sets with same constraints
- **Leaderboards**: Most creative playlists, best energy arcs, etc.
- **Playlist comments**: Let others comment on your public playlists
- **Collaborative curation**: Community votes on track additions

**Privacy Considerations**:
- Never expose file paths publicly
- Share only metadata (BPM, key, energy, genre)
- Option to share as "abstract playlist" (structure only)

---

### 🪄 "Magic" Features (AI-Powered)
**Priority**: Experimental | **Complexity**: Very High | **Dependencies**: Advanced ML models

Experimental AI features for creative playlist generation.

- **"Surprise me" generator**: Create completely random but coherent playlist
- **"Finish my thought"**: You add 3 tracks, AI completes the set
- **"Make it darker/lighter"**: Adjust playlist mood automatically
- **"Remove filler"**: AI identifies weakest tracks
- **"Find the gems"**: AI highlights underplayed tracks that fit playlist vibe

**AI Model Requirements**:
- Audio feature embeddings for similarity
- Playlist quality scoring model
- Energy/mood transfer learning
- Anomaly detection for "filler" tracks

---

## Implementation Priorities

### Phase 6: Core Intelligence (Tier 1)
**Focus**: Must-have features that enhance DJ workflow

1. Harmonic Mixing Intelligence
2. Energy Arc Visualization
3. Set Timing Tools
4. Intelligent Track Suggestions
5. Prep Quality Scoring

**Estimated Effort**: 3-4 weeks

---

### Phase 7: Workflow Enhancement (Tier 1 continued)
**Focus**: Statistics and insights

1. Playlist Statistics Dashboard
2. Mission System (basic version)
3. Pattern Recognition (basic)

**Estimated Effort**: 2-3 weeks

---

### Phase 8: Power User Tools (Tier 2)
**Focus**: Advanced filtering and operations

1. Advanced Smart Playlist Criteria
2. Bulk Operations
3. Import/Export (basic formats)

**Estimated Effort**: 3-4 weeks

---

### Phase 9: Analytics & Insights (Tier 2 continued)
**Focus**: Learning and improvement

1. Version History
2. Comparative Analytics
3. Progress & Learning System

**Estimated Effort**: 2-3 weeks

---

### Phase 10+: Nice-to-Have & Experimental
**Focus**: Live performance and experimental features

- Tier 3 features as time permits
- Tier 4 as R&D projects

**Estimated Effort**: Ongoing

---

## Technical Considerations

### Database Schema Extensions

New tables needed across all tiers:

```sql
-- Playlist versions and history
CREATE TABLE playlist_versions (...);
CREATE TABLE playlist_changes (...);

-- Performance tracking
CREATE TABLE live_set_sessions (...);
CREATE TABLE live_set_tracks (...);

-- Venue management
CREATE TABLE venues (...);
CREATE TABLE playlist_venue_performance (...);

-- Missions and challenges
CREATE TABLE playlist_missions (...);
CREATE TABLE playlist_challenges (...);

-- Collaboration (future)
CREATE TABLE playlist_collaborators (...);
CREATE TABLE playlist_track_claims (...);

-- Transition notes
CREATE TABLE playlist_track_transitions (...);
```

### API Endpoints Needed

```javascript
// Tier 1
GET    /api/playlists/:id/suggestions          // Track suggestions
POST   /api/playlists/:id/auto-arrange         // Auto-arrange by key
GET    /api/playlists/:id/energy-arc           // Energy curve data
GET    /api/playlists/:id/transition-scores    // Transition quality scores
GET    /api/playlists/:id/health               // Prep quality metrics

// Tier 2
GET    /api/playlists/missions                 // Active missions
POST   /api/playlists/:id/merge/:otherId       // Merge playlists
GET    /api/playlists/:id/versions             // Version history
GET    /api/playlists/:id/analytics            // Comparative analytics

// Tier 3
POST   /api/playlists/:id/live-session/start   // Start live set
PUT    /api/playlists/:id/live-session/track   // Update track status
POST   /api/playlists/:id/branch               // Create branch
GET    /api/venues                             // Venue management
```

### Frontend Components Needed

```
components/
├── EnergyArcVisualizer/        // Chart for energy curve
├── TransitionScoreIndicator/   // Traffic light for transitions
├── PrepQualityBadge/           // Track readiness indicator
├── PlaylistHealthDashboard/    // Overall playlist metrics
├── MissionList/                // Active missions panel
├── SmartCriteriaBuilder/       // Visual query builder
├── VersionHistory/             // Git-like diff view
├── LiveSetTracker/             // Real-time set tracking
└── PlaylistStatistics/         // Charts and graphs
```

### Performance Considerations

**Optimization Strategies**:

1. **Cache Statistics**: Pre-calculate playlist stats, invalidate on change
2. **Lazy Loading**: Load energy arcs and charts on-demand
3. **Worker Threads**: ML inference in background workers
4. **Debounce Updates**: Batch WebSocket updates for real-time features
5. **Indexed Queries**: Ensure all filter criteria use database indexes

**Scalability Targets**:
- Playlist with 500 tracks: Energy arc renders in < 500ms
- Smart playlist with complex criteria: Query completes in < 1s
- Transition score calculation: < 100ms per transition
- Track suggestion algorithm: < 2s for 10 suggestions

---

## Dependencies & Prerequisites

### External Libraries Needed

```json
{
  "visualization": ["chart.js", "d3.js"],
  "ml": ["@tensorflow/tfjs", "onnxruntime-web"],
  "audio": ["music-metadata"],
  "export": ["xml2js", "papaparse"],
  "diff": ["diff"],
  "search": ["fuse.js"]
}
```

### Data Requirements

All features require:
- ✅ Basic track metadata (title, artist, album, genre)
- ✅ Analysis data (BPM, key, energy, arousal)
- ✅ File paths and durations
- ⏳ Cue points (future audio server integration)
- ⏳ Play history (future tracking system)
- ⏳ User accounts (future multi-user system)

---

## Success Metrics

### Tier 1 Success Criteria
- 90% of playlists have valid energy arcs
- Transition warnings reduce bad transitions by 50%
- DJs spend 30% less time manually arranging tracks
- Prep quality score adoption rate > 80%

### Tier 2 Success Criteria
- Mission completion rate > 60%
- Smart playlist usage increases by 40%
- Average playlist diversity score > 0.7
- Import/export adoption rate > 30%

### Tier 3 Success Criteria
- Live set mode used in 25% of performances
- Venue tracking adoption rate > 50%
- Playlist branching used by power users (10%+)

---

## Conclusion

This document represents a comprehensive roadmap for enhancing the Mismo DJ playlist system. Features are prioritized based on:

1. **DJ Workflow Impact**: Does it solve a real pain point?
2. **Complexity**: Can we build it with reasonable effort?
3. **Dependencies**: Do we have the required data/infrastructure?
4. **User Adoption**: Will DJs actually use it?

The tier system allows us to:
- Focus on high-impact features first (Tier 1)
- Build toward more advanced features (Tier 2-3)
- Experiment with cutting-edge ideas (Tier 4)

**Next Steps**:
1. Review and prioritize Tier 1 features
2. Create detailed design docs for selected features
3. Integrate into Phase 6+ planning
4. Prototype energy arc visualization (highest impact)
5. Build transition scoring algorithm (foundation for many features)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-23
**Maintained By**: Chester + Claude
