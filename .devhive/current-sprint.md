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
| A26 | Clasificar zapateros como estantes | Guardian | ✅ Completado | `classifierService.js` detecta 'zapatero' como `shelf`; 118 tests OK. |
| A27 | Desactivar cache del Assembly Planner en nginx | Guardian | ✅ Completado | Location `/assembly-planner/` con `Cache-Control: no-cache`. 118 tests OK. |
| A28 | Offsets verticales por tipo de pieza | Guardian | ✅ Completado | `shelfMiddleGap`, `shoeRackBottomOffset`, `shoeRackGap` en config, lógica y UI. 120 tests OK. |
| A29 | Renderizador 3D SVG orbital | assembly-planner-agent | ✅ Completado | `js/renderer3d/`, `views/renderer3DView.js`, pestaña 3D en `index.html`. 240 tests OK. Validación visual en navegador pendiente por falta de headless browser. |
| A30 | Mejoras 3D: explode lines, orto↔perspectiva, BOM↔3D, section planes + hatch, modo paso (secuencia física: repisa→divisor, fondo pre-tapa, fondo corrido por eje), instrucción por paso + play, ghosting | Guardian | ✅ Completado | T1–T13 en `docs/PLAN_MEJORAS_3D_2026-09-02.md`. 290 tests OK. El ciclo del grafo Kahn del módulo 6 (zapatero universal) ya no se reproduce: `detectCycle = null`. |
| A31 | Apertura interactiva de puertas (bisagra/corrediza), cajones y zapateras (riel) | Guardian | ✅ Completado | Servicio puro `motionService.js` (hinge/slide/rail), integración en isométrico y 3D, slider 0–100% global y por pieza, doble-click toggle. ADR-0022. 372 tests OK. |
| A32 | Volquete pivotante + apertura completa | Guardian | ✅ Completado | Zapatera volquete como hinge side `inf` (trampilla −105°); extracción total de cajones (factor riel 1.0, Δy = apertura·(prof+20)). 372 tests OK. |
| A33 | Ejemplo Zapatera Repisa Riel | Guardian | ✅ Completado | Ejemplo 19: 6 bandejas extraíbles con frentes/laterales/bases bajas; CSV en `docs/` y `data/`; opción en selector. 377 tests OK. |
| A34 | Geometría real de piezas de cajón | Guardian | ✅ Completado | Servicio puro `drawerGeometryService.js` empareja laterales/base/fondo con su frente; caja real anclada al frente con medidas del CSV; fallback sintético si faltan piezas. 382 tests OK. |
| A35 | Ángulo de bisagra configurable + guía de colisión | Guardian | ✅ Completado | F1: `targetAngleDeg` clamp 0–120°, presets 45/70/90/110° + Auto, store `angulos` (evento `angulo:changed`). F2: `collisionService.js` (AABB con rotación, pares de móviles distintos), resaltado con color de alerta de `config.js`. 404 tests OK. |
| A36 | Sincronizar apertura con modo paso (F3) | Guardian | ✅ Completado | Servicio puro `stepApertureService.js`: piezas móviles del paso actual → apertura 1, anteriores → 0, salvo override manual persistente; snapshot/restauración al entrar/salir del modo paso. 415 tests OK. |
| A37 | Defaults de altura lógicos por tipo de pieza | Guardian | ✅ Completado | `drawerBaseOffset` 80→10, `braceBaseOffset` 80→0, `lowerShelfBaseOffset` 80→30, `topInset` 120→50; riel colgador clampado a `tapa−60` (módulos bajos). 419 tests OK. |

## Leyenda estados

- ⏳ Pendiente
- 🔄 En progreso
- ✅ Completado
- ❌ Bloqueado
- ⏸️ Pausado

## Bloqueadores activos

1. **Lockfile frontend**: el build de producción funciona en Docker con `pnpm install --no-lockfile`, pero no existe `pnpm-lock.yaml`. Intento 2026-09-02 en el entorno de desarrollo falló: sin acceso a `registry.npmjs.org` (offline). Debe generarse en un host con red: `cd frontend && pnpm install` y commitear el lockfile.
2. **Validación visual del renderizador 3D orbital**: implementación y tests unitarios listos, pero falta validación manual en navegador por no disponer de headless browser en el entorno actual.
3. **MCP codebase-memory — RESUELTO 2026-09-06**: el contenedor quedó en crash-loop por endpoint de red huérfano; se reconectó a `kimi-code_sipe-net` y se endureció el wrapper (`mcp-codebase-memory.sh`, espera de daemon hasta 120 s). Procedimiento de recuperación en `.kimi-memory.md` (sección Infra / MCP). `mcp.json` es read-only desde el agente; el re-apuntado al wrapper requiere edición en el host.

## Decisiones recientes del sprint

- **ADR-0011-2026-08-19**: Assembly Planner vanilla ES6 en `frontend/public/assembly-planner/` como complemento offline al ensamblaje React. Sin dependencias de framework.
- **ADR-0012-2026-08-19**: Refactor UI/UX progresivo con componentes base en `frontend/src/components/ui/`, Zustand para estado global y Tailwind exclusivo.
- **ADR-0013-2026-08-19**: Catálogo de materiales y herrajes en JSON estático bajo `backend/app/config/`, consumido por backend y frontend.
- **ADR-0021-2026-09-07**: Contrato de compatibilidad de ejemplos y tipos de zapatera (volquete, extraíble, banco). Gate obligatorio `test/validate-examples.mjs` (0 errores/0 warnings/0 roles genéricos). Ver `.devhive/decisions/ADR-0021-*.md`.

## Métricas actuales

- Tests backend: 37 passed (incl. contrato de plantillas `test_templates.py`).
- Tests frontend (React): build validado en Docker; tests unitarios no ejecutados por falta de lockfile.
- Tests Assembly Planner: 415 passed (node --test; incl. apertura interactiva ADR-0022: bisagra/corrediza/riel/volquete pivotante, ángulo configurable + colisión A35 y sincronización apertura↔modo paso A36).
- Ejemplos CSV: 77 archivos (data/ + docs/) validados con 0 errores / 0 warnings / 0 piezas con rol genérico (`test/validate-examples.mjs`, gateado en CI).
- Docker Compose MVP: frontend y backend validados por separado.
- Bugs críticos abiertos: 0.
- Agentes DevHive activos: 9 + 4 plugins.

## Hotfixes recientes (Assembly Planner)

- **App no cargaba (2026-09-10)**: `SyntaxError` en `js/views/isometricView.js` introducido por de3d811 — un `}` desplazado cerró `renderView` antes de tiempo y dejó el resto del cuerpo huérfano a nivel de módulo; el planner entero quedaba en blanco (seleccionar mueble/cargar sin efecto). El gate `node --test` no lo detectó porque ningún test importaba las vistas. Fix estructural + nuevo `js/smoke.test.js` que importa todos los módulos y simula seleccionar→cargar→render, cerrando la brecha.

- **Ejemplos coherentes (2026-09-07)**: los 75 CSV pasan de 259 warnings y 14 piezas genéricas a 0/0/0. Causa raíz corregida en los generadores (`cajon()` calcula el vano real del módulo padre); piezas sin rol renombradas (Respaldo, Travesano); zócalos = Σ anchos; pandeo por rol y no por substring; tapa/trasera globales huérfanas eliminadas en aparador y recibidor. Nuevos ejemplos: zapatera volquete, módulo extraíble y banco zapatero. Plantillas backend alineadas al mismo contrato (ADR-0021).
- **Herrajes**: 1 par de correderas por cajón (antes por pieza); frentes "abatible/volquete" generan bisagras abatibles; tiradores de cajón explícitos en la lista (`hardware.js`).
- **Manual de ensamblaje**: repisas inferiores con `cantidad > 1` se apilan hacia arriba dentro del interior del mueble, evitando que se dibujen debajo de la base (`manualView.js`).
- **Grafo**: el layout estructural se recalcula y centra automáticamente al cambiar de pestaña o redimensionar el contenedor, usando `ResizeObserver` y reintentos por `requestAnimationFrame` (`graphView.js`).
- **Render isométrico**: perspectiva configurable con viewBox dinámico para evitar que piezas se salgan del SVG (`isometricRenderer.js`).

## Ejemplos CSV consolidados

Se unificaron y limpiaron los CSV de ejemplo del Assembly Planner:

- **Conservados en `frontend/public/assembly-planner/data/`**: básico, global, cajonera, closet, cocina, comoda, escritorio, librero-alto, mueble-tv, vanitory, armario, aparador, estantería, vitrina, mesa-extensible, cabecero, recibidor-lineal, consola, separador-ambientes, botellero, isla-cocina, columna-cocina, columna-auxiliar-bano, espejo-modulo, archivador, ejemplos de fondo (externo/interno/custom), ejemplos universales (cajonera, librero, ropero, zapatero) y zapateras (compartimentos, volquete, extraíble, banco).
- **Eliminados por no ajustarse al catálogo de muebles fabricables**: banco, mesa de centro, universal mesa y universal silla.
- **Eliminados por obsoletos/redundantes**: renders SVG de `test/renders/` y directorio `docs/temp-svg/`.
- **Deuda**: pares homónimos no unificados (`ejemplo-cajonera` vs `Cajoneras_4_Modulos`; `universal-*` vs `Universal`) — son diseños distintos, consistentes cada uno, pero el catálogo docs/ ↔ data/ no es 1:1.

## Next actions

1. Generar `pnpm-lock.yaml` en un host con acceso a npm (`cd frontend && pnpm install`) y commitearlo.
2. Validar el Assembly Planner y el modo paso 3D en navegador con ejemplos CSV (Chrome/Firefox/Edge).
3. ~~Coordinar re-indexación MCP tras cerrar el swarm~~ — Hecho 2026-09-07 (índice + ADR persistidos en `codebase-memory-mcp`).

## Criterios de éxito del MVP actualizado

- [ ] `docker compose up --build` levanta backend + frontend sin errores.
- [ ] Assembly Planner carga CSV, genera dependencias y manual SVG.
- [ ] Frontend React refactorizado compila (`pnpm build`).
- [ ] Tests backend pasan (`pytest -q`).
- [ ] No hay secretos hardcodeados ni defaults inseguros en el diff.

## Histórico

Ver historial completo en `.devhive/sprints/archive/` (cold). No se carga por defecto.
