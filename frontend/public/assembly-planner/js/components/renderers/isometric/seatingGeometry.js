/**
 * Geometría de asientos (familia 'seating'): asiento, respaldo, patas y
 * travesaños.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { ROLE_COLORS } from '../../../core/config.js';
import { getPieceDims } from '../../../services/geometryService.js';
import { normalizeName } from '../../../utils/normalize.js';

export function buildSeatingGeometries(roles, moduleW, moduleD, moduleH, thickness) {
  const geometries = [];
  const seat = roles.find((p) => p.role === 'seat_panel');
  const back = roles.find((p) => p.role === 'back_panel');
  const legs = roles.filter((p) => p.role === 'leg');
  const braces = roles.filter((p) => p.role === 'brace');

  const seatDims = seat ? getPieceDims(seat, 'seat_panel', thickness, 'seating') : { w: moduleW, h: thickness };
  const seatW = seatDims.w || moduleW;
  const seatH = seatDims.h || thickness;
  const seatX = Math.max(0, (moduleW - seatW) / 2);

  const legDim = legs.length ? getPieceDims(legs[0], 'leg', thickness, 'seating') : { w: 40, h: 450 };
  const legW = legDim.w || 40;
  const legH = legDim.h || 450;

  const backH = back ? Number(back.alto) || moduleH - legH - seatH : 0;

  // Asiento horizontal
  if (seat) {
    geometries.push({
      x: seatX, y: 0, z: legH, w: seatW, d: moduleD, h: seatH,
      color: seat.color, role: 'seat_panel', name: seat.nombre, id: seat.id,
    });
  }

  // Respaldo vertical en borde trasero
  if (back) {
    geometries.push({
      x: seatX, y: 0, z: legH + seatH, w: seatW, d: thickness, h: backH,
      color: back.color, role: 'back_panel', name: back.nombre, id: back.id,
    });
  }

  // Patas en las 4 esquinas del asiento (desde el suelo z=0 hacia arriba)
  const inset = 20;
  const legPositions = [
    { x: seatX + inset, y: inset },
    { x: seatX + seatW - legW - inset, y: inset },
    { x: seatX + inset, y: moduleD - legW - inset },
    { x: seatX + seatW - legW - inset, y: moduleD - legW - inset },
  ];
  legs.forEach((leg, i) => {
    const pos = legPositions[i] || legPositions[0];
    geometries.push({
      x: pos.x, y: pos.y, z: 0, w: legW, d: legW, h: legH,
      color: leg.color || ROLE_COLORS.leg, role: 'leg', name: leg.nombre, id: leg.id,
    });
  });

  // Travesaños de refuerzo entre patas
  braces.forEach((brace) => {
    const dims = getPieceDims(brace, 'brace', thickness, 'seating');
    const isFront = normalizeName(brace.nombre).includes('front');
    const y = isFront ? moduleD - thickness : 0;
    geometries.push({
      x: seatX + inset, y, z: legH / 2, w: seatW - 2 * inset, d: thickness, h: dims.h,
      color: brace.color, role: 'brace', name: brace.nombre, id: brace.id,
    });
  });

  return geometries;
}
