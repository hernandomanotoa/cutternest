// test/views/doorBay.dom.test.js — Puertas abatibles en el Constructor (P6):
//   - '+ Puertas' desde la tarjeta genera la(s) hoja(s) con las dimensiones
//     del vano (luz 2 mm), sin tirador, con pos_z anclado.
//   - 2 hojas dejan junta central de 3 mm y comparten pos_z.
//   - editModuleDimensions regenera las hojas al nuevo ancho conservando
//     color y conteo (patrón de los cajones).
//   - El chip aparece en el listado de contenido.
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import { addModuleFromBuilder, editModuleDimensions } from '../../js/app.js';
import { createConstructorView } from '../../js/views/constructorView.js';
import { createContainer, resetDocument } from './setup.mjs';

beforeEach(() => {
  resetDocument();
  setStore(createStore());
  localStorage.clear();
  for (const id of ['summary-module', 'summary-pieces', 'summary-steps', 'summary-alerts', 'summary-graph', 'hardware-list', 'module-selector', 'status-message']) {
    const d = document.createElement('div');
    d.id = id;
    document.body.appendChild(d);
  }
});
afterEach(resetDocument);

const MOD = { ancho: 850, alto: 2400, prof: 600, espesor: 15, colorCuerpo: '#C19A6B', conZocalo: true, alturaZocalo: 150 };

function armarModuloYVista() {
  assert.ok(addModuleFromBuilder(MOD).ok);
  const view = createConstructorView(getStore());
  const container = createContainer();
  view.mount(container);
  return { view, container };
}

const piezasPuerta = () => getStore().get().pieces.filter((p) => /puerta\d+-frente$/.test(String(p.id)));

test("'+ Puertas' agrega una bahía: hoja con luz 2 mm, sin tirador, anclada con pos_z", () => {
  const { container } = armarModuloYVista();
  // Vano 600 fijado a mano: medidas deterministas.
  container.querySelector('[data-alto-vano]').value = '600';
  container.querySelector('[data-action="add-content"][data-kind="doorBay"]').click();

  const puertas = piezasPuerta();
  assert.equal(puertas.length, 1, 'una hoja por default');
  const hoja = puertas[0];
  // Módulo 850 (E15): W = 820; ancho = 816; alto = 600 − 4 = 596.
  assert.equal(Number(hoja.ancho), 816);
  assert.equal(Number(hoja.alto), 596);
  assert.equal(hoja.cantos, 'T,B,L,R');
  assert.equal(hoja.rotate, false);
  assert.ok(Number.isFinite(hoja.pos_z), 'la hoja quedó anclada con pos_z');
  assert.ok(!piezasPuerta().some((p) => /tirador/i.test(String(p.nombre))), 'sin tirador');

  // El chip aparece en el listado de contenido.
  assert.ok(container.querySelector('.cn-chip--doorBay'), 'chip de la puerta en la tarjeta');
});

test('bahía de 2 hojas: hojas iguales con junta central y misma pos_z', () => {
  const { container } = armarModuloYVista();
  container.querySelector('[data-alto-vano]').value = '600';
  container.querySelector('[data-n-hojas]').value = '2';
  container.querySelector('[data-action="add-content"][data-kind="doorBay"]').click();

  const puertas = piezasPuerta();
  assert.equal(puertas.length, 2, 'dos hojas');
  assert.equal(Number(puertas[0].ancho), 406, 'floor((820 − 4 − 3)/2) = 406');
  assert.equal(Number(puertas[1].ancho), 406, 'hojas iguales');
  assert.equal(puertas[0].pos_z, puertas[1].pos_z, 'ambas hojas cuelgan del mismo vano');
});

test('editModuleDimensions regenera las puertas al nuevo ancho conservando color y hojas', () => {
  const { container } = armarModuloYVista();
  container.querySelector('[data-alto-vano]').value = '600';
  container.querySelector('[data-n-hojas]').value = '2';
  container.querySelector('[data-action="add-content"][data-kind="doorBay"]').click();

  // Recolorear una hoja a mano: la regeneración debe conservar el color.
  const antes = piezasPuerta();
  const recoloreadas = getStore().get().pieces.map((p) => (
    p.id === antes[0].id ? { ...p, color: '#123456' } : p
  ));
  getStore().set({ pieces: recoloreadas });

  const r = editModuleDimensions('1', { ancho: 1010, alto: 2400, prof: 600 });
  assert.ok(r.ok, r.errors?.join('; '));

  const despues = piezasPuerta();
  assert.equal(despues.length, 2, 'se conservan las 2 hojas');
  // Nuevo ancho 1010 (E15): W = 980; hoja = floor((980 − 4 − 3)/2) = 486.
  assert.ok(despues.every((p) => Number(p.ancho) === 486), `hojas re-anchoadas: ${dimsDe(despues)}`);
  assert.equal(despues[0].color, '#123456', 'color del frente preservado');
  assert.ok(despues.every((p) => Number.isFinite(p.pos_z)), 'pos_z conservado');
});

test('una segunda bahía no colisiona de ids (contador de hojas global)', () => {
  const { container } = armarModuloYVista();
  container.querySelector('[data-alto-vano]').value = '600';
  container.querySelector('[data-action="add-content"][data-kind="doorBay"]').click();
  container.querySelector('[data-action="add-content"][data-kind="doorBay"]').click();

  const puertas = piezasPuerta();
  assert.equal(puertas.length, 2, 'dos bahías de 1 hoja');
  assert.equal(new Set(puertas.map((p) => p.id)).size, 2, 'ids únicos');
  // Segunda bahía apilada sobre la primera (distinto pos_z).
  assert.notEqual(puertas[0].pos_z, puertas[1].pos_z, 'bahías apiladas por pos_z');
});

function dimsDe(piezas) {
  return piezas.map((p) => `${p.id}:${p.ancho}`).join(', ');
}
