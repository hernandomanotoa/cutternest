#!/usr/bin/env bash
# Instala dependencias backend y ejecuta tests pytest
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

log_info "Activando entorno virtual backend..."
if [ ! -d "backend/.venv" ]; then
  python3 -m venv backend/.venv
fi
source backend/.venv/bin/activate

log_info "Instalando dependencias backend..."
pip install -r backend/requirements.txt

log_info "Ejecutando pytest..."
cd backend
pytest -v

log_info "Tests backend completados."
