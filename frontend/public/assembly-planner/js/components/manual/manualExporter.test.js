import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneHtml } from './manualExporter.js';

const piecesById = {
  'lat-izq': { nombre: 'Lateral izquierdo M5' },
  'lat-der': { nombre: 'Lateral derecho M5' },
  'base': { nombre: 'Base M5' },
  'tapa': { nombre: 'Tapa M5' },
  'div': { nombre: 'Division vertical M5' },
  'est-izq': { nombre: 'Estante regulable izquierdo 1 M5' },
  'est-der': { nombre: 'Estante regulable derecho 1 M5' },
};

const steps = [
  { paso: 1, piezas: ['lat-izq', 'lat-der'], tiempo: 10 },
  { paso: 2, piezas: ['base', 'tapa'], tiempo: 15 },
  { paso: 3, piezas: ['est-izq'], tiempo: 10 },
  { paso: 4, piezas: ['div'], tiempo: 10 },
  { paso: 5, piezas: ['est-der'], tiempo: 10 },
];

describe('manualExporter', () => {
  it('builds a standalone HTML manual with all steps', () => {
    const html = buildStandaloneHtml(steps, piecesById, 'Módulo 5');
    assert.ok(html.includes('<!DOCTYPE html>'), 'should be a complete HTML document');
    assert.ok(html.includes('Manual de Ensamblaje — Módulo 5'), 'should include module label');
    assert.ok(html.includes('Paso 1'), 'should include step 1');
    assert.ok(html.includes('Paso 5'), 'should include step 5');
    assert.ok(html.includes('Lateral izquierdo M5'), 'should include piece names');
  });

  it('orders left shelf before divider before right shelf', () => {
    const html = buildStandaloneHtml(steps, piecesById, 'M5');
    const leftIdx = html.indexOf('izquierdo 1');
    const divIdx = html.indexOf('Division vertical');
    const rightIdx = html.indexOf('derecho 1');
    assert.ok(leftIdx < divIdx, 'left shelf should appear before divider');
    assert.ok(divIdx < rightIdx, 'divider should appear before right shelf');
  });
});
