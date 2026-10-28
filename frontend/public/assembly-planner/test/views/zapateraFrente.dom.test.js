// test/views/zapateraFrente.dom.test.js — Frente OPCIONAL de la zapatera:
//   - Por defecto la bandeja va ABIERTA: sin frente decorativo ni tirador
//     (el tirador va atornillado al frente).
//   - El checkbox "Frente zapatera" se persiste (contentFrenteZapatera) y
//     al activarlo la zapatera nueva lleva frente + tirador.
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

test('por defecto la zapatera va sin frente ni tirador (bandeja abierta)', () => {
  const { container } = armarModuloYVista();
  const checkbox = container.querySelector('[data-frente-zapatera]');
  assert.ok(checkbox, 'existe el checkbox de frente de zapatera');
  assert.equal(checkbox.checked, false, 'por defecto sin frente');

  agregarZapatera(container);

  const zap = piezasZapatera();
  assert.ok(zap.length > 0, 'se agregó la zapatera');
  assert.equal(zap.some((p) => p.id.endsWith('-frente')), false, 'sin frente decorativo');
  assert.equal(zap.some((p) => p.id.endsWith('-tirador')), false, 'sin tirador (va atornillado al frente)');
  assert.ok(zap.some((p) => p.id.endsWith('-cara')), 'la cara queda como frente visible/de agarre');
  // El ancla vertical quedó en la cara (la bandeja se apila como contenido).
  const cara = zap.find((p) => p.id.endsWith('-cara'));
  assert.ok(Number.isFinite(cara.pos_z), 'la cara quedó anclada con pos_z');
});

test('con el checkbox activado la zapatera lleva frente + tirador y la opción persiste', () => {
  const { view, container } = armarModuloYVista();
  const checkbox = container.querySelector('[data-frente-zapatera]');
  checkbox.checked = true;
  agregarZapatera(container);

  const zap = piezasZapatera();
  assert.ok(zap.some((p) => p.id.endsWith('-frente')), 'frente decorativo presente');
  assert.ok(zap.some((p) => p.id.endsWith('-tirador')), 'tirador presente (va con el frente)');
  assert.equal(loadUserConfig().contentFrenteZapatera, 1, 'opción persistida');

  // Al re-renderizar la vista, el checkbox recuerda la opción.
  view.mount(createContainer());
  const fresco = createContainer();
  const view2 = createConstructorView(getStore());
  view2.mount(fresco);
  assert.equal(fresco.querySelector('[data-frente-zapatera]').checked, true, 'checkbox marcado tras re-render');
});

test('eliminar el frente (contenido completo) elimina también el tirador', () => {
  const { container } = armarModuloYVista();
  const checkbox = container.querySelector('[data-frente-zapatera]');
  checkbox.checked = true;
  agregarZapatera(container);
  assert.ok(piezasZapatera().some((p) => p.id.endsWith('-tirador')));

  const r = removeContentPiece('m1zapatera1-frente');
  assert.ok(r.ok);
  const zap = piezasZapatera();
  assert.equal(zap.length, 0, 'el grupo completo (frente, caja y tirador) se eliminó');
});

test('el contador del botón "+ Zapatera (N)" cuenta la bandeja abierta (sin frente)', () => {
  const { container } = armarModuloYVista();
  const label = () => container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').textContent;
  assert.match(label(), /\(0\)/, 'sin zapateras: contador 0');

  // Bandeja abierta (default): no hay frente, pero la unidad cuenta.
  agregarZapatera(container);
  assert.match(label(), /\(1\)/, 'la bandeja abierta cuenta aunque no tenga frente');
  agregarZapatera(container);
  assert.match(label(), /\(2\)/, 'segunda zapatera: contador 2');

  // Con frente decorativo también cuenta (y no duplica: frente+cara = 1).
  container.querySelector('[data-frente-zapatera]').checked = true;
  agregarZapatera(container);
  assert.match(label(), /\(3\)/, 'con frente cuenta 1 por grupo (frente+cara no duplican)');

  // Eliminar una unidad baja el contador.
  const r = removeContentPiece('m1zapatera2-cara');
  assert.ok(r.ok);
  assert.match(label(), /\(2\)/, 'tras eliminar una unidad el contador baja a 2');
});
