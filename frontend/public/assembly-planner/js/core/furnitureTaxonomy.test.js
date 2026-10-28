// js/core/furnitureTaxonomy.test.js — Invariantes de la taxonomía de muebles
// (datos puros): coherencia bidireccional FICHAS ↔ AMBIENTES, rangos de
// medidas/tiempos bien formados y niveles de complejidad ordenados sin
// solapes. La inferencia por rol/nombre sobre piezas reales se testea en
// js/services/__tests__/furnitureClassifier.test.js.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENTES,
  METODOS_PRODUCCION,
  ESTRUCTURAS_CONSTRUCTIVAS,
  USO_TABLERO,
  COMPLEXITY_SCORE_RANGES,
  NIVELES_COMPLEJIDAD,
  FICHAS,
} from './furnitureTaxonomy.js';

const NIVELES_VALIDOS = ['basico', 'medio', 'alto'];

describe('FICHAS ↔ AMBIENTES: coherencia bidireccional', () => {
  it('cada ficha está listada en exactamente un ambiente', () => {
    const apariciones = new Map();
    for (const [ambiente, tipos] of Object.entries(AMBIENTES)) {
      for (const tipo of tipos) {
        apariciones.set(tipo, (apariciones.get(tipo) || 0) + 1);
        assert.ok(FICHAS[tipo], `${tipo} está en ${ambiente} pero no tiene ficha`);
      }
    }
    for (const tipo of Object.keys(FICHAS)) {
      assert.equal(apariciones.get(tipo), 1, `${tipo}: debe aparecer en exactamente un ambiente`);
    }
  });

  it('los 5 ambientes tienen al menos un tipo de mueble', () => {
    for (const [ambiente, tipos] of Object.entries(AMBIENTES)) {
      assert.ok(Array.isArray(tipos) && tipos.length > 0, `${ambiente} sin tipos`);
      for (const tipo of tipos) assert.equal(typeof tipo, 'string');
    }
  });
});

describe('FICHAS: forma de cada ficha técnica', () => {
  it('nivel de complejidad válido', () => {
    for (const [tipo, ficha] of Object.entries(FICHAS)) {
      assert.ok(NIVELES_VALIDOS.includes(ficha.nivel),
        `${tipo}: nivel inválido "${ficha.nivel}"`);
      assert.ok(ficha.nivel in NIVELES_COMPLEJIDAD, `${tipo}: nivel sin entrada en NIVELES_COMPLEJIDAD`);
    }
  });

  it('medidasEstandar: ancho/alto/prof son rangos [min, max] con 0 < min < max', () => {
    for (const [tipo, ficha] of Object.entries(FICHAS)) {
      for (const eje of ['ancho', 'alto', 'prof']) {
        const rango = ficha.medidasEstandar?.[eje];
        assert.ok(Array.isArray(rango) && rango.length === 2,
          `${tipo}.${eje}: debe ser [min, max]`);
        const [min, max] = rango;
        assert.ok(Number.isFinite(min) && Number.isFinite(max), `${tipo}.${eje}: numérico`);
        assert.ok(min > 0, `${tipo}.${eje}: min positivo`);
        assert.ok(min < max, `${tipo}.${eje}: min < max (${min}..${max})`);
      }
    }
  });

  it('espesoresTipicos: lista no vacía de espesores positivos', () => {
    for (const [tipo, ficha] of Object.entries(FICHAS)) {
      assert.ok(Array.isArray(ficha.espesoresTipicos) && ficha.espesoresTipicos.length > 0,
        `${tipo}: sin espesores típicos`);
      for (const e of ficha.espesoresTipicos) {
        assert.ok(Number.isFinite(e) && e > 0, `${tipo}: espesor inválido ${e}`);
      }
    }
  });

  it('tiempoMinutos: rango [min, max] con 0 < min <= max', () => {
    for (const [tipo, ficha] of Object.entries(FICHAS)) {
      const [min, max] = ficha.tiempoMinutos || [];
      assert.ok(Number.isFinite(min) && Number.isFinite(max), `${tipo}: tiempos numéricos`);
      assert.ok(min > 0, `${tipo}: tiempo mínimo positivo`);
      assert.ok(min <= max, `${tipo}: min <= max (${min}..${max})`);
    }
  });

  it('herrajesTipicos: lista de strings no vacíos', () => {
    for (const [tipo, ficha] of Object.entries(FICHAS)) {
      assert.ok(Array.isArray(ficha.herrajesTipicos) && ficha.herrajesTipicos.length > 0,
        `${tipo}: sin herrajes típicos`);
      for (const h of ficha.herrajesTipicos) {
        assert.equal(typeof h, 'string');
        assert.ok(h.trim().length > 0, `${tipo}: herraje vacío`);
      }
    }
  });

  it('coherencia interna: a mayor complejidad, mayor tiempo mínimo', () => {
    // Invariante de catálogo: el tiempo mínimo nunca decrece al subir de nivel.
    const minPorNivel = { basico: Infinity, medio: Infinity, alto: Infinity };
    for (const ficha of Object.values(FICHAS)) {
      minPorNivel[ficha.nivel] = Math.min(minPorNivel[ficha.nivel], ficha.tiempoMinutos[0]);
    }
    assert.ok(minPorNivel.basico <= minPorNivel.medio,
      `tiempo mínimo básico (${minPorNivel.basico}) no supera al medio (${minPorNivel.medio})`);
    assert.ok(minPorNivel.medio <= minPorNivel.alto,
      `tiempo mínimo medio (${minPorNivel.medio}) no supera al alto (${minPorNivel.alto})`);
  });
});

describe('COMPLEXITY_SCORE_RANGES / NIVELES_COMPLEJIDAD', () => {
  it('cada nivel tiene label y scoreRange bien formados', () => {
    for (const [nivel, conf] of Object.entries(NIVELES_COMPLEJIDAD)) {
      assert.ok(conf.label.trim().length > 0, `${nivel}: label vacío`);
      assert.equal(conf.scoreRange, COMPLEXITY_SCORE_RANGES[nivel], `${nivel}: misma referencia de rango`);
      const [min, max] = conf.scoreRange;
      assert.ok(Number.isFinite(min), `${nivel}: mínimo finito`);
      assert.ok(min <= max, `${nivel}: rango ordenado`);
    }
  });

  it('básico empieza en 0 y alto no tiene techo (Infinity)', () => {
    assert.equal(COMPLEXITY_SCORE_RANGES.basico[0], 0);
    assert.equal(COMPLEXITY_SCORE_RANGES.alto[1], Infinity);
  });

  it('los rangos son contiguos y no se solapan', () => {
    const orden = ['basico', 'medio', 'alto'];
    for (let i = 1; i < orden.length; i += 1) {
      const prevMax = COMPLEXITY_SCORE_RANGES[orden[i - 1]][1];
      const nextMin = COMPLEXITY_SCORE_RANGES[orden[i]][0];
      assert.equal(nextMin, prevMax + 1,
        `${orden[i - 1]} termina en ${prevMax} y ${orden[i]} empieza en ${nextMin}`);
    }
  });

  it('todo score entero ≥ 0 cae en exactamente un nivel', () => {
    for (const score of [0, 1, 2, 3, 5, 6, 50, 1000]) {
      const niveles = NIVELES_VALIDOS.filter((n) => {
        const [min, max] = COMPLEXITY_SCORE_RANGES[n];
        return score >= min && score <= max;
      });
      assert.equal(niveles.length, 1, `score ${score} en ${niveles.length} niveles`);
    }
  });
});

describe('catálogos de referencia (labels no vacíos)', () => {
  it('METODOS_PRODUCCION', () => {
    for (const [k, v] of Object.entries(METODOS_PRODUCCION)) {
      assert.equal(typeof v.label, 'string');
      assert.ok(v.label.trim().length > 0, `${k}: label vacío`);
    }
  });

  it('ESTRUCTURAS_CONSTRUCTIVAS', () => {
    for (const [k, v] of Object.entries(ESTRUCTURAS_CONSTRUCTIVAS)) {
      assert.ok(v.label.trim().length > 0, `${k}: label vacío`);
    }
  });

  it('USO_TABLERO', () => {
    for (const [k, v] of Object.entries(USO_TABLERO)) {
      assert.ok(v.label.trim().length > 0, `${k}: label vacío`);
    }
  });
});
