# Arquitectura del Sistema — CutterNest

## Diagrama de componentes (MVP)

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENTE                             │
│              (Navegador - React + Vite + Three.js)          │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP :3000
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (frontend)                        │
│              Static files + Reverse proxy /api/v1           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (Python 3.11 + FastAPI)                │
│              Puerto: 8000                                     │
│  auth · optimizer · inventory · projects · templates · pdf  │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│              SQLite (./data/cutternest.db)                  │
│  users · sessions · guest_sessions · projects · inventory   │
└─────────────────────────────────────────────────────────────┘
```

> **Nota sobre Docker Compose:** el MVP se levanta con `docker-compose.yml` únicamente. Fases futuras amplían servicios:
> - **`docker-compose.fase2.yml`**: PostgreSQL 15 + Redis 7 + backups automáticos.
> - **`docker-compose.fase4.yml`**: WhatsApp gateway (Baileys) + SMS gateway.
>
> El MVP no requiere PostgreSQL, Redis, LDAP, SMTP, SMS ni WhatsApp.

## Grafo de Conocimiento

- **Ubicación**: `.agents/knowledge-graph-agent/memory/`
- **Propósito**: mapeo MCP-first de componentes, dependencias y flujos de datos para reducir el consumo de tokens. MCP es la fuente de verdad; los archivos manuales son audit trail.
- **Nodos**: stubs delgados en `.agents/knowledge-graph-agent/memory/graph/` (≤50 tokens cada uno).
  - Componentes core: `fastapi-backend.md`, `react-frontend.md`, `sqlite-db.md`, `nginx-proxy.md`, `auth-flow.md`, `totp-flow.md`, `guest-pin-flow.md`, `optimizer.md`, `svg-generator.md`, `pdf-generator.md`, `inventory.md`, `templates.md`, `docker-compose-mvp.md`.
- **Relaciones**: relaciones críticas cross-cutting en `.agents/knowledge-graph-agent/memory/edges.md`. Las relaciones de código (`CALLS`, `IMPORTS`, `USAGE`) se derivan de MCP con `trace_path`.
- **Consultas**:
  - `.agents/knowledge-graph-agent/memory/queries.md` — recetas MCP de alta frecuencia (hot load).
  - `.agents/knowledge-graph-agent/memory/queries.cold.md` — recetas de baja frecuencia (cold load, bajo demanda).
- **Auditoría de tokens**: `scripts/audit-stub-tokens.mjs` verifica que ningún stub exceda 50 tokens.

Antes de modificar un servicio, solicitar al Guardian que consulte al `knowledge-graph-agent` vía MCP para entender el impacto en dependencias y flujos de datos.

## Flujo de autenticación

```
1. Registro
   Usuario crea username/password
   Backend genera TOTP secret + QR base64 + 10 backup codes
   ↓
2. Login step 1
   POST /api/v1/auth/login con username/password
   Backend devuelve mensaje y setea temp_token como cookie httpOnly
   ↓
3. Verificación TOTP / backup
   POST /api/v1/auth/verify con { code }
   Backend lee temp_token de cookie, valida TOTP o backup code
   Setea access_token y refresh_token como cookies httpOnly
   Invalida temp_token
   ↓
4. Sesión autenticada
   access_token en cookie para requests a /api/v1/*
   refresh_token en cookie para /api/v1/auth/refresh
   ↓
5. Logout
   POST /api/v1/auth/logout
   Revoca sesión y limpia cookies
```

## Guest PIN

```
1. Usuario principal genera PIN
   POST /api/v1/auth/guest/pin (requiere auth)
   Backend crea guest_session con PIN de 4 dígitos, expira en 5 min
   ↓
2. Operario ingresa PIN
   POST /api/v1/auth/guest/login con { pin }
   Backend valida PIN no usado, no revocado, no expirado
   Setea access_token como cookie httpOnly
   ↓
3. Sesión guest
   Acceso limitado a funciones marcadas como guestAllowed
   No puede ver proyectos de otros ni administrar usuarios
```

## Modelo de datos (MVP)

```
users
├── id (PK)
├── username (UNIQUE)
├── email
├── password_hash
├── totp_secret_encrypted
├── role
├── is_active
└── created_at

sessions
├── id (PK)
├── user_id (FK)
├── refresh_token_hash
├── expires_at
├── revoked_at
└── created_at

guest_sessions
├── id (PK)
├── pin
├── created_by (FK → users)
├── used_at
├── revoked_at
├── expires_at
└── created_at

projects
├── id (PK)
├── owner_id (FK → users)
├── name
├── description
├── board_width_mm
├── board_height_mm
├── board_thickness_mm
├── kerf_mm
├── margin_mm
├── material_type
├── use_offcuts
├── pieces (JSON)
├── layouts (JSON)
├── created_at
└── updated_at

inventory
├── id (PK)
├── tipo
├── espesor_mm
├── ancho_mm
├── alto_mm
├── cantidad
├── estado
├── area_m2
├── proyecto_origen
└── created_at
```
