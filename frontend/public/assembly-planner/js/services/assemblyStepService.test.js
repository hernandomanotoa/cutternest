import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifySequenceRole, buildAssemblySequence, buildAssemblyLevels } from './assemblyStepService.js';

const mk = (id, nombre, modulo = '1', pos_z = '') => ({ id, nombre, modulo, pos_z });

describe('assemblyStepService/classifySequenceRole', () => {
  it('clasifica las categorías bottom-up', () => {
    assert.equal(classifySequenceRole(mk('a', 'Base cajonera')), 'inferior');
    assert.equal(classifySequenceRole(mk('a', 'Frente de cajón')), 'accesorio');
    assert.equal(classifySequenceRole(mk('a', 'Zócalo')), 'inferior');
    assert.equal(classifySequenceRole(mk('a', 'Lateral izquierdo')), 'vertical');
    assert.equal(classifySequenceRole(mk('a', 'Divisor inferior')), 'vertical');
    assert.equal(classifySequenceRole(mk('a', 'Montante central')), 'vertical');
    assert.equal(classifySequenceRole(mk('a', 'Repisa inferior')), 'horizontal');
    assert.equal(classifySequenceRole(mk('a', 'Estante medio')), 'horizontal');
    assert.equal(classifySequenceRole(mk('a', 'Fondo')), 'fondo');
    assert.equal(classifySequenceRole(mk('a', 'Tapa')), 'tapa');
    assert.equal(classifySequenceRole(mk('a', 'Puerta abatible')), 'accesorio');
    assert.equal(classifySequenceRole(mk('a', 'Tirador')), 'accesorio');
    assert.equal(classifySequenceRole(mk('a', 'Barra de ropa')), 'accesorio');
  });
});

describe('assemblyStepService/buildAssemblySequence', () => {
  const librero = [
    mk('m2-lat-izq', 'Lateral librero izq'),
    mk('m2-lat-der', 'Lateral librero der'),
    mk('m2-base', 'Base librero'),
    mk('m2-tapa', 'Tapa librero'),
    mk('m2-fondo', 'Fondo librero'),
    mk('m2-div-inf', 'Divisor inf izq'),
    mk('m2-div-sup', 'Divisor sup der'),
    mk('m2-est-inf', 'Estante inferior'),
    mk('m2-est-med', 'Estante medio'),
    mk('m2-est-sup', 'Estante superior'),
    mk('m2-puerta', 'Puerta librero'),
    mk('m2-barra', 'Barra de ropa'),
  ];

  it('ordena inferior → laterales → divisores → estantes → fondo → tapa → accesorios', () => {
    const { steps } = buildAssemblySequence(librero);
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order, [
      'm2-base',
      'm2-lat-izq',
      'm2-lat-der',
      'm2-div-inf',
      'm2-div-sup',
      'm2-est-inf',
      'm2-est-med',
      'm2-est-sup',
      'm2-fondo',
      'm2-tapa',
      'm2-barra',
      'm2-puerta',
    ]);
  });

  it('el divisor va antes que las repisas/estantes si existen', () => {
    const { steps } = buildAssemblySequence(librero);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('m2-div-inf') < pos('m2-est-inf'), 'divisor antes que estante inferior');
    assert.ok(pos('m2-div-sup') < pos('m2-est-sup'), 'divisor antes que estante superior');
  });

  it('estantes ordenados de abajo arriba', () => {
    const { steps } = buildAssemblySequence(librero);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('m2-est-inf') < pos('m2-est-med'));
    assert.ok(pos('m2-est-med') < pos('m2-est-sup'));
  });

  it('piezas globales van al final', () => {
    const withGlobal = [
      ...librero,
      { id: 'glb-tapa-corrida', nombre: 'Tapa corrida', modulo: 'estructura', pos_z: '' },
    ];
    const { steps } = buildAssemblySequence(withGlobal);
    assert.equal(steps[steps.length - 1].piezas[0], 'glb-tapa-corrida');
  });

  it('agrupa por módulo: módulo 1 completo antes que módulo 2', () => {
    const twoModules = [
      mk('m2-base', 'Base librero', '2'),
      mk('m1-base', 'Base cajonera', '1'),
      mk('m1-tapa', 'Tapa cajonera', '1'),
    ];
    const { steps } = buildAssemblySequence(twoModules);
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order, ['m1-base', 'm1-tapa', 'm2-base']);
  });

  it('un paso por pieza y levels consecutivos', () => {
    const { steps, totalPasos, totalPiezas } = buildAssemblySequence(librero);
    assert.equal(totalPasos, librero.length);
    assert.equal(totalPiezas, librero.length);
    assert.deepEqual(steps.map((s) => s.paso), steps.map((_, i) => i + 1));

    const levels = buildAssemblyLevels(librero);
    assert.equal(levels.get('m2-base'), 1);
    assert.equal(levels.get('m2-puerta'), librero.length);
  });

  it('usa pos_z para ordenar dentro de la misma categoría sin palabra clave', () => {
    const shelves = [
      mk('s-high', 'Repisa corrida', '1', '800'),
      mk('s-low', 'Repisa corrida', '1', '200'),
    ];
    const { steps } = buildAssemblySequence(shelves);
    assert.equal(steps[0].piezas[0], 's-low');
    assert.equal(steps[1].piezas[0], 's-high');
  });
});
