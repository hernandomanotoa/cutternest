/**
 * Proyección isométrica y construcción de polígonos 3D→2D.
 * Funciones puras: reciben el objeto de proyección { scale, isoDepth, isoFlip }.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { boxCorners, rotateCorners } from '../../../services/motionService.js';

export function isoProject(projection, x, y, z, ox, oy) {
  // Proyección isométrica corregida.
  // X (ancho) -> derecha.
  // Y (profundidad) positiva (frente) -> derecha y abajo.
  // Z (altura) -> arriba.
  // isoFlip invierte la dirección lateral (signo de Y en X).
  const xFactor = projection.isoFlip ? -projection.isoDepth : projection.isoDepth;
  return {
    x: ox + (x + y * xFactor) * projection.scale,
    y: oy - (z - y * projection.isoDepth) * projection.scale,
  };
}

export function projectCuboid(projection, geo, ox, oy) {
  const { x, y, z, w, d, h } = geo;
  // Esquinas alineadas por defecto; con geo.rotation (bisagra) se usan las
  // 8 esquinas rotadas (boxCorners + rotateCorners, mismo orden de índices).
  const verts = geo.rotation
    ? rotateCorners(boxCorners(geo), geo.rotation).map((c) => [c.x, c.y, c.z])
    : [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + d, z],
        [x, y + d, z],
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ];

  const projected = verts.map((p) => isoProject(projection, p[0], p[1], p[2], ox, oy));

  // Caras visibles: frontal, superior, lateral derecha
  const faces = [
    { name: 'right', indices: [1, 5, 6, 2] }, // lateral derecho (x+w)
    { name: 'top', indices: [4, 5, 6, 7] },   // superior
    { name: 'front', indices: [3, 2, 6, 7] }, // frontal
  ];

  return { projected, faces };
}

export function polygonArea(projected, indices) {
  let area = 0;
  const n = indices.length;
  for (let i = 0; i < n; i++) {
    const a = projected[indices[i]];
    const b = projected[indices[(i + 1) % n]];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}
