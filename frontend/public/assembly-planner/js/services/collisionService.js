// js/services/collisionService.js — Detección de colisiones al abrir piezas
// Lógica pura, sin DOM. Trabaja sobre la salida de computeGeometries
// (apertura ya aplicada): AABB por pieza (con esquinas rotadas si tiene
// rotation) y solapamiento estricto. Se chequean los pares de piezas móviles
// (apertura efectiva > 0) y, además, cada móvil contra los obstáculos fijos
// (tiras del sistema gola), que permanecen en su posición.

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
 * Uniones legítimas por diseño cuyo solape AABB es un artefacto de la
 * aproximación (no un choque real):
 *   - tirador anclado sobre la cara visible de su frente de cajón o puerta.
 *   - cara (frente interior de la caja) unida en escuadra con la base: la
 *     cara cubre el canto frontal de la base; son paneles perpendiculares
 *     sin volumen compartido, pero sus AABB se intersectan.
 * Solo aplican dentro de la misma caja/puerta (mismo tallo de id, es decir,
 * mismo submódulo): el tirador o la cara de OTRA caja que solape sí se reporta.
 */
const LEGIT_JOINT_ROLES = new Set([
  'drawer_bottom|drawer_part',
  'drawer_face|handle',
  'door|handle',
]);

function isLegitJoint(a, b) {
  const key = [a.role || '', b.role || ''].sort().join('|');
  if (!LEGIT_JOINT_ROLES.has(key)) return false;
  const stem = (id) => String(id || '').split('-').slice(0, -1).join('-');
  const sa = stem(a.id);
  return sa !== '' && sa === stem(b.id);
}

/**
 * Piezas con la MISMA rotación (eje, ángulo y pivote) pertenecen al mismo
 * grupo rígido (p. ej. caja de volquete que pivota con su frente): no pueden
 * colisionar entre sí. El AABB de un volumen rotado se infla respecto al
 * real, así que dos piezas adyacentes del grupo sí pueden "solapar" en AABB
 * sin tocarse (falso positivo).
 */
function sameRigidRotation(a, b) {
  const ra = a.rotation;
  const rb = b.rotation;
  if (!ra || !rb || ra.axis !== rb.axis) return false;
  if (Math.abs((ra.angleDeg || 0) - (rb.angleDeg || 0)) > 1e-9) return false;
  const pa = ra.pivot || {};
  const pb = rb.pivot || {};
  return (
    Math.abs((pa.x || 0) - (pb.x || 0)) < 1e-9 &&
    Math.abs((pa.y || 0) - (pb.y || 0)) < 1e-9 &&
    Math.abs((pa.z || 0) - (pb.z || 0)) < 1e-9
  );
}

/**
 * Obstáculo fijo: tira del sistema gola (rol `gola_strip`, o id/nombre que
 * contiene 'gola', mismo criterio que classifierService). Las marcas de agarre
 * (`gola_grip`, ids `*-grip`) son referencias de renderer, no volumen físico:
 * nunca se reportan.
 */
export function esObstaculoFijo(geo) {
  if (!geo) return false;
  const id = String(geo.id || '');
  if (geo.role === 'gola_grip' || id.endsWith('-grip')) return false;
  if (geo.role === 'gola_strip') return true;
  if (geo.role && geo.role !== 'panel') return false;
  const nombre = `${geo.name || ''} ${geo.nombre || ''}`.toLowerCase();
  return id.toLowerCase().includes('gola') || nombre.includes('gola');
}

/**
 * El canal L queda parcialmente TAPADO a propósito por el frente del cajón
 * superior (el frente cubre la pestaña inferior de la L; es el mecanismo de
 * agarre desde arriba). Misma exención que la validación estática de
 * validateGola, que omite el solape frente↔tira para los ids `gola-l*`:
 * un frente de cajón nunca colisiona con las tiras de su canal L.
 */
function isTapaCanalL(obstacle, mover) {
  return /gola-l\d+-/i.test(String(obstacle.id || '')) && mover.role === 'drawer_face';
}

/**
 * Pares de piezas que se solapan al abrirse: móvil↔móvil y móvil↔obstáculo
 * fijo (tiras gola, que no se mueven). Los obstáculos solo se evalúan contra
 * los móviles; obstáculo↔obstáculo y móvil↔estática genérica no se chequean.
 * @returns {Array<{aId,bId,aName,bName,volume,contraObstaculoFijo?}>} un par
 *   por combinación de ids (el de mayor volumen), ordenado de mayor a menor
 *   volumen. Los pares contra obstáculo fijo llevan `contraObstaculoFijo: true`.
 */
export function detectCollisions(geometries, movingIds) {
  const movers = new Set(movingIds || []);
  if (!movers.size || !geometries?.length) return [];
  const boxes = geometries
    .filter((g) => g.id && movers.has(g.id))
    .map((g) => ({ geo: g, box: aabbOf(g) }));
  const obstacles = geometries
    .filter((g) => g.id && !movers.has(g.id) && esObstaculoFijo(g))
    .map((g) => ({ geo: g, box: aabbOf(g) }));
  const byPair = new Map();
  const consider = (a, ba, b, bb, contraObstaculoFijo) => {
    if (a.id === b.id) return;
    const volume = intersectVolume(ba, bb);
    // Tolerancia epsilon: caras que se tocan con holguras decimales (12,7 mm
    // de corredera, centrajes /2) producen polvo de punto flotante (~1e-11
    // mm³) que no es una colisión. El contacto real sigue dando volumen 0.
    if (volume < 1e-6) return;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const prev = byPair.get(key);
    if (!prev || volume > prev.volume) {
      byPair.set(key, { aId: a.id, bId: b.id, aName: a.name || a.id, bName: b.name || b.id, volume, ...(contraObstaculoFijo ? { contraObstaculoFijo: true } : {}) });
    }
  };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const { geo: a, box: ba } = boxes[i];
      const { geo: b, box: bb } = boxes[j];
      if (isLegitJoint(a, b)) continue;
      if (sameRigidRotation(a, b)) continue;
      consider(a, ba, b, bb, false);
    }
  }
  for (const { geo: m, box: bm } of boxes) {
    for (const { geo: o, box: bo } of obstacles) {
      if (isTapaCanalL(o, m)) continue;
      consider(m, bm, o, bo, true);
    }
  }
  return [...byPair.values()].sort((p, q) => q.volume - p.volume);
}
