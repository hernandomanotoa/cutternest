// js/services/railService.js — Tipos de riel y su efecto en la caja del cajón
// Lógica pura, sin DOM ni SVG. Infieren el tipo de riel de una pieza por
// keywords en su nombre/id y calculan el ancho exterior de la caja según la
// holgura que ocupa el riel en el vano. Las constantes de catálogo viven en
// js/core/config.js (RAIL_TYPES).

import { normalizeName } from '../utils/normalize.js';
import { RAIL_TYPES, DEFAULT_RAIL_TYPE } from '../core/config.js';

const KEYWORDS_OCULTA = ['ocult', 'tandem', 'movento', 'matrix um', 'matrix-um'];
const KEYWORDS_RUEDAS = ['ruedas', 'roller'];
// 'ligera' exige pieza ligera (bandeja/zapatera) + mención explícita de riel:
// las zapateras del catálogo usan telescópicas de extensión total salvo que
// el nombre diga lo contrario.
const KEYWORDS_LIGERA_PIEZA = ['ligera', 'bandeja', 'zapatera', 'zapatero'];
const KEYWORDS_LIGERA_RIEL = ['riel', 'corredera', 'corrediza'];

/**
 * Tipo de riel inferido de una pieza (frente de cajón/zapatera), por keywords
 * en nombre/id normalizados. Orden de precedencia: oculta > ruedas > ligera;
 * sin evidencia devuelve defaultType (telescópica por defecto: es el riel
 * estándar del catálogo y de los ejemplos de zapatera extraíble).
 */
export function inferRailType(piece, defaultType = DEFAULT_RAIL_TYPE) {
  const text = `${normalizeName(piece?.nombre)} ${normalizeName(piece?.id)}`;
  if (KEYWORDS_OCULTA.some((k) => text.includes(k))) return 'oculta';
  if (KEYWORDS_RUEDAS.some((k) => text.includes(k))) return 'ruedas';
  const piezaLigera = KEYWORDS_LIGERA_PIEZA.some((k) => text.includes(k));
  const rielExplicito = KEYWORDS_LIGERA_RIEL.some((k) => text.includes(k));
  if (piezaLigera && rielExplicito) return 'ligera';
  return defaultType;
}

/**
 * Tipo efectivo garantizado: si la inferencia (o el default recibido) no
 * existe en RAIL_TYPES, cae a DEFAULT_RAIL_TYPE.
 */
export function railTypeFor(piece, defaultType = DEFAULT_RAIL_TYPE) {
  const type = inferRailType(piece, defaultType);
  return RAIL_TYPES[type] ? type : DEFAULT_RAIL_TYPE;
}

/** Lookup seguro de la definición de un tipo, con fallback a telescópica. */
export function getRailType(type) {
  return RAIL_TYPES[type] || RAIL_TYPES[DEFAULT_RAIL_TYPE];
}

/**
 * Ancho EXTERIOR de la caja para un vano de frente dado. Los tipos con
 * sideClearance descuentan la holgura del riel por lado (laterales/ruedas/
 * ligera); la oculta (sideClearance 0) no descuenta nada porque su
 * deducción de −42 mm es del ancho interior, no del exterior. espLateral se
 * acepta por simetría con los cálculos de la caja: la holgura del riel es
 * independiente del espesor del lateral.
 */
export function boxExteriorWidth(frontWidth, espLateral = 0, type = DEFAULT_RAIL_TYPE) {
  const clearance = getRailType(type).sideClearance || 0;
  return Math.max(0, frontWidth - 2 * clearance);
}
