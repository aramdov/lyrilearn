# Idea: Parallelize TranslateGemma Inference

> Captured: 2026-02-28 — Pre-Phase 3

## Problem

Lyrics translation is IID (independent and identically distributed) — each line can be translated independently. But the current MLX inference server serializes all requests behind a single `asyncio.Lock()`, so concurrent translation requests queue up sequentially on the GPU.

For a song with 40 lines, that's 40 sequential inference passes.

## Current Bottleneck

```
apps/inference/server.py:
  _inference_lock = asyncio.Lock()   ← one request at a time
```

## Options

### 1. Batched Inference (best bang for buck)

Collect N lines into a single batched forward pass at the MLX level. `mlx-lm` supports batch generation.

- Modify FastAPI server to accept `POST /translate-batch` with `{ lines: string[], target_lang, model? }`
- Internally, batch-generate all lines in one GPU pass
- Returns array of translations
- **Pros:** Single GPU pass for 5-10 lines, minimal VRAM overhead, biggest speedup
- **Cons:** Slightly more complex server code, need to handle variable-length outputs

### 2. Multiple Server Instances

Run 2+ FastAPI servers on different ports, load-balance from the backend.

- 12B 4-bit model is ~6-7GB VRAM — second instance may be tight depending on M4 config
- Could run one 12B + one 4B instance instead
- **Pros:** Simple, no server code changes
- **Cons:** VRAM constrained, model loading time, memory overhead

### 3. Pipeline Parallelism

Overlap tokenization/detokenization of one request with generation of another.

- More complex to implement
- Marginal gains compared to batching
- **Pros:** Better GPU utilization
- **Cons:** Complex, diminishing returns

## Recommendation

**Start with batched inference (Option 1).** It's the most practical for Apple Silicon:
- One GPU pass over 5-10 lines instead of 5-10 sequential passes
- No extra VRAM needed
- Backend already knows all lines upfront (from `useSongView.translateLines()`)

## Backend Integration

The backend's `translateLines()` in `useSongView.ts` already batches lines into groups of 5 (concurrency limit). Instead of 5 parallel HTTP calls to `/translate`, send one call to `/translate-batch` with 5-10 lines.

## When to Implement

Phase 3 or Phase 5 (optimization/polish). Not blocking — current sequential approach works, just slower for first-time translations of a song.
