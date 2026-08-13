#!/usr/bin/env bash
# Instala dependencias frontend y ejecuta tests/build con pnpm
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

if ! command -v pnpm >/dev/null 2>&1; then
  log_info "pnpm no encontrado. Instalando via corepack..."
  corepack enable
  corepack prepare pnpm@10.33.0 --activate
fi

cd frontend

log_info "Instalando dependencias frontend con pnpm..."
pnpm install

log_info "Ejecutando tests frontend..."
pnpm test

log_info "Ejecutando build frontend..."
pnpm build

log_info "Tests/build frontend completados."
