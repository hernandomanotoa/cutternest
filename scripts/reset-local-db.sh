#!/usr/bin/env bash
set -euo pipefail

# Reseteo local de la base de datos SQLite del MVP.
# Util para corregir inconsistencias (p. ej. TOTP cifrado con clave distinta)
# o empezar desde cero en desarrollo.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_FILE="${PROJECT_DIR}/data/cutternest.db"

usage() {
  echo "Uso: $0 [--yes]"
  echo ""
  echo "  --yes   Saltar confirmacion interactiva (cuidado: borra datos)"
  exit 1
}

CONFIRM=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      CONFIRM=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Opcion desconocida: $1"
      usage
      ;;
  esac
done

if [[ ! -f "${PROJECT_DIR}/docker-compose.yml" ]]; then
  echo "Error: no se encontro docker-compose.yml en ${PROJECT_DIR}"
  exit 1
fi

cd "${PROJECT_DIR}"

echo "CutterNest - Reset local de base de datos"
echo "Proyecto: ${PROJECT_DIR}"
echo "Archivo a borrar: ${DB_FILE}"
echo ""

if [[ "${CONFIRM}" != true ]]; then
  read -rp "Estas seguro? Esto borrara todos los usuarios, proyectos y datos locales. [s/N]: " respuesta
  if [[ ! "${respuesta}" =~ ^[Ss]$ ]]; then
    echo "Cancelado."
    exit 0
  fi
fi

echo "[1/3] Deteniendo contenedores..."
docker compose down

if [[ -f "${DB_FILE}" ]]; then
  echo "[2/3] Borrando ${DB_FILE}..."
  rm -f "${DB_FILE}"
else
  echo "[2/3] ${DB_FILE} no existe; se creara al iniciar el backend."
fi

echo "[3/3] Reconstruyendo y levantando stack..."
docker compose up -d --build

echo ""
echo "Reset completado. El backend inicializara la base de datos SQLite en el primer arranque."
echo "Registra un nuevo usuario en http://localhost:3000/register"
