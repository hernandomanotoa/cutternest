#!/usr/bin/env bash
# Rebuild de la pila Docker sin conflictos de nombres de contenedor.
# Uso: ./scripts/rebuild.sh            (reconstruye imágenes y levanta)
#       ./scripts/rebuild.sh --no-cache
set -euo pipefail
cd "$(dirname "$0")/.."

CACHE="--build"
if [[ "${1:-}" == "--no-cache" ]]; then CACHE="--no-cache --build"; fi

# Quitar contenedores previos (compose los recreará sin conflicto)
docker rm -f cutternest-backend cutternest-frontend 2>/dev/null || true

docker compose up -d $CACHE

echo "Esperando health checks..."
for i in $(seq 1 30); do
  if curl -fsS http://localhost:8000/api/v1/health >/dev/null 2>&1; then
    echo "Backend OK → http://localhost:3000"
    exit 0
  fi
  sleep 2
done
echo "Aviso: el backend no respondió tras 60 s; revisa: docker logs cutternest-backend"
exit 1
