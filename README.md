# CutterNest - Sistema de Optimización de Cortes

Sistema web autocontenido para optimizar cortes de tableros (MDF, madera, melamina) en fabricación de muebles. Incluye visualización 2D/3D, cotización local, inventario de sobrantes, autenticación TOTP + Guest PIN y generación de PDFs (cotización, cut list, etiquetas).

> **MVP**: todo corre dentro de Docker Compose sin dependencias de servicios externos (sin PostgreSQL, Redis, SMTP, SMS, WhatsApp, ni APIs de terceros).

---

## Requisitos

- Docker Engine
- Docker Compose (v1 o v2)
- (Opcional) Git

## Inicio rápido (MVP)

```bash
git clone <repo>
cd cutternest-kit
cp .env.example .env
# Editar .env si deseas cambiar JWT_SECRET_KEY (minimo 32 caracteres)
docker compose up --build
```

Accede a http://localhost:3000. El primer usuario registrado sera administrador.

> **Entorno de red:** `docker-compose.yml` usa una red bridge interna `cutternest-network`. No requiere crear red externa. El backend usa `socks5h://172.31.0.1:9150` solo durante el build para descargar dependencias pip via Tor; el runtime y el frontend no salen a internet.
>
> **Red externa:** ya no se usa `docker_sipe-net`. Todos los servicios se comunican por la red interna de Compose.
>
> **Certificados corporativos:** el build copia `ca-bundle.crt`, `pcentral-SRVVADPC-CA-1.crt` y `python-certifi.crt` de `./certs/` a las imagenes. El backend expone `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE` y `CURL_CA_BUNDLE` para que el runtime confie en ellos.
>
> **Catch-22 de PySocks:** `pip` necesita `PySocks` para usar el proxy SOCKS5, pero no puede descargarlo usando el proxy. El backend Dockerfile rompe el circulo descargando `PySocks-1.7.1.tar.gz` con `curl --socks5-hostname` e instalandolo localmente, antes de activar `HTTP_PROXY` para el resto de dependencias.

---

## Estructura del proyecto

```
cutternest-kit/
├── docker-compose.yml            # MVP (SQLite, todo local)
├── docker-compose.fase2.yml      # PostgreSQL + Redis + backups
├── docker-compose.fase4.yml      # WhatsApp (Baileys) + SMS gateway
├── .env.example                  # Variables de entorno por fase
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/                      # FastAPI + SQLAlchemy
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models.py
│       ├── schemas.py
│       ├── security.py
│       ├── dependencies.py
│       ├── auth.py
│       ├── optimizer.py
│       ├── inventory.py
│       ├── templates.py
│       ├── projects.py
│       ├── quotes.py
│       ├── assembly.py
│       ├── svg_generator.py
│       ├── pdf_generator.py
│       └── routers/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/                      # React 18 + Vite + Three.js
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/client.ts
│       ├── hooks/useAuth.ts
│       ├── types/index.ts
│       └── components/
├── data/                         # SQLite + PDFs/SVGs exportados
└── backups/
```

---

## Fases de implementación

### Fase MVP (SQLite, todo local)

```bash
docker compose up --build
```

### Fase 2 (PostgreSQL + Redis + backups)

```bash
cp .env.example .env
# Editar: POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET_KEY
docker compose -f docker-compose.yml -f docker-compose.fase2.yml up --build
```

Backups automáticos en `./backups/` cada 24h (retención 7 días).

### Fase 4 (WhatsApp + SMS + notificaciones)

```bash
# Configurar WHATSAPP_API_KEY en .env
docker compose -f docker-compose.yml -f docker-compose.fase2.yml -f docker-compose.fase4.yml up --build

# Vincular WhatsApp (escanear QR desde logs):
docker logs -f cutternest-whatsapp
```

---

## Endpoints principales (API)

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify`
- `POST /api/v1/auth/guest/pin`
- `POST /api/v1/auth/guest/login`
- `POST /api/v1/optimize`
- `GET/POST /api/v1/inventory`
- `GET /api/v1/inventory/offcuts`
- `GET /api/v1/templates`
- `POST /api/v1/templates/{id}/generate`
- `GET/POST /api/v1/projects`
- `POST /api/v1/projects/{id}/optimize`
- `POST /api/v1/projects/{id}/quote`
- `POST /api/v1/projects/{id}/cutlist`
- `POST /api/v1/projects/{id}/labels`
- `GET /api/v1/projects/{id}/assembly`

---

## Tests

Backend:

```bash
./scripts/test-backend.sh
```

Frontend:

```bash
./scripts/test-frontend.sh
```

Diagnostico completo (Docker, backend, frontend):

```bash
./scripts/diagnose.sh
```

## Notas de construccion

- **Imagenes base:** usamos `python:3.11-bookworm` y `node:24-bookworm` (no `slim`/`alpine`) para evitar depender de `apt-get`/`apk` durante el build, ya que esos gestores de paquetes no soportan SOCKS5.
- **Gestor de paquetes frontend:** el frontend usa **pnpm** instalado globalmente via `npm`.
- **Proxy de salida:** el build usa `HTTP_PROXY=socks5h://172.31.0.1:9150`. Asegurate de que Tor escuche en esa direccion y puerto. Si usas un proxy o red diferente, edita `.env` y los Dockerfiles.
- **Certificados corporativos:** coloca `ca-bundle.crt`, `pcentral-SRVVADPC-CA-1.crt` y `python-certifi.crt` en `./certs/` para que se instalen en las imagenes.
- **PySocks:** el backend descarga `PySocks-1.7.1.tar.gz` via `curl --socks5-hostname` antes de activar el proxy de `pip`, para romper la dependencia circular.

---

## Notas de seguridad

- `JWT_SECRET_KEY` debe tener al menos 32 caracteres y estar solo en `.env`.
- El secreto TOTP se cifra con Fernet derivado del `JWT_SECRET_KEY`.
- El PIN temporal solo se muestra en pantalla del usuario principal; nunca se envia por email, SMS ni WhatsApp.
- Los refresh tokens se almacenan hasheados con bcrypt.

---

## Stack tecnológico

- **Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic, SQLite, rectpack, ReportLab, pyotp.
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Three.js, @react-three/fiber, zustand.
- **Infraestructura**: Docker Compose, nginx.
