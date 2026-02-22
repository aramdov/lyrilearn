# CLAUDE.md — LyriLearn Project Context

## What is this project?

LyriLearn is a web app for learning languages through song lyrics. Users search for a song, see lyrics with line-by-line translations, follow along karaoke-style with YouTube playback, and build vocabulary flashcards.

**The core engineering focus is the translation layer.** The app uses **TranslateGemma** (Google's open translation model) running locally on an M4 Mac Mini as the primary translation engine, with **Google Cloud Translation API** as a togglable fallback.

---

## Tech Stack

- **Runtime:** Bun (JS/TS runtime with built-in SQLite and bundler)
- **Backend:** Hono (lightweight web framework on Bun)
- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui
- **Database:** SQLite (Bun's built-in `bun:sqlite`)
- **Offline storage:** IndexedDB via `idb` library (browser-side flashcards)
- **Translation (primary):** TranslateGemma via MLX + FastAPI (`localhost:8000`) — 12B and 4B models, togglable
- **Translation (fallback):** Google Cloud Translation API
- **Lyrics:** LRCLIB (synced lyrics) + Genius API (metadata)
- **Video:** YouTube IFrame Player API (playback) + Data API v3 (search)
- **Monorepo:** Bun workspaces

---

## Project Structure

```
lyri-learn/
├── apps/
│   ├── web/                        # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── KaraokeView.tsx
│   │   │   │   ├── LyricsView.tsx       # side-by-side source | translation
│   │   │   │   ├── YouTubePlayer.tsx
│   │   │   │   ├── TranslitToggle.tsx
│   │   │   │   ├── ProviderToggle.tsx   # Local 12B / Local 4B / Google Translate switch
│   │   │   │   ├── FlashcardDeck.tsx
│   │   │   │   └── FlashcardReview.tsx
│   │   │   ├── lib/
│   │   │   │   ├── db.ts               # IndexedDB wrapper (idb)
│   │   │   │   └── api.ts              # Backend API client
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
│       │   │   └── config.ts            # Provider config / health check
│       │   ├── services/
│       │   │   ├── translation/
│       │   │   │   ├── provider.ts      # TranslationProvider interface
│       │   │   │   ├── local.ts         # TranslateGemma via MLX inference server
│       │   │   │   ├── cloud.ts         # Google Cloud Translation
│       │   │   │   └── index.ts         # Provider factory + routing
│       │   │   ├── lrclib.ts
│       │   │   ├── genius.ts
│       │   │   ├── youtube.ts
│       │   │   └── transliterate.ts
│       │   ├── db/
│       │   │   ├── schema.sql
│       │   │   └── index.ts             # SQLite connection + queries
│       │   ├── middleware/
│       │   │   └── rateLimit.ts
│       │   └── index.ts                 # Entry point
│       ├── data/
│       │   └── lyrilearn.db             # SQLite database file (gitignored)
│       └── package.json
│
├── packages/
│   └── shared/
│       └── types.ts                # Shared types between frontend/backend
│
├── scripts/
│   ├── setup-mlx.sh                # Install MLX + download TranslateGemma model
│   ├── benchmark.ts                # Translation benchmark runner
│   └── seed-songs.ts               # Seed DB with curated songs
│
├── docs/
│   └── PLAN.md                     # Full architecture plan
│
├── CLAUDE.md                       # This file
├── README.md
└── package.json                    # Bun workspace root
```

---

## Key Architecture Concepts

### Translation Provider Abstraction

Both translation engines implement a common interface:

```typescript
// packages/shared/types.ts

interface TranslationResult {
  translatedText: string;
  transliteration?: string;
  provider: 'local' | 'cloud';
  modelVariant?: string;       // e.g. "translategemma-12b-4bit" or "google-cloud-v3"
  latencyMs: number;
}

interface TranslationProvider {
  translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult>;

  isAvailable(): Promise<boolean>;
}
```

The backend routes to the correct provider based on a `provider` query param or header. The frontend has a toggle component (`ProviderToggle.tsx`) that lets the user switch.

**Priority order for translations:**
1. Manual overrides (from `translation_overrides` table) — always win
2. Cached translation for the requested provider
3. Live translation from the requested provider
4. If requested provider is unavailable, fall back to the other one

### TranslateGemma via MLX

The local provider calls a FastAPI inference server (wrapping `mlx-lm`) at `localhost:8000`:

```bash
# MLX inference server API

# Translate with default model (12B)
POST http://localhost:8000/translate
{
  "text": "Я тебя люблю",
  "target_lang": "en"
}
→ { "translation": "I love you", "latency_ms": 342, "model": "translategemma-12b-4bit" }

# Translate with specific model (4B — faster, lighter)
POST http://localhost:8000/translate
{
  "text": "Я тебя люблю",
  "target_lang": "en",
  "model": "translategemma-4b-4bit"
}
→ { "translation": "I love you", "latency_ms": 120, "model": "translategemma-4b-4bit" }

# Health check — shows loaded and available models
GET http://localhost:8000/health
→ { "status": "ok", "default_model": "translategemma-12b-4bit",
    "loaded_models": ["translategemma-12b-4bit"],
    "available_models": ["translategemma-12b-4bit", "translategemma-4b-4bit"],
    "backend": "mlx" }
```

TranslateGemma uses language tags like `<2en>` (translate to English), `<2ru>` (translate to Russian), etc., prepended to the source text. The FastAPI server handles prompt formatting internally. The `model` parameter is optional — defaults to 12B. The 4B model is loaded lazily on first use.

### Caching Strategy

All translations are cached in SQLite, keyed by `(lyrics_id, target_lang, provider, model_variant)`. This means:
- First translation of a line costs an API call or inference pass
- Every subsequent request for the same line + lang + provider + model is instant (DB lookup)
- Translations from all providers/models are cached independently (useful for comparison)

### Rate Limiting

- **Local provider:** No rate limiting (it's your hardware)
- **Cloud provider:** IP-based (50 searches/hr), session-based (100 translations/day), global budget (400 calls/day)
- Implemented as Hono middleware

---

## Database Schema

See `apps/server/src/db/schema.sql` for the full schema. Key tables:

- `songs` — cached song metadata (title, artist, youtube_id, etc.)
- `lyrics` — cached lyrics lines with timestamps for karaoke sync
- `translations` — cached translations keyed by (lyrics_id, target_lang, provider)
- `translation_overrides` — manual corrections (highest priority)
- `search_cache` — cached API responses (YouTube, LRCLIB, Genius)
- `translation_benchmarks` — performance data from optimization experiments

---

## Environment Variables

```bash
# .env (gitignored)

# Google Cloud Translation (optional — only needed for cloud provider)
GOOGLE_CLOUD_API_KEY=your-key-here

# YouTube Data API v3 (for video search)
YOUTUBE_API_KEY=your-key-here

# Genius API (for song metadata)
GENIUS_ACCESS_TOKEN=your-token-here

# MLX inference server (defaults shown — override if running on a different host)
MLX_INFERENCE_URL=http://localhost:8000
MLX_MODEL=translategemma-12b-4bit

# Server
PORT=3001
```

---

## Commands

```bash
# Install dependencies
bun install

# Start backend (dev mode with hot reload)
cd apps/server && bun run dev

# Start frontend (dev mode)
cd apps/web && bun run dev

# Initialize database
cd apps/server && bun run db:init

# Seed database with curated songs
bun run scripts/seed-songs.ts

# Run translation benchmarks
bun run scripts/benchmark.ts

# Set up MLX + TranslateGemma
bash scripts/setup-mlx.sh

# Start MLX inference server
cd apps/inference && uvicorn server:app --host 0.0.0.0 --port 8000
```

---

## Development Workflow

1. **Start MLX inference server** (if using local translation): `cd apps/inference && uvicorn server:app --host 0.0.0.0 --port 8000`
2. **Start backend**: `cd apps/server && bun run dev` (port 3001)
3. **Start frontend**: `cd apps/web && bun run dev` (port 5173)
4. Frontend proxies API requests to backend; backend proxies local translations to MLX server

### Build Order (phases)

We're building this in phases. When starting a new feature, check which phase it belongs to:

**Phase 1 (current) — Translation Engine + Core Backend:**
- Bun workspace scaffolding
- SQLite schema + init script
- TranslationProvider interface + LocalProvider (MLX) + CloudProvider (Google)
- `/api/translate` endpoint
- `/api/search` endpoint (YouTube + LRCLIB + Genius)
- Lyrics fetching + caching
- Translation caching

**Phase 2 — Frontend Core:**
- React app with Tailwind + shadcn/ui
- Search bar, language selector, provider toggle
- YouTube embed, side-by-side lyrics view
- Wire up to backend API

**Phase 3 — Karaoke + Transliteration**
**Phase 4 — Flashcards**
**Phase 5 — Polish + Deploy**

---

## Coding Conventions

- **Language:** TypeScript everywhere (frontend and backend)
- **Runtime:** Bun (not Node). Use `bun:sqlite` for SQLite, `Bun.serve` patterns, etc.
- **Framework:** Hono for backend routes. Do not use Express.
- **Formatting:** Use Bun's built-in formatter or Prettier defaults
- **Imports:** Use path aliases where configured; prefer relative imports within a package
- **Error handling:** Return proper HTTP status codes with `{ error: string }` JSON bodies. Never throw unhandled.
- **Types:** Define shared types in `packages/shared/types.ts`. Import in both frontend and backend.
- **Database:** Use parameterized queries (never string interpolation in SQL). Use Bun's built-in SQLite.
- **Env vars:** Access via `process.env` or `Bun.env`. Never commit `.env` files.
- **API responses:** Always JSON. Standard shape: `{ data: T }` for success, `{ error: string }` for failure.

---

## External API Reference

### MLX Inference Server (TranslateGemma)
- Base URL: `http://localhost:8000`
- Translate: `POST /translate` with `{ text, target_lang }` → `{ translation, latency_ms, model }`
- Health: `GET /health` → `{ status, model, backend }`
- TranslateGemma prompt format (handled internally by server): `<2{targetLang}> {sourceText}` (e.g., `<2en> Привет мир`)

### Google Cloud Translation v2
- Endpoint: `https://translation.googleapis.com/language/translate/v2`
- Params: `q` (text), `source` (lang code), `target` (lang code), `key` (API key)
- [Docs](https://cloud.google.com/translate/docs/basic/translating-text)

### LRCLIB
- Base URL: `https://lrclib.net/api`
- Search: `GET /search?q={query}` or `GET /search?artist_name={artist}&track_name={track}`
- Get synced lyrics: `GET /get?artist_name={artist}&track_name={track}`
- Returns `.lrc` format with `[mm:ss.xx]` timestamps
- [Docs](https://lrclib.net/docs)

### Genius API
- Base URL: `https://api.genius.com`
- Search: `GET /search?q={query}` with `Authorization: Bearer {token}` header
- Returns song metadata, artwork URL, annotations URL
- Does NOT return full lyrics via API
- [Docs](https://docs.genius.com/)

### YouTube Data API v3
- Search: `GET https://www.googleapis.com/youtube/v3/search?part=snippet&q={query}&type=video&key={key}`
- Costs 100 quota units per search (10,000 units/day free)
- Cache video IDs aggressively

### YouTube IFrame Player API
- No API key needed
- Embed via `<iframe>` or JS API for programmatic control (play, pause, seek, getCurrentTime)
- [Docs](https://developers.google.com/youtube/iframe_api_reference)

---

## Important Notes

- **The MLX inference server must be running for local translations.** If the inference server at `localhost:8000` is not running, the backend should gracefully fall back to cloud provider (or return an error indicating local model is unavailable).
- **Cache everything.** Every translation, every YouTube video ID, every lyrics fetch. The goal is that repeated requests for the same song cost zero API calls and zero inference time.
- **The `translation_overrides` table always takes priority** over any cached or live translation. This is how we correct bad translations.
- **Rate limiting only applies to the cloud provider.** Local model has no limits.
- **SQLite DB file (`lyrilearn.db`) is gitignored.** The schema is version-controlled in `schema.sql` and applied via an init script.
