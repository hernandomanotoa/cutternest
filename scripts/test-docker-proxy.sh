#!/usr/bin/env bash
# Diagnostica la configuracion de proxy de Docker y conectividad a Docker Hub
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

echo "============================================"
echo "Docker Proxy & Registry Diagnostic"
echo "============================================"

# 1. Variables de entorno proxy
log_info "Variables de entorno proxy en el shell actual:"
for var in HTTP_PROXY http_proxy HTTPS_PROXY https_proxy ALL_PROXY NO_PROXY no_proxy; do
  if [ -n "${!var:-}" ]; then
    echo "  $var=${!var}"
  else
    echo "  $var=(no set)"
  fi
done

# 2. Configuracion de Docker daemon
log_info "Configuracion de Docker daemon:"
if [ -f "~/.docker/config.json" ]; then
  echo "  ~/.docker/config.json:"
  cat ~/.docker/config.json | sed 's/^/    /'
else
  log_warn "  ~/.docker/config.json no existe"
fi

if command -v systemctl >/dev/null 2>&1; then
  log_info "Variables de entorno del servicio docker (systemctl):"
  systemctl show docker --property=Environment 2>/dev/null || log_warn "  No se pudo obtener Environment del servicio docker"
fi

# 3. Docker info (puede mostrar proxy)
log_info "Docker info relevante:"
docker info 2>/dev/null | grep -i -E "proxy|registry|http|https" | sed 's/^/  /' || log_warn "  No se pudo obtener docker info"

# 4. Test directo a Docker Hub (sin proxy)
echo ""
log_info "Test 1: Docker Hub sin proxy (curl directo)"
if curl -sS --max-time 10 https://auth.docker.io/token >/dev/null 2>&1; then
  log_info "  Docker Hub reachable sin proxy: OK"
else
  log_error "  Docker Hub NO reachable sin proxy"
fi

# 5. Test a Docker Hub con HTTP_PROXY si esta seteado
if [ -n "${HTTP_PROXY:-}" ]; then
  echo ""
  log_info "Test 2: Docker Hub con HTTP_PROXY=$HTTP_PROXY"
  if curl -sS --max-time 10 -x "$HTTP_PROXY" https://auth.docker.io/token >/dev/null 2>&1; then
    log_info "  Docker Hub reachable con proxy: OK"
  else
    log_error "  Docker Hub NO reachable con proxy $HTTP_PROXY"
  fi
fi

# 6. Test proxy Tor SOCKS5
echo ""
log_info "Test 3: Proxy Tor SOCKS5"
for host in 127.0.0.1 172.31.0.1; do
  if curl -sS --max-time 5 --socks5-hostname "$host:9150" https://check.torproject.org/api/ip >/dev/null 2>&1; then
    log_info "  Tor SOCKS5 reachable en $host:9150: OK"
  else
    log_warn "  Tor SOCKS5 NO reachable en $host:9150"
  fi
done

# 7. Test docker pull sin proxy (usando NO_PROXY)
echo ""
log_info "Test 4: Docker pull con NO_PROXY para Docker Hub"
NO_PROXY="auth.docker.io,registry-1.docker.io,index.docker.io,docker.io,localhost,127.0.0.1,172.31.0.1" docker pull hello-world 2>&1 | sed 's/^/  /' || log_error "  docker pull fallo"
docker rmi hello-world >/dev/null 2>&1 || true

# 8. Test docker pull con proxy Tor no es posible para daemon
log_note "Nota: Docker daemon NO soporta SOCKS5. Necesita un proxy HTTP (ej. Privoxy) o acceso directo."

# 9. Recomendacion
echo ""
log_info "Recomendacion:"
log_note "Si Docker daemon usa un proxy HTTP no funcional (ej. 172.31.0.1:8118), configura NO_PROXY en el daemon:"
echo "  NO_PROXY=auth.docker.io,registry-1.docker.io,index.docker.io,docker.io,localhost,127.0.0.1,172.31.0.1"
log_note "O reconfigura el proxy del daemon a uno funcional (ej. Privoxy en http://172.31.0.1:8118)."
