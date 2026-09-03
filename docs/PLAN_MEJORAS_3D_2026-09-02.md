# Plan: Mejoras 3D del Assembly Planner (basado en investigación 2026-09-02)

- **Fecha**: 2026-09-02
- **Base**: `docs/INVESTIGACION_FUNCIONALIDADES_3D_2026-09-02.md`
- **Estado inicial**: commit `03cd3e8` (cotas 3D, auto-centrado, presets). Tests: 256 pass / 0 fail.
- **Restricciones**: solo `frontend/public/assembly-planner/` (motor en `js/renderer3d/`, UI en `js/views/renderer3DView.js`). Render SVG puro, sin WebGL. Capas: lógica pura en servicios/`renderer3d`, UI solo en vistas. Tests con `node --test`. Un commit por tarea.

## Criterios transversales por tarea

- Tests nuevos pasan y totales no bajan (`cd frontend/public/assembly-planner && node --test`).
- Sin colores hardcodeados fuera de `core/config.js`/`materials.js` (paleta existente).
- La vista solo hace pegamento: lógica de cálculo vive en `renderer3d/`.
- Commit atómico por tarea con mensaje `feat(assembly-planner): ...`.

---

## T1 — Explode lines (líneas de ruta del despiece)

**Referencia**: SolidWorks explode lines. **Esfuerzo**: muy bajo. **Impacto**: alto (legibilidad del manual).

- **Motor** (`js/renderer3d/`):
  - `renderer3D.js`: en `render()`, antes de `applyExplode`, capturar centroides originales `Map<id, {cx,cy,cz}>`; pasarlo en options a `buildSVG`.
  - `svgBuilder.js`: si `explodeFactor > 0` y existen centroides originales, proyectar centroide original (rotado y centrado como las caras) y dibujar `<line>` punteada del centroide original al explotado, por pieza, **antes** del painter's sort o en un grupo con `pointer-events="none"`.
- **Tests**: `renderer3d.test.js` — con factor 0 no hay líneas; con factor > 0 hay una línea por pieza con extremos coherentes (delta proyectado ∝ delta 3D).
- **Aceptación**: al activar Explode, cada pieza muestra línea punteada desde su posición ensamblada.

## T2 — Toggle proyección ortográfica ↔ perspectiva

**Referencia**: ThatOpen `OrthoPerspectiveCamera`, Autodesk Viewer. **Esfuerzo**: muy bajo.

- **Motor**:
  - `transform.js`: `projectVertexCentered(v, moduleCenter, camera, persp)` — si `camera.projection === 'persp'`, dividir `x/z` por profundidad `d0 - rotated.y` (d0 ≈ módulo mayor / tan(fov)); si no, ruta actual.
  - `camera.js`: estado `projection: 'ortho' | 'persp'` (default `'ortho'`), incluido en `getState/setState/reset`; constante `DEFAULT_CAMERA.projection = 'ortho'`.
  - `svgBuilder.js`: usar la nueva firma con `camera.projection`.
  - `renderer3D.js`: `setProjection(mode)`; `_fitCameraToModule` solo en modo orto (o ajustar d0 en persp).
- **Vista** (`renderer3DView.js`): botón toggle "Perspectiva" junto a presets.
- **Tests**: punto proyectado difiere entre modos con misma cámara; `setProjection` actualiza estado; reset vuelve a `'ortho'`.
- **Aceptación**: toggle cambia la proyección en vivo sin recargar piezas.

## T3 — BOM ↔ 3D bidireccional

**Referencia**: OpenCutList, Onshape. **Esfuerzo**: bajo. **Impacto**: altísimo en taller.

- **Motor**:
  - `renderer3D.js`: `setSelectedId(id)` y `setHoveredId(id)` públicos (ya hay estado interno; solo API + `needsRender`).
- **Vista** (`renderer3DView.js`):
  - Panel lateral (lista de piezas del módulo: nombre, `w×d×h`, cantos, cantidad).
  - Hover/click en fila → `setHoveredId/setSelectedId`; resaltado reutiliza estilos existentes (`#FFD700`).
  - Click en pieza del SVG (`interaction.onSelect` ya existe) → sincroniza fila activa (clase CSS).
- **Tests**: tests de la API `setSelectedId/setHoveredId` (estado + flag de render); test de integración que el SVG marca `data-piece-id`.
- **Aceptación**: clic en fila resalta la pieza en 3D y viceversa.

## T4 — Section planes por eje (corte vivo)

**Referencia**: SketchUp Section Planes, Autodesk section tool. **Esfuerzo**: medio. **Impacto**: alto.

- **T4a — Clipping por plano**:
  - Estado: `{ sectionAxis: 'x'|'y'|'z'|null, sectionT: 0..1 }` (posición como fracción del tamaño del módulo en ese eje).
  - `renderer3D.js`: `setSection(axis, t)`; calcula `sectionValue = min + t * size` del eje (en mm, coords de módulo no centradas).
  - `svgBuilder.js`: pieza visible solo si su centroide en `sectionAxis` ≤ `sectionValue` (o ≥ según convención; documentar). Dibujar línea indicadora del plano proyectada (rectángulo del plano en el módulo) con `pointer-events="none"`.
  - `renderer3DView.js`: select de eje (Ninguno/X/Y/Z) + slider `sectionT`.
  - **Tests**: con plano a t=0.5, piezas con centroide a ambos lados se incluyen/excluyen correctamente; t=1 incluye todo.
- **T4b — Hatch en cara de corte** (opcional si T4a queda sólido):
  - Recorte de caras contra el plano (Sutherland–Hodgman 3D por arista) y relleno con patrón `<pattern>` en la cara seccionada.
  - **Tests**: pieza atravesada por el plano genera polígono de corte con área > 0.
- **Aceptación**: slider recorta el módulo en vivo; vista Iso+Frente del corte muestra interior sin explode.

## T5 — Modo ensamblaje paso a paso

**Referencia**: SolidWorks Motion Study, BILT. **Esfuerzo**: medio. **Impacto**: alto.

- **Dependencia**: niveles topológicos existentes (grafo Kahn usado por el manual; reutilizar utilidad del proyecto, no reimplementar).
- **Motor**:
  - `renderer3D.js`: `setAssemblyStep(level)` — piezas con `level > step` se atenúan a 0.12 (`isDimmed` por paso); piezas del nivel actual resaltadas; centrar cámara en el bounding box de las piezas del paso.
  - `resetAssemblyStep()` vuelve a vista completa.
- **Vista**: barra de pasos (◀ Paso n/N ▶) mostrada solo en modo paso; toggle "Modo paso".
- **Tests**: `setAssemblyStep` atenúa piezas futuras; nivel inválido es no-op; cámara recalculada.
- **Aceptación**: avanzar pasos aísla visualmente cada nivel de ensamblaje.

---

## Orden de ejecución

T1 → T2 → T3 → T4a → T4b (opcional) → T5

Cada tarea: implementación → tests → `node --test` → commit atómico.

## Riesgos y notas

- **Painter's algorithm + clipping**: el corte por centroide puede mostrar caras "huecas" en piezas atravesadas por el plano; es aceptable en T4a y se resuelve con T4b.
- **Perspectiva**: con rotación Y cercana a ±90° la división por profundidad puede degenerar; clamp de `rotY` ya existe (±90) y se añadirá `d0` mínimo.
- **Pasos de ensamblaje**: requiere que las piezas tengan `level` topológico accesible desde la vista; si el grafo vive solo en React (`frontend/src`), se usa la utilidad equivalente del planner o se expone por CSV; decidir en T5 antes de codificar.
