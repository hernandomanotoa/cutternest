import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IsometricRenderer } from './isometricRenderer.js';

function parsePolygons(svg) {
  const regex = /<polygon[^>]*>/g;
  const matches = svg.match(regex) || [];
  return matches.map((tag) => {
    const fill = tag.match(/fill="([^"]+)"/)?.[1] || '';
    const pts = tag.match(/points="([^"]+)"/)?.[1] || '';
    const coords = pts.trim().split(/\s+/).map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });
    const cx = coords.reduce((s, p) => s + p.x, 0) / coords.length;
    const cy = coords.reduce((s, p) => s + p.y, 0) / coords.length;
    return { fill, coords, cx, cy };
  });
}

const RAIL_FILL = '#A0A0A0';
const BOTTOM_FILL = '#C19A6B';
const DOOR_FILL = '#FFFFFF';

const basePieces = [
  { id: 'm1-base', nombre: 'Base modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, modulo: '1' },
  { id: 'm1-tapa', nombre: 'Tapa modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, modulo: '1' },
  { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 550, alto: 2300, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
  { id: 'm1-lateral-der', nombre: 'Lateral derecho M1', ancho: 550, alto: 2300, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
  { id: 'm1-fondo', nombre: 'Fondo modulo M1', ancho: 800, alto: 2300, cantidad: 1, rotate: 'no', color: '#F2F2F2', espesor: 15, modulo: '1' },
];

describe('IsometricRenderer hanger rail', () => {
  it('places hanger rail near configured height', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, { scale: 0.12, verticalPositionOverrides: { hangerRailHeight: 1700 } });
    const pieces = [
      ...basePieces,
      { id: 'm1-barra', nombre: 'Barra colgadora M1', ancho: 400, alto: 25, cantidad: 1, rotate: 'si', color: '#A0A0A0', espesor: 25, modulo: '1' },
    ];
    renderer.render('1', pieces);
    const polys = parsePolygons(container.innerHTML);
    const railPoly = polys.find((p) => p.fill === RAIL_FILL);
    assert.ok(railPoly, 'hanger rail polygon should exist');

    // Find bottom panel polygon by its front face color
    const bottomPoly = polys.find((p) => p.fill === BOTTOM_FILL);
    assert.ok(bottomPoly, 'bottom panel polygon should exist');

    // The rail should be above the bottom panel (smaller SVG y)
    assert.ok(railPoly.cy < bottomPoly.cy, `rail y(${railPoly.cy}) should be above bottom y(${bottomPoly.cy})`);

    // And it should be well above the bottom panel (default height 1700 mm)
    assert.ok(railPoly.cy < bottomPoly.cy - 80, 'rail should be noticeably above the bottom panel');
  });

  it('respects pos_z override', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, { scale: 0.12 });
    const pieces = [
      ...basePieces,
      { id: 'm1-barra', nombre: 'Barra colgadora M1', ancho: 400, alto: 25, cantidad: 1, rotate: 'si', color: '#A0A0A0', espesor: 25, modulo: '1', pos_z: 600 },
    ];
    renderer.render('1', pieces);
    const polys = parsePolygons(container.innerHTML);
    const lowRail = polys.find((p) => p.fill === RAIL_FILL);
    assert.ok(lowRail, 'low rail polygon should exist');

    const bottomPoly = polys.find((p) => p.fill === BOTTOM_FILL);
    assert.ok(bottomPoly, 'bottom panel polygon should exist');

    // With pos_z=600, rail should be much lower than default 1700,
    // but still above the bottom panel.
    assert.ok(lowRail.cy > bottomPoly.cy - 100, 'low rail should be lower than default height');
  });
});

describe('IsometricRenderer global doors', () => {
  const globalBase = [
    { id: 'glb-trasera', nombre: 'Panel posterior armario', ancho: 1600, alto: 2300, cantidad: 1, rotate: 'no', color: '#F2F2F2', espesor: 15, modulo: 'estructura' },
  ];

  it('splits left/right global doors across full width', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, { scale: 0.12 });
    const pieces = [
      ...basePieces,
      ...globalBase,
      { id: 'glb-puerta-izq', nombre: 'Puerta corrediza izquierda', ancho: 780, alto: 2250, cantidad: 1, rotate: 'no', color: '#FFFFFF', espesor: 18, modulo: 'estructura' },
      { id: 'glb-puerta-der', nombre: 'Puerta corrediza derecha', ancho: 780, alto: 2250, cantidad: 1, rotate: 'no', color: '#FFFFFF', espesor: 18, modulo: 'estructura' },
    ];
    renderer.render('estructura', pieces);
    const polys = parsePolygons(container.innerHTML);
    const doorPolys = polys.filter((p) => p.fill === DOOR_FILL);
    assert.equal(doorPolys.length, 2, 'two front door faces should exist');
    const [left, right] = doorPolys.sort((a, b) => a.cx - b.cx);
    assert.ok(left.cx < right.cx, 'left door should be left of right door');

    // Doors should span nearly the full width of the back panel (1600 mm)
    const allXs = doorPolys.flatMap((p) => p.coords.map((c) => c.x));
    const totalSpan = Math.max(...allXs) - Math.min(...allXs);
    assert.ok(totalSpan > 1600 * 0.12 - 5, 'doors should span nearly full width');
  });

  it('single global door spans full width', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, { scale: 0.12 });
    const pieces = [
      ...basePieces,
      ...globalBase,
      { id: 'glb-puerta', nombre: 'Puerta corrediza', ancho: 780, alto: 2250, cantidad: 1, rotate: 'no', color: '#FFFFFF', espesor: 18, modulo: 'estructura' },
    ];
    renderer.render('estructura', pieces);
    const polys = parsePolygons(container.innerHTML);
    const doorPolys = polys.filter((p) => p.fill === DOOR_FILL);
    assert.equal(doorPolys.length, 1, 'single front door face should exist');

    const xs = doorPolys[0].coords.map((c) => c.x);
    const width = Math.max(...xs) - Math.min(...xs);
    assert.ok(width > 1600 * 0.12 - 5, 'single door should span nearly full width');
  });

  it('does not render global doors in individual module view', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, { scale: 0.12 });
    const pieces = [
      ...basePieces,
      ...globalBase,
      { id: 'glb-puerta-izq', nombre: 'Puerta corrediza izquierda', ancho: 780, alto: 2250, cantidad: 1, rotate: 'no', color: '#FFFFFF', espesor: 18, modulo: 'estructura' },
      { id: 'glb-puerta-der', nombre: 'Puerta corrediza derecha', ancho: 780, alto: 2250, cantidad: 1, rotate: 'no', color: '#FFFFFF', espesor: 18, modulo: 'estructura' },
    ];
    renderer.render('1', pieces);
    const polys = parsePolygons(container.innerHTML);
    const doorPolys = polys.filter((p) => p.fill === DOOR_FILL);
    assert.equal(doorPolys.length, 0, 'global doors should not appear in module view');
  });
});

describe('IsometricRenderer exploded dimensions', () => {
  it('shows piece dimension lines when explodeFactor is set', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, {
      scale: 0.12,
      explodeFactor: 0.3,
      verticalPositionOverrides: {},
    });
    renderer.render('1', basePieces);
    const svg = container.innerHTML;
    assert.ok(svg.includes('url(#dimArrow)'), 'dimension arrows should be rendered');
    assert.ok(svg.includes('>800<'), 'width dimension should be shown');
    assert.ok(svg.includes('>550<'), 'depth dimension should be shown');
    assert.ok(svg.includes('>2270<'), 'height dimension should be shown');
  });

  it('shows main module dimensions in normal view', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, {
      scale: 0.12,
      explodeFactor: 0,
      verticalPositionOverrides: {},
    });
    renderer.render('1', basePieces);
    const svg = container.innerHTML;
    assert.ok(svg.includes('url(#dimArrowX)'), 'width arrow marker should be present');
    assert.ok(svg.includes('url(#dimArrowY)'), 'depth arrow marker should be present');
    assert.ok(svg.includes('url(#dimArrowZ)'), 'height arrow marker should be present');
    assert.ok(svg.includes('>800<'), 'module width dimension should be shown');
    assert.ok(svg.includes('>550<'), 'module depth dimension should be shown');
    assert.ok(svg.includes('>2300<'), 'module height dimension should be shown');
  });

  it('hides piece dimension lines when not exploded', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, {
      scale: 0.12,
      explodeFactor: 0,
      verticalPositionOverrides: {},
    });
    renderer.render('1', basePieces);
    const svg = container.innerHTML;
    assert.ok(!svg.includes('>2270<'), 'no piece height dimension should be shown');
  });
});

describe('IsometricRenderer module gap mode', () => {
  const module2Pieces = basePieces.map((p) => ({
    ...p,
    id: p.id.replace('m1', 'm2'),
    nombre: p.nombre.replace('M1', 'M2'),
    modulo: '2',
  }));

  it('projected all view is wider than compact all view', () => {
    const pieces = [...basePieces, ...module2Pieces];
    const projected = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12, moduleGapMode: 'projected' });
    projected.render('all', pieces);
    const compact = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12, moduleGapMode: 'compact' });
    compact.render('all', pieces);

    const parseW = (svg) => {
      const match = svg.match(/viewBox="0 0 ([\d.]+)/);
      return match ? parseFloat(match[1]) : 0;
    };
    assert.ok(parseW(projected.container.innerHTML) > parseW(compact.container.innerHTML), 'projected view should be wider');
  });

  it('compact all view packs modules lateral con lateral (side by side)', () => {
    const pieces = [...basePieces, ...module2Pieces];
    const compact = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12, moduleGapMode: 'compact', isoFlip: true });
    compact.render('all', pieces);

    const match = compact.container.innerHTML.match(/viewBox="0 0 ([\d.]+)/);
    const viewBoxW = match ? parseFloat(match[1]) : 0;

    // 2 módulos W=800 D=550: "lateral con lateral" (S=W) ⇒ span horizontal = 2W + D/2.
    // No debe ser el espaciado "staircase" (2W + D) ni dejar un gap de espesor.
    const expected = (2 * 800 + 550 / 2) * 0.12 + 2 * 100;
    assert.ok(
      Math.abs(viewBoxW - expected) <= 3,
      `compact viewBoxW (${viewBoxW}) should be ≈ side-by-side ${expected}`
    );
  });
});

describe('IsometricRenderer module paint order', () => {
  const module2Pieces = basePieces.map((p) => ({
    ...p,
    id: p.id.replace('m1', 'm2'),
    nombre: p.nombre.replace('M1', 'M2'),
    modulo: '2',
  }));

  it('all view paints module by module (M1 complete before M2)', () => {
    const pieces = [...basePieces, ...module2Pieces];
    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12, moduleGapMode: 'compact' });
    renderer.render('all', pieces);

    const polys = parsePolygons(renderer.container.innerHTML);
    // La cara frontal del "fondo" (back_panel) tiene fill #F2F2F2.
    const backFaces = polys
      .map((p, i) => ({ i, p }))
      .filter(({ p }) => p.fill === '#F2F2F2');

    // Un fondo por módulo.
    assert.equal(backFaces.length, 2, 'expected two back panel front faces (M1 y M2)');

    // M1 se dibuja completo antes de M2: entre el fondo de M1 y el de M2
    // deben estar las demás piezas de M1 (laterales, base, tapa).
    const [first, second] = backFaces;
    assert.ok(
      second.i - first.i > 6,
      `M2 back should come after M1 pieces (gap ${second.i - first.i})`
    );
  });
});

describe('IsometricRenderer back panel mounting', () => {
  it('renders external back panel at full module dimensions', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, {});
    const geoms = renderer._buildModuleGeometries(basePieces, 800, 550, 2300, 15, 'cabinet');
    const back = geoms.find((g) => g.role === 'back_panel');
    assert.ok(back, 'back panel geometry should exist');
    assert.equal(back.w, 800);
    assert.equal(back.h, 2300);
    assert.equal(back.x, 0);
    assert.equal(back.z, 0);
    assert.equal(back.d, 15);
  });

  it('renders internal back panel inset by thickness', () => {
    const internalBack = {
      ...basePieces.find((p) => p.id === 'm1-fondo'),
      ancho: 770,
      alto: 2270,
    };
    const pieces = [
      ...basePieces.filter((p) => p.id !== 'm1-fondo'),
      internalBack,
    ];
    const renderer = new IsometricRenderer({ innerHTML: '' }, {});
    const geoms = renderer._buildModuleGeometries(pieces, 800, 550, 2300, 15, 'cabinet');
    const back = geoms.find((g) => g.role === 'back_panel');
    assert.ok(back, 'back panel geometry should exist');
    assert.equal(back.w, 770);
    assert.equal(back.h, 2270);
    assert.equal(back.x, 15);
    assert.equal(back.z, 15);
  });
});

describe('IsometricRenderer top/bottom mounting', () => {
  const internalBasePieces = (plinthHeight = 100) => [
    { id: 'm1-base', nombre: 'Base modulo M1', ancho: 770, alto: 520, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-tapa', nombre: 'Tapa modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 550, alto: 2300, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-lateral-der', nombre: 'Lateral derecho M1', ancho: 550, alto: 2300, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-fondo', nombre: 'Fondo modulo M1', ancho: 800, alto: 2300, cantidad: 1, rotate: 'no', color: '#F2F2F2', espesor: 15, modulo: '1' },
  ];

  it('renders internal bottom panel inset and raised to global plinth height', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, {});
    const geoms = renderer._buildModuleGeometries(internalBasePieces(), 800, 550, 2300, 15, 'cabinet', 100, 0);
    const base = geoms.find((g) => g.role === 'bottom_panel');
    assert.ok(base, 'bottom panel geometry should exist');
    assert.equal(base.x, 15, 'internal base x should be inset by thickness');
    assert.equal(base.y, 15, 'internal base y should be inset by thickness');
    assert.equal(base.z, 100, 'internal base should sit on top of global plinth');
    assert.equal(base.w, 770, 'internal base width should match interior size');
    assert.equal(base.d, 520, 'internal base depth should match interior size');
    assert.equal(base.h, 15, 'internal base height should be thickness');
  });

  it('draws sides from floor to top when base is internal', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, {});
    const geoms = renderer._buildModuleGeometries(internalBasePieces(), 800, 550, 2300, 15, 'cabinet', 100, 0);
    const sides = geoms.filter((g) => g.role === 'side_panel_front' || g.role === 'side_panel_rear');
    assert.equal(sides.length, 2, 'two side panels should exist');
    sides.forEach((side) => {
      assert.equal(side.z, 0, 'side panel should start at floor');
      assert.equal(side.h, 2285, 'side panel should reach just below external top');
    });
  });

  it('respects bottomPanelOffset override even with internal base', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, { verticalPositionOverrides: { bottomPanelOffset: 150 } });
    const geoms = renderer._buildModuleGeometries(internalBasePieces(), 800, 550, 2300, 15, 'cabinet', 100, 0);
    const base = geoms.find((g) => g.role === 'bottom_panel');
    assert.equal(base.z, 150, 'internal base should respect user override');
  });
});

describe('IsometricRenderer glass transparency', () => {
  it('renders vidrio/cristal as a transparent front panel', () => {
    const pieces = [
      ...basePieces,
      { id: 'm1-vidrio', nombre: 'Cristal puerta vitrina', ancho: 300, alto: 700, cantidad: 1, rotate: 'no', color: '#E8F4F8', espesor: 4, modulo: '1' },
    ];
    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12 });
    renderer.render('1', pieces);

    const svg = renderer.container.innerHTML;
    // El vidrio se dibuja como panel frontal transparente (opacity 0.3).
    assert.ok(
      /fill="#E8F4F8"[^>]*opacity="0\.3"/.test(svg),
      'glass front face should be rendered transparent (opacity 0.3)'
    );
  });
});

describe('IsometricRenderer front panel stacking', () => {
  it('places superior door above inferior door', () => {
    const pieces = [
      ...basePieces,
      { id: 'm1-puerta-sup', nombre: 'Puerta superior', ancho: 400, alto: 900, cantidad: 1, rotate: 'no', color: '#FFFFFF', espesor: 18, modulo: '1' },
      { id: 'm1-puerta-inf', nombre: 'Puerta inferior', ancho: 400, alto: 900, cantidad: 1, rotate: 'no', color: '#EEEEEE', espesor: 18, modulo: '1' },
    ];
    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12 });
    renderer.render('1', pieces);

    const polys = parsePolygons(renderer.container.innerHTML);
    const sup = polys.filter((p) => p.fill === '#FFFFFF');
    const inf = polys.filter((p) => p.fill === '#EEEEEE');
    assert.equal(sup.length, 1, 'one superior door front face expected');
    assert.equal(inf.length, 1, 'one inferior door front face expected');
    assert.ok(sup[0].cy < inf[0].cy, `superior door should be above inferior (${sup[0].cy} < ${inf[0].cy})`);
  });
});

describe('IsometricRenderer shoe rack label', () => {
  it('labels feminine shoe racks as Zapatero', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, {});
    const label = renderer._makeLabel({ role: 'shelf', name: 'Zapatera inferior M1', id: 'm1-zapatera' });
    assert.equal(label, 'Zapatero');
  });

  it('labels plain shelves as Repisa', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, {});
    const label = renderer._makeLabel({ role: 'shelf', name: 'Repisa inferior M1', id: 'm1-repisa' });
    assert.equal(label, 'Repisa');
  });

  it('labels masculine shoe racks as Zapatero', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, {});
    const label = renderer._makeLabel({ role: 'shelf', name: 'Zapatero inferior M1', id: 'm1-zapatero' });
    assert.equal(label, 'Zapatero');
  });
});
