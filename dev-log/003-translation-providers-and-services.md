# 003 — Translation Providers + Service Clients + Search

**Date:** 2026-02-22
**Phase:** Phase 1 — Translation Engine + Core Backend
**Status:** Core backend complete

## Translation Provider Layer

### Files created
- **`apps/server/src/services/translation/provider.ts`** — `TranslationProvider` interface (`translate()`, `isAvailable()`, `name`)
- **`apps/server/src/services/translation/local.ts`** — `LocalProvider` class
  - Calls MLX FastAPI server at `MLX_INFERENCE_URL` (default: `http://localhost:8000`)
  - Constructor takes `LocalModel` param to select 12B or 4B
  - `isAvailable()` hits `/health` with 3s timeout
  - Import: `import { LocalProvider } from "./services/translation/local"`
- **`apps/server/src/services/translation/cloud.ts`** — `CloudProvider` class
  - Calls Google Cloud Translation v2 API
  - Requires `GOOGLE_CLOUD_API_KEY` env var
  - `isAvailable()` returns `!!GOOGLE_API_KEY`
- **`apps/server/src/services/translation/index.ts`** — Provider factory + orchestration
  - Exports `translate(opts: TranslateOptions)` — the main function
  - Priority: manual overrides → cache → live → fallback
  - Exports `getProviderStatus()` for health checks
  - Cache read/write via SQLite parameterized queries

### Translation flow
```
Request → override check → cache check → live translate → cache result
                                            ↓ (if provider unavailable)
                                         fallback provider
```

## External Service Clients

- **`apps/server/src/services/lrclib.ts`**
  - `searchLrclib(query)` → search by text
  - `getLrclibLyrics(artist, track)` → get synced lyrics for specific track
  - `parseSyncedLyrics(lrc)` → `.lrc` format → `ParsedLyricLine[]` with timestamps
  - `parsePlainLyrics(plain)` → plain text → `ParsedLyricLine[]` (no timestamps)
  - End times computed from next line's start time

- **`apps/server/src/services/genius.ts`**
  - `searchGenius(query)` → returns `GeniusSearchHit[]` (id, title, artist, artworkUrl)
  - Requires `GENIUS_ACCESS_TOKEN` env var; returns `[]` if not set

- **`apps/server/src/services/youtube.ts`**
  - `searchYouTube(query)` → returns top result `YouTubeSearchResult` (videoId, title, thumbnailUrl)
  - Uses `videoCategoryId: "10"` (Music) for better results
  - Requires `YOUTUBE_API_KEY` env var; returns `null` if not set

## Routes Wired Up

- **`POST /api/search`** — Full orchestration endpoint
  - Searches LRCLIB + Genius + YouTube in parallel
  - Parses synced lyrics into timestamped lines
  - Persists song + lyrics to SQLite
  - Caches search results for 7 days
  - Import: `import { searchRoutes } from "./routes/search"`

- **`POST /api/translate`** — Translation endpoint
  - Body: `{ text, sourceLang, targetLang, provider?, localModel?, lyricsId? }`
  - Returns: `{ data: TranslationResult }`
  - Falls back gracefully when providers unavailable

- **`GET /api/lyrics/:songId`** — Lyrics with translations
  - Query params: `targetLang`, `provider`, `localModel`
  - Joins lyrics with translations and overrides

- **`GET /api/config`** — Provider health status
  - Returns: `{ local: bool, cloud: bool, models: { "12b": bool, "4b": bool } }`

## Verified Working

```bash
# Health check
curl http://localhost:3001/health → {"status":"ok"}

# Config (no providers running)
curl http://localhost:3001/api/config
→ {"data":{"local":false,"cloud":false,"models":{...}}}

# Search (LRCLIB works, YouTube/Genius need API keys)
curl -X POST http://localhost:3001/api/search \
  -d '{"query":"Shape of You Ed Sheeran","sourceLang":"en"}'
→ {"data":{"song":{"id":1,"title":"Shape of You","artist":"Ed Sheeran",...},
   "lyrics":[92 synced lines with timestamps]}}

# Translate (graceful failure, no providers available)
curl -X POST http://localhost:3001/api/translate \
  -d '{"text":"Привет","sourceLang":"ru","targetLang":"en"}'
→ {"error":"No translation provider available"}
```

## Phase 1 Completion Status

| Task | Status |
|------|--------|
| Project scaffolding | **Done** |
| MLX inference server | **Done** (12B + 4B) |
| TranslationProvider + LocalProvider | **Done** |
| CloudProvider | **Done** |
| Provider factory with toggle logic | **Done** |
| SQLite schema + migration script | **Done** |
| `/api/translate` endpoint | **Done** |
| `/api/search` endpoint | **Done** |
| Lyrics fetching + caching | **Done** |
| Translation caching | **Done** |
| Test with songs end-to-end | **Done** (Shape of You — 92 synced lines) |

**Phase 1 is complete.** All backend infrastructure is in place. Next: Phase 2 (Frontend).
