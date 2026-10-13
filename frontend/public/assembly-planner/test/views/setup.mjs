// test/views/setup.mjs — Inyección de globals de happy-dom para los tests DOM.
// Debe ser el PRIMER import de cada *.dom.test.js: los módulos ESM se evalúan
// en orden de importación, así este setup corre antes que las vistas (varias
// tocan `document` al importarse, p. ej. app.js con su init() defensivo).

import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });

const globals = {
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Element: window.Element,
  Node: window.Node,
  DocumentFragment: window.DocumentFragment,
  Document: window.Document,
  SVGElement: window.SVGElement,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  InputEvent: window.InputEvent,
  FileReader: window.FileReader,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  // Node no expone requestAnimationFrame; shim suficiente para mount/destroy.
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
};

for (const [name, value] of Object.entries(globals)) {
  if (value === undefined) continue;
  // Algunos globals de Node (p. ej. navigator) son getters de solo lectura:
  // hay que redefinirlos con defineProperty.
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

/** Crea y adjunta un contenedor limpio al body. */
export function createContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

/** Resetea body y localStorage entre tests. */
export function resetDocument() {
  document.body.innerHTML = '';
  window.localStorage.clear();
}
