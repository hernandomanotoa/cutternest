// js/services/__tests__/railService.test.js — contrato de tipos de riel
//
// Inferencia de tipo por keywords en nombre/id, defaults seguros y ancho
// exterior de la caja según la holgura de riel por lado (RAIL_TYPES).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  inferRailType,
  railTypeFor,
  getRailType,
  boxExteriorWidth,
} from '../railService.js';
import { RAIL_TYPES, DEFAULT_RAIL_TYPE } from '../../core/config.js';

const piece = (id, nombre) => ({ id, nombre });

describe('inferRailType', () => {
  it('oculta: keywords de corredera oculta en nombre', () => {
    assert.equal(inferRailType(piece('c1', 'Frente cajon oculto 1')), 'oculta');
    assert.equal(inferRailType(piece('c2', 'Frente cajon tandem')), 'oculta');
    assert.equal(inferRailType(piece('c3', 'Cajon movento')), 'oculta');
  });

  it('oculta: keyword de catálogo en el id', () => {
    assert.equal(inferRailType(piece('m1-cajon-matrix-um', 'Frente cajon 1')), 'oculta');
  });

  it('ruedas: keywords euro roller/ruedas', () => {
    assert.equal(inferRailType(piece('c1', 'Frente cajon ruedas')), 'ruedas');
    assert.equal(inferRailType(piece('c2', 'Cajon euro roller')), 'ruedas');
  });

  it('ligera: pieza ligera (bandeja/zapatera) + riel explícito', () => {
    assert.equal(inferRailType(piece('z1', 'Frente zapatera riel 1')), 'ligera');
    assert.equal(inferRailType(piece('b1', 'Bandeja riel extraible')), 'ligera');
    assert.equal(inferRailType(piece('b2', 'Bandeja corredera ligera')), 'ligera');
  });

  it('default telescópica: cajón estándar sin keywords de riel', () => {
    assert.equal(inferRailType(piece('c1', 'Frente cajon 1')), 'telescopica');
    assert.equal(inferRailType(piece('c2', 'Frente cajon superior M1')), 'telescopica');
  });

  it('zapatera extraíble sin keyword de riel: telescópica (catálogo del proyecto)', () => {
    // Los CSV de ejemplo documentan correderas telescópicas de extensión total
    // para zapateras extraíbles; el nombre no menciona riel/corredera.
    assert.equal(inferRailType(piece('m11-zapatera-frente', 'Frente zapatera extraible 1 M1')), 'telescopica');
    assert.equal(inferRailType(piece('m11-zapatera-repisa-frente', 'Frente zapatera repisa extraible 1')), 'telescopica');
  });

  it('respeta defaultType personalizado y normaliza acentos/mayúsculas', () => {
    assert.equal(inferRailType(piece('c1', 'Frente cajon 1'), 'ruedas'), 'ruedas');
    assert.equal(inferRailType(piece('c2', 'Frente Cajón Tándem')), 'oculta');
  });

  it('pieza ausente: defaultType', () => {
    assert.equal(inferRailType(null), DEFAULT_RAIL_TYPE);
    assert.equal(inferRailType(undefined), DEFAULT_RAIL_TYPE);
  });
});

describe('railTypeFor', () => {
  it('garantiza un tipo existente en RAIL_TYPES', () => {
    assert.equal(railTypeFor(piece('c1', 'Frente cajon 1')), 'telescopica');
    assert.equal(railTypeFor(piece('c2', 'Frente cajon oculto')), 'oculta');
  });

  it('fallback a telescópica si defaultType no existe', () => {
    assert.equal(railTypeFor(piece('c1', 'Frente cajon 1'), 'tipo-inventado'), 'telescopica');
  });
});

describe('getRailType', () => {
  it('lookup por tipo con fallback a telescópica', () => {
    assert.equal(getRailType('ruedas'), RAIL_TYPES.ruedas);
    assert.equal(getRailType('oculta').interiorDeduction, 42);
    assert.equal(getRailType('inventado'), RAIL_TYPES.telescopica);
    assert.equal(getRailType(undefined), RAIL_TYPES.telescopica);
  });
});

describe('boxExteriorWidth', () => {
  it('telescópica: descuenta 12,7 mm por lado (vano − 25,4)', () => {
    assert.equal(boxExteriorWidth(400, 15, 'telescopica'), 374.6);
  });

  it('ruedas: descuenta 12,5 mm por lado (vano − 25)', () => {
    assert.equal(boxExteriorWidth(400, 15, 'ruedas'), 375);
  });

  it('ligera: descuenta 10 mm por lado (vano − 20)', () => {
    assert.equal(boxExteriorWidth(400, 15, 'ligera'), 380);
  });

  it('oculta: sin descuento lateral (la deducción −42 es del interior)', () => {
    assert.equal(boxExteriorWidth(400, 15, 'oculta'), 400);
  });

  it('default telescópica cuando no se indica tipo; nunca negativo', () => {
    assert.equal(boxExteriorWidth(400), 374.6);
    assert.equal(boxExteriorWidth(10, 15, 'telescopica'), 0);
  });
});
