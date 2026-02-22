"""
MLX inference server for TranslateGemma.

Wraps mlx-lm in a FastAPI service that the Hono backend calls
for local translations. Supports both 12B and 4B model variants.

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8000
"""

import asyncio
import os
import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODELS = {
    "translategemma-12b-4bit": os.environ.get(
        "MLX_MODEL_REPO_12B",
        "mlx-community/translategemma-12b-4bit",
    ),
    "translategemma-4b-4bit": os.environ.get(
        "MLX_MODEL_REPO_4B",
        "mlx-community/translategemma-4b-4bit",
    ),
}

DEFAULT_MODEL = os.environ.get("MLX_MODEL", "translategemma-12b-4bit")
MAX_TOKENS = int(os.environ.get("MLX_MAX_TOKENS", "512"))

# ---------------------------------------------------------------------------
# App + state
# ---------------------------------------------------------------------------

app = FastAPI(title="LyriLearn MLX Inference Server")

# Serialize inference requests — GPU can only run one forward pass at a time.
_inference_lock = asyncio.Lock()

# Cache of loaded models: model_name -> (model, tokenizer)
_loaded_models: dict[str, tuple] = {}


def _load_model(model_name: str):
    """Load an MLX model and cache it. Returns (model, tokenizer)."""
    if model_name in _loaded_models:
        return _loaded_models[model_name]

    repo = MODELS.get(model_name)
    if not repo:
        raise ValueError(f"Unknown model: {model_name}. Available: {list(MODELS.keys())}")

    from mlx_lm import load

    print(f"Loading model: {model_name} from {repo}...")
    model, tokenizer = load(repo)
    _loaded_models[model_name] = (model, tokenizer)
    print(f"Model {model_name} loaded successfully.")
    return model, tokenizer


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class TranslateRequest(BaseModel):
    text: str
    target_lang: str  # e.g. "en", "ru", "es", "hy"
    source_lang: Optional[str] = None
    model: Optional[str] = None  # e.g. "translategemma-4b-4bit"; defaults to DEFAULT_MODEL


class TranslateResponse(BaseModel):
    translation: str
    latency_ms: float
    model: str


class HealthResponse(BaseModel):
    status: str
    default_model: str
    loaded_models: list[str]
    available_models: list[str]
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
    """Pre-load the default model so the first request isn't slow."""
    _load_model(DEFAULT_MODEL)


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok" if _loaded_models else "no_models_loaded",
        default_model=DEFAULT_MODEL,
        loaded_models=list(_loaded_models.keys()),
        available_models=list(MODELS.keys()),
        backend="mlx",
    )


@app.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    model_name = req.model or DEFAULT_MODEL
    if model_name not in MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {model_name}. Available: {list(MODELS.keys())}",
        )

    # Load model if not already cached (lazy loading for non-default models)
    if model_name not in _loaded_models:
        try:
            _load_model(model_name)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to load model: {e}")

    model, tokenizer = _loaded_models[model_name]
    prompt = _format_prompt(req.text, req.target_lang)

    async with _inference_lock:
        start = time.perf_counter()
        translation = await asyncio.to_thread(
            _run_inference, model, tokenizer, prompt
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

    return TranslateResponse(
        translation=translation.strip(),
        latency_ms=round(elapsed_ms, 1),
        model=model_name,
    )


def _run_inference(model, tokenizer, prompt: str) -> str:
    """Run mlx-lm generate synchronously (called in a thread)."""
    from mlx_lm import generate

    return generate(
        model=model,
        tokenizer=tokenizer,
        prompt=prompt,
        max_tokens=MAX_TOKENS,
    )
