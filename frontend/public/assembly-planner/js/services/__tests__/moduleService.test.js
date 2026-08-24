import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBAL_MODULE_ID,
  GLOBAL_MODULE_LABEL,
  isGlobalPiece,
  getModuleGroups,
  getModules,
  getModuleGroup,
  getModulePieces,
  getModuleDependencies,
  getModuleLabel,
} from '../moduleService.js';

const piece = (id, modulo, nombre = id) => ({ id, modulo, nombre });

describe('isGlobalPiece', () => {
  it('detects global pieces by modulo or id prefix', () => {
    assert.equal(isGlobalPiece(piece('GLB-1', '1')), true);
    assert.equal(isGlobalPiece(piece('P-1', 'estructura')), true);
    assert.equal(isGlobalPiece(piece('P-1', 'global')), true);
    assert.equal(isGlobalPiece(piece('P-1', '1')), false);
  });

  it('handles null/undefined safely', () => {
    assert.equal(isGlobalPiece(null), false);
  });
});

describe('getModuleGroups', () => {
  it('returns root modules only, sorted naturally', () => {
    const pieces = [piece('A', '1.1'), piece('B', '1'), piece('C', '2'), piece('D', '2.1')];
    const groups = getModuleGroups(pieces);
    assert.deepEqual(groups.map((g) => g.id), ['1', '2']);
    assert.deepEqual(groups.find((g) => g.id === '1').modules, ['1']);
  });

  it('ignores global pieces', () => {
    const pieces = [piece('A', 'estructura'), piece('B', '1')];
    assert.deepEqual(getModuleGroups(pieces).map((g) => g.id), ['1']);
  });
});

describe('getModules', () => {
  it('prepends global module when global pieces exist', () => {
    const pieces = [piece('G', 'estructura'), piece('A', '1'), piece('B', '2')];
    assert.deepEqual(getModules(pieces), [GLOBAL_MODULE_ID, '1', '2']);
  });

  it('returns only module ids when no globals', () => {
    const pieces = [piece('A', '2'), piece('B', '1')];
    assert.deepEqual(getModules(pieces), ['1', '2']);
  });
});

describe('getModuleGroup', () => {
  it('returns global group', () => {
    const group = getModuleGroup([], GLOBAL_MODULE_ID);
    assert.equal(group.id, GLOBAL_MODULE_ID);
    assert.equal(group.label, GLOBAL_MODULE_LABEL);
  });

  it('returns descendants for a target module id', () => {
    const pieces = [piece('A', '1'), piece('B', '1.1'), piece('C', '1.2')];
    const group = getModuleGroup(pieces, '1');
    assert.deepEqual(group.modules, ['1', '1.1', '1.2']);
    assert.ok(group.label.includes('submódulos'));
  });

  it('falls back to first group for unknown ids', () => {
    const pieces = [piece('A', '2')];
    const group = getModuleGroup(pieces, '99');
    assert.equal(group.id, '2');
  });
});

describe('getModulePieces', () => {
  it('returns global pieces for global module', () => {
    const pieces = [piece('G', 'estructura'), piece('A', '1')];
    assert.deepEqual(getModulePieces(pieces, GLOBAL_MODULE_ID).map((p) => p.id), ['G']);
  });

  it('includes globals and module pieces for regular module', () => {
    const pieces = [piece('G', 'estructura'), piece('A', '1'), piece('B', '1.1'), piece('C', '2')];
    const ids = getModulePieces(pieces, '1').map((p) => p.id).sort();
    assert.deepEqual(ids, ['A', 'B', 'G']);
  });
});

describe('getModuleDependencies', () => {
  it('filters dependencies whose endpoints are in pieces', () => {
    const pieces = [piece('A', '1'), piece('B', '1')];
    const deps = [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
    ];
    assert.deepEqual(getModuleDependencies(deps, pieces).map((d) => d.to), ['B']);
  });
});

describe('getModuleLabel', () => {
  it('returns global label for global module', () => {
    assert.equal(getModuleLabel(GLOBAL_MODULE_ID), GLOBAL_MODULE_LABEL);
  });

  it('returns module label from group', () => {
    const pieces = [piece('A', '1')];
    assert.equal(getModuleLabel('1', pieces), 'Módulo 1');
  });
});
