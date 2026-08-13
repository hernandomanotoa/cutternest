#!/usr/bin/env bash
# Diagnostica el entorno Docker para CutterNest MVP
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "===================================="
echo "Docker Diagnostic - CutterNest MVP"
echo "===================================="

# 1. Docker daemon
if docker info >/dev/null 2>&1; then
  log_info "Docker daemon: OK"
  docker version --format '{{.Server.Version}}' | xargs -I{} echo "  Server version: {}"
else
  log_error "Docker daemon no responde. Verifica que Docker este corriendo."
  exit 1
fi

# 2. Docker Compose
if docker compose version >/dev/null 2>&1; then
  log_info "docker compose: OK"
  docker compose version --short | xargs -I{} echo "  Version: {}"
else
  log_error "docker compose no disponible."
fi

# 3. Imagenes base en cache
for img in python:3.11-slim node:20-alpine nginx:alpine; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    log_info "Imagen cacheada: $img"
  else
    log_warn "Imagen NO cacheada: $img (se intentara descargar)"
  fi
done

# 4. Conectividad a Docker Hub (sin proxy)
log_info "Probando conexion a Docker Hub..."
if docker pull hello-world >/dev/null 2>&1; then
  log_info "Docker Hub reachable: OK"
  docker rmi hello-world >/dev/null 2>&1 || true
else
  log_error "Docker Hub NO reachable. Posible causas: sin internet, proxy requerido, o DNS bloqueado."
fi

# 5. Conectividad a Debian repos desde contenedor temporal
log_info "Probando conexion a repositorios Debian (apt) desde contenedor..."
if docker run --rm python:3.11-slim bash -c "apt-get update -qq" >/dev/null 2>&1; then
  log_info "Repositorios Debian reachable: OK"
else
  log_error "Repositorios Debian NO reachable (apt-get update fallo). Verifica red/proxy."
fi

# 6. Conectividad a npm registry
log_info "Probando conexion a registry npm desde contenedor..."
if docker run --rm node:20-alpine sh -c "npm ping --registry https://registry.npmjs.org" >/dev/null 2>&1; then
  log_info "npm registry reachable: OK"
else
  log_error "npm registry NO reachable. Verifica red/proxy."
fi

# 7. Proxy Tor (si responde)
if command -v curl >/dev/null 2>&1; then
  log_info "Probando proxy Tor en 127.0.0.1:9150..."
  if curl -s --max-time 5 --socks5-hostname 127.0.0.1:9150 https://check.torproject.org/api/ip >/dev/null 2>&1; then
    log_info "Tor SOCKS5 reachable: OK"
  else
    log_warn "Tor SOCKS5 NO reachable en 127.0.0.1:9150"
  fi
  log_info "Probando proxy Tor en 172.31.0.1:9150..."
  if curl -s --max-time 5 --socks5-hostname 172.31.0.1:9150 https://check.torproject.org/api/ip >/dev/null 2>&1; then
    log_info "Tor SOCKS5 reachable en 172.31.0.1:9150: OK"
  else
    log_warn "Tor SOCKS5 NO reachable en 172.31.0.1:9150"
  fi
else
  log_warn "curl no disponible en host; salteando tests de proxy."
fi

# 8. Certificados
if [ -d "certs" ] && [ "$(ls -A certs/*.crt 2>/dev/null)" ]; then
  log_info "Certificados encontrados en ./certs/:"
  ls -1 certs/*.crt
else
  log_warn "No se encontraron certificados en ./certs/"
fi

echo ""
log_info "Diagnostico completado."
