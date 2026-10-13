/**
 * Estilos de pieza: colores de caras, z-index por rol, trazos y etiquetas.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { Z_INDEX as Z_INDEX_CONFIG, ROLE_COLORS } from '../../../core/config.js';
import { isShoeRack } from '../../../services/classifierService.js';
import { normalizeName } from '../../../utils/normalize.js';

export function adjustColor(hex, percent) {
  const clean = String(hex || ROLE_COLORS.wood).replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(percent * 2.55)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + Math.round(percent * 2.55)));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + Math.round(percent * 2.55)));
  return `rgb(${r},${g},${b})`;
}

export function getFaceColors(baseColor) {
  return {
    front: baseColor,
    top: adjustColor(baseColor, 20),
    right: adjustColor(baseColor, -20),
  };
}

export function getZIndex(role) {
  return Z_INDEX_CONFIG[role] ?? 10;
}

export function getStroke(role) {
  const strokes = {
    back_panel: { color: ROLE_COLORS.back_panel, width: 1 },
    side_panel: { color: ROLE_COLORS.side_panel, width: 1.5 },
    side_panel_rear: { color: ROLE_COLORS.side_panel, width: 1.5 },
    side_panel_front: { color: ROLE_COLORS.side_panel, width: 1.5 },
    plinth: { color: ROLE_COLORS.plinth, width: 1.5 },
    bottom_panel: { color: ROLE_COLORS.bottom_panel, width: 1.5 },
    top_panel: { color: ROLE_COLORS.top_panel, width: 1.5 },
    shelf: { color: ROLE_COLORS.shelf, width: 1 },
    divider: { color: ROLE_COLORS.divider, width: 1 },
    drawer_face: { color: ROLE_COLORS.drawer_face, width: 2 },
    drawer_side: { color: ROLE_COLORS.drawer_side, width: 1 },
    drawer_bottom: { color: ROLE_COLORS.drawer_bottom, width: 1 },
    drawer_back: { color: ROLE_COLORS.drawer_back, width: 1 },
    drawer_divider: { color: ROLE_COLORS.drawer_divider, width: 1 },
    door: { color: ROLE_COLORS.door, width: 2 },
    mirror: { color: ROLE_COLORS.mirror, width: 1 },
    handle: { color: ROLE_COLORS.handle, width: 1 },
    leg: { color: ROLE_COLORS.leg, width: 2 },
    brace: { color: ROLE_COLORS.brace, width: 1 },
    hanger_rail: { color: ROLE_COLORS.hanger_rail, width: 2 },
    headboard: { color: ROLE_COLORS.headboard, width: 1.5 },
    bed_bottom: { color: ROLE_COLORS.bed_bottom, width: 1 },
    bed_slat: { color: ROLE_COLORS.bed_slat, width: 1 },
  };
  return strokes[role] || { color: ROLE_COLORS.default, width: 1 };
}

export function makeLabel(geo) {
  if (geo.role === 'handle') return '';
  const words = String(geo.name || '').split(/\s+/).slice(0, 2);
  if (geo.role === 'side_panel') return normalizeName(geo.name).includes('izquierdo') ? 'Lat.Izq' : 'Lat.Der';
  if (geo.role === 'drawer_face') return 'Cajón';
  if (geo.role === 'shelf') return isShoeRack({ nombre: geo.name, id: geo.id }) ? 'Zapatero' : 'Repisa';
  if (geo.role === 'door') return 'Puerta';
  return words.join(' ');
}
