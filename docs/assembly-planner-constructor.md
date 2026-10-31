# Constructor de clósets — Assembly Planner

Guía detallada de la pestaña **🔧 Constructor** del Assembly Planner
(`http://localhost:3000/assembly-planner/`, tab `constructor`): qué hace, cómo
está construida y los contratos que hay que respetar al modificarla.

## 1. Qué hace

Herramienta de armado paso a paso de clósets abiertos sin tocar CSV:

1. **Configurar** el mueble: nombre, dimensiones del módulo (ancho/alto/prof),
   espesor, color, zócalo (altura configurable) y cantidad de módulos.
   Atajos: *ancho total ÷ N* reparte el ancho automáticamente.
2. **Agregar contenido** por módulo: repisa (con refuerzo automático si la luz
   ≥600 mm), cajón (corredera/volquete, vano libre 50–600 mm), zapatera,
   barra simple o doble (2100/1000 con `pos_z`), zócalo.
3. **Gestionar módulos**: editar dimensiones (reajusta casco **y** contenido),
   reordenar (◀ ▶), duplicar (individual o todo el mueble), recolorear,
   eliminar (módulo entero o pieza por pieza), ver en isométrica (👁).
4. **Versiones**: guardar/cargar/renombrar/duplicar/exportar a CSV, fijar con
   📌 (protegidas de "eliminar todas"), badge "sin guardar" (dirty tracking),
   sincronización a la nube (botón ☁, requiere sesión).
5. **Deshacer**: botón ↩ o Ctrl+Z revierte la última acción estructural
   (pila de 25).

Las vistas isométrica y 3D muestran **todas** las piezas por defecto
(currentModule = 'all') cuando hay más de un módulo.

## 2. Arquitectura (capas)

```
index.html (tab data-view="constructor")
  └─ js/app.js                viewFactories.constructor + acciones (orquesta)
       └─ js/views/constructorView.js   UI: form, tarjetas de módulo, versiones
            ├─ js/services/closetBuilderService.js   piezas (PURO, sin DOM)
            ├─ js/services/projectVersionsService.js localStorage (PURO)
            ├─ js/services/designVersionsClient.js   fetch a la API (PURO)
            └─ js/components/toast.js                notificaciones
```

Regla de oro: la vista no contiene lógica de negocio. Todo cálculo geométrico
vive en `closetBuilderService.js`; toda persistencia en los servicios de
versiones. `app.js` solo orquesta: llama al servicio → `store.set({pieces,
dependencies: sugerirDependencias(pieces)})` → `recalculateAll()` (que
re-deriva niveles, pasos, alertas y hardware).

### closetBuilderService.js (servicio puro)

| Función | Devuelve | Notas |
|---|---|---|
| `createModule({ancho, alto, prof, espesor, colorCuerpo, modulo, baseInterna})` | casco 5 piezas | `baseInterna: true` = base ancho−2E × prof−2E (apoyada sobre el zócalo, modelo zócalo-cajón del catálogo). Solo con zócalo. |
| `addZocalo(moduleId, {ancho, alto})` | frente plinth | **Interno**: ancho−2E. Rol `plinth`, montaje `internal`. |
| `addShelf(moduleId, {anchoUtil, profReal, index})` | repisa (+refuerzo) | Refuerzo de 100 mm si luz ≥600 (el parser exige soporte desde 600). |
| `addDrawer(moduleId, index, {anchoModulo, profundidadModulo, altoVano, tipo, vocabulario, ...})` | caja 6 piezas (sin tirador) | Port de `cajonModel.mjs`. Submódulo concatenado `${moduleId}${index}` (`'11'`). Nombres llevan el índice ("Frente cajon 2 M1"). |
| `addShoeTray(moduleId, index, {...})` | bandeja zapatera (sin tirador) | Modos del frente (`modoFrente`, 3 — el tipo solo elige el alto del vano, el modo la forma del frente): **`normal` (default del servicio y de la UI)** = frente CORTO que no cubre el vano: mide bandeja + `ZAPATERA_FRENTE_DROP` (30 mm) y el aire superior del vano queda abierto para el calzado. La bandeja va de **borde uniforme** al alto configurado `altoLateral` (default 100 mm; input "Alto zapatera" de la tarjeta, visible en `normal` y `personalizado`): cara = laterales = fondo = división. Validación: `altoLateral + 30 ≤ altoVano` (error con consejo). `extendido` = el frente completa el vano hasta arriba (vano − 1, holgura mínima; cara = frente − 2·E); `personalizado` = alturas independientes (`altoFrente`/`altoLateral`/`altoFondo`/`altoDivision`) y la cara siempre = frente − 2·E. `conFrente=false` deja la bandeja sin frente: la cara alta queda de frente visible/de agarre (checkbox "Frente zapatera"; el tipo 'bandeja a la vista' con `conFrenteDefault:false` lo desmarca y aplica su rim con `ladosIguales`). El frente completo de tipo (botas) gana sobre cualquier modo: frente = vano completo. Los modos legacy se rechazan con error; las exenciones data-driven por geometría del CSV (bandeja de borde uniforme frente==cara en csvParser/golaService/despieceAuditService) se conservan para CSV legacy. La unidad reserva SU vano completo en el apilado (`asignarPosZInsercion`/`cursorInsercion`: frente de zapatera más bajo que su vano de contrato `[tipo]`, o diferencia exacta frente−cara = 30). En gola las zapateras son unidades fijas (`fijoEnGola`): su aire alimenta el reparto de los cajones y una pila 100% fija cabe con el aire abierto encima (validateGola no exige cerrar el span exacto). |
| `addHangerRail` / `addDoubleRail` | barra(s) | Doble: `pos_z` 2100 (alta) y 1000 (baja). |
| `nextModuleId(pieces)` / `rootModuleIds(pieces)` | id libre / raíces | `rootModuleIds` distingue raíz de submódulo en `'11'` e `'1.2'`. |
| `nextContentIndex(pieces, moduleId, kind)` | índice libre | Contador por prefijo de id. |
| `duplicateModulePieces(pieces, moduleId, newId)` | piezas renombradas | Renombra ids, `modulo` y `originalId` (prefijo `m{old}`→`m{new}`). |
| `buildCloset({modules: [{moduleId?, ancho, alto, prof, contenido: [{kind, ...}]}]})` | todo el mueble | Con `zocalo` en el contenido genera `baseInterna` automáticamente. |

Contratos del shape de pieza: igual que `validatePiece` de `csvParser.js` —
**`rotate` booleano** (no 'si'/'no'), `cantos` string, `modulo` string.
Todas las funciones devuelven `{ok: true, pieces, ...}` o
`{ok: false, errors: [...]}` y **nunca lanzan**.

### Acciones de app.js (todas con snapshot de deshacer)

`addModuleFromBuilder`, `addContentToModule`, `removeModule`,
`removeContentPiece`, `duplicateModule`, `duplicateAllModules`,
`recolorModule`, `editModuleDimensions`, `moveModule`, `clearAllPieces`,
`focusModule`, `undoLast`, `enableGola`, `disableGola`. Y las de versiones: `saveCurrentVersion`,
`loadVersionById`, `renameVersionById`, `duplicateVersionById`,
`exportVersionCsv`, `isDesignDirty`, `saveCurrentVersionToCloud`,
`loadCloudVersionById`, `deleteCloudVersionById`.

- **Pila de deshacer**: snapshots `{pieces, dependencies, currentModule}`
  (límite 25, sin duplicados consecutivos por referencia). `snapshotUndo()`
  se engancha al inicio de cada acción, incluidas las cargas (`loadCSV`,
  `loadVersionById`, `loadCloudVersionById`) — cargar algo destruye el estado
  anterior y también debe poder deshacerse.
- `editModuleDimensions` es la acción más compleja: pre-valida que cada
  cajón/zapatera quepa en el nuevo ancho (regenerándolo con `addDrawer` antes
  de mutar; si alguno falla, aborta sin cambios), luego reescribe casco +
  repisas (nuevo ancho útil y profundidad) + barras + zócalo, conservando
  alto de vano, colores y tipo. Los ids no cambian.
- `moveModule(dir)` implementa el reordenado como **swap de numeración**
  entre dos módulos raíz (a→temp, b→a, temp→b) renombrando ids; es invasivo
  pero localizado a los dos módulos afectados.

### Sistema gola (`golaService.js`, servicio puro)

Apertura sin tiradores, activable **por módulo** desde la tarjeta del
Constructor (checkbox `toggle-gola`, visible con ≥2 unidades-cajón). Dos
mecanismos con tiras de **melamina del mismo material/color que el módulo**
(no perfil comercial de aluminio; todos los valores son **PROVISIONALES** y
se editan en el mini-panel de la tarjeta o vía `userConfig`):

1. **Canales C entre frentes**: en cada gap entre cajones apilados se genera
   un canal de melamina de 3 piezas (rol `gola_strip`): un **fondo** vertical
   de 15 retranqueado `golaStripSetback` detrás del plano de frentes y **dos
   labios** (pestañas sup/inf) de 15 de espesor **a ras del plano de frentes**,
   de largo `golaStripSetback + 15` (cubren el retranqueo y traslapsan el
   fondo para encolar/atornillar). Gap gola `G = golaPerfilHeight +
   2·golaPaso` **reemplaza** a `drawerFrontGap` (no se suman). Los dedos
   entran por el **paso superior** (3 mm) y enganchan el borde inferior del
   frente superior **por detrás**: el hueco entre labios, a la profundidad del
   retranqueo, es el agarre. **Nada sobresale delante del plano de frentes**:
   el frente se jala libre, sin obstrucción. El ancho de todas las piezas del
   canal = ancho interior − 2·`golaHolguraLateral` (nunca el ancho exterior),
   apoyado en las caras interiores de los laterales cerca de la cara frontal.
2. **Sobre el último frente (sin canal L)**: la gola es **solo entre cajones**.
   Sobre el último frente queda el gap habitual (`drawerFrontGap`, como sin
   gola); el frente del cajón superior NO se extiende. Los N frentes se
   reescalen para llenar el span (`topRef − drawerFrontGap − bottom`) con los
   N−1 canales C entre ellos. **Vano corto por poco**: si el déficit por
   cajón móvil cabe en `golaMaxRebajaCaja` (40 mm default), la gola **rebaja
   las cajas** (laterales/cara/fondo) en esa medida —con aviso y restauro en
   el round-trip— en vez de fallar; si falta mucho, error con consejos
   exactos (subir repisa N mm / bajar primer cajón si hay aire real debajo).

Reglas: los frentes se reescalan **proporcionalmente** (las cajas no se
tocan) conservando el span y las dimensiones exteriores. Los cajones y
zapateras del Constructor ya se generan **sin tirador** (apertura sin
jaladera); `applyGola` aun elimina los tiradores del módulo si los hay
(diseños legacy importados de CSV) y `removeGola` **no** los regenera.
`applyGola` devuelve `meta` (alturas/pos_z originales) que
`app.js` persiste en localStorage (`cn-assembly-gola`) para restaurar
exacto al desactivar; sin `meta`, `removeGola` usa un fallback proporcional.
Si el vano no alcanza para que cada frente cubra su caja (lateral + 10 mm),
`applyGola` devuelve `{ok: false}` con explicación. La activación emite
warnings si redujo frentes o aplicó el cap.

- **Activación con vista previa**: `previewGola(moduleId)` (app.js, dry-run
  puro, sin mutar el store) devuelve `{ok, warnings, plan}` con el plan
  (`unidades`, `tiras`, `frentes: [{nombre, antes, despues}]`, `agarre`,
  `gapGola`). La tarjeta del Constructor lo muestra en un panel inline con
  botones Aplicar/Cancelar antes de mutar; la desactivación sigue directa
  (reversible con Ctrl+Z).
- **Edición de dimensiones**: `editModuleDimensions` re-aplica el gola como
  parte de la misma acción si el módulo lo tiene activo (helper compartido
  `reapplyGolaPieces`: restaura con meta + `applyGola`; un solo undo). Si el
  nuevo vano queda insuficiente, la edición se conserva y el motivo se
  devuelve como `warnings`.
- **Versiones**: los metas gola viajan en la versión local (campo opcional
  `golaMetas` en `projectVersionsService.saveVersion`, schema sin cambios,
  tolerante a versiones viejas) y `loadVersionById` los rehidrata en
  `cn-assembly-gola` (merge, no borra metas de otros módulos).
- **Config por módulo**: cada módulo puede recordar sus propios parámetros
  `gola*` como overrides parciales (map moduleId→cfg en localStorage
  `cn-assembly-gola-cfg`, editable desde el mini-panel de la tarjeta — ya no
  escribe la `userConfig` global). El merge efectivo es `GOLA_DEFAULTS ←
  userConfig global ← overrides del módulo` (`getGolaCfg(userConfig,
  moduleCfg)`, golaService; mismas reglas de validación en cada capa): los del
  módulo ganan y un módulo sin overrides usa la config global como fallback.
  `setGolaModuleConfig` (app.js) mergea sin pisar claves no incluidas y
  re-aplica el gola del módulo si está activo (delega en `enableGola`, que
  hace su propio snapshot de undo). El mapa viaja en la versión local (campo
  opcional `golaModuleCfgs`, tolerante a versiones viejas) y `loadVersionById`
  lo rehidrata con merge (no borra configs de otros módulos); `removeModule`
  limpia la entrada del módulo eliminado (igual que con los metas).
- Render: `golaGeometry.js` (builder iso enganchado en `moduleGeometry.js`;
  la 3D lo hereda vía `computeGeometries`). El canal se dibuja **detrás del
  plano de frentes**: fondo con su cara frontal a `golaStripSetback` y labios
  terminando **a ras** de ese plano (ninguna geometría `gola_strip` cruza el
  plano de frentes), con `ROLE_COLORS.gola_strip` / `Z_INDEX.gola_strip` (22,
  bajo `drawer_face`).
  Además emite marcas del **canal de agarre** (rol `gola_grip`, capa 27):
  una caja fina en el paso superior de cada canal C (por donde entran los
  dedos). Sobre el último frente no hay marca (sin canal L); color en
  `ROLE_COLORS.gola_grip` (config, no en la
  vista); sin etiqueta de pieza (`pieceStyling.makeLabel` devuelve `''`).
- Materiales/planos: `calculateHardware` lista "Tornillo fijación gola"
  (fondos × `golaTornillosPorPerfil`); los canales son piezas de corte y van
  al despiece (salen del BOM); paso de montaje "interior" en
  `assemblyStepService` con instrucción en `instructions.js`. El manual
  (`manualExporter.buildStandaloneHtml`, 6º parámetro opcional
  retrocompatible `{userConfig, golaLFrontIds}`) renderiza la sección
  **"Perfiles gola"** vía `golaReport(pieces, userConfig, opts)` (filas por
  pieza de canal: identificador, ubicación "Canal C N (entre cajones)",
  longitud de corte, cantidad, material/acabado, fijación). `opts.golaLFrontIds`
  queda tolerado por retrocompatibilidad (el canal L ya no se genera).
- **Auditoría estricta de despiece** (`despieceAuditService.js`, integrada en
  `auditReportService.js` — sección "Gola"/"Cajones" del informe, bloquea el
  `corteAutorizado`): (1) **luz libre del canal de la mano** ≥ 40 mm entre
  frentes consecutivos de módulos con gola (si no, ERROR CRÍTICO con los mm a
  restar de los frentes); (2) **veta (rotate) por función**: frentes/golas con
  `rotate 'no'` obligatorio (error de continuidad estética), laterales/caras/
  fondos recomendado (pendiente), bases libres (fila informativa: el
  optimizador sí puede rotarlas para ahorrar); (3) **colisión gola**: la
  estructura interna de la caja debe quedar ≥ 60 mm bajo el frente (si no,
  ERROR DE COLISIÓN con el déficit). Las bandejas 'frenteBajo' (borde uniforme)
  quedan exentas del control de colisión.
- **Validación geométrica**: `validateGola` además del chequeo aritmético
  vigila la **profundidad del canal en el eje Y del renderer** (y=0 en el
  fondo): error si el retranqueo es excesivo y el fondo del canal quedaría
  detrás del plano interior del fondo del casco (`yFace − golaStripSetback −
  15 < espesor − 1`). Las pestañas terminan a ras del plano de frentes por
  construcción (no necesitan chequeo de protrusión). Solo cuando la
  profundidad del casco es derivable (`cascoDims` la obtiene
  del alto de la tapa o del ancho de un lateral).
- **Limitaciones**: sin mecanizados en tablero; el control estricto de
  despiece reporta la holgura real caja-frente (con el cajón estándar a
  2·E = 30 mm, la regla de 60 mm exige rebajar la caja o subir el frente);
  los parámetros son de taller hasta seleccionar un perfil comercial.
  Futuro: canales segmentados por columna de frentes (`nPorFila = 2`), gola
  en zócalo/base.

### Versiones

- **Locales** (`projectVersionsService.js`): localStorage key
  `cn-assembly-versions`, esquema `{schema: 1, versions: [...]}`, tope 50
  (expulsa las más viejas). El payload es el **CSV** (`piecesToCSV`) +
  dependencias; `loadVersion` re-parsea con `parseCSV` para recuperar los
  derivados (`tipo`, `orientacion`, `riesgo`) recalculados. Tolerante a JSON
  corrupto y a storage ausente. `togglePinVersion` marca `pinned`; las
  fijadas sobreviven a `deleteAllVersions`. Cada versión puede llevar
  `golaMetas` (map moduleId→meta del sistema gola, campo opcional tolerante
  a versiones viejas): `app.js` los guarda al versionar y los rehidrata
  (merge) al cargar, para que `disableGola` restaure exacto tras un
  guardar/cargar.
- **Nube** (`designVersionsClient.js` + backend `/api/v1/planner-design-versions`):
  tabla `planner_design_versions` (owner FK, name, csv, piece_count,
  saved_at; se crea sola vía `init_db`). CRUD autenticado (usuario
  principal), rate limit, tope 50 por usuario. El cliente reporta
  `{auth: false}` en 401 para que la UI invite a iniciar sesión. La nube es
  backup multi-dispositivo; el localStorage sigue siendo la fuente primaria.

## 3. Jerarquía de posicionamiento (renderer)

El orden de prioridad para la posición Z de las piezas (aprendido en los
bugs de zócalo):

1. **Override por pieza** (`userConfig.pieceOffsets[id].offset`) — gana
   siempre (decisión explícita del usuario en el panel Offsets).
2. **Regla geométrica**: base con montaje `internal`
   (`classifyTopBottomMount`, ancho ≈ moduleW−2E) + zócalo local → la base se
   apoya **sobre el zócalo** (`bottomPanelOffset = effectiveZocaloHeight`).
   El override global `userConfig.bottomPanelOffset` (default 0, siempre
   presente) **no** puede hundir la base dentro del plinth — esa fue la causa
   del bug "el zócalo está sobre los cajones".
3. **Override global** / default de `VERTICAL_POSITIONS`.

Todo el contenido se apila desde `baseTop = bottomPanelOffset + espesor`
(`verticalPositionService`), así que con la base sobre el zócalo toda la
torre de cajones sube coherente.

El apilamiento de frentes respeta el **orden de inserción** porque los
submódulos se numeran con un contador unificado por módulo (11, 12, 13…);
con contadores separados por tipo, cajón 1 y zapatera 1 colisionaban en el
submódulo `'11'` y el renderer podía cruzar las cajas.

### Ajuste de frentes al aplicar el zócalo estructural

`applyStructuralPlinth` (Generar marco, `app.js`): al aplicar el marco, el
frente del **cajón que queda directo sobre el zócalo** (el frente anclado más
bajo del módulo, si es de cajón) crece **+30 mm** (`PLINTH_DRAWER_FRONT_LIFT_MM`)
y se **centra en su vano** (15 mm arriba y 15 mm abajo). **Solo frentes de
cajón**: si lo más bajo del módulo es una zapatera, esa zona es de la
zapatera y ningún frente se toca. El ajuste ocurre solo al aplicar el marco
la primera vez (una regeneración no duplica el +30) y `removeStructuralPlinth`
lo revierte. La constante vive en `plinthFrameService.js`.

## 4. Pantalla completa en 3D

Dos piezas cooperan (faltaba cualquiera de las dos):

1. `renderer3D.js resize(w, h)`: actualiza el lienzo (el canvas 3D es SVG
   con tamaño propio, no escala con CSS como el de la isométrica), re-encuadra
   y marca `needsRender`. No-op si el tamaño no cambió.
2. `renderer3DView.js`: un `ResizeObserver` sobre el contenedor del canvas
   llama a `resize()` con el tamaño real — cubre fullscreen, salir de
   fullscreen y redimensionar la ventana.

El encuadre (`_fitCameraToModule`) llena el 75% del viewport con tope
`0.21 × max(1, min(w/900, h/600))`: a 900×600 o menos conserva el
comportamiento histórico; en pantallas mayores el mueble crece en la misma
proporción y **ocupa la misma fracción de pantalla** que en tamaño normal.

## 5. Tests

| Suite | Qué cubre |
|---|---|
| `js/services/closetBuilderService.test.js` | Invariantes geométricas + 100 closets aleatorios re-parsean sin errores/warnings (salvo heurística de cobertura de frentes). |
| `js/services/golaService.test.js` | Sistema gola: canales C N−1 entre frentes (N = 2..5) con fondo retranqueado + labios a ras del plano de frentes, agarre, coherencia del reparto, cubre-caja, round-trip con/sin meta, BOM, límites (0/1 cajón, vano insuficiente), geo `gola_strip`/`gola_grip` en el renderer, retranqueo excesivo en profundidad, reporte para el manual. |
| `js/services/despieceAuditService.test.js` | Auditoría estricta de despiece: luz libre del canal de la mano (≥40 mm, ERROR CRÍTICO con déficit), veta (rotate) por función (frentes/golas error, laterales/caras/fondos warning, bases libres info) y colisión gola (caja ≥60 mm bajo el frente, exención frenteBajo). |
| `test/views/golaPreview.dom.test.js` | Vista previa del gola: panel con plan, confirmar aplica, cancelar no muta, `previewGola` es dry-run, fallo revierte el checkbox. |
| `test/views/golaDimensions.dom.test.js` | `editModuleDimensions` con gola activo re-aplica tiras (re-anchoa/reposiciona) en la misma acción (un solo undo); vano insuficiente → edición OK con warning; save/load de versión rehidrata metas (disable restaura exacto). |
| `js/services/projectVersionsService.test.js` | CRUD, round-trip, tope 50, JSON corrupto, pin. |
| `js/services/__tests__/userConfigService.test.js` | Presets: default ← preset ← edición del usuario. |
| `test/views/constructorView.dom.test.js` | Flujos UI: agregar/editar/duplicar/reordenar/eliminar, undo (botón y Ctrl+Z), versiones (incl. pin y Enter), nube (mock), vano libre, reparto de ancho, panel de avisos. |
| `test/constructor.smoke.dom.test.js` | Humo E2E: 2 módulos + contenido → guardar → vaciar → cargar (round-trip exacto) → eliminar. |
| `js/renderer3d/renderer3d.multimodule.test.js` | Gap 20 mm entre módulos, `moduleW` de escena, `resize()` y encuadre en fullscreen. |
| `backend/tests` (pytest) | API de versiones en la nube (ver `test_planner_design_versions.py` si existe; si no, probar a mano el CRUD con sesión). |

Comandos: `node --test 'test/*.test.mjs' 'js/**/*.test.js'`,
`node --test test/views/*.dom.test.js test/constructor.smoke.dom.test.js`,
`node test/validate-examples.mjs`.

## 6. Errores conocidos y decisiones (para no re-descubrirlos)

- **`rotate` es booleano** en el shape del store (lo normaliza
  `validatePiece`). El builder no debe emitir strings 'si'/'no'.
- **Submódulos concatenados `'11'`** (no `'1.1'`): el validador de torres de
  `csvParser` trata `'1.1'` como módulo independiente ("falta pieza tapa").
- **Repisas con luz ≥600 mm** necesitan refuerzo o el parser warningea
  (soporte intermedio); >800 sin soporte es CRÍTICO.
- **`bottomPanelOverride` global siempre existe** (default 0): nunca darle
  prioridad sobre la regla base-interna-sobre-zócalo (bug del zócalo).
- **Contadores de contenido unificados** por módulo: separados, colisionan
  submódulos; la colisión hacía que `matchDrawerBoxParts` cruzara cajas.
- **`updateSummary`/`updateModuleSelector` deben tolerar DOM parcial** (tests
  happy-dom, entornos embebidos): siempre `if (!el) return`.
- **happy-dom no aplica el atributo `selected`** de `<option>`: en tests DOM
  fijar el valor del select explícitamente antes del click.
- El **re-parse del mueble completo** (`parseCSV(piecesToCSV(pieces))`) es el
  mecanismo para recuperar warnings del validador tras mutaciones del
  builder (panel de avisos, toasts).

## 7. Mejoras pendientes (ideas, por prioridad)

1. **Backend**: tests pytest del router de versiones en la nube (hoy se
   validó a mano); posible rate-limit más fino por usuario.
2. **Constructor**: ancho total con módulos de anchos mixtos (hoy reparte en
   iguales); drag & drop para reordenar módulos; vista previa en miniatura.
3. **Versiones**: auto-guardado incremental (debounce) con nombre "Recuperación";
   diff entre versiones (qué piezas cambiaron).
4. **3D**: `perspDistance` fijo al cargar — en perspectiva y vista completa
   muy ancha podría recalcularse al resize.
