// test/views/lineaPreset.dom.test.js — Presets de línea (P7): el select
// 'Línea' del alta de módulo precarga ancho/alto/profundidad/zócalo, persiste
// la elección (lineaPreset en userConfig) y cambia los vanos sugeridos del
// datalist (Cocina: 70/140/280). Solo defaults: sin lógica de geometría.
// NO corre en el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore, getStore } from '../../js/core/store.js';
import { addModuleFromBuilder } from '../../js/app.js';
import { loadUserConfig } from '../../js/services/userConfigService.js';
import { createConstructorView } from '../../js/views/constructorView.js';
import { createContainer, resetDocument } from './setup.mjs';

const MOD = { ancho: 850, alto: 2400, prof: 600, espesor: 15, colorCuerpo: '#C19A6B', conZocalo: true, alturaZocalo: 150 };

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

function montarVista() {
  assert.ok(addModuleFromBuilder(MOD).ok, 'módulo base (la tarjeta trae el datalist)');
  const view = createConstructorView(getStore());
  const container = createContainer();
  view.mount(container);
  return { view, container };
}

const cambiarLinea = (container, value) => {
  const sel = container.querySelector('[data-cfg="linea"]');
  assert.ok(sel, 'existe el select Línea');
  sel.value = value;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
};

test('default Clóset: el select arranca en closet y el datalist trae los vanos de clóset', () => {
  const { container } = montarVista();
  const sel = container.querySelector('[data-cfg="linea"]');
  assert.equal(sel.value, 'closet', 'default Clóset');
  const vanos = [...container.querySelectorAll('#cn-vanos-sugeridos option')].map((o) => Number(o.value));
  assert.deepEqual(vanos, [130, 180, 200, 220, 280], 'vanos sugeridos del Clóset');
  assert.equal(loadUserConfig().lineaPreset ?? 'closet', 'closet');
});

test('Cocina: precarga defaults (prof 560, con zócalo), persiste y cambia el datalist a 70/140/280', () => {
  const { container } = montarVista();
  cambiarLinea(container, 'cocina');

  assert.equal(Number(container.querySelector('[data-cfg="prof"]').value), 560, 'profundidad default 560');
  assert.equal(Number(container.querySelector('[data-cfg="alto"]').value), 870, 'alto default 870 (720 + zócalo 150)');
  assert.equal(container.querySelector('[data-cfg="zocalo"]').checked, true, 'con zócalo precargado');
  assert.equal(loadUserConfig().lineaPreset, 'cocina', 'elección persistida');

  // Re-render: el datalist de vanos refleja la línea elegida.
  const vanos = [...container.querySelectorAll('#cn-vanos-sugeridos option')].map((o) => Number(o.value));
  assert.deepEqual(vanos, [70, 140, 280], 'vanos sugeridos de Cocina');
});

test('Escritorio y Rack TV: precargan sus defaults y el alta usa el ancho del preset', () => {
  const { container } = montarVista();
  cambiarLinea(container, 'escritorio');
  assert.equal(Number(container.querySelector('[data-cfg="alto"]').value), 750);
  assert.equal(Number(container.querySelector('[data-cfg="prof"]').value), 500);
  assert.equal(container.querySelector('[data-cfg="zocalo"]').checked, false, 'escritorio sin zócalo');

  cambiarLinea(container, 'racktv');
  assert.equal(Number(container.querySelector('[data-cfg="alto"]').value), 500, 'rack TV dentro de 450–600');
  assert.equal(Number(container.querySelector('[data-cfg="prof"]').value), 400);
});

test('el alta con línea Cocina crea el módulo con la profundidad del preset', () => {
  const { container } = montarVista();
  cambiarLinea(container, 'cocina');
  container.querySelector('[data-action="add-module"]').click();
  const lateral = getStore().get().pieces.find((p) => p.id === 'm2-lateral-izq');
  assert.ok(lateral, 'módulo nuevo creado');
  assert.equal(Number(lateral.ancho), 560, 'el casco nuevo toma la profundidad del preset (560)');
});
