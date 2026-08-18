# Sprint actual: CutterNest — MVP completado y optimización DevHive

## Objetivo

Consolidar el MVP funcional y seguro de CutterNest, alinear el equipo de agentes DevHive con el stack real del proyecto, y eliminar memorias/artefactos obsoletos del proyecto anterior.

## Tareas asignadas

| # | Tarea | Agente | Estado | Notas |
|---|---|---|---|---|
| M1 | Configurar backend FastAPI + SQLAlchemy SQLite | backend | ✅ Completado | `backend/app/main.py`, `database.py`, `models.py`, `config.py`, `schemas.py`. |
| M2 | Implementar auth TOTP + Guest PIN + cookies httpOnly | auth + backend | ✅ Completado | `auth.py`, `security.py`, `dependencies.py`, routers `/auth/*`. |
| M3 | Implementar optimizador rectpack | backend + optimizer | ✅ Completado | `optimizer.py`, endpoint `POST /api/v1/optimize`. |
| M4 | Generar SVG/PNG de layouts | backend | ✅ Completado | `svg_generator.py`. |
| M5 | Generar PDFs (cotización, cut list, etiquetas) | backend | ✅ Completado | `pdf_generator.py`. |
| M6 | Inventario de tableros y sobrantes | backend | ✅ Completado | `inventory.py`, endpoints `/inventory`, `/inventory/offcuts`. |
| M7 | Plantillas de muebles predefinidas | backend | ✅ Completado | `templates.py`, endpoints `/templates`. |
| M8 | Planos de ensamblaje JSON | backend | ✅ Completado | `assembly.py`, endpoint `/projects/{id}/assembly`. |
| M9 | Frontend React + Vite + Tailwind base | frontend | ✅ Completado | `main.tsx`, `App.tsx`, `index.css`, routing, `api/client.ts`, `hooks/useAuth.ts`, `types`. |
| M10 | Pantallas de auth (login, registro, TOTP, PIN) | frontend | ✅ Completado | `components/auth/`. |
| M11 | Optimizador UI (formulario, resultados, SVG) | frontend | ✅ Completado | `components/optimizer/OptimizerPage.tsx`, `Layout2D.tsx`. |
| M12 | Visualización 3D tablero y mueble | frontend | ✅ Completado | `components/optimizer/Tablero3D.tsx`; ensamblaje en `components/mueble/AssemblyPage.tsx`. |
| M13 | Inventario, cotización y reportes UI | frontend | ✅ Completado | `components/taller/InventoryPage.tsx`, `components/cotizacion/QuotePage.tsx`. |
| M14 | Tests backend pytest | test | ✅ Completado | `backend/tests/test_auth.py`, `test_optimizer.py`, `test_projects.py`, `conftest.py`. |
| M15 | Tests frontend Vitest | test | ✅ Completado | `frontend/src/types/index.test.ts`; `vitest` en `package.json`. |
| M16 | Validación Docker Compose MVP | deploy | ✅ Completado | `docker compose up -d --build` levanta backend y frontend healthy. |
| M17 | Carga/descarga de piezas via CSV con hash de formato | frontend + Guardian | ✅ Completado | `frontend/src/utils/piecesCsv.ts`, botones en `OptimizerPage.tsx`, tests Vitest. |
| M18 | Paginación y pestaña de conteo por dimensiones | frontend + Guardian | ✅ Completado | `frontend/src/utils/pieceCounter.ts`, `PieceCountTab.tsx`, paginación 10 piezas/página en `OptimizerPage.tsx`. |
| M19 | Plantilla personalizada persistente en localStorage | frontend + Guardian | ✅ Completado | `frontend/src/utils/pieceTemplate.ts`, botones Guardar/Cargar/Restaurar en `OptimizerPage.tsx`, guardado automático al cargar CSV. |
| M20 | Ensamblaje 3D coherente paso a paso | backend + frontend + Guardian | ✅ Completado | `backend/app/assembly.py`, `Assembly3D.tsx`, `AssemblyPage.tsx`, tests `test_assembly.py`. |
| M21 | Planificador visual de ensamblaje y manuales HTML/PDF | backend + frontend + Guardian | ✅ Completado | Kahn en `assembly.py` y `topologicalSort.ts`, `AssemblyPlanner.tsx`, `LevelTimeline.tsx`, `AssemblyManual.tsx`, `generateAssemblyHtml.ts`, endpoints `/assembly/plan` y `/assembly/generate`. |
| D1 | Actualizar `profile.yaml` y DevHive al stack CutterNest | Guardian | ✅ Completado | Perfil ahora refleja Python/FastAPI, React/Vite, SQLite, Docker Compose por fases. |
| D2 | Actualizar `architecture.md`, `domain-rules.md`, `security-policy.md`, `guardian/SKILL.md` | Guardian | ✅ Completado | Documentos adaptados al MVP. |
| D3 | Limpiar stubs y memorias obsoletas | Guardian | ✅ Completado | Stubs, audit logs y agentes/plugins no usados (LDAP, tunnel, frontend-template) archivados en `.agents/memory/archive/`. |
| D4 | Crear ADRs para decisiones críticas recientes | Guardian | ✅ Completado | 5 ADRs en `.devhive/decisions/`: PyJWT, cookies httpOnly, TOTP cifrado, rate limiting, DevHive DCOP. |
| D5 | Reindexar MCP y versionar cambios | Guardian | ✅ Completado | MCP reindexado (1282 nodos, 2897 aristas); commit `ef50d07`. Validación full pasa. |

## Leyenda estados

- ⏳ Pendiente
- 🔄 En progreso
- ✅ Completado
- ❌ Bloqueado
- ⏸️ Pausado

## Bloqueadores activos

Ninguno.

## Decisiones recientes del sprint

- **ADR-001-2026-08-12**: Stack MVP aprobado: Python 3.11 + FastAPI + SQLite + React 18 + Vite + Three.js + Tailwind. Sin dependencias externas en MVP.
- **ADR-002-2026-08-12**: Autenticación local TOTP + Guest PIN; sin LDAP, SMTP, SMS, WhatsApp ni OAuth en MVP.
- **ADR-003-2026-08-12**: Docker Compose por fases: MVP (`docker-compose.yml`), Fase 2 (`docker-compose.fase2.yml`), Fase 4 (`docker-compose.fase4.yml`).
- **ADR-004-2026-08-13**: Migración de `python-jose` a `PyJWT` por mantenimiento y seguridad.
- **ADR-005-2026-08-13**: TOTP cifrado con `TOTP_ENCRYPTION_KEY` separada de `JWT_SECRET_KEY`.
- **ADR-006-2026-08-13**: Códigos de backup invalidados tras uso mediante tabla `BackupCode` con `used_at`.
- **ADR-007-2026-08-13**: Tokens de autenticación entregados como cookies `httpOnly`, incluyendo `temp_token` de verificación TOTP; eliminado todo uso de `localStorage`/`sessionStorage` para tokens.
- **ADR-008-2026-08-13**: Rate limiting con `slowapi` en endpoints auth, optimize, refresh y guest PIN.
- **ADR-010-2026-08-13**: Unificación de todas las medidas a milímetros (mm) en modelos, schemas, frontend, PDFs, SVG, CSV y migración automática de columnas antiguas en cm.

## Métricas actuales

- Tests backend: 21 passed.
- Tests frontend: 71 passed.
- Docker Compose MVP: healthy.
- Bugs críticos abiertos: 0.
- Agentes DevHive activos: 9 + 4 plugins.

## Hotfixes recientes (Assembly Planner)

- **Manual de ensamblaje**: repisas inferiores con `cantidad > 1` se apilan hacia arriba dentro del interior del mueble, evitando que se dibujen debajo de la base (`manualView.js`).
- **Grafo**: el layout estructural ahora se recalcula y centra automáticamente al cambiar de pestaña o redimensionar el contenedor, usando `ResizeObserver` y reintentos por `requestAnimationFrame` (`graphView.js`).

## Next actions

1. Continuar iteraciones de funcionalidad sobre el MVP (optimizador 3D, mejoras UI, reportes).
2. Mantener ADRs actualizados ante nuevas decisiones arquitectónicas.
3. Ejecutar `#optimize` periódicamente según DCOP.

## Criterios de éxito del MVP

- [x] `docker compose up --build` levanta backend + frontend sin errores.
- [x] Registro de usuario con username/password + TOTP (QR visible en pantalla).
- [x] Login con TOTP (6 dígitos) o backup code devuelve cookies httpOnly.
- [x] Guest login con PIN de 4 dígitos generado por usuario principal.
- [x] Backend optimiza con rectpack el ejemplo de estantería.
- [x] Frontend muestra SVG del layout con piezas coloreadas, nombres y medidas.
- [x] Vista 3D del tablero con piezas posicionadas.
- [x] Inventario funcional: agregar tableros, ver sobrantes, consumir en proyecto.
- [x] Plantillas de muebles predefinidas generan piezas automáticamente.
- [x] No hay secretos hardcodeados ni defaults inseguros en el código versionado.

## Histórico

Ver historial completo en `.devhive/sprints/archive/` (cold). No se carga por defecto.
