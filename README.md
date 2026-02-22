# LyriLearn

Learn languages through song lyrics. Search for a song, see line-by-line translations, follow along karaoke-style with YouTube playback, and build vocabulary flashcards.

The core engineering focus is the **translation layer** — TranslateGemma running locally on Apple Silicon via MLX, with Google Cloud Translation as a togglable fallback.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) (JS/TS runtime with built-in SQLite) |
| Backend | [Hono](https://hono.dev) on Bun |
| Frontend | React + TypeScript + Tailwind CSS + shadcn/ui |
| Database | SQLite via `bun:sqlite` |
| Local Translation | [TranslateGemma](https://huggingface.co/google/translategemma-12b-4bit) via [MLX](https://github.com/ml-explore/mlx) + FastAPI |
| Cloud Translation | Google Cloud Translation API v2 |
| Lyrics | [LRCLIB](https://lrclib.net) (synced lyrics) + [Genius API](https://docs.genius.com/) (metadata/artwork) |
| Video | YouTube IFrame Player API + Data API v3 |
| Monorepo | Bun workspaces |

## Project Structure

```
lyri-learn/
├── apps/
│   ├── inference/          # MLX inference server (Python/FastAPI)
│   │   ├── server.py       # Multi-model TranslateGemma server (12B + 4B)
│   │   └── requirements.txt
│   ├── server/             # Bun + Hono backend
│   │   └── src/
│   │       ├── routes/     # search, lyrics, translate, config
│   │       ├── services/   # translation providers, lrclib, genius, youtube
│   │       └── db/         # SQLite schema + connection
│   └── web/                # React frontend (Phase 2)
├── packages/
│   └── shared/             # Shared TypeScript types
├── scripts/                # setup-mlx.sh, benchmark.ts, seed-songs.ts
└── dev-log/                # Development progress notes
```

## Getting Started

### Prerequisites

- **macOS with Apple Silicon** (M1/M2/M3/M4) for local TranslateGemma inference
- **Bun** — `curl -fsSL https://bun.sh/install | bash`
- **Python 3.10+** (for MLX inference server)

### Install

```bash
# Install JS dependencies
bun install

# Initialize the database
bun run db:init
```

### Set Up Local Translation (Optional)

```bash
# Install MLX, download TranslateGemma model, create Python venv
bash scripts/setup-mlx.sh

# Start the inference server
cd apps/inference && source .venv/bin/activate && uvicorn server:app --host 0.0.0.0 --port 8000
```

The inference server supports two models:
- **TranslateGemma 12B** (4-bit) — higher quality, ~6-8 GB VRAM, loaded at startup
- **TranslateGemma 4B** (4-bit) — faster, ~2-3 GB VRAM, loaded lazily on first use

### Environment Variables

Create a `.env` file in the project root:

```bash
# Optional — only needed for cloud translation fallback
GOOGLE_CLOUD_API_KEY=your-key

# Optional — enables YouTube video search
YOUTUBE_API_KEY=your-key

# Optional — enables Genius metadata/artwork
GENIUS_ACCESS_TOKEN=your-token

# Defaults shown — override if needed
MLX_INFERENCE_URL=http://localhost:8000
MLX_MODEL=translategemma-12b-4bit
PORT=3001
```

All external API keys are optional. The app degrades gracefully — LRCLIB lyrics work without any keys.

### Run

```bash
# Start backend (port 3001)
bun run dev:server

# Start frontend (port 5173) — coming in Phase 2
bun run dev:web
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/search` | Search for a song (LRCLIB + Genius + YouTube in parallel) |
| `POST` | `/api/translate` | Translate text with provider selection |
| `GET` | `/api/lyrics/:songId` | Get lyrics with cached translations |
| `GET` | `/api/config` | Provider health status |
| `GET` | `/health` | Server health check |

### Example: Search for a Song

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Shape of You Ed Sheeran", "sourceLang": "en"}'
```

Returns song metadata, synced lyrics with timestamps, and YouTube video ID.

### Example: Translate Text

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "sourceLang": "en", "targetLang": "ru"}'
```

## Translation Architecture

```
Request → manual override check → cache check → live translate → cache result
                                                    ↓ (if unavailable)
                                                 fallback provider
```

**Translation priority:**
1. Manual overrides (from `translation_overrides` table) — always win
2. Cached translation for the requested provider + model
3. Live translation from the requested provider
4. Fallback to the other provider if requested one is unavailable

Translations are cached in SQLite keyed by `(lyrics_id, target_lang, provider, model_variant)`, so results from different providers/models are stored independently.

## Database

SQLite with 6 tables: `songs`, `lyrics`, `translations`, `translation_overrides`, `search_cache`, `translation_benchmarks`. Schema in `apps/server/src/db/schema.sql`.

```bash
# Initialize or reset the database
bun run db:init
```

## Development Phases

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Translation Engine + Core Backend | **Complete** |
| **Phase 2** | Frontend Core (React, search, lyrics view, YouTube, provider toggle) | Up Next |
| Phase 3 | Karaoke sync + Transliteration | Planned |
| Phase 4 | Flashcards (IndexedDB) | Planned |
| Phase 5 | Polish + Deploy | Planned |

### Phase 1 — Complete

All backend infrastructure is in place:
- Bun workspace monorepo with shared types
- MLX inference server supporting 12B and 4B TranslateGemma models
- Translation provider abstraction (LocalProvider + CloudProvider)
- Provider factory with fallback logic and caching
- LRCLIB, Genius, and YouTube service clients
- All API endpoints (`/api/search`, `/api/translate`, `/api/lyrics/:songId`, `/api/config`)
- SQLite schema with search and translation caching
- End-to-end tested with synced lyrics (92 lines for "Shape of You")

See `dev-log/` for detailed development notes.

## License

Private project.
