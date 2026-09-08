import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, EVENTS } from './store.js';

describe('store', () => {
  it('emits userConfig:changed when userConfig changes via set', () => {
    const store = createStore();
    let called = false;
    let payload = null;
    store.subscribe(EVENTS.USER_CONFIG_CHANGED, (value) => {
      called = true;
      payload = value;
    });
    store.set({ userConfig: { stackGap: 99 } });
    assert.equal(called, true);
    assert.equal(payload?.stackGap, 99);
  });

  it('does not emit userConfig:changed when unrelated fields change', () => {
    const store = createStore();
    let called = false;
    store.subscribe(EVENTS.USER_CONFIG_CHANGED, () => {
      called = true;
    });
    store.set({ currentModule: 'foo' });
    assert.equal(called, false);
  });

  it('incluye angulos vacíos por defecto', () => {
    const store = createStore();
    assert.deepEqual(store.get().angulos, {});
  });

  it("setField('angulos') emite angulo:changed con el valor", () => {
    const store = createStore();
    let payload = null;
    store.subscribe(EVENTS.ANGULOS_CHANGED, (value) => {
      payload = value;
    });
    store.setField('angulos', { 'm1-puerta-izq': 70 });
    assert.deepEqual(payload, { 'm1-puerta-izq': 70 });
  });

  it('limpiar un override de ángulo emite angulo:changed sin esa pieza', () => {
    const store = createStore();
    const events = [];
    store.subscribe(EVENTS.ANGULOS_CHANGED, (value) => events.push(value));
    store.setField('angulos', { a: 45, b: 90 });
    const next = { ...store.get().angulos };
    delete next.a;
    store.setField('angulos', next);
    assert.deepEqual(events[events.length - 1], { b: 90 });
  });
});
