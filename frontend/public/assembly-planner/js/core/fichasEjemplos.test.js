// js/core/fichasEjemplos.test.js — Cobertura de FICHAS_EJEMPLOS sobre data/
// Valida que todo CSV de ejemplos tenga ficha asignada y que el tipo
// exista en la taxonomía (AMBIENTES). El sentido inverso (todo tipo con
// al menos un ejemplo) NO se valida: hay tipos sin CSV de ejemplo.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FICHAS_EJEMPLOS } from './fichasEjemplos.js';
import { AMBIENTES, FICHAS } from './furnitureTaxonomy.js';

const CORE_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(CORE_DIR, '..', '..', 'data');

const TIPOS_VALIDOS = new Set(Object.values(AMBIENTES).flat());

function csvsDeData() {
  return readdirSync(DATA_DIR).filter((f) => f.endsWith('.csv'));
}

describe('FICHAS_EJEMPLOS cobertura de data/', () => {
  it('todo CSV de data/ tiene entrada en FICHAS_EJEMPLOS', () => {
    const faltantes = csvsDeData().filter((f) => !(f in FICHAS_EJEMPLOS));
    assert.deepEqual(faltantes, [], `CSVs sin ficha asignada: ${faltantes.join(', ')}`);
  });

  it('no hay entradas huérfanas que apunten a CSVs inexistentes', () => {
    const enDisco = new Set(csvsDeData());
    const huérfanas = Object.keys(FICHAS_EJEMPLOS).filter((f) => !enDisco.has(f));
    assert.deepEqual(huérfanas, [], `fichas de archivos que no existen: ${huérfanas.join(', ')}`);
  });

  it('cada tipo asignado existe en AMBIENTES y tiene ficha técnica', () => {
    for (const [archivo, ficha] of Object.entries(FICHAS_EJEMPLOS)) {
      assert.ok(TIPOS_VALIDOS.has(ficha.tipo),
        `${archivo}: tipo '${ficha.tipo}' no existe en AMBIENTES`);
      assert.ok(FICHAS[ficha.tipo],
        `${archivo}: no hay ficha técnica para tipo '${ficha.tipo}'`);
    }
  });

  it('las fichas técnicas referenciadas tienen los campos obligatorios', () => {
    const tiposUsados = new Set(Object.values(FICHAS_EJEMPLOS).map((f) => f.tipo));
    for (const tipo of tiposUsados) {
      const ficha = FICHAS[tipo];
      assert.ok(ficha.medidasEstandar?.ancho, `${tipo}: sin medidasEstandar.ancho`);
      assert.ok(Array.isArray(ficha.espesoresTipicos) && ficha.espesoresTipicos.length > 0,
        `${tipo}: sin espesoresTipicos`);
      assert.ok(Array.isArray(ficha.herrajesTipicos) && ficha.herrajesTipicos.length > 0,
        `${tipo}: sin herrajesTipicos`);
      assert.ok(['basico', 'medio', 'alto'].includes(ficha.nivel), `${tipo}: nivel inválido`);
      assert.ok(Array.isArray(ficha.tiempoMinutos) && ficha.tiempoMinutos.length === 2,
        `${tipo}: tiempoMinutos debe ser [min, max]`);
      assert.ok(ficha.tiempoMinutos[0] <= ficha.tiempoMinutos[1],
        `${tipo}: tiempoMinutos invertido`);
    }
  });
});
