#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$ROOT_DIR/run-app.sh"

if [[ ! -x "$LAUNCHER" ]]; then
  echo "Launcher script not found or not executable:"
  echo "  $LAUNCHER"
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

"$LAUNCHER"
status=$?

if [[ $status -ne 0 && $status -ne 130 ]]; then
  echo
  echo "Application exited with status $status."
  read -r -p "Press Enter to close..."
fi

exit $status
