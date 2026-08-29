import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  useVisualThickness,
  getPieceDims,
  getModuleDimensions,
  classifyBackPanelMount,
  classifyTopBottomMount,
  classifyPlinthMount,
  shelfRank,
  calculateShelfPositions,
} from '../geometryService.js';

const piece = (name, ancho, alto, espesor, rotate = 'no', overrides = {}) => ({
  id: overrides.id ?? 'P-1',
  nombre: name,
  ancho,
  alto,
  espesor,
  rotate,
});

describe('useVisualThickness', () => {
  it('returns alto when it is close to thickness', () => {
    assert.equal(useVisualThickness(20, 15), 20);
  });

  it('returns thickness when alto is much larger', () => {
    assert.equal(useVisualThickness(100, 15), 15);
  });
});

describe('getPieceDims', () => {
  it('computes horizontal panel dimensions', () => {
    const p = piece('Base', 600, 18, 18);
    assert.deepEqual(getPieceDims(p, 'bottom_panel', 18, 'cabinet'), { w: 600, h: 18 });
  });

  it('uses visual thickness for shelves', () => {
    const p = piece('Repisa', 500, 100, 18);
    const dims = getPieceDims(p, 'shelf', 18, 'cabinet');
    assert.equal(dims.w, 500);
    assert.equal(dims.h, 18);
  });

  it('keeps full shelf dims for shelving family', () => {
    const p = piece('Repisa', 500, 100, 18);
    assert.deepEqual(getPieceDims(p, 'shelf', 18, 'shelving'), { w: 500, h: 100 });
  });

  it('computes side panel seen from edge', () => {
    const p = piece('Lateral', 600, 400, 18);
    // ancho = profundidad, alto = altura -> el alto del lateral es `alto` (400).
    assert.deepEqual(getPieceDims(p, 'side_panel', 18, 'cabinet'), { w: 18, h: 400 });
  });

  it('computes vertical divider dims as thickness x height', () => {
    const p = piece('Division vertical', 550, 2400, 15);
    assert.deepEqual(getPieceDims(p, 'divider', 15, 'cabinet'), { w: 15, h: 2400 });
  });

  it('computes horizontal divider dims as width x visual thickness', () => {
    const p = piece('Division horizontal', 800, 18, 15);
    const dims = getPieceDims(p, 'divider', 15, 'cabinet');
    assert.equal(dims.w, 800);
    assert.equal(dims.h, 18);
  });

  it('rotates dims when rotate is si', () => {
    const p = piece('Pieza', 100, 500, 18, 'si');
    assert.deepEqual(getPieceDims(p, 'back_panel', 18, 'cabinet'), { w: 500, h: 100 });
  });
});

describe('getModuleDimensions', () => {
  it('derives dims from back panel for cabinet', () => {
    const pieces = [
      piece('Fondo', 800, 600, 15, 'no', { id: 'F' }),
      piece('Base', 800, 100, 15, 'no', { id: 'B' }),
    ];
    assert.deepEqual(getModuleDimensions(pieces, 15, 'cabinet'), { width: 800, height: 600, depth: 100, thickness: 15 });
  });

  it('derives table dims from top and legs', () => {
    const pieces = [
      piece('Tapa', 900, 25, 25, 'no', { id: 'T' }),
      piece('Pata', 80, 700, 25, 'no', { id: 'L' }),
    ];
    const dims = getModuleDimensions(pieces, 25, 'table');
    assert.equal(dims.width, 900);
    assert.equal(dims.height, 725);
    assert.equal(dims.depth, 25);
  });

  it('falls back to defaults when no pieces', () => {
    assert.deepEqual(getModuleDimensions([], 18), { width: 900, height: 600, depth: 0, thickness: 18 });
  });
});

describe('classifyBackPanelMount', () => {
  it('detects external back (full module box)', () => {
    const back = piece('Fondo', 865, 2400, 18, 'no');
    assert.equal(classifyBackPanelMount(back, 865, 2400, 18), 'external');
  });

  it('detects internal back (inset by thickness on each side)', () => {
    const back = piece('Fondo', 829, 2364, 18, 'no');
    assert.equal(classifyBackPanelMount(back, 865, 2400, 18), 'internal');
  });

  it('returns custom for arbitrary dimensions', () => {
    const back = piece('Fondo', 800, 2000, 18, 'no');
    assert.equal(classifyBackPanelMount(back, 865, 2400, 18), 'custom');
  });

  it('uses default thickness 15 when not provided', () => {
    const back = piece('Fondo', 835, 2370, 15, 'no');
    assert.equal(classifyBackPanelMount(back, 865, 2400), 'internal');
  });
});

describe('classifyTopBottomMount', () => {
  it('detects external top/bottom panel', () => {
    const top = piece('Tapa', 800, 550, 15);
    assert.equal(classifyTopBottomMount(top, 800, 550, 15), 'external');
  });

  it('detects internal top/bottom panel', () => {
    const bottom = piece('Base', 770, 520, 15);
    assert.equal(classifyTopBottomMount(bottom, 800, 550, 15), 'internal');
  });

  it('returns custom for arbitrary dimensions', () => {
    const bottom = piece('Base', 600, 400, 15);
    assert.equal(classifyTopBottomMount(bottom, 800, 550, 15), 'custom');
  });

  it('allows ±2 mm tolerance for external panels', () => {
    const top = piece('Tapa', 802, 548, 15);
    assert.equal(classifyTopBottomMount(top, 800, 550, 15), 'external');
  });

  it('allows ±2 mm tolerance for internal panels', () => {
    const bottom = piece('Base', 772, 522, 15);
    assert.equal(classifyTopBottomMount(bottom, 800, 550, 15), 'internal');
  });
});

describe('classifyPlinthMount', () => {
  it('detects external plinth matching full module width and plinth height', () => {
    const plinth = piece('Zócalo', 800, 100, 15);
    assert.equal(classifyPlinthMount(plinth, 800, 100, 15), 'external');
  });

  it('detects internal plinth inset by thickness on each side', () => {
    const plinth = piece('Zócalo', 770, 100, 15);
    assert.equal(classifyPlinthMount(plinth, 800, 100, 15), 'internal');
  });

  it('returns custom for arbitrary dimensions', () => {
    const plinth = piece('Zócalo', 600, 80, 15);
    assert.equal(classifyPlinthMount(plinth, 800, 100, 15), 'custom');
  });

  it('uses default thickness 15 when not provided', () => {
    const plinth = piece('Zócalo', 770, 100, 15);
    assert.equal(classifyPlinthMount(plinth, 800, 100), 'internal');
  });
});

describe('shelfRank', () => {
  it('orders known positions', () => {
    assert.equal(shelfRank('Repisa superior'), 0);
    assert.equal(shelfRank('Repisa medio'), 1);
    assert.equal(shelfRank('Repisa inferior'), 2);
    assert.ok(shelfRank('Repisa 1') > 100);
  });
});

describe('calculateShelfPositions', () => {
  it('stacks shelves from base', () => {
    const shelves = [piece('Repisa 1', 500, 18, 18), piece('Repisa 2', 500, 18, 18)];
    const positions = calculateShelfPositions(600, shelves, 18, 'cabinet');
    assert.equal(positions.length, 2);
    assert.ok(positions[0].y < positions[1].y);
  });

  it('returns empty array when no shelves', () => {
    assert.deepEqual(calculateShelfPositions(600, [], 18, 'cabinet'), []);
  });
});
