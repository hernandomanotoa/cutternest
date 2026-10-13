/**
 * Geometría del módulo (carcasa completa): zócalos frontales, base, tapa,
 * laterales, fondo, patas, estantes/repisas por vanos, riel colgador y
 * travesaños. Orquesta los builders de paneles frontales, cajones,
 * divisores y asientos.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import {
  ROLE_COLORS,
  VERTICAL_POSITIONS,
} from '../../../core/config.js';
import { inferRole } from '../../../services/classifierService.js';
import {
  classifyTopBottomMount,
  classifyTopBottomMountAxes,
  classifyPlinthMount,
  getPieceDims,
} from '../../../services/geometryService.js';
import {
  computeBays,
  inferBraceX,
  inferBraceZ,
  inferLegX,
  inferLegY,
  inferShelfBayIndex,
} from '../../../services/isoGeometryService.js';
import { calculateVerticalPositions, determineVerticalZone, getDefaultVerticalPosition } from '../../../services/verticalPositionService.js';
import { getPieceOffsetConfig } from '../../../services/pieceOffsetService.js';
import { normalizeName } from '../../../utils/normalize.js';
import { boxCorners, rotateCorners } from '../../../services/motionService.js';
import { buildDrawerGeometries } from './drawerGeometry.js';
import { buildDividerGeometries } from './dividerGeometry.js';
import { buildFrontPanelGeometries } from './frontPanelGeometry.js';
import { buildSeatingGeometries } from './seatingGeometry.js';
import { isHandlePiece } from './handleMatching.js';

export function groupByModule(pieces) {
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

export function sortModuleIds(ids) {
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

export function computeModuleBounds(renderer, geometries, includeDepth = true) {
  // Calcula el rango horizontal (en unidades reales) que ocupa un módulo.
  // includeDepth añade la proyección de la profundidad (isoDepth) para
  // evitar superposición isométrica; con false usa solo la proyección X.
  let minX = Infinity;
  let maxX = -Infinity;
  const xFactor = renderer.isoFlip ? -renderer.isoDepth : renderer.isoDepth;
  geometries.forEach((g) => {
    const corners = g.rotation
      ? rotateCorners(boxCorners(g), g.rotation)
      : [
        { x: g.x, y: g.y },
        { x: g.x + g.w, y: g.y },
        { x: g.x + g.w, y: g.y + g.d },
        { x: g.x, y: g.y + g.d },
      ];
    corners.forEach((c) => {
      const px = includeDepth ? c.x + c.y * xFactor : c.x;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
    });
  });
  return {
    min: isFinite(minX) ? minX : 0,
    max: isFinite(maxX) ? maxX : 0,
  };
}

export function buildModuleGeometries(renderer, pieces, moduleW, moduleD, moduleH, thickness, family, zocaloHeight = 0, coronaHeight = 0, zocaloDrawerHeight = 0) {
  const geometries = [];
  const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));

  // Cuando un módulo tiene una base propiamente dicha, las piezas nombradas
  // "zócalo" se renderizan como zócalo frontal (plinth) en lugar de base.
  const hasBottomPanel = roles.some((p) => p.role === 'bottom_panel');
  roles.forEach((p) => {
    const n = normalizeName(p.nombre);
    const id = normalizeName(p.id);
    if (hasBottomPanel && (n.includes('zocalo') || id.includes('zocalo'))) {
      p.role = 'plinth';
    }
  });

  // Sillas / asientos tienen geometría propia
  if (family === 'seating') {
    return buildSeatingGeometries(roles, moduleW, moduleD, moduleH, thickness);
  }

  // Estructura del módulo
  const bottom = roles.find((p) => p.role === 'bottom_panel');
  const top = roles.find((p) => p.role === 'top_panel');
  const sides = roles.filter((p) => p.role === 'side_panel');
  const back = roles.find((p) => p.role === 'back_panel');
  const legs = roles.filter((p) => p.role === 'leg');

  const baseMount = bottom ? classifyTopBottomMount(bottom, moduleW, moduleD, thickness) : 'external';
  const topMount = top ? classifyTopBottomMount(top, moduleW, moduleD, thickness) : 'external';
  const baseAxes = bottom ? classifyTopBottomMountAxes(bottom, moduleW, moduleD, thickness) : { width: 'external', depth: 'external' };
  const topAxes = top ? classifyTopBottomMountAxes(top, moduleW, moduleD, thickness) : { width: 'external', depth: 'external' };

  // Piezas interiores (estantes/divisores) deben detenerse en la cara interior del fondo
  // y en la cara interior del lateral frontal: no atraviesan ni el fondo ni los laterales.
  const backThickness = back ? Number(back.espesor) || thickness : 0;
  const depthOffset = backThickness;
  const interiorDepth = Math.max(0, moduleD - backThickness - thickness);

  // Zócalos frontales por módulo (plinth).
  const localPlinths = roles.filter((p) => p.role === 'plinth');
  const localPlinthHeight = localPlinths.length
    ? Math.max(...localPlinths.map((p) => Number(p.alto) || 0))
    : 0;
  const effectiveZocaloHeight = Math.max(zocaloHeight, localPlinthHeight);

  // Si algún zócalo se retrae hacia el fondo, hacemos la base semitransparente
  // para que se vea el zócalo a través de ella.
  const hasRecessedPlinth = localPlinths.some((plinth) => {
    const cfg = getPieceOffsetConfig(
      plinth,
      undefined,
      { pieceOffsets: renderer.verticalPositionOverrides?.pieceOffsets },
      {}
    );
    return Number.isFinite(cfg.offset) && cfg.offset > 0;
  });

  // Offsets verticales de base/tapa en el sistema de coordenadas del suelo.
  // bottomPanelOffset = altura de la cara inferior de la base.
  // topPanelOffset    = altura de la cara inferior de la tapa (borde inferior).
  const bottomPanelOverride = renderer.verticalPositionOverrides?.bottomPanelOffset;
  // El override por pieza para la base tiene prioridad sobre el global.
  const bottomPieceOverride = bottom
    ? renderer.verticalPositionOverrides?.pieceOffsets?.[bottom?.originalId || bottom?.id]?.offset
    : undefined;
  const bottomPanelOffset = Number.isFinite(bottomPieceOverride)
    ? bottomPieceOverride
    : (Number.isFinite(bottomPanelOverride)
      ? bottomPanelOverride
      : (baseAxes.width === 'internal' ? effectiveZocaloHeight : VERTICAL_POSITIONS.bottomPanelOffset));
  const topPanelOverride = renderer.verticalPositionOverrides?.topPanelOffset;
  const topPanelOffset = Number.isFinite(topPanelOverride)
    ? topPanelOverride
    : (topAxes.width === 'internal' ? Math.max(0, moduleH - thickness - coronaHeight) : moduleH - thickness);

  // En el modelo zócalo-cajón (zocaloDrawerHeight > 0) el zócalo global es
  // un cajón completo bajo los módulos: los laterales del módulo arrancan
  // en su cara superior, no en el suelo. En el patín retranqueado clásico
  // se conserva el comportamiento anterior (laterales al suelo, zócalo
  // frontal embutido/retranqueado entre ellos).
  const sideStartZ = zocaloDrawerHeight > 0
    ? zocaloDrawerHeight
    : (baseAxes.width === 'internal' ? 0 : bottomPanelOffset + thickness);
  const sideEndZ = topAxes.width === 'internal' ? topPanelOffset + thickness : topPanelOffset;
  const sideH = Math.max(0, sideEndZ - sideStartZ);

  // Zócalos frontales por módulo (plinth).
  // Se colocan en la parte inferior frontal, con clasificación de montaje
  // externo/interno/custom análoga a la del fondo.
  // Se añaden ANTES que la base en el array de geometrías para garantizar que,
  // si hay solape en la proyección, la base se pinte por encima del zócalo.
  localPlinths.forEach((plinth) => {
    const mount = classifyPlinthMount(plinth, moduleW, effectiveZocaloHeight, thickness);
    const dims = getPieceDims(plinth, 'plinth', thickness, family);
    const plinthD = Number(plinth.espesor) || thickness;
    const cfg = getPieceOffsetConfig(
      plinth,
      undefined,
      { pieceOffsets: renderer.verticalPositionOverrides?.pieceOffsets },
      {}
    );
    const recess = Number.isFinite(cfg.offset) ? cfg.offset : 0;
    let plinthW, plinthH, x;
    if (mount === 'external') {
      plinthW = moduleW;
      plinthH = effectiveZocaloHeight;
      x = 0;
    } else if (mount === 'internal') {
      plinthW = Math.max(0, moduleW - 2 * thickness);
      plinthH = effectiveZocaloHeight;
      x = thickness;
    } else {
      plinthW = Math.min(dims.w || moduleW, moduleW);
      plinthH = Math.min(dims.h || effectiveZocaloHeight, effectiveZocaloHeight);
      x = Math.max(0, (moduleW - plinthW) / 2);
    }
    const y = Math.max(0, moduleD - plinthD - recess);
    geometries.push({
      x, y, z: 0,
      w: plinthW, d: plinthD, h: plinthH,
      color: plinth.color || ROLE_COLORS.plinth, role: 'plinth', name: plinth.nombre, id: plinth.id,
    });
  });

  if (bottom) {
    let bx, by, bw, bd;
    if (baseAxes.width === 'internal') {
      bx = thickness;
      bw = Math.max(0, moduleW - 2 * thickness);
    } else if (baseAxes.width === 'external') {
      bx = 0;
      bw = moduleW;
    } else {
      // Custom: se respetan las medidas reales de la pieza y se centra en el módulo.
      bw = Number(bottom.ancho) || moduleW;
      bx = Math.max(0, (moduleW - bw) / 2);
    }

    if (baseAxes.depth === 'internal') {
      by = thickness;
      bd = Math.max(0, moduleD - 2 * thickness);
    } else if (baseAxes.depth === 'front_flush') {
      // Ras al frente, trasero contra la cara interior del fondo
      // (profundidad = moduleD − espesor del fondo).
      by = 0;
      bd = Math.max(0, moduleD - backThickness);
    } else if (baseAxes.depth === 'external') {
      by = 0;
      bd = moduleD;
    } else {
      // Profundidad intermedia: se alinea al fondo (y=0) para dejar el
      // receso frontal libre (p. ej. para el zócalo).
      bd = Number(bottom.alto) || moduleD;
      by = 0;
    }
    geometries.push({
      x: bx, y: by, z: bottomPanelOffset,
      w: bw, d: bd, h: thickness,
      color: bottom.color, role: 'bottom_panel', name: bottom.nombre, id: bottom.id,
      opacity: hasRecessedPlinth ? 0.45 : undefined,
    });
  }

  if (top) {
    let tx, ty, tw, td;
    if (topAxes.width === 'internal') {
      tx = thickness;
      tw = Math.max(0, moduleW - 2 * thickness);
    } else if (topAxes.width === 'external') {
      tx = 0;
      tw = moduleW;
    } else {
      // Custom: se respetan las medidas reales de la pieza y se centra en el módulo.
      tw = Number(top.ancho) || moduleW;
      tx = Math.max(0, (moduleW - tw) / 2);
    }

    if (topAxes.depth === 'internal') {
      ty = thickness;
      td = Math.max(0, moduleD - 2 * thickness);
    } else if (topAxes.depth === 'front_flush') {
      // Ras al frente, trasero contra la cara interior del fondo
      // (profundidad = moduleD − espesor del fondo).
      ty = 0;
      td = Math.max(0, moduleD - backThickness);
    } else if (topAxes.depth === 'external') {
      ty = 0;
      td = moduleD;
    } else {
      // Profundidad intermedia: se alinea al fondo (y=0) para dejar el
      // receso frontal libre si aplica.
      td = Number(top.alto) || moduleD;
      ty = 0;
    }
    geometries.push({
      x: tx, y: ty, z: topPanelOffset,
      w: tw, d: td, h: thickness,
      color: top.color, role: 'top_panel', name: top.nombre, id: top.id,
    });
  }

  sides.forEach((side) => {
    const isLeft = normalizeName(side.nombre).includes('izquierdo') || normalizeName(side.id).includes('izq');
    const x = isLeft ? 0 : moduleW - thickness;
    // En perspectiva normal (isoFlip=false) el lateral derecho queda al fondo
    // y el izquierdo al frente. Con isoFlip=true es al revés.
    const isFront = renderer.isoFlip ? !isLeft : isLeft;
    geometries.push({
      x, y: 0, z: sideStartZ, w: thickness, d: moduleD, h: sideH,
      color: side.color, role: isFront ? 'side_panel_front' : 'side_panel_rear', name: side.nombre, id: side.id,
      // Los laterales se dibujan semi-transparentes para dejar ver el
      // interior (repisas/estantes) a través de ellos.
      opacity: 0.4,
    });
  });

  if (back) {
    const backDims = getPieceDims(back, 'back_panel', thickness, family);
    const backThickness = Number(back.espesor) || thickness;
    // Offset por eje según el encaje real del panel (corrido, embutido o
    // custom), no una clasificación binaria: un fondo puede ser interno en
    // un eje y corrido en el otro (p. ej. 650×2000 en caja 680×2000):
    //   tamaño ≈ total      → alineado al borde del módulo (0)
    //   tamaño ≈ total − 2t → embutido entre casco (t)
    //   custom menor        → contra el lateral/base (total − tamaño, máx 2t)
    const tol = 2;
    const fitOffset = (size, total) => {
      if (Math.abs(size - total) <= tol) return 0;
      if (Math.abs(size - (total - 2 * thickness)) <= tol) return thickness;
      if (size < total) return Math.min(total - size, 2 * thickness);
      return 0;
    };
    geometries.push({
      x: fitOffset(backDims.w, moduleW),
      y: 0,
      z: fitOffset(backDims.h, moduleH),
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
    const x = inferLegX(leg, moduleW, w, renderer.verticalPositionOverrides);
    const y = inferLegY(leg, moduleD, w, renderer.verticalPositionOverrides);
    geometries.push({
      x, y, z: -h, w, d: w, h,
      color: leg.color || ROLE_COLORS.leg, role: 'leg', name: leg.nombre, id: leg.id,
    });
  });

  // Estantes / repisas
  const shelves = roles.filter((p) => p.role === 'shelf');

  // Divisores verticales: se calculan antes de los estantes para recortar
  // cada estante a los vanos (bays) que crean, y para poder apilar los
  // estantes de cada lado de forma independiente.
  const dividers = roles.filter((p) => p.role === 'divider');
  const bays = computeBays(dividers, moduleW, thickness);

  const interiorWidth = Math.max(0, moduleW - 2 * thickness);
  const maxBayWidth = Math.max(0, ...bays.map((b) => b.right - b.left));
  const isSpanningShelf = (p) => {
    const dims = getPieceDims(p, 'shelf', thickness, family);
    const fullW = Math.min(dims.w || interiorWidth, interiorWidth);
    const bayIndex = inferShelfBayIndex(p, bays);
    return bayIndex === null && (Math.abs(fullW - interiorWidth) <= 2 || fullW > maxBayWidth + 2);
  };

  // Repisas inferiores corrida: se calculan primero y su cara superior pasa
  // a ser la base para las piezas laterales, divisor y estantes posteriores.
  const isBottomLikeShelf = (p) => {
    const zone = determineVerticalZone(p);
    return zone === 'bottom' || zone === 'fixed-bottom';
  };
  const bottomSpanningShelves = shelves.filter((p) => isBottomLikeShelf(p) && isSpanningShelf(p));
  const sideShelves = shelves.filter((p) => !bottomSpanningShelves.includes(p));

  const calcPositions = (list, baseOffset = bottomPanelOffset) =>
    calculateVerticalPositions(moduleH, thickness, list, {
      overrides: renderer.verticalPositionOverrides,
      pieceOffsets: renderer.verticalPositionOverrides?.pieceOffsets,
      baseOffset,
      topPanelOffset,
    });

  const bottomPositions = calcPositions(bottomSpanningShelves);
  const raisedBaseTop = bottomPositions.length
    ? Math.max(...bottomPositions.map((sp) => sp.y + sp.h))
    : bottomPanelOffset + thickness;
  const raisedBaseOffset = raisedBaseTop - thickness;

  // Calcular posiciones verticales por lado usando la base elevada.
  const leftShelves = sideShelves.filter((p) => inferShelfBayIndex(p, bays) === 0);
  const rightShelves = sideShelves.filter((p) => inferShelfBayIndex(p, bays) === bays.length - 1);
  const centerShelves = sideShelves.filter((p) => {
    const idx = inferShelfBayIndex(p, bays);
    return idx !== null && idx > 0 && idx < bays.length - 1;
  });
  const otherShelves = sideShelves.filter((p) => inferShelfBayIndex(p, bays) === null);

  const shelfPositions = [
    ...bottomPositions,
    ...calcPositions(leftShelves, raisedBaseOffset),
    ...calcPositions(rightShelves, raisedBaseOffset),
    ...calcPositions(centerShelves, raisedBaseOffset),
    ...calcPositions(otherShelves, raisedBaseOffset),
  ];
  shelfPositions.forEach((sp) => {
    const dims = getPieceDims(sp.piece, 'shelf', thickness, family);
    // Las piezas horizontales interiores van embutidas entre laterales;
    // nunca deben exceder el ancho interior, aunque el CSV traiga un ancho mayor.
    const fullW = Math.min(dims.w || interiorWidth, interiorWidth);
    // La profundidad de la repisa respeta el CSV (alto), pero no puede
    // pasar la cara interior del fondo. Si no viene, usa toda la profundidad interior.
    const shelfDepth = Math.min(Number(sp.piece.alto) || interiorDepth, interiorDepth);
    const y = depthOffset;
    const h = dims.h;

    const bayIndex = inferShelfBayIndex(sp.piece, bays);
    // Si una repisa no tiene palabra clave lateral y su ancho cubre todo el
    // interior del módulo o es mayor que un vano individual, se dibuja como
    // una sola pieza atravesando todos los vanos (p. ej. una repisa superior
    // corrida). De lo contrario se replica en cada vano.
    const maxBayWidth = Math.max(0, ...bays.map((b) => b.right - b.left));
    const isSpanning =
      bayIndex === null &&
      (Math.abs(fullW - interiorWidth) <= 2 || fullW > maxBayWidth + 2);
    const targetBays = isSpanning
      ? [{ left: thickness, right: moduleW - thickness }]
      : bayIndex !== null
        ? [bays[bayIndex]]
        : bays;

    targetBays.forEach((bay) => {
      const bayInnerW = bay.right - bay.left;
      const w = Math.min(fullW, bayInnerW);
      const x = bay.left + Math.max(0, (bayInnerW - w) / 2);
      geometries.push({
        x, y, z: sp.y, w, d: shelfDepth, h,
        color: sp.piece.color, role: 'shelf', name: sp.piece.nombre, id: sp.piece.id,
        zone: sp.zone,
      });
    });
  });

  // Divisores verticales
  if (dividers.length) {
    geometries.push(
      ...buildDividerGeometries(renderer, dividers, moduleW, moduleD, moduleH, thickness, shelfPositions, top, bottom, backThickness, raisedBaseOffset, topPanelOffset)
    );
  }

  // Puertas y vidrios (paneles frontales): se apilan verticalmente para
  // diferenciar superior/inferior y evitar solapes cuando hay varios.
  const frontPanels = [
    // Los tiradores de puerta (rol 'door' por quirk del clasificador) no son
    // paneles: renderizan como geo de handle emparejada a su puerta.
    ...roles.filter((p) => p.role === 'door' && !isHandlePiece(p)),
    ...roles.filter((p) => p.role === 'glass'),
  ];
  if (frontPanels.length) {
    geometries.push(...buildFrontPanelGeometries(renderer, frontPanels, moduleW, moduleD, moduleH, thickness, family, bottomPanelOffset, topPanelOffset, roles));
  }

  // Cajones
  const drawers = roles.filter((p) => p.role.startsWith('drawer_') || p.role === 'handle');
  if (drawers.length) {
    geometries.push(...buildDrawerGeometries(renderer, roles, moduleW, moduleD, moduleH, thickness, family, shelfPositions, bottomPanelOffset, topPanelOffset));
  }

  // Riel colgador
  const rails = roles.filter((p) => p.role === 'hanger_rail');
  rails.forEach((rail) => {
    const dims = getPieceDims(rail, 'hanger_rail', thickness, family);
    const z = Number.isFinite(rail.pos_z)
      ? Number(rail.pos_z)
      : getDefaultVerticalPosition(rail, moduleH, thickness, renderer.verticalPositionOverrides, bottomPanelOffset, topPanelOffset);
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
    const z = inferBraceZ(brace, moduleH, dims.h, thickness, renderer.verticalPositionOverrides, topPanelOffset, bottomPanelOffset);
    geometries.push({
      x, y: moduleD - thickness, z, w: dims.w, d: thickness, h: dims.h,
      color: brace.color, role: 'brace', name: brace.nombre, id: brace.id, opacity: 0.7,
    });
  });

  return geometries;
}
