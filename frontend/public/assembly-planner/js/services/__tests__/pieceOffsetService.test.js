import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupPiecesByOriginalId,
  getPieceOffsetType,
  getDefaultOffset,
  getDefaultGap,
  getPieceOffsetConfig,
  shouldShowGap,
  getPieceTypeLabel,
} from '../pieceOffsetService.js';
import { VERTICAL_POSITIONS } from '../../core/config.js';

const piece = (name, overrides = {}) => ({
  id: overrides.id ?? 'P-1',
  originalId: overrides.originalId,
  nombre: name,
  ancho: overrides.ancho ?? 500,
  alto: overrides.alto ?? 18,
  espesor: overrides.espesor ?? 18,
  pos_z: overrides.pos_z ?? null,
});

describe('pieceOffsetService', () => {
  describe('groupPiecesByOriginalId', () => {
    it('groups instances by originalId', () => {
      const pieces = [
        { id: 'r1-1', originalId: 'r1', nombre: 'Repisa', ancho: 500, alto: 18, espesor: 18 },
        { id: 'r1-2', originalId: 'r1', nombre: 'Repisa', ancho: 500, alto: 18, espesor: 18 },
        { id: 'r2', originalId: 'r2', nombre: 'Otra', ancho: 500, alto: 18, espesor: 18 },
      ];
      const groups = groupPiecesByOriginalId(pieces);
      assert.equal(groups.length, 2);
      assert.equal(groups.find((g) => g.originalId === 'r1').count, 2);
      assert.equal(groups.find((g) => g.originalId === 'r2').count, 1);
    });

    it('uses id as originalId when originalId is missing', () => {
      const groups = groupPiecesByOriginalId([piece('Repisa')]);
      assert.equal(groups[0].originalId, 'P-1');
      assert.equal(groups[0].count, 1);
    });
  });

  describe('getPieceOffsetType', () => {
    it('returns top for top shelves', () => {
      assert.equal(getPieceOffsetType(piece('Repisa superior'), 'top'), 'top');
    });

    it('returns base for bottom shelves', () => {
      assert.equal(getPieceOffsetType(piece('Repisa inferior'), 'bottom'), 'base');
    });

    it('returns absolute for hanger rails', () => {
      assert.equal(getPieceOffsetType(piece('Riel colgador'), 'middle'), 'absolute');
    });

    it('returns side for legs', () => {
      assert.equal(getPieceOffsetType(piece('Pata'), 'middle'), 'side');
    });

    it('returns base for divider', () => {
      assert.equal(getPieceOffsetType(piece('Division vertical M3', { ancho: 550, alto: 2400 })), 'base');
    });
  });

  describe('getDefaultOffset', () => {
    it('returns shoeRackBaseOffset for shoe racks', () => {
      assert.equal(getDefaultOffset(piece('Zapatero')), VERTICAL_POSITIONS.shoeRackBaseOffset);
      assert.equal(getDefaultOffset(piece('Zapatera')), VERTICAL_POSITIONS.shoeRackBaseOffset);
    });

    it('returns shelfTopInset for top shelves', () => {
      assert.equal(getDefaultOffset(piece('Repisa superior'), 'top'), VERTICAL_POSITIONS.shelfTopInset);
    });

    it('returns shelfBaseOffset for bottom shelves', () => {
      assert.equal(getDefaultOffset(piece('Repisa inferior'), 'bottom'), VERTICAL_POSITIONS.shelfBaseOffset);
    });

    it('returns shelfMiddleBaseOffset for middle shelves', () => {
      assert.equal(getDefaultOffset(piece('Repisa'), 'middle'), VERTICAL_POSITIONS.shelfMiddleBaseOffset);
    });

    it('returns dividerBaseOffset for dividers', () => {
      assert.equal(getDefaultOffset(piece('Division vertical M3', { ancho: 550, alto: 2400 })), VERTICAL_POSITIONS.dividerBaseOffset);
    });
  });

  describe('getDefaultGap', () => {
    it('returns shoeRackGap for shoe racks', () => {
      assert.equal(getDefaultGap(piece('Zapatero')), VERTICAL_POSITIONS.shoeRackGap);
    });

    it('returns shelfMiddleGap for middle shelves', () => {
      assert.equal(getDefaultGap(piece('Repisa'), 'middle'), VERTICAL_POSITIONS.shelfMiddleGap);
    });

    it('returns drawerFaceGap for drawer faces', () => {
      assert.equal(getDefaultGap(piece('Frente cajón'), 'drawer'), VERTICAL_POSITIONS.drawerFaceGap);
    });

    it('returns dividerTopInset for dividers', () => {
      assert.equal(getDefaultGap(piece('Division vertical M3', { ancho: 550, alto: 2400 })), VERTICAL_POSITIONS.dividerTopInset);
    });
  });

  describe('getPieceOffsetConfig', () => {
    it('uses user overrides when present', () => {
      const cfg = getPieceOffsetConfig(piece('Repisa'), 'middle', {
        pieceOffsets: { 'P-1': { offset: 123, gap: 45 } },
      });
      assert.equal(cfg.offset, 123);
      assert.equal(cfg.gap, 45);
    });

    it('falls back to defaults when no override', () => {
      const cfg = getPieceOffsetConfig(piece('Repisa'), 'middle', {});
      assert.equal(cfg.offset, VERTICAL_POSITIONS.shelfMiddleBaseOffset);
      assert.equal(cfg.gap, VERTICAL_POSITIONS.shelfMiddleGap);
    });

    it('uses global overrides for defaults', () => {
      const cfg = getPieceOffsetConfig(piece('Repisa'), 'middle', {}, { shelfMiddleBaseOffset: 99, shelfMiddleGap: 77 });
      assert.equal(cfg.offset, 99);
      assert.equal(cfg.gap, 77);
    });
  });

  describe('shouldShowGap', () => {
    it('returns true when more than one piece of the same role exists', () => {
      const pieces = [piece('Repisa 1', { id: 'r1' }), piece('Repisa 2', { id: 'r2' })];
      assert.equal(shouldShowGap(pieces[0], pieces), true);
    });

    it('returns false for a single piece of its role', () => {
      const pieces = [piece('Repisa 1', { id: 'r1' }), piece('Puerta', { id: 'd1' })];
      assert.equal(shouldShowGap(pieces[0], pieces), false);
    });

    it('always returns true for dividers to expose top inset', () => {
      const pieces = [piece('Division vertical M3', { ancho: 550, alto: 2400, id: 'div' })];
      assert.equal(shouldShowGap(pieces[0], pieces), true);
    });
  });

  describe('getPieceTypeLabel', () => {
    it('labels shoe racks as Zapatero', () => {
      assert.equal(getPieceTypeLabel(piece('Zapatero')), 'Zapatero');
    });

    it('labels shelves as Entrepaño', () => {
      assert.equal(getPieceTypeLabel(piece('Repisa')), 'Entrepaño');
    });
  });
});
