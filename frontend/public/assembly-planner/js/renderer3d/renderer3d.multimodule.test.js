// js/renderer3d/renderer3d.multimodule.test.js — Tests del modo multi-módulo
// de la vista 3D orbital: separación de 20 mm entre módulos en 'Vista
// completa' (ALL_MODULE_ID), ancho de escena real y explode/selección por
// pieza intactos.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer3D } from './renderer3D.js';
import { ensureModuleGap, MODULE_GAP_MM } from './moduleLayout.js';

// Stub mínimo de document para que Renderer3D pueda instanciar IsometricRenderer.
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      return {
        tagName: tag,
        style: {},
        appendChild() {},
        removeChild() {},
        addEventListener() {},
        removeEventListener() {},
      };
    },
  };
}

if (typeof window === 'undefined') {
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1920,
    innerHeight: 1080,
  };
}
let rafCallbacks = [];
if (typeof requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
}
if (typeof cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = () => {};
}
if (typeof performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() };
}

function createContainer() {
  const listeners = {};
  return {
    style: {},
    innerHTML: '',
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600 }; },
    addEventListener(event, fn) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach((fn) => fn(event));
    },
  };
}

const module1Pieces = [
  { id: 'm1-base', nombre: 'Base modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: '1' },
  { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 550, alto: 2300, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, cantos: 'T,B,L', modulo: '1' },
  { id: 'm1-lateral-der', nombre: 'Lateral derecho M1', ancho: 550, alto: 2300, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, cantos: 'T,B,R', modulo: '1' },
];
const module2Pieces = module1Pieces.map((p) => ({
  ...p,
  id: p.id.replace('m1', 'm2'),
  nombre: p.nombre.replace('M1', 'M2'),
  modulo: '2',
}));
const allPieces = [...module1Pieces, ...module2Pieces];

function moduleBoundsBySeq(geometries) {
  const bounds = new Map();
  geometries.forEach((g) => {
    const key = g.moduleSeq ?? 0;
    if (!bounds.has(key)) bounds.set(key, { minX: Infinity, maxX: -Infinity });
    const b = bounds.get(key);
    b.minX = Math.min(b.minX, g.x);
    b.maxX = Math.max(b.maxX, g.x + g.w);
  });
  return [...bounds.values()].sort((a, b) => a.minX - b.minX);
}

function parsePolygonIds(svg) {
  const ids = new Set();
  const regex = /data-piece-id="([^"]+)"/g;
  let match;
  while ((match = regex.exec(svg)) !== null) {
    ids.add(match[1]);
  }
  return [...ids];
}

describe('ensureModuleGap (pure)', () => {
  const geo = (id, seq, x, w) => ({ id, moduleSeq: seq, x, w, cx: x + w / 2 });

  it('separa grupos pegados con el gap estándar', () => {
    const input = [geo('a', 0, 0, 800), geo('b', 1, 800, 800)];
    const out = ensureModuleGap(input);
    const gap = out[1].x - (out[0].x + out[0].w);
    assert.equal(gap, MODULE_GAP_MM);
    // cx sincronizado con el desplazamiento
    assert.equal(out[1].cx, out[1].x + out[1].w / 2);
    // No muta el array de entrada
    assert.equal(input[1].x, 800);
  });

  it('respeta un gap mayor existente (no reduce el layout)', () => {
    const input = [geo('a', 0, 0, 800), geo('b', 1, 900, 800)];
    const out = ensureModuleGap(input);
    assert.equal(out[1].x, 900, 'grupo ya separado no debe moverse');
  });

  it('empuja los módulos posteriores conservando su gap relativo', () => {
    const input = [geo('a', 0, 0, 800), geo('b', 1, 800, 400), geo('c', 2, 1200, 400)];
    const out = ensureModuleGap(input, 100);
    assert.equal(out[1].x - (out[0].x + out[0].w), 100);
    assert.equal(out[2].x - (out[1].x + out[1].w), 100);
  });

  it('con un solo grupo no desplaza nada', () => {
    const input = [geo('a', 0, 0, 800), geo('b', 0, 100, 100)];
    const out = ensureModuleGap(input, 20);
    assert.deepEqual(out.map((g) => g.x), [0, 100]);
  });
});

describe('Renderer3D multi-módulo (vista completa)', () => {
  it('separa los módulos con un gap de 20 mm', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('all', allPieces);

    const [m1, m2] = moduleBoundsBySeq(renderer.geometries);
    const gap = m2.minX - m1.maxX;
    assert.equal(gap, MODULE_GAP_MM, `gap entre módulos debe ser ${MODULE_GAP_MM} mm (compact)`);
  });

  it('no reduce el gap amplio del modo projected', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600, moduleGapMode: 'projected' });
    renderer.load('all', allPieces);

    const [m1, m2] = moduleBoundsBySeq(renderer.geometries);
    const gap = m2.minX - m1.maxX;
    assert.ok(gap >= MODULE_GAP_MM, 'projected ya separa los módulos; no debe reducirse');
  });

  it('moduleW abarca todos los módulos y perspectiva usa el ancho de escena', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('all', allPieces);

    const [m1, m2] = moduleBoundsBySeq(renderer.geometries);
    const span = m2.maxX - m1.minX;
    assert.equal(renderer.moduleW, span, 'moduleW debe ser el ancho total de la escena');
    assert.equal(
      renderer.perspDistance,
      Math.max(renderer.moduleW, renderer.moduleD, renderer.moduleH, 1) * 2.5,
      'perspDistance debe derivarse del ancho de escena'
    );
  });

  it('resize() actualiza el lienzo y re-encuadra el contenido (fullscreen)', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('all', allPieces);

    renderer.resize(1920, 1080);
    assert.equal(renderer.width, 1920);
    assert.equal(renderer.height, 1080);
    assert.equal(renderer.needsRender, true, 'debe repintar tras resize');

    // El re-encuadre centra el contenido en el nuevo lienzo.
    const state = renderer.controls.getState();
    assert.ok(state.offsetX > 0 && state.offsetX <= 1920, 'offsetX dentro del lienzo nuevo');
    assert.ok(state.offsetY > 0 && state.offsetY <= 1080, 'offsetY dentro del lienzo nuevo');

    // resize con el mismo tamaño es no-op (no fuerza repaint innecesario).
    renderer.needsRender = false;
    renderer.resize(1920, 1080);
    assert.equal(renderer.needsRender, false);
  });

  it('renderiza piezas de todos los módulos con explode y permite seleccionar por pieza', () => {
    rafCallbacks = [];
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('all', allPieces);
    renderer.setExplodeFactor(0.5);
    while (rafCallbacks.length) {
      const cb = rafCallbacks.shift();
      cb(performance.now() + 500);
    }
    renderer.render();

    const ids = parsePolygonIds(container.innerHTML);
    assert.ok(ids.includes('m1-base'), 'M1 debe renderizar tras explode');
    assert.ok(ids.includes('m2-base'), 'M2 debe renderizar tras explode');

    renderer.setSelectedId('m2-base');
    renderer.render();
    const highlighted = (container.innerHTML.match(/stroke="#FFD700"/g) || []).length;
    assert.ok(highlighted >= 6, 'la selección debe resaltar las caras de la pieza de M2');
  });
});
