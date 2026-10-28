// test/utils/fullscreen.dom.test.js — Contrato de attachFullscreenToggle
// (js/utils/fullscreen.js) en happy-dom: request/exit/toggle según
// document.fullscreenElement, etiqueta del botón y limpieza de listeners.
// happy-dom no implementa la Fullscreen API: se mockea el estado mínimo
// (fullscreenElement, requestFullscreen, exitFullscreen) sobre los prototipos.
// NO corre en el runner puro (necesita DOM): usar test:dom o invocar este
// archivo directamente con node --test.

import '../views/setup.mjs';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { attachFullscreenToggle } from '../../js/utils/fullscreen.js';

const LABEL_ENTER = '⛶ Pantalla completa';
const LABEL_EXIT = 'Salir pantalla completa';

// Estado de pantalla completa mockeado + registro de llamadas.
let fullscreenEl = null;
const requests = [];
const exits = [];

function setFullscreen(el) {
  fullscreenEl = el;
  document.dispatchEvent(new Event('fullscreenchange'));
}

beforeEach(() => {
  fullscreenEl = null;
  requests.length = 0;
  exits.length = 0;
  document.body.innerHTML = '';

  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenEl,
  });
  window.Element.prototype.requestFullscreen = function mockRequest() {
    requests.push(this);
    return Promise.resolve();
  };
  document.exitFullscreen = function mockExit() {
    exits.push(this);
    return Promise.resolve();
  };
});

afterEach(() => {
  delete window.Element.prototype.requestFullscreen;
  delete document.exitFullscreen;
  delete document.fullscreenElement;
});

function createButtonAndTarget() {
  const target = document.createElement('div');
  target.className = 'card';
  const button = document.createElement('button');
  document.body.appendChild(target);
  target.appendChild(button);
  return { button, target };
}

describe('attachFullscreenToggle', () => {
  it('etiqueta inicial "entrar" y sin llamadas aún', () => {
    const { button, target } = createButtonAndTarget();
    attachFullscreenToggle(button, target);
    assert.equal(button.textContent, LABEL_ENTER);
    assert.equal(requests.length, 0);
    assert.equal(exits.length, 0);
  });

  it('click con nada en pantalla completa → requestFullscreen sobre el target', async () => {
    const { button, target } = createButtonAndTarget();
    attachFullscreenToggle(button, target);
    button.click();
    assert.equal(requests.length, 1);
    assert.equal(requests[0], target, 'el target es el que entra a pantalla completa');
    assert.equal(exits.length, 0);

    // El documento confirma el cambio: la etiqueta pasa a "salir".
    setFullscreen(target);
    assert.equal(button.textContent, LABEL_EXIT);
  });

  it('click en pantalla completa → exitFullscreen', () => {
    const { button, target } = createButtonAndTarget();
    attachFullscreenToggle(button, target);
    setFullscreen(target);
    assert.equal(button.textContent, LABEL_EXIT);

    button.click();
    assert.equal(exits.length, 1);
    assert.equal(requests.length, 0);

    setFullscreen(null);
    assert.equal(button.textContent, LABEL_ENTER);
  });

  it('el listener de fullscreenchange también atiende el webkitfullscreenchange', () => {
    const { button, target } = createButtonAndTarget();
    attachFullscreenToggle(button, target);
    fullscreenEl = target;
    document.dispatchEvent(new Event('webkitfullscreenchange'));
    assert.equal(button.textContent, LABEL_EXIT, 'etiqueta actualizada vía evento webkit');
  });

  it('detach(): el botón deja de conmutar y el documento deja de actualizar la etiqueta', () => {
    const { button, target } = createButtonAndTarget();
    const detach = attachFullscreenToggle(button, target);
    detach();

    button.click();
    assert.equal(requests.length, 0, 'click posterior al detach sin efecto');

    button.textContent = LABEL_ENTER;
    setFullscreen(target);
    assert.equal(button.textContent, LABEL_ENTER, 'el listener de documento se removió');
  });

  it('argumentos null devuelven un detach no-op', () => {
    const detach = attachFullscreenToggle(null, null);
    assert.equal(typeof detach, 'function');
    assert.doesNotThrow(() => detach());
  });

  it('sin soporte de Fullscreen API el botón se oculta', () => {
    const { button, target } = createButtonAndTarget();
    // Simula navegador sin la API: sombrear el mock del prototipo.
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: undefined,
    });
    try {
      attachFullscreenToggle(button, target);
      assert.equal(button.style.display, 'none');
      button.click();
      assert.equal(requests.length, 0, 'sin API no hay llamadas');
    } finally {
      delete document.documentElement.requestFullscreen;
    }
  });
});
