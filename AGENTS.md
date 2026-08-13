# Guía de agentes de código - CutterNest

Guía orientativa para agentes que trabajan en `/workspace/cutternest-kit`. Antes de cualquier cambio, revisa esta guía y el estado actual del repositorio; no asumas comportamientos que no estén reflejados en el código.

## 1. Arquitectura del sistema

### Backend

- **Framework**: Python 3.11 + FastAPI + Uvicorn + TypeScript-style Pydantic models.
- **Base de datos**: SQLite para MVP (archivo local en `./data/cutternest.db`). PostgreSQL en Fase 2.
- **Caché/sesiones**: sin cache externo en MVP; SQLite maneja sesiones y blacklist simples. Redis opcional en Fase 2 para rate limiting y token blacklist.
- **Optimizador**: `rectpack` (GuillotineBssfSas/MaxRects) para nesting de piezas sobre tableros.
- **Directorios clave**:
  - `backend/app/main.py`: punto de entrada FastAPI.
  - `backend/app/models.py`: modelos Pydantic + SQLAlchemy.
  - `backend/app/database.py`: conexión SQLite con SQLAlchemy (async `aiosqlite` o sync según decisión).
  - `backend/app/optimizer.py`: lógica de optimización de cortes.
  - `backend/app/svg_generator.py`: generación de layouts SVG/PNG.
  - `backend/app/pdf_generator.py`: cotizaciones, cut lists, etiquetas con ReportLab.
  - `backend/app/auth.py`: autenticación local TOTP + Guest PIN.
  - `backend/app/inventory.py`, `quotes.py`, `assembly.py`, `templates.py`: servicios de negocio.
- **Autenticación**: local TOTP (pyotp + qrcode) + Guest PIN; sin LDAP, SMTP, SMS, WhatsApp ni OAuth en MVP.
- **Endpoints**: prefijo `/api/v1/` (`/api/v1/optimize`, `/api/v1/projects`, `/api/v1/inventory`, `/api/v1/auth/*`, etc.).
- **Exportaciones**: SVG, PNG, PDF y CSV se generan en `/app/data/exports/` y se sirven como estáticos.

### Frontend

- **Framework**: React 18 + Vite + TypeScript + Tailwind CSS.
- **3D**: Three.js vía `@react-three/fiber` + `@react-three/drei` para layouts de tableros y ensamblajes.
- **Rutas y estado**: React Router DOM; hook `useAuth` para contexto de sesión.
- **API**: cliente HTTP centralizado con fetch/axios, cookies/httpOnly según decisión de Fase.
- **Directorios clave**:
  - `frontend/src/components/`: componentes agrupados por dominio (`auth/`, `optimizer/`, `mueble/`, `taller/`, `cotizacion/`, `templates/`).
  - `frontend/src/hooks/`: `useAuth`, `useOptimizer`, `useThreeScene`.
  - `frontend/src/types/`: tipos TypeScript compartidos.
  - `frontend/src/utils/`: helpers de Three.js, SVG y validación.
- **Responsive**: tablet 1024px+ (taller) y desktop 1920px+ (diseñador). Tailwind para estilos; no CSS-in-JS ad hoc.

### Infraestructura Docker

- `docker-compose.yml`: MVP autocontenido — backend Python + frontend React/nginx + volumen `./data`.
- `docker-compose.fase2.yml`: PostgreSQL 15 + Redis 7 + backups automáticos.
- `docker-compose.fase4.yml`: WhatsApp gateway (Baileys) + SMS gateway opcional (post-MVP).
- Desarrollo expuesto en `http://localhost:3000` (frontend nginx → backend 8000).
- Todo corre sin conexión a internet después del build.

## 2. Ubicación de memorias y contexto de agentes

- **Memoria global del proyecto**: `.kimi-memory.md` (en raíz).
- **Memoria estructurada por área**: `.devhive/` con `project-brief.md`, `conventions.md` (índice), `current-sprint.md` y decisiones en `.devhive/decisions/`.
- **Convenciones por área (L1b)**: `.devhive/conventions-{backend,frontend,db,deploy,test,auth,agents}.md` se cargan bajo demanda según el scope de la tarea.
- **Histórico de sprints**: `.devhive/sprints/archive/` es cold; no se carga por defecto.
- **Skills y memoria por agente**: `.agents/` contiene subdirectorios por rol (`backend-agent`, `frontend-agent`, `db-agent`, `test-agent`, etc.), cada uno con `SKILL.md` y carpeta `memory/`.
- **Auditoría de tokens**: usa `scripts/audit-context-tokens.mjs` si existe para verificar presupuestos; en CutterNest el script puede no existir aún en MVP.
- Antes de realizar cambios amplios, consulta estos archivos para entender decisiones previas y contexto activo.

## 3. Convenciones de código

### General

- Python 3.11 + FastAPI; frontend TypeScript estricto + Vite.
- No uses `Any` de Pydantic ni `any` de TS sin justificación explícita; prefiere `models.py` y `frontend/src/types/`.
- Mantén la lógica de negocio en servicios/módulos (`optimizer.py`, `quotes.py`, etc.) y el enrutado en `main.py` o routers FastAPI separados.
- Para propiedades opcionales, usa `Optional[T]` o `T | None` (Python 3.11) y pasa `None` directamente; evita spreads condicionales innecesarios.

### Frontend

- **No hardcodear colores**: usa la paleta de Tailwind (`bg-primary`, `text-slate-800`, etc.) o variables CSS en `frontend/src/index.css`. No escribas valores hexadecimales o RGB directamente en componentes o estilos ad hoc.
- Componentes de React con hooks en orden estándar; `useAuth` para leer/actualizar sesión.
- Utilidades de Three.js y SVG residen en `frontend/src/utils/`.

### Tests

- Backend: **pytest** (`backend/tests/`). Ejecuta con `cd backend && pytest` o `docker exec cutternest-backend pytest`.
- Frontend: **Vitest** (`frontend/src/**/*.test.ts`). Ejecuta con `cd frontend && pnpm test`.
- E2E: **Playwright** cuando exista (post-MVP).
- Añade tests para nuevas funciones de optimización, cálculo de cotizaciones y helpers de Three.js.
- Asegúrate de que los tests no fallen tras tus cambios; si un test falla por un cambio real, actualiza el test, no inviertas la lógica para que pase.

## 4. Comandos comunes

```bash
# Levantar MVP (todo local, SQLite)
docker compose up -d --build

# Backend: desarrollo local sin Docker
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Backend: tests
pytest

# Frontend: desarrollo Vite (puerto 5173)
cd frontend && pnpm dev

# Frontend: build de producción
cd frontend && pnpm build

# Frontend: tests
pnpm test

# Fase 2 (PostgreSQL + Redis + backups)
docker compose -f docker-compose.yml -f docker-compose.fase2.yml up -d --build

# Fase 4 (WhatsApp + SMS)
docker compose -f docker-compose.yml -f docker-compose.fase2.yml -f docker-compose.fase4.yml up -d --build
```

## 5. Reglas de seguridad

- **No versiones secretos**: `.env`, `.env.local`, `.env.production`, `.env.*` y credenciales están ignorados en `.gitignore`. Solo se versionan `.env.example` y archivos de ejemplo como plantillas.
- **No expongas credenciales** en logs, respuestas de API, tests, documentación ni mensajes de error. Usa placeholders (por ejemplo, `YOUR_JWT_SECRET`, `changeme`) en ejemplos.
- **No deshabilites validaciones** de rate limiting, autenticación o Guest PIN en producción. Cualquier bypass de desarrollo solo debe estar activo en entorno local.
- **Revisa `.gitignore`** antes de añadir archivos que puedan contener datos persistentes (`data/`, `backups/`, `*.db`) o claves.
- **JWT**: `JWT_SECRET_KEY` solo en `.env` (mínimo 32 caracteres). Access token 15 minutos, refresh token 7 días. En Fase 2 agregar blacklist en Redis.
- **Guest PIN**: 4 dígitos generados con `secrets.randbelow(10000)`, expiran en 5 minutos si no se usan, sesión de 4 horas. No enviar por ningún canal externo; mostrar solo en pantalla del usuario principal.
- **TOTP**: usar `pyotp` + `qrcode` (PNG base64). No almacenar el secreto TOTP en texto plano; cifrar o hashear según Fase 2.
- **Variables de configuración sensible** (JWT, DB, WhatsApp) solo en `.env` o en variables de entorno de Docker; nunca en archivos fuente ni en imágenes Docker.

## 6. Datos de desarrollo

- URL de desarrollo: `http://localhost:3000`.
- API base: `http://localhost:8000/api/v1`.
- Base de datos MVP: SQLite `./data/cutternest.db` (dentro del contenedor `/app/data/cutternest.db`).
- Usuario administrador: se crea en el primer registro si no existe otro, o vía variable `ADMIN_USERNAME` en `.env` (default `admin`).
- Idioma: Español. Todos los labels, mensajes de error y PDFs en español.
- Ejemplo pre-cargado: botón "Cargar ejemplo: Estantería Modular" con 11 piezas en tablero 244×122 cm.

## 7. Modos de trabajo, subagentes y ahorro de tokens

El runtime de Kimi Code soporta múltiples modos de ejecución. El Guardian debe seleccionar el modo adecuado para cada solicitud para minimizar tokens y maximizar calidad.

| Modo | Cuándo usar | Ejemplo |
|------|-------------|---------|
| **Conversacional** | Preguntas, fixes de ≤3 tool calls, análisis rápido. | "¿Cómo funciona el optimizador?" |
| **Plan Mode** | Features, refactors, multi-archivo, decisiones arquitectónicas. | "Refactoriza el optimizador en submódulos." |
| **Goal Mode** | Objetivos verificables a largo plazo. | "Haz que todos los tests backend pasen." |
| **Subagente** | Exploración amplia, planificación, implementación enfocada. | "Explora dónde se usan `Any` en el backend." |
| **AgentSwarm** | Muchas tareas independientes. | "Revisa tipos en 10 componentes." |
| **Background task** | Builds/tests/servidores largos. | "Ejecuta `pytest` en segundo plano." |

### Subagentes disponibles

- **`explore`**: exploración de código read-only (reemplaza cadenas largas de `grep`).
- **`plan`**: planificación de implementación/arquitectura.
- **`coder`**: implementación general.

### Skills built-in

- **`update-config`**: editar configuración del CLI.
- **`write-goal`**: redactar un objetivo bien especificado para `/goal`.

### UI/UX

- `ui-ux-agent` está habilitado como plugin on-demand. Cualquier agente frontend que cree nuevos patrones visuales (modales, tablas, formularios, tokens 3D) debe consultarlo vía Guardian.

### Reglas de oro para ahorrar tokens

1. **MCP-first:** consulta `knowledge-graph-agent` / `codebase-memory-mcp` antes de leer código fuente ampliamente.
2. **No re-explores:** lee `learnings.md` y `completed-tasks.md` de agentes previos.
3. **Lee solo lo necesario:** usa `line_offset` y `n_lines` en archivos grandes.
4. **Usa `Edit`, no `Write`:** para cambios pequeños.
5. **Delega con contexto exacto:** paths, comandos y criterios de aceptación en el prompt.
6. **Resume subagentes:** reutiliza el mismo agente en lugar de crear uno nuevo.
7. **Guardian aplica memoria en batch:** los agentes no escriben sus propios archivos de memoria.
8. **Entregables compactos:** no pegues el contenido completo de archivos.

Para una guía detallada, ver `.agents/TOKEN-SAVING-GUIDE.md`.

### Framework KERNEL para agentes

A partir de la estructura DevHive existente, cada `SKILL.md` de agente sigue el formato KERNEL:

- **Contexto → Tarea → Restricciones → Formato → Criterio de éxito**
- La plantilla base está en `.agents/TEMPLATE-KERNEL.md`.
- Cada agente principal tiene una checklist de criterios de éxito medibles antes de entregar.
- Los handoffs entre agentes usan un **ticket estandarizado** (`🎫 HANDOFF TICKET`) definido en `.agents/guardian/SKILL.md` y en el template de entregables `.agents/guardian/templates/deliverable-template.md`.

Esto reduce re-exploración, tokens de contexto y ciclos de corrección sin cambiar los roles del equipo.

## 8. Antes de entregar cambios

- Verifica que el backend arranca (`uvicorn app.main:app` o `docker compose up --build`).
- Ejecuta los tests relevantes (`pytest` y/o `pnpm test`) y asegúrate de que pasen.
- No ejecutes tests E2E a menos que la pila Docker esté levantada.
- Revisa que no hayas dejado credenciales, URLs internas ni claves en el diff.
- Actualiza esta guía (`AGENTS.md`) si introduces cambios que afecten la arquitectura, convenciones, comandos o reglas de seguridad.
- Si se toca código fuente, asegúrate de que el Guardian coordine la re-indexación MCP al cerrar el swarm.

## 9. Flujo de agentes DevHive

Este proyecto usa el sistema DevHive en `.agents/`. Reglas globales aprobadas para todos los agentes:

1. **CWD y contexto**: cada agente debe verificar que trabaja en `/workspace/cutternest-kit` y haber cargado L0-L3 antes de actuar.
2. **Memorias en batch**: el Guardian actualiza las memorias al final de cada ciclo de swarm, no tras cada decisión.
3. **Lockfiles**: si se toca `requirements.txt`, `backend/requirements*.txt`, `frontend/package.json` o `whatsapp-gateway/package.json`, se debe ejecutar el instalador correspondiente (`pip install`/`pnpm install`) y sincronizar el lockfile.
4. **Audit.log**: se respalda con timestamp antes de cada modificación y nunca se sobrescribe con `Write`.
5. **Validación final**: el plugin `integration-validator` (`.agents/plugins/integration-validator/`) corre tests y verifica entregables tras cada swarm.
6. **Entregable**: usar la plantilla estándar con `PRE-CONDITIONS MET` definida en `.agents/guardian/templates/deliverable-template.md`.
