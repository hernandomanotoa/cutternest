# CutterNest Assembly Planner — Documentación SVG/JS

> **Ámbito:** `frontend/public/assembly-planner/`  
> **Rol del documento:** referencia técnica del renderizado SVG y de la arquitectura JavaScript vanilla que lo soporta.  
> **Fecha de redacción:** 2026-09-02.

---

## 1. Resumen ejecutivo

El **Assembly Planner** es una aplicación vanilla (sin framework de UI) embebida en `http://localhost:3000/assembly-planner/`. Recibe un CSV de piezas de mueble, infiere roles, dependencias, secuencias de ensamblaje y genera **tres vistas**:

| Vista | Archivo principal | Salida |
|---|---|---|
| CSV / edición | `js/views/csvView.js` | Tabla editable + validaciones |
| Estructural | `js/views/structuralView.js` | Barras de carga, riesgo y vuelco |
| **Isométrica 3D** | `js/views/isometricView.js` + `js/isometricRenderer.js` | **SVG dinámico 3D** |

Además, existe un motor gráfico alternativo (`js/svgEngine.js`) diseñado como librería reutilizable para renderizar vistas frontales 2D de muebles por familia (cabinet, shelving, table, seating, wardrobe). Este documento se centra en el **SVG/JS actual**, primando el render isométrico porque es el que se expone hoy en la interfaz.

---

## 2. Arquitectura de capas

El código sigue las reglas de capas de `AGENTS.md` para el Assembly Planner:

```
frontend/public/assembly-planner/
├── index.html                 # UI estática, tabs, selectors
├── styles/theme.css           # Variables CSS, componentes, layout
├── js/
│   ├── app.js                 # Orquestador global (store + vistas + eventos)
│   ├── csvParser.js           # Parseo/validación/exportación CSV
│   ├── utils.js               # Helpers DOM genéricos
│   ├── utils/normalize.js     # Normalización de texto (única fuente de verdad)
│   ├── heuristics.js          # Sugerencia de dependencias entre piezas
│   ├── topologicalSort.js     # Kahn, niveles, pasos y detección de ciclos
│   ├── hardware.js            # Lista de herrajes/insumos
│   ├── structural.js          # Cálculos estructurales (carga, vuelco, riesgo)
│   ├── instructions.js        # Textos de instrucciones por paso
│   ├── svgEngine.js           # Motor SVG 2D frontal por familias de mueble
│   ├── isometricRenderer.js   # Renderizador SVG isométrico 3D
│   ├── core/
│   │   ├── store.js           # Store central con eventos (pub/sub)
│   │   └── config.js          # Constantes: colores, Z-index, offsets
│   ├── services/              # Lógica pura, sin DOM, testeable
│   │   ├── classifierService.js
│   │   ├── geometryService.js
│   │   ├── isoGeometryService.js
│   │   ├── moduleService.js
│   │   ├── pieceOffsetService.js
│   │   ├── userConfigService.js
│   │   └── verticalPositionService.js
│   ├── components/            # Mini-componentes reutilizables
│   │   ├── graph/graphLayout.js
│   │   ├── manual/manualExporter.js
│   │   ├── manual/manualSupportWarnings.js
│   │   └── pieceOffsetsConfig.js
│   └── views/                 # Vistas con ciclo de vida {mount, destroy}
│       ├── csvView.js
│       ├── structuralView.js
│       └── isometricView.js
```

### Flujo de datos

1. El usuario importa un CSV o carga un ejemplo.
2. `csvParser.parseCSV()` valida y expande `cantidad > 1` en instancias (`id-1`, `id-2`, ...).
3. `app.loadCSV()` guarda las piezas en el `store` y pide `heuristics.sugerirDependencias()`.
4. `app.recalculateAll()`:
   - Filtra piezas y dependencias por módulo activo.
   - Ejecuta `topologicalSort` para obtener niveles/pasos.
   - Calcula alertas de riesgo y herrajes.
   - Actualiza el resumen y vuelve a renderizar la vista activa.
5. Cada vista se suscribe a `state:changed` y regenera su DOM/SVG cuando el estado cambia.

---

## 3. Estructura de datos de una pieza

Una pieza atraviesa varias representaciones a lo largo del pipeline. A continuación se detallan cada una.

### 3.1 Pieza cruda en CSV

Cabecera obligatoria (`js/csvParser.js`):

```csv
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo,pos_z
```

Ejemplo:

```csv
m1-base,Base módulo 1,800,550,1,si,#C19A6B,15,"T,B,L,R",1,
```

| Campo | Tipo | Significado |
|---|---|---|
| `id` | `string` | Identificador único en el CSV. |
| `nombre` | `string` | Nombre legible; determina el rol por palabras clave. |
| `ancho` | `number` | Dimensión principal horizontal de la pieza (mm). |
| `alto` | `number` | Dimensión perpendicular a `ancho` en el plano de la pieza (mm). |
| `cantidad` | `number` | Número de instancias idénticas. |
| `rotate` | `boolean` | `si`/`no`; indica si puede rotar 90° para optimizar corte. |
| `color` | `string` | Color en hexadecimal, ej. `#C19A6B`. |
| `espesor` | `number` | Espesor real del tablero (mm). |
| `cantos` | `string` | Bordes a encintar: `T`, `B`, `L`, `R`. |
| `modulo` | `string` | ID del módulo; `'estructura'` o `'global'` para piezas globales. |
| `pos_z` | `number \| null` | Posición vertical opcional (mm desde el suelo). |

### 3.2 Pieza parseada por `csvParser.js`

`csvParser.parseCSV()` convierte cada fila en un objeto plano y expande `cantidad > 1` en instancias individuales.

```javascript
{
  id: 'm1-base',
  nombre: 'Base módulo 1',
  ancho: 800,
  alto: 550,
  cantidad: 1,
  rotate: false,
  color: '#C19A6B',
  espesor: 15,
  cantos: 'T,B,L,R',
  modulo: '1',
  pos_z: null
}
```

Si `cantidad > 1`:

```javascript
{
  id: 'm1-base-1',      // instancia 1
  originalId: 'm1-base',
  instanceIndex: 1,
  cantidad: 1,
  // ... resto de campos
}
```

### 3.3 Pieza con campos derivados

Después del parseo, `csvParser.classifyPiece()` añade metadatos estructurales y de riesgo:

```javascript
{
  // campos originales más:
  tipo: 'fondo_decorativo',      // solo si espesor <= 5 y nombre indica decorativo
  orientacion: 'horizontal',     // 'horizontal' | 'vertical' | 'fondo' | 'mixto'
  riesgo: 'bajo'                 // 'bajo' | 'medio' | 'alto' | 'critico'
}
```

Además, `classifierService.inferRole()` devuelve un rol estructural a partir del nombre:

```javascript
import { inferRole } from './js/services/classifierService.js';
inferRole({ nombre: 'Base módulo 1' }); // 'bottom_panel'
inferRole({ nombre: 'Repisa superior' }); // 'shelf'
inferRole({ nombre: 'Puerta derecha' }); // 'door'
```

Los roles posibles incluyen: `bottom_panel`, `top_panel`, `side_panel`, `back_panel`, `shelf`, `divider`, `door`, `drawer_face`, `drawer_side`, `drawer_bottom`, `drawer_back`, `handle`, `leg`, `brace`, `hanger_rail`, `seat_panel`, `plinth`, `glass`, `mirror`, `front_panel`, `panel`.

### 3.4 Geometría 3D del `isometricRenderer.js`

`_buildModuleGeometries()` convierte cada pieza en una caja 3D lista para proyectar a SVG:

```javascript
{
  x: 0,               // mm, origen en X (ancho)
  y: 0,               // mm, origen en Y (profundidad; y=0 es el fondo)
  z: 0,               // mm, origen en Z (altura desde el suelo)
  w: 800,             // mm, extensión en X
  d: 550,             // mm, extensión en Y (depth/profundidad)
  h: 15,              // mm, extensión en Z (altura/espesor)
  color: '#C19A6B',   // color de la cara frontal
  role: 'bottom_panel',
  name: 'Base módulo 1',
  id: 'm1-base',
  opacity: 1,         // opcional; laterales/fondos suelen ser semi-transparentes
  zone: 'bottom'      // opcional; zona vertical para apilamiento
}
```

Convención espacial 3D:

| Eje | Origen | Dirección positiva | Significado físico |
|---|---|---|---|
| `x` | 0 | → derecha | ancho del módulo |
| `y` | 0 | → frente | profundidad; `y=0` es el fondo, `y=moduleD` es la parte frontal |
| `z` | 0 | ↑ arriba | altura desde el suelo |

Nota: `h` en la geometría 3D es la **dimensión en Z** (espesor o altura real según el rol), no confundir con `alto` del CSV que para piezas horizontales representa la profundidad.

### 3.5 Nodo del `svgEngine.js` (SVG 2D frontal)

En el motor 2D cada pieza se representa como nodo de un grafo dirigido:

```javascript
engine.addNode('m1-base', {
  w: 800,                       // ancho visual en px equivalente a mm
  h: 15,                        // alto visual
  type: 'bottom_panel',
  color: '#C19A6B',
  parent: 'modulo',             // id del nodo padre
  constraints: { offsetY: 0 },   // reglas de posicionamiento
  overlapAllowed: false,
  x: 0, y: 0,                   // resueltas por solveLayout()
  zIndex: 3                     // orden de pintado
});
```

Campos de `constraints` disponibles:

| Campo | Efecto |
|---|---|
| `marginX` | desplazamiento X relativo al padre |
| `offsetY` | desplazamiento Y relativo al padre |
| `anchor: 'bottom'` | alinea la base inferior con la del padre |
| `anchor: 'center'` | centra en X e Y dentro del padre |
| `centerX` | centra horizontalmente |
| `centerY` | centra verticalmente |

---

## 4. Configuración centralizada

Toda constante visual, mágica o de estilo reside en `js/core/config.js` y `styles/theme.css`.

### 4.1 Colores (`js/core/config.js`)

```javascript
export const COLORS = {
  background: '#0f172a',
  strokeDefault: '#475569',
  strokeActive: '#4ECDC4',
  strokeDanger: '#ef4444',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  // ...
};

export const ROLE_COLORS = {
  wood: '#C19A6B',
  shelf: '#475569',
  drawer_face: '#fbbf24',
  door: '#1e293b',
  handle: '#e2e8f0',
  // ...
};

export const AXES_COLORS = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' };
export const DIMENSION_COLORS = { arrow: '#f59e0b', text: '#f59e0b' };
```

### 4.2 Z-index 3D (`Z_INDEX`)

Determina el orden de pintado (painter's algorithm) en la vista isométrica:

```javascript
export const Z_INDEX = {
  back_panel: 1,
  side_panel_rear: 2,
  plinth: 4,
  divider: 5,
  bottom_panel: 6,
  top_panel: 6,
  shelf: 6,
  drawer_back: 8,
  drawer_bottom: 9,
  drawer_side: 10,
  side_panel_front: 20,
  door: 25,
  drawer_face: 25,
  handle: 26,
};
```

### 4.3 Posicionamiento vertical (`VERTICAL_POSITIONS`)

Valores por defecto para offsets/gaps/insets en mm:

```javascript
export const VERTICAL_POSITIONS = {
  bottomPanelOffset: 0,   // suelo → cara inferior de la base
  baseTopGap: 20,         // gap base → primera pieza interior
  stackGap: 20,           // gap entre piezas apiladas
  topInset: 120,          // inset desde cara inferior de la tapa
  doorGap: 2,
  seatHeight: 450,
  hangerRailHeight: 1700,
  // ...
};
```

Estos valores pueden ser sobreescritos por el usuario vía el panel de offsets (`pieceOffsetsConfig.js`) y se persisten en `localStorage` bajo la clave `cn-assembly-config` (`userConfigService.js`).

---

## 5. Motor SVG 2D frontal — `js/svgEngine.js`

Aunque la interfaz principal usa el render isométrico, `svgEngine.js` contiene un motor completo de vistas frontales 2D. Es la base conceptual de la familia de routers.

### 5.1 Clase principal

```javascript
export class CutterNestSvgEngine {
  constructor() {
    this.graph = new Map();  // nodos (piezas)
    this.edges = new Map();  // relaciones padre → hijos
    this.viewBox = { w: 0, h: 0 };
  }

  addNode(id, { w, h, type, color, parent = null, constraints = {}, overlapAllowed = false })
  solveLayout()         // resuelve posiciones según constraints
  detectOverlaps()      // detección O(n²) de colisiones
  buildSVG(options)     // genera string SVG
  render(options)       // solveLayout + buildSVG
}
```

### 5.2 Constraints de layout

Cada nodo lleva un objeto `constraints`:

| Campo | Efecto |
|---|---|
| `marginX` | Desplazamiento X desde el padre |
| `offsetY` | Desplazamiento Y desde el padre |
| `anchor: 'bottom'` | Alinea la base inferior del hijo con la del padre |
| `anchor: 'center'` | Centra el hijo en ambos ejes |
| `centerX` / `centerY` | Centra solo en ese eje |
| `overlapAllowed` | No se considera en detección de solapes |

### 5.3 Family Routers

`FamilyRouters` decide cómo ensamblar las piezas según la familia detectada:

```javascript
const FamilyRouters = {
  cabinet(pieces, meta),   // cajoneras, armarios, zapateros
  shelving(pieces, meta),  // estanterías, libreros
  table(pieces, meta),     // mesas, escritorios
  seating(pieces, meta),     // sillas, bancos
  wardrobe(pieces, meta),    // closets, roperos con puertas
};
```

Cada router:
1. Crea un nodo raíz `modulo` con las dimensiones del mueble.
2. Asigna roles con `classifierService.inferRole()`.
3. Añade la carcasa (fondo, base, tapa, laterales) vía `addCarcass()`.
4. Añade elementos específicos (repisas, cajones, puertas, divisor, riel, patas).

### 5.4 API pública

```javascript
import { buildEngineForModule } from './js/svgEngine.js';

const engine = buildEngineForModule(pieces, '1', { family: 'cabinet', thickness: 15 });
const svgString = engine.render({ activeIds: [...], showDimensions: true });
```

---

## 6. Renderizador isométrico 3D — `js/isometricRenderer.js`

Este es el renderizador activo en la pestaña **"🧊 Isométrica"**.

### 6.1 Opciones de configuración

```javascript
const renderer = new IsometricRenderer(container, {
  scale: 0.12,              // escala global mm → px
  isoDepth: 0.5,            // factor de proyección de la profundidad
  padding: 100,             // padding del viewBox
  showDimensions: true,     // muestra cotas
  showAxes: false,          // muestra ejes X/Y/Z
  drawerGap: 15,            // protrusión de cajones abiertos
  doorAngle: 0,               // ángulo de apertura de puertas (grados)
  explodeFactor: 0,           // 0..1 separación de piezas
  moduleGapMode: 'projected', // 'projected' | 'compact'
  isoFlip: false,             // invierte perspectiva lateral
  labelMode: 'auto',          // 'auto' | 'none'
  verticalPositionOverrides: state.userConfig, // offsets del usuario
});

renderer.render(moduleId, pieces, dependencies);
```

### 6.2 Sistema de coordenadas 3D

| Eje | Significado | Dirección visual |
|---|---|---|
| X | Ancho del módulo | → derecha |
| Y | Profundidad (frente → fondo) | → derecha y abajo (proyección isométrica) |
| Z | Altura desde el suelo | → arriba |

La proyección se realiza en `_isoProject(x, y, z, ox, oy)`:

```javascript
const xFactor = this.isoFlip ? -this.isoDepth : this.isoDepth;
return {
  x: ox + (x + y * xFactor) * this.scale,
  y: oy - (z - y * this.isoDepth) * this.scale,
};
```

### 6.3 Generación de geometrías

`_buildModuleGeometries()` convierte cada pieza en una caja 3D `{ x, y, z, w, d, h, color, role, ... }`.

Pasos principales:

1. **Inferir roles** con `classifierService.inferRole()`.
2. **Detectar dimensiones** del módulo con `geometryService.getModuleDimensions()`.
3. **Clasificar montajes** de base/tapa/fondo (`external`, `internal`, `custom`).
4. **Construir carcasa** (base, tapa, laterales, fondo, zócalos).
5. **Posicionar piezas interiores**:
   - Repisas/zapateros (`shelf`)
   - Divisores verticales/horizontales (`divider`)
   - Puertas y vidrios (`door` / `glass`)
   - Cajones (`drawer_face`, `drawer_side`, `drawer_bottom`, `drawer_back`)
   - Rieles colgadores (`hanger_rail`)
   - Travesaños (`brace`)
   - Patas (`leg`)
6. **Añadir piezas globales** (zócalo corrido, tapa corrida, espejo, puertas globales).
7. **Aplicar explosión** si `explodeFactor > 0`.

### 6.4 Orden de pintado (`sortByDepth`)

Para evitar que piezas delanteras tapen traseras se usa un **painter's algorithm** combinado:

1. En vista completa (`ALL_MODULE_ID`), primero se pinta el módulo M1 completo, luego M2, etc. (`moduleSeq`).
2. Piezas con `Z_INDEX` especial (fondo, lateral trasero) se pintan primero.
3. Repisas/divisores se agrupan por lado: izquierda → divisor → derecha → corrida.
4. Si la diferencia de altura Z es significativa (> 20 mm), se ordena de abajo hacia arriba.
5. Si no, se desempata por profundidad proyectada (`getDepthKey`).

```javascript
export function sortByDepth(geometries, xFactor = 0.5) {
  return geometries.slice().sort((a, b) => {
    if (a.moduleSeq !== b.moduleSeq) return a.moduleSeq - b.moduleSeq;
    const za = getZIndex(a.role);
    const zb = getZIndex(b.role);
    if (za <= 2 || za >= 20 || zb <= 2 || zb >= 20) return za - zb;
    // ... side order, Z diff, depth key
  });
}
```

### 6.5 Proyección de cuboides a SVG

`_projectCuboid()` genera 8 vértices y pinta las 3 caras visibles: derecha, superior y frontal.

```javascript
const faces = [
  { name: 'right', indices: [1, 5, 6, 2] },
  { name: 'top',   indices: [4, 5, 6, 7] },
  { name: 'front', indices: [3, 2, 6, 7] },
];
```

Cada cara se ilumina ligeramente distinta:

```javascript
function getFaceColors(baseColor) {
  return {
    front: baseColor,
    top: adjustColor(baseColor, +20),
    right: adjustColor(baseColor, -20),
  };
}
```

### 6.6 Cotas y dimensiones

Cuando `showDimensions === true` y no es vista completa, el SVG incluye:

- **Cotas globales**: ancho (X), profundidad (Y) y alto (Z) del módulo.
- **Offsets verticales**: distancias desde la base a zapateros, repisas, frentes de cajón, puertas y travesaños.
- **Vista explodida**: cotas individuales de ancho/profundidad/alto de cada pieza.

Las cotas usan marcadores de flecha definidos en `_dimensionDefs()`.

### 6.7 Vista de todos los módulos (`ALL_MODULE_ID`)

Cuando se selecciona "Vista completa":

1. Se agrupan las piezas por módulo (`_groupByModule`).
2. Se ordenan los IDs (`M1`, `M2`, ...).
3. Se renderiza cada módulo y se desplaza en X:
   - `projected`: añade la proyección de la profundidad + un gap de espesor.
   - `compact`: pega los módulos lateral con lateral.
4. Finalmente se superponen las piezas globales (zócalo/tapa corrida) con `moduleSeq` mayor.

---

## 7. Servicios de geometría

### 7.1 `classifierService.js` — inferencia de roles

Asigna un rol estructural a cada pieza a partir de su `nombre` (e `id`):

```javascript
export function inferRole(piece) {
  // Palabras clave priorizadas: base → bottom_panel
  // tapa/techo → top_panel
  // fondo/trasera → back_panel
  // lateral/costado → side_panel
  // puerta → door, cajón → drawer_*, etc.
}
```

También detecta zapateros (`isShoeRack`) y divisores verticales (`isDividerVertical`).

### 7.2 `geometryService.js` — dimensiones y montajes

Funciones clave:

```javascript
export function getPieceDims(piece, role, thickness = DEFAULT_THICKNESS, family = 'cabinet');
export function getModuleDimensions(pieces, thickness = DEFAULT_THICKNESS, family = null);
export function classifyBackPanelMount(back, moduleW, moduleH, thickness);
export function classifyTopBottomMountAxes(panel, moduleW, moduleD, thickness);
export function classifyPlinthMount(plinth, moduleW, plinthH, thickness);
export function calculateShelfPositions(moduleH, shelves, thickness, family);
```

`getPieceDims` normaliza las dimensiones según el rol (ej. un lateral se ve como `espesor × alto`, una repisa como `ancho × espesor-visual`).

### 7.3 `isoGeometryService.js` — inferencias 3D puras

Transformaciones y utilidades puras usadas por `isometricRenderer.js`:

```javascript
export function getModuleDepth(pieces);
export function inferThickness(pieces);
export function applyDoorRotation(geo, doorAngle);
export function applyExplode(geometries, moduleW, moduleD, moduleH, factor);
export function computeBays(dividers, moduleW, thickness);
export function inferShelfBayIndex(piece, bays);
export function inferDividerX(div, moduleW, thickness);
export function inferLegX(leg, moduleW, legW, overrides);
export function inferBraceZ(brace, moduleH, braceH, thickness, overrides, topPanelOffset, baseOffset);
// ... y más
```

### 7.4 `verticalPositionService.js` — apilamiento vertical

Calcula la coordenada Z (desde el suelo) de repisas, cajones, puertas, divisores, etc.

Estrategia por zonas:

| Zona | Significado |
|---|---|
| `fixed-bottom` | Zapateros: justo encima de la base |
| `bottom` | Piezas inferiores (repisa baja, puerta inferior, etc.) |
| `middle` | Piezas intermedias, distribuidas equitativamente |
| `top` | Piezas superiores cerca de la tapa |
| `drawer` | Frentes de cajón |

`calculateVerticalPositions()` evita solapes comprimiendo el apilamiento si excede el espacio disponible.

### 7.5 `pieceOffsetService.js` — offsets/gaps por pieza

Expone:

```javascript
export function getPieceOffsetConfig(piece, zone, userConfig, globalOverrides);
export function getDefaultOffset(piece, zone, globalOverrides);
export function getDefaultGap(piece, zone, globalOverrides);
export function getPieceZone(piece);
export function isConfigurablePiece(piece);
export function shouldShowGap(piece, pieces);
```

Cada pieza configurable puede tener un `offset` y un `gap` personalizado en `userConfig.pieceOffsets[<originalId>]`. Los valores por defecto dependen del rol y la zona.

### 7.6 `moduleService.js` — agrupación de módulos

Gestiona la segmentación en módulos, piezas globales y vista completa:

```javascript
export const ALL_MODULE_ID = 'all';
export const GLOBAL_MODULE_ID = 'global';

export function isGlobalPiece(piece);
export function getModules(pieces);
export function getModuleGroup(pieces, groupId);
export function getModulePieces(pieces, moduleId);
export function getModuleLabel(moduleId, pieces);
```

Una pieza es global si `modulo === 'estructura'` | `'global'` o si su `id` empieza con `glb-`.

---

## 8. Vistas y controles

### 8.1 `isometricView.js`

Monta la vista y los controles:

- **Zoom** in/out/reset (`scale` 0.03 … 0.5)
- **Explodida** (`explodeFactor` 0 ↔ 0.7)
- **Invertir perspectiva** (`isoFlip`)
- **Abrir cajones** (`drawerGap` 15 ↔ 60)
- **Abrir puertas** (`doorAngle` 0 ↔ 25°)
- **Exportar SVG** (descarga `cutternest-iso-{modulo}.svg`)
- **Pantalla completa**
- **Gap de profundidad** (`moduleGapMode`)

También monta el panel de offsets `pieceOffsetsConfig.js` flotante en la esquina superior derecha.

### 8.2 `csvView.js`

- Editor de CSV en textarea.
- Tabla editable por celda.
- Validaciones en tiempo real.
- Exportación del CSV modificado.

### 8.3 `structuralView.js`

- Carga máxima por repisa (`calcularCargaRepisa`).
- Clasificación de riesgo por pieza (`clasificarRiesgo`).
- Análisis de vuelco (`calcularVuelco`).

---

## 9. Persistencia y configuración de usuario

`userConfigService.js` lee/escribe en `localStorage`:

```javascript
const STORAGE_KEY = 'cn-assembly-config';

// Valores por defecto + overrides guardados
{
  ...VERTICAL_POSITIONS,
  pieceOffsets: {
    'm1-repisa-sup': { offset: 120, gap: 30 },
    // ...
  }
}
```

El panel `pieceOffsetsConfig.js` permite editar offset/gap por pieza, filtrar por categoría, buscar por nombre y colapsar secciones. Los cambios se aplican inmediatamente al SVG y se persisten.

---

## 10. Formato CSV de entrada

El CSV espera la cabecera:

```csv
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo,pos_z
```

Convenciones importantes para el render:

- **Base/Tapa**: `ancho` = ancho del módulo, `alto` = profundidad.
- **Lateral**: `ancho` = profundidad del módulo, `alto` = altura del módulo.
- **Fondo**: `ancho` = ancho del fondo, `alto` = alto del fondo.
- **Repisa**: `ancho` = ancho interior, `alto` = profundidad real.
- **Zapatero**: incluir palabra clave `zapatero`/`zapatera` en nombre o id.
- **Módulos**: ids como `1`, `2`, `M1`, `M2`; submódulos con punto: `1.1`, `M1.1`.
- **Globales**: `modulo = estructura` o id `glb-*`.

Consultar `frontend/public/assembly-planner/data/README.md` para la especificación completa.

---

## 11. Tests

El runner es `node --test` (configurado en `package.json`):

```bash
cd frontend/public/assembly-planner
pnpm test   # node --test "js/**/*.test.js"
```

Archivos de test relevantes:

```
js/services/__tests__/
  ├── classifierService.test.js
  ├── geometryService.test.js
  ├── isoGeometryService.test.js
  ├── moduleService.test.js
  ├── pieceOffsetService.test.js
  ├── userConfigService.test.js
  └── verticalPositionService.test.js
js/utils/__tests__/normalize.test.js
js/core/store.test.js
js/isometricRenderer.test.js
js/heuristics.test.js
js/topologicalSort.test.js
js/components/manual/manualExporter.test.js
```

---

## 12. Consideraciones para mantenimiento y extensión

1. **Nunca duplicar colores**: usarlos desde `js/core/config.js` o `styles/theme.css`.
2. **Mantener la lógica pura en `services/`**: si una función no toca DOM/SVG, no debe vivir en una vista.
3. **Añadir un rol nuevo** requiere:
   - Actualizar `classifierService.inferRole()`.
   - Añadir color en `ROLE_COLORS` y Z-index en `Z_INDEX`.
   - Añadir dimensión en `geometryService.getPieceDims()`.
   - Añadir renderizado en `isometricRenderer.js` (o `svgEngine.js`).
4. **Nuevas familias de mueble**: crear un router en `svgEngine.js` y añadir la familia en `classifierService.detectFamily()`.
5. **Tests**: añadir tests unitarios para cualquier cambio en `services/` o `utils/`.

---

## 13. Referencias rápidas de archivos

| Archivo | Responsabilidad |
|---|---|
| `js/isometricRenderer.js` | Generación SVG 3D isométrico |
| `js/svgEngine.js` | Generación SVG 2D frontal por familias |
| `js/core/config.js` | Colores, Z-index, offsets, defaults |
| `js/services/geometryService.js` | Dimensiones y clasificación de montajes |
| `js/services/isoGeometryService.js` | Inferencias 3D puras |
| `js/services/verticalPositionService.js` | Apilamiento vertical |
| `js/services/pieceOffsetService.js` | Offsets/gaps por pieza |
| `js/services/classifierService.js` | Inferencia de roles y familias |
| `js/views/isometricView.js` | UI de la vista isométrica |
| `js/components/pieceOffsetsConfig.js` | Panel de offsets editable |
| `styles/theme.css` | Estilos CSS y variables visuales |
| `data/README.md` | Especificación del formato CSV |
