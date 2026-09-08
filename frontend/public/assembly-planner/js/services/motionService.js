// js/services/motionService.js — Apertura interactiva de puertas, cajones y zapateras
// Lógica pura, sin DOM. Usa js/utils/normalize.js para comparaciones de nombres.
//
// Convenciones de geometría:
//   - Caja {x,y,z,w,d,h}: esquina origen en (x,y,z); w ancho, d profundidad, h alto.
//   - z = arriba; y = profundidad (frente del mueble = +y).
//   - hinge (bisagra): axis 'z' rota en el plano x-y (puerta lateral);
//     axis 'x' rota en el plano y-z (trampilla superior/inferior).

import { normalizeName } from '../utils/normalize.js';
import { inferRole } from './classifierService.js';

const APERTURE_DEG = 105;

function sideFromText(text, fallback) {
  if (text.includes('izquierda') || text.includes('izq')) return 'izq';
  if (text.includes('derecha') || text.includes('der')) return 'der';
  if (text.includes('superior') || text.includes('sup')) return 'sup';
  if (text.includes('inferior') || text.includes('inf')) return 'inf';
  return fallback;
}

/**
 * Configuración de apertura para una pieza, o null si no tiene movimiento.
 * kind: 'hinge' (bisagra), 'slide' (corrediza lateral), 'rail' (riel de cajón).
 * side: 'izq'|'der'|'sup'|'inf' para bisagra/corrediza; null para rail.
 */
export function motionConfigFor(piece) {
  if (!piece) return null;
  const role = inferRole(piece);
  const n = normalizeName(piece.nombre);
  const id = normalizeName(piece.id);
  const text = `${n} ${id}`;

  // Tirador: rail solo si pertenece a cajón/zapatera; tirador de puerta no se
  // mueve. Se evalúa antes que 'door' porque inferRole clasifica "Tirador
  // puerta" como puerta por contener la palabra 'puerta'.
  if (role === 'handle' || n.includes('tirador')) {
    if (n.includes('abatible') || n.includes('volquete')) {
      return { kind: 'hinge', side: 'inf' };
    }
    if (n.includes('cajon') || n.includes('zapatera') || n.includes('zapatero')) {
      return { kind: 'rail', side: null };
    }
    return null;
  }

  if (role === 'door') {
    if (text.includes('corrediza')) {
      // Corrediza lateral: solo keywords izq/der, default 'izq'.
      const side = text.includes('derecha') || text.includes('der') ? 'der' : 'izq';
      return { kind: 'slide', side };
    }
    return { kind: 'hinge', side: sideFromText(text, 'der') };
  }

  if (role === 'drawer_face' || role === 'drawer_side' || role === 'drawer_bottom' ||
      role === 'drawer_back' || role === 'drawer_part') {
    // Volquete/abatible: pivota hacia adelante sobre bisagras inferiores,
    // no se desliza. Toda la familia (frente, lados, fondo, tirador) hereda
    // la misma config para rotar en conjunto.
    if (text.includes('abatible') || text.includes('volquete')) {
      return { kind: 'hinge', side: 'inf' };
    }
    return { kind: 'rail', side: null };
  }

  return null;
}

/**
 * Aplica una apertura (0..1) a una geometría de caja y devuelve un NUEVO objeto.
 * - slide: traslada en x (±0.95·w, signo según side).
 * - rail: traslada en +y (0.85·d), hacia el frente del mueble.
 * - hinge: no traslada; adjunta rotation { axis, angleDeg, pivot }.
 */
export function applyApertureToGeo(geo, config, openness) {
  const t = Math.min(1, Math.max(0, Number(openness) || 0));
  if (!config || t === 0) return { ...geo };

  if (config.kind === 'slide') {
    const sign = config.side === 'der' ? 1 : -1;
    return { ...geo, x: geo.x + sign * t * geo.w * 0.95 };
  }

  if (config.kind === 'rail') {
    return { ...geo, y: geo.y + t * geo.d * 0.85 };
  }

  if (config.kind === 'hinge') {
    let rotation;
    if (config.side === 'izq' || config.side === 'der') {
      rotation = {
        axis: 'z',
        angleDeg: (config.side === 'izq' ? 1 : -1) * t * APERTURE_DEG,
        pivot: { x: config.side === 'izq' ? geo.x : geo.x + geo.w },
      };
    } else {
      // Trampilla (eje x): el lado libre bascula hacia +y (frente del
      // mueble) en ambos casos: 'inf' (bisagra abajo, libre arriba) abre con
      // ángulo negativo; 'sup' (bisagra arriba, libre abajo) con positivo.
      rotation = {
        axis: 'x',
        angleDeg: (config.side === 'sup' ? 1 : -1) * t * APERTURE_DEG,
        pivot: { z: config.side === 'sup' ? geo.z + geo.h : geo.z },
      };
    }
    return { ...geo, rotation };
  }

  return { ...geo };
}

/**
 * Esquinas de la caja, orden: 4 de abajo (z) y las 4 mismas con z+h.
 * [(x,y,z), (x+w,y,z), (x+w,y+d,z), (x,y+d,z), ...]
 */
export function boxCorners(geo) {
  const { x, y, z, w, d, h } = geo;
  return [
    { x, y, z },
    { x: x + w, y, z },
    { x: x + w, y: y + d, z },
    { x, y: y + d, z },
    { x, y, z: z + h },
    { x: x + w, y, z: z + h },
    { x: x + w, y: y + d, z: z + h },
    { x, y: y + d, z: z + h },
  ];
}

/**
 * Rota cada punto de `corners` según `rotation` { axis, angleDeg, pivot }.
 * - axis 'z': rotación en plano x-y alrededor de la vertical que pasa por
 *   pivot.x (y pivot.y si se da; por defecto 0).
 * - axis 'x': rotación en plano y-z alrededor de la línea a lo ancho que pasa
 *   por pivot.z (y pivot.y si se da; por defecto 0). Un punto por encima del
 *   pivote (dz>0) se mueve hacia −y con ángulo positivo y hacia +y con
 *   ángulo negativo; por debajo del pivote ocurre lo contrario.
 */
export function rotateCorners(corners, rotation) {
  if (!rotation) return corners.map((c) => ({ ...c }));
  const rad = (rotation.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pivotY = rotation.pivot?.y ?? 0;

  return corners.map((c) => {
    if (rotation.axis === 'z') {
      const dx = c.x - rotation.pivot.x;
      const dy = c.y - pivotY;
      return {
        x: rotation.pivot.x + dx * cos - dy * sin,
        y: pivotY + dx * sin + dy * cos,
        z: c.z,
      };
    }
    // axis 'x'
    const dy = c.y - pivotY;
    const dz = c.z - rotation.pivot.z;
    return {
      x: c.x,
      y: pivotY + dy * cos - dz * sin,
      z: rotation.pivot.z + dy * sin + dz * cos,
    };
  });
}

/**
 * Apertura efectiva de una pieza: override por pieza primero, luego global.
 */
export function opennessFor(pieceId, aperturas, aperturaGlobal) {
  return aperturas?.[pieceId] ?? aperturaGlobal ?? 0;
}

/**
 * Decide el toggle de apertura por pieza (doble-click): cualquier valor que
 * no sea "abierto" (override intermedio, 0 o sin override) va a 1; solo un
 * override ya en 1 cierra (0).
 */
export function decideAperturaToggle(valorActual) {
  return Number(valorActual) >= 1 ? 0 : 1;
}
