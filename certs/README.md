# Certificados corporativos / CA

Coloca aquí los certificados CA necesarios para TLS interceptado en tu organización.

Los archivos `*.crt` son ignorados por Git por seguridad. Para el build de Docker,
el script `scripts/install-certs.sh` los copia al almacén de certificados del
contenedor **solo si existen**; si no, el build continúa sin error.

Ejemplo de archivos esperados:
- `ca-bundle.crt`
- `python-certifi.crt`
- `pcentral-SRVVADPC-CA-1.crt` (u otro CA interno)

**No versiones claves privadas (`.pem`, `.key`) ni certificados personales.**
