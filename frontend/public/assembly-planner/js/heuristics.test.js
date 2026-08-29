import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirDependencias } from './heuristics.js';
import { buildSteps, topologicalLevels } from './topologicalSort.js';

const piece = (id, nombre, modulo = 'M5', ancho = 400, alto = 100, espesor = 15) => ({
  id,
  nombre,
  modulo,
  ancho,
  alto,
  espesor,
});

describe('sugerirDependencias - vertical divider side order', () => {
  const baseModule = () => [
    piece('lat-izq', 'Lateral izquierdo M5'),
    piece('lat-der', 'Lateral derecho M5'),
    piece('base', 'Base M5', 'M5', 845, 520, 15),
    piece('tapa', 'Tapa M5', 'M5', 845, 550, 15),
    piece('fondo', 'Fondo M5', 'M5', 815, 2000, 15),
  ];

  it('places left shelves before divider before right shelves', () => {
    const pieces = [
      ...baseModule(),
      piece('div', 'Division vertical M5', 'M5', 550, 2000, 15),
      piece('est-izq-1', 'Estante regulable izquierdo 1 M5'),
      piece('est-izq-2', 'Estante regulable izquierdo 2 M5'),
      piece('est-der-1', 'Estante regulable derecho 1 M5'),
    ];
    const deps = sugerirDependencias(pieces);
    const ids = pieces.map((p) => p.id);
    const active = deps.filter((d) => ids.includes(d.from) && ids.includes(d.to));
    const steps = buildSteps(ids, active, Object.fromEntries(pieces.map((p) => [p.id, p]))).steps;
    const stepOf = (id) => steps.findIndex((s) => s.piezas.includes(id));

    assert.ok(stepOf('est-izq-1') < stepOf('div'), 'left shelf 1 must precede divider');
    assert.ok(stepOf('est-izq-2') < stepOf('div'), 'left shelf 2 must precede divider');
    assert.ok(stepOf('div') < stepOf('est-der-1'), 'divider must precede right shelf');
  });

  it('keeps the graph acyclic when divider and side shelves coexist', () => {
    const pieces = [
      ...baseModule(),
      piece('div', 'Division vertical M5', 'M5', 550, 2000, 15),
      piece('est-izq-1', 'Estante regulable izquierdo 1 M5'),
      piece('est-der-1', 'Estante regulable derecho 1 M5'),
    ];
    const deps = sugerirDependencias(pieces);
    const ids = pieces.map((p) => p.id);
    const active = deps.filter((d) => ids.includes(d.from) && ids.includes(d.to));
    const topo = topologicalLevels(ids, active);
    assert.ok(topo.ok, 'dependencies must be acyclic');
  });

  it('places spanning lower shelf after the divider', () => {
    const pieces = [
      ...baseModule(),
      piece('div', 'Division vertical M5', 'M5', 550, 2000, 15),
      piece('rep-inf', 'Repisa inferior M5', 'M5', 770, 520, 15),
    ];
    const deps = sugerirDependencias(pieces);
    const ids = pieces.map((p) => p.id);
    const active = deps.filter((d) => ids.includes(d.from) && ids.includes(d.to));
    const steps = buildSteps(ids, active, Object.fromEntries(pieces.map((p) => [p.id, p]))).steps;
    const stepOf = (id) => steps.findIndex((s) => s.piezas.includes(id));

    assert.ok(stepOf('div') < stepOf('rep-inf'), 'spanning lower shelf should come after divider');
  });

  it('chains multiple lower spanning shelves after divider', () => {
    const pieces = [
      ...baseModule(),
      piece('div', 'Division vertical M5', 'M5', 550, 2000, 15),
      piece('rep-inf-1', 'Repisa inferior 1 M5', 'M5', 770, 520, 15),
      piece('rep-inf-2', 'Repisa inferior 2 M5', 'M5', 770, 520, 15),
    ];
    const deps = sugerirDependencias(pieces);
    const ids = pieces.map((p) => p.id);
    const active = deps.filter((d) => ids.includes(d.from) && ids.includes(d.to));
    const steps = buildSteps(ids, active, Object.fromEntries(pieces.map((p) => [p.id, p]))).steps;
    const stepOf = (id) => steps.findIndex((s) => s.piezas.includes(id));

    assert.ok(stepOf('div') < stepOf('rep-inf-1'), 'first lower spanning shelf after divider');
    assert.ok(stepOf('rep-inf-1') < stepOf('rep-inf-2'), 'lower spanning shelves chain consecutively');
  });
});
