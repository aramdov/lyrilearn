"""
MLX inference server for TranslateGemma.

Wraps mlx-lm in a FastAPI service that the Hono backend calls
for local translations. Runs on port 8000 by default.

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8000
"""

import asyncio
import os
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODEL_NAME = os.environ.get("MLX_MODEL", "translategemma-12b-4bit")

# Model repo on HuggingFace (mlx-community pre-converted weights preferred)
MODEL_REPO = os.environ.get(
    "MLX_MODEL_REPO",
    "mlx-community/translategemma-12b-4bit",
)

MAX_TOKENS = int(os.environ.get("MLX_MAX_TOKENS", "512"))

# ---------------------------------------------------------------------------
# App + state
# ---------------------------------------------------------------------------

app = FastAPI(title="LyriLearn MLX Inference Server")

# Serialize inference requests — GPU can only run one forward pass at a time.
_inference_lock = asyncio.Lock()

# Lazy-loaded model and tokenizer (populated on first request or startup)
_model = None
_tokenizer = None


def _load_model():
    """Load the MLX model and tokenizer. Called once on first use."""
    global _model, _tokenizer

    from mlx_lm import load

    _model, _tokenizer = load(MODEL_REPO)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class TranslateRequest(BaseModel):
    text: str
    target_lang: str  # e.g. "en", "ru", "es", "hy"
    source_lang: str | None = None  # optional; TranslateGemma auto-detects if omitted


class TranslateResponse(BaseModel):
    translation: str
    latency_ms: float
    model: str


class HealthResponse(BaseModel):
    status: str
    model: str
    backend: str


# ---------------------------------------------------------------------------
# Prompt formatting
# ---------------------------------------------------------------------------


def _format_prompt(text: str, target_lang: str) -> str:
    """
    TranslateGemma expects: <2{target_lang}> {source_text}
    e.g. <2en> Привет мир → Hello world
    """
    return f"<2{target_lang}> {text}"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def startup():
    """Pre-load the model so the first request isn't slow."""
    _load_model()


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok" if _model is not None else "model_not_loaded",
        model=MODEL_NAME,
        backend="mlx",
    )


@app.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    if _model is None or _tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    prompt = _format_prompt(req.text, req.target_lang)

    async with _inference_lock:
        start = time.perf_counter()
        translation = await asyncio.to_thread(
            _run_inference, prompt
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

    return TranslateResponse(
        translation=translation.strip(),
        latency_ms=round(elapsed_ms, 1),
        model=MODEL_NAME,
    )


def _run_inference(prompt: str) -> str:
    """Run mlx-lm generate synchronously (called in a thread)."""
    from mlx_lm import generate

    return generate(
        model=_model,
        tokenizer=_tokenizer,
        prompt=prompt,
        max_tokens=MAX_TOKENS,
    )
