#!/usr/bin/env bash
set -euo pipefail

# Launcher for Kimi Code CLI using the pre-built distribution.
# Usage:
#   ./scripts/kimi-prod.sh
#   ./scripts/kimi-prod.sh --yolo
#   ./scripts/kimi-prod.sh --continue
#
# If dist/main.mjs is missing, run `cd /app/apps/kimi-code && pnpm run build` first.

PROJECT_DIR="/workspace/cutternest-kit"
KIMI_CODE_DIR="/app/apps/kimi-code"
DIST_MAIN="${KIMI_CODE_DIR}/dist/main.mjs"

if [[ ! -f "${DIST_MAIN}" ]]; then
  echo "ERROR: ${DIST_MAIN} not found." >&2
  echo "Build first with: cd ${KIMI_CODE_DIR} && pnpm run build" >&2
  exit 1
fi

cd "${PROJECT_DIR}"
exec node "${DIST_MAIN}" "$@"
