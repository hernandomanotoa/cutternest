#!/usr/bin/env bash
set -euo pipefail

# Launcher for Kimi Code CLI in development mode.
# Usage:
#   ./scripts/kimi.sh
#   ./scripts/kimi.sh --yolo
#   ./scripts/kimi.sh --continue
#   ./scripts/kimi.sh --prompt "Guardian, cargá L0-L3 y decime el estado del swarm"

PROJECT_DIR="/workspace/cutternest-kit"
KIMI_CODE_DIR="/app/apps/kimi-code"
TSX_BIN="${KIMI_CODE_DIR}/node_modules/.bin/tsx"
RAW_TEXT_LOADER="/app/build/register-raw-text-loader.mjs"
MAIN_TS="${KIMI_CODE_DIR}/src/main.ts"

# Ensure we run from the project directory so the Guardian CWD check passes.
cd "${PROJECT_DIR}"

exec "${TSX_BIN}" --tsconfig "${KIMI_CODE_DIR}/tsconfig.dev.json" --import "${RAW_TEXT_LOADER}" "${MAIN_TS}" "$@"
