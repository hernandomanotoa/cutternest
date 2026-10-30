// scripts/lib/cajonModel.test.mjs — Test de propiedades del modelo de cajón.
//
// Genera cientos de combinaciones aleatorias (PRNG determinista, sin
// dependencias nuevas) con cajon() y las pasa por el parser real del planner
// (frontend/public/assembly-planner/js/csvParser.js). La propiedad
// verificada: para cualquier vano/módulo válidos, las piezas del cajón
// nunca disparan errores de parseo ni el warning de coherencia caja↔riel
// ("no encaja en ninguno de los dos"), es decir, el helper y el parser
// siempre están de acuerdo.
//
// Uso: node --test scripts/lib/cajonModel.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { cajon, baseTapaLateralesFondo, header, line } from './cajonModel.mjs';
import { parseCSV } from '../../frontend/public/assembly-planner/js/services/csvParser.js';

// PRNG mulberry32: determinista (misma semilla → mismos casos en cada run).
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260914);
const randInt = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function buildCsv({ anchoModulo, profundidadModulo, altoVano, nPorFila, tipo, vocabulario }) {
  const lines = [
    header('Propiedad cajon', 'caso generado por cajonModel.test.mjs'),
    ...baseTapaLateralesFondo(1, 1, anchoModulo, 1800, profundidadModulo, '#C19A6B'),
  ];
  for (let i = 1; i <= nPorFila; i++) {
    lines.push(
      ...cajon(1, i, {
        anchoModulo,
        profundidadModulo,
        altoVano,
        nPorFila,
        tipo,
        vocabulario,
        colorFrente: '#8B5A2B',
        colorLateral: '#D9C2A3',
        suffix: 'test',
      })
    );
  }
  return lines.join('\n');
}

describe('cajon() vs csvParser — propiedad de coherencia', () => {
  it('300 casos aleatorios: parsean sin errores y sin warning de coherencia', () => {
    const fallos = [];
    for (let iter = 0; iter < 300; iter++) {
      const tipo = pick(['corredera', 'corredera', 'corredera', 'volquete']);
      const nPorFila = tipo === 'volquete' ? 1 : pick([1, 1, 2, 3]);
      // La pila debe caber en el casco de 1800 (vano interior 1770, frente =
      // altoVano − 3, gap 2.5): la propiedad es coherencia cajón↔parser, no
      // validación de apilado — los casos generados deben ser fabricables.
      const altoMax = Math.min(700, Math.floor((1770 - (nPorFila - 1) * 2.5) / nPorFila) + 3);
      const caso = {
        anchoModulo: randInt(300, 1200),
        profundidadModulo: randInt(300, 650),
        altoVano: randInt(60, altoMax),
        nPorFila,
        tipo,
        vocabulario: pick(['cajon', 'zapatera']),
      };
      const result = parseCSV(buildCsv(caso));
      // Errores duros: la propiedad exige parseo limpio.
      if (!result.ok || result.errors.length) {
        fallos.push({ caso, errores: result.errors });
        continue;
      }
      // Warnings de coherencia geométrica caja↔frente↔riel: la regla crítica.
      // (Los warnings ergonómicos de frente, ítem 5, no son objeto de esta
      // propiedad: las alturas se eligen al azar a propósito.)
      const criticos = result.warnings.filter(
        (w) => /no encaja en ninguno de los dos/.test(w) || /no cabe en interior/.test(w)
      );
      if (criticos.length) fallos.push({ caso, criticos });
    }
    assert.deepEqual(fallos, [], `divergencias cajon()↔csvParser: ${JSON.stringify(fallos.slice(0, 3), null, 2)}`);
  });

  it('el modelo de 6 piezas siempre emite frente + 2 laterales + fondo + cara + base + tirador (corredera)', () => {
    const rows = cajon(2, 3, {
      anchoModulo: 850,
      profundidadModulo: 600,
      altoVano: 200,
      colorFrente: '#8B5A2B',
      colorLateral: '#D9C2A3',
    });
    assert.equal(rows.length, 7);
    for (const sufijo of ['frente', 'lateral-izq', 'lateral-der', 'fondo', 'cara', 'base', 'tirador']) {
      assert.ok(rows.some((r) => r.startsWith(`m23-cajon-${sufijo},`)), `falta pieza ${sufijo}`);
    }
  });

  it('el volquete no lleva pieza de cara (modelo de 6→5 piezas + tirador)', () => {
    const rows = cajon(2, 3, {
      anchoModulo: 850,
      profundidadModulo: 600,
      altoVano: 580,
      tipo: 'volquete',
      colorFrente: '#8B5A2B',
      colorLateral: '#D9C2A3',
    });
    assert.equal(rows.length, 6);
    assert.ok(rows.some((r) => r.includes('cajon abatible')));
    assert.ok(!rows.some((r) => r.startsWith('m23-cajon-cara,')));
  });
});

describe('cajon() con espesorModulo (casco de 18 mm)', () => {
  it('las fórmulas descuentan 18 en vez de 15', () => {
    const rows = cajon(1, 1, {
      anchoModulo: 600,
      profundidadModulo: 560,
      altoVano: 180,
      espesorModulo: 18,
      colorFrente: '#8B5A2B',
      colorLateral: '#D9C2A3',
    });
    // W = 600 − 36 = 564 → frente 562 × 177; lateral 499 × 141;
    // interior = round(564 − 25,4) − 36 = 503.
    const porSufijo = (suf) => rows.find((r) => r.startsWith(`m11-cajon-${suf},`));
    assert.ok(porSufijo('frente').includes(',562,177,1,si,'));
    assert.ok(porSufijo('lateral-izq').includes(',499,141,1,no,'));
    assert.ok(porSufijo('lateral-izq').includes(',18,"T,B,L",'));
    assert.ok(porSufijo('fondo').startsWith('m11-cajon-fondo,Fondo cajon M1,503,141,1,no,#F2F2F2,18,,'));
    // Base confinada: largo = lateral − 2·18 = 499 − 36 = 463.
    assert.ok(porSufijo('base').includes(',503,463,1,si,'));
  });

  it('parsea limpio sobre un casco también de 18 mm', () => {
    const E = 18;
    const lines = [
      header('Propiedad cajon E18', 'casco y cajon de 18 mm'),
      line('m1-base', 'Base modulo M1', 600, 560, 1, 'si', '#C19A6B', E, 'T,B,L,R', 1),
      line('m1-tapa', 'Tapa modulo M1', 600, 560, 1, 'si', '#C19A6B', E, 'T,B,L,R', 1),
      line('m1-lateral-izq', 'Lateral izquierdo M1', 560, 1800, 1, 'no', '#C19A6B', E, 'T,B,L', 1),
      line('m1-lateral-der', 'Lateral derecho M1', 560, 1800, 1, 'no', '#C19A6B', E, 'T,B,R', 1),
      line('m1-fondo', 'Fondo modulo M1', 600 - 2 * E, 1800 - 2 * E, 1, 'no', '#F2F2F2', E, '', 1),
      ...cajon(1, 1, {
        anchoModulo: 600, profundidadModulo: 560, altoVano: 180, espesorModulo: E,
        colorFrente: '#8B5A2B', colorLateral: '#D9C2A3',
      }),
    ];
    const result = parseCSV(lines.join('\n'));
    assert.equal(result.ok, true, result.errors?.join('; '));
    const criticos = result.warnings.filter(
      (w) => /no encaja en ninguno de los dos/.test(w) || /no cabe en interior/.test(w)
    );
    assert.deepEqual(criticos, [], criticos.join('; '));
  });
});

describe('cajon() zapatera: división transversal (espejo de addShoeTray)', () => {
  it('vocabulario zapatera agrega la división (misma luz que el fondo)', () => {
    const rows = cajon(1, 1, {
      anchoModulo: 800,
      profundidadModulo: 500,
      altoVano: 250,
      vocabulario: 'zapatera',
      colorFrente: '#C19A6B',
      colorLateral: '#D9C2A3',
      suffix: '1',
    });
    // 8 filas: frente + 2 laterales + fondo + cara + división + base + tirador.
    assert.equal(rows.length, 8);
    const division = rows.find((r) => r.startsWith('m11-zapatera-division,'));
    assert.ok(division, 'falta la división transversal');
    const fondo = rows.find((r) => r.startsWith('m11-zapatera-fondo,'));
    // interior = round(770 − 25,4) − 30 = 715; latAlto = 247 − 30 = 217.
    assert.ok(division.includes('Division zapatera extraible 1 M1,715,217,1,no,'), division);
    assert.ok(division.includes(',715,217,'), 'misma luz y alto que el fondo');
    assert.ok(fondo.includes(',715,217,'));
  });

  it('division: false la omite y el volquete jamás la lleva', () => {
    const sinDivision = cajon(1, 1, {
      anchoModulo: 800, profundidadModulo: 500, altoVano: 250,
      vocabulario: 'zapatera', division: false,
      colorFrente: '#C19A6B', colorLateral: '#D9C2A3',
    });
    assert.ok(!sinDivision.some((r) => r.includes('-division,')));
    const volquete = cajon(1, 2, {
      anchoModulo: 600, profundidadModulo: 300, altoVano: 580,
      vocabulario: 'zapatera', tipo: 'volquete',
      colorFrente: '#C19A6B', colorLateral: '#D9C2A3',
    });
    assert.ok(!volquete.some((r) => r.includes('-division,')));
  });
});

describe('cajon() fondoMetodo ranurado (espejo de addDrawer)', () => {
  const OPTS = {
    anchoModulo: 850, profundidadModulo: 600, altoVano: 200,
    colorFrente: '#8B5A2B', colorLateral: '#D9C2A3',
  };

  it('el fondo ranurado se corta más ancho (interior + 2·ranura) y más alto (lateral − 2·ranura)', () => {
    const rows = cajon(1, 1, { ...OPTS, fondoMetodo: 'ranurado' });
    // Mismas fórmulas que addDrawer: latAlto = 197 − 30 = 167;
    // interior = round(820 − 25,4) − 30 = 765. Ranura 6: fondo 777 × 155.
    const fondo = rows.find((r) => r.startsWith('m11-cajon-fondo,'));
    assert.ok(fondo, 'falta el fondo');
    assert.ok(fondo.includes(',777,155,1,no,#F2F2F2,15,,'), fondo);
    // La cara conserva el interior (765 × 167): solo el fondo cambia.
    const cara = rows.find((r) => r.startsWith('m11-cajon-cara,'));
    assert.ok(cara.includes(',765,167,1,no,'), cara);
  });

  it('es coherente con addDrawer pieza a pieza (mismas medidas del fondo)', async () => {
    const { addDrawer } = await import('../../frontend/public/assembly-planner/js/services/closetBuilderService.js');
    const builder = addDrawer(1, 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, fondoMetodo: 'ranurado' });
    assert.ok(builder.ok, builder.errors?.join('; '));
    const fondoBuilder = builder.pieces.find((p) => p.id.endsWith('-fondo'));
    const rows = cajon(1, 1, { ...OPTS, fondoMetodo: 'ranurado' });
    const fondoModel = rows.find((r) => r.startsWith('m11-cajon-fondo,')).split(',');
    assert.equal(Number(fondoModel[2]), fondoBuilder.ancho, 'ancho del fondo: cajonModel = addDrawer');
    assert.equal(Number(fondoModel[3]), fondoBuilder.alto, 'alto del fondo: cajonModel = addDrawer');
  });

  it('retrocompatibilidad: sin fondoMetodo el fondo mide interior × latAlto (como antes)', () => {
    const rows = cajon(1, 1, OPTS);
    const fondo = rows.find((r) => r.startsWith('m11-cajon-fondo,'));
    assert.ok(fondo.includes(',765,167,1,no,#F2F2F2,15,,'), fondo);
  });

  it('respeta el espesor del módulo (E=18): la ranura se acota a E/2', () => {
    const rows = cajon(1, 1, { ...OPTS, espesorModulo: 18, fondoMetodo: 'ranurado' });
    // latAlto = 197 − 36 = 161; interior = round(814 − 25,4) − 36 = 753.
    // ranura = min(6, floor(18/2)) = 6 → fondo 765 × 149.
    const fondo = rows.find((r) => r.startsWith('m11-cajon-fondo,'));
    assert.ok(fondo.includes(',765,149,1,no,#F2F2F2,18,,'), fondo);
  });

  it('el volquete conserva el fondo clásico aunque se pida ranurado', () => {
    const rows = cajon(1, 1, { ...OPTS, tipo: 'volquete', altBandeja: 150, fondoMetodo: 'ranurado' });
    const fondo = rows.find((r) => r.startsWith('m11-cajon-fondo,'));
    // Modelo clásico del volquete: interior × (latAlto − E).
    assert.ok(fondo.includes(',788,135,1,no,'), fondo);
  });
});
