"""
MLX inference server for TranslateGemma.

Wraps mlx-lm in a FastAPI service that the Hono backend calls
for local translations. Supports both 4B and 27B model variants.

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
    "translategemma-4b-4bit": os.environ.get(
        "MLX_MODEL_REPO_4B",
        "mlx-community/translategemma-4b-it-4bit",
    ),
    "translategemma-27b-4bit": os.environ.get(
        "MLX_MODEL_REPO_27B",
        "mlx-community/translategemma-27b-it-4bit",
    ),
}

DEFAULT_MODEL = os.environ.get("MLX_MODEL", "translategemma-4b-4bit")
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
    editorialized: bool = False


# ─── Batch schemas ────────────────────────────────────────────────────────────


class BatchTranslateRequest(BaseModel):
    texts: list[str]
    target_lang: str
    source_lang: Optional[str] = None
    model: Optional[str] = None
    max_batch_size: Optional[int] = None  # client hint; capped at server MAX


class BatchTranslateItem(BaseModel):
    translation: str
    latency_ms: float
    editorialized: bool = False
    error: Optional[str] = None


class BatchTranslateResponse(BaseModel):
    items: list[BatchTranslateItem]
    total_latency_ms: float
    model: str


MAX_BATCH_SIZE = 20


class HealthResponse(BaseModel):
    status: str
    default_model: str
    loaded_models: list[str]
    available_models: list[str]
    backend: str


# ---------------------------------------------------------------------------
# Prompt formatting
# ---------------------------------------------------------------------------


def _format_prompt(tokenizer, text: str, source_lang: str, target_lang: str) -> str:
    """
    TranslateGemma instruction-tuned models use a chat template with
    a special content format: source_lang_code, target_lang_code, and text.
    """
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "source_lang_code": source_lang,
                    "target_lang_code": target_lang,
                    "text": text,
                }
            ],
        }
    ]
    return tokenizer.apply_chat_template(
        messages, add_generation_prompt=True, tokenize=False
    )


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
    source_lang = req.source_lang or "auto"
    prompt = _format_prompt(tokenizer, req.text, source_lang, req.target_lang)

    async with _inference_lock:
        start = time.perf_counter()
        translation = await asyncio.to_thread(
            _run_inference, model, tokenizer, prompt
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

    # Strip trailing EOS/turn tokens that the model may emit
    clean = _clean_output(translation)
    editorialized = _is_editorialized(req.text, clean)

    return TranslateResponse(
        translation=clean,
        latency_ms=round(elapsed_ms, 1),
        model=model_name,
        editorialized=editorialized,
    )


@app.post("/translate_batch", response_model=BatchTranslateResponse)
async def translate_batch(req: BatchTranslateRequest):
    effective_limit = min(
        req.max_batch_size or MAX_BATCH_SIZE,
        MAX_BATCH_SIZE,
    )
    texts = req.texts[:effective_limit]

    model_name = req.model or DEFAULT_MODEL
    if model_name not in MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {model_name}. Available: {list(MODELS.keys())}",
        )

    if model_name not in _loaded_models:
        try:
            _load_model(model_name)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to load model: {e}")

    model, tokenizer = _loaded_models[model_name]
    source_lang = req.source_lang or "auto"
    total_start = time.perf_counter()
    non_empty_indices = [i for i, text in enumerate(texts) if text.strip()]
    prompts = [
        _format_prompt(tokenizer, texts[i], source_lang, req.target_lang)
        for i in non_empty_indices
    ]

    raw_outputs: list[str] = []
    batch_error: Optional[str] = None
    batch_elapsed_ms = 0.0

    if prompts:
        async with _inference_lock:
            start = time.perf_counter()
            try:
                raw_outputs = await asyncio.to_thread(
                    _run_batch_inference, model, tokenizer, prompts
                )
            except Exception as e:
                batch_error = str(e)
            finally:
                batch_elapsed_ms = (time.perf_counter() - start) * 1000

        if batch_error is None and len(raw_outputs) != len(non_empty_indices):
            batch_error = (
                f"Batch inference returned {len(raw_outputs)} outputs "
                f"for {len(non_empty_indices)} prompts"
            )

    per_item_latency_ms = (
        round(batch_elapsed_ms / len(non_empty_indices), 1)
        if non_empty_indices
        else 0.0
    )
    output_by_index = {
        index: raw_outputs[pos] for pos, index in enumerate(non_empty_indices)
    }

    items: list[BatchTranslateItem] = []
    for i, text in enumerate(texts):
        if not text.strip():
            items.append(BatchTranslateItem(translation="", latency_ms=0))
            continue

        if batch_error is not None:
            items.append(
                BatchTranslateItem(
                    translation="",
                    latency_ms=per_item_latency_ms,
                    error=batch_error,
                )
            )
            continue

        clean = _clean_output(output_by_index[i])
        editorialized = _is_editorialized(text, clean)
        items.append(
            BatchTranslateItem(
                translation=clean,
                latency_ms=per_item_latency_ms,
                editorialized=editorialized,
            )
        )

    total_ms = (time.perf_counter() - total_start) * 1000
    return BatchTranslateResponse(
        items=items,
        total_latency_ms=round(total_ms, 1),
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


def _run_batch_inference(model, tokenizer, prompts: list[str]) -> list[str]:
    """Run true batch generation when mlx-lm supports list prompts.

    Older mlx-lm builds may reject list prompts. In that case, fall back to
    sequential generation so the endpoint remains correct on older installs.
    """
    if not prompts:
        return []

    if len(prompts) == 1:
        return [_run_inference(model, tokenizer, prompts[0])]

    from mlx_lm import generate

    try:
        results = generate(
            model=model,
            tokenizer=tokenizer,
            prompt=prompts,
            max_tokens=MAX_TOKENS,
        )
    except TypeError:
        return [_run_inference(model, tokenizer, prompt) for prompt in prompts]

    if isinstance(results, list):
        return results

    return [_run_inference(model, tokenizer, prompt) for prompt in prompts]


def _clean_output(text: str) -> str:
    """Remove trailing special tokens and whitespace from model output."""
    # TranslateGemma may emit <end_of_turn> tokens after the translation
    idx = text.find("<end_of_turn>")
    if idx != -1:
        text = text[:idx]
    return text.strip()


# Phrases that indicate the model is editorializing instead of translating
_EDITORIAL_MARKERS = [
    "note:",
    "that's an",
    "this is an",
    "this phrase",
    "literal translation",
    "the focus is on",
    "due to the",
    "this expression",
    "it's best translated",
    "a direct,",
    "offensive",
]


def _is_editorialized(source: str, output: str) -> bool:
    """Detect when TranslateGemma editorializes instead of translating directly.

    Heuristics:
    - Output is much longer than source (>3x character length for short inputs)
    - Output contains known editorial markers
    """
    output_lower = output.lower()

    # Check for editorial markers
    if any(marker in output_lower for marker in _EDITORIAL_MARKERS):
        return True

    # Output suspiciously long relative to input (translations are roughly similar length)
    # Only flag for short-to-medium inputs where editorializing is obvious
    if len(source) < 100 and len(output) > len(source) * 4:
        return True

    return False
