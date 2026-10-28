// test/views/golaDimensions.dom.test.js — Tests DOM (happy-dom) de la
// integración gola ⇄ acciones del Constructor en app.js:
//   A1: editModuleDimensions re-aplica las tiras al nuevo vano (re-ancho +
//       re-derivación del topRef) como parte de la MISMA acción de undo.
//   A2: saveCurrentVersion/loadVersionById preservan y rehidratan los metas
//       gola (round-trip exacto de frentes al desactivar tras cargar).
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import {
  addModuleFromBuilder,
  addContentToModule,
  enableGola,
  disableGola,
  editModuleDimensions,
  saveCurrentVersion,
  loadVersionById,
  canUndo,
  undoLast,
} from '../../js/app.js';
import { isGolaEnabled } from '../../js/services/golaService.js';
import { resetDocument } from './setup.mjs';

beforeEach(() => {
  resetDocument();
  setStore(createStore());
  localStorage.clear();
  // Chrome mínimo para recalculateAll/updateSummary.
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

const tirasDe = (pieces) =>
  pieces.filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))).sort((a, b) => a.pos_z - b.pos_z);

const frentesDe = (pieces) =>
  pieces.filter((p) => String(p.id).endsWith('-frente')).sort((a, b) => a.pos_z - b.pos_z);

const techoMaxFrentes = (pieces) =>
  Math.max(...frentesDe(pieces).map((f) => f.pos_z + f.alto));

// ancho del canal = ancho interior (holgura lateral 0).
const anchoTiraEsperado = (W, e = 15) => W - 2 * e;

test('A1: editModuleDimensions con gola activo re-anchoa y reposiciona las tiras', () => {
  armarModuloCon3Cajones();
  const r = enableGola('1');
  assert.ok(r.ok, JSON.stringify(r.errors));

  const piecesAntes = getStore().get().pieces;
  const tirasAntes = tirasDe(piecesAntes);
  assert.equal(tirasAntes.length, 2, '3 cajones ⇒ 2 tiras');
  assert.ok(tirasAntes.every((t) => t.ancho === anchoTiraEsperado(850)), 'tiras al vano inicial');
  const techoAntes = techoMaxFrentes(piecesAntes);

  // Editar dimensiones: más ancho y más alto ⇒ vano y topRef nuevos.
  const edit = editModuleDimensions('1', { ancho: 900, alto: 2600, prof: 600 });
  assert.ok(edit.ok, JSON.stringify(edit.errors));

  const piecesDespues = getStore().get().pieces;
  const tirasDespues = tirasDe(piecesDespues);
  assert.equal(tirasDespues.length, 2, 'siguen siendo N−1 tiras (re-aplicadas, no duplicadas)');
  assert.ok(
    tirasDespues.every((t) => t.ancho === anchoTiraEsperado(900)),
    `tiras re-anchoadas al nuevo vano: ${tirasDespues.map((t) => t.ancho).join(',')}`,
  );
  // El topRef sube (techoInterior 2385 → 2585): las tiras se reposicionan y
  // los frentes se re-escalan hacia arriba.
  assert.ok(
    tirasDespues[1].pos_z > tirasAntes[1].pos_z,
    `la tira superior sube con el vano (${tirasAntes[1].pos_z} → ${tirasDespues[1].pos_z})`,
  );
  assert.ok(techoMaxFrentes(piecesDespues) > techoAntes, 'frentes re-escalados hacia el topRef nuevo');
});

test('A1: un solo undo devuelve la edición completa (casco + tiras gola)', () => {
  armarModuloCon3Cajones();
  assert.ok(enableGola('1').ok);
  const anchoTiraAntes = tirasDe(getStore().get().pieces)[0].ancho;

  assert.ok(editModuleDimensions('1', { ancho: 900, alto: 2600, prof: 600 }).ok);

  // Un ÚNICO undo debe devolver todo (casco editado + tiras re-aplicadas):
  // la re-aplicación gola no añade snapshot propio.
  assert.ok(canUndo());
  undoLast();
  const pieces = getStore().get().pieces;
  assert.equal(tirasDe(pieces)[0].ancho, anchoTiraAntes, 'undo único restaura también las tiras');
  assert.equal(isGolaEnabled(pieces, '1'), true, 'el gola sigue activo tras el undo');
});

test('A1: si el vano nuevo no alcanza, la edición NO se aborta y avisa', () => {
  armarModuloCon3Cajones();
  assert.ok(enableGola('1').ok);

  // Encoger el módulo a un alto irrisorio: la re-aplicación gola falla, pero
  // la edición de dimensiones debe completarse igual con warning.
  const edit = editModuleDimensions('1', { ancho: 850, alto: 300, prof: 600 });
  assert.ok(edit.ok, `la edición no debe abortar: ${JSON.stringify(edit.errors || [])}`);
  assert.ok(
    (edit.warnings || []).some((w) => /gola/i.test(w)),
    `el motivo del fallo se devuelve como warning: ${JSON.stringify(edit.warnings || [])}`,
  );
  const lateral = getStore().get().pieces.find((p) => p.id === 'm1-lateral-izq');
  assert.equal(lateral.alto, 300, 'el casco quedó editado pese al fallo gola');
});

test('A2: save/load de versión local preserva y rehidrata los metas gola', () => {
  armarModuloCon3Cajones();
  // disableGola restaura los frentes PRE-gola exactos (alturas/pos_z del
  // builder): ese es el estado de referencia del round-trip.
  const frentesOriginales = frentesDe(getStore().get().pieces).map((f) => `${f.id}:${f.alto}@${f.pos_z}`);
  assert.ok(enableGola('1').ok);
  const frentesConGola = frentesDe(getStore().get().pieces).map((f) => `${f.id}:${f.alto}@${f.pos_z}`);
  assert.notDeepEqual(frentesConGola, frentesOriginales, 'el gola reescala los frentes');

  const saved = saveCurrentVersion('Closet gola');
  assert.ok(saved.ok, saved.error);
  assert.ok(localStorage.getItem('cn-assembly-gola'), 'hay metas persistidos al guardar');

  // Corromper el estado: quitar metas y desactivar deja frentes distintos.
  localStorage.removeItem('cn-assembly-gola');
  assert.ok(disableGola('1').ok); // fallback proporcional (sin meta)
  assert.equal(isGolaEnabled(getStore().get().pieces, '1'), false);

  // Cargar la versión rehidrata los metas: disableGola restaura EXACTO.
  const loaded = loadVersionById(saved.version.id);
  assert.ok(loaded.ok, loaded.error);
  assert.ok(isGolaEnabled(getStore().get().pieces, '1'), 'la versión trae las tiras gola');
  const metas = JSON.parse(localStorage.getItem('cn-assembly-gola') || '{}');
  assert.ok(metas['1'] && metas['1'].origHeights, 'metas gola rehidratados en localStorage');

  assert.ok(disableGola('1').ok);
  const frentesRestaurados = frentesDe(getStore().get().pieces).map((f) => `${f.id}:${f.alto}@${f.pos_z}`);
  assert.deepEqual(frentesRestaurados, frentesOriginales, 'disableGola tras cargar restaura alturas/pos_z exactos');
});

test('A2: cargar una versión vieja sin golaMetas no rompe ni borra metas existentes', () => {
  armarModuloCon3Cajones();
  assert.ok(enableGola('1').ok);
  const saved = saveCurrentVersion('Con metas');
  assert.ok(saved.ok, saved.error);

  // Simular versión vieja: mismo CSV pero sin campo golaMetas en el storage.
  const raw = JSON.parse(localStorage.getItem('cn-assembly-versions'));
  delete raw.versions[0].golaMetas;
  localStorage.setItem('cn-assembly-versions', JSON.stringify(raw));

  const metasAntes = localStorage.getItem('cn-assembly-gola');
  const loaded = loadVersionById(saved.version.id);
  assert.ok(loaded.ok, loaded.error);
  assert.equal(
    localStorage.getItem('cn-assembly-gola'),
    metasAntes,
    'una versión sin golaMetas no toca los metas existentes (merge tolerante)',
  );
});
