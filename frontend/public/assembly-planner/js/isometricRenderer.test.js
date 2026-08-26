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

  it('hides piece dimension lines when not exploded', () => {
    const container = { innerHTML: '' };
    const renderer = new IsometricRenderer(container, {
      scale: 0.12,
      explodeFactor: 0,
      verticalPositionOverrides: {},
    });
    renderer.render('1', basePieces);
    const svg = container.innerHTML;
    assert.ok(!svg.includes('dimArrow'), 'no dimension arrows should be present');
  });
});
