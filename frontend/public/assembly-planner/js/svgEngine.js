/**
 * CutterNest SVG Engine v3 — Universal Furniture Renderer
 * ========================================================
 * Taxonomía de muebles soportada:
 *   - cabinet      : Cajoneras, armarios, zapateros
 *   - shelving     : Estanterías, libreros, repiseros
 *   - table        : Mesas, escritorios, consolas
 *   - seating      : Sillas, bancos, taburetes
 *   - bed          : Camas, cabeceros, bases
 *   - wardrobe     : Closets, roperos con puertas
 *
 * Arquitectura: Grafo dirigido + Constraint Solver + Family Router
 * Complejidad: O(V + E) tiempo, O(V) espacio
 */

// ═══════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════

import { normalizeName } from './utils/normalize.js';
import { inferRole, detectFamily } from './services/classifierService.js';
import {
  getPieceDims,
  getModuleDimensions,
  calculateShelfPositions,
} from './services/geometryService.js';
import { COLORS, ROLE_COLORS, DIMENSION_COLORS } from './core/config.js';

function normalize(s) {
  return normalizeName(s);
}


/**
 * Devuelve las dimensiones VISUALES de una pieza según su rol.
 * El campo `rotate` indica orientación en el plano de corte, no siempre
 * en la vista frontal. Se interpreta sólo donde tenga sentido visual.
 */
// ═══════════════════════════════════════════════════════════
// CLASE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export class CutterNestSvgEngine {
  constructor() {
    this.graph = new Map();
    this.edges = new Map();
    this.viewBox = { w: 0, h: 0 };
  }

  addNode(id, { w, h, type, color, parent = null, constraints = {}, overlapAllowed = false }) {
    this.graph.set(id, {
      id,
      w: Number(w) || 0,
      h: Number(h) || 0,
      type: type || 'panel',
      color: color || ROLE_COLORS.default,
      parent,
      constraints: { ...constraints },
      overlapAllowed: !!overlapAllowed,
      x: 0,
      y: 0,
      zIndex: this._zIndexFor(type),
    });
    if (parent) {
      if (!this.edges.has(parent)) this.edges.set(parent, []);
      this.edges.get(parent).push(id);
    }
  }

  _zIndexFor(type) {
    const z = {
      background: 0,
      back_panel: 1,
      side_panel: 2,
      bottom_panel: 3,
      top_panel: 3,
      hanger_rail: 4,
      shelf: 4,
      divider: 5,
      brace: 6,
      drawer_bottom: 7,
      drawer_side: 8,
      drawer_back: 9,
      drawer_face: 10,
      door: 10,
      seat_panel: 10,
      handle: 11,
      leg: 12,
      container: 99,
    };
    return z[type] ?? 3;
  }

  solveLayout() {
    const root = [...this.graph.values()].find((n) => n.parent === null);
    if (!root) throw new Error('Falta nodo raíz (container sin parent)');

    const queue = [root.id];
    root.x = 0;
    root.y = 0;

    while (queue.length) {
      const pid = queue.shift();
      const parent = this.graph.get(pid);
      const children = this.edges.get(pid) || [];

      for (const cid of children) {
        const child = this.graph.get(cid);
        const c = child.constraints;

        child.x = parent.x + (c.marginX ?? 0);
        child.y = parent.y + (c.offsetY ?? 0);

        if (c.anchor === 'bottom') {
          child.y = parent.y + parent.h - child.h - (c.offsetY ?? 0);
        }
        if (c.anchor === 'center') {
          child.x = parent.x + (parent.w - child.w) / 2;
          child.y = parent.y + (parent.h - child.h) / 2;
        }
        if (c.centerX) {
          child.x = parent.x + (parent.w - child.w) / 2;
        }
        if (c.centerY) {
          child.y = parent.y + (parent.h - child.h) / 2;
        }

        queue.push(cid);
      }
    }

    let maxX = 0;
    let maxY = 0;
    for (const n of this.graph.values()) {
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    this.viewBox = { w: maxX, h: maxY };
  }

  detectOverlaps() {
    const nodes = [...this.graph.values()].filter(
      (n) => n.type !== 'container' && n.type !== 'background' && n.type !== 'back_panel'
    );
    const collisions = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.overlapAllowed || b.overlapAllowed) continue;
        if (
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y
        ) {
          collisions.push({ a: a.id, b: b.id });
        }
      }
    }
    return collisions;
  }

  buildSVG(options = {}) {
    const activeIds = new Set(options.activeIds || []);
    const completedIds = new Set(options.completedIds || []);
    const showDimensions = options.showDimensions !== false;
    const padding = options.padding || 60;

    const nodes = [...this.graph.values()]
      .filter((n) => n.type !== 'container')
      .sort((a, b) => a.zIndex - b.zIndex);

    const byColor = new Map();
    for (const n of nodes) {
      if (!byColor.has(n.color)) byColor.set(n.color, []);
      byColor.get(n.color).push(n);
    }

    const { w, h } = this.viewBox;
    const vbW = w + padding;
    const vbH = h + padding;

    let svg = `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="background:${COLORS.background};width:100%;height:auto;display:block;">
`;

    svg += `  <defs>
`;
    svg += `    <marker id="cn-dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${DIMENSION_COLORS.arrow}"/></marker>
`;
    svg += `  </defs>
`;

    for (const [color, pieces] of byColor) {
      svg += `  <g fill="${color}">
`;
      for (const p of pieces) {
        const isActive = activeIds.has(p.id);
        const isDone = completedIds.has(p.id) || isActive;
        const stroke = isActive ? COLORS.strokeActive : ROLE_COLORS.back_panel;
        const opacity = isDone ? 1 : 0.25;
        const d = `M${p.x},${p.y}h${p.w}v${p.h}h-${p.w}Z`;
        svg += `    <path d="${d}" data-id="${p.id}" data-type="${p.type}" stroke="${stroke}" stroke-width="2" opacity="${opacity}"/>
`;

        if (p.w > 80 && p.h > 40) {
          const label = this._shortLabel(p.id);
          svg += `    <text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 4}" text-anchor="middle" fill="${COLORS.textDark}" font-size="10" font-weight="600" font-family="system-ui,sans-serif" pointer-events="none">${label}</text>
`;
        }
      }
      svg += `  </g>
`;
    }

    if (showDimensions) {
      svg += `  <line x1="0" y1="${h + 20}" x2="${w}" y2="${h + 20}" stroke="${DIMENSION_COLORS.arrow}" stroke-width="1.5" marker-end="url(#cn-dim-arrow)" marker-start="url(#cn-dim-arrow)"/>
`;
      svg += `  <text x="${w / 2}" y="${h + 42}" text-anchor="middle" fill="${DIMENSION_COLORS.text}" font-size="13" font-weight="700" font-family="system-ui,sans-serif">${w} mm</text>
`;
      svg += `  <line x1="${w + 20}" y1="0" x2="${w + 20}" y2="${h}" stroke="${DIMENSION_COLORS.arrow}" stroke-width="1.5" marker-end="url(#cn-dim-arrow)" marker-start="url(#cn-dim-arrow)"/>
`;
      svg += `  <text x="${w + 42}" y="${h / 2}" text-anchor="start" fill="${DIMENSION_COLORS.text}" font-size="13" font-weight="700" font-family="system-ui,sans-serif" writing-mode="tb">${h} mm</text>
`;
    }

    svg += `</svg>`;
    return svg;
  }

  render(options = {}) {
    this.solveLayout();
    return this.buildSVG(options);
  }

  _shortLabel(id) {
    return String(id)
      .replace(/_/g, ' ')
      .split(' ')
      .slice(0, 2)
      .join(' ');
  }
}

// ═══════════════════════════════════════════════════════════
// FAMILY ROUTERS
// ═══════════════════════════════════════════════════════════

const FamilyRouters = {
  cabinet(pieces, meta) {
    const family = 'cabinet';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
    addCarcass(engine, roles, meta, family);

    // Repisas
    const shelves = roles.filter((p) => p.role === 'shelf');
    const shelfPositions = calculateShelfPositions(height, shelves, thickness, family);
    for (const sp of shelfPositions) {
      const dim = getPieceDims(sp.piece, 'shelf', thickness, family);
      const shelfW = Math.min(dim.w, Math.max(0, width - 2 * thickness));
      engine.addNode(sp.piece.id, {
        w: shelfW,
        h: dim.h,
        type: 'shelf',
        color: sp.piece.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: sp.y },
      });
    }

    // Cajones
    const drawers = roles.filter((p) => p.role.startsWith('drawer'));
    const drawerGroups = groupByHueco(drawers, height, thickness, shelfPositions, family);
    for (const group of drawerGroups) {
      const face = group.related.find((p) => p.role === 'drawer_face');
      if (!face) continue;
      const fDim = getPieceDims(face, 'drawer_face', thickness, family);
      const faceW = Math.min(fDim.w, Math.max(0, width - 2 * thickness));
      const faceH = group.h ?? fDim.h;
      const marginX = (width - faceW) / 2;

      engine.addNode(face.id, {
        w: faceW,
        h: faceH,
        type: 'drawer_face',
        color: face.color,
        parent: 'modulo',
        constraints: { marginX, offsetY: group.y },
      });

      const handle = group.related.find((p) => p.role === 'handle');
      if (handle) {
        const hDim = getPieceDims(handle, 'handle', thickness, family);
        engine.addNode(handle.id, {
          w: hDim.w,
          h: hDim.h,
          type: 'handle',
          color: handle.color,
          parent: 'modulo',
          constraints: { centerX: true, offsetY: group.y + faceH - 20 },
        });
      }
    }

    // Divisores anti-pandeo para carcasas con cajones
    if (drawerGroups.length > 0) {
      fillGapsWithDividers(engine, roles, meta, shelfPositions, drawerGroups, thickness, family);
    }

    // Travesaños / refuerzos
    for (const p of roles.filter((p) => p.role === 'brace')) {
      const dim = getPieceDims(p, 'brace', thickness, family);
      engine.addNode(p.id, {
        w: dim.w,
        h: dim.h,
        type: 'brace',
        color: p.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: thickness + 40 },
        overlapAllowed: true,
      });
    }

    return engine;
  },

  shelving(pieces, meta) {
    const family = 'shelving';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
    addCarcass(engine, roles, meta, family);

    // Montante central (anti-pandeo principal)
    const central = roles.find(
      (p) =>
        p.role === 'side_panel' &&
        (normalize(p.nombre).includes('central') || normalize(p.id).includes('central'))
    );
    if (central) {
      const dim = getPieceDims(central, 'side_panel', thickness, family);
      engine.addNode(central.id, {
        w: dim.w,
        h: height - 2 * thickness,
        type: 'side_panel',
        color: central.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: thickness },
        overlapAllowed: true,
      });
    }

    // Estantes
    const shelves = roles.filter((p) => p.role === 'shelf');
    const shelfPositions = calculateShelfPositions(height, shelves, thickness, family);
    for (const sp of shelfPositions) {
      const dim = getPieceDims(sp.piece, 'shelf', thickness, family);
      engine.addNode(sp.piece.id, {
        w: dim.w,
        h: dim.h,
        type: 'shelf',
        color: sp.piece.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: sp.y },
      });
    }

    // Divisores en cada hueco entre estantes
    fillGapsWithDividers(engine, roles, meta, shelfPositions, [], thickness, family);

    // Travesaño trasero
    for (const p of roles.filter((p) => p.role === 'brace')) {
      const dim = getPieceDims(p, 'brace', thickness, family);
      engine.addNode(p.id, {
        w: dim.w,
        h: dim.h,
        type: 'brace',
        color: p.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: thickness + 40 },
        overlapAllowed: true,
      });
    }

    return engine;
  },

  table(pieces, meta) {
    const family = 'table';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));

    const tops = roles.filter((p) => p.role === 'top_panel');
    const topThick = tops.length ? Number(tops[0].espesor) || thickness : thickness;
    for (const p of tops) {
      engine.addNode(p.id, {
        w: width,
        h: topThick,
        type: 'top_panel',
        color: p.color,
        parent: 'modulo',
        constraints: { offsetY: 0 },
      });
    }

    const legs = roles.filter((p) => p.role === 'leg');
    const legDim = legs.length ? getPieceDims(legs[0], 'leg', thickness, family) : { w: 80, h: height };
    const legW = legDim.w;
    const legH = height - topThick;
    const inset = 20;
    const depthOffset = 15;

    const placeLeg = (p, x, zOffset = 0, overlapAllowed = false) => {
      engine.addNode(p.id, {
        w: legW,
        h: legH,
        type: 'leg',
        color: p.color,
        parent: 'modulo',
        constraints: { marginX: x + zOffset, offsetY: topThick },
        overlapAllowed,
      });
    };

    const front = legs.filter((p) => /front|delanter/i.test(normalize(p.nombre)));
    const back = legs.filter((p) => /back|traser/i.test(normalize(p.nombre)));

    if (front.length >= 2 && back.length >= 2) {
      front.forEach((p, i) => placeLeg(p, i === 0 ? inset : width - legW - inset, 0));
      back.forEach((p, i) => placeLeg(p, i === 0 ? inset : width - legW - inset, depthOffset, true));
    } else {
      legs.forEach((p, i) => {
        const x = i % 2 === 0 ? inset : width - legW - inset;
        const isBack = i >= 2;
        placeLeg(p, x, isBack ? depthOffset : 0, isBack);
      });
    }

    const shelf = roles.find((p) => p.role === 'shelf');
    if (shelf) {
      const dim = getPieceDims(shelf, 'shelf', thickness, family);
      engine.addNode(shelf.id, {
        w: dim.w,
        h: dim.h,
        type: 'shelf',
        color: shelf.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: topThick + (height - topThick) * 0.75 },
        overlapAllowed: true,
      });
    }

    return engine;
  },

  seating(pieces, meta) {
    const family = 'seating';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));

    const back = roles.find((p) => p.role === 'back_panel');
    const seat = roles.find((p) => p.role === 'seat_panel');

    const backDim = back ? getPieceDims(back, 'back_panel', thickness, family) : { w: 0, h: 0 };
    const seatDim = seat ? getPieceDims(seat, 'seat_panel', thickness, family) : { w: 0, h: 0 };

    if (back) {
      engine.addNode(back.id, {
        w: backDim.w,
        h: backDim.h,
        type: 'back_panel',
        color: back.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: 0 },
      });
    }

    if (seat) {
      engine.addNode(seat.id, {
        w: seatDim.w,
        h: seatDim.h,
        type: 'seat_panel',
        color: seat.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: backDim.h },
      });
    }

    const legs = roles.filter((p) => p.role === 'leg');
    if (legs.length) {
      const legDim = getPieceDims(legs[0], 'leg', thickness, family);
      const legW = legDim.w;
      const legY = backDim.h + seatDim.h;
      const legH = height - legY;
      const inset = 10;
      const depthOffset = 15;

      const placeLeg = (p, x, zOffset = 0, overlapAllowed = false) => {
        engine.addNode(p.id, {
          w: legW,
          h: legH,
          type: 'leg',
          color: p.color,
          parent: 'modulo',
          constraints: { marginX: x + zOffset, offsetY: legY },
          overlapAllowed,
        });
      };

      const front = legs.filter((p) => /front|delanter/i.test(normalize(p.nombre)));
      const backLegs = legs.filter((p) => /back|traser/i.test(normalize(p.nombre)));

      if (front.length >= 2 && backLegs.length >= 2) {
        front.forEach((p, i) => placeLeg(p, i === 0 ? inset : width - legW - inset, 0));
        backLegs.forEach((p, i) => placeLeg(p, i === 0 ? inset : width - legW - inset, depthOffset, true));
      } else {
        legs.forEach((p, i) => {
          const x = i % 2 === 0 ? inset : width - legW - inset;
          const isBack = i >= 2;
          placeLeg(p, x, isBack ? depthOffset : 0, isBack);
        });
      }

      const braceInset = legW + 10;
      const braces = roles.filter((p) => p.role === 'brace');
      const frontBraces = braces.filter((p) => /front|delanter/i.test(normalize(p.nombre)));
      const backBraces = braces.filter((p) => /back|traser/i.test(normalize(p.nombre)));
      const allBraces = frontBraces.length ? frontBraces : braces;
      const otherBraces = backBraces.length ? backBraces : [];

      for (const p of allBraces) {
        const dim = getPieceDims(p, 'brace', thickness, family);
        const braceW = Math.min(dim.w, width - 2 * braceInset);
        engine.addNode(p.id, {
          w: braceW,
          h: dim.h,
          type: 'brace',
          color: p.color,
          parent: 'modulo',
          constraints: { centerX: true, offsetY: legY + legH * 0.55 },
          overlapAllowed: true,
        });
      }
      for (const p of otherBraces) {
        const dim = getPieceDims(p, 'brace', thickness, family);
        const braceW = Math.min(dim.w, width - 2 * braceInset);
        engine.addNode(p.id, {
          w: braceW,
          h: dim.h,
          type: 'brace',
          color: p.color,
          parent: 'modulo',
          constraints: { centerX: true, offsetY: legY + legH * 0.7 },
          overlapAllowed: true,
        });
      }
    }

    return engine;
  },

  wardrobe(pieces, meta) {
    const family = 'wardrobe';
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map((p) => ({ ...p, role: inferRole(p) }));
    addCarcass(engine, roles, meta, family);

    // Riel colgador
    const rail = roles.find((p) => p.role === 'hanger_rail');
    if (rail) {
      const dim = getPieceDims(rail, 'hanger_rail', thickness, family);
      engine.addNode(rail.id, {
        w: dim.w,
        h: dim.h,
        type: 'hanger_rail',
        color: rail.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: thickness + 185 },
        overlapAllowed: true,
      });
    }

    // Estante + soporte central anti-pandeo
    const shelf = roles.find((p) => p.role === 'shelf');
    if (shelf) {
      const dim = getPieceDims(shelf, 'shelf', thickness, family);
      const shelfY = thickness + (height - 2 * thickness) * 0.27;
      engine.addNode(shelf.id, {
        w: dim.w,
        h: dim.h,
        type: 'shelf',
        color: shelf.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: shelfY },
        overlapAllowed: true,
      });

      const supportW = Math.max(thickness, 20);
      engine.addNode(`${shelf.id}-soporte`, {
        w: supportW,
        h: dim.h + 10,
        type: 'divider',
        color: shelf.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: shelfY + dim.h },
        overlapAllowed: true,
      });
    }

    // Puertas abatibles
    const doors = roles.filter((p) => p.role === 'door');
    const doorCount = Math.max(doors.length, 1);
    const innerW = width - 2 * thickness;
    const doorW = innerW / doorCount - 2;
    const doorH = height - 2 * thickness;

    doors.forEach((p, i) => {
      const dim = getPieceDims(p, 'door', thickness, family);
      const actualW = Math.min(dim.w, doorW);
      const actualH = Math.min(dim.h, doorH);
      const x = thickness + i * (doorW + 2) + 1;
      engine.addNode(p.id, {
        w: actualW,
        h: actualH,
        type: 'door',
        color: p.color,
        parent: 'modulo',
        constraints: { marginX: x, offsetY: thickness },
        overlapAllowed: true,
      });

      // Tirador simple
      const handleW = 8;
      const handleH = 80;
      const hx = i === 0 ? x + actualW - 25 : x + 17;
      engine.addNode(`${p.id}-tirador`, {
        w: handleW,
        h: handleH,
        type: 'handle',
        color: ROLE_COLORS.handle,
        parent: 'modulo',
        constraints: { marginX: hx, offsetY: thickness + actualH / 2 },
        overlapAllowed: true,
      });
    });

    return engine;
  },
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function addCarcass(engine, roles, meta, family = 'cabinet') {
  const { width, height, thickness } = meta;

  const back = roles.find((p) => p.role === 'back_panel');
  if (back) {
    engine.addNode(back.id, {
      w: width,
      h: height,
      type: 'back_panel',
      color: back.color,
      parent: 'modulo',
      constraints: { offsetY: 0 },
    });
  }

  for (const p of roles.filter((p) => p.role === 'top_panel')) {
    engine.addNode(p.id, {
      w: width,
      h: thickness,
      type: 'top_panel',
      color: p.color,
      parent: 'modulo',
      constraints: { offsetY: 0 },
    });
  }

  for (const p of roles.filter((p) => p.role === 'bottom_panel')) {
    engine.addNode(p.id, {
      w: width,
      h: thickness,
      type: 'bottom_panel',
      color: p.color,
      parent: 'modulo',
      constraints: { anchor: 'bottom', offsetY: 0 },
    });
  }

  for (const p of roles.filter((p) => p.role === 'side_panel')) {
    // El montante central se renderiza aparte
    if (normalize(p.nombre).includes('central') && normalize(p.nombre).includes('montante')) {
      continue;
    }
    const dim = getPieceDims(p, 'side_panel', thickness, family);
    const isDer =
      normalize(p.nombre).includes('derecho') || normalize(p.nombre).includes('der');
    engine.addNode(p.id, {
      w: dim.w,
      h: height - 2 * thickness,
      type: 'side_panel',
      color: p.color,
      parent: 'modulo',
      constraints: { marginX: isDer ? width - dim.w : 0, offsetY: thickness },
    });
  }
}

function groupByHueco(drawers, moduleH, thickness, shelfPositions = [], family = 'cabinet') {
  const groups = [];
  const faces = drawers.filter((p) => inferRole(p) === 'drawer_face');
  if (!faces.length) return groups;

  const shelves = [...shelfPositions].sort((a, b) => a.y - b.y);
  const topY = shelves.length ? shelves[0].y + shelves[0].h : thickness;
  const bottomY = shelves.length ? shelves[shelves.length - 1].y : moduleH - thickness;
  const usableH = Math.max(0, bottomY - topY);

  // Ordenar caras: superior → medios → inferior
  const ranked = faces
    .map((face) => {
      const n = normalize(face.nombre);
      const id = normalize(face.id);
      const isSup = n.includes('superior') || n.includes('sup') || id.includes('sup');
      const isInf = n.includes('inferior') || n.includes('inf') || id.includes('inf');
      let rank = 50;
      if (isSup) rank = 0;
      else if (isInf) rank = 1000;
      else if (n.includes('medio')) rank = 100;
      const m = n.match(/(\d+)/);
      if (m) rank += parseInt(m[1], 10) * 0.1;
      return { face, rank };
    })
    .sort((a, b) => a.rank - b.rank);

  const n = ranked.length;
  const dims = ranked.map((item) => getPieceDims(item.face, 'drawer_face', thickness, family));
  const totalH = dims.reduce((s, d) => s + d.h, 0);

  // Si no caben todos los frentes reales, escalar alturas proporcionalmente
  // y apilarlos de forma contigua sin solapamientos.
  const scale = totalH > usableH ? usableH / totalH : 1;
  const scaledHeights = dims.map((d) => d.h * scale);

  let currentY = topY;
  ranked.forEach((item, i) => {
    const fh = scaledHeights[i];
    const y = currentY;
    currentY += fh;

    const prefix = item.face.id.split('-').slice(0, -1).join('-');
    const related = drawers.filter(
      (p) => p.id.startsWith(prefix) || normalize(p.nombre).includes(prefix)
    );

    groups.push({ face: item.face, related, y, h: fh });
  });

  return groups;
}

function fillGapsWithDividers(engine, roles, meta, shelfPositions, drawerGroups, thickness, family) {
  const { width, height } = meta;
  const dividers = roles.filter((p) => p.role === 'divider');
  const defaultW = Math.max(thickness, 30);
  const inset = 10;

  const separators = [
    { y: thickness, h: 0 },
    ...shelfPositions.map((sp) => ({
      y: sp.y,
      h: getPieceDims(sp.piece, 'shelf', thickness, family).h,
    })),
    ...drawerGroups.map((g) => ({
      y: g.y,
      h: getPieceDims(g.face, 'drawer_face', thickness, family).h,
    })),
    { y: height - thickness, h: 0 },
  ].sort((a, b) => a.y - b.y);

  const gaps = [];
  for (let i = 0; i < separators.length - 1; i++) {
    const topY = separators[i].y + separators[i].h;
    const bottomY = separators[i + 1].y;
    if (bottomY > topY + 1) gaps.push({ y: topY, h: bottomY - topY });
  }

  let idx = 0;
  for (const gap of gaps) {
    const remaining = dividers.length - idx;

    if (remaining >= 2) {
      // Izquierda
      let div = dividers[idx++];
      let divW = div ? getPieceDims(div, 'divider', thickness, family).w : defaultW;
      engine.addNode(div.id, {
        w: divW,
        h: gap.h,
        type: 'divider',
        color: div.color,
        parent: 'modulo',
        constraints: { marginX: thickness + inset, offsetY: gap.y },
      });

      // Derecha
      div = dividers[idx++];
      divW = div ? getPieceDims(div, 'divider', thickness, family).w : defaultW;
      engine.addNode(div.id, {
        w: divW,
        h: gap.h,
        type: 'divider',
        color: div.color,
        parent: 'modulo',
        constraints: { marginX: width - thickness - divW - inset, offsetY: gap.y },
      });
    } else if (remaining === 1) {
      // Único divisor: centrarlo en el hueco
      const div = dividers[idx++];
      const divW = getPieceDims(div, 'divider', thickness, family).w;
      engine.addNode(div.id, {
        w: divW,
        h: gap.h,
        type: 'divider',
        color: div.color,
        parent: 'modulo',
        constraints: { centerX: true, offsetY: gap.y },
      });
    } else {
      // Fallback por si no hay divisores
      engine.addNode(`cn-div-izq-${gap.y.toFixed(0)}`, {
        w: defaultW,
        h: gap.h,
        type: 'divider',
        color: ROLE_COLORS.wood,
        parent: 'modulo',
        constraints: { marginX: thickness + inset, offsetY: gap.y },
      });
      engine.addNode(`cn-div-der-${gap.y.toFixed(0)}`, {
        w: defaultW,
        h: gap.h,
        type: 'divider',
        color: ROLE_COLORS.wood,
        parent: 'modulo',
        constraints: { marginX: width - thickness - defaultW - inset, offsetY: gap.y },
      });
    }
  }
}


// ═══════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════

export function buildEngineForModule(pieces, moduleId, options = {}) {
  const family = options.family || detectFamily(pieces, moduleId);
  const modId = String(moduleId).trim();
  const modulePieces = pieces.filter((p) => {
    const mod = String(p.modulo || '').trim();
    return mod === modId || mod.startsWith(modId);
  });

  if (!modulePieces.length) return null;

  const meta = getModuleDimensions(modulePieces, options.thickness || 15, family);
  const router = FamilyRouters[family] || FamilyRouters.cabinet;

  return router(modulePieces, meta);
}

export { inferRole, detectFamily } from './services/classifierService.js';
export {
  getPieceDims,
  getModuleDimensions,
  calculateShelfPositions,
} from './services/geometryService.js';
export { FamilyRouters };
