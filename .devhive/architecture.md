# Arquitectura del Sistema

## Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENTE                             │
│              (Navegador - React + Vite)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS :3443
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (Proxy TLS)                         │
│              Terminación TLS + Reverse Proxy                │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
┌─────────────────┐      ┌──────────────────────────┐
│  FRONTEND       │      │  BACKEND (Node.js)       │
│  React + Vite   │      │  Express + TypeScript    │
│  Puerto: 5173   │      │  Puerto: 3000            │
└─────────────────┘      └──────────┬───────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  PostgreSQL 16   │  │  Redis           │  │  LDAP            │
│  Auth + Docs     │  │  Sessions        │  │  Corporativo     │
│  Puerto: 5432    │  │  Rate Limit      │  │  INEC            │
│  (host: 5431)    │  │  2FA Codes       │  │  Puerto: 389/636 │
└──────────────────┘  └──────────────────┘  └──────────────────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                  │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  SMTP (MailHog)  │  │  SMS Simulator   │  │  pgAdmin         │
│  Puerto: 1025    │  │  Puerto: 4000    │  │  Puerto: 5051    │
│  WebUI: 8025     │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                  │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Tor SOCKS5      │  │  WhatsApp        │  │                  │
│  Proxy           │  │  Gateway         │  │                  │
│  (Opcional)      │  │  Baileys         │  │                  │
│  Puerto: 9150    │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

> **Nota sobre Docker Compose:** el diagrama agrupa todos los servicios en una sola vista, pero el proyecto ahora los separa en tres archivos:
> - **`docker-compose.yml`** (core): PostgreSQL, Redis, backend, frontend, nginx, y los servicios del SMS Gateway privado (`sms-gateway-db`, `sms-gateway`, `sms-gateway-client`, `sms-gateway-worker`).
> - **`docker-compose.dev.yml`** (desarrollo): `pgadmin`, `ldap-dev` (OpenLDAP de prueba), `sms-simulator`, `smtp-dev` (MailHog).
> - **`docker-compose.tunnels.yml`** (túneles): `cloudflared`, `tailscale`, `ngrok` (perfiles).
> 
> El servicio `auth` solo requiere `postgres` y `cache` para arrancar; no depende de `ldap-dev` ni `smtp-dev`.

## Grafo de Conocimiento

- **Ubicación**: `.agents/knowledge-graph-agent/memory/`
- **Propósito**: Mapeo MCP-first de componentes, dependencias y flujos de datos para reducir el consumo de tokens. MCP es la fuente de verdad; los archivos manuales son audit trail.
- **Nodos**: stubs delgados en `.agents/knowledge-graph-agent/memory/graph/` (≤50 tokens cada uno, 74 nodos).
  - Componentes core: `auth-service.md`, `jwt-utils.md`, `ldap-service.md`, `user-table.md`, `session-redis.md`, `totp-flow.md`, `document-service.md`, `upload-service.md`, `frontend-auth-hook.md`, `nginx-proxy.md`, `postgres-db.md`, `redis-cache.md`, `sms-gateway.md`, `sms-gateway-client.md`, `sms-gateway-db.md`, `sms-gateway-worker.md`, `system-config-db.md`, `system-config-sms.md`, `quick-tunnel-sms.md`, `docker-compose-core.md`, `docker-compose-dev.md`, `docker-compose-tunnels.md`.
  - Servicios de desarrollo: `pgadmin.md`, `ldap-dev.md`, `sms-simulator.md`, `smtp-dev.md`.
  - Túneles: `cloudflared.md`, `tailscale.md`, `ngrok.md`.
  - Agente/Plugin: `tunnel-agent.md`.
- **Relaciones**: relaciones críticas cross-cutting únicamente en `.agents/knowledge-graph-agent/memory/edges.md`. Las relaciones de código (`CALLS`, `IMPORTS`, `USAGE`) se derivan de MCP con `trace_path`.
- **Consultas**:
  - `.agents/knowledge-graph-agent/memory/queries.md` — recetas MCP de alta frecuencia (hot load).
  - `.agents/knowledge-graph-agent/memory/queries.cold.md` — recetas de baja frecuencia y caché estable (cold load, bajo demanda).
- **Auditoría de tokens**: `scripts/audit-stub-tokens.mjs` verifica que ningún stub exceda 50 tokens.

Antes de modificar un servicio, solicitar al Guardian que consulte al `knowledge-graph-agent` vía MCP para entender el impacto en dependencias y flujos de datos. Las recetas de consulta viven en `queries.md` (hot) y `queries.cold.md` (cold).

## WhatsApp/Tor Gateway

El backend expone un gateway de WhatsApp basado en `@whiskeysockets/baileys` (`backend/src/services/whatsappService.ts`). La configuración se persiste en la tabla `system_config` y se expone a través de los endpoints de `backend/src/routes/config.ts`:

- `GET /api/config` (incluye `whatsappConfig`)
- `PUT /api/config` (guarda `whatsappConfig`)
- `GET /api/config/whatsapp-status`
- `POST /api/config/whatsapp-reconnect`
- `POST /api/config/whatsapp-reset`

Para evitar bloqueos de firewall/antivirus en entornos corporativos, el socket de Baileys puede rutearse a través de un proxy SOCKS5 (por ejemplo, Tor) usando `socks-proxy-agent` (`SocksProxyAgent`) construido en `backend/src/utils/proxyAgent.ts`. El proxy se aplica tanto en la opción `agent` como en `fetchAgent` de `makeWASocket`. Los campos de configuración son: `enabled`, `sessionPath`, `cooldownMs`, `maxRetries`, `retryDelayMs`, `codeTtl`, `maxSends`, `sendWindow`, `proxyEnabled`, `proxyUrl` (default `socks5://172.31.0.1:9150` para WSL2 → Tor Browser en Windows).

El frontend expone la configuración en la pestaña **WhatsApp** del componente `frontend/src/components/SystemConfig.tsx`. Los tipos `WhatsAppConfig`/`WhatsAppStatusResponse` están en `frontend/src/types/api.ts` y los servicios (`getWhatsAppStatus`, `reconnectWhatsApp`, `resetWhatsApp`) en `frontend/src/services/auth.ts`.

## Flujo de autentificación

```
1. Usuario ingresa credenciales
   ↓
2. Backend valida:
   a. Si LDAP: consulta LDAP → valida contraseña → sincroniza atributos
   b. Si local: bcrypt.compare → valida contraseña
   ↓
3. Si 2FA requerido:
   a. TOTP app: valida speakeasy.totp.verify
   b. TOTP email: envía código SMTP → valida en Redis
   c. TOTP SMS: envía código API → valida en Redis
   d. Backup codes: valida contra PostgreSQL
   ↓
4. Genera tokens:
   - accessToken (JWT, corto)
   - refreshToken (JWT, largo, en cookie httpOnly)
   - sessionToken (sesión Redis)
   ↓
5. Registra sesión en Redis + audit_log en PostgreSQL
   ↓
6. Devuelve cookies httpOnly al frontend
```

## Modelo de datos (simplificado)

```
users
├── id (PK)
├── username (UNIQUE)
├── email
├── phone_number
├── password_hash (solo local)
├── ldap_dn (solo LDAP)
├── identity_origin ('LDAP' | 'LOCAL' | 'SUPER')
├── roles (array)
├── totp_enabled
├── totp_secret (encriptado)
├── totp_secret_pending (encriptado)
├── active
├── failed_attempts
├── locked_until
├── last_login
├── created_at
└── updated_at

sessions
├── id (PK)
├── user_id (FK)
├── token
├── fingerprint
├── ip_address
├── user_agent
├── expires_at
├── revoked
└── created_at

audit_logs
├── id (PK)
├── user_id (FK)
├── action
├── entity_type
├── entity_id
├── old_value (JSONB)
├── new_value (JSONB)
├── ip_address
├── user_agent
├── session_id
├── success
├── error_message
└── created_at

documents
├── id (PK)
├── title
├── slug (UNIQUE)
├── content_raw (Markdown)
├── content_html
├── metadata_json (JSONB)
├── category
├── tags (array)
├── author_id (FK)
├── visibility
├── version
├── view_count
├── created_at
└── updated_at

uploads
├── id (PK)
├── filename
├── original_name
├── mime_type
├── size_bytes
├── path
├── uploaded_by (FK)
├── document_id (FK)
└── created_at

trusted_devices
├── id (PK)
├── user_id (FK)
├── device_token
├── fingerprint
├── ip_address
├── user_agent
├── expires_at
└── created_at
```
