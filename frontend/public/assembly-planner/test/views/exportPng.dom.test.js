// test/views/exportPng.dom.test.js — Export PNG de la vista 3D (P5b):
//   - El botón '⬇ PNG' existe en la toolbar de la vista 3D.
//   - El click serializa el SVG actual y degrada con toast (nunca crashea):
//     con un Image que falla, onerror dispara el toast de error.
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createStore } from '../../js/core/store.js';
import { parseCSV } from '../../js/services/csvParser.js';
import { createRenderer3DView } from '../../js/views/renderer3DView.js';
import { createContainer, resetDocument } from './setup.mjs';

function loadExamplePieces() {
  const url = new URL('../../data/ejemplo-estanteria.csv', import.meta.url);
  const result = parseCSV(readFileSync(url, 'utf8'));
  assert.ok(result.ok);
  return result.pieces;
}

function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(resetDocument);
afterEach(() => {
  resetDocument();
  delete globalThis.Image;
});

test("la vista 3D monta con el botón '⬇ PNG' en la toolbar", async () => {
  const store = createStore({ pieces: loadExamplePieces() });
  const view = createRenderer3DView(store);
  const container = createContainer();
  view.mount(container);
  await nextFrame();

  const btn = container.querySelector('#r3d-export-png');
  assert.ok(btn, 'existe el botón de export PNG');
  assert.match(btn.textContent, /PNG/);

  view.destroy();
});

test('el click no lanza y con un Image que falla degrada con toast de error', async () => {
  const store = createStore({ pieces: loadExamplePieces() });
  const view = createRenderer3DView(store);
  const container = createContainer();
  view.mount(container);
  await nextFrame();
  assert.ok(container.querySelector('#r3d-canvas svg'), 'hay SVG en el lienzo');

  // Mock de Image que siempre falla: happy-dom no rasteriza SVG → el handler
  // debe caer al onerror con toast, sin excepción.
  let errores = 0;
  globalThis.Image = class FakeImage {
    set src(_v) {
      setTimeout(() => {
        errores += 1;
        this.onerror?.(new Error('carga fallida'));
      }, 0);
    }
  };

  const btn = container.querySelector('#r3d-export-png');
  assert.doesNotThrow(() => btn.click());
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(errores, 1, 'se intentó cargar el SVG rasterizado');
  const toast = document.querySelector('#toast-container');
  assert.ok(toast && /PNG|SVG/i.test(toast.textContent), `toast de degradación visible: ${toast?.textContent}`);

  view.destroy();
});
