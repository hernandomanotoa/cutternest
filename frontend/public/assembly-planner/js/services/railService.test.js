// railService.test.js — contrato de cálculos de caja por tipo de riel

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferRailType,
  getRailType,
  boxExteriorWidth,
  drawerBoxInteriorWidth,
  drawerBoxMaxHeight,
} from './railService.js';
import { RAIL_TYPES, DEFAULT_RAIL_TYPE } from '../core/config.js';

test('inferRailType clasifica por keywords con precedencia oculta > ruedas > ligera', () => {
  assert.equal(inferRailType({ nombre: 'Frente cajon 1' }), 'telescopica');
  assert.equal(inferRailType({ nombre: 'Frente cajon oculto 1' }), 'oculta');
  assert.equal(inferRailType({ nombre: 'Frente cajon ruedas 1' }), 'ruedas');
  assert.equal(inferRailType({ nombre: 'Bandeja zapatera riel 1' }), 'ligera');
  assert.equal(inferRailType({ nombre: 'Frente cajon abatible 1' }), 'telescopica');
});

test('drawerBoxInteriorWidth aplica las holguras reales de cada tipo de riel', () => {
  const espLat = 15;
  const frente = 464;
  const vano = frente + 2; // 466
  // telescópica (12,7 mm/lado): round(vano − 25,4) − 2·espLat
  assert.equal(drawerBoxInteriorWidth(frente, espLat, 'telescopica'), Math.round(vano - 25.4) - 30);
  // ruedas (12,5 mm/lado): round(vano − 25) − 2·espLat
  assert.equal(drawerBoxInteriorWidth(frente, espLat, 'ruedas'), Math.round(vano - 25) - 30);
  // ligera (10 mm/lado): round(vano − 20) − 2·espLat
  assert.equal(drawerBoxInteriorWidth(frente, espLat, 'ligera'), Math.round(vano - 20) - 30);
  // oculta: deducción del ancho INTERIOR (vano − 42), sin restar laterales
  assert.equal(drawerBoxInteriorWidth(frente, espLat, 'oculta'), vano - RAIL_TYPES.oculta.interiorDeduction);
  // tipo desconocido: fallback a telescópica
  assert.equal(drawerBoxInteriorWidth(frente, espLat, 'inexistente'), drawerBoxInteriorWidth(frente, espLat, DEFAULT_RAIL_TYPE));
});

test('drawerBoxInteriorWidth de la oculta no depende del espesor del lateral', () => {
  assert.equal(
    drawerBoxInteriorWidth(464, 15, 'oculta'),
    drawerBoxInteriorWidth(464, 19, 'oculta'),
  );
});

test('drawerBoxMaxHeight aplica el tope de catálogo solo donde existe', () => {
  const vanoH = 289;
  // oculta: vano − maxHeightDeduction (Blum Tandem/Häfele Matrix UM)
  assert.equal(drawerBoxMaxHeight(vanoH, 'oculta'), vanoH - RAIL_TYPES.oculta.maxHeightDeduction);
  // telescópica/ruedas/ligera: sin tope de catálogo, cabe hasta el propio vano
  for (const type of ['telescopica', 'ruedas', 'ligera']) {
    assert.equal(drawerBoxMaxHeight(vanoH, type), vanoH);
  }
  // tipo desconocido: fallback a telescópica
  assert.equal(drawerBoxMaxHeight(vanoH, 'otro'), vanoH);
  // nunca negativo
  assert.equal(drawerBoxMaxHeight(10, 'oculta'), 0);
});

test('boxExteriorWidth descuenta la holgura por lado solo en tipos con sideClearance', () => {
  assert.equal(boxExteriorWidth(464, 0, 'telescopica'), 464 - 2 * RAIL_TYPES.telescopica.sideClearance);
  assert.equal(boxExteriorWidth(464, 0, 'ruedas'), 464 - 2 * RAIL_TYPES.ruedas.sideClearance);
  assert.equal(boxExteriorWidth(464, 0, 'ligera'), 464 - 2 * RAIL_TYPES.ligera.sideClearance);
  // la oculta no descuenta por lado: la caja va al ras del vano
  assert.equal(boxExteriorWidth(464, 0, 'oculta'), 464);
});

test('getRailType cae a telescópica para tipos desconocidos', () => {
  assert.equal(getRailType('inexistente'), RAIL_TYPES[DEFAULT_RAIL_TYPE]);
  assert.equal(getRailType(undefined), RAIL_TYPES[DEFAULT_RAIL_TYPE]);
});
