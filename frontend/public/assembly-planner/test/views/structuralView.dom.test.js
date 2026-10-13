// test/views/structuralView.dom.test.js — Tests DOM de la vista estructural (happy-dom).
// NO corre en el runner puro: el patrón js/**/*.test.js no alcanza test/views.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../../js/core/store.js';
import { createStructuralView } from '../../js/views/structuralView.js';
import { createContainer, resetDocument } from './setup.mjs';

function makePiece(overrides = {}) {
  return {
    id: 'glb-est1',
    nombre: 'Estante 1',
    ancho: 800,
    alto: 300,
    cantidad: 1,
    rotate: true,
    color: '#7bd88f',
    espesor: 18,
    cantos: 'T,B',
    modulo: 'global',
    pos_z: 400,
    ...overrides,
  };
}

beforeEach(resetDocument);
afterEach(resetDocument);

test('mount con estado vacío muestra el empty-state', () => {
  const store = createStore();
  const view = createStructuralView(store);
  const container = createContainer();

  view.mount(container);

  assert.match(container.textContent, /Importa un CSV para ver el análisis estructural/);
  assert.equal(container.querySelector('.chart-bar'), null, 'sin barras sin piezas');

  view.destroy();
});

test('mount con piezas renderiza cargas, riesgo y vuelco', () => {
  const pieces = [
    makePiece(),
    makePiece({ id: 'glb-lat1', nombre: 'Lateral', ancho: 300, alto: 1800, pos_z: 0 }),
  ];
  const store = createStore({ pieces });
  const view = createStructuralView(store);
  const container = createContainer();

  view.mount(container);

  assert.match(container.querySelector('.card__title').textContent, /Análisis de cargas/);
  // La pieza "Estante 1" genera su gráfica de carga.
  assert.ok(container.querySelector('.chart-bar'), 'gráfica de carga de repisa');
  assert.match(container.textContent, /Estante 1/);
  // Tabla de clasificación de riesgo: una fila por pieza.
  const riesgoRows = container.querySelectorAll('tbody tr');
  assert.equal(riesgoRows.length, pieces.length);
  assert.ok(container.querySelector('.badge'), 'badge de nivel de riesgo');
  // Sección de vuelco con peso estimado y factor de seguridad.
  assert.match(container.querySelectorAll('.card__title')[2].textContent, /Análisis de vuelco/);
  assert.match(container.textContent, /Peso estimado del mueble/);
  assert.match(container.textContent, /FS/);

  view.destroy();
});

test('re-renderiza al cambiar las piezas del store', () => {
  const store = createStore({ pieces: [makePiece()] });
  const view = createStructuralView(store);
  const container = createContainer();

  view.mount(container);
  assert.equal(container.querySelectorAll('tbody tr').length, 1);

  store.setField('pieces', [
    makePiece(),
    makePiece({ id: 'glb-tapa', nombre: 'Tapa', ancho: 800, alto: 300, pos_z: 1700 }),
  ]);
  assert.equal(container.querySelectorAll('tbody tr').length, 2, 'se re-renderizó con 2 filas');

  view.destroy();
});

test('destroy desuscribe y no lanza', () => {
  const store = createStore({ pieces: [makePiece()] });
  const view = createStructuralView(store);
  const container = createContainer();

  view.mount(container);
  const htmlAfterMount = container.innerHTML;

  assert.doesNotThrow(() => view.destroy());
  store.setField('pieces', []);
  assert.equal(container.innerHTML, htmlAfterMount, 'el contenedor quedó congelado tras destroy');
});
