/**
 * Leyenda de ejes (X ancho / Y profundidad / Z alto) en el SVG.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { AXES_COLORS } from '../../../core/config.js';

export function drawAxes(padding, textScale, viewW, viewH, axesSpace) {
  // Leyenda de ejes en un área reservada debajo del dibujo del módulo.
  const ox = padding + 16;
  const oy = viewH - Math.max(16, axesSpace / 2);
  const len = 28;
  const xTip = { x: ox + len, y: oy };
  const yTip = { x: ox + len * 0.5, y: oy + len * 0.5 };
  const zTip = { x: ox, y: oy - len };

  return `
    <g opacity="0.9">
      <line x1="${ox}" y1="${oy}" x2="${xTip.x}" y2="${xTip.y}" stroke="${AXES_COLORS.x}" stroke-width="2" />
      <text x="${xTip.x + 5}" y="${xTip.y + 4}" fill="${AXES_COLORS.x}" font-size="${(11 * textScale).toFixed(1)}" font-weight="bold" text-anchor="start">X (ancho)</text>
      <line x1="${ox}" y1="${oy}" x2="${yTip.x}" y2="${yTip.y}" stroke="${AXES_COLORS.y}" stroke-width="2" />
      <text x="${yTip.x + 5}" y="${yTip.y + 4}" fill="${AXES_COLORS.y}" font-size="${(11 * textScale).toFixed(1)}" font-weight="bold" text-anchor="start">Y (prof.)</text>
      <line x1="${ox}" y1="${oy}" x2="${zTip.x}" y2="${zTip.y}" stroke="${AXES_COLORS.z}" stroke-width="2" />
      <text x="${zTip.x}" y="${zTip.y - 5}" fill="${AXES_COLORS.z}" font-size="${(11 * textScale).toFixed(1)}" font-weight="bold" text-anchor="middle">Z (alto)</text>
    </g>`;
}
