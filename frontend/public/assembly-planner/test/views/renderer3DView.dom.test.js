// test/views/renderer3DView.dom.test.js — Tests DOM de la vista 3D orbital (happy-dom).
// NO corre en el runner puro: el patrón js/**/*.test.js no alcanza test/views.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createStore } from '../../js/core/store.js';
import { parseCSV } from '../../js/services/csvParser.js';
import { isGlobalPiece } from '../../js/services/moduleService.js';
import { createRenderer3DView } from '../../js/views/renderer3DView.js';
import { createContainer, resetDocument } from './setup.mjs';

// Piezas reales del CSV de ejemplo (todas modulo=estructura → módulo 'global').
function loadExamplePieces() {
  const url = new URL('../../data/ejemplo-estanteria.csv', import.meta.url);
  const result = parseCSV(readFileSync(url, 'utf8'));
  assert.ok(result.ok, `parseCSV del ejemplo falló: ${result.error || ''}`);
  assert.ok(result.pieces.length > 0, 'el CSV de ejemplo tiene piezas');
  return result.pieces;
}

// El primer frame se pinta vía requestAnimationFrame (shim de setup.mjs).
function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(resetDocument);
afterEach(resetDocument);

test('mount con estado vacío muestra el selector de módulos', () => {
  const store = createStore();
  const view = createRenderer3DView(store);
  const container = createContainer();

  view.mount(container);

  assert.equal(container.querySelector('#r3d-canvas'), null, 'sin canvas sin piezas');
  assert.ok(container.querySelector('#r3d-module-selector'), 'selector de módulos');
  assert.match(container.textContent, /Selecciona un módulo para ver la vista 3D/);

  view.destroy();
});

test('mount con piezas del CSV de ejemplo renderiza título, controles y BOM', () => {
  const pieces = loadExamplePieces();
  const store = createStore({ pieces });
  const view = createRenderer3DView(store);
  const container = createContainer();

  view.mount(container);

  assert.match(container.querySelector('.card__title').textContent, /Vista 3D/);
  assert.ok(container.querySelector('#r3d-canvas'), 'contenedor del canvas');
  assert.ok(container.querySelector('#r3d-reset'), 'botón Reset');
  assert.ok(container.querySelector('#r3d-step-mode'), 'botón Modo paso');
  const bomRows = container.querySelectorAll('#r3d-bom .r3d-bom__row');
  // currentModule='global' muestra solo las piezas globales (glb-*/estructura).
  const globalPieces = pieces.filter(isGlobalPiece);
  assert.ok(globalPieces.length > 0 && globalPieces.length < pieces.length, 'el ejemplo mezcla piezas globales y de módulo');
  assert.equal(bomRows.length, globalPieces.length, 'una fila de BOM por pieza del módulo activo');

  view.destroy();
});

test('el canvas recibe el SVG tras el primer frame del render loop', async () => {
  const pieces = loadExamplePieces();
  const store = createStore({ pieces });
  const view = createRenderer3DView(store);
  const container = createContainer();

  view.mount(container);
  await nextFrame();

  assert.ok(
    container.querySelector('#r3d-canvas svg'),
    'el canvas recibió el SVG del renderizador 3D'
  );

  view.destroy();
});

test('re-renderiza al cambiar las piezas del store', async () => {
  const pieces = loadExamplePieces();
  const store = createStore({ pieces });
  const view = createRenderer3DView(store);
  const container = createContainer();

  view.mount(container);
  await nextFrame();
  const globalPieces = pieces.filter(isGlobalPiece);
  assert.equal(container.querySelectorAll('#r3d-bom .r3d-bom__row').length, globalPieces.length);

  store.setField('pieces', []);
  assert.equal(container.querySelector('#r3d-canvas'), null, 'canvas eliminado');
  assert.equal(container.querySelector('#r3d-bom'), null, 'BOM eliminado');
  assert.ok(container.querySelector('#r3d-module-selector'), 'vuelve al selector de módulos');

  view.destroy();
});

test('destroy detiene el loop y desuscribe sin lanzar', async () => {
  const pieces = loadExamplePieces();
  const store = createStore({ pieces });
  const view = createRenderer3DView(store);
  const container = createContainer();

  view.mount(container);
  await nextFrame();

  assert.doesNotThrow(() => view.destroy());
  // destroy limpia el canvas del renderer (innerHTML del contenedor cambia);
  // la congelación a validar es la de las suscripciones al store.
  const htmlAfterDestroy = container.innerHTML;
  store.setField('pieces', []);
  await nextFrame();
  assert.equal(container.innerHTML, htmlAfterDestroy, 'el contenedor quedó congelado tras destroy');
});

test('color Cuerpo en la toolbar recolorea el mueble completo y persiste en las piezas', async () => {
  const { setStore, getStore } = await import('../../js/core/store.js');
  const { addModuleFromBuilder, addContentToModule } = await import('../../js/app.js');
  const { loadUserConfig } = await import('../../js/services/userConfigService.js');
  localStorage.clear();
  const store = createStore();
  setStore(store);
  for (const id of ['summary-module', 'summary-pieces', 'summary-steps', 'summary-alerts', 'summary-graph', 'hardware-list', 'module-selector', 'status-message']) {
    const d = document.createElement('div');
    d.id = id;
    document.body.appendChild(d);
  }
  assert.ok(addModuleFromBuilder({ ancho: 850, alto: 2400, prof: 600, espesor: 15, colorCuerpo: '#C19A6B', conZocalo: true, alturaZocalo: 150 }).ok);
  assert.ok(addContentToModule('1', 'drawer', { altoVano: 200 }).ok);

  const view = createRenderer3DView(store);
  const container = createContainer();
  view.mount(container);
  await nextFrame();

  const input = container.querySelector('#r3d-body-color');
  assert.ok(input, 'color input en la toolbar 3D');
  input.value = '#123456';
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  const pieces = getStore().get().pieces;
  const casco = pieces.find((p) => p.id === 'm1-tapa');
  const frente = pieces.find((p) => p.id.endsWith('-frente'));
  const lateralCaja = pieces.find((p) => p.id.endsWith('cajon1-lateral-izq')) || pieces.find((p) => /cajon.*lateral-izq/.test(p.id));
  assert.equal(casco.color, '#123456', 'casco recoloreado');
  assert.notEqual(frente.color, '#123456', 'el frente conserva su color de contraste');
  if (lateralCaja) assert.notEqual(lateralCaja.color, '#123456', 'la caja conserva su color');
  // Persistencia: las piezas son la fuente del CSV, y el color de cuerpo
  // queda como preferencia para módulos nuevos.
  assert.equal(loadUserConfig().colorCuerpo, '#123456');
  view.destroy();
});
