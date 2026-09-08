// hardware.test.js — contrato de cálculo de herrajes

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateHardware } from './hardware.js';

function pieza(id, nombre, modulo = '1') {
  return { id, originalId: id, nombre, modulo, ancho: 400, alto: 180, cantos: '' };
}

const dependenciesEstructural = [{ type: 'estructural' }];

test('1 par de correderas por cajón estándar (no por pieza)', () => {
  const piezas = [
    pieza('f1', 'Frente cajon 1'),
    pieza('l1i', 'Lateral cajon 1 izq'),
    pieza('l1d', 'Lateral cajon 1 der'),
    pieza('f1f', 'Fondo cajon 1'),
    pieza('b1', 'Base cajon 1'),
    pieza('f2', 'Frente cajon 2'),
    pieza('l2i', 'Lateral cajon 2 izq'),
    pieza('l2d', 'Lateral cajon 2 der'),
    pieza('f2f', 'Fondo cajon 2'),
    pieza('b2', 'Base cajon 2'),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const correderas = h.find((x) => x.nombre === 'Correderas telescópicas');
  assert.ok(correderas, 'debe listar correderas');
  assert.equal(correderas.cantidad, 2, '2 cajones = 2 pares, no 5');
  assert.equal(h.some((x) => x.nombre.includes('volquete')), false);
});

test('cajón abatible/volquete: bisagras abatibles en vez de correderas', () => {
  const piezas = [
    pieza('v1', 'Frente cajon abatible 1'),
    pieza('v1l', 'Lateral cajon abatible 1 izq'),
    pieza('v1b', 'Base cajon abatible 1'),
    pieza('v2', 'Frente cajon volquete 2'),
    pieza('n1', 'Frente cajon 1'),
    pieza('n1l', 'Lateral cajon 1 izq'),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const bisagras = h.find((x) => x.nombre.includes('Bisagras abatibles'));
  const correderas = h.find((x) => x.nombre === 'Correderas telescópicas');
  assert.ok(bisagras, 'debe listar bisagras abatibles');
  assert.equal(bisagras.cantidad, 4, '2 volquetes × 2 bisagras');
  assert.ok(correderas, 'el cajón estándar sigue con correderas');
  assert.equal(correderas.cantidad, 1);
});

test('tiradores de cajón explícitos aparecen en la lista', () => {
  const piezas = [
    pieza('f1', 'Frente cajon 1'),
    pieza('t1', 'Tirador cajon 1'),
    pieza('f2', 'Frente cajon 2'),
    pieza('t2', 'Tirador cajon 2'),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const tiradores = h.filter((x) => x.nombre === 'Tiradores');
  assert.equal(tiradores.length, 1);
  assert.equal(tiradores[0].cantidad, 2);
});

test('frentes de zapatera-cajón: correderas como cajón estándar', () => {
  const piezas = [
    pieza('z1f', 'Frente zapatera extraible 1'),
    pieza('z1li', 'Lateral zapatera extraible 1 izq'),
    pieza('z1ld', 'Lateral zapatera extraible 1 der'),
    pieza('z2f', 'Frente zapatera extraible 2'),
    pieza('z2li', 'Lateral zapatera extraible 2 izq'),
    pieza('z2ld', 'Lateral zapatera extraible 2 der'),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const correderas = h.find((x) => x.nombre === 'Correderas telescópicas');
  assert.ok(correderas, 'debe listar correderas');
  assert.equal(correderas.cantidad, 2, '2 frentes zapatera = 2 pares');
  assert.equal(h.some((x) => x.nombre.includes('volquete')), false);
});

test('piezas de cajón sin frente identificable: fallback al conteo por piezas', () => {
  const piezas = [pieza('c1', 'Cajon zapatero 1'), pieza('c2', 'Cajon zapatero 2')];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const correderas = h.find((x) => x.nombre === 'Correderas telescópicas');
  assert.ok(correderas, 'fallback no rompe el cálculo');
});
