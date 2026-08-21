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
  side_panel_rear: 2,     // lateral que queda al fondo en la perspectiva actual
  divider: 4,             // divisores verticales antes que tapa/base para que estas tapen sus uniones
  bottom_panel: 5,
  top_panel: 5,
  panel: 5,
  hanger_rail: 6,
  shelf: 6,
  brace: 7,
  drawer_back: 8,
  drawer_bottom: 9,
  drawer_side: 10,
  seat_panel: 11,
  leg: 13,
  side_panel_front: 20,   // lateral que queda al frente
  front_panel: 25,        // paneles de frente
  drawer_face: 25,        // frentes de cajón al frente del marco
  door: 25,               // puertas al frente del marco
  handle: 26,             // tiradores encima de todo
};

function getZIndex(role) {
  return Z_INDEX[role] ?? 10;
}

function getDepthKey(geo) {
  // Usar el centroide de la pieza completa para el painter's algorithm.
  const cx = geo.x + geo.w / 2;
  const cy = geo.y + geo.d / 2;
  const cz = geo.z + geo.h / 2;
  return cx + cy + cz;
}

function sortByDepth(geometries) {
  return geometries.slice().sort((a, b) => {
    const za = getZIndex(a.role);
    const zb = getZIndex(b.role);

    // Capas especiales: fondo y lateral trasero primero; lateral frontal al final.
    const aSpecial = za <= 2 || za >= 20;
    const bSpecial = zb <= 2 || zb >= 20;
    if (aSpecial || bSpecial) return za - zb;

    // Orden de armado de abajo hacia arriba (por Z base).
    // Si la diferencia es significativa (> espesor típico) usamos Z base;
    // si no, desempatamos por profundidad para mantener realismo 3D.
    const zDiff = a.z - b.z;
    if (Math.abs(zDiff) > 20) return zDiff;
    return getDepthKey(a) - getDepthKey(b);
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
    const globalPieces = pieces.filter((p) => this._isGlobalPiece(p));
    const isGlobalModule = String(moduleId).toLowerCase() === 'estructura' || String(moduleId).toLowerCase() === 'global';
    const target = String(moduleId).trim();

    const exactPieces = isGlobalModule
      ? []
      : pieces.filter(
          (p) => !this._isGlobalPiece(p) && String(p.modulo || '').trim() === target
        );

    // Submódulos "insertos" (cajones, puertas interiores) que no tienen carcasa propia:
    // se renderizan junto al módulo padre. Los submódulos con carcasa propia se ignoran
    // aquí para evitar solapamientos espurios.
    const hasCarcass = (pts) =>
      pts.some((p) => ['bottom_panel', 'top_panel', 'side_panel', 'back_panel'].includes(inferRole(p)));
    const allModuleIds = new Set(
      pieces.filter((p) => !this._isGlobalPiece(p)).map((p) => String(p.modulo || '').trim())
    );
    const subInsertPieces = [];
    for (const m of allModuleIds) {
      if (m === target || !m.startsWith(target)) continue;
      const sub = pieces.filter((p) => !this._isGlobalPiece(p) && String(p.modulo || '').trim() === m);
      if (sub.length && !hasCarcass(sub)) {
        subInsertPieces.push(...sub);
      }
    }

    const allPieces = isGlobalModule ? globalPieces : [...exactPieces, ...subInsertPieces];

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

    // Piezas de estructura global (zócalo, tapa corrida, panel trasero) solo si no es el propio módulo global
    if (!isGlobalModule && globalPieces.length) {
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

    // Sillas / asientos tienen geometría propia
    if (family === 'seating') {
      return this._buildSeatingGeometries(roles, moduleW, moduleD, moduleH, thickness);
    }

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
      // En perspectiva normal (isoFlip=false) el lateral derecho queda al fondo
      // y el izquierdo al frente. Con isoFlip=true es al revés.
      const isFront = this.isoFlip ? !isLeft : isLeft;
      geometries.push({
        x, y: 0, z: thickness, w: thickness, d: moduleD, h: moduleH - 2 * thickness,
        color: side.color, role: isFront ? 'side_panel_front' : 'side_panel_rear', name: side.nombre, id: side.id,
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
      const y = this._inferLegY(leg, moduleD, w);
      geometries.push({
        x, y, z: -h, w, d: w, h,
        color: leg.color || '#1e293b', role: 'leg', name: leg.nombre, id: leg.id,
      });
    });

    // Estantes / repisas
    const shelves = roles.filter((p) => p.role === 'shelf');
    const shelfPositions = shelves.length
      ? calculateShelfPositions(moduleH, shelves, thickness, family)
      : [];
    shelfPositions.forEach((sp) => {
      const dims = getPieceDims(sp.piece, 'shelf', thickness, family);
      const w = dims.w || Math.max(0, moduleW - 2 * thickness);
      const x = Math.max(thickness, (moduleW - w) / 2);
      geometries.push({
        x, y: 0, z: sp.y, w, d: moduleD, h: sp.h,
        color: sp.piece.color, role: 'shelf', name: sp.piece.nombre, id: sp.piece.id,
      });
    });

    // Divisores verticales
    const dividers = roles.filter((p) => p.role === 'divider');
    if (dividers.length) {
      geometries.push(
        ...this._buildDividerGeometries(dividers, moduleW, moduleD, moduleH, thickness, shelfPositions, top, bottom)
      );
    }

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

    // Ubicar cada cajón dentro del hueco (zona) que le corresponde.
    // Las zonas están definidas por base/tapa/repisas.
    const shelves = roles.filter((p) => inferRole(p) === 'shelf');
    const hasBottom = roles.some((p) => inferRole(p) === 'bottom_panel');
    const hasTop = roles.some((p) => inferRole(p) === 'top_panel');
    const shelfPositions = shelves.length
      ? calculateShelfPositions(moduleH, shelves, thickness, family)
      : [];
    const zones = this._calculateVerticalZones(moduleH, thickness, shelfPositions, hasBottom, hasTop);

    const dims = faces.map((f) => ({ face: f, ...getPieceDims(f, 'drawer_face', thickness, family) }));
    // Ordenar: superior → medio → inferior
    dims.sort((a, b) => this._drawerRank(a.face) - this._drawerRank(b.face));

    const zoneGroups = zones.map(() => []);
    dims.forEach((d) => {
      const rank = this._drawerRank(d.face);
      let idx;
      if (rank <= 10) idx = zones.length - 1;          // superior → última zona (más alta)
      else if (rank >= 90) idx = 0;                      // inferior → primera zona (más baja)
      else idx = Math.max(0, Math.min(zones.length - 1, Math.floor(zones.length / 2)));
      zoneGroups[idx].push(d);
    });

    zoneGroups.forEach((group, zi) => {
      if (!group.length) return;
      const zone = zones[zi];
      const zoneH = Math.max(0, zone.yEnd - zone.yStart);
      const totalH = group.reduce((s, d) => s + d.h, 0);
      const gap = totalH < zoneH ? (zoneH - totalH) / (group.length + 1) : 0;
      const scale = totalH > zoneH ? zoneH / totalH : 1;
      let currentZ = zone.yStart + gap;

      group.forEach((d) => {
        const h = d.h * scale;
        const w = d.w;
        const x = (moduleW - w) / 2;
        const drawerDepth = Math.max(0, moduleD - 2 * thickness - 10);
        const yFace = moduleD - thickness + this.drawerGap;

        // Frente del cajón
        geometries.push({
          x, y: yFace, z: currentZ, w, d: thickness, h,
          color: d.face.color, role: 'drawer_face', name: d.face.nombre, id: d.face.id,
        });

        // Laterales del cajón
        const sideH = Math.max(0, h - 2 * thickness);
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
        const faceIdPrefix = d.face.id.split('-').slice(0, -1).join('-');
        const handle = roles.find((p) =>
          inferRole(p) === 'handle' &&
          (p.id.startsWith(faceIdPrefix) || normalizeName(p.nombre).includes(normalizeName(d.face.nombre)))
        );
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
    });

    return geometries;
  }

  _buildDividerGeometries(dividers, moduleW, moduleD, moduleH, thickness, shelfPositions, top, bottom) {
    const geometries = [];
    if (!dividers.length) return geometries;

    const zones = this._calculateVerticalZones(moduleH, thickness, shelfPositions, !!bottom, !!top);
    const groups = this._groupDividersIntoZones(dividers, zones);

    groups.forEach(({ dividers: group, zone }) => {
      const zoneHeight = Math.max(0, zone.yEnd - zone.yStart);
      const positions = this._distributeHorizontally(group.length, moduleW, thickness);
      group.forEach((div, i) => {
        const dims = getPieceDims(div, 'divider', thickness, 'cabinet');
        const divW = dims.w || thickness;
        const divH = Math.min(dims.h || zoneHeight, zoneHeight);
        const x = Math.max(thickness, Math.min(positions[i] - divW / 2, moduleW - thickness - divW));
        const z = zone.yStart + Math.max(0, zoneHeight - divH) / 2;
        geometries.push({
          x, y: 0, z, w: divW, d: moduleD, h: divH,
          color: div.color, role: 'divider', name: div.nombre, id: div.id,
        });
      });
    });

    return geometries;
  }

  _buildSeatingGeometries(roles, moduleW, moduleD, moduleH, thickness) {
    const geometries = [];
    const seat = roles.find((p) => p.role === 'seat_panel');
    const back = roles.find((p) => p.role === 'back_panel');
    const legs = roles.filter((p) => p.role === 'leg');
    const braces = roles.filter((p) => p.role === 'brace');

    const seatDims = seat ? getPieceDims(seat, 'seat_panel', thickness, 'seating') : { w: moduleW, h: thickness };
    const seatW = seatDims.w || moduleW;
    const seatH = seatDims.h || thickness;
    const seatX = Math.max(0, (moduleW - seatW) / 2);

    const legDim = legs.length ? getPieceDims(legs[0], 'leg', thickness, 'seating') : { w: 40, h: 450 };
    const legW = legDim.w || 40;
    const legH = legDim.h || 450;

    const backH = back ? Number(back.alto) || moduleH - legH - seatH : 0;

    // Asiento horizontal
    if (seat) {
      geometries.push({
        x: seatX, y: 0, z: legH, w: seatW, d: moduleD, h: seatH,
        color: seat.color, role: 'seat_panel', name: seat.nombre, id: seat.id,
      });
    }

    // Respaldo vertical en borde trasero
    if (back) {
      geometries.push({
        x: seatX, y: 0, z: legH + seatH, w: seatW, d: thickness, h: backH,
        color: back.color, role: 'back_panel', name: back.nombre, id: back.id,
      });
    }

    // Patas en las 4 esquinas del asiento (desde el suelo z=0 hacia arriba)
    const inset = 20;
    const legPositions = [
      { x: seatX + inset, y: inset },
      { x: seatX + seatW - legW - inset, y: inset },
      { x: seatX + inset, y: moduleD - legW - inset },
      { x: seatX + seatW - legW - inset, y: moduleD - legW - inset },
    ];
    legs.forEach((leg, i) => {
      const pos = legPositions[i] || legPositions[0];
      geometries.push({
        x: pos.x, y: pos.y, z: 0, w: legW, d: legW, h: legH,
        color: leg.color || '#1e293b', role: 'leg', name: leg.nombre, id: leg.id,
      });
    });

    // Travesaños de refuerzo entre patas
    braces.forEach((brace) => {
      const dims = getPieceDims(brace, 'brace', thickness, 'seating');
      const isFront = normalizeName(brace.nombre).includes('front');
      const y = isFront ? moduleD - thickness : 0;
      geometries.push({
        x: seatX + inset, y, z: legH / 2, w: seatW - 2 * inset, d: thickness, h: dims.h,
        color: brace.color, role: 'brace', name: brace.nombre, id: brace.id,
      });
    });

    return geometries;
  }

  _calculateVerticalZones(moduleH, thickness, shelfPositions, hasBottom, hasTop) {
    const zones = [];
    const sorted = [...shelfPositions].sort((a, b) => a.y - b.y);
    let yStart = hasBottom ? thickness : 0;
    sorted.forEach((sp) => {
      zones.push({ yStart, yEnd: sp.y });
      yStart = sp.y + sp.h;
    });
    const yEnd = hasTop ? moduleH - thickness : moduleH;
    zones.push({ yStart, yEnd });
    return zones;
  }

  _groupDividersIntoZones(dividers, zones) {
    if (!zones.length) return [];
    const groups = zones.map((zone) => ({ zone, dividers: [] }));
    const unassigned = [];

    dividers.forEach((div) => {
      const text = `${normalizeName(div.nombre)} ${normalizeName(div.id)}`;
      let idx = -1;
      // zones[0] es el hueco inferior (base -> primera repisa),
      // zones[zones.length - 1] es el hueco superior (última repisa -> tapa).
      if (text.includes('inf') || text.includes('inferior')) idx = 0;
      else if (text.includes('med') || text.includes('medio')) idx = 1;
      else if (text.includes('sup') || text.includes('superior')) idx = zones.length - 1;

      if (idx >= 0 && idx < zones.length) {
        groups[idx].dividers.push(div);
      } else {
        unassigned.push(div);
      }
    });

    // Distribuir los no asignados en las zonas con menos divisores
    while (unassigned.length) {
      groups.sort((a, b) => a.dividers.length - b.dividers.length);
      groups[0].dividers.push(unassigned.shift());
    }

    return groups.filter((g) => g.dividers.length);
  }

  _distributeHorizontally(count, moduleW, sideWidth) {
    const positions = [];
    if (count <= 0) return positions;
    if (count === 1) {
      positions.push(moduleW / 2);
    } else {
      const interiorW = Math.max(0, moduleW - 2 * sideWidth);
      const step = interiorW / (count + 1);
      for (let i = 1; i <= count; i++) {
        positions.push(sideWidth + i * step);
      }
    }
    return positions;
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
    // Proyección isométrica corregida.
    // X (ancho) -> derecha.
    // Y (profundidad) positiva (frente) -> derecha y abajo.
    // Z (altura) -> arriba.
    // isoFlip invierte la dirección lateral (signo de Y en X).
    const xFactor = this.isoFlip ? -this.isoDepth : this.isoDepth;
    return {
      x: ox + (x + y * xFactor) * this.scale,
      y: oy - (z - y * this.isoDepth) * this.scale,
    };
  }

  _buildSVG(geometries, viewBox, ox, oy, moduleLabel, moduleW, moduleD, moduleH) {
    const polygons = [];
    const labels = [];

    // viewBox es string "0 0 W H"; extraemos W/H para centrar título/dimensiones
    const vbParts = viewBox.split(' ').map(Number);
    const vbW = vbParts[2] || 800;
    const vbH = vbParts[3] || 600;

    const title = moduleLabel ? ` — ${escapeHtml(moduleLabel)}` : '';
    const dimsText = `${moduleW} × ${moduleD} × ${moduleH} mm`;
    let axesInserted = false;

    geometries.forEach((geo) => {
      // Insertar ejes justo después de las piezas de fondo (back_panel y lateral trasero),
      // para que queden sobre la estructura base pero debajo de repisas y frentes.
      if (!axesInserted && this.showAxes && getZIndex(geo.role) > 2) {
        polygons.push(this._drawAxes(ox, oy, moduleW, moduleD, moduleH));
        axesInserted = true;
      }

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

    if (this.showAxes && !axesInserted) {
      polygons.push(this._drawAxes(ox, oy, moduleW, moduleD, moduleH));
    }

    let extra = '';
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
      side_panel_rear: { color: '#334155', width: 1.5 },
      side_panel_front: { color: '#334155', width: 1.5 },
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
    const hasFront = n.includes('front') || n.includes('delanter') || id.includes('front');
    const hasBack = n.includes('back') || n.includes('tras') || n.includes('posterior') || id.includes('back');
    const hasLeft = n.includes('izquierdo') || n.includes('izq') || id.includes('izq');
    const hasRight = n.includes('derecho') || n.includes('der') || id.includes('der');

    if (hasLeft) return 20;
    if (hasRight) return moduleW - legW - 20;
    if (hasFront || hasBack) return moduleW / 2 - legW / 2;
    return moduleW / 2 - legW / 2;
  }

  _inferLegY(leg, moduleD, legW) {
    const n = normalizeName(leg.nombre);
    const id = normalizeName(leg.id);
    const hasFront = n.includes('front') || n.includes('delanter') || id.includes('front');
    const hasBack = n.includes('back') || n.includes('tras') || n.includes('posterior') || id.includes('back');

    if (hasBack) return 20;
    if (hasFront) return moduleD - legW - 20;
    return moduleD - legW - 20;
  }

  // ═══════════════════════════════════════════════════════════
  // EJES Y DIMENSIONES
  // ═══════════════════════════════════════════════════════════

  _drawAxes(ox, oy, moduleW, moduleD, moduleH) {
    // Dibujar ejes desde el origen (0,0,0).
    // X -> derecha, Y+ (frente) -> abajo-derecha, Z -> arriba.
    const origin = this._isoProject(0, 0, 0, ox, oy);
    const xTip = this._isoProject(moduleW * 0.25, 0, 0, ox, oy);
    const yTip = this._isoProject(0, moduleD * 0.25, 0, ox, oy);
    const zTip = this._isoProject(0, 0, moduleH * 0.25, ox, oy);

    return `
    <g opacity="0.9">
      <line x1="${origin.x}" y1="${origin.y}" x2="${xTip.x}" y2="${xTip.y}" stroke="#ef4444" stroke-width="2" />
      <text x="${xTip.x}" y="${xTip.y}" fill="#ef4444" font-size="11" font-weight="bold" text-anchor="start">X (ancho)</text>
      <line x1="${origin.x}" y1="${origin.y}" x2="${yTip.x}" y2="${yTip.y}" stroke="#22c55e" stroke-width="2" />
      <text x="${yTip.x}" y="${yTip.y}" fill="#22c55e" font-size="11" font-weight="bold" text-anchor="start">Y (prof.)</text>
      <line x1="${origin.x}" y1="${origin.y}" x2="${zTip.x}" y2="${zTip.y}" stroke="#3b82f6" stroke-width="2" />
      <text x="${zTip.x}" y="${zTip.y}" fill="#3b82f6" font-size="11" font-weight="bold" text-anchor="start">Z (alto)</text>
    </g>`;
  }

  _drawDimensions(ox, oy, moduleW, moduleD, moduleH) {
    // Dimensiones en esquina superior derecha (proyección corregida).
    const tx = ox + (moduleW + moduleD * this.isoDepth) * this.scale + 10;
    const ty = oy - moduleH * this.scale - 10;
    return `<text x="${tx}" y="${ty}" fill="#94a3b8" font-size="10" font-family="monospace">W=${moduleW} D=${moduleD} H=${moduleH}</text>`;
  }
}
