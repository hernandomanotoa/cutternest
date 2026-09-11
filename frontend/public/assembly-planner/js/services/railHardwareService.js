// js/services/railHardwareService.js — Textos de herrajes e instrucciones por tipo de riel
// Lógica pura, sin DOM ni SVG. A partir de RAIL_TYPES (js/core/config.js) y de
// la inferencia de railService genera: el nombre/especificación de la entrada
// de herrajes por tipo de corredera, el mensaje del nodo bloqueo de
// confirmación y el texto de instrucción de armado de cajones. Los valores
// numéricos son los del catálogo (Häfele/Blum) y deben verificarse contra la
// ficha técnica antes de producción.

import { DEFAULT_RAIL_TYPE } from '../core/config.js';
import { railTypeFor } from './railService.js';

const NOMBRES = {
  telescopica: 'Correderas telescópicas',
  oculta: 'Correderas ocultas',
  ruedas: 'Correderas euro ruedas',
  ligera: 'Correderas ligeras',
};

const ESPECIFICACIONES = {
  telescopica: 'Extensión total — la caja ocupa 12,7 mm por lado (ancho = vano − 25,4 mm)',
  oculta: 'Extensión total — ancho interior de cajón = vano − 42 mm; rebajo inferior 12,7 mm; alto de cajón = vano − 23 mm',
  ruedas: 'Extensión parcial (~75%) — 12,5 mm por lado (ancho = vano − 25 mm)',
  ligera: 'Extensión parcial (~75%) — 10 mm por lado, uso ligero/bandejas',
};

const CONFIRMACIONES = {
  telescopica: 'Confirmar corredera telescópica (vano − 25,4 mm) antes de cortar',
  oculta: 'Confirmar corredera oculta (vano − 42 mm) antes de cortar',
  ruedas: 'Confirmar corredera de ruedas (vano − 25 mm) antes de cortar',
  ligera: 'Confirmar corredera ligera (vano − 20 mm) antes de cortar',
};

const INSTALACIONES = {
  telescopica: 'Instalar correderas telescópicas de extensión total (vano − 25,4 mm), ya confirmadas.',
  oculta: 'Instalar correderas ocultas (ancho interior = vano − 42 mm; alto = vano − 23 mm), ya confirmadas.',
  ruedas: 'Instalar correderas de ruedas de extensión parcial (~75%, vano − 25 mm), ya confirmadas.',
  ligera: 'Instalar correderas ligeras de extensión parcial (~75%, uso ligero/bandejas), ya confirmadas.',
};

/** Nombre de la entrada de herrajes para un tipo de riel (fallback telescópica). */
export function railHardwareName(type) {
  return NOMBRES[type] || NOMBRES[DEFAULT_RAIL_TYPE];
}

/** Especificación con las cotas reales del tipo (fallback telescópica). */
export function railHardwareSpec(type) {
  return ESPECIFICACIONES[type] || ESPECIFICACIONES[DEFAULT_RAIL_TYPE];
}

/** Mensaje del pseudo-nodo bloqueo de confirmación, inferido de la pieza. */
export function railConfirmationMessage(piece) {
  return CONFIRMACIONES[railTypeFor(piece)] || CONFIRMACIONES[DEFAULT_RAIL_TYPE];
}

/** Texto de instrucción de instalación para una pieza de cajón/zapatera. */
export function railInstallText(piece) {
  return INSTALACIONES[railTypeFor(piece)] || INSTALACIONES[DEFAULT_RAIL_TYPE];
}
