// test/views/auditPlanos.dom.test.js — Tests DOM de la sección "Planos
// acotados" de la vista Auditoría (happy-dom): alzado frontal + secciones
// gola con fijación y botón de exportación. NO corre en el runner puro.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../../js/core/store.js';
import { createAuditView } from '../../js/views/auditView.js';
import { createModule, addDrawer, addShelf } from '../../js/services/closetBuilderService.js';
import { applyGola } from '../../js/services/golaService.js';
import { createContainer, resetDocument } from './setup.mjs';

const ANCHO = 800;
const ALTO = 1600;
const PROF = 500;
const VANO = 200;
const DRAWER_FRONT_GAP = 2.5;
const INTERIOR = ANCHO - 2 * 15;

// Módulo sano de 2 cajones + repisa con gola aplicada (mismo patrón que
// auditView.dom.test.js).
function buildHealthyGolaPieces() {
  const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
  const pieces = [...casco.pieces];
  let cursor = 15 + 10;
  let ultimoTecho = 0;
  for (let i = 1; i <= 2; i++) {
    const d = addDrawer('1', i, { anchoModulo: ANCHO, profundidadModulo: PROF, altoVano: VANO });
    const frente = d.pieces.find((p) => p.id.endsWith('-frente'));
    frente.pos_z = cursor;
    cursor += frente.alto + DRAWER_FRONT_GAP;
    ultimoTecho = frente.pos_z + frente.alto;
    pieces.push(...d.pieces);
  }
  const s = addShelf('1', { anchoUtil: INTERIOR, profReal: PROF - 2 * 15, index: 1 });
  s.pieces[0].pos_z = ultimoTecho + 300;
  pieces.push(...s.pieces);
  const gola = applyGola(pieces, '1', {});
  return gola.pieces;
}

beforeEach(resetDocument);
afterEach(resetDocument);

test('con mueble + gola muestra la sección Planos acotados con frontal y secciones', () => {
  const store = createStore({ pieces: buildHealthyGolaPieces() });
  const view = createAuditView(store);
  const container = createContainer();

  view.mount(container);

  const seccion = container.querySelector('#audit-planos');
  assert.ok(seccion, 'sección Planos acotados presente');
  assert.match(seccion.textContent, /Planos acotados/);
  // Alzado frontal del módulo con sus cotas.
  assert.ok(seccion.querySelector('.plano-modulo[data-modulo="1"]'), 'alzado del módulo 1');
  assert.match(seccion.innerHTML, /Alzado frontal — Módulo 1/);
  assert.match(seccion.innerHTML, /Ancho interior 770/);
  // Sección gola C (el canal L se eliminó: solo canales C entre cajones) con
  // el detalle de fijación.
  assert.ok(seccion.querySelector('.plano-seccion[data-canal="m1gola-c1"]'), 'sección del canal C1');
  assert.ok(!seccion.querySelector('.plano-seccion[data-canal^="m1gola-l"]'), 'sin sección del canal L');
  assert.match(seccion.innerHTML, /Abertura útil 20 mm/);
  assert.match(seccion.innerHTML, /Fijación:/);
  assert.match(seccion.textContent, /3\.5×16/);
  // SVGs inline dibujados (alzado + sección C).
  assert.ok(seccion.querySelectorAll('svg').length >= 2, 'alzado + sección C en SVG');
  // Botón de exportación.
  assert.ok(container.querySelector('#btn-export-planos'), 'botón Exportar planos');

  view.destroy();
});

test('sin gola la sección sigue mostrando el alzado y avisa de la ausencia de canales', () => {
  const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
  const store = createStore({ pieces: casco.pieces });
  const view = createAuditView(store);
  const container = createContainer();

  view.mount(container);

  const seccion = container.querySelector('#audit-planos');
  assert.ok(seccion, 'sección presente con el alzado aunque no haya gola');
  assert.match(seccion.innerHTML, /Alzado frontal — Módulo 1/);
  assert.match(seccion.textContent, /Sin canales gola en el diseño/);

  view.destroy();
});

test('con estado vacío no se dibuja la sección de planos', () => {
  const store = createStore();
  const view = createAuditView(store);
  const container = createContainer();

  view.mount(container);

  assert.equal(container.querySelector('#audit-planos'), null);
  assert.equal(container.querySelector('#btn-export-planos'), null);

  view.destroy();
});
