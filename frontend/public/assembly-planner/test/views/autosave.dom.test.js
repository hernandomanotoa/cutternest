// test/views/autosave.dom.test.js — Tests DOM del autoguardado del mueble en
// construcción (happy-dom): debounce de la suscripción, banner "Recuperar
// último mueble" en la vista Constructor y restauración que limpia la clave
// sin pisar la pila de deshacer.
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore } from '../../js/core/store.js';
import { createContainer, resetDocument } from './setup.mjs';
import {
  addModuleFromBuilder,
  initAutosave,
  hasAutosave,
  restoreAutosave,
  discardAutosave,
  undoLast,
} from '../../js/app.js';
import { readAutosave, saveAutosave } from '../../js/services/projectVersionsService.js';
import { createModule } from '../../js/services/closetBuilderService.js';
import { createConstructorView } from '../../js/views/constructorView.js';

beforeEach(() => {
  resetDocument();
  setStore(createStore());
});
afterEach(resetDocument);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function piezasDePrueba() {
  const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
  return casco.pieces;
}

test('autosave: persiste las piezas con debounce tras un cambio del store', async () => {
  initAutosave({ debounceMs: 100 });
  assert.equal(hasAutosave(), false);

  const r = addModuleFromBuilder({
    ancho: 850, alto: 2400, prof: 600, conZocalo: true, alturaZocalo: 150,
  });
  assert.ok(r.ok, r.errors?.join('; '));
  assert.equal(hasAutosave(), false, 'todavía no escribió (debounce)');
  await sleep(250);
  assert.equal(hasAutosave(), true, 'escribió tras el debounce');

  const auto = readAutosave();
  assert.ok(auto.ok, auto.error);
  assert.ok(auto.pieces.length > 0);
  assert.ok(auto.savedAt, 'guarda la marca de tiempo');
});

test('recuperación: restaura las piezas, limpia la clave y respeta el undo', () => {
  const store = createStore();
  setStore(store);
  const pieces = piezasDePrueba();
  const saved = saveAutosave(pieces);
  assert.ok(saved.ok, saved.error);
  assert.equal(hasAutosave(), true);

  const r = restoreAutosave();
  assert.ok(r.ok, r.error);
  assert.equal(store.get().pieces.length, pieces.length, 'piezas restauradas');
  assert.equal(hasAutosave(), false, 'la clave se limpia al recuperar');

  // La recuperación hace SU snapshot: deshacer vuelve al mueble vacío sin
  // haber pisado snapshots previos de la pila.
  const undo = undoLast();
  assert.ok(undo.ok, undo.error);
  assert.equal(store.get().pieces.length, 0, 'deshacer revierte la recuperación');

  // El autoguardado no se re-escribe de inmediato tras recuperar.
  store.set({ warnings: [] });
  assert.equal(hasAutosave(), false, 'recuperar no re-crea la clave');
});

test('recuperación: con clave ausente o corrupta devuelve error', () => {
  assert.equal(restoreAutosave().ok, false);
  localStorage.setItem('cn-assembly-autosave', '{corrupto');
  const r = restoreAutosave();
  assert.equal(r.ok, false);
  discardAutosave();
});

test('constructor: con store vacío y autoguardado, ofrece "Recuperar último mueble"', () => {
  const store = createStore();
  setStore(store);
  saveAutosave(piezasDePrueba());

  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);

  const banner = container.querySelector('.cn-autosave-banner');
  assert.ok(banner, 'banner de recuperación visible');
  assert.match(banner.textContent, /Recuperar último mueble/);
  assert.equal(container.textContent.includes('Descartar'), true);

  container.querySelector('[data-action="restore-autosave"]').click();
  assert.ok(store.get().pieces.length > 0, 'piezas restauradas');
  assert.equal(hasAutosave(), false, 'clave limpia tras recuperar');
  assert.equal(container.querySelector('.cn-autosave-banner'), null, 'el banner desaparece');
  view.destroy();
});

test('constructor: descartar oculta el banner, limpia la clave y deja el store vacío', () => {
  const store = createStore();
  setStore(store);
  saveAutosave(piezasDePrueba());

  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);

  container.querySelector('[data-action="discard-autosave"]').click();
  assert.equal(hasAutosave(), false, 'clave limpia al descartar');
  assert.equal(store.get().pieces.length, 0, 'sin piezas');
  assert.equal(container.querySelector('.cn-autosave-banner'), null, 'banner oculto');
  view.destroy();
});

test('constructor: con piezas en el store no muestra el banner aunque haya clave', () => {
  const store = createStore();
  setStore(store);
  const r = addModuleFromBuilder({ ancho: 850, alto: 2400, prof: 600 });
  assert.ok(r.ok);
  saveAutosave(piezasDePrueba()); // clave de otra sesión: no debe ofrecer nada

  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);
  assert.equal(container.querySelector('.cn-autosave-banner'), null);
  view.destroy();
});
