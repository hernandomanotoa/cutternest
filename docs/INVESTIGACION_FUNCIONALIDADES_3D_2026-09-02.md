# Investigación: Funcionalidades de sistemas de diseño 3D aplicables al Assembly Planner

- **Fecha**: 2026-09-02
- **Alcance**: investigación (sin implementación) de funcionalidades 3D de software de diseño de muebles, viewers/configuradores 3D web y CAD paramétrico, evaluadas contra el Assembly Planner de CutterNest.
- **Contexto técnico**: el Assembly Planner es un renderizador 3D basado en **SVG puro (sin WebGL)**. Muestra módulos de muebles (paneles laterales, estantes, fondos, barras colgadoras) con: rotación orbital X/Y (OrbitControls), exploded view centrado por módulo, transparencia selectiva de piezas externas (envelope), X-ray, cotas W×D×H por pieza, presets de cámara (Iso/Frente/Lado/Arriba), auto-centrado de cámara y hover de piezas.
- **Metodología**: investigación web en 3 frentes paralelos (vertical muebles/carpintería, horizontal viewers 3D web, CAD paramétrico/ensamblajes). Productos con sitios no accesibles fueron excluidos (Mozaik, Fusion 360/Woodwork for Inventor, TopSolid Wood, FlexTools, Sketchfab, Verge3D, IKEA).

---

## 1. Estado actual de CutterNest vs. industria

Funcionalidades ya implementadas que **coinciden con patrones estándar de la industria**:

| CutterNest | Equivalente industrial |
|---|---|
| Explode con deslizador único desde centroide | Autodesk Viewer `ExplodeExtension` |
| Transparencia selectiva / X-ray | Autodesk ghosting, SketchUp X-ray |
| Presets de cámara + cotas por pieza | PolyBoard, Cabinet Vision (documentación de taller) |
| OrbitControls (rotate/pan/zoom) | Three.js `OrbitControls`, estándar web |

## 2. Hallazgos por frente

### 2.1 Software vertical de muebles/carpintería

- **Section planes / cortes 2D del modelo 3D**: un plano oculta todo lo de un lado sin mover geometría (SketchUp Section Planes). imos iX los lleva a producción con cotas asociativas y mostrar/ocultar con un clic. Cabinet Vision genera alzados cotados automáticos.
- **Exploded view con doble función** (vista + selección de pieza en diseños complejos) — PolyBoard.
- **Assembly views como vista estándar** junto a plano/alzado/3D — Cabinet Vision.
- **Measuring tool + vistas 3D cotadas imprimibles** — PolyBoard.
- **Interacción pieza↔lista bidireccional**: localizar piezas desde la cutlist resaltándolas, con dirección de veta — OpenCutList (SketchUp). **El patrón más valorado por la comunidad de carpinteros.**
- **Modo ensamblaje paso a paso**: no está en CAD verticales clásicos; lo cubren apps post-venta con guías 3D interactivas (BILT, Easemble) — mercado validado pero separado del diseño.
- Lo técnico-cotado prima sobre lo fotorrealista en el vertical; el render realista se delega a motores externos.

### 2.2 Viewers y configuradores 3D web

- **Controles orbitales estándar**: rotate (drag izq), pan (drag der/two-finger), zoom (rueda/pinch), auto-rotate e inercia — Three.js / `<model-viewer>`.
- **Alternativas al orbit**: arcball (rotación libre sin polo), first-person/walkthrough, map controls para planos.
- **Toggle ortográfica ↔ perspectiva** para medición precisa — ThatOpen `OrthoPerspectiveCamera`, estándar en viewers CAD/BIM.
- **Presets de cámara con transiciones interpoladas** — `<model-viewer>` interpola `camera-orbit`; Sketchfab hace fly-to en anotaciones.
- **Anotaciones/hotspots fijos al modelo**: pines numerados que heredan la transformación del objeto y abren tarjetas — Sketchfab; `<model-viewer>` los implementa como DOM proyectado.
- **Hover/picking con estilos nombrados**: color/opacidad propios, multi-selección, eventos select/clear para mostrar atributos — ThatOpen Highlighter.
- **Medición 3D con snap** a vértices/aristas/caras y cadenas de distancias — Autodesk Viewer `MeasureTool`.
- **Clipping/sección en vivo** con plano deslizable y contorno/hatch en la cara cortada — Three.js `ClippingGroup`, Autodesk section tool, BIM viewers.
- **Ghosting**: piezas no seleccionadas atenuadas al ~30% — Autodesk LayersManager.
- **AR** (`<model-viewer>` `ar`): estándar retail; **descartado para SVG**.

### 2.3 CAD paramétrico y ensamblajes

- **Exploded view con "explode lines"**: líneas punteadas de recorrido entre pieza original y posición despiezada — SolidWorks (Fusion 360/Onshape no generan rutas automáticas).
- **Animación ensamblaje/desensamblaje**: interpolación colapsado↔exploded en timeline — SolidWorks Motion Study; play/reverse básico en Onshape/Alibre.
- **Mates/restricciones**: coincident, concentric, distance, angle (SolidWorks); joints con límites (Fusion 360); mate connectors (Onshape). Los muebles casi solo usan coincident/offset → **solver no justificado**.
- **BOM interactivo**: sincronización tabla↔selección 3D — Onshape. SolidWorks/Alibre solo en drawings.
- **Detección de interferencias**: volumen de intersección resaltado — SolidWorks Interference Detection; Fusion 360 en inspect.
- **Display states / snapshots**: guardar visibilidad + transparencia por configuración — SolidWorks display states; Onshape named positions.
- **Cotas asociativas 3D**: casi ningún CAD las muestra en el modelo 3D (reservadas a drawings); PolyBoard/imos sí en vistas técnicas.

## 3. Viabilidad en SVG (sin WebGL)

| Viabilidad | Funcionalidades |
|---|---|
| **Alta** | Section planes (test de signo del centroide + `clipPath`), BOM↔3D bidireccional, explode lines, animación explode (interpolación de factor), hover/picking (point-in-polygon), snapshots de visualización (JSON en store), transiciones de cámara (easing sobre ángulos), hotspots DOM proyectados, toggle orto/perspectiva (cambio de matriz de proyección), modo paso a paso (ocultar por nivel Kahn) |
| **Media** | Hatch en cara de corte, detección de interferencia AABB/OBB ortotrópico, cotas asociativas entre piezas, medición con snap |
| **Baja / descartada** | Render fotorrealista, sombras por hardware, walkthrough, AR, solver de mates, volúmenes de interferencia exactos, LOD (innecesario: geometría paramétrica ligera) |

## 4. Recomendaciones priorizadas (impacto/esfuerzo)

| # | Funcionalidad | Referencia | Impacto | Esfuerzo |
|---|---------------|-----------|---------|----------|
| 1 | **Section planes por eje** (slider Frente/Lado/Arriba, hatch en corte) | SketchUp, imos iX, Autodesk | Alto | Medio |
| 2 | **BOM ↔ 3D bidireccional** (clic en fila resalta pieza y viceversa) | OpenCutList, Onshape | Altísimo (taller) | Bajo |
| 3 | **Explode lines** (líneas punteadas ensamblado→despiezado) | SolidWorks | Alto | Muy bajo |
| 4 | **Modo ensamblaje paso a paso** (aislar por nivel Kahn, atenuar resto) | SolidWorks Motion Study, BILT | Alto | Medio |
| 5 | **Toggle ortográfica ↔ perspectiva** | Autodesk, ThatOpen | Medio-alto (cotas) | Muy bajo |

Otras candidatas de segundo nivel: hover con panel de datos de pieza (ThatOpen), snapshots de visualización (SolidWorks display states), hotspots enlazados al manual (Sketchfab), detección de interferencia entre piezas.

## 5. Limitaciones de la investigación

- Sitios no accesibles durante el estudio: Mozaik Design, Fusion 360/Woodwork for Inventor, TopSolid Wood, FlexTools, Sketchfab, Verge3D, IKEA planner (403/404/anti-bot).
- Hallazgos de esos productos se basan en conocimiento consolidado del dominio, no en verificación directa.
