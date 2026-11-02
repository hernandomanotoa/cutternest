// stackClearanceService.test.js — Validación estricta de cabida vertical de
// pilas de frentes/cajones (prompt de taller: exponer el conflicto como
// error, no solo compresión silenciosa del renderer).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStackClearance } from './stackClearanceService.js';
import { parseCSV } from './csvParser.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '..', '..', 'data');

// Casco estándar: 600 mm de alto entre base y tapa (laterales de 600),
// espesor 15 → vano interior 570 mm.
function casco(modulo = '1', alto = 600) {
  const m = String(modulo);
  return [
    { id: `m${m}-base`, nombre: `Base modulo M${m}`, ancho: 500, alto: 400, cantidad: 1, rotate: true, color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: m, pos_z: null },
    { id: `m${m}-tapa`, nombre: `Tapa modulo M${m}`, ancho: 500, alto: 400, cantidad: 1, rotate: true, color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: m, pos_z: null },
    { id: `m${m}-lat-izq`, nombre: `Lateral izquierdo M${m}`, ancho: 400, alto, cantidad: 1, rotate: false, color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: m, pos_z: null },
    { id: `m${m}-lat-der`, nombre: `Lateral derecho M${m}`, ancho: 400, alto, cantidad: 1, rotate: false, color: '#C19A6B', espesor: 15, cantos: 'T,B,L,R', modulo: m, pos_z: null },
  ];
}

function frente(moduloSub, nombre, alto, posZ = null) {
  return {
    id: `m${moduloSub}-frente`,
    nombre,
    ancho: 470, alto, cantidad: 1, rotate: false, color: '#8B5A2B',
    espesor: 15, cantos: 'T,B,L,R', modulo: String(moduloSub), pos_z: posZ,
  };
}

test('pila sin pos_z que excede el vano → error con exceso en mm', () => {
  const pieces = [
    ...casco(1),
    frente('11', 'Frente cajon superior M1', 200),
    frente('12', 'Frente cajon medio M1', 200),
    frente('13', 'Frente cajon inferior M1', 200),
  ];
  const { errors } = validateStackClearance(pieces);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].modulo, '1');
  // Σ 600 + 2 gaps × 2.5 = 605 vs vano 570 → exceso 35 mm.
  assert.match(errors[0].mensaje, /excede la altura interior disponible \(570 mm\) por 35 mm/);
  assert.match(errors[0].mensaje, /quite un nivel|reduzca los altos/i);
});

test('misma pila que cabe → sin error', () => {
  const pieces = [
    ...casco(1),
    frente('11', 'Frente cajon superior M1', 187),
    frente('12', 'Frente cajon medio M1', 187),
    frente('13', 'Frente cajon inferior M1', 187),
  ];
  const { errors } = validateStackClearance(pieces);
  // Σ 561 + 2 × 2.5 = 566 ≤ 570.
  assert.equal(errors.length, 0);
});

test('frente anclado con pos_z que excede el techo interior → error directo', () => {
  const pieces = [
    ...casco(1),
    frente('11', 'Frente cajon superior M1', 100, 500), // techo 600 > 585
  ];
  const { errors } = validateStackClearance(pieces);
  assert.equal(errors.length, 1);
  assert.match(errors[0].mensaje, /anclado en pos_z=500/);
  assert.match(errors[0].mensaje, /techo interior \(585 mm\)/);
});

test('frente anclado que cabe → sin error', () => {
  const pieces = [
    ...casco(1),
    frente('11', 'Frente cajon superior M1', 100, 480), // techo 580 ≤ 585
  ];
  const { errors } = validateStackClearance(pieces);
  assert.equal(errors.length, 0);
});

test('módulo con gola aplicada (tiras gola_strip) → exento del check', () => {
  const pieces = [
    ...casco(1),
    frente('11', 'Frente cajon superior M1', 200),
    frente('12', 'Frente cajon medio M1', 200),
    frente('13', 'Frente cajon inferior M1', 200),
    {
      id: 'm1gola-c1-fondo', nombre: 'Gola canal c1 fondo M1',
      ancho: 470, alto: 80, cantidad: 1, rotate: false, color: '#C19A6B',
      espesor: 15, cantos: 'T,B,L,R', modulo: '1', pos_z: null,
    },
  ];
  const { errors } = validateStackClearance(pieces);
  assert.equal(errors.length, 0);
});

test('integración parseCSV: pila que excede el vano se reporta como error', () => {
  const csv = [
    'id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo,pos_z',
    'm1-base,Base modulo M1,500,400,1,si,#C19A6B,15,"T,B,L,R",1,',
    'm1-tapa,Tapa modulo M1,500,400,1,si,#C19A6B,15,"T,B,L,R",1,',
    'm1-lat-izq,Lateral izquierdo M1,400,600,1,no,#C19A6B,15,"T,B,L,R",1,',
    'm1-lat-der,Lateral derecho M1,400,600,1,no,#C19A6B,15,"T,B,L,R",1,',
    'm11-frente,Frente cajon superior M1,470,300,1,no,#8B5A2B,15,"T,B,L,R",11,',
    'm12-frente,Frente cajon medio M1,470,300,1,no,#8B5A2B,15,"T,B,L,R",12,',
  ].join('\n');
  const result = parseCSV(csv);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('excede la altura interior disponible')));
});

test('regresión: ejemplo real de cómoda baja (pila ajustada que cabe) no dispara el check', () => {
  const text = fs.readFileSync(path.join(DATA_DIR, 'ejemplo-comoda-baja.csv'), 'utf8');
  const result = parseCSV(text);
  assert.equal(result.ok, true, `errores inesperados: ${result.errors.join(' | ')}`);
});
