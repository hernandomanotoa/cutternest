# Convenciones de despliegue — CutterNest

Stack: Docker Compose + nginx (frontend) + Uvicorn (backend).

## Imágenes

- Backend: `python:3.11-slim` (ver `backend/Dockerfile`).
- Frontend: `node:18-alpine` para build + `nginx:alpine` para servir (ver `frontend/Dockerfile`).
- WhatsApp gateway (Fase 4): `node:18-alpine` con Baileys (ver `whatsapp-gateway/Dockerfile`).

## Compose files separados

- **MVP**: `docker-compose.yml` — backend Python + frontend nginx + volumen `./data`.
- **Fase 2**: `docker-compose.fase2.yml` — PostgreSQL 15 + Redis 7 + contenedor `backup` diario.
- **Fase 4**: `docker-compose.fase4.yml` — WhatsApp gateway (Baileys) + SMS gateway opcional.
- El backend en MVP solo depende del volumen `./data`. No requiere PostgreSQL, Redis ni WhatsApp.
- Las variables sensibles (`JWT_SECRET_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `WHATSAPP_API_KEY`) se leen desde `.env`.

## Certificados y datos persistentes

- Datos persistentes en `./data/` (SQLite, layouts, PDFs, exports).
- Backups en `./backups/` en Fase 2.
- Nunca modificar puertos de servicios core sin aprobación.

## Comandos de arranque

```bash
# MVP
docker compose up -d --build

# Fase 2
docker compose -f docker-compose.yml -f docker-compose.fase2.yml up -d --build

# Fase 4
docker compose -f docker-compose.yml -f docker-compose.fase2.yml -f docker-compose.fase4.yml up -d --build

# Reconstruir un servicio si hay dependencias stale
docker compose build --no-cache <service>
```

## Reinicios simples vs orquestación

- Un reinicio o rebuild de contenedores (`docker compose up -d --build backend frontend`) es una **operación normal** y no requiere activar el modo Guardian/DevHive.
- Solo se requiere orquestación de agentes cuando el cambio involucra múltiples scopes (backend + frontend + db + docs), decisiones arquitectónicas, modificación de políticas/seguridad, o reorganización de compose files.

## Consideraciones de red

- Red Docker aislada `cutternest-net` (bridge).
- El stack MVP funciona sin acceso a internet después del build.
- En Fase 4, el gateway WhatsApp requiere conexión a internet para vincular con WhatsApp Web; el resto del sistema puede seguir aislado.
