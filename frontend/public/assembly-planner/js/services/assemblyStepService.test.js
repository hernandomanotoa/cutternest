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

  it('interiores de abajo hacia arriba; divisores tras las repisas superiores', () => {
    const { steps } = buildAssemblySequence(librero, positions);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('m2-est-inf') < pos('m2-est-med'));
    assert.ok(pos('m2-est-med') < pos('m2-est-sup'));
    assert.ok(pos('m2-est-sup') < pos('m2-div-inf'), 'repisa superior antes que divisores');
    assert.ok(pos('m2-est-sup') < pos('m2-div-sup'), 'repisa superior antes que divisores');
  });

  it('REGLA 1: fondo cierra el casco (tras la tapa, antes de interiores); accesorios al cierre', () => {
    const { steps } = buildAssemblySequence(librero, positions);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('m2-tapa') < pos('m2-fondo'), 'fondo tras la tapa');
    assert.ok(pos('m2-fondo') < pos('m2-est-inf'), 'fondo antes que interiores (rigidez)');
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

  it('fallback sin posiciones: repisas antes que divisores', () => {
    const mod = [
      mk('d', 'Divisor inferior'),
      mk('r1', 'Repisa inferior'),
      mk('r2', 'Repisa superior'),
    ];
    const { steps } = buildAssemblySequence(mod);
    const pos = (id) => steps.find((s) => s.piezas[0] === id).paso;
    assert.ok(pos('r1') < pos('r2'), 'repisas de abajo hacia arriba (fallback)');
    assert.ok(pos('r2') < pos('d'), 'divisor tras las repisas superiores (fallback)');
  });

  it('repisas superiores antes que divisores: divisor con repisas arriba y abajo', () => {
    const mod = [
      mk('r1', 'Repisa inferior'),
      mk('d1', 'Divisor vertical'),
      mk('r2', 'Repisa superior'),
    ];
    const posMap = new Map([['r1', 100], ['d1', 115], ['r2', 1900]]);
    const { steps } = buildAssemblySequence(mod, posMap);
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order, ['r1', 'r2', 'd1'], 'repisa sup antes que divisor; divisor tras la sup');
  });

  it('orden de interiores: lateral a lateral → división → repisa de vano', () => {
    // Caja 680×2000×600 (t=15) → interior 650. Repisa corrida 650 (lateral a
    // lateral), estante regulable 317.5 (vano), división vertical entre ambas.
    const mkDim = (id, nombre, ancho, alto, rotate = 'no') => ({
      id, nombre, ancho, alto, rotate, espesor: 15, cantidad: 1, modulo: '1',
    });
    const mod = [
      mkDim('c-base', 'Base módulo 1', 650, 585, 'si'),
      mkDim('c-tapa', 'Tapa módulo 1', 680, 600, 'si'),
      mkDim('c-lat-izq', 'Lateral izquierdo 1', 600, 2000),
      mkDim('c-lat-der', 'Lateral derecho 1', 600, 2000),
      mkDim('c-fondo', 'Fondo módulo 1', 650, 2000),
      mkDim('c-corrida', 'Repisa corrida', 650, 585),
      mkDim('c-division', 'División vertical', 585, 1900),
      mkDim('c-vano', 'Estante regulable vano', 317.5, 585),
    ];
    const posMap = new Map([
      ['c-corrida', 115], ['c-division', 130], ['c-vano', 700],
      ['c-base', 0], ['c-tapa', 1985], ['c-fondo', 0],
      ['c-lat-izq', 0], ['c-lat-der', 0],
    ]);
    const { steps } = buildAssemblySequence(mod, posMap);
    const order = steps.map((s) => s.piezas[0]);
    const idx = (id) => order.indexOf(id);
    assert.ok(idx('c-corrida') < idx('c-division'), 'corrida (lateral a lateral) antes que división');
    assert.ok(idx('c-division') < idx('c-vano'), 'división antes que repisa de vano');
  });

  it('repisa de vano que SOPORTA una división va antes que ella', () => {
    const mkDim = (id, nombre, ancho, alto, rotate = 'no') => ({
      id, nombre, ancho, alto, rotate, espesor: 15, cantidad: 1, modulo: '1',
    });
    const mod = [
      mkDim('s-base', 'Base módulo 1', 650, 585, 'si'),
      mkDim('s-tapa', 'Tapa módulo 1', 680, 600, 'si'),
      mkDim('s-lat-izq', 'Lateral izquierdo 1', 600, 2000),
      mkDim('s-lat-der', 'Lateral derecho 1', 600, 2000),
      mkDim('s-fondo', 'Fondo módulo 1', 650, 2000),
      mkDim('s-vano', 'Repisa vano soporte', 317.5, 585),
      mkDim('s-division', 'División vertical', 585, 1585),
    ];
    // La división apoya sobre la repisa de vano: base división (415) = top repisa (400+15).
    const posMap = new Map([
      ['s-vano', 400], ['s-division', 415],
      ['s-base', 0], ['s-tapa', 1985], ['s-fondo', 0],
      ['s-lat-izq', 0], ['s-lat-der', 0],
    ]);
    const { steps } = buildAssemblySequence(mod, posMap);
    const order = steps.map((s) => s.piezas[0]);
    assert.ok(order.indexOf('s-vano') < order.indexOf('s-division'), 'soporte antes que la división apoyada');
  });

  it('fallback sin posiciones con medidas: corrida → división → vano', () => {
    const mkDim = (id, nombre, ancho, alto, rotate = 'no') => ({
      id, nombre, ancho, alto, rotate, espesor: 15, cantidad: 1, modulo: '1',
    });
    const mod = [
      mkDim('f-base', 'Base módulo 1', 650, 585, 'si'),
      mkDim('f-tapa', 'Tapa módulo 1', 680, 600, 'si'),
      mkDim('f-lat-izq', 'Lateral izquierdo 1', 600, 2000),
      mkDim('f-lat-der', 'Lateral derecho 1', 600, 2000),
      mkDim('f-corrida', 'Repisa corrida', 650, 585),
      mkDim('f-division', 'División vertical', 585, 1900),
      mkDim('f-vano', 'Estante regulable vano', 317.5, 585),
    ];
    const { steps } = buildAssemblySequence(mod);
    const order = steps.map((s) => s.piezas[0]);
    const idx = (id) => order.indexOf(id);
    assert.ok(idx('f-corrida') < idx('f-division'), 'corrida antes que división (fallback)');
    assert.ok(idx('f-division') < idx('f-vano'), 'división antes que vano (fallback)');
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

describe('assemblyStepService/fondo estructural (REGLA 1)', () => {
  // Módulo 800×550×2300, t=15. Fondo externo: 800×2300; interno: 770×2270.
  const mkDim = (id, nombre, ancho, alto, espesor = 15, modulo = '1') => ({
    id,
    nombre,
    ancho,
    alto,
    espesor,
    modulo,
    cantidad: 1,
    rotate: 'no',
    pos_z: '',
  });

  const carcass = (fondoW, fondoH) => [
    mkDim('c-base', 'Base módulo', 800, 550),
    mkDim('c-lat-izq', 'Lateral izquierdo', 550, 2300),
    mkDim('c-lat-der', 'Lateral derecho', 550, 2300),
    mkDim('c-tapa', 'Tapa módulo', 800, 550),
    mkDim('c-fondo', 'Fondo módulo', fondoW, fondoH),
    mkDim('c-repisa', 'Repisa inferior', 770, 520),
    mkDim('c-divisor', 'Divisor inferior', 520, 400),
    mkDim('c-puerta', 'Puerta módulo', 400, 800),
  ];

  it('fondo EXTERNO: cierra el casco tras la tapa, antes de interiores', () => {
    const { steps } = buildAssemblySequence(carcass(800, 2300));
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order.slice(0, 5), ['c-base', 'c-lat-izq', 'c-lat-der', 'c-tapa', 'c-fondo']);
    assert.ok(order.indexOf('c-fondo') < order.indexOf('c-repisa'), 'fondo antes que interiores (rigidez)');
    assert.ok(order.indexOf('c-fondo') < order.indexOf('c-puerta'), 'accesorios al cierre');
  });

  it('fondo INTERNO: misma posición estructural (tras tapa, antes de interiores)', () => {
    const { steps } = buildAssemblySequence(carcass(770, 2270));
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order.slice(0, 3), ['c-base', 'c-lat-izq', 'c-lat-der']);
    assert.ok(order.indexOf('c-tapa') < order.indexOf('c-fondo'), 'fondo tras la tapa');
    assert.ok(order.indexOf('c-fondo') < order.indexOf('c-repisa'), 'fondo antes que interiores');
    assert.ok(order.indexOf('c-repisa') < order.indexOf('c-divisor'), 'divisor tras su repisa');
    assert.ok(order.indexOf('c-fondo') < order.indexOf('c-puerta'), 'accesorios al cierre');
  });

  it('fondo custom (medidas intermedias): también estructural, tras la tapa', () => {
    const { steps } = buildAssemblySequence(carcass(790, 2200));
    const order = steps.map((s) => s.piezas[0]);
    assert.ok(order.indexOf('c-tapa') < order.indexOf('c-fondo'), 'custom: fondo tras la tapa');
    assert.ok(order.indexOf('c-fondo') < order.indexOf('c-repisa'), 'custom: fondo antes que interiores');
  });

  it('fondo corrido entre laterales (interno en ancho, alto=H): tras la tapa, antes de interiores', () => {
    // Caso real: caja 680×2000×600 (t=15), fondo 650×2000.
    // ancho = W−2t (encajado entre laterales), alto = H completo. La base
    // 650×585 es EMBUTIDA: va tras los laterales. REGLA 1: tapa y fondo
    // cierran el casco antes de colgar la repisa.
    const mod = [
      mkDim('r-base', 'Base módulo 1', 650, 585),
      mkDim('r-tapa', 'Tapa módulo 1', 680, 600),
      mkDim('r-lat-izq', 'Lateral izquierdo 1', 600, 2000),
      mkDim('r-lat-der', 'Lateral derecho 1', 600, 2000),
      mkDim('r-fondo', 'Fondo módulo 1', 650, 2000),
      mkDim('r-repisa', 'Repisa inferior 1', 650, 585),
    ];
    const { steps } = buildAssemblySequence(mod);
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order.slice(0, 3), ['r-lat-izq', 'r-lat-der', 'r-base'], 'base embutida tras laterales');
    assert.ok(order.indexOf('r-base') < order.indexOf('r-tapa'), 'base antes que la tapa');
    assert.ok(order.indexOf('r-tapa') < order.indexOf('r-fondo'), 'tapa cierra el casco');
    assert.ok(order.indexOf('r-fondo') < order.indexOf('r-repisa'), 'fondo da rigidez antes de la repisa');
  });

  it('fondo sin medidas (fallback) mantiene el orden estructural', () => {
    const mod = [
      mk('b', 'Base'),
      mk('l', 'Lateral izquierdo'),
      mk('t', 'Tapa'),
      mk('f', 'Fondo'),
    ];
    const { steps } = buildAssemblySequence(mod);
    assert.deepEqual(steps.map((s) => s.piezas[0]), ['b', 'l', 't', 'f']);
  });

  it('interno y externo comparten posición estructural en módulos distintos', () => {
    const m1 = carcass(770, 2270).map((p) => ({ ...p, modulo: '1' }));
    const m2 = carcass(800, 2300).map((p) => ({ ...p, id: `x-${p.id}`, modulo: '2' }));
    const { steps } = buildAssemblySequence([...m2, ...m1]);
    const order = steps.map((s) => s.piezas[0]);
    const idx = (id) => order.indexOf(id);
    // Ambos módulos: tapa → fondo → interiores
    assert.ok(idx('c-tapa') < idx('c-fondo') && idx('c-fondo') < idx('c-repisa'), 'm1 fondo interno estructural');
    assert.ok(idx('x-c-tapa') < idx('x-c-fondo') && idx('x-c-fondo') < idx('x-c-repisa'), 'm2 fondo externo estructural');
  });
});

describe('assemblyStepService/base interna vs externa', () => {
  const mkDim = (id, nombre, ancho, alto, rotate = 'no') => ({
    id, nombre, ancho, alto, rotate, espesor: 15, cantidad: 1, modulo: '1',
  });

  it('base EXTERNA (cubre laterales) sigue siendo la primera pieza del casco', () => {
    const mod = [
      mkDim('e-base', 'Base módulo', 800, 550),
      mkDim('e-lat-izq', 'Lateral izquierdo', 550, 2300),
      mkDim('e-lat-der', 'Lateral derecho', 550, 2300),
      mkDim('e-tapa', 'Tapa módulo', 800, 550),
    ];
    const { steps } = buildAssemblySequence(mod);
    const order = steps.map((s) => s.piezas[0]);
    assert.deepEqual(order.slice(0, 3), ['e-base', 'e-lat-izq', 'e-lat-der'], 'plataforma de referencia primero');
    assert.ok(order.indexOf('e-tapa') > order.indexOf('e-lat-der'), 'tapa tras los laterales');
  });

  it('base EMBUTIDA (ancho ≈ W−2t, profundidad ≈ D−t) va tras los laterales', () => {
    // Caso real usuario: caja 680×2000×600 (t=15); base 650×585 = (W−2t)×(D−t).
    const mod = [
      mkDim('i-zocalo', 'Zócalo módulo 1', 680, 100),
      mkDim('i-base', 'Base módulo 1', 650, 585, 'si'),
      mkDim('i-lat-izq', 'Lateral izquierdo 1', 600, 2000),
      mkDim('i-lat-der', 'Lateral derecho 1', 600, 2000),
      mkDim('i-tapa', 'Tapa módulo 1', 680, 600, 'si'),
    ];
    const { steps } = buildAssemblySequence(mod);
    const order = steps.map((s) => s.piezas[0]);
    assert.equal(order[0], 'i-zocalo', 'zócalo externo sigue primero');
    assert.deepEqual(order.slice(1, 4), ['i-lat-izq', 'i-lat-der', 'i-base'], 'base embutida tras el casco');
    assert.ok(order.indexOf('i-base') < order.indexOf('i-tapa'), 'base embutida antes que la tapa');
  });

  it('módulo completo (caso usuario): base embutida → tapa → fondo → repisas', () => {
    const mod = [
      mkDim('p-base', 'Base módulo 1', 650, 585),
      mkDim('p-lat-izq', 'Lateral izquierdo 1', 600, 2000),
      mkDim('p-lat-der', 'Lateral derecho 1', 600, 2000),
      mkDim('p-tapa', 'Tapa módulo 1', 680, 600),
      mkDim('p-fondo', 'Fondo módulo 1', 650, 2000),
      mkDim('p-repisa', 'Repisa corrida', 650, 585),
    ];
    const { steps } = buildAssemblySequence(mod);
    const order = steps.map((s) => s.piezas[0]);
    const idx = (id) => order.indexOf(id);
    assert.ok(idx('p-lat-der') < idx('p-base'), 'base embutida tras laterales');
    assert.ok(idx('p-base') < idx('p-tapa'), 'base antes que la tapa');
    assert.ok(idx('p-tapa') < idx('p-fondo'), 'REGLA 1: tapa cierra el casco');
    assert.ok(idx('p-fondo') < idx('p-repisa'), 'REGLA 1: fondo da rigidez antes de interiores');
  });

  it('pieza sin medidas (fallback) mantiene la base como primera pieza', () => {
    const mod = [
      { id: 'b', nombre: 'Base', modulo: '1' },
      { id: 'l', nombre: 'Lateral izquierdo', modulo: '1' },
      { id: 't', nombre: 'Tapa', modulo: '1' },
    ];
    const { steps } = buildAssemblySequence(mod);
    assert.deepEqual(steps.map((s) => s.piezas[0]), ['b', 'l', 't']);
  });
});
