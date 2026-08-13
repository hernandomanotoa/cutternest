# Project Brief: CutterNest - Sistema de Optimización de Cortes

## Visión

Sistema web autocontenido para optimizar cortes de tableros (MDF, madera, melamina) en fabricación de muebles, con visualización 2D/3D, cotización local, inventario de sobrantes y autenticación TOTP + Guest PIN. Sin dependencias de servicios externos en el MVP: todo corre dentro de Docker Compose sin APIs de terceros, gateways de mensajería, servidores SMTP ni impresoras especiales.

## Stack Tecnológico

- **Backend**: Python 3.11 + FastAPI + Pydantic + SQLAlchemy (`backend/app/`).
- **Frontend**: React 18 + Vite + TypeScript + Three.js + Tailwind CSS (`frontend/src/`).
- **DB**: SQLite para MVP (archivo local en `./data/`). PostgreSQL 15 opcional en Fase 2.
- **Cache**: ninguno en MVP; Redis 7 opcional en Fase 2 para rate limiting y blacklist de tokens.
- **Auth**: JWT (access/refresh) + TOTP local (`pyotp` + `qrcode`) + Guest PIN de 4 dígitos. Sin LDAP, SMS, email, WhatsApp ni OAuth en MVP.
- **Optimización**: `rectpack` (Guillotine/MaxRects) para nesting de piezas.
- **Exportación**: SVG, PNG, PDF (ReportLab) y CSV generados localmente en `/app/data/exports/`.
- **Infra**: Docker Compose separado en MVP (`docker-compose.yml`), Fase 2 (`docker-compose.fase2.yml`) y Fase 4 (`docker-compose.fase4.yml`). Nginx sirve el frontend y proxy al backend.
- **Tests**: pytest (backend), Vitest + React Testing Library (frontend).
- **Gestor paquetes**: `pip` (backend), `pnpm` (frontend y whatsapp-gateway).

## Arquitectura

```
Cliente (Navegador - React + Vite + Three.js)
    ↓ HTTP:3000
nginx (frontend)
    ↓ /api/v1/*
Backend FastAPI (8000)
    ↓
SQLite (./data/cutternest.db)   [MVP]
PostgreSQL + Redis              [Fase 2]
WhatsApp Baileys + SMS gateway  [Fase 4]
```

> **Nota:** el stack MVP (`docker-compose.yml`) solo requiere backend + frontend. No requiere PostgreSQL, Redis, LDAP, SMTP, SMS ni WhatsApp.

## Convenciones críticas

- `JWT_SECRET_KEY`: solo en `.env`, nunca en código (mínimo 32 caracteres).
- **TOTP**: secreto cifrado o hasheado; QR se muestra como PNG base64 en registro.
- **Guest PIN**: solo en pantalla del usuario principal; nunca por email, SMS ni WhatsApp.
- Rate limit por IP (Fase 2 en Redis; MVP en memoria o SQLite si aplica).
- Queries SQL: siempre parametrizadas con SQLAlchemy o placeholders, nunca concatenación.
- Tokens: access token 15 min; refresh token 7 días en SQLite. En Fase 2 agregar blacklist en Redis.
- Commits: `tipo(scope): descripción` en español o inglés según acuerdo del equipo.
- Nombres de archivos y variables en español para el dominio del negocio (pieza, tablero, sobrante, cotización).

## Estado actual

- ✅ Esqueleto de Docker Compose para MVP, Fase 2 y Fase 4.
- ✅ Esqueleto de backend FastAPI (`backend/app/main.py`).
- ✅ Esqueleto de frontend React (`frontend/src/App.tsx`, `main.tsx`).
- ✅ README.md con instrucciones de inicio rápido.
- ❌ Código funcional de optimización, auth, inventario, cotización, 3D, plantillas y exportaciones (pendiente de implementación en este sprint).
- ❌ Tests unitarios y E2E (pendientes).

## Equipo de agentes

Sistema **DevHive** con agentes core + guardian + plugins:

```
Usuario
  ↓
Guardian (orquestador + permisos)
  ↓
┌──────────┬──────────┬──────────┬──────────┐
│ architect│ backend  │ frontend │  db      │
│(planning)│ (API)    │ (UI/3D)  │ (SQL)    │
├──────────┼──────────┼──────────┼──────────┤
│ auth     │ deploy   │  test    │  docs    │
│(security)│ (DevOps) │ (QA)     │ (docs)   │
├──────────┴──────────┴──────────┴──────────┤
│ optimizer specialist (3D/packing)         │
└───────────────────────────────────────────┘
```

Plugins: `code-reviewer`, `dependency-checker`, `integration-validator`, `ui-ux-agent`.

### Estrategia de memoria

- **MCP-first**: `knowledge-graph-agent` usa `codebase-memory-mcp` como fuente primaria de arquitectura.
- **Hot/cold memory**: `active-tasks.md` y `queries.md` son hot; `completed-tasks.md` y `queries.cold.md` son cold y solo se cargan bajo demanda.
- **Stubs delgados**: cada nodo en `.agents/knowledge-graph-agent/memory/graph/` debe mantenerse ≤50 tokens.

## Fases de implementación

| Fase | Qué incluye | Esfuerzo estimado | Dependencias |
|---|---|---|---|
| **MVP** | SQLite, optimizador, 3D, cotización local, TOTP, Guest PIN, inventario, plantillas, cut list, etiquetas, ensamblaje | 2-3 semanas | Ninguna |
| **Fase 2** | PostgreSQL, Redis, backups automáticos, rate limiting, blacklist tokens, concurrencia multi-usuario | +3-4 días | MVP estable |
| **Fase 3** | Email SMTP institucional, recuperación de password, envío de cotizaciones por email | +2-3 días | Fase 2 |
| **Fase 4** | WhatsApp (Baileys), SMS gateway, notificaciones de órdenes, registro por WhatsApp, OTP fallback | +4-5 días | Fase 2 |
| **Fase 5** | Impresora térmica ZPL/ESC-POS, integración hardware taller | +2-3 días | Fase 2+ |
| **Fase 6** | App móvil (PWA offline), escaneo de QR en piezas, checklists de taller | +1-2 semanas | Fase 4 |

## Usuarios

1. **Diseñador / Administrador (principal)**: crea proyectos, administra inventario, genera cotizaciones, reportes y PINs temporales.
2. **Operario / Taller (guest)**: usa PIN de 4 dígitos para acceder temporalmente, crear proyectos y exportar layouts. No guarda en servidor ni accede a historial de otros.
3. **Cliente (post-MVP)**: recibe notificaciones por WhatsApp/SMS sobre estado de órdenes.

## Restricciones y no-objetivos

- **No dependencias externas en MVP**: sin SMTP, Twilio, WhatsApp, impresora térmica, cloud, ni APIs de terceros.
- **Idioma**: Español para UI, mensajes y PDFs.
- **Performance**: optimización de 20 piezas < 2 segundos; Three.js 60 FPS con 50 piezas.
- **Persistencia**: SQLite en volumen Docker; si se destruye el contenedor, los datos permanecen en `./data/`.

## Contacto / Dueño técnico

- Proyecto: CutterNest (kit de inicio para Kimi Code).
- Entorno: Linux + Docker.
- Restricciones: Stack autocontenido; sin conexión a internet requerida después del build.
