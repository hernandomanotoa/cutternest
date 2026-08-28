// js/services/classifierService.js — Clasificación de piezas y detección de familia de mueble
// Lógica pura, sin DOM. Usa js/utils/normalize.js para comparaciones de nombres.

import { normalizeName } from '../utils/normalize.js';

export function inferRole(piece) {
  const n = normalizeName(piece.nombre);
  const id = normalizeName(piece.id);

  if ((n.includes('cajon') || id.includes('cajon')) && !n.includes('cajonera')) {
    if (n.includes('frente') || id.includes('frente')) return 'drawer_face';
    if (n.includes('lateral') || id.includes('lateral')) return 'drawer_side';
    if (n.includes('base') || id.includes('base')) return 'drawer_bottom';
    if (n.includes('fondo') || id.includes('fondo')) return 'drawer_back';
    if (n.includes('tirador') || id.includes('tirador')) return 'handle';
    return 'drawer_part';
  }

  if (n.includes('vidrio') || n.includes('cristal') || id.includes('vidrio') || id.includes('cristal')) return 'glass';

  // Estructura principal: base, tapa, laterales y fondo deben tener prioridad
  // sobre nombres compuestos como "Base aparador puertas" o "Lateral derecho vitrina".
  if (n.includes('base')) return 'bottom_panel';
  if (n.includes('tapa') || n.includes('techo') || n.includes('tapa de trabajo')) return 'top_panel';
  if (n.includes('fondo') || n.includes('posterior') || n.includes('trasera')) return 'back_panel';
  if (n.includes('lateral') || n.includes('costado')) return 'side_panel';

  if (n.includes('puerta')) return 'door';
  if (n.includes('tirador') || id.includes('tirador')) return 'handle';
  if (n.includes('riel') || n.includes('barra') || id.includes('riel') || id.includes('barra')) return 'hanger_rail';
  if (n.includes('pata') || (n.includes('pie') && !n.includes('pieza')) || id.includes('pata')) return 'leg';
  if (n.includes('tirante') || n.includes('travesano') || n.includes('refuerzo') || n.includes('cantonera')) return 'brace';

  if (n.includes('zocalo')) return 'bottom_panel';

  if (n.includes('divisor') || n.includes('division')) return 'divider';
  if (n.includes('montante') && (n.includes('central') || n.includes('centro'))) return 'divider';

  if (n.includes('frente')) return 'front_panel';

  if (n.includes('montante') || n.includes('poste')) return 'side_panel';

  if (n.includes('estante') || n.includes('repisa') || n.includes('zapatero') || n.includes('zapatera')) return 'shelf';

  if (n.includes('tablero') || n.includes('superficie')) return 'top_panel';
  if (n.includes('respald') || n.includes('respaldo')) return 'back_panel';
  if (n.includes('asiento') || n.includes('banco')) return 'seat_panel';

  const w = Number(piece.ancho) || 0;
  const h = Number(piece.alto) || 0;
  if (w > h * 3) return 'shelf';
  if (h > w * 3) return 'side_panel';

  if (n.includes('espejo') || n.includes('mirror') || n.includes('marco')) return 'mirror';

  return 'panel';
}

/**
 * Detecta si una pieza debe tratarse como zapatero (estante fijo inferior).
 * Reconoce tanto 'zapatero' como 'zapatera' (y variantes como 'zapateros').
 */
export function isShoeRack(piece) {
  const n = normalizeName(piece?.nombre || '');
  const id = normalizeName(piece?.id || '');
  const text = `${n} ${id}`;
  return /\bzapat(?:ero|era|eros|eras)\b/.test(text);
}

export function detectFamily(pieces, moduleId = null) {
  let list = pieces;
  if (moduleId !== null) {
    const modId = String(moduleId).trim();
    list = pieces.filter((p) => {
      const mod = String(p.modulo || '').trim();
      return mod === modId || mod.startsWith(modId);
    });
  }

  const roles = list.map((p) => inferRole(p));

  if (roles.some((r) => r === 'leg')) {
    if (roles.some((r) => r === 'seat_panel' || r === 'back_panel')) return 'seating';
    return 'table';
  }
  if (roles.some((r) => r === 'door')) return 'wardrobe';
  if (roles.some((r) => r.startsWith('drawer'))) return 'cabinet';

  const shelfCount = roles.filter((r) => r === 'shelf').length;
  const hasMontante = list.some((p) => {
    const n = normalizeName(p.nombre);
    return n.includes('montante') && n.includes('central');
  });
  const hasDividers = roles.filter((r) => r === 'divider').length >= 2;
  if (shelfCount >= 3 && (hasMontante || hasDividers)) return 'shelving';

  return 'cabinet';
}
