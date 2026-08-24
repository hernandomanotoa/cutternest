# Guía de Refactor UI/UX y 3D — CutterNest

> Plan de refactorización del frontend de CutterNest: sistema de diseño, componentes por página, visualización 2D/3D y ruta de aprendizaje.
> **Versión:** 1.0 · **Fecha:** agosto 2026 · **Stack objetivo:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + R3F

---

## Tabla de contenido

1. [Principios y alcance](#1-principios-y-alcance)
2. [Fase 0 — Fundaciones del sistema de diseño](#2-fase-0--fundaciones-del-sistema-de-diseño)
3. [Refactor por página](#3-refactor-por-página)
4. [Visualización 2D de layouts](#4-visualización-2d-de-layouts)
5. [Presentación 3D de piezas y ensamblaje](#5-presentación-3d-de-piezas-y-ensamblaje)
6. [Rendimiento y calidad](#6-rendimiento-y-calidad)
7. [Orden de ejecución sugerido](#7-orden-de-ejecución-sugerido)
8. [Checklist de aceptación por página](#8-checklist-de-aceptación-por-página)
9. [Referencias y recursos de aprendizaje](#9-referencias-y-recursos-de-aprendizaje)

---

## 1. Principios y alcance

**Objetivo:** elevar CutterNest de "funcional" a "herramienta profesional de taller", sin tocar el backend (la API `/api/v1` ya definida se mantiene).

**Principios rectores:**

1. **El canvas manda:** en Optimizer y Assembly, la visualización 2D/3D ocupa ≥ 60 % del viewport; los paneles son satélites.
2. **Cero recargas de contexto:** todo estado de trabajo (piezas, resultados, selección) vive en Zustand o TanStack Query; cambiar de ruta no debe perder trabajo.
3. **Feedback inmediato:** validación inline en el momento del error, no después de enviar.
4. **Dark mode desde el día 1** con tokens CSS.
5. **Refactor incremental:** cada página se entrega funcional antes de pasar a la siguiente; nada de "big bang".

**Librerías a instalar (Fase 0):**

```bash
pnpm add @tanstack/react-query @tanstack/react-table zustand \
  react-hook-form zod @hookform/resolvers \
  cmdk sonner lucide-react recharts dnd-kit \
  three @react-three/fiber @react-three/drei \
  @react-three/postprocessing @react-spring/three maath

# shadcn/ui (CLI)
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card dialog drawer sheet table tabs \
  input select badge tooltip skeleton separator command popover \
  dropdown-menu form sonner resizable scroll-area
```

---

## 2. Fase 0 — Fundaciones del sistema de diseño

Antes de tocar páginas, dejar la base lista (1–2 días):

### 2.1 Theming

- Configurar `tailwind.config` + CSS variables de shadcn (`--background`, `--primary`, `--muted`, etc.) con paleta propia de CutterNest:
  - **Primario:** tono madera/ámbar (`amber-600` / `#D97706`) — evoca carpintería.
  - **Semáforo de utilización:** `--success` (≥85 %), `--warning` (70–85 %), `--danger` (<70 %).
- Dark mode con `class` strategy y toggle en el header.

### 2.2 Layout de aplicación

```
┌────────────────────────────────────────────┐
│ Header: logo · CommandK (⌘K) · theme · user│
├──────────┬─────────────────────────────────┤
│ Sidebar  │  <Outlet/> (página activa)      │
│ (icons+  │                                 │
│  labels) │                                 │
└──────────┴─────────────────────────────────┘
```

- Sidebar persistente con `lucide-react`: Dashboard, Optimizador, Proyectos, Inventario, (Cotización y Ensamblaje se alcanzan desde proyectos).
- En móvil: sidebar colapsa a `Sheet` (drawer).
- Invitados: sidebar reducido (solo Dashboard, Proyectos, Ensamblaje) según rol desde `/auth/users/me`.

### 2.3 Capa de datos

- **TanStack Query** con un `apiClient` (fetch wrapper) que:
  - Adjunta cookies (`credentials: 'include'`).
  - En `401` intenta `/auth/refresh` una vez y reintenta; si falla → redirect `/login`.
  - Normaliza errores del formato `{ detail, code, status }` del backend.
- Query keys por dominio: `['projects']`, `['project', id]`, `['inventory']`, `['catalog']`, `['layouts', projectId]`, `['assembly', projectId]`.
- Mutations con `invalidateQueries` correspondiente y `sonner` toast de éxito/error.

### 2.4 Command palette (⌘K)

Con `cmdk`: acciones globales — "Nuevo proyecto", "Ir a inventario", "Optimizar piezas actuales", buscar proyecto por nombre. En herramientas de producción esto marca una diferencia enorme de velocidad percibida.

---

## 3. Refactor por página

### 3.1 Dashboard (`/`)

| Elemento | Implementación |
|---|---|
| KPI cards | shadcn `Card`: tableros en inventario, sobrantes disponibles, proyectos activos, utilización promedio (últimos 30 días) |
| Gráfico | Recharts: barras de utilización por proyecto reciente |
| Accesos rápidos | Botones grandes: "Optimización rápida", "Nuevo proyecto", "Registrar sobrante" |
| Tabla "Proyectos recientes" | TanStack Table con columnas: nombre, material, nº piezas, % utilización, fecha |

### 3.2 OptimizerPage (`/optimizer`) — la página estrella

**Layout de 3 columnas** con `Resizable` de shadcn:

```
┌──────────────┬──────────────────────────┬──────────────┐
│ PANEL PIEZAS │      CANVAS 2D / 3D      │  RESULTADOS  │
│ (25 %)       │      (≥ 55 %)            │  (20 %)      │
│              │                          │              │
│ - Selectores │  - Toggle 2D/3D          │ - KPI util.  │
│   material/  │  - Layout por tablero    │ - Tabs por   │
│   espesor/   │    (tab activo)          │   tablero    │
│   formato    │  - Hover → tooltip pieza │ - Lista de   │
│ - Tabla      │  - Colores por pieza     │   errores    │
│   editable   │    (color melamina)      │ - Acciones:  │
│ - CSV upload │                          │   cotizar /  │
│ - Botón      │                          │   cut list / │
│   OPTIMIZAR  │                          │   ensamblar  │
└──────────────┴──────────────────────────┴──────────────┘
```

**Cambios clave:**

1. **Editor de piezas = hoja de cálculo**, no formulario por pieza:
   - TanStack Table con celdas editables inline (nombre, ancho, alto, cantidad, rotar ✓/✗, color, canteado).
   - Agregar fila con `Enter`; duplicar fila con `Ctrl+D`; pegar desde Excel/CSV (`navigator.clipboard.readText()` + parse TSV).
   - Validación Zod por celda: dimensiones > 0, pieza ≤ tablero útil (error inline rojo en la fila, coincide con `PIECE_TOO_LARGE`).
2. **Selectores de catálogo** con `Select` + preview de dimensiones del formato ("183 × 244 cm") y espesores filtrados según material seleccionado.
3. **Paleta de colores melamina** como swatches (botones circulares con textura) en vez de `<select>` de texto.
4. **Botón Optimizar:** estado de loading con `Skeleton` en el canvas; al completar, animación de entrada del layout.
5. **Resultados:** KPI grande de utilización con color semáforo; tabs "Tablero 1 / 2 / 3…" para navegar layouts.
6. **Persistencia local:** borrador del formulario en Zustand + `persist` (sessionStorage) — si el usuario navega fuera y vuelve, no pierde las piezas.

### 3.3 ProjectsPage (`/projects`)

- **Grid de tarjetas** de proyecto con miniatura del último layout (usa el `svg_path`/`png_path` que ya genera el backend).
- Tarjeta muestra: nombre, material + formato (badge), nº piezas, % utilización, fecha.
- Estado vacío: tarjetas de plantillas paramétricas con preview ilustrado ("Clóset 2 puertas", "Cocina base", "Escritorio") — clic abre diálogo de parámetros y llama a `/templates/{id}/generate`.
- Menú contextual por tarjeta (`DropdownMenu`): abrir, duplicar, cotizar, eliminar (con `AlertDialog` de confirmación).
- Invitados: misma vista en solo lectura, sin menú contextual ni botón "Nuevo".

### 3.4 QuotePage (`/quote/:projectId`)

- Layout 2 columnas: **parámetros** (izq) / **desglose en vivo** (der, sticky).
- Tabla de hardware editable (TanStack Table): descripción, cantidad, precio unit., subtotal por fila; fila "agregar" al final.
- Campo costo/m² con el precio sugerido del catálogo como placeholder/badge ("Sugerido: $X.XX") — editable.
- Slider o input de margen (default 1.3) con recálculo instantáneo del total (cálculo local espejo del backend para feedback inmediato; el PDF usa el del backend).
- Desglose estilo factura: Material / Hardware / Mano de obra / Subtotal / Margen / **Total** (grande, destacado).
- Botón "Generar PDF" → descarga + toast.

### 3.5 InventoryPage (`/inventory`)

- Tabs: **Tableros** | **Sobrantes**.
- TanStack Table con filtros facetados: tipo, espesor, estado; ordenamiento por área descendente (los sobrantes más grandes primero).
- Columna de dimensiones renderizada como mini-rectángulo proporcional (visual, no solo texto "90 × 45").
- Acción "Consumir" por fila con confirmación ligera (toast con **deshacer** durante 5 s — la mutation real se difiere).
- Formulario de alta en `Sheet` lateral (no página nueva): dimensiones, espesor, cantidad, tipo.

### 3.6 AssemblyPage (`/assembly/:projectId`)

Ver sección 5 — es la página con más trabajo 3D.

---

## 4. Visualización 2D de layouts

El SVG estático actual funciona, pero el salto UX es hacerlo **interactivo**:

1. **Render:** seguir usando el SVG del backend como base, o migrar a render client-side con `<svg>` React desde el JSON `placements` (recomendado — permite interactividad total).
2. **Interactividad por pieza:**
   - Hover: tooltip (shadcn `Tooltip`) con nombre, dimensiones, código.
   - Click: selecciona la pieza (borde destacado) y muestra su ficha en el panel lateral.
   - Piezas rotadas: badge "⟳ 90°".
3. **Sincronización 2D↔3D:** el código de pieza seleccionado vive en un store Zustand (`selectedPieceCode`); clic en 2D selecciona en 3D y viceversa.
4. **Zoom/pan:** `svg` con viewBox + librería ligera (`panzoom`) o controles propios.
5. **Kerf y margen visibles:** renderizar el margen como borde punteado interior del tablero — el operario entiende de un vistazo por qué "no cabe" una pieza.
6. **Colores:** cada pieza con el color de melamina elegido; patrón de veta sutil (pattern SVG) para texturas madera.

---

## 5. Presentación 3D de piezas y ensamblaje

### 5.1 Arquitectura del módulo 3D

```
components/mueble/
  Scene.tsx            # Canvas + luces + Environment + Grid
  Board3D.tsx          # Tablero con piezas del layout (vista optimización)
  FurnitureModel.tsx   # Mueble completo (vista ensamblaje)
  Piece3D.tsx          # Box con textura melamina + canteado
  PieceLabel.tsx       # <Html> flotante con código/dimensiones
  StepTimeline.tsx     # Timeline de pasos (UI 2D sobre el canvas)
  CameraDirector.tsx   # Cámara animada por paso (CameraControls)
  ExplodeControl.tsx   # Slider de vista explotada
  store/assemblyStore.ts  # Zustand: paso actual, selección, explode factor
```

### 5.2 Materiales y realismo

- `MeshStandardMaterial` con texturas PBR CC0 de **Poly Haven** o **ambientCG** (nogal, roble, cedro…). Mapear `color` del catálogo → archivo de textura.
- Canteado: franjas de color sólido en las caras con `edge_banding` (geometría delgada superpuesta o multi-material por cara).
- Iluminación: `<Environment preset="warehouse" />` + `<SoftShadows />` + una `DirectionalLight` key.
- Fondo: gradiente neutro o `Grid` infinito de drei — nunca negro plano.

### 5.3 Selección y feedback

- Raycast nativo de R3F (`onPointerOver/Out/Click` en cada `Piece3D`).
- Hover: cursor pointer + outline sutil (`@react-three/postprocessing` → efecto `Outline`, color primario).
- Selección: outline grueso pulsante + `PieceLabel` visible + ficha en panel lateral.
- Sincronización con `selectedPieceCode` del store (compartido con la vista 2D).

### 5.4 Guía de ensamblaje paso a paso (AssemblyPage)

```
┌────────────────────────────────────────────────┐
│ Título del paso + descripción + herramientas   │
├────────────────────────────────────────────────┤
│                                                │
│              CANVAS 3D (75 %)                  │
│   - piezas colocadas: atenuadas (opacity .35)  │
│   - pieza del paso: outline pulsante           │
│   - flecha/ghost de posición destino           │
│                                                │
├────────────────────────────────────────────────┤
│ TIMELINE: ◀ Paso 3/12 ▶ ··· [■■■■□□□□□□] ▶▶  │
│           [Validar paso ✓]  [Vista explotada]  │
└────────────────────────────────────────────────┘
```

**Comportamientos clave:**

1. **Animación de colocación:** al avanzar de paso, la pieza "vuela" desde fuera de escena a su posición esperada (`@react-spring/three` → `useSpring` sobre `position` y `rotation`).
2. **Cámara cinematográfica:** el campo `camera` de `AssemblyStep` se aplica con `CameraControls.setLookAt(..., true)` (transición suave) en cada cambio de paso.
3. **Vista explotada:** slider 0–1 que desplaza cada pieza a lo largo de su eje de ensamble (`position + normal × factor × distancia`) — espectacular para entender la estructura.
4. **Validación con tolerancias:** modo "corrección" que muestra posición `current` vs `expected` con delta en mm/° y colores (dentro de 2 mm/5° → verde; fuera → rojo). Botón "Ajustar a posición esperada" anima la corrección.
5. **Autoplay:** reproduce pasos con pausa configurable (2–8 s), útil para seguir con las manos ocupadas.
6. **Estado persistido:** cada validación llama a `/assembly/steps/{id}/validate`; al recargar, `AssemblyState` restaura el progreso.
7. **Autoplay de cámara libre:** `OrbitControls` con límites (`minDistance`, `maxDistance`, `maxPolarAngle`) para no "perder" el mueble.

### 5.5 Reglas de oro R3F (rendimiento)

- Animar con `useFrame`; **nunca** `setState` por frame.
- Mutar objetos por **refs**, no por estado React.
- `useMemo` para geometrías/materiales; `<Instances>` para piezas repetidas (estantes idénticos).
- `frameloop="demand"` en vistas estáticas (optimización 3D) — renderiza solo cuando algo cambia.
- `r3f-perf` en desarrollo para vigilar FPS y draw calls; `<Preload all />` para texturas.
- Lazy-load del módulo 3D: `React.lazy(() => import('./mueble/AssemblyPage'))` — Three.js pesa ~600 kB y no debe cargarse en `/login`.

---

## 6. Rendimiento y calidad

| Práctica | Detalle |
|---|---|
| Code splitting | `React.lazy` por ruta; el bundle 3D solo carga donde se usa |
| Imágenes/texturas | Texturas PBR en 1 k máx, formato WebP/KTX2; precargar solo las del proyecto activo |
| Listas largas | TanStack Table con paginación server-side si inventario > 500 ítems |
| Testing | Vitest para lógica (conversión cm/mm, cálculo de cotización espejo); Playwright E2E para flujos: login→optimizar→cotizar y ensamblaje paso a paso |
| Accesibilidad | Radix cubre ARIA base; verificar navegación por teclado en tabla de piezas y timeline de ensamblaje; contraste AA en ambos temas |
| i18n | Español es-EC fijo en MVP, pero strings centralizados desde ya (facilita futuro) |

---

## 7. Orden de ejecución sugerido

| Semana | Entregable |
|---|---|
| 1 | Fase 0 completa: theming, layout app, TanStack Query, apiClient, command palette |
| 2 | OptimizerPage: tabla editable de piezas + selectores catálogo + validación inline |
| 3 | OptimizerPage: canvas 2D interactivo + resultados con KPIs y tabs de tableros |
| 4 | ProjectsPage (grid + plantillas) y Dashboard (KPIs + gráficos) |
| 5 | InventoryPage y QuotePage |
| 6 | Módulo 3D base: Scene, Board3D (optimización 3D), materiales melamina |
| 7 | AssemblyPage: timeline, animación de pasos, cámara cinematográfica |
| 8 | AssemblyPage: vista explotada, validación con tolerancias, autoplay + pulido general (dark mode, empty states, skeletons) |
| 9 | Tests E2E, rendimiento, correcciones |

Cada semana termina con la página **funcional contra el backend real**, no con maquetas.

---

## 8. Checklist de aceptación por página

**Global**
- [ ] Dark mode sin parpadeos ni contrastes rotos
- [ ] `401` → refresh automático → solo si falla, redirect a login
- [ ] Toda mutation muestra toast de éxito/error
- [ ] Todo listo con teclado (Tab/Enter) y lector de pantalla básico

**Optimizer**
- [ ] Editar 50 piezas sin tocar el mouse (Enter / Ctrl+D / pegar desde Excel)
- [ ] Pieza mayor al tablero → error inline antes de optimizar
- [ ] Toggle 2D/3D sin perder selección de pieza
- [ ] Borrador persiste al navegar fuera y volver

**Proyectos**
- [ ] Estado vacío ofrece plantillas con preview
- [ ] Eliminar exige confirmación; duplicar funciona

**Cotización**
- [ ] Cambiar margen recalcula total en < 50 ms
- [ ] Precio sugerido del catálogo visible junto al campo editable

**Inventario**
- [ ] Filtros facetados por tipo/espesor/estado
- [ ] Consumir con deshacer (5 s)

**Ensamblaje**
- [ ] Avanzar paso anima pieza + cámara
- [ ] Vista explotada funciona con slider
- [ ] Validación muestra delta mm/° y respeta tolerancias (2 mm / 5°)
- [ ] Recargar la página restaura el progreso desde `AssemblyState`
- [ ] 60 FPS con 100 piezas en escena (verificar con r3f-perf)

---

## 9. Referencias y recursos de aprendizaje

**UI / componentes**
- shadcn/ui — docs y ejemplos oficiales (patrón Tasks para DataTable)
- shadcn-admin (satnaing) — admin completo con Vite + shadcn + TanStack (stack idéntico al de CutterNest)
- tablecn (sadmann7) — data tables avanzadas
- TanStack Query / Table — documentación oficial

**3D**
- docs.pmnd.rs — documentación de react-three-fiber, drei, postprocessing
- threejs-journey (Bruno Simon) — curso de referencia si se quiere profundizar en Three.js
- Ejemplos de drei: configuradores de producto y "kitchen planners" (caso análogo exacto)
- Poly Haven / ambientCG — texturas PBR CC0 (maderas, melaminas)

**Referentes funcionales del dominio (nesting / taller)**
- OpenCutList (lairdubois, open source para SketchUp) — mejor UX de referencia para cut list, nesting y etiquetas
- SVGnest y Deepnest.io — visualización de nesting en navegador
- CutList Optimizer (cutlistoptimizer.com) — referencia comercial de flujo de optimización

---

*Documento generado como guía de refactorización incremental. Cada fase es entregable de forma independiente y compatible con la API `/api/v1` vigente.*
