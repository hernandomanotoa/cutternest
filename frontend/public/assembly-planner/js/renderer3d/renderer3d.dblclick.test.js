// js/renderer3d/renderer3d.dblclick.test.js — Regresión del doble-click 3D
//
// Regresión reportada (2026-09-10): el doble-click de apertura individual
// (cajones/zapateras/puertas) funciona en la vista isométrica pero no en la
// vista 3D. Este test reproduce el chain completo con el ejemplo de
// cajonera con correderas ocultas: Renderer3D + interaction.js → callback
// onPieceDoubleClick. (Antes usaba el CSV legacy ejemplo-cajonera.csv,
// retirado del catálogo al quedarse solo con ejemplos regenerables S1–S4.)

import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof window === 'undefined') {
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1920, innerHeight: 1080 };
}
if (typeof document === 'undefined') {
  globalThis.document = { createElement: () => ({ style: {} }), body: { appendChild() {} } };
}
if (typeof requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
}

const DATA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'data');

const makeContainer = (listeners) => ({
  style: {}, innerHTML: '',
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }),
  addEventListener(type, fn) { if (listeners) listeners[type] = fn; },
  removeEventListener() {},
});

const fakePolygonTarget = (pieceId) => ({
  getAttribute: (n) => (n === 'data-piece-id' ? pieceId : null),
  closest() { return this; },
});

const findFrenteCajon = (pieces) =>
  pieces.find((p) => /cajon/i.test(p.nombre) && /frente/i.test(p.nombre));

describe('renderer3d/renderer3D — doble-click de apertura (regresión iso vs 3D)', () => {
  it('onPieceDoubleClick se dispara con el id del frente de cajón', async () => {
    const { Renderer3D } = await import('./renderer3D.js');
    const { parseCSV } = await import('../csvParser.js');
    const csv = readFileSync(join(DATA_DIR, 'ejemplo-cajonera-correderas-ocultas.csv'), 'utf8');
    const { pieces } = parseCSV(csv);
    const frente = findFrenteCajon(pieces);
    assert.ok(frente, 'el ejemplo de cajonera debe tener un frente de cajón');

    const listeners = {};
    let notified = null;
    const r = new Renderer3D(makeContainer(listeners), {
      width: 900, height: 600,
      onPieceDoubleClick: (id) => { notified = id; },
    });
    r.load('1', pieces);

    // El frente de cajón debe tener geometría visible en el módulo padre.
    const geo = r.geometries.find((g) => g.id === frente.id);
    assert.ok(geo, `la pieza ${frente.id} debe tener geometría en la vista del módulo 1`);

    listeners.dblclick({ target: fakePolygonTarget(frente.id) });
    assert.equal(notified, frente.id, 'el callback de doble-click debe recibir el id del frente');
    r.destroy();
  });

  it('el frente de cajón es clasificable como pieza móvil (rail)', async () => {
    const { parseCSV } = await import('../csvParser.js');
    const { motionConfigFor } = await import('../services/motionService.js');
    const csv = readFileSync(join(DATA_DIR, 'ejemplo-cajonera-correderas-ocultas.csv'), 'utf8');
    const { pieces } = parseCSV(csv);
    const frente = findFrenteCajon(pieces);
    const cfg = motionConfigFor(frente);
    assert.ok(cfg, 'el frente de cajón debe tener config de movimiento');
    assert.equal(cfg.kind, 'rail');
  });

  it('setApertura con override de pieza actualiza la geometría (extracción en y)', async () => {
    const { Renderer3D } = await import('./renderer3D.js');
    const { parseCSV } = await import('../csvParser.js');
    const csv = readFileSync(join(DATA_DIR, 'ejemplo-cajonera-correderas-ocultas.csv'), 'utf8');
    const { pieces } = parseCSV(csv);
    const frente = findFrenteCajon(pieces);

    const listeners = {};
    const r = new Renderer3D(makeContainer(listeners), { width: 900, height: 600 });
    r.load('1', pieces);
    const yCerrado = r.geometries.find((g) => g.id === frente.id).y;

    // Simula el toggle del handler de la vista: override 0→1 sin animación
    // (mismo estado final que aplica _animateApertura al terminar).
    r.setApertura(0, { [frente.id]: 1 }, {});
    r._cancelAperturaAnimation();
    r._applyAperturaState({ global: 0, overrides: { [frente.id]: 1 }, angulos: {} });

    const yAbierto = r.geometries.find((g) => g.id === frente.id).y;
    assert.ok(yAbierto > yCerrado, `al abrir, el frente debe extraerse hacia +y (${yCerrado} → ${yAbierto})`);
    r.destroy();
  });

  it('render() no reescribe el DOM cuando el SVG no cambia (regresión dblclick)', async () => {
    const { Renderer3D } = await import('./renderer3D.js');
    const { parseCSV } = await import('../csvParser.js');
    const csv = readFileSync(join(DATA_DIR, 'ejemplo-cajonera-correderas-ocultas.csv'), 'utf8');
    const { pieces } = parseCSV(csv);

    let writes = 0;
    const cont = makeContainer({});
    Object.defineProperty(cont, 'innerHTML', {
      get() { return this._html || ''; },
      set(v) { this._html = v; writes += 1; },
    });

    const r = new Renderer3D(cont, { width: 900, height: 600 });
    r.load('1', pieces);
    r.render();
    assert.equal(writes, 1, 'primer render escribe el DOM');

    // Segundo render sin cambios de estado: el DOM no se toca. Reescribir
    // los nodos entre los dos click del dblclick hace que el navegador no
    // lo dispare (regresión real: el loop de render lo hacía cada frame).
    r.needsRender = true;
    r.render();
    assert.equal(writes, 1, 'render sin cambios no debe reescribir innerHTML');

    // Con un cambio real (selección) sí debe re-renderizar.
    r.setSelectedId(pieces[0].id);
    r.render();
    assert.equal(writes, 2, 'render con cambio de estado sí reescribe el DOM');
    r.destroy();
  });
});
