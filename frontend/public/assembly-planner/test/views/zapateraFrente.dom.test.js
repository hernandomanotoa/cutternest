// test/views/zapateraFrente.dom.test.js — Frente de la zapatera:
//   - Por defecto el modo es 'normal' (frente normal): frente CORTO que mide
//     bandeja + 30 mm (no cubre el vano: el aire superior queda abierto para
//     el calzado y la unidad reserva SU vano completo en el apilado). La
//     bandeja va de borde uniforme al alto zapatera. Sin tirador.
//   - Desmarcar "Frente zapatera" genera la bandeja abierta: sin frente
//     decorativo, con la cara alta como frente visible/de agarre.
//   - El modo 'extendido' hace que el frente complete el vano (vano − 1).
//   - El modo se persiste (contentModoZapatera; contentFrenteZapatera se
//     mantiene en sync) y se re-aplica al re-renderizar.
//   - Eliminar el contenido (p. ej. su frente) elimina todo el grupo.
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

test("por defecto la zapatera va CON frente normal (bandeja 100 + frente 130, sin tirador)", () => {
  const { container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  assert.ok(modo, 'existe el selector de modo de zapatera');
  assert.equal(modo.value, 'normal', 'por defecto modo frente normal');
  // Tipo personalizado + vano 200: medidas deterministas (sin tipo el vano
  // lo fija el catálogo).
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'personalizado';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-alto-vano]').value = '200';

  agregarZapatera(container);

  const zap = piezasZapatera();
  assert.ok(zap.length > 0, 'se agregó la zapatera');
  assert.ok(zap.some((p) => p.id.endsWith('-frente')), 'frente decorativo presente');
  assert.equal(zap.some((p) => p.id.endsWith('-tirador')), false, 'sin tirador (apertura sin jaladera)');
  const frente = zap.find((p) => p.id.endsWith('-frente'));
  assert.equal(Number(frente.alto), 130, 'frente normal = bandeja (100) + 30: NO cubre el vano (197)');
  const cara = zap.find((p) => p.id.endsWith('-cara'));
  assert.equal(Number(cara.alto), 100, 'cara = alto de bandeja (borde uniforme)');
  // El ancla vertical quedó en el frente.
  assert.ok(Number.isFinite(frente.pos_z), 'el frente quedó anclado con pos_z');
});

test("sin 'Frente zapatera' la bandeja va abierta: sin frente ni tirador (cara alta de agarre)", () => {
  const { container } = armarModuloYVista();
  // Tipo personalizado + vano 200: medidas deterministas.
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'personalizado';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-alto-vano]').value = '200';
  container.querySelector('[data-con-frente-zapatera]').checked = false;
  agregarZapatera(container);

  const zap = piezasZapatera();
  assert.equal(zap.some((p) => p.id.endsWith('-frente')), false, 'sin frente decorativo');
  assert.equal(zap.some((p) => p.id.endsWith('-tirador')), false, 'sin tirador (va atornillado al frente)');
  const cara = zap.find((p) => p.id.endsWith('-cara'));
  assert.ok(cara, 'la cara queda como frente visible/de agarre');
  assert.equal(Number(cara.alto), 167, 'la cara es la cara alta de la bandeja (vano 200 − 3 − 2·15)');
  // El ancla vertical quedó en la cara (la bandeja se apila como contenido).
  assert.ok(Number.isFinite(cara.pos_z), 'la cara quedó anclada con pos_z');
});

test("con el modo 'extendido' la zapatera lleva frente que cubre el vano (vano − 1) y la opción persiste", () => {
  const { view, container } = armarModuloYVista();
  const modo = container.querySelector('[data-modo-zapatera]');
  modo.value = 'extendido';
  modo.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(modo.value, 'extendido');
  agregarZapatera(container);

  const zap = piezasZapatera();
  assert.ok(zap.some((p) => p.id.endsWith('-frente')), 'frente decorativo presente');
  assert.equal(zap.some((p) => p.id.endsWith('-tirador')), false, 'sin tirador (apertura sin jaladera)');
  assert.equal(loadUserConfig().contentFrenteZapatera, 1, 'pref histórico sincronizado');
  assert.equal(loadUserConfig().contentModoZapatera, 'extendido', 'modo persistido');

  // Al re-renderizar la vista, el selector recuerda el modo.
  view.mount(createContainer());
  const fresco = createContainer();
  const view2 = createConstructorView(getStore());
  view2.mount(fresco);
  assert.equal(fresco.querySelector('[data-modo-zapatera]').value, 'extendido', 'modo recordado tras re-render');
});

test('eliminar el frente (contenido completo) elimina todo el grupo', () => {
  const { container } = armarModuloYVista();
  agregarZapatera(container);
  assert.equal(piezasZapatera().some((p) => p.id.endsWith('-tirador')), false, 'sin tirador desde el inicio');

  const r = removeContentPiece('m1zapatera1-frente');
  assert.ok(r.ok);
  const zap = piezasZapatera();
  assert.equal(zap.length, 0, 'el grupo completo (frente y caja) se eliminó');
});

test('el contador del botón "+ Zapatera (N)" cuenta cada unidad (con o sin frente)', () => {  const { container } = armarModuloYVista();
  const label = () => container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').textContent;
  assert.match(label(), /\(0\)/, 'sin zapateras: contador 0');

  // Default 'normal' (con frente): la unidad cuenta 1 por grupo.
  agregarZapatera(container);
  assert.match(label(), /\(1\)/, 'la zapatera con frente cuenta 1');
  agregarZapatera(container);
  assert.match(label(), /\(2\)/, 'segunda zapatera: contador 2');

  // Sin frente también cuenta (y no duplica: frente+cara = 1).
  container.querySelector('[data-con-frente-zapatera]').checked = false;
  agregarZapatera(container);
  assert.match(label(), /\(3\)/, 'con frente cuenta 1 por grupo (frente+cara no duplican)');

  // Eliminar una unidad baja el contador.
  const r = removeContentPiece('m1zapatera2-frente');
  assert.ok(r.ok);
  assert.match(label(), /\(2\)/, 'tras eliminar una unidad el contador baja a 2');
});

test('la bandeja abierta reserva el vano completo del tipo en el apilado', () => {
  const { container } = armarModuloYVista();
  // Tipo tenis: vano 200. La bandeja abierta (sin frente) debe reservar esos
  // 200 mm de zona aunque su cara mida 167.
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'tenis';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  // Bandeja abierta: se desmarca el frente (la cara alta es el frente visible).
  container.querySelector('[data-con-frente-zapatera]').checked = false;

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

test("modo 'normal' con tipo tacones: frente = bandeja + 30 (130) y la unidad reserva SU vano", () => {
  const { container } = armarModuloYVista();
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = 'tacones';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  const modo = container.querySelector('[data-modo-zapatera]');
  assert.equal(modo.value, 'normal', 'el tipo no toca el modo: queda el default normal');

  agregarZapatera(container);
  agregarZapatera(container);
  const frente = (n) => getStore().get().pieces.find((p) => p.id === `m1zapatera${n}-frente`);
  assert.equal(Number(frente(1).alto), 130, 'frente normal = bandeja (100) + 30');
  // El frente corto NO hace pisar el vano: la 2.ª zapatera se apila a
  // vano(220) + gap de la 1.ª — el aire sobre el frente es del calzado.
  const salto = Math.round((Number(frente(2).pos_z) - Number(frente(1).pos_z)) * 10) / 10;
  assert.equal(salto, 222.5, 'segunda zapatera a vano(220) + gap(2.5) — no a frente(130) + gap');

  // Lo que se agregue después queda sobre la zona completa de la 2.ª zapatera.
  container.querySelector('[data-action="add-content"][data-kind="shelf"]').click();
  const repisa = getStore().get().pieces.find((p) => p.id === 'm1-repisa-1');
  assert.ok(Number(repisa.pos_z) > Number(frente(2).pos_z) + 130,
    'la repisa posterior queda sobre la zona completa (vano) de la zapatera');
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

test('editar dimensiones conserva la numeración de los nombres (regresión idx=1)', () => {
  // Bug: editModuleDimensions regeneraba cada unidad con índice 1, así que
  // tras "Aplicar" todas las zapateras quedaban nombradas "...1 M1".
  const { container } = armarModuloYVista();
  agregarZapatera(container);
  agregarZapatera(container);

  const scoped = '[data-module-scoped="1"]';
  container.querySelector(`${scoped} [data-action="edit-module"]`).click();
  container.querySelector(`${scoped} [data-edit-ancho]`).value = '700';
  container.querySelector(`${scoped} [data-action="apply-edit-module"]`).click();

  const frentes = getStore().get().pieces.filter((p) => /zapatera\d+-frente$/.test(p.id));
  assert.equal(frentes.length, 2, 'dos frentes');
  const nums = frentes.map((f) => f.nombre.match(/(\d+) M1$/)?.[1]);
  assert.deepEqual(nums.sort(), ['1', '2'], `numeración conservada: ${frentes.map((f) => f.nombre).join(' | ')}`);
});
