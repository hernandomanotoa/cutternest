# Backend FastAPI + SQLite (sin apt-get, usa Tor via socks5h para pip en build)
FROM python:3.11-bookworm

# Proxy Tor SOLO en build para descargar dependencias pip
ARG HTTP_PROXY=socks5h://172.31.0.1:9150
ARG HTTPS_PROXY=socks5h://172.31.0.1:9150
ARG ALL_PROXY=socks5h://172.31.0.1:9150
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV ALL_PROXY=${ALL_PROXY}
ENV NO_PROXY=localhost,127.0.0.1

WORKDIR /app

# Certificados corporativos (opcional: copiados en build si existen)
COPY certs/ /tmp/certs/
COPY scripts/install-certs.sh /tmp/install-certs.sh
RUN bash /tmp/install-certs.sh

# Configurar certificados para herramientas Python (solo si se instalaron)
ENV SSL_CERT_FILE=${SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}
ENV REQUESTS_CA_BUNDLE=${REQUESTS_CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}
ENV CURL_CA_BUNDLE=${CURL_CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}

# Descargar e instalar PySocks localmente (via Tor) antes de activar proxy en pip
RUN curl -fsS --max-time 60 --socks5-hostname 172.31.0.1:9150 \
    -L -o /tmp/pysocks.tar.gz \
    https://files.pythonhosted.org/packages/source/P/PySocks/PySocks-1.7.1.tar.gz \
    && pip install --no-cache-dir /tmp/pysocks.tar.gz \
    && rm /tmp/pysocks.tar.gz

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Limpiar variables de proxy del runtime (el backend MVP no hace salidas HTTPS)
ENV HTTP_PROXY=""
ENV HTTPS_PROXY=""
ENV ALL_PROXY=""
ENV NO_PROXY="*"

COPY backend/app/ ./app/
COPY backend/tests/ ./tests/

# Ejecutar tests en build (fail-fast si fallan)
RUN pytest -q

RUN mkdir -p /app/data /app/data/exports /app/backups

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health').read()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
