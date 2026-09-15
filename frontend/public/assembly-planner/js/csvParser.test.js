import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from './csvParser.js';
import { inferRole } from './services/classifierService.js';

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

describe('parseCSV - rangos ergonómicos de frente', () => {
  const drawer = (sub, nombre, frenteAlto) => [
    `${sub}-frente,${nombre},464,${frenteAlto},1,no,#FFFFFF,15,"T,B,L,R",m${sub},`,
    `${sub}-lat,Lateral cajon ${sub},350,40,1,no,#FFFFFF,15,"T,B,L",m${sub},`,
    `${sub}-base,Base cajon ${sub},434,350,1,no,#FFFFFF,15,"T,B,L,R",m${sub},`,
    `${sub}-fondo,Fondo cajon ${sub},434,25,1,no,#FFFFFF,15,,m${sub},`,
  ];

  it('marca un frente de cajón corredero demasiado alto (>320 mm)', () => {
    const csv = [...MODULE_CSV, ...drawer('11', 'Frente cajon M1', 400)].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.ok(
      result.warnings.some((w) => w.includes('frente de cajón muy alto (400 mm)')),
      `se esperaba warning ergonómico: ${result.warnings.join(' | ')}`
    );
  });

  it('exime los frentes abatibles/volquetes (frente alto pivotante)', () => {
    const csv = [...MODULE_CSV, ...drawer('11', 'Frente cajon abatible M1', 577)].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.equal(
      result.warnings.some((w) => w.includes('frente de cajón muy alto')),
      false,
      `warning inesperado: ${result.warnings.join(' | ')}`
    );
  });

  it('marca bandejas zapatera fuera de 150-220 mm', () => {
    const csv = [...MODULE_CSV, ...drawer('11', 'Frente zapatera extraible M1', 400)].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.ok(
      result.warnings.some((w) => w.includes('frente de zapatera muy alto')),
      `se esperaba warning de zapatera: ${result.warnings.join(' | ')}`
    );
  });
});

describe('parseCSV - cobertura de vano en torres de cajones', () => {
  // Torre de 3 cajones en un casco de 700 mm: frentes de 70 mm → 210/664 mm
  // (32%) del alto útil: debe avisar de vano vacío.
  const tower = (frontNombre, frontAlto) => ['11', '12', '13'].map((sub) => [
    `${sub}-frente,${frontNombre} ${sub},464,${frontAlto},1,no,#FFFFFF,15,"T,B,L,R",m${sub},`,
    `${sub}-lat,Lateral cajon ${sub},350,40,1,no,#FFFFFF,15,"T,B,L",m${sub},`,
    `${sub}-base,Base cajon ${sub},434,350,1,no,#FFFFFF,15,"T,B,L,R",m${sub},`,
    `${sub}-fondo,Fondo cajon ${sub},434,25,1,no,#FFFFFF,15,,m${sub},`,
  ]).flat();

  it('avisa cuando los frentes cubren menos del 35% del alto útil', () => {
    const csv = [...MODULE_CSV, ...tower('Frente cajon', 70)].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.ok(
      result.warnings.some((w) => w.includes('sobra vano')),
      `se esperaba warning de cobertura: ${result.warnings.join(' | ')}`
    );
  });

  it('no avisa en una torre bien aprovechada', () => {
    const csv = [...MODULE_CSV, ...tower('Frente cajon', 200)].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.equal(
      result.warnings.some((w) => w.includes('sobra vano')),
      false,
      `warning de cobertura inesperado: ${result.warnings.join(' | ')}`
    );
  });

  it('exime las torres de bandejas zapateras (el hueco lo ocupa el calzado)', () => {
    const csv = [...MODULE_CSV, ...tower('Frente zapatera extraible', 70)].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.equal(
      result.warnings.some((w) => w.includes('sobra vano')),
      false,
      `warning de cobertura inesperado: ${result.warnings.join(' | ')}`
    );
  });
});

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

describe('parseCSV - zapatera-cajón (submódulo mínimo)', () => {
  it('acepta un submódulo 1.1 con solo frente + laterales (sin fondo/base)', () => {
    const csv = [
      ...MODULE_CSV,
      'z1-frente,Frente zapatera extraible 1,550,150,1,no,#FFFFFF,18,"T,B,L,R",m1.1,',
      'z1-lat-izq,Lateral zapatera extraible 1 izq,400,150,1,no,#FFFFFF,15,"T,B,L",m1.1,',
      'z1-lat-der,Lateral zapatera extraible 1 der,400,150,1,no,#FFFFFF,15,"T,B,R",m1.1,',
    ].join('\n');
    const result = parseCSV(csv);

    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.deepEqual(result.warnings, [], `warnings inesperados: ${result.warnings.join(' | ')}`);
    assert.ok(result.pieces.find((p) => p.id === 'z1-frente'), 'falta el frente zapatera');
  });
});

describe('parseCSV - zócalo-cajón global (modelo sin base global)', () => {
  // Dos módulos 600×700×450 con base propia → suma de anchos = 1200.
  // Los laterales del zócalo se listan ANTES del frente a propósito: su ancho
  // (450 = profundidad) no debe contaminar la comparación frente vs Σ módulos.
  const baseCSV = (frenteAncho) => [
    HEADER,
    'glb-zocalo-lateral-izq,Lateral zocalo izquierdo,450,150,1,no,#FFFFFF,15,"T,B,L",estructura,',
    'glb-zocalo-lateral-der,Lateral zocalo derecho,450,150,1,no,#FFFFFF,15,"T,B,R",estructura,',
    `glb-zocalo,Zocalo corrido,${frenteAncho},150,1,si,#FFFFFF,15,"T,B,L,R",estructura,`,
    'm1-lat-izq,Lateral izquierdo M1,450,700,1,no,#FFFFFF,15,"T,B,L",1,',
    'm1-lat-der,Lateral derecho M1,450,700,1,no,#FFFFFF,15,"T,B,R",1,',
    'm1-base,Base modulo M1,600,450,1,si,#FFFFFF,15,"T,B,L,R",1,',
    'm1-tapa,Tapa modulo M1,600,450,1,si,#FFFFFF,15,"T,B,L,R",1,',
    'm1-fondo,Fondo modulo M1,600,700,1,no,#FFFFFF,15,,1,',
    'm2-lat-izq,Lateral izquierdo M2,450,700,1,no,#FFFFFF,15,"T,B,L",2,',
    'm2-lat-der,Lateral derecho M2,450,700,1,no,#FFFFFF,15,"T,B,R",2,',
    'm2-base,Base modulo M2,600,450,1,si,#FFFFFF,15,"T,B,L,R",2,',
    'm2-tapa,Tapa modulo M2,600,450,1,si,#FFFFFF,15,"T,B,L,R",2,',
    'm2-fondo,Fondo modulo M2,600,700,1,no,#FFFFFF,15,,2,',
  ].join('\n');

  const zocaloWidthWarning = (result) =>
    result.warnings.filter((w) => /zócalo.*suma de bases/i.test(w));

  it('clasifica los laterales del zócalo global como plinth_side (no side_panel ni bottom_panel)', () => {
    const result = parseCSV(baseCSV(1200));
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    const latIzq = result.pieces.find((p) => p.id === 'glb-zocalo-lateral-izq');
    assert.equal(inferRole(latIzq), 'plinth_side');
    const frente = result.pieces.find((p) => p.id === 'glb-zocalo');
    assert.equal(inferRole(frente), 'bottom_panel');
  });

  it('no advierte cuando el frente coincide con la suma de anchos (laterales no contaminan)', () => {
    const result = parseCSV(baseCSV(1200));
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.deepEqual(zocaloWidthWarning(result), [], `warnings inesperados: ${result.warnings.join(' | ')}`);
  });

  it('advierte cuando el frente no coincide con la suma de anchos de módulos', () => {
    const result = parseCSV(baseCSV(1190));
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.equal(zocaloWidthWarning(result).length, 1, `se esperaba 1 warning de ancho de zócalo: ${result.warnings.join(' | ')}`);
  });
});
