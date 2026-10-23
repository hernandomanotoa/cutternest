// js/services/plinthFrameService.test.js — Zócalo estructural a marco
// (cajón único del ancho total): plano de despiece, divisiones paralelas
// bajo cajones, niveladores y verificación de levantamiento en vertical.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlinthFrame,
  plinthFrameSpec,
  rootModuleDims,
  hasPlinthFrame,
  modulosConCajones,
  plinthTotalWidth,
  plinthLevelerCount,
  divparLayoutFromPieces,
  marcoDesactualizado,
  computeLiftCheck,
} from './plinthFrameService.js';

describe('buildPlinthFrame (forma paramétrica)', () => {
  const base = { profundidad: 600, altoZocalo: 90, espesor: 18 };

  it('genera un solo marco con largueros del ancho total', () => {
    const r = buildPlinthFrame({ moduleWidths: [850, 850], ...base });
    assert.ok(r.ok);
    assert.deepEqual(r.spec, { ancho: 1700, profundidad: 600, altoZocalo: 90, espesor: 18 });
    const ids = r.pieces.map((p) => p.id);
    assert.deepEqual(ids, [
      'glb-zocalo-frente', 'glb-zocalo-trasero',
      'glb-zocalo-costado-izq', 'glb-zocalo-costado-der',
    ]);
    assert.equal(r.pieces.find((p) => p.id === 'glb-zocalo-frente').ancho, 1700 - 2 * 18);
    const costado = r.pieces.find((p) => p.id === 'glb-zocalo-costado-izq');
    assert.equal(costado.ancho, 600 - 2 * 18, 'costados entre frente y trasero');
    assert.equal(costado.alto, 90);
    assert.equal(costado.modulo, 'estructura');
    assert.equal(costado.pos_z, 0);
  });

  it('agrega división paralela al frente bajo módulos con cajones', () => {
    const r = buildPlinthFrame({
      moduleWidths: [850, 450], ...base,
      drawerModules: [{ moduloId: '1', ancho: 850 }],
    });
    const divpar = r.pieces.find((p) => p.id === 'glb-zocalo-divpar-1');
    assert.ok(divpar);
    assert.equal(divpar.ancho, 850 - 2 * 18);
    assert.equal(divpar.rotate, true);
    assert.match(divpar.nombre, /paralela frente M1/);
    assert.equal(r.pieces.filter((p) => p.id.includes('divpar')).length, 1);
  });

  it('avisa cuando el larguero supera el tablero estándar o es inestable', () => {
    const largo = buildPlinthFrame({ moduleWidths: [2600], ...base });
    assert.ok(largo.warnings.some((w) => w.includes('2440')));
    const angosto = buildPlinthFrame({ moduleWidths: [80], ...base, altoZocalo: 150 });
    assert.ok(angosto.warnings.some((w) => w.includes('inestabilidad')));
  });

  it('valida parámetros', () => {
    assert.equal(buildPlinthFrame({ moduleWidths: [], ...base }).ok, false);
    assert.equal(buildPlinthFrame({ moduleWidths: [500], ...base, profundidad: 0 }).ok, false);
  });
});

describe('helpers derivados de las piezas (CSV-safe)', () => {
  const mk = (widths, opts = {}) => buildPlinthFrame({
    moduleWidths: widths, profundidad: 600, altoZocalo: 100, espesor: 15, ...opts,
  }).pieces;

  it('plinthFrameSpec reconstruye la forma en ambas direcciones', () => {
    const pieces = mk([850, 450]);
    assert.deepEqual(plinthFrameSpec(pieces), {
      ancho: 1300, profundidad: 600, altoZocalo: 100, espesor: 15,
    });
    assert.equal(plinthFrameSpec([]), null);
  });

  it('hasPlinthFrame / plinthTotalWidth / niveladores', () => {
    const pieces = mk([850]);
    assert.equal(hasPlinthFrame(pieces), true);
    assert.equal(hasPlinthFrame([]), false);
    assert.equal(plinthTotalWidth(pieces), 850);
    assert.equal(plinthLevelerCount(pieces), 4, '2 × ceil(850/600)');
    assert.equal(plinthLevelerCount(mk([1700])), 6, '2 × ceil(1700/600)');
    assert.equal(plinthLevelerCount([]), 0);
  });

  it('divparLayoutFromPieces deriva posiciones acumuladas', () => {
    const pieces = mk([850, 450], { drawerModules: [{ moduloId: '1', ancho: 850 }, { moduloId: '2', ancho: 450 }] });
    assert.deepEqual(divparLayoutFromPieces(pieces), [{ x0: 0, width: 850 }, { x0: 850, width: 450 }]);
  });

  it('marcoDesactualizado detecta cambios de módulos', () => {
    const casco = [
      { id: 'm1-tapa', nombre: 'Tapa', ancho: 850, alto: 600, espesor: 15, modulo: '1' },
      { id: 'm1-lateral-izq', nombre: 'Lateral', ancho: 600, alto: 2400, modulo: '1' },
    ];
    const marco = mk([850], { espesor: 15 });
    assert.equal(marcoDesactualizado([...casco, ...marco]), false);
    const cascoNuevo = casco.map((p) => (/-tapa$/.test(p.id) ? { ...p, ancho: 900 } : p));
    assert.equal(marcoDesactualizado([...cascoNuevo, ...marco]), true);
  });

  it('modulosConCajones detecta el módulo raíz aunque el frente viva en submódulo', () => {
    const pieces = [
      { id: 'm1-tapa', nombre: 'Tapa', ancho: 850, alto: 2400, espesor: 15, modulo: '1' },
      { id: 'm1cajon1-frente', nombre: 'Frente cajon 1 M1', ancho: 818, alto: 197, modulo: '11' },
      { id: 'm2-tapa', nombre: 'Tapa', ancho: 600, alto: 2400, espesor: 15, modulo: '2' },
      { id: 'm2-repisa-1', nombre: 'Repisa 1 M2', ancho: 570, alto: 600, modulo: '2' },
    ];
    assert.deepEqual(modulosConCajones(pieces), [{ moduloId: '1', ancho: 850 }]);
  });

  it('rootModuleDims ignora submódulos y lee el alto de los laterales', () => {
    const pieces = [
      { id: 'm2-tapa', nombre: 'Tapa', ancho: 400, alto: 2400, espesor: 15, modulo: '2' },
      { id: 'm1-tapa', nombre: 'Tapa', ancho: 600, alto: 600, espesor: 15, modulo: '1' },
      { id: 'm1-lateral-izq', nombre: 'Lateral', ancho: 550, alto: 2400, modulo: '1' },
      { id: 'm1cajon1-base', nombre: 'Base cajon', ancho: 765, alto: 545, modulo: '11' },
      { id: 'glb-zocalo-frente', nombre: 'Zocalo', ancho: 300, alto: 90, modulo: 'estructura' },
    ];
    const dims = rootModuleDims(pieces);
    assert.deepEqual(dims.map((d) => d.id), ['1', '2']);
    assert.equal(dims[0].ancho, 600);
    assert.equal(dims[0].alto, 2400);
    assert.equal(dims[0].profundidad, 550);
  });
});

describe('computeLiftCheck', () => {
  it('ejemplo del brief: 2400 techo, 2390 alto, 600 fondo, Z=90', () => {
    const r = computeLiftCheck({ altoModulo: 2390, altoZocalo: 90, profundidad: 600, hTecho: 2400 });
    assert.equal(r.altoCuerpo, 2300);
    assert.ok(Math.abs(r.diagonal - Math.hypot(2300, 600)) < 1e-9);
    assert.ok(r.holgura > 0, `holgura ${r.holgura}`);
    assert.equal(r.levantamientoOk, true);
    assert.equal(r.zEnRango, true);
    assert.deepEqual(r.warnings, []);
  });

  it('rechaza cuando la diagonal no cabe en el techo', () => {
    const r = computeLiftCheck({ altoModulo: 2600, altoZocalo: 90, profundidad: 600, hTecho: 2400 });
    assert.equal(r.levantamientoOk, false);
    assert.ok(r.warnings.some((w) => w.includes('No cabe en vertical')));
  });

  it('valida Z_real contra el rango [60, 150]', () => {
    const r = computeLiftCheck({ altoModulo: 2400, altoZocalo: 200, profundidad: 600, hTecho: 2400 });
    assert.equal(r.zEnRango, false);
    assert.ok(r.warnings.some((w) => w.includes('fuera de rango')));
  });

  it('sin altura de techo la verificación se omite', () => {
    const r = computeLiftCheck({ altoModulo: 2400, altoZocalo: 90, profundidad: 600 });
    assert.equal(r.skipped, true);
    assert.equal(r.levantamientoOk, null);
  });
});
