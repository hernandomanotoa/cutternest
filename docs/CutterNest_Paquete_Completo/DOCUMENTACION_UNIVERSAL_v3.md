# CutterNest SVG Engine v3 — Motor Universal de Muebles

> **Versión:** 3.0  
> **Fecha:** 2026-08-19  
> **Arquitectura:** Grafo Dirigido + Constraint Solver + Family Router  
> **Complejidad:** O(V + E) tiempo, O(V) espacio  
> **Familias soportadas:** cabinet, shelving, table, seating, wardrobe, bed

---

## 1. ¿Por qué un motor universal?

El motor v2 estaba **acoplado a cajoneras y repiseros**. Parseaba nombres en español como `"medio inferior"` y asumía estructuras rígidas. Esto funcionaba para tu CSV original, pero **fallaba** con:

- Mesas (patas, no laterales)
- Sillas (asiento + respaldo, no base + tapa)
- Closets (puertas abatibles, no cajones)
- Camas (cabecero + somier, no estantes)

La v3 introduce una **taxonomía de roles** (`inferRole`) y **routers por familia** (`FamilyRouters`) que desacoplan el motor del tipo de mueble.

---

## 2. Taxonomía de Muebles

### 2.1 Familias Soportadas

| Familia | Muebles típicos | Estructura base | Insertos |
|---------|-----------------|-----------------|----------|
| `cabinet` | Cajoneras, zapateros, nightstands | Base + Tapa + 2 Laterales + Fondo | Cajones, repisas, divisores |
| `shelving` | Libreros, estanterías, repiseros | Base + Tapa + 2 Laterales + Fondo | Estantes horizontales, divisores verticales |
| `table` | Mesas, escritorios, consolas | Tablero + 4 Patas (o 2 caballetes) | Cajón suspendido, estante inferior |
| `seating` | Sillas, bancos, taburetes | Respaldo + Asiento + 4 Patas | (ninguno) |
| `wardrobe` | Closets, roperos, armarios | Igual que cabinet | Puertas, rieles colgadores, cajones interiores |
| `bed` | Camas, bases, cabeceros | Cabecero + Somier + 4 Patas | Cajones bajo cama |

### 2.2 Roles de Piezas (inferRole)

El sistema `inferRole` analiza el nombre de cada pieza y le asigna un **rol semántico** independiente del idioma:

| Rol | Detectado por | Ejemplos de nombres |
|-----|---------------|---------------------|
| `side_panel` | "lateral", "costado", "montante" | `Lateral izquierdo`, `Montante central` |
| `top_panel` | "tapa", "techo", "tablero" | `Tapa modulo`, `Tablero mesa` |
| `bottom_panel` | "base" (sin "cajon") | `Base modulo`, `Base cajonera` |
| `back_panel` | "fondo" (sin "cajon") | `Fondo modulo`, `Respaldo silla` |
| `front_panel` | "frente" (sin "cajon") | `Frente modulo` |
| `shelf` | "estante", "repisa" | `Estante inferior`, `Repisa superior` |
| `divider` | "divisor", "division" | `Divisor medio`, `Separador` |
| `drawer_face` | "cajon" + "frente" | `Frente cajon superior` |
| `drawer_side` | "cajon" + "lateral" | `Lateral cajon sup` |
| `drawer_bottom` | "cajon" + "base" | `Base cajon superior` |
| `drawer_back` | "cajon" + "fondo" | `Fondo cajon superior` |
| `handle` | "tirador" | `Tirador cajon` |
| `leg` | "pata", "pie" | `Pata regulable`, `Pie mesa` |
| `brace` | "tirante", "travesano", "refuerzo" | `Travesano trasero` |
| `door` | "puerta" | `Puerta izquierda` |
| `seat_panel` | "asiento", "banco" | `Asiento silla` |

### 2.3 Fallback por Dimensión

Si el nombre no coincide con ningún patrón, el sistema usa la **geometría**:

```javascript
if (width > height * 3) return 'shelf';      // muy alargada horizontal
if (height > width * 3) return 'side_panel'; // muy alargada vertical
return 'panel';                               // genérica
```

---

## 3. Arquitectura del Motor

### 3.1 Diagrama de Flujo

```
┌─────────────────┐
│   CSV Entrada   │
└────────┬────────┘
         ▼
┌─────────────────┐
│  inferRole()    │  ← Asigna rol semántico a cada pieza
└────────┬────────┘
         ▼
┌─────────────────┐
│ detectFamily()  │  ← Detecta familia por roles presentes
└────────┬────────┘
         ▼
┌─────────────────┐
│getModuleDimensions│ ← Calcula ancho/alto real del módulo
└────────┬────────┘
         ▼
┌─────────────────┐
│ FamilyRouter    │  ← Router específico: cabinet|shelving|table|...
└────────┬────────┘
         ▼
┌─────────────────┐
│ CutterNestSvgEngine│ ← Grafo + Constraint Solver
│   - addNode()   │
│   - solveLayout()│
│   - buildSVG()  │
└────────┬────────┘
         ▼
┌─────────────────┐
│   SVG Salida    │
└─────────────────┘
```

### 3.2 Grafo Dirigido

```javascript
G = (V, E, A)

V = {v₁, v₂, ..., vₙ}        // piezas
E ⊆ V × V                    // relaciones padre-hijo
A: V → {x, y, w, h, color, zIndex, constraints}
```

### 3.3 Constraint Solver

Cada pieza hija tiene un objeto `constraints` que define su posición relativa al padre:

```javascript
{
  marginX: 40,        // desplazamiento horizontal desde el padre
  offsetY: 200,       // desplazamiento vertical desde el padre
  anchor: 'bottom',   // 'top' | 'bottom' | 'center'
  centerX: true,      // centrar horizontalmente
  centerY: false      // centrar verticalmente
}
```

**Resolución de constraints:**

```javascript
child.x = parent.x + (constraints.marginX ?? 0);
child.y = parent.y + (constraints.offsetY ?? 0);

if (constraints.anchor === 'bottom') {
  child.y = parent.y + parent.h - child.h - (constraints.offsetY ?? 0);
}
if (constraints.centerX) {
  child.x = parent.x + (parent.w - child.w) / 2;
}
```

---

## 4. Correcciones respecto a v2

| Problema v2 | Solución v3 |
|-------------|-------------|
| Altura del módulo tomaba `p.alto` de laterales (550 en vez de 2300) | `getModuleDimensions` usa `Math.max(ancho, alto)` para laterales |
| Cotas de dimensión quedaban fuera del `viewBox` | `viewBox` se expande con `padding` (60px por defecto) |
| Cajones se ignoraban completamente | `FamilyRouters.cabinet` tiene rama específica para `drawer_*` |
| `centerX` sobrescribía `marginX` silenciosamente | Constraints se aplican en orden determinista |
| `buildEngineForModule` era monolítica (~200 líneas) | Dividida en `inferRole` + `getModuleDimensions` + `FamilyRouters` |
| Solo parseaba español literal | `inferRole` usa patrones + fallback por dimensión |
| Solo soportaba cabinets | 6 familias: cabinet, shelving, table, seating, wardrobe, bed |

---

## 5. API Pública

### 5.1 `buildEngineForModule(pieces, moduleId, options)`

```javascript
import { buildEngineForModule } from './CutterNestEngine_v3_Universal.js';

// Cargar CSV como array de objetos
const pieces = [
  { id: 'm1-base', nombre: 'Base modulo M1', ancho: 450, alto: 520, cantidad: 1, 
    rotate: 'si', color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: 1 },
  // ... más piezas
];

// Construir motor para el módulo 1
const engine = buildEngineForModule(pieces, 1, {
  family: 'cabinet',      // opcional: auto-detectado si no se especifica
  thickness: 15           // espesor por defecto en mm
});

// Generar SVG
const svg = engine.render({
  showDimensions: true,   // mostrar cotas
  padding: 60             // margen alrededor del viewBox
});

document.body.innerHTML = svg;
```

### 5.2 `detectFamily(pieces, moduleId)`

Detecta automáticamente la familia basándose en los roles presentes:

```javascript
// Lógica de detección:
if (hay 'leg') {
  if (hay 'seat_panel' o 'back_panel') return 'seating';
  return 'table';
}
if (hay 'door') return 'wardrobe';
if (hay 'drawer_*') return 'cabinet';
if (≥3 'shelf') return 'shelving';
return 'cabinet'; // fallback
```

### 5.3 `inferRole(piece)`

```javascript
import { inferRole } from './CutterNestEngine_v3_Universal.js';

const role = inferRole({
  id: 'm1-lateral-izq',
  nombre: 'Lateral izquierdo M1'
});
// → 'side_panel'
```

### 5.4 `getModuleDimensions(pieces, thickness)`

```javascript
import { getModuleDimensions } from './CutterNestEngine_v3_Universal.js';

const { width, height, thickness } = getModuleDimensions(pieces, 15);
// → { width: 450, height: 2300, thickness: 15 }
```

### 5.5 Opciones de Renderizado

```javascript
const svg = engine.render({
  activeIds: ['m1-base', 'm1-lateral-izq'],     // piezas resaltadas (cyan)
  completedIds: ['m1-tapa'],                     // piezas completadas (opacidad 1)
  showDimensions: true,                          // mostrar cotas
  padding: 60                                    // margen del viewBox
});
```

---

## 6. Family Routers en Detalle

### 6.1 `cabinet(pieces, meta)`

**Estructura:**
1. Base (anclada abajo)
2. Tapa (arriba)
3. Laterales izquierdo y derecho
4. Fondo (fondo completo)
5. Cajones (agrupados por hueco: superior/inferior)
6. Repisas (distribuidas uniformemente)
7. Divisores (uno por hueco)
8. Refuerzos (travesaños)

**Posicionamiento de cajones:**
```javascript
// Cajón superior: y = thickness + 200
// Cajón inferior: y = moduleH - thickness - 200 - faceHeight
// Centrado:        y = (moduleH - faceHeight) / 2
```

### 6.2 `shelving(pieces, meta)`

**Estructura:**
1. Base + Tapa + Laterales + Fondo (igual que cabinet)
2. Estantes distribuidos con `calculateShelfPositions()`:
   ```
   gap = (moduleH - 2*thickness - totalShelfH) / (nShelves + 1)
   y_i = thickness + gap + i * (shelfH + gap)
   ```
3. Divisores verticales (montantes centrales opcionales)

### 6.3 `table(pieces, meta)`

**Estructura:**
1. Tablero (parte superior)
2. 4 patas en las esquinas:
   ```
   pata 1: (20, thickness)
   pata 2: (width - legW - 20, thickness)
   pata 3: (20, height - legH)
   pata 4: (width - legW - 20, height - legH)
   ```
3. Cajón suspendido (opcional, centrado)
4. Estante inferior (opcional)

### 6.4 `seating(pieces, meta)`

**Estructura:**
1. Respaldo (parte superior, centrado)
2. Asiento (centro, centrado)
3. 4 patas (2 adelante, 2 atrás)

### 6.5 `wardrobe(pieces, meta)`

**Estructura:**
1. Base de `cabinet`
2. Puertas abatibles (divididas equitativamente):
   ```javascript
   doorWidth = moduleWidth / nDoors;
   // Cada puerta: x = i * doorWidth + 1, y = thickness
   ```

---

## 7. CSV de Ejemplo Universal

El archivo `CutterNest_Universal_Ejemplo.csv` contiene **6 muebles diferentes**:

| Módulo | Familia | Mueble | Piezas |
|--------|---------|--------|--------|
| M1 | cabinet | Cajonera doble | 18 |
| M2 | shelving | Librero alto | 17 |
| M3 | table | Mesa de centro | 6 |
| M4 | seating | Silla | 8 |
| M5 | wardrobe | Ropero con puertas | 9 |
| M6 | cabinet | Zapatero | 9 |

---

## 8. Extensión: Agregar una Nueva Familia

Para agregar soporte para **muebles de cocina** (`kitchen`):

```javascript
const FamilyRouters = {
  // ... familias existentes ...

  kitchen(pieces, meta) {
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map(p => ({ ...p, role: inferRole(p) }));

    // Estructura base
    // ... base, tapa, laterales ...

    // Cajones con sistema de cierre suave
    // ...

    // Puertas con bisagras ocultas
    // ...

    // Zócalo de cocina (plinto)
    // ...

    return engine;
  }
};
```

Y actualizar `detectFamily`:

```javascript
if (roles.some(r => r === 'plinto' || r === 'encimera')) return 'kitchen';
```

---

## 9. Roadmap v4

| Feature | Prioridad | Descripción |
|---------|-----------|-------------|
| **Perfiles curvos** | Alta | Soporte para `path` en vez de solo rectángulos |
| **Vista 3D (isométrica real)** | Alta | Proyección con factor 0.5 en X y Y |
| **Animaciones paso a paso** | Media | Transiciones CSS entre `activeIds` |
| **Exportar DXF** | Media | Para compatibilidad con CNC |
| **Nesting avanzado** | Alta | Algoritmo Guillotine o Shelf |
| **App PWA** | Baja | Visualizador offline en móvil |

---

## 10. Referencias

- **Motor:** `CutterNestEngine_v3_Universal.js`
- **Ejemplo CSV:** `CutterNest_Universal_Ejemplo.csv`
- **Documentación v2:** `CutterNest_SVG_Generator_v2_Documentacion.md`
- **Complejidad:** O(V + E) tiempo, O(V) espacio
- **Licencia:** Uso libre para proyectos de carpintería digital

---

*Documento generado automáticamente el 2026-08-19.*
*Para soporte o contribuciones, referirse a la arquitectura de Family Routers.*
