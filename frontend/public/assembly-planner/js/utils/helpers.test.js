// utils.test.js — contrato de helpers comunes (funciones puras)
// OMITIDO: $, $$, downloadText y readFileAsText requieren DOM/Blob/FileReader
// y no se pueden testear en node sin stubs ajenos al módulo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throttle, clamp, isHexColor, normalizeColor, formatDimension, uid, debounce, escapeHtml } from './helpers.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ————————————————————————————— clamp —————————————————————————————

test('clamp: acota por abajo y por arriba', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('clamp: bordes exactos', () => {
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

// ——————————————————————————— isHexColor ———————————————————————————

test('isHexColor: acepta #RGB y #RRGGBB', () => {
  assert.ok(isHexColor('#fff'));
  assert.ok(isHexColor('#FFF'));
  assert.ok(isHexColor('#a1B2c3'));
  assert.ok(isHexColor('#123456'));
});

test('isHexColor: rechaza valores inválidos', () => {
  for (const v of ['fff', '#12345', '#1234567', '#gggggg', '', 'red', '#12']) {
    assert.equal(isHexColor(v), false, v);
  }
});

// —————————————————————————— normalizeColor ——————————————————————————

test('normalizeColor: añade # a hex sin prefijo (3 o 6 dígitos)', () => {
  assert.equal(normalizeColor('aabbcc'), '#aabbcc');
  assert.equal(normalizeColor('ABC'), '#ABC');
});

test('normalizeColor: preserva hex ya prefijados y colores con nombre', () => {
  assert.equal(normalizeColor('#aabbcc'), '#aabbcc');
  assert.equal(normalizeColor('red'), 'red');
  assert.equal(normalizeColor('  abc  '), '#abc', 'recorta espacios');
  assert.equal(normalizeColor(''), '');
});

test('normalizeColor: valores no hex se devuelven tal cual', () => {
  assert.equal(normalizeColor('rgb(1,2,3)'), 'rgb(1,2,3)');
});

// ————————————————————————— formatDimension —————————————————————————

test('formatDimension: formatea enteros y decimales como "mm"', () => {
  assert.equal(formatDimension(250), '250 mm');
  assert.equal(formatDimension(250.7), '251 mm', 'redondea con toFixed(0)');
  assert.equal(formatDimension('300'), '300 mm');
});

test('formatDimension: no numéricos se devuelven sin cambios', () => {
  assert.equal(formatDimension('abc'), 'abc');
  assert.equal(formatDimension(NaN), NaN);
  assert.equal(formatDimension(undefined), undefined);
});

// ————————————————————————————— uid —————————————————————————————

test('uid: prefijo por defecto "id" y prefijo personalizado', () => {
  assert.match(uid(), /^id-[0-9a-z]{7}$/);
  assert.match(uid('pieza'), /^pieza-[0-9a-z]{7}$/);
});

test('uid: 200 ids consecutivos no colisionan', () => {
  const ids = new Set(Array.from({ length: 200 }, () => uid()));
  assert.equal(ids.size, 200);
});

// ——————————————————————————— escapeHtml ———————————————————————————

test('escapeHtml: escapa &, <, > y "', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('escapeHtml: no escapa apóstrofes ni afecta texto plano', () => {
  assert.equal(escapeHtml("it's fine"), "it's fine");
  assert.equal(escapeHtml('texto plano'), 'texto plano');
});

test('escapeHtml: convierte no-string con String()', () => {
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(null), 'null');
});

// ——————————————————————————— throttle ———————————————————————————

test('throttle: ejecuta la primera llamada y suprime las inmediatas', () => {
  const calls = [];
  const throttled = throttle((v) => calls.push(v), 1000);
  throttled(1);
  throttled(2);
  throttled(3);
  assert.deepEqual(calls, [1], 'solo la primera llamada dentro de la ventana');
});

test('throttle: deja pasar llamadas tras transcurrir ms (Date.now simulado)', () => {
  const realNow = Date.now;
  let fake = 10000;
  Date.now = () => fake;
  try {
    const calls = [];
    const throttled = throttle(() => calls.push(true), 100);
    throttled();
    throttled();
    assert.equal(calls.length, 1);
    fake += 100;
    throttled();
    assert.equal(calls.length, 2, 'ejecuta al cumplirse exactamente ms');
  } finally {
    Date.now = realNow;
  }
});

test('throttle: reenvía los argumentos de la llamada ejecutada', () => {
  const calls = [];
  const throttled = throttle((a, b) => calls.push([a, b]), 1000);
  throttled('x', 'y');
  assert.deepEqual(calls, [['x', 'y']]);
});

// ——————————————————————————— debounce ———————————————————————————

test('debounce: aplaza y colapsa llamadas rápidas en una sola', async () => {
  const calls = [];
  const debounced = debounce((v) => calls.push(v), 20);
  debounced(1);
  debounced(2);
  debounced(3);
  await sleep(60);
  assert.deepEqual(calls, [3], 'solo la última llamada se ejecuta');
});

test('debounce: no ejecuta si siempre llegan llamadas antes del timeout', async () => {
  const calls = [];
  const debounced = debounce(() => calls.push(true), 30);
  debounced();
  await sleep(10);
  debounced();
  await sleep(10);
  debounced();
  await sleep(10);
  assert.equal(calls.length, 0, 'sin pausa suficiente no dispara');
  await sleep(50);
  assert.equal(calls.length, 1, 'dispara tras la última llamada');
});
