#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f "config.json" ]; then
  echo "config.json is missing."
  echo "Create it first: cp config.example.json config.json"
  exit 1
fi

exec node server.js
