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
  it('por defecto los módulos quedan pegados (gap 0); el toggle agrega 20 mm', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('all', allPieces);

    let [m1, m2] = moduleBoundsBySeq(renderer.geometries);
    assert.equal(m2.minX - m1.maxX, 0, 'default: módulos pegados');

    renderer.setVerticalPositionOverrides?.({ viewModuleGap: MODULE_GAP_MM });
    renderer.load('all', allPieces, { keepCamera: true });
    [m1, m2] = moduleBoundsBySeq(renderer.geometries);
    assert.equal(m2.minX - m1.maxX, MODULE_GAP_MM, `toggle: gap de ${MODULE_GAP_MM} mm`);
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

  it('resize() en pantalla completa conserva el encuadre relativo del mueble', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    renderer.load('all', allPieces);
    const scaleNormal = renderer.controls.getState().scale;

    // Pantalla completa 16:9: el tope de escala crece por la dimensión
    // limitante, así el mueble se ve DEL MISMO TAMAÑO que en viewport normal
    // (no se queda chico en una esquina como antes del ResizeObserver).
    renderer.resize(1920, 1080);
    const scaleFull = renderer.controls.getState().scale;
    assert.ok(
      scaleFull > scaleNormal * 1.5,
      `scale fullscreen (${scaleFull.toFixed(3)}) debe crecer respecto al normal (${scaleNormal.toFixed(3)})`
    );
    const factor = Math.max(1, Math.min(1920 / 900, 1080 / 600));
    assert.ok(
      scaleFull <= 0.14 * 1.5 * factor + 1e-9,
      'scale no debe superar el tope proporcional al viewport'
    );

    // Al volver al tamaño normal, el encuadre histórico se restaura.
    renderer.resize(900, 600);
    assert.equal(renderer.controls.getState().scale, scaleNormal);
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

describe('ensureModuleGap con zócalo global (glb-*)', () => {
  it('no desplaza las piezas globales: el zócalo queda bajo la fila de módulos', () => {
    // Dos módulos con gap < 20 (el zócalo global llega con moduleSeq propio).
    const input = [
      { id: 'm1-tapa', x: 0, w: 850, cx: 425, moduleSeq: 0 },
      { id: 'm2-tapa', x: 860, w: 850, cx: 1285, moduleSeq: 1 },
      { id: 'glb-zocalo-frente', x: 15, w: 1685, cx: 857, moduleSeq: 2, raw: { modulo: 'estructura' } },
      { id: 'glb-zocalo-costado-der', x: 1715, w: 15, cx: 1722, moduleSeq: 2, raw: { modulo: 'estructura' } },
    ];
    const out = ensureModuleGap(input, MODULE_GAP_MM);
    const byId = Object.fromEntries(out.map((g) => [g.id, g]));
    // Los módulos sí respetan el gap mínimo; el zócalo NO se mueve.
    assert.equal(byId['glb-zocalo-frente'].x, 15, 'frente del zócalo en su sitio');
    assert.equal(byId['glb-zocalo-costado-der'].x, 1715, 'costado del zócalo en su sitio');
    assert.ok(byId['m2-tapa'].x - (byId['m1-tapa'].x + byId['m1-tapa'].w) >= MODULE_GAP_MM - 1e-6);
  });
});

describe('Renderer3D foco gola', () => {
  const CASCO = [
    { id: 'm1-base', nombre: 'Base M1', ancho: 820, alto: 585, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: '1' },
    { id: 'm1-tapa', nombre: 'Tapa M1', ancho: 850, alto: 600, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: '1' },
    { id: 'm1-lateral-izq', nombre: 'Lateral izq M1', ancho: 600, alto: 2400, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, cantos: 'T,B,L', modulo: '1' },
    { id: 'm1-lateral-der', nombre: 'Lateral der M1', ancho: 600, alto: 2400, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, cantos: 'T,B,R', modulo: '1' },
    { id: 'm1-fondo', nombre: 'Fondo M1', ancho: 820, alto: 2255, cantidad: 1, rotate: 'no', color: '#F2F2F2', espesor: 15, cantos: '', modulo: '1' },
  ];
  const cajon = (sub, alto) => [
    { id: `m1cajon${sub}-frente`, nombre: `Frente cajon ${sub} M1`, ancho: 818, alto, cantidad: 1, rotate: 'si', color: '#8B5A2B', espesor: 15, cantos: 'T,B,L,R', modulo: `1${sub}` },
    { id: `m1cajon${sub}-lateral-izq`, nombre: `Lateral cajon ${sub} izq M1`, ancho: 545, alto: 150, cantidad: 1, rotate: 'no', color: '#D9C2A3', espesor: 15, cantos: 'T,B,L', modulo: `1${sub}` },
    { id: `m1cajon${sub}-lateral-der`, nombre: `Lateral cajon ${sub} der M1`, ancho: 545, alto: 150, cantidad: 1, rotate: 'no', color: '#D9C2A3', espesor: 15, cantos: 'T,B,R', modulo: `1${sub}` },
    { id: `m1cajon${sub}-fondo`, nombre: `Fondo cajon ${sub} M1`, ancho: 764, alto: 150, cantidad: 1, rotate: 'no', color: '#F2F2F2', espesor: 15, cantos: '', modulo: `1${sub}` },
    { id: `m1cajon${sub}-base`, nombre: `Base cajon ${sub} M1`, ancho: 764, alto: 515, cantidad: 1, rotate: 'si', color: '#D9C2A3', espesor: 15, cantos: 'T,B,L,R', modulo: `1${sub}` },
  ];
  const tira = { id: 'm1-gola-1', nombre: 'Tira gola 1 M1', ancho: 764, alto: 30, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: '1' };

  it('oculta cajones/zapateras del módulo con gola y conserva casco/repisas/tiras; se restaura al recargar', () => {
    const container = createContainer();
    const renderer = new Renderer3D(container, { width: 900, height: 600 });
    const repisa = { id: 'm1-repisa-1', nombre: 'Repisa 1 M1', ancho: 764, alto: 570, cantidad: 1, rotate: 'si', color: '#D9C2A3', espesor: 15, cantos: 'T,B,L,R', modulo: '1', pos_z: 900 };
    const pieces = [...CASCO, ...cajon(1, 197), ...cajon(2, 197), tira, repisa];
    renderer.load('all', pieces, { golaFocus: true });
    assert.equal(renderer.geometries.some((g) => g.role === 'drawer_face'), false, 'sin frentes (cajones fuera)');
    assert.equal(renderer.geometries.some((g) => g.role === 'drawer_side'), false, 'sin laterales de caja');
    assert.equal(renderer.geometries.some((g) => g.role === 'drawer_bottom'), false, 'sin bases de caja');
    assert.ok(renderer.geometries.some((g) => g.id === 'm1-repisa-1'), 'repisa visible');
    assert.ok(renderer.geometries.some((g) => g.id === 'm1-tapa'), 'casco visible');
    assert.ok(renderer.geometries.some((g) => g.role === 'gola_strip'), 'tira-U visible');
    // Restauración: recargar sin la opción devuelve los cajones.
    renderer.load('all', pieces);
    assert.ok(renderer.geometries.some((g) => g.role === 'drawer_side'), 'cajones restaurados');
  });
});
