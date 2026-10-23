// js/services/plinthFrameService.test.js — Zócalo estructural a marco:
// segmentos alineados a juntas, plano de despiece, niveladores y
// verificación de levantamiento en vertical (restricción de diagonal).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computePlinthSegments,
  plinthFramePieces,
  plinthLayoutFromPieces,
  levelerCountForSegment,
  totalLevelers,
  dividerX,
  rootModuleDims,
  computeLiftCheck,
  hasPlinthFrame,
  modulosConCajones,
  plinthTotalWidth,
  plinthLevelerCount,
  divparLayoutFromPieces,
  marcoDesactualizado,
} from './plinthFrameService.js';

describe('computePlinthSegments', () => {
  it('divide un módulo ancho en partes de luz <= 600 con divisor', () => {
    const r = computePlinthSegments([850]);
    assert.ok(r.ok);
    assert.equal(r.segments.length, 2);
    assert.equal(r.segments[0].width, 425);
    assert.equal(r.segments[1].x0, 425);
    assert.equal(r.segments[1].width, 425);
    assert.deepEqual(r.segments[0].dividers, [425]);
    assert.deepEqual(r.segments[1].dividers, []);
    assert.equal(r.totalWidth, 850);
  });

  it('respeta las juntas entre módulos como límites de sub-zócalo', () => {
    const r = computePlinthSegments([400, 400]);
    assert.ok(r.ok);
    assert.equal(r.segments.length, 2);
    assert.equal(r.segments[0].x0, 0);
    assert.equal(r.segments[1].x0, 400);
    assert.equal(r.segments[0].junctionRight, true);
    assert.equal(r.segments[1].junctionLeft, true);
    // La unión de dos módulos no necesita divisor interno.
    assert.deepEqual(r.segments[0].dividers, []);
  });

  it('módulos de 600-800 van enteros sin divisor (4 niveladores)', () => {
    const r = computePlinthSegments([700, 700]);
    assert.ok(r.ok);
    assert.equal(r.segments.length, 2);
    assert.deepEqual(r.segments.map((s) => s.width), [700, 700]);
    assert.deepEqual(r.segments.map((s) => s.dividers.length), [0, 0]);
    assert.equal(totalLevelers(r.segments), 8);
  });

  it('solo divide el módulo ancho, el angosto queda entero', () => {
    const r = computePlinthSegments([900, 400]);
    assert.ok(r.ok);
    assert.equal(r.segments.length, 3);
    assert.deepEqual(r.segments.map((s) => s.width), [450, 450, 400]);
    assert.deepEqual(r.segments[1].dividers, []);
    assert.equal(r.totalWidth, 1300);
  });

  it('rechaja entrada inválida', () => {
    assert.equal(computePlinthSegments([]).ok, false);
    assert.equal(computePlinthSegments([0]).ok, false);
    assert.equal(computePlinthSegments([500], { maxSpan: 400, splitLight: 600 }).ok, false);
  });
});

describe('plinthFramePieces', () => {
  const base = { profundidad: 600, altoZocalo: 90, espesor: 18, color: '#C19A6B' };

  it('genera las 4 paredes por sub-zócalo con la convención de cortes', () => {
    const segs = computePlinthSegments([850]).segments;
    const r = plinthFramePieces(segs, base);
    assert.ok(r.ok);
    // 2 segmentos × 4 piezas + 1 divisor.
    assert.equal(r.pieces.length, 9);
    const frente = r.pieces.find((p) => p.id === 'glb-zocalo-s1-frente');
    assert.equal(frente.ancho, 425 - 2 * 18); // larguero entre costados
    assert.equal(frente.alto, 90);
    assert.equal(frente.modulo, 'estructura');
    assert.equal(frente.pos_z, 0);
    const costado = r.pieces.find((p) => p.id === 'glb-zocalo-s1-costado-izq');
    assert.equal(costado.ancho, 600 - 2 * 18); // entre frente y trasero
    assert.equal(costado.alto, 90);
    const divisor = r.pieces.find((p) => p.id === 'glb-zocalo-s1-divisor-1');
    assert.ok(divisor);
    assert.equal(divisor.ancho, 600 - 2 * 18);
  });

  it('alerta inestabilidad cuando el sub-zócalo es más angosto que su alto', () => {
    const r = plinthFramePieces([{ index: 1, x0: 0, width: 80, modules: [0], dividers: [] }], { ...base, altoZocalo: 150 });
    assert.ok(r.ok);
    assert.ok(r.warnings.some((w) => w.includes('inestabilidad')));
  });

  it('valida parámetros', () => {
    assert.equal(plinthFramePieces([], base).ok, false);
    assert.equal(plinthFramePieces([{ index: 1, x0: 0, width: 400 }], { ...base, profundidad: 0 }).ok, false);
  });
});

describe('plinthLayoutFromPieces', () => {
  it('deriva el layout de ids + anchos (round-trip CSV)', () => {
    const segs = computePlinthSegments([900, 400]).segments;
    const { pieces } = plinthFramePieces(segs, { profundidad: 600, altoZocalo: 90, espesor: 18 });
    const layout = plinthLayoutFromPieces(pieces);
    assert.equal(layout.length, 3);
    assert.deepEqual(layout.map((s) => s.x0), [0, 450, 900]);
    assert.deepEqual(layout.map((s) => s.width), [450, 450, 400]);
    // El divisor se emite en el borde derecho de su parte (límite entre
    // partes del módulo ancho dividido).
    assert.deepEqual(layout[0].dividers, [450]);
    // Sin marco estructural devuelve [] (no rompe el zócalo clásico).
    assert.deepEqual(plinthLayoutFromPieces([{ id: 'glb-zocalo-lateral-izq', nombre: 'Lateral zocalo izquierdo' }]), []);
  });
});

describe('niveladores', () => {
  it('2 por sub-zócalo <= 600, 4 si es más ancho', () => {
    assert.equal(levelerCountForSegment(600), 2);
    assert.equal(levelerCountForSegment(601), 4);
  });
});

describe('rootModuleDims', () => {
  it('extrae ancho/alto/profundidad de las piezas del casco', () => {
    const pieces = [
      { id: 'm2-tapa', nombre: 'Tapa', ancho: 400, alto: 2400, espesor: 15, modulo: '2' },
      { id: 'm1-tapa', nombre: 'Tapa', ancho: 600, alto: 2400, espesor: 15, modulo: '1' },
      { id: 'm1-lateral-izq', nombre: 'Lateral', ancho: 550, alto: 2400, modulo: '1' },
      { id: 'glb-zocalo-s1-frente', nombre: 'Zocalo', ancho: 300, alto: 90, modulo: 'estructura' },
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

describe('modo único (zócalo del ancho total)', () => {
  const base = { profundidad: 600, altoZocalo: 90, espesor: 18, mode: 'unico' };

  it('genera un solo marco con largueros del ancho total', () => {
    const segs = [{ index: 1, x0: 0, width: 850, modules: [0], dividers: [] }];
    const r = plinthFramePieces(segs, base);
    assert.ok(r.ok);
    const ids = r.pieces.map((p) => p.id);
    assert.deepEqual(ids, [
      'glb-zocalo-frente', 'glb-zocalo-trasero',
      'glb-zocalo-costado-izq', 'glb-zocalo-costado-der',
    ]);
    assert.equal(r.pieces.find((p) => p.id === 'glb-zocalo-frente').ancho, 850 - 2 * 18);
  });

  it('agrega división paralela al frente bajo módulos con cajones', () => {
    const segs = [{ index: 1, x0: 0, width: 850, modules: [0], dividers: [] }];
    const r = plinthFramePieces(segs, { ...base, drawerModules: [{ moduloId: '1', ancho: 850 }] });
    const divpar = r.pieces.find((p) => p.id === 'glb-zocalo-divpar-1');
    assert.ok(divpar);
    assert.equal(divpar.ancho, 850 - 2 * 18);
    assert.equal(divpar.rotate, true);
    assert.match(divpar.nombre, /paralela frente M1/);
  });

  it('avisa cuando el larguero supera el tablero estándar', () => {
    const segs = [{ index: 1, x0: 0, width: 2600, modules: [0], dividers: [] }];
    const r = plinthFramePieces(segs, base);
    assert.ok(r.warnings.some((w) => w.includes('2440')));
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

  it('helpers: hasPlinthFrame, plinthTotalWidth y niveladores en ambos modos', () => {
    const segs = computePlinthSegments([850]).segments;
    const unico = plinthFramePieces([{ index: 1, x0: 0, width: 850, dividers: [] }], base).pieces;
    const seg = plinthFramePieces(segs, { profundidad: 600, altoZocalo: 90, espesor: 18 }).pieces;
    assert.equal(hasPlinthFrame(unico), true);
    assert.equal(hasPlinthFrame(seg), true);
    assert.equal(hasPlinthFrame([]), false);
    assert.equal(plinthTotalWidth(unico), 850);
    assert.equal(plinthTotalWidth(seg), 850);
    assert.equal(plinthLevelerCount(unico), 4, '2 por cada 600 mm de ancho');
    assert.equal(plinthLevelerCount(seg), 4, '2 por sub-zócalo de 425');
    // 1700 mm en modo único → 2*ceil(1700/600) = 6 niveladores.
    const ancho1700 = plinthFramePieces([{ index: 1, x0: 0, width: 1700, dividers: [] }], base).pieces;
    assert.equal(plinthLevelerCount(ancho1700), 6);
  });

  it('divparLayoutFromPieces deriva posiciones acumuladas (CSV-safe)', () => {
    const segs = [{ index: 1, x0: 0, width: 1300, dividers: [] }];
    const r = plinthFramePieces(segs, {
      ...base,
      drawerModules: [{ moduloId: '1', ancho: 850 }, { moduloId: '2', ancho: 450 }],
    });
    const layout = divparLayoutFromPieces(r.pieces);
    assert.deepEqual(layout, [{ x0: 0, width: 850 }, { x0: 850, width: 450 }]);
  });

  it('marcoDesactualizado funciona en modo único', () => {
    const unico = plinthFramePieces([{ index: 1, x0: 0, width: 850, dividers: [] }], base).pieces;
    const casco = [
      { id: 'm1-tapa', nombre: 'Tapa', ancho: 850, alto: 2400, espesor: 18, modulo: '1' },
      { id: 'm1-lateral-izq', nombre: 'Lateral', ancho: 600, alto: 2400, modulo: '1' },
    ];
    assert.equal(marcoDesactualizado([...casco, ...unico]), false);
    const cascoNuevo = casco.map((p) => (/-tapa$/.test(p.id) ? { ...p, ancho: 900 } : p));
    assert.equal(marcoDesactualizado([...cascoNuevo, ...unico]), true);
  });
});
