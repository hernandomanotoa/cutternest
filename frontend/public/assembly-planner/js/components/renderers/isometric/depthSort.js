/**
 * Ordenación de piezas para el painter's algorithm (profundidad proyectada).
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { boxCorners, rotateCorners } from '../../../services/motionService.js';
import { normalizeName } from '../../../utils/normalize.js';
import { getZIndex } from './pieceStyling.js';

function getDepthKey(geo, xFactor = 0.5) {
  // Usar el centroide proyectado en X para el painter's algorithm.
  // Esto permite que piezas de módulos adyacentes en vista completa se
  // ordenen correctamente según su posición visual, no solo real.
  // Con rotation (puerta abierta) el centroide se calcula sobre las esquinas
  // rotadas, no sobre la caja alineada.
  let cx;
  let cy;
  let cz;
  if (geo.rotation) {
    const corners = rotateCorners(boxCorners(geo), geo.rotation);
    cx = corners.reduce((s, c) => s + c.x, 0) / corners.length;
    cy = corners.reduce((s, c) => s + c.y, 0) / corners.length;
    cz = corners.reduce((s, c) => s + c.z, 0) / corners.length;
  } else {
    cx = geo.x + geo.w / 2;
    cy = geo.y + geo.d / 2;
    cz = geo.z + geo.h / 2;
  }
  return cx + cy * xFactor + cz;
}

function getSideOrder(geo) {
  // Agrupar piezas horizontales laterales y divisores para que el SVG
  // refleje el orden de ensamblaje: izquierda → divisor → derecha → corrida.
  if (geo.role === 'divider') return 1;
  if (geo.role !== 'shelf') return null;
  const text = normalizeName(`${geo.name || ''} ${geo.id || ''}`);
  const isSideSpecific =
    text.includes('izquierdo') || text.includes('izq') ||
    text.includes('derecho') || text.includes('der');
  const isBottomLike = geo.zone === 'bottom' || geo.zone === 'fixed-bottom';
  // Repisas/zapateros inferiores corrida (sin lado) se pintan antes que los
  // estantes laterales, porque actúan como base elevada para ellos.
  if (isBottomLike && !isSideSpecific) return -1;
  if (text.includes('izquierdo') || text.includes('izq')) return 0;
  if (text.includes('derecho') || text.includes('der')) return 2;
  return 3; // repisas corrida / central / sin lado
}

export function sortByDepth(geometries, xFactor = 0.5) {
  return geometries.slice().sort((a, b) => {
    // Vista completa: pintar módulo a módulo (M1 completo, luego M2, ...).
    // En vista individual/global moduleSeq es undefined para todos y este
    // chequeo no altera el orden existente.
    const ma = a.moduleSeq ?? 0;
    const mb = b.moduleSeq ?? 0;
    if (ma !== mb) return ma - mb;

    const za = getZIndex(a.role);
    const zb = getZIndex(b.role);

    // Capas especiales: fondo y lateral trasero primero; lateral frontal al final.
    const aSpecial = za <= 2 || za >= 20;
    const bSpecial = zb <= 2 || zb >= 20;
    if (aSpecial || bSpecial) {
      if (za !== zb) return za - zb;
      // Mismo zIndex especial (p. ej. dos puertas): con rotation desempatamos
      // por profundidad real (centroide rotado); sin rotation conservamos el
      // orden de inserción estable (sin cambios respecto al render previo).
      if (a.rotation || b.rotation) return getDepthKey(a, xFactor) - getDepthKey(b, xFactor);
      return 0;
    }

    // Dentro de estantes/divisores, agrupar por lado para respetar el orden
    // izquierda → divisor → derecha → corrida, manteniendo el apilamiento
    // vertical dentro de cada grupo.
    const sideA = getSideOrder(a);
    const sideB = getSideOrder(b);
    if (sideA != null && sideB != null && sideA !== sideB) {
      return sideA - sideB;
    }

    // Orden de armado de abajo hacia arriba (por Z base).
    // Si la diferencia es significativa (> espesor típico) usamos Z base;
    // si no, desempatamos por profundidad proyectada para mantener realismo 3D.
    const zDiff = a.z - b.z;
    if (Math.abs(zDiff) > 20) return zDiff;
    return getDepthKey(a, xFactor) - getDepthKey(b, xFactor);
  });
}
