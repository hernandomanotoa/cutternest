import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdjacency, detectCycle, topologicalLevels, buildSteps } from './topologicalSort.js';

describe('buildAdjacency', () => {
  it('builds adjacency and in-degree maps', () => {
    const nodes = ['A', 'B', 'C'];
    const edges = [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }];
    const { adj, indeg } = buildAdjacency(nodes, edges);
    assert.deepEqual(adj, { A: ['B', 'C'], B: [], C: [] });
    assert.deepEqual(indeg, { A: 0, B: 1, C: 1 });
  });

  it('ignores edges to unknown nodes', () => {
    const nodes = ['A'];
    const edges = [{ from: 'A', to: 'B' }];
    const { adj, indeg } = buildAdjacency(nodes, edges);
    assert.deepEqual(adj, { A: [] });
    assert.deepEqual(indeg, { A: 0 });
  });
});

describe('detectCycle', () => {
  it('returns null for DAGs', () => {
    assert.equal(detectCycle(['A', 'B'], [{ from: 'A', to: 'B' }]), null);
  });

  it('detects a simple cycle', () => {
    const cycle = detectCycle(['A', 'B'], [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ]);
    assert.ok(Array.isArray(cycle));
    assert.equal(cycle.length, 2);
    assert.ok(cycle.includes('A'));
    assert.ok(cycle.includes('B'));
  });
});

describe('topologicalLevels', () => {
  it('computes levels for a DAG', () => {
    const result = topologicalLevels(['A', 'B', 'C'], [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.levels, [['A'], ['B', 'C']]);
  });

  it('reports a cycle', () => {
    const result = topologicalLevels(['A', 'B'], [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.levels.length, 0);
    assert.ok(Array.isArray(result.cycle));
  });
});

describe('buildSteps', () => {
  const piecesById = {
    A: { nombre: 'Lateral' },
    B: { nombre: 'Tapa' },
  };

  it('builds sequential steps', () => {
    const result = buildSteps(['A', 'B'], [{ from: 'A', to: 'B' }], piecesById);
    assert.equal(result.ok, true);
    assert.equal(result.totalPasos, 2);
    assert.equal(result.steps[0].piezas[0], 'A');
    assert.equal(result.steps[1].piezas[0], 'B');
  });

  it('returns cycle info on conflict', () => {
    const result = buildSteps(['A', 'B'], [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ], piecesById);
    assert.equal(result.ok, false);
    assert.equal(result.steps.length, 0);
    assert.ok(result.cycle);
  });
});
