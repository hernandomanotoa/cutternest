import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifySequenceRole, buildAssemblySequence, buildAssemblyLevels } from './assemblyStepService.js';

const mk = (id, nombre, modulo = '1', pos_z = '') => ({ id, nombre, modulo, pos_z });

describe('assemblyStepService/classifySequenceRole', () => {
  it('clasifica las categorías de armado físico', () => {
    assert.equal(classifySequenceRole(mk('a', 'Base cajonera')), 'inferior');
    assert.equal(classifySequenceRole(mk('a', 'Zócalo')), 'inferior');
    assert.equal(classifySequenceRole(mk('a', 'Lateral izquierdo')), 'lateral');
    assert.equal(classifySequenceRole(mk('a', 'Tapa librero')), 'tapa');
    assert.equal(classifySequenceRole(mk('a', 'Techo')), 'tapa');
    assert.equal(classifySequenceRole(mk('a', 'Repisa inferior')), 'interior');
    assert.equal(classifySequenceRole(mk('a', 'Estante medio')), 'interior');
    assert.equal(classifySequenceRole(mk('a', 'Zapatero abatible')), 'interior');
    assert.equal(classifySequenceRole(mk('a', 'Divisor inferior')), 'interior');
    assert.equal(classifySequenceRole(mk('a', 'Montante central')), 'interior');
    assert.equal(classifySequenceRole(mk('a', 'Fondo')), 'fondo');
    assert.equal(classifySequenceRole(mk('a', 'Puerta abatible')), 'accesorio');
    assert.equal(classifySequenceRole(mk('a', 'Frente de cajón')), 'accesorio');
    assert.equal(classifySequenceRole(mk('a', 'Tirador')), 'accesorio');
    assert.equal(classifySequenceRole(mk('a', 'Barra de ropa')), 'accesorio');
  });
});

describe('assemblyStepService/buildAssemblySequence', () => {
  // Librero con tapa, divisores apoyados entre estantes y repisa superior
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
  // posiciones z reales (mm): divisor inf apoyado sobre estante inf (top 415),
  // divisor sup sobre estante med (top 815)
  const positions = new Map([
    ['m2-base', 0],
    ['m2-lat-izq', 15],
    ['m2-lat-der', 15],
    ['m2-tapa', 1215],
    ['m2-fondo', 15],
    ['m2-est-inf', 400],
    ['m2-div-inf', 415],
    ['m2-est-med', 800],
    ['m2-div-sup', 815],
    ['m2-est-sup', 1200],
    ['m2-puerta', 15],
    ['m2-barra', 200],
  ]);

  it('casco exterior primero: base → laterales → tapa, luego interiores', () => {
    const { steps } = buildAssemblySequence(librero, positions);
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order.slice(0, 4), ['m2-base', 'm2-lat-izq', 'm2-lat-der', 'm2-tapa']);
    assert.ok(order.indexOf('m2-est-inf') > order.indexOf('m2-tapa'), 'interiores después de la tapa');
  });

  it('divisor va DESPUÉS de la repisa sobre la que se apoya', () => {
    const { steps } = buildAssemblySequence(librero, positions);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('m2-est-inf') < pos('m2-div-inf'), 'estante inferior antes que divisor inf');
    assert.ok(pos('m2-est-med') < pos('m2-div-sup'), 'estante medio antes que divisor sup');
  });

  it('interiores de abajo hacia arriba con repisa superior al final', () => {
    const { steps } = buildAssemblySequence(librero, positions);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('m2-est-inf') < pos('m2-est-med'));
    assert.ok(pos('m2-est-med') < pos('m2-est-sup'));
    assert.ok(pos('m2-div-sup') < pos('m2-est-sup'), 'repisa superior tras sus divisores');
  });

  it('fondo tras interiores y accesorios al cierre (barras → puertas)', () => {
    const { steps } = buildAssemblySequence(librero, positions);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('m2-est-sup') < pos('m2-fondo'), 'fondo tras interiores');
    assert.ok(pos('m2-fondo') < pos('m2-barra'), 'barras tras fondo');
    assert.ok(pos('m2-barra') < pos('m2-puerta'), 'puertas tras barras');
  });

  it('divisor de base a techo (z=0) va antes que la primera repisa', () => {
    const mod = [
      mk('d-full', 'Divisor vertical'),
      mk('r1', 'Repisa inferior'),
      mk('r2', 'Repisa superior'),
    ];
    const posFull = new Map([['d-full', 0], ['r1', 400], ['r2', 800]]);
    const { steps } = buildAssemblySequence(mod, posFull);
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order, ['d-full', 'r1', 'r2']);
  });

  it('zócalo va al inicio junto a la base', () => {
    const mod = [mk('z', 'Zócalo'), mk('b', 'Base'), mk('l', 'Lateral izquierdo')];
    const posZ = new Map([['z', 0], ['b', 100], ['l', 115]]);
    const { steps } = buildAssemblySequence(mod, posZ);
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(new Set(order.slice(0, 2)), new Set(['z', 'b']), 'zócalo y base ocupan los primeros pasos');
    assert.equal(order[2], 'l', 'laterales después del grupo inferior');
  });

  it('fallback sin posiciones: estima por palabra clave de altura', () => {
    const mod = [
      mk('d', 'Divisor inferior'),
      mk('r1', 'Repisa inferior'),
      mk('r2', 'Repisa superior'),
    ];
    const { steps } = buildAssemblySequence(mod);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('r1') < pos('d'), 'repisa inferior antes que divisor (fallback)');
    assert.ok(pos('d') < pos('r2'), 'divisor antes que repisa superior (fallback)');
  });

  it('piezas globales van al final', () => {
    const withGlobal = [
      ...librero,
      { id: 'glb-tapa-corrida', nombre: 'Tapa corrida', modulo: 'estructura', pos_z: '' },
    ];
    const { steps } = buildAssemblySequence(withGlobal, positions);
    assert.equal(steps[steps.length - 1].piezas[0], 'glb-tapa-corrida');
  });

  it('agrupa por módulo: módulo 1 completo antes que módulo 2', () => {
    const twoModules = [
      mk('m2-base', 'Base librero', '2'),
      mk('m1-base', 'Base cajonera', '1'),
      mk('m1-tapa', 'Tapa cajonera', '1'),
    ];
    const { steps } = buildAssemblySequence(twoModules);
    assert.deepEqual(steps.map((s) => s.piezas[0]), ['m1-base', 'm1-tapa', 'm2-base']);
  });

  it('un paso por pieza y levels consecutivos', () => {
    const { steps, totalPasos, totalPiezas } = buildAssemblySequence(librero, positions);
    assert.equal(totalPasos, librero.length);
    assert.equal(totalPiezas, librero.length);
    assert.deepEqual(steps.map((s) => s.paso), steps.map((_, i) => i + 1));

    const levels = buildAssemblyLevels(librero, positions);
    assert.equal(levels.get('m2-base'), 1);
    assert.equal(levels.get('m2-puerta'), librero.length);
  });
});
