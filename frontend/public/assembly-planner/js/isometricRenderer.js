/**
 * IsometricRenderer — Renderizador SVG isométrico 3D para CutterNest Assembly Planner
 * Tecnología: SVG puro, sin librerías externas.
 */

import {
  getPieceDims,
  getModuleDimensions,
} from './services/geometryService.js';
import { calculateVerticalPositions, getDefaultVerticalPosition } from './services/verticalPositionService.js';
import {
  applyDoorRotation,
  applyExplode,
  calculateVerticalZones,
  distributeHorizontally,
  drawerRank,
  getModuleDepth,
  groupDividersIntoZones,
  inferBraceX,
  inferBraceZ,
  inferDividerX,
  inferDoorX,
  inferDoorZ,
  inferLegX,
  inferLegY,
  inferRailZ,
  inferThickness,
  shouldShowLabel,
} from './services/isoGeometryService.js';
import { inferRole, detectFamily } from './services/classifierService.js';
import { escapeHtml } from './utils.js';
import { normalizeName as _normalizeName } from './utils/normalize.js';
import { isGlobalPiece, getModuleLabel, ALL_MODULE_ID } from './services/moduleService.js';
import { Z_INDEX as Z_INDEX_CONFIG, ROLE_COLORS, AXES_COLORS, COLORS, VERTICAL_POSITIONS } from './core/config.js';

function normalizeNameLocal(s) {
  return _normalizeName(s);
}

function adjustColor(hex, percent) {
  const clean = String(hex || ROLE_COLORS.wood).replace('#', '');
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

function getZIndex(role) {
  return Z_INDEX_CONFIG[role] ?? 10;
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
    this.baseScale = options.baseScale || 0.12;
    this.textScale = Math.max(0.6, Math.min(2.5, this.scale / this.baseScale));
    this.isoDepth = options.isoDepth || 0.5;
    this.padding = options.padding || 100;
    this.showDimensions = options.showDimensions !== false;
    this.showAxes = options.showAxes === true;
    this.drawerGap = options.drawerGap || 15;
    this.doorAngle = options.doorAngle || 0;
    this.explodeFactor = options.explodeFactor || 0;
    this.moduleGapMode = options.moduleGapMode || 'projected';
    this.labelMode = options.labelMode || 'auto';
    this.isoFlip = options.isoFlip || false;
    this.verticalPositionOverrides = options.verticalPositionOverrides || null;
  }

  render(moduleId, pieces, _dependencies) {
    const family = detectFamily(pieces, moduleId);
    const globalPieces = pieces.filter((p) => isGlobalPiece(p));
    const isGlobalModule = String(moduleId).toLowerCase() === 'estructura' || String(moduleId).toLowerCase() === 'global';
    const target = String(moduleId).trim();

    const exactPieces = isGlobalModule
      ? []
      : pieces.filter(
          (p) => !isGlobalPiece(p) && String(p.modulo || '').trim() === target
        );

    // Submódulos "insertos" (cajones, puertas interiores) que no tienen carcasa propia:
    // se renderizan junto al módulo padre. Los submódulos de cajón SIEMPRE se
    // renderizan como insertos, aunque tengan base/laterales/fondo propios.
    const hasCarcass = (pts) =>
      pts.some((p) => ['bottom_panel', 'top_panel', 'side_panel', 'back_panel'].includes(inferRole(p)));
    const isDrawerSubModule = (pts) =>
      pts.some((p) => {
        const r = inferRole(p);
        return r.startsWith('drawer_') || r === 'handle';
      });
    const allModuleIds = new Set(
      pieces.filter((p) => !isGlobalPiece(p)).map((p) => String(p.modulo || '').trim())
    );
    const subInsertPieces = [];
    for (const m of allModuleIds) {
      if (m === target || !m.startsWith(target)) continue;
      const sub = pieces.filter((p) => !isGlobalPiece(p) && String(p.modulo || '').trim() === m);
      if (sub.length && (!hasCarcass(sub) || isDrawerSubModule(sub))) {
        subInsertPieces.push(...sub);
      }
    }

    const allPieces = isGlobalModule
      ? globalPieces
      : target === ALL_MODULE_ID
        ? pieces
        : [...exactPieces, ...subInsertPieces];

    if (!allPieces.length) {
      this.container.innerHTML =
        '<p class="empty-state">No hay piezas para renderizar en vista isométrica.</p>';
      return;
    }

    const dims = getModuleDimensions(allPieces, inferThickness(allPieces), family);
    const moduleW = dims.width;
    const moduleH = dims.height;
    // La profundidad debe reflejar la del mueble completo, no solo la pieza global
    // (por ejemplo un zócalo/corona de 100 mm no debe achatar la vista global).
    const moduleD = getModuleDepth(pieces);
    const thickness = dims.thickness;

    const moduleLabel = getModuleLabel(moduleId, pieces);

    let geometries = [];

    if (isGlobalModule) {
      // Vista global: renderizar todas las piezas globales con su geometría propia
      // (zócalo, tapa corrida, panel trasero, espejo, puertas, etc.)
      geometries.push(...this._buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness, true));
    } else if (target === ALL_MODULE_ID) {
      // Vista de todos los módulos: alinearlos horizontalmente de M1 a Mn.
      const nonGlobalPieces = allPieces.filter((p) => !isGlobalPiece(p));
      const moduleGroups = this._groupByModule(nonGlobalPieces);
      const sortedIds = this._sortModuleIds(Object.keys(moduleGroups));
      let offsetX = 0;
      sortedIds.forEach((mid, idx) => {
        const group = moduleGroups[mid];
        const dims = getModuleDimensions(group, inferThickness(group), family);
        const subGeometries = this._buildModuleGeometries(
          group, dims.width, moduleD, dims.height, dims.thickness, family
        );
        // Calcular ancho visual real del módulo (según el modo de gap) para
        // espaciar los módulos de forma precisa y evitar superposiciones.
        const useProjection = this.moduleGapMode === 'projected';
        const bounds = this._computeModuleBounds(subGeometries, useProjection);
        const moduleVisualWidth = bounds.max - bounds.min;
        subGeometries.forEach((g) => { g.x += offsetX; });
        geometries.push(...subGeometries);
        // Dejar un pequeño espacio igual al espesor entre módulos.
        offsetX += moduleVisualWidth + dims.thickness;
      });
      // Superponer piezas globales (zócalo/tapa corrida) sobre el ancho total.
      if (globalPieces.length) {
        geometries.push(...this._buildGlobalGeometries(globalPieces, offsetX, moduleD, moduleH, thickness, true));
      }
    } else {
      // Piezas del módulo principal + submódulos insertos
      geometries.push(...this._buildModuleGeometries(allPieces, moduleW, moduleD, moduleH, thickness, family));
      // Superponer piezas de estructura global (zócalo, tapa corrida, espejo...)
      // Las puertas globales solo se dibujan en vista completa o estructura global.
      if (globalPieces.length) {
        geometries.push(...this._buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness, false));
      }
    }

    if (this.explodeFactor > 0) {
      geometries = applyExplode(geometries, moduleW, moduleD, moduleH, this.explodeFactor);
    }

    const sorted = sortByDepth(geometries);
    const { viewBox, originX, originY, axesSpace } = this._calculateViewport(geometries);

    const svg = this._buildSVG(sorted, viewBox, originX, originY, axesSpace, moduleLabel, moduleW, moduleD, moduleH);
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
      const isLeft = normalizeNameLocal(side.nombre).includes('izquierdo') || normalizeNameLocal(side.id).includes('izq');
      const x = isLeft ? 0 : moduleW - thickness;
      // En perspectiva normal (isoFlip=false) el lateral derecho queda al fondo
      // y el izquierdo al frente. Con isoFlip=true es al revés.
      const isFront = this.isoFlip ? !isLeft : isLeft;
      geometries.push({
        x, y: 0, z: thickness, w: thickness, d: moduleD, h: moduleH - 2 * thickness,
        color: side.color, role: isFront ? 'side_panel_front' : 'side_panel_rear', name: side.nombre, id: side.id,
        opacity: 0.8,
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
      const x = inferLegX(leg, moduleW, w, this.verticalPositionOverrides);
      const y = inferLegY(leg, moduleD, w, this.verticalPositionOverrides);
      geometries.push({
        x, y, z: -h, w, d: w, h,
        color: leg.color || ROLE_COLORS.leg, role: 'leg', name: leg.nombre, id: leg.id,
      });
    });

    // Estantes / repisas
    const shelves = roles.filter((p) => p.role === 'shelf');
    const shelfPositions = shelves.length
      ? calculateVerticalPositions(moduleH, thickness, shelves, { overrides: this.verticalPositionOverrides })
      : [];
    shelfPositions.forEach((sp) => {
      const dims = getPieceDims(sp.piece, 'shelf', thickness, family);
      const w = dims.w || Math.max(0, moduleW - 2 * thickness);
      const x = Math.max(thickness, (moduleW - w) / 2);
      geometries.push({
        x, y: 0, z: sp.y, w, d: moduleD, h: dims.h,
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
      const x = inferDoorX(door, moduleW, dims.w, thickness);
      const z = inferDoorZ(door, moduleH, dims.h, thickness, this.verticalPositionOverrides);
      const baseGeo = {
        x, y: moduleD, z, w: dims.w, d: thickness, h: dims.h,
        color: door.color, role: 'door', name: door.nombre, id: door.id,
      };
      geometries.push(applyDoorRotation(baseGeo, this.doorAngle));
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
      const z = Number.isFinite(rail.pos_z)
        ? Number(rail.pos_z)
        : getDefaultVerticalPosition(rail, moduleH, thickness, this.verticalPositionOverrides);
      geometries.push({
        x: thickness,
        y: moduleD / 2 - 12.5,
        z,
        w: moduleW - 2 * thickness,
        d: 25,
        h: dims.h,
        color: rail.color || ROLE_COLORS.hanger_rail, role: 'hanger_rail', name: rail.nombre, id: rail.id,
      });
    });

    // Travesaños / refuerzos
    const braces = roles.filter((p) => p.role === 'brace');
    braces.forEach((brace) => {
      const dims = getPieceDims(brace, 'brace', thickness, family);
      const x = inferBraceX(brace, moduleW, dims.w, thickness);
      const z = inferBraceZ(brace, moduleH, dims.h, thickness, this.verticalPositionOverrides);
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
      ? calculateVerticalPositions(moduleH, thickness, shelves, { overrides: this.verticalPositionOverrides })
      : [];
    const zones = calculateVerticalZones(moduleH, thickness, shelfPositions, hasBottom, hasTop);

    const dims = faces.map((f) => ({ face: f, ...getPieceDims(f, 'drawer_face', thickness, family) }));
    // Ordenar: superior → medio → inferior
    dims.sort((a, b) => drawerRank(a.face) - drawerRank(b.face));

    const zoneGroups = zones.map(() => []);
    dims.forEach((d) => {
      const rank = drawerRank(d.face);
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
      const drawerFaceGap = this.verticalPositionOverrides?.drawerFaceGap ?? VERTICAL_POSITIONS.drawerFaceGap;
      const distributedGap = group.length > 0 ? (zoneH - totalH) / (group.length + 1) : 0;
      const gap = totalH < zoneH ? Math.min(drawerFaceGap, distributedGap) : 0;
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
          (p.id.startsWith(faceIdPrefix) || normalizeNameLocal(p.nombre).includes(normalizeNameLocal(d.face.nombre)))
        );
        if (handle) {
          const hx = x + w / 2 - 15;
          const hz = currentZ + h / 2 - 10;
          geometries.push({
            x: hx, y: moduleD + this.drawerGap, z: hz, w: 30, d: 10, h: 20,
            color: handle.color || ROLE_COLORS.handle, role: 'handle', name: handle.nombre, id: handle.id,
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

    // Divisores verticales (montantes) se dibujan de base a tapa en una sola pieza,
    // sin recortar por zonas de estantes. Divisores horizontales se tratan como
    // paneles intermedios y se colocan en la zona correspondiente.
    const vertical = [];
    const horizontal = [];
    dividers.forEach((div) => {
      const dims = getPieceDims(div, 'divider', thickness, 'cabinet');
      const isVertical = Number(div.alto) > Number(div.ancho) * 1.5;
      if (isVertical) vertical.push({ div, dims });
      else horizontal.push({ div, dims });
    });

    vertical.forEach(({ div, dims }) => {
      const divW = dims.w || thickness;
      const x = Math.max(thickness, Math.min(inferDividerX(div, moduleW, thickness), moduleW - thickness - divW));
      const z = thickness;
      const h = Math.min(dims.h || moduleH - 2 * thickness, moduleH - 2 * thickness);
      geometries.push({
        x, y: 0, z, w: divW, d: moduleD, h,
        color: div.color, role: 'divider', name: div.nombre, id: div.id,
      });
    });

    if (horizontal.length) {
      const zones = this._calculateVerticalZones(moduleH, thickness, shelfPositions, !!bottom, !!top);
      const groups = groupDividersIntoZones(horizontal.map((h) => h.div), zones);
      groups.forEach(({ dividers: group, zone }) => {
        const zoneHeight = Math.max(0, zone.yEnd - zone.yStart);
        group.forEach((div) => {
          const dims = getPieceDims(div, 'divider', thickness, 'cabinet');
          const divW = dims.w || thickness;
          const divH = Math.min(dims.h || zoneHeight, zoneHeight);
          const x = Math.max(thickness, Math.min(inferDividerX(div, moduleW, thickness), moduleW - thickness - divW));
          const z = zone.yStart + Math.max(0, zoneHeight - divH) / 2;
          geometries.push({
            x, y: 0, z, w: divW, d: moduleD, h: divH,
            color: div.color, role: 'divider', name: div.nombre, id: div.id,
          });
        });
      });
    }

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
        color: leg.color || ROLE_COLORS.leg, role: 'leg', name: leg.nombre, id: leg.id,
      });
    });

    // Travesaños de refuerzo entre patas
    braces.forEach((brace) => {
      const dims = getPieceDims(brace, 'brace', thickness, 'seating');
      const isFront = normalizeNameLocal(brace.nombre).includes('front');
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
      const text = `${normalizeNameLocal(div.nombre)} ${normalizeNameLocal(div.id)}`;
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

  _groupByModule(pieces) {
    const moduleIds = [...new Set(
      pieces.map((p) => String(p.modulo || '').trim()).filter(Boolean)
    )].sort((a, b) => b.length - a.length); // prefijos más largos primero
    const parentMap = new Map();
    moduleIds.forEach((mid) => {
      const parent = moduleIds.find((pid) => pid !== mid && mid.startsWith(pid)) || mid;
      parentMap.set(mid, parent);
    });
    const groups = {};
    pieces.forEach((p) => {
      const mid = String(p.modulo || '').trim();
      const parent = parentMap.get(mid) || mid;
      if (!groups[parent]) groups[parent] = [];
      groups[parent].push(p);
    });
    return groups;
  }

  _sortModuleIds(ids) {
    return [...ids].sort((a, b) => {
      const ma = a.match(/^(M?)(\d+)(.*)$/i);
      const mb = b.match(/^(M?)(\d+)(.*)$/i);
      if (ma && mb) {
        const prefixA = ma[1].toLowerCase();
        const prefixB = mb[1].toLowerCase();
        if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
        const numA = parseInt(ma[2], 10);
        const numB = parseInt(mb[2], 10);
        if (numA !== numB) return numA - numB;
        return (ma[3] || '').localeCompare(mb[3] || '');
      }
      return a.localeCompare(b);
    });
  }

  _computeModuleBounds(geometries, includeDepth = true) {
    // Calcula el rango horizontal (en unidades reales) que ocupa un módulo.
    // includeDepth añade la proyección de la profundidad (isoDepth) para
    // evitar superposición isométrica; con false usa solo la proyección X.
    let minX = Infinity;
    let maxX = -Infinity;
    const xFactor = this.isoFlip ? -this.isoDepth : this.isoDepth;
    geometries.forEach((g) => {
      const corners = [
        [g.x, g.y],
        [g.x + g.w, g.y],
        [g.x + g.w, g.y + g.d],
        [g.x, g.y + g.d],
      ];
      corners.forEach(([x, y]) => {
        const px = includeDepth ? x + y * xFactor : x;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
      });
    });
    return {
      min: isFinite(minX) ? minX : 0,
      max: isFinite(maxX) ? maxX : 0,
    };
  }

  _buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness, includeDoors = true) {
    const geometries = [];
    const globalDoors = [];
    globalPieces.forEach((p) => {
      const role = inferRole(p);
      const n = normalizeNameLocal(p.nombre);
      const color = p.color || ROLE_COLORS.wood;

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
      } else if (role === 'mirror') {
        // Espejo montado en la pared trasera, centrado en X y con offset desde tapa.
        const w = Number(p.ancho) || moduleW;
        const h = Number(p.alto) || 600;
        const zPos = Number.isFinite(p.pos_z)
          ? Number(p.pos_z)
          : Math.max(thickness, moduleH - thickness - h - (this.verticalPositionOverrides?.mirrorOffset ?? VERTICAL_POSITIONS.mirrorOffset));
        geometries.push({
          x: Math.max(0, (moduleW - w) / 2),
          y: -thickness,
          z: zPos,
          w, d: thickness, h,
          color, role: 'mirror', name: p.nombre, id: p.id, opacity: 0.9,
        });
      } else if (role === 'door') {
        // Puertas globales: solo se renderizan en vista completa o estructura global.
        if (includeDoors) {
          globalDoors.push(p);
        }
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

    // Puertas globales: reparten el ancho total del módulo/mueble.
    // Si hay izquierda + derecha, cada una ocupa la mitad; si es una sola, todo.
    const doorCount = globalDoors.length;
    if (doorCount) {
      const doorGap = this.verticalPositionOverrides?.doorGap ?? VERTICAL_POSITIONS.doorGap;
      const availableW = Math.max(0, moduleW - (doorCount - 1) * doorGap);
      const doorW = doorCount >= 2 ? availableW / doorCount : moduleW;
      globalDoors.forEach((door, idx) => {
        const dn = normalizeNameLocal(door.nombre);
        const did = normalizeNameLocal(door.id);
        const isLeft = dn.includes('izquierdo') || dn.includes('izq') || did.includes('izquierdo') || did.includes('izq');
        const isRight = dn.includes('derecho') || dn.includes('der') || did.includes('derecho') || did.includes('der');
        let x = 0;
        if (doorCount >= 2) {
          if (isLeft) x = 0;
          else if (isRight) x = moduleW - doorW;
          else x = idx * (doorW + doorGap);
        }
        const h = Number(door.alto) || moduleH - 2 * thickness;
        const z = Number.isFinite(door.pos_z)
          ? Number(door.pos_z)
          : Math.max(thickness, moduleH - h - thickness - (this.verticalPositionOverrides?.doorTopOffset ?? VERTICAL_POSITIONS.doorTopOffset));
        const baseGeo = {
          x, y: moduleD, z, w: doorW, d: thickness, h,
          color: door.color || ROLE_COLORS.door, role: 'door', name: door.nombre, id: door.id,
        };
        geometries.push(applyDoorRotation(baseGeo, this.doorAngle));
      });
    }

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

  _buildSVG(geometries, viewBox, ox, oy, axesSpace, moduleLabel, moduleW, moduleD, moduleH) {
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
        polygons.push(this._drawAxes(vbW, vbH, axesSpace));
        axesInserted = true;
      }

      const { projected, faces } = this._projectCuboid(geo, ox, oy);
      const colors = getFaceColors(geo.color || ROLE_COLORS.wood);
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
        if (label && frontPts && shouldShowLabel(geo, frontPts)) {
          const cx = frontPts.reduce((s, p) => s + p.x, 0) / frontPts.length;
          const cy = frontPts.reduce((s, p) => s + p.y, 0) / frontPts.length;
          labels.push(
            `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${COLORS.textDark}" font-size="${(9 * this.textScale).toFixed(1)}" font-weight="600" font-family="system-ui,sans-serif" pointer-events="none">${escapeHtml(label)}</text>`
          );
        }
      }
    });

    if (this.showAxes && !axesInserted) {
      polygons.push(this._drawAxes(vbW, vbH, axesSpace));
    }

    let extra = '';
    if (this.showDimensions) {
      extra += this._drawDimensions(ox, oy, moduleW, moduleD, moduleH);
      if (this.explodeFactor <= 0) {
        extra += this._drawMainDimensions(ox, oy, moduleW, moduleD, moduleH);
      }
    }
    if (this.explodeFactor > 0) {
      const pieceDims = this._drawExplodedDimensions(geometries, ox, oy);
      if (pieceDims) extra = this._dimensionDefs() + extra + pieceDims;
    }

    const titleSize = 16 * this.textScale;
    const subtitleSize = 11 * this.textScale;
    const titleY = 28 * this.textScale;
    const subtitleY = 50 * this.textScale;

    return `
<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vista isométrica${title}" style="background:${COLORS.background};width:100%;height:auto;display:block;" preserveAspectRatio="xMidYMid meet">
  <text x="${vbW / 2}" y="${titleY.toFixed(1)}" text-anchor="middle" fill="${COLORS.textPrimary}" font-size="${titleSize.toFixed(1)}" font-weight="700">VISTA ISOMÉTRICA${title}</text>
  <text x="${vbW / 2}" y="${subtitleY.toFixed(1)}" text-anchor="middle" fill="${COLORS.textSecondary}" font-size="${subtitleSize.toFixed(1)}">${dimsText}</text>
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
      back_panel: { color: ROLE_COLORS.back_panel, width: 1 },
      side_panel: { color: ROLE_COLORS.side_panel, width: 1.5 },
      side_panel_rear: { color: ROLE_COLORS.side_panel, width: 1.5 },
      side_panel_front: { color: ROLE_COLORS.side_panel, width: 1.5 },
      bottom_panel: { color: ROLE_COLORS.bottom_panel, width: 1.5 },
      top_panel: { color: ROLE_COLORS.top_panel, width: 1.5 },
      shelf: { color: ROLE_COLORS.shelf, width: 1 },
      divider: { color: ROLE_COLORS.divider, width: 1 },
      drawer_face: { color: ROLE_COLORS.drawer_face, width: 2 },
      drawer_side: { color: ROLE_COLORS.drawer_side, width: 1 },
      drawer_bottom: { color: ROLE_COLORS.drawer_bottom, width: 1 },
      drawer_back: { color: ROLE_COLORS.drawer_back, width: 1 },
      door: { color: ROLE_COLORS.door, width: 2 },
      mirror: { color: ROLE_COLORS.mirror, width: 1 },
      handle: { color: ROLE_COLORS.handle, width: 1 },
      leg: { color: ROLE_COLORS.leg, width: 2 },
      brace: { color: ROLE_COLORS.brace, width: 1 },
      hanger_rail: { color: ROLE_COLORS.hanger_rail, width: 2 },
    };
    return strokes[role] || { color: ROLE_COLORS.default, width: 1 };
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
    const titleSpace = 60 * this.textScale;
    const axesSpace = this.showAxes ? 70 * this.textScale : 0;

    // PASADA 2: desplazar todo al área positiva, dejando padding
    const originX = -minX + this.padding;
    const originY = -minY + this.padding + titleSpace;

    const viewBoxW = Math.ceil(contentW + 2 * this.padding);
    const viewBoxH = Math.ceil(contentH + 2 * this.padding + titleSpace + axesSpace);

    return {
      viewBox: `0 0 ${viewBoxW} ${viewBoxH}`,
      originX,
      originY,
      axesSpace,
      width: viewBoxW,
      height: viewBoxH,
    };
  }

  _makeLabel(geo) {
    if (geo.role === 'handle') return '';
    const words = String(geo.name || '').split(/\s+/).slice(0, 2);
    if (geo.role === 'side_panel') return normalizeNameLocal(geo.name).includes('izquierdo') ? 'Lat.Izq' : 'Lat.Der';
    if (geo.role === 'drawer_face') return 'Cajón';
    if (geo.role === 'shelf') return 'Repisa';
    if (geo.role === 'door') return 'Puerta';
    return words.join(' ');
  }

  // ═══════════════════════════════════════════════════════════
  // EJES Y DIMENSIONES
  // ═══════════════════════════════════════════════════════════

  _drawAxes(viewW, viewH, axesSpace) {
    // Leyenda de ejes en un área reservada debajo del dibujo del módulo.
    const ox = this.padding + 16;
    const oy = viewH - Math.max(16, axesSpace / 2);
    const len = 28;
    const xTip = { x: ox + len, y: oy };
    const yTip = { x: ox + len * 0.5, y: oy + len * 0.5 };
    const zTip = { x: ox, y: oy - len };

    return `
    <g opacity="0.9">
      <line x1="${ox}" y1="${oy}" x2="${xTip.x}" y2="${xTip.y}" stroke="${AXES_COLORS.x}" stroke-width="2" />
      <text x="${xTip.x + 5}" y="${xTip.y + 4}" fill="${AXES_COLORS.x}" font-size="${(11 * this.textScale).toFixed(1)}" font-weight="bold" text-anchor="start">X (ancho)</text>
      <line x1="${ox}" y1="${oy}" x2="${yTip.x}" y2="${yTip.y}" stroke="${AXES_COLORS.y}" stroke-width="2" />
      <text x="${yTip.x + 5}" y="${yTip.y + 4}" fill="${AXES_COLORS.y}" font-size="${(11 * this.textScale).toFixed(1)}" font-weight="bold" text-anchor="start">Y (prof.)</text>
      <line x1="${ox}" y1="${oy}" x2="${zTip.x}" y2="${zTip.y}" stroke="${AXES_COLORS.z}" stroke-width="2" />
      <text x="${zTip.x}" y="${zTip.y - 5}" fill="${AXES_COLORS.z}" font-size="${(11 * this.textScale).toFixed(1)}" font-weight="bold" text-anchor="middle">Z (alto)</text>
    </g>`;
  }

  _drawDimensions(ox, oy, moduleW, moduleD, moduleH) {
    // Dimensiones en esquina superior derecha (proyección corregida).
    const tx = ox + (moduleW + moduleD * this.isoDepth) * this.scale + 10;
    const ty = oy - moduleH * this.scale - 10;
    return `<text x="${tx}" y="${ty}" fill="${COLORS.textSecondary}" font-size="${(10 * this.textScale).toFixed(1)}" font-family="monospace">W=${moduleW} D=${moduleD} H=${moduleH}</text>`;
  }

  // ═══════════════════════════════════════════════════════════
  // COTAS PRINCIPALES EN VISTA NORMAL
  // ═══════════════════════════════════════════════════════════

  _drawMainDimensions(ox, oy, moduleW, moduleD, moduleH) {
    // Cotas globales del módulo: ancho (X), profundidad (Y) y alto (Z).
    // Se dibujan sobre las aristas visibles de la caja envolvente.
    const p000 = this._isoProject(0, moduleD, 0, ox, oy);        // inferior-izq-frontal
    const pW00 = this._isoProject(moduleW, moduleD, 0, ox, oy);   // inferior-der-frontal
    const p0D0 = this._isoProject(moduleW, 0, 0, ox, oy);         // inferior-der-trasera
    const pW0H = this._isoProject(moduleW, moduleD, moduleH, ox, oy); // superior-der-frontal
    let svg = '';
    // Ancho (X): arista inferior frontal
    svg += this._drawDimensionLine(p000, pW00, Math.round(moduleW), 0, 18, AXES_COLORS.x, 'dimArrowX');
    // Profundidad (Y): arista inferior derecha
    svg += this._drawDimensionLine(p0D0, pW00, Math.round(moduleD), 18, 0, AXES_COLORS.y, 'dimArrowY');
    // Alto (Z): arista frontal derecha vertical
    svg += this._drawDimensionLine(pW00, pW0H, Math.round(moduleH), 28, 0, AXES_COLORS.z, 'dimArrowZ');
    return svg;
  }

  // ═══════════════════════════════════════════════════════════
  // COTAS DE PIEZAS EN VISTA EXPLODIDA
  // ═══════════════════════════════════════════════════════════

  _dimensionDefs() {
    const s = this.textScale;
    const make = (id, fill) => `<marker id="${id}" markerWidth="${6 * s}" markerHeight="${6 * s}" refX="${5 * s}" refY="${3 * s}" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L6,3 L0,6 L1.5,3 z" fill="${fill}" />
    </marker>`;
    return `<defs>
    ${make('dimArrow', '#94a3b8')}
    ${make('dimArrowX', AXES_COLORS.x)}
    ${make('dimArrowY', AXES_COLORS.y)}
    ${make('dimArrowZ', AXES_COLORS.z)}
  </defs>`;
  }

  _drawExplodedDimensions(geometries, ox, oy) {
    if (this.explodeFactor <= 0) return '';
    const minPieceDim = 40;
    return geometries
      .filter((g) => Math.max(g.w || 0, g.d || 0, g.h || 0) >= minPieceDim && g.role !== 'handle')
      .map((g) => this._drawPieceDimensions(g, ox, oy))
      .join('');
  }

  _drawPieceDimensions(geo, ox, oy) {
    const { projected } = this._projectCuboid(geo, ox, oy);
    const p2 = projected[2];
    const p5 = projected[5];
    const p6 = projected[6];
    const p7 = projected[7];
    if (!p2 || !p5 || !p6 || !p7) return '';
    const minDim = 40;
    let svg = '';
    // Ancho (X): arista frontal superior 7 -> 6
    if (geo.w >= minDim) svg += this._drawDimensionLine(p7, p6, Math.round(geo.w), -8, -8);
    // Profundidad (Y): arista superior derecha 5 -> 6
    if (geo.d >= minDim) svg += this._drawDimensionLine(p5, p6, Math.round(geo.d), 8, -8);
    // Alto (Z): arista frontal derecha vertical 2 -> 6
    if (geo.h >= minDim) svg += this._drawDimensionLine(p2, p6, Math.round(geo.h), 8, 0);
    return svg;
  }

  _drawDimensionLine(a, b, value, offX, offY, color = '#94a3b8', markerId = 'dimArrow') {
    const s = this.textScale;
    const ax = a.x + offX * s;
    const ay = a.y + offY * s;
    const bx = b.x + offX * s;
    const by = b.y + offY * s;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const text = String(value);
    const tw = Math.max(14 * s, text.length * 5.5 * s);
    const th = 10 * s;
    const fs = 8 * s;
    const dy = 3 * s;
    return `
    <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.6" />
    <line x1="${b.x.toFixed(1)}" y1="${b.y.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.6" />
    <line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="0.75" marker-start="url(#${markerId})" marker-end="url(#${markerId})" opacity="0.85" />
    <rect x="${(mx - tw / 2).toFixed(1)}" y="${(my - th / 2).toFixed(1)}" width="${tw.toFixed(1)}" height="${th.toFixed(1)}" rx="${2 * s}" fill="rgba(15,23,42,0.75)" stroke="none" />
    <text x="${mx.toFixed(1)}" y="${(my + dy).toFixed(1)}" text-anchor="middle" fill="#f1f5f9" font-size="${fs.toFixed(1)}" font-family="monospace" font-weight="600">${text}</text>`;
  }
}
