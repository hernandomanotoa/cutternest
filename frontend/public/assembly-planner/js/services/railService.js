// js/services/railService.js — Tipos de riel y su efecto en la caja del cajón
// Lógica pura, sin DOM ni SVG. Infieren el tipo de riel de una pieza por
// keywords en su nombre/id y calculan el ancho exterior de la caja según la
// holgura que ocupa el riel en el vano. Las constantes de catálogo viven en
// js/core/config.js (RAIL_TYPES).

import { normalizeName } from '../utils/normalize.js';
import { RAIL_TYPES, DEFAULT_RAIL_TYPE } from '../core/config.js';

const KEYWORDS_OCULTA = ['ocult', 'tandem', 'movento', 'matrix um', 'matrix-um'];
const KEYWORDS_RUEDAS = ['ruedas', 'roller'];
const KEYWORDS_TELESCOPICA26 = ['telescopica 26', 'telescopica-26', 'regla 26', 'vano 26'];
const KEYWORDS_MARCO = ['marco regulable', 'marco de aluminio'];
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
  if (KEYWORDS_MARCO.some((k) => text.includes(k))) return 'marco';
  if (KEYWORDS_TELESCOPICA26.some((k) => text.includes(k))) return 'telescopica26';
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

/**
 * Ancho interior esperado de base/fondo/cara del cajón para un frente de
 * ancho dado (vano = frente + 2), según el tipo de riel (RAIL_TYPES):
 *   - oculta (interiorDeduction > 0): vano − interiorDeduction —la deducción
 *     es del ancho INTERIOR (Blum Tandem/Häfele Matrix UM);
 *   - telescópica/ruedas/ligera: round(vano − 2·sideClearance) − 2·espLateral
 *     —la caja mide el interior entre laterales.
 * No aplica a volquetes/abatibles: su caja se deriva del frente (modelo
 * clásico, ver csvParser.js).
 */
export function drawerBoxInteriorWidth(frontWidth, espLateral = 0, type = DEFAULT_RAIL_TYPE) {
  const rail = getRailType(type);
  const vano = frontWidth + 2;
  if (Number(rail.interiorDeduction) > 0) {
    return Math.max(0, vano - Number(rail.interiorDeduction));
  }
  return Math.max(0, Math.round(vano - 2 * (rail.sideClearance || 0)) - 2 * espLateral);
}

/**
 * Altura máxima de la caja del cajón (laterales y fondo) para un vano de
 * altura dada (vano = frente + 2), según el tipo de riel. La oculta capa el
 * cajón a vano − maxHeightDeduction (tope de catálogo); los demás tipos no
 * imponen tope más allá del propio vano.
 */
export function drawerBoxMaxHeight(vanoHeight, type = DEFAULT_RAIL_TYPE) {
  const rail = getRailType(type);
  return Math.max(0, vanoHeight - (Number(rail.maxHeightDeduction) || 0));
}
