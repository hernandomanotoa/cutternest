// js/utils/grainPattern.test.js — Patrón SVG procedural de veta. Runner: node --test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mulberry32,
  oscurecerHex,
  patronVetaId,
  patronVetaDef,
  direccionVetaRender,
  crearRegistroPatronesVeta,
  SEMILLA_VETA,
} from './grainPattern.js';

test('mulberry32: determinista y en [0,1)', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  const seqA = Array.from({ length: 10 }, () => a());
  assert.deepEqual(seqA, Array.from({ length: 10 }, () => b()));
  for (const v of seqA) {
    assert.ok(v >= 0 && v < 1);
  }
  assert.notDeepEqual(seqA, Array.from({ length: 10 }, () => mulberry32(8)()));
});

test('oscurecerHex: baja el brillo conservando el formato; inválido cae a un marrán', () => {
  assert.equal(oscurecerHex('#c9a876', 0.5), '#65543b');
  assert.equal(oscurecerHex('#ffffff', 0.5), '#808080');
  assert.match(oscurecerHex('#c9a876', 0.38), /^#[0-9a-f]{6}$/);
  assert.match(oscurecerHex('mal'), /^#[0-9a-f]{6}$/);
});

test('patronVetaId: determinista por (color, ángulo) e insensible a mayúsculas', () => {
  assert.equal(patronVetaId('#C19A6B', 0), patronVetaId('#c19a6b', 0));
  assert.notEqual(patronVetaId('#c19a6b', 0), patronVetaId('#c19a6b', 90));
  assert.equal(patronVetaId('#c19a6b', 30.4), patronVetaId('#c19a6b', 30), 'ángulo redondeado');
});

test('patronVetaDef: mismo color+ángulo+semilla → mismo markup; el ángulo rota la veta', () => {
  const a = patronVetaDef('#c19a6b', 0);
  const b = patronVetaDef('#c19a6b', 0);
  assert.equal(a, b);
  assert.ok(a.includes('<pattern'));
  assert.ok(a.includes('fill="#c19a6b"'));
  assert.ok(!a.includes('patternTransform'), 'ángulo 0: sin rotación');
  const girado = patronVetaDef('#c19a6b', -90);
  assert.ok(girado.includes('patternTransform="rotate(-90)"'), 'la veta sigue al ángulo de la pieza');
  // Semilla distinta → vetas distintas.
  const otra = patronVetaDef('#c19a6b', 0, { semilla: SEMILLA_VETA + 1 });
  assert.notEqual(a, otra);
  // 9 vetas por patrón.
  assert.equal((a.match(/<path /g) || []).length, 9);
});

test('direccionVetaRender: costados y divisores verticales; frentes y repisas horizontales', () => {
  assert.equal(direccionVetaRender({ nombre: 'Lateral izquierdo M1' }), 'vertical');
  assert.equal(direccionVetaRender({ nombre: 'Divisor 1 M1' }), 'vertical');
  assert.equal(direccionVetaRender({ nombre: 'Frente cajon 1 M1' }), 'horizontal');
  assert.equal(direccionVetaRender({ nombre: 'Repisa 1 M1' }), 'horizontal');
});

test('registro: collect por (color, ángulo), deduplica defs y respeta el ángulo', () => {
  const reg = crearRegistroPatronesVeta();
  assert.equal(reg.defs(), '');
  const f1 = reg.collect('#c19a6b', 0);
  const f2 = reg.collect('#c19a6b', 0);
  const f3 = reg.collect('#c19a6b', -90);
  assert.equal(f1, f2);
  assert.notEqual(f1, f3, 'ángulo distinto → patrón distinto (la veta sigue a la pieza)');
  const f4 = reg.collect('#8b5a2b', 0);
  assert.notEqual(f1, f4);
  assert.ok(f1.startsWith('url(#gv-'));
  const defs = reg.defs();
  assert.ok(defs.startsWith('<defs>') && defs.endsWith('</defs>'));
  assert.equal((defs.match(/<pattern /g) || []).length, 3);
});
