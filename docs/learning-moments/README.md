# Learning Moments

This directory contains detailed explanations of key concepts, patterns, and problem-solving approaches encountered during the development of the Mismo DJ App Server.

Each learning moment document follows the format specified in [CLAUDE.md](../../CLAUDE.md) and aims to:
- Explain the **"why"** behind technical decisions
- Provide **context** about Node.js patterns and best practices
- Include **working examples** and test code
- Highlight **common pitfalls** and how to avoid them
- Offer **further reading** for deeper understanding

---

## Learning Moments Index

### 01. Audio-Only Hashing for Duplicate Detection
**File**: [01-audio-hash-metadata-exclusion.md](01-audio-hash-metadata-exclusion.md)
**Date**: 2025-10-12
**Topics**: File Hashing, Audio File Formats, Node.js Streams, Binary I/O
**Difficulty**: Intermediate

**Summary**: Discovered that hashing entire audio files (including metadata) breaks duplicate detection. Implemented format-specific parsing to hash only audio data, enabling correct identification of duplicate recordings with different tags.

**Key Concepts**:
- MP3/FLAC/WAV file format structure
- Node.js streams for large file processing
- Synchsafe integer decoding (ID3v2)
- xxHash for fast non-cryptographic hashing
- Async file I/O patterns

**Practical Skills**:
- Binary file parsing
- Streaming large files efficiently
- Error handling with file descriptors
- Testing with controlled test data

---

## How to Use These Documents

### For Learning

1. **Read sequentially** if you're new to Node.js audio processing
2. **Jump to specific topics** if you're solving a similar problem
3. **Try the examples** in your own environment
4. **Answer the quiz questions** to test understanding

### For Reference

1. Search for specific patterns (e.g., "stream", "async/await")
2. Copy code snippets as starting points
3. Use as documentation for future maintenance
4. Share with team members for knowledge transfer

---

## Contributing

When adding new learning moments:

1. Follow the template structure (see existing documents)
2. Include practical, runnable code examples
3. Explain **why**, not just **what**
4. Add common pitfalls section
5. Include quiz questions at the end
6. Update this index with a summary

---

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Development guidelines and collaboration patterns
- [plan.md](../plan.md) - Project implementation plan and progress
- [API Documentation](../api/) - REST API reference
- [Database Schema](../schema/) - Database design documentation

---

## Learning Objectives Alignment

These learning moments support the project's learning goals (from CLAUDE.md):

1. ✅ **Node.js Server Architecture**: Event loop, streams, async patterns
2. ✅ **Audio Metadata Processing**: File formats, binary parsing, metadata extraction
3. ✅ **Database Design**: Efficient queries, duplicate detection
4. ✅ **API Design**: RESTful patterns, error handling
5. ✅ **AI-Assisted Development**: Effective patterns for working with Claude Code

---

## Feedback

Found an error or have suggestions? Please:
- Open an issue in the project repository
- Submit a pull request with corrections
- Discuss with the team in daily standups

---

**Remember**: These documents are living artifacts. Update them as you learn more!
