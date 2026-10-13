/**
 * Geometría de divisores (montantes verticales y paneles intermedios
 * horizontales), con recorte a vanos y topes por repisa superior.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { inferRole, isDividerVertical } from '../../../services/classifierService.js';
import { getPieceDims } from '../../../services/geometryService.js';
import {
  calculateVerticalZones,
  groupDividersIntoZones,
  inferDividerX,
} from '../../../services/isoGeometryService.js';
import { findTopShelfLimit } from '../../../services/verticalPositionService.js';
import { getPieceOffsetConfig } from '../../../services/pieceOffsetService.js';

export function buildDividerGeometries(renderer, dividers, moduleW, moduleD, moduleH, thickness, shelfPositions, top, bottom, backThickness = 0, bottomPanelOffset = 0, topPanelOffset = null) {
  const geometries = [];
  if (!dividers.length) return geometries;

  const depthOffset = backThickness;
  const interiorDepth = Math.max(0, moduleD - backThickness);
  const t = Number(thickness) || 15;
  const baseTop = bottomPanelOffset + t;
  const topLimit = Number.isFinite(topPanelOffset) ? topPanelOffset : moduleH - t;

  // Divisores verticales (montantes) se dibujan desde la cara superior de la
  // base hasta la cara inferior de la repisa superior (o tapa), respetando
  // offset inferior e inset superior configurables por pieza.
  // Divisores horizontales se tratan como paneles intermedios y se colocan
  // en la zona correspondiente.
  const vertical = [];
  const horizontal = [];
  dividers.forEach((div) => {
    const dims = getPieceDims(div, 'divider', thickness, 'cabinet');
    if (isDividerVertical(div)) vertical.push({ div, dims });
    else horizontal.push({ div, dims });
  });

  vertical.forEach(({ div, dims }) => {
    const divW = dims.w || t;
    const x = Math.max(t, Math.min(inferDividerX(div, moduleW, t), moduleW - t - divW));
    const cfg = getPieceOffsetConfig(
      div,
      undefined,
      { pieceOffsets: renderer.verticalPositionOverrides?.pieceOffsets },
      {}
    );
    const bottomOffset = Number.isFinite(cfg.offset) ? cfg.offset : 0;
    const topInset = Number.isFinite(cfg.gap) ? cfg.gap : 0;
    const z = baseTop + bottomOffset;
    // Se respeta el alto de la pieza, sin pasar por encima de la repisa
    // superior (o tapa) que haya encima del divisor.
    const dividerTopLimit = findTopShelfLimit(shelfPositions, topLimit) - topInset;
    const availableH = Math.max(0, dividerTopLimit - z);
    const requestedH = Number(div.alto) || availableH;
    const h = Math.min(requestedH, availableH);
    const d = Math.min(Number(div.ancho) || interiorDepth, interiorDepth);
    geometries.push({
      x, y: depthOffset, z, w: divW, d, h,
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
