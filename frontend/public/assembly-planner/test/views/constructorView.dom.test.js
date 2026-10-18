// test/views/constructorView.dom.test.js — Tests DOM de la vista Constructor
// (happy-dom). NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore } from '../../js/core/store.js';
import { createConstructorView } from '../../js/views/constructorView.js';
import { createContainer, resetDocument } from './setup.mjs';
import { countVersions, deleteAllVersions } from '../../js/services/projectVersionsService.js';

beforeEach(() => {
  resetDocument();
  // Acciones de app.js usan el store singleton: fijarlo por test.
  setStore(createStore());
  deleteAllVersions();
});
afterEach(resetDocument);

function mountView() {
  const store = createStore();
  setStore(store);
  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);
  return { store, view, container };
}

function click(container, selector) {
  const el = container.querySelector(selector);
  assert.ok(el, `no existe ${selector}`);
  el.click();
  return el;
}

test('estado vacío: muestra formulario y empty-state de módulos/versiones', () => {
  const { view, container } = mountView();

  assert.ok(container.querySelector('[data-action="add-module"]'));
  assert.match(container.textContent, /Todavía no hay módulos/);
  assert.match(container.textContent, /No hay versiones guardadas/);

  view.destroy();
});

test('agregar módulo con zócalo: casco 6 piezas en store y tarjeta en UI', () => {
  const { store, view, container } = mountView();

  click(container, '[data-action="add-module"]');

  const pieces = store.get().pieces;
  assert.equal(pieces.filter((p) => p.modulo === '1').length, 6); // casco 5 + zocalo 1
  assert.match(container.textContent, /Módulo 1/);

  view.destroy();
});

test('agregar cajón a un módulo: 7 piezas de submódulo con vano elegido', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');

  // Elegir vano 280 mm y agregar cajón
  const select = container.querySelector('[data-alto-vano="1"]');
  select.value = '280';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  click(container, '[data-action="add-content"][data-kind="drawer"]');

  const drawerPieces = store.get().pieces.filter((p) => p.modulo === '11');
  assert.equal(drawerPieces.length, 7);
  const frente = drawerPieces.find((p) => p.id.includes('-frente'));
  assert.equal(frente.alto, 277); // 280 - 3

  view.destroy();
});

test('eliminar módulo pide confirmación y luego quita sus piezas', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  assert.ok(store.get().pieces.length > 0);

  // Primer click: arme confirmación, no borra nada.
  click(container, '[data-action="remove-module"]');
  assert.ok(store.get().pieces.length > 0);
  assert.match(container.textContent, /¿Seguro\?/);

  // Re-render tras recalcular pudo reemplazar el DOM: el timeout no aplica
  // en happy-dom de forma fiable, así que re-disparamos sobre el botón vivo.
  const btn = container.querySelector('[data-action="remove-module"]');
  btn.dataset.confirm = '1';
  btn.click();
  assert.equal(store.get().pieces.length, 0);

  view.destroy();
});

test('guardar y cargar versión: round-trip de piezas y lista actualizada', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const antes = store.get().pieces.length;

  container.querySelector('[data-version-name]').value = 'Closet v1';
  click(container, '[data-action="save-version"]');

  assert.equal(countVersions(), 1);
  assert.match(container.textContent, /Closet v1/);

  // Mutar el mueble actual y recuperar la versión.
  store.get();
  const store2 = store;
  store2.set({ pieces: [] });
  assert.equal(store2.get().pieces.length, 0);

  click(container, '[data-action="load-version"]');
  assert.equal(store.get().pieces.length, antes);

  view.destroy();
});

test('eliminar una versión con confirmación y eliminar todas', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');

  container.querySelector('[data-version-name]').value = 'A';
  click(container, '[data-action="save-version"]');
  assert.equal(countVersions(), 1);

  // delete-version: primer click arme, segundo ejecuta (botón vivo tras re-render).
  click(container, '[data-action="delete-version"]');
  const btn = container.querySelector('[data-action="delete-version"]');
  btn.dataset.confirm = '1';
  btn.click();
  assert.equal(countVersions(), 0);

  // Guardar dos y eliminar todas.
  container.querySelector('[data-version-name]').value = 'B';
  click(container, '[data-action="save-version"]');
  container.querySelector('[data-version-name]').value = 'C';
  click(container, '[data-action="save-version"]');
  assert.equal(countVersions(), 2);

  click(container, '[data-action="delete-all-versions"]');
  const btnAll = container.querySelector('[data-action="delete-all-versions"]');
  btnAll.dataset.confirm = '1';
  btnAll.click();
  assert.equal(countVersions(), 0);

  view.destroy();
});
