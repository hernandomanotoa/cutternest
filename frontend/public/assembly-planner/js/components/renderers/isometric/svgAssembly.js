/**
 * Ensamblado del SVG completo: título, polígonos ordenados por profundidad,
 * inserción de ejes, cotas y subtítulo de dimensiones.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 *
 * ctx: { s: textScale, labelMode, showAxes, showDimensions, explodeFactor,
 *        padding, projection, overrides }
 */

import { COLORS } from '../../../core/config.js';
import { escapeHtml } from '../../../utils/helpers.js';
import { drawAxes } from './axesLegend.js';
import {
  dimensionDefs,
  drawDimensions,
  drawExplodedDimensions,
  drawMainDimensions,
  drawVerticalOffsetDimensions,
} from './dimensions.js';
import { buildPieceSvg } from './pieceSvg.js';
import { getZIndex } from './pieceStyling.js';

export function buildSVG(ctx, geometries, viewBox, ox, oy, axesSpace, moduleLabel, moduleW, moduleD, moduleH, isAllView = false, thickness = 15) {
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
    if (!axesInserted && ctx.showAxes && getZIndex(geo.role) > 2) {
      polygons.push(drawAxes(ctx.padding, ctx.s, vbW, vbH, axesSpace));
      axesInserted = true;
    }

    const piece = buildPieceSvg(ctx, geo, ox, oy);
    polygons.push(...piece.polygons);
    labels.push(...piece.labels);
  });

  if (ctx.showAxes && !axesInserted) {
    polygons.push(drawAxes(ctx.padding, ctx.s, vbW, vbH, axesSpace));
  }

  let extra = '';
  const showDims = ctx.showDimensions && !isAllView;
  if (showDims) {
    const dims = drawDimensions(ctx, ox, oy, moduleW, moduleD, moduleH);
    const mainDims = ctx.explodeFactor <= 0 ? drawMainDimensions(ctx, ox, oy, moduleW, moduleD, moduleH) : '';
    const offsetDims = ctx.explodeFactor <= 0 ? drawVerticalOffsetDimensions(ctx, geometries, ox, oy, moduleW, moduleD, moduleH, thickness) : '';
    const pieceDims = ctx.explodeFactor > 0 ? drawExplodedDimensions(ctx, geometries, ox, oy) : '';
    extra = dimensionDefs(ctx.s) + dims + mainDims + offsetDims + pieceDims;
  }

  const titleSize = 16 * ctx.s;
  const subtitleSize = 11 * ctx.s;
  const titleY = 28 * ctx.s;
  const subtitleY = 50 * ctx.s;

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
