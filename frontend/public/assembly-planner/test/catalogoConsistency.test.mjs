// test/catalogoConsistency.test.mjs — Consistencia del catálogo de ejemplos
//
// data/ es la única fuente de verdad del catálogo. Este test garantiza que
// las dos vistas manuales del catálogo (el selector de index.html y el mapa
// FICHAS_EJEMPLOS de js/core/fichasEjemplos.js) siguen a disco: cualquier
// CSV nuevo sin registrar —o cualquier registro huérfano— rompe la suite en
// lugar de degradarse en silencio.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLANNER_DIR = resolve(HERE, '..');
const DATA_DIR = join(PLANNER_DIR, 'data');
const INDEX_HTML = join(PLANNER_DIR, 'index.html');

const csvsEnDisco = readdirSync(DATA_DIR).filter((f) => f.startsWith('ejemplo-') && f.endsWith('.csv')).sort();
const html = readFileSync(INDEX_HTML, 'utf8');

// option value → label, p. ej. './data/ejemplo-buro.csv' → '🌙 Buró 3 cajones'
const optionsEnHtml = new Map(
  [...html.matchAll(/<option value="\.\/data\/([^"]+)">([^<]*)<\/option>/g)].map((m) => [m[1], m[2]])
);

describe('catálogo: data/ como fuente de verdad', () => {
  it('todo CSV de data/ tiene <option> en index.html', () => {
    const faltantes = csvsEnDisco.filter((f) => !optionsEnHtml.has(f));
    assert.deepEqual(faltantes, [], `CSV sin registrar en el selector: ${faltantes.join(', ')}`);
  });

  it('todo CSV de data/ tiene ficha en FICHAS_EJEMPLOS', async () => {
    const { FICHAS_EJEMPLOS } = await import('../js/core/fichasEjemplos.js');
    const faltantes = csvsEnDisco.filter((f) => !(f in FICHAS_EJEMPLOS));
    assert.deepEqual(faltantes, [], `CSV sin ficha técnica: ${faltantes.join(', ')}`);
  });

  it('todo <option> del selector apunta a un CSV existente', () => {
    const huerfanos = [...optionsEnHtml.keys()].filter((f) => !existsSync(join(DATA_DIR, f)));
    assert.deepEqual(huerfanos, [], `opciones huérfanas en index.html: ${huerfanos.join(', ')}`);
  });

  it('no hay CSVs duplicados en el selector', () => {
    const todas = [...html.matchAll(/<option value="\.\/data\/([^"]+)"/g)].map((m) => m[1]);
    const duplicadas = todas.filter((f, i) => todas.indexOf(f) !== i);
    assert.deepEqual([...new Set(duplicadas)], [], `opciones duplicadas: ${[...new Set(duplicadas)].join(', ')}`);
  });
});
