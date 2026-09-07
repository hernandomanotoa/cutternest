import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from './csvParser.js';

const HEADER = 'id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo,pos_z';

// Módulo rectangular coherente (base/tapa/laterales/fondo) para no generar
// warnings de estructura que ensucien las aserciones de pandeo.
const MODULE_CSV = [
  HEADER,
  'lat-1,Lateral izquierdo,500,700,1,no,#FFFFFF,18,"T,B,L,R",m1,',
  'lat-2,Lateral derecho,500,700,1,no,#FFFFFF,18,"T,B,L,R",m1,',
  'base-1,Base,600,500,1,no,#FFFFFF,18,"T,B",m1,',
  'tapa-1,Tapa,600,500,1,no,#FFFFFF,18,"T,B",m1,',
  'fondo-1,Fondo trasero,564,664,1,no,#FFFFFF,15,,m1,',
];

const pandeoWarnings = (result) =>
  result.warnings.filter((w) => /^(CRÍTICO|ALTO):/.test(w));

describe('parseCSV - pandeo', () => {
  it('no marca pandeo en "Fondo estanteria" (rol back_panel, no shelf)', () => {
    const csv = [...MODULE_CSV, 'fondo-est,Fondo estanteria,900,650,1,no,#FFFFFF,15,,m1,'].join('\n');
    const result = parseCSV(csv);

    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    const fondo = result.pieces.find((p) => p.id === 'fondo-est');
    assert.equal(fondo.riesgo, undefined);
    assert.equal(
      pandeoWarnings(result).some((w) => w.includes('"Fondo estanteria"')),
      false,
      `warning de pandeo inesperado: ${pandeoWarnings(result).join(' | ')}`
    );
  });

  it('no marca pandeo en "Zocalo estanteria" (rol plinth, no shelf)', () => {
    const csv = [...MODULE_CSV, 'zoc-est,Zocalo estanteria,900,120,1,no,#FFFFFF,15,"T,B",m1,'].join('\n');
    const result = parseCSV(csv);

    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    const zocalo = result.pieces.find((p) => p.id === 'zoc-est');
    assert.equal(zocalo.riesgo, undefined);
    assert.equal(
      pandeoWarnings(result).some((w) => w.includes('"Zocalo estanteria"')),
      false
    );
  });

  it('marca crítico una repisa de 900 mm sin soporte en el módulo', () => {
    const csv = [...MODULE_CSV, 'rep-1,Repisa X,900,500,1,no,#FFFFFF,15,"T,B",m1,'].join('\n');
    const result = parseCSV(csv);

    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    const repisa = result.pieces.find((p) => p.id === 'rep-1');
    assert.equal(repisa.riesgo, 'critico');
    assert.ok(
      pandeoWarnings(result).some((w) => w.includes('CRÍTICO: "Repisa X"')),
      `se esperaba warning CRÍTICO para "Repisa X": ${result.warnings.join(' | ')}`
    );
  });

  it('evalúa piezas shelf por rol aunque el nombre no diga repisa/estante (p. ej. zapatero)', () => {
    const csv = [...MODULE_CSV, 'band-1,Bandeja zapatero,900,300,1,no,#FFFFFF,15,"T,B",m1,'].join('\n');
    const result = parseCSV(csv);

    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    const bandeja = result.pieces.find((p) => p.id === 'band-1');
    assert.equal(bandeja.riesgo, 'critico');
    assert.ok(
      pandeoWarnings(result).some((w) => w.includes('CRÍTICO: "Bandeja zapatero"')),
      `se esperaba warning CRÍTICO para "Bandeja zapatero": ${result.warnings.join(' | ')}`
    );
  });

  it('con soporte/divisor en el módulo baja el riesgo de una repisa crítica a medio', () => {
    const csv = [
      ...MODULE_CSV,
      'div-1,Divisor central,500,300,1,no,#FFFFFF,18,"T,B,L,R",m1,',
      'rep-1,Repisa X,900,500,1,no,#FFFFFF,15,"T,B",m1,',
    ].join('\n');
    const result = parseCSV(csv);

    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    const repisa = result.pieces.find((p) => p.id === 'rep-1');
    assert.equal(repisa.riesgo, 'medio');
    assert.equal(pandeoWarnings(result).some((w) => w.includes('"Repisa X"')), false);
  });
});
