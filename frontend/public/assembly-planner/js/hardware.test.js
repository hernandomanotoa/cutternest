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

test('la cara del cajón no duplica el conteo de correderas', () => {
  const piezas = [
    pieza('f1', 'Frente cajon 1'),
    pieza('c1', 'Cara cajon 1'),
    pieza('l1i', 'Lateral cajon 1 izq'),
    pieza('l1d', 'Lateral cajon 1 der'),
    pieza('b1', 'Base cajon 1'),
    pieza('f1f', 'Fondo cajon 1'),
    pieza('t1', 'Tirador cajon 1'),
    pieza('f2', 'Frente cajon 2'),
    pieza('c2', 'Cara cajon 2'),
    pieza('l2i', 'Lateral cajon 2 izq'),
    pieza('l2d', 'Lateral cajon 2 der'),
    pieza('b2', 'Base cajon 2'),
    pieza('f2f', 'Fondo cajon 2'),
    pieza('t2', 'Tirador cajon 2'),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const correderas = h.find((x) => x.nombre === 'Correderas telescópicas');
  assert.ok(correderas, 'debe listar correderas');
  assert.equal(correderas.cantidad, 2, '2 frentes decorativos = 2 cajones, la cara no cuenta');
  const tiradores = h.find((x) => x.nombre === 'Tiradores');
  assert.equal(tiradores.cantidad, 2, '2 tiradores explícitos');
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

test('tiradores de zapatera extraíble cuentan como tiradores de cajón', () => {
  const h = calculateHardware([
    pieza('t1', 'Tirador zapatera extraible 1'),
    pieza('t2', 'Tirador zapatera extraible 2'),
  ], []);
  const tiradores = h.filter((x) => x.nombre === 'Tiradores');
  assert.equal(tiradores.length, 1);
  assert.equal(tiradores[0].cantidad, 2);
});

test('agrupa correderas por tipo inferido: una entrada por tipo con su cantidad', () => {
  const piezas = [
    pieza('t1', 'Frente cajon 1'),
    pieza('t2', 'Frente cajon 2'),
    pieza('o1', 'Frente cajon oculto 1'),
    pieza('o2', 'Frente cajon oculto 2'),
    pieza('o3', 'Frente cajon oculto 3'),
    pieza('r1', 'Frente cajon ruedas 1'),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const tipos = h.filter((x) => x.nombre.startsWith('Correderas'));
  assert.equal(tipos.length, 3, 'telescópica + oculta + ruedas = 3 entradas');
  const porNombre = Object.fromEntries(tipos.map((x) => [x.nombre, x]));
  assert.equal(porNombre['Correderas telescópicas'].cantidad, 2);
  assert.equal(porNombre['Correderas ocultas'].cantidad, 3);
  assert.equal(porNombre['Correderas euro ruedas'].cantidad, 1);
  assert.match(porNombre['Correderas telescópicas'].especificacion, /vano − 25,4 mm/);
  assert.match(porNombre['Correderas ocultas'].especificacion, /vano − 42 mm/);
  assert.match(porNombre['Correderas ocultas'].especificacion, /Blum Tandem 563H/);
  assert.match(porNombre['Correderas euro ruedas'].especificacion, /~75%/);
  assert.ok(tipos.every((x) => x.bloqueante === true));
});

test('frente de zapatera con riel explícito: corredera ligera', () => {
  const piezas = [
    pieza('z1f', 'Frente zapatera riel 1'),
    pieza('z1li', 'Lateral zapatera riel 1 izq'),
    pieza('z1ld', 'Lateral zapatera riel 1 der'),
    pieza('z2f', 'Frente zapatera extraible 2'),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const ligera = h.find((x) => x.nombre === 'Correderas ligeras');
  const telescopica = h.find((x) => x.nombre === 'Correderas telescópicas');
  assert.ok(ligera, 'zapatera con riel explícito infiere corredera ligera');
  assert.equal(ligera.cantidad, 1);
  assert.match(ligera.especificacion, /uso ligero/);
  assert.ok(telescopica, 'zapatera extraíble sin keyword sigue telescópica');
  assert.equal(telescopica.cantidad, 1);
});

function piezaMedida(id, nombre, ancho, alto, modulo = '1') {
  return { id, originalId: id, nombre, modulo, ancho, alto, cantos: '' };
}

test('cama: esquineros ×8, soporte central con tarima ≥1400 y zapatas sin patas', () => {
  const piezas = [
    piezaMedida('c1', 'Cabecero cama matrimonial', 1600, 900),
    piezaMedida('t1', 'Tarima somier', 1600, 500),
    piezaMedida('l1', 'Lámina somier 1', 800, 50),
    piezaMedida('l2', 'Lámina somier 2', 800, 50),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const esquineros = h.find((x) => x.nombre === 'Esquineros metálicos de unión');
  assert.ok(esquineros, 'la cama genera esquineros');
  assert.equal(esquineros.cantidad, 8);
  const soporte = h.find((x) => x.nombre === 'Soporte central de tarima');
  assert.ok(soporte, 'tarima de 1600 mm ≥ 1400 mm genera soporte central');
  assert.equal(soporte.cantidad, 1);
  const zapatas = h.find((x) => x.nombre === 'Zapatas niveladoras');
  assert.ok(zapatas, 'sin piezas rol leg deben aparecer zapatas');
  assert.equal(zapatas.cantidad, 4);
});

test('cama estrecha: sin soporte central; con patas propias: sin zapatas', () => {
  const piezas = [
    pieza('p1', 'Pata cama 1'),
    piezaMedida('c1', 'Cabecero cama', 900, 600),
    piezaMedida('t1', 'Tarima somier', 900, 400),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  assert.equal(h.some((x) => x.nombre === 'Soporte central de tarima'), false, 'tarima 900 mm < 1400 mm');
  assert.equal(h.some((x) => x.nombre === 'Zapatas niveladoras'), false, 'hay patas: no zapatas');
  const esquineros = h.find((x) => x.nombre === 'Esquineros metálicos de unión');
  assert.ok(esquineros, 'la cama sigue generando esquineros');
  assert.equal(esquineros.cantidad, 8);
});

test('pistones de gas: 2 por cada frente abatible/volquete', () => {
  const piezas = [
    pieza('v1', 'Frente cajon abatible 1'),
    pieza('v1l', 'Lateral cajon abatible 1 izq'),
    pieza('v2', 'Frente cajon volquete 2'),
    pieza('n1', 'Frente cajon 1'),
    pieza('n1l', 'Lateral cajon 1 izq'),
  ];
  const h = calculateHardware(piezas, dependenciesEstructural);
  const pistones = h.find((x) => x.nombre === 'Pistones de gas 600 N');
  assert.ok(pistones, 'los volquetes generan pistones de gas');
  assert.equal(pistones.cantidad, 4, '2 volquetes × 2 pistones');
  const bisagras = h.find((x) => x.nombre.includes('Bisagras abatibles'));
  assert.ok(bisagras, 'los volquetes siguen con bisagras abatibles');
  assert.equal(bisagras.cantidad, 4);
});

test('proyecto sin cama: sin herrajes de dormitorio', () => {
  const h = calculateHardware([pieza('f1', 'Frente cajon 1')], dependenciesEstructural);
  assert.equal(h.some((x) => x.nombre === 'Esquineros metálicos de unión'), false);
  assert.equal(h.some((x) => x.nombre === 'Zapatas niveladoras'), false);
  assert.equal(h.some((x) => x.nombre === 'Soporte central de tarima'), false);
});
