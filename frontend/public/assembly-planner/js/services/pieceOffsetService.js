// js/services/pieceOffsetService.js — Lógica pura de offsets/gaps por pieza.
// Sin DOM. Determina el tipo de offset, valores por defecto y lectura de overrides.

import { VERTICAL_POSITIONS } from '../core/config.js';
import { inferRole, isShoeRack } from './classifierService.js';
import { normalizeName } from '../utils/normalize.js';

/**
 * Agrupa instancias expandidas de una misma pieza original (cantidad > 1).
 * Devuelve un array de grupos con la pieza representativa, el id original y la cantidad.
 */
export function groupPiecesByOriginalId(pieces) {
  const map = new Map();
  pieces.forEach((p) => {
    const originalId = p.originalId || p.id;
    if (!map.has(originalId)) {
      map.set(originalId, { originalId, piece: p, count: 0, instances: [] });
    }
    const group = map.get(originalId);
    group.count += 1;
    group.instances.push(p);
  });
  return Array.from(map.values());
}

/**
 * Indica si una pieza se representa en la tabla de offsets.
 * Se excluyen piezas meramente estructurales o que no admiten offset/gap útil.
 */
export function isConfigurablePiece(piece) {
  const role = inferRole(piece);
  const excluded = new Set([
    'back_panel',
    'side_panel',
    'drawer_side',
    'drawer_bottom',
    'drawer_back',
    'handle',
    'glass',
    'panel',
  ]);
  return !excluded.has(role);
}

/**
 * Tipo de offset según orientación y zona.
 * - 'base': distancia desde la cara superior de la base.
 * - 'top': inset desde la cara inferior de la tapa.
 * - 'absolute': altura fija desde el suelo (riel/asiento).
 * - 'side': offset horizontal para piezas verticales (patas).
 * - 'depth': receso desde el frente (zócalos frontales).
 * - 'none': pieza no configurable.
 */
export function getPieceOffsetType(piece, zone) {
  const role = inferRole(piece);
  if (role === 'plinth') return 'depth';
  if (role === 'hanger_rail' || role === 'seat_panel') return 'absolute';
  if (role === 'mirror' || zone === 'top') return 'top';
  if (role === 'leg') return 'side';
  if (role === 'side_panel' || role === 'back_panel') return 'none';
  // Divisor vertical: offset desde la base e inset superior (reutilizado como gap).
  if (role === 'divider') return 'base';
  return 'base';
}

/**
 * Placeholder adecuado para el input de offset/inset.
 */
export function getOffsetPlaceholder(piece, zone) {
  const type = getPieceOffsetType(piece, zone);
  const role = inferRole(piece);
  if (role === 'bottom_panel') return 'Altura desde suelo (mm)';
  if (role === 'top_panel') return 'Inset desde tapa (mm)';
  if (role === 'divider') return 'Offset inferior (mm)';
  switch (type) {
    case 'top':
      return 'Inset superior (mm)';
    case 'absolute':
      return 'Altura desde suelo (mm)';
    case 'side':
      return 'Offset lateral (mm)';
    case 'depth':
      return 'Receso desde frente (mm)';
    case 'base':
    default:
      return 'Offset desde base (mm)';
  }
}

/**
 * Placeholder adecuado para el input de gap.
 * Para divisores verticales el gap representa el inset superior.
 */
export function getGapPlaceholder(piece, zone) {
  const role = inferRole(piece);
  if (role === 'divider') return 'Inset superior (mm)';
  return 'Gap entre piezas (mm)';
}

function defaultValue(key, globalOverrides = {}) {
  const override = Number(globalOverrides[key]);
  return Number.isFinite(override) ? override : Number(VERTICAL_POSITIONS[key]) || 0;
}

/**
 * Determina la zona vertical de una pieza para elegir el offset/gap por defecto.
 * Es compatible con la clasificación del servicio de posicionamiento.
 */
export function getPieceZone(piece) {
  const role = inferRole(piece);
  const n = normalizeName(piece?.nombre || '');
  const id = normalizeName(piece?.id || '');
  const text = `${n} ${id}`;

  if (isShoeRack(piece)) return 'fixed-bottom';

  if (
    text.includes('superior') ||
    text.includes('sup') ||
    text.includes('alto') ||
    text.includes('top')
  ) {
    return 'top';
  }

  if (
    text.includes('inferior') ||
    text.includes('inf') ||
    text.includes('bajo') ||
    text.includes('bottom')
  ) {
    return 'bottom';
  }

  const isShelfLike =
    n.includes('repisa') ||
    n.includes('estante') ||
    id.includes('repisa') ||
    id.includes('estante');
  if (isShelfLike && (n.includes('base') || id.includes('base'))) return 'bottom';

  if (role === 'bottom_panel') return 'bottom';
  if (role === 'drawer_face') return 'drawer';
  if (role === 'brace') return 'brace';

  if (text.includes('medio') || text.includes('central') || text.includes('centro')) return 'middle';

  return 'middle';
}

/**
 * Valor por defecto de offset/inset para una pieza.
 */
export function getDefaultOffset(piece, zone = getPieceZone(piece), globalOverrides = {}) {
  const role = inferRole(piece);

  if (role === 'plinth') return 0;

  if (role === 'bottom_panel') return defaultValue('bottomPanelOffset', globalOverrides);

  if (role === 'shelf') {
    if (zone === 'fixed-bottom') return defaultValue('shoeRackBaseOffset', globalOverrides);
    if (zone === 'bottom') return defaultValue('shelfBaseOffset', globalOverrides);
    if (zone === 'top') return defaultValue('shelfTopInset', globalOverrides);
    if (zone === 'middle') return defaultValue('shelfMiddleBaseOffset', globalOverrides);
    return defaultValue('shelfMiddleBaseOffset', globalOverrides);
  }

  if (role === 'drawer_face') return defaultValue('drawerBaseOffset', globalOverrides);

  if (role === 'door') {
    return zone === 'top'
      ? defaultValue('doorTopInset', globalOverrides)
      : defaultValue('doorBaseOffset', globalOverrides);
  }

  if (role === 'brace') {
    return zone === 'top'
      ? defaultValue('braceTopInset', globalOverrides)
      : defaultValue('braceBaseOffset', globalOverrides);
  }

  if (role === 'mirror') return defaultValue('mirrorTopInset', globalOverrides);
  if (role === 'hanger_rail') return defaultValue('hangerRailHeight', globalOverrides);
  if (role === 'seat_panel') return defaultValue('seatHeight', globalOverrides);
  if (role === 'leg') return defaultValue('legOffsetX', globalOverrides);
  if (role === 'divider') return defaultValue('dividerBaseOffset', globalOverrides);

  return 0;
}

/**
 * Valor por defecto de gap entre piezas del mismo tipo.
 */
export function getDefaultGap(piece, zone = getPieceZone(piece), globalOverrides = {}) {
  const role = inferRole(piece);

  if (role === 'shelf') {
    if (zone === 'fixed-bottom') return defaultValue('shoeRackGap', globalOverrides);
    if (zone === 'middle') return defaultValue('shelfMiddleGap', globalOverrides);
    if (zone === 'bottom') return defaultValue('defaultGap', globalOverrides);
    if (zone === 'top') return defaultValue('defaultGap', globalOverrides);
  }

  if (role === 'drawer_face') return defaultValue('drawerFaceGap', globalOverrides);
  if (role === 'door') return defaultValue('doorGap', globalOverrides);
  if (role === 'brace') return defaultValue('defaultGap', globalOverrides);
  if (role === 'mirror') return defaultValue('defaultGap', globalOverrides);
  if (role === 'hanger_rail') return defaultValue('defaultGap', globalOverrides);
  if (role === 'seat_panel') return defaultValue('defaultGap', globalOverrides);
  if (role === 'leg') return defaultValue('legOffsetY', globalOverrides);
  if (role === 'divider') return defaultValue('dividerTopInset', globalOverrides);

  return defaultValue('defaultGap', globalOverrides);
}

/**
 * Configuración efectiva de offset/gap para una pieza, combinando defaults con overrides del usuario.
 */
export function getPieceOffsetConfig(
  piece,
  zone = getPieceZone(piece),
  userConfig = {},
  globalOverrides = {}
) {
  const originalId = piece?.originalId || piece?.id;
  const overrides = userConfig?.pieceOffsets?.[originalId] || {};
  const offset = Number.isFinite(overrides.offset)
    ? overrides.offset
    : getDefaultOffset(piece, zone, globalOverrides);
  const gap = Number.isFinite(overrides.gap)
    ? overrides.gap
    : getDefaultGap(piece, zone, globalOverrides);
  return { offset, gap, zone, type: getPieceOffsetType(piece, zone) };
}

/**
 * Determina si se debe mostrar el campo de gap para una pieza.
 * Se muestra si hay más de una pieza del mismo rol (o rol+zona) en la lista.
 */
export function shouldShowGap(piece, pieces, useZone = true) {
  const role = inferRole(piece);
  if (role === 'divider') return true;
  const zone = useZone ? getPieceZone(piece) : null;
  return pieces.filter((p) => {
    if (inferRole(p) !== role) return false;
    return useZone ? getPieceZone(p) === zone : true;
  }).length > 1;
}

/**
 * Etiqueta legible del tipo de pieza para la tabla.
 */
export function getPieceTypeLabel(piece) {
  const role = inferRole(piece);
  const labels = {
    shelf: isShoeRack(piece) ? 'Zapatero' : 'Entrepaño',
    drawer_face: 'Frente cajón',
    door: 'Puerta',
    brace: 'Travesaño',
    mirror: 'Espejo',
    hanger_rail: 'Riel colgador',
    seat_panel: 'Asiento',
    leg: 'Pata',
    bottom_panel: 'Base',
    plinth: 'Zócalo',
    top_panel: 'Tapa',
    back_panel: 'Fondo',
    side_panel: 'Lateral',
    divider: 'Divisor',
  };
  return labels[role] || 'Pieza';
}
