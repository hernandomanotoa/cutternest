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
| A38 | Zócalo-cajón full-width sin base + ejemplos | Guardian | ✅ Completado | Rol `plinth_side`; detección por datos (con laterales → cajón visible 0..H; solo frente → patín intacto); base del módulo sigue con el módulo apoyada a z=zocaloHeight. 3 ejemplos nuevos (closet/cómoda/mueble TV). 425 tests OK, 83 CSV 0/0/0. |
| A39 | Tipos de riel con holguras reales (Häfele/Blum) | Guardian | ✅ Completado | S1 `RAIL_TYPES`+`railService` (telescópica 12,7 mm/lado, oculta vano−42, ruedas 12,5, ligera 10; extracción 1,0/0,75) y holgura bilateral en geometría; S2 herrajes/instrucciones por tipo; S3 ejemplo 23 correderas ocultas. 453 tests OK, 85 CSV 0/0/0. Deuda: validación de fondo de cajón es telescópica-específica. |
| A40 | Refactor por capas del planner completo | Guardian | ✅ Completado | Todos los módulos de la raíz de `js/` movidos a su capa: `services/` (csvParser, heuristics, structural, instructions, topologicalSort, hardware), `components/renderers/` (isometricRenderer como orquestador de 16 módulos en `renderers/isometric/`, svgEngine), `utils/helpers.js`. Nuevos componentes: `toast.js`, `aperturaControls.js`, `moduleSelector.js`, `domUtils.js`. `vendor/` con html2canvas+jspdf (manual PDF en cliente). Tests DOM de vistas con happy-dom (`test/views/*.dom.test.js`, runner aparte `pnpm test:dom`). 748 tests node --test + 9 DOM OK, 85 CSV 0/0/0. |
| A41 | Infra de tests frontend React + CI | Guardian | ✅ Completado | Vitest excluye `e2e/` (Playwright aparte), nuevos componentes `OtpInput` y `ConfirmDialog` con tests, ajustes en páginas auth/proyectos, `vite.config.ts`. Workflow `.github/workflows/ci.yml` con 3 jobs: backend pytest, frontend (install + test + build), planner (node --test + validate-examples). 86 tests Vitest OK, build OK. Pendiente: generar `pnpm-lock.yaml` con red para que `pnpm install --frozen-lockfile` funcione en CI. |
| A42 | Migración passlib→bcrypt (backend) | backend-agent | ✅ Completado | `security.py` usa `bcrypt` puro (gensalt rounds=12, normaliza `$2y$→$2b$`, hashes inválidos → False). Eliminado passlib de requirements; desaparece DeprecationWarning de `crypt` (Python 3.13). 43 tests OK. Deuda: warning PydanticDeprecatedSince20 en `config.py` (sin tocar). |
| A43 | Code-splitting: three/charts fuera del bundle inicial | frontend-agent | ✅ Completado | `manualChunks` fija react/react-dom/scheduler/zustand en `vendor` estático (Rollup los hoisteara dentro de `three`/`charts` y los hacía carga inicial). `Assembly3DV2` lazy con Suspense; `getModuleColor` extraído a `moduleColor.ts` libre de three. Carga inicial ~1567 kB (gzip 440) → ~285 kB (gzip 94), −82 %. 97 tests Vitest OK, build OK. |
| A44 | Cobertura React: Optimizer/Inventario/Cotización | test-agent | ✅ Completado | 11 tests nuevos: OptimizerPage (7: render, empty, agregar pieza, submit con prompt+loading, 3 errores vía toast mockeado), InventoryPage (+2 errores), QuotePage (+2 errores). No existe QuotesPage: la página es `cotizacion/QuotePage.tsx`. 97 tests OK. |
| A45 | Tests DOM isométrica/3D + fix bug real | assembly-planner-agent | ✅ Completado | 9 tests DOM nuevos (18 total). Bug encontrado: `aperturaControls` usado en template HTML antes de su creación (`TypeError` en mount con piezas); fix mínimo en `renderer3DView.js`. `setup.mjs` añade global `CSS` (happy-dom). 18/18 DOM, 772 node --test OK. |
| A46 | Multi-módulo en vista 3D con gap 20 mm | assembly-planner-agent | ✅ Completado | Servicio puro `moduleLayout.js` (`ensureModuleGap`, gap exacto, nunca reduce gap mayor). `renderer3D.js` en `ALL_MODULE_ID` aplica gap y deriva `moduleW`/centro/perspDistance de la caja envolvente real. 8 tests nuevos. Selector "Vista completa" ya existía; explode/transparencia/selección siguen por pieza. |
| A47 | Deuda catálogo + validación fondo por tipo de riel | assembly-planner-agent | ✅ Completado | (a) Catálogo docs↔data: 45 gemelos byte-idénticos verificados por test nuevo (`catalogoConsistency.test.mjs`); correspondencia documentada en `data/README.md`. (b) `railService.js`: helpers `drawerBoxInteriorWidth`/`drawerBoxMaxHeight` por tipo de riel (telescópica 12,7/lado, ruedas 12,5, ligera 10, oculta vano−42 / vano−23 alto); `csvParser.js` valida ancho y altura de fondo (embutido o apoyado), volquete exento. 94 CSV 0/0/0. |
| A48 | Specs E2E Playwright ampliadas | test-agent | ✅ Completado | `planner-examples.spec.ts` (9 tests: 3 ejemplos × iso+3D con screenshots a `e2e/screenshots/`, ignorado por git) y `app-guest-pin.spec.ts` (3 tests con skip condicional por URLs de entorno). NO ejecutables en este entorno offline (sin browsers); listos para CI con `playwright install chromium`. |
| A49 | Frente opcional de la zapatera (bandeja abierta por defecto) | Guardian | ✅ Completado | `conFrente=false` default en `addShoeTray` (sin frente ni tirador; la cara es el frente visible; botas y riel marco fuerzan frente). Anclaje pos_z por cara, promoción a `drawer_face` en `drawerGeometry`, chip de contenido vía cara en `renderContentList` (fix: la bandeja abierta desaparecía de la lista). Pref `contentFrenteZapatera` + checkbox. 5 tests DOM alineados + 3 nuevos. Commits `adcbaa8`+`1489e39`. |
| A50 | Fixes de bandeja abierta (contador, apilado por vano) | Guardian | ✅ Completado | `countByKind` cuenta por grupo (max frentes/caras) — el contador '+ Zapatera (N)' se quedaba en 0 sin frente (`5491704`). Las unidades reservan SU vano en el cursor: `asignarPosZInsercion` recibe `altoVano` y `cursorInsercion` reconstruye `cara+33` (antes las bandejas se pisaban ~30 mm) (`77ea067`). |
| A51 | Gola con zapateras de frente: reparto con piso + fijas | Guardian | ✅ Completado | `reparteConPiso` (aire solo a unidades con holgura, mayor resto; cada frente ≥ caja+10; Σ+gaps=span exacto) — el proporcional dejaba cajones bajo su caja en módulos mixtos. Frentes de zapatera FIJOS en su tipo (`fijoEnGola`); validaciones del span con nota del fijo; solo-zapateras exige cuadrar; cap de la L no aplica a fijas; aviso de hueco bajo el canal L (`8c3664e`, `2fce0e4`). |
| A52 | Tipo 'bandeja a la vista' + contrato de tipos (3 fases) + default con frente + tipos custom | Guardian | ✅ Completado | Bandeja a la vista: lados iguales al rim 120 (`f236ae8`). Fase 1: tag `[tipo]` en el nombre (sobrevive al CSV), consumo por contrato no regex (`17d0aec`). Fase 2: contrato completo (`conFrenteDefault`, `cajaDelta`, `rim`), `vanoDesdeCara`, zapateras CON frente por defecto (`3cfee53`). Fase 3: `customTypesService` + panel 'Tipos personalizados del taller' (CRUD validado, inyección en catálogos en vivo; `inferRole` ignora el tag — bug real) (`b1b0525`). 1010 unit + 129 DOM OK, 94 CSV 0/0/0. |

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

- Tests backend: 43 passed (bcrypt puro desde A42; sin deprecation de crypt).
- Tests frontend (React): 97 passed (Vitest, 21 archivos); build de producción OK con three/charts lazy (carga inicial −82 %, A43).
- Tests Assembly Planner: 1010 passed (node --test) + 129 tests DOM de vistas (happy-dom, `pnpm test:dom`).
- Ejemplos CSV: 94 archivos validados con 0 errores / 0 warnings / 0 piezas con rol genérico (`test/validate-examples.mjs`, gateado en CI); correspondencia docs↔data verificada por test (A47).
- E2E: 12 specs Playwright nuevos (planner con screenshots + guest PIN), no ejecutables en este entorno offline — requieren `playwright install chromium` (A48).
- CI: `.github/workflows/ci.yml` corre pytest, Vitest + build y la suite completa del planner en cada push/PR (requiere `pnpm-lock.yaml`, pendiente de generar con red).
- Docker Compose MVP: frontend y backend validados por separado.
- Bugs críticos abiertos: 0.
- Agentes DevHive activos: 9 + 4 plugins.

## Hotfixes recientes (Assembly Planner)

- **Vista 3D en blanco en Docker (2026-10-13)**: el contenedor `cutternest-frontend` servía una versión obsoleta de `renderer3DView.js`/`renderer3D.js` (imagen construida antes del fix A45 del bug `aperturaControls`), por lo que la pestaña 3D crasheaba al montar con piezas. No era un bug nuevo del código: el working tree ya tenía el fix y los tests DOM lo cubren (4/5 fallan con la versión vieja, 5/5 pasan con la actual). Fix operativo: `docker compose up -d --build frontend` y verificación de hashes servidos vs working tree. Lección: tras cambios en el planner, siempre comparar `md5sum` de los archivos servidos dentro del contenedor antes de asumir un bug de código.

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

0. Commitear el trabajo validado (A40 refactor por capas + A41 infra de tests/CI) en bloques, con confirmación del usuario.
1. Generar `pnpm-lock.yaml` en un host con acceso a npm (`cd frontend && pnpm install`) y commitearlo — requisito para que el job de CI `pnpm install --frozen-lockfile` funcione.
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
