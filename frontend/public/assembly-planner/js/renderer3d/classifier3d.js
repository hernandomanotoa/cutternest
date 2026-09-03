// js/renderer3d/classifier3d.js — Clasificación de piezas para transparencia/explode
// Lógica pura, sin DOM.

import { inferRole } from '../services/classifierService.js';
import { normalizeName } from '../utils/normalize.js';

/**
 * Clasifica una pieza en capas visuales para transparencia y explode.
 * @param {Object} piece pieza con {id, name, role}
 * @returns {'envelope' | 'interior' | 'structural'}
 */
export function classifyPiece(piece) {
  const role = piece.role || inferRole(piece.raw || piece);
  const n = normalizeName(piece.name || piece.nombre || '');
  const id = normalizeName(piece.id || '');
  const text = `${n} ${id}`;

  // Envelope: forman la caja exterior
  if (
    role === 'side_panel' ||
    role === 'side_panel_front' ||
    role === 'side_panel_rear' ||
    role === 'back_panel' ||
    role === 'top_panel' ||
    role === 'door' ||
    role === 'glass' ||
    role === 'front_panel' ||
    role === 'mirror' ||
    text.includes('tapa') ||
    text.includes('zocalo') ||
    text.includes('plinth')
  ) {
    return 'envelope';
  }

  // Structural: base (estructural pero visible)
  if (role === 'bottom_panel' || role === 'plinth') {
    return 'structural';
  }

  // Interior: estantes, repisas, divisiones, barras, cajones, tiradores
  if (
    role === 'shelf' ||
    role === 'divider' ||
    role === 'hanger_rail' ||
    role === 'brace' ||
    role === 'drawer_face' ||
    role === 'drawer_side' ||
    role === 'drawer_bottom' ||
    role === 'drawer_back' ||
    role === 'handle' ||
    role === 'leg' ||
    role === 'seat_panel'
  ) {
    return 'interior';
  }

  return 'interior';
}
