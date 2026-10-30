// test/views/zapateraModos.dom.test.js — Tarjeta de la zapatera en el
// Constructor: selector de los 3 modos de construcción del frente
// (completo / borde bajo / personalizado), campos condicionales según el
// modo (regla: solo los parámetros pertinentes) y persistencia de las prefs
// (contentModoZapatera, contentBordeZapatera, contentAlto*Zapatera).
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

const campoVisible = (container, sel) => {
  const el = container.querySelector(sel);
  if (!el) return false;
  return el.style.display !== 'none' && !el.closest('[style*="display:none"]');
};

test('la tarjeta zapatera muestra el selector de los 3 modos', () => {
  const { container } = armarModuloYVista();
  const opciones = [...container.querySelectorAll('[data-modo-zapatera] option')].map((o) => o.value);
  assert.deepEqual(opciones, ['completo', 'borde', 'personalizado']);
  assert.equal(container.querySelector('[data-modo-zapatera]').value, 'completo', 'default frente completo');
});

test("al elegir 'borde' aparece el input de altura (40 default) y NO los de personalizado", () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'borde';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));

  const borde = container.querySelector('[data-borde-zapatera]');
  assert.ok(campoVisible(container, '[data-zapatera-campo="borde"]'), 'campo borde visible');
  assert.equal(borde.value, '40', 'altura default 40 mm');
  assert.equal(container.querySelectorAll('[data-zapatera-campo="personalizado"]').length, 4, '4 campos personalizado');
  for (const el of container.querySelectorAll('[data-zapatera-campo="personalizado"]')) {
    assert.equal(el.style.display, 'none', `campo ${el.querySelector('input')?.dataset ? 'personalizado' : ''} oculto`);
  }
});

test("al elegir 'personalizado' aparecen los 5 inputs de altura (frente, borde, laterales, fondo, división)", () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'personalizado';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));

  for (const sel of ['[data-borde-zapatera]', '[data-alto-frente-zapatera]', '[data-alto-lateral-zapatera]', '[data-alto-fondo-zapatera]', '[data-alto-division-zapatera]']) {
    assert.ok(campoVisible(container, sel), `visible: ${sel}`);
  }
  assert.equal(container.querySelector('[data-alto-lateral-zapatera]').value, '100', 'laterales default 100 (RAIL_SIDE_HEIGHT)');
  assert.equal(container.querySelector('[data-alto-frente-zapatera]').value, '', 'alto frente vacío (default vano − 3)');
});

test('modo y alturas persisten (prefs) y se re-aplican al re-render', () => {
  const { view, container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'borde';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-borde-zapatera]').value = '60';
  // Agregar la zapatera persiste las prefs (igual que el resto de la tarjeta).
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  const cfg = loadUserConfig();
  assert.equal(cfg.contentModoZapatera, 'borde', 'modo persistido');
  assert.equal(cfg.contentBordeZapatera, 60, 'altura de borde persistida');
  assert.equal(cfg.contentFrenteZapatera, 0, 'pref histórico sincronizado (sin frente)');

  // Las piezas nuevas reflejan el modo: cara-borde de 60, sin frente/tirador.
  const zap = getStore().get().pieces.filter((p) => String(p.id).includes('zapatera'));
  assert.ok(!zap.some((p) => p.id.endsWith('-frente')), 'sin frente');
  assert.equal(Number(zap.find((p) => p.id.endsWith('-cara')).alto), 60, 'cara = borde 60');

  // Re-render: el modo y la altura se re-aplican.
  view.mount(createContainer());
  const fresco = createContainer();
  const view2 = createConstructorView(getStore());
  view2.mount(fresco);
  assert.equal(fresco.querySelector('[data-modo-zapatera]').value, 'borde', 'modo recordado');
  assert.equal(fresco.querySelector('[data-borde-zapatera]').value, '60', 'altura recordada');
  assert.ok(campoVisible(fresco, '[data-zapatera-campo="borde"]'), 'campo borde visible tras re-render');
  assert.equal(fresco.querySelector('[data-zapatera-campo="personalizado"]').style.display, 'none');
});

test("modo 'personalizado' completo: las 5 alturas llegan a las piezas", () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'personalizado';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-alto-frente-zapatera]').value = '150';
  container.querySelector('[data-borde-zapatera]').value = '50';
  container.querySelector('[data-alto-lateral-zapatera]').value = '90';
  container.querySelector('[data-alto-fondo-zapatera]').value = '70';
  container.querySelector('[data-alto-division-zapatera]').value = '60';
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  const z = (suf) => getStore().get().pieces.find((p) => p.id === `m1zapatera1-${suf}`);
  assert.equal(Number(z('frente').alto), 150, 'frente 150');
  assert.equal(Number(z('cara').alto), 50, 'borde frontal 50');
  assert.equal(Number(z('lateral-izq').alto), 90, 'laterales 90');
  assert.equal(Number(z('fondo').alto), 70, 'borde trasero 70');
  assert.equal(Number(z('division').alto), 60, 'división 60');

  const cfg = loadUserConfig();
  assert.equal(cfg.contentModoZapatera, 'personalizado');
  assert.equal(cfg.contentAltoFrenteZapatera, 150);
  assert.equal(cfg.contentAltoLateralZapatera, 90);
});

test('el chip del contenido marca el modo borde ("· borde N mm")', () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'borde';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();
  assert.match(
    container.querySelector('.cn-chip--shoeRack .cn-chip__label').textContent,
    /· borde 40 mm/,
    'el chip describe el modo borde',
  );
});
