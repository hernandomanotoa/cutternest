// test/constructor.smoke.dom.test.js — Test de humo E2E del Constructor
// (happy-dom): arma un mueble de 2 modulos con contenido, guarda/carga/
// elimina versiones locales y valida que las piezas re-parsean limpias.
// NO corre en el runner puro: usar pnpm test:dom.

import './views/setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore } from '../js/core/store.js';
import {
  addModuleFromBuilder,
  addContentToModule,
  saveCurrentVersion,
  loadVersionById,
  deleteVersionById,
  deleteAllVersionsAction,
} from '../js/app.js';
import { parseCSV, piecesToCSV } from '../js/services/csvParser.js';
import { listVersions, countVersions } from '../js/services/projectVersionsService.js';

beforeEach(() => {
  setStore(createStore());
  deleteAllVersionsAction();
  for (const id of ['summary-module', 'summary-pieces', 'summary-steps', 'summary-alerts', 'summary-graph', 'hardware-list', 'module-selector', 'status-message']) {
    if (!document.getElementById(id)) {
      const d = document.createElement('div');
      d.id = id;
      document.body.appendChild(d);
    }
  }
});
afterEach(() => {
  deleteAllVersionsAction();
});

test('smoke E2E: mueble 2 modulos + contenido + versiones round-trip', async () => {
  const store = createStore();
  setStore(store);

  // 1. Armar: 2 modulos (colgador + cajonera) con zocalo y contenido variado.
  const r1 = addModuleFromBuilder({ ancho: 850, alto: 2400, prof: 600, espesor: 15, colorCuerpo: '#C19A6B', conZocalo: true, alturaZocalo: 150 });
  const r2 = addModuleFromBuilder({ ancho: 850, alto: 2400, prof: 600, espesor: 15, colorCuerpo: '#8B5A2B', conZocalo: true, alturaZocalo: 150 });
  assert.ok(r1.ok && r2.ok);
  assert.equal(store.get().currentModule, 'all', 'vista completa por defecto');
  assert.ok(addContentToModule('1', 'rail', {}).ok);
  assert.ok(addContentToModule('1', 'shelf', {}).ok);
  assert.ok(addContentToModule('2', 'drawer', { altoVano: 200 }).ok);
  assert.ok(addContentToModule('2', 'shoeRack', { altoVano: 180 }).ok);

  const pieces = store.get().pieces;
  assert.ok(pieces.length > 25, `mueble sustancioso (${pieces.length} piezas)`);
  assert.ok(store.get().dependencies.length > 10, 'dependencias derivadas');

  // 2. Las piezas re-parsean sin errores (coherencia builder<->parser).
  const reparse = parseCSV(piecesToCSV(pieces));
  assert.equal(reparse.ok, true, reparse.errors?.join('; '));

  // 3. Versiones: guardar, vaciar, cargar (round-trip exacto), eliminar.
  const antes = piecesToCSV(pieces);
  const saved = saveCurrentVersion('Smoke E2E');
  assert.ok(saved.ok, saved.error);
  assert.equal(countVersions(), 1);
  assert.equal(listVersions()[0].name, 'Smoke E2E');

  store.set({ pieces: [], dependencies: [] });
  const loaded = loadVersionById(saved.version.id);
  assert.ok(loaded.ok, loaded.error);
  assert.equal(piecesToCSV(store.get().pieces), antes, 'round-trip exacto');

  deleteVersionById(saved.version.id);
  assert.equal(countVersions(), 0);
});
