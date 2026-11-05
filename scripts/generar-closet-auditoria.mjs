// scripts/generar-closet-auditoria.mjs — Genera el closet de auditoría del
// Constructor: abierto 3360×2380×600, 5 módulos de 672. Cada módulo completo
// lleva 2 zapateras (vano 180, bandeja 60, riel telescópica 26), 2 cajones
// (vanos 220 y 150), gola entre cajones y repisa superior a 350 mm de inset.
// Canto PVC 1 mm y Luz frente 1 mm. Marco estructural en 2 zócalos. El
// módulo 3 conserva SOLO la repisa superior. Salida: el CSV del ejemplo en
// data/ (y su gemelo en docs/) para el selector "Seleccionar mueble".
//
// Uso: node scripts/generar-closet-auditoria.mjs

// Globals de happy-dom ANTES que los módulos del planner (app.js toca
// document/localStorage al importarse).
import '../frontend/public/assembly-planner/test/views/setup.mjs';

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createStore, setStore, getStore } from '../frontend/public/assembly-planner/js/core/store.js';
import {
  addModuleFromBuilder,
  addContentToModule,
  duplicateModule,
  removeContentPiece,
  enableGola,
  applyStructuralPlinth,
} from '../frontend/public/assembly-planner/js/app.js';
import { saveUserConfig, loadUserConfig } from '../frontend/public/assembly-planner/js/services/userConfigService.js';
import { piecesToCSV, parseCSV } from '../frontend/public/assembly-planner/js/services/csvParser.js';
import { buildAuditReport } from '../frontend/public/assembly-planner/js/services/auditReportService.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_CSV = join(HERE, '../frontend/public/assembly-planner/data/ejemplo-closet-auditoria.csv');
const DOCS_CSV = join(HERE, '../docs/Ejemplo_CSV_Closet_Auditoria.csv');

const fail = (msg) => { console.error(`[ERROR] ${msg}`); process.exit(1); };
const step = (msg) => console.log(`\n== ${msg}`);

setStore(createStore());
localStorage.clear();
// Canto PVC 1 mm y Luz frente 1 mm (persistido; el contenido nuevo lo lee
// del userConfig en el store).
saveUserConfig({ cantoEspesor: 1, drawerFrontLuz: 1 });
getStore().set({ userConfig: loadUserConfig() });

// ── 1. Módulo base (672 × 2380 × 600) ────────────────────────────────
step('Módulo 1: casco 672×2380×600');
const r1 = addModuleFromBuilder({ ancho: 672, alto: 2380, prof: 600, espesor: 15, colorCuerpo: '#C19A6B', conZocalo: false });
if (!r1.ok) fail(r1.errors?.join('; '));

// ── 2. Contenido (orden de inserción = apilado de abajo hacia arriba) ──
step('Contenido: 2 zapateras 180/60, cajón 220, cajón 150, repisa inset 350');
const CONTENIDO = [
  { kind: 'shoeRack', altoVano: 180, altoLateral: 60, riel: 'telescopica26', division: true },
  { kind: 'shoeRack', altoVano: 180, altoLateral: 60, riel: 'telescopica26', division: true },
  { kind: 'drawer', altoVano: 220, riel: 'telescopica26' },
  { kind: 'drawer', altoVano: 150, riel: 'telescopica26' },
  { kind: 'shelf', insetTapa: 350, conRefuerzo: true },
];
for (const c of CONTENIDO) {
  const r = addContentToModule('1', c.kind, c);
  if (!r.ok) fail(`addContentToModule(${c.kind}): ${r.errors?.join('; ')}`);
  if (r.warnings?.length) console.log(`  aviso ${c.kind}: ${r.warnings.join(' · ')}`);
}

// ── 3. Cinco módulos (duplicación) ───────────────────────────────────
step('Duplicar hasta 5 módulos');
for (const _ of [1, 2, 3, 4]) {
  const r = duplicateModule('1');
  if (!r.ok) fail(r.errors?.join('; '));
}

// ── 4. Módulo 3: solo la repisa superior ─────────────────────────────
step('Módulo 3: conservar solo la repisa superior');
const sobrantes3 = getStore().get().pieces
  .filter((p) => /^m3(cajon|zapatera|gola)/.test(String(p.id)))
  .map((p) => p.id);
for (const id of sobrantes3) {
  const r = removeContentPiece(id);
  if (!r.ok) fail(`removeContentPiece(${id}): ${r.errors?.join('; ')}`);
}
console.log(`  eliminadas ${sobrantes3.length} piezas de contenido del módulo 3`);

// ── 5. Gola entre cajones (módulos con cajones: 1, 2, 4, 5) ──────────
step('Gola en módulos 1, 2, 4 y 5');
for (const mod of ['1', '2', '4', '5']) {
  const r = enableGola(mod);
  if (!r.ok) fail(`enableGola(${mod}): ${(r.errors || r.warnings || []).join('; ')}`);
  if (r.warnings?.length) console.log(`  aviso gola ${mod}: ${r.warnings.join(' · ')}`);
}

// ── 6. Zócalo tipo marco estructural en 2 zócalos ────────────────────
step('Marco estructural (2 zócalos, alto 100)');
const rz = applyStructuralPlinth({ altoZocalo: 100, nZocalos: 2 });
if (!rz.ok) fail(rz.errors?.join('; '));
if (rz.warnings?.length) console.log(`  aviso marco: ${rz.warnings.join(' · ')}`);

// ── 7. Exportar CSV (con cabecera descriptiva) ───────────────────────
step('Exportar CSV');
const pieces = getStore().get().pieces;
const cabecera = [
  '# CutterNest Piezas v1',
  '# Closet de auditoría (Constructor): abierto 3360×2380×600, melamina 15 mm.',
  '# 5 módulos de 672: 2 zapateras (vano 180, bandeja 60, telescópica 26) + 2 cajones',
  '# (vanos 220 y 150) + gola entre cajones + repisa superior a 350 de inset.',
  '# Canto PVC 1 mm (tag [canto1]) y Luz frente 1 mm → frentes 638 mm.',
  '# Módulo 3 conserva solo la repisa superior. Marco estructural en 2 zócalos.',
].join('\n');
const csv = `${cabecera}\n${piecesToCSV(pieces)}`;
writeFileSync(DATA_CSV, csv);
writeFileSync(DOCS_CSV, csv);
console.log(`  ${pieces.length} piezas → ${DATA_CSV}`);

// ── 8. Puertas de calidad ────────────────────────────────────────────
step('Validación: re-parseo + auditoría (corrida 1)');
const reparsed = parseCSV(csv);
if (reparsed.errors.length) fail(`re-parseo: ${reparsed.errors.join('; ')}`);
// Warnings de DISEÑO aceptados en este ejemplo (los decide el usuario en
// la pestaña Auditoría): cobertura de frentes <35% del alto útil y el aire
// libre bajo la repisa que reporta la gola. El resto bloquea la salida.
const WARNING_DISENO = [/frentes de cajón suman/, /quedan \d+ mm libres/];
const criticos = reparsed.warnings.filter((w) => !WARNING_DISENO.some((re) => re.test(w)));
if (criticos.length) fail(`warnings de parseo: ${criticos.join('; ')}`);
const audit = buildAuditReport(reparsed.pieces, { cantoEspesor: 1, drawerFrontLuz: 1 });
const auditProblems = [
  ...(audit.errores || []),
  ...(audit.warnings || []),
].filter(Boolean);
console.log(`  auditoría: ${auditProblems.length} hallazgos`);
for (const p of auditProblems.slice(0, 10)) console.log(`   - ${p}`);
if (audit.errores?.length) process.exit(2); // los warnings se tratan en la fase de ajustes

console.log('\n[OK] Closet de auditoría generado.');
