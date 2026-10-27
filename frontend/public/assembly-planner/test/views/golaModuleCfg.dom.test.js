// test/views/golaModuleCfg.dom.test.js — Tests DOM (happy-dom) de la CONFIG
// GOLA POR MÓDULO:
//   - El mini-panel de la tarjeta edita overrides del módulo (cn-assembly-gola-cfg),
//     NO la userConfig global: al cambiar golaPerfilHeight se re-aplica SOLO ese
//     módulo (la tira cambia de alto) y el otro módulo sigue con la config global.
//   - Los overrides persisten al guardar/cargar versión local (rehidratación
//     del mapa cn-assembly-gola-cfg con merge).
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import {
  addModuleFromBuilder,
  addContentToModule,
  saveCurrentVersion,
  loadVersionById,
  loadGolaModuleCfgs,
  setGolaModuleConfig,
} from '../../js/app.js';
import { createConstructorView } from '../../js/views/constructorView.js';
import { createContainer, resetDocument } from './setup.mjs';

const GOLA_MODULE_CFG_KEY = 'cn-assembly-gola-cfg';

beforeEach(() => {
  resetDocument();
  setStore(createStore());
  localStorage.clear();
  // Chrome mínimo para recalculateAll/updateSummary (enableGola lo llama).
  for (const id of ['summary-module', 'summary-pieces', 'summary-steps', 'summary-alerts', 'summary-graph', 'hardware-list', 'module-selector', 'status-message']) {
    const d = document.createElement('div');
    d.id = id;
    document.body.appendChild(d);
  }
});
afterEach(resetDocument);

const MOD = { ancho: 850, alto: 2400, prof: 600, espesor: 15, colorCuerpo: '#C19A6B', conZocalo: true, alturaZocalo: 150 };

function armarDosModulosConCajones() {
  for (let m = 1; m <= 2; m++) {
    assert.ok(addModuleFromBuilder(MOD).ok, `módulo ${m} creado`);
    for (let i = 0; i < 2; i++) {
      assert.ok(addContentToModule(String(m), 'drawer', { altoVano: 250 }).ok);
    }
  }
}

function mountView() {
  const store = getStore();
  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);
  return { store, view, container };
}

// Activa el gola del módulo idx (1-based) vía checkbox → confirmar vista previa.
// OJO: el click re-renderiza la tarjeta (nuevo nodo DOM); hay que re-consultar.
function activarGola(container, idx) {
  const checkbox = container.querySelector(`[data-module-scoped="${idx}"] [data-action="toggle-gola"]`);
  assert.ok(checkbox, `checkbox gola del módulo ${idx}`);
  checkbox.click();
  const confirmBtn = container.querySelector(`[data-module-scoped="${idx}"] [data-action="confirm-gola"]`);
  assert.ok(confirmBtn, `botón confirmar del módulo ${idx}`);
  confirmBtn.click();
}

const tira = (pieces, modId) => pieces.find((p) => p.id === `m${modId}-gola-1`);
const cfgInput = (container, modId, key) =>
  container.querySelector(`[data-module-scoped="${modId}"] [data-gola-cfg="${key}"]`);

function cambiarInput(input, value) {
  input.value = String(value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

test('panel de la tarjeta: cambiar golaPerfilHeight re-aplica SOLO ese módulo y no escribe la config global', () => {
  const { view, container } = mountView();
  armarDosModulosConCajones();
  activarGola(container, 1);
  activarGola(container, 2);

  let pieces = getStore().get().pieces;
  assert.equal(tira(pieces, 1).alto, 30, 'tira m1 con alto default (global)');
  assert.equal(tira(pieces, 2).alto, 30, 'tira m2 con alto default (global)');

  // El input muestra la config efectiva del módulo (global sin overrides).
  const input = cfgInput(container, 1, 'golaPerfilHeight');
  assert.ok(input, 'input golaPerfilHeight en la tarjeta del módulo 1');
  assert.equal(input.value, '30');

  cambiarInput(input, 40);

  pieces = getStore().get().pieces;
  assert.equal(tira(pieces, 1).alto, 40, 'tira m1 re-aplicada con el override del módulo');
  assert.equal(tira(pieces, 2).alto, 30, 'm2 sin overrides sigue con la config global');
  // El panel re-renderiza con el valor nuevo tras la re-aplicación.
  assert.equal(cfgInput(container, 1, 'golaPerfilHeight').value, '40');
  assert.equal(cfgInput(container, 2, 'golaPerfilHeight').value, '30');
  // La config global queda intacta (el panel ya no escribe userConfig).
  const rawGlobal = localStorage.getItem('cn-assembly-config');
  assert.ok(!rawGlobal || !rawGlobal.includes('golaPerfilHeight'), 'userConfig global sin golaPerfilHeight');
  view.destroy();
});

test('overrides del módulo persisten al guardar/cargar versión local (merge del mapa)', () => {
  const { view, container } = mountView();
  armarDosModulosConCajones();
  activarGola(container, 1);
  activarGola(container, 2);
  cambiarInput(cfgInput(container, 1, 'golaPerfilHeight'), 40);

  const saved = saveCurrentVersion('Con cfg gola');
  assert.ok(saved.ok, saved.error);
  assert.deepEqual(loadGolaModuleCfgs(), { 1: { golaPerfilHeight: 40 } }, 'mapa persistido antes de guardar');

  // Simula otra sesión: se pierde el mapa en vivo, la versión lo rehidrata.
  localStorage.removeItem(GOLA_MODULE_CFG_KEY);
  assert.deepEqual(loadGolaModuleCfgs(), {}, 'mapa vacío tras limpiar la key');

  const loaded = loadVersionById(saved.version.id);
  assert.ok(loaded.ok, loaded.error);
  const mapa = loadGolaModuleCfgs();
  assert.equal(mapa[1].golaPerfilHeight, 40, 'override del módulo 1 rehidratado');
  assert.ok(!Object.prototype.hasOwnProperty.call(mapa, '2'), 'm2 sigue sin overrides (merge, no borra nada)');

  // La pieza cargada conserva la tira re-aplicada con el override.
  const pieces = getStore().get().pieces;
  assert.equal(tira(pieces, 1).alto, 40, 'tira m1 con el alto del override tras cargar');
  view.destroy();
});

test('módulo sin gola activo: el override persiste y se aplica al activar después', () => {
  const { view, container } = mountView();
  armarDosModulosConCajones();

  // Override directo vía acción (sin gola activo: solo persiste, sin undo).
  const r = setGolaModuleConfig('1', { golaPerfilHeight: 45 });
  assert.ok(r.ok);

  activarGola(container, 1);
  const pieces = getStore().get().pieces;
  assert.equal(tira(pieces, 1).alto, 45, 'al activar se usa el override persistido');
  assert.equal(cfgInput(container, 1, 'golaPerfilHeight').value, '45');
  view.destroy();
});
