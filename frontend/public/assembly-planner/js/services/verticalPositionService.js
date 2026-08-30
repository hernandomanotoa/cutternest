// js/services/verticalPositionService.js — Posicionamiento vertical de piezas internas
// Sin DOM. Lógica pura testeable.

import { normalizeName } from '../utils/normalize.js';
import { inferRole, isShoeRack } from './classifierService.js';
import { drawerRank } from './isoGeometryService.js';
import { VERTICAL_POSITIONS } from '../core/config.js';
import { getPieceOffsetConfig, getPieceZone } from './pieceOffsetService.js';

export function determineVerticalZone(piece) {
  return getPieceZone(piece);
}

function getPositioningHeight(piece, thickness) {
  const alto = Number(piece?.alto) || 0;
  const espesor = Number(piece?.espesor) || thickness || 15;
  return alto <= espesor * 1.5 ? alto : espesor;
}

function cfgFor(piece, zone, overrides, pieceOffsets) {
  return getPieceOffsetConfig(
    piece,
    zone,
    { pieceOffsets },
    overrides
  );
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
  topPanelOffset = null,
  pieceOffsets = {}
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
  const zone = determineVerticalZone(piece);
  const cfg = cfgFor(piece, zone, overrides, pieceOffsets);

  // Zapatero/zapatera: justo encima de la cara superior de la base.
  if (isShoeRack(piece)) return baseTop + cfg.offset;

  if (role === 'bottom_panel') return baseOffset;
  if (role === 'top_panel') return topLimit;

  if (role === 'shelf') {
    if (zone === 'top') return topLimit - cfg.offset;
    if (zone === 'bottom') return baseTop + cfg.offset;
    // middle: el apilamiento decide; usamos el centro como posición inicial.
    return moduleH / 2;
  }

  if (role === 'hanger_rail') return cfg.offset;
  if (role === 'seat_panel') return cfg.offset;

  if (role === 'drawer_face' || role === 'drawer_bottom') {
    return getDrawerDefaultPosition(piece, moduleH, t, cfg, baseTop, topLimit);
  }

  if (role === 'door') return getDoorDefaultPosition(piece, moduleH, t, cfg, baseTop, topLimit);
  if (role === 'brace') return getBraceDefaultPosition(piece, moduleH, t, cfg, baseTop, topLimit);

  // Espejo: cerca de la tapa.
  if (role === 'mirror') return topLimit - h - cfg.offset;

  return moduleH / 2;
}

function getDrawerDefaultPosition(piece, moduleH, t, cfg, baseTop, topLimit) {
  const h = Number(piece?.alto) || 0;
  const rank = drawerRank(piece);
  if (rank <= 10) return topLimit - h;
  if (rank >= 90) return baseTop + cfg.offset;
  return (moduleH - h) / 2;
}

function getDoorDefaultPosition(piece, moduleH, t, cfg, baseTop, topLimit) {
  const h = Number(piece?.alto) || 0;
  const n = normalizeName(piece?.nombre || '');
  const id = normalizeName(piece?.id || '');
  const text = `${n} ${id}`;
  if (text.includes('superior') || text.includes('sup')) return topLimit - h - cfg.offset;
  if (text.includes('inferior') || text.includes('inf') || text.includes('bajo')) return baseTop + cfg.offset;
  return (moduleH - h) / 2;
}

function getBraceDefaultPosition(piece, moduleH, t, cfg, baseTop, topLimit) {
  const h = Number(piece?.alto) || 0;
  const n = normalizeName(piece?.nombre || '');
  const id = normalizeName(piece?.id || '');
  const text = `${n} ${id}`;
  if (text.includes('superior') || text.includes('sup')) return topLimit - h - cfg.offset;
  if (text.includes('inferior') || text.includes('inf') || text.includes('bajo')) return baseTop + cfg.offset;
  return (moduleH - h) / 2;
}

/**
 * Devuelve el límite superior para un divisor vertical: la cara inferior de la
 * repisa superior más alta, o el borde inferior de la tapa si no hay repisa superior.
 */
export function findTopShelfLimit(shelfPositions = [], topPanelOffset = null) {
  const topShelves = (shelfPositions || []).filter((sp) => {
    const text = `${normalizeName(sp.piece?.nombre || '')} ${normalizeName(sp.piece?.id || '')}`;
    return text.includes('superior') || text.includes('sup') || sp.zone === 'top';
  });
  if (topShelves.length) {
    return topShelves.slice().sort((a, b) => b.y - a.y)[0].y;
  }
  return topPanelOffset;
}

export function calculateVerticalPositions(moduleH, thickness, pieces, options = {}) {
  if (!pieces.length) return [];

  const overrides = options.overrides || {};
  const pieceOffsets = options.pieceOffsets || {};
  const t = Number(thickness) || 15;
  const baseOffset = Number(options.baseOffset) || 0;
  const baseTop = baseOffset + t;
  const topPanelOffset = Number.isFinite(options.topPanelOffset)
    ? options.topPanelOffset
    : moduleH - t;

  function v(key) {
    return overrides[key] ?? VERTICAL_POSITIONS[key];
  }

  const items = pieces.map((piece) => {
    const zone = determineVerticalZone(piece);
    const cfg = cfgFor(piece, zone, overrides, pieceOffsets);
    const hasPosZ = Number.isFinite(piece?.pos_z);
    const defaultY = hasPosZ
      ? piece.pos_z
      : getDefaultVerticalPosition(piece, moduleH, t, overrides, baseOffset, topPanelOffset, pieceOffsets);
    return {
      piece,
      h: getPositioningHeight(piece, t),
      zone,
      y: defaultY,
      hasPosZ,
      cfg,
    };
  });

  const topItems = items.filter((i) => i.zone === 'top');
  const bottomItems = items.filter((i) => i.zone === 'bottom');
  const fixedItems = items.filter((i) => i.zone === 'fixed-bottom');
  const drawerItems = items.filter((i) => i.zone === 'drawer');
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
      const gap = Number.isFinite(item.cfg.gap) ? item.cfg.gap : v('stackGap');
      currentTop = item.y - gap;
    });

  // Helper genérico para apilar piezas fijas inferiores (zapateros) con un offset
  // desde la cara superior de la base y un gap constante entre ellas.
  function stackFixedBottom(items) {
    if (!items.length) return baseTop;
    const first = items[0];
    let cursor = baseTop + first.cfg.offset;
    items
      .slice()
      .sort((a, b) => a.y - b.y)
      .forEach((item) => {
        if (!item.hasPosZ) {
          item.y = Math.max(item.y, cursor);
        }
        const gap = Number.isFinite(item.cfg.gap) ? item.cfg.gap : v('stackGap');
        cursor = item.y + item.h + gap;
      });
    return cursor;
  }

  // Piezas 'fixed-bottom' (zapatero): offset y gap propios.
  const currentFixed = fixedItems.length
    ? stackFixedBottom(fixedItems)
    : baseTop + (fixedItems[0]?.cfg.offset ?? v('baseTopGap'));

  // Piezas 'bottom': cerca de la base; si hay zapatero, se apilan encima de él.
  let currentBottom;
  if (bottomItems.length) {
    const firstBottom = bottomItems.slice().sort((a, b) => a.y - b.y)[0];
    currentBottom = fixedItems.length
      ? currentFixed
      : baseTop + firstBottom.cfg.offset;
  } else {
    currentBottom = fixedItems.length ? currentFixed : baseTop + v('baseTopGap');
  }
  bottomItems
    .slice()
    .sort((a, b) => a.y - b.y)
    .forEach((item) => {
      if (!item.hasPosZ) {
        item.y = Math.max(item.y, currentBottom);
      }
      const gap = Number.isFinite(item.cfg.gap) ? item.cfg.gap : v('stackGap');
      currentBottom = item.y + item.h + gap;
    });

  // Piezas 'drawer' (frentes de cajón): apiladas consecutivamente desde la base,
  // zapatero o repisa inferior.
  let currentDrawer;
  if (drawerItems.length) {
    const firstDrawer = drawerItems.slice().sort((a, b) => drawerRank(a.piece) - drawerRank(b.piece))[0];
    currentDrawer = bottomItems.length
      ? currentBottom
      : fixedItems.length
        ? currentFixed
        : baseTop + firstDrawer.cfg.offset;
  } else {
    currentDrawer = bottomItems.length
      ? currentBottom
      : fixedItems.length
        ? currentFixed
        : baseTop + v('drawerBaseOffset');
  }
  drawerItems
    .slice()
    .sort((a, b) => drawerRank(a.piece) - drawerRank(b.piece))
    .forEach((item) => {
      if (!item.hasPosZ) {
        item.y = Math.max(item.y, currentDrawer);
      }
      const gap = Number.isFinite(item.cfg.gap) ? item.cfg.gap : v('stackGap');
      currentDrawer = item.y + item.h + gap;
    });

  // Piezas 'middle': apiladas consecutivamente desde la base, el último zapatero,
  // repisa inferior o frente de cajón hacia arriba.
  const distributeItems = middleItems.filter((i) => !i.hasPosZ);
  const topGap = topItems.length
    ? (topItems[topItems.length - 1]?.cfg.gap ?? v('stackGap'))
    : v('stackGap');
  const middleTopEnd = topItems.length ? currentTop + topGap : topPanelOffset - topGap;

  let middleBottomStart;
  if (distributeItems.length) {
    const firstMiddle = distributeItems.slice().sort((a, b) => a.y - b.y)[0];
    if (bottomItems.length) {
      middleBottomStart = currentBottom;
    } else if (drawerItems.length) {
      middleBottomStart = currentDrawer;
    } else if (fixedItems.length) {
      const lastFixedGap = fixedItems[fixedItems.length - 1]?.cfg.gap ?? v('stackGap');
      middleBottomStart = currentFixed - lastFixedGap + firstMiddle.cfg.gap;
    } else {
      middleBottomStart = baseTop + firstMiddle.cfg.offset;
    }
  } else {
    middleBottomStart = bottomItems.length
      ? currentBottom
      : drawerItems.length
        ? currentDrawer
        : fixedItems.length
          ? currentFixed - v('stackGap') + v('stackGap')
          : baseTop + v('baseTopGap');
  }

  // Ordenar de abajo hacia arriba para apilar de forma consecutiva.
  distributeItems.sort((a, b) => a.y - b.y);

  let currentMiddle = middleBottomStart;
  let lastMiddleTop = currentMiddle;
  distributeItems.forEach((item) => {
    item.y = currentMiddle;
    const gap = Number.isFinite(item.cfg.gap) ? item.cfg.gap : v('stackGap');
    currentMiddle += item.h + gap;
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
