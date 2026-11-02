# Guía de agentes de código - CutterNest

Guía orientativa para agentes que trabajan en `/workspace/cutternest-kit`. Antes de cualquier cambio, revisa esta guía y el estado actual del repositorio; no asumas comportamientos que no estén reflejados en el código.

## 1. Arquitectura del sistema

### Backend

- **Framework**: Python 3.11 + FastAPI + Uvicorn + TypeScript-style Pydantic models.
- **Base de datos**: SQLite para MVP (archivo local en `./data/cutternest.db`, mapeado a `/app/data/cutternest.db` en el contenedor). PostgreSQL en Fase 2. El backend aplica migraciones automáticas al inicio para añadir columnas/tablas faltantes y normalizar valores obsoletos de enums.
- **Caché/sesiones**: sin cache externo en MVP; SQLite maneja sesiones y blacklist simples. Redis opcional en Fase 2 para rate limiting y token blacklist.
- **Optimizador**: `rectpack` (MaxRectsBssf / PackerGlobal + PackerBBF) para nesting de piezas sobre tableros; validación `PIECE_TOO_LARGE`, kerf/margen configurables y soporte de sobrantes.
- **Directorios clave**:
  - `backend/app/main.py`: punto de entrada FastAPI.
  - `backend/app/models.py`: modelos Pydantic + SQLAlchemy.
  - `backend/app/database.py`: conexión SQLite con SQLAlchemy (async `aiosqlite` o sync según decisión).
  - `backend/app/optimizer.py`: lógica de optimización de cortes.
  - `backend/app/svg_generator.py`: generación de layouts SVG y PNG con Pillow (sin `cairosvg`).
  - `backend/app/assembly.py`: lógica de ensamblaje, heurísticas de dependencias, niveles topológicos (Kahn) y generación de pasos.
  - `backend/app/routers/projects.py`: routers de proyectos, incluyendo endpoints de ensamblaje (`/assembly`, `/assembly/generate`, `/assembly/plan`).
  - `backend/app/pdf_generator.py`: cotizaciones, cut lists, etiquetas y manuales de ensamblaje con ReportLab.
  - `backend/app/auth.py`: autenticación local TOTP + Guest PIN.
  - `backend/app/inventory.py`, `quotes.py`, `assembly.py`, `templates.py`: servicios de negocio.
- **Autenticación**: local TOTP (pyotp + qrcode) + Guest PIN; sin LDAP, SMTP, SMS, WhatsApp ni OAuth en MVP.
- **Endpoints**: prefijo `/api/v1/` (`/api/v1/optimize`, `/api/v1/projects`, `/api/v1/projects/{id}/assembly/plan`, `/api/v1/inventory`, `/api/v1/auth/*`, etc.).
- **Sobrantes (offcuts)**: tabla `offcuts` (material, width/height/thickness_mm, quantity) con CRUD en `/api/v1/inventory/offcuts` (POST/DELETE) y listado en `/api/v1/inventory/offcuts/registry` (el GET en `/api/v1/inventory/offcuts` sigue reservado al endpoint preexistente de sobrantes derivados de `Inventory`). `/api/v1/optimize` acepta `use_offcuts: bool = False`: con `true` empaqueta primero en sobrantes coincidiendo material+espesor, marca los placements con `en_sobrante`/`offcut_id` y decrementa `quantity` (la fila se elimina al llegar a 0).
- **Exportaciones**: SVG, PNG, PDF y CSV se generan en `/app/data/exports/` y se sirven como estáticos.

### Frontend

- **Framework**: React 18 + Vite + TypeScript + Tailwind CSS.
- **3D**: Three.js vía `@react-three/fiber` + `@react-three/drei` para layouts de tableros y ensamblajes.
- **Rutas y estado**: React Router DOM; hook `useAuth` para contexto de sesión.
- **API**: cliente HTTP centralizado con fetch/axios, cookies/httpOnly según decisión de Fase.
- **Directorios clave**:
  - `frontend/src/components/mueble/AssemblyPage.tsx`: página de ensamblaje con modos Asistente, Planificador y Vista previa.
  - `frontend/src/components/mueble/Assembly3DV2.tsx`: escena 3D de piezas y conectores.
  - `frontend/src/components/mueble/AssemblyPlanner.tsx`: editor visual de dependencias (grafo SVG).
  - `frontend/src/components/mueble/LevelTimeline.tsx`: timeline de niveles topológicos.
  - `frontend/src/components/mueble/AssemblyManual.tsx`: descarga de manual HTML y PDF.
  - `frontend/src/utils/topologicalSort.ts`: utilidad Kahn propia para niveles y detección de ciclos.
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
- **Reindexar MCP**: si un agente toca archivos fuente en un componente, el Guardian debe coordinar la re-indexación del proyecto en `codebase-memory-mcp` antes de cerrar el swarm. Si el MCP no responde, revisar primero la salud del contenedor Docker `codebase-memory-mcp` (recuperación: `.agents/skills/mcp-query.md`); Kimi Code conecta los MCP stdio solo al iniciar sesión, así que tras recuperar el contenedor hace falta una sesión nueva para verlo conectado (`/mcp`).
- Antes de realizar cambios amplios, consulta estos archivos para entender decisiones previas y contexto activo.

### Componentes del Assembly Planner (`frontend/public/assembly-planner/`)

El Assembly Planner se organiza por capas con responsabilidades definidas. Cuando un agente trabaje en él, debe atacar solo la capa correspondiente y no mezclar lógica de presentación con geometría pura ni con servicios de negocio:

- **`js/core/`**: infraestructura transversal (`store.js`, `config.js`, `gapPresets.js`). Cambios de estado global, colores, Z-index y thresholds van aquí. `gapPresets.js` define defaults de offsets/gaps por mueble (clave = nombre del CSV en `data/`); se versionan en el repo y se aplican bajo las ediciones del usuario (localStorage) vía `userConfigService` (`setActivePreset`/`loadUserConfig`).
- **`js/utils/`**: utilidades puras sin DOM (`normalize.js`, `helpers.js`). No deben importar nada de `views/`, `services/` ni `components/`.
- **`js/services/`**: lógica de negocio pura y testeable (`csvParser.js`, `heuristics.js`, `structural.js`, `instructions.js`, `topologicalSort.js`, `hardware.js`, `classifierService.js`, `geometryService.js`, `isoGeometryService.js`, `assemblyStepService.js`, `collisionService.js`, `railHardwareService.js`, `closetBuilderService.js`, `projectVersionsService.js`, `cutOrientationService.js`). No deben tocar DOM ni SVG.
  - `cutOrientationService.js`: **tabla maestra de clasificación de veta** (Fase 0) — fuente única del flag `rotate` por rol (classifierService): piezas de vista horizontal (frentes, puertas, repisas, tapas, golas, divisiones de zapatera) y vertical (costados, divisores de vano) con `rotate` bloqueado (`no`, veta obligatoria) y piezas ocultas/estructurales (bases, laterales internos de cajón, traseras, caras, fondos, zócalos, amarres, refuerzos, barras, patas) con `rotate` libre (`si`, ahorro de material). La veta de la pieza corre a lo largo de su primera medida (`ancho` del CSV) cuando rotate es `no`; **El fondo del módulo (`back_panel`) lleva la MISMA veta que los laterales (vertical, spec taller): es pieza de vista en la tabla, se emite como ancho = alto del mueble (− zócalo), alto = ancho interior, y la migración legacy lo detecta comparando contra la altura del módulo (ancho almacenado de sus laterales, tolerancia −2·E por el embutido).** `proyectaCorte`/`proyectaMueble` proyectan entre orientación de corte (la del CSV: la veta va en la primera medida) y orientación de mueble (la del renderer): costados, divisores de vano y fondo se emiten como ancho = alto del mueble, alto = profundidad/espesor/ancho, y `geometryService.getPieceDims` los proyecta de vuelta POR ROL (el flag rotate ya no intercambia dims — solo indica libertad de rotación en el optimizador). `migraPiezasACorte` convierte CSV legacy en `csvParser.parseCSV` (único punto de migración: versiones locales y autoguardado se re-parsean como CSV); `buildAuditReport` también normaliza al entrar. Las piezas ocultas (drawer_side/drawer_back/drawer_part/bottom_panel) se quedan en dims de mueble (sin swap, rotate libre); el fondo de módulo ya NO es oculto (vista vertical, arriba). El Constructor (piece() de closetBuilderService) deriva el rotate de esta tabla vía el opt `rol` y el tapacantos por defecto del preset `cantos` (guía del taller: solo caras visibles — frentes perímetro, repisas/golas T,B, ocultas sin canto; laterales conservan su literal L/R por lado); la auditoría de veta (auditarVeta) consume la misma tabla: incumplimiento = pieza de vista con rotate (nivel error), y las ocultas reportan fila informativa `libres` por módulo+rol. En el optimizador (backend/app/optimizer.py) la veta se fuerza en dos fases: las piezas rotate=false se pre-orientan paralelas al `eje_veta` del tablero (BoardInput.eje_veta, configurable en la UI del Optimizador) y se empacan sin rotación; cada placement reporta `veta: horizontal|vertical|libre`.
  - `closetBuilderService.js`: constructor puro de piezas de clóset (casco con opción `baseInterna` para que la base se apoye sobre el zócalo, zócalo interno, repisa con refuerzo ≥600 mm de luz, cajón/zapatera de 6 piezas SIN tirador — apertura sin jaladera — con submódulos concatenados tipo `'11'`, barra simple/doble con `pos_z`; la zapatera de catálogo "marco regulable" es solo el frente, también sin tirador). Modos del frente de zapatera (`addShoeTray(modoFrente)`, 3 modos — **los selects 'Tipo cajón'/'Tipo zapatera' se eliminaron del UI**: la altura la fija el input 'Vano (mm)' y la forma el modo; el servicio sigue aceptando `tipoId` para CSV legacy y los catálogos DRAWER_TYPES/SHOE_RACK_TYPES siguen versionados): **`normal` (default del servicio y de la UI)** = frente CORTO que **no cubre el vano**: mide bandeja + `ZAPATERA_FRENTE_DROP` (30 mm, `core/contentTypes.js`); el aire superior del vano queda abierto para el calzado y la unidad reserva SU vano completo en el apilado. La bandeja va de **borde uniforme** al alto configurado (`altoLateral`, default `RAIL_SIDE_HEIGHT` 100 mm — input "Alto zapatera" de la tarjeta): cara = laterales = fondo = división; validación `altoLateral + 30 ≤ altoVano` con error con consejo. `extendido` = frente completo (≡ ex-tipo botas: frente = vano − 3, SIN cara, apilado flush); `personalizado` = alturas independientes (con frente la cara siempre = frente − 2·E; **sin frente el input 'altoFrente' pasa a ser el alto de la CARA** — vacío = cara alta = cajaCap: así vive la 'bandeja a la vista' como personalizado con las 4 alturas iguales). `conFrente=false` deja la bandeja sin frente (cara alta visible por defecto). Los cajones nuevos van SIN tag; las zapateras del Constructor estampan un **tag de vano genérico `[vN]`** (`vanoTagId`/`getContentType` resuelve un contrato sintético fijoEnGola) para que la reserva de vano del apilado y el gola sobrevivan al CSV — mismo mecanismo que el tag [tipo] legacy. Los modos legacy se rechazan; las exenciones data-driven por geometría del CSV (bandeja de borde uniforme frente==cara en csvParser/golaService/despieceAuditService) se conservan para CSV legacy. En gola las zapateras son unidades fijas (`fijoEnGola`): el aire de su vano absorbe el reparto y el span se cuadra con aire abierto encima de la pila (no se exigen frentes altos). La unidad reserva su vano completo en el apilado (detección data-driven: frente de zapatera más bajo que su vano de contrato `[tipo]`, o la diferencia exacta frente−cara = 30). `rootModuleIds()` distingue raíces de submódulos en ambas convenciones (`'11'` e `'1.2'`). Devuelve objetos pieza (`{ok, pieces}` o `{ok, errors}`); el shape usa `rotate` booleano como `validatePiece` de csvParser. Fórmulas espejo de `scripts/lib/cajonModel.mjs` (el generador de ejemplos del catálogo aún emite tirador en los CSV de ejemplo).
  - `golaService.js`: sistema de apertura sin tiradores activable por módulo (`enableGola`/`disableGola` en `app.js`) o **en modo global**: el toggle 'Modo gola' de Datos generales (`setGolaModoGlobal`) aplica/retira el sistema en todos los módulos elegibles (≥2 cajones móviles) de una sola acción de undo, y la preferencia persistida (`golaModoGlobal` en userConfig) hace que los módulos nuevos lo hereden al alcanzar 2 cajones (`addContentToModule` re-aplica vía `reapplyGolaPieces` en el mismo paso). **Modelo B2 (spec taller)**: los frentes móviles **crecen +30 mm (GOLA_LABIO_MM)** al aplicar gola — el LABIO cuelga sobre el canal y el dedo engancha su borde inferior por detrás (nunca se reducen; las zapateras quedan fijas en su altura de tipo; sin rebaja de cajas — `golaMaxRebajaCaja` en desuso). El gap gola = `30 (labio) + golaPaso + golaPerfilHeight + golaPaso` (86 mm con defaults) y reemplaza a `drawerFrontGap`; el aire que sobra queda libre sobre el último frente y si el vano no alcanza falla con consejos (subir repisa / bajar primer cajón / reducir cajones). **La gola TAPA el espacio entre cajones** (spec taller): los frentes quedan a la **entrada de dedos** de distancia (gap visible = `golaEntradaMm`, default 30 mm = medida de taller, configurable en el panel; reemplaza a `drawerFrontGap`) y el canal vive **DETRÁS de los frentes** — la gola cubre todo lo demás. **Canales SOLO entre CAJONES**: ni entre zapateras ni zapatera↔cajón (las zapateras son fijas en su tipo; el toggle solo se ofrece con ≥2 cajones). El gap del apilado NO es uniforme: tras un cajón es la entrada (ahí vive el canal) y tras una zapatera es `max(entrada, vanoTipo − frente)` — respeta el vano de contrato del calzado (la validación de altura libre entre niveles, `shoeClearanceService`, queda ≥ mínimo). **Las zapateras son anclas inamovibles**: al aplicar el gola su posición y medida NO varían; los cajones se apilan desde el techo de la unidad anterior y, si un tramo de cajones no cabe antes de una zapatera fija, `applyGola` falla con consejo (reducir cajones del tramo / tipos más bajos / mover la zapatera antes de aplicar). **3 piezas de melamina 15 mm por gap** (mismo material/color del módulo, rol `gola_strip`): `-ala-inf`/`-ala-sup` (labios horizontales DETRÁS de los frentes, en la zona del voladizo o = (frente − cara)/2 = 30, **casi topando las caras**; largo = retranqueo + espesor del fondo − 2 mm, traslapan el fondo) + `m{mod}gola-c{i}-fondo` (panel vertical INTERNO que conecta las alas por la cara posterior, cara frontal a `golaStripSetback` —default 60—, alto = 2·labio = la zona que tapa). Entre las alas queda el hueco de la mano (abertura útil 54 mm con defaults: entrada 30 + 2·30 − 2·15 − 2·3; crece con `golaEntradaMm` — el dedo entra por el gap visible y engancha el **labio** del frente superior por detrás, túnel de 30). Con el labio (configurable, `golaLabioMm`, default 30), **frente = cara + 2·E + labio** (60 con defaults), voladizo **centrado** respecto de la caja (`drawerGeometryService` reparte `(frente − caja)/2` arriba y abajo; con el frente clásico caja + 2·E coincide con el anclaje histórico). La luz de la mano la audita `despieceAuditService` (≥25 mm; con el Constructor estándar: 30 + 2·30 − 2·15 − 2·3 = 54). SOLO entre cajones (sobre el último frente queda el gap habitual); `applyGola` elimina los tiradores del módulo si los hay (CSV legacy) y `removeGola` NO los regenera (meta de round-trip en localStorage `cn-assembly-gola`, gestionado por `app.js` — el servicio es puro; al editar dimensiones, `editModuleDimensions` resta el labio del vano al regenerar cajones para conservar la caja real y re-aplica el gola en la misma acción). Parámetros `gola*` versionados en `core/config.js` como `GOLA_PERFIL_TALLER` (fuente: 'taller-medido', editable; `GOLA_DEFAULTS` deriva de ahí); en desuso por retrocompat (sin efecto): `golaFingerClearance`, `golaMaxOverhang`, `golaMaxRebajaCaja`, `golaPerfilHeight` (el cuerpo se deriva de 2·labio); `golaStripDepth` se eliminó antes. Soporta **config por módulo**: overrides parciales por módulo en localStorage `cn-assembly-gola-cfg` (merge `GOLA_DEFAULTS ← userConfig ← módulo` vía `getGolaCfg`; el panel de la tarjeta edita el módulo y la global queda como fallback), con re-aplicación en `setGolaModuleConfig` y persistencia en versiones locales (`golaModuleCfgs`). Render: `components/renderers/isometric/golaGeometry.js` (fondo interno + 2 alas + marcas del agarre `gola_grip` a ras de la espalda de los frentes, solo paso superior de cada canal C). Extras: `previewGola` (dry-run con plan para la vista previa de activación), `golaReport` (filas para la sección "Perfiles gola" del manual), validación de retranqueo excesivo en profundidad en `validateGola`, y re-aplicación automática del gola en `editModuleDimensions` / metas en versiones locales. La auditoría de despiece (`despieceAuditService.js`) controla la luz libre del canal de la mano (≥40 mm, excluyendo el labio) y la colisión caja-gola (≥60 mm bajo el frente — el Constructor cumple justo: 2E + 30 del labio). Reglas y limitaciones: `docs/assembly-planner-constructor.md` (sección "Sistema gola").
  - `projectVersionsService.js`: CRUD de versiones del diseño en localStorage (`cn-assembly-versions`, máx. 50, esquema versionado); el payload se guarda como CSV y `loadVersion` re-parsea para derivados limpios.
- **`js/components/`**: mini-componentes sin estado propio, reutilizables por las vistas (`graph/graphLayout.js`, `manual/manualExporter.js`, `toast.js` para notificaciones, `aperturaControls.js` + `moduleSelector.js` compartidos por las vistas isométrica/3D, `domUtils.js` para helpers DOM, `tour/driver.js` (motor de tour de onboarding: tooltips posicionados, highlight, Escape, "visto" en localStorage; los pasos viven en `js/data/golaTour.js` y la vista del Constructor decide cuándo lanzarlo), y `renderers/` con `isometricRenderer.js` —orquestador de 16 módulos en `renderers/isometric/`— y `svgEngine.js`). Pueden usar DOM si es necesario, pero no deben depender del store.
- **`js/renderer3d/`**: vista 3D orbital (renderer SVG propio, NO WebGL): `renderer3D.js` (orquestador), `camera.js` (OrbitControls + proyección ortho/persp), `svgBuilder.js`, `moduleLayout.js` (`ensureModuleGap`, gap 20 mm entre módulos — la constante `MODULE_GAP_MM` vive en `core/config.js` y se re-exporta aquí por compat), `geometry.js`, `transform.js`, `interaction.js`. Contratos clave: `load(moduleId, pieces)` reutiliza `IsometricRenderer.computeGeometries` para el layout (misma geometría que la iso); `resize(w, h)` actualiza el lienzo y re-encuadra (lo dispara un `ResizeObserver` en `renderer3DView.js` — es lo que hace que la pantalla completa funcione); el re-encuadre recalcula también `perspDistance` (`_recalcularPerspDistance`, invocado desde `_fitCameraToModule` en load y resize); `_fitCameraToModule()` encuadra al 75% del viewport con tope de escala proporcional al viewport (`0.21 × max(1, min(w/900, h/600))`), de modo que el mueble ocupa la misma fracción de pantalla en cualquier tamaño de ventana. Guía detallada del Constructor (arquitectura, contratos, bugs históricos, tests): `docs/assembly-planner-constructor.md`.
- **`js/views/`**: vistas con ciclo de vida `{ mount, destroy }` y suscripción al store (`csvView.js`, `constructorView.js`, `structuralView.js`, `isometricView.js`, `renderer3DView.js`). Aquí vive la UI y el pegamento con `app.js`. (El grafo de dependencias y el manual viven en el frontend React: `AssemblyPlanner.tsx` y `AssemblyManual.tsx`.)
  - Interacción gráfica (E6): el esquema frontal tiene zoom (+/−/ajustar en el caption y rueda del ratón, factor por módulo ≤4, viewBox centrado) y cross-highlight esquema↔chips (hover bidireccional por `data-ref`, clases `is-highlighted`, sin lógica de negocio). El esquema deriva siempre de las piezas reales.
  - Panel derecho de la app (E7): pestañas Resumen/Piezas/Materiales/Herrajes/Alertas (activa persistida `cn-summary-tab`; contracción `cn-summary-collapsed`; <860px overlay). Piezas = conteo por rol, Materiales = agregado color·espesor, Alertas = `state.warnings`; todo se rellena en `app.js updateSummary` (tolerante a DOM parcial).
  - Navegación del Constructor (ahorro de espacio central): la sección 02 «Módulos y contenido» arranca OCULTA — solo muestra el módulo SELECCIONADO en el riel (`selectedModuleId` en la vista; el resto de las tarjetas queda en el DOM con `cn-constructor__module--concealed`). «+ Añadir» del riel muestra «Datos generales» (01) con el grupo «Nuevo módulo» EXPANDIDO (tras cada alta queda colapsado hasta el siguiente «+ Añadir»); el clic en un módulo del riel lo revela (expande, scroll, flash y marca activo). Al agregar, el creado queda seleccionado y visible; la selección (persistida en localStorage) sobrevive al cambio de pestaña, y si queda stale se revela el primer módulo por defecto (placeholder solo sin módulos).
  - `constructorView.js`: pestaña "Constructor" — armado paso a paso de clósets (agregar/editar/reordenar/duplicar módulos, contenido: repisa/cajón/zapatera/barra/zócalo, eliminación individual) + gestión de versiones locales (guardar/cargar/renombrar/duplicar/exportar) y en la nube (botón ☁, requiere sesión; ver `designVersionsClient.js`). Delega 100% en `closetBuilderService`, `projectVersionsService`, `designVersionsClient` y las acciones de `app.js`.
- **`js/app.js`**: orquestador global. Expone acciones al store y coordina el renderizado de vistas. Es el único módulo de producción en la raíz de `js/`; la raíz solo contiene además algunos `*.test.js` de integración. Acciones del Constructor (todas re-derivan dependencias con `sugerirDependencias` y toman snapshot de la pila de deshacer): `addModuleFromBuilder` (N módulos, zócalo configurable, preset closet), `addContentToModule` (shelf/rail/doubleRail/zocalo/drawer/shoeRack), `removeModule`, `removeContentPiece`, `duplicateModule`, `duplicateAllModules`, `recolorModule`, `editModuleDimensions` (reajusta casco Y contenido al nuevo vano; aborta si un cajón no cabe), `moveModule` (◀ ▶ intercambio con el vecino y ⇤ ⇥ salto al principio/fin; renumera las raíces a 1..N vía `renumerarRaices`, migrando metas gola y configs por módulo) y `removeModule` (al eliminar, compacta la numeración: el hueco se cierra y los siguientes renumeran), `clearAllPieces`, `focusModule` (ver módulo en iso), `undoLast`/`canUndo` (Ctrl+Z, pila de 25 snapshots), versiones locales (`saveCurrentVersion`, `loadVersionById`, `renameVersionById`, `duplicateVersionById`, `exportVersionCsv`, `isDesignDirty`) y nube (`saveCurrentVersionToCloud`, `loadCloudVersionById`, `deleteCloudVersionById` vía `designVersionsClient.js`). `updateSummary`/`updateModuleSelector` son tolerantes a DOM parcial (no asumen el chrome completo de la app). **Autoguardado**: `initAutosave` (suscripción al store con debounce ~2 s) persiste las piezas en localStorage (`cn-assembly-autosave`, vía `projectVersionsService.saveAutosave`); `restoreAutosave`/`discardAutosage` —el banner "Recuperar último mueble" lo dibuja `constructorView` cuando el store está vacío y hay clave— y `hasAutosave` completan la red de recuperación.

**Regla de oro**: si una función no necesita DOM, no debe vivir en una vista; si una función no necesita SVG, no debe vivir en un renderizador; si una función no necesita conocer el estado global, no debe vivir en `app.js`.

**Patrón UI/UX estándar — paneles de herramientas sobre lienzo**: los paneles secundarios que flotan sobre una vista de render (Ficha técnica, Offsets y gaps en la isométrica) viven en UN SOLO host con **pestañas**: un panel visible a la vez (la mitad de huella que paneles apilados, sin doble scroll), pestaña activa persistida en localStorage (`cn-assembly-iso-panel`), y cada panel conserva su colapso propio. Implementación de referencia: `mountIsoPanels` en `js/views/isometricView.js` + `.iso-config-tabs` en `theme.css`. Nueva vista con paneles flotantes: reusar este patrón en vez de apilar paneles.

**Validación de ejemplos**: todo CSV de ejemplo (`data/ejemplo-*.csv` o `docs/Ejemplo_CSV_*.csv`) debe pasar `node frontend/public/assembly-planner/test/validate-examples.mjs` con 0 errores, 0 warnings y 0 piezas con rol genérico `panel`. Los CSVs regenerables se editan en `scripts/generar-ejemplos-catalogo.py` y `scripts/generar-ejemplos-assembly.mjs` (el helper `cajon()` vive en `scripts/lib/cajonModel.mjs` y calcula la geometría coherente con el vano del módulo padre, con test de propiedades en `scripts/lib/cajonModel.test.mjs`); ver ADR-0021 para el contrato completo.

**Convenciones del CSV que el parser valida con warnings**: la columna 11 `pos_z` ancla explícitamente frentes de cajón (y barras/puertas) a una posición Z; sin `pos_z` el renderer apila por zonas y **no escala silenciosamente** — emite warning (`isometricRenderer.warnings`) si la pila excede el vano, y `csvParser.js` advierte cuando un módulo-torre tiene frentes que cubren <35% del alto útil (posible vano desaprovechado) o cuando un frente de cajón corredero incumple el rango ergonómico (>320 mm; volquetes `abatible` exentos). La zapatera no tiene rango: con el modo de frente configurable (bandeja al alto elegido + 30 mm) su altura es decisión de diseño.

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
- `frontend/src/utils/texturasMadera.ts`: texturas procedurales de melamina con veta para el 3D (Canvas 2D + Three.js, sin imágenes externas). `ACABADOS` (7 acabados: agregar = editar solo esa constante), `mulberry32`/`generarParametrosVeta` (semilla fija → textura repetible), `crearTexturaMadera` (bandas/vetas/poros orientables), `MM_POR_TILE = 600` (repeat = tamaño real/600), `direccionVetaPieza` (reglas del spec: costados/montantes/puertas/FONDO del módulo vertical; frentes/caras/traseras/fondos de caja, repisas, tapas, zócalo y laterales de caja horizontal), metales sin veta (`tipoMetalPieza`/`materialMetal`: barra → Cromo, perfil gola → Aluminio Gola), `esInteriorCaja` (cajas de cajón/zapatera SIEMPRE en Blanco Liso, solo frentes y casco llevan el acabado elegido), `calcularTablaContinua` (frentes del mismo módulo comparten textura con offset/repeat según posiciones reales: la veta cruza el canal gola), `materialMadera`/`materialMaderaParaPieza`/`aplicarAcabado` y `liberarMaterial` (dispose de textura+material al cambiar de acabado). Selector en `AcabadoSelector.tsx` (botones con muestra de color); `Assembly3DV2` acepta la prop `acabado` (null = colores planos por módulo) y calcula la tabla continua por módulo en la escena.

### Tests

- Backend: **pytest** (`backend/tests/`). Ejecuta con `cd backend && pytest` o `docker exec cutternest-backend pytest`.
- Frontend: **Vitest** (`frontend/src/**/*.test.ts`). Ejecuta con `cd frontend && pnpm test`.
- Assembly Planner (vanilla): **node --test** (`frontend/public/assembly-planner/test/*.test.mjs` y `js/**/*.test.js`). Ejecuta con `cd frontend/public/assembly-planner && node --test 'test/*.test.mjs' 'js/**/*.test.js'`. Valida ejemplos CSV con `node frontend/public/assembly-planner/test/validate-examples.mjs`.
- E2E: **Playwright** (`frontend/e2e/`, sirve el planner estático en el puerto 8931). Ejecuta con `cd frontend && pnpm test:e2e`.
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

# Assembly Planner (node --test) + validación de ejemplos CSV
cd frontend/public/assembly-planner && node --test 'test/*.test.mjs' 'js/**/*.test.js'
node frontend/public/assembly-planner/test/validate-examples.mjs

# Assembly Planner: tests DOM de vistas (happy-dom, runner aparte)
cd frontend/public/assembly-planner && pnpm test:dom

# E2E Playwright (planner estático, puerto 8931)
cd frontend && pnpm test:e2e

# CI: el workflow .github/workflows/ci.yml corre pytest (backend),
# pnpm test + pnpm build (frontend) y la suite completa del planner
# (unit + integration .mjs + validate-examples) en cada push/PR.

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
- **Guest PIN**: 6 dígitos generados con `secrets.randbelow(1_000_000)`, almacenado hasheado (`pin_hash`), expira en 5 minutos si no se usa, sesión de 4 horas. No enviar por ningún canal externo; mostrar solo en pantalla del usuario principal. Opcionalmente se vincula a un `project_id` para acceso de solo lectura.
- **Contraseñas**: mínimo 10 caracteres; hasheadas con bcrypt (coste ≥ 12).
- **Activación de cuenta**: el registro crea usuarios `is_active=False`; la cuenta se activa tras la primera verificación TOTP/código de respaldo exitosa.
- **Roles**: `admin` (primer usuario) y `principal` (usuarios subsecuentes).
- **TOTP**: usar `pyotp` + `qrcode` (PNG base64). No almacenar el secreto TOTP en texto plano; cifrar o hashear según Fase 2.
- **Variables de configuración sensible** (JWT, DB, WhatsApp) solo en `.env` o en variables de entorno de Docker; nunca en archivos fuente ni en imágenes Docker.

## 6. Datos de desarrollo

- URL de desarrollo: `http://localhost:3000`.
- API base: `http://localhost:8000/api/v1`.
- Base de datos MVP: SQLite `./data/cutternest.db` (dentro del contenedor `/app/data/cutternest.db`).
- Usuario administrador: se crea en el primer registro si no existe otro, o vía variable `ADMIN_USERNAME` en `.env` (default `admin`).
- Idioma: Español. Todos los labels, mensajes de error y PDFs en español.
- Ejemplo pre-cargado: botón "Cargar ejemplo: Estantería Modular" con 9 piezas por defecto (2 laterales + base + tapa + 4 estantes + fondo) en tablero 2440×1220 mm.

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

## 9. Asignación de actividades por componente (Guardian)

Al planificar tareas futuras, el Guardian debe asignar agentes según el componente afectado y evitar que un mismo agente toque capas que no le corresponden:

| Agente / rol | Scope principal | Ejemplos de tareas |
|---|---|---|
| **backend-agent** | `backend/app/` | Nuevos endpoints, modelos, lógica de optimización, PDFs del backend, autenticación. |
| **frontend-agent** | `frontend/src/` | Componentes React, hooks, tipos, utilidades TypeScript, estilos Tailwind. |
| **assembly-planner-agent** | `frontend/public/assembly-planner/` | Refactor de vistas, nuevos servicios de geometría/clasificación, tests Node, aplicación de `config.js`. |
| **db-agent** | `backend/app/database.py`, `init.sql`, migraciones | Esquema SQLite/PostgreSQL, migraciones, índices. |
| **test-agent** | `backend/tests/`, `frontend/src/**/*.test.ts`, `frontend/public/assembly-planner/**/*.test.js` | Tests unitarios, integración, cobertura. |
| **deploy-agent** | `docker-compose*.yml`, `Dockerfile`, `scripts/`, `nginx.conf` | Builds, contenedores, certificados, despliegue. |

### Reglas de asignación

1. **Una tarea = una capa**: si el cambio afecta solo al Assembly Planner, no se le pide al frontend-agent que toque `frontend/src/`. Si el cambio afecta React, no se mezcla con lógica del Assembly Planner vanilla.
2. **No cruzar runners de tests**: los tests del Assembly Planner usan `node --test`; los del frontend React usan Vitest. Un test-agent debe saber cuál runner aplica según la ruta.
3. **Componentes vs. vistas**: si una tarea dice "refactorizar vista", el agente puede crear archivos en `js/components/` pero no debe dejar lógica de negocio allí. Si dice "nuevo cálculo geométrico", va en `js/services/`, no en `js/components/` ni `js/views/`.
4. **Re-indexación MCP obligatoria**: tras cualquier swarm que toque arquitectura o exporte nuevos módulos, el Guardian debe re-indexar el proyecto en `codebase-memory-mcp` para que las búsquedas futuras reflejen la nueva estructura.

### Handoff entre agentes

Cuando un agente termine su componente, debe entregar un **🎫 HANDOFF TICKET** con:

- Archivos modificados/creados.
- Tests ejecutados y resultado.
- Deuda técnica o próximos pasos.
- Referencias MCP relevantes (funciones, servicios, vistas).


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

> **Guía de uso para humanos:** si buscas instrucciones orientativas sobre cuándo y cómo usar cada agente, comandos DCOP, validaciones y ejemplos de prompts, consulta `docs/GUIA_EQUIPO_AGENTES.md`.
