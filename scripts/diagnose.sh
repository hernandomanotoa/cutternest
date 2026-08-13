#!/usr/bin/env bash
# Diagnostico completo de CutterNest MVP
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

log_info "Iniciando diagnostico completo..."

echo ""
log_info "1/3 Docker"
./scripts/test-docker.sh || true

echo ""
log_info "2/3 Backend (requiere python3 + pip)"
if command -v python3 >/dev/null 2>&1 && command -v pip >/dev/null 2>&1; then
  ./scripts/test-backend.sh || true
else
  log_warn "python3/pip no disponibles; salteando tests backend."
fi

echo ""
log_info "3/3 Frontend (requiere node + pnpm)"
if command -v node >/dev/null 2>&1; then
  ./scripts/test-frontend.sh || true
else
  log_warn "node no disponible; salteando tests frontend."
fi

echo ""
log_info "Diagnostico completo finalizado."
