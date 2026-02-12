#!/usr/bin/env bash
# setup-mlx.sh — Install MLX dependencies and download TranslateGemma model
#
# Usage:
#   bash scripts/setup-mlx.sh
#
# Prerequisites:
#   - macOS with Apple Silicon (M1/M2/M3/M4)
#   - Python 3.10+ installed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INFERENCE_DIR="$PROJECT_ROOT/apps/inference"

MODEL_REPO="${MLX_MODEL_REPO:-mlx-community/translategemma-12b-4bit}"

echo "=== LyriLearn MLX Setup ==="
echo ""

# -------------------------------------------------------------------
# 1. Check platform
# -------------------------------------------------------------------
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "ERROR: MLX requires macOS with Apple Silicon."
    exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
    echo "WARNING: MLX is optimized for Apple Silicon (arm64). Detected: $ARCH"
    echo "         Performance may be degraded on Intel Macs."
fi

# -------------------------------------------------------------------
# 2. Create virtual environment
# -------------------------------------------------------------------
VENV_DIR="$INFERENCE_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python virtual environment at $VENV_DIR ..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
echo "Using Python: $(python3 --version) at $(which python3)"

# -------------------------------------------------------------------
# 3. Install dependencies
# -------------------------------------------------------------------
echo ""
echo "Installing dependencies from requirements.txt ..."
pip install --upgrade pip --quiet
pip install -r "$INFERENCE_DIR/requirements.txt" --quiet

# -------------------------------------------------------------------
# 4. Download model weights
# -------------------------------------------------------------------
echo ""
echo "Downloading model: $MODEL_REPO"
echo "(This may take a while on first run — ~6-8 GB for 12B 4-bit)"
echo ""
python3 -c "
from mlx_lm import load
print('Loading model to trigger download...')
model, tokenizer = load('$MODEL_REPO')
print('Model loaded successfully!')

# Quick sanity check
from mlx_lm import generate
result = generate(model=model, tokenizer=tokenizer, prompt='<2en> Привет', max_tokens=32)
print(f'Sanity check: \"Привет\" → \"{result.strip()}\"')
"

# -------------------------------------------------------------------
# 5. Done
# -------------------------------------------------------------------
echo ""
echo "=== Setup complete! ==="
echo ""
echo "To start the inference server:"
echo "  cd $INFERENCE_DIR"
echo "  source .venv/bin/activate"
echo "  uvicorn server:app --host 0.0.0.0 --port 8000"
echo ""
echo "To verify it's running:"
echo "  curl http://localhost:8000/health"
