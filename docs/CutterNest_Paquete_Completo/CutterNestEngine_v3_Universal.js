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

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function inferRole(piece) {
  const n = normalize(piece.nombre);
  const id = normalize(piece.id);

  if (n.includes('cajon') || id.includes('cajon')) {
    if (n.includes('frente') || id.includes('frente')) return 'drawer_face';
    if (n.includes('lateral') || id.includes('lateral')) return 'drawer_side';
    if (n.includes('base') || id.includes('base')) return 'drawer_bottom';
    if (n.includes('fondo') || id.includes('fondo')) return 'drawer_back';
    if (n.includes('tirador') || id.includes('tirador')) return 'handle';
    return 'drawer_part';
  }

  if (n.includes('puerta') || id.includes('puerta')) return 'door';
  if (n.includes('tirador') || id.includes('tirador')) return 'handle';
  if (n.includes('pata') || n.includes('pie') || id.includes('pata')) return 'leg';
  if (n.includes('tirante') || n.includes('travesano') || n.includes('refuerzo')) return 'brace';

  if (n.includes('estante') || n.includes('repisa')) return 'shelf';
  if (n.includes('divisor') || n.includes('division')) return 'divider';

  if (n.includes('base') && !n.includes('cajon')) return 'bottom_panel';
  if (n.includes('tapa') || n.includes('techo')) return 'top_panel';
  if (n.includes('fondo') && !n.includes('cajon')) return 'back_panel';
  if (n.includes('frente') && !n.includes('cajon')) return 'front_panel';

  if (n.includes('lateral') || n.includes('costado') || n.includes('montante')) return 'side_panel';
  if (n.includes('montante') || n.includes('poste')) return 'side_panel';

  if (n.includes('tablero') || n.includes('superficie')) return 'top_panel';
  if (n.includes('respald') || n.includes('respaldo')) return 'back_panel';
  if (n.includes('asiento') || n.includes('banco')) return 'seat_panel';

  const w = Number(piece.ancho) || 0;
  const h = Number(piece.alto) || 0;
  if (w > h * 3) return 'shelf';
  if (h > w * 3) return 'side_panel';

  return 'panel';
}

function getModuleDimensions(pieces, thickness = 15) {
  const roles = pieces.map(p => ({ ...p, role: inferRole(p) }));

  const bottoms = roles.filter(p => p.role === 'bottom_panel');
  const tops = roles.filter(p => p.role === 'top_panel');
  const sides = roles.filter(p => p.role === 'side_panel');
  const backs = roles.filter(p => p.role === 'back_panel');

  const candidatesW = [...bottoms, ...tops].map(p => Math.max(Number(p.ancho), Number(p.alto)));
  const moduleW = candidatesW.length ? Math.max(...candidatesW) : 900;

  const candidatesH = sides.map(p => {
    const w = Number(p.ancho) || 0;
    const h = Number(p.alto) || 0;
    return Math.max(w, h);
  });

  const backH = backs.map(p => Math.max(Number(p.ancho), Number(p.alto)));

  const moduleH = candidatesH.length 
    ? Math.max(...candidatesH) 
    : (backH.length ? Math.max(...backH) : 2300);

  return { width: moduleW, height: moduleH, thickness };
}

// ═══════════════════════════════════════════════════════════
// CLASE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export class CutterNestSvgEngine {
  constructor() {
    this.graph = new Map();
    this.edges = new Map();
    this.viewBox = { w: 0, h: 0 };
  }

  addNode(id, { w, h, type, color, parent = null, constraints = {} }) {
    this.graph.set(id, {
      id,
      w: Number(w) || 0,
      h: Number(h) || 0,
      type: type || 'panel',
      color: color || '#94a3b8',
      parent,
      constraints: { ...constraints },
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

    let svg = `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a;width:100%;height:auto;display:block;">
`;

    svg += `  <defs>
`;
    svg += `    <marker id="cn-dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f59e0b"/></marker>
`;
    svg += `  </defs>
`;

    for (const [color, pieces] of byColor) {
      svg += `  <g fill="${color}">
`;
      for (const p of pieces) {
        const isActive = activeIds.has(p.id);
        const isDone = completedIds.has(p.id) || isActive;
        const stroke = isActive ? '#4ECDC4' : '#1e293b';
        const opacity = isDone ? 1 : 0.25;
        const d = `M${p.x},${p.y}h${p.w}v${p.h}h-${p.w}Z`;
        svg += `    <path d="${d}" data-id="${p.id}" data-type="${p.type}" stroke="${stroke}" stroke-width="2" opacity="${opacity}"/>
`;

        if (p.w > 80 && p.h > 40) {
          const label = this._shortLabel(p.id);
          svg += `    <text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 4}" text-anchor="middle" fill="#0f172a" font-size="10" font-weight="600" font-family="system-ui,sans-serif" pointer-events="none">${label}</text>
`;
        }
      }
      svg += `  </g>
`;
    }

    if (showDimensions) {
      svg += `  <line x1="0" y1="${h + 20}" x2="${w}" y2="${h + 20}" stroke="#f59e0b" stroke-width="1.5" marker-end="url(#cn-dim-arrow)" marker-start="url(#cn-dim-arrow)"/>
`;
      svg += `  <text x="${w / 2}" y="${h + 42}" text-anchor="middle" fill="#f59e0b" font-size="13" font-weight="700" font-family="system-ui,sans-serif">${w} mm</text>
`;
      svg += `  <line x1="${w + 20}" y1="0" x2="${w + 20}" y2="${h}" stroke="#f59e0b" stroke-width="1.5" marker-end="url(#cn-dim-arrow)" marker-start="url(#cn-dim-arrow)"/>
`;
      svg += `  <text x="${w + 42}" y="${h / 2}" text-anchor="start" fill="#f59e0b" font-size="13" font-weight="700" font-family="system-ui,sans-serif" writing-mode="tb">${h} mm</text>
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
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map(p => ({ ...p, role: inferRole(p) }));

    for (const p of roles) {
      const id = p.id;
      switch (p.role) {
        case 'bottom_panel':
          engine.addNode(id, {
            w: width, h: thickness, type: 'bottom_panel', color: p.color,
            parent: 'modulo', constraints: { anchor: 'bottom', offsetY: 0 }
          });
          break;
        case 'top_panel':
          engine.addNode(id, {
            w: width, h: thickness, type: 'top_panel', color: p.color,
            parent: 'modulo', constraints: { offsetY: 0 }
          });
          break;
        case 'side_panel': {
          const isDer = normalize(p.nombre).includes('derecho') || normalize(p.nombre).includes('der');
          const esp = Number(p.espesor) || thickness;
          engine.addNode(id, {
            w: esp, h: height, type: 'side_panel', color: p.color,
            parent: 'modulo', constraints: { marginX: isDer ? width - esp : 0, offsetY: 0 }
          });
          break;
        }
        case 'back_panel':
          engine.addNode(id, {
            w: width, h: height, type: 'back_panel', color: p.color,
            parent: 'modulo', constraints: { offsetY: 0 }
          });
          break;
      }
    }

    const drawers = roles.filter(p => p.role.startsWith('drawer'));
    const drawerGroups = groupByHueco(drawers, height, thickness);

    for (const group of drawerGroups) {
      const face = group.find(p => p.role === 'drawer_face');
      if (!face) continue;
      const fw = Number(face.ancho);
      const fh = Number(face.alto);
      const marginX = (width - fw) / 2;

      engine.addNode(face.id, {
        w: fw, h: fh, type: 'drawer_face', color: face.color,
        parent: 'modulo', constraints: { marginX, offsetY: group.y }
      });

      const handle = group.find(p => p.role === 'handle');
      if (handle) {
        engine.addNode(handle.id, {
          w: Number(handle.ancho), h: Number(handle.alto),
          type: 'handle', color: handle.color,
          parent: 'modulo',
          constraints: { centerX: true, offsetY: group.y + fh - 20 }
        });
      }
    }

    const shelves = roles.filter(p => p.role === 'shelf');
    const shelfPositions = calculateShelfPositions(height, shelves, thickness);
    for (const sp of shelfPositions) {
      engine.addNode(sp.piece.id, {
        w: Number(sp.piece.ancho), h: Number(sp.piece.alto),
        type: 'shelf', color: sp.piece.color,
        parent: 'modulo', constraints: { centerX: true, offsetY: sp.y }
      });
    }

    const dividers = roles.filter(p => p.role === 'divider');
    const nShelves = shelves.length;
    const nHuecos = nShelves + 1;
    const totalShelfH = shelves.reduce((s, p) => s + Number(p.alto), 0);
    const huecoH = (height - 2 * thickness - totalShelfH) / Math.max(nHuecos, 1);

    for (const p of dividers) {
      const n = normalize(p.nombre);
      let huecoIdx = 0;
      if (n.includes('medio')) huecoIdx = Math.floor(nHuecos / 2);
      if (n.includes('inferior')) huecoIdx = nHuecos - 1;
      if (n.includes('superior')) huecoIdx = 0;

      const y = thickness + huecoIdx * huecoH;
      const isDer = n.includes('derecho') || n.includes('der');
      const marginX = isDer ? width - 70 - Number(p.ancho) : 70;

      engine.addNode(p.id, {
        w: Number(p.ancho), h: Number(p.alto),
        type: 'divider', color: p.color,
        parent: 'modulo', constraints: { marginX, offsetY: y }
      });
    }

    const braces = roles.filter(p => p.role === 'brace');
    for (const p of braces) {
      engine.addNode(p.id, {
        w: Number(p.ancho), h: Number(p.alto),
        type: 'brace', color: p.color,
        parent: 'modulo', constraints: { centerX: true, offsetY: thickness + 40 }
      });
    }

    return engine;
  },

  shelving(pieces, meta) {
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map(p => ({ ...p, role: inferRole(p) }));

    for (const p of roles) {
      const id = p.id;
      switch (p.role) {
        case 'bottom_panel':
          engine.addNode(id, { w: width, h: thickness, type: 'bottom_panel', color: p.color,
            parent: 'modulo', constraints: { anchor: 'bottom', offsetY: 0 } });
          break;
        case 'top_panel':
          engine.addNode(id, { w: width, h: thickness, type: 'top_panel', color: p.color,
            parent: 'modulo', constraints: { offsetY: 0 } });
          break;
        case 'side_panel': {
          const isDer = normalize(p.nombre).includes('derecho') || normalize(p.nombre).includes('der');
          const esp = Number(p.espesor) || thickness;
          engine.addNode(id, { w: esp, h: height, type: 'side_panel', color: p.color,
            parent: 'modulo', constraints: { marginX: isDer ? width - esp : 0, offsetY: 0 } });
          break;
        }
        case 'back_panel':
          engine.addNode(id, { w: width, h: height, type: 'back_panel', color: p.color,
            parent: 'modulo', constraints: { offsetY: 0 } });
          break;
      }
    }

    const shelves = roles.filter(p => p.role === 'shelf');
    const shelfPositions = calculateShelfPositions(height, shelves, thickness);
    for (const sp of shelfPositions) {
      engine.addNode(sp.piece.id, {
        w: Number(sp.piece.ancho), h: Number(sp.piece.alto),
        type: 'shelf', color: sp.piece.color,
        parent: 'modulo', constraints: { centerX: true, offsetY: sp.y }
      });
    }

    const dividers = roles.filter(p => p.role === 'divider');
    for (const p of dividers) {
      const isCentral = normalize(p.nombre).includes('central');
      engine.addNode(p.id, {
        w: Number(p.ancho), h: Number(p.alto),
        type: 'divider', color: p.color,
        parent: 'modulo',
        constraints: isCentral 
          ? { centerX: true, offsetY: thickness }
          : { marginX: 70, offsetY: thickness }
      });
    }

    return engine;
  },

  table(pieces, meta) {
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map(p => ({ ...p, role: inferRole(p) }));

    const tops = roles.filter(p => p.role === 'top_panel');
    for (const p of tops) {
      engine.addNode(p.id, {
        w: Number(p.ancho), h: Number(p.alto),
        type: 'top_panel', color: p.color,
        parent: 'modulo', constraints: { offsetY: 0 }
      });
    }

    const legs = roles.filter(p => p.role === 'leg');
    const legW = legs.length ? (Number(legs[0].ancho) || 80) : 80;
    const positions = [
      { x: 20, y: thickness },
      { x: width - legW - 20, y: thickness },
      { x: 20, y: height - Number(legs[0]?.alto || 700) },
      { x: width - legW - 20, y: height - Number(legs[0]?.alto || 700) },
    ];

    legs.forEach((p, i) => {
      const pos = positions[i] || positions[0];
      engine.addNode(p.id, {
        w: Number(p.ancho), h: Number(p.alto),
        type: 'leg', color: p.color,
        parent: 'modulo', constraints: { marginX: pos.x, offsetY: pos.y }
      });
    });

    const drawers = roles.filter(p => p.role.startsWith('drawer'));
    if (drawers.length) {
      const face = drawers.find(p => p.role === 'drawer_face');
      if (face) {
        engine.addNode(face.id, {
          w: Number(face.ancho), h: Number(face.alto),
          type: 'drawer_face', color: face.color,
          parent: 'modulo', constraints: { centerX: true, offsetY: thickness + 100 }
        });
      }
    }

    const shelf = roles.find(p => p.role === 'shelf');
    if (shelf) {
      engine.addNode(shelf.id, {
        w: Number(shelf.ancho), h: Number(shelf.alto),
        type: 'shelf', color: shelf.color,
        parent: 'modulo', constraints: { centerX: true, offsetY: height - 200 }
      });
    }

    return engine;
  },

  seating(pieces, meta) {
    const { width, height, thickness } = meta;
    const engine = new CutterNestSvgEngine();
    engine.addNode('modulo', { w: width, h: height, type: 'container', color: 'none' });

    const roles = pieces.map(p => ({ ...p, role: inferRole(p) }));

    const back = roles.find(p => p.role === 'back_panel');
    if (back) {
      engine.addNode(back.id, {
        w: Number(back.ancho), h: Number(back.alto),
        type: 'back_panel', color: back.color,
        parent: 'modulo', constraints: { centerX: true, offsetY: 0 }
      });
    }

    const seat = roles.find(p => p.role === 'seat_panel');
    if (seat) {
      engine.addNode(seat.id, {
        w: Number(seat.ancho), h: Number(seat.alto),
        type: 'seat_panel', color: seat.color,
        parent: 'modulo', constraints: { centerX: true, offsetY: height / 2 }
      });
    }

    const legs = roles.filter(p => p.role === 'leg');
    const legW = legs.length ? (Number(legs[0].ancho) || 40) : 40;
    const legPositions = [
      { x: 10 },
      { x: width - legW - 10 },
    ];
    legs.forEach((p, i) => {
      const lx = legPositions[i % 2]?.x || 10;
      engine.addNode(p.id, {
        w: Number(p.ancho), h: Number(p.alto),
        type: 'leg', color: p.color,
        parent: 'modulo', constraints: { marginX: lx, offsetY: height - Number(p.alto) }
      });
    });

    return engine;
  },

  wardrobe(pieces, meta) {
    const engine = this.cabinet(pieces, meta);
    const roles = pieces.map(p => ({ ...p, role: inferRole(p) }));
    const doors = roles.filter(p => p.role === 'door');
    const { width, height, thickness } = meta;
    const doorW = width / Math.max(doors.length, 1);

    doors.forEach((p, i) => {
      engine.addNode(p.id, {
        w: doorW - 2, h: height - 2 * thickness,
        type: 'door', color: p.color,
        parent: 'modulo', constraints: { marginX: i * doorW + 1, offsetY: thickness }
      });
    });

    return engine;
  }
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function calculateShelfPositions(moduleH, shelves, thickness) {
  if (!shelves.length) return [];
  const totalShelfH = shelves.reduce((sum, p) => sum + Number(p.alto), 0);
  const usableH = moduleH - 2 * thickness;
  const gap = (usableH - totalShelfH) / (shelves.length + 1);

  const order = [...shelves].sort((a, b) => {
    const na = normalize(a.nombre);
    const nb = normalize(b.nombre);
    if (na.includes('superior') || na.includes('sup')) return -1;
    if (nb.includes('superior') || nb.includes('sup')) return 1;
    if (na.includes('medio')) return -1;
    if (nb.includes('medio')) return 1;
    if (na.includes('inferior') || na.includes('inf')) return 1;
    if (nb.includes('inferior') || nb.includes('inf')) return -1;
    return 0;
  });

  return order.map((p, i) => ({
    piece: p,
    y: thickness + gap + i * (Number(p.alto) + gap),
  }));
}

function groupByHueco(drawers, moduleH, thickness) {
  const groups = [];
  const faces = drawers.filter(p => inferRole(p) === 'drawer_face');

  faces.forEach(face => {
    const n = normalize(face.nombre);
    const id = normalize(face.id);
    const isSup = n.includes('superior') || n.includes('sup') || id.includes('sup');
    const isInf = n.includes('inferior') || n.includes('inf') || id.includes('inf');

    const prefix = face.id.split('-').slice(0, -1).join('-');
    const related = drawers.filter(p => p.id.startsWith(prefix) || normalize(p.nombre).includes(prefix));

    let y;
    if (isSup) y = thickness + 200;
    else if (isInf) y = moduleH - thickness - 200 - Number(face.alto);
    else y = (moduleH - Number(face.alto)) / 2;

    groups.push({ face, related, y });
  });

  return groups;
}

// ═══════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════

export function buildEngineForModule(pieces, moduleId, options = {}) {
  const family = options.family || detectFamily(pieces, moduleId);
  const modulePieces = pieces.filter(
    (p) => String(p.modulo || '').trim() === String(moduleId).trim()
  );

  if (!modulePieces.length) return null;

  const meta = getModuleDimensions(modulePieces, options.thickness || 15);
  const router = FamilyRouters[family] || FamilyRouters.cabinet;

  return router(modulePieces, meta);
}

function detectFamily(pieces, moduleId) {
  const modulePieces = pieces.filter(
    (p) => String(p.modulo || '').trim() === String(moduleId).trim()
  );
  const roles = modulePieces.map(p => inferRole(p));

  if (roles.some(r => r === 'leg')) {
    if (roles.some(r => r === 'seat_panel' || r === 'back_panel')) return 'seating';
    return 'table';
  }
  if (roles.some(r => r === 'door')) return 'wardrobe';
  if (roles.some(r => r.startsWith('drawer'))) return 'cabinet';
  if (roles.filter(r => r === 'shelf').length >= 3) return 'shelving';
  return 'cabinet';
}

export { inferRole, getModuleDimensions, FamilyRouters, calculateShelfPositions };
