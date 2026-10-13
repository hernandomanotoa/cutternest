/**
 * Cálculo del viewBox y origen de proyección (viewport del SVG).
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { projectCuboid } from './isoProjection.js';

export function calculateViewport(renderer, geometries, isAllView = false) {
  // PASADA 1: proyectar TODOS los vértices con origen provisional (0,0)
  // para descubrir el rango real de coordenadas (incluyendo negativas).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  geometries.forEach((geo) => {
    const { projected } = projectCuboid(renderer, geo, 0, 0);
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
  const titleSpace = 60 * renderer.textScale;
  const axesSpace = renderer.showAxes ? 70 * renderer.textScale : 0;

  const dimensionSpaceX = renderer.showDimensions && !isAllView ? 100 * renderer.textScale : 0;
  const dimensionSpaceY = renderer.showDimensions && !isAllView ? 45 * renderer.textScale : 0;

  // PASADA 2: desplazar todo al área positiva, dejando padding
  const originX = -minX + renderer.padding + dimensionSpaceX;
  const originY = -minY + renderer.padding + titleSpace + dimensionSpaceY;

  const viewBoxW = Math.ceil(contentW + 2 * renderer.padding + 2 * dimensionSpaceX);
  const viewBoxH = Math.ceil(contentH + 2 * renderer.padding + titleSpace + axesSpace + dimensionSpaceY);

  return {
    viewBox: `0 0 ${viewBoxW} ${viewBoxH}`,
    originX,
    originY,
    axesSpace,
    width: viewBoxW,
    height: viewBoxH,
  };
}
