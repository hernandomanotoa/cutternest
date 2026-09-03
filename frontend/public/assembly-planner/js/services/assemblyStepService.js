// js/services/assemblyStepService.js — Secuencia de ensamblaje para el modo paso a paso 3D
// Lógica pura, sin DOM. Independiente del grafo de dependencias (heuristics.js):
// ese grafo alimenta el manual/grafo con orden izq→divisor→der; aquí la secuencia
// es bottom-up físico: inferior → verticales → repisas → cierre → accesorios.

import { normalizeName } from '../utils/normalize.js';
import { isGlobalPiece } from './moduleService.js';

const CATEGORY_ORDER = {
  inferior: 1,
  vertical: 2,
  horizontal: 3,
  fondo: 4,
  tapa: 5,
  accesorio: 6,
  otro: 7,
};

const HEIGHT_KEYWORD_RANK = [
  ['inferior', 1],
  ['bajo', 1],
  ['medio', 2],
  ['media', 2],
  ['central', 2],
  ['superior', 3],
  ['alto', 3],
];

function heightRank(piece) {
  const text = normalizeName(`${piece.nombre} ${piece.id}`);
  for (const [keyword, rank] of HEIGHT_KEYWORD_RANK) {
    if (text.includes(keyword)) return rank;
  }
  return 2;
}

function posZ(piece) {
  const z = Number(piece.pos_z);
  return Number.isFinite(z) ? z : 0;
}

/**
 * Clasifica una pieza en la categoría de la secuencia de ensamblaje.
 * Usa solo el nombre: el id puede contener el tipo de mueble completo
 * ("m6-tapa" en un zapatero) y contaminaría la clasificación.
 */
export function classifySequenceRole(piece) {
  const name = normalizeName(piece.nombre || piece.id || '');
  // Piezas de cajón (frentes, fondos de cajón) se tratan como accesorio;
  // "cajonera" (mueble completo) no cuenta.
  const isDrawer = name.includes('cajon') && !name.includes('cajonera');

  if (!isDrawer && /(zocalo|base)/.test(name)) return 'inferior';
  if (!isDrawer && /(lateral|divisor|division|particion|montante|travesano|refuerzo|tirante|pata|cantonera)/.test(name)) return 'vertical';
  if (!isDrawer && /(fondo|trasera)/.test(name)) return 'fondo';
  if (!isDrawer && /(tapa|techo)/.test(name)) return 'tapa';
  if (/(puerta|cajon|tirador|barra|manija)/.test(name)) return 'accesorio';
  if (!isDrawer && /(repisa|estante|zapatero)/.test(name)) return 'horizontal';
  return 'otro';
}

function sideRank(piece) {
  const text = normalizeName(`${piece.nombre} ${piece.id}`);
  if (/(izquierdo|izquierda|izq)/.test(text)) return 0;
  if (/(derecho|derecha|der)/.test(text)) return 1;
  if (/(central|centro)/.test(text)) return 2;
  return 3;
}

function subRoleRank(piece) {
  const text = normalizeName(`${piece.nombre} ${piece.id}`);
  const role = classifySequenceRole(piece);
  if (role === 'vertical') {
    // laterales primero (izq→der), luego divisores (izq→der), luego resto
    if (text.includes('lateral')) return sideRank(piece);
    if (/(divisor|division|particion)/.test(text)) return 10 + sideRank(piece);
    return 20 + sideRank(piece);
  }
  if (role === 'accesorio') {
    if (text.includes('barra')) return 0;
    if (text.includes('puerta')) return 1;
    if (text.includes('cajon')) return 2;
    if (text.includes('tirador')) return 3;
    return 4;
  }
  if (role === 'horizontal' || role === 'inferior') return heightRank(piece);
  return 0;
}

/**
 * Construye la secuencia de ensamblaje: un paso por pieza, ordenada
 * inferior → verticales → horizontales → fondo → tapa → accesorios.
 * Las piezas globales van al final; el resto se agrupa por módulo.
 *
 * @param {Array} pieces piezas CSV del módulo activo (o 'all')
 * @returns {{ steps: Array<{paso:number, piezas:string[]}>, totalPasos: number, totalPiezas: number }}
 */
export function buildAssemblySequence(pieces) {
  const sorted = [...pieces].sort((a, b) => {
    const ga = isGlobalPiece(a) ? 1 : 0;
    const gb = isGlobalPiece(b) ? 1 : 0;
    if (ga !== gb) return ga - gb;

    const ma = String(a.modulo || '').trim();
    const mb = String(b.modulo || '').trim();
    if (ma !== mb) return ma.localeCompare(mb, undefined, { numeric: true });

    const ca = CATEGORY_ORDER[classifySequenceRole(a)];
    const cb = CATEGORY_ORDER[classifySequenceRole(b)];
    if (ca !== cb) return ca - cb;

    const sa = subRoleRank(a);
    const sb = subRoleRank(b);
    if (sa !== sb) return sa - sb;

    const za = posZ(a);
    const zb = posZ(b);
    if (za !== zb) return za - zb;

    return String(a.nombre).localeCompare(String(b.nombre));
  });

  const steps = sorted.map((p, i) => ({ paso: i + 1, piezas: [p.id] }));
  return { steps, totalPasos: steps.length, totalPiezas: sorted.length };
}

/**
 * Mapa piezaId -> paso, listo para Renderer3D.setAssemblyLevels().
 */
export function buildAssemblyLevels(pieces) {
  const { steps } = buildAssemblySequence(pieces);
  const levels = new Map();
  steps.forEach((s) => s.piezas.forEach((id) => levels.set(id, s.paso)));
  return levels;
}
