/**
 * validate-examples.mjs
 *
 * Barrido de validación REUTILIZABLE sobre los CSV de ejemplo.
 *
 * Para cada archivo CSV (data/ejemplo-*.csv y docs/Ejemplo_CSV_*.csv):
 *   1. Ejecuta parseCSV y reporta errores (ok:false) y warnings.
 *   2. Ejecuta inferRole por pieza y lista las que caen en el fallback
 *      genérico 'panel' (candidatas a piezas "incompatibles" con el planner).
 *
 * Salida: reporte agrupado por archivo + resumen final.
 * Exit code: 0 siempre (es un reporte, no un gate), salvo error del propio script.
 *
 * Uso:
 *   node frontend/public/assembly-planner/test/validate-examples.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCSV } from '../js/csvParser.js';
import { inferRole, detectFamily } from '../js/services/classifierService.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLANNER_DIR = path.resolve(HERE, '..');
const DATA_DIR = path.join(PLANNER_DIR, 'data');
// test → assembly-planner → public → frontend → raíz del repo (4 niveles).
const DOCS_DIR = path.resolve(HERE, '..', '..', '..', '..', 'docs');

// Rol considerado "fallback genérico" (sin semántica estructural).
const GENERIC_ROLES = new Set(['panel']);

function collectCSVs(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => pattern.test(f) && f.endsWith('.csv'))
    .sort()
    .map((f) => path.join(dir, f));
}

function validateFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const result = parseCSV(text);

  const genericPieces = [];
  if (result.ok && result.pieces) {
    for (const p of result.pieces) {
      const role = inferRole(p);
      if (GENERIC_ROLES.has(role)) {
        genericPieces.push({
          id: p.id,
          nombre: p.nombre,
          modulo: p.modulo,
          ancho: p.ancho,
          alto: p.alto,
          motivo: `rol fallback '${role}': nombre no reconocido por inferRole`,
        });
      }
    }
  }

  // Familia por módulo raíz (contexto extra para el reporte).
  const families = {};
  if (result.ok && result.pieces) {
    const rootModules = [
      ...new Set(result.pieces.map((p) => String(p.modulo || '1').split('.')[0])),
    ];
    for (const m of rootModules) {
      families[m] = detectFamily(result.pieces, m);
    }
  }

  return {
    file: filePath,
    ok: result.ok,
    parseError: result.error || null,
    errors: result.errors || [],
    warnings: result.warnings || [],
    pieceCount: result.pieces ? result.pieces.length : 0,
    genericPieces,
    families,
  };
}

function printFileReport(r, { showFamilies = false } = {}) {
  const label = path.basename(r.file);
  console.log(`\n=== ${label} ===`);
  console.log(`  piezas: ${r.pieceCount} | estado: ${r.ok ? 'OK' : 'ERRORES'}`);

  if (r.parseError) console.log(`  ERROR DE PARSEO: ${r.parseError}`);
  r.errors.forEach((e) => console.log(`  [ERROR] ${e}`));
  r.warnings.forEach((w) => console.log(`  [WARN]  ${w}`));

  if (r.genericPieces.length) {
    console.log(`  piezas genéricas (${r.genericPieces.length}):`);
    r.genericPieces.forEach((g) => {
      console.log(
        `    - ${g.id} "${g.nombre}" (módulo ${g.modulo}, ${g.ancho}×${g.alto} mm): ${g.motivo}`
      );
    });
  }

  if (showFamilies && Object.keys(r.families).length) {
    const famStr = Object.entries(r.families)
      .map(([m, f]) => `${m}→${f}`)
      .join(', ');
    console.log(`  familias detectadas: ${famStr}`);
  }
}

function runGroup(title, files, opts) {
  console.log(`\n${'#'.repeat(70)}\n# ${title} (${files.length} archivos)\n${'#'.repeat(70)}`);
  const reports = files.map(validateFile);
  for (const r of reports) printFileReport(r, opts);
  return reports;
}

function summarize(allReports) {
  const ok = allReports.filter((r) => r.ok && r.errors.length === 0);
  const withErrors = allReports.filter((r) => !r.ok || r.errors.length > 0);
  const withWarnings = allReports.filter((r) => r.warnings.length > 0);
  const withGenerics = allReports.filter((r) => r.genericPieces.length > 0);

  console.log(`\n${'='.repeat(70)}`);
  console.log('RESUMEN FINAL');
  console.log(`${'='.repeat(70)}`);
  console.log(`Archivos validados:      ${allReports.length}`);
  console.log(`  - OK (sin errores):    ${ok.length}`);
  console.log(`  - Con errores:         ${withErrors.length}${withErrors.length ? ' → ' + withErrors.map((r) => path.basename(r.file)).join(', ') : ''}`);
  console.log(`  - Con warnings:        ${withWarnings.length}${withWarnings.length ? ' → ' + withWarnings.map((r) => path.basename(r.file)).join(', ') : ''}`);
  console.log(`  - Con piezas genéricas:${withGenerics.length}${withGenerics.length ? ' → ' + withGenerics.map((r) => path.basename(r.file)).join(', ') : ''}`);

  console.log('\nLista completa de piezas con rol genérico (fallback):');
  const genericCount = allReports.reduce((n, r) => n + r.genericPieces.length, 0);
  if (genericCount === 0) {
    console.log('  (ninguna)');
  } else {
    for (const r of allReports) {
      for (const g of r.genericPieces) {
        console.log(`  - ${path.basename(r.file)} :: ${g.id} "${g.nombre}" (módulo ${g.modulo})`);
      }
    }
  }
  console.log('');
}

function main() {
  const dataFiles = collectCSVs(DATA_DIR, /^ejemplo-.*\.csv$/i);
  const docsFiles = collectCSVs(DOCS_DIR, /^Ejemplo_CSV_.*\.csv$/i);

  if (dataFiles.length === 0) {
    console.warn(`Advertencia: no se encontraron CSV en ${DATA_DIR}`);
  }
  if (docsFiles.length === 0) {
    console.warn(`Advertencia: no se encontraron CSV en ${DOCS_DIR}`);
  }

  const dataReports = runGroup('DATA (frontend/public/assembly-planner/data)', dataFiles, {
    showFamilies: true,
  });
  const docsReports = runGroup('DOCS (docs/)', docsFiles, { showFamilies: false });

  summarize([...dataReports, ...docsReports]);
}

try {
  main();
} catch (err) {
  console.error('FALLO DEL SCRIPT DE VALIDACIÓN:', err);
  process.exit(1);
}
