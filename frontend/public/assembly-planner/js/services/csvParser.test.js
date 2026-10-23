import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from './csvParser.js';
import { inferRole } from './classifierService.js';

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

  it('exime cuando hay >=2 repisas fraccionando el vano (cajones abajo + repisas arriba)', () => {
    // Misma torre de frentes bajos (32%) pero con 2 repisas en el módulo
    // raíz: el vano superior está fraccionado y aprovechado, no es un hueco.
    const repisas = [
      'rep-1,Repisa superior,564,464,1,si,#FFFFFF,15,"T,B,L,R",m1,',
      'rep-2,Repisa media,564,464,1,si,#FFFFFF,15,"T,B,L,R",m1,',
    ];
    const csv = [...MODULE_CSV, ...repisas, ...tower('Frente cajon', 70)].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.equal(
      result.warnings.some((w) => w.includes('sobra vano')),
      false,
      `warning de cobertura inesperado con repisas: ${result.warnings.join(' | ')}`
    );
  });

  it('sí avisa con frentes bajos y UNA sola repisa (el vano queda mayormente vacío)', () => {
    const repisas = [
      'rep-1,Repisa superior,564,464,1,si,#FFFFFF,15,"T,B,L,R",m1,',
    ];
    const csv = [...MODULE_CSV, ...repisas, ...tower('Frente cajon', 70)].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.ok(
      result.warnings.some((w) => w.includes('sobra vano')),
      `se esperaba warning de cobertura: ${result.warnings.join(' | ')}`
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

describe('parseCSV - fondo de cajón por tipo de riel', () => {
  // Módulo + un cajón con laterales de alto 100 mm y base de 15 mm:
  // el fondo bien construido mide 85 mm (apoyado sobre la base). El ancho
  // de caja sigue el riel del frente: 411 telescópica / 424 oculta / 434
  // volquete (frente − 2·espLat).
  const drawerConFondo = (
    nombreFrente,
    { latAlto = 100, fondoAlto = 85, frenteAlto = 129, anchoCaja = 411 } = {}
  ) => [
    ...MODULE_CSV,
    `11-frente,${nombreFrente},464,${frenteAlto},1,no,#FFFFFF,15,"T,B,L,R",m11,`,
    `11-lat,Lateral cajon 11,350,${latAlto},1,no,#FFFFFF,15,"T,B,L",m11,`,
    `11-lat2,Lateral cajon der 11,350,${latAlto},1,no,#FFFFFF,15,"T,B,R",m11,`,
    `11-base,Base cajon 11,${anchoCaja},350,1,no,#FFFFFF,15,"T,B,L,R",m11,`,
    `11-fondo,Fondo cajon 11,${anchoCaja},${fondoAlto},1,no,#FFFFFF,15,,m11,`,
  ].join('\n');

  it('acepta el fondo apoyado sobre la base (alto = lateral − base)', () => {
    const result = parseCSV(drawerConFondo('Frente cajon M1'));
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.equal(
      result.warnings.some((w) => w.includes('fondo cajón')),
      false,
      `warning de fondo inesperado: ${result.warnings.join(' | ')}`
    );
  });

  it('advierte cuando el fondo no coincide con lateral − base', () => {
    const result = parseCSV(drawerConFondo('Frente cajon M1', { fondoAlto: 200 }));
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.ok(
      result.warnings.some((w) => w.includes('fondo cajón (200 mm)')),
      `se esperaba warning de alto de fondo: ${result.warnings.join(' | ')}`
    );
  });

  it('aplica el tope de alto del riel oculto (vano − maxHeightDeduction)', () => {
    // vano = 287 + 2 = 289 → tope oculto = 289 − 23 = 266; ancho caja = 466 − 42 = 424.
    // Laterales de 280 mm exceden el tope; fondo coherente con el tope: 266 − 15 = 251.
    const ok = parseCSV(
      drawerConFondo('Frente cajon oculto M1', { latAlto: 266, fondoAlto: 251, frenteAlto: 287, anchoCaja: 424 })
    );
    assert.equal(ok.ok, true, `errores inesperados: ${ok.errors.join(' | ')}`);
    assert.equal(
      ok.warnings.some((w) => w.includes('alto máximo')),
      false,
      `warning de tope inesperado: ${ok.warnings.join(' | ')}`
    );

    const excedido = parseCSV(
      drawerConFondo('Frente cajon oculto M1', { latAlto: 280, fondoAlto: 251, frenteAlto: 287, anchoCaja: 424 })
    );
    assert.equal(excedido.ok, true, `errores inesperados: ${excedido.errors.join(' | ')}`);
    assert.ok(
      excedido.warnings.some((w) => w.includes('exceden el alto máximo')),
      `se esperaba warning de tope oculto: ${excedido.warnings.join(' | ')}`
    );
  });

  it('no aplica tope de catálogo a la telescópica (sin maxHeightDeduction)', () => {
    // Mismas medidas que el caso oculto excedido: en telescópica son válidas
    // (fondo = 280 − 15 = 265 apoyado sobre la base).
    const result = parseCSV(drawerConFondo('Frente cajon M1', { latAlto: 280, fondoAlto: 265, frenteAlto: 287 }));
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.equal(
      result.warnings.some((w) => w.includes('alto máximo')),
      false,
      `warning de tope inesperado: ${result.warnings.join(' | ')}`
    );
  });

  it('exime el volquete/abatible (caja derivada del frente, sin corredera)', () => {
    // Ancho de caja clásico (434) pero fondo deliberadamente desfasado en
    // alto: no debe saltar la validación de fondo por riel.
    const result = parseCSV(
      drawerConFondo('Frente cajon abatible M1', { fondoAlto: 200, anchoCaja: 434 })
    );
    assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
    assert.equal(
      result.warnings.some((w) => w.includes('alto de la caja según riel')),
      false,
      `warning de fondo inesperado: ${result.warnings.join(' | ')}`
    );
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

describe('parseCSV - zócalo global vs suma de bases', () => {
  const marcoFrentes = (segs) => segs.map(([id, ancho], i) =>
    `glb-zocalo-s${i + 1}-frente,Zocalo marco S${i + 1} frente,${ancho},100,1,no,#C19A6B,18,"T,B,L,R",estructura,0`
  ).join('\n');

  it('zócalo a marco segmentado: Σ(ancho + 2*espesor) = suma de bases, sin aviso', () => {
    // Módulo de 600 → dos segmentos de 300: frentes de 300-2*18 = 264.
    const csv = [...MODULE_CSV, marcoFrentes([['s1', 264], ['s2', 264]])].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores: ${result.errors.join(' | ')}`);
    assert.ok(
      !result.warnings.some((w) => w.includes('no coincide con suma de bases')),
      `aviso espurio: ${result.warnings.join(' | ')}`
    );
  });

  it('zócalo a marco desactualizado (segmentos no cubren los módulos): avisa', () => {
    const csv = [...MODULE_CSV, marcoFrentes([['s1', 214]])].join('\n'); // cubre 250, bases 600
    const result = parseCSV(csv);
    assert.ok(
      result.warnings.some((w) => w.includes('no coincide con suma de bases')),
      `se esperaba aviso: ${result.warnings.join(' | ')}`
    );
  });

  it('zócalo clásico de catálogo (un frente a ancho total): sin aviso', () => {
    const csv = [...MODULE_CSV, 'glb-zocalo,Zocalo global,600,100,1,no,#C19A6B,18,"T,B,L,R",estructura,0'].join('\n');
    const result = parseCSV(csv);
    assert.ok(
      !result.warnings.some((w) => w.includes('no coincide con suma de bases')),
      `aviso espurio: ${result.warnings.join(' | ')}`
    );
  });
});

describe('parseCSV - zócalo único a marco', () => {
  it('frente único (glb-zocalo-frente): ancho + 2*espesor = suma de bases, sin aviso', () => {
    const csv = [
      ...MODULE_CSV,
      'glb-zocalo-frente,Zocalo marco frente,564,100,1,no,#C19A6B,18,"T,B,L,R",estructura,0',
      'glb-zocalo-trasero,Zocalo marco trasero,564,100,1,no,#C19A6B,18,"T,B,L,R",estructura,0',
      'glb-zocalo-costado-izq,Lateral zocalo izquierdo,564,100,1,no,#C19A6B,18,"T,B,L,R",estructura,0',
      'glb-zocalo-costado-der,Lateral zocalo derecho,564,100,1,no,#C19A6B,18,"T,B,L,R",estructura,0',
      'glb-zocalo-divpar-1,Division zocalo paralela frente M1,564,100,1,si,#C19A6B,18,"T,B,L,R",estructura,0',
    ].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.ok, true, `errores: ${result.errors.join(' | ')}`);
    assert.ok(
      !result.warnings.some((w) => w.includes('no coincide con suma de bases')),
      `aviso espurio: ${result.warnings.join(' | ')}`
    );
  });
});
