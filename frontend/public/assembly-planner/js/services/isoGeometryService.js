// js/services/isoGeometryService.js — Inferencia y transformaciones geométricas puras
// para el renderizador isométrico. Sin DOM, sin SVG.

import { normalizeName } from '../utils/normalize.js';
import { inferRole, isDividerVertical } from './classifierService.js';
import { VERTICAL_POSITIONS } from '../core/config.js';

export function getModuleDepth(pieces) {
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

export function inferThickness(pieces) {
  const first = pieces.find((p) => Number(p.espesor) > 0);
  return first ? Number(first.espesor) : 15;
}

export function drawerRank(piece) {
  const n = normalizeName(piece.nombre);
  const id = normalizeName(piece.id);
  if (n.includes('superior') || n.includes('sup') || id.includes('sup')) return 0;
  if (n.includes('medio')) return 50;
  if (n.includes('inferior') || n.includes('inf') || id.includes('inf')) return 100;
  return 50;
}

export function applyDoorRotation(geo, doorAngle = 0) {
  if (!doorAngle) return geo;
  const angle = (doorAngle * Math.PI) / 180;
  const offset = Math.sin(angle) * geo.h;
  const newDepth = Math.cos(angle) * geo.d + Math.abs(offset);
  return {
    ...geo,
    x: geo.x - offset * 0.5,
    y: geo.y + offset,
    d: newDepth,
  };
}

export function applyExplode(geometries, moduleW, moduleD, moduleH, explodeFactor = 0) {
  if (!explodeFactor) return geometries;
  const cx = moduleW / 2;
  const cy = moduleD / 2;
  const cz = moduleH / 2;
  return geometries.map((geo) => {
    const dx = (geo.x + geo.w / 2 - cx) * explodeFactor;
    const dy = (geo.y + geo.d / 2 - cy) * explodeFactor;
    const dz = (geo.z + geo.h / 2 - cz) * explodeFactor;
    return {
      ...geo,
      x: geo.x + dx,
      y: geo.y + dy,
      z: geo.z + dz,
    };
  });
}

export function calculateVerticalZones(
  moduleH,
  thickness,
  shelfPositions = [],
  hasBottom = false,
  hasTop = false,
  baseOffset = 0,
  topPanelOffset = null
) {
  const zones = [];
  const sorted = [...shelfPositions].sort((a, b) => a.y - b.y);
  const baseTop = baseOffset + (hasBottom ? thickness : 0);
  const topLimit = Number.isFinite(topPanelOffset) ? topPanelOffset : (hasTop ? moduleH - thickness : moduleH);
  let yStart = baseTop;
  sorted.forEach((sp) => {
    zones.push({ yStart, yEnd: sp.y });
    yStart = sp.y + sp.h;
  });
  zones.push({ yStart, yEnd: topLimit });
  return zones;
}

export function groupDividersIntoZones(dividers, zones) {
  if (!zones.length) return [];
  const groups = zones.map((zone) => ({ zone, dividers: [] }));
  const unassigned = [];

  dividers.forEach((div) => {
    const text = `${normalizeName(div.nombre)} ${normalizeName(div.id)}`;
    let idx = -1;
    if (text.includes('inf') || text.includes('inferior')) idx = 0;
    else if (text.includes('med') || text.includes('medio')) idx = 1;
    else if (text.includes('sup') || text.includes('superior')) idx = zones.length - 1;

    if (idx >= 0 && idx < zones.length) {
      groups[idx].dividers.push(div);
    } else {
      unassigned.push(div);
    }
  });

  while (unassigned.length) {
    groups.sort((a, b) => a.dividers.length - b.dividers.length);
    groups[0].dividers.push(unassigned.shift());
  }

  return groups.filter((g) => g.dividers.length);
}

export function distributeHorizontally(count, moduleW, sideWidth) {
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

export function inferDividerX(div, moduleW, thickness) {
  const t = Number(thickness) || 15;
  const n = normalizeName(div.nombre);
  const id = normalizeName(div.id);
  const vertical = isDividerVertical(div);
  const divW = vertical ? t : Number(div.ancho || t);

  if (n.includes('central') || n.includes('centro') || id.includes('central') || id.includes('centro')) {
    return (moduleW - divW) / 2;
  }
  if (n.includes('izquierdo') || n.includes('izq') || id.includes('izquierdo') || id.includes('izq')) {
    return t;
  }
  if (n.includes('derecho') || n.includes('der') || id.includes('derecho') || id.includes('der')) {
    return moduleW - divW - t;
  }

  // Los divisores verticales sin otra indicación se centran entre laterales.
  if (vertical) return (moduleW - divW) / 2;

  const m = (id.match(/(\d+)/) || n.match(/(\d+)/) || [null, 1])[1];
  const idx = parseInt(m, 10);
  return (moduleW * idx) / 10;
}

/**
 * Calcula los vanos (bays) interiores de un módulo a partir de los laterales
 * y los divisores verticales. Cada bay es { left, right } usando las caras
 * interiores de los elementos verticales.
 */
export function computeBays(dividers, moduleW, thickness) {
  const t = Number(thickness) || 15;
  const panels = [
    { left: 0, right: t },
    { left: moduleW - t, right: moduleW },
  ];
  (dividers || [])
    .filter((d) => isDividerVertical(d))
    .forEach((d) => {
      const x = inferDividerX(d, moduleW, t);
      panels.push({ left: x, right: x + t });
    });
  panels.sort((a, b) => a.left - b.left);

  const bays = [];
  for (let i = 0; i < panels.length - 1; i++) {
    const left = panels[i].right;
    const right = panels[i + 1].left;
    if (right > left) bays.push({ left, right });
  }
  return bays;
}

/**
 * Asigna una pieza horizontal a un vano según palabras clave en nombre/id.
 * Devuelve el índice del bay (0 = izquierdo, último = derecho) o null si no
 * tiene marca lateral, en cuyo caso se debe replicar en todos los vanos.
 */
export function inferShelfBayIndex(piece, bays) {
  if (!bays || bays.length <= 1) return null;
  const n = normalizeName(piece.nombre);
  const id = normalizeName(piece.id);
  const text = `${n} ${id}`;
  if (text.includes('izquierdo') || text.includes('izq')) return 0;
  if (text.includes('derecho') || text.includes('der')) return bays.length - 1;
  if (text.includes('central') || text.includes('centro')) return Math.floor(bays.length / 2);
  return null;
}

export function inferDoorX(door, moduleW, doorW, thickness) {
  const n = normalizeName(door.nombre);
  if (n.includes('izquierda') || n.includes('izq')) return thickness;
  if (n.includes('derecha') || n.includes('der')) return moduleW - doorW - thickness;
  return (moduleW - doorW) / 2;
}

export function inferDoorZ(
  door,
  moduleH,
  doorH,
  thickness,
  overrides = {},
  topPanelOffset = null,
  baseOffset = 0
) {
  if (Number.isFinite(door?.pos_z)) return door.pos_z;
  const v = (key) => overrides[key] ?? VERTICAL_POSITIONS[key];
  const n = normalizeName(door.nombre);
  const t = Number(thickness) || 15;
  const topLimit = Number.isFinite(topPanelOffset) ? topPanelOffset : moduleH - t;
  const baseTop = baseOffset + t;
  if (n.includes('superior') || n.includes('sup')) return topLimit - doorH - v('doorTopInset');
  if (n.includes('inferior') || n.includes('inf')) return baseTop + v('doorBaseOffset');
  return (moduleH - doorH) / 2;
}

export function inferRailZ(rail, moduleH, railH, thickness) {
  if (Number.isFinite(rail?.pos_z)) return rail.pos_z;
  const n = normalizeName(rail.nombre);
  const m = n.match(/(\d+)/);
  if (m) {
    const idx = parseInt(m[1], 10);
    return thickness + (idx * (moduleH - 2 * thickness)) / 4;
  }
  return moduleH / 2;
}

export function inferBraceX(brace, moduleW, braceW, thickness) {
  const n = normalizeName(brace.nombre);
  if (n.includes('trasero') || n.includes('atras')) return thickness;
  if (n.includes('frontal') || n.includes('frente')) return moduleW - braceW - thickness;
  return (moduleW - braceW) / 2;
}

export function inferBraceZ(
  brace,
  moduleH,
  braceH,
  thickness,
  overrides = {},
  topPanelOffset = null,
  baseOffset = 0
) {
  if (Number.isFinite(brace?.pos_z)) return brace.pos_z;
  const v = (key) => overrides[key] ?? VERTICAL_POSITIONS[key];
  const n = normalizeName(brace.nombre);
  const t = Number(thickness) || 15;
  const topLimit = Number.isFinite(topPanelOffset) ? topPanelOffset : moduleH - t;
  const baseTop = baseOffset + t;
  if (n.includes('superior') || n.includes('sup')) return topLimit - braceH - v('topInset');
  if (n.includes('inferior') || n.includes('inf')) return baseTop + v('braceBaseOffset');
  return (moduleH - braceH) / 2;
}

export function inferLegX(leg, moduleW, legW, overrides = {}) {
  const offset = overrides.legOffsetX ?? VERTICAL_POSITIONS.legOffsetX;
  const n = normalizeName(leg.nombre);
  const id = normalizeName(leg.id);
  const hasLeft = n.includes('izquierdo') || n.includes('izq') || id.includes('izq');
  const hasRight = n.includes('derecho') || n.includes('der') || id.includes('der');
  const hasFront = n.includes('front') || n.includes('delanter') || id.includes('front');
  const hasBack = n.includes('back') || n.includes('tras') || n.includes('posterior') || id.includes('back');

  if (hasLeft) return offset;
  if (hasRight) return moduleW - legW - offset;
  if (hasFront || hasBack) return moduleW / 2 - legW / 2;
  return moduleW / 2 - legW / 2;
}

export function inferLegY(leg, moduleD, legW, overrides = {}) {
  const offset = overrides.legOffsetY ?? VERTICAL_POSITIONS.legOffsetY;
  const n = normalizeName(leg.nombre);
  const id = normalizeName(leg.id);
  const hasFront = n.includes('front') || n.includes('delanter') || id.includes('front');
  const hasBack = n.includes('back') || n.includes('tras') || n.includes('posterior') || id.includes('back');

  if (hasBack) return offset;
  if (hasFront) return moduleD - legW - offset;
  return moduleD - legW - offset;
}

export function shouldShowLabel(geo, projectedPoints) {
  let area = 0;
  for (let i = 0; i < projectedPoints.length; i++) {
    const j = (i + 1) % projectedPoints.length;
    area += projectedPoints[i].x * projectedPoints[j].y - projectedPoints[j].x * projectedPoints[i].y;
  }
  area = Math.abs(area) / 2;
  const minArea = geo.role === 'drawer_face' || geo.role === 'door' ? 1500 : 2500;
  return area > minArea;
}
