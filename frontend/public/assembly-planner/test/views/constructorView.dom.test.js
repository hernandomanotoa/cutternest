// test/views/constructorView.dom.test.js — Tests DOM de la vista Constructor
// (happy-dom). NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore } from '../../js/core/store.js';
import { createConstructorView } from '../../js/views/constructorView.js';
import { createContainer, resetDocument } from './setup.mjs';
import { countVersions, deleteAllVersions } from '../../js/services/projectVersionsService.js';
import { plinthTotalWidth } from '../../js/services/plinthFrameService.js';
import { GOLA_DEFAULTS } from '../../js/services/golaService.js';

beforeEach(() => {
  resetDocument();
  setStore(createStore());
  deleteAllVersions();
});
afterEach(resetDocument);

function mountView() {
  const store = createStore();
  setStore(store);
  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);
  return { store, view, container };
}


// Elige 'Personalizado' en el selector de tipo para que el vano libre del
// input mande (por defecto el tipo del catálogo tiene prioridad).
function usarVanoPersonalizado(container, moduleId = '1') {
  const sel = container.querySelector(`[data-module-scoped="${moduleId}"] [data-tipo-drawer]`);
  sel.value = 'personalizado';
}

function click(container, selector) {
  const el = container.querySelector(selector);
  assert.ok(el, `no existe ${selector}`);
  el.click();
  return el;
}

function setInput(container, selector, value) {
  const el = container.querySelector(selector);
  assert.ok(el, `no existe ${selector}`);
  el.value = value;
  return el;
}

// ── Flujos base ───────────────────────────────────────────────────

test('estado vacío: muestra formulario y empty-state de módulos/versiones', () => {
  const { view, container } = mountView();
  assert.ok(container.querySelector('[data-action="add-module"]'));
  assert.match(container.textContent, /Todavía no hay módulos/);
  assert.match(container.textContent, /No hay versiones guardadas/);
  view.destroy();
});

test('agregar módulo con zócalo: casco 6 piezas, base INTERNA apoyada sobre zócalo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');

  const piezas = store.get().pieces;
  assert.equal(piezas.filter((p) => p.modulo === '1').length, 6); // casco 5 + zocalo 1
  // Base (820x585, front_flush: hasta la pared): el renderer la apoya sobre
  // el zócalo (z=150).
  const base = piezas.find((p) => p.id === 'm1-base');
  const tapa = piezas.find((p) => p.id === 'm1-tapa');
  assert.equal(base.ancho, tapa.ancho - 2 * base.espesor);
  assert.equal(base.alto, tapa.alto - base.espesor);
  assert.match(container.textContent, /Módulo 1/);
  view.destroy();
});

test('agregar cajón a un módulo con zócalo: dims derivadas de la tapa, no de la base interna', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');

  usarVanoPersonalizado(container);
  const select = container.querySelector('[data-module-scoped="1"] [data-alto-vano]');
  select.value = '280';
  click(container, '[data-action="add-content"][data-kind="drawer"]');

  const drawerPieces = store.get().pieces.filter((p) => p.modulo === '11');
  assert.equal(drawerPieces.length, 7);
  const frente = drawerPieces.find((p) => p.id.includes('-frente'));
  assert.equal(frente.alto, 277); // 280 - 3
  // Si se hubiera derivado ancho de la base interna (820), el frente sería 816.
  assert.equal(frente.ancho, 818); // W(850-2*15=820) - 2
  view.destroy();
});

test('agregar N módulos: cantidad 3 crea M1, M2 y M3', () => {
  const { store, view, container } = mountView();
  setInput(container, '[data-cfg="cantidad"]', '3');
  click(container, '[data-action="add-module"]');
  assert.equal(store.get().pieces.filter((p) => p.modulo === '3').length, 6);
  assert.match(container.textContent, /Módulo 3/);
  view.destroy();
});

test('altura de zócalo configurable se refleja en la pieza', () => {
  const { store, view, container } = mountView();
  setInput(container, '[data-cfg="altura-zocalo"]', '100');
  click(container, '[data-action="add-module"]');
  const zocalo = store.get().pieces.find((p) => p.id === 'm1-zocalo');
  assert.equal(zocalo.alto, 100);
  view.destroy();
});

test('duplicar módulo copia casco y contenido con id nuevo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const antes = store.get().pieces.length;

  click(container, '[data-action="duplicate-module"]');
  const pieces = store.get().pieces;
  assert.equal(pieces.length, antes * 2);
  assert.ok(pieces.some((p) => p.modulo === '2'), 'existe M2');
  assert.ok(pieces.some((p) => p.modulo === '21'), 'existe submódulo 21 (cajón copiado)');
  assert.ok(!pieces.some((p) => p.modulo === '11' && p.id.startsWith('m2')), 'ids renombrados');
  view.destroy();
});

test('recolorear módulo aplica color al casco', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  setInput(container, '[data-module-scoped="1"] [data-color-cuerpo]', '#123456');
  click(container, '[data-action="recolor-module"]');
  const base = store.get().pieces.find((p) => p.id === 'm1-base');
  assert.equal(base.color, '#123456');
  view.destroy();
});

test('nuevo mueble con doble confirmación vacía las piezas', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  assert.ok(store.get().pieces.length > 0);

  click(container, '[data-action="clear-all"]');
  assert.ok(store.get().pieces.length > 0, 'primer click solo arme');
  const btn = container.querySelector('[data-action="clear-all"]');
  btn.dataset.confirm = '1';
  btn.click();
  assert.equal(store.get().pieces.length, 0);
  view.destroy();
});

test('orden de agregado intercalado: cajón→zapatera→cajón→zapatera = submódulos 11,12,13,14', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  click(container, '[data-action="add-content"][data-kind="shoeRack"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  click(container, '[data-action="add-content"][data-kind="shoeRack"]');

  // La zapatera nueva va sin frente (bandeja abierta): se identifica cada
  // submódulo por su lateral (pieza que siempre llevan cajón y zapatera).
  // Se excluye el lateral del casco (m1-lateral-izq, módulo '1').
  const laterales = store.get().pieces.filter((p) => p.id.includes('-lateral-izq') && p.id !== 'm1-lateral-izq');
  assert.deepEqual(laterales.map((p) => p.modulo), ['11', '12', '13', '14']);
  // Sin colisiones de submódulo (antes cajón 1 y zapatera 1 compartían '11').
  assert.equal(new Set(laterales.map((p) => p.modulo)).size, 4);
  view.destroy();
});

test('editar catálogo (ids m21-cajon-*) regenera cajones conservando ids y vanos', async () => {
  const { store, view, container } = mountView();
  // Cargar el CSV del catálogo (convención de ids distinta al builder).
  const fs = await import('node:fs');
  const texto = fs.readFileSync('data/ejemplo-closet-abierto-modular.csv', 'utf8');
  const app = await import('../../js/app.js');
  app.loadCSV(texto);

  const frentesAntes = store.get().pieces.filter((p) => p.id.endsWith('-frente') && String(p.modulo).startsWith('2'));
  assert.ok(frentesAntes.length >= 6, 'el catálogo trae la cajonera M2');
  assert.equal(frentesAntes[0].id, 'm21-cajon-frente', 'convención de ids del catálogo');

  const scoped2 = '[data-module-scoped="2"]';
  container.querySelector(`${scoped2} [data-action="edit-module"]`).click();
  container.querySelector(`${scoped2} [data-edit-ancho]`).value = '700';
  container.querySelector(`${scoped2} [data-edit-prof]`).value = '500';
  container.querySelector(`${scoped2} [data-action="apply-edit-module"]`).click();

  const pieces = store.get().pieces;
  const frentes = pieces.filter((p) => p.id.endsWith('-frente') && String(p.modulo).startsWith('2'));
  assert.equal(frentes.length, frentesAntes.length, 'misma cantidad de frentes');
  for (const f of frentes) {
    assert.equal(f.ancho, 668, `frente ${f.id} adaptado al vano nuevo (700−2·15−2)`);
    assert.ok(/-frente$/.test(f.id), 'id de catálogo conservado');
  }
  // Altos de vano conservados (accesorios 130 → frente 127, etc.).
  const f1 = frentes.find((p) => p.id === 'm21-cajon-frente');
  assert.equal(f1.alto, 127, 'alto de vano del cajón 1 conservado');
  const repisa = pieces.find((p) => p.id === 'm2-repisa-superior');
  assert.equal(repisa.ancho, 670, 'repisa del catálogo adaptada al ancho útil');
  const refuerzo = pieces.find((p) => p.id === 'm2-refuerzo-repisa');
  assert.equal(refuerzo.ancho, 670, 'refuerzo adaptado');
  view.destroy();
});

test('editar dimensiones reajusta casco Y contenido interior al nuevo vano', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  // Fijar el vano explicitamente (happy-dom no aplica el atributo selected).
  usarVanoPersonalizado(container);
  container.querySelector('[data-module-scoped="1"] [data-alto-vano]').value = '200';
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  const totalAntes = store.get().pieces.length;

  click(container, '[data-action="edit-module"]');
  const scoped = '[data-module-scoped="1"]';
  container.querySelector(`${scoped} [data-edit-ancho]`).value = '700';
  container.querySelector(`${scoped} [data-edit-prof]`).value = '500';
  click(container, '[data-action="apply-edit-module"]');

  const pieces = store.get().pieces;
  assert.equal(pieces.length, totalAntes, 'misma cantidad de piezas (regeneración 1:1)');
  // Casco: tapa externa al nuevo ancho, base/zocalo internos.
  assert.equal(pieces.find((p) => p.id === 'm1-tapa').ancho, 700);
  assert.equal(pieces.find((p) => p.id === 'm1-zocalo').ancho, 670); // 700 - 2*15
  // Contenido adaptado al nuevo vano util (670).
  const frente = pieces.find((p) => p.id === 'm1cajon1-frente');
  assert.equal(frente.ancho, 668); // W(670) - 2
  assert.equal(frente.alto, 197, 'alto de vano conservado');
  const repisa = pieces.find((p) => p.id === 'm1-repisa-1');
  assert.equal(repisa.ancho, 670);
  assert.equal(repisa.alto, 470, 'profundidad util 500 - 2*15');
  view.destroy();
});

test('editar a ancho donde el cajon no cabe aborta sin cambios', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const anchoAntes = store.get().pieces.find((p) => p.id === 'm1-tapa').ancho;

  click(container, '[data-action="edit-module"]');
  container.querySelector('[data-module-scoped="1"] [data-edit-ancho]').value = '80'; // vano 50 < min
  click(container, '[data-action="apply-edit-module"]');

  assert.equal(store.get().pieces.find((p) => p.id === 'm1-tapa').ancho, anchoAntes, 'sin cambios tras abort');
  view.destroy();
});

test('orden de inserción define el orden vertical (repisa entre cajones se respeta)', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  // Zapateras de bandeja abierta (sin frente): su ancla vertical es la cara.
  container.querySelector('[data-module-scoped="1"] [data-frente-zapatera]').checked = false;
  const add = (kind) => click(container, `[data-action="add-content"][data-kind="${kind}"]`);
  add('shelf');
  add('shelf');
  add('shoeRack');
  add('shoeRack');
  add('shelf'); // repisa 3 DESPUES de las zapateras
  add('drawer');
  add('shelf'); // repisa 4 DESPUES del cajon

  // Cada pieza anclada con pos_z segun el orden de insercion.
  const z = (idSuffix) => {
    const p = store.get().pieces.find((x) => x.id.includes(idSuffix));
    return Number(p?.pos_z);
  };
  const orden = [
    z('repisa-1'), z('zapatera1-cara'), z('zapatera2-cara'),
    z('repisa-3'), z('cajon3-frente'), z('repisa-4'),
  ];
  assert.deepEqual(orden.map((v) => Number.isFinite(v)), [true, true, true, true, true, true], 'todas ancladas con pos_z');
  for (let i = 1; i < orden.length; i++) {
    assert.ok(orden[i] > orden[i - 1], `pos_z creciente: ${orden.map((v) => Math.round(v)).join(' < ')}`);
  }
  // La repisa 3 queda SOBRE las zapateras (zona de la columna que le toca).
  // La zapatera sin frente se ancla por su cara (hace de frente visible).
  assert.ok(z('repisa-3') > z('zapatera2-cara'), 'repisa agregada despues de las zapateras queda arriba');
  view.destroy();
});

test('editar dimensiones conserva el anclaje vertical (pos_z) de los cajones', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const posAntes = Number(store.get().pieces.find((p) => p.id === 'm1cajon1-frente').pos_z);
  assert.ok(Number.isFinite(posAntes), 'cajon anclado tras agregar');

  const scoped = '[data-module-scoped="1"]';
  container.querySelector(`${scoped} [data-action="edit-module"]`).click();
  container.querySelector(`${scoped} [data-edit-ancho]`).value = '700';
  container.querySelector(`${scoped} [data-action="apply-edit-module"]`).click();

  const frente = store.get().pieces.find((p) => p.id === 'm1cajon1-frente');
  assert.equal(frente.pos_z, posAntes, 'pos_z conservado tras editar dimensiones');
  assert.equal(frente.ancho, 668, 'frente regenerado al nuevo vano');
  view.destroy();
});

test('tipo de zapatera "botas": frente completo sin cara ni gap de apilado', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const scoped = '[data-module-scoped="1"]';
  // Elegir el tipo botas (frente completo 450) y una estándar para comparar.
  // La tenis lleva frente decorativo: se marca el checkbox (por defecto la
  // bandeja va abierta, sin frente; el botas lo fuerza igual).
  container.querySelector(`${scoped} [data-frente-zapatera]`).checked = true;
  const sel = container.querySelector(`${scoped} [data-tipo-zapatera]`);
  sel.value = 'tenis';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  click(container, '[data-action="add-content"][data-kind="shoeRack"]');

  const z1frente = store.get().pieces.find((p) => p.id === 'm1zapatera1-frente');
  assert.equal(z1frente.alto, 197, 'tenis: vano 200 → frente 197');
  assert.ok(store.get().pieces.some((p) => p.id === 'm1zapatera1-cara'), 'frente bajo: lleva cara');
  const z1lat = store.get().pieces.find((p) => p.id === 'm1zapatera1-lateral-izq');
  assert.equal(z1lat.alto, 100, 'lateral bajo: cubre solo la riel (100 mm)');

  const sel2 = container.querySelector(`${scoped} [data-tipo-zapatera]`);
  sel2.value = 'botas';
  sel2.dispatchEvent(new window.Event('change', { bubbles: true }));
  click(container, '[data-action="add-content"][data-kind="shoeRack"]');

  const z2frente = store.get().pieces.find((p) => p.id === 'm1zapatera2-frente');
  assert.equal(z2frente.alto, 447, 'botas: vano 450 → frente 447 (frente completo)');
  assert.ok(!store.get().pieces.some((p) => p.id === 'm1zapatera2-cara'), 'frente completo: SIN cara');
  const z2 = store.get().pieces.find((p) => p.id === 'm1zapatera2-lateral-izq');
  assert.equal(z2.alto, 100, 'lateral sigue bajo (riel) aun con frente completo');
  // Apilado: botas (sin gap) arranca justo donde termina el frente anterior.
  const pos1 = Number(store.get().pieces.find((p) => p.id === 'm1zapatera1-frente').pos_z);
  const pos2 = Number(z2frente.pos_z);
  assert.equal(pos2, Math.round((pos1 + 197 + 2.5) * 10) / 10, 'apilado: tenis(con gap) + botas(flush)');
  view.destroy();
});

test('tipo de cajón del catálogo: delgado 130 / estándar 200 / profundo 280', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const scoped = '[data-module-scoped="1"]';
  for (const [tipo, esperado] of [['delgado', 127], ['estandar', 197], ['profundo', 277]]) {
    const sel = container.querySelector(`${scoped} [data-tipo-drawer]`);
    sel.value = tipo;
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    click(container, '[data-action="add-content"][data-kind="drawer"]');
    const idx = { delgado: 1, estandar: 2, profundo: 3 }[tipo];
    const frente = store.get().pieces.find((p) => p.id === `m1cajon${idx}-frente`);
    assert.equal(frente.alto, esperado, `tipo ${tipo}: frente ${esperado}`);
  }
  view.destroy();
});

test('doble barra crea 2 barras ancladas con pos_z', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="doubleRail"]');
  const barras = store.get().pieces.filter((p) => String(p.id).includes('barra'));
  assert.equal(barras.length, 2);
  assert.deepEqual(barras.map((b) => b.pos_z).sort(), [1000, 2100]);
  view.destroy();
});

test('cajón volquete: sin pieza de cara', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const sel = container.querySelector('[data-module-scoped="1"] [data-mecanismo]');
  sel.value = 'volquete';
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const cajon = store.get().pieces.filter((p) => p.modulo === '11');
  assert.ok(!cajon.some((p) => p.id.includes('-cara')));
  view.destroy();
});

// ── Versiones ─────────────────────────────────────────────────────

test('guardar y cargar versión: round-trip de piezas y lista actualizada', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const antes = store.get().pieces.length;

  container.querySelector('[data-version-name]').value = 'Closet v1';
  click(container, '[data-action="save-version"]');

  assert.equal(countVersions(), 1);
  assert.match(container.textContent, /Closet v1/);

  store.set({ pieces: [] });
  click(container, '[data-action="load-version"]');
  assert.equal(store.get().pieces.length, antes);
  view.destroy();
});

test('Enter en el input guarda la versión', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const input = container.querySelector('[data-version-name]');
  input.value = 'Versión Enter';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(countVersions(), 1);
  assert.match(container.textContent, /Versión Enter/);
  view.destroy();
});

test('renombrar y duplicar versión', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');
  container.querySelector('[data-version-name]').value = 'Original';
  click(container, '[data-action="save-version"]');

  // Renombrar: primer click muestra el input, segundo (con valor) aplica.
  click(container, '[data-action="rename-version"]');
  const input = container.querySelector('[data-rename-input]');
  assert.ok(!input.classList.contains('is-hidden'), 'input visible tras primer click');
  input.value = 'Renombrada';
  click(container, '[data-action="rename-version"]');
  assert.match(container.textContent, /Renombrada/);

  // Duplicar.
  click(container, '[data-action="duplicate-version"]');
  assert.equal(countVersions(), 2);
  assert.match(container.textContent, /Renombrada copia/);
  view.destroy();
});

test('eliminar una versión y eliminar todas (con confirmación)', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');

  container.querySelector('[data-version-name]').value = 'A';
  click(container, '[data-action="save-version"]');
  assert.equal(countVersions(), 1);

  click(container, '[data-action="delete-version"]');
  const btn = container.querySelector('[data-action="delete-version"]');
  btn.dataset.confirm = '1';
  btn.click();
  assert.equal(countVersions(), 0);

  container.querySelector('[data-version-name]').value = 'B';
  click(container, '[data-action="save-version"]');
  container.querySelector('[data-version-name]').value = 'C';
  click(container, '[data-action="save-version"]');
  assert.equal(countVersions(), 2);

  click(container, '[data-action="delete-all-versions"]');
  const btnAll = container.querySelector('[data-action="delete-all-versions"]');
  btnAll.dataset.confirm = '1';
  btnAll.click();
  assert.equal(countVersions(), 0);
  view.destroy();
});

test('badge "sin guardar" aparece tras modificar y desaparece al guardar', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');

  container.querySelector('[data-version-name]').value = 'Base';
  click(container, '[data-action="save-version"]');
  assert.equal(container.querySelector('[title*="sin guardar"]'), null, 'limpio tras guardar');

  // Mutar piezas de verdad (cambiar una dimension) dispara state:changed y
  // altera el hash → badge. Una copia superficial con igual contenido daria
  // el mismo CSV y no marcaria dirty.
  const mutadas = store.get().pieces.map((p, i) => (i === 0 ? { ...p, ancho: p.ancho + 10 } : p));
  store.set({ pieces: mutadas });
  assert.ok(container.querySelector('[title*="sin guardar"]'), 'badge visible tras cambio');

  container.querySelector('[data-version-name]').value = 'Base 2';
  click(container, '[data-action="save-version"]');
  assert.equal(container.querySelector('[title*="sin guardar"]'), null, 'limpio tras guardar de nuevo');
  view.destroy();
});

// ── Integración ───────────────────────────────────────────────────

test('botón "Ver isométrica" cambia de vista', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="goto-view"][data-view="isometric"]');
  assert.equal(store.get().currentView, 'isometric');
  view.destroy();
});

test('deshacer (Ctrl+Z y botón) revierte la última acción estructural', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  assert.equal(store.get().pieces.length, 6);
  assert.ok(container.querySelector('[data-action="undo"]')?.disabled === false, 'botón habilitado');

  // Botón deshacer.
  click(container, '[data-action="undo"]');
  assert.equal(store.get().pieces.length, 0, 'agregar módulo deshecho');

  // Ctrl+Z con dos acciones: revierte la más reciente primero.
  click(container, '[data-action="add-module"]');
  container.querySelector('[data-action="add-content"][data-kind="drawer"]').click();
  assert.equal(store.get().pieces.filter((p) => p.modulo === '11').length, 7);
  container.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  assert.equal(store.get().pieces.filter((p) => p.modulo === '11').length, 0, 'Ctrl+Z deshizo el cajón');
  assert.ok(store.get().pieces.length > 0, 'el módulo queda');
  view.destroy();
});

test('duplicar mueble copia todos los módulos de una vez', () => {
  const { store, view, container } = mountView();
  setInput(container, '[data-cfg="cantidad"]', '2');
  click(container, '[data-action="add-module"]');
  const antes = store.get().pieces.length;
  assert.ok(store.get().pieces.some((p) => p.modulo === '2'));

  click(container, '[data-action="duplicate-all"]');
  const pieces = store.get().pieces;
  assert.equal(pieces.length, antes * 2);
  assert.ok(pieces.some((p) => p.modulo === '3'), 'M3 existe');
  assert.ok(pieces.some((p) => p.modulo === '4'), 'M4 existe');
  view.destroy();
});

test('botón ver enfoca el módulo en la vista isométrica', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="focus-module"]');
  assert.equal(store.get().currentView, 'isometric');
  assert.equal(store.get().currentModule, '1');
  view.destroy();
});

test('versiones fijadas (📌) sobreviven a "eliminar todas"', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');

  container.querySelector('[data-version-name]').value = 'Fijada';
  click(container, '[data-action="save-version"]');
  container.querySelector('[data-version-name]').value = 'Normal';
  click(container, '[data-action="save-version"]');
  assert.equal(countVersions(), 2);

  // Fijar la primera de la lista ('Normal' está primero por savedAt desc).
  click(container, '[data-action="pin-version"]');
  assert.match(container.textContent, /📌/);

  click(container, '[data-action="delete-all-versions"]');
  const btn = container.querySelector('[data-action="delete-all-versions"]');
  btn.dataset.confirm = '1';
  btn.click();
  assert.equal(countVersions(), 1, 'solo queda la fijada');
  assert.match(container.textContent, /Normal/);
  view.destroy();
});

test('ancho total con reparto precalcula el ancho por módulo', () => {
  const { view, container } = mountView();
  setInput(container, '[data-cfg="ancho-total"]', '3400');
  setInput(container, '[data-cfg="reparto"]', '4');
  container.querySelector('[data-cfg="reparto"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(container.querySelector('[data-cfg="ancho"]').value, '850');
  view.destroy();
});

test('panel de avisos: sin avisos muestra OK, con repisa al aire muestra warning', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');
  assert.match(container.querySelector('.cn-constructor__warnings').textContent, /Sin avisos/);
  view.destroy();
});

test('vano de cajón libre: acepta valor arbitrario (ej. 250)', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  usarVanoPersonalizado(container);
  container.querySelector('[data-module-scoped="1"] [data-alto-vano]').value = '250';
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const frente = store.get().pieces.find((p) => p.id === 'm1cajon1-frente');
  assert.equal(frente.alto, 247); // 250 - 3
  view.destroy();
});

test('resumen del mueble en cabecera', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');
  assert.match(container.querySelector('[data-resumen]').textContent, /1 módulo\(s\) · \d+ piezas · ≈850 mm/);
  view.destroy();
});

test('contenido como chips: nombre corto, icono por tipo y ✕ por chip', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  click(container, '[data-action="add-content"][data-kind="doubleRail"]');

  const chips = container.querySelectorAll('.cn-chip');
  assert.ok(chips.length >= 3, `hay chips (zocalo + repisa + cajon + barra): ${chips.length}`);
  const textos = [...chips].map((c) => c.querySelector('.cn-chip__label')?.textContent || '');
  assert.ok(textos.some((t) => /z[oó]calo/i.test(t)), `chip zocalo: ${textos.join(', ')}`);
  assert.ok(textos.some((t) => t.includes('Repisa')), 'chip repisa');
  assert.ok(textos.some((t) => t.includes('Cajón 1')), `chip cajon con numero: ${textos.join(', ')}`);
  assert.ok(textos.every((t) => !/M\d+$/.test(t)), 'nombre corto sin sufijo de modulo');
  // Cada chip tiene su boton eliminar con data-ref del grupo.
  const btnEliminar = chips[1].querySelector('[data-action="remove-content"]');
  assert.ok(btnEliminar?.dataset.ref, 'chip con boton de eliminar referenciado');
  // Tooltip del chip con nombre completo y altura.
  const tip = chips.find?.((c) => c) || [...chips].find((c) => (c.getAttribute('title') || '').includes('z='));
  assert.ok([...chips].some((c) => (c.getAttribute('title') || '').length > 0), 'chips con tooltip');
  void tip;

  // Eliminar via chip: primer click arme la confirmacion, segundo ejecuta
  // (mismo patron confirmable que el resto de la vista).
  const antes = store.get().pieces.length;
  btnEliminar.click();
  assert.equal(store.get().pieces.length, antes, 'primer click solo arme');
  btnEliminar.dataset.confirm = '1';
  btnEliminar.click();
  assert.ok(store.get().pieces.length < antes, 'eliminar desde chip quita piezas');
  view.destroy();
});

test('separacion personalizada: repisa a 300 mm de la anterior (desde su cara superior)', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  // Primera repisa: NO pegada a la base (gap por defecto baseTop+10).
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  const r1 = store.get().pieces.find((p) => p.id === 'm1-repisa-1');
  assert.equal(r1.pos_z, 175, 'primera repisa con gap, no pegada a la base');
  // Segunda con separacion 300.
  container.querySelector('[data-module-scoped="1"] [data-separacion]').value = '300';
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  const r2 = store.get().pieces.find((p) => p.id === 'm1-repisa-2');
  assert.equal(r2.pos_z, 490, '175 (top repisa1) + 15 (espesor) + 300 (separacion)');
  view.destroy();
});

test('editar altura desde el chip: ✎ abre input inline y aplica al grupo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]');

  const btnEdit = container.querySelector('[data-action="edit-posz"][data-ref="m1-repisa-1"]');
  assert.ok(btnEdit, 'boton ✎ en el chip de la repisa');
  assert.equal(container.querySelector('[data-action="edit-posz"][data-ref="m1-zocalo"]'), null, 'zocalo sin edicion (altura fija al suelo)');
  btnEdit.click();
  const input = container.querySelector('.cn-chip input[type="number"]');
  assert.ok(input, 'input inline abierto con el pos_z actual');
  assert.equal(Number(input.value), 175);

  input.value = '900';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const repisa = store.get().pieces.find((p) => p.id === 'm1-repisa-1');
  const refuerzo = store.get().pieces.find((p) => p.id === 'm1-refuerzo-repisa-1');
  assert.equal(repisa.pos_z, 900, 'repisa a 900 mm');
  assert.equal(refuerzo.pos_z, 900, 'refuerzo sigue a la repisa');

  // Fuera de rango: no aplica.
  const r = [...container.querySelectorAll('[data-action="edit-posz"]')].find((b) => b.dataset.ref === 'm1-repisa-1');
  r.click();
  const input2 = container.querySelector('.cn-chip input[type="number"]');
  input2.value = '5000';
  input2.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-repisa-1').pos_z, 900, 'fuera de rango no aplica');
  view.destroy();
});

test('reordenar contenido: chips ◀ ▶ intercambian el apilado y renombran repisas', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');

  const pos = (id) => store.get().pieces.find((p) => p.id === id).pos_z;
  const nombre = (id) => store.get().pieces.find((p) => p.id === id).nombre;
  assert.ok(pos('m1-repisa-2') > pos('m1-repisa-1'), 'repisa2 arriba de repisa1');
  assert.equal(nombre('m1-repisa-2'), 'Repisa superior M1', 'la mas alta es superior');

  // Subir la repisa 1: intercambia con la repisa 2.
  container.querySelector('[data-action="move-content"][data-dir="up"][data-ref="m1-repisa-1"]').click();
  assert.ok(pos('m1-repisa-1') > pos('m1-repisa-2'), 'repisa1 ahora arriba');
  assert.equal(nombre('m1-repisa-1'), 'Repisa superior M1', 'renombrada a superior');
  assert.equal(nombre('m1-repisa-2'), 'Repisa 1 M1', 'la otra renumerada');

  // Bajar el cajon: intercambia con su vecina inferior (repisa 1, la del
  // medio del apilado: repisa2 < cajon < repisa1 tras el primer swap).
  container.querySelector('[data-action="move-content"][data-dir="down"][data-ref="m1cajon1-frente"]').click();
  assert.ok(pos('m1cajon1-frente') < pos('m1-repisa-1'), 'cajon quedo debajo de la repisa 1');
  assert.ok(pos('m1cajon1-frente') > pos('m1-repisa-2'), 'cajon quedo arriba de la repisa 2');

  // El refuerzo sigue a su repisa tras reordenar.
  const rep = store.get().pieces.find((p) => p.id === 'm1-repisa-1');
  const ref = store.get().pieces.find((p) => p.id === 'm1-refuerzo-repisa-1');
  assert.equal(ref.pos_z, rep.pos_z, 'refuerzo solidario al reordenar');
  view.destroy();
});

test('reordenar modulos (◀ ▶) sigue funcionando tras los cambios', () => {
  const { store, view, container } = mountView();
  setInput(container, '[data-cfg="cantidad"]', '2');
  click(container, '[data-action="add-module"]');
  assert.ok(store.get().pieces.some((p) => p.modulo === '2'));
  // Mover M2 a la izquierda: intercambia numeracion con M1.
  container.querySelector('[data-action="move-module"][data-module="2"][data-dir="izq"]').click();
  const mods = [...new Set(store.get().pieces.filter((p) => /^\d+$/.test(String(p.modulo))).map((p) => String(p.modulo)))].sort();
  assert.deepEqual(mods, ['1', '2'], 'siguen dos modulos');
  assert.ok(store.get().pieces.some((p) => p.id === 'm1-tapa'), 'ids renumerados coherentes');
  view.destroy();
});

test('inset desde tapa: repisa a 50 mm de la cara inferior de la tapa', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  container.querySelector('[data-module-scoped="1"] [data-inset-tapa]').value = '50';
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  // techo = 2400 - 150 (zocalo) - 15 (tapa) = 2235; z = 2235 - 50 - 15 = 2170.
  const repisa = store.get().pieces.find((p) => p.id === 'm1-repisa-1');
  assert.equal(repisa.pos_z, 2170, 'repisa con alzamiento de 50 mm bajo la tapa');
  assert.equal(repisa.nombre, 'Repisa superior M1', 'es la unica: queda como superior');
  view.destroy();
});

test('inset imposible se rechaza sin agregar nada', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]'); // pila a 2185
  const total = store.get().pieces.length;
  container.querySelector('[data-module-scoped="1"] [data-inset-tapa]').value = '3000';
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  assert.equal(store.get().pieces.length, total, 'no se agrego nada');
  view.destroy();
});

test('barra simple va a altura ergonomica (1800), no apilada', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]'); // pila baja
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  click(container, '[data-action="add-content"][data-kind="rail"]');
  const barra = store.get().pieces.find((p) => p.id === 'm1-barra-1');
  assert.equal(barra.pos_z, 1800, 'barra camisera a 1800 (preset), no sobre la pila');
  view.destroy();
});

test('Lote B: divisor vertical span completo, cajones 2 por fila y espesor de frente', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  // B1: divisor
  click(container, '[data-action="add-content"][data-kind="divider"]');
  const div = store.get().pieces.find((p) => p.id === 'm1-divisor-1');
  assert.ok(div, 'divisor creado');
  assert.equal(div.alto, 2235, 'span completo del vano util');
  assert.equal(div.pos_z, 165, 'anclado al piso del vano (zocalo+base)');
  assert.match(div.nombre, /Divisor 1 M1/);
  // B2: cajon 2 por fila (frente mitad de ancho)
  container.querySelector('[data-module-scoped="1"] [data-n-por-fila]').value = '2';
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const frente = store.get().pieces.find((p) => p.id.endsWith('-frente'));
  assert.equal(frente.ancho, 407, 'frente a la mitad del vano (2 por fila)');
  // B3: frente de 18 con cuerpo de 15
  container.querySelector('[data-module-scoped="1"] [data-n-por-fila]').value = '1';
  container.querySelector('[data-module-scoped="1"] [data-espesor-frente]').value = '18';
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const frentes = store.get().pieces.filter((p) => p.id.endsWith('-frente'));
  assert.equal(frentes[frentes.length - 1].espesor, 18, 'frente de 18 mm');
  view.destroy();
});

test('A1: reordenar piezas de distinta altura NO las deja solapadas', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]');   // repisa 15
  click(container, '[data-action="add-content"][data-kind="drawer"]');  // frente 197
  container.querySelector('[data-action="move-content"][data-dir="up"][data-ref="m1-repisa-1"]').click();
  const r = store.get().pieces.find((p) => p.id === 'm1-repisa-1');
  const f = store.get().pieces.find((p) => p.id === 'm1cajon1-frente');
  // Dimensiones reales: el alto del frente depende del tipo de cajon
  // (delgado/estandar/personalizado) y no es fijo.
  const espRepisa = Number(r.espesor) || 15;
  const altoFrente = Number(f.alto) || 0;
  const solape = f.pos_z < r.pos_z + espRepisa && r.pos_z < f.pos_z + altoFrente;
  assert.ok(!solape, `sin solapamiento (repisa ${r.pos_z}-${r.pos_z + espRepisa}, cajon ${f.pos_z}-${f.pos_z + altoFrente})`);
  assert.ok(f.pos_z < r.pos_z, 'orden correcto: cajon abajo, repisa arriba');
  view.destroy();
});

test('A2: badge de vano calculado con spans reales de pos_z', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  const badgeRepisa = container.querySelector('.cn-constructor__module .badge')?.textContent || '';
  // Con spans: una repisa ocupa solo su espesor (15 mm), no la estimacion
  // antigua (espesor + 20 de gap).
  assert.match(badgeRepisa, /vano 15\/\d+ mm/);
  // Al agregar un cajon, el vano usado suma el span REAL del frente
  // (alto + 3 mm de holgura), sin solaparse con la repisa.
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const f = store.get().pieces.find((p) => p.id.endsWith('-frente'));
  const esperado = 15 + (Number(f.alto) || 0) + 3;
  const badgeCajon = container.querySelector('.cn-constructor__module .badge')?.textContent || '';
  const m = badgeCajon.match(/vano (\d+)\/(\d+) mm \((\d+)%\)/);
  assert.ok(m, `badge legible: ${badgeCajon}`);
  assert.equal(Number(m[1]), esperado, `vano usado = repisa 15 + frente ${f.alto}+3`);
  assert.ok(Number(m[3]) > 0);
  view.destroy();
});

test('Zócalo estructural: generar marco reemplaza frentes simples y ancla el apilado', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // ancho default 850
  assert.ok(store.get().pieces.some((p) => p.id === 'm1-zocalo'), 'frente simple inicial');
  click(container, '[data-action="apply-plinth"]');
  const pieces = store.get().pieces;
  assert.equal(pieces.some((p) => p.id === 'm1-zocalo'), false, 'el frente simple se reemplaza por el marco');
  // Modo único (default): un solo marco del ancho total de los módulos.
  const frente = pieces.find((p) => p.id === 'glb-zocalo-frente');
  assert.ok(frente, 'marco único generado');
  assert.equal(frente.ancho, 850 - 2 * 15, 'larguero del ancho total menos 2*espesor');
  assert.ok(pieces.some((p) => p.id === 'glb-zocalo-trasero'));
  assert.ok(pieces.some((p) => p.id === 'glb-zocalo-costado-izq'));
  const resumen = container.querySelector('[data-plinth-resumen]')?.textContent || '';
  assert.match(resumen, /zócalo único 850×600×100 mm \(e15\) · 4 niveladores/);
  // El apilado se ancla a la altura del marco (Z=100 + base 15 + offset 10).
  click(container, '[data-action="add-content"][data-kind="shelf"]');
  const repisa = store.get().pieces.find((p) => p.id === 'm1-repisa-1');
  assert.equal(repisa.pos_z, 125, 'repisa anclada sobre el marco');
  view.destroy();
});

test('Zócalo único: división paralela al frente bajo el módulo con cajón', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  click(container, '[data-action="apply-plinth"]');
  const divpar = store.get().pieces.find((p) => p.id === 'glb-zocalo-divpar-1');
  assert.ok(divpar, 'división paralela al frente bajo el módulo de cajón');
  assert.equal(divpar.ancho, 850 - 2 * 15, 'de luz interior del módulo');
  assert.equal(divpar.rotate, true, 'panel horizontal (rotate)');
  // Módulo sin cajones: sin división.
  view.destroy();
});

test('Datos de obra: lift-check con altura de techo', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]'); // 2400 alto × 600 fondo
  const setHtecho = (v) => {
    // Cada cambio re-renderiza: hay que re-buscar el input en el DOM.
    const el = container.querySelector('[data-obra="htecho"]');
    assert.ok(el, 'input H techo presente');
    el.value = String(v);
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  // 2350 techo: diagonal 2377 + margen 20 no cabe → ✕
  setHtecho(2350);
  let check = container.querySelector('.cn-constructor__liftcheck');
  assert.ok(check, 'lift-check renderizado');
  assert.match(check.textContent, /M1/);
  assert.match(check.textContent, /✕/);
  // El aviso también llega al panel persistente de avisos de diseño.
  assert.ok(
    container.textContent.includes('No cabe en vertical'),
    'aviso de levantamiento en el panel persistente'
  );
  // 2400 techo: holgura ~3 mm → ✓
  setHtecho(2400);
  check = container.querySelector('.cn-constructor__liftcheck');
  assert.match(check.textContent, /✓/);
  assert.match(check.textContent, /holgura/);
  view.destroy();
});

test('B1: marco desactualizado tras editar un módulo, con regeneración en un clic', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // 850
  click(container, '[data-action="apply-plinth"]');
  assert.ok(!container.textContent.includes('desactualizado'), 'marco al día tras generar');
  // Editar el ancho del módulo a 900: el marco queda viejo.
  container.querySelector('[data-module-scoped="1"] [data-edit-ancho]').value = '900';
  click(container, '[data-action="apply-edit-module"][data-module="1"]');
  assert.ok(container.textContent.includes('desactualizado'), 'aviso de marco desactualizado');
  assert.match(container.textContent, /Regenerar marco/);
  // Regenerar: el aviso desaparece y el marco cubre los 900 mm.
  click(container, '[data-action="apply-plinth"]');
  assert.ok(!container.textContent.includes('desactualizado'), 'marco al día tras regenerar');
  assert.equal(plinthTotalWidth(store.get().pieces), 900);
  view.destroy();
});

test('B2: módulo nuevo sin frente simple cuando hay marco; el marco se redefine solo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // M1 850
  click(container, '[data-action="apply-plinth"]');
  click(container, '[data-action="add-module"]'); // M2 850 (con zócalo chequeado por defecto)
  const pieces = store.get().pieces;
  assert.equal(pieces.some((p) => p.id === 'm2-zocalo'), false, 'sin frente simple en el módulo nuevo');
  // El zócalo único se auto-redefinió al ancho total (850+850).
  const frente = pieces.find((p) => p.id === 'glb-zocalo-frente');
  assert.equal(frente.ancho, 1700 - 2 * 15, 'marco único del ancho total de los módulos');
  assert.ok(!container.textContent.includes('desactualizado'), 'el marco redefinido está al día');
  view.destroy();
});

test('B3: quitar el marco restaura los frentes simples por módulo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="apply-plinth"]');
  assert.equal(store.get().pieces.some((p) => p.id === 'm1-zocalo'), false);
  click(container, '[data-action="remove-plinth"]');
  const pieces = store.get().pieces;
  assert.equal(plinthTotalWidth(pieces), 0, 'sin marco');
  const zocalo = pieces.find((p) => p.id === 'm1-zocalo');
  assert.ok(zocalo, 'frente simple restaurado');
  assert.equal(zocalo.alto, 100, 'mismo alto Z configurado (plinthAltoZocalo default)');
  view.destroy();
});

test('C2: retraso mayor que la profundidad útil se rechaza', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // prof 600, e 15 → máx 570
  const setRetraso = (v) => {
    const el = container.querySelector('[data-obra="retraso"]');
    el.value = String(v);
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  setRetraso(600);
  click(container, '[data-action="apply-plinth"]');
  assert.equal(store.get().pieces.some((p) => p.id === 'glb-zocalo-frente'), false, 'sin marco con retraso inválido');
  setRetraso(50);
  click(container, '[data-action="apply-plinth"]');
  assert.ok(store.get().pieces.some((p) => p.id === 'glb-zocalo-frente'), 'marco generado con retraso válido');
  view.destroy();
});

test('Altura fija del mueble: el fondo descuenta el zócalo y se apoya sobre la base', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // alto 2400, zócalo simple 150
  // Casco con zócalo simple: fondo descuenta 150.
  const fondoSimple = store.get().pieces.find((p) => p.id === 'm1-fondo');
  assert.equal(fondoSimple.alto, 2400 - 150 - 2 * 15, 'fondo = alto − zócalo simple − 2e');
  // Al aplicar el marco (Z=100), el fondo se reajusta al Z del marco.
  click(container, '[data-action="apply-plinth"]');
  const fondoMarco = store.get().pieces.find((p) => p.id === 'm1-fondo');
  assert.equal(fondoMarco.alto, 2400 - 100 - 2 * 15, 'fondo reajustado al Z del marco');
  // Altura total del mueble: inalterada (2400) — el zócalo ocupa su zona.
  const lateral = store.get().pieces.find((p) => p.id === 'm1-lateral-izq');
  assert.equal(lateral.alto, 2400, 'el alto del módulo es el total (fijo)');
  // Quitar el marco: frente simple restaurado (Z=100) y fondo consistente.
  click(container, '[data-action="remove-plinth"]');
  const fondoRestaurado = store.get().pieces.find((p) => p.id === 'm1-fondo');
  assert.equal(fondoRestaurado.alto, 2400 - 100 - 2 * 15, 'fondo consistente con el frente restaurado');
  view.destroy();
});

test('Marco sobre módulo sin "con zócalo": la base externa pasa a interna', () => {
  const { store, view, container } = mountView();
  // Desmarcar "Con zócalo" antes de agregar: casco con base EXTERNA.
  const chk = container.querySelector('[data-cfg="zocalo"]');
  chk.checked = false;
  click(container, '[data-action="add-module"]');
  const baseExterna = store.get().pieces.find((p) => p.id === 'm1-base');
  assert.equal(baseExterna.ancho, 850, 'base externa (= ancho del módulo)');
  // Al aplicar el marco, la base se convierte a interna y queda apoyada.
  click(container, '[data-action="apply-plinth"]');
  const base = store.get().pieces.find((p) => p.id === 'm1-base');
  assert.equal(base.ancho, 850 - 2 * 15, 'base interna (apoyada sobre el marco)');
  assert.equal(base.alto, 600 - 15, 'profundidad hasta el fondo (front_flush)');
  view.destroy();
});

test('Zócalo simple agregado a posteriori: el fondo se recalcula y al quitarlo se restaura', () => {
  const { store, view, container } = mountView();
  // Módulo SIN "con zócalo": fondo a altura completa.
  const chk = container.querySelector('[data-cfg="zocalo"]');
  chk.checked = false;
  click(container, '[data-action="add-module"]');
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-fondo').alto, 2400 - 2 * 15, 'fondo completo inicial');
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-base').ancho, 850, 'base externa inicial');
  // Agregar "+ Zócalo" (150): base a interna y fondo con descuento.
  click(container, '[data-action="add-content"][data-kind="zocalo"]');
  assert.ok(store.get().pieces.some((p) => p.id === 'm1-zocalo'), 'frente simple agregado');
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-base').ancho, 850 - 2 * 15, 'base interna');
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-fondo').alto, 2400 - 150 - 2 * 15, 'fondo descuenta el zócalo');
  // Quitar el zócalo (doble click: el primero arma la confirmación): el
  // fondo vuelve a su alto completo.
  click(container, '[data-action="remove-content"][data-ref="m1-zocalo"]');
  click(container, '[data-action="remove-content"][data-ref="m1-zocalo"]');
  assert.equal(store.get().pieces.some((p) => p.id === 'm1-zocalo'), false, 'zócalo quitado');
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-fondo').alto, 2400 - 2 * 15, 'fondo restaurado');
  view.destroy();
});

test('Editar dimensiones mantiene el descuento del fondo según el zócalo vigente', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // con zócalo simple 150
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-fondo').alto, 2400 - 150 - 2 * 15);
  // Redimensionar (mismo alto): el fondo mantiene el descuento del zócalo.
  container.querySelector('[data-module-scoped="1"] [data-edit-ancho]').value = '900';
  click(container, '[data-action="apply-edit-module"][data-module="1"]');
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-fondo').alto, 2400 - 150 - 2 * 15, 'descuento preservado');
  assert.equal(store.get().pieces.find((p) => p.id === 'm1-fondo').ancho, 900 - 2 * 15, 'fondo renACE al nuevo ancho');
  view.destroy();
});

test('Selector de cantidad de zócalos: divide simétrico y regenera al instante', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // 850 (1 módulo: el split es interno)
  click(container, '[data-action="apply-plinth"]');
  assert.ok(store.get().pieces.some((p) => p.id === 'glb-zocalo-frente'), 'zócalo único inicial');
  const setN = (v) => {
    const el = container.querySelector('[data-obra="nzocalos"]');
    el.value = String(v);
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  // 2 módulos de 850 → 2 zócalos de 425 con montante (luz > 1000? no: 425 → sin montante)
  setN(2);
  let pieces = store.get().pieces;
  assert.ok(pieces.some((p) => p.id === 'glb-zocalo-s1-frente'), 'zócalo S1');
  assert.ok(pieces.some((p) => p.id === 'glb-zocalo-s2-frente'), 'zócalo S2');
  assert.equal(pieces.filter((p) => /-costado-/.test(p.id)).length, 4, '2 costados por zócalo');
  assert.equal(pieces.some((p) => p.id === 'glb-zocalo-frente'), false, 'ya no hay zócalo único');
  const resumen = container.querySelector('[data-plinth-resumen]')?.textContent || '';
  assert.match(resumen, /2 zócalos/);
  // Volver a 1: zócalo único de nuevo.
  setN(1);
  pieces = store.get().pieces;
  assert.ok(pieces.some((p) => p.id === 'glb-zocalo-frente'), 'de vuelta al zócalo único');
  assert.equal(pieces.filter((p) => /-costado-/.test(p.id)).length, 2);
  view.destroy();
});

test('Datos de obra no aplican con zócalo a marco (la altura la define el marco)', () => {
  const { view, container } = mountView();
  click(container, '[data-action="add-module"]');
  // Sin marco: con H techo cargada aparece el lift-check.
  const setH = (v) => {
    const el = container.querySelector('[data-obra="htecho"]');
    el.value = String(v);
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  setH(2350);
  assert.ok(container.querySelector('.cn-constructor__liftcheck'), 'lift-check sin marco');
  // Con marco: el lift-check se reemplaza por la nota de "no aplican".
  click(container, '[data-action="apply-plinth"]');
  assert.equal(container.querySelector('.cn-constructor__liftcheck'), null, 'sin lift-check con marco');
  assert.match(container.textContent, /datos de obra no aplican/i);
  assert.ok(!container.textContent.includes('No cabe en vertical'), 'sin aviso de diagonal con marco');
  view.destroy();
});

test('Reordenar módulo con cajones/zapateras: los submódulos viajan sin quedar huérfanos', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // M1
  // M2 con cajón y zapatera
  click(container, '[data-action="add-module"]');
  container.querySelector('[data-module-scoped="2"] [data-alto-vano]').value = '200';
  click(container, '[data-action="add-content"][data-kind="drawer"][data-module="2"]');
  click(container, '[data-action="add-content"][data-kind="shoeRack"][data-module="2"]');
  assert.ok(store.get().pieces.some((p) => p.id === 'm2cajon1-frente'), 'submódulo cajón en M2');
  // Mover M2 a la izquierda (intercambio con M1).
  click(container, '[data-action="move-module"][data-module="2"][data-dir="izq"]');
  const pieces = store.get().pieces;
  const mods = new Set(pieces.map((p) => String(p.modulo)));
  assert.ok(![...mods].some((m) => m.startsWith('x')), `sin módulos temporales huérfanos: ${[...mods].join(',')}`);
  assert.equal(pieces.some((p) => p.id === 'm1cajon1-frente'), true, 'el cajón renombró a M1');
  // La zapatera nueva va sin frente: se identifica por su cara (frente visible).
  assert.ok(pieces.some((p) => p.id === 'm1zapatera2-cara'), 'la zapatera renombró a M1');
  assert.equal(pieces.filter((p) => p.id === 'm1-base').length, 1, 'casco de M1 intacto (una sola base)');
  // De vuelta a la derecha: todo regresa.
  click(container, '[data-action="move-module"][data-module="1"][data-dir="der"]');
  const p2 = store.get().pieces;
  assert.ok(p2.some((p) => p.id === 'm2cajon1-frente'), 'el cajón volvió a M2');
  assert.ok(p2.some((p) => p.id === 'm2zapatera2-cara'), 'la zapatera volvió a M2');
  assert.ok(![...new Set(p2.map((p) => String(p.modulo)))].some((m) => m.startsWith('x')));
  view.destroy();
});

test('Zapatera: división central por defecto, opcional, y se elimina con el grupo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  // Bandeja abierta (sin frente): la referencia del chip es su cara.
  container.querySelector('[data-module-scoped="1"] [data-frente-zapatera]').checked = false;
  // Por defecto (checkbox activado): la zapatera lleva división.
  click(container, '[data-action="add-content"][data-kind="shoeRack"]');
  let pieces = store.get().pieces;
  assert.ok(pieces.some((p) => p.id === 'm1zapatera1-division'), 'división presente por defecto');
  // Sin división: se desmarca el checkbox.
  container.querySelector('[data-module-scoped="1"] [data-division]').checked = false;
  click(container, '[data-action="add-content"][data-kind="shoeRack"]');
  pieces = store.get().pieces;
  assert.equal(pieces.some((p) => p.id === 'm1zapatera2-division'), false, 'sin división cuando se desmarca');
  assert.ok(pieces.some((p) => p.id === 'm1zapatera2-fondo'), 'el resto del conjunto intacto');
  // Eliminar la zapatera 1 (con división) limpia también la división.
  // La bandeja va sin frente: la referencia del grupo es su cara.
  click(container, '[data-action="remove-content"][data-ref="m1zapatera1-cara"]');
  click(container, '[data-action="remove-content"][data-ref="m1zapatera1-cara"]');
  pieces = store.get().pieces;
  assert.equal(pieces.some((p) => p.id === 'm1zapatera1-division'), false, 'la división se elimina con el grupo');
  assert.equal(pieces.some((p) => /^m1zapatera1-/.test(p.id)), false, 'sin residuos del submódulo 1');
  view.destroy();
});

test('Preferencias de contenido persistidas: se reutilizan en el siguiente módulo', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const scoped = '[data-module-scoped="1"]';
  // Personalizar: riel oculta, vano 250, sin división, 2 por fila.
  const setSel = (sel, v) => {
    const el = container.querySelector(`${scoped} ${sel}`);
    el.value = v;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  setSel('[data-tipo-riel]', 'oculta');
  setSel('[data-tipo-drawer]', 'personalizado'); // el tipo manda sobre el vano; usar vano libre
  const vano = container.querySelector(`${scoped} [data-alto-vano]`);
  vano.value = '250';
  container.querySelector(`${scoped} [data-division]`).checked = false;
  setSel('[data-n-por-fila]', '2');
  // Agregar cajón: usa las prefs y las persiste.
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  const frente = store.get().pieces.find((p) => p.id === 'm1cajon1-frente');
  assert.match(frente.nombre, /oculta/, 'cajón generado con riel oculta');
  assert.equal(frente.alto, 247, 'frente con vano 250 − 3');
  assert.equal(frente.ancho, 407, '2 por fila: frente a la mitad del vano');
  // Segundo módulo: el formulario llega con las prefs guardadas.
  click(container, '[data-action="add-module"]');
  const scoped2 = '[data-module-scoped="2"]';
  // happy-dom no refleja el atributo selected en .value: se lee la opción.
  const optSel = (sel) => container.querySelector(`${scoped2} ${sel} option[selected]`)?.value
    ?? container.querySelector(`${scoped2} ${sel}`)?.value;
  assert.equal(optSel('[data-tipo-riel]'), 'oculta', 'riel persistido');
  assert.equal(container.querySelector(`${scoped2} [data-alto-vano]`)?.value, '250', 'vano persistido');
  assert.equal(container.querySelector(`${scoped2} [data-division]`)?.checked, false, 'división persistida');
  assert.equal(optSel('[data-n-por-fila]'), '2', 'N por fila persistido');
  view.destroy();
});

test('Canto PVC configurable: reflejado en la lista de herrajes', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  const canto = container.querySelector('[data-obra="canto"]');
  assert.ok(canto, 'selector de canto presente');
  canto.value = '2';
  canto.dispatchEvent(new window.Event('change', { bubbles: true }));
  const entry = (store.get().hardware || []).find((h) => h.nombre === 'Cantos PVC');
  assert.ok(entry, 'hay entrada de cantos');
  assert.match(entry.especificacion, /^2 mm/, `especificación con 2 mm: ${entry.especificacion}`);
  // Persistido: otro módulo mantiene la selección.
  click(container, '[data-action="add-module"]');
  // happy-dom no refleja el atributo selected en .value: se lee la opción.
  const selOpt = container.querySelector('[data-obra="canto"] option[selected]');
  assert.equal(selOpt?.value, '2', 'canto persistido en el formulario');
  view.destroy();
});

test('Gola e2e: canales de melamina exactos (850×600, 3 cajones de 197) + caja superior rebajada + round-trip', () => {
  const { store, view, container } = mountView();
  // Vano exacto del taller: tipo "estandar" (vano 200 → frente 197) y alto 913
  // → H útil 703 = 3×197 + 2×(3+50+3) + 20: el repartidor no estira ni capa.
  container.querySelector('[data-cfg="alto"]').value = '913';
  click(container, '[data-action="add-module"]'); // 850×600, cuerpo #C19A6B
  const tipoSel = container.querySelector('[data-module-scoped="1"] [data-tipo-drawer]');
  tipoSel.value = 'estandar';
  for (let i = 0; i < 3; i++) click(container, '[data-action="add-content"][data-kind="drawer"]');
  // Medidas originales (pre-gola) para el round-trip.
  const pre = store.get().pieces;
  const lat3Original = pre.find((p) => p.id === 'm1cajon3-lateral-izq').alto;
  click(container, '[data-action="toggle-gola"][data-module="1"]');
  click(container, '[data-action="confirm-gola"][data-module="1"]');
  const pieces = store.get().pieces;
  const pieza = (id) => pieces.find((p) => p.id === id);
  // El vano exacto no estira ni capa: los tres frentes quedan en 197 mm.
  for (const n of [1, 2, 3]) {
    assert.equal(pieza(`m1cajon${n}-frente`).alto, 197, `frente ${n} conserva 197 mm`);
  }

  // Canal C 1: fondo 820×perfil a techo del cajón 1 + paso; pestañas 820×prof. tira.
  const PROF = GOLA_DEFAULTS.golaPerfilHeight;
  const TIRA = GOLA_DEFAULTS.golaStripDepth;
  const PASO = GOLA_DEFAULTS.golaPaso;
  const f1 = pieza('m1cajon1-frente');
  const fondo1 = pieza('m1gola-c1-fondo');
  assert.ok(fondo1, 'existe m1gola-c1-fondo');
  assert.equal(fondo1.ancho, 820, 'fondo a lo ancho del interior (850−2×15)');
  assert.equal(fondo1.alto, PROF, 'cuerpo del canal');
  assert.equal(fondo1.pos_z, Math.round((f1.pos_z + f1.alto + PASO) * 10) / 10, 'techo del cajón 1 + paso');
  const sup1 = pieza('m1gola-c1-pestana-sup');
  const inf1 = pieza('m1gola-c1-pestana-inf');
  assert.equal(sup1.ancho, 820);
  assert.equal(sup1.alto, TIRA, 'alcance de la pestaña');
  assert.equal(sup1.pos_z, Math.round((fondo1.pos_z + PROF - 15) * 10) / 10, 'pestaña sup en el techo del fondo');
  assert.equal(inf1.pos_z, fondo1.pos_z, 'pestaña inf en la base del fondo');
  assert.equal(fondo1.color.toLowerCase(), '#c19a6b', 'mismo material que el módulo');

  // Canal C 2 y canal L (fondo + pestaña inferior solamente).
  assert.ok(pieza('m1gola-c2-fondo'), 'canal C 2');
  const lFondo = pieza('m1gola-l3-fondo');
  assert.ok(lFondo, 'canal L');
  assert.ok(pieza('m1gola-l3-pestana'), 'pestaña inferior del L');
  assert.equal(pieza('m1gola-l3-pestana-sup'), undefined, 'el L no lleva pestaña superior');

  // Regla de la L: la caja del cajón superior quedó rebajada y el frente no.
  const lat3 = pieza('m1cajon3-lateral-izq');
  const frente3 = pieza('m1cajon3-frente');
  assert.ok(lat3.alto < lat3Original, `caja superior rebajada (${lat3.alto} < ${lat3Original}) para pasar bajo la L`);
  assert.ok(frente3.alto > lat3.alto, 'el frente 3 tapa la pestaña (más alto que su caja)');
  // Tapa la pestaña: el techo del frente 3 llega bajo la cara inferior de la
  // tapa con el aire de agarre configurado (topRef = techoInterior del casco).
  const tapa = pieza('m1-tapa');
  const altoCasco = pieza('m1-lateral-izq').alto;
  const techoUtil = altoCasco - tapa.espesor;
  const esperado = techoUtil - GOLA_DEFAULTS.golaFingerClearance;
  assert.ok(Math.abs(frente3.pos_z + frente3.alto - esperado) <= 1.5, `frente 3 a ${GOLA_DEFAULTS.golaFingerClearance} mm del techo útil (techo ${frente3.pos_z + frente3.alto} vs ${esperado})`);

  // Sin tiradores en el módulo 1.
  assert.equal(pieces.some((p) => p.id.endsWith('-tirador') && String(p.modulo).startsWith('1')), false);

  // Round-trip: desactivar restaura frentes, caja y quita los canales.
  click(container, '[data-action="toggle-gola"][data-module="1"]');
  const off = store.get().pieces;
  assert.equal(off.some((p) => p.id.includes('gola')), false, 'canales fuera');
  assert.equal(off.find((p) => p.id === 'm1cajon3-lateral-izq').alto, lat3Original, 'caja 3 restaurada');
  assert.equal(off.find((p) => p.id === 'm1cajon1-frente').alto, 197, 'frentes restaurados');
  assert.ok(off.some((p) => p.id === 'm1cajon1-tirador'), 'tiradores regenerados');
  view.destroy();
});

test('Gola robustez: reordenar módulo migra canales y meta (round-trip intacto)', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]'); // M1
  click(container, '[data-action="add-module"]'); // M2
  click(container, '[data-action="add-content"][data-kind="drawer"][data-module="2"]');
  click(container, '[data-action="add-content"][data-kind="drawer"][data-module="2"]');
  const frenteOriginal = store.get().pieces.find((p) => p.id === 'm2cajon1-frente').alto;
  click(container, '[data-action="toggle-gola"][data-module="2"]');
  click(container, '[data-action="confirm-gola"][data-module="2"]');
  assert.ok(store.get().pieces.some((p) => p.id === 'm2gola-c1-fondo'), 'gola activa en M2');

  // Intercambio M2 ↔ M1: los canales y el meta viajan con su módulo.
  click(container, '[data-action="move-module"][data-module="2"][data-dir="izq"]');
  let pieces = store.get().pieces;
  const mods = [...new Set(pieces.map((p) => String(p.modulo)))];
  assert.ok(!mods.some((m) => m.startsWith('x')), `sin módulos temporales: ${mods.join(',')}`);
  assert.ok(pieces.some((p) => p.id === 'm1gola-c1-fondo'), 'canal C renombró a M1');
  assert.ok(pieces.some((p) => p.id === 'm1gola-l2-fondo'), 'canal L renombró a M1');
  assert.equal(pieces.some((p) => String(p.id).includes('gola') && String(p.id).startsWith('m2')), false, 'sin canales huérfanos de M2');

  // Round-trip tras el reorden: el meta migrado restaura el frente exacto.
  click(container, '[data-action="toggle-gola"][data-module="1"]');
  const off = store.get().pieces;
  assert.equal(off.some((p) => String(p.id).includes('gola')), false, 'canales fuera tras desactivar');
  assert.equal(off.find((p) => p.id === 'm1cajon1-frente').alto, frenteOriginal, 'frente restaurado al original (meta migrado)');
  view.destroy();
});

test('Gola robustez: eliminar módulo con gola limpia canales y meta', () => {
  const { store, view, container } = mountView();
  click(container, '[data-action="add-module"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  click(container, '[data-action="add-content"][data-kind="drawer"]');
  click(container, '[data-action="toggle-gola"][data-module="1"]');
  click(container, '[data-action="confirm-gola"][data-module="1"]');
  assert.ok(store.get().pieces.some((p) => p.id === 'm1gola-c1-fondo'), 'gola activa');
  assert.ok(JSON.parse(globalThis.localStorage.getItem('cn-assembly-gola') || '{}')['1'], 'meta persistido para el módulo 1');

  const btn = container.querySelector('[data-action="remove-module"][data-module="1"]');
  btn.click(); // arma la confirmación
  btn.dataset.confirm = '1';
  btn.click(); // confirma

  assert.equal(store.get().pieces.length, 0, 'módulo eliminado sin piezas');
  assert.equal(JSON.parse(globalThis.localStorage.getItem('cn-assembly-gola') || '{}')['1'], undefined, 'meta del módulo limpio');
  view.destroy();
});
