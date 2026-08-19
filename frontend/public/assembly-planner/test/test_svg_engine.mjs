import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV } from '../js/csvParser.js';
import { buildEngineForModule, getModuleDimensions } from '../js/svgEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, '../data/ejemplo-universal.csv');

const csvText = fs.readFileSync(csvPath, 'utf8');
const result = parseCSV(csvText);
if (!result.ok) {
  console.error('Errores al parsear CSV:');
  result.errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}

const pieces = result.pieces;

// Dimensiones aproximadas esperadas según los SVGs de referencia
const expected = {
  1: { w: 450, h: 2300 },
  2: { w: 900, h: 2230 },
  3: { w: 800, h: 480 },   // 450 leg + 30 top thickness
  4: { w: 450, h: 965 },   // 500 back + 15 seat + 450 leg
  5: { w: 1200, h: 2200 },
  6: { w: 800, h: 1200 },
};

function modulePiecesFor(modId) {
  return pieces.filter((p) => {
    const mod = String(p.modulo || '').trim();
    return mod === String(modId) || mod.startsWith(String(modId));
  });
}

console.log('CutterNest SVG Engine v3 — Test de render universal\n');

for (let i = 1; i <= 6; i++) {
  const engine = buildEngineForModule(pieces, String(i), { thickness: 15 });
  if (!engine) {
    console.log(`M${i}: sin piezas`);
    continue;
  }

  const svg = engine.render();
  const outPath = `/tmp/m${i}.svg`;
  fs.writeFileSync(outPath, svg);

  const overlaps = engine.detectOverlaps();
  const dims = getModuleDimensions(modulePiecesFor(i), 15);
  const exp = expected[i];
  const dimsOk =
    Math.abs(dims.width - exp.w) < 10 && Math.abs(dims.height - exp.h) < 80;

  console.log(
    `M${i}  viewBox=${engine.viewBox.w}x${engine.viewBox.h}  dims=${dims.width}x${dims.height}  expected≈${exp.w}x${exp.h}  ${dimsOk ? 'OK' : 'DIF'}  overlaps=${overlaps.length}`
  );
  if (overlaps.length) {
    console.log('   ' + overlaps.map((o) => `${o.a}<->${o.b}`).join(', '));
  }
}

console.log('\nSVGs guardados en /tmp/m1.svg ... /tmp/m6.svg');
