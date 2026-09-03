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
    // Divisor vertical: se ve como un lateral (espesor × altura).
    // Divisor horizontal: se ve como un entrepaño delgado (ancho × espesor visual).
    const isVertical = h > w * 1.5;
    if (isVertical) return { w: espesor, h };
    return { w, h: useVisualThickness(h, espesor) };
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
      const axes = classifyTopBottomMountAxes(piece, rawW, rawD, inferredThickness);
      // Eje ancho: interno ⇒ +2t (encajado entre ambos laterales).
      // Eje profundidad: interno ⇒ +2t (inset doble); front_flush ⇒ +t
      // (solo el lado del fondo; el frente queda al ras).
      const w = axes.width === 'internal' ? piece.ancho + 2 * inferredThickness : piece.ancho;
      const h = axes.depth === 'internal'
        ? piece.alto + 2 * inferredThickness
        : axes.depth === 'front_flush'
          ? piece.alto + inferredThickness
          : piece.alto;
      if (axes.width === 'internal' || axes.depth === 'internal' || axes.depth === 'front_flush') {
        return { w, h };
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
 *  - 'external':    cubre todo el ancho y la profundidad del módulo.
 *  - 'internal':    queda embutido entre laterales (ancho≈moduleW-2t,
 *                   profundidad≈moduleD-2t, inset en ambos lados).
 *  - 'front_flush': ancho≈moduleW-2t y profundidad≈moduleD-t (ras al frente,
 *                   contra la cara interior del fondo). Convención habitual
 *                   de bases/tapas embutidas.
 *  - 'custom':      cualquier otra medida.
 */
export function classifyTopBottomMountAxes(panel, moduleW, moduleD, thickness = DEFAULT_THICKNESS) {
  const tol = 2;
  const w = Number(panel.ancho) || 0;
  const d = Number(panel.alto) || 0;
  const interiorW = Math.abs(moduleW - 2 * thickness);
  const interiorD = Math.abs(moduleD - 2 * thickness);
  const flushD = Math.abs(moduleD - thickness);

  const classifyAxis = (value, exterior, interior) => {
    if (Math.abs(value - exterior) <= tol) return 'external';
    if (Math.abs(value - interior) <= tol) return 'internal';
    return 'custom';
  };

  // Eje profundidad: además del inset doble ('internal') se acepta el ras al
  // frente ('front_flush', moduleD − t), que es la convención más común en
  // bases/tapas embutidas (frente al ras, trasero contra el fondo).
  let depth;
  if (Math.abs(d - moduleD) <= tol) depth = 'external';
  else if (Math.abs(d - interiorD) <= tol) depth = 'internal';
  else if (Math.abs(d - flushD) <= tol) depth = 'front_flush';
  else depth = 'custom';

  return {
    width: classifyAxis(w, moduleW, interiorW),
    depth,
  };
}

export function classifyTopBottomMount(panel, moduleW, moduleD, thickness = DEFAULT_THICKNESS) {
  const axes = classifyTopBottomMountAxes(panel, moduleW, moduleD, thickness);
  if (axes.width === 'external' && axes.depth === 'external') return 'external';
  if (axes.width === 'internal' && (axes.depth === 'internal' || axes.depth === 'front_flush')) return 'internal';
  return 'custom';
}

/**
 * Clasifica el montaje del zócalo frontal (plinth) de forma análoga al fondo:
 *  - 'external': ocupa todo el ancho del módulo y la altura de zócalo.
 *  - 'internal': queda embutido entre laterales (ancho≈moduleW-2t)
 *                a la altura del zócalo.
 *  - 'custom':   cualquier otra medida; se respetan las medidas de la pieza.
 */
export function classifyPlinthMount(plinth, moduleW, plinthH, thickness = DEFAULT_THICKNESS) {
  const tol = 2;
  const w = Number(plinth.ancho) || 0;
  const h = Number(plinth.alto) || 0;
  const interiorW = Math.max(0, moduleW - 2 * thickness);

  const external = Math.abs(w - moduleW) <= tol && Math.abs(h - plinthH) <= tol;
  const internal = Math.abs(w - interiorW) <= tol && Math.abs(h - plinthH) <= tol;

  if (external) return 'external';
  if (internal) return 'internal';
  return 'custom';
}
