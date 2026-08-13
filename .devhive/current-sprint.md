# Sprint actual: CutterNest - MVP

## Objetivo

Entregar el MVP funcional de CutterNest: sistema autocontenido de optimización de cortes con autenticación TOTP + Guest PIN, visualización 2D/3D, inventario, cotización, plantillas, cut list y etiquetas. Todo debe levantar con `docker compose up --build` y funcionar sin internet.

## Tareas asignadas

| # | Tarea | Agente | Estado | Notas |
|---|---|---|---|---|
| M1 | Configurar backend FastAPI + SQLAlchemy SQLite | backend | ✅ Completado | `backend/app/main.py`, `database.py`, `models.py`, `config.py`, `schemas.py`. |
| M2 | Implementar auth TOTP + Guest PIN | auth + backend | ✅ Completado | `auth.py`, `security.py`, `dependencies.py`, routers `/auth/*`. |
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
| M14 | Tests backend pytest | test | ✅ Completado | `backend/tests/test_auth.py`, `test_optimizer.py`, `conftest.py`. |
| M15 | Tests frontend Vitest | test | ✅ Completado | `frontend/src/types/index.test.ts`; `vitest` agregado a `package.json`. |
| M16 | Validación Docker Compose MVP | deploy | 🔄 En progreso | Backend compila; falta validar build de frontend y levantamiento completo por falta de Docker local. |

## Leyenda estados

- ⏳ Pendiente
- 🔄 En progreso
- ✅ Completado
- ❌ Bloqueado
- ⏸️ Pausado

## Bloqueadores activos

No hay bloqueadores activos. El MVP no requiere servicios externos.

## Decisiones recientes del sprint

- **ADR-001-2026-08-12**: Stack MVP aprobado: Python 3.11 + FastAPI + SQLite + React 18 + Vite + Three.js + Tailwind. Sin dependencias externas en MVP.
- **ADR-002-2026-08-12**: Autenticación local TOTP + Guest PIN; sin LDAP, SMTP, SMS, WhatsApp ni OAuth en MVP.
- **ADR-003-2026-08-12**: Docker Compose por fases: MVP (`docker-compose.yml`), Fase 2 (`docker-compose.fase2.yml`), Fase 4 (`docker-compose.fase4.yml`).

## Métricas actuales

- Tests backend: por establecer.
- Tests frontend: por establecer.
- Coverage: por establecer.
- Bugs encontrados: 0 críticos abiertos.
- Agentes DevHive activos: por establecer.

## Next actions

1. Completar esqueleto backend FastAPI con SQLAlchemy SQLite.
2. Implementar autenticación TOTP + Guest PIN.
3. Implementar optimizador con rectpack y endpoints de exportación.
4. Construir frontend base con routing y pantallas principales.
5. Escribir tests unitarios para optimizador, auth y cotización.
6. Validar `docker compose up --build` levanta todo sin errores.

## Criterios de éxito del MVP

- [ ] `docker compose up --build` levanta backend + frontend sin errores.
- [ ] Registro de usuario con username/password + TOTP (QR visible en pantalla).
- [ ] Login con TOTP (6 dígitos) devuelve JWT.
- [ ] Guest login con PIN de 4 dígitos generado por usuario principal.
- [ ] Backend optimiza con rectpack el ejemplo de estantería (11 piezas en 2 tableros).
- [ ] Frontend muestra SVG del layout con piezas coloreadas, nombres y medidas.
- [ ] Vista 3D del tablero con piezas como cubos en posición correcta (Three.js).
- [ ] Vista 3D del mueble armado con pasos de ensamblaje animados.
- [ ] Cut List PDF generado con orden de cortes y checklist de seguridad.
- [ ] Etiquetas PDF generadas con códigos QR.
- [ ] Cotización PDF con desglose de materiales, hardware, mano de obra y total.
- [ ] Inventario funcional: agregar tableros, ver sobrantes, consumir en proyecto.
- [ ] Plantillas de muebles predefinidas generan piezas automáticamente.
- [ ] Reporte simple de eficiencia por proyecto (gráfico de barras).
- [ ] `README.md` actualizado con instrucciones de instalación, uso y estructura.

## Histórico

Ver historial completo en `.devhive/sprints/archive/` (cold). No se carga por defecto.
