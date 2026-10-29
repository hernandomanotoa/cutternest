#!/usr/bin/env bash
# backup-audit-log.sh
# Creates a timestamped backup of .agents/guardian/audit.log and keeps the last 20 copies.
# Usage: .agents/guardian/scripts/backup-audit-log.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUDIT_LOG="${ROOT}/.agents/guardian/audit.log"
BACKUP_DIR="${ROOT}/.agents/guardian/memory/audit-backups"

mkdir -p "${BACKUP_DIR}"

if [[ ! -f "${AUDIT_LOG}" ]]; then
  echo "[backup-audit-log] audit.log does not exist; nothing to back up."
  exit 0
fi

TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/audit.log.${TIMESTAMP}.bak"

cp "${AUDIT_LOG}" "${BACKUP_FILE}"

# Keep only the last 20 backups (oldest first)
ls -1t "${BACKUP_DIR}"/audit.log.*.bak 2>/dev/null | tail -n +21 | xargs -r rm -f

BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/audit.log.*.bak 2>/dev/null | wc -l)
echo "[backup-audit-log] Backed up audit.log to ${BACKUP_FILE} (${BACKUP_COUNT} backups kept)."
