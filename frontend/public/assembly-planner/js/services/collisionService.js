// js/services/collisionService.js — Detección de colisiones entre piezas móviles
// Lógica pura, sin DOM. Trabaja sobre la salida de computeGeometries
// (apertura ya aplicada): AABB por pieza (con esquinas rotadas si tiene
// rotation) y solapamiento estricto entre piezas móviles distintas.

import { boxCorners, motionConfigFor, opennessFor, rotateCorners } from './motionService.js';

/**
 * Caja alineada a ejes de una geometría. Con rotation usa el AABB de las
 * esquinas rotadas (aproxima el volumen real por arriba).
 */
export function aabbOf(geo) {
  if (geo.rotation) {
    const corners = rotateCorners(boxCorners(geo), geo.rotation);
    const box = {
      minX: Infinity, maxX: -Infinity,
      minY: Infinity, maxY: -Infinity,
      minZ: Infinity, maxZ: -Infinity,
    };
    for (const c of corners) {
      box.minX = Math.min(box.minX, c.x); box.maxX = Math.max(box.maxX, c.x);
      box.minY = Math.min(box.minY, c.y); box.maxY = Math.max(box.maxY, c.y);
      box.minZ = Math.min(box.minZ, c.z); box.maxZ = Math.max(box.maxZ, c.z);
    }
    return box;
  }
  return {
    minX: geo.x, maxX: geo.x + (geo.w || 0),
    minY: geo.y, maxY: geo.y + (geo.d || 0),
    minZ: geo.z, maxZ: geo.z + (geo.h || 0),
  };
}

/**
 * Volumen de la intersección de dos AABB (0 si no se solapan estrictamente;
 * el contacto cara a cara no cuenta como colisión).
 */
export function intersectVolume(a, b) {
  const dx = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const dy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const dz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (dx <= 0 || dy <= 0 || dz <= 0) return 0;
  return dx * dy * dz;
}

/**
 * Ids de piezas con movimiento y apertura efectiva > 0 (las únicas que pueden
 * colisionar por apertura; con apertura 0 no hay colisiones).
 */
export function movingPieceIds(pieces, aperturas, aperturaGlobal) {
  const ids = new Set();
  for (const p of pieces || []) {
    if (!motionConfigFor(p)) continue;
    if (opennessFor(p.id, aperturas, aperturaGlobal) > 0) ids.add(p.id);
  }
  return ids;
}

/**
 * Pares de piezas móviles distintas que se solapan al abrirse.
 * @returns {Array<{aId,bId,aName,bName,volume}>} un par por combinación de ids
 *   (el de mayor volumen), ordenado de mayor a menor volumen.
 */
export function detectCollisions(geometries, movingIds) {
  const movers = new Set(movingIds || []);
  if (!movers.size || !geometries?.length) return [];
  const boxes = geometries
    .filter((g) => g.id && movers.has(g.id))
    .map((g) => ({ geo: g, box: aabbOf(g) }));
  const byPair = new Map();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const { geo: a, box: ba } = boxes[i];
      const { geo: b, box: bb } = boxes[j];
      if (a.id === b.id) continue;
      const volume = intersectVolume(ba, bb);
      if (volume <= 0) continue;
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      const prev = byPair.get(key);
      if (!prev || volume > prev.volume) {
        byPair.set(key, { aId: a.id, bId: b.id, aName: a.name || a.id, bName: b.name || b.id, volume });
      }
    }
  }
  return [...byPair.values()].sort((p, q) => q.volume - p.volume);
}
