#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="$ROOT_DIR/.venv/bin/python"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "Virtual environment not found: $VENV_PYTHON"
  echo "Create it first with:"
  echo "  python3 -m venv .venv"
  echo "  .venv/bin/pip install -r requirements.txt"
  exit 1
fi

cd "$ROOT_DIR"
"$VENV_PYTHON" manage.py migrate
exec "$VENV_PYTHON" manage.py runserver 127.0.0.1:8000
