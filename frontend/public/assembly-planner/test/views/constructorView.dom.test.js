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

function setInput(container, selector, value) {
  const el = container.querySelector(selector);
  assert.ok(el, `no existe ${selector}`);
  el.value = value;
  return el;
}

// ── Flujos base ───────────────────────────────────────────────────

test('estado vacío: muestra formulario y empty-state de módulos/versiones', () => {
  const { view, container } = mountView();
  assert.ok(container.querySelector('[data-action="add-module"]'));
  assert.match(container.textContent, /Todavía no hay módulos/);
  assert.match(container.textContent, /No hay versiones guardadas/);
  view.destroy();
});

test('agregar módulo con zócalo: casco 6 piezas, base INTERNA apoyada sobre zócalo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');

  const piezas = store.get().pieces;
  assert.equal(piezas.filter((p) => p.modulo === '1').length, 6); // casco 5 + zocalo 1
  // Base interna (820x570): el renderer la apoya sobre el zócalo (z=150).
  const base = piezas.find((p) => p.id === 'm1-base');
  const tapa = piezas.find((p) => p.id === 'm1-tapa');
  assert.equal(base.ancho, tapa.ancho - 2 * base.espesor);
  assert.equal(base.alto, tapa.alto - 2 * base.espesor);
  assert.match(container.textContent, /Módulo 1/);
  view.destroy();
});

test('agregar cajón a un módulo con zócalo: dims derivadas de la tapa, no de la base interna', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');

  const select = container.querySelector('[data-module-scoped="1"] [data-alto-vano]');
  select.value = '280';
  click(container, '[data-action="add-content"][data-kind="drawer"]');

  const drawerPieces = store.get().pieces.filter((p) => p.modulo === '11');
  assert.equal(drawerPieces.length, 7);
  const frente = drawerPieces.find((p) => p.id.includes('-frente'));
  assert.equal(frente.alto, 277); // 280 - 3
  // Si se hubiera derivado ancho de la base interna (820), el frente sería 816.
  assert.equal(frente.ancho, 818); // W(850-2*15=820) - 2
  view.destroy();
});

test('agregar N módulos: cantidad 3 crea M1, M2 y M3', () => {
  const { store, view, container } = mountView();
  setInput(container, '[data-cfg="cantidad"]', '3');
  click(container, '[data-action="add-module"]');
  assert.equal(store.get().pieces.filter((p) => p.modulo === '3').length, 6);
  assert.match(container.textContent, /Módulo 3/);
  view.destroy();
});

test('altura de zócalo configurable se refleja en la pieza', () => {
  const { store, view, container } = mountView();
  setInput(container, '[data-cfg="altura-zocalo"]', '100');
  click(container, '[data-action="add-module"]');
  const zocalo = store.get().pieces.find((p) => p.id === 'm1-zocalo');
  assert.equal(zocalo.alto, 100);
  view.destroy();
});

test('duplicar módulo copia casco y contenido con id nuevo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const antes = store.get().pieces.length;

  click(container, '[data-action="duplicate-module"]');
  const pieces = store.get().pieces;
  assert.equal(pieces.length, antes * 2);
  assert.ok(pieces.some((p) => p.modulo === '2'), 'existe M2');
  assert.ok(pieces.some((p) => p.modulo === '21'), 'existe submódulo 21 (cajón copiado)');
  assert.ok(!pieces.some((p) => p.modulo === '11' && p.id.startsWith('m2')), 'ids renombrados');
  view.destroy();
});

test('recolorear módulo aplica color al casco', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  setInput(container, '[data-module-scoped="1"] [data-color-cuerpo]', '#123456');
  click(container, '[data-action="recolor-module"]');
  const base = store.get().pieces.find((p) => p.id === 'm1-base');
  assert.equal(base.color, '#123456');
  view.destroy();
});

test('nuevo mueble con doble confirmación vacía las piezas', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  assert.ok(store.get().pieces.length > 0);

  click(container, '[data-action="clear-all"]');
  assert.ok(store.get().pieces.length > 0, 'primer click solo arme');
  const btn = container.querySelector('[data-action="clear-all"]');
  btn.dataset.confirm = '1';
  btn.click();
  assert.equal(store.get().pieces.length, 0);
  view.destroy();
});

test('doble barra crea 2 barras ancladas con pos_z', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="doubleRail"]');
  const barras = store.get().pieces.filter((p) => String(p.id).includes('barra'));
  assert.equal(barras.length, 2);
  assert.deepEqual(barras.map((b) => b.pos_z).sort(), [1000, 2100]);
  view.destroy();
});

test('cajón volquete: sin pieza de cara', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const sel = container.querySelector('[data-module-scoped="1"] [data-tipo-cajon]');
  sel.value = 'volquete';
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const cajon = store.get().pieces.filter((p) => p.modulo === '11');
  assert.ok(!cajon.some((p) => p.id.includes('-cara')));
  view.destroy();
});

// ── Versiones ─────────────────────────────────────────────────────

test('guardar y cargar versión: round-trip de piezas y lista actualizada', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const antes = store.get().pieces.length;

  container.querySelector('[data-version-name]').value = 'Closet v1';
  click(container, '[data-action="save-version"]');

  assert.equal(countVersions(), 1);
  assert.match(container.textContent, /Closet v1/);

  store.set({ pieces: [] });
  click(container, '[data-action="load-version"]');
  assert.equal(store.get().pieces.length, antes);
  view.destroy();
});

test('Enter en el input guarda la versión', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const input = container.querySelector('[data-version-name]');
  input.value = 'Versión Enter';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(countVersions(), 1);
  assert.match(container.textContent, /Versión Enter/);
  view.destroy();
});

test('renombrar y duplicar versión', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');
  container.querySelector('[data-version-name]').value = 'Original';
  click(container, '[data-action="save-version"]');

  // Renombrar: primer click muestra el input, segundo (con valor) aplica.
  click(container, '[data-action="rename-version"]');
  const input = container.querySelector('[data-rename-input]');
  assert.ok(!input.classList.contains('is-hidden'), 'input visible tras primer click');
  input.value = 'Renombrada';
  click(container, '[data-action="rename-version"]');
  assert.match(container.textContent, /Renombrada/);

  // Duplicar.
  click(container, '[data-action="duplicate-version"]');
  assert.equal(countVersions(), 2);
  assert.match(container.textContent, /Renombrada copia/);
  view.destroy();
});

test('eliminar una versión y eliminar todas (con confirmación)', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');

  container.querySelector('[data-version-name]').value = 'A';
  click(container, '[data-action="save-version"]');
  assert.equal(countVersions(), 1);

  click(container, '[data-action="delete-version"]');
  const btn = container.querySelector('[data-action="delete-version"]');
  btn.dataset.confirm = '1';
  btn.click();
  assert.equal(countVersions(), 0);

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

test('badge "sin guardar" aparece tras modificar y desaparece al guardar', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');

  container.querySelector('[data-version-name]').value = 'Base';
  click(container, '[data-action="save-version"]');
  assert.equal(container.querySelector('[title*="sin guardar"]'), null, 'limpio tras guardar');

  // Mutar piezas de verdad (cambiar una dimension) dispara state:changed y
  // altera el hash → badge. Una copia superficial con igual contenido daria
  // el mismo CSV y no marcaria dirty.
  const mutadas = store.get().pieces.map((p, i) => (i === 0 ? { ...p, ancho: p.ancho + 10 } : p));
  store.set({ pieces: mutadas });
  assert.ok(container.querySelector('[title*="sin guardar"]'), 'badge visible tras cambio');

  container.querySelector('[data-version-name]').value = 'Base 2';
  click(container, '[data-action="save-version"]');
  assert.equal(container.querySelector('[title*="sin guardar"]'), null, 'limpio tras guardar de nuevo');
  view.destroy();
});

// ── Integración ───────────────────────────────────────────────────

test('botón "Ver isométrica" cambia de vista', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="goto-view"][data-view="isometric"]');
  assert.equal(store.get().currentView, 'isometric');
  view.destroy();
});

test('resumen del mueble en cabecera', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');
  assert.match(container.querySelector('[data-resumen]').textContent, /1 módulo\(s\) · \d+ piezas · ≈850 mm ancho/);
  view.destroy();
});
