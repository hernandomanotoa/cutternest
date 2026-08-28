// js/services/geometryService.js — Cálculos geométricos puros del Assembly Planner
// Sin DOM, sin SVG. Solo números y objetos de piezas.

import { inferRole, detectFamily } from './classifierService.js';
import { calculateVerticalPositions } from './verticalPositionService.js';
import { DEFAULT_THICKNESS } from '../core/config.js';

export function useVisualThickness(alto, espesor) {
  return alto <= espesor * 1.5 ? alto : espesor;
}

export function getPieceDims(piece, role, thickness = DEFAULT_THICKNESS, family = 'cabinet') {
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

  if (role === 'plinth') {
    // Zócalo frontal: ancho = anchura del módulo, alto = altura del zócalo.
    return { w: ancho, h: alto };
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
    return { w: espesor, h };
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

export function getModuleDimensions(pieces, thickness = DEFAULT_THICKNESS, family = null) {
  const detectedFamily = family || detectFamily(pieces);
  const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
  const dims = new Map(
    roles.map((p) => [p.id, getPieceDims(p, p.role, thickness, detectedFamily)])
  );

  const inferredThickness =
    roles.length && Number(roles[0].espesor) ? Number(roles[0].espesor) : thickness;

  const topRoles = roles.filter((p) => p.role === 'top_panel');
  const bottomRoles = roles.filter((p) => p.role === 'bottom_panel');
  const sideRoles = roles.filter((p) => p.role === 'side_panel');
  const legRoles = roles.filter((p) => p.role === 'leg');
  const seatRoles = roles.filter((p) => p.role === 'seat_panel');
  const backRoles = roles.filter((p) => p.role === 'back_panel');

  const tops = topRoles.map((p) => dims.get(p.id));
  const bottoms = bottomRoles.map((p) => dims.get(p.id));
  const sides = sideRoles.map((p) => dims.get(p.id));
  const legs = legRoles.map((p) => dims.get(p.id));
  const seats = seatRoles.map((p) => dims.get(p.id));
  const backs = backRoles.map((p) => dims.get(p.id));

  // Primera pasada: dimensiones "en bruto" para tener una referencia de
  // ancho/profundidad/altura del módulo.
  const rawW = Math.max(
    0,
    ...[...tops, ...bottoms, ...seats, ...backs].map((d) => d.w)
  );
  // La profundidad real del módulo viene de los laterales (ancho = profundidad)
  // y de base/tapa/asiento (alto = profundidad). El fondo usa alto = altura.
  const rawD = Math.max(
    0,
    ...sideRoles.map((p) => Number(p.ancho) || 0),
    ...topRoles.map((p) => Number(p.alto) || 0),
    ...bottomRoles.map((p) => Number(p.alto) || 0),
    ...seatRoles.map((p) => Number(p.alto) || 0)
  );
  const rawH = Math.max(
    0,
    ...sides.map((d) => d.h),
    ...backs.map((d) => d.h)
  );

  // Normalizar piezas internas a su medida exterior equivalente, de modo que
  // un módulo con base interna pero tapa/fondo externo siga midiendo el ancho
  // exterior correcto.
  function externalSize(piece, role) {
    if (role === 'bottom_panel' || role === 'top_panel') {
      const mount = classifyTopBottomMount(piece, rawW, rawD, inferredThickness);
      if (mount === 'internal') {
        return {
          w: piece.ancho + 2 * inferredThickness,
          h: piece.alto + 2 * inferredThickness,
        };
      }
    }
    if (role === 'back_panel') {
      const mount = classifyBackPanelMount(piece, rawW, rawH, inferredThickness);
      if (mount === 'internal') {
        return {
          w: piece.ancho + 2 * inferredThickness,
          h: piece.alto + 2 * inferredThickness,
        };
      }
    }
    return { w: piece.ancho, h: piece.alto };
  }

  const candidatesW = [];
  const candidatesD = [];
  [...topRoles, ...bottomRoles, ...seatRoles, ...backRoles].forEach((piece) => {
    const ext = externalSize(piece, piece.role);
    candidatesW.push(ext.w);
  });
  [...topRoles, ...bottomRoles].forEach((piece) => {
    const ext = externalSize(piece, piece.role);
    candidatesD.push(ext.h);
  });

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

  const moduleD = candidatesD.length ? Math.max(...candidatesD) : rawD || 0;

  return { width: moduleW, height: moduleH, depth: moduleD, thickness: inferredThickness };
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

/**
 * Clasifica el montaje del fondo (back_panel) comparando sus medidas
 * contra la caja del módulo:
 *  - 'external': el fondo cubre toda la espalda (ancho≈moduleW y alto≈moduleH).
 *  - 'internal': el fondo queda embutido entre base/tapa/laterales
 *                (ancho≈moduleW-2t y alto≈moduleH-2t).
 *  - 'custom':   cualquier otra medida (se respeta tal cual).
 */
export function classifyBackPanelMount(back, moduleW, moduleH, thickness = DEFAULT_THICKNESS) {
  const dims = getPieceDims(back, 'back_panel', thickness, 'cabinet');
  const tol = 2;
  const w = dims.w;
  const h = dims.h;
  const interiorW = Math.abs(moduleW - 2 * thickness);
  const interiorH = Math.abs(moduleH - 2 * thickness);

  const external = Math.abs(w - moduleW) <= tol && Math.abs(h - moduleH) <= tol;
  const internal = Math.abs(w - interiorW) <= tol && Math.abs(h - interiorH) <= tol;

  if (external) return 'external';
  if (internal) return 'internal';
  return 'custom';
}

/**
 * Clasifica el montaje de base/tapa (top/bottom panel) comparando sus medidas
 * contra la caja del módulo:
 *  - 'external': cubre todo el ancho y la profundidad del módulo.
 *  - 'internal': queda embutido entre laterales (ancho≈moduleW-2t, alto≈moduleD-2t).
 *  - 'custom': cualquier otra medida.
 */
export function classifyTopBottomMount(panel, moduleW, moduleD, thickness = DEFAULT_THICKNESS) {
  const tol = 2;
  const w = Number(panel.ancho) || 0;
  const d = Number(panel.alto) || 0;
  const interiorW = Math.abs(moduleW - 2 * thickness);
  const interiorD = Math.abs(moduleD - 2 * thickness);

  const external = Math.abs(w - moduleW) <= tol && Math.abs(d - moduleD) <= tol;
  const internal = Math.abs(w - interiorW) <= tol && Math.abs(d - interiorD) <= tol;

  if (external) return 'external';
  if (internal) return 'internal';
  return 'custom';
}
