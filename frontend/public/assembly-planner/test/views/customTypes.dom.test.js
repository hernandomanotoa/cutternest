// test/views/customTypes.dom.test.js — Tipos personalizados del taller (panel
// del Constructor): crear un tipo, aparecer en el selector, agregar una
// zapatera con su contrato (vano + rim) y eliminar el tipo.
// NO corre en el runner puro: usar pnpm test:dom (o node --test directo).

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import { addModuleFromBuilder } from '../../js/app.js';
import { getContentType } from '../../js/core/contentTypes.js';
import { listCustomTypes } from '../../js/services/customTypesService.js';
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

function mountConstructor() {
  assert.ok(addModuleFromBuilder(MOD).ok);
  const view = createConstructorView(getStore());
  const container = createContainer();
  view.mount(container);
  return { view, container };
}

function crearTipoEnPanel(container, { nombre = 'Zapatera baja 140', vano = '140', lados = false, rim = '120' } = {}) {
  container.querySelector('[data-ct="label"]').value = nombre;
  container.querySelector('[data-ct="vano"]').value = vano;
  container.querySelector('[data-ct="lados"]').checked = lados;
  container.querySelector('[data-ct="rim"]').value = rim;
  container.querySelector('[data-action="save-custom-type"]').click();
}

test('crear un tipo personalizado: aparece en el selector y agrega con su contrato', () => {
  const { container } = mountConstructor();
  crearTipoEnPanel(container, { nombre: 'Zapatera baja 140', vano: '140' });

  // Persistido y resoluble como contrato completo.
  const customs = listCustomTypes();
  assert.equal(customs.length, 1);
  const t = getContentType('shoeRack', customs[0].id);
  assert.ok(t, 'resuelve desde el catálogo en vivo');
  assert.equal(t.altoVano, 140);
  assert.equal(t.fijoEnGola, true);

  // El selector de tipo del módulo ya lo lista tras el re-render.
  const opciones = [...container.querySelectorAll('[data-tipo-zapatera] option')].map((o) => o.value);
  assert.ok(opciones.includes(customs[0].id), `opción en el selector: ${opciones.join(', ')}`);

  // Agregar una zapatera con el tipo custom: vano del contrato.
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = customs[0].id;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  const frente = getStore().get().pieces.find((p) => p.id === 'm1zapatera1-frente');
  assert.ok(frente, 'frente creado (con frente por defecto)');
  assert.equal(frente.alto, 137, 'frente = vano custom 140 − 3');
  assert.match(frente.nombre, /\[cus-/, 'tag [cus-*] estampado: el contrato sobrevive al CSV');
});

test('tipo custom de bandeja a la vista: rim del contrato al agregar sin frente', () => {
  const { container } = mountConstructor();
  crearTipoEnPanel(container, { nombre: 'Bandeja 160', vano: '160', lados: true, rim: '110' });

  const id = listCustomTypes()[0].id;
  const sel = container.querySelector('[data-tipo-zapatera]');
  sel.value = id;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-frente-zapatera]').checked = false;
  container.querySelector('[data-action="add-content"][data-kind="shoeRack"]').click();

  const zap = getStore().get().pieces.filter((p) => String(p.id).includes('zapatera'));
  const altos = ['-lateral-izq', '-cara', '-fondo'].map((s) => zap.find((p) => p.id.endsWith(s))?.alto);
  assert.deepEqual(altos, [110, 110, 110], `rim custom 110 aplicado a todos los lados (vano 160): ${JSON.stringify(altos)}`);
  assert.equal(zap.some((p) => p.id.endsWith('-frente')), false, 'bandeja abierta');
});

test('eliminar el tipo: desaparece del selector y del catálogo', () => {
  const { container } = mountConstructor();
  crearTipoEnPanel(container, { nombre: 'Temporal 150' });
  const id = listCustomTypes()[0].id;

  const btn = container.querySelector(`[data-action="delete-custom-type"][data-id="${id}"]`);
  assert.ok(btn, 'botón eliminar listado');
  btn.click(); // primer click arme la confirmación
  btn.dataset.confirm = '1';
  btn.click();

  assert.equal(listCustomTypes().length, 0, 'eliminado del storage');
  assert.equal(getContentType('shoeRack', id), null, 'fuera del catálogo');
  const opciones = [...container.querySelectorAll('[data-tipo-zapatera] option')].map((o) => o.value);
  assert.ok(!opciones.includes(id), 'fuera del selector');
});
