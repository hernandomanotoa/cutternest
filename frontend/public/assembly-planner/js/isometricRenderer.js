/**
 * IsometricRenderer — Renderizador SVG isométrico 3D para CutterNest Assembly Planner
 * Tecnología: SVG puro, sin librerías externas.
 */

import {
  getPieceDims,
  getModuleDimensions,
  classifyBackPanelMount,
  classifyTopBottomMount,
} from './services/geometryService.js';
import { calculateVerticalPositions, getDefaultVerticalPosition } from './services/verticalPositionService.js';
import {
  applyDoorRotation,
  applyExplode,
  calculateVerticalZones,
  drawerRank,
  getModuleDepth,
  groupDividersIntoZones,
  inferBraceX,
  inferBraceZ,
  inferDividerX,
  inferDoorX,
  inferLegX,
  inferLegY,
  inferRailZ,
  inferThickness,
  shouldShowLabel,
} from './services/isoGeometryService.js';
import { inferRole, detectFamily, isShoeRack } from './services/classifierService.js';
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

function getDepthKey(geo, xFactor = 0.5) {
  // Usar el centroide proyectado en X para el painter's algorithm.
  // Esto permite que piezas de módulos adyacentes en vista completa se
  // ordenen correctamente según su posición visual, no solo real.
  const cx = geo.x + geo.w / 2;
  const cy = geo.y + geo.d / 2;
  const cz = geo.z + geo.h / 2;
  return cx + cy * xFactor + cz;
}

function sortByDepth(geometries, xFactor = 0.5) {
  return geometries.slice().sort((a, b) => {
    // Vista completa: pintar módulo a módulo (M1 completo, luego M2, ...).
    // En vista individual/global moduleSeq es undefined para todos y este
    // chequeo no altera el orden existente.
    const ma = a.moduleSeq ?? 0;
    const mb = b.moduleSeq ?? 0;
    if (ma !== mb) return ma - mb;

    const za = getZIndex(a.role);
    const zb = getZIndex(b.role);

    // Capas especiales: fondo y lateral trasero primero; lateral frontal al final.
    const aSpecial = za <= 2 || za >= 20;
    const bSpecial = zb <= 2 || zb >= 20;
    if (aSpecial || bSpecial) return za - zb;

    // Orden de armado de abajo hacia arriba (por Z base).
    // Si la diferencia es significativa (> espesor típico) usamos Z base;
    // si no, desempatamos por profundidad proyectada para mantener realismo 3D.
    const zDiff = a.z - b.z;
    if (Math.abs(zDiff) > 20) return zDiff;
    return getDepthKey(a, xFactor) - getDepthKey(b, xFactor);
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
    this.verticalPositionOverrides = options.verticalPositionOverrides || {};
  }

  render(moduleId, pieces, _dependencies) {
    const family = detectFamily(pieces, moduleId);
    const globalPieces = pieces.filter((p) => isGlobalPiece(p));
    const globalBottoms = globalPieces.filter((p) => inferRole(p) === 'bottom_panel');
    const globalTops = globalPieces.filter((p) => inferRole(p) === 'top_panel');
    const zocaloHeight = globalBottoms.length ? Math.max(...globalBottoms.map((p) => Number(p.alto) || 0)) : 0;
    const coronaHeight = globalTops.length ? Math.max(...globalTops.map((p) => Number(p.alto) || 0)) : 0;
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
          group, dims.width, moduleD, dims.height, dims.thickness, family, zocaloHeight, coronaHeight
        );
        // 'compact' pega los módulos lateral con lateral (compartiendo
        // laterales, como un mueble ya ensamblado). 'projected' añade la
        // proyección de la profundidad + un gap de espesor para verlos como
        // módulos separados.
        const useProjection = this.moduleGapMode === 'projected';
        const bounds = this._computeModuleBounds(subGeometries, useProjection);
        const moduleVisualWidth = bounds.max - bounds.min;
        subGeometries.forEach((g) => { g.x += offsetX; });
        // Etiqueta para pintar módulo a módulo (M1 completo, luego M2, ...).
        subGeometries.forEach((g) => { g.moduleSeq = idx; });
        geometries.push(...subGeometries);
        // 'projected' deja un gap visible (espesor) entre módulos; 'compact'
        // los pega lateral con lateral (sin gap extra).
        const extraGap = useProjection ? dims.thickness : 0;
        offsetX += moduleVisualWidth + extraGap;
      });
      // Superponer piezas globales (zócalo/tapa corrida) sobre el ancho total.
      // Se pintan después de todos los módulos (moduleSeq mayor).
      if (globalPieces.length) {
        const globalGeoms = this._buildGlobalGeometries(globalPieces, offsetX, moduleD, moduleH, thickness, true);
        globalGeoms.forEach((g) => { g.moduleSeq = sortedIds.length; });
        geometries.push(...globalGeoms);
      }
    } else {
      // Piezas del módulo principal + submódulos insertos
      geometries.push(...this._buildModuleGeometries(allPieces, moduleW, moduleD, moduleH, thickness, family, zocaloHeight, coronaHeight));
      // Superponer piezas de estructura global (zócalo, tapa corrida, espejo...)
      // Las puertas globales solo se dibujan en vista completa o estructura global.
      if (globalPieces.length) {
        geometries.push(...this._buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness, false));
      }
    }

    if (this.explodeFactor > 0) {
      geometries = applyExplode(geometries, moduleW, moduleD, moduleH, this.explodeFactor);
    }

    const xFactor = this.isoFlip ? -this.isoDepth : this.isoDepth;
    const sorted = sortByDepth(geometries, xFactor);
    const isAllView = target === ALL_MODULE_ID;
    const { viewBox, originX, originY, axesSpace } = this._calculateViewport(geometries, isAllView);

    const svg = this._buildSVG(sorted, viewBox, originX, originY, axesSpace, moduleLabel, moduleW, moduleD, moduleH, isAllView, thickness);
    this.container.innerHTML = svg;
  }

  // ═══════════════════════════════════════════════════════════
  // GEOMETRÍA 3D
  // ═══════════════════════════════════════════════════════════

  _buildModuleGeometries(pieces, moduleW, moduleD, moduleH, thickness, family, zocaloHeight = 0, coronaHeight = 0) {
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

    const baseMount = bottom ? classifyTopBottomMount(bottom, moduleW, moduleD, thickness) : 'external';
    const topMount = top ? classifyTopBottomMount(top, moduleW, moduleD, thickness) : 'external';

    // Piezas interiores (estantes/divisores) deben detenerse en la cara interior del fondo
    // y en la cara interior del lateral frontal: no atraviesan ni el fondo ni los laterales.
    const backThickness = back ? Number(back.espesor) || thickness : 0;
    const depthOffset = backThickness;
    const interiorDepth = Math.max(0, moduleD - backThickness - thickness);

    // Offsets verticales de base/tapa en el sistema de coordenadas del suelo.
    // bottomPanelOffset = altura de la cara inferior de la base.
    // topPanelOffset    = altura de la cara inferior de la tapa (borde inferior).
    const bottomPanelOverride = this.verticalPositionOverrides?.bottomPanelOffset;
    const bottomPanelOffset = Number.isFinite(bottomPanelOverride)
      ? bottomPanelOverride
      : (baseMount === 'internal' ? zocaloHeight : VERTICAL_POSITIONS.bottomPanelOffset);
    const topPanelOverride = this.verticalPositionOverrides?.topPanelOffset;
    const topPanelOffset = Number.isFinite(topPanelOverride)
      ? topPanelOverride
      : (topMount === 'internal' ? Math.max(0, moduleH - thickness - coronaHeight) : moduleH - thickness);

    const sideStartZ = baseMount === 'internal' ? 0 : bottomPanelOffset + thickness;
    const sideEndZ = topMount === 'internal' ? topPanelOffset + thickness : topPanelOffset;
    const sideH = Math.max(0, sideEndZ - sideStartZ);

    if (bottom) {
      let bx, by, bw, bd;
      if (baseMount === 'internal') {
        bx = thickness;
        by = thickness;
        bw = Math.max(0, moduleW - 2 * thickness);
        bd = Math.max(0, moduleD - 2 * thickness);
      } else if (baseMount === 'external') {
        bx = 0;
        by = 0;
        bw = moduleW;
        bd = moduleD;
      } else {
        // Custom: se respetan las medidas reales de la pieza y se centra en el módulo.
        bw = Number(bottom.ancho) || moduleW;
        bd = Number(bottom.alto) || moduleD;
        bx = Math.max(0, (moduleW - bw) / 2);
        by = Math.max(0, (moduleD - bd) / 2);
      }
      geometries.push({
        x: bx, y: by, z: bottomPanelOffset,
        w: bw, d: bd, h: thickness,
        color: bottom.color, role: 'bottom_panel', name: bottom.nombre, id: bottom.id,
      });
    }

    if (top) {
      let tx, ty, tw, td;
      if (topMount === 'internal') {
        tx = thickness;
        ty = thickness;
        tw = Math.max(0, moduleW - 2 * thickness);
        td = Math.max(0, moduleD - 2 * thickness);
      } else if (topMount === 'external') {
        tx = 0;
        ty = 0;
        tw = moduleW;
        td = moduleD;
      } else {
        // Custom: se respetan las medidas reales de la pieza y se centra en el módulo.
        tw = Number(top.ancho) || moduleW;
        td = Number(top.alto) || moduleD;
        tx = Math.max(0, (moduleW - tw) / 2);
        ty = Math.max(0, (moduleD - td) / 2);
      }
      geometries.push({
        x: tx, y: ty, z: topPanelOffset,
        w: tw, d: td, h: thickness,
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
        x, y: 0, z: sideStartZ, w: thickness, d: moduleD, h: sideH,
        color: side.color, role: isFront ? 'side_panel_front' : 'side_panel_rear', name: side.nombre, id: side.id,
        // Los laterales se dibujan semi-transparentes para dejar ver el
        // interior (repisas/estantes) a través de ellos.
        opacity: 0.4,
      });
    });

    if (back) {
      const mount = classifyBackPanelMount(back, moduleW, moduleH, thickness);
      const backDims = getPieceDims(back, 'back_panel', thickness, family);
      const backThickness = Number(back.espesor) || thickness;
      const isInternal = mount === 'internal';
      geometries.push({
        x: isInternal ? thickness : 0,
        y: 0,
        z: isInternal ? thickness : 0,
        w: backDims.w,
        d: backThickness,
        h: backDims.h,
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
      ? calculateVerticalPositions(moduleH, thickness, shelves, {
          overrides: this.verticalPositionOverrides,
          baseOffset: bottomPanelOffset,
          topPanelOffset,
        })
      : [];
    const interiorWidth = Math.max(0, moduleW - 2 * thickness);
    shelfPositions.forEach((sp) => {
      const dims = getPieceDims(sp.piece, 'shelf', thickness, family);
      // Las piezas horizontales interiores van embutidas entre laterales;
      // nunca deben exceder el ancho interior, aunque el CSV traiga un ancho mayor.
      const w = Math.min(dims.w || interiorWidth, interiorWidth);
      const x = Math.max(thickness, (moduleW - w) / 2);
      // La profundidad de la repisa respeta el CSV (alto), pero no puede
      // pasar la cara interior del fondo. Si no viene, usa toda la profundidad interior.
      const shelfDepth = Math.min(Number(sp.piece.alto) || interiorDepth, interiorDepth);
      const y = depthOffset;
      geometries.push({
        x, y, z: sp.y, w, d: shelfDepth, h: dims.h,
        color: sp.piece.color, role: 'shelf', name: sp.piece.nombre, id: sp.piece.id,
      });
    });

    // Divisores verticales
    const dividers = roles.filter((p) => p.role === 'divider');
    if (dividers.length) {
      geometries.push(
        ...this._buildDividerGeometries(dividers, moduleW, moduleD, moduleH, thickness, shelfPositions, top, bottom, backThickness, bottomPanelOffset, topPanelOffset)
      );
    }

    // Puertas y vidrios (paneles frontales): se apilan verticalmente para
    // diferenciar superior/inferior y evitar solapes cuando hay varios.
    const frontPanels = [
      ...roles.filter((p) => p.role === 'door'),
      ...roles.filter((p) => p.role === 'glass'),
    ];
    if (frontPanels.length) {
      geometries.push(...this._buildFrontPanelGeometries(frontPanels, moduleW, moduleD, moduleH, thickness, family, bottomPanelOffset, topPanelOffset));
    }

    // Cajones
    const drawers = roles.filter((p) => p.role.startsWith('drawer_') || p.role === 'handle');
    if (drawers.length) {
      geometries.push(...this._buildDrawerGeometries(roles, moduleW, moduleD, moduleH, thickness, family, shelfPositions, bottomPanelOffset, topPanelOffset));
    }

    // Riel colgador
    const rails = roles.filter((p) => p.role === 'hanger_rail');
    rails.forEach((rail) => {
      const dims = getPieceDims(rail, 'hanger_rail', thickness, family);
      const z = Number.isFinite(rail.pos_z)
        ? Number(rail.pos_z)
        : getDefaultVerticalPosition(rail, moduleH, thickness, this.verticalPositionOverrides, bottomPanelOffset, topPanelOffset);
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
      const z = inferBraceZ(brace, moduleH, dims.h, thickness, this.verticalPositionOverrides, topPanelOffset, bottomPanelOffset);
      geometries.push({
        x, y: moduleD - thickness, z, w: dims.w, d: thickness, h: dims.h,
        color: brace.color, role: 'brace', name: brace.nombre, id: brace.id, opacity: 0.7,
      });
    });

    return geometries;
  }

  _buildFrontPanelGeometries(panels, moduleW, moduleD, moduleH, thickness, family, bottomPanelOffset = 0, topPanelOffset = null) {
    const overrides = this.verticalPositionOverrides || {};
    const t = Number(thickness) || 15;
    const gap = overrides.doorGap ?? VERTICAL_POSITIONS.doorGap;
    const topInset = overrides.doorTopInset ?? VERTICAL_POSITIONS.doorTopInset;
    const bottomOffset = overrides.doorBaseOffset ?? VERTICAL_POSITIONS.doorBaseOffset;
    const baseTop = bottomPanelOffset + t;
    const topLimit = Number.isFinite(topPanelOffset) ? topPanelOffset : moduleH - t;

    const items = panels.map((piece) => {
      const role = inferRole(piece);
      const dims = getPieceDims(piece, role, thickness, family);
      const w = dims.w || moduleW - 2 * thickness;
      const h = dims.h || moduleH - 2 * thickness;
      const x = inferDoorX(piece, moduleW, w, thickness);
      const n = normalizeNameLocal(piece.nombre);
      const id = normalizeNameLocal(piece.id);
      const text = `${n} ${id}`;
      let column = 'center';
      if (n.includes('izquierda') || n.includes('izq') || id.includes('izq')) column = 'left';
      else if (n.includes('derecha') || n.includes('der') || id.includes('der')) column = 'right';
      let zone = 'middle';
      if (text.includes('superior') || text.includes('sup')) zone = 'top';
      else if (text.includes('inferior') || text.includes('inf') || text.includes('bajo')) zone = 'bottom';
      return { piece, role, x, w, h, column, zone, hasPosZ: Number.isFinite(piece.pos_z), posZ: Number(piece.pos_z) };
    });

    // Agrupar por columna (izquierda/centro/derecha): solo se apilan los
    // paneles que comparten columna (ej. puerta superior + puerta inferior).
    const groups = new Map();
    items.forEach((it) => {
      if (!groups.has(it.column)) groups.set(it.column, []);
      groups.get(it.column).push(it);
    });

    const geos = [];
    groups.forEach((group) => {
      const tops = group.filter((i) => i.zone === 'top');
      const bottoms = group.filter((i) => i.zone === 'bottom');
      const middles = group.filter((i) => i.zone === 'middle');
      const zMap = new Map();

      let topY = topLimit - topInset;
      tops.slice().sort((a, b) => b.h - a.h).forEach((it) => {
        const z = it.hasPosZ ? it.posZ : topY - it.h;
        zMap.set(it, z);
        topY = z - gap;
      });

      let bottomY = baseTop + bottomOffset;
      bottoms.slice().sort((a, b) => a.h - b.h).forEach((it) => {
        const z = it.hasPosZ ? it.posZ : bottomY;
        zMap.set(it, z);
        bottomY = z + it.h + gap;
      });

      const middleTop = tops.length ? topY + gap : topLimit - topInset;
      const middleBottom = bottoms.length ? bottomY - gap : baseTop + bottomOffset;
      const available = Math.max(0, middleTop - middleBottom);
      const totalH = middles.reduce((s, i) => s + i.h, 0);
      const n = middles.length;
      const middleGap = n > 1 ? Math.min(gap, Math.max(0, (available - totalH) / (n - 1))) : 0;
      let cur = middleBottom + (n > 1 ? 0 : Math.max(0, (available - totalH) / 2));
      middles.slice().sort((a, b) => a.h - b.h).forEach((it) => {
        const z = it.hasPosZ ? it.posZ : cur;
        zMap.set(it, z);
        cur = z + it.h + middleGap;
      });

      group.forEach((it) => {
        const z = zMap.get(it);
        const baseGeo = {
          x: it.x, y: moduleD, z, w: it.w,
          d: it.role === 'glass' ? (Number(it.piece.espesor) || thickness) : thickness,
          h: it.h,
          color: it.piece.color, role: it.role, name: it.piece.nombre, id: it.piece.id,
          opacity: it.role === 'glass' ? 0.3 : 0.35,
        };
        geos.push(it.role === 'door' ? applyDoorRotation(baseGeo, this.doorAngle) : baseGeo);
      });
    });

    return geos;
  }

  _buildDrawerGeometries(roles, moduleW, moduleD, moduleH, thickness, family, shelfPositions = [], bottomPanelOffset = 0, topPanelOffset = null) {
    const geometries = [];
    const faces = roles.filter((p) => inferRole(p) === 'drawer_face');
    if (!faces.length) return geometries;

    // Ubicar cada cajón dentro del hueco (zona) que le corresponde.
    // Las zonas están definidas por base/tapa/repisas. shelfPositions se
    // calcula una sola vez en _buildModuleGeometries y se reutiliza aquí.
    const hasBottom = roles.some((p) => inferRole(p) === 'bottom_panel');
    const hasTop = roles.some((p) => inferRole(p) === 'top_panel');
    const zones = calculateVerticalZones(moduleH, thickness, shelfPositions, hasBottom, hasTop, bottomPanelOffset, topPanelOffset);

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

  _buildDividerGeometries(dividers, moduleW, moduleD, moduleH, thickness, shelfPositions, top, bottom, backThickness = 0, bottomPanelOffset = 0, topPanelOffset = null) {
    const geometries = [];
    if (!dividers.length) return geometries;

    const depthOffset = backThickness;
    const interiorDepth = Math.max(0, moduleD - backThickness);
    const t = Number(thickness) || 15;
    const baseTop = bottomPanelOffset + t;
    const topLimit = Number.isFinite(topPanelOffset) ? topPanelOffset : moduleH - t;

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
      const z = baseTop;
      const h = Math.min(dims.h || topLimit - baseTop, topLimit - baseTop);
      geometries.push({
        x, y: depthOffset, z, w: divW, d: interiorDepth, h,
        color: div.color, role: 'divider', name: div.nombre, id: div.id,
      });
    });

    if (horizontal.length) {
      const zones = calculateVerticalZones(moduleH, thickness, shelfPositions, !!bottom, !!top, bottomPanelOffset, topPanelOffset);
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
            x, y: depthOffset, z, w: divW, d: interiorDepth, h: divH,
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
          : Math.max(thickness, moduleH - thickness - h - (this.verticalPositionOverrides?.mirrorTopInset ?? VERTICAL_POSITIONS.mirrorTopInset));
        geometries.push({
          x: Math.max(0, (moduleW - w) / 2),
          y: -thickness,
          z: zPos,
          w, d: thickness, h,
          color, role: 'mirror', name: p.nombre, id: p.id, opacity: 0.45,
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
          : Math.max(thickness, moduleH - h - thickness - (this.verticalPositionOverrides?.doorTopInset ?? VERTICAL_POSITIONS.doorTopInset));
        const baseGeo = {
          x, y: moduleD, z, w: doorW, d: thickness, h,
          color: door.color || ROLE_COLORS.door, role: 'door', name: door.nombre, id: door.id,
          opacity: 0.35,
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

  _polygonArea(projected, indices) {
    let area = 0;
    const n = indices.length;
    for (let i = 0; i < n; i++) {
      const a = projected[indices[i]];
      const b = projected[indices[(i + 1) % n]];
      area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area) / 2;
  }

  _buildSVG(geometries, viewBox, ox, oy, axesSpace, moduleLabel, moduleW, moduleD, moduleH, isAllView = false, thickness = 15) {
    const polygons = [];
    const labels = [];

    // viewBox es string "0 0 W H"; extraemos W/H para centrar título/dimensiones
    const vbParts = viewBox.split(' ').map(Number);
    const vbW = vbParts[2] || 800;
    const vbH = vbParts[3] || 600;

    const title = moduleLabel ? ` — ${escapeHtml(moduleLabel)}` : '';
    const dimsText = isAllView ? '' : `${moduleW} × ${moduleD} × ${moduleH} mm`;
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
        if (this._polygonArea(projected, face.indices) < 0.5) return;
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
    const showDims = this.showDimensions && !isAllView;
    if (showDims) {
      const dims = this._drawDimensions(ox, oy, moduleW, moduleD, moduleH);
      const mainDims = this.explodeFactor <= 0 ? this._drawMainDimensions(ox, oy, moduleW, moduleD, moduleH) : '';
      const offsetDims = this.explodeFactor <= 0 ? this._drawVerticalOffsetDimensions(geometries, ox, oy, moduleW, moduleD, moduleH, thickness) : '';
      const pieceDims = this.explodeFactor > 0 ? this._drawExplodedDimensions(geometries, ox, oy) : '';
      extra = this._dimensionDefs() + dims + mainDims + offsetDims + pieceDims;
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

  _calculateViewport(geometries, isAllView = false) {
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

    const dimensionSpaceX = this.showDimensions && !isAllView ? 100 * this.textScale : 0;
    const dimensionSpaceY = this.showDimensions && !isAllView ? 45 * this.textScale : 0;

    // PASADA 2: desplazar todo al área positiva, dejando padding
    const originX = -minX + this.padding + dimensionSpaceX;
    const originY = -minY + this.padding + titleSpace + dimensionSpaceY;

    const viewBoxW = Math.ceil(contentW + 2 * this.padding + 2 * dimensionSpaceX);
    const viewBoxH = Math.ceil(contentH + 2 * this.padding + titleSpace + axesSpace + dimensionSpaceY);

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
    if (geo.role === 'shelf') return isShoeRack({ nombre: geo.name, id: geo.id }) ? 'Zapatero' : 'Repisa';
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
    // Se dibujan sobre la arista trasera para no tapar la vista frontal.
    const p000 = this._isoProject(0, 0, 0, ox, oy);              // inferior-izq-trasera
    const pW00 = this._isoProject(moduleW, 0, 0, ox, oy);       // inferior-der-trasera
    const p0D0 = this._isoProject(0, moduleD, 0, ox, oy);        // inferior-izq-frontal
    const pW0H = this._isoProject(moduleW, 0, moduleH, ox, oy);  // superior-der-trasera
    let svg = '';
    // Ancho (X): arista inferior trasera
    svg += this._drawDimensionLine(p000, pW00, Math.round(moduleW), 0, -18, AXES_COLORS.x, 'dimArrowX');
    // Profundidad (Y): arista trasera izquierda
    svg += this._drawDimensionLine(p000, p0D0, Math.round(moduleD), -18, 0, AXES_COLORS.y, 'dimArrowY');
    // Alto (Z): arista trasera derecha vertical
    svg += this._drawDimensionLine(pW00, pW0H, Math.round(moduleH), 28, 0, AXES_COLORS.z, 'dimArrowZ');
    return svg;
  }

  // ═══════════════════════════════════════════════════════════
  // COTAS DE OFFSETS VERTICALES EN VISTA NORMAL
  // ═══════════════════════════════════════════════════════════

  _drawVerticalOffsetDimensions(geometries, ox, oy, moduleW, moduleD, moduleH, thickness) {
    const bottom = geometries.find((g) => g.role === 'bottom_panel');
    const top = geometries.find((g) => g.role === 'top_panel');
    const t = Number(thickness) || 15;
    const overrides = this.verticalPositionOverrides || {};
    const v = (key) => overrides[key] ?? VERTICAL_POSITIONS[key];

    const baseBottom = bottom ? bottom.z : 0;
    const baseTop = baseBottom + t;
    const topBottom = top ? top.z : moduleH - t;

    let svg = '';
    let currentOffX = 55;

    const drawSegment = (z1, z2, value, color, label) => {
      if (value <= 0) return '';
      const p1 = this._isoProject(moduleW, 0, z1, ox, oy);
      const p2 = this._isoProject(moduleW, 0, z2, ox, oy);
      const line = this._drawDimensionLine(p1, p2, Math.round(value), currentOffX, 0, color, 'dimArrow');
      currentOffX += 18;
      return line;
    };

    const drawGapStack = (items, baseColor) => {
      if (!items.length) return '';
      items.sort((a, b) => a.z - b.z);
      let s = '';
      const first = items[0];
      const firstGap = first.z - baseTop;
      if (firstGap > 0) {
        s += drawSegment(baseTop, first.z, firstGap, baseColor, 'baseOffset');
      }
      for (let i = 1; i < items.length; i++) {
        const prev = items[i - 1];
        const curr = items[i];
        const gap = curr.z - (prev.z + prev.h);
        if (gap > 0) {
          s += drawSegment(prev.z + prev.h, curr.z, gap, baseColor, 'gap');
        }
      }
      return s;
    };

    // Offset de la base desde el suelo.
    svg += drawSegment(0, baseBottom, baseBottom, '#f59e0b', 'bottomPanelOffset');

    // Zapateros: offset desde la base + gaps.
    const shoeRacks = geometries.filter(
      (g) => g.role === 'shelf' && isShoeRack({ nombre: g.name, id: g.id })
    );
    svg += drawGapStack(shoeRacks, '#10b981');

    // Repisas (no zapateros): offset desde la base + gaps.
    const shelves = geometries.filter(
      (g) => g.role === 'shelf' && !isShoeRack({ nombre: g.name, id: g.id })
    );
    svg += drawGapStack(shelves, '#4ECDC4');

    // Frentes de cajón: offset desde la base + gaps.
    const drawers = geometries.filter((g) => g.role === 'drawer_face');
    svg += drawGapStack(drawers, '#f59e0b');

    // Puertas: base offset, top inset y gap entre puertas.
    const doors = geometries.filter((g) => g.role === 'door').sort((a, b) => a.z - b.z);
    if (doors.length) {
      const doorBaseOffset = doors[0].z - baseTop;
      if (doorBaseOffset > 0) {
        svg += drawSegment(baseTop, doors[0].z, doorBaseOffset, '#3b82f6', 'doorBaseOffset');
      }
      for (let i = 1; i < doors.length; i++) {
        const prev = doors[i - 1];
        const gap = doors[i].x - (prev.x + prev.w);
        if (gap > 0) {
          // Cota horizontal de gap entre puertas (en arista superior trasera).
          const p1 = this._isoProject(prev.x + prev.w, 0, topBottom, ox, oy);
          const p2 = this._isoProject(doors[i].x, 0, topBottom, ox, oy);
          svg += this._drawDimensionLine(p1, p2, Math.round(gap), 0, -18, '#3b82f6', 'dimArrow');
        }
      }
      const doorTopInset = v('doorTopInset');
      if (doorTopInset > 0) {
        svg += drawSegment(topBottom - doorTopInset, topBottom, doorTopInset, '#3b82f6', 'doorTopInset');
      }
    }

    // Travesaños: base offset y top inset.
    const braces = geometries.filter((g) => g.role === 'brace').sort((a, b) => a.z - b.z);
    if (braces.length) {
      const braceBaseOffset = braces[0].z - baseTop;
      if (braceBaseOffset > 0) {
        svg += drawSegment(baseTop, braces[0].z, braceBaseOffset, '#94a3b8', 'braceBaseOffset');
      }
      const braceTopInset = v('braceTopInset');
      if (braceTopInset > 0) {
        svg += drawSegment(topBottom - braceTopInset, topBottom, braceTopInset, '#94a3b8', 'braceTopInset');
      }
    }

    // Espejo: inset desde tapa.
    if (geometries.some((g) => g.role === 'mirror')) {
      const mirrorTopInset = v('mirrorTopInset');
      svg += drawSegment(topBottom - mirrorTopInset, topBottom, mirrorTopInset, '#DDA0DD', 'mirrorTopInset');
    }

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
