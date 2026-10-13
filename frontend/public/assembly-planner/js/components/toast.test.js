// toast.test.js — lógica pura del sistema de toasts (sin DOM)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createToastRegistry,
  normalizeToastType,
  TOAST_TYPES,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_MAX_VISIBLE,
} from './toast.js';

test('normalizeToastType: acepta solo tipos válidos', () => {
  assert.equal(normalizeToastType('info'), 'info');
  assert.equal(normalizeToastType('success'), 'success');
  assert.equal(normalizeToastType('error'), 'error');
  assert.equal(normalizeToastType('warning'), 'info');
  assert.equal(normalizeToastType(undefined), 'info');
  assert.equal(normalizeToastType(null), 'info');
  assert.deepEqual(TOAST_TYPES, ['info', 'success', 'error']);
});

test('registry.add: asigna ids secuenciales y conserva mensaje/tipo', () => {
  const registry = createToastRegistry();
  const { item: a } = registry.add('Hola', { type: 'success' });
  const { item: b } = registry.add('Mundo');
  assert.ok(a.id < b.id);
  assert.equal(a.message, 'Hola');
  assert.equal(a.type, 'success');
  assert.equal(b.type, 'info');
  assert.equal(b.durationMs, TOAST_DEFAULT_DURATION_MS);
});

test('registry.add: convierte el mensaje a string y sanea durationMs', () => {
  const registry = createToastRegistry();
  const { item } = registry.add(42, { durationMs: -5 });
  assert.equal(item.message, '42');
  assert.equal(item.durationMs, TOAST_DEFAULT_DURATION_MS);
  const { item: ok } = registry.add('x', { durationMs: 1500 });
  assert.equal(ok.durationMs, 1500);
});

test('registry: evicta el toast más antiguo al superar el máximo visible', () => {
  const registry = createToastRegistry({ maxVisible: 3 });
  const r1 = registry.add('t1');
  const r2 = registry.add('t2');
  const r3 = registry.add('t3');
  assert.equal(r1.evicted, null);
  assert.equal(registry.list().length, 3);

  const r4 = registry.add('t4');
  assert.equal(r4.evicted.id, r1.item.id);
  assert.deepEqual(registry.list().map((t) => t.message), ['t2', 't3', 't4']);
});

test('registry: usa TOAST_MAX_VISIBLE como máximo por defecto', () => {
  const registry = createToastRegistry();
  for (let i = 0; i < TOAST_MAX_VISIBLE + 2; i++) registry.add(`t${i}`);
  assert.equal(registry.list().length, TOAST_MAX_VISIBLE);
});

test('registry.remove: elimina por id y devuelve el toast o null', () => {
  const registry = createToastRegistry();
  const { item } = registry.add('uno');
  assert.equal(registry.remove(item.id).message, 'uno');
  assert.equal(registry.remove(item.id), null);
  assert.equal(registry.list().length, 0);
});

test('registry.list: devuelve copias (no referencias mutables)', () => {
  const registry = createToastRegistry();
  registry.add('uno');
  const list = registry.list();
  list[0].message = 'mutado';
  assert.equal(registry.list()[0].message, 'uno');
});

test('registry.clear: vacía el registro', () => {
  const registry = createToastRegistry();
  registry.add('uno');
  registry.add('dos');
  registry.clear();
  assert.equal(registry.list().length, 0);
});
