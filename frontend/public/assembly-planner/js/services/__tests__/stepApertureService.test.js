// js/services/__tests__/stepApertureService.test.js — contrato de apertura en modo paso

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stepIndexByPiece,
  computeStepApertures,
} from '../../services/stepApertureService.js';
import { buildAssemblySequence } from '../../services/assemblyStepService.js';

const piece = (id, nombre, overrides = {}) => ({
  id,
  nombre,
  ancho: overrides.ancho ?? 500,
  alto: overrides.alto ?? 400,
  modulo: overrides.modulo ?? '1',
});

// Secuencia manual: casco (paso 1), puerta (paso 2), cajón (paso 3).
const SEQUENCE = {
  steps: [
    { paso: 1, piezas: ['lat-izq'] },
    { paso: 2, piezas: ['puerta'] },
    { paso: 3, piezas: ['cajon'] },
  ],
  totalPasos: 3,
};

const PIECES = [
  piece('lat-izq', 'Lateral izquierdo'),
  piece('puerta', 'Puerta derecha'),
  piece('cajon', 'Frente cajon 1'),
];

describe('stepIndexByPiece', () => {
  it('mapea cada pieza a su paso, incluso con varias piezas por paso', () => {
    const seq = { steps: [{ paso: 1, piezas: ['a', 'b'] }, { paso: 2, piezas: ['c'] }] };
    assert.deepEqual(stepIndexByPiece(seq), new Map([['a', 1], ['b', 1], ['c', 2]]));
  });

  it('tolerante a secuencia vacía o inválida', () => {
    assert.deepEqual(stepIndexByPiece(null), new Map());
    assert.deepEqual(stepIndexByPiece({}), new Map());
  });
});

describe('computeStepApertures', () => {
  it('pieza móvil del paso actual → 1 (abierta)', () => {
    const result = computeStepApertures(PIECES, SEQUENCE, 2);
    assert.equal(result.get('puerta'), 1);
  });

  it('pieza móvil de paso anterior → 0 (cerrada)', () => {
    // En el paso 3 la puerta (paso 2) ya se instaló: queda cerrada.
    const result = computeStepApertures(PIECES, SEQUENCE, 3);
    assert.equal(result.get('cajon'), 1);
    assert.equal(result.get('puerta'), 0);
  });

  it('pieza móvil de paso posterior → se omite (la oculta setAssemblyStep)', () => {
    const result = computeStepApertures(PIECES, SEQUENCE, 1);
    assert.ok(!result.has('puerta'));
    assert.ok(!result.has('cajon'));
  });

  it('pieza sin movimiento → se omite', () => {
    const result = computeStepApertures(PIECES, SEQUENCE, 1);
    assert.ok(!result.has('lat-izq'));
  });

  it('override manual gana sobre la apertura automática del paso', () => {
    const overrides = new Map([['puerta', 0.3]]);
    const result = computeStepApertures(PIECES, SEQUENCE, 2, overrides);
    assert.equal(result.get('puerta'), 0.3);
  });

  it('override manual gana sobre el cierre automático de pasos anteriores', () => {
    // Usuario deja la puerta abierta (override 1) al avanzar al paso del cajón.
    const overrides = new Map([['puerta', 1]]);
    const result = computeStepApertures(PIECES, SEQUENCE, 3, overrides);
    assert.equal(result.get('puerta'), 1);
    assert.equal(result.get('cajon'), 1);
  });

  it('override se clamp a 0..1', () => {
    const overrides = new Map([['puerta', 1.7]]);
    const result = computeStepApertures(PIECES, SEQUENCE, 2, overrides);
    assert.equal(result.get('puerta'), 1);
  });

  it('sin overrides, todas las piezas móviles de pasos ≤ actual están en el mapa', () => {
    const result = computeStepApertures(PIECES, SEQUENCE, 3);
    assert.deepEqual([...result.keys()].sort(), ['cajon', 'puerta']);
  });

  it('integración con buildAssemblySequence: casco real primero, accesorios al final', () => {
    const pieces = [
      piece('tapa', 'Tapa'),
      piece('puerta', 'Puerta derecha'),
      piece('lat-izq', 'Lateral izquierdo'),
      piece('base', 'Base'),
      piece('cajon', 'Frente cajon 1'),
    ];
    const sequence = buildAssemblySequence(pieces);
    const result = computeStepApertures(pieces, sequence, sequence.totalPasos);
    // Último paso: el cajón se abre; la puerta (paso anterior) queda cerrada.
    assert.equal(result.get('cajon'), 1);
    assert.equal(result.get('puerta'), 0);
    // Casco: sin movimiento, nunca aparece.
    assert.ok(!result.has('lat-izq'));
    assert.ok(!result.has('base'));
    assert.ok(!result.has('tapa'));
  });
});
