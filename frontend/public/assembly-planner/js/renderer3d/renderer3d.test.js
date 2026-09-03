import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPiece3D, generateVertices, CUBOID_FACES, computeModuleCenter } from './geometry.js';
import { rotateVertex, projectVertex, projectVertexCentered, applyExplode, lerp } from './transform.js';
import { classifyPiece } from './classifier3d.js';
import { makeDimensionLines } from './materials.js';
import { OrbitControls, DEFAULT_CAMERA } from './camera.js';
import { buildSVG } from './svgBuilder.js';

describe('renderer3d/geometry', () => {
  it('buildPiece3D creates a vertical piece from a side panel CSV row', () => {
    const piece = buildPiece3D({
      id: 'm1-lateral-izq',
      nombre: 'Lateral izquierdo 1',
      ancho: 600,
      alto: 2000,
      cantidad: 1,
      rotate: 'no',
      color: '#8B5A2B',
      espesor: 15,
      cantos: 'T,B,L,R',
      modulo: '1',
      pos_z: '',
    });
    assert.equal(piece.w, 15, 'width should be thickness');
    assert.equal(piece.h, 2000, 'height should be CSV alto');
    assert.equal(piece.d, 600, 'depth should be CSV ancho');
    assert.equal(piece.cx, 7.5);
    assert.equal(piece.cy, 300);
    assert.equal(piece.cz, 1000);
    assert.equal(piece.role, 'side_panel');
    assert.deepEqual(piece.cantos, ['T', 'B', 'L', 'R']);
  });

  it('buildPiece3D swaps ancho/alto when rotate=si before orienting', () => {
    const piece = buildPiece3D({
      id: 'm1-base',
      nombre: 'Base módulo 1',
      ancho: 650,
      alto: 585,
      cantidad: 1,
      rotate: 'si',
      color: '#8B5A2B',
      espesor: 15,
      cantos: 'T,B,L,R',
      modulo: '1',
    });
    // rotate=si => físico ancho=585, alto=650. Base es horizontal_xy => w=585, h=15, d=650
    assert.equal(piece.w, 585);
    assert.equal(piece.h, 15);
    assert.equal(piece.d, 650);
    assert.equal(piece.rotated, true);
  });

  it('buildPiece3D treats back panel as horizontal_xz', () => {
    const piece = buildPiece3D({
      id: 'm1-fondo',
      nombre: 'Fondo módulo 1',
      ancho: 650,
      alto: 1900,
      cantidad: 1,
      rotate: 'no',
      color: '#F2F2F2',
      espesor: 15,
      cantos: '',
      modulo: '1',
    });
    assert.equal(piece.tipo, 'horizontal_xz');
    assert.equal(piece.w, 650);
    assert.equal(piece.h, 1900);
    assert.equal(piece.d, 15);
  });

  it('generateVertices returns 8 vertices', () => {
    const verts = generateVertices({ x: 0, y: 0, z: 0, w: 10, h: 20, d: 30 });
    assert.equal(verts.length, 8);
    assert.deepEqual(verts[0], { x: 0, y: 0, z: 0 });
    assert.deepEqual(verts[7], { x: 0, y: 30, z: 20 });
  });

  it('computeModuleCenter averages centroids', () => {
    const pieces = [
      { cx: 0, cy: 0, cz: 0 },
      { cx: 10, cy: 20, cz: 30 },
    ];
    const center = computeModuleCenter(pieces);
    assert.deepEqual(center, { x: 5, y: 10, z: 15 });
  });
});

describe('renderer3d/transform', () => {
  it('rotateVertex keeps z unchanged when both angles are 0', () => {
    const v = { x: 10, y: 20, z: 30 };
    const r = rotateVertex(v, 0, 0);
    assert.deepEqual(r, { x: 10, y: 20, z: 30 });
  });

  it('projectVertex scales and offsets', () => {
    const p = projectVertex({ x: 10, y: 20, z: 30 }, 0.5, 100, 200);
    assert.equal(p.x, 105);
    assert.equal(p.y, 190);
  });

  it('applyExplode moves interior pieces more than envelope pieces', () => {
    const pieces = [
      { id: 'side', role: 'side_panel', x: 0, y: 0, z: 0, w: 15, h: 100, d: 50, cx: 7.5, cy: 25, cz: 50, tipo: 'vertical' },
      { id: 'shelf', role: 'shelf', x: 15, y: 10, z: 40, w: 50, h: 5, d: 40, cx: 40, cy: 30, cz: 42.5, tipo: 'horizontal_xy' },
    ];
    const center = computeModuleCenter(pieces);
    const exploded = applyExplode(pieces, 0.5, center, classifyPiece);

    const side = exploded.find((p) => p.id === 'side');
    const shelf = exploded.find((p) => p.id === 'shelf');

    // side es envelope => desplazamiento menor
    // shelf es interior => desplazamiento mayor
    const sideMove = Math.hypot(side.x - pieces[0].x, side.y - pieces[0].y, side.z - pieces[0].z);
    const shelfMove = Math.hypot(shelf.x - pieces[1].x, shelf.y - pieces[1].y, shelf.z - pieces[1].z);
    assert.ok(shelfMove > sideMove, 'interior piece should move more than envelope');
  });

  it('applyExplode anchors plinth pieces', () => {
    const pieces = [
      { id: 'plinth', role: 'plinth', x: 0, y: 0, z: 0, w: 100, h: 10, d: 50, cx: 50, cy: 25, cz: 5, tipo: 'horizontal_xy' },
      { id: 'shelf', role: 'shelf', x: 0, y: 0, z: 50, w: 100, h: 5, d: 50, cx: 50, cy: 25, cz: 52.5, tipo: 'horizontal_xy' },
    ];
    const center = computeModuleCenter(pieces);
    const exploded = applyExplode(pieces, 1.0, center, classifyPiece);
    const plinth = exploded.find((p) => p.id === 'plinth');
    assert.ok(Math.abs(plinth.x - pieces[0].x) < 3, 'plinth should stay almost fixed');
    assert.ok(Math.abs(plinth.z - pieces[0].z) < 3, 'plinth should stay almost fixed');
  });

  it('lerp interpolates linearly', () => {
    assert.equal(lerp(0, 10, 0.5), 5);
    assert.equal(lerp(0, 10, 0), 0);
    assert.equal(lerp(0, 10, 1), 10);
  });
});

describe('renderer3d/classifier3d', () => {
  it('classifies side panel as envelope', () => {
    assert.equal(classifyPiece({ role: 'side_panel' }), 'envelope');
  });

  it('classifies bottom panel as structural', () => {
    assert.equal(classifyPiece({ role: 'bottom_panel' }), 'structural');
  });

  it('classifies shelf as interior', () => {
    assert.equal(classifyPiece({ role: 'shelf' }), 'interior');
  });

  it('classifies hanger rail as interior', () => {
    assert.equal(classifyPiece({ role: 'hanger_rail' }), 'interior');
  });
});

describe('renderer3d/svgBuilder — explode lines', () => {
  const piece = {
    id: 'p1', name: 'Pieza 1', role: 'shelf', tipo: 'horizontal_xy',
    x: 0, y: 0, z: 0, w: 100, h: 10, d: 50, cx: 50, cy: 25, cz: 5,
    color: '#C19A6B', cantos: [], cantidad: 1, modulo: '1',
  };
  const camera = { rotX: 0, rotY: 0, scale: 0.5, offsetX: 200, offsetY: 150 };

  it('renders explode guide lines when provided', () => {
    const svg = buildSVG([piece], camera, {
      explodeLines: [{ id: 'p1', from: { x: 100, y: 100 }, to: { x: 130, y: 100 } }],
    });
    assert.ok(svg.includes('r3d-explode-lines'), 'has explode lines group');
    assert.ok((svg.match(/<line /g) || []).length >= 1, 'has at least one line');
    assert.ok(svg.includes('stroke-dasharray'), 'lines are dashed');
  });

  it('does not render explode lines group when empty', () => {
    const svg = buildSVG([piece], camera, { explodeLines: [] });
    assert.ok(!svg.includes('r3d-explode-lines'));
  });
});

describe('renderer3d/materials', () => {
  it('makeDimensionLines renders width, height and central depth label', () => {
    const frontPolygon = [
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ];
    const piece = { w: 100, d: 50, h: 100 };
    const svg = makeDimensionLines(frontPolygon, piece);
    assert.ok(svg.includes('100'), 'shows width label');
    assert.ok(svg.includes('50'), 'shows depth label');
    assert.ok(svg.includes('×'), 'shows dimension separator');
  });

  it('makeDimensionLines returns empty string for invalid polygon', () => {
    assert.equal(makeDimensionLines(null, { w: 1, d: 1, h: 1 }), '');
    assert.equal(makeDimensionLines([], { w: 1, d: 1, h: 1 }), '');
  });
});

describe('renderer3d/camera', () => {
  if (typeof window === 'undefined') {
    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
    };
  }

  it('OrbitControls exposes addChangeListener and triggers callbacks on rotation change', () => {
    let calls = 0;
    const container = {
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect() { return { left: 0, top: 0 }; },
    };
    const controls = new OrbitControls(container, { rotX: 0, rotY: 0 });
    controls.addChangeListener(() => calls++);
    controls.setState({ rotY: 10 });
    assert.equal(calls, 1);
    controls.destroy();
  });

  it('reset restores default camera values', () => {
    const container = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0 }; } };
    const controls = new OrbitControls(container, { rotX: 45, rotY: 45 });
    controls.reset();
    const state = controls.getState();
    assert.equal(state.rotX, DEFAULT_CAMERA.rotX);
    assert.equal(state.rotY, DEFAULT_CAMERA.rotY);
    controls.destroy();
  });
});


describe('renderer3d/transform — perspectiva', () => {
  it('projectVertexCentered ortho ignores depth', () => {
    const camera = { rotX: 0, rotY: 0, scale: 0.1, offsetX: 0, offsetY: 0, projection: 'ortho' };
    const near = projectVertexCentered({ x: 100, y: 100, z: 0 }, { x: 0, y: 0, z: 0 }, camera);
    const far = projectVertexCentered({ x: 100, y: -100, z: 0 }, { x: 0, y: 0, z: 0 }, camera);
    assert.equal(near.x, far.x);
  });

  it('projectVertexCentered persp scales closer points larger', () => {
    const camera = { rotX: 0, rotY: 0, scale: 0.1, offsetX: 0, offsetY: 0, projection: 'persp', perspDistance: 1000 };
    const near = projectVertexCentered({ x: 100, y: 200, z: 0 }, { x: 0, y: 0, z: 0 }, camera);
    const far = projectVertexCentered({ x: 100, y: -200, z: 0 }, { x: 0, y: 0, z: 0 }, camera);
    assert.ok(Math.abs(near.x) > Math.abs(far.x));
    assert.ok(far.x > 0, 'punto lejano no cruza el centro');
  });

  it('projectVertexCentered persp clamps depth to avoid blowup', () => {
    const camera = { rotX: 0, rotY: 0, scale: 0.1, offsetX: 0, offsetY: 0, projection: 'persp', perspDistance: 1000 };
    const extreme = projectVertexCentered({ x: 100, y: 5000, z: 0 }, { x: 0, y: 0, z: 0 }, camera);
    assert.ok(Number.isFinite(extreme.x));
    assert.ok(Math.abs(extreme.x) < 100 * 0.1 * 6);
  });
});


describe('renderer3d/renderer3D — BOM API', () => {
  if (typeof window === 'undefined') {
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
  }
  if (typeof document === 'undefined') {
    globalThis.document = { createElement: () => ({ style: {} }) };
  }
  if (typeof requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => {};
  }

  const container = () => ({
    style: {}, innerHTML: '',
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }),
    addEventListener() {}, removeEventListener() {},
  });

  const samplePieces = [
    { id: 'p1', nombre: 'Lateral', ancho: 600, alto: 2000, cantidad: 1, rotate: 'no', color: '#8B5A2B', espesor: 15, cantos: 'T,B', modulo: '1', pos_z: '' },
    { id: 'p2', nombre: 'Estante', ancho: 570, alto: 500, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, cantos: 'T,L', modulo: '1', pos_z: '500' },
  ];

  it('setSelectedId/setHoveredId update state and mark for render', async () => {
    const { Renderer3D } = await import('./renderer3D.js');
    const r = new Renderer3D(container(), { width: 900, height: 600 });
    r.load('1', samplePieces);
    r.needsRender = false;
    r.setSelectedId('p1');
    assert.equal(r.selectedId, 'p1');
    assert.equal(r.needsRender, true);
    r.needsRender = false;
    r.setHoveredId('p2');
    assert.equal(r.hoveredId, 'p2');
    assert.equal(r.needsRender, true);
    r.destroy();
  });

  it('onPieceSelect callback fires when interaction selects a piece', async () => {
    const { Renderer3D } = await import('./renderer3D.js');
    let notified = null;
    const listeners = {};
    const cont = {
      ...container(),
      addEventListener(type, fn) { listeners[type] = fn; },
    };
    const r = new Renderer3D(cont, {
      width: 900, height: 600,
      onPieceSelect: (id) => { notified = id; },
    });
    r.load('1', samplePieces);
    const target = {
      getAttribute: (n) => (n === 'data-piece-id' ? 'p1' : null),
      closest: () => target,
    };
    listeners.click({ target });
    assert.equal(notified, 'p1');
    assert.equal(r.selectedId, 'p1');
    r.destroy();
  });

  it('buildSVG highlights hovered piece faces', () => {
    const pieces = [
      { id: 'p1', name: 'A', role: 'side_panel', tipo: 'vertical', x: 0, y: 0, z: 0, w: 15, h: 100, d: 50, cx: 7.5, cy: 25, cz: 50, color: '#8B5A2B', cantos: [], cantidad: 1, modulo: '1' },
      { id: 'p2', name: 'B', role: 'shelf', tipo: 'horizontal_xy', x: 15, y: 10, z: 40, w: 50, h: 5, d: 40, cx: 40, cy: 30, cz: 42.5, color: '#C19A6B', cantos: [], cantidad: 1, modulo: '1' },
    ];
    const camera = { rotX: 0, rotY: 0, scale: 0.5, offsetX: 200, offsetY: 150, projection: 'ortho' };
    const svg = buildSVG(pieces, camera, { hoveredId: 'p2' });
    const p2Polys = svg.split('<polygon').filter((s) => s.includes('data-piece-id="p2"'));
    assert.ok(p2Polys.length > 0);
    assert.ok(p2Polys.every((s) => s.includes('#FFD700')), 'all hovered faces highlighted');
  });
});


describe('renderer3d/svgBuilder — section planes', () => {
  const mkPiece = (id, cx, cy, cz) => ({
    id, name: id, role: 'shelf', tipo: 'horizontal_xy',
    x: cx - 25, y: cy - 20, z: cz - 2, w: 50, h: 5, d: 40,
    cx, cy, cz, color: '#C19A6B', cantos: [], cantidad: 1, modulo: '1',
  });
  const camera = { rotX: 0, rotY: 0, scale: 0.5, offsetX: 200, offsetY: 150, projection: 'ortho' };
  const moduleSize = { w: 200, d: 200, h: 200 };

  it('excludes pieces beyond the section plane on axis z', () => {
    const pieces = [mkPiece('low', 100, 100, 50), mkPiece('high', 100, 100, 150)];
    const svg = buildSVG(pieces, camera, {
      section: { axis: 'z', value: 100 },
      moduleSize,
    });
    assert.ok(svg.includes('data-piece-id="low"'));
    assert.ok(!svg.includes('data-piece-id="high"'), 'piece above plane is clipped');
  });

  it('section at full size includes everything and renders the plane indicator', () => {
    const pieces = [mkPiece('low', 100, 100, 50), mkPiece('high', 100, 100, 150)];
    const svg = buildSVG(pieces, camera, {
      section: { axis: 'z', value: 200 },
      moduleSize,
    });
    assert.ok(svg.includes('data-piece-id="low"'));
    assert.ok(svg.includes('data-piece-id="high"'));
    assert.ok(svg.includes('#58a6ff'), 'plane indicator rendered');
  });

  it('no section renders all pieces', () => {
    const pieces = [mkPiece('low', 100, 100, 50), mkPiece('high', 100, 100, 150)];
    const svg = buildSVG(pieces, camera, { moduleSize });
    assert.ok(svg.includes('data-piece-id="low"'));
    assert.ok(svg.includes('data-piece-id="high"'));
  });
});

describe('renderer3d/renderer3D — setSection', () => {
  it('setSection stores axis/value and clamps t', async () => {
    const { Renderer3D } = await import('./renderer3D.js');
    if (typeof window === 'undefined') globalThis.window = { addEventListener() {}, removeEventListener() {} };
    if (typeof document === 'undefined') globalThis.document = { createElement: () => ({ style: {} }) };
    if (typeof requestAnimationFrame === 'undefined') { globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {}; }
    const cont = {
      style: {}, innerHTML: '',
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }),
      addEventListener() {}, removeEventListener() {},
    };
    const r = new Renderer3D(cont, { width: 900, height: 600 });
    r.load('1', [
      { id: 'p1', nombre: 'Lateral', ancho: 600, alto: 2000, cantidad: 1, rotate: 'no', color: '#8B5A2B', espesor: 15, cantos: '', modulo: '1', pos_z: '' },
    ]);
    r.setSection('z', 0.5);
    assert.equal(r.section.axis, 'z');
    assert.ok(Math.abs(r.section.value - r.moduleH * 0.5) < 1e-6);
    r.setSection('z', 5);
    assert.equal(r.section.value, r.moduleH, 't clamped to 1');
    r.setSection(null);
    assert.equal(r.section, null);
    r.destroy();
  });
});


describe('renderer3d/svgBuilder — hatch de corte', () => {
  const mkPiece = (id, z, h = 10) => ({
    id, name: id, role: 'shelf', tipo: 'horizontal_xy',
    x: 50, y: 50, z, w: 100, h, d: 80,
    cx: 100, cy: 90, cz: z + h / 2,
    color: '#C19A6B', cantos: [], cantidad: 1, modulo: '1',
  });
  const camera = { rotX: 0, rotY: 0, scale: 0.5, offsetX: 200, offsetY: 150, projection: 'ortho' };
  const moduleSize = { w: 200, d: 200, h: 200 };

  it('cut piece gets hatch fill, untouched piece does not', () => {
    const pieces = [mkPiece('cut', 45, 10), mkPiece('whole', 150, 10)];
    const svg = buildSVG(pieces, camera, {
      section: { axis: 'z', value: 50 },
      moduleSize,
    });
    assert.ok(svg.includes('r3d-hatch'), 'pattern defined');
    assert.ok(svg.includes('fill="url(#r3d-hatch)"'), 'cut face hatched');
    const hatchPolys = svg.split('<polygon').filter((s) => s.includes('url(#r3d-hatch)'));
    assert.equal(hatchPolys.length, 1, 'exactly one cut face');
  });

  it('no cut faces when plane only touches piece boundary', () => {
    const pieces = [mkPiece('whole', 50, 10)];
    const svg = buildSVG(pieces, camera, {
      section: { axis: 'z', value: 50 }, // igual al borde inferior: no atraviesa
      moduleSize,
    });
    assert.ok(!svg.includes('url(#r3d-hatch)'));
  });
});
