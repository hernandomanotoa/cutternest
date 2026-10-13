/**
 * Construcción del SVG de una pieza: polígonos de caras + etiqueta.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 *
 * ctx: { s: textScale, labelMode, projection }
 * Devuelve { polygons: string[], labels: string[] }.
 */

import { COLORS, ROLE_COLORS } from '../../../core/config.js';
import { shouldShowLabel } from '../../../services/isoGeometryService.js';
import { escapeHtml } from '../../../utils/helpers.js';
import { polygonArea, projectCuboid } from './isoProjection.js';
import { getFaceColors, getStroke, makeLabel } from './pieceStyling.js';

export function buildPieceSvg(ctx, geo, ox, oy) {
  const { projected, faces } = projectCuboid(ctx.projection, geo, ox, oy);
  const colors = getFaceColors(geo.color || ROLE_COLORS.wood);
  const stroke = getStroke(geo.role);
  const opacity = geo.opacity ?? 1;

  const polygons = [];
  const labels = [];

  faces.forEach((face) => {
    if (polygonArea(projected, face.indices) < 0.5) return;
    const pts = face.indices.map((i) => `${projected[i].x},${projected[i].y}`).join(' ');
    polygons.push(
      `<polygon points="${pts}" fill="${colors[face.name]}" stroke="${stroke.color}" stroke-width="${stroke.width}" opacity="${opacity}" data-piece-id="${escapeHtml(geo.id || '')}" />`
    );
  });

  // Etiqueta en cara frontal (la última de faces es frontal)
  if (ctx.labelMode !== 'none') {
    const label = makeLabel(geo);
    const frontPts = faces.find((f) => f.name === 'front')?.indices.map((i) => projected[i]);
    if (label && frontPts && shouldShowLabel(geo, frontPts)) {
      const cx = frontPts.reduce((s, p) => s + p.x, 0) / frontPts.length;
      const cy = frontPts.reduce((s, p) => s + p.y, 0) / frontPts.length;
      labels.push(
        `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${COLORS.textDark}" font-size="${(9 * ctx.s).toFixed(1)}" font-weight="600" font-family="system-ui,sans-serif" pointer-events="none">${escapeHtml(label)}</text>`
      );
    }
  }

  return { polygons, labels };
}
