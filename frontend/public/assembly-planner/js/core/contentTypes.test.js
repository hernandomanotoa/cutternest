// js/core/contentTypes.test.js — Invariantes del catálogo de tipos de
// contenido del Constructor (cajones y zapateras): ids únicos, alturas de
// vano positivas, RAIL_SIDE_HEIGHT estable y frenteCompleto restringido a
// zapateras altas (botas).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAIL_SIDE_HEIGHT,
  DRAWER_TYPES,
  SHOE_RACK_TYPES,
  getContentType,
} from './contentTypes.js';

const TODOS = [...DRAWER_TYPES, ...SHOE_RACK_TYPES];

describe('RAIL_SIDE_HEIGHT', () => {
  it('es 100 mm (cubre la corredera telescópica con margen)', () => {
    assert.equal(RAIL_SIDE_HEIGHT, 100);
    assert.ok(Number.isFinite(RAIL_SIDE_HEIGHT));
  });
});

describe('catálogos: forma básica de cada entrada', () => {
  it('cada tipo tiene id y label no vacíos', () => {
    for (const t of TODOS) {
      assert.equal(typeof t.id, 'string', JSON.stringify(t));
      assert.ok(t.id.trim().length > 0, `id vacío en ${JSON.stringify(t)}`);
      assert.equal(typeof t.label, 'string');
      assert.ok(t.label.trim().length > 0, `label vacío en ${t.id}`);
      assert.equal(typeof t.frenteCompleto, 'boolean', `${t.id}: frenteCompleto booleano`);
    }
  });

  it('altoVano es numérico, finito y positivo en todos los tipos', () => {
    for (const t of TODOS) {
      assert.equal(typeof t.altoVano, 'number', `${t.id}: altoVano numérico`);
      assert.ok(Number.isFinite(t.altoVano), `${t.id}: altoVano finito`);
      assert.ok(t.altoVano > 0, `${t.id}: altoVano positivo (got ${t.altoVano})`);
    }
  });

  it('los ids son únicos entre ambos catálogos (incluida la resolución cruzada)', () => {
    const ids = TODOS.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, `ids duplicados: ${ids}`);
  });
});

describe('frenteCompleto', () => {
  it('ningún cajón (DRAWER_TYPES) tiene frente completo', () => {
    for (const t of DRAWER_TYPES) {
      assert.equal(t.frenteCompleto, false, `${t.id}: el cajón nunca cubre todo el vano`);
    }
  });

  it('solo las zapateras altas tienen frente completo', () => {
    const completas = SHOE_RACK_TYPES.filter((t) => t.frenteCompleto);
    assert.deepEqual(completas.map((t) => t.id), ['botas'],
      'frenteCompleto solo en botas (cubre el vano entero, sin cara)');
  });

  it('frenteCompleto=true implica zapatera alta (≥400 mm) y viceversa para botas', () => {
    const ALTURA_MINIMA_FRENTE_COMPLETO = 400;
    for (const t of SHOE_RACK_TYPES) {
      if (t.frenteCompleto) {
        assert.ok(t.altoVano >= ALTURA_MINIMA_FRENTE_COMPLETO,
          `${t.id}: frente completo exige vano alto (got ${t.altoVano})`);
      } else {
        assert.ok(t.altoVano < ALTURA_MINIMA_FRENTE_COMPLETO,
          `${t.id}: vano bajo con frente completo sería inconsistente (got ${t.altoVano})`);
      }
    }
  });

  it('botas es la zapatera de mayor vano', () => {
    const max = Math.max(...SHOE_RACK_TYPES.map((t) => t.altoVano));
    const botas = SHOE_RACK_TYPES.find((t) => t.id === 'botas');
    assert.equal(botas.altoVano, max);
  });
});

describe('getContentType', () => {
  it('resuelve tipos de cajón en DRAWER_TYPES', () => {
    const t = getContentType('drawer', 'estandar');
    assert.ok(t);
    assert.equal(t.id, 'estandar');
    assert.equal(t.altoVano, 200);
    assert.equal(t.frenteCompleto, false);
  });

  it('resuelve tipos de zapatera en SHOE_RACK_TYPES', () => {
    const t = getContentType('shoeRack', 'botas');
    assert.ok(t);
    assert.equal(t.frenteCompleto, true);
    assert.equal(t.altoVano, 450);
  });

  it('kind desconocido cae al catálogo de cajones', () => {
    assert.equal(getContentType('otro', 'estandar').id, 'estandar');
  });

  it('devuelve null para ids inexistentes', () => {
    assert.equal(getContentType('drawer', 'botas'), null, 'botas no existe en cajones');
    assert.equal(getContentType('shoeRack', 'estandar'), null);
    assert.equal(getContentType('drawer', 'nope'), null);
    assert.equal(getContentType('drawer', null), null);
    assert.equal(getContentType('drawer', undefined), null);
  });
});
