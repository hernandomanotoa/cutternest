# Guía: Vista Isométrica 3D SVG — CutterNest Assembly Planner

> **Documento generado:** 2026-08-20
> **Tecnología:** SVG puro (sin Three.js, sin Canvas, sin librerías externas)
> **Módulos ES6:** vanilla JavaScript

## 1. Resumen

La vista isométrica transforma las piezas de un mueble definidas en CSV en una representación 3D usando únicamente SVG. Cada pieza se modela como un cuboide en un espacio 3D local `(x, y, z)`, se proyecta a 2D mediante proyección isométrica y se ordena con el *painter's algorithm* para pintar primero las piezas que están atrás/abajo.

## 2. Archivos que intervienen

| Archivo | Responsabilidad |
|---------|-----------------|
| `frontend/public/assembly-planner/js/isometricRenderer.js` | Clase `IsometricRenderer`: proyección 3D, construcción de geometrías, ordenamiento y generación del SVG. |
| `frontend/public/assembly-planner/js/views/isometricView.js` | Vista de la pestaña: crea controles (zoom, explode, cajones, puertas, exportar) y orquesta el renderizado. |
| `frontend/public/assembly-planner/js/app.js` | Registra la vista isométrica en el diccionario `viewRenderers` y maneja el cambio de pestañas. |
| `frontend/public/assembly-planner/index.html` | Añade el botón de pestaña `Isométrica`. |
| `frontend/public/assembly-planner/js/svgEngine.js` | Provee funciones compartidas: `inferRole`, `getPieceDims`, `getModuleDimensions`, `detectFamily`, `calculateShelfPositions`. |
| `frontend/public/assembly-planner/js/utils.js` | `getModulePieces`, `getModuleLabel`, `escapeHtml`, `normalizeName`, etc. |

## 3. Flujo de renderizado

```text
Piezas CSV
    ↓
inferRole()  →  bottom_panel, top_panel, side_panel, shelf, drawer_face, door...
    ↓
IsometricRenderer._buildModuleGeometries()
    ↓
Cuboides 3D con (x, y, z, w, d, h, color, role)
    ↓
sortByDepth()  →  painter's algorithm
    ↓
_isoProject()  →  sx = ox + (x − 0.5·y)·scale, sy = oy − (z + 0.5·y)·scale
    ↓
_buildSVG()  →  3 caras visibles por cuboide (frontal, superior, lateral derecha)
    ↓
Inyección en el contenedor HTML
```

## 4. Código fuente

### isometricRenderer.js — Motor isométrico 3D

Archivo: `frontend/public/assembly-planner/js/isometricRenderer.js`

```javascript
/**
 * IsometricRenderer — Renderizador SVG isométrico 3D para CutterNest Assembly Planner
 * Tecnología: SVG puro, sin librerías externas.
 */

import {
  inferRole,
  getPieceDims,
  getModuleDimensions,
  detectFamily,
  calculateShelfPositions,
} from './svgEngine.js';
import { escapeHtml } from './utils.js';

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function adjustColor(hex, percent) {
  const clean = String(hex || '#C19A6B').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(percent * 2.55)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + Math.round(percent * 2.55)));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + Math.round(percent * 2.55)));
  return `rgb(${r},${g},${b})`;
}

function getFaceColors(baseColor) {
  return {
    front: baseColor,
    top: adjustColor(baseColor, 20),
    right: adjustColor(baseColor, -20),
  };
}

const Z_INDEX = {
  back_panel: 1,
  side_panel: 2,
  bottom_panel: 3,
  top_panel: 3,
  hanger_rail: 4,
  shelf: 4,
  divider: 5,
  brace: 6,
  drawer_back: 7,
  drawer_bottom: 8,
  drawer_side: 9,
  drawer_face: 10,
  door: 10,
  seat_panel: 10,
  handle: 11,
  leg: 12,
  panel: 3,
  front_panel: 10,
};

function getZIndex(role) {
  return Z_INDEX[role] ?? 3;
}

function getDepthKey(geo) {
  return geo.x + geo.y + geo.z + (geo.w + geo.d + geo.h) * 0.3;
}

function sortByDepth(geometries) {
  return geometries.slice().sort((a, b) => {
    const diff = getDepthKey(a) - getDepthKey(b);
    if (Math.abs(diff) > 50) return diff;
    return getZIndex(a.role) - getZIndex(b.role);
  });
}

export class IsometricRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.scale = options.scale || 0.12;
    this.isoDepth = options.isoDepth || 0.5;
    this.padding = options.padding || 100;
    this.showDimensions = options.showDimensions !== false;
    this.showAxes = options.showAxes !== false;
    this.drawerGap = options.drawerGap || 15;
    this.doorAngle = options.doorAngle || 0;
    this.explodeFactor = options.explodeFactor || 0;
    this.labelMode = options.labelMode || 'auto';
  }

  render(moduleId, pieces, _dependencies) {
    const family = detectFamily(pieces, moduleId);
    const allPieces = pieces.filter((p) => !this._isGlobalPiece(p));
    const globalPieces = pieces.filter((p) => this._isGlobalPiece(p));

    if (!allPieces.length) {
      this.container.innerHTML =
        '<p class="empty-state">No hay piezas para renderizar en vista isométrica.</p>';
      return;
    }

    const dims = getModuleDimensions(allPieces, this._inferThickness(allPieces), family);
    const moduleW = dims.width;
    const moduleH = dims.height;
    const moduleD = this._getModuleDepth(allPieces);
    const thickness = dims.thickness;

    const moduleLabel = this._getModuleLabel(moduleId, pieces);

    const geometries = [];

    // Piezas del módulo principal
    geometries.push(...this._buildModuleGeometries(allPieces, moduleW, moduleD, moduleH, thickness, family));

    // Piezas de estructura global (zócalo, tapa corrida, panel trasero)
    if (globalPieces.length) {
      geometries.push(...this._buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness));
    }

    // Aplicar vista explodida
    if (this.explodeFactor > 0) {
      this._applyExplode(geometries, moduleW, moduleD, moduleH);
    }

    const sorted = sortByDepth(geometries);
    const { viewBox, originX, originY } = this._calculateViewport(geometries);

    const svg = this._buildSVG(sorted, viewBox, originX, originY, moduleLabel, moduleW, moduleD, moduleH);
    this.container.innerHTML = svg;
  }

  // ═══════════════════════════════════════════════════════════
  // GEOMETRÍA 3D
  // ═══════════════════════════════════════════════════════════

  _buildModuleGeometries(pieces, moduleW, moduleD, moduleH, thickness, family) {
    const geometries = [];
    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));

    // Estructura del módulo
    const bottom = roles.find((p) => p.role === 'bottom_panel');
    const top = roles.find((p) => p.role === 'top_panel');
    const sides = roles.filter((p) => p.role === 'side_panel');
    const back = roles.find((p) => p.role === 'back_panel');
    const legs = roles.filter((p) => p.role === 'leg');

    if (bottom) {
      geometries.push({
        x: 0, y: 0, z: 0, w: moduleW, d: moduleD, h: thickness,
        color: bottom.color, role: 'bottom_panel', name: bottom.nombre, id: bottom.id,
      });
    }

    if (top) {
      geometries.push({
        x: 0, y: 0, z: moduleH - thickness, w: moduleW, d: moduleD, h: thickness,
        color: top.color, role: 'top_panel', name: top.nombre, id: top.id,
      });
    }

    sides.forEach((side) => {
      const isLeft = normalizeName(side.nombre).includes('izquierdo') || normalizeName(side.id).includes('izq');
      const x = isLeft ? 0 : moduleW - thickness;
      geometries.push({
        x, y: 0, z: thickness, w: thickness, d: moduleD, h: moduleH - 2 * thickness,
        color: side.color, role: 'side_panel', name: side.nombre, id: side.id,
      });
    });

    if (back) {
      geometries.push({
        x: 0, y: 0, z: thickness, w: moduleW, d: thickness, h: moduleH - 2 * thickness,
        color: back.color, role: 'back_panel', name: back.nombre, id: back.id, opacity: 0.35,
      });
    }

    // Patas (mesas/sillas)
    legs.forEach((leg) => {
      const dims = getPieceDims(leg, 'leg', thickness, family);
      const w = dims.w;
      const h = dims.h;
      const x = this._inferLegX(leg, moduleW, w);
      const y = moduleD - w;
      geometries.push({
        x, y, z: -h, w, d: w, h,
        color: leg.color || '#1e293b', role: 'leg', name: leg.nombre, id: leg.id,
      });
    });

    // Estantes / repisas
    const shelves = roles.filter((p) => p.role === 'shelf');
    if (shelves.length) {
      const shelfPositions = calculateShelfPositions(moduleH, shelves, thickness, family);
      shelfPositions.forEach((sp) => {
        geometries.push({
          x: thickness, y: 0, z: sp.y, w: moduleW - 2 * thickness, d: moduleD, h: sp.h,
          color: sp.piece.color, role: 'shelf', name: sp.piece.nombre, id: sp.piece.id,
        });
      });
    }

    // Divisores
    const dividers = roles.filter((p) => p.role === 'divider');
    dividers.forEach((div) => {
      const dims = getPieceDims(div, 'divider', thickness, family);
      const x = this._inferDividerX(div, moduleW, thickness);
      geometries.push({
        x, y: 0, z: thickness, w: thickness, d: moduleD, h: moduleH - 2 * thickness,
        color: div.color, role: 'divider', name: div.nombre, id: div.id,
      });
    });

    // Puertas
    const doors = roles.filter((p) => p.role === 'door');
    doors.forEach((door) => {
      const dims = getPieceDims(door, 'door', thickness, family);
      const x = this._inferDoorX(door, moduleW, dims.w, thickness);
      const z = this._inferDoorZ(door, moduleH, dims.h, thickness);
      const baseGeo = {
        x, y: moduleD - thickness, z, w: dims.w, d: thickness, h: dims.h,
        color: door.color, role: 'door', name: door.nombre, id: door.id,
      };
      geometries.push(this._applyDoorRotation(baseGeo));
    });

    // Cajones
    const drawers = roles.filter((p) => p.role.startsWith('drawer_') || p.role === 'handle');
    if (drawers.length) {
      geometries.push(...this._buildDrawerGeometries(roles, moduleW, moduleD, moduleH, thickness, family));
    }

    // Riel colgador
    const rails = roles.filter((p) => p.role === 'hanger_rail');
    rails.forEach((rail) => {
      const dims = getPieceDims(rail, 'hanger_rail', thickness, family);
      const z = this._inferRailZ(rail, moduleH, dims.h, thickness);
      geometries.push({
        x: thickness, y: moduleD / 2 - 12.5, z, w: moduleW - 2 * thickness, d: 25, h: dims.h,
        color: rail.color || '#A0A0A0', role: 'hanger_rail', name: rail.nombre, id: rail.id,
      });
    });

    // Travesaños / refuerzos
    const braces = roles.filter((p) => p.role === 'brace');
    braces.forEach((brace) => {
      const dims = getPieceDims(brace, 'brace', thickness, family);
      const x = this._inferBraceX(brace, moduleW, dims.w, thickness);
      const z = this._inferBraceZ(brace, moduleH, dims.h, thickness);
      geometries.push({
        x, y: moduleD - thickness, z, w: dims.w, d: thickness, h: dims.h,
        color: brace.color, role: 'brace', name: brace.nombre, id: brace.id, opacity: 0.7,
      });
    });

    return geometries;
  }

  _buildDrawerGeometries(roles, moduleW, moduleD, moduleH, thickness, family) {
    const geometries = [];
    const faces = roles.filter((p) => inferRole(p) === 'drawer_face');
    if (!faces.length) return geometries;

    const usableH = moduleH - 2 * thickness;
    const dims = faces.map((f) => ({ face: f, ...getPieceDims(f, 'drawer_face', thickness, family) }));
    const totalH = dims.reduce((s, d) => s + d.h, 0);
    const gap = totalH < usableH ? (usableH - totalH) / (faces.length + 1) : 0;
    const scale = totalH > usableH ? usableH / totalH : 1;

    // Ordenar: superior → medio → inferior
    dims.sort((a, b) => this._drawerRank(a.face) - this._drawerRank(b.face));

    let currentZ = thickness + gap;
    dims.forEach((d) => {
      const h = d.h * scale;
      const w = d.w;
      const x = (moduleW - w) / 2;
      const drawerDepth = moduleD - 2 * thickness - 10;
      const yFace = moduleD - thickness + this.drawerGap;

      // Frente del cajón
      geometries.push({
        x, y: yFace, z: currentZ, w, d: thickness, h,
        color: d.face.color, role: 'drawer_face', name: d.face.nombre, id: d.face.id,
      });

      // Laterales del cajón
      const sideH = h - 2 * thickness;
      const sideColor = d.face.color;
      geometries.push(
        {
          x: x + thickness, y: 0, z: currentZ + thickness, w: thickness, d: drawerDepth, h: sideH,
          color: sideColor, role: 'drawer_side', name: 'Lateral cajón', id: `${d.face.id}-side`, opacity: 0.5,
        },
        {
          x: x + w - 2 * thickness, y: 0, z: currentZ + thickness, w: thickness, d: drawerDepth, h: sideH,
          color: sideColor, role: 'drawer_side', name: 'Lateral cajón', id: `${d.face.id}-side2`, opacity: 0.5,
        }
      );

      // Base del cajón
      geometries.push({
        x: x + thickness, y: 0, z: currentZ + thickness, w: w - 2 * thickness, d: drawerDepth, h: thickness,
        color: sideColor, role: 'drawer_bottom', name: 'Base cajón', id: `${d.face.id}-bottom`, opacity: 0.5,
      });

      // Fondo del cajón
      geometries.push({
        x: x + thickness, y: drawerDepth - thickness, z: currentZ + thickness, w: w - 2 * thickness, d: thickness, h: sideH,
        color: sideColor, role: 'drawer_back', name: 'Fondo cajón', id: `${d.face.id}-back`, opacity: 0.4,
      });

      // Tirador
      const handle = roles.find((p) => inferRole(p) === 'handle' && (p.id.startsWith(d.face.id.split('-').slice(0, -1).join('-')) || normalizeName(p.nombre).includes(normalizeName(d.face.nombre))));
      if (handle) {
        const hx = x + w / 2 - 15;
        const hz = currentZ + h / 2 - 10;
        geometries.push({
          x: hx, y: moduleD + this.drawerGap, z: hz, w: 30, d: 10, h: 20,
          color: handle.color || '#A0A0A0', role: 'handle', name: handle.nombre, id: handle.id,
        });
      }

      currentZ += h + gap;
    });

    return geometries;
  }

  _buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness) {
    const geometries = [];
    globalPieces.forEach((p) => {
      const role = inferRole(p);
      const n = normalizeName(p.nombre);
      const color = p.color || '#C19A6B';

      if (role === 'bottom_panel' || n.includes('zocalo')) {
        const w = Number(p.ancho) || moduleW;
        const d = Number(p.alto) || 100;
        geometries.push({
          x: 0, y: moduleD - d, z: -d, w, d, h: d,
          color, role: 'bottom_panel', name: p.nombre, id: p.id,
        });
      } else if (role === 'top_panel') {
        const w = Number(p.ancho) || moduleW;
        const d = Number(p.alto) || moduleD;
        geometries.push({
          x: 0, y: 0, z: moduleH, w, d, h: thickness,
          color, role: 'top_panel', name: p.nombre, id: p.id,
        });
      } else if (role === 'back_panel') {
        const w = Number(p.ancho) || moduleW;
        const h = Number(p.alto) || moduleH;
        geometries.push({
          x: 0, y: -thickness, z: 0, w, d: thickness, h,
          color, role: 'back_panel', name: p.nombre, id: p.id, opacity: 0.25,
        });
      } else {
        // Pieza global genérica: caja según ancho/alto/espesor
        const w = Number(p.ancho) || moduleW;
        const d = Number(p.alto) || moduleD;
        const h = Number(p.espesor) || thickness;
        geometries.push({
          x: 0, y: 0, z: moduleH, w, d, h,
          color, role: 'brace', name: p.nombre, id: p.id, opacity: 0.8,
        });
      }
    });
    return geometries;
  }

  // ═══════════════════════════════════════════════════════════
  // PROYECCIÓN ISOMÉTRICA Y SVG
  // ═══════════════════════════════════════════════════════════

  _isoProject(x, y, z, ox, oy) {
    return {
      x: ox + (x - y * this.isoDepth) * this.scale,
      y: oy - (z + y * this.isoDepth) * this.scale,
    };
  }

  _buildSVG(geometries, viewBox, ox, oy, moduleLabel, moduleW, moduleD, moduleH) {
    const polygons = [];
    const labels = [];

    // viewBox es string "0 0 W H"; extraemos W/H para centrar título/dimensiones
    const vbParts = viewBox.split(' ').map(Number);
    const vbW = vbParts[2] || 800;
    const vbH = vbParts[3] || 600;

    geometries.forEach((geo) => {
      const { projected, faces } = this._projectCuboid(geo, ox, oy);
      const colors = getFaceColors(geo.color || '#C19A6B');
      const stroke = this._getStroke(geo.role);
      const opacity = geo.opacity ?? 1;

      faces.forEach((face) => {
        const pts = face.indices.map((i) => `${projected[i].x},${projected[i].y}`).join(' ');
        polygons.push(
          `<polygon points="${pts}" fill="${colors[face.name]}" stroke="${stroke.color}" stroke-width="${stroke.width}" opacity="${opacity}" />`
        );
      });

      // Etiqueta en cara frontal (la última de faces es frontal)
      if (this.labelMode !== 'none') {
        const label = this._makeLabel(geo);
        const frontPts = faces.find((f) => f.name === 'front')?.indices.map((i) => projected[i]);
        if (label && frontPts && this._shouldShowLabel(geo, frontPts)) {
          const cx = frontPts.reduce((s, p) => s + p.x, 0) / frontPts.length;
          const cy = frontPts.reduce((s, p) => s + p.y, 0) / frontPts.length;
          labels.push(
            `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#0f172a" font-size="9" font-weight="600" font-family="system-ui,sans-serif" pointer-events="none">${escapeHtml(label)}</text>`
          );
        }
      }
    });

    const title = moduleLabel ? ` — ${escapeHtml(moduleLabel)}` : '';
    const dimsText = `${moduleW} × ${moduleD} × ${moduleH} mm`;

    let extra = '';
    if (this.showAxes) extra += this._drawAxes(ox, oy, moduleW, moduleD, moduleH);
    if (this.showDimensions) extra += this._drawDimensions(ox, oy, moduleW, moduleD, moduleH);

    return `
<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vista isométrica${title}" style="background:#0f172a;width:100%;height:auto;display:block;" preserveAspectRatio="xMidYMid meet">
  <text x="${vbW / 2}" y="28" text-anchor="middle" fill="#f1f5f9" font-size="16" font-weight="700">VISTA ISOMÉTRICA${title}</text>
  <text x="${vbW / 2}" y="50" text-anchor="middle" fill="#94a3b8" font-size="11">${dimsText}</text>
  <g transform="translate(0,0)">
    ${polygons.join('\n    ')}
    ${labels.join('\n    ')}
    ${extra}
  </g>
</svg>`;
  }

  _projectCuboid(geo, ox, oy) {
    const { x, y, z, w, d, h } = geo;
    const v = [];
    v[0] = this._isoProject(x, y, z + h, ox, oy); // base inferior-izq-trasera (z+h no, z es base, z+h es superior)
    // Corrección: z es base inferior, z+h es superior
    // Vértices en orden:
    // 0: (x, y, z)       inferior-izq-trasera
    // 1: (x+w, y, z)     inferior-der-trasera
    // 2: (x+w, y+d, z)   inferior-der-frontal
    // 3: (x, y+d, z)     inferior-izq-frontal
    // 4: (x, y, z+h)     superior-izq-trasera
    // 5: (x+w, y, z+h)   superior-der-trasera
    // 6: (x+w, y+d, z+h) superior-der-frontal
    // 7: (x, y+d, z+h)   superior-izq-frontal

    const verts = [
      [x, y, z],
      [x + w, y, z],
      [x + w, y + d, z],
      [x, y + d, z],
      [x, y, z + h],
      [x + w, y, z + h],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ];

    const projected = verts.map((p) => this._isoProject(p[0], p[1], p[2], ox, oy));

    // Caras visibles: frontal, superior, lateral derecha
    const faces = [
      { name: 'right', indices: [1, 5, 6, 2] }, // lateral derecho (x+w)
      { name: 'top', indices: [4, 5, 6, 7] },   // superior
      { name: 'front', indices: [3, 2, 6, 7] }, // frontal
    ];

    return { projected, faces };
  }

  _getStroke(role) {
    const strokes = {
      back_panel: { color: '#1e293b', width: 1 },
      side_panel: { color: '#334155', width: 1.5 },
      bottom_panel: { color: '#334155', width: 1.5 },
      top_panel: { color: '#334155', width: 1.5 },
      shelf: { color: '#475569', width: 1 },
      divider: { color: '#475569', width: 1 },
      drawer_face: { color: '#fbbf24', width: 2 },
      drawer_side: { color: '#64748b', width: 1 },
      drawer_bottom: { color: '#64748b', width: 1 },
      drawer_back: { color: '#64748b', width: 1 },
      door: { color: '#3b82f6', width: 2 },
      handle: { color: '#e2e8f0', width: 1 },
      leg: { color: '#1e293b', width: 2 },
      brace: { color: '#94a3b8', width: 1 },
      hanger_rail: { color: '#A0A0A0', width: 2 },
    };
    return strokes[role] || { color: '#475569', width: 1 };
  }

  _calculateViewport(geometries) {
    // PASADA 1: proyectar TODOS los vértices con origen provisional (0,0)
    // para descubrir el rango real de coordenadas (incluyendo negativas).
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    geometries.forEach((geo) => {
      const { projected } = this._projectCuboid(geo, 0, 0);
      projected.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });

    if (!isFinite(minX)) {
      minX = 0; minY = 0; maxX = 800; maxY = 600;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const titleSpace = 60;

    // PASADA 2: desplazar todo al área positiva, dejando padding
    const originX = -minX + this.padding;
    const originY = -minY + this.padding + titleSpace;

    const viewBoxW = Math.ceil(contentW + 2 * this.padding);
    const viewBoxH = Math.ceil(contentH + 2 * this.padding + titleSpace);

    return {
      viewBox: `0 0 ${viewBoxW} ${viewBoxH}`,
      originX,
      originY,
      width: viewBoxW,
      height: viewBoxH,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // UTILIDADES DE INFERENCIA
  // ═══════════════════════════════════════════════════════════

  _getModuleDepth(pieces) {
    let d = 0;
    pieces.forEach((p) => {
      const role = inferRole(p);
      if (['bottom_panel', 'top_panel', 'seat_panel', 'hanger_rail', 'shelf'].includes(role)) {
        d = Math.max(d, Number(p.alto) || 0);
      }
      if (role === 'side_panel') {
        d = Math.max(d, Math.min(Number(p.ancho) || 0, Number(p.alto) || 0));
      }
    });
    return d || 400;
  }

  _inferThickness(pieces) {
    const first = pieces.find((p) => Number(p.espesor) > 0);
    return first ? Number(first.espesor) : 15;
  }

  _isGlobalPiece(p) {
    const modulo = String(p.modulo || '').trim().toLowerCase();
    if (modulo === 'estructura' || modulo === 'global') return true;
    if (String(p.id).toLowerCase().startsWith('glb-')) return true;
    return false;
  }

  _getModuleLabel(moduleId, pieces) {
    if (moduleId === 'global') return 'Estructura global';
    return `Módulo ${moduleId}`;
  }

  _drawerRank(piece) {
    const n = normalizeName(piece.nombre);
    const id = normalizeName(piece.id);
    if (n.includes('superior') || n.includes('sup') || id.includes('sup')) return 0;
    if (n.includes('medio')) return 50;
    if (n.includes('inferior') || n.includes('inf') || id.includes('inf')) return 100;
    return 50;
  }

  _applyDoorRotation(geo) {
    if (!this.doorAngle) return geo;
    const angle = (this.doorAngle * Math.PI) / 180;
    // Rotar alrededor del borde izquierdo (eje Y en x = geo.x)
    // Los vértices frontales cambian x y z según ángulo
    // Simulamos moviendo el cuboide: x se desplaza, d aumenta proyectado
    const offset = Math.sin(angle) * geo.h;
    const newDepth = Math.cos(angle) * geo.d + Math.abs(offset);
    return {
      ...geo,
      x: geo.x - offset * 0.5,
      y: geo.y + offset,
      d: newDepth,
    };
  }

  _applyExplode(geometries, moduleW, moduleD, moduleH) {
    const cx = moduleW / 2;
    const cy = moduleD / 2;
    const cz = moduleH / 2;
    geometries.forEach((geo) => {
      const dx = (geo.x + geo.w / 2 - cx) * this.explodeFactor;
      const dy = (geo.y + geo.d / 2 - cy) * this.explodeFactor;
      const dz = (geo.z + geo.h / 2 - cz) * this.explodeFactor;
      geo.x += dx;
      geo.y += dy;
      geo.z += dz;
    });
  }

  _makeLabel(geo) {
    if (geo.role === 'handle') return '';
    const words = String(geo.name || '').split(/\s+/).slice(0, 2);
    if (geo.role === 'side_panel') return normalizeName(geo.name).includes('izquierdo') ? 'Lat.Izq' : 'Lat.Der';
    if (geo.role === 'drawer_face') return 'Cajón';
    if (geo.role === 'shelf') return 'Repisa';
    if (geo.role === 'door') return 'Puerta';
    return words.join(' ');
  }

  _shouldShowLabel(geo, pts) {
    // Área proyectada aproximada
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    area = Math.abs(area) / 2;
    const minArea = geo.role === 'drawer_face' || geo.role === 'door' ? 1500 : 2500;
    return area > minArea;
  }

  _inferDividerX(div, moduleW, thickness) {
    const n = normalizeName(div.nombre);
    const id = normalizeName(div.id);
    // Si hay número, distribuir proporcionalmente
    const m = (id.match(/(\d+)/) || n.match(/(\d+)/) || [null, 1])[1];
    const idx = parseInt(m, 10);
    if (n.includes('central') || n.includes('centro')) return (moduleW - thickness) / 2;
    return (moduleW * idx) / 10;
  }

  _inferDoorX(door, moduleW, doorW, thickness) {
    const n = normalizeName(door.nombre);
    if (n.includes('izquierda') || n.includes('izq')) return thickness;
    if (n.includes('derecha') || n.includes('der')) return moduleW - doorW - thickness;
    return (moduleW - doorW) / 2;
  }

  _inferDoorZ(door, moduleH, doorH, thickness) {
    const n = normalizeName(door.nombre);
    if (n.includes('superior') || n.includes('sup')) return moduleH - doorH - thickness;
    if (n.includes('inferior') || n.includes('inf')) return thickness;
    return (moduleH - doorH) / 2;
  }

  _inferRailZ(rail, moduleH, railH, thickness) {
    const n = normalizeName(rail.nombre);
    const m = n.match(/(\d+)/);
    if (m) {
      const idx = parseInt(m[1], 10);
      return thickness + (idx * (moduleH - 2 * thickness)) / 4;
    }
    return moduleH / 2;
  }

  _inferBraceX(brace, moduleW, braceW, thickness) {
    const n = normalizeName(brace.nombre);
    if (n.includes('trasero') || n.includes('atras')) return thickness;
    if (n.includes('frontal') || n.includes('frente')) return moduleW - braceW - thickness;
    return (moduleW - braceW) / 2;
  }

  _inferBraceZ(brace, moduleH, braceH, thickness) {
    const n = normalizeName(brace.nombre);
    if (n.includes('superior') || n.includes('sup')) return moduleH - thickness - braceH;
    if (n.includes('inferior') || n.includes('inf')) return thickness;
    return (moduleH - braceH) / 2;
  }

  _inferLegX(leg, moduleW, legW) {
    const n = normalizeName(leg.nombre);
    const id = normalizeName(leg.id);
    if (n.includes('izquierdo') || id.includes('izq')) return 20;
    if (n.includes('derecho') || id.includes('der')) return moduleW - legW - 20;
    if (n.includes('frontal')) return moduleW / 2 - legW / 2;
    if (n.includes('trasero')) return moduleW / 2 - legW / 2;
    return moduleW / 2 - legW / 2;
  }

  // ═══════════════════════════════════════════════════════════
  // EJES Y DIMENSIONES
  // ═══════════════════════════════════════════════════════════

  _drawAxes(ox, oy, moduleW, moduleD, moduleH) {
    const origin = this._isoProject(0, moduleD, 0, ox, oy);
    const xTip = this._isoProject(moduleW * 0.25, moduleD, 0, ox, oy);
    const yTip = this._isoProject(0, moduleD - moduleD * 0.25, 0, ox, oy);
    const zTip = this._isoProject(0, moduleD, moduleH * 0.25, ox, oy);

    return `
    <g opacity="0.9">
      <line x1="${origin.x}" y1="${origin.y}" x2="${xTip.x}" y2="${xTip.y}" stroke="#ef4444" stroke-width="2" />
      <text x="${xTip.x}" y="${xTip.y}" fill="#ef4444" font-size="11" font-weight="bold" text-anchor="start">X (ancho)</text>
      <line x1="${origin.x}" y1="${origin.y}" x2="${yTip.x}" y2="${yTip.y}" stroke="#22c55e" stroke-width="2" />
      <text x="${yTip.x}" y="${yTip.y}" fill="#22c55e" font-size="11" font-weight="bold" text-anchor="end">Y (prof.)</text>
      <line x1="${origin.x}" y1="${origin.y}" x2="${zTip.x}" y2="${zTip.y}" stroke="#3b82f6" stroke-width="2" />
      <text x="${zTip.x}" y="${zTip.y}" fill="#3b82f6" font-size="11" font-weight="bold" text-anchor="start">Z (alto)</text>
    </g>`;
  }

  _drawDimensions(ox, oy, moduleW, moduleD, moduleH) {
    // Dimensiones en esquina inferior derecha
    const tx = ox + moduleW * this.scale + 20;
    const ty = oy - moduleH * this.scale - 20;
    return `<text x="${tx}" y="${ty}" fill="#94a3b8" font-size="10" font-family="monospace">W=${moduleW} D=${moduleD} H=${moduleH}</text>`;
  }
}

```

### isometricView.js — Vista y controles de la pestaña

Archivo: `frontend/public/assembly-planner/js/views/isometricView.js`

```javascript
// js/views/isometricView.js — Vista isométrica 3D SVG

import { getModulePieces, getModuleLabel, getModules } from '../utils.js';
import { IsometricRenderer } from '../isometricRenderer.js';

export function renderIsometricView(container, viewState) {
  // Si estamos en global sin piezas, mostrar mensaje útil con selector
  let targetModule = viewState.currentModule;
  const modules = getModules(viewState.pieces);
  const pieces = getModulePieces(viewState.pieces, targetModule);

  if (!pieces.length) {
    const options = modules.map((m) => `<option value="${m}" ${m === targetModule ? 'selected' : ''}>Módulo ${m}</option>`).join('');
    container.innerHTML = `
      <div class="card">
        <div class="card__body">
          <p class="empty-state mb-2">Selecciona un módulo para ver la vista isométrica.</p>
          <select id="iso-module-selector" class="input" ${options ? '' : 'disabled'}>
            ${options || '<option disabled>No hay módulos</option>'}
          </select>
        </div>
      </div>`;
    const select = container.querySelector('#iso-module-selector');
    select?.addEventListener('change', (e) => {
      viewState.currentModule = e.target.value;
      renderIsometricView(container, viewState);
    });
    return;
  }

  container.innerHTML = `
    <div class="card" style="height:100%;display:flex;flex-direction:column;">
      <div class="card__header">
        <h2 class="card__title">Vista isométrica 3D</h2>
        <div class="isometric-controls flex gap-1 flex-wrap">
          <button id="btn-iso-zoom-in" class="btn btn--secondary btn--sm">Zoom +</button>
          <button id="btn-iso-zoom-out" class="btn btn--secondary btn--sm">Zoom −</button>
          <button id="btn-iso-reset" class="btn btn--secondary btn--sm">Reset</button>
          <button id="btn-iso-explode" class="btn btn--secondary btn--sm">Explodida</button>
          <button id="btn-iso-drawers" class="btn btn--secondary btn--sm">Abrir cajones</button>
          <button id="btn-iso-doors" class="btn btn--secondary btn--sm">Abrir puertas</button>
          <button id="btn-iso-export" class="btn btn--primary btn--sm">Exportar SVG</button>
        </div>
      </div>
      <div class="card__body" style="flex:1;min-height:0;">
        <div id="iso-canvas" class="iso-canvas" style="width:100%;height:100%;min-height:400px;background:#0f172a;border-radius:6px;overflow:hidden;"></div>
      </div>
    </div>`;

  const canvas = container.querySelector('#iso-canvas');
  let scale = 0.12;
  let explodeFactor = 0;
  let drawerGap = 15;
  let doorAngle = 0;

  function render() {
    const renderer = new IsometricRenderer(canvas, {
      scale,
      isoDepth: 0.5,
      padding: 100,
      showDimensions: true,
      showAxes: true,
      drawerGap,
      doorAngle,
      explodeFactor,
      labelMode: 'auto',
    });
    renderer.render(targetModule, pieces, viewState.dependencies);
    // Asegurar que el SVG llene el contenedor
    const svg = canvas.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.maxHeight = 'none';
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  }

  render();

  // Controles
  container.querySelector('#btn-iso-zoom-in')?.addEventListener('click', () => {
    scale = Math.min(scale * 1.2, 0.5);
    render();
  });
  container.querySelector('#btn-iso-zoom-out')?.addEventListener('click', () => {
    scale = Math.max(scale / 1.2, 0.03);
    render();
  });
  container.querySelector('#btn-iso-reset')?.addEventListener('click', () => {
    scale = 0.12;
    explodeFactor = 0;
    drawerGap = 15;
    doorAngle = 0;
    render();
  });
  container.querySelector('#btn-iso-explode')?.addEventListener('click', () => {
    explodeFactor = explodeFactor > 0 ? 0 : 0.3;
    render();
  });
  container.querySelector('#btn-iso-drawers')?.addEventListener('click', () => {
    drawerGap = drawerGap > 15 ? 15 : 60;
    render();
  });
  container.querySelector('#btn-iso-doors')?.addEventListener('click', () => {
    doorAngle = doorAngle > 0 ? 0 : 25;
    render();
  });
  container.querySelector('#btn-iso-export')?.addEventListener('click', () => {
    const svg = canvas.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutternest-iso-${targetModule}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

```

### app.js — Registro de la vista (fragmentos)

Archivo: `frontend/public/assembly-planner/js/app.js`

```javascript
// app.js — punto de entrada y orquestador del Assembly Planner

import { $, $, readFileAsText, downloadText, getModules, getModulePieces, getModuleDependencies, getModuleLabel, getModuleGroup, isGlobalPiece } from './utils.js';
import { parseCSV, piecesToCSV, createEmptyPiece } from './csvParser.js';
import { sugerirDependencias } from './heuristics.js';
import { topologicalLevels, buildSteps } from './topologicalSort.js';
import { renderCSVView } from './views/csvView.js';
import { renderGraphView } from './views/graphView.js';
import { renderStructuralView } from './views/structuralView.js';
import { renderAssemblyView } from './views/assemblyView.js';
import { renderManualView } from './views/manualView.js';
import { renderIsometricView } from './views/isometricView.js';
import { calculateHardware } from './hardware.js';

export const state = {
  pieces: [],
  dependencies: [],
  modules: [],
  currentModule: 'global',
  levels: [],
  sorted: [],
  cycle: null,
  steps: [],
  alerts: [],
  hardware: [],
  currentStep: 0,
  simulationMode: 'paused',
  currentView: 'csv',
};

export const GLOBAL_MODULE_ID = 'global';

const viewRenderers = {
  csv: renderCSVView,
  estructural: renderStructuralView,
  grafo: renderGraphView,
  ensamblaje: renderAssemblyView,
  manual: renderManualView,
  isometric: renderIsometricView,
};

export function setStatus(message, type = '') {
  const el = $('#status-message');
  if (!el) return;
  el.textContent = message;
  el.className = type;
}

export function getActivePieces() {
  return getModulePieces(state.pieces, state.currentModule);
}

export function getActiveDependencies() {
  const pieces = getActivePieces();
  return getModuleDependencies(state.dependencies, pieces);
}

export function recalculateAll() {
  const ids = state.pieces.map((p) => p.id);
  state.dependencies = state.dependencies.filter(
    (d) => ids.includes(d.from) && ids.includes(d.to)
  );

  // Detectar módulos
  state.modules = getModules(state.pieces);
  if (!state.modules.includes(state.currentModule)) {
    state.currentModule = state.modules[0] || GLOBAL_MODULE_ID;
  }

  // Calcular con subconjunto activo
  const activePieces = getActivePieces();
  const activeIds = activePieces.map((p) => p.id);
  const activeDependencies = getModuleDependencies(state.dependencies, activePieces);

  const piecesById = Object.fromEntries(state.pieces.map((p) => [p.id, p]));

  // Si el modulo actual es un grupo, calcular pasos por sub-modulo y concatenar
  const group = getModuleGroup(state.pieces, state.currentModule);
  if (group && group.modules.length > 1) {
    let stepOffset = 0;
    const allSteps = [];
    // Paso inicial: piezas globales (estructura de union) ensambladas una sola vez
    const globalPieces = activePieces.filter((p) => isGlobalPiece(p));
    if (globalPieces.length > 0) {
      allSteps.push({
        paso: ++stepOffset,
        piezas: globalPieces.map((p) => p.id),
        paralelo: globalPieces.length > 1,
        tiempo: 10,
      });
    }
    group.modules.forEach((mod) => {
      const modPieces = getModulePieces(state.pieces, mod).filter((p) => !isGlobalPiece(p));
      const modIds = modPieces.map((p) => p.id);
      const modDeps = getModuleDependencies(state.dependencies, modPieces);
      const modResult = buildSteps(modIds, modDeps, piecesById);
      if (modResult.ok) {
        modResult.steps.forEach((s) => {
          allSteps.push({
            ...s,
            paso: stepOffset + s.paso,
          });
        });
        stepOffset += modResult.steps.length;
      }
    });
    state.steps = allSteps;
    state.levels = allSteps.map((s) => s.piezas);
    state.sorted = allSteps.flatMap((s) => s.piezas.map((id) => ({ id, level: s.paso })));
    state.cycle = null;
  } else {
    const topo = topologicalLevels(activeIds, activeDependencies);
    state.levels = topo.levels;
    state.sorted = topo.sorted;
    state.cycle = topo.cycle;
    state.steps = buildSteps(activeIds, activeDependencies, piecesById).steps || [];
  }

  state.alerts = [];
  activePieces.forEach((p) => {
    if (p.riesgo === 'critico') state.alerts.push({ level: 'danger', piece: p, text: `Crítico: ${p.nombre} requiere soporte/divisor.` });
    if (p.riesgo === 'alto') state.alerts.push({ level: 'warning', piece: p, text: `Alto: ${p.nombre} recomienda soporte intermedio.` });
    if (p.tipo === 'fondo_decorativo') state.alerts.push({ level: 'info', piece: p, text: `${p.nombre} es fondo decorativo (${p.espesor} mm).` });
  });
  if (state.cycle) {
    state.alerts.push({ level: 'danger', text: `Ciclo detectado: ${state.cycle.join(' → ')}` });
  }

  state.hardware = calculateHardware(state.pieces, state.dependencies);
  updateModuleSelector();
  updateSummary();
  renderCurrentView();
}

export function updateSummary() {
  const activePieces = getActivePieces();
  $('#summary-module').textContent = getModuleLabel(state.currentModule, state.pieces);
  $('#summary-pieces').textContent = activePieces.length;
  $('#summary-steps').textContent = state.steps.length;
  $('#summary-alerts').textContent = state.alerts.length;
  const graphStatus = $('#summary-graph');
  if (graphStatus) {
    graphStatus.textContent = state.cycle ? 'Ciclo' : state.pieces.length ? 'Válido' : 'Vacío';
    graphStatus.className = `summary-value ${state.cycle ? 'text-danger' : state.pieces.length ? 'text-success' : ''}`;
  }

  const hardwareList = $('#hardware-list');
  if (state.hardware.length === 0) {
    hardwareList.innerHTML = '<p class="empty-state">Importa un CSV para ver la lista.</p>';
    return;
  }
  hardwareList.innerHTML = state.hardware
    .map(
      (h) => `
      <div class="hardware-item ${h.bloqueante ? 'blocking' : ''}">
        <span class="hardware-qty">${h.cantidad}</span>
        <div class="hardware-name">${h.nombre}</div>
        <div class="hardware-meta">${h.especificacion} — ${h.prioridad}</div>
      </div>
    `
    )
    .join('');
}

export function updateModuleSelector() {
  const select = $('#module-selector');
  if (!select) return;
  const current = state.currentModule;
  select.innerHTML = state.modules.map((m) => {
    const label = getModuleLabel(m, state.pieces);
    return `<option value="${m}" ${m === current ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

export function renderCurrentView() {
  const container = $('#view-container');
  container.innerHTML = '';
  const render = viewRenderers[state.currentView] || viewRenderers.csv;
  render(container, state);
}

export function switchTab(view) {
  state.currentView = view;
  $('.tab').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('tab--active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  renderCurrentView();
}

export function loadExample(url) {
  fetch(url)
    .then((res) => res.text())
    .then((text) => loadCSV(text))
    .catch(() => setStatus('No se pudo cargar el ejemplo.', 'alert--danger'));
}

export function loadCSV(text) {
  const result = parseCSV(text);
  if (!result.ok) {
    setStatus(`Errores: ${result.errors.slice(0, 3).join('; ')}`, 'alert--danger');
    return;
  }
  state.pieces = result.pieces;
  state.dependencies = sugerirDependencias(state.pieces);
  state.warnings = result.warnings;
  recalculateAll();
  setStatus(`CSV cargado: ${state.pieces.length} piezas, ${state.dependencies.length} dependencias.`, 'alert--success');
}

export function addEmptyPiece() {
  const count = state.pieces.filter((p) => p.id.startsWith('pieza-')).length + 1;
  state.pieces.push(createEmptyPiece(count + state.pieces.length));
  recalculateAll();
}

function init() {
  // Tabs
  $('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.view));
  });

  // Selector de módulo
  $('#module-selector')?.addEventListener('change', (e) => {
    state.currentModule = e.target.value;
    recalculateAll();
  });

  // Boton de ejemplo desde select
  $('#btn-load-example')?.addEventListener('click', () => {
    const select = $('#example-selector');
    const path = select?.value;
    if (!path) {
      showStatus('Selecciona un mueble primero', 'warning');
      return;
    }
    loadExample(path);
  });

  // Importar CSV
  $('#file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      loadCSV(text);
    } catch (err) {
      setStatus('Error leyendo archivo.', 'alert--danger');
    }
  });

  // Exportar CSV
  $('#btn-export-csv')?.addEventListener('click', () => {
    if (!state.pieces.length) {
      setStatus('No hay piezas para exportar.', 'alert--warning');
      return;
    }
    downloadText('cutternest-piezas.csv', piecesToCSV(state.pieces), 'text/csv');
  });

  // Render inicial
  switchTab('csv');
  setStatus('Listo. Carga un CSV o usa los ejemplos para comenzar.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

```

### index.html — Pestaña Isométrica (fragmento)

Archivo: `frontend/public/assembly-planner/index.html`

```html
<nav class="tabs" role="tablist" aria-label="Vistas">
      <button class="tab tab--active" data-view="csv" role="tab" aria-selected="true">CSV</button>
      <button class="tab" data-view="estructural" role="tab">Estructural</button>
      <button class="tab" data-view="grafo" role="tab">Grafo</button>
      <button class="tab" data-view="ensamblaje" role="tab">Ensamblaje</button>
      <button class="tab" data-view="manual" role="tab">Manual</button>
      <button class="tab" data-view="isometric" role="tab">🧊 Isométrica</button>
    </nav>
```

### svgEngine.js — Exports usados por el motor isométrico

Archivo: `frontend/public/assembly-planner/js/svgEngine.js`

```javascript
/**
 * CutterNest SVG Engine v3 — Universal Furniture Renderer
 * ========================================================
 * Taxonomía de muebles soportada:
 *   - cabinet      : Cajoneras, armarios, zapateros
 *   - shelving     : Estanterías, libreros, repiseros
 *   - table        : Mesas, escritorios, consolas
 *   - seating      : Sillas, bancos, taburetes
 *   - bed          : Camas, cabeceros, bases
 *   - wardrobe     : Closets, roperos con puertas
 *
 * Arquitectura: Grafo dirigido + Constraint Solver + Family Router
 * Complejidad: O(V + E) tiempo, O(V) espacio
 */

// ═══════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function inferRole(piece) {
  const n = normalize(piece.nombre);
  const id = normalize(piece.id);

  if ((n.includes('cajon') || id.includes('cajon')) && !n.includes('cajonera')) {
    if (n.includes('frente') || id.includes('frente')) return 'drawer_face';
    if (n.includes('lateral') || id.includes('lateral')) return 'drawer_side';
    if (n.includes('base') || id.includes('base')) return 'drawer_bottom';
    if (n.includes('fondo') || id.includes('fondo')) return 'drawer_back';
    if (n.includes('tirador') || id.includes('tirador')) return 'handle';
    return 'drawer_part';
  }

  if (n.includes('puerta') || id.includes('puerta')) return 'door';
  if (n.includes('tirador') || id.includes('tirador')) return 'handle';
  if (n.includes('riel') || id.includes('riel')) return 'hanger_rail';
  if (n.includes('pata') || n.includes('pie') || id.includes('pata')) return 'leg';
  if (n.includes('tirante') || n.includes('travesano') || n.includes('refuerzo') || n.includes('cantonera')) return 'brace';

  if (n.includes('zocalo')) return 'bottom_panel';

  if (n.includes('estante') || n.includes('repisa')) return 'shelf';
  if (n.includes('divisor') || n.includes('division')) return 'divider';

  if (n.includes('base')) return 'bottom_panel';
  if (n.includes('tapa') || n.includes('techo') || n.includes('tapa de trabajo')) return 'top_panel';
  if (n.includes('fondo') || n.includes('posterior') || n.includes('trasera')) return 'back_panel';
  if (n.includes('frente')) return 'front_panel';

  if (n.includes('lateral') || n.includes('costado') || n.includes('montante')) return 'side_panel';
  if (n.includes('montante') || n.includes('poste')) return 'side_panel';

  if (n.includes('tablero') || n.includes('superficie')) return 'top_panel';
  if (n.includes('respald') || n.includes('respaldo')) return 'back_panel';
  if (n.includes('asiento') || n.includes('banco')) return 'seat_panel';

  const w = Number(piece.ancho) || 0;
  const h = Number(piece.alto) || 0;
  if (w > h * 3) return 'shelf';
  if (h > w * 3) return 'side_panel';

  return 'panel';
}

/**
 * Devuelve las dimensiones VISUALES de una pieza según su rol.
 * El campo `rotate` indica orientación en el plano de corte, no siempre
 * en la vista frontal. Se interpreta sólo donde tenga sentido visual.
 */
function useVisualThickness(alto, espesor) {
  return alto <= espesor * 1.5 ? alto : espesor;
}

function getPieceDims(piece, role, thickness = 15, family = 'cabinet') {
  const ancho = Number(piece.ancho) || 0;
  const alto = Number(piece.alto) || 0;
  const espesor = Number(piece.espesor) || thickness || 15;
  const rotate = String(piece.rotate).toLowerCase() === 'si';

  let w = ancho;
  let h = alto;
  if (rotate) [w, h] = [h, w];

  // Paneles horizontales delgados
  if (role === 'top_panel' || role === 'bottom_panel' || role === 'seat_panel' || role === 'hanger_rail') {
    return { w: ancho, h: useVisualThickness(alto, espesor) };
  }

  if (role === 'shelf') {
    if (family === 'shelving') return { w: ancho, h: alto };
    return { w: ancho, h: useVisualThickness(alto, espesor) };
  }

  if (role === 'brace') {
    return { w: ancho, h: useVisualThickness(alto, espesor) };
  }

  // Paneles laterales / montantes: vistos de canto
  if (role === 'side_panel') {
    return { w: espesor, h: Math.max(w, h) };
  }

  // Divisores anti-pandeo: tira vertical
  if (role === 'divider') {
    return { w: ancho, h: Math.max(w, h) };
  }

  // Fondo
  if (role === 'back_panel') {
    return { w, h };
  }

  // Puertas y frentes de cajón
  if (role === 'door' || role === 'drawer_face') {
    return { w: ancho, h: alto };
  }

  // Partes internas de cajón
  if (role === 'drawer_bottom' || role === 'drawer_side' || role === 'drawer_back') {
    return { w, h };
  }

  // Patas
  if (role === 'leg') {
    return { w: Math.min(w, h), h: Math.max(w, h) };
  }

  // Tiradores
  return { w: ancho, h: alto };
}

function getModuleDimensions(pieces, thickness = 15, family = null) {
  const detectedFamily = family || detectFamily(pieces);
  const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
  const dims = new Map(
    roles.map((p) => [p.id, getPieceDims(p, p.role, thickness, detectedFamily)])
  );

  const inferredThickness =
    roles.length && Number(roles[0].espesor) ? Number(roles[0].espesor) : thickness;

  // Carcasas cerradas: el fondo define el módulo completo
  if (family === 'cabinet' || family === 'shelving' || family === 'wardrobe') {
    const back = roles.find((p) => p.role === 'back_panel');
    if (back) {
      const { w, h } = dims.get(back.id);
      return { width: w, height: h, thickness: inferredThickness };
    }
  }

  const tops = roles.filter((p) => p.role === 'top_panel').map((p) => dims.get(p.id));
  const bottoms = roles.filter((p) => p.role === 'bottom_panel').map((p) => dims.get(p.id));
  const sides = roles.filter((p) => p.role === 'side_panel').map((p) => dims.get(p.id));
  const legs = roles.filter((p) => p.role === 'leg').map((p) => dims.get(p.id));
  const seats = roles.filter((p) => p.role === 'seat_panel').map((p) => dims.get(p.id));
  const backs = roles.filter((p) => p.role === 'back_panel').map((p) => dims.get(p.id));

  const candidatesW = [...tops, ...bottoms, ...seats, ...backs].map((d) => d.w);
  const moduleW = candidatesW.length ? Math.max(...candidatesW) : 900;

  let moduleH;
  if (legs.length) {
    const legH = Math.max(...legs.map((d) => d.h));
    const topH = tops.length ? Math.max(...tops.map((d) => d.h)) : 0;
    const seatH = seats.length ? Math.max(...seats.map((d) => d.h)) : 0;
    const backH = backs.length ? Math.max(...backs.map((d) => d.h)) : 0;

    if (seats.length && backH) {
      // Asiento: respaldo + asiento + patas
      moduleH = backH + seatH + legH;
    } else {
      // Mesa: pata + tablero
      moduleH = legH + topH;
    }
  } else {
    const sideH = sides.length ? Math.max(...sides.map((d) => d.h)) : 0;
    moduleH = sideH || 2300;
  }

  return { width: moduleW, height: moduleH, thickness: inferredThickness };
}

// ═══════════════════════════════════════════════════════════
// CLASE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export class CutterNestSvgEngine {
  constructor() {
    this.graph = new Map();
    this.edges = new Map();
    this.viewBox = { w: 0, h: 0 };
  }

  addNode(id, { w, h, type, color, parent = null, constraints = {}, overlapAllowed = false }) {
    this.graph.set(id, {
      id,
      w: Number(w) || 0,
      h: Number(h) || 0,
      type: type || 'panel',
      color: color || '#94a3b8',
      parent,
      constraints: { ...constraints },
      overlapAllowed: !!overlapAllowed,
      x: 0,
      y: 0,
      zIndex: this._zIndexFor(type),
    });
    if (parent) {
      if (!this.edges.has(parent)) this.edges.set(parent, []);
      this.edges.get(parent).push(id);
    }
  }

  _zIndexFor(type) {
    const z = {
      background: 0,
      back_panel: 1,
      side_panel: 2,
      bottom_panel: 3,
      top_panel: 3,
      hanger_rail: 4,
      shelf: 4,
      divider: 5,
      brace: 6,
      drawer_bottom: 7,
      drawer_side: 8,
      drawer_back: 9,
      drawer_face: 10,
      door: 10,
      seat_panel: 10,
      handle: 11,
      leg: 12,
      container: 99,
    };
    return z[type] ?? 3;
  }

  solveLayout() {
    const root = [...this.graph.values()].find((n) => n.parent === null);
    if (!root) throw new Error('Falta nodo raíz (container sin parent)');

    const queue = [root.id];
    root.x = 0;
    root.y = 0;

    while (queue.length) {
      const pid = queue.shift();
      const parent = this.graph.get(pid);
      const children = this.edges.get(pid) || [];

      for (const cid of children) {
        const child = this.graph.get(cid);
        const c = child.constraints;

        child.x = parent.x + (c.marginX ?? 0);
        child.y = parent.y + (c.offsetY ?? 0);

        if (c.anchor === 'bottom') {
          child.y = parent.y + parent.h - child.h - (c.offsetY ?? 0);
        }
        if (c.anchor === 'center') {
          child.x = parent.x + (parent.w - child.w) / 2;
          child.y = parent.y + (parent.h - child.h) / 2;
        }
        if (c.centerX) {
          child.x = parent.x + (parent.w - child.w) / 2;
        }
        if (c.centerY) {
          child.y = parent.y + (parent.h - child.h) / 2;
        }

        queue.push(cid);
      }
    }

    let maxX = 0;
    let maxY = 0;
    for (const n of this.graph.values()) {
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    this.viewBox = { w: maxX, h: maxY };
  }

  detectOverlaps() {
    const nodes = [...this.graph.values()].filter(
      (n) => n.type !== 'container' && n.type !== 'background' && n.type !== 'back_panel'
    );
    const collisions = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.overlapAllowed || b.overlapAllowed) continue;
        if (
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y
        ) {
          collisions.push({ a: a.id, b: b.id });
        }
      }
    }
    return collisions;
  }

  buildSVG(options = {}) {
    const activeIds = new Set(options.activeIds || []);
    const completedIds = new Set(options.completedIds || []);
    const showDimensions = options.showDimensions !== false;
    const padding = options.padding || 60;

    const nodes = [...this.graph.values()]
      .filter((n) => n.type !== 'container')
      .sort((a, b) => a.zIndex - b.zIndex);

    const byColor = new Map();
    for (const n of nodes) {
      if (!byColor.has(n.color)) byColor.set(n.color, []);
      byColor.get(n.color).push(n);
    }

    const { w, h } = this.viewBox;
    const vbW = w + padding;
    const vbH = h + padding;

    let svg = `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a;width:100%;height:auto;display:block;">
`;

    svg += `  <defs>
`;
    svg += `    <marker id="cn-dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f59e0b"/></marker>
`;
    svg += `  </defs>
`;

    for (const [color, pieces] of byColor) {
      svg += `  <g fill="${color}">
`;
      for (const p of pieces) {
        const isActive = activeIds.has(p.id);
        const isDone = completedIds.has(p.id) || isActive;
        const stroke = isActive ? '#4ECDC4' : '#1e293b';
        const opacity = isDone ? 1 : 0.25;
        const d = `M${p.x},${p.y}h${p.w}v${p.h}h-${p.w}Z`;
        svg += `    <path d="${d}" data-id="${p.id}" data-type="${p.type}" stroke="${stroke}" stroke-width="2" opacity="${opacity}"/>
`;

        if (p.w > 80 && p.h > 40) {
          const label = this._shortLabel(p.id);
          svg += `    <text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 4}" text-anchor="middle" fill="#0f172a" font-size="10" font-weight="600" font-family="system-ui,sans-serif" pointer-events="none">${label}</text>
`;
        }
      }
      svg += `  </g>
`;
    }

    if (showDimensions) {
      svg += `  <line x1="0" y1="${h + 20}" x2="${w}" y2="${h + 20}" stroke="#f59e0b" stroke-width="1.5" marker-end="url(#cn-dim-arrow)" marker-start="url(#cn-dim-arrow)"/>
`;
      svg += `  <text x="${w / 2}" y="${h + 42}" text-anchor="middle" fill="#f59e0b" font-size="13" font-weight="700" font-family="system-ui,sans-serif">${w} mm</text>
`;
      svg += `  <line x1="${w + 20}" y1="0" x2="${w + 20}" y2="${h}" stroke="#f59e0b" stroke-width="1.5" marker-end="url(#cn-dim-arrow)" marker-start="url(#cn-dim-arrow)"/>
`;
      svg += `  <text x="${w + 42}" y="${h / 2}" text-anchor="start" fill="#f59e0b" font-size="13" font-weight="700" font-family="system-ui,sans-serif" writing-mode="tb">${h} mm</text>
`;
    }

    svg += `</svg>`;
    return svg;
  }

  render(options = {}) {
    this.solveLayout();
    return this.buildSVG(options);
  }

  _shortLabel(id) {
    return String(id)
      .replace(/_/g, ' ')
      .split(' ')
      .slice(0, 2)
      .join(' ');
  }
}

// ═══════════════════════════════════════════════════════════
// FAMILY ROUTERS
// ═══════════════════════════════════════════════════════════

const FamilyRouters = {
  cabinet(pieces, meta) {
    const family = 'cabinet';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
    addCarcass(engine, roles, meta, family);

    // Repisas
    const shelves = roles.filter((p) => p.role === 'shelf');
    const shelfPositions = calculateShelfPositions(height, shelves, thickness, family);
    for (const sp of shelfPositions) {
      const dim = getPieceDims(sp.piece, 'shelf', thickness, family);
      const shelfW = Math.min(dim.w, Math.max(0, width - 2 * thickness));
      engine.addNode(sp.piece.id, {
        w: shelfW,
        h: dim.h,
        type: 'shelf',
        color: sp.piece.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: sp.y },
      });
    }

    // Cajones
    const drawers = roles.filter((p) => p.role.startsWith('drawer'));
    const drawerGroups = groupByHueco(drawers, height, thickness, shelfPositions, family);
    for (const group of drawerGroups) {
      const face = group.related.find((p) => p.role === 'drawer_face');
      if (!face) continue;
      const fDim = getPieceDims(face, 'drawer_face', thickness, family);
      const faceW = Math.min(fDim.w, Math.max(0, width - 2 * thickness));
      const faceH = group.h ?? fDim.h;
      const marginX = (width - faceW) / 2;

      engine.addNode(face.id, {
        w: faceW,
        h: faceH,
        type: 'drawer_face',
        color: face.color,
        parent: 'modulo',
        constraints: { marginX, offsetY: group.y },
      });

      const handle = group.related.find((p) => p.role === 'handle');
      if (handle) {
        const hDim = getPieceDims(handle, 'handle', thickness, family);
        engine.addNode(handle.id, {
          w: hDim.w,
          h: hDim.h,
          type: 'handle',
          color: handle.color,
          parent: 'modulo',
          constraints: { centerX: true, offsetY: group.y + faceH - 20 },
        });
      }
    }

    // Divisores anti-pandeo para carcasas con cajones
    if (drawerGroups.length > 0) {
      fillGapsWithDividers(engine, roles, meta, shelfPositions, drawerGroups, thickness, family);
    }

    // Travesaños / refuerzos
    for (const p of roles.filter((p) => p.role === 'brace')) {
      const dim = getPieceDims(p, 'brace', thickness, family);
      engine.addNode(p.id, {
        w: dim.w,
        h: dim.h,
        type: 'brace',
        color: p.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: thickness + 40 },
        overlapAllowed: true,
      });
    }

    return engine;
  },

  shelving(pieces, meta) {
    const family = 'shelving';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
    addCarcass(engine, roles, meta, family);

    // Montante central (anti-pandeo principal)
    const central = roles.find(
      (p) =>
        p.role === 'side_panel' &&
        (normalize(p.nombre).includes('central') || normalize(p.id).includes('central'))
    );
    if (central) {
      const dim = getPieceDims(central, 'side_panel', thickness, family);
      engine.addNode(central.id, {
        w: dim.w,
        h: height - 2 * thickness,
        type: 'side_panel',
        color: central.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: thickness },
        overlapAllowed: true,
      });
    }

    // Estantes
    const shelves = roles.filter((p) => p.role === 'shelf');
    const shelfPositions = calculateShelfPositions(height, shelves, thickness, family);
    for (const sp of shelfPositions) {
      const dim = getPieceDims(sp.piece, 'shelf', thickness, family);
      engine.addNode(sp.piece.id, {
        w: dim.w,
        h: dim.h,
        type: 'shelf',
        color: sp.piece.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: sp.y },
      });
    }

    // Divisores en cada hueco entre estantes
    fillGapsWithDividers(engine, roles, meta, shelfPositions, [], thickness, family);

    // Travesaño trasero
    for (const p of roles.filter((p) => p.role === 'brace')) {
      const dim = getPieceDims(p, 'brace', thickness, family);
      engine.addNode(p.id, {
        w: dim.w,
        h: dim.h,
        type: 'brace',
        color: p.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: thickness + 40 },
        overlapAllowed: true,
      });
    }

    return engine;
  },

  table(pieces, meta) {
    const family = 'table';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));

    const tops = roles.filter((p) => p.role === 'top_panel');
    const topThick = tops.length ? Number(tops[0].espesor) || thickness : thickness;
    for (const p of tops) {
      engine.addNode(p.id, {
        w: width,
        h: topThick,
        type: 'top_panel',
        color: p.color,
        parent: 'modulo',
        constraints: { offsetY: 0 },
      });
    }

    const legs = roles.filter((p) => p.role === 'leg');
    const legDim = legs.length ? getPieceDims(legs[0], 'leg', thickness, family) : { w: 80, h: height };
    const legW = legDim.w;
    const legH = height - topThick;
    const inset = 20;
    const depthOffset = 15;

    const placeLeg = (p, x, zOffset = 0, overlapAllowed = false) => {
      engine.addNode(p.id, {
        w: legW,
        h: legH,
        type: 'leg',
        color: p.color,
        parent: 'modulo',
        constraints: { marginX: x + zOffset, offsetY: topThick },
        overlapAllowed,
      });
    };

    const front = legs.filter((p) => /front|delanter/i.test(normalize(p.nombre)));
    const back = legs.filter((p) => /back|traser/i.test(normalize(p.nombre)));

    if (front.length >= 2 && back.length >= 2) {
      front.forEach((p, i) => placeLeg(p, i === 0 ? inset : width - legW - inset, 0));
      back.forEach((p, i) => placeLeg(p, i === 0 ? inset : width - legW - inset, depthOffset, true));
    } else {
      legs.forEach((p, i) => {
        const x = i % 2 === 0 ? inset : width - legW - inset;
        const isBack = i >= 2;
        placeLeg(p, x, isBack ? depthOffset : 0, isBack);
      });
    }

    const shelf = roles.find((p) => p.role === 'shelf');
    if (shelf) {
      const dim = getPieceDims(shelf, 'shelf', thickness, family);
      engine.addNode(shelf.id, {
        w: dim.w,
        h: dim.h,
        type: 'shelf',
        color: shelf.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: topThick + (height - topThick) * 0.75 },
        overlapAllowed: true,
      });
    }

    return engine;
  },

  seating(pieces, meta) {
    const family = 'seating';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));

    const back = roles.find((p) => p.role === 'back_panel');
    const seat = roles.find((p) => p.role === 'seat_panel');

    const backDim = back ? getPieceDims(back, 'back_panel', thickness, family) : { w: 0, h: 0 };
    const seatDim = seat ? getPieceDims(seat, 'seat_panel', thickness, family) : { w: 0, h: 0 };

    if (back) {
      engine.addNode(back.id, {
        w: backDim.w,
        h: backDim.h,
        type: 'back_panel',
        color: back.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: 0 },
      });
    }

    if (seat) {
      engine.addNode(seat.id, {
        w: seatDim.w,
        h: seatDim.h,
        type: 'seat_panel',
        color: seat.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: backDim.h },
      });
    }

    const legs = roles.filter((p) => p.role === 'leg');
    if (legs.length) {
      const legDim = getPieceDims(legs[0], 'leg', thickness, family);
      const legW = legDim.w;
      const legY = backDim.h + seatDim.h;
      const legH = height - legY;
      const inset = 10;
      const depthOffset = 15;

      const placeLeg = (p, x, zOffset = 0, overlapAllowed = false) => {
        engine.addNode(p.id, {
          w: legW,
          h: legH,
          type: 'leg',
          color: p.color,
          parent: 'modulo',
          constraints: { marginX: x + zOffset, offsetY: legY },
          overlapAllowed,
        });
      };

      const front = legs.filter((p) => /front|delanter/i.test(normalize(p.nombre)));
      const backLegs = legs.filter((p) => /back|traser/i.test(normalize(p.nombre)));

      if (front.length >= 2 && backLegs.length >= 2) {
        front.forEach((p, i) => placeLeg(p, i === 0 ? inset : width - legW - inset, 0));
        backLegs.forEach((p, i) => placeLeg(p, i === 0 ? inset : width - legW - inset, depthOffset, true));
      } else {
        legs.forEach((p, i) => {
          const x = i % 2 === 0 ? inset : width - legW - inset;
          const isBack = i >= 2;
          placeLeg(p, x, isBack ? depthOffset : 0, isBack);
        });
      }

      const braceInset = legW + 10;
      const braces = roles.filter((p) => p.role === 'brace');
      const frontBraces = braces.filter((p) => /front|delanter/i.test(normalize(p.nombre)));
      const backBraces = braces.filter((p) => /back|traser/i.test(normalize(p.nombre)));
      const allBraces = frontBraces.length ? frontBraces : braces;
      const otherBraces = backBraces.length ? backBraces : [];

      for (const p of allBraces) {
        const dim = getPieceDims(p, 'brace', thickness, family);
        const braceW = Math.min(dim.w, width - 2 * braceInset);
        engine.addNode(p.id, {
          w: braceW,
          h: dim.h,
          type: 'brace',
          color: p.color,
          parent: 'modulo',
          constraints: { centerX: true, offsetY: legY + legH * 0.55 },
          overlapAllowed: true,
        });
      }
      for (const p of otherBraces) {
        const dim = getPieceDims(p, 'brace', thickness, family);
        const braceW = Math.min(dim.w, width - 2 * braceInset);
        engine.addNode(p.id, {
          w: braceW,
          h: dim.h,
          type: 'brace',
          color: p.color,
          parent: 'modulo',
          constraints: { centerX: true, offsetY: legY + legH * 0.7 },
          overlapAllowed: true,
        });
      }
    }

    return engine;
  },

  wardrobe(pieces, meta) {
    const family = 'wardrobe';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
    addCarcass(engine, roles, meta, family);

    // Riel colgador
    const rail = roles.find((p) => p.role === 'hanger_rail');
    if (rail) {
      const dim = getPieceDims(rail, 'hanger_rail', thickness, family);
      engine.addNode(rail.id, {
        w: dim.w,
        h: dim.h,
        type: 'hanger_rail',
        color: rail.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: thickness + 185 },
        overlapAllowed: true,
      });
    }

    // Estante + soporte central anti-pandeo
    const shelf = roles.find((p) => p.role === 'shelf');
    if (shelf) {
      const dim = getPieceDims(shelf, 'shelf', thickness, family);
      const shelfY = thickness + (height - 2 * thickness) * 0.27;
      engine.addNode(shelf.id, {
        w: dim.w,
        h: dim.h,
        type: 'shelf',
        color: shelf.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: shelfY },
        overlapAllowed: true,
      });

      const supportW = Math.max(thickness, 20);
      engine.addNode(`${shelf.id}-soporte`, {
        w: supportW,
        h: dim.h + 10,
        type: 'divider',
        color: shelf.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: shelfY + dim.h },
        overlapAllowed: true,
      });
    }

    // Puertas abatibles
    const doors = roles.filter((p) => p.role === 'door');
    const doorCount = Math.max(doors.length, 1);
    const innerW = width - 2 * thickness;
    const doorW = innerW / doorCount - 2;
    const doorH = height - 2 * thickness;

    doors.forEach((p, i) => {
      const dim = getPieceDims(p, 'door', thickness, family);
      const actualW = Math.min(dim.w, doorW);
      const actualH = Math.min(dim.h, doorH);
      const x = thickness + i * (doorW + 2) + 1;
      engine.addNode(p.id, {
        w: actualW,
        h: actualH,
        type: 'door',
        color: p.color,
        parent: 'modulo',
        constraints: { marginX: x, offsetY: thickness },
        overlapAllowed: true,
      });

      // Tirador simple
      const handleW = 8;
      const handleH = 80;
      const hx = i === 0 ? x + actualW - 25 : x + 17;
      engine.addNode(`${p.id}-tirador`, {
        w: handleW,
        h: handleH,
        type: 'handle',
        color: '#A0A0A0',
        parent: 'modulo',
        constraints: { marginX: hx, offsetY: thickness + actualH / 2 },
        overlapAllowed: true,
      });
    });

    return engine;
  },
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function addCarcass(engine, roles, meta, family = 'cabinet') {
  const { width, height, thickness } = meta;

  const back = roles.find((p) => p.role === 'back_panel');
  if (back) {
    engine.addNode(back.id, {
      w: width,
      h: height,
      type: 'back_panel',
      color: back.color,
      parent: 'modulo',
      constraints: { offsetY: 0 },
    });
  }

  for (const p of roles.filter((p) => p.role === 'top_panel')) {
    engine.addNode(p.id, {
      w: width,
      h: thickness,
      type: 'top_panel',
      color: p.color,
      parent: 'modulo',
      constraints: { offsetY: 0 },
    });
  }

  for (const p of roles.filter((p) => p.role === 'bottom_panel')) {
    engine.addNode(p.id, {
      w: width,
      h: thickness,
      type: 'bottom_panel',
      color: p.color,
      parent: 'modulo',
      constraints: { anchor: 'bottom', offsetY: 0 },
    });
  }

  for (const p of roles.filter((p) => p.role === 'side_panel')) {
    // El montante central se renderiza aparte
    if (normalize(p.nombre).includes('central') && normalize(p.nombre).includes('montante')) {
      continue;
    }
    const dim = getPieceDims(p, 'side_panel', thickness, family);
    const isDer =
      normalize(p.nombre).includes('derecho') || normalize(p.nombre).includes('der');
    engine.addNode(p.id, {
      w: dim.w,
      h: height - 2 * thickness,
      type: 'side_panel',
      color: p.color,
      parent: 'modulo',
      constraints: { marginX: isDer ? width - dim.w : 0, offsetY: thickness },
    });
  }
}

function shelfRank(name) {
  const n = normalize(name);
  if (n.includes('superior') || n.includes('sup')) return 0;
  if (n.includes('medio')) return 1;
  if (n.includes('inferior') || n.includes('inf')) return 2;
  const m = n.match(/(\d+)/);
  if (m) return 100 + parseInt(m[1], 10);
  return 50;
}

function calculateShelfPositions(moduleH, shelves, thickness, family) {
  if (!shelves.length) return [];

  const order = [...shelves].sort((a, b) => shelfRank(a.nombre) - shelfRank(b.nombre));
  const totalShelfH = order.reduce(
    (sum, p) => sum + getPieceDims(p, 'shelf', thickness, family).h,
    0
  );
  const usableH = moduleH - 2 * thickness;
  const gap = (usableH - totalShelfH) / (order.length + 1);

  let y = thickness + gap;
  return order.map((p) => {
    const dim = getPieceDims(p, 'shelf', thickness, family);
    const pos = { piece: p, y, h: dim.h };
    y += dim.h + gap;
    return pos;
  });
}

function groupByHueco(drawers, moduleH, thickness, shelfPositions = [], family = 'cabinet') {
  const groups = [];
  const faces = drawers.filter((p) => inferRole(p) === 'drawer_face');
  if (!faces.length) return groups;

  const shelves = [...shelfPositions].sort((a, b) => a.y - b.y);
  const topY = shelves.length ? shelves[0].y + shelves[0].h : thickness;
  const bottomY = shelves.length ? shelves[shelves.length - 1].y : moduleH - thickness;
  const usableH = Math.max(0, bottomY - topY);

  // Ordenar caras: superior → medios → inferior
  const ranked = faces
    .map((face) => {
      const n = normalize(face.nombre);
      const id = normalize(face.id);
      const isSup = n.includes('superior') || n.includes('sup') || id.includes('sup');
      const isInf = n.includes('inferior') || n.includes('inf') || id.includes('inf');
      let rank = 50;
      if (isSup) rank = 0;
      else if (isInf) rank = 1000;
      else if (n.includes('medio')) rank = 100;
      const m = n.match(/(\d+)/);
      if (m) rank += parseInt(m[1], 10) * 0.1;
      return { face, rank };
    })
    .sort((a, b) => a.rank - b.rank);

  const n = ranked.length;
  const dims = ranked.map((item) => getPieceDims(item.face, 'drawer_face', thickness, family));
  const totalH = dims.reduce((s, d) => s + d.h, 0);

  // Si no caben todos los frentes reales, escalar alturas proporcionalmente
  // y apilarlos de forma contigua sin solapamientos.
  const scale = totalH > usableH ? usableH / totalH : 1;
  const scaledHeights = dims.map((d) => d.h * scale);

  let currentY = topY;
  ranked.forEach((item, i) => {
    const fh = scaledHeights[i];
    const y = currentY;
    currentY += fh;

    const prefix = item.face.id.split('-').slice(0, -1).join('-');
    const related = drawers.filter(
      (p) => p.id.startsWith(prefix) || normalize(p.nombre).includes(prefix)
    );

    groups.push({ face: item.face, related, y, h: fh });
  });

  return groups;
}

function fillGapsWithDividers(engine, roles, meta, shelfPositions, drawerGroups, thickness, family) {
  const { width, height } = meta;
  const dividers = roles.filter((p) => p.role === 'divider');
  const defaultW = Math.max(thickness, 30);
  const inset = 10;

  const separators = [
    { y: thickness, h: 0 },
    ...shelfPositions.map((sp) => ({
      y: sp.y,
      h: getPieceDims(sp.piece, 'shelf', thickness, family).h,
    })),
    ...drawerGroups.map((g) => ({
      y: g.y,
      h: getPieceDims(g.face, 'drawer_face', thickness, family).h,
    })),
    { y: height - thickness, h: 0 },
  ].sort((a, b) => a.y - b.y);

  const gaps = [];
  for (let i = 0; i < separators.length - 1; i++) {
    const topY = separators[i].y + separators[i].h;
    const bottomY = separators[i + 1].y;
    if (bottomY > topY + 1) gaps.push({ y: topY, h: bottomY - topY });
  }

  let idx = 0;
  for (const gap of gaps) {
    const remaining = dividers.length - idx;

    if (remaining >= 2) {
      // Izquierda
      let div = dividers[idx++];
      let divW = div ? getPieceDims(div, 'divider', thickness, family).w : defaultW;
      engine.addNode(div.id, {
        w: divW,
        h: gap.h,
        type: 'divider',
        color: div.color,
        parent: 'modulo',
        constraints: { marginX: thickness + inset, offsetY: gap.y },
      });

      // Derecha
      div = dividers[idx++];
      divW = div ? getPieceDims(div, 'divider', thickness, family).w : defaultW;
      engine.addNode(div.id, {
        w: divW,
        h: gap.h,
        type: 'divider',
        color: div.color,
        parent: 'modulo',
        constraints: { marginX: width - thickness - divW - inset, offsetY: gap.y },
      });
    } else if (remaining === 1) {
      // Único divisor: centrarlo en el hueco
      const div = dividers[idx++];
      const divW = getPieceDims(div, 'divider', thickness, family).w;
      engine.addNode(div.id, {
        w: divW,
        h: gap.h,
        type: 'divider',
        color: div.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: gap.y },
      });
    } else {
      // Fallback por si no hay divisores
      engine.addNode(`cn-div-izq-${gap.y.toFixed(0)}`, {
        w: defaultW,
        h: gap.h,
        type: 'divider',
        color: '#C19A6B',
        parent: 'modulo',
        constraints: { marginX: thickness + inset, offsetY: gap.y },
      });
      engine.addNode(`cn-div-der-${gap.y.toFixed(0)}`, {
        w: defaultW,
        h: gap.h,
        type: 'divider',
        color: '#C19A6B',
        parent: 'modulo',
        constraints: { marginX: width - thickness - defaultW - inset, offsetY: gap.y },
      });
    }
  }
}

function detectFamily(pieces, moduleId = null) {
  let list = pieces;
  if (moduleId !== null) {
    const modId = String(moduleId).trim();
    list = pieces.filter((p) => {
      const mod = String(p.modulo || '').trim();
      return mod === modId || mod.startsWith(modId);
    });
  }

  const roles = list.map((p) => inferRole(p));

  if (roles.some((r) => r === 'leg')) {
    if (roles.some((r) => r === 'seat_panel' || r === 'back_panel')) return 'seating';
    return 'table';
  }
  if (roles.some((r) => r === 'door')) return 'wardrobe';
  if (roles.some((r) => r.startsWith('drawer'))) return 'cabinet';

  const shelfCount = roles.filter((r) => r === 'shelf').length;
  const hasMontante = list.some((p) => {
    const n = normalize(p.nombre);
    return n.includes('montante') && n.includes('central');
  });
  const hasDividers = roles.filter((r) => r === 'divider').length >= 2;
  if (shelfCount >= 3 && (hasMontante || hasDividers)) return 'shelving';

  return 'cabinet';
}

// ═══════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════

export function buildEngineForModule(pieces, moduleId, options = {}) {
  const family = options.family || detectFamily(pieces, moduleId);
  const modId = String(moduleId).trim();
  const modulePieces = pieces.filter((p) => {
    const mod = String(p.modulo || '').trim();
    return mod === modId || mod.startsWith(modId);
  });

  if (!modulePieces.length) return null;

  const meta = getModuleDimensions(modulePieces, options.thickness || 15, family);
  const router = FamilyRouters[family] || FamilyRouters.cabinet;

  return router(modulePieces, meta);
}

export { inferRole, getPieceDims, getModuleDimensions, detectFamily, FamilyRouters, calculateShelfPositions };

```

## 5. Fórmulas clave

### 5.1 Proyección isométrica

```javascript
_isoProject(x, y, z, ox, oy) {
  return {
    x: ox + (x - y * this.isoDepth) * this.scale,
    y: oy - (z + y * this.isoDepth) * this.scale,
  };
}
```

- `x`: ancho del mueble (derecha en pantalla).
- `y`: profundidad del mueble (arriba-izquierda en pantalla, atenuada por `isoDepth = 0.5`).
- `z`: altura del mueble (arriba en pantalla).

### 5.2 Ordenamiento (painter's algorithm)

```javascript
function getDepthKey(geo) {
  return (geo.x + geo.y + geo.z) + (geo.w + geo.d + geo.h) * 0.3;
}

function sortByDepth(geometries) {
  return geometries.slice().sort((a, b) => {
    const diff = getDepthKey(a) - getDepthKey(b);
    if (Math.abs(diff) > 50) return diff;
    return getZIndex(a.role) - getZIndex(b.role);
  });
}
```

Cuanto mayor sea la clave de profundidad, más adelante/encima está la pieza y más tarde se pinta.

### 5.3 Sombreado de caras

```javascript
function getFaceColors(baseColor) {
  return {
    front: baseColor,                    // cara frontal: color original
    top: adjustColor(baseColor, 20),     // cara superior: +20% luminosidad
    right: adjustColor(baseColor, -20),  // cara lateral derecha: −20% luminosidad
  };
}
```

### 5.4 Cajón abierto

El frente del cajón se desplaza en `y` (profundidad) para simular que sobresale:

```javascript
const yFace = moduleD - thickness + this.drawerGap;
```

Los laterales/base/fondo del cajón se renderizan con `opacity < 1` para ver el interior.

### 5.5 Vista explodida

Cada pieza se aleja del centro del módulo:

```javascript
const dx = (geo.x + geo.w / 2 - cx) * this.explodeFactor;
const dy = (geo.y + geo.d / 2 - cy) * this.explodeFactor;
const dz = (geo.z + geo.h / 2 - cz) * this.explodeFactor;
geo.x += dx; geo.y += dy; geo.z += dz;
```

## 6. Integración con la aplicación

1. El usuario selecciona un módulo en el desplegable superior.
2. Hace clic en la pestaña **Isométrica**.
3. `app.js` invoca `renderIsometricView(container, state)`.
4. `isometricView.js` obtiene las piezas del módulo, crea la interfaz y llama a `IsometricRenderer.render()`.
5. `isometricRenderer.js` genera el SVG y lo inyecta en el div `#iso-canvas`.
6. Los botones de control actualizan `scale`, `explodeFactor`, `drawerGap` o `doorAngle` y vuelven a renderizar.

## 7. Criterios de aceptación cubiertos

- [x] Renderiza módulos tipo cabinet, shelving, table, seating, wardrobe.
- [x] Dibuja base, tapa, laterales, fondo, estantes, divisores, puertas y cajones.
- [x] Cajones con frente + cuerpo semi-transparente.
- [x] Puertas con apertura simulada.
- [x] Orden correcto de piezas con painter's algorithm.
- [x] Zoom, explode, abrir cajones/puertas y exportar SVG.
- [x] Leyenda de ejes 3D y dimensiones del módulo.

---

*Fin de la guía*
