import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer3D } from './renderer3D.js';
import { IsometricRenderer } from '../isometricRenderer.js';

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

const basePieces = [
  { id: 'm1-base', nombre: 'Base modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: '1' },
  { id: 'm1-tapa', nombre: 'Tapa modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: '1' },
  { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 550, alto: 2300, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, cantos: 'T,B,L', modulo: '1' },
  { id: 'm1-lateral-der', nombre: 'Lateral derecho M1', ancho: 550, alto: 2300, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, cantos: 'T,B,R', modulo: '1' },
  { id: 'm1-fondo', nombre: 'Fondo modulo M1', ancho: 800, alto: 2300, cantidad: 1, rotate: 'no', color: '#F2F2F2', espesor: 15, modulo: '1' },
  { id: 'm1-estante', nombre: 'Estante M1', ancho: 770, alto: 520, cantidad: 1, rotate: 'si', color: '#DDA0DD', espesor: 15, cantos: 'T,B,L,R', modulo: '1' },
];

function parsePolygonIds(svg) {
  const ids = new Set();
  const regex = /data-piece-id="([^"]+)"/g;
  let match;
  while ((match = regex.exec(svg)) !== null) {
    ids.add(match[1]);
  }
  return [...ids];
}

describe('Renderer3D integration', () => {
  it('renders SVG with all module pieces', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('1', basePieces);
    renderer.render();

    const ids = parsePolygonIds(container.innerHTML);
    assert.ok(ids.length > 0, 'SVG should contain at least one polygon');
    assert.ok(ids.includes('m1-base'), 'base panel should be rendered');
    assert.ok(ids.includes('m1-estante'), 'shelf should be rendered');
    assert.ok(ids.includes('m1-fondo'), 'back panel should be rendered');
  });

  it('reuses the same geometry count as IsometricRenderer.computeGeometries', () => {
    const isoRenderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12 });
    const { geometries } = isoRenderer.computeGeometries('1', basePieces);

    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('1', basePieces);

    assert.equal(renderer.geometries.length, geometries.length, 'Renderer3D should reuse the same number of geometries');
  });

  it('centers camera around module dimensions', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('1', basePieces);

    assert.ok(renderer.moduleW > 0, 'module width should be computed');
    assert.ok(renderer.moduleH > 0, 'module height should be computed');
    assert.equal(renderer.moduleCenter.x, renderer.moduleW / 2, 'center X should be half module width');
    assert.equal(renderer.moduleCenter.z, renderer.moduleH / 2, 'center Z should be half module height');
  });

  it('applies explode centered around module center', () => {
    rafCallbacks = [];
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('1', basePieces);
    renderer.setExplodeFactor(0.5);
    // Consumir todos los callbacks de animación para terminar la interpolación.
    while (rafCallbacks.length) {
      const cb = rafCallbacks.shift();
      cb(performance.now() + 500);
    }
    renderer.render();

    const svg = container.innerHTML;
    assert.ok(svg.includes('Vista 3D'), 'SVG title should be present');
    assert.ok(parsePolygonIds(svg).length > 0, 'SVG should still contain polygons after explode');
  });

  it('hover highlights all faces of a piece', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('1', basePieces);
    renderer.hoveredId = 'm1-estante';
    renderer.render();

    const highlighted = (container.innerHTML.match(/stroke="#FFD700"/g) || []).length;
    assert.ok(highlighted >= 6, 'hover should highlight at least the 6 faces of the shelf');
  });

  it('uses compact module gap mode by default', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    assert.equal(renderer.moduleGapMode, 'compact', 'default module gap mode should be compact');
  });

  it('applies verticalPositionOverrides when positioning pieces', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, {
      width: 900,
      height: 600,
      verticalPositionOverrides: { bottomPanelOffset: 200 },
    });
    renderer.load('1', basePieces);

    const base = renderer.geometries.find((g) => g.role === 'bottom_panel');
    assert.ok(base, 'base panel geometry should exist');
    assert.equal(base.z, 200, 'base panel z should respect bottomPanelOffset override');
  });

  it('setRotX and setRotY update camera state', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.setRotX(40);
    renderer.setRotY(-70);
    const state = renderer.controls.getState();
    assert.equal(state.rotX, 40, 'rotX should be updated');
    assert.equal(state.rotY, -70, 'rotY should be updated');
  });

  it('xray mode makes envelope faces very transparent', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('1', basePieces);
    renderer.setXrayMode(true);
    renderer.render();

    const matches = container.innerHTML.match(/fill-opacity="([\d.]+)"/g) || [];
    assert.ok(matches.some((m) => parseFloat(m.match(/[\d.]+/)[0]) <= 0.1), 'at least one face should be very transparent in xray');
  });
});
