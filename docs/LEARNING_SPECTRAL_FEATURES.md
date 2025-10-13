# Learning Moment: Spectral Audio Features

**Date**: 2025-10-13
**Context**: Phase 4 - Analysis Integration
**Topic**: Understanding spectral_centroid, spectral_rolloff, and zero_crossing_rate

---

## Overview

During the implementation of audio analysis callbacks, we discovered that the database includes three advanced spectral features: `spectral_centroid`, `spectral_rolloff`, and `zero_crossing_rate`. This document explains what these features measure, why they're useful, and how they can enhance DJ workflows.

---

## What Are Spectral Features?

Spectral features analyze the **frequency content** of audio signals over time. Unlike simple time-domain features (like amplitude/loudness), spectral features describe the **color**, **brightness**, and **texture** of sound - essentially the "how" rather than just the "how loud."

### Why They Matter for DJs

- They capture **timbre** - the quality that makes a bass guitar sound different from a piano even at the same pitch
- They help describe the **sonic character** of tracks beyond tempo and key
- They enable **intelligent track recommendations** based on sound similarity
- They can predict how tracks will respond to **EQ and filters**

---

## 1. Spectral Centroid

### What It Measures

The spectral centroid represents the **"center of mass"** of the frequency spectrum. Think of it as the "average" frequency where most of the audio energy is concentrated.

**Formula Concept**: Weighted mean of frequencies, where the weights are the amplitudes at each frequency.

### Range
- **Low values** (~200-1000 Hz): Dark, bass-heavy, warm sounds
- **Medium values** (~1000-4000 Hz): Balanced, vocal-range frequencies
- **High values** (~4000+ Hz): Bright, treble-heavy, crisp sounds

### What It Tells You

| Centroid Value | Sound Character | Example Instruments | Typical Genres |
|----------------|-----------------|---------------------|----------------|
| Very Low (<500 Hz) | Dark, boomy, sub-bass | Sub bass, kick drum | Dubstep, deep house |
| Low (500-1500 Hz) | Warm, bass-rich | Bass guitar, cello | Reggae, dub, downtempo |
| Medium (1500-3000 Hz) | Balanced, vocal-range | Vocals, guitar | Pop, rock, most genres |
| High (3000-6000 Hz) | Bright, present | Hi-hats, snare, bright synths | EDM, techno |
| Very High (>6000 Hz) | Crisp, airy, sparkly | Cymbals, vinyl crackle | Minimal techno, ambient |

### Practical Uses for DJs

#### 1. Harmonic Mixing Beyond Musical Key
```
Problem: Two tracks are in the same key (A minor) but sound jarring together
Reason: One has spectral_centroid = 800 Hz (dark/warm), other = 4000 Hz (bright/harsh)
Solution: Find a bridge track with centroid ~2000 Hz for smoother transition
```

#### 2. Set Flow Planning
```
Opening Set (Warm-up):
  - Track 1: 600 Hz (deep, warm)
  - Track 2: 900 Hz (gradually brighter)
  - Track 3: 1200 Hz (more energy)

Peak Time:
  - Track 4: 3000 Hz (bright, energetic)
  - Track 5: 4500 Hz (peak brightness)

Cool Down:
  - Track 6: 2500 Hz (bringing it down)
  - Track 7: 1000 Hz (warm closing)
```

#### 3. Filter Effect Prediction
- **High centroid tracks** (>3000 Hz): High-pass filters won't remove much energy, low-pass filters will have dramatic effect
- **Low centroid tracks** (<1000 Hz): Low-pass filters won't change much, high-pass will drastically thin out sound

#### 4. Smart Track Recommendations
```sql
-- Find tracks with similar sonic brightness to current track
SELECT * FROM tracks
WHERE ABS(spectral_centroid - 2500) < 500
  AND bpm BETWEEN 120 AND 130
ORDER BY ABS(spectral_centroid - 2500);
```

---

## 2. Spectral Rolloff

### What It Measures

The spectral rolloff is the **frequency below which X% of the total spectral energy is contained** (typically 85-95%). It indicates how much high-frequency content exists in the track.

**Simple Explanation**: "At what frequency does the track stop having significant energy?"

### Range
- **Low values** (~2000-8000 Hz): Limited high frequency extension, may sound dull or filtered
- **Medium values** (~8000-14000 Hz): Normal, well-balanced frequency range
- **High values** (~14000-20000+ Hz): Extended high frequencies, airy, well-mastered

### What It Tells You

| Rolloff Value | Frequency Extension | Mix Quality | Typical Causes |
|---------------|---------------------|-------------|----------------|
| Very Low (<5 kHz) | Heavily filtered | Poor/intentional | Lo-fi, telephone effect, heavy filtering |
| Low (5-10 kHz) | Limited highs | Acceptable/vintage | Older recordings, vinyl rips, warm mixes |
| Medium (10-15 kHz) | Good extension | Professional | Modern production, good mastering |
| High (15-18 kHz) | Extended highs | High quality | Excellent mastering, lossless formats |
| Very High (>18 kHz) | Full range | Audiophile | Studio masters, high-res audio |

### Practical Uses for DJs

#### 1. Audio Quality Assessment
```
Track A: spectral_rolloff = 6000 Hz
  → Likely a low-quality MP3 or heavily compressed
  → May sound dull on large sound systems
  → Avoid playing after high-rolloff tracks

Track B: spectral_rolloff = 16000 Hz
  → High-quality source, good mastering
  → Will sound crisp and detailed on club systems
  → Safe to play anywhere in the set
```

#### 2. Volume Matching
```
Two tracks at same RMS loudness but different rolloff:
  - Track with rolloff = 8 kHz: May sound quieter (less "air")
  - Track with rolloff = 16 kHz: May sound louder (more presence)

→ Use rolloff data to predict needed gain adjustments
```

#### 3. Genre Transition Planning
```
From low-rolloff genres (warm/vintage):
  - Disco (8-12 kHz)
  - Funk (9-13 kHz)
  - Classic house (10-14 kHz)

To high-rolloff genres (bright/modern):
  - Modern EDM (14-18 kHz)
  - Techno (13-17 kHz)
  - Trance (15-19 kHz)

→ Gradually increase rolloff for smooth sonic progression
```

#### 4. Mashup Compatibility
```
Vocal from Track A (rolloff = 12 kHz) over instrumental from Track B (rolloff = 16 kHz):
  → Vocal will sound dull compared to backing track
  → May need to add high-shelf EQ boost to vocal
  → Or find vocal with similar rolloff to instrumental
```

#### 5. Sound System Adaptation
```
Small venue with limited high-frequency response:
  → Prioritize tracks with lower rolloff (don't need extended highs)

Large club with excellent sound system:
  → Showcase tracks with high rolloff (16+ kHz)
  → Take advantage of system's full frequency range
```

---

## 3. Zero Crossing Rate (ZCR)

### What It Measures

The zero crossing rate counts **how often the audio waveform crosses the zero amplitude line** (changes from positive to negative voltage, or vice versa). It's a measure of signal **noisiness** vs. **tonality**.

**Visual Explanation**:
```
Sine wave (pure tone):     Low ZCR  - smooth, few crossings
  ___     ___
      \_/     \_/

White noise (percussion):  High ZCR - chaotic, many crossings
 /\/\/\/\/\/\/\/\/\/\
```

### Range
- **Low ZCR**: Tonal, pitched, harmonic content (bass, melody, vocals)
- **Medium ZCR**: Mixed content (full mix with instruments and percussion)
- **High ZCR**: Noisy, percussive, atonal content (hi-hats, cymbals, distortion)

### What It Tells You

| ZCR Level | Sound Type | Dominant Elements | Examples |
|-----------|------------|-------------------|----------|
| Very Low | Pure tones | Bass, sub, pads | Ambient, deep house intro |
| Low | Harmonic | Melody, chords, vocals | Singer-songwriter, classical |
| Medium | Balanced mix | Full production | Most commercial music |
| High | Percussive/noisy | Drums, hi-hats, FX | Drum & bass, breakbeat |
| Very High | Distorted/harsh | Noise, distortion | Industrial, harsh techno |

### Practical Uses for DJs

#### 1. Percussion Density Analysis
```
Track A: ZCR = 0.02 (low)
  → Minimal percussion, smooth, tonal
  → Great for melodic mixing
  → Good for long blends

Track B: ZCR = 0.15 (high)
  → Heavy percussion, lots of hi-hats
  → Quick cuts work better
  → May clash if percussion isn't synchronized
```

#### 2. Intro/Outro Detection
```
Analyzing track sections:

Intro (0:00-1:30):
  - ZCR = 0.03 (very low)
  - Mostly bass and pads
  - Perfect for mixing in

Breakdown (2:00-2:45):
  - ZCR = 0.05 (low)
  - Vocals and chords, minimal percussion
  - Good transition point

Drop (2:45-4:00):
  - ZCR = 0.18 (high)
  - Full drums, hi-hats, snares
  - Mix with caution, sync carefully

Outro (4:00-end):
  - ZCR = 0.04 (low)
  - Percussion fading out
  - Ideal for mixing out
```

#### 3. Beatmatching Difficulty Prediction
```
Low ZCR tracks (<0.05):
  → Fewer transients, easier to beatmatch
  → More forgiving timing
  → Smooth, flowing mixes

High ZCR tracks (>0.12):
  → Many transients, need precise sync
  → Off-by-even-a-few-ms will sound messy
  → Requires tight beatmatching or quantization
```

#### 4. Voice vs. Instrumental Detection
```
Track with vocals:
  - Verse sections: Lower ZCR (tonal vocals)
  - Chorus with ad-libs: Higher ZCR (breath sounds, sibilance)

Pure instrumental:
  - More consistent ZCR throughout
  - Easier to predict behavior

→ Use ZCR changes to auto-detect vocal sections
```

#### 5. Filter Effect Behavior
```
Low ZCR tracks:
  - High-pass filter: Smooth, musical effect
  - Low-pass filter: Gradual darkening
  - Resonant filters: Create interesting tonal shifts

High ZCR tracks:
  - High-pass filter: Can make sound thin/brittle
  - Low-pass filter: Removes air/sparkle but keeps punch
  - Resonant filters: Less noticeable effect (already noisy)
```

#### 6. Stem Separation Quality Prediction
```
Very low ZCR (<0.03):
  → Likely clean, tonal content
  → Stem separation will work well
  → Good candidate for acapella extraction

Very high ZCR (>0.15):
  → Lots of noise/percussion
  → Stem separation may struggle
  → Drums already dominant, may not need separation
```

---

## Combined Use Cases

### Use Case 1: Intelligent Track Matching

Finding the perfect next track based on spectral similarity:

```javascript
function findSimilarTrack(currentTrack, trackLibrary) {
  return trackLibrary
    .filter(t => {
      // Similar brightness
      const centroidDiff = Math.abs(t.spectral_centroid - currentTrack.spectral_centroid);
      // Similar high-frequency content
      const rolloffDiff = Math.abs(t.spectral_rolloff - currentTrack.spectral_rolloff);
      // Similar percussion density
      const zcrDiff = Math.abs(t.zero_crossing_rate - currentTrack.zero_crossing_rate);

      return centroidDiff < 500 && rolloffDiff < 2000 && zcrDiff < 0.03;
    })
    .sort((a, b) => {
      // Rank by overall spectral similarity
      const aDiff = Math.abs(a.spectral_centroid - currentTrack.spectral_centroid);
      const bDiff = Math.abs(b.spectral_centroid - currentTrack.spectral_centroid);
      return aDiff - bDiff;
    });
}
```

### Use Case 2: Automatic Set Flow Planning

Building a set that gradually increases energy through spectral progression:

```javascript
function buildProgressiveSet(tracks, targetDuration) {
  const sortedTracks = tracks.sort((a, b) => {
    // Progressive brightness
    const aScore = a.spectral_centroid * 0.4 +
                   a.spectral_rolloff * 0.3 +
                   a.zero_crossing_rate * 10000 * 0.3;
    const bScore = b.spectral_centroid * 0.4 +
                   b.spectral_rolloff * 0.3 +
                   b.zero_crossing_rate * 10000 * 0.3;
    return aScore - bScore;
  });

  // Warm-up: Low centroid, low ZCR
  // Build: Medium centroid, increasing ZCR
  // Peak: High centroid, high ZCR, high rolloff
  // Cool-down: Decreasing centroid

  return sortedTracks;
}
```

### Use Case 3: Smart EQ Suggestions

Recommending EQ adjustments based on spectral analysis:

```javascript
function suggestEQ(track) {
  const suggestions = [];

  // Too dark?
  if (track.spectral_centroid < 1000 && track.spectral_rolloff < 10000) {
    suggestions.push({
      type: 'high_shelf',
      frequency: 8000,
      gain: 2,
      reason: 'Track is dark - add air and brightness'
    });
  }

  // Too bright/harsh?
  if (track.spectral_centroid > 4000 && track.zero_crossing_rate > 0.15) {
    suggestions.push({
      type: 'low_pass',
      frequency: 12000,
      resonance: 0.7,
      reason: 'Track is bright and harsh - gentle rolloff recommended'
    });
  }

  // Muddy low-mids?
  if (track.spectral_centroid < 800 && track.spectral_rolloff < 8000) {
    suggestions.push({
      type: 'parametric_cut',
      frequency: 300,
      q: 1.5,
      gain: -3,
      reason: 'Low centroid + limited rolloff suggests muddy low-mids'
    });
  }

  return suggestions;
}
```

### Use Case 4: Transition Point Detection

Finding optimal mix points based on spectral characteristics:

```javascript
function findMixPoints(trackA, trackB) {
  // Ideal: Low ZCR sections for smooth blending
  // Avoid: High ZCR sections (too much percussion)

  const outroAnalysis = analyzeSection(trackA, trackA.duration - 60, trackA.duration);
  const introAnalysis = analyzeSection(trackB, 0, 60);

  if (outroAnalysis.zero_crossing_rate < 0.05 &&
      introAnalysis.zero_crossing_rate < 0.05) {
    return {
      mixType: 'long_blend',
      duration: 32, // bars
      reason: 'Both sections are tonal, minimal percussion - perfect for extended mix'
    };
  }

  if (Math.abs(outroAnalysis.spectral_centroid - introAnalysis.spectral_centroid) > 1500) {
    return {
      mixType: 'quick_cut',
      duration: 4, // bars
      reason: 'Large spectral difference - quick transition recommended'
    };
  }

  return {
    mixType: 'standard_blend',
    duration: 16 // bars
  };
}
```

---

## Implementation in Mismo DJ

### Current Status

As of Phase 4, these fields are:
- ✅ Defined in the database schema (`tracks` table)
- ✅ Included in the `updateTrackMetadata` function
- ⏳ Awaiting population from Python analysis server's `characteristics` stage
- ⏳ Not yet displayed in the UI
- ⏳ Not yet used for recommendations or filters

### Potential Features

1. **Track Browser Filters**
   ```
   Filter by Brightness: [Dark ●-----●-----● Bright]
   Filter by Presence:   [Dull ●-----●-----● Crisp]
   Filter by Percussion: [Smooth ●-----●-----● Heavy]
   ```

2. **Visual Track Cards**
   ```
   Track: "Song Title"
   BPM: 128 | Key: Am

   Spectrum Profile:
   🔊 Brightness: ██████░░░░ (Mid)
   ✨ Air/Sparkle: ████████░░ (High)
   🥁 Percussion: ████░░░░░░ (Light)
   ```

3. **Smart Playlist Generation**
   ```
   "Create playlist with gradually increasing brightness"
   "Find tracks with similar timbre to current track"
   "Build set from warm to bright"
   ```

4. **Mix Compatibility Warnings**
   ```
   ⚠️ Warning: Large spectral difference
      Current track: Dark (1200 Hz)
      Next track: Very bright (4500 Hz)

   Suggestion: Insert bridge track or use filter sweep transition
   ```

---

## Testing & Validation

### How to Verify These Values

Once the Python analysis server populates these fields, you can verify they make sense:

```sql
-- Check spectral features for all analyzed tracks
SELECT
  title,
  artist,
  spectral_centroid,
  spectral_rolloff,
  zero_crossing_rate,
  genre
FROM tracks
WHERE spectral_centroid IS NOT NULL
ORDER BY spectral_centroid;
```

**Expected patterns**:
- **Ambient/downtempo**: Low centroid, low-medium rolloff, low ZCR
- **Techno/EDM**: Medium-high centroid, high rolloff, medium-high ZCR
- **Classical**: Medium centroid, high rolloff, low-medium ZCR
- **Industrial/harsh**: High centroid, medium rolloff, very high ZCR

### Example Query: Find Warm Closing Tracks

```sql
-- Tracks perfect for warm, smooth closings
SELECT
  title,
  artist,
  bpm,
  spectral_centroid,
  zero_crossing_rate
FROM tracks
WHERE spectral_centroid < 1200  -- Warm/dark
  AND zero_crossing_rate < 0.06  -- Minimal percussion
  AND bpm BETWEEN 100 AND 115    -- Slower tempo
  AND danceability > 0.5         -- Still groovy
ORDER BY spectral_centroid ASC;
```

---

## Further Learning

### Recommended Reading

1. **"An Introduction to Audio Content Analysis"** by Alexander Lerch
   - Chapter 3: Spectral Features
   - Deep dive into the math and applications

2. **"Designing Sound"** by Andy Farnell
   - Understanding timbre and spectrum
   - How different sounds are constructed

3. **Research Papers**:
   - "Audio Feature Extraction for Music Information Retrieval" (IEEE)
   - "Automatic Music Genre Classification Using Spectral Features"

### Related Concepts

- **MFCC (Mel-Frequency Cepstral Coefficients)**: More advanced timbre features
- **Spectral Flux**: How quickly the spectrum changes (useful for beat detection)
- **Spectral Contrast**: Difference between peaks and valleys in spectrum
- **Harmonic-Percussive Separation**: Uses ZCR and other features to separate tonal vs. percussive content

---

## Summary

| Feature | Measures | DJ Use Case | Query Example |
|---------|----------|-------------|---------------|
| **Spectral Centroid** | Brightness/warmth | Harmonic mixing, set flow planning | "Find warm bass-heavy tracks" |
| **Spectral Rolloff** | High-frequency extension | Quality assessment, genre transitions | "Find crisp, well-mastered tracks" |
| **Zero Crossing Rate** | Percussion density | Beatmatching difficulty, transition points | "Find smooth tonal outros" |

**Key Takeaway**: These spectral features go beyond the obvious (tempo, key) to capture the *sonic character* of tracks. Combined with traditional DJ metrics, they enable intelligent, timbre-aware track selection and mixing that sounds more musical and cohesive.

---

**Next Steps**:
1. Verify Python analysis server is calculating these features
2. Test with diverse music genres to validate ranges
3. Consider adding UI visualizations for these values
4. Implement recommendation algorithms using spectral similarity

---

*This document was created during Phase 4: Analysis Integration as a learning moment to understand the advanced audio features included in the Mismo DJ database schema.*
