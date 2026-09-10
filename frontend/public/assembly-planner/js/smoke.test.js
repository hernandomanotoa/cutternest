// js/smoke.test.js — Smoke test de carga del Assembly Planner.
//
// Regresión real (2026-09-10): un patch con un `}` desplazado en
// js/views/isometricView.js rompió el grafo de módulos y toda la app dejó
// de cargar (seleccionar mueble / cargar ejemplo no hacía nada), sin que
// node --test lo detectara porque ningún test importaba las vistas.
// Este test cierra esa brecha: importa TODOS los módulos (con un stub
// mínimo de DOM que difiere init de app.js) y simula el flujo
// seleccionar → cargar → render isométrico.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Stub mínimo de DOM: app.js ejecuta init() al final del módulo cuando
// document.readyState !== 'loading'. Con 'loading', init queda diferida
// a DOMContentLoaded y la importación valida el grafo completo sin navegador.
globalThis.document = {
  readyState: 'loading',
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = globalThis;
globalThis.localStorage = {
  _data: new Map(),
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
  setItem(k, v) { this._data.set(k, String(v)); },
  removeItem(k) { this._data.delete(k); },
};

const JS_DIR = fileURLToPath(new URL('.', import.meta.url));

function collectModules(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectModules(full));
    } else if (entry.endsWith('.js') && !entry.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

test('todos los módulos importan sin excepción (grafo completo)', async () => {
  const modules = collectModules(JS_DIR);
  assert.ok(modules.length >= 30, `se esperaban 30+ módulos, hay ${modules.length}`);
  for (const m of modules) {
    await import(pathToFileURL(m).href);
  }
});

test('flujo seleccionar → cargar → render isométrico', async () => {
  const { parseCSV } = await import('./csvParser.js');
  const { sugerirDependencias } = await import('./heuristics.js');
  const { createStore } = await import('./core/store.js');
  const { IsometricRenderer } = await import('./isometricRenderer.js');

  const csvText = readFileSync(join(JS_DIR, '..', 'data', 'ejemplo-basico.csv'), 'utf8');
  const result = parseCSV(csvText);
  assert.equal(result.errors.length, 0, `errores de parseo: ${result.errors.join('; ')}`);
  assert.ok(result.pieces.length > 0, 'el ejemplo básico no tiene piezas');

  const dependencies = sugerirDependencias(result.pieces);
  const store = createStore();
  store.set({ pieces: result.pieces, dependencies, currentModule: '1' });
  assert.equal(store.get().pieces.length, result.pieces.length);
  assert.equal(store.get().currentModule, '1');

  const container = {
    _innerHTML: '',
    set innerHTML(v) { this._innerHTML = v; },
    get innerHTML() { return this._innerHTML; },
  };
  const renderer = new IsometricRenderer(container, {
    scale: 0.06,
    padding: 80,
    showDimensions: false,
    labelMode: 'none',
  });
  renderer.render('1', result.pieces, dependencies);
  assert.match(container.innerHTML, /<svg[^>]*viewBox="/, 'el SVG no tiene viewBox');
  assert.match(container.innerHTML, /<polygon /, 'el SVG no tiene piezas renderizadas');
});
