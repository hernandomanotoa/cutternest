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
// test → assembly-planner → public → frontend → raíz del repo (4 niveles).
const DOCS_DIR = resolve(HERE, '..', '..', '..', '..', 'docs');

const csvsEnDisco = readdirSync(DATA_DIR).filter((f) => f.startsWith('ejemplo-') && f.endsWith('.csv')).sort();
const html = readFileSync(INDEX_HTML, 'utf8');

// option value → label, p. ej. './data/ejemplo-buro.csv' → '🌙 Buró 3 cajones'
const optionsEnHtml = new Map(
  [...html.matchAll(/<option value="\.\/data\/([^"]+)">([^<]*)<\/option>/g)].map((m) => [m[1], m[2]])
);

// ── Correspondencia del catálogo docs/ ↔ data/ ─────────────────────────────
// Convención: data/ es la fuente de verdad del planner y cada ejemplo tiene
// un gemelo documental en docs/ con el MISMO contenido y un nombre legible
// (Ejemplo_CSV_<Nombre>.csv). El nombre se deriva del slug de data/ igual que
// en scripts/generar-ejemplos-catalogo.py; los pares que no siguen la regla
// (mapeados a mano en scripts/generar-ejemplos-assembly.mjs) se declaran aquí
// como alias explícitos. Son el MISMO diseño, no ejemplos distintos.
const ALIAS_DOCS_A_DATA = {
  'Ejemplo_CSV_Cocina_Modular.csv': 'ejemplo-cocina.csv',
  'Ejemplo_CSV_Comoda_Chifonier.csv': 'ejemplo-comoda.csv',
  'Ejemplo_CSV_Armario_Puertas_Corredizas.csv': 'ejemplo-armario.csv',
  'Ejemplo_CSV_Mueble_TV.csv': 'ejemplo-mueble-tv.csv',
  'Ejemplo_CSV_Mueble_TV_Zocalo_Cajon.csv': 'ejemplo-mueble-tv-zocalo-cajon.csv',
  'Ejemplo_CSV_Panel_TV.csv': 'ejemplo-panel-tv.csv',
  'Ejemplo_CSV_Zapatera_Volquete.csv': 'ejemplo-zapatero-volquete.csv',
  'Ejemplo_CSV_Zapatero_Extraible_Closet.csv': 'ejemplo-zapatero-extraible.csv',
  'Ejemplo_CSV_Banco_Zapatero.csv': 'ejemplo-zapatero-banco.csv',
  'Ejemplo_CSV_Zapatera_Repisa_Riel.csv': 'ejemplo-zapatera-repisa.csv',
};

// CSV de docs/ SIN gemelo en data/: diseños de documentación/manual que NO
// forman parte del catálogo del selector (data/ sigue siendo 1:1 con el
// selector; ver data/README.md). Cada entrada debe documentar su motivo; un
// nuevo extra sin justificar rompe la suite.
const DOCS_SIN_GEMELO = {
  'Ejemplo_CSV_Estanteria_Modulos.csv': 'demo de módulos autocontenidos 100×240×95 (documentación, no regenerable)',
  'Ejemplo_CSV_Cajones_Verticales_y_Repisas.csv': 'demo de cajones verticales con repisas (documentación, no regenerable)',
  'Ejemplo_CSV_Completo_Cajones_Verticales.csv': 'demo compleja de cajones verticales (documentación, no regenerable)',
  'Ejemplo_CSV_Manual_Completo.csv': 'demo optimizada para el manual de ensamblaje (documentación, no regenerable)',
};

// Regla de derivación idéntica a scripts/generar-ejemplos-catalogo.py
// (str.capitalize por segmento: primer carácter en mayúscula, resto en minúscula).
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const docsNameDeSlug = (dataFile) =>
  'Ejemplo_CSV_' + dataFile.replace(/^ejemplo-/, '').replace(/\.csv$/, '').split('-').map(capitalize).join('_') + '.csv';

const gemeloDocsDe = (dataFile) =>
  Object.entries(ALIAS_DOCS_A_DATA).find(([, d]) => d === dataFile)?.[0] || docsNameDeSlug(dataFile);

describe('catálogo: correspondencia docs/ ↔ data/ (gemelos de mismo diseño)', () => {
  it('todo CSV de data/ tiene su gemelo documental en docs/', () => {
    const faltantes = csvsEnDisco.filter((f) => !existsSync(join(DOCS_DIR, gemeloDocsDe(f))));
    assert.deepEqual(faltantes, [], `CSV de data/ sin gemelo en docs/: ${faltantes.map(gemeloDocsDe).join(', ')}`);
  });

  it('cada gemelo docs/ ↔ data/ tiene contenido idéntico (mismo diseño)', () => {
    const divergentes = csvsEnDisco.filter(
      (f) =>
        existsSync(join(DOCS_DIR, gemeloDocsDe(f))) &&
        readFileSync(join(DOCS_DIR, gemeloDocsDe(f)), 'utf8') !== readFileSync(join(DATA_DIR, f), 'utf8')
    );
    assert.deepEqual(divergentes, [], `gemelos con contenido distinto: ${divergentes.join(', ')}`);
  });

  it('los aliases docs/ → data/ declarados apuntan a CSV existentes', () => {
    const rotos = Object.entries(ALIAS_DOCS_A_DATA).filter(
      ([doc, data]) => !existsSync(join(DOCS_DIR, doc)) || !existsSync(join(DATA_DIR, data))
    );
    assert.deepEqual(rotos, [], `aliases rotos: ${rotos.map(([d]) => d).join(', ')}`);
  });

  it('los CSV de docs/ son gemelos de data/ o extras documentados en DOCS_SIN_GEMELO', () => {
    const docsCsvs = readdirSync(DOCS_DIR).filter((f) => f.startsWith('Ejemplo_CSV_') && f.endsWith('.csv'));
    const gemelosDocs = new Set([...Object.keys(ALIAS_DOCS_A_DATA), ...csvsEnDisco.map(gemeloDocsDe)]);
    const huerfanos = docsCsvs.filter((f) => !gemelosDocs.has(f) && !(f in DOCS_SIN_GEMELO));
    assert.deepEqual(huerfanos, [], `CSV de docs/ sin gemelo ni exención documentada: ${huerfanos.join(', ')}`);
  });

  it('todo extra de DOCS_SIN_GEMELO existe en docs/ y tiene motivo documentado', () => {
    const invalidos = Object.entries(DOCS_SIN_GEMELO).filter(
      ([doc, motivo]) => !existsSync(join(DOCS_DIR, doc)) || !motivo || motivo.trim().length < 10
    );
    assert.deepEqual(invalidos, [], `extras inválidos (sin archivo o sin motivo): ${invalidos.map(([d]) => d).join(', ')}`);
  });
});

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
