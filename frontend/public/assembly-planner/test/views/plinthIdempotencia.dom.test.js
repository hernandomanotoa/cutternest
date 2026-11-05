// test/views/plinthIdempotencia.dom.test.js — Regresión: aplicar el zócalo
// estructural (marco) dos veces NO vuelve a acortar los laterales. La
// convención 2026-11 hace que el casco APOYE sobre el marco: la primera
// aplicación acorta los laterales en altoZocalo; una segunda aplicación
// (doble clic, regeneración por cantidad de zócalos) debe ser idempotente
// (bug real: 2380 → 2280 → 2180, fondo 2250 → 2150).
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import { addModuleFromBuilder, applyStructuralPlinth, removeStructuralPlinth } from '../../js/app.js';
import { resetDocument } from './setup.mjs';

beforeEach(() => {
  resetDocument();
  setStore(createStore());
  localStorage.clear();
});
afterEach(resetDocument);

const MOD = { ancho: 676, alto: 2380, prof: 600, espesor: 15, colorCuerpo: '#C19A6B', conZocalo: true, alturaZocalo: 100 };

const dims = () => {
  const ps = getStore().get().pieces;
  return {
    lateral: Number(ps.find((p) => p.id === 'm1-lateral-izq')?.alto),
    fondo: Number(ps.find((p) => p.id === 'm1-fondo')?.alto),
  };
};

test('aplicar el marco dos veces es idempotente (no doble descuento)', () => {
  assert.ok(addModuleFromBuilder(MOD).ok);
  assert.deepEqual(dims(), { lateral: 2380, fondo: 2250 }, 'creación con zócalo simple 100');
  assert.ok(applyStructuralPlinth({ altoZocalo: 100 }).ok);
  assert.deepEqual(dims(), { lateral: 2280, fondo: 2250 }, 'primera aplicación: casco apoya sobre el marco');
  // Bug reportado por el usuario: la segunda aplicación restaba otros 100
  // (2180 / 2150). Debe ser idempotente.
  assert.ok(applyStructuralPlinth({ altoZocalo: 100 }).ok);
  assert.deepEqual(dims(), { lateral: 2280, fondo: 2250 }, 'segunda aplicación: sin doble descuento');
  assert.ok(applyStructuralPlinth({ altoZocalo: 100, nZocalos: 2 }).ok);
  assert.deepEqual(dims(), { lateral: 2280, fondo: 2250 }, 'regeneración (cantidad de zócalos): idempotente');
  // Quitar el marco restaura el alto completo.
  assert.ok(removeStructuralPlinth().ok);
  assert.equal(dims().lateral, 2380, 'los laterales recuperan el alto total');
});
