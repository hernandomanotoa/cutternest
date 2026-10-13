// test/views/csvView.dom.test.js — Tests DOM de la vista CSV (happy-dom).
// NO corre en el runner puro: el patrón js/**/*.test.js no alcanza test/views.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../../js/core/store.js';
import { createCSVView } from '../../js/views/csvView.js';
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
    cantos: 'T,B,L,R',
    modulo: 'global',
    pos_z: 0,
    ...overrides,
  };
}

beforeEach(resetDocument);
afterEach(resetDocument);

test('mount renderiza la estructura básica con estado vacío', () => {
  const store = createStore();
  const view = createCSVView(store);
  const container = createContainer();

  view.mount(container);

  assert.ok(container.querySelector('#csv-raw'), 'textarea del editor CSV');
  assert.ok(container.querySelector('#btn-parse-csv'), 'botón Actualizar mueble');
  assert.ok(container.querySelector('#btn-reload-csv'), 'botón Restaurar CSV');
  assert.ok(container.querySelector('#btn-add-piece'), 'botón + Pieza');
  assert.ok(container.querySelector('#btn-export-table'), 'botón Exportar CSV');
  assert.match(
    container.querySelector('.card__title').textContent,
    /Importar \/ editar CSV/
  );
  assert.match(container.querySelector('#csv-table-body').textContent, /No hay piezas/);

  view.destroy();
});

test('mount renderiza una fila por pieza y marca las globales', () => {
  const store = createStore({ pieces: [makePiece(), makePiece({ id: 'glb-lat1', nombre: 'Lateral' })] });
  const view = createCSVView(store);
  const container = createContainer();

  view.mount(container);

  const rows = container.querySelectorAll('#csv-table-body tr');
  assert.equal(rows.length, 2);
  assert.ok(container.querySelector('#csv-table-body .badge--info'), 'badge Global');
  assert.equal(
    container.querySelector('#csv-table-body tr input[data-field="id"]').value,
    'glb-est1'
  );

  view.destroy();
});

test('re-renderiza al cambiar el estado del store', () => {
  const store = createStore({ pieces: [makePiece()] });
  const view = createCSVView(store);
  const container = createContainer();

  view.mount(container);
  assert.equal(container.querySelectorAll('#csv-table-body tr').length, 1);

  store.setField('pieces', [makePiece(), makePiece({ id: 'glb-tapa', nombre: 'Tapa' })]);
  assert.equal(container.querySelectorAll('#csv-table-body tr').length, 2, 'se re-renderizó con 2 filas');

  view.destroy();
});

test('renderiza advertencias del parser cuando existen', () => {
  const store = createStore({ warnings: ['Falta pos_z en frente corredero'] });
  const view = createCSVView(store);
  const container = createContainer();

  view.mount(container);

  assert.match(container.querySelector('.alert--warning').textContent, /Advertencias \(1\)/);
  assert.match(container.textContent, /Falta pos_z en frente corredero/);

  view.destroy();
});

test('destroy desuscribe y no lanza', () => {
  const store = createStore({ pieces: [makePiece()] });
  const view = createCSVView(store);
  const container = createContainer();

  view.mount(container);
  const htmlAfterMount = container.innerHTML;

  assert.doesNotThrow(() => view.destroy());
  // Tras destroy, un cambio de estado no debe re-renderizar el contenedor.
  store.setField('pieces', [makePiece(), makePiece({ id: 'glb-x', nombre: 'X' })]);
  assert.equal(container.innerHTML, htmlAfterMount, 'el contenedor quedó congelado tras destroy');
});
