// js/services/verticalPositionService.js — Posicionamiento vertical de piezas internas
// Sin DOM. Lógica pura testeable.

import { normalizeName } from '../utils/normalize.js';
import { inferRole, isShoeRack } from './classifierService.js';
import { drawerRank } from './isoGeometryService.js';
import { VERTICAL_POSITIONS } from '../core/config.js';

export function determineVerticalZone(piece) {
  const role = inferRole(piece);
  if (role === 'drawer_face') return 'drawer';

  const n = normalizeName(piece?.nombre || '');
  const id = normalizeName(piece?.id || '');
  const text = `${n} ${id}`;

  if (isShoeRack(piece)) return 'fixed-bottom';

  if (
    text.includes('superior') ||
    text.includes('sup') ||
    text.includes('alto') ||
    text.includes('top')
  ) {
    return 'top';
  }

  if (
    text.includes('inferior') ||
    text.includes('inf') ||
    text.includes('bajo') ||
    text.includes('bottom')
  ) {
    return 'bottom';
  }

  const isShelfLike =
    n.includes('repisa') ||
    n.includes('estante') ||
    id.includes('repisa') ||
    id.includes('estante');
  if (isShelfLike && (n.includes('base') || id.includes('base'))) {
    return 'bottom';
  }

  if (
    text.includes('medio') ||
    text.includes('central') ||
    text.includes('centro')
  ) {
    return 'middle';
  }

  return 'middle';
}

function getPositioningHeight(piece, thickness) {
  const alto = Number(piece?.alto) || 0;
  const espesor = Number(piece?.espesor) || thickness || 15;
  return alto <= espesor * 1.5 ? alto : espesor;
}

/**
 * Devuelve la posición vertical por defecto (en mm desde el suelo) para una
 * pieza según su rol y palabras clave del nombre/id.
 *
 * - `baseOffset`: altura del borde inferior de la base (bottom_panel).
 * - `topPanelOffset`: altura del borde inferior de la tapa (top_panel).
 */
export function getDefaultVerticalPosition(
  piece,
  moduleH,
  thickness,
  overrides = {},
  baseOffset = 0,
  topPanelOffset = null
) {
  overrides = overrides || {};
  const n = normalizeName(piece?.nombre || '');
  const id = normalizeName(piece?.id || '');
  const text = `${n} ${id}`;
  const t = Number(thickness) || 15;
  const role = inferRole(piece);
  const h = Number(piece?.alto) || 0;

  const v = (key) => overrides[key] ?? VERTICAL_POSITIONS[key];
  const baseTop = baseOffset + t;
  const topLimit = Number.isFinite(topPanelOffset) ? topPanelOffset : moduleH - t;

  // Zapatero/zapatera: justo encima de la cara superior de la base.
  if (isShoeRack(piece)) return baseTop + v('shoeRackBaseOffset');

  if (role === 'bottom_panel') return baseOffset;
  if (role === 'top_panel') return topLimit;

  if (role === 'shelf') {
    if (
      text.includes('superior') ||
      text.includes('sup') ||
      text.includes('alto') ||
      text.includes('top')
    ) {
      return topLimit - v('shelfTopInset');
    }
    if (
      text.includes('inferior') ||
      text.includes('inf') ||
      text.includes('bajo') ||
      text.includes('bottom')
    ) {
      return baseTop + v('shelfBaseOffset');
    }
    return moduleH / 2;
  }

  if (role === 'hanger_rail') return v('hangerRailHeight');
  if (role === 'seat_panel') return v('seatHeight');

  if (role === 'drawer_face' || role === 'drawer_bottom') {
    return getDrawerDefaultPosition(piece, moduleH, t, overrides, baseTop, topLimit);
  }

  if (role === 'door') return getDoorDefaultPosition(piece, moduleH, t, overrides, baseTop, topLimit);
  if (role === 'brace') return getBraceDefaultPosition(piece, moduleH, t, overrides, baseTop, topLimit);

  // Espejo: cerca de la tapa.
  if (role === 'mirror') return topLimit - h - v('mirrorTopInset');

  return moduleH / 2;
}

function getDrawerDefaultPosition(piece, moduleH, t, overrides, baseTop, topLimit) {
  const h = Number(piece?.alto) || 0;
  const rank = drawerRank(piece);
  const v = (key) => overrides[key] ?? VERTICAL_POSITIONS[key];
  if (rank <= 10) return topLimit - h;
  if (rank >= 90) return baseTop + v('drawerBaseOffset');
  return (moduleH - h) / 2;
}

function getDoorDefaultPosition(piece, moduleH, t, overrides, baseTop, topLimit) {
  const h = Number(piece?.alto) || 0;
  const n = normalizeName(piece?.nombre || '');
  const id = normalizeName(piece?.id || '');
  const text = `${n} ${id}`;
  const v = (key) => overrides[key] ?? VERTICAL_POSITIONS[key];
  if (text.includes('superior') || text.includes('sup')) return topLimit - h - v('doorTopInset');
  if (text.includes('inferior') || text.includes('inf') || text.includes('bajo')) return baseTop + v('doorBaseOffset');
  return (moduleH - h) / 2;
}

function getBraceDefaultPosition(piece, moduleH, t, overrides, baseTop, topLimit) {
  const h = Number(piece?.alto) || 0;
  const n = normalizeName(piece?.nombre || '');
  const id = normalizeName(piece?.id || '');
  const text = `${n} ${id}`;
  const v = (key) => overrides[key] ?? VERTICAL_POSITIONS[key];
  if (text.includes('superior') || text.includes('sup')) return topLimit - h - v('braceTopInset');
  if (text.includes('inferior') || text.includes('inf') || text.includes('bajo')) return baseTop + v('braceBaseOffset');
  return (moduleH - h) / 2;
}

export function calculateVerticalPositions(moduleH, thickness, pieces, options = {}) {
  if (!pieces.length) return [];

  const overrides = options.overrides || {};
  const t = Number(thickness) || 15;
  const baseOffset = Number(options.baseOffset) || 0;
  const baseTop = baseOffset + t;
  const topPanelOffset = Number.isFinite(options.topPanelOffset)
    ? options.topPanelOffset
    : moduleH - t;

  const gap = options.gap ?? overrides.defaultGap ?? VERTICAL_POSITIONS.defaultGap;
  const firstInnerGap =
    options.firstInnerGap ??
    overrides.firstInnerGap ??
    VERTICAL_POSITIONS.firstInnerGap;
  const shoeRackBaseOffset =
    overrides.shoeRackBaseOffset ?? VERTICAL_POSITIONS.shoeRackBaseOffset;
  const shoeRackGap = overrides.shoeRackGap ?? VERTICAL_POSITIONS.shoeRackGap;
  const shelfMiddleGap = overrides.shelfMiddleGap ?? VERTICAL_POSITIONS.shelfMiddleGap;

  const items = pieces.map((piece) => {
    const zone = determineVerticalZone(piece);
    const hasPosZ = Number.isFinite(piece?.pos_z);
    const defaultY = hasPosZ
      ? piece.pos_z
      : getDefaultVerticalPosition(piece, moduleH, t, overrides, baseOffset, topPanelOffset);
    return {
      piece,
      h: getPositioningHeight(piece, t),
      zone,
      y: defaultY,
      hasPosZ,
    };
  });

  const topItems = items.filter((i) => i.zone === 'top');
  const bottomItems = items.filter((i) => i.zone === 'bottom');
  const fixedItems = items.filter((i) => i.zone === 'fixed-bottom');
  const middleItems = items.filter((i) => i.zone === 'middle');

  // Piezas 'top': se respetan los defaults y se apilan hacia abajo solo si hay solapamientos.
  let currentTop = topPanelOffset;
  topItems
    .slice()
    .sort((a, b) => b.y - a.y)
    .forEach((item) => {
      if (!item.hasPosZ) {
        item.y = Math.min(item.y, currentTop - item.h);
      }
      currentTop = item.y - gap;
    });

  // Piezas 'fixed-bottom' (zapatero): offset y gap propios.
  let currentFixed = baseTop + shoeRackBaseOffset;
  fixedItems
    .slice()
    .sort((a, b) => a.y - b.y)
    .forEach((item) => {
      if (!item.hasPosZ) {
        item.y = Math.max(item.y, currentFixed);
      }
      currentFixed = item.y + item.h + shoeRackGap;
    });

  // Piezas 'bottom': cerca de la base; si hay zapatero, se apilan encima de él.
  let currentBottom = fixedItems.length ? currentFixed : baseTop + firstInnerGap;
  bottomItems
    .slice()
    .sort((a, b) => a.y - b.y)
    .forEach((item) => {
      if (!item.hasPosZ) {
        item.y = Math.max(item.y, currentBottom);
      }
      currentBottom = item.y + item.h + gap;
    });

  // Piezas 'drawer' (frentes de cajón): apiladas consecutivamente desde la base,
  // zapatero o repisa inferior, usando drawerFaceGap.
  const drawerFaceGap = overrides.drawerFaceGap ?? VERTICAL_POSITIONS.drawerFaceGap;
  const drawerBaseOffset = overrides.drawerBaseOffset ?? VERTICAL_POSITIONS.drawerBaseOffset;
  const drawerItems = items.filter((i) => i.zone === 'drawer');
  let currentDrawer = bottomItems.length
    ? currentBottom
    : fixedItems.length
      ? currentFixed
      : baseTop + drawerBaseOffset;
  drawerItems
    .slice()
    .sort((a, b) => drawerRank(a.piece) - drawerRank(b.piece))
    .forEach((item) => {
      if (!item.hasPosZ) {
        item.y = Math.max(item.y, currentDrawer);
      }
      currentDrawer = item.y + item.h + drawerFaceGap;
    });

  // Piezas 'middle': apiladas consecutivamente desde la base, el último zapatero,
  // repisa inferior o frente de cajón hacia arriba, usando shelfMiddleGap.
  const middleTopEnd = topItems.length ? currentTop + gap : topPanelOffset - gap;
  const distributeItems = middleItems.filter((i) => !i.hasPosZ);
  const effectiveMiddleGap =
    options.gap ?? overrides.shelfMiddleGap ?? VERTICAL_POSITIONS.shelfMiddleGap;

  const middleBottomStart = bottomItems.length
    ? currentBottom
    : drawerItems.length
      ? currentDrawer
      : fixedItems.length
        ? currentFixed - shoeRackGap + effectiveMiddleGap
        : baseTop + firstInnerGap;

  // Ordenar de abajo hacia arriba para apilar de forma consecutiva.
  distributeItems.sort((a, b) => a.y - b.y);

  let currentMiddle = middleBottomStart;
  let lastMiddleTop = currentMiddle;
  distributeItems.forEach((item) => {
    item.y = currentMiddle;
    currentMiddle += item.h + effectiveMiddleGap;
    lastMiddleTop = item.y + item.h;
  });

  // Si el apilamiento excede el límite superior, comprimir uniformemente.
  if (distributeItems.length && lastMiddleTop > middleTopEnd) {
    const available = Math.max(0, middleTopEnd - middleBottomStart);
    const totalMiddleH = distributeItems.reduce((sum, i) => sum + i.h, 0);
    const compressedGap = distributeItems.length > 1
      ? Math.max(0, (available - totalMiddleH) / (distributeItems.length - 1))
      : 0;
    currentMiddle = middleBottomStart;
    distributeItems.forEach((item) => {
      item.y = currentMiddle;
      currentMiddle += item.h + compressedGap;
    });
  }

  return items;
}
