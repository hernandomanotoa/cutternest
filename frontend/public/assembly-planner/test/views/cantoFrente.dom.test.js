// test/views/cantoFrente.dom.test.js — Canto PVC del frente en el
// Constructor: select 0/0,4/1/2 con persistencia, descuento de 2·canto en
// el ancho del frente, botón «↻ Todo el mueble» que reconstruye todos los
// módulos y conservación del valor (tag [cantoN]) ante la edición de
// dimensiones del módulo.
// NO corre en el runner puro: usar pnpm test:dom (o node --test directo).

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import { addModuleFromBuilder } from '../../js/app.js';
import { loadUserConfig } from '../../js/services/userConfigService.js';
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

const agregarCajon = (container, vano = '200') => {
  container.querySelector('[data-alto-vano]').value = vano;
  container.querySelector('[data-action="add-content"][data-kind="drawer"]').click();
};
const frenteDe = () => getStore().get().pieces.find((p) => p.id.endsWith('-frente'));

test('el select Canto PVC existe con las 4 opciones y default 0', () => {
  const { container } = armarModuloYVista();
  const sel = container.querySelector('[data-canto-frente]');
  assert.ok(sel, 'select presente en la tarjeta');
  assert.deepEqual([...sel.options].map((o) => o.value), ['0', '0.4', '1', '2']);
  assert.equal(sel.value, '0', 'default sin descuento (comportamiento histórico)');
  assert.ok(container.querySelector('[data-action="apply-canto-global"]'), 'botón ↻ Todo el mueble');
});

test('agregar un cajón con Canto PVC=2 descuenta 2·2 del frente y estampa [canto2]', () => {
  const { container } = armarModuloYVista();
  container.querySelector('[data-canto-frente]').value = '2';
  agregarCajon(container);
  const f = frenteDe();
  // Vano W = 850 − 30 = 820; base 818; canto 2 → 814.
  assert.equal(Number(f.ancho), 814, '818 − 2·2');
  assert.ok(f.nombre.includes('[canto2]'), 'tag en el nombre: ' + f.nombre);
  // Persistido para los siguientes contenidos.
  assert.equal(Number(loadUserConfig().cantoFrente), 2);
});

test('«↻ Todo el mueble» reconstruye los frentes existentes con el nuevo canto', () => {
  const { container } = armarModuloYVista();
  agregarCajon(container); // canto 0 → frente 818, sin tag
  assert.equal(Number(frenteDe().ancho), 818);
  container.querySelector('[data-canto-frente]').value = '1';
  container.querySelector('[data-action="apply-canto-global"]').click();
  const f = frenteDe();
  assert.equal(Number(f.ancho), 816, '818 − 2·1 tras la reconstrucción global');
  assert.ok(f.nombre.includes('[canto1]'), 'tag reestampado: ' + f.nombre);
});

test('el valor del canto se conserva al editar las dimensiones del módulo (tag de round-trip)', () => {
  const { container } = armarModuloYVista();
  container.querySelector('[data-canto-frente]').value = '2';
  agregarCajon(container);
  assert.ok(frenteDe().nombre.includes('[canto2]'));
  // Editar el ancho del módulo: el contenido se regenera y el tag manda
  // sobre el userConfig (aunque este último cambie).
  container.querySelector('[data-canto-frente]').value = '0';
  const scoped = '[data-module-scoped="1"]';
  container.querySelector(`${scoped} [data-action="edit-module"]`).click();
  container.querySelector(`${scoped} [data-edit-ancho]`).value = '900';
  container.querySelector(`${scoped} [data-action="apply-edit-module"]`).click();
  const f = frenteDe();
  // W = 900 − 30 = 870; base 868; canto 2 (del tag) → 864.
  assert.equal(Number(f.ancho), 864, 'el tag [canto2] se preserva y manda: ' + f.ancho);
  assert.ok(f.nombre.includes('[canto2]'), 'tag intacto tras la edición: ' + f.nombre);
});
