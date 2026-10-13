// test/views/isometricView.dom.test.js — Tests DOM de la vista isométrica (happy-dom).
// NO corre en el runner puro: el patrón js/**/*.test.js no alcanza test/views.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createStore } from '../../js/core/store.js';
import { parseCSV } from '../../js/services/csvParser.js';
import { createIsometricView } from '../../js/views/isometricView.js';
import { createContainer, resetDocument } from './setup.mjs';

// Piezas reales del CSV de ejemplo (todas modulo=estructura → módulo 'global').
function loadExamplePieces() {
  const url = new URL('../../data/ejemplo-estanteria.csv', import.meta.url);
  const result = parseCSV(readFileSync(url, 'utf8'));
  assert.ok(result.ok, `parseCSV del ejemplo falló: ${result.error || ''}`);
  assert.ok(result.pieces.length > 0, 'el CSV de ejemplo tiene piezas');
  return result.pieces;
}

beforeEach(resetDocument);
afterEach(resetDocument);

test('mount con estado vacío muestra el selector de módulos', () => {
  const store = createStore();
  const view = createIsometricView(store);
  const container = createContainer();

  view.mount(container);

  assert.equal(container.querySelector('#iso-canvas'), null, 'sin canvas sin piezas');
  assert.ok(container.querySelector('#iso-module-selector'), 'selector de módulos');
  assert.match(container.textContent, /Selecciona un módulo para ver la vista isométrica/);

  view.destroy();
});

test('mount con piezas del CSV de ejemplo renderiza título, controles y SVG', () => {
  const pieces = loadExamplePieces();
  const store = createStore({ pieces });
  const view = createIsometricView(store);
  const container = createContainer();

  view.mount(container);

  assert.match(container.querySelector('.card__title').textContent, /Vista isométrica 3D/);
  assert.ok(container.querySelector('#btn-iso-zoom-in'), 'botón Zoom +');
  assert.ok(container.querySelector('#btn-iso-export'), 'botón Exportar SVG');
  const canvas = container.querySelector('#iso-canvas');
  assert.ok(canvas, 'contenedor del canvas');
  assert.ok(canvas.querySelector('svg'), 'el canvas recibió el SVG isométrico');

  view.destroy();
});

test('re-renderiza al cambiar las piezas del store', () => {
  const pieces = loadExamplePieces();
  const store = createStore({ pieces });
  const view = createIsometricView(store);
  const container = createContainer();

  view.mount(container);
  assert.ok(container.querySelector('#iso-canvas svg'), 'SVG con piezas');

  store.setField('pieces', []);
  assert.equal(container.querySelector('#iso-canvas'), null, 'canvas eliminado');
  assert.ok(container.querySelector('#iso-module-selector'), 'vuelve al selector de módulos');

  view.destroy();
});

test('destroy desuscribe y no lanza', () => {
  const pieces = loadExamplePieces();
  const store = createStore({ pieces });
  const view = createIsometricView(store);
  const container = createContainer();

  view.mount(container);
  const htmlAfterMount = container.innerHTML;

  assert.doesNotThrow(() => view.destroy());
  store.setField('pieces', []);
  assert.equal(container.innerHTML, htmlAfterMount, 'el contenedor quedó congelado tras destroy');
});
