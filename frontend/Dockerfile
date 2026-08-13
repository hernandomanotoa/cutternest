# Frontend React + Vite (node:24-alpine + corepack + pnpm)
FROM node:24-alpine AS builder

WORKDIR /app

# Certificados corporativos para el build (pnpm/fetch)
COPY certs /tmp/certs
RUN if [ -d /tmp/certs ] && [ "$(ls -A /tmp/certs/*.crt 2>/dev/null)" ]; then \
      mkdir -p /usr/local/share/ca-certificates \
      && cat /tmp/certs/*.crt >> /etc/ssl/cert.pem \
      && cp /tmp/certs/*.crt /usr/local/share/ca-certificates/; \
    fi \
    && apk add --no-cache ca-certificates \
    && update-ca-certificates \
    && rm -rf /tmp/certs

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# Activar pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Cachear dependencias
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --no-lockfile

# Copiar el resto del codigo y compilar
COPY frontend/ .
RUN pnpm test
RUN pnpm build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
