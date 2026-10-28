// test/views/golaTour.dom.test.js — Tests DOM del tour guiado del sistema
// gola (happy-dom): driver (tooltip posicionado, highlight, Siguiente,
// Escape y "visto" en localStorage) e integración con la vista Constructor
// (botón "Tour gola" y auto-inicio una sola vez).
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore } from '../../js/core/store.js';
import { createContainer, resetDocument } from './setup.mjs';
import {
  createTour,
  hasSeenTour,
  markTourSeen,
  resetTourSeen,
} from '../../js/components/tour/driver.js';
import { GOLA_TOUR_STEPS } from '../../js/data/golaTour.js';
import { createConstructorView } from '../../js/views/constructorView.js';

beforeEach(() => {
  resetDocument();
  setStore(createStore());
  resetTourSeen();
});
afterEach(resetDocument);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('golaTour: exporta exactamente los selectores verificados del Constructor', () => {
  assert.deepEqual(
    GOLA_TOUR_STEPS.map((s) => s.selector),
    [
      '[data-action="add-content"][data-kind="drawer"]',
      '[data-action="toggle-gola"]',
      '[data-gola-panel]',
      '[data-gola-preview]',
      '[data-action="confirm-gola"]',
    ],
  );
  for (const step of GOLA_TOUR_STEPS) {
    assert.ok(step.title && step.text, `paso ${step.selector} con title/text`);
    assert.ok(['top', 'bottom', 'left', 'right'].includes(step.position), `posición válida en ${step.selector}`);
  }
});

test('driver: tooltip anclado, highlight, Siguiente y Escape marcan el tour como visto', () => {
  const host = createContainer();
  host.innerHTML = '<button id="objetivo-a">A</button><button id="objetivo-b">B</button>';
  const tour = createTour([
    { selector: '#objetivo-a', title: 'Paso A', text: 'Texto del paso A', position: 'top' },
    { selector: '#objetivo-b', title: 'Paso B', text: 'Texto del paso B', position: 'bottom' },
  ]);
  assert.equal(hasSeenTour(), false);

  tour.start();
  assert.ok(tour.isActive());
  const tip = document.querySelector('.cn-tour__tooltip');
  assert.ok(tip, 'renderiza el tooltip');
  assert.match(tip.textContent, /Paso 1 de 2/);
  assert.match(tip.textContent, /Paso A/);
  assert.match(tip.textContent, /Siguiente/);
  assert.ok(host.querySelector('#objetivo-a').classList.contains('cn-tour__highlight'), 'resalta el objetivo');
  assert.equal(host.querySelector('#objetivo-b').classList.contains('cn-tour__highlight'), false);

  tip.querySelector('[data-tour-next]').click();
  assert.match(tip.textContent, /Paso 2 de 2/);
  assert.match(tip.querySelector('[data-tour-next]').textContent, /Finalizar/);
  assert.ok(host.querySelector('#objetivo-b').classList.contains('cn-tour__highlight'));
  assert.equal(host.querySelector('#objetivo-a').classList.contains('cn-tour__highlight'), false);

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(tour.isActive(), false, 'Escape cierra el tour');
  assert.equal(document.querySelector('.cn-tour__tooltip'), null, 'remueve el tooltip');
  assert.equal(host.querySelector('.cn-tour__highlight'), null, 'limpia el highlight');
  assert.equal(hasSeenTour(), true, 'persiste el tour como visto');
});

test('driver: Finalizar en el último paso termina y marca como visto', () => {
  const host = createContainer();
  host.innerHTML = '<button id="unico">U</button>';
  let finished = 0;
  const tour = createTour(
    [{ selector: '#unico', title: 'Único', text: 'Solo paso', position: 'left' }],
    { onFinish: () => { finished += 1; } },
  );
  tour.start();
  document.querySelector('.cn-tour__tooltip [data-tour-next]').click();
  assert.equal(tour.isActive(), false);
  assert.equal(finished, 1);
  assert.equal(hasSeenTour(), true);
  assert.equal(document.querySelector('.cn-tour__tooltip'), null);
});

test('driver: espera al objetivo y se ancla cuando aparece', async () => {
  const host = createContainer();
  const tour = createTour(
    [{ selector: '#aparece-luego', title: 'Aparece', text: 'Se crea después', position: 'bottom' }],
    { waitTimeoutMs: 2000, pollIntervalMs: 25 },
  );
  tour.start();
  let tip = document.querySelector('.cn-tour__tooltip');
  assert.ok(tip.classList.contains('cn-tour__tooltip--waiting'), 'modo espera sin objetivo');
  await sleep(80);
  const btn = document.createElement('button');
  btn.id = 'aparece-luego';
  host.appendChild(btn);
  await sleep(120);
  tip = document.querySelector('.cn-tour__tooltip');
  assert.equal(tip.classList.contains('cn-tour__tooltip--waiting'), false, 'sale del modo espera');
  assert.ok(btn.classList.contains('cn-tour__highlight'), 'se ancla al objetivo aparecido');
  tour.stop('destroyed');
  assert.equal(hasSeenTour(), false, "'destroyed' no marca el tour como visto");
});

test('driver: salta el paso cuyo objetivo no aparece dentro del timeout', async () => {
  const host = createContainer();
  host.innerHTML = '<button id="existe">X</button>';
  const tour = createTour([
    { selector: '#nunca-existira', title: 'Ausente', text: 'No hay objetivo', position: 'top' },
    { selector: '#existe', title: 'Presente', text: 'Sí hay objetivo', position: 'bottom' },
  ], { waitTimeoutMs: 150, pollIntervalMs: 25 });
  tour.start();
  await sleep(400);
  const tip = document.querySelector('.cn-tour__tooltip');
  assert.match(tip.textContent, /Paso 2 de 2/, 'saltó al paso con objetivo');
  assert.ok(host.querySelector('#existe').classList.contains('cn-tour__highlight'));
  tour.stop('destroyed');
});

test('constructor: con store vacío ofrece el botón "Tour gola" junto al encabezado y auto-inicia una vez', async () => {
  const store = createStore();
  setStore(store);
  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);

  const btn = container.querySelector('[data-action="start-tour"]');
  assert.ok(btn, 'botón Tour gola junto al encabezado del constructor');
  assert.match(btn.textContent, /Tour gola/);

  await sleep(1000); // auto-inicio a los 800 ms
  const tip = document.querySelector('.cn-tour__tooltip');
  assert.ok(tip, 'el tour arranca solo la primera vez');

  view.destroy();
  assert.equal(document.querySelector('.cn-tour__tooltip'), null, 'destroy limpia el tour');
  assert.equal(hasSeenTour(), false, 'cambiar de vista no marca el tour como visto');
});

test('constructor: con el tour ya visto no muestra botón ni auto-inicia', async () => {
  markTourSeen();
  const store = createStore();
  setStore(store);
  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);

  assert.equal(container.querySelector('[data-action="start-tour"]'), null, 'sin botón');
  await sleep(1000);
  assert.equal(document.querySelector('.cn-tour__tooltip'), null, 'sin auto-inicio');
  view.destroy();
});

test('constructor: el botón "Tour gola" inicia el tour y el re-render lo mantiene anclado', () => {
  const store = createStore();
  setStore(store);
  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);

  container.querySelector('[data-action="start-tour"]').click();
  let tip = document.querySelector('.cn-tour__tooltip');
  assert.ok(tip, 'el botón inicia el tour');

  // Re-render de la vista (cualquier cambio de estado): el tooltip sigue vivo
  // y el paso actual se re-ancla si su objetivo existe.
  store.set({ warnings: [] });
  tip = document.querySelector('.cn-tour__tooltip');
  assert.ok(tip, 'el tooltip sobrevive al re-render de la vista');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('.cn-tour__tooltip'), null);
  view.destroy();
});
