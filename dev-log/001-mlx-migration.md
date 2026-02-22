# 001 — Ollama → MLX Migration

**Date:** 2026-02-22
**Phase:** Pre-scaffolding / Phase 1 prep
**Status:** Complete

## What changed

Replaced Ollama as the local inference backend with MLX + FastAPI across all documentation and created the inference server.

### Files modified
- **`CLAUDE.md`** — All Ollama refs → MLX + FastAPI. Updated: tech stack, project structure, TranslateGemma section, env vars (`MLX_INFERENCE_URL`, `MLX_MODEL`), commands, dev workflow, external API reference, important notes.
- **`lyrilearn-plan-v2.md`** — All Ollama refs → MLX. Updated: inference server section, architecture diagrams, integration flow, Phase 1 tasks, hosting, risks table, technical decisions log, references.

### Files created
- **`apps/inference/server.py`** — FastAPI server wrapping `mlx-lm`
  - `POST /translate` — `{text, target_lang}` → `{translation, latency_ms, model}`
  - `GET /health` — returns model status
  - Uses `asyncio.Lock` for GPU serialization
  - `asyncio.to_thread` keeps event loop responsive during inference
  - Model loads at startup via `@app.on_event("startup")`
- **`apps/inference/requirements.txt`** — `mlx-lm>=0.21.0`, `fastapi>=0.115.0`, `uvicorn>=0.34.0`
- **`scripts/setup-mlx.sh`** — One-command setup: validates Apple Silicon, creates venv, installs deps, downloads model, runs sanity check

### API contract (inference server)
```bash
# Translate
POST http://localhost:8000/translate
{"text": "Привет мир", "target_lang": "en"}
→ {"translation": "Hello world", "latency_ms": 342, "model": "translategemma-12b-4bit"}

# Health check
GET http://localhost:8000/health
→ {"status": "ok", "model": "translategemma-12b-4bit", "backend": "mlx"}
```

### Env vars (new)
```
MLX_INFERENCE_URL=http://localhost:8000
MLX_MODEL=translategemma-12b-4bit
MLX_MODEL_REPO=mlx-community/translategemma-12b-4bit  # optional override
MLX_MAX_TOKENS=512  # optional override
```

### Key design decisions
- **MLX over Ollama**: Zero-copy unified memory on Apple Silicon, direct Python control over inference params (critical for Phase 6 optimization experiments)
- **asyncio.Lock**: GPU inference is sequential; lock provides clean queueing instead of opaque timeouts
- **Optional `source_lang` param**: API contract specifies only `target_lang` (TranslateGemma auto-detects), but server accepts optional `source_lang` for future use

## Verification
- `grep -ri "ollama\|11434" .` returns zero matches across entire project
