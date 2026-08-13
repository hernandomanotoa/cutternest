#!/bin/bash
set -e

CERT_DIR=/usr/local/share/ca-certificates
mkdir -p "$CERT_DIR"

if ls /tmp/certs/*.crt >/dev/null 2>&1; then
    echo "Instalando certificados corporativos..."
    cp /tmp/certs/*.crt "$CERT_DIR/"
    update-ca-certificates
else
    echo "No se encontraron certificados .crt en /tmp/certs; omitiendo update-ca-certificates."
fi
