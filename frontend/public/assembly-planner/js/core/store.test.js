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
});
