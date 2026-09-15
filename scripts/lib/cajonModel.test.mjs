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

import { cajon, baseTapaLateralesFondo, header } from './cajonModel.mjs';
import { parseCSV } from '../../frontend/public/assembly-planner/js/csvParser.js';

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
      const caso = {
        anchoModulo: randInt(300, 1200),
        profundidadModulo: randInt(300, 650),
        altoVano: randInt(60, 700),
        nPorFila: tipo === 'volquete' ? 1 : pick([1, 1, 2, 3]),
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
