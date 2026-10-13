/**
 * Cotas y dimensiones del SVG isométrico: principales, offsets verticales,
 * piezas en vista explodida y línea de cota genérica.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 *
 * ctx: { s: textScale, projection: { scale, isoDepth, isoFlip }, overrides: verticalPositionOverrides }
 */

import {
  AXES_COLORS,
  COLORS,
  VERTICAL_POSITIONS,
  DEPENDENCY_STYLES,
  DIMENSION_COLORS,
  RISK_COLORS,
} from '../../../core/config.js';
import { isShoeRack } from '../../../services/classifierService.js';
import { isoProject, projectCuboid } from './isoProjection.js';

export function dimensionDefs(s) {
  const make = (id, fill) => `<marker id="${id}" markerWidth="${6 * s}" markerHeight="${6 * s}" refX="${5 * s}" refY="${3 * s}" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L6,3 L0,6 L1.5,3 z" fill="${fill}" />
    </marker>`;
  return `<defs>
    ${make('dimArrow', COLORS.textSecondary)}
    ${make('dimArrowX', AXES_COLORS.x)}
    ${make('dimArrowY', AXES_COLORS.y)}
    ${make('dimArrowZ', AXES_COLORS.z)}
  </defs>`;
}

export function drawDimensionLine(s, a, b, value, offX, offY, color = COLORS.textSecondary, markerId = 'dimArrow') {
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
    <text x="${mx.toFixed(1)}" y="${(my + dy).toFixed(1)}" text-anchor="middle" fill="${COLORS.textPrimary}" font-size="${fs.toFixed(1)}" font-family="monospace" font-weight="600">${text}</text>`;
}

export function drawDimensions(ctx, ox, oy, moduleW, moduleD, moduleH) {
  // Dimensiones en esquina superior derecha (proyección corregida).
  const tx = ox + (moduleW + moduleD * ctx.projection.isoDepth) * ctx.projection.scale + 10;
  const ty = oy - moduleH * ctx.projection.scale - 10;
  return `<text x="${tx}" y="${ty}" fill="${COLORS.textSecondary}" font-size="${(10 * ctx.s).toFixed(1)}" font-family="monospace">W=${moduleW} D=${moduleD} H=${moduleH}</text>`;
}

// Cotas globales del módulo: ancho (X), profundidad (Y) y alto (Z).
// - Ancho: se cambia de lado, ahora en la arista inferior frontal.
// - Profundidad: se mueve al frente, en la arista derecha frontal que recede hacia atrás.
// - Altura: se mantiene en la arista trasera derecha vertical.
export function drawMainDimensions(ctx, ox, oy, moduleW, moduleD, moduleH) {
  const s = ctx.s;
  const p0D0 = isoProject(ctx.projection, 0, moduleD, 0, ox, oy);        // inferior-izq-frontal
  const pW00 = isoProject(ctx.projection, moduleW, 0, 0, ox, oy);        // inferior-der-trasera
  const pWD0 = isoProject(ctx.projection, moduleW, moduleD, 0, ox, oy);  // inferior-der-frontal
  const pW0H = isoProject(ctx.projection, moduleW, 0, moduleH, ox, oy);    // superior-der-trasera
  let svg = '';
  // Ancho (X): arista inferior frontal
  svg += drawDimensionLine(s, p0D0, pWD0, Math.round(moduleW), 0, 18, AXES_COLORS.x, 'dimArrowX');
  // Profundidad (Y): arista derecha frontal que recede hacia la trasera
  svg += drawDimensionLine(s, pWD0, pW00, Math.round(moduleD), 18, 0, AXES_COLORS.y, 'dimArrowY');
  // Alto (Z): arista trasera derecha vertical
  svg += drawDimensionLine(s, pW00, pW0H, Math.round(moduleH), 28, 0, AXES_COLORS.z, 'dimArrowZ');
  return svg;
}

// Cotas de offsets verticales en vista normal.
export function drawVerticalOffsetDimensions(ctx, geometries, ox, oy, moduleW, moduleD, moduleH, thickness) {
  const s = ctx.s;
  const bottom = geometries.find((g) => g.role === 'bottom_panel');
  const top = geometries.find((g) => g.role === 'top_panel');
  const t = Number(thickness) || 15;
  const overrides = ctx.overrides || {};
  const v = (key) => overrides[key] ?? VERTICAL_POSITIONS[key];

  const baseBottom = bottom ? bottom.z : 0;
  const baseTop = baseBottom + t;
  const topBottom = top ? top.z : moduleH - t;

  let svg = '';
  let currentOffX = 55;

  const drawSegment = (z1, z2, value, color, label) => {
    if (value <= 0) return '';
    const p1 = isoProject(ctx.projection, moduleW, 0, z1, ox, oy);
    const p2 = isoProject(ctx.projection, moduleW, 0, z2, ox, oy);
    const line = drawDimensionLine(s, p1, p2, Math.round(value), currentOffX, 0, color, 'dimArrow');
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
  svg += drawSegment(0, baseBottom, baseBottom, DIMENSION_COLORS.arrow, 'bottomPanelOffset');

  // Zapateros: offset desde la base + gaps.
  const shoeRacks = geometries.filter(
    (g) => g.role === 'shelf' && isShoeRack({ nombre: g.name, id: g.id })
  );
  svg += drawGapStack(shoeRacks, RISK_COLORS.success);

  // Repisas (no zapateros): offset desde la base + gaps.
  const shelves = geometries.filter(
    (g) => g.role === 'shelf' && !isShoeRack({ nombre: g.name, id: g.id })
  );
  svg += drawGapStack(shelves, COLORS.strokeActive);

  // Frentes de cajón: offset desde la base + gaps.
  const drawers = geometries.filter((g) => g.role === 'drawer_face');
  svg += drawGapStack(drawers, DIMENSION_COLORS.arrow);

  // Puertas: base offset, top inset y gap entre puertas.
  const doors = geometries.filter((g) => g.role === 'door').sort((a, b) => a.z - b.z);
  if (doors.length) {
    const doorBaseOffset = doors[0].z - baseTop;
    if (doorBaseOffset > 0) {
      svg += drawSegment(baseTop, doors[0].z, doorBaseOffset, DEPENDENCY_STYLES.accesorio.color, 'doorBaseOffset');
    }
    for (let i = 1; i < doors.length; i++) {
      const prev = doors[i - 1];
      const gap = doors[i].x - (prev.x + prev.w);
      if (gap > 0) {
        // Cota horizontal de gap entre puertas (en arista superior trasera).
        const p1 = isoProject(ctx.projection, prev.x + prev.w, 0, topBottom, ox, oy);
        const p2 = isoProject(ctx.projection, doors[i].x, 0, topBottom, ox, oy);
        svg += drawDimensionLine(s, p1, p2, Math.round(gap), 0, -18, DEPENDENCY_STYLES.accesorio.color, 'dimArrow');
      }
    }
    const doorTopInset = v('doorTopInset');
    if (doorTopInset > 0) {
      svg += drawSegment(topBottom - doorTopInset, topBottom, doorTopInset, DEPENDENCY_STYLES.accesorio.color, 'doorTopInset');
    }
  }

  // Travesaños: base offset y top inset.
  const braces = geometries.filter((g) => g.role === 'brace').sort((a, b) => a.z - b.z);
  if (braces.length) {
    const braceBaseOffset = braces[0].z - baseTop;
    if (braceBaseOffset > 0) {
      svg += drawSegment(baseTop, braces[0].z, braceBaseOffset, COLORS.textSecondary, 'braceBaseOffset');
    }
    const topInsetValue = v('topInset');
    if (topInsetValue > 0) {
      svg += drawSegment(topBottom - topInsetValue, topBottom, topInsetValue, COLORS.textSecondary, 'topInset');
    }
  }

  // Espejo: inset desde tapa.
  if (geometries.some((g) => g.role === 'mirror')) {
    const topInsetValue = v('topInset');
    svg += drawSegment(topBottom - topInsetValue, topBottom, topInsetValue, DEPENDENCY_STYLES.interior.color, 'topInset');
  }

  return svg;
}

// Cotas de piezas en vista explodida.
export function drawExplodedDimensions(ctx, geometries, ox, oy) {
  if (ctx.explodeFactor <= 0) return '';
  const minPieceDim = 40;
  return geometries
    .filter((g) => Math.max(g.w || 0, g.d || 0, g.h || 0) >= minPieceDim && g.role !== 'handle')
    .map((g) => drawPieceDimensions(ctx, g, ox, oy))
    .join('');
}

export function drawPieceDimensions(ctx, geo, ox, oy) {
  const { projected } = projectCuboid(ctx.projection, geo, ox, oy);
  const p2 = projected[2];
  const p5 = projected[5];
  const p6 = projected[6];
  const p7 = projected[7];
  if (!p2 || !p5 || !p6 || !p7) return '';
  const minDim = 40;
  let svg = '';
  // Ancho (X): arista frontal superior 7 -> 6
  if (geo.w >= minDim) svg += drawDimensionLine(ctx.s, p7, p6, Math.round(geo.w), -8, -8);
  // Profundidad (Y): arista superior derecha 5 -> 6
  if (geo.d >= minDim) svg += drawDimensionLine(ctx.s, p5, p6, Math.round(geo.d), 8, -8);
  // Alto (Z): arista frontal derecha vertical 2 -> 6
  if (geo.h >= minDim) svg += drawDimensionLine(ctx.s, p2, p6, Math.round(geo.h), 8, 0);
  return svg;
}
