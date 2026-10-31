// test/views/auditView.dom.test.js — Tests DOM de la vista Auditoría (happy-dom).
// NO corre en el runner puro: el patrón js/**/*.test.js no alcanza test/views.

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
// golaService.test.js y auditReportService.test.js).
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

// Casco de 600 mm con una pila de frentes que excede el vano.
function buildOverflowPieces() {
  const m = '1';
  const casco = [
    { id: `m${m}-base`, nombre: `Base modulo M${m}`, ancho: 500, alto: 400, cantidad: 1, rotate: true, color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: m, pos_z: null },
    { id: `m${m}-tapa`, nombre: `Tapa modulo M${m}`, ancho: 500, alto: 400, cantidad: 1, rotate: true, color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: m, pos_z: null },
    { id: `m${m}-lat-izq`, nombre: `Lateral izquierdo M${m}`, ancho: 400, alto: 600, cantidad: 1, rotate: false, color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: m, pos_z: null },
    { id: `m${m}-lat-der`, nombre: `Lateral derecho M${m}`, ancho: 400, alto: 600, cantidad: 1, rotate: false, color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: m, pos_z: null },
  ];
  const frente = (sub, alto) => ({
    id: `m${sub}-frente-${alto}`, nombre: `Frente cajon M${sub}`, ancho: 470, alto,
    cantidad: 1, rotate: false, color: '#8B5A2B', espesor: 15, cantos: 'T,B,L,R',
    modulo: String(sub), pos_z: null,
  });
  return [...casco, frente('11', 200), frente('12', 200), frente('13', 200)];
}

beforeEach(resetDocument);
afterEach(resetDocument);

test('mount con estado vacío muestra el empty-state', () => {
  const store = createStore();
  const view = createAuditView(store);
  const container = createContainer();

  view.mount(container);

  assert.match(container.textContent, /Importa un CSV o construye un mueble/);
  assert.equal(container.querySelector('.audit-table'), null, 'sin tabla sin piezas');

  view.destroy();
});

test('mount con mueble + gola bajo auditoría estricta muestra banner de no autorización (veta y colisión)', () => {
  const store = createStore({ pieces: buildHealthyGolaPieces() });
  const view = createAuditView(store);
  const container = createContainer();

  view.mount(container);

  // Reglas de control estricto del taller: los frentes/golas del Constructor
  // llevan rotate 'si' (veta vertical → error de continuidad estética). El
  // corte queda bloqueado hasta corregir.
  assert.ok(container.querySelector('.alert--danger'), 'banner rojo');
  assert.match(container.textContent, /No autorizar el corte: \d+ elemento\(s\) por corregir/);
  assert.match(container.textContent, /veta/);
  // Tabla del contrato con sus columnas.
  const encabezados = [...container.querySelectorAll('.audit-table thead th')].map((th) => th.textContent);
  assert.deepEqual(encabezados, [
    'Elemento', 'Medida/solución actual', 'Estado',
    'Problema', 'Corrección recomendada', 'Justificación técnica',
  ]);
  // Agrupación por sección y badges de estado.
  assert.ok(container.querySelector('.audit-section-row'), 'filas de sección');
  assert.ok(container.querySelector('.badge--danger'), 'badge por-corregir');
  assert.ok(container.querySelector('.badge--success'), 'badge validado');
  // Botón de exportación presente.
  assert.ok(container.querySelector('#btn-export-audit'), 'botón exportar');

  view.destroy();
});

test('mount con pila que excede el vano muestra banner de no autorización', () => {
  const store = createStore({ pieces: buildOverflowPieces() });
  const view = createAuditView(store);
  const container = createContainer();

  view.mount(container);

  assert.ok(container.querySelector('.alert--danger'), 'banner rojo');
  assert.match(container.textContent, /No autorizar el corte: 1 elemento\(s\) por corregir/);
  assert.ok(container.querySelector('.badge--danger'), 'badge por-corregir');
  assert.match(container.textContent, /excede la altura interior/);

  view.destroy();
});

test('re-renderiza al cambiar las piezas del store', () => {
  // Casco solo: sin frentes ni gola, la auditoría estricta no aplica y el
  // corte queda autorizado.
  const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
  const store = createStore({ pieces: casco.pieces });
  const view = createAuditView(store);
  const container = createContainer();

  view.mount(container);
  assert.ok(container.querySelector('.alert--success'), 'autorizado con casco solo');

  store.setField('pieces', buildOverflowPieces());
  assert.ok(container.querySelector('.alert--danger'), 'no autorizado tras introducir el error');

  view.destroy();
});

test('destroy desuscribe y no lanza', () => {
  const store = createStore({ pieces: buildHealthyGolaPieces() });
  const view = createAuditView(store);
  const container = createContainer();

  view.mount(container);
  const htmlAfterMount = container.innerHTML;

  assert.doesNotThrow(() => view.destroy());
  store.setField('pieces', []);
  assert.equal(container.innerHTML, htmlAfterMount, 'el contenedor quedó congelado tras destroy');
});
