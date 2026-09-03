// js/services/assemblyStepService.js — Secuencia de ensamblaje para el modo paso a paso 3D
// Lógica pura, sin DOM. Independiente del grafo de dependencias (heuristics.js):
// ese grafo alimenta el manual/grafo con orden izq→divisor→der; aquí la secuencia
// sigue el armado físico real (fuentes: manuales PAX/Furnica/CabinetNow):
//
//   1. Casco exterior:
//      - Base EXTERNA (+zócalo): cubre los laterales → plataforma de
//        referencia que se arma primero (consenso PAX/Furnica/CabinetNow).
//      - Laterales: sobre la base externa (o sobre el zócalo si la base es
//        embutida) y se meten en escuadra.
//      - Base EMBUTIDA (ancho ≈ W−2t, encaja entre laterales): se ensambla
//        una vez el casco en escuadra, antes de la tapa.
//      - Tapa: siempre tras los laterales (cierra el casco).
//   2. Interiores, en tres grupos:
//      a. Horizontales de lateral a lateral (repisas corridas/zapateros;
//         ancho ≈ interior): unen y escuadran el casco; clave z.
//      b. Divisiones verticales: se deslizan desde arriba encajando en los
//         dados de las corridas superiores (z≤1 base a techo → antes de la
//         primera repisa; sin superiores → tras la que la soporta).
//      c. Repisas de vano (estantes regulables entre lateral y divisor):
//         tras las divisiones que las atraviesan; si SOPORTAN una división,
//         van antes que ella (el apoyo físico manda).
//   3. Fondo → accesorios (barras → puertas → cajones → tiradores)
//
// Excepción: fondo que NO cubre la caja completa (interno en ranura o con
// cualquier medida reducida, p. ej. corrido entre laterales). No puede
// clavarse por detrás: se inserta en la caja abierta y la tapa lo captura,
// así que la secuencia es: base → laterales → interiores → fondo → tapa →
// accesorios (fuentes: WOODWEB, Fine Woodworking, The Handyman's Daughter).
// Solo el fondo EXTERNO (cubre ancho≈W y alto≈H completo) va al final:
// clavado/atornillado por detrás, mete en escuadra la caja.

import { normalizeName } from '../utils/normalize.js';
import { isGlobalPiece } from './moduleService.js';
import { getModuleDimensions, classifyBackPanelMount, classifyTopBottomMountAxes } from './geometryService.js';

const CATEGORY_ORDER = {
  inferior: 1,
  lateral: 2,
  inferiorInterno: 2.5, // base embutida entre laterales (ancho ≈ W−2t): tras el casco
  tapa: 3,
  interior: 4,
  fondo: 5,
  accesorio: 6,
  otro: 7,
};

// Orden alternativo cuando el fondo se inserta antes de la tapa (interno,
// corrido o custom): la tapa captura el panel, así que cierra el casco
// después de él.
const PRE_TOP_BACK_CATEGORY = {
  interior: 3,
  fondo: 4,
  tapa: 5,
};

/**
 * Analiza cada módulo una sola vez: espesor de lateral, caja (W×H),
 * ancho interior y montaje del fondo. Reutilizado por la posición del
 * fondo (pre-tapa) y por la clasificación de interiores (lateral a
 * lateral vs vano).
 */
function analyzeModules(pieces) {
  const byModule = new Map();
  for (const p of pieces) {
    if (isGlobalPiece(p)) continue;
    const m = String(p.modulo || '').trim();
    if (!byModule.has(m)) byModule.set(m, []);
    byModule.get(m).push(p);
  }

  const info = new Map();
  for (const [modId, modPieces] of byModule) {
    const laterals = modPieces.filter((p) => classifySequenceRole(p) === 'lateral');
    const base = modPieces.find((p) => classifySequenceRole(p) === 'inferior');
    const sideThickness = Number(laterals[0]?.espesor) || Number(base?.espesor) || 15;
    const box = getModuleDimensions(modPieces, sideThickness);
    const back = modPieces.find((p) => classifySequenceRole(p) === 'fondo');
    let backMount = null;
    if (
      back &&
      Number.isFinite(Number(back.ancho)) &&
      Number.isFinite(Number(back.alto)) &&
      Number.isFinite(box.width) &&
      Number.isFinite(box.height)
    ) {
      backMount = classifyBackPanelMount(back, box.width, box.height, sideThickness);
    }
    info.set(modId, {
      sideThickness,
      width: Number.isFinite(box.width) ? box.width : null,
      depth: Number.isFinite(box.depth) ? box.depth : null,
      interiorW: Number.isFinite(box.width) ? Math.max(0, box.width - 2 * sideThickness) : null,
      backMount,
    });
  }
  return info;
}

/**
 * Módulos cuyo fondo se inserta ANTES de la tapa. Criterio físico: solo
 * el fondo que cubre la caja completa ('external': ancho≈W y alto≈H) se
 * clava por detrás al final; cualquier otro (interno en ranura, corrido
 * entre laterales o custom) se inserta en la caja abierta y la tapa lo
 * captura. Sin medidas válidas se mantiene el orden por defecto.
 */
function detectPreTopBackModules(moduleInfo) {
  const preTop = new Set();
  for (const [modId, mi] of moduleInfo) {
    if (mi.backMount && mi.backMount !== 'external') preTop.add(modId);
  }
  return preTop;
}

function categoryFor(role, hasPreTopBack) {
  if (hasPreTopBack && PRE_TOP_BACK_CATEGORY[role] !== undefined) return PRE_TOP_BACK_CATEGORY[role];
  return CATEGORY_ORDER[role];
}

/**
 * Base/zócalo EMBUTIDO: ancho ≈ W−2t, encaja ENTRE los laterales. A diferencia
 * de la base externa (cubre los laterales y es la plataforma de referencia que
 * se arma primero), la embutida se ensambla cuando el casco ya está en
 * escuadra. Criterio por eje ancho (raw, como en isometricRenderer/csvParser).
 */
function isInsetPanel(piece, moduleInfo) {
  const mi = moduleInfo.get(String(piece.modulo || '').trim());
  if (!mi || !Number.isFinite(mi.width) || !Number.isFinite(mi.depth)) return false;
  if (!Number.isFinite(Number(piece.ancho))) return false;
  const axes = classifyTopBottomMountAxes(piece, mi.width, mi.depth, mi.sideThickness);
  return axes.width === 'internal';
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
 * Ancho físico de la pieza en plano (rotate=si intercambia ancho/alto,
 * como en buildPiece3D). Null si no hay medidas válidas.
 */
function pieceWidth(piece) {
  const a = Number(piece.ancho);
  const b = Number(piece.alto);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return String(piece.rotate).toLowerCase() === 'si' ? b : a;
}

/**
 * Claves de orden dentro de la categoría 'interior', por módulo:
 *   1. Horizontales de LATERAL A LATERAL (repisas corridas, zapateros;
 *      ancho ≈ interior): clave z. Unen y escuadran el casco; en ellas van
 *      los dados de las divisiones.
 *   2. Divisiones VERTICALES: se deslizan desde arriba encajando en los
 *      dados de las repisas corridas superiores → clave = max(z repisas
 *      corridas superiores) + 0.5; sin superiores, tras la que lo soporta
 *      (z−0.5); base a techo (z≤1) antes de la primera repisa.
 *   3. Repisas de VANO (estantes regulables entre lateral y divisor;
 *      ancho < interior): tras las divisiones que las atraviesan (dados) →
 *      clave = max(z, clave división + 0.75). Excepción: la repisa que
 *      SOPORTA una división va antes que ella (su z ya lo garantiza).
 * Sin posiciones, el orden se estima por palabra clave: corridas base,
 * verticales base+25, vano base+50.
 */
function buildInteriorKeys(pieces, positions, moduleInfo) {
  const keys = new Map();
  const byModule = new Map();
  for (const p of pieces) {
    if (classifySequenceRole(p) !== 'interior') continue;
    const m = String(p.modulo || '').trim();
    if (!byModule.has(m)) byModule.set(m, []);
    byModule.get(m).push(p);
  }

  for (const [modId, interiors] of byModule) {
    const interiorW = moduleInfo.get(modId)?.interiorW ?? null;
    const horizontals = interiors.filter((p) => !isInteriorVertical(p));
    const verticals = interiors.filter((p) => isInteriorVertical(p));
    const zOf = (p) => positions?.get(p.id);

    // Grupo 1: horizontales de lateral a lateral vs repisas de vano.
    const fulls = [];
    const bays = [];
    for (const h of horizontals) {
      const w = pieceWidth(h);
      if (interiorW != null && w != null && w < interiorW - 2) bays.push(h);
      else fulls.push(h);
    }
    const fullZs = fulls.map(zOf).filter(Number.isFinite);

    // Grupo 2: divisiones verticales.
    const vertEntries = verticals.map((v) => {
      const z = zOf(v);
      if (!Number.isFinite(z)) return { id: v.id, z, key: heightRank(v) * 10 + 25 };
      if (z <= 1) return { id: v.id, z, key: z - 0.5 };
      let key = z - 0.5;
      const above = fullZs.filter((fz) => fz > z + 1);
      if (above.length) key = Math.max(key, Math.max(...above) + 0.5);
      return { id: v.id, z, key };
    });
    for (const ve of vertEntries) keys.set(ve.id, ve.key);

    for (const f of fulls) {
      const z = zOf(f);
      keys.set(f.id, Number.isFinite(z) ? z : heightRank(f) * 10);
    }

    // Grupo 3: repisas de vano, tras las divisiones que las atraviesan.
    for (const b of bays) {
      const z = zOf(b);
      if (!Number.isFinite(z)) {
        keys.set(b.id, heightRank(b) * 10 + 50);
        continue;
      }
      let key = z;
      for (const ve of vertEntries) {
        if (Number.isFinite(ve.z) && ve.z < z - 1) key = Math.max(key, ve.key + 0.75);
      }
      keys.set(b.id, key);
    }
  }
  return keys;
}

/**
 * Construye la secuencia de ensamblaje: un paso por pieza, ordenada
 * casco exterior (base externa → laterales → base embutida → tapa) →
 * interiores (lateral a lateral → divisiones verticales → repisas de vano)
 * → fondo → accesorios. Las piezas globales van al final.
 *
 * Si el fondo del módulo NO cubre la caja completa (interno, corrido o
 * custom), se inserta antes de cerrar: base → laterales → interiores →
 * fondo → tapa → accesorios.
 *
 * @param {Array} pieces piezas CSV del módulo activo (o 'all')
 * @param {Map<string, number>} [positions] posición z real por pieza (mm),
 *   típicamente desde las geometrías 3D; mejora el intercalado repisa/divisor
 * @returns {{ steps: Array<{paso:number, piezas:string[]}>, totalPasos: number, totalPiezas: number }}
 */
export function buildAssemblySequence(pieces, positions = null) {
  const moduleInfo = analyzeModules(pieces);
  const preTopBackModules = detectPreTopBackModules(moduleInfo);
  const interiorKeys = buildInteriorKeys(pieces, positions, moduleInfo);
  const sorted = [...pieces].sort((a, b) => {
    const ga = isGlobalPiece(a) ? 1 : 0;
    const gb = isGlobalPiece(b) ? 1 : 0;
    if (ga !== gb) return ga - gb;

    const ma = String(a.modulo || '').trim();
    const mb = String(b.modulo || '').trim();
    if (ma !== mb) return ma.localeCompare(mb, undefined, { numeric: true });

    const roleA = classifySequenceRole(a);
    const roleB = classifySequenceRole(b);
    let ca = categoryFor(roleA, preTopBackModules.has(ma));
    let cb = categoryFor(roleB, preTopBackModules.has(mb));
    if (roleA === 'inferior' && isInsetPanel(a, moduleInfo)) ca = CATEGORY_ORDER.inferiorInterno;
    if (roleB === 'inferior' && isInsetPanel(b, moduleInfo)) cb = CATEGORY_ORDER.inferiorInterno;
    if (ca !== cb) return ca - cb;

    if (roleA === 'lateral') {
      const sa = sideRank(a);
      const sb = sideRank(b);
      if (sa !== sb) return sa - sb;
    } else if (roleA === 'interior') {
      const ka = interiorKeys.get(a.id) ?? 0;
      const kb = interiorKeys.get(b.id) ?? 0;
      if (ka !== kb) return ka - kb;
      // misma clave: verticales (soporte) antes que el horizontal que apoyan
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
