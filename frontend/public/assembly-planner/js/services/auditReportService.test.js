// js/services/auditReportService.test.js — Informe de auditoría consolidado.
// Verifica: ejecución de las validaciones existentes (sin reimplementarlas),
// normalización de filas, reglas de estado, deduplicación, autorización de
// corte y no-mutación de las piezas de entrada.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addDrawer, addShelf } from './closetBuilderService.js';
import { applyGola } from './golaService.js';
import {
  buildAuditReport,
  AUDIT_SECCIONES,
  AUDIT_ESTADOS,
} from './auditReportService.js';

const ANCHO = 800;
const ALTO = 1600;
const PROF = 500;
const ESP = 15;
const VANO = 200;
const DRAWER_FRONT_GAP = 2.5;
const INTERIOR = ANCHO - 2 * ESP;

// Casco + 2 cajones apilados como los apila app.js + repisa (mismo patrón
// que golaService.test.js) y gola aplicada: el módulo sano de referencia.
function buildHealthyModule() {
  const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
  assert.ok(casco.ok);
  const pieces = [...casco.pieces];
  let cursor = ESP + 10;
  let ultimoTecho = 0;
  for (let i = 1; i <= 2; i++) {
    const d = addDrawer('1', i, { anchoModulo: ANCHO, profundidadModulo: PROF, altoVano: VANO });
    assert.ok(d.ok);
    const frente = d.pieces.find((p) => p.id.endsWith('-frente'));
    frente.pos_z = cursor;
    cursor += frente.alto + DRAWER_FRONT_GAP;
    ultimoTecho = frente.pos_z + frente.alto;
    pieces.push(...d.pieces);
  }
  const s = addShelf('1', { anchoUtil: INTERIOR, profReal: PROF - 2 * ESP, index: 1 });
  assert.ok(s.ok);
  s.pieces[0].pos_z = ultimoTecho + 300;
  pieces.push(...s.pieces);
  return pieces;
}

// Casco estándar de 600 mm de vano (mismo fixture que stackClearanceService.test.js).
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
    id: `m${moduloSub}-frente-${alto}-${posZ ?? 'f'}`,
    nombre,
    ancho: 470, alto, cantidad: 1, rotate: false, color: '#8B5A2B',
    espesor: 15, cantos: 'T,B,L,R', modulo: String(moduloSub), pos_z: posZ,
  };
}

test('módulo sano con gola aplicada → secciones con filas validado y corte autorizado', () => {
  const pieces = buildHealthyModule();
  const gola = applyGola(pieces, '1', {});
  assert.ok(gola.ok, 'gola aplicada');

  const reporte = buildAuditReport(gola.pieces, {});
  assert.equal(reporte.corteAutorizado, true, 'sin errores → corte autorizado');
  assert.equal(reporte.conteo['por-corregir'], 0);

  // Toda fila pertenece a una sección y un estado del contrato.
  for (const f of reporte.rows) {
    assert.ok(AUDIT_SECCIONES.includes(f.seccion), `sección conocida: ${f.seccion}`);
    assert.ok(AUDIT_ESTADOS.includes(f.estado), `estado conocido: ${f.estado}`);
  }

  // Cada sección con contenido relevante tiene al menos una fila validado.
  const seccionesConContenido = ['Gola', 'Cajones', 'Estructura', 'Herrajes', 'Rieles'];
  for (const seccion of seccionesConContenido) {
    const filas = reporte.rows.filter((f) => f.seccion === seccion);
    assert.ok(filas.length > 0, `sección ${seccion} con filas`);
    assert.ok(
      filas.some((f) => f.estado === 'validado'),
      `sección ${seccion} con al menos una fila validado`,
    );
  }

  // Medidas reales usadas en las filas validado.
  const riel = reporte.rows.find((f) => f.seccion === 'Rieles' && f.estado === 'validado');
  assert.match(riel.elemento, /Holguras de riel/);
  assert.match(riel.medida, /12,7 mm\/lado/, 'medida real de la telescópica');

  const golaRow = reporte.rows.find((f) => f.seccion === 'Gola' && f.estado === 'validado');
  assert.match(golaRow.elemento, /Sistema gola/);
  assert.match(golaRow.medida, /perfil \d+ mm/);

  // El conteo cuadra con las filas.
  assert.equal(
    reporte.conteo.validado + reporte.conteo['por-corregir'] + reporte.conteo.pendiente,
    reporte.rows.length,
  );
});

test('pila que excede el vano → fila por-corregir y corte NO autorizado', () => {
  const pieces = [
    ...casco(1),
    frente('11', 'Frente cajon superior M1', 200),
    frente('12', 'Frente cajon medio M1', 200),
    frente('13', 'Frente cajon inferior M1', 200),
  ];
  const reporte = buildAuditReport(pieces, {});

  assert.equal(reporte.corteAutorizado, false);
  const malas = reporte.rows.filter((f) => f.estado === 'por-corregir');
  assert.ok(malas.length >= 1);
  const pila = malas.find((f) => /excede la altura interior/.test(f.problema));
  assert.ok(pila, 'fila con el error de cabida vertical');
  assert.equal(pila.seccion, 'Cajones');
  assert.match(pila.correccion, /quite un nivel|reduzca los altos/i);

  // El error llega por csvParser Y por validateStackClearance: se deduplica
  // (una sola fila por problema).
  const duplicadas = reporte.rows.filter((f) => /excede la altura interior/.test(f.problema));
  assert.equal(duplicadas.length, 1, 'problema deduplicado entre fuentes');
});

test('hardware bloqueante (riel verificar catálogo) → fila pendiente', () => {
  const pieces = [
    ...casco(1),
    frente('11', 'Frente cajon 1 M1', 100, 100),
  ];
  const reporte = buildAuditReport(pieces, {});

  const pendientes = reporte.rows.filter(
    (f) => f.seccion === 'Herrajes' && f.estado === 'pendiente',
  );
  assert.ok(pendientes.length >= 1, 'hay herrajes pendientes');
  assert.ok(
    pendientes.some((f) => /verificar catálogo|CONFIRMAR ANTES DE CORTAR/i.test(f.problema)),
    'la especificación bloqueante aparece en el problema',
  );
  assert.ok(
    pendientes.some((f) => /Confirmar la referencia/.test(f.correccion)),
    'corrección: confirmar con catálogo',
  );
  // Los pendientes no bloquean el corte (no son errores de diseño).
  assert.equal(reporte.corteAutorizado, true);
});

test('todas las filas cumplen el contrato de columnas del prompt', () => {
  const pieces = buildHealthyModule();
  const gola = applyGola(pieces, '1', {});
  const reporte = buildAuditReport(gola.pieces, {});

  assert.ok(reporte.rows.length > 0);
  for (const f of reporte.rows) {
    for (const clave of ['elemento', 'seccion', 'estado', 'problema', 'correccion', 'justificacion']) {
      assert.ok(clave in f, `fila con columna "${clave}"`);
      assert.equal(typeof f[clave], 'string', `"${clave}" es string`);
      assert.ok(f[clave].length > 0, `"${clave}" no vacío`);
    }
  }
  // Conteo por estado expuesto y coherente.
  assert.equal(typeof reporte.conteo.validado, 'number');
  assert.equal(typeof reporte.conteo['por-corregir'], 'number');
  assert.equal(typeof reporte.conteo.pendiente, 'number');
  assert.equal(typeof reporte.corteAutorizado, 'boolean');
});

test('buildAuditReport no muta las piezas de entrada', () => {
  const pieces = buildHealthyModule();
  const gola = applyGola(pieces, '1', {});
  const entrada = gola.pieces.map((p) => Object.freeze({ ...p }));
  const antes = JSON.stringify(entrada.map((p) => ({ ...p })));

  const reporte = buildAuditReport(entrada, {});

  assert.ok(reporte.rows.length > 0, 'el informe se generó igualmente');
  assert.equal(
    JSON.stringify(entrada.map((p) => ({ ...p }))),
    antes,
    'ninguna pieza fue modificada',
  );
});

test('mueble vacío → informe vacío sin bloquear', () => {
  const reporte = buildAuditReport([], {});
  assert.deepEqual(reporte.rows, []);
  assert.equal(reporte.corteAutorizado, true);
});
