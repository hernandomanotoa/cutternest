# Sprint actual: CutterNest — Assembly Planner offline + refactor UI/UX

## Objetivo

Entregar un **Assembly Planner vanilla autocontenido** en `frontend/public/assembly-planner/` capaz de operar offline, importar CSV de piezas, generar dependencias con heurísticas, calcular análisis estructural, mostrar grafo interactivo, secuencia de ensamblaje y manual auto-generado. A su vez, consolidar el **refactor UI/UX del frontend React** con componentes base reutilizables, stores con Zustand y mejoras en las páginas principales.

## Tareas asignadas

| # | Tarea | Agente | Estado | Notas |
|---|---|---|---|---|
| A1 | Crear esqueleto HTML/CSS/app.js del Assembly Planner | frontend | ✅ Completado | `frontend/public/assembly-planner/index.html`, `styles/theme.css`, `js/app.js`. |
| A2 | Implementar csvParser, heurísticas y topologicalSort | frontend | ✅ Completado | `csvParser.js`, `heuristics.js`, `topologicalSort.js`. |
| A3 | Implementar Vista CSV editable | frontend | ✅ Completado | `views/csvView.js`. |
| A4 | Implementar Vista Grafo interactivo | frontend | ✅ Completado | `views/graphView.js`. |
| A5 | Implementar Vista Estructural | frontend | ✅ Completado | `views/structuralView.js`, `js/structural.js`. |
| A6 | Implementar Vista Ensamblaje + Simulador | frontend | ✅ Completado | `views/assemblyView.js`, `js/instructions.js`. |
| A7 | Implementar Vista Manual con diagramas SVG | frontend | ✅ Completado | `views/manualView.js`. |
| A8 | Implementar Vista Isométrica SVG | frontend | ✅ Completado | `js/isometricRenderer.js`, `js/svgEngine.js`, `views/isometricView.js`. |
| A9 | Calcular lista de herrajes/insumos | frontend | ✅ Completado | `js/hardware.js`. |
| A10 | Backend: endpoint para guardar ejemplos CSV | backend | ✅ Completado | `backend/app/routers/assembly_planner.py`. |
| A11 | Backend: catálogo de materiales y herrajes | backend | ✅ Completado | `backend/app/config/catalog.json`, `hardware_templates.json`. |
| A12 | Backend: router de cotizaciones y mejoras en servicios | backend | ✅ Completado | `backend/app/routers/quotes.py`, `quotes.py`, `catalog.py`. |
| U1 | Refactor UI: componentes base reutilizables | frontend | ✅ Completado | `frontend/src/components/ui/*`. |
| U2 | Refactor UI: layouts, providers, command palette | frontend | ✅ Completado | `frontend/src/components/layout/`, `providers/`, `command-palette/`. |
| U3 | Refactor UI: stores Zustand | frontend | ✅ Completado | `frontend/src/stores/`. |
| U4 | Refactor UI: mejoras en AssemblyPage y páginas principales | frontend | ✅ Completado | Build validado en Docker. `pnpm-lock.yaml` pendiente de generar en host. |
| D1 | Actualizar memorias DevHive y .kimi-memory.md | Guardian | ✅ Completado | Memorias locales + archivos versionados en `.devhive/`. |
| D2 | Versionar cambios en git por bloques | Guardian | ✅ Completado | Commits agrupados por funcionalidad. |
| A20 | Mejorar mensaje de ciclo con acciones directas | Guardian | ✅ Completado | Botones Ir al Grafo / Restablecer dependencias en manual y ensamblaje. 103 tests OK. |
| A16 | Campo `pos_z` + offsets configurables | assembly-planner-agent | ✅ Completado | ADR-0016. 101 tests frontend OK. |
| A17 | Panel de configuración de offsets verticales | assembly-planner-agent | ✅ Completado | ADR-0016 A16.7. 101 tests frontend OK. |
| A18 | Panel inline de offsets en vista isométrica | assembly-planner-agent | ✅ Completado | ADR-0016 A18. 103 tests frontend OK. |
| A19 | Catálogo de ejemplos CSV por espacio | Guardian | ✅ Completado | 14 muebles nuevos, selector por espacio, generador `scripts/generar-ejemplos-catalogo.py`. 103 tests frontend OK. |
| A21 | Vista completa del mueble | Guardian | ✅ Completado | Selector `Vista completa` agrupa módulos y globales; 107 tests OK. |
| A22 | Clasificación y render de divisores verticales | Guardian | ✅ Completado | Montante central y divisores izq/der se clasifican como `divider`; render vertical completo de base a tapa. 112 tests OK. |
| A23 | Riel colgador respeta altura configurada y pos_z | Guardian | ✅ Completado | `isometricRenderer.js` usa `getDefaultVerticalPosition`; test de integración; 114 tests OK. |
| A24 | Render de puertas globales (divididas o completas) | Guardian | ✅ Completado | Solo en `estructura`/`all`; reparten ancho del mueble; 117 tests OK. |
| A25 | Profundidad real en vista global/estructura | Guardian | ✅ Completado | `moduleD` usa todas las piezas; evita achatamiento por zócalo/corona. 117 tests OK. |

## Leyenda estados

- ⏳ Pendiente
- 🔄 En progreso
- ✅ Completado
- ❌ Bloqueado
- ⏸️ Pausado

## Bloqueadores activos

1. **Lockfile frontend**: el build de producción funciona en Docker con `pnpm install --no-lockfile`, pero no existe `pnpm-lock.yaml`. Para reproducibilidad offline hay que generarlo en host con `pnpm install`.

## Decisiones recientes del sprint

- **ADR-0011-2026-08-19**: Assembly Planner vanilla ES6 en `frontend/public/assembly-planner/` como complemento offline al ensamblaje React. Sin dependencias de framework.
- **ADR-0012-2026-08-19**: Refactor UI/UX progresivo con componentes base en `frontend/src/components/ui/`, Zustand para estado global y Tailwind exclusivo.
- **ADR-0013-2026-08-19**: Catálogo de materiales y herrajes en JSON estático bajo `backend/app/config/`, consumido por backend y frontend.

## Métricas actuales

- Tests backend: 23 passed.
- Tests frontend (React): build validado en Docker; tests unitarios no ejecutados por falta de lockfile.
- Tests Assembly Planner: 103 passed.
- Docker Compose MVP: frontend y backend validados por separado.
- Bugs críticos abiertos: 0.
- Agentes DevHive activos: 9 + 4 plugins.

## Hotfixes recientes (Assembly Planner)

- **Manual de ensamblaje**: repisas inferiores con `cantidad > 1` se apilan hacia arriba dentro del interior del mueble, evitando que se dibujen debajo de la base (`manualView.js`).
- **Grafo**: el layout estructural se recalcula y centra automáticamente al cambiar de pestaña o redimensionar el contenedor, usando `ResizeObserver` y reintentos por `requestAnimationFrame` (`graphView.js`).
- **Render isométrico**: perspectiva configurable con viewBox dinámico para evitar que piezas se salgan del SVG (`isometricRenderer.js`).

## Ejemplos CSV consolidados

Se unificaron y limpiaron los CSV de ejemplo del Assembly Planner:

- **Conservados en `frontend/public/assembly-planner/data/`**: básico, global, cajonera, closet, cocina, comoda, escritorio, librero-alto, mueble-tv, vanitory, armario, aparador, estantería, vitrina, mesa-extensible, cabecero, recibidor-lineal, consola, separador-ambientes, botellero, isla-cocina, columna-cocina, columna-auxiliar-bano, espejo-modulo, archivador, y ejemplos universales (cajonera, librero, ropero, zapatero).
- **Eliminados por no ajustarse al catálogo de muebles fabricables**: banco, mesa de centro, universal mesa y universal silla.
- **Eliminados por obsoletos/redundantes**: renders SVG de `test/renders/` y directorio `docs/temp-svg/`.

## Next actions

1. Instalar dependencias frontend (`pnpm install`) para generar `pnpm-lock.yaml` y validar build.
2. Validar Assembly Planner en navegador con ejemplos CSV.
3. Hacer commits agrupados por bloque funcional.
4. Coordinar re-indexación MCP tras cerrar el swarm.

## Criterios de éxito del MVP actualizado

- [ ] `docker compose up --build` levanta backend + frontend sin errores.
- [ ] Assembly Planner carga CSV, genera dependencias y manual SVG.
- [ ] Frontend React refactorizado compila (`pnpm build`).
- [ ] Tests backend pasan (`pytest -q`).
- [ ] No hay secretos hardcodeados ni defaults inseguros en el diff.

## Histórico

Ver historial completo en `.devhive/sprints/archive/` (cold). No se carga por defecto.
