// js/renderer3d/moduleLayout.js — Separación entre módulos en vista 3D
// 'todos los módulos' (ALL_MODULE_ID). Lógica pura, sin DOM.
//
// El posicionamiento lateral M1..Mn se reutiliza de
// IsometricRenderer.computeGeometries (mismo layout que la vista isométrica
// 'Vista completa'): cada módulo llega con sus geometrías ya desplazadas en X
// y marcadas con `moduleSeq`. En modo 'compact' los módulos quedan pegados
// (gap 0); esta utilidad garantiza un gap físico mínimo entre módulos
// adyacentes sin alterar el layout interior de cada módulo.

// Separación estándar entre módulos en la vista 3D multi-módulo (mm).
// La constante vive en js/core/config.js (capa core); se re-exporta aquí
// para no romper los imports existentes.
export { MODULE_GAP_MM } from '../core/config.js';
import { MODULE_GAP_MM } from '../core/config.js';

/**
 * Garantiza al menos `gapMm` de separación en X entre grupos de geometrías
 * consecutivos (agrupados por `moduleSeq`, ordenados por su borde izquierdo).
 * Si el layout ya respeta el gap (p. ej. modo 'projected'), no desplaza nada.
 * @param {Array} geometries geometrías enriquecidas (con x, w, cx, moduleSeq)
 * @param {number} [gapMm] separación mínima entre módulos en mm
 * @returns {Array} nuevo array de geometrías (no muta el de entrada)
 */
export function ensureModuleGap(geometries, gapMm = MODULE_GAP_MM) {
  if (!geometries.length) return [];

  // Piezas globales (zócalo a marco, fondo/corona globales, id `glb-*` o
  // módulo 'estructura'): NO son módulos — no se agrupan ni se desplazan.
  // El zócalo ya viene posicionado bajo la fila (mapa de spans de
  // computeGeometries); tratarlo como un grupo más lo empujaba a un costado.
  const esGlobal = (g) => String(g.id || '').startsWith('glb-')
    || g.raw?.modulo === 'estructura'
    || g.raw?.modulo === 'global';
  const bySeq = new Map();
  geometries.forEach((g, idx) => {
    if (esGlobal(g)) return;
    const key = g.moduleSeq ?? 0;
    if (!bySeq.has(key)) bySeq.set(key, []);
    bySeq.get(key).push(idx);
  });
  if (bySeq.size < 2) return geometries.slice();

  // Límites X de cada grupo y orden visual (izquierda → derecha).
  const groups = [...bySeq.entries()]
    .map(([seq, indices]) => {
      let minX = Infinity;
      let maxX = -Infinity;
      indices.forEach((i) => {
        minX = Math.min(minX, geometries[i].x);
        maxX = Math.max(maxX, geometries[i].x + geometries[i].w);
      });
      return { seq, indices, minX, maxX };
    })
    .sort((a, b) => a.minX - b.minX);

  // Desplazamiento acumulado: un grupo con gap insuficiente empuja también a
  // todos los de su derecha, manteniendo el orden y el gap relativo.
  const shifts = new Array(geometries.length).fill(0);
  let shift = 0;
  let prevMaxX = -Infinity;
  for (const grp of groups) {
    if (prevMaxX !== -Infinity) {
      const gap = grp.minX + shift - prevMaxX;
      if (gap < gapMm) shift += gapMm - gap;
    }
    grp.indices.forEach((i) => {
      shifts[i] = shift;
    });
    prevMaxX = Math.max(prevMaxX, grp.maxX + shift);
  }

  if (!shift) return geometries.slice();
  return geometries.map((g, i) => {
    const dx = shifts[i];
    return dx ? { ...g, x: g.x + dx, cx: g.cx + dx } : g;
  });
}
