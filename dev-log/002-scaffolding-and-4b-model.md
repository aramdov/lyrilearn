# 002 — Project Scaffolding + 4B Model Toggle Support

**Date:** 2026-02-22
**Phase:** Phase 1 — Translation Engine + Core Backend
**Status:** Scaffolding complete, 4B model support added

## Scaffolding completed

### Bun workspace monorepo
- **`package.json`** (root) — Bun workspaces: `["apps/*", "packages/*"]`
- **`packages/shared/types.ts`** — All shared TypeScript types (TranslationResult, Song, LyricLine, Translation, SearchRequest, FlashcardEntry, ApiResponse)
- **`packages/shared/package.json`** — `@lyrilearn/shared` workspace package, `"main": "types.ts"`

### Backend (apps/server)
- **`apps/server/package.json`** — Dependencies: `hono`, `@lyrilearn/shared`. Dev: `@types/bun`
- **`apps/server/tsconfig.json`** — ESNext + bundler module resolution + bun-types
- **`apps/server/src/index.ts`** — Hono app with CORS, logger, route mounting, `/health` endpoint
  - Import routes: `import { translateRoutes } from "./routes/translate"`
- **`apps/server/src/routes/`** — Stub files for `translate.ts`, `search.ts`, `lyrics.ts`, `config.ts` (all return 501)
- **`apps/server/src/db/schema.sql`** — Full SQLite schema (6 tables: songs, lyrics, translations, translation_overrides, search_cache, translation_benchmarks)
- **`apps/server/src/db/index.ts`** — SQLite connection with WAL mode + foreign keys
- **`apps/server/src/db/init.ts`** — Schema init script: `bun run db:init`

### Verified working
```bash
bun run apps/server/src/index.ts  # → "LyriLearn server running on http://localhost:3001"
curl http://localhost:3001/health  # → {"status":"ok"}
bun run db:init                    # → "Database initialized successfully"
```

### Dependencies installed
- `bun@1.3.9` (freshly installed)
- `hono@4.7.x`
- `@types/bun@1.3.9`

## 4B Model Toggle Support

User requested TranslateGemma 4B as a togglable option in the web app.

### Design decision
- `Provider` type stays as `"local" | "cloud"` — represents WHERE translation runs
- New `LocalModel` type: `"translategemma-12b-4bit" | "translategemma-4b-4bit"` — represents WHICH model
- New `TranslationConfig` interface combines both: `{ provider, localModel? }`
- `modelVariant` field in `TranslationResult` and DB identifies which model produced a translation

### Files changed
- **`packages/shared/types.ts`** — Added `Provider`, `LocalModel`, `TranslationConfig` types. Updated all `"local" | "cloud"` references to use `Provider` type.
- **`apps/inference/server.py`** — Rewritten to support multi-model:
  - `MODELS` dict maps model names to HuggingFace repos
  - `_loaded_models` dict caches loaded models in memory
  - Default model (12B) loads at startup; 4B loads lazily on first use
  - `POST /translate` accepts optional `model` param
  - `GET /health` returns `loaded_models` and `available_models` lists
- **`apps/server/src/db/schema.sql`** — `translations` unique constraint now includes `model_variant`: `UNIQUE(lyrics_id, target_lang, provider, model_variant)`
- **`CLAUDE.md`** — Updated tech stack, API docs, caching strategy, ProviderToggle description

### Updated API contract (inference server)
```bash
# Default (12B)
POST /translate {"text": "...", "target_lang": "en"}

# Explicit 4B
POST /translate {"text": "...", "target_lang": "en", "model": "translategemma-4b-4bit"}

# Health — shows which models are loaded
GET /health → {"loaded_models": [...], "available_models": [...]}
```

### Memory implications (M4 Mac Mini 16GB)
- 12B only: ~6-8 GB
- 12B + 4B simultaneously: ~8-11 GB (viable on 16GB)
- 4B only: ~2-3 GB (very comfortable)

## Phase 1 progress

| Task | Status |
|------|--------|
| Project scaffolding (Bun workspace, monorepo) | **Done** |
| MLX inference server + model setup | **Done** (both 12B and 4B support) |
| `TranslationProvider` interface + `LocalProvider` | **Next** |
| `CloudProvider` implementation | Not started |
| Provider factory with toggle logic | Not started |
| SQLite schema + migration script | **Done** |
| Backend: `/api/translate` endpoint | Stub created |
| Backend: `/api/search` endpoint | Stub created |
| Backend: Lyrics fetching + caching | Not started |
| Backend: Translation caching | Not started |
