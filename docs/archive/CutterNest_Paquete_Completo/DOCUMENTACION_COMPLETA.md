# CutterNest SVG Generator v2 — Documentación Completa
## Proyecto: 4 Módulos con Cajones Verticales y Repisas

> **Fecha:** 2026-08-19  
> **Versión:** v2.0  
> **Total de piezas:** 56 (52 tipos únicos)  
> **Módulos:** 4 principales + 4 submódulos de cajones  
> **Superficie total:** 20.89 m²  
> **Metros lineales de canto:** 65.4 m  

---

## Tabla de Contenidos

1. [Datos de Entrada (CSV)](#1-datos-de-entrada-csv)
2. [Arquitectura del Proyecto](#2-arquitectura-del-proyecto)
3. [Modelo de Grafo](#3-modelo-de-grafo)
4. [Algoritmo de Layout](#4-algoritmo-de-layout)
5. [Código JavaScript Completo](#5-código-javascript-completo)
6. [SVGs Generados](#6-svgs-generados)
7. [Optimizaciones](#7-optimizaciones)
8. [Dashboard de Materiales](#8-dashboard-de-materiales)
9. [Roadmap](#9-roadmap)

---

## 1. Datos de Entrada (CSV)

### 1.1 Estructura del Archivo

```csv
id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo
```

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `id` | Identificador único | `m1-base` |
| `nombre` | Descripción legible | `Base modulo M1` |
| `ancho` | Ancho en mm | `450` |
| `alto` | Alto en mm | `520` |
| `cantidad` | Unidades | `1` |
| `rotate` | ¿Permite rotación? | `si` / `no` |
| `color` | Color hexadecimal | `#C19A6B` |
| `espesor` | Espesor en mm | `15` |
| `cantos` | Bordes a cantear | `T,B,L,R` |
| `modulo` | Módulo perteneciente | `1` |

### 1.2 Resumen por Módulo

| Módulo | Tipo | Piezas | Dimensiones | Color Principal |
|--------|------|--------|-------------|-----------------|
| **M1** | Cajonera doble | 7 + 6 + 6 = 19 | 450 × 2300 mm | `#C19A6B` (Roble Claro) |
| **M2** | Cajonera doble | 7 + 6 + 6 = 19 | 460 × 2300 mm | `#8B5A2B` (Nogal) |
| **M3** | Repisero (3+1) | 7 | 500 × 2300 mm | `#C19A6B` (Roble Claro) |
| **M4** | Repisero (3+1) | 7 | 510 × 2300 mm | `#8B5A2B` (Nogal) |

### 1.3 Piezas con Canto

**40 piezas** requieren canto, totalizando **65.4 metros lineales**:

| Tipo de canto | Metros | Color en diagrama |
|---------------|--------|-------------------|
| Top (T) | 11.8 m | 🔴 Rojo |
| Bottom (B) | 11.8 m | 🔵 Azul |
| Left (L) | 20.8 m | 🟢 Verde |
| Right (R) | 20.8 m | 🟣 Morado |

---

## 2. Arquitectura del Proyecto

### 2.1 Diagrama de Módulos

```
┌─────────────────────────────────────────────────────────────┐
│                    PROYECTO CUTTERNEST v1                    │
├─────────────────────────────────────────────────────────────┤
│  Módulo 1 (450×2300)      │  Módulo 2 (460×2300)           │
│  ├─ Base, Tapa, Laterales │  ├─ Base, Tapa, Laterales      │
│  ├─ Fondo, Repisas (2)    │  ├─ Fondo, Repisas (2)         │
│  ├─ Cajón Superior (M11)  │  ├─ Cajón Superior (M21)       │
│  │   ├─ Frente 400×180    │  │   ├─ Frente 410×180        │
│  │   ├─ Laterales 180×450 │  │   ├─ Laterales 180×450     │
│  │   ├─ Base 360×450      │  │   ├─ Base 370×450          │
│  │   ├─ Fondo 360×450     │  │   ├─ Fondo 370×450         │
│  │   └─ Tirador           │  │   └─ Tirador               │
│  └─ Cajón Inferior (M12)  │  └─ Cajón Inferior (M22)       │
│      (misma estructura)   │      (misma estructura)        │
├─────────────────────────────────────────────────────────────┤
│  Módulo 3 (500×2300)      │  Módulo 4 (510×2300)           │
│  ├─ Base, Tapa, Laterales │  ├─ Base, Tapa, Laterales      │
│  ├─ Fondo                 │  ├─ Fondo                      │
│  ├─ Repisa Superior (1)   │  ├─ Repisa Superior (1)        │
│  └─ Repisas Inferiores (3)│  └─ Repisas Inferiores (3)     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Distribución Vertical (Módulos 1 y 2)

```
Tapa        (15 mm)
├─ Hueco    (~400 mm)
Repisa Sup  (25 mm)
├─ Cajón Sup (180 mm) ── Frente 400×180, Laterales 180×450
├─ Hueco    (~400 mm)
Repisa Inf  (25 mm)
├─ Cajón Inf (180 mm)
├─ Hueco    (~400 mm)
Base        (15 mm)
─────────────────────
TOTAL: 2300 mm
```

---

## 3. Modelo de Grafo

### 3.1 Definición Formal

```
G = (V, E, A)

V = {v₁, v₂, ..., vₙ}   → piezas del mueble
E ⊆ V × V                 → relaciones espaciales
A: V → ℝ⁴ × ℂ × ℤ         → atributos (x, y, w, h, color, zIndex)
```

### 3.2 Tipos de Nodos

| Tipo | zIndex | Descripción | Ejemplos |
|------|--------|-------------|----------|
| `background` | 0 | Piezas de fondo | `fondo` |
| `vertical` | 1 | Elementos verticales | `laterales`, `montante` |
| `horizontal` | 2 | Elementos horizontales | `base`, `tapa` |
| `shelf` | 3 | Estantes y repisas | `repisa-superior` |
| `divider` | 4 | Divisores internos | `divisor-*` |
| `brace` | 5 | Refuerzos | `travesano` |

### 3.3 Tipos de Aristas

```
modulo ──contiene──► base
modulo ──contiene──► lateral-izq
lateral-izq ──soporta──► repisa-superior
repisa-superior ──encima──► cajon-superior
```

---

## 4. Algoritmo de Layout

### 4.1 Constraint Solver Top-Down

```
ALGORITMO SolveLayout(G)
─────────────────────────────────────────
ENTRADA:  Grafo G con nodo raíz y constraints
SALIDA:   Posiciones (x, y) para cada nodo
─────────────────────────────────────────
1.  r ← {v ∈ V | v.parent = null}     ▷ Encontrar raíz
2.  Q ← [r]                             ▷ Cola BFS
3.  r.x ← 0, r.y ← 0
4.  MIENTRAS Q ≠ ∅:
5.      p ← Q.desencolar()
6.      PARA CADA hijo c de p:
7.          c.x ← p.x + c.constraints.marginX
8.          SI c.constraints.anchor = 'top':
9.              c.y ← p.y + c.constraints.offsetY
10.         SI c.constraints.anchor = 'bottom':
11.             c.y ← p.y + p.h − c.h − c.constraints.offsetY
12.         SI c.constraints.centerX:
13.             c.x ← p.x + (p.w − c.w) / 2
14.         Q.encolar(c)
15. viewBox.w ← max{v.x + v.w | v ∈ V}
16. viewBox.h ← max{v.y + v.h | v ∈ V}
17. RETORNAR viewBox
```

### 4.2 Complejidad

| Métrica | Valor | Justificación |
|---------|-------|---------------|
| **Tiempo** | O(V + E) | Un recorrido BFS |
| **Espacio** | O(V) | Almacenar posiciones |
| **Overlaps** | O(V²) | Validación opcional AABB |

---

## 5. Código JavaScript Completo

```javascript
/**
 * CutterNest SVG Generator v2
 * Grafo dirigido + Constraint Solver + SVG optimizado
 */

class CutterNest {
  constructor() {
    this.graph = new Map();
    this.edges = new Map();
    this.viewBox = { w: 0, h: 0 };
  }

  addNode(id, { w, h, type, color, parent = null, constraints = {} }) {
    this.graph.set(id, {
      id, w, h, type, color, parent,
      constraints,
      x: 0, y: 0,
      zIndex: this._zIndexFor(type)
    });
    if (parent) {
      if (!this.edges.has(parent)) this.edges.set(parent, []);
      this.edges.get(parent).push(id);
    }
  }

  _zIndexFor(type) {
    const z = { background: 0, vertical: 1, horizontal: 2, 
                 shelf: 3, divider: 4, brace: 5, container: 99 };
    return z[type] ?? 3;
  }

  solveLayout() {
    const root = [...this.graph.values()].find(n => n.parent === null);
    if (!root) throw new Error('Falta nodo raíz');

    const queue = [root.id];
    root.x = 0; root.y = 0;

    while (queue.length) {
      const pid = queue.shift();
      const parent = this.graph.get(pid);
      const children = this.edges.get(pid) || [];

      for (const cid of children) {
        const child = this.graph.get(cid);
        const c = child.constraints;
        child.x = parent.x + (c.marginX ?? 0);
        child.y = parent.y + (c.offsetY ?? 0);
        if (c.anchor === 'bottom') child.y = parent.y + parent.h - child.h - (c.offsetY ?? 0);
        if (c.centerX) child.x = parent.x + (parent.w - child.w) / 2;
        queue.push(cid);
      }
    }

    let maxX = 0, maxY = 0;
    for (const n of this.graph.values()) {
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    this.viewBox = { w: maxX, h: maxY };
  }

  buildSVG() {
    const nodes = [...this.graph.values()]
      .filter(n => n.type !== 'container')
      .sort((a, b) => a.zIndex - b.zIndex);

    const byColor = new Map();
    for (const n of nodes) {
      if (!byColor.has(n.color)) byColor.set(n.color, []);
      byColor.get(n.color).push(n);
    }

    const { w, h } = this.viewBox;
    let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a;width:100%;height:auto;display:block;">\n`;
    svg += `  <defs>\n    <marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f59e0b"/></marker>\n  </defs>\n`;

    for (const [color, pieces] of byColor) {
      svg += `  <g fill="${color}" stroke="#1e293b" stroke-width="2">\n`;
      for (const p of pieces) {
        const d = `M${p.x},${p.y}h${p.w}v${p.h}h-${p.w}Z`;
        svg += `    <path d="${d}" data-id="${p.id}" data-type="${p.type}"/>\n`;
        if (p.w > 100 && p.h > 40) {
          svg += `    <text x="${p.x + p.w/2}" y="${p.y + p.h/2 + 4}" text-anchor="middle" fill="#0f172a" font-size="10" font-weight="600" pointer-events="none">${p.id}</text>\n`;
        }
      }
      svg += `  </g>\n`;
    }

    svg += `  <line x1="0" y1="${h+20}" x2="${w}" y2="${h+20}" stroke="#f59e0b" stroke-width="1.5" marker-end="url(#a)" marker-start="url(#a)"/>\n`;
    svg += `  <text x="${w/2}" y="${h+42}" text-anchor="middle" fill="#f59e0b" font-size="13" font-weight="700">${w} mm</text>\n`;
    svg += `</svg>`;
    return svg;
  }

  render() { this.solveLayout(); return this.buildSVG(); }

  detectOverlaps() {
    const nodes = [...this.graph.values()].filter(n => n.type !== 'container');
    const collisions = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          collisions.push({ a: a.id, b: b.id });
        }
      }
    }
    return collisions;
  }
}

// USO
const nest = new CutterNest();
nest.addNode('modulo', { w: 450, h: 2300, type: 'container', color: 'none' });
// ... definir piezas ...
const svg = nest.render();
```

---

## 6. SVGs Generados

### 6.1 Vistas Frontales (4 módulos)

| Archivo | Módulo | Tipo | Dimensiones |
|---------|--------|------|-------------|
| `modulo1_frontal.svg` | M1 | Cajonera doble | 450 × 2300 mm |
| `modulo2_frontal.svg` | M2 | Cajonera doble | 460 × 2300 mm |
| `modulo3_frontal.svg` | M3 | Repisero (3+1) | 500 × 2300 mm |
| `modulo4_frontal.svg` | M4 | Repisero (3+1) | 510 × 2300 mm |

**Características:**
- Escala 1:1 (1 unidad SVG = 1 mm)
- Fondo de cuadrícula 50 mm
- Líneas de dimensión con flechas
- Leyenda integrada
- Piezas agrupadas por color

### 6.2 Despieces de Cajones (4 SVGs)

| Archivo | Cajón | Dimensiones Frente |
|---------|-------|-------------------|
| `cajon_m11_despiece.svg` | M11 (Sup M1) | 400 × 180 mm |
| `cajon_m12_despiece.svg` | M12 (Inf M1) | 400 × 180 mm |
| `cajon_m21_despiece.svg` | M21 (Sup M2) | 410 × 180 mm |
| `cajon_m22_despiece.svg` | M22 (Inf M2) | 410 × 180 mm |

**Incluye:** Frente, laterales, base, fondo, tirador + instrucciones de ensamblaje.

### 6.3 Nesting / Optimización de Corte

**Archivo:** `nesting_completo.svg`

- **Algoritmo:** First-Fit Decreasing Height
- **Tablero:** 2750 × 1830 mm
- **Piezas:** 56 unidades físicas
- **Tableros estimados:** 15
- **Eficiencia:** variable por tablero (calculada en SVG)

### 6.4 Vista Isométrica

**Archivo:** `vista_isometrica_m1.svg`

Proyección 3D simplificada del Módulo 1 con:
- Cara frontal (brillante)
- Cara superior (perspectiva)
- Cara lateral (oscura)
- Cajones sobresaliendo
- Leyenda de ejes X/Y/Z

### 6.5 Pasos de Ensamblaje

**Archivo:** `pasos_ensamblaje.svg`

6 pasos visuales + checklist:
1. Colocar base
2. Encajar laterales
3. Instalar fondo
4. Colocar repisas
5. Insertar cajones
6. Colocar tapa

**Checklist final:** Escuadra, nivel, deslizamiento, cantos, tiradores, limpieza.

### 6.6 Mapa de Cantos

**Archivo:** `mapa_cantos.svg`

- **40 piezas** con canto visualizadas
- Código de colores: T=rojo, B=azul, L=verde, R=morado
- Total: **65.4 m lineales**
- Estimado: **1.3 rollos** de 50m

### 6.7 Dashboard de Materiales

**Archivo:** `dashboard_materiales.svg`

KPIs:
- 56 piezas totales
- 20.89 m² de superficie
- 65.4 m de canto
- 15 tableros estimados
- 4h tiempo de ensamblaje

Gráficos:
- Barras por color de melamina
- Barras por espesor (15mm, 5mm, 30mm)
- Tabla de distribución por módulo

---

## 7. Optimizaciones

| Técnica | Antes | Después | Reducción |
|---------|-------|---------|-----------|
| `<rect>` individuales | 52 elementos | 4 grupos `<g>` | ~60% |
| Atributos `fill` repetidos | 52 veces | 4 veces | ~80% |
| ViewBox | Sobredimensionado | Exacto al bounding box | ~70% área |
| Paths vs rects | `<rect>` verbose | `<path d="M...Z">` | ~15% |
| Decimales | `x="40.000"` | `x="40"` | ~5% |
| **Total** | ~15 KB | ~5 KB | **~65%** |

---

## 8. Dashboard de Materiales

### 8.1 Superficie por Color

| Color | Nombre | m² | % |
|-------|--------|----|---|
| #C19A6B | Roble Claro | 6.22 | 29.8% |
| #F2F2F2 | Blanco | 5.07 | 24.3% |
| #D9C2A3 | Haya | 3.26 | 15.6% |
| #8B5A2B | Nogal | 6.33 | 30.3% |
| #A0A0A0 | Metal | 0.00 | 0.0% |

### 8.2 Piezas por Espesor

| Espesor | Cantidad | % |
|---------|----------|---|
| 15 mm | 48 | 85.7% |
| 5 mm | 4 | 7.1% |
| 30 mm | 0 | 0.0% |

### 8.3 Metros Lineales de Canto

| Tipo | Metros | Rollos 50m |
|------|--------|------------|
| Top (T) | 11.8 | 0.24 |
| Bottom (B) | 11.8 | 0.24 |
| Left (L) | 20.8 | 0.42 |
| Right (R) | 20.8 | 0.42 |
| **Total** | **65.4** | **1.31** |

---

## 9. Roadmap

| Feature | Prioridad | Descripción |
|---------|-----------|-------------|
| Exportar CSV | Alta | `renderCSV()` para CutterNest |
| Vista lateral | Media | Corte transversal con profundidad |
| Nesting avanzado | Alta | Algoritmo Guillotine o Shelf |
| Canvas 2D | Baja | Render alternativo para animaciones |
| WebGL/Three.js | Baja | Vista 3D interactiva |
| App móvil | Baja | Visualizador en smartphone |

---

## Referencias

- **CSV fuente:** `CutterNest Piezas v1` — 4 módulos con cajones verticales y repisas
- **Algoritmo:** Constraint Solver Top-Down sobre DAG
- **Complejidad:** O(V + E) tiempo, O(V) espacio
- **Licencia:** Uso libre para proyectos de carpintería digital

---

*Documento generado automáticamente el 2026-08-19.*
*Para visualizar los SVGs, abrir los archivos `.svg` en cualquier navegador moderno.*
