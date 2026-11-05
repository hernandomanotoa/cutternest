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

test('el Canto PVC único vive en Datos de obra (0/0,4/0,8/1/2, default 0 = opt-in)', () => {
  const { container } = armarModuloYVista();
  const sel = container.querySelector('[data-obra="canto"]');
  assert.ok(sel, 'select presente en Datos de obra');
  assert.deepEqual([...sel.options].map((o) => o.value), ['0', '0.4', '0.8', '1', '2']);
  assert.equal(sel.value, '0', 'default sin descuento: no se mueven las medidas existentes');
  assert.ok(container.querySelector('[data-action="apply-canto-global"]'), 'botón ↻ Todo el mueble');
  assert.equal(container.querySelectorAll('[data-obra="canto"]').length, 1, 'un solo control de canto en toda la vista');
});

test('con el default 0 el frente se genera sin descuento (818) y sin tag', () => {
  const { container } = armarModuloYVista();
  agregarCajon(container);
  const f = frenteDe();
  assert.equal(Number(f.ancho), 818, 'sin descuento con default 0');
  assert.ok(!f.nombre.includes('[canto'), 'sin tag: ' + f.nombre);
});

const ponerCanto = (container, valor) => {
  const sel = container.querySelector('[data-obra="canto"]');
  sel.value = String(valor);
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
};

test('agregar un cajón con Canto PVC=2 descuenta 2·2 del frente y estampa [canto2]', () => {
  const { container } = armarModuloYVista();
  ponerCanto(container, 2);
  agregarCajon(container);
  const f = frenteDe();
  // Vano W = 850 − 30 = 820; base 818; canto 2 → 814.
  assert.equal(Number(f.ancho), 814, '818 − 2·2');
  assert.ok(f.nombre.includes('[canto2]'), 'tag en el nombre: ' + f.nombre);
  // Persistido para los siguientes contenidos.
  assert.equal(Number(loadUserConfig().cantoEspesor), 2);
});

test('«↻ Todo el mueble» reconstruye los frentes existentes con el nuevo canto', () => {
  const { container } = armarModuloYVista();
  agregarCajon(container); // default 0 → frente 818, sin tag
  assert.equal(Number(frenteDe().ancho), 818);
  ponerCanto(container, 1);
  container.querySelector('[data-action="apply-canto-global"]').click();
  const f = frenteDe();
  assert.equal(Number(f.ancho), 816, '818 − 2·1 = 816 tras la reconstrucción global');
  assert.ok(f.nombre.includes('[canto1]'), 'tag reestampado: ' + f.nombre);
});

test('el valor del canto se conserva al editar las dimensiones del módulo (tag de round-trip)', () => {
  const { container } = armarModuloYVista();
  ponerCanto(container, 2);
  agregarCajon(container);
  assert.ok(frenteDe().nombre.includes('[canto2]'));
  // Editar el ancho del módulo: el contenido se regenera y el tag manda
  // sobre el userConfig (aunque este último cambie).
  ponerCanto(container, 0);
  const scoped = '[data-module-scoped="1"]';
  container.querySelector(`${scoped} [data-action="edit-module"]`).click();
  container.querySelector(`${scoped} [data-edit-ancho]`).value = '900';
  container.querySelector(`${scoped} [data-action="apply-edit-module"]`).click();
  const f = frenteDe();
  // W = 900 − 30 = 870; base 868; canto 2 (del tag) → 864.
  assert.equal(Number(f.ancho), 864, 'el tag [canto2] se preserva y manda: ' + f.ancho);
  assert.ok(f.nombre.includes('[canto2]'), 'tag intacto tras la edición: ' + f.nombre);
});

test('la Luz frente se conserva al editar las dimensiones del módulo', () => {
  const { container } = armarModuloYVista();
  container.querySelector('[data-luz-frente]').value = '2';
  agregarCajon(container);
  assert.equal(Number(frenteDe().ancho), 816, '820 − 2·2 con luz 2');
  const scoped = '[data-module-scoped="1"]';
  container.querySelector(`${scoped} [data-action="edit-module"]`).click();
  container.querySelector(`${scoped} [data-edit-ancho]`).value = '900';
  container.querySelector(`${scoped} [data-action="apply-edit-module"]`).click();
  const f = frenteDe();
  // W = 870; luz 2 (persistida) → 866.
  assert.equal(Number(f.ancho), 866, 'la luz persistida se aplica en la regeneración: ' + f.ancho);
});

test('Prof. caja: define la profundidad, calcula la holgura y persiste ante ediciones', () => {
  const { container } = armarModuloYVista();
  container.querySelector('[data-prof-caja]').value = '500';
  container.querySelector('[data-prof-caja]').dispatchEvent(new window.Event('input', { bubbles: true }));
  // Módulo 600, frentes ras (default userConfig): disponible = 600 − 15 − 15 = 570
  // → holgura resultante = 70 (auto-recalculada en el input de holgura).
  const holg = container.querySelector('[data-holgura-fondo]');
  assert.equal(holg.value, '70', 'la holgura se recalcula con lo que sobra (570 − 500)');
  agregarCajon(container);

  const lat = () => getStore().get().pieces.find((p) => p.id.endsWith('cajon1-lateral-izq'));
  const f = () => getStore().get().pieces.find((p) => p.id.endsWith('-frente'));
  assert.equal(Number(lat().ancho), 500, 'la caja mide la profundidad fijada');
  assert.ok(f().nombre.includes('[prof500]'), 'tag persistido en el frente: ' + f().nombre);

  // Editar la holgura recalcula la profundidad (cross-calc). El agregar
  // re-renderiza la tarjeta: se re-consultan los nodos nuevos.
  const holg2 = container.querySelector('[data-holgura-fondo]');
  holg2.value = '100';
  holg2.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(container.querySelector('[data-prof-caja]').value, '470', 'prof = disponible(570) − holgura(100)');

  // Editar el módulo conserva el tag [profN].
  container.querySelector('[data-prof-caja]').value = '500';
  container.querySelector('[data-prof-caja]').dispatchEvent(new window.Event('input', { bubbles: true }));
  const scoped = '[data-module-scoped="1"]';
  container.querySelector(`${scoped} [data-action="edit-module"]`).click();
  container.querySelector(`${scoped} [data-edit-ancho]`).value = '900';
  container.querySelector(`${scoped} [data-action="apply-edit-module"]`).click();
  assert.equal(Number(lat().ancho), 500, 'el tag [prof500] se preserva al editar dimensiones: ' + lat().ancho);
  assert.ok(f().nombre.includes('[prof500]'), 'tag intacto: ' + f().nombre);
});

test('el select Frentes en Datos de obra persiste el modo (ras/tapajunta/interno)', () => {
  const { container } = armarModuloYVista();
  const sel = container.querySelector('[data-obra="frontgap"]');
  assert.ok(sel, 'select Frentes presente en Datos de obra');
  assert.equal(sel.value, 'ras', 'default a ras');
  sel.value = 'interno';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  console.log('DEBUG A:', JSON.stringify(loadUserConfig().frontGapMode));
  console.log('DEBUG B:', JSON.stringify(loadUserConfig().frontGapMode));
  assert.equal(loadUserConfig().frontGapMode, 'interno', 'persistido');
  // Re-render refleja el modo elegido (happy-dom no recalcula select.value
  // tras re-render; se verifica el atributo selected en el HTML).
  const htmlSel = container.querySelector('[data-obra="frontgap"]')?.outerHTML || '';
  assert.ok(/value="interno" selected/.test(htmlSel), 'el re-render marca Interno como seleccionado: ' + htmlSel);
});
