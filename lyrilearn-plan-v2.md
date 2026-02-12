# LyriLearn — Song Lyrics Language Learning App

## Planning & Architecture Document (v2)
**Date:** February 12, 2026
**Status:** Planning / Pre-MVP
**Major Change:** TranslateGemma (local inference on M4 Mac Mini) as primary translation engine, Google Cloud Translation as togglable fallback.

---

## 1. Product Vision

A web app for learning languages through song lyrics. Users search for a song, see lyrics with line-by-line translations, follow along karaoke-style with YouTube playback, and build vocabulary flashcards — all optimized for quick "crunch" sessions (5–10 min micro-learning).

**Target languages (personal use):** Russian, Spanish, Armenian
**Inspiration:** [song-lingo.com](https://song-lingo.com)

### What's New in v2

The translation layer is now the **core engineering surface** of the project. Instead of treating translation as a commodity API call, LyriLearn uses **TranslateGemma** running locally on an M4 Mac Mini as the primary translation engine. This opens up:

- **Zero marginal cost** for translations (no API fees after setup)
- **A hands-on AI/ML inference optimization project** (quantization, KV-cache, batching, MPS acceleration)
- **Full control** over translation quality, caching, and model behavior
- **Google Cloud Translation as a toggle** — users (you) can switch between local model and cloud API per-request or globally

---

## 2. Core Features (MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| Song search | Search by song name + artist, select source/target language | P0 |
| YouTube playback | Embedded YouTube player for the song | P0 |
| Lyrics display (karaoke) | Scrolling lyrics synced to playback, highlight active line | P0 |
| Lyrics display (traditional) | Side-by-side: source language left, English translation right | P0 |
| **Translation (TranslateGemma)** | Line-by-line translation via local TranslateGemma model (primary) | **P0** |
| **Translation (Google Cloud)** | Togglable fallback to Google Cloud Translation API | **P0** |
| **Translation provider toggle** | UI switch: "Local Model" vs "Google Translate" | **P0** |
| Transliteration toggle | Button to show Latin-alphabet approximation of Cyrillic/Armenian | P1 |
| Flashcards — save words | Tap a word or line to save to local flashcard deck | P1 |
| Offline flashcard review | Browse saved vocabulary offline (stored in browser) | P1 |
| Rate limiting | IP-based throttling for cloud API; local model has no limits | P0 |

### Post-MVP Features
- Spaced repetition system (SRS) for flashcard review scheduling
- User accounts + cloud sync of flashcard decks
- **TranslateGemma optimization experiments** (quantization benchmarks, speculative decoding, model distillation)
- **Best-of-N translation** with 4B multi-instance for quality comparison
- Word frequency analysis per song
- Grammar breakdowns / morphological notes
- Community-contributed lyrics corrections
- iOS native app

---

## 3. Translation Engine Architecture

### 3.1 TranslateGemma — Primary Engine

TranslateGemma is Google's open translation model based on the Gemma architecture. It's designed specifically for translation tasks.

**Hardware:** M4 Mac Mini (16GB+ unified memory)

| Model Variant | Size | Quantization | VRAM Usage | Fit? |
|---------------|------|-------------|------------|------|
| TranslateGemma 12B | 12B params | 4-bit (GGUF) | ~6-8 GB | ✅ Fits with headroom |
| TranslateGemma 12B | 12B params | 8-bit (GGUF) | ~12-14 GB | ⚠️ Tight on 16GB, fine on 32GB |
| TranslateGemma 4B | 4B params | 4-bit (GGUF) | ~2-3 GB | ✅ Room for multi-instance |

**Recommended starting config:** 12B at 4-bit quantization via **MLX** (Apple's ML framework, purpose-built for Apple Silicon unified memory).

**Inference server:** MLX (`mlx-lm`) wrapped in a thin **FastAPI** service at `localhost:8000`.

| Why MLX | Detail |
|---------|--------|
| **Zero-copy unified memory** | No CPU↔GPU transfer overhead — critical on M-series chips |
| **Native Python** | Direct control over inference params, quantization, KV-cache |
| **Optimization-ready** | Full access to the inference stack for profiling, speculative decoding, batching |
| **Apple Silicon first** | Designed specifically for the M-series hardware we're targeting |

### 3.2 Google Cloud Translation — Fallback

| Metric | Value |
|--------|-------|
| Free tier | 500,000 characters/month |
| Paid rate | $20 per 1M characters |
| Avg song | ~2,500 characters |
| Songs/month (free) | ~200 |
| Supported languages | 130+ including Russian, Spanish, Armenian |

With aggressive caching, cloud costs approach $0 after initial translations.

### 3.3 Translation Provider Abstraction

Both engines sit behind a common `TranslationProvider` interface so the app can swap between them seamlessly:

```
┌─────────────────────────────────────────┐
│           TranslationProvider            │
│  translate(text, sourceLang, targetLang) │
│  → { translated, transliteration? }     │
└────────────┬───────────────┬────────────┘
             │               │
    ┌────────▼─────┐  ┌─────▼──────────┐
    │ LocalProvider │  │ CloudProvider   │
    │ (TranslateGemma│  │ (Google Cloud   │
    │  via MLX +     │  │  Translation)   │
    │  FastAPI)      │  │                 │
    └──────────────┘  └─────────────────┘
```

The backend exposes a config endpoint and the frontend has a toggle. The toggle sets a header or query param (`provider=local|cloud`) that the backend routes accordingly.

### 3.4 Translation Quality Considerations

Song lyrics are tricky for any translation system — they're poetic, use slang, have cultural references, and sometimes intentionally break grammar rules.

| Challenge | TranslateGemma (local) | Google Cloud Translation |
|-----------|----------------------|--------------------------|
| Literal accuracy | Good for standard text; may struggle with slang | Generally good; large training corpus |
| Poetic/contextual | May be better with full-line context in prompt | Tends toward literal translation |
| Armenian | Depends on training data coverage | Supported but quality varies |
| Latency | ~200-800ms per line (depends on quantization + hardware) | ~200-500ms per request (network bound) |
| Cost | $0 (electricity only) | Free tier then $20/1M chars |
| Offline capable | ✅ Yes | ❌ No |

**Quality strategy:**
- Cache all translations server-side regardless of provider
- Allow manual overrides/corrections (stored in DB, take priority over both engines)
- Post-MVP: run both engines and let user compare (A/B display)

---

## 4. AI/ML Optimization Side Project Track

This is the "second layer" of the project — using LyriLearn as a real workload to explore inference optimization techniques on Apple Silicon.

### 4.1 Optimization Experiments (Post-MVP)

| Experiment | Description | Difficulty |
|------------|-------------|------------|
| **Quantization benchmarks** | Compare 4-bit vs 8-bit vs FP16 on quality (BLEU/COMET scores) and speed (tokens/sec) for your specific language pairs | 🟢 Easy |
| **KV-cache optimization** | Song lyrics have repeated patterns (choruses, refrains) — can we exploit this for faster inference on repeated structures? | 🟡 Medium |
| **MPS acceleration profiling** | Profile Metal Performance Shaders usage on M4, identify bottlenecks, compare MLX vs llama.cpp Metal backends | 🟡 Medium |
| **Speculative decoding** | Use 4B as draft model, 12B as verifier — potentially 2-3x speedup with same quality | 🟡 Medium |
| **Continuous batching** | Batch multiple lyric lines into single inference calls for throughput | 🟢 Easy |
| **Best-of-N with 4B** | Run 4B model N times, pick best translation (by perplexity or heuristic) — compare quality vs single 12B run | 🟡 Medium |
| **Model distillation** | Distill 12B into a custom smaller model tuned for your 3 language pairs (ru→en, es→en, hy→en) | 🔴 Hard |
| **Prompt engineering for lyrics** | Test different system prompts for translation quality on poetic/lyrical text | 🟢 Easy |

### 4.2 Benchmarking Framework

Store benchmark results in a SQLite table so you can track improvements over time:

```sql
CREATE TABLE translation_benchmarks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_name TEXT NOT NULL,          -- e.g. "4bit-vs-8bit"
    model_variant   TEXT NOT NULL,          -- e.g. "translategemma-12b-q4"
    provider        TEXT NOT NULL,          -- "local" or "cloud"
    source_lang     TEXT NOT NULL,
    target_lang     TEXT NOT NULL,
    input_text      TEXT NOT NULL,
    output_text     TEXT NOT NULL,
    reference_text  TEXT,                   -- human-verified translation for scoring
    tokens_per_sec  REAL,
    latency_ms      REAL,
    bleu_score      REAL,
    memory_usage_mb REAL,
    quantization    TEXT,                   -- "q4_K_M", "q8_0", "fp16"
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. API Research & Costs (Non-Translation)

### 5.1 Lyrics Sourcing

| Source | Full Lyrics? | Free | Commercial | Notes |
|--------|-------------|------|------------|-------|
| **LRCLIB** | Yes (synced .lrc) | Free, open source | Yes | Community-sourced synced lyrics; enables karaoke. Limited catalog but growing. |
| **Genius API** | Metadata + annotations only | Free | Yes w/ attribution | Full lyrics require scraping — legal gray area. |
| **lyrics.ovh** | Yes | Free, no key | Unclear | Simple REST, unreliable, limited catalog. |
| **Manual curation** | Yes | Free (your time) | Yes | Best for MVP — start with your favorite songs. |

**MVP strategy:** LRCLIB for synced lyrics → Genius for metadata → manual curation as fallback.

### 5.2 YouTube APIs

| API | Cost | Quota | Use Case |
|-----|------|-------|----------|
| IFrame Player API | Free | Unlimited | Embed + play videos |
| Data API v3 | Free | 10,000 units/day | Song → video search (100 units per search = 100 searches/day) |

Cache video IDs so repeat lookups never hit the API.

### 5.3 Transliteration

Use Google Translate's built-in transliteration when using cloud provider. For local provider, use:
- `cyrillic-to-translit-js` for Russian
- Custom character mapping table for Armenian (~38 chars)
- Prompt TranslateGemma to include romanization in output (test this)

---

## 6. Technical Architecture

### 6.1 Stack

```
┌──────────────────────────────────────────────────────────┐
│                      Frontend                             │
│  React + TypeScript + Tailwind CSS + shadcn/ui            │
│  Bun as JS runtime/bundler                                │
│  IndexedDB (via idb) for offline flashcards               │
│  Translation provider toggle (Local / Cloud)              │
└───────────────────────┬──────────────────────────────────┘
                        │ REST API (JSON)
┌───────────────────────┴──────────────────────────────────┐
│                      Backend                              │
│  Bun + Hono (lightweight web framework)                   │
│  SQLite (Bun built-in) — lyrics cache, translation cache  │
│  TranslationProvider abstraction layer                    │
│  Rate limiting middleware (cloud only)                    │
└──────┬────────────┬────────────┬────────────┬────────────┘
       │            │            │            │
       ▼            ▼            ▼            ▼
  TranslateGemma  Google Cloud  YouTube     LRCLIB /
  (MLX FastAPI    Translation   Data API    Genius API
   on :8000)       API           v3
```

### 6.2 TranslateGemma Integration Detail

```
[Backend receives translation request]
        │
        ├─ provider = "local"?
        │       │
        │       ▼
        │   POST http://localhost:8000/translate  (MLX FastAPI server)
        │   {
        │     "text": "Я тебя люблю",
        │     "target_lang": "en"
        │   }
        │   → { "translation": "I love you", "latency_ms": 342, "model": "translategemma-12b-4bit" }
        │       │
        │       ▼
        │   Cache in SQLite
        │   Return to frontend
        │
        ├─ provider = "cloud"?
        │       │
        │       ▼
        │   Google Cloud Translation API call
        │   Cache in SQLite
        │   Return to frontend
        │
        └─ Both hit cache first (SQLite lookup by text + lang pair + provider)
```

### 6.3 Data Flow

```
User searches "Ангелок Colorit"
        │
        ▼
[Frontend] → POST /api/search { query, sourceLang, targetLang, provider }
        │
        ▼
[Backend] →  1. Check cache (SQLite) for this song
             2. If miss: query LRCLIB for synced lyrics
             3. If miss: query Genius API for metadata
             4. Search YouTube Data API for video ID (or use cache)
             5. Translate lyrics via selected provider:
                - "local" → TranslateGemma (MLX inference server on localhost:8000)
                - "cloud" → Google Cloud Translation API
             6. Cache everything in SQLite (keyed by provider)
             7. Return { lyrics, translation, transliteration, videoId, metadata, provider }
        │
        ▼
[Frontend] →  Render karaoke view + side-by-side view
              Embed YouTube player with videoId
              Show which provider was used
              User taps word → save to IndexedDB flashcard deck
```

### 6.4 Database Schema (SQLite — Server)

```sql
-- Cached songs
CREATE TABLE songs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    youtube_id  TEXT,
    genius_id   TEXT,
    lrclib_id   TEXT,
    artwork_url TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(title, artist, source_lang)
);

-- Cached lyrics (original)
CREATE TABLE lyrics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id     INTEGER REFERENCES songs(id),
    line_number INTEGER NOT NULL,
    text        TEXT NOT NULL,
    start_time  REAL,                     -- seconds (for karaoke sync)
    end_time    REAL,
    UNIQUE(song_id, line_number)
);

-- Cached translations (keyed by provider)
CREATE TABLE translations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lyrics_id       INTEGER REFERENCES lyrics(id),
    target_lang     TEXT NOT NULL,
    provider        TEXT NOT NULL DEFAULT 'local',  -- 'local' or 'cloud'
    translated_text TEXT NOT NULL,
    transliteration TEXT,
    model_variant   TEXT,                 -- e.g. 'translategemma-12b-q4', 'google-cloud-v3'
    latency_ms      REAL,                 -- for benchmarking
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lyrics_id, target_lang, provider)
);

-- Manual translation overrides (highest priority)
CREATE TABLE translation_overrides (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lyrics_id       INTEGER REFERENCES lyrics(id),
    target_lang     TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lyrics_id, target_lang)
);

-- Search cache
CREATE TABLE search_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    query       TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME,
    UNIQUE(query, source_lang)
);

-- Benchmark results (for optimization experiments)
CREATE TABLE translation_benchmarks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_name TEXT NOT NULL,
    model_variant   TEXT NOT NULL,
    provider        TEXT NOT NULL,
    source_lang     TEXT NOT NULL,
    target_lang     TEXT NOT NULL,
    input_text      TEXT NOT NULL,
    output_text     TEXT NOT NULL,
    reference_text  TEXT,
    tokens_per_sec  REAL,
    latency_ms      REAL,
    bleu_score      REAL,
    memory_usage_mb REAL,
    quantization    TEXT,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.5 Offline Storage (Browser — IndexedDB)

```typescript
interface FlashcardEntry {
  id: string;
  songId: number;
  songTitle: string;
  artist: string;
  type: 'word' | 'line';
  source: string;            // original text
  target: string;            // translation
  transliteration?: string;
  sourceLang: string;
  targetLang: string;
  provider: 'local' | 'cloud'; // which engine produced this translation
  context?: string;           // full line for context
  createdAt: number;
  reviewCount: number;
  lastReviewed?: number;
}
```

### 6.6 Rate Limiting

| Layer | Limit | Applies To |
|-------|-------|------------|
| IP-based | 50 searches/hour | All requests |
| Per-session (cookie) | 100 cloud translations/day | Cloud provider only |
| Global cloud budget | 400 Google Translate calls/day | Cloud provider only |
| Local model | **No limit** | Local provider — it's your hardware |
| Backoff | Exponential after 3 rapid requests | Cloud provider only |

---

## 7. Project Structure

```
lyri-learn/
├── apps/
│   ├── web/                        # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── KaraokeView.tsx
│   │   │   │   ├── LyricsView.tsx
│   │   │   │   ├── YouTubePlayer.tsx
│   │   │   │   ├── TranslitToggle.tsx
│   │   │   │   ├── ProviderToggle.tsx     # Local / Cloud switch
│   │   │   │   ├── FlashcardDeck.tsx
│   │   │   │   └── FlashcardReview.tsx
│   │   │   ├── lib/
│   │   │   │   ├── db.ts                  # IndexedDB wrapper
│   │   │   │   └── api.ts                 # Backend API client
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── package.json
│   │
│   ├── inference/                   # MLX inference server (Python)
│   │   ├── server.py               # FastAPI wrapper around mlx-lm
│   │   └── requirements.txt        # mlx-lm, fastapi, uvicorn
│   │
│   └── server/                     # Bun + Hono backend
│       ├── src/
│       │   ├── routes/
│       │   │   ├── search.ts
│       │   │   ├── lyrics.ts
│       │   │   ├── translate.ts
│       │   │   └── config.ts              # Provider config endpoint
│       │   ├── services/
│       │   │   ├── translation/
│       │   │   │   ├── provider.ts        # TranslationProvider interface
│       │   │   │   ├── local.ts           # TranslateGemma via MLX inference server
│       │   │   │   ├── cloud.ts           # Google Cloud Translation
│       │   │   │   └── index.ts           # Provider factory + routing
│       │   │   ├── lrclib.ts
│       │   │   ├── genius.ts
│       │   │   ├── youtube.ts
│       │   │   └── transliterate.ts
│       │   ├── db/
│       │   │   ├── schema.sql
│       │   │   └── index.ts
│       │   ├── middleware/
│       │   │   └── rateLimit.ts
│       │   └── index.ts
│       ├── data/
│       │   └── lyrilearn.db
│       └── package.json
│
├── packages/
│   └── shared/
│       └── types.ts                # Shared types (frontend + backend)
│
├── scripts/
│   ├── setup-mlx.sh                # Install MLX + download TranslateGemma model
│   ├── benchmark.ts                # Run translation benchmarks
│   └── seed-songs.ts               # Seed DB with curated songs
│
├── docs/
│   ├── PLAN.md                     # This document
│   └── OPTIMIZATION-LOG.md         # Notes from inference experiments
│
├── CLAUDE.md                       # Instructions for Claude Code
├── README.md
└── package.json                    # Bun workspace root
```

---

## 8. MVP Build Phases

### Phase 1 — Translation Engine + Core Backend (Week 1-2)
- [ ] Project scaffolding (Bun workspace, monorepo structure)
- [ ] Set up MLX inference server + download TranslateGemma 12B 4-bit model
- [ ] `TranslationProvider` interface + `LocalProvider` implementation (MLX FastAPI client)
- [ ] `CloudProvider` implementation (Google Cloud Translation)
- [ ] Provider factory with toggle logic
- [ ] SQLite schema + migration script
- [ ] Backend: `/api/translate` endpoint (accepts provider param)
- [ ] Backend: `/api/search` endpoint (YouTube + LRCLIB + Genius)
- [ ] Backend: Lyrics fetching + caching (LRCLIB → Genius fallback)
- [ ] Backend: Translation caching (keyed by provider)
- [ ] Test with 2-3 songs end-to-end via curl/httpie

### Phase 2 — Frontend Core (Week 3)
- [ ] React app scaffolding (Tailwind + shadcn/ui)
- [ ] Search bar + language selector
- [ ] YouTube embed player (IFrame API)
- [ ] Side-by-side lyrics view (source | translation)
- [ ] Provider toggle (Local Model / Google Translate)
- [ ] Loading states + error handling
- [ ] Mobile-responsive layout

### Phase 3 — Karaoke + Transliteration (Week 4)
- [ ] Karaoke scrolling view synced to YouTube player timestamps
- [ ] Transliteration toggle
- [ ] Transliteration via prompt engineering (local) + API param (cloud)
- [ ] Fallback transliteration libraries (cyrillic-to-translit-js, custom Armenian map)
- [ ] Rate limiting middleware (cloud provider only)

### Phase 4 — Flashcards (Week 5)
- [ ] IndexedDB setup via `idb`
- [ ] Tap word/line → save to flashcard deck (with provider metadata)
- [ ] Flashcard review screen (flip-card UI)
- [ ] Export/import flashcards as JSON
- [ ] Basic stats (cards saved, songs studied, provider breakdown)

### Phase 5 — Polish & Deploy (Week 6)
- [ ] Deploy backend to Render (or run on Mac Mini for local-first usage)
- [ ] Deploy frontend to Render/Vercel
- [ ] Manual curation: seed 10-20 Russian/Spanish/Armenian songs
- [ ] Test on mobile browser
- [ ] README + setup docs
- [ ] `setup-mlx.sh` script for one-command local model setup

### Phase 6 — Optimization Experiments (Ongoing)
- [ ] Benchmark 4-bit vs 8-bit quality/speed tradeoffs
- [ ] Profile MPS/Metal acceleration
- [ ] Test speculative decoding (4B draft + 12B verify)
- [ ] Continuous batching for full-song translation
- [ ] Prompt engineering for lyrical/poetic translation quality
- [ ] Log all results to `translation_benchmarks` table

---

## 9. Hosting & Infrastructure

### 9.1 Development / Personal Use (Mac Mini)

For personal use, the whole thing can run on the M4 Mac Mini:
- TranslateGemma via MLX FastAPI server: `localhost:8000`
- Bun backend: `localhost:3001`
- React frontend (dev server): `localhost:5173`

This is the **zero-cost** setup. No cloud anything.

### 9.2 Deployed (for mobile access, sharing)

| Resource | Platform | Cost |
|----------|----------|------|
| Backend | Render Starter ($7/mo) or Railway ($5/mo) | $5-7/mo |
| Frontend | Render Static (free) or Vercel (free) | $0 |
| TranslateGemma (MLX) | Runs on Mac Mini at home; backend proxies to it via Tailscale/Cloudflare Tunnel | $0 |
| Google Cloud Translation | Fallback only, cached aggressively | $0-5/mo |
| **Total** | | **$5-12/month** |

**Note:** For the deployed version, the backend can proxy translation requests to your Mac Mini (running the MLX inference server) over a Tailscale mesh VPN or Cloudflare Tunnel. This way you get local model translations even from your phone.

### 9.3 Monthly Cost Summary

| Item | Cost |
|------|------|
| Hosting (Render/Railway) | $0 – $7 |
| Google Cloud Translation | $0 (free tier + caching) |
| TranslateGemma | $0 (local hardware) |
| YouTube APIs | $0 |
| LRCLIB | $0 |
| Genius API | $0 |
| Domain (optional) | $0 – $12/year |
| **Total** | **$0 – $7/month** |

---

## 10. Open Questions & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| TranslateGemma translation quality on song lyrics | High | A/B compare with Google Translate; prompt engineering; allow manual overrides |
| TranslateGemma Armenian language support | High | Test early; if poor, default to Google Cloud for Armenian |
| LRCLIB sparse catalog for non-English music | High | Manual curation; unsynchronized lyrics fallback |
| MLX inference latency on M4 for real-time line-by-line | Medium | Pre-translate entire song on first load; cache aggressively |
| Remote access to Mac Mini model (Tailscale/tunnel) | Medium | Test latency; fall back to cloud if tunnel is slow |
| Model updates / new TranslateGemma versions | Low | Pin model version; benchmark new versions before switching |
| Copyright (displaying full lyrics) | Medium | Personal use = low risk; production = need licensing |

---

## 11. Key Technical Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary translation engine | TranslateGemma 12B 4-bit via MLX + FastAPI | Zero cost, full control, native Apple Silicon optimization, direct inference stack access |
| Fallback translation | Google Cloud Translation API | Reliable, good quality, free tier sufficient with caching |
| Model serving | MLX + FastAPI | Purpose-built for Apple Silicon unified memory; direct control over inference params |
| Backend runtime | Bun + Hono | Fast, native TS, built-in SQLite, lightweight |
| Database | SQLite (Bun built-in) | Zero infrastructure, file-based, perfect for MVP |
| Frontend | React + Tailwind + shadcn/ui | Fast iteration, polished components |
| Offline storage | IndexedDB via `idb` | No size limits, structured queries, works offline |
| Lyrics source | LRCLIB (synced) + Genius (metadata) | Free, open-source, sufficient for MVP |
| Deployment | Render + Mac Mini (Tailscale) | Low cost, local model accessible remotely |

---

## 12. References

- [TranslateGemma on Hugging Face](https://huggingface.co/google/translate-gemma)
- [mlx-lm (MLX Language Models)](https://github.com/ml-explore/mlx-examples/tree/main/llms/mlx_lm)
- [MLX by Apple](https://github.com/ml-explore/mlx)
- [llama.cpp](https://github.com/ggerganov/llama.cpp)
- [LRCLIB](https://lrclib.net/)
- [Genius API](https://docs.genius.com/)
- [Google Cloud Translation](https://cloud.google.com/translate/docs)
- [Hono](https://hono.dev/)
- [Bun](https://bun.sh/)
