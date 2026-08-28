import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  determineVerticalZone,
  getDefaultVerticalPosition,
  calculateVerticalPositions,
} from '../verticalPositionService.js';
import { VERTICAL_POSITIONS } from '../../core/config.js';

const piece = (name, overrides = {}) => ({
  id: overrides.id ?? 'P-1',
  nombre: name,
  ancho: overrides.ancho ?? 500,
  alto: overrides.alto ?? 18,
  espesor: overrides.espesor ?? 18,
  pos_z: overrides.pos_z ?? null,
});

const MODULE_H = 1800;
const THICKNESS = 18;

// Alias para evitar confusión en las fórmulas de los tests.
const baseTop = THICKNESS + VERTICAL_POSITIONS.bottomPanelOffset;

describe('determineVerticalZone', () => {
  it('classifies zapatero as fixed-bottom', () => {
    assert.equal(determineVerticalZone(piece('Zapatero')), 'fixed-bottom');
    assert.equal(determineVerticalZone(piece('Repisa zapatero')), 'fixed-bottom');
  });

  it('classifies zapatera (feminine) as fixed-bottom', () => {
    assert.equal(determineVerticalZone(piece('Zapatera inferior')), 'fixed-bottom');
    assert.equal(determineVerticalZone(piece('Repisa zapatera')), 'fixed-bottom');
    assert.equal(determineVerticalZone(piece('Zapateras M2')), 'fixed-bottom');
  });

  it('classifies superior keywords as top', () => {
    assert.equal(determineVerticalZone(piece('Repisa superior')), 'top');
    assert.equal(determineVerticalZone(piece('Repisa sup')), 'top');
    assert.equal(determineVerticalZone(piece('Estante alto')), 'top');
    assert.equal(determineVerticalZone(piece('Repisa', { id: 'top-1' })), 'top');
  });

  it('classifies inferior keywords as bottom', () => {
    assert.equal(determineVerticalZone(piece('Repisa inferior')), 'bottom');
    assert.equal(determineVerticalZone(piece('Repisa inf')), 'bottom');
    assert.equal(determineVerticalZone(piece('Estante bajo')), 'bottom');
    assert.equal(determineVerticalZone(piece('Repisa', { id: 'bottom-1' })), 'bottom');
  });

  it('classifies repisas with base as bottom', () => {
    assert.equal(determineVerticalZone(piece('Repisa base')), 'bottom');
  });

  it('classifies medio/central as middle and defaults to middle', () => {
    assert.equal(determineVerticalZone(piece('Repisa medio')), 'middle');
    assert.equal(determineVerticalZone(piece('Estante central')), 'middle');
    assert.equal(determineVerticalZone(piece('Repisa')), 'middle');
  });
});

describe('getDefaultVerticalPosition', () => {
  it('places zapatero just above the base', () => {
    assert.equal(
      getDefaultVerticalPosition(piece('Zapatero'), MODULE_H, THICKNESS),
      baseTop + VERTICAL_POSITIONS.shoeRackBaseOffset
    );
  });

  it('places zapatera just above the base', () => {
    assert.equal(
      getDefaultVerticalPosition(piece('Zapatera inferior'), MODULE_H, THICKNESS),
      baseTop + VERTICAL_POSITIONS.shoeRackBaseOffset
    );
  });

  it('places seat panels at standard seat height', () => {
    assert.equal(getDefaultVerticalPosition(piece('Asiento'), MODULE_H, THICKNESS), VERTICAL_POSITIONS.seatHeight);
  });

  it('places hanger rails at standard closet height', () => {
    assert.equal(getDefaultVerticalPosition(piece('Riel colgador'), MODULE_H, THICKNESS), VERTICAL_POSITIONS.hangerRailHeight);
  });

  it('places top shelves near the top panel', () => {
    assert.equal(
      getDefaultVerticalPosition(piece('Repisa superior'), MODULE_H, THICKNESS),
      MODULE_H - THICKNESS - VERTICAL_POSITIONS.shelfTopInset
    );
  });

  it('places bottom shelves above the bottom panel', () => {
    assert.equal(
      getDefaultVerticalPosition(piece('Repisa inferior'), MODULE_H, THICKNESS),
      baseTop + VERTICAL_POSITIONS.shelfBaseOffset
    );
  });

  it('distributes drawer faces vertically by rank', () => {
    const drawerSup = piece('Frente cajón superior', { alto: 150 });
    const drawerInf = piece('Frente cajón inferior', { alto: 150 });
    const drawerMed = piece('Frente cajón', { alto: 150 });
    assert.equal(getDefaultVerticalPosition(drawerSup, MODULE_H, THICKNESS), MODULE_H - THICKNESS - 150);
    assert.equal(getDefaultVerticalPosition(drawerInf, MODULE_H, THICKNESS), baseTop + VERTICAL_POSITIONS.drawerBaseOffset);
    assert.equal(getDefaultVerticalPosition(drawerMed, MODULE_H, THICKNESS), (MODULE_H - 150) / 2);
  });

  it('centers unknown horizontal pieces by default', () => {
    assert.equal(getDefaultVerticalPosition(piece('Misterio'), MODULE_H, THICKNESS), MODULE_H / 2);
  });
});

describe('calculateVerticalPositions', () => {
  it('places zapatero near the bottom', () => {
    const positions = calculateVerticalPositions(600, 18, [piece('Zapatero', { alto: 150 })]);
    assert.equal(positions.length, 1);
    assert.equal(positions[0].zone, 'fixed-bottom');
    assert.equal(positions[0].y, baseTop + VERTICAL_POSITIONS.shoeRackBaseOffset);
  });

  it('places top shelves near the top and bottom shelves near the bottom', () => {
    const shelves = [
      piece('Repisa superior'),
      piece('Repisa inferior'),
    ];
    const positions = calculateVerticalPositions(600, 18, shelves);
    const top = positions.find((p) => p.zone === 'top');
    const bottom = positions.find((p) => p.zone === 'bottom');
    assert.ok(top.y > bottom.y);
    // Superior shelf sits below the top panel with a comfortable inset.
    assert.ok(top.y + top.h <= 600 - 18);
    // Inferior shelf sits above the bottom panel.
    assert.ok(bottom.y >= baseTop);
  });

  it('stacks middle shelves consecutively from base with shelfMiddleGap', () => {
    const shelves = [
      piece('Repisa 1'),
      piece('Repisa 2'),
      piece('Repisa 3'),
    ];
    const positions = calculateVerticalPositions(600, 18, shelves);
    assert.equal(positions.length, 3);
    const ys = positions.map((p) => p.y);
    // Middle shelves are stacked from base upward.
    assert.ok(ys[0] < ys[1] && ys[1] < ys[2]);
    // First shelf sits above the bottom panel with shelfMiddleBaseOffset.
    assert.equal(ys[0], baseTop + VERTICAL_POSITIONS.shelfMiddleBaseOffset);
    // Gaps between consecutive middle shelves use shelfMiddleGap.
    const gap01 = ys[1] - (ys[0] + 18);
    const gap12 = ys[2] - (ys[1] + 18);
    assert.equal(gap01, VERTICAL_POSITIONS.shelfMiddleGap);
    assert.equal(gap12, VERTICAL_POSITIONS.shelfMiddleGap);
  });

  it('keeps bottom shelves above a fixed-bottom zapatero', () => {
    const shelves = [
      piece('Zapatero', { alto: 150 }),
      piece('Repisa inferior'),
    ];
    const positions = calculateVerticalPositions(600, 18, shelves);
    const fixed = positions.find((p) => p.zone === 'fixed-bottom');
    const bottom = positions.find((p) => p.zone === 'bottom');
    assert.ok(bottom.y >= fixed.y + fixed.h);
  });

  it('stacks middle shelves consecutively above shoe racks', () => {
    const shelves = [
      piece('Zapatero 1', { alto: 150 }),
      piece('Zapatero 2', { alto: 150 }),
      piece('Repisa 1'),
      piece('Repisa 2'),
    ];
    const positions = calculateVerticalPositions(600, 18, shelves);
    const racks = positions
      .filter((p) => p.zone === 'fixed-bottom')
      .sort((a, b) => a.y - b.y);
    const middle = positions
      .filter((p) => p.zone === 'middle')
      .sort((a, b) => a.y - b.y);
    const lastRackTop = racks[racks.length - 1].y + racks[racks.length - 1].h;
    // Gap from last shoe rack to first middle shelf uses shelfMiddleGap.
    assert.equal(middle[0].y - lastRackTop, VERTICAL_POSITIONS.shelfMiddleGap);
    // Middle shelves stack with shelfMiddleGap between them.
    const middleGap = middle[1].y - (middle[0].y + middle[0].h);
    assert.equal(middleGap, VERTICAL_POSITIONS.shelfMiddleGap);
  });

  it('respects an explicit pos_z override', () => {
    const shelves = [
      piece('Repisa A'),
      piece('Repisa B', { pos_z: 250 }),
    ];
    const positions = calculateVerticalPositions(600, 18, shelves);
    const override = positions.find((p) => p.piece.nombre === 'Repisa B');
    assert.equal(override.y, 250);
  });

  it('stacks multiple shoe racks with shoeRackGap', () => {
    const racks = [
      piece('Zapatero 1', { alto: 150 }),
      piece('Zapatero 2', { alto: 150 }),
    ];
    const positions = calculateVerticalPositions(600, 18, racks);
    const gap = positions[1].y - (positions[0].y + positions[0].h);
    assert.equal(gap, VERTICAL_POSITIONS.shoeRackGap);
  });

  it('stacks feminine shoe racks with shoeRackGap', () => {
    const racks = [
      piece('Zapatera 1', { alto: 150 }),
      piece('Zapatera 2', { alto: 150 }),
    ];
    const positions = calculateVerticalPositions(600, 18, racks);
    assert.equal(positions.length, 2);
    positions.forEach((p) => assert.equal(p.zone, 'fixed-bottom'));
    const gap = positions[1].y - (positions[0].y + positions[0].h);
    assert.equal(gap, VERTICAL_POSITIONS.shoeRackGap);
  });

  it('uses shelfMiddleGap for middle shelves', () => {
    const shelves = [
      piece('Repisa 1'),
      piece('Repisa 2'),
    ];
    const positions = calculateVerticalPositions(600, 18, shelves, { overrides: { shelfMiddleGap: 100 } });
    // Stacked from base: positions[0] is lower, positions[1] is higher.
    const gap = positions[1].y - (positions[0].y + positions[0].h);
    assert.equal(gap, 100);
  });

  it('applies a raised base offset to all horizontal pieces', () => {
    const shelves = [piece('Repisa 1'), piece('Repisa 2')];
    const baseOffset = 80;
    const positions = calculateVerticalPositions(600, 18, shelves, { baseOffset });
    const expectedBaseTop = baseOffset + 18;
    assert.equal(positions[0].y, expectedBaseTop + VERTICAL_POSITIONS.shelfMiddleBaseOffset);
    const gap = positions[1].y - (positions[0].y + positions[0].h);
    assert.equal(gap, VERTICAL_POSITIONS.shelfMiddleGap);
  });

  it('uses shelfMiddleBaseOffset as the starting point for middle shelves', () => {
    const shelves = [
      piece('Repisa 1'),
      piece('Repisa 2'),
    ];
    const positions = calculateVerticalPositions(600, 18, shelves, {
      overrides: { shelfMiddleBaseOffset: 120, shelfMiddleGap: 80 },
    });
    assert.equal(positions[0].y, baseTop + 120);
    const gap = positions[1].y - (positions[0].y + positions[0].h);
    assert.equal(gap, 80);
  });

  it('uses per-piece offset and gap overrides', () => {
    const shelves = [
      piece('Repisa 1', { id: 'r1' }),
      piece('Repisa 2', { id: 'r2' }),
    ];
    const pieceOffsets = {
      r1: { offset: 100, gap: 60 },
      r2: { offset: 0, gap: 60 },
    };
    const positions = calculateVerticalPositions(600, 18, shelves, { pieceOffsets });
    assert.equal(positions[0].y, baseTop + 100);
    const gap = positions[1].y - (positions[0].y + 18);
    assert.equal(gap, 60);
  });

  it('uses per-piece shoe rack overrides', () => {
    const racks = [
      piece('Zapatero 1', { id: 'z1', alto: 150 }),
      piece('Zapatero 2', { id: 'z2', alto: 150 }),
    ];
    const pieceOffsets = {
      z1: { offset: 50, gap: 100 },
      z2: { offset: 50, gap: 100 },
    };
    const positions = calculateVerticalPositions(600, 18, racks, { pieceOffsets });
    assert.equal(positions[0].y, baseTop + 50);
    const h = positions[0].h;
    const gap = positions[1].y - (positions[0].y + h);
    assert.equal(gap, 100);
  });

  it('respects an explicit pos_z even with piece overrides', () => {
    const shelves = [
      piece('Repisa A', { id: 'r1' }),
      piece('Repisa B', { id: 'r2', pos_z: 250 }),
    ];
    const pieceOffsets = { r1: { offset: 10 }, r2: { offset: 10 } };
    const positions = calculateVerticalPositions(600, 18, shelves, { pieceOffsets });
    const override = positions.find((p) => p.piece.nombre === 'Repisa B');
    assert.equal(override.y, 250);
  });
});
