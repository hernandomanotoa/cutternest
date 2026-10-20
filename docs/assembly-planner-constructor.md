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
| `addDrawer(moduleId, index, {anchoModulo, profundidadModulo, altoVano, tipo, vocabulario, ...})` | caja 7 piezas | Port de `cajonModel.mjs`. Submódulo concatenado `${moduleId}${index}` (`'11'`). Nombres llevan el índice ("Frente cajon 2 M1"). |
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
`focusModule`, `undoLast`. Y las de versiones: `saveCurrentVersion`,
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

### Versiones

- **Locales** (`projectVersionsService.js`): localStorage key
  `cn-assembly-versions`, esquema `{schema: 1, versions: [...]}`, tope 50
  (expulsa las más viejas). El payload es el **CSV** (`piecesToCSV`) +
  dependencias; `loadVersion` re-parsea con `parseCSV` para recuperar los
  derivados (`tipo`, `orientacion`, `riesgo`) recalculados. Tolerante a JSON
  corrupto y a storage ausente. `togglePinVersion` marca `pinned`; las
  fijadas sobreviven a `deleteAllVersions`.
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
