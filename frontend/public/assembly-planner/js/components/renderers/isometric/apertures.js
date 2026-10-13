/**
 * Apertura de puertas/cajones: fracción efectiva y aplicación del transform
 * (rotación bisagra / traslación corrediza) a puertas y sus tiradores.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import {
  applyApertureToGeo,
  motionConfigFor,
  opennessFor,
} from '../../../services/motionService.js';
import { handleBelongsToDoor } from './handleMatching.js';

/**
 * Apertura global efectiva: la explícita (setApertura/opciones) gana; si no
 * hay, el doorAngle legacy se convierte a fracción de apertura (105° = 1).
 */
export function aperturaEfectivaGlobal(aperturaGlobal, doorAngle) {
  if (aperturaGlobal != null) return aperturaGlobal;
  return Math.min(1, (doorAngle || 0) / 105);
}

/**
 * Aplica la apertura a las puertas y propaga el transform a su tirador
 * emparejado: la MISMA rotation (bisagra: mismo pivote/ángulo, las esquinas
 * rotan alrededor del mismo eje) o la MISMA traslación x (corrediza). Las
 * piezas de cajón y sus tiradores se mueven con el frente en
 * buildDrawerGeometries (rail +y) y aquí se ignoran para no duplicar.
 */
export function applyAperturas(renderer, geometries) {
  const doorMoves = [];
  const moved = geometries.map((geo) => {
    if (geo.role !== 'door') return geo;
    const cfg = motionConfigFor({ id: geo.id, nombre: geo.name });
    if (!cfg) return geo;
    const open = opennessFor(geo.id, renderer.aperturas, aperturaEfectivaGlobal(renderer.aperturaGlobal, renderer.doorAngle));
    const next = applyApertureToGeo(geo, cfg, open, renderer.angulos?.[geo.id]);
    if (!next.rotation) {
      if (next.x !== geo.x) doorMoves.push({ geo, next });
      return next;
    }
    // El servicio devuelve pivot sin y (contrato estable); el renderer fija
    // la línea de bisagra en el plano de la puerta (centro en y) para que
    // la rotación sea rígida y no alrededor del origen del módulo.
    const withPivot = {
      ...next,
      rotation: {
        ...next.rotation,
        pivot: { ...next.rotation.pivot, y: geo.y + geo.d / 2 },
      },
    };
    doorMoves.push({ geo, next: withPivot });
    return withPivot;
  });
  if (!doorMoves.length) return moved;
  return moved.map((geo) => {
    if (geo.role !== 'handle') return geo;
    const move = doorMoves.find((m) =>
      handleBelongsToDoor(geo, m.geo));
    if (!move) return geo;
    if (move.next.rotation) return { ...geo, rotation: move.next.rotation };
    return { ...geo, x: geo.x + (move.next.x - move.geo.x) };
  });
}
