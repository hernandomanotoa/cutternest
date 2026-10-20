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

// ── Pestañas del host de paneles (UI/UX: un panel visible a la vez) ────────

test('paneles en pestañas: solo el activo está montado, cambiar intercambia', () => {
  const pieces = loadExamplePieces();
  const store = createStore({ pieces });
  const view = createIsometricView(store);
  const container = createContainer();

  view.mount(container);

  const tabs = container.querySelectorAll('.iso-config-tab');
  assert.equal(tabs.length, 2, 'dos pestañas: ficha y offsets');
  // Default: ficha activa → SOLO la ficha montada (un panel a la vez).
  assert.ok(container.querySelector('.cn-furniture-ficha-panel'), 'ficha montada por defecto');
  assert.equal(container.querySelector('.cn-piece-offsets-panel'), null, 'offsets NO montado');
  const activa = [...tabs].find((t) => t.classList.contains('is-active'));
  assert.ok(activa, 'hay pestaña activa');

  // Cambiar a offsets: intercambia el panel sin tocar el canvas.
  const canvasAntes = container.querySelector('#iso-canvas svg')?.outerHTML;
  container.querySelector('[data-iso-tab="offsets"]').click();
  assert.ok(container.querySelector('.cn-piece-offsets-panel'), 'panel de offsets montado tras el click');
  assert.ok(container.querySelector('#iso-canvas svg'), 'canvas intacto tras cambiar de pestaña');
  assert.equal(activoEs('offsets', container), true, 'offsets queda activa');

  // Cambiar de vuelta a ficha.
  container.querySelector('[data-iso-tab="ficha"]').click();
  assert.equal(container.querySelector('.cn-piece-offsets-panel'), null, 'offsets desmontado');
  assert.ok(container.querySelector('.cn-furniture-ficha-panel'), 'ficha montada');
  void canvasAntes;

  view.destroy();
});

function activoEs(tab, container) {
  const t = container.querySelector(`[data-iso-tab="${tab}"]`);
  return !!t && t.classList.contains('is-active') && t.getAttribute('aria-selected') === 'true';
}
