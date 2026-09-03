// js/services/assemblyStepService.js — Secuencia de ensamblaje para el modo paso a paso 3D
// Lógica pura, sin DOM. Independiente del grafo de dependencias (heuristics.js):
// ese grafo alimenta el manual/grafo con orden izq→divisor→der; aquí la secuencia
// sigue el armado físico real (fuentes: manuales PAX/Furnica/CabinetNow):
//
//   1. Casco exterior: base (+zócalo) → laterales → tapa
//   2. Interiores intercalados por altura real (de abajo hacia arriba):
//      repisa (clave z) → divisor (clave z−0.5, cae tras la repisa que lo soporta;
//      si va de base a techo, z=0 → antes de la primera repisa)
//   3. Fondo → accesorios (barras → puertas → cajones → tiradores)
//
// Excepción: fondo INTERNO (embutido en ranura, detectado por geometría con
// classifyBackPanelMount). Se desliza desde arriba y la tapa lo captura, así
// que la secuencia es: base → laterales → interiores → fondo → tapa →
// accesorios (fuentes: WOODWEB, Fine Woodworking, The Handyman's Daughter).
// Fondo externo o custom mantiene el orden por defecto (fondo al final: mete
// en escuadra la caja).

import { normalizeName } from '../utils/normalize.js';
import { isGlobalPiece } from './moduleService.js';
import { getModuleDimensions, classifyBackPanelMount } from './geometryService.js';

const CATEGORY_ORDER = {
  inferior: 1,
  lateral: 2,
  tapa: 3,
  interior: 4,
  fondo: 5,
  accesorio: 6,
  otro: 7,
};

// Orden alternativo cuando el fondo es interno (embutido en ranura):
// la tapa captura el panel deslizado, así que cierra el casco después de él.
const INTERNAL_BACK_CATEGORY = {
  interior: 3,
  fondo: 4,
  tapa: 5,
};

/**
 * Detecta, por módulo, si su fondo es interno (embutido entre casco:
 * ancho≈moduleW−2t y alto≈moduleH−2t). Reutiliza classifyBackPanelMount;
 * sin medidas válidas o con montaje custom/externo, no entra en el set.
 */
function detectInternalBackModules(pieces) {
  const byModule = new Map();
  for (const p of pieces) {
    if (isGlobalPiece(p)) continue;
    const m = String(p.modulo || '').trim();
    if (!byModule.has(m)) byModule.set(m, []);
    byModule.get(m).push(p);
  }

  const internal = new Set();
  for (const [modId, modPieces] of byModule) {
    const back = modPieces.find((p) => classifySequenceRole(p) === 'fondo');
    if (!back || !Number.isFinite(Number(back.ancho)) || !Number.isFinite(Number(back.alto))) continue;
    const laterals = modPieces.filter((p) => classifySequenceRole(p) === 'lateral');
    const base = modPieces.find((p) => classifySequenceRole(p) === 'inferior');
    const sideThickness = Number(laterals[0]?.espesor) || Number(base?.espesor) || 15;
    const box = getModuleDimensions(modPieces, sideThickness);
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height)) continue;
    if (classifyBackPanelMount(back, box.width, box.height, sideThickness) === 'internal') {
      internal.add(modId);
    }
  }
  return internal;
}

function categoryFor(role, hasInternalBack) {
  if (hasInternalBack && INTERNAL_BACK_CATEGORY[role] !== undefined) return INTERNAL_BACK_CATEGORY[role];
  return CATEGORY_ORDER[role];
}

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

function sideRank(piece) {
  const text = normalizeName(`${piece.nombre} ${piece.id}`);
  if (/(izquierdo|izquierda|izq)/.test(text)) return 0;
  if (/(derecho|derecha|der)/.test(text)) return 1;
  if (/(central|centro)/.test(text)) return 2;
  return 3;
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
  if (!isDrawer && name.includes('lateral')) return 'lateral';
  if (!isDrawer && /(tapa|techo)/.test(name)) return 'tapa';
  if (!isDrawer && /(fondo|trasera)/.test(name)) return 'fondo';
  if (/(puerta|cajon|tirador|barra|manija)/.test(name)) return 'accesorio';
  if (!isDrawer && /(repisa|estante|zapatero|divisor|division|particion|montante|travesano|refuerzo|tirante|pata|cantonera)/.test(name)) return 'interior';
  return 'otro';
}

function isInteriorVertical(piece) {
  const name = normalizeName(piece.nombre || piece.id || '');
  return !name.includes('cajon') && /(divisor|division|particion|montante|travesano|refuerzo|tirante|pata|cantonera)/.test(name);
}

function accessoryRank(piece) {
  const name = normalizeName(piece.nombre || piece.id || '');
  if (/(barra|zapatero)/.test(name)) return 0;
  if (name.includes('puerta')) return 1;
  if (name.includes('cajon')) return 2;
  if (name.includes('tirador')) return 3;
  return 4;
}

/**
 * Clave de orden dentro de la categoría 'interior' (intercalado por altura).
 * - verticales interiores (divisor/montante/...): z − 0.5, para colocarse
 *   justo DESPUÉS de la repisa sobre la que se apoyan; si van de base a
 *   techo (z=0), caen antes de la primera repisa.
 * - horizontales (repisa/estante/zapatero): z.
 * Sin posición conocida, se estima por palabra clave del nombre.
 */
function interiorKey(piece, positions) {
  const z = positions?.get(piece.id);
  if (Number.isFinite(z)) {
    return isInteriorVertical(piece) ? z - 0.5 : z;
  }
  const base = heightRank(piece) * 10;
  return isInteriorVertical(piece) ? base + 5 : base;
}

/**
 * Construye la secuencia de ensamblaje: un paso por pieza, ordenada
 * casco exterior (base → laterales → tapa) → interiores intercalados por
 * altura → fondo → accesorios. Las piezas globales van al final.
 *
 * Si el módulo tiene fondo INTERNO (embutido en ranura, por geometría), la
 * tapa pasa al cierre: base → laterales → interiores → fondo → tapa.
 *
 * @param {Array} pieces piezas CSV del módulo activo (o 'all')
 * @param {Map<string, number>} [positions] posición z real por pieza (mm),
 *   típicamente desde las geometrías 3D; mejora el intercalado repisa/divisor
 * @returns {{ steps: Array<{paso:number, piezas:string[]}>, totalPasos: number, totalPiezas: number }}
 */
export function buildAssemblySequence(pieces, positions = null) {
  const internalBackModules = detectInternalBackModules(pieces);
  const sorted = [...pieces].sort((a, b) => {
    const ga = isGlobalPiece(a) ? 1 : 0;
    const gb = isGlobalPiece(b) ? 1 : 0;
    if (ga !== gb) return ga - gb;

    const ma = String(a.modulo || '').trim();
    const mb = String(b.modulo || '').trim();
    if (ma !== mb) return ma.localeCompare(mb, undefined, { numeric: true });

    const roleA = classifySequenceRole(a);
    const roleB = classifySequenceRole(b);
    const ca = categoryFor(roleA, internalBackModules.has(ma));
    const cb = categoryFor(roleB, internalBackModules.has(mb));
    if (ca !== cb) return ca - cb;

    if (roleA === 'lateral') {
      const sa = sideRank(a);
      const sb = sideRank(b);
      if (sa !== sb) return sa - sb;
    } else if (roleA === 'interior') {
      const ka = interiorKey(a, positions);
      const kb = interiorKey(b, positions);
      if (ka !== kb) return ka - kb;
      // mismo apoyo: verticales (soporte) antes que el horizontal que apoyan
      const va = isInteriorVertical(a) ? 0 : 1;
      const vb = isInteriorVertical(b) ? 0 : 1;
      if (va !== vb) return va - vb;
    } else if (roleA === 'accesorio') {
      const aa = accessoryRank(a);
      const ab = accessoryRank(b);
      if (aa !== ab) return aa - ab;
    }

    return String(a.nombre).localeCompare(String(b.nombre));
  });

  const steps = sorted.map((p, i) => ({ paso: i + 1, piezas: [p.id] }));
  return { steps, totalPasos: steps.length, totalPiezas: sorted.length };
}

/**
 * Mapa piezaId -> paso, listo para Renderer3D.setAssemblyLevels().
 */
export function buildAssemblyLevels(pieces, positions = null) {
  const { steps } = buildAssemblySequence(pieces, positions);
  const levels = new Map();
  steps.forEach((s) => s.piezas.forEach((id) => levels.set(id, s.paso)));
  return levels;
}
