// test/views/golaPreview.dom.test.js — Tests DOM (happy-dom) del GRUPO C del
// sistema gola:
//   C2: el checkbox de la tarjeta del módulo muestra una VISTA PREVIA con
//       confirmación (dry-run de app.js/previewGola) antes de activar.
//       - Confirmar → enableGola (tiras creadas, tiradores eliminados).
//       - Cancelar → sin mutaciones (sin tiras, tiradores intactos, off).
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import {
  addModuleFromBuilder,
  addContentToModule,
  editModuleDimensions,
  previewGola,
} from '../../js/app.js';
import { isGolaEnabled } from '../../js/services/golaService.js';
import { createConstructorView } from '../../js/views/constructorView.js';
import { createContainer, resetDocument } from './setup.mjs';

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

function armarModuloCon3Cajones() {
  assert.ok(addModuleFromBuilder(MOD).ok);
  for (let i = 0; i < 3; i++) {
    assert.ok(addContentToModule('1', 'drawer', { altoVano: 250 }).ok);
  }
}

function mountView() {
  const store = getStore();
  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);
  return { store, view, container };
}

const tirasDe = (pieces) => pieces.filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id)));
const tiradoresDe = (pieces) => pieces.filter((p) => String(p.id).endsWith('-tirador'));

function clickGolaCheckbox(container) {
  const checkbox = container.querySelector('[data-action="toggle-gola"]');
  assert.ok(checkbox, 'existe el checkbox gola (módulo con ≥ 2 unidades)');
  checkbox.click();
  return checkbox;
}

test('C2: activar el checkbox muestra la vista previa con el plan (sin mutar el store)', () => {
  const { view, container } = mountView();
  armarModuloCon3Cajones();

  clickGolaCheckbox(container);

  const panel = container.querySelector('[data-gola-preview]');
  assert.ok(panel, 'se muestra el panel de vista previa');
  assert.match(panel.textContent, /Vista previa — sistema gola/);
  assert.match(panel.textContent, /Se crearán 2 canal\(es\) tipo C entre cajones/, 'anuncia los canales C entre cajones');
  assert.match(panel.textContent, /2 canal\(es\) tipo C/, 'N−1 canales C para 3 cajones');
  assert.match(panel.textContent, /Sobre el último frente queda el gap habitual \(sin canal L\)/, 'sin canal L sobre el último frente');
  assert.match(panel.textContent, /agarre de 20 mm/, 'muestra el agarre del cfg');
  assert.match(panel.textContent, /→ \d+ mm/, 'muestra las alturas nuevas de frentes');

  // UX: cada fila lleva el id del frente (desambigua homónimos) y los avisos
  // van agrupados en un único bloque con lista, no en párrafos sueltos.
  const idsPanel = [...panel.querySelectorAll('.cn-gola-preview__id')].map((c) => c.textContent);
  assert.equal(idsPanel.length, 3, 'un id por frente listado');
  assert.equal(new Set(idsPanel).size, 3, 'ids sin duplicados (desambiguación)');
  const avisos = panel.querySelector('.cn-gola-preview__warnings');
  if (avisos) {
    assert.ok(avisos.querySelector('ul'), 'avisos agrupados en lista');
    assert.equal(avisos.querySelectorAll('li').length, previewGola('1').warnings.length, 'un li por aviso');
  }
  assert.equal(panel.querySelectorAll('[class*="cn-constructor__warnings"]').length <= 1, true, 'un solo bloque de avisos');

  // El dry-run no tocó el store: sin tiras y sin tiradores (el Constructor
  // ya genera cajones sin tirador).
  const pieces = getStore().get().pieces;
  assert.equal(isGolaEnabled(pieces, '1'), false, 'gola sigue desactivada');
  assert.equal(tirasDe(pieces).length, 0, 'sin tiras creadas');
  assert.equal(tiradoresDe(pieces).length, 0, 'sin tiradores (apertura sin jaladera)');
  view.destroy();
});

test('C2: confirmar aplica el gola (tiras creadas, sin tiradores)', () => {
  const { view, container } = mountView();
  armarModuloCon3Cajones();

  clickGolaCheckbox(container);
  const confirmBtn = container.querySelector('[data-action="confirm-gola"]');
  assert.ok(confirmBtn, 'hay botón de confirmación');
  confirmBtn.click();

  const pieces = getStore().get().pieces;
  assert.equal(isGolaEnabled(pieces, '1'), true, 'gola activada');
  assert.equal(tirasDe(pieces).length, 2, 'N−1 tiras creadas');
  assert.equal(tiradoresDe(pieces).length, 0, 'sin tiradores');
  assert.ok(!container.querySelector('[data-gola-preview]'), 'el panel de vista previa se cierra');
  const checkbox = container.querySelector('[data-action="toggle-gola"]');
  assert.equal(checkbox.checked, true, 'checkbox queda activo tras confirmar');
  view.destroy();
});

test('C2: cancelar no muta (sin tiras, tiradores intactos, checkbox off)', () => {
  const { view, container } = mountView();
  armarModuloCon3Cajones();

  clickGolaCheckbox(container);
  const cancelBtn = container.querySelector('[data-action="cancel-gola"]');
  assert.ok(cancelBtn, 'hay botón de cancelación');
  cancelBtn.click();

  const pieces = getStore().get().pieces;
  assert.equal(isGolaEnabled(pieces, '1'), false, 'gola sigue desactivada');
  assert.equal(tirasDe(pieces).length, 0, 'sin tiras');
  assert.equal(tiradoresDe(pieces).length, 0, 'sin tiradores (apertura sin jaladera)');
  assert.ok(!container.querySelector('[data-gola-preview]'), 'el panel se cierra');
  const checkbox = container.querySelector('[data-action="toggle-gola"]');
  assert.equal(checkbox.checked, false, 'checkbox vuelve a off');
  view.destroy();
});

test('C2: previewGola (app.js) es un dry-run puro: devuelve plan y no muta el store', () => {
  armarModuloCon3Cajones();
  const piecesAntes = getStore().get().pieces;
  const frentesAntes = piecesAntes.filter((p) => String(p.id).endsWith('-frente')).map((p) => `${p.id}:${p.alto}`);

  const pv = previewGola('1');
  assert.ok(pv.ok, pv.errors?.join('; '));
  assert.equal(pv.plan.unidades, 3);
  assert.equal(pv.plan.tiras, 2);
  assert.equal(pv.plan.agarre, 20);
  assert.equal(pv.plan.gapGola, 56); // 3 + 50 + 3
  assert.equal(pv.plan.frentes.length, 3);
  for (const f of pv.plan.frentes) {
    assert.equal(typeof f.antes, 'number');
    assert.equal(typeof f.despues, 'number');
    assert.ok(f.despues > 0);
    assert.ok(String(f.id).endsWith('-frente'), 'cada frente expone su id (desambiguación)');
  }

  const piecesDespues = getStore().get().pieces;
  assert.equal(piecesDespues, piecesAntes, 'el array de piezas del store es el MISMO (sin mutar)');
  const frentesDespues = piecesDespues.filter((p) => String(p.id).endsWith('-frente')).map((p) => `${p.id}:${p.alto}`);
  assert.deepEqual(frentesDespues, frentesAntes, 'alturas de frentes sin cambios');
  assert.equal(isGolaEnabled(piecesDespues, '1'), false);
});

test('C2: frente fijo (zapatera) se lista como "sin cambios" y con su id', () => {
  const { view, container } = mountView();
  assert.ok(addModuleFromBuilder(MOD).ok);
  assert.ok(addContentToModule('1', 'drawer', { altoVano: 250 }).ok);
  assert.ok(addContentToModule('1', 'drawer', { altoVano: 250 }).ok);
  // Zapatera CON frente y vano 180: fijoEnGola → el gola no la reescala.
  // (Con vano 250 la activación falla: la extensión del frente L supera el
  // máximo de 120 mm.)
  assert.ok(addContentToModule('1', 'shoeRack', { altoVano: 180, conFrente: true }).ok);

  clickGolaCheckbox(container);

  const panel = container.querySelector('[data-gola-preview]');
  assert.ok(panel, 'se muestra el panel de vista previa');
  const fijos = panel.querySelectorAll('.cn-gola-preview__sin-cambio');
  assert.ok(fijos.length >= 1, 'el frente fijo de la zapatera se marca como sin cambios');
  assert.match(fijos[0].textContent, /sin cambios/);
  // Los cajones sí reescalan: aparecen con "→".
  assert.match(panel.textContent, /→ \d+ mm/);
  view.destroy();
});

test('C2: si la activación fallaría, el checkbox se revierte y no hay panel', () => {
  const { view, container } = mountView();
  armarModuloCon3Cajones();
  // Encoger el vano para que applyGola falle (sin espacio para las tiras).
  assert.ok(addContentToModule('1', 'drawer', { altoVano: 250 }).ok);
  assert.ok(addContentToModule('1', 'drawer', { altoVano: 250 }).ok);
  assert.ok(editModuleDimensions('1', { ancho: 850, alto: 320, prof: 600 }).ok);

  clickGolaCheckbox(container);

  assert.ok(!container.querySelector('[data-gola-preview]'), 'no se muestra vista previa si falla');
  const checkbox = container.querySelector('[data-action="toggle-gola"]');
  assert.equal(checkbox.checked, false, 'checkbox revertido a off');
  assert.equal(isGolaEnabled(getStore().get().pieces, '1'), false);
  view.destroy();
});
