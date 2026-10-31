// test/views/zapateraModos.dom.test.js — Tarjeta de la zapatera en el
// Constructor: selector de los 3 modos de construcción del frente
// (normal / extendido / personalizado), checkbox de frente decorativo
// (desmarcado = bandeja a la vista), campos condicionales según el modo
// (regla: solo los parámetros pertinentes) y persistencia de las prefs
// (contentModoZapatera, contentFrenteZapatera, contentAlto*Zapatera).
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
  // Camina los ancestros mirando el display inline (la vista alterna los
  // campos con el.style.display; happy-dom re-serializa con espacio, así que
  // no basta un match textual del atributo style).
  for (let n = el; n; n = n.parentElement) {
    if (n.style && n.style.display === 'none') return false;
  }
  return true;
};

test('la tarjeta zapatera muestra el selector de los 3 modos (default frente normal)', () => {
  const { container } = armarModuloYVista();
  const opciones = [...container.querySelectorAll('[data-modo-zapatera] option')].map((o) => o.value);
  assert.deepEqual(opciones, ['normal', 'extendido', 'personalizado']);
  assert.equal(container.querySelector('[data-modo-zapatera]').value, 'normal', 'default frente normal');
});

test("en 'normal' solo se ve el alto de la zapatera; en 'extendido' ninguno; en 'personalizado' los 4", () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  assert.equal(modo.value, 'normal');
  // Modo normal: el alto de la zapatera (cara/bandeja) es el único campo de
  // altura — define la bandeja uniforme y el frente (alto + 30).
  assert.ok(campoVisible(container, '[data-alto-lateral-zapatera]'), 'alto zapatera visible en normal');
  for (const sel of ['[data-alto-frente-zapatera]', '[data-alto-fondo-zapatera]', '[data-alto-division-zapatera]']) {
    assert.ok(!campoVisible(container, sel), `oculto en normal: ${sel}`);
  }
  assert.equal(container.querySelector('[data-alto-lateral-zapatera]').value, '100', 'alto zapatera default 100 (RAIL_SIDE_HEIGHT)');
  modo.value = 'extendido';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  for (const sel of ['[data-alto-frente-zapatera]', '[data-alto-lateral-zapatera]', '[data-alto-fondo-zapatera]', '[data-alto-division-zapatera]']) {
    assert.ok(!campoVisible(container, sel), `oculto en extendido: ${sel}`);
  }
  modo.value = 'personalizado';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  for (const sel of ['[data-alto-frente-zapatera]', '[data-alto-lateral-zapatera]', '[data-alto-fondo-zapatera]', '[data-alto-division-zapatera]']) {
    assert.ok(campoVisible(container, sel), `visible en personalizado: ${sel}`);
  }
  assert.equal(container.querySelector('[data-alto-lateral-zapatera]').value, '100', 'laterales default 100 (RAIL_SIDE_HEIGHT)');
  assert.equal(container.querySelector('[data-alto-frente-zapatera]').value, '', 'alto frente vacío (default según modo)');
});

test("el alto de la zapatera (modo normal) llega a las piezas: bandeja uniforme, frente = alto + 30", () => {
  const { container } = armarModuloYVista();
  // Tipo personalizado + vano 200: medidas deterministas.
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'personalizado';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-alto-vano]').value = '200';
  container.querySelector('[data-alto-lateral-zapatera]').value = '80';
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  const z = (suf) => getStore().get().pieces.find((p) => p.id === `m1zapatera1-${suf}`);
  assert.equal(Number(z('frente').alto), 110, 'frente = bandeja (80) + 30');
  for (const suf of ['cara', 'lateral-izq', 'fondo', 'division']) {
    assert.equal(Number(z(suf).alto), 80, `${suf}: borde uniforme al alto configurado`);
  }
  const cfg = loadUserConfig();
  assert.equal(cfg.contentModoZapatera, 'normal');
  assert.equal(cfg.contentAltoLateralZapatera, 80, 'alto de zapatera persistido');
});

test("modo 'personalizado' completo: las 4 alturas llegan a las piezas (la cara = frente − 2·E)", () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'personalizado';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-alto-frente-zapatera]').value = '150';
  container.querySelector('[data-alto-lateral-zapatera]').value = '90';
  container.querySelector('[data-alto-fondo-zapatera]').value = '70';
  container.querySelector('[data-alto-division-zapatera]').value = '60';
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  const z = (suf) => getStore().get().pieces.find((p) => p.id === `m1zapatera1-${suf}`);
  assert.equal(Number(z('frente').alto), 150, 'frente 150');
  assert.equal(Number(z('cara').alto), 120, 'cara = frente − 2·15 (detrás del frente)');
  assert.equal(Number(z('lateral-izq').alto), 90, 'laterales 90');
  assert.equal(Number(z('fondo').alto), 70, 'fondo 70');
  assert.equal(Number(z('division').alto), 60, 'división 60');

  const cfg = loadUserConfig();
  assert.equal(cfg.contentModoZapatera, 'personalizado');
  assert.equal(cfg.contentAltoFrenteZapatera, 150);
  assert.equal(cfg.contentAltoLateralZapatera, 90);
});

test('modo y alturas persisten (prefs) y se re-aplican al re-render', () => {
  const { view, container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'personalizado';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-alto-frente-zapatera]').value = '150';
  // Agregar la zapatera persiste las prefs (igual que el resto de la tarjeta).
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  const cfg = loadUserConfig();
  assert.equal(cfg.contentModoZapatera, 'personalizado', 'modo persistido');
  assert.equal(cfg.contentAltoFrenteZapatera, 150, 'altura de frente persistida');
  assert.equal(cfg.contentFrenteZapatera, 1, 'pref de frente sincronizado (con frente)');

  // Re-render: el modo y la altura se re-aplican.
  view.mount(createContainer());
  const fresco = createContainer();
  const view2 = createConstructorView(getStore());
  view2.mount(fresco);
  assert.equal(fresco.querySelector('[data-modo-zapatera]').value, 'personalizado', 'modo recordado');
  assert.equal(fresco.querySelector('[data-alto-frente-zapatera]').value, '150', 'altura recordada');
  assert.ok(campoVisible(fresco, '[data-alto-frente-zapatera]'), 'campo frente visible tras re-render');
});

test('luz frente: se aplica a la pieza, persiste y sobrevive al re-render (regresión doble-save)', () => {
  // Bug: saveUserConfig REEMPLAZA el storage completo; la luz se guardaba en
  // un call previo al de las prefs y el segundo call la borraba → el input
  // volvía a 1 tras aplicar.
  const { container } = armarModuloYVista();
  container.querySelector('[data-luz-frente]').value = '3';
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  const z = getStore().get().pieces.find((p) => p.id === 'm1zapatera1-frente');
  assert.equal(Number(z.ancho), 820 - 2 * 3, 'frente con luz 3 aplicada (vano 850 − 2·15 − 2·3)');
  assert.equal(loadUserConfig().drawerFrontLuz, 3, 'luz persistida tras el save de prefs');
  assert.equal(JSON.parse(localStorage.getItem('cn-assembly-config')).drawerFrontLuz, 3, 'raw storage conserva la luz');

  const view2 = createConstructorView(getStore());
  const fresco = createContainer();
  view2.mount(fresco);
  assert.equal(fresco.querySelector('[data-luz-frente]').value, '3', 'input recuerda la luz');

  // El botón "Aplicar" (editar módulo) también la persiste: cambiar la luz a
  // 2 y aplicar dimensiones guarda 2 sin tocar el resto de prefs.
  const scoped = '[data-module-scoped="1"]';
  fresco.querySelector(`${scoped} [data-luz-frente]`).value = '2';
  fresco.querySelector(`${scoped} [data-edit-ancho]`).value = '800';
  fresco.querySelector(`${scoped} [data-action="apply-edit-module"]`).click();
  const cfg2 = loadUserConfig();
  assert.equal(cfg2.drawerFrontLuz, 2, 'luz persistida vía Aplicar (editar módulo)');
  assert.equal(cfg2.contentModoZapatera, 'normal', 'prefs de modo preservadas (merge)');
  const fresco2 = createContainer();
  createConstructorView(getStore()).mount(fresco2);
  assert.equal(fresco2.querySelector('[data-luz-frente]').value, '2', 'input recuerda la luz tras Aplicar');
});

test('prefs legacy se mapean: modo viejo con frente → normal; sin frente → personalizado', () => {
  const { container } = armarModuloYVista();
  assert.equal(container.querySelector('[data-modo-zapatera]').value, 'normal');
  // Simula prefs legacy inyectándolas en el storage y re-hidratando el store.
  localStorage.setItem('cn-assembly-config', JSON.stringify({
    contentModoZapatera: 'normas', contentFrenteZapatera: 1,
  }));
  getStore().set({ userConfig: loadUserConfig() });
  const view2 = createConstructorView(getStore());
  const c2 = createContainer();
  view2.mount(c2);
  assert.equal(c2.querySelector('[data-modo-zapatera]').value, 'normal', "'normas' → normal");
  assert.ok(c2.querySelector('[data-con-frente-zapatera]').checked, 'frente marcado');

  localStorage.setItem('cn-assembly-config', JSON.stringify({
    contentModoZapatera: 'borde', contentFrenteZapatera: 0,
  }));
  getStore().set({ userConfig: loadUserConfig() });
  const view3 = createConstructorView(getStore());
  const c3 = createContainer();
  view3.mount(c3);
  assert.equal(c3.querySelector('[data-modo-zapatera]').value, 'personalizado', "'borde' sin frente → personalizado");
  assert.ok(!c3.querySelector('[data-con-frente-zapatera]').checked, 'frente desmarcado');
});

test("sin frente (checkbox desmarcado) la bandeja va sin frente ni tirador; con 'extendido' el frente cubre el vano", () => {
  const { container } = armarModuloYVista();
  // Tipo personalizado + vano 200: medidas deterministas.
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'personalizado';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-alto-vano]').value = '200';
  // Personalizado + sin frente: bandeja abierta (cara alta de agarre).
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'personalizado';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-con-frente-zapatera]').checked = false;
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  let zap = getStore().get().pieces.filter((p) => String(p.id).includes('zapatera'));
  assert.ok(!zap.some((p) => p.id.endsWith('-frente')), 'sin frente decorativo');
  assert.ok(!zap.some((p) => p.id.endsWith('-tirador')), 'sin tirador');
  assert.equal(Number(zap.find((p) => p.id.endsWith('-cara')).alto), 167, 'cara alta = vano 200 − 3 − 2·15');

  // Extendido (con frente): el frente completa el vano (vano − 1).
  const modo2 = container.querySelector('[data-modo-zapatera]');
  modo2.value = 'extendido';
  modo2.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-con-frente-zapatera]').checked = true;
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();
  zap = getStore().get().pieces.filter((p) => String(p.id).includes('zapatera'));
  const frente = zap.find((p) => p.id === 'm1zapatera2-frente');
  assert.equal(Number(frente.alto), 199, 'frente extendido = vano − 1');
});
