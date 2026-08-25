// js/services/geometryService.js — Cálculos geométricos puros del Assembly Planner
// Sin DOM, sin SVG. Solo números y objetos de piezas.

import { inferRole, detectFamily } from './classifierService.js';
import { calculateVerticalPositions } from './verticalPositionService.js';

export function useVisualThickness(alto, espesor) {
  return alto <= espesor * 1.5 ? alto : espesor;
}

export function getPieceDims(piece, role, thickness = 15, family = 'cabinet') {
  const ancho = Number(piece.ancho) || 0;
  const alto = Number(piece.alto) || 0;
  const espesor = Number(piece.espesor) || thickness || 15;
  const rotate = String(piece.rotate).toLowerCase() === 'si';

  let w = ancho;
  let h = alto;
  if (rotate) [w, h] = [h, w];

  if (role === 'top_panel' || role === 'bottom_panel' || role === 'hanger_rail') {
    return { w: ancho, h: useVisualThickness(alto, espesor) };
  }

  if (role === 'seat_panel') {
    if (rotate) [w, h] = [h, w];
    return { w, h: espesor };
  }

  if (role === 'shelf') {
    if (family === 'shelving') return { w: ancho, h: alto };
    return { w: ancho, h: useVisualThickness(alto, espesor) };
  }

  if (role === 'brace') {
    return { w: ancho, h: useVisualThickness(alto, espesor) };
  }

  if (role === 'side_panel') {
    return { w: espesor, h: Math.max(w, h) };
  }

  if (role === 'divider') {
    return { w: ancho, h: Math.max(w, h) };
  }

  if (role === 'back_panel') {
    return { w, h };
  }

  if (role === 'door' || role === 'drawer_face') {
    return { w: ancho, h: alto };
  }

  if (role === 'drawer_bottom' || role === 'drawer_side' || role === 'drawer_back') {
    return { w, h };
  }

  if (role === 'leg') {
    return { w: Math.min(w, h), h: Math.max(w, h) };
  }

  return { w: ancho, h: alto };
}

export function getModuleDimensions(pieces, thickness = 15, family = null) {
  const detectedFamily = family || detectFamily(pieces);
  const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
  const dims = new Map(
    roles.map((p) => [p.id, getPieceDims(p, p.role, thickness, detectedFamily)])
  );

  const inferredThickness =
    roles.length && Number(roles[0].espesor) ? Number(roles[0].espesor) : thickness;

  if (detectedFamily === 'cabinet' || detectedFamily === 'shelving' || detectedFamily === 'wardrobe') {
    const backs = roles.filter((p) => p.role === 'back_panel');
    if (backs.length) {
      const back = backs.sort((a, b) => Number(b.ancho) - Number(a.ancho))[0];
      const { w, h } = dims.get(back.id);
      return { width: w, height: h, thickness: inferredThickness };
    }
  }

  const tops = roles.filter((p) => p.role === 'top_panel').map((p) => dims.get(p.id));
  const bottoms = roles.filter((p) => p.role === 'bottom_panel').map((p) => dims.get(p.id));
  const sides = roles.filter((p) => p.role === 'side_panel').map((p) => dims.get(p.id));
  const legs = roles.filter((p) => p.role === 'leg').map((p) => dims.get(p.id));
  const seats = roles.filter((p) => p.role === 'seat_panel').map((p) => dims.get(p.id));
  const backs = roles.filter((p) => p.role === 'back_panel').map((p) => dims.get(p.id));

  const candidatesW = [...tops, ...bottoms, ...seats, ...backs].map((d) => d.w);
  const moduleW = candidatesW.length ? Math.max(...candidatesW) : 900;

  let moduleH;
  if (legs.length) {
    const legH = Math.max(...legs.map((d) => d.h));
    const topH = tops.length ? Math.max(...tops.map((d) => d.h)) : 0;
    const seatH = seats.length ? Math.max(...seats.map((d) => d.h)) : 0;
    const backH = backs.length ? Math.max(...backs.map((d) => d.h)) : 0;

    if (seats.length && backH) {
      moduleH = backH + seatH + legH;
    } else {
      moduleH = legH + topH;
    }
  } else {
    const sideH = sides.length ? Math.max(...sides.map((d) => d.h)) : 0;
    const verticalRoles = new Set(['side_panel', 'back_panel', 'front_panel', 'mirror', 'divider', 'door']);
    const verticalH = roles.length
      ? Math.max(
          ...roles
            .filter((p) => verticalRoles.has(p.role))
            .map((p) => Number(p.alto) || 0)
            .concat([0])
        )
      : 0;
    moduleH = sideH || verticalH || 600;
  }

  return { width: moduleW, height: moduleH, thickness: inferredThickness };
}

export function shelfRank(name) {
  const n = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('superior') || n.includes('sup')) return 0;
  if (n.includes('medio')) return 1;
  if (n.includes('inferior') || n.includes('inf')) return 2;
  const m = n.match(/(\d+)/);
  if (m) return 100 + parseInt(m[1], 10);
  return 50;
}

export function calculateShelfPositions(moduleH, shelves, thickness, family) {
  if (!shelves.length) return [];

  const positions = calculateVerticalPositions(moduleH, thickness, shelves);
  return positions.map(({ piece, y }) => ({
    piece,
    y,
    h: getPieceDims(piece, 'shelf', thickness, family).h,
  }));
}
