# isometricRenderer.js — Renderizador SVG isométrico 3D

## Código fuente completo

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
    this.isoFlip = options.isoFlip || false;
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
    // Proyección isométrica configurable.
    // Por defecto la profundidad (y) se proyecta hacia arriba-izquierda.
    // Si isoFlip=true, se proyecta hacia arriba-derecha.
    const yFactor = this.isoFlip ? -this.isoDepth : this.isoDepth;
    return {
      x: ox + (x - y * yFactor) * this.scale,
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
