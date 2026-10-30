// test/views/zapateraFrente.dom.test.js — Modo del frente de la zapatera:
//   - Por defecto el modo es 'completo': frente decorativo + tirador.
//   - El selector [data-modo-zapatera] con modo 'borde' genera la bandeja
//     abierta: sin frente decorativo ni tirador, con la cara baja de borde
//     frontal (40 mm por defecto) como frente visible/de agarre.
//   - El modo se persiste (contentModoZapatera; contentFrenteZapatera se
//     mantiene en sync) y se re-aplica al re-renderizar.
//   - Eliminar el contenido (p. ej. su frente) elimina todo el grupo,
//     incluido el tirador.
// NO corre en el runner puro: usar pnpm test:dom (o node --test directo).

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import { addModuleFromBuilder, removeContentPiece } from '../../js/app.js';
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

const piezasZapatera = () => getStore().get().pieces.filter((p) => String(p.id).includes('zapatera'));

function agregarZapatera(container) {
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();
}

test('por defecto la zapatera va CON frente y tirador (modo completo)', () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  assert.ok(modo, 'existe el selector de modo de zapatera');
  assert.equal(modo.value, 'completo', 'por defecto modo frente completo');

  agregarZapatera(container);

  const zap = piezasZapatera();
  assert.ok(zap.length > 0, 'se agregó la zapatera');
  assert.ok(zap.some((p) => p.id.endsWith('-frente')), 'frente decorativo presente');
  assert.ok(zap.some((p) => p.id.endsWith('-tirador')), 'tirador presente (va con el frente)');
  // El ancla vertical quedó en el frente.
  const frente = zap.find((p) => p.id.endsWith('-frente'));
  assert.ok(Number.isFinite(frente.pos_z), 'el frente quedó anclado con pos_z');
});

test("con el modo 'borde' la zapatera va sin frente ni tirador (cara-borde de 40 mm)", () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'borde';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  agregarZapatera(container);

  const zap = piezasZapatera();
  assert.equal(zap.some((p) => p.id.endsWith('-frente')), false, 'sin frente decorativo');
  assert.equal(zap.some((p) => p.id.endsWith('-tirador')), false, 'sin tirador (va atornillado al frente)');
  const cara = zap.find((p) => p.id.endsWith('-cara'));
  assert.ok(cara, 'la cara queda como borde visible/de agarre');
  assert.equal(Number(cara.alto), 40, 'la cara es el borde frontal bajo (40 mm por defecto)');
  // El ancla vertical quedó en la cara (la bandeja se apila como contenido).
  assert.ok(Number.isFinite(cara.pos_z), 'la cara quedó anclada con pos_z');
});

test("con el modo 'completo' la zapatera lleva frente + tirador y la opción persiste", () => {
  const { view, container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  assert.equal(modo.value, 'completo');
  agregarZapatera(container);

  const zap = piezasZapatera();
  assert.ok(zap.some((p) => p.id.endsWith('-frente')), 'frente decorativo presente');
  assert.ok(zap.some((p) => p.id.endsWith('-tirador')), 'tirador presente (va con el frente)');
  assert.equal(loadUserConfig().contentFrenteZapatera, 1, 'pref histórico sincronizado');
  assert.equal(loadUserConfig().contentModoZapatera, 'completo', 'modo persistido');

  // Al re-renderizar la vista, el selector recuerda el modo.
  view.mount(createContainer());
  const fresco = createContainer();
  const view2 = createConstructorView(getStore());
  view2.mount(fresco);
  assert.equal(fresco.querySelector('[data-modo-zapatera]').value, 'completo', 'modo recordado tras re-render');
});

test('eliminar el frente (contenido completo) elimina también el tirador', () => {
  const { container } = armarModuloYVista();
  agregarZapatera(container);
  assert.ok(piezasZapatera().some((p) => p.id.endsWith('-tirador')));

  const r = removeContentPiece('m1zapatera1-frente');
  assert.ok(r.ok);
  const zap = piezasZapatera();
  assert.equal(zap.length, 0, 'el grupo completo (frente, caja y tirador) se eliminó');
});

test('el contador del botón "+ Zapatera (N)" cuenta la bandeja abierta (sin frente)', () => {  const { container } = armarModuloYVista();
  const label = () => container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').textContent;
  assert.match(label(), /\(0\)/, 'sin zapateras: contador 0');

  // Bandeja abierta (default): no hay frente, pero la unidad cuenta.
  agregarZapatera(container);
  assert.match(label(), /\(1\)/, 'la bandeja abierta cuenta aunque no tenga frente');
  agregarZapatera(container);
  assert.match(label(), /\(2\)/, 'segunda zapatera: contador 2');

  // Con frente decorativo también cuenta (y no duplica: frente+cara = 1).
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'completo';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  agregarZapatera(container);
  assert.match(label(), /\(3\)/, 'con frente cuenta 1 por grupo (frente+cara no duplican)');

  // Eliminar una unidad baja el contador.
  const r = removeContentPiece('m1zapatera2-cara');
  assert.ok(r.ok);
  assert.match(label(), /\(2\)/, 'tras eliminar una unidad el contador baja a 2');
});

test('la bandeja abierta reserva el vano completo del tipo en el apilado', () => {
  const { container } = armarModuloYVista();
  // Tipo tenis: vano 200. La bandeja abierta (sin frente) debe reservar esos
  // 200 mm de zona aunque su cara-borde mida 40 (modo 'borde').
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'tenis';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  // Bandeja abierta: modo 'borde' (sin frente decorativo; la cara-borde es el
  // frente visible).
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'borde';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));

  agregarZapatera(container);
  agregarZapatera(container);
  const z = (n) => Number(getStore().get().pieces.find((p) => p.id === `m1zapatera${n}-cara`).pos_z);
  assert.equal(Math.round((z(2) - z(1)) * 10) / 10, 202.5,
    'segunda bandeja a vano(200) + drawerFrontGap(2.5) de la primera — no pisando su zona');

  // Lo que se agregue después queda sobre la zona completa de la 2.ª bandeja.
  container.querySelector('[data-action="add-content"][data-kind="shelf"]').click();
  const repisa = getStore().get().pieces.find((p) => p.id === 'm1-repisa-1');
  assert.ok(Number(repisa.pos_z) > z(2), 'la repisa posterior queda sobre la zona de la bandeja');
});

test('tipo "bandeja a la vista": todos los lados al mismo alto, sin frente', () => {
  const { container } = armarModuloYVista();
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'bandeja';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  agregarZapatera(container);

  const zap = piezasZapatera();
  const altos = ['-lateral-izq', '-lateral-der', '-fondo', '-cara', '-division']
    .map((s) => zap.find((p) => p.id.endsWith(s))?.alto);
  assert.ok(altos.every(Boolean), 'todas las piezas de lado existen');
  assert.ok(altos.every((a) => a === 120),
    `cara, laterales, fondo y división al MISMO alto (rim 120): ${JSON.stringify(altos)}`);
  assert.equal(zap.some((p) => p.id.endsWith('-frente')), false, 'sin frente decorativo');
  assert.equal(zap.some((p) => p.id.endsWith('-tirador')), false, 'sin tirador');
});

test('editar dimensiones preserva la bandeja a la vista (rim y lados iguales)', () => {
  const { container } = armarModuloYVista();
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'bandeja';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  agregarZapatera(container);

  // Editar el ancho del módulo: el tray se regenera y el contrato (tag
  // [bandeja] en la cara) preserva ladosIguales y el rim de 120.
  const scoped = '[data-module-scoped="1"]';
  container.querySelector(`${scoped} [data-action="edit-module"]`).click();
  container.querySelector(`${scoped} [data-edit-ancho]`).value = '700';
  container.querySelector(`${scoped} [data-action="apply-edit-module"]`).click();

  const zap = piezasZapatera();
  const altos = ['-lateral-izq', '-lateral-der', '-fondo', '-cara', '-division']
    .map((s) => zap.find((p) => p.id.endsWith(s))?.alto);
  assert.ok(altos.every(Boolean), 'todas las piezas del tray regeneradas');
  assert.ok(altos.every((a) => a === 120),
    `rim y lados iguales preservados tras editar dims: ${JSON.stringify(altos)}`);
  assert.equal(zap.some((p) => p.id.endsWith('-frente')), false, 'sigue sin frente');
});
