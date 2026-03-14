# Performance Notes — Translation Pipeline

## Current Architecture (as of 2026-03-14)

### The Original Bottleneck: Sequential Single-Line Inference

The translation pipeline translates lyrics **one line at a time**, each as a separate HTTP request to the MLX inference server.

**Frontend** (`useSongView.ts`):
- Sends up to 5 concurrent requests (`CONCURRENCY = 5`)
- Each request translates a single lyric line via `POST /api/translate`

**MLX Server** (`server.py`):
- Has an `_inference_lock` (asyncio.Lock) that serializes all inference calls
- GPU can only run one forward pass at a time — concurrency at the HTTP level doesn't help
- Each call has overhead: HTTP round-trip, tokenizer encode/decode, KV cache warmup

**Result for a 40-line song:**
- ~40 sequential inference calls
- Each call: ~100-400ms (4B model) or ~300-800ms (27B model)
- Total wall-clock: 4-16 seconds for a full song

### The Fix: Batch Translation

Instead of 40 individual calls, send ~4 batches of ~10 lines each:
- Join multiple lines with newlines in a single prompt
- Model processes all lines in one forward pass with shared prefix computation
- Split the output back into individual translations
- Per-call overhead (HTTP, tokenizer, KV warmup) is amortized across the batch

### 2026-03-14 Implementation Update

The end-to-end batch translation path is now implemented:

- Frontend batches uncached lyric lines into one request
- Backend preserves override and cache precedence, then forwards only uncached lines
- Cloud provider batches multiple `q` params in one Google request
- MLX server `/translate_batch` now attempts true batch generation by passing a list of prompts to `mlx_lm.generate()`
- If the installed `mlx-lm` build does not support list prompts, the MLX server falls back to sequential generation so behavior remains correct on older local environments

### Benchmark Status

No fresh benchmark numbers are recorded in this workspace. The local Python inference environment required for measurement is not installed here (`fastapi` and `mlx_lm` are unavailable), so only the implementation and test-level verification were completed in this session.

To capture real timings on the MLX host, run:

```bash
cd apps/inference && uvicorn server:app --port 8000

curl -X POST localhost:8000/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"Расцветали яблони и груши","target_lang":"en"}'

curl -X POST localhost:8000/translate_batch \
  -H 'Content-Type: application/json' \
  -d '{"texts":["Расцветали яблони и груши","Поплыли туманы над рекой","Выходила на берег Катюша"],"target_lang":"en"}'
```

### Caching Layer

All translations are cached in SQLite keyed by `(lyrics_id, target_lang, provider, model_variant)`. Second visit to a song = instant (DB lookup, zero inference). The batch optimization only matters for the **first** translation of each line.

### Google Cloud Translation

Google Translate v2 API is inherently fast (~50-150ms per call) and could also benefit from batching — the API supports multiple `q` params in a single request. Lower priority since it's already fast, but worth doing for quota efficiency (fewer API calls = fewer quota units consumed).

---

*Last updated: 2026-03-14 — Batch generation implemented; local benchmark capture still pending on the MLX host*
