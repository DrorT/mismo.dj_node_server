# Claude Code Development Guidelines for Mismo DJ App Server

## Purpose

This document provides guidelines for effective collaboration between the developer (Chester) and Claude Code throughout the Mismo DJ App Server project. It establishes communication patterns, development workflows, and quality standards to maximize the learning experience while building a professional-grade music server application.

---

## Project Environment

### Technology Stack
- **Runtime**: Node.js v24
- **Language**: JavaScript (ES modules)
- **Framework**: Express.js
- **Database**: SQLite
- **Audio Formats**: MP3, WAV, FLAC, AAC, OPUS, ALAC, AIF
- **Architecture**: RESTful API with file system monitoring

### Current State
- **Branch**: main
- **Recent Work**:
  - Phase 2 completed: Basic track scanning with rescan on startup
  - File watcher implementation
  - Directory scanning functionality
  - Extended audio format support

### Project Structure
```
mismo.dj_app_server/
├── src/
│   ├── server.js           # Main server entry point
│   ├── routes/
│   │   └── tracks.routes.js # Track API endpoints
│   └── utils/
│       └── validators.js    # Input validation utilities
├── test/                    # HTML test clients for manual testing
├── README.md
└── package.json
```

---

## Project Learning Objectives

This project serves several learning goals:

1. **Node.js Server Architecture**: Building a robust music server with real-time monitoring
2. **Audio Metadata Processing**: Working with various audio formats and metadata extraction
3. **Database Design**: Efficient storage and querying of music library data
4. **API Design**: RESTful endpoint design for music library management
5. **AI-Assisted Development**: Exploring effective patterns for working with Claude Code

### What This Means for Our Collaboration

- **Explain, Don't Just Implement**: When suggesting code, explain Node.js patterns and best practices
- **Highlight Modern JavaScript**: Point out ES6+ features and async/await patterns
- **Performance Considerations**: Explain scalability implications for large music libraries
- **Security Best Practices**: Highlight input validation and sanitization needs
- **Alternative Approaches**: When there are multiple ways to solve a problem, present options with trade-offs

---

## Communication Protocols

### Decision Points

Throughout development, we'll encounter architectural and technical decisions. For each decision point:

1. **Claude should**:
   - Present 2-4 options with clear pros/cons
   - Recommend a preferred option with rationale
   - Highlight any learning opportunities in each approach

2. **Chester will**:
   - Review options and ask clarifying questions
   - Make the final decision
   - Document the decision in the Decision Log

**Example Decision Point Format**:
```
Decision Point 1: Audio Metadata Library Selection

Options:
A) music-metadata
   Pros: Pure JavaScript, no native deps, supports many formats
   Cons: Slightly slower for large files
   Learning: Good intro to async/await patterns and streams

B) node-id3 + flac-metadata
   Pros: Format-specific, very fast
   Cons: Multiple dependencies, more code to maintain
   Learning: Understanding format-specific metadata standards

C) ffprobe (ffmpeg wrapper)
   Pros: Supports every format, battle-tested
   Cons: External binary dependency, slower startup
   Learning: Working with child processes in Node.js

Recommendation: Option A (music-metadata)
Rationale: Best balance of simplicity and functionality. No native
dependencies makes deployment easier. Performance is sufficient for
background scanning, and the async API teaches modern Node.js patterns.
```

### Code Review Requests

When presenting code implementations:

1. **Include Context**:
   ```javascript
   // Context: This scans a directory for audio files and extracts metadata.
   // Considerations:
   // 1. Must handle large directories without blocking
   // 2. Should skip/log files with read errors
   // 3. Needs to detect file changes for the watcher

   async function scanDirectory(dirPath) {
       // Implementation...
   }
   ```

2. **Explain Non-Obvious Patterns**:
   - Why is this approach used?
   - What Node.js or Express concepts are at play?
   - Are there common pitfalls to avoid?

3. **Suggest Testing Approach**:
   - How should this code be tested?
   - What edge cases should be considered?

### Question Patterns

**Good Questions to Ask Chester**:
- "Would you like me to explain how Express middleware chains work before implementing this?"
- "There are two approaches here: X (simpler) or Y (more scalable). Which fits your goals better?"
- "This touches on Node.js streams. Should I provide a quick refresher?"

**Avoid**:
- Implementing without confirming approach first
- Assuming Chester wants a particular npm package without discussion
- Moving forward with unclear requirements

---

## Code Quality Standards

### JavaScript Style Guidelines

1. **Modern JavaScript Usage**:
   - Use ES modules (`import`/`export`)
   - Prefer `const` and `let` over `var`
   - Use async/await over raw promises
   - Leverage destructuring and spread operators
   - Use template literals for string interpolation

2. **Node.js Patterns**:
   - Handle errors in async functions (try/catch)
   - Use streams for large files
   - Avoid blocking the event loop
   - Proper error handling middleware in Express

3. **Documentation**:
   ```javascript
   /**
    * Loads audio file metadata and adds it to the database.
    *
    * This method reads the file asynchronously and extracts ID3/FLAC tags.
    * Handles errors gracefully by logging and continuing with other files.
    *
    * @param {string} filePath - Absolute path to the audio file
    * @returns {Promise<Object|null>} Track metadata object or null if failed
    *
    * @example
    * const track = await loadTrack('/music/song.mp3');
    * if (track) console.log(track.title, track.artist);
    */
   async function loadTrack(filePath) {
       // Implementation...
   }
   ```

4. **Error Handling**:
   - Always catch async errors
   - Log errors with context
   - Return appropriate HTTP status codes
   - Never expose internal errors to clients

### Testing Requirements

For every new component or endpoint:

1. **Unit Tests** (minimum):
   - Happy path test
   - Error condition test
   - Edge case test (empty input, special characters, etc.)

2. **Integration Tests** (where applicable):
   - Full request/response cycle
   - Database interaction tests
   - File system operation tests

3. **HTML Test Client** (for each development stage):
   - Interactive test page that connects to the server
   - Tests all features implemented in that stage
   - Provides visual feedback for success/failure
   - Located in `test/` directory as `phase-X-test.html`

**Test Naming Convention**:
```javascript
describe('TrackController', () => {
    describe('GET /api/tracks', () => {
        it('should return all tracks when database has data', async () => {
            // Arrange
            // Act
            // Assert
        });

        it('should return empty array when database is empty', async () => {
            // Arrange
            // Act
            // Assert
        });

        it('should return 500 on database error', async () => {
            // Arrange
            // Act
            // Assert
        });
    });
});
```

**HTML Test Client Requirements**:
Each phase should have a corresponding test HTML file that:
- Connects to the server via fetch API
- Tests all API endpoints for that phase
- Displays results in a readable format
- Shows success/failure status clearly
- Includes error messages for debugging
- Can be opened directly in a browser

Example structure:
```html
<!-- test/phase-2-test.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Phase 2 - Track Scanning Tests</title>
    <style>
        .success { color: green; }
        .error { color: red; }
    </style>
</head>
<body>
    <h1>Phase 2: Track Scanning Tests</h1>
    <button onclick="runAllTests()">Run All Tests</button>
    <div id="results"></div>
    <script>
        async function testGetAllTracks() {
            // Test implementation
        }
        // More tests...
    </script>
</body>
</html>
```

---

## Development Workflow

### Feature Implementation Process

1. **Planning Phase**:
   - Claude presents implementation approach
   - Discuss any decision points
   - Agree on testing strategy
   - Design HTML test interface for the feature
   - Chester approves to proceed

2. **Implementation Phase**:
   - Write tests first (or alongside implementation)
   - Implement feature in small, reviewable chunks
   - Create/update HTML test client for the stage
   - Document code as we go
   - Commit with clear messages

3. **Review Phase**:
   - Run all automated tests
   - Test manually with HTML client
   - Review code together
   - Discuss any concerns or improvements
   - Chester provides feedback

4. **Integration Phase**:
   - Merge into main codebase
   - Update documentation
   - Mark phase deliverable as complete

### Commit Message Format

```
[Component] Brief description

Detailed explanation of changes and why they were made.

Related to: Phase X
Tests: Added/Updated/None
```

Examples:
```
[Scanner] Implement directory watcher for new tracks

Added chokidar-based file watcher that monitors music directory
for new files and automatically scans them for metadata.

Related to: Phase 2
Tests: Added scanner.test.js with 4 test cases

[API] Add filtering endpoints for tracks

Extended /api/tracks endpoint with query parameters for filtering
by artist, album, genre, and BPM range.

Related to: Phase 3
Tests: Updated tracks.test.js, added phase-3-test.html
```

---

## Learning Moments

### When to Provide Explanations

Claude should proactively explain:

1. **Node.js-Specific Concepts**:
   - Event loop and non-blocking I/O
   - Stream processing
   - Child processes
   - Module system (CommonJS vs ES modules)

2. **Express Patterns**:
   - Middleware chain execution
   - Error handling middleware
   - Route organization
   - Request/response lifecycle

3. **Async Patterns**:
   - async/await vs promises vs callbacks
   - Promise.all for parallel operations
   - Error handling in async code
   - Avoiding race conditions

4. **Database Design**:
   - SQL query optimization
   - Index strategies
   - Transaction handling
   - Migration patterns

### Example Explanation Format

```
💡 Learning Moment: Express Middleware Order

In Express, middleware executes in the order it's defined:

1. app.use(cors())        // First: Handle CORS
2. app.use(express.json()) // Second: Parse JSON bodies
3. app.use('/api', routes) // Third: Route handlers
4. app.use(errorHandler)   // Last: Error handling

Key points:
- Order matters! CORS must come before routes
- Error handlers must be defined last (4 parameters)
- Middleware can short-circuit the chain with res.send()
- Use next() to pass control to the next middleware

This is different from event-based systems where order
doesn't affect execution.
```

---

## Testing Philosophy

### Test-Driven Development

While strict TDD isn't required, we'll aim for:

1. **Write tests early**: Ideally before or during implementation
2. **Test behavior, not implementation**: Tests should survive refactoring
3. **Keep tests simple**: Each test should verify one thing
4. **Make tests readable**: Tests are documentation

### Real-World Testing

Beyond automated tests, regularly test with:

- **Diverse audio files**: Different formats, sample rates, bit depths, tags
- **Large libraries**: 1000+ tracks to test performance
- **Special characters**: Unicode in filenames and metadata
- **Edge cases**: Missing tags, corrupted files, permission issues
- **HTML test clients**: Manual testing of all API endpoints

### Performance Testing

For file scanning and database operations:

```javascript
describe('Performance', () => {
    it('should scan 1000 files in under 30 seconds', async () => {
        const start = Date.now();
        await scanDirectory('/test/fixtures/large-library');
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(30000);
    });

    it('should query 10000 tracks in under 100ms', async () => {
        // Seed database with 10000 tracks
        const start = Date.now();
        const tracks = await db.query('SELECT * FROM tracks LIMIT 100');
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(100);
    });
});
```

---

## Documentation Standards

### Code Documentation

1. **Module Files**: Document exported functions and classes
2. **Complex Logic**: Explain algorithms and non-obvious code
3. **README Updates**: Keep user-facing docs current

### API Documentation

As we implement:

1. **Document all endpoints** with request/response examples
2. **Note query parameters** and their validation rules
3. **Document error responses** with status codes

Example:
```javascript
/**
 * GET /api/tracks
 * Returns all tracks with optional filtering
 *
 * Query Parameters:
 * - artist: string (optional) - Filter by artist name
 * - genre: string (optional) - Filter by genre
 * - bpm_min: number (optional) - Minimum BPM
 * - bpm_max: number (optional) - Maximum BPM
 *
 * Response: 200 OK
 * {
 *   "tracks": [
 *     {
 *       "id": 1,
 *       "title": "Song Name",
 *       "artist": "Artist Name",
 *       "album": "Album Name",
 *       "bpm": 128,
 *       "genre": "House",
 *       "filePath": "/music/song.mp3"
 *     }
 *   ]
 * }
 *
 * Error Responses:
 * - 400 Bad Request: Invalid query parameters
 * - 500 Internal Server Error: Database error
 */
router.get('/tracks', trackController.getAllTracks);
```

---

## Critical Coding Standards

### Error Handling: Zero Tolerance for Silent Failures

**Golden Rule**: Every operation that can fail MUST have its result checked and handled.

```javascript
// ❌ WRONG: Silent failure
fs.readFile(filePath);

// ✅ CORRECT: Check result and handle failure
try {
    const data = await fs.readFile(filePath, 'utf8');
    console.log('✓ File read successfully');
    return data;
} catch (error) {
    console.error(`✗ Failed to read file ${filePath}:`, error.message);
    // Log with context
    // Return appropriate error response
    // Clean up resources if needed
    throw error; // or return null, depending on context
}
```

**Apply this to**:
- File system operations
- Database queries
- External API calls
- Audio metadata parsing
- JSON parsing
- Network requests
- Any async operation

**Why this matters**:
- Bugs don't hide - they surface immediately
- Users get actionable error messages
- Easier debugging (errors logged with context)
- Prevents cascading failures

### Input Validation: Never Trust Client Data

**Problem**: Unvalidated input leads to security issues and crashes.

```javascript
// ❌ WRONG: No validation
app.get('/api/tracks/:id', (req, res) => {
    const track = db.getTrack(req.params.id);
    res.json(track);
});

// ✅ CORRECT: Validate all inputs
app.get('/api/tracks/:id', (req, res) => {
    const id = parseInt(req.params.id);

    if (isNaN(id) || id < 1) {
        return res.status(400).json({
            error: 'Invalid track ID. Must be a positive integer.'
        });
    }

    try {
        const track = db.getTrack(id);
        if (!track) {
            return res.status(404).json({
                error: `Track with ID ${id} not found`
            });
        }
        res.json(track);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});
```

**Validate**:
- Path parameters
- Query parameters
- Request bodies
- File paths (prevent directory traversal)
- File types (whitelist allowed extensions)

### Database Operations: Always Use Prepared Statements

```javascript
// ❌ WRONG: SQL injection vulnerability
const query = `SELECT * FROM tracks WHERE artist = '${req.query.artist}'`;
db.query(query);

// ✅ CORRECT: Use parameterized queries
const query = 'SELECT * FROM tracks WHERE artist = ?';
db.query(query, [req.query.artist]);
```

### Async Operations: Handle All Promise Rejections

```javascript
// ❌ WRONG: Unhandled promise rejection
app.get('/api/scan', (req, res) => {
    scanDirectory('/music'); // Returns a promise, but we don't await it
    res.json({ status: 'started' });
});

// ✅ CORRECT: Properly handle async operations
app.get('/api/scan', async (req, res) => {
    try {
        await scanDirectory('/music');
        res.json({ status: 'completed' });
    } catch (error) {
        console.error('Scan failed:', error);
        res.status(500).json({
            error: 'Scan failed',
            message: error.message
        });
    }
});

// ✅ ALSO CORRECT: For background operations
app.get('/api/scan', (req, res) => {
    scanDirectory('/music')
        .then(() => console.log('Scan completed'))
        .catch(error => console.error('Scan failed:', error));

    res.json({ status: 'started' });
});
```

### Defensive Programming Checklist

Before submitting code, verify:

- [ ] Every async operation has error handling (try/catch or .catch())
- [ ] Every file operation checks if file exists/is readable
- [ ] Every database query uses prepared statements
- [ ] Every API endpoint validates inputs
- [ ] Every error logs context (what failed, why, request details)
- [ ] Every API endpoint returns appropriate HTTP status codes
- [ ] Error messages are user-friendly but don't expose internals
- [ ] File paths are validated to prevent directory traversal
- [ ] Large operations use streams to avoid memory issues
- [ ] HTML test client exists for the current development stage

---

## Decision Log

### Decisions Made

#### Decision 1: Library Directory Architecture - No Nested Directories
**Date**: 2025-10-12
**Context**: Phase 3 Day 11 - Directory browsing implementation revealed overlapping library directories (directory 4: `/home/chester/Music/test` was nested inside directory 3: `/home/chester/Music`), causing navigation confusion and data inconsistencies.

**Options Considered**:
1. **Single Root Directories (Chosen)**
   - Pros: Simple data model, fast LIKE queries on relative_path, minimal refactoring, scales well to 50k+ tracks
   - Cons: Cannot have independent nested library directories

2. **Hierarchical Library Tree with parent_directory_id**
   - Pros: Flexible nested structure, per-subdirectory settings possible
   - Cons: Major refactoring required, recursive CTEs for queries, more complex, database bloat (3k+ directory entries for large libraries)

**Decision**: **Option 1 - Single Root Directories**

**Rationale**:
- Library directories cannot be nested within each other
- Each library directory is an independent root with its own tracks
- Tracks use `relative_path` field for hierarchical organization within a library
- Validation prevents creation of overlapping directories
- Optimal for music library use case: same scan settings, simple organization, fast queries
- Query performance: O(log n) index lookup + linear scan of matching rows vs recursive CTEs
- Scales efficiently: 50k tracks = 1 library entry + indexed LIKE queries (1-5ms)

**Implementation**:
- Added `validateNoOverlap()` function to `libraryDirectory.service.js`
- Created migration script `scripts/migrate-overlapping-directories.js`
- Added compound indexes: `idx_tracks_library_path` and `idx_tracks_browse`
- Migrated 21 tracks from directory 4 to directory 3 with updated relative paths

**Performance Characteristics**:
```sql
-- Browse query (optimized with compound index)
SELECT * FROM tracks
WHERE library_directory_id = 3
  AND relative_path LIKE 'Artist/Album/%'
  AND relative_path NOT LIKE 'Artist/Album/%/%'
  AND is_missing = 0;
-- Query time: ~1-5ms on 50k tracks

-- Folder statistics query (counts only available tracks)
SELECT COUNT(*), SUM(file_size)
FROM tracks
WHERE library_directory_id = 3
  AND relative_path LIKE 'Artist/Album/%'
  AND is_missing = 0;
-- Query time: ~1-5ms on 50k tracks
```

**Database Indexes Added**:
```sql
CREATE INDEX idx_tracks_library_path ON tracks(library_directory_id, relative_path);
CREATE INDEX idx_tracks_browse ON tracks(library_directory_id, is_missing, relative_path);
```

**Key Constraint**: Library directories must not overlap. Users should organize music within a single root directory per logical library (e.g., one for "Music", one for "DJ Pool", etc.).

---

## Learning Points from Development

### Phase 1: Project Setup
- Successfully configured ES modules with Node.js v24
- Set up SQLite database structure
- Implemented basic Express server with CORS

### Phase 2: Track Scanning
- Implemented directory scanning with recursive file traversal
- Added support for multiple audio formats (MP3, WAV, FLAC, OPUS, ALAC, AIF)
- Created file watcher for automatic rescanning
- Built metadata extraction pipeline

### Key Lessons
*(This section will be updated as we learn from the project)*

---

## Anti-Patterns to Avoid

### Don't:
1. **Implement without explaining**: Always provide context for learners
2. **Skip tests**: "We'll test it later" usually means never
3. **Ignore error handling**: Node.js won't crash, it'll just silently fail
4. **Block the event loop**: Avoid synchronous operations on large datasets
5. **Trust user input**: Always validate and sanitize
6. **Ignore security**: SQL injection, path traversal, and XSS are real threats
7. **Skip the HTML test client**: Manual testing catches UI/UX issues automated tests miss
8. **Hardcode configuration**: Use environment variables for deployment flexibility

### Do:
1. **Explain the "why"**: Not just the "what"
2. **Provide multiple approaches**: Show there's more than one way
3. **Test early and often**: Automated tests AND HTML test clients
4. **Ask when uncertain**: Better to ask than implement the wrong thing
5. **Celebrate progress**: Acknowledge when we nail something difficult
6. **Handle every error**: Fail loudly with context, never silently
7. **Validate all inputs**: Client data is untrusted
8. **Log with context**: Every error should tell what failed, where, and why
9. **Create interactive test pages**: Make manual testing easy and comprehensive

---

## Conclusion

This project is about building a solid understanding of Node.js server development, API design, and working with audio metadata while creating a functional music library server.

**Key Principles**:
- **Explain, don't just implement**
- **Test everything (automated AND manual)**
- **Document as we go**
- **Handle errors religiously**
- **Consult on decisions**
- **Learn together**

Let's build something awesome! 🎵

---

## Changelog

- 2025-10-12: Initial version created based on C++ project template
  - Adapted for Node.js/Express environment
  - Added JavaScript-specific guidelines
  - Included API documentation standards
  - Added HTML test client requirements for each development stage
  - Added input validation and async handling standards
