#!/usr/bin/env bash
# Testea formas de instalar PySocks / pip a traves de Tor
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_note() { echo -e "${BLUE}[NOTE]${NC} $1"; }

TOR_HOST="${TOR_HOST:-172.31.0.1}"
TOR_PORT="${TOR_PORT:-9150}"
SOCKS5="socks5h://${TOR_HOST}:${TOR_PORT}"

echo "============================================"
echo "PySocks / pip via Tor Diagnostic"
echo "============================================"
log_info "Tor proxy: $SOCKS5"

# Test 1: pip install pysocks sin proxy (internet directo)
echo ""
log_info "Test 1: pip install pysocks sin proxy"
if HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= NO_PROXY=* python3 -m pip install --no-cache-dir --target /tmp/pip-test-no-proxy pysocks >/tmp/pip-no-proxy.log 2>&1; then
  log_info "  OK: pip sin proxy funciona (internet directo)"
else
  log_error "  FAIL: pip sin proxy no funciona"
  echo "  --- log ---"
  tail -20 /tmp/pip-no-proxy.log | sed 's/^/    /'
fi

# Test 2: curl --socks5-hostname a pypi
PYTAR_URL="https://files.pythonhosted.org/packages/source/P/PySocks/PySocks-1.7.1.tar.gz"
echo ""
log_info "Test 2: curl --socks5-hostname a PyPI (source tarball)"
if curl -fsS --max-time 30 --socks5-hostname "${TOR_HOST}:${TOR_PORT}" -L -o /tmp/pysocks.tar.gz "$PYTAR_URL" >/tmp/curl-pysocks.log 2>&1; then
  log_info "  OK: curl descargo pysocks via Tor"
  ls -lh /tmp/pysocks.tar.gz
  if command -v python3 >/dev/null 2>&1 && python3 -m pip --version >/dev/null 2>&1; then
    if python3 -m pip install --no-cache-dir --target /tmp/pip-test-curl /tmp/pysocks.tar.gz >/tmp/pip-install-curl.log 2>&1; then
      log_info "  OK: pysocks instalado desde tarball descargado"
    else
      log_error "  FAIL: no se pudo instalar pysocks desde tarball"
      tail -10 /tmp/pip-install-curl.log | sed 's/^/    /'
    fi
  else
    log_warn "  pip no disponible en host; no se pudo probar instalacion local"
  fi
else
  log_error "  FAIL: curl no pudo descargar pysocks via Tor"
  tail -20 /tmp/curl-pysocks.log | sed 's/^/    /'
fi

# Test 3: pip install con proxy socks5h (si pysocks ya esta instalado)
echo ""
log_info "Test 3: pip install con proxy socks5h (requiere pysocks pre-instalado)"
if python3 -m pip install --no-cache-dir --target /tmp/pip-test-proxy PySocks 2>/dev/null; then
  log_info "  pysocks disponible en el host; continuando..."
  if HTTP_PROXY="$SOCKS5" HTTPS_PROXY="$SOCKS5" ALL_PROXY="$SOCKS5" python3 -m pip install --no-cache-dir --target /tmp/pip-test-with-socks pysocks >/tmp/pip-with-socks.log 2>&1; then
    log_info "  OK: pip con proxy socks5h funciona"
  else
    log_error "  FAIL: pip con proxy socks5h no funciona"
    tail -20 /tmp/pip-with-socks.log | sed 's/^/    /'
  fi
else
  log_warn "  pysocks no esta instalado en el host; salteando test 3"
fi

# Test 4: pip install requirements completos a traves de Tor (ideal)
echo ""
log_info "Test 4: pip install -r backend/requirements.txt via Tor (requiere pysocks)"
if python3 -m pip install --no-cache-dir --target /tmp/pip-test-backend pysocks 2>/dev/null; then
  if HTTP_PROXY="$SOCKS5" HTTPS_PROXY="$SOCKS5" ALL_PROXY="$SOCKS5" python3 -m pip install --no-cache-dir --target /tmp/pip-test-backend-req -r backend/requirements.txt >/tmp/pip-req.log 2>&1; then
    log_info "  OK: requirements.txt instalados via Tor"
  else
    log_error "  FAIL: requirements.txt no se instalaron via Tor"
    tail -30 /tmp/pip-req.log | sed 's/^/    /'
  fi
else
  log_warn "  pysocks no esta instalado; salteando test 4"
fi

echo ""
log_info "Diagnostico completado."
log_note "Si el Test 2 funciona, podemos cambiar el Dockerfile para descargar pysocks con curl via Tor."
log_note "Si el Test 1 funciona, podemos instalar pysocks sin proxy y luego activar el proxy."
