import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDoorRotation,
  applyExplode,
  calculateVerticalZones,
  computeBays,
  distributeHorizontally,
  drawerRank,
  getModuleDepth,
  inferDividerX,
  inferDoorX,
  inferDoorZ,
  inferLegX,
  inferLegY,
  inferRailZ,
  inferShelfBayIndex,
  shouldShowLabel,
} from '../isoGeometryService.js';

const piece = (nombre, ancho = 100, alto = 100, espesor = 15, id = 'P') => ({
  id,
  nombre,
  ancho,
  alto,
  espesor,
});

describe('getModuleDepth', () => {
  it('uses alto of horizontal panels', () => {
    const pieces = [piece('Base', 600, 500, 18)];
    assert.equal(getModuleDepth(pieces), 500);
  });

  it('uses min dimension of side panels', () => {
    const pieces = [piece('Lateral', 18, 600, 18)];
    assert.equal(getModuleDepth(pieces), 18);
  });

  it('falls back to 400 when no clues', () => {
    assert.equal(getModuleDepth([]), 400);
  });
});

describe('drawerRank', () => {
  it('ranks superior lower than inferior', () => {
    assert.ok(drawerRank({ nombre: 'Cajón superior', id: 'CS' }) < drawerRank({ nombre: 'Cajón inferior', id: 'CI' }));
  });

  it('returns 50 for medio', () => {
    assert.equal(drawerRank({ nombre: 'Cajón medio', id: 'CM' }), 50);
  });
});

describe('applyDoorRotation', () => {
  it('returns same geo when angle is 0', () => {
    const geo = { x: 0, y: 0, z: 0, w: 100, d: 20, h: 600 };
    assert.deepEqual(applyDoorRotation(geo, 0), geo);
  });

  it('changes depth and position for non-zero angle', () => {
    const geo = { x: 0, y: 0, z: 0, w: 100, d: 20, h: 600 };
    const rotated = applyDoorRotation(geo, 45);
    assert.notEqual(rotated.d, 20);
    assert.notEqual(rotated.x, 0);
  });
});

describe('applyExplode', () => {
  it('displaces geometries away from center', () => {
    const geometries = [{ x: 0, y: 0, z: 0, w: 100, d: 100, h: 100 }];
    const exploded = applyExplode(geometries, 200, 200, 200, 1);
    assert.ok(exploded[0].x < 0);
    assert.ok(exploded[0].y < 0);
    assert.ok(exploded[0].z < 0);
  });

  it('returns same geometries when factor is 0', () => {
    const geometries = [{ x: 10, y: 10, z: 10, w: 10, d: 10, h: 10 }];
    const result = applyExplode(geometries, 100, 100, 100, 0);
    assert.deepEqual(result, geometries);
  });
});

describe('calculateVerticalZones', () => {
  it('creates zones from shelves', () => {
    const zones = calculateVerticalZones(600, 18, [{ y: 200, h: 18 }], true, true);
    assert.equal(zones.length, 2);
    assert.equal(zones[0].yStart, 18);
    assert.equal(zones[1].yEnd, 582);
  });
});

describe('distributeHorizontally', () => {
  it('centers a single divider', () => {
    assert.deepEqual(distributeHorizontally(1, 1000, 18), [500]);
  });

  it('spaces multiple dividers evenly', () => {
    const positions = distributeHorizontally(2, 1000, 18);
    assert.equal(positions.length, 2);
    assert.ok(positions[0] < positions[1]);
  });
});

describe('inferDividerX', () => {
  it('centers central divider', () => {
    assert.equal(inferDividerX({ nombre: 'Divisor central', ancho: 300 }, 1000, 18), 350);
  });

  it('places left divider near left side', () => {
    assert.equal(inferDividerX({ nombre: 'Divisor izquierdo', ancho: 30 }, 1000, 18), 18);
  });

  it('places right divider near right side', () => {
    assert.equal(inferDividerX({ nombre: 'Divisor derecho', ancho: 30 }, 1000, 18), 952);
  });

  it('centers vertical divider without directional keyword', () => {
    const div = { nombre: 'Division vertical M3', ancho: 550, alto: 2400, espesor: 15 };
    assert.equal(inferDividerX(div, 800, 15), 392.5);
  });

  it('places left vertical divider at inner face of side panel', () => {
    const div = { nombre: 'Division izquierda', ancho: 550, alto: 2400, espesor: 15 };
    assert.equal(inferDividerX(div, 800, 15), 15);
  });

  it('places right vertical divider at inner face of right side', () => {
    const div = { nombre: 'Division derecha', ancho: 550, alto: 2400, espesor: 15 };
    assert.equal(inferDividerX(div, 800, 15), 770);
  });
});

describe('computeBays', () => {
  it('returns single bay when no vertical dividers', () => {
    assert.deepEqual(computeBays([], 800, 15), [{ left: 15, right: 785 }]);
  });

  it('computes two bays around a centered vertical divider', () => {
    const div = { nombre: 'Division vertical', ancho: 550, alto: 2400, espesor: 15 };
    const bays = computeBays([div], 800, 15);
    assert.equal(bays.length, 2);
    assert.deepEqual(bays[0], { left: 15, right: 392.5 });
    assert.deepEqual(bays[1], { left: 407.5, right: 785 });
  });

  it('computes bays around multiple vertical dividers', () => {
    const left = { nombre: 'Division izquierda', ancho: 550, alto: 2400, espesor: 15 };
    const central = { nombre: 'Division central', ancho: 550, alto: 2400, espesor: 15 };
    const bays = computeBays([central, left], 1000, 15);
    assert.equal(bays.length, 2);
    assert.deepEqual(bays[0], { left: 30, right: 492.5 });
    assert.deepEqual(bays[1], { left: 507.5, right: 985 });
  });
});

describe('inferDoorX', () => {
  it('places left door near side', () => {
    assert.equal(inferDoorX({ nombre: 'Puerta izquierda' }, 1000, 300, 18), 18);
  });

  it('places right door near opposite side', () => {
    assert.equal(inferDoorX({ nombre: 'Puerta derecha' }, 1000, 300, 18), 682);
  });
});

describe('inferDoorZ', () => {
  it('places upper door near top', () => {
    assert.equal(inferDoorZ({ nombre: 'Puerta superior' }, 1000, 400, 18), 582);
  });

  it('centers by default', () => {
    assert.equal(inferDoorZ({ nombre: 'Puerta' }, 1000, 400, 18), 300);
  });
});

describe('inferRailZ', () => {
  it('uses index from name', () => {
    assert.ok(inferRailZ({ nombre: 'Riel 1' }, 1000, 20, 18) > 18);
  });

  it('defaults to half height', () => {
    assert.equal(inferRailZ({ nombre: 'Riel colgador' }, 1000, 20, 18), 500);
  });
});

describe('inferLegX', () => {
  it('places left leg inset', () => {
    assert.equal(inferLegX({ nombre: 'Pata izquierda', id: 'LI' }, 1000, 40), 20);
  });

  it('places right leg inset', () => {
    assert.equal(inferLegX({ nombre: 'Pata derecha', id: 'LD' }, 1000, 40), 940);
  });
});

describe('inferLegY', () => {
  it('places front leg at front edge', () => {
    assert.equal(inferLegY({ nombre: 'Pata delantera', id: 'PF' }, 500, 40), 440);
  });

  it('places back leg at back edge', () => {
    assert.equal(inferLegY({ nombre: 'Pata trasera', id: 'PT' }, 500, 40), 20);
  });

  it('uses legOffsetY (not legOffsetX) for depth margin', () => {
    assert.equal(
      inferLegY({ nombre: 'Pata delantera', id: 'PF' }, 500, 40, { legOffsetY: 30, legOffsetX: 10 }),
      430
    );
  });
});

describe('inferShelfBayIndex', () => {
  const bays = [{ left: 15, right: 200 }, { left: 215, right: 400 }];

  it('assigns left keyword to first bay', () => {
    assert.equal(inferShelfBayIndex({ nombre: 'Estante izquierdo', id: 'E1' }, bays), 0);
  });

  it('assigns right keyword to last bay', () => {
    assert.equal(inferShelfBayIndex({ nombre: 'Estante derecho', id: 'E2' }, bays), 1);
  });

  it('assigns central keyword to middle bay', () => {
    const threeBays = [{ left: 15, right: 130 }, { left: 145, right: 255 }, { left: 270, right: 400 }];
    assert.equal(inferShelfBayIndex({ nombre: 'Estante central', id: 'E3' }, threeBays), 1);
  });

  it('returns null when no side keyword is present', () => {
    assert.equal(inferShelfBayIndex({ nombre: 'Estante regulable', id: 'E4' }, bays), null);
  });

  it('returns null for a single bay', () => {
    assert.equal(inferShelfBayIndex({ nombre: 'Estante izquierdo', id: 'E5' }, [{ left: 15, right: 400 }]), null);
  });
});

describe('shouldShowLabel', () => {
  it('returns true for large projected area', () => {
    const geo = { role: 'shelf' };
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    assert.equal(shouldShowLabel(geo, pts), true);
  });

  it('returns false for tiny area', () => {
    const geo = { role: 'shelf' };
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    assert.equal(shouldShowLabel(geo, pts), false);
  });
});
