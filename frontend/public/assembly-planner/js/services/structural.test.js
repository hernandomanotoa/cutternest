// structural.test.js — contrato de análisis estructural: cargas, riesgo, vuelco y peso

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRUCTURAL } from '../core/config.js';
import {
  calcularCargaRepisa,
  clasificarRiesgo,
  calcularVuelco,
  estimatePieceWeight,
  getProfundidadMueble,
} from './structural.js';

// ——————————————————————————— calcularCargaRepisa ———————————————————————————

test('calcularCargaRepisa devuelve el contrato completo de campos', () => {
  const r = calcularCargaRepisa(800, 300, 18);
  assert.equal(typeof r.cargaTotalKg, 'number');
  assert.ok(['flexion', 'deflexion'].includes(r.limitante));
  assert.equal(typeof r.deflexionMm, 'number');
  assert.equal(r.luz, 800);
  assert.equal(r.profundidad, 300);
  assert.equal(r.espesor, 18);
});

test('calcularCargaRepisa: mayor espesor soporta más carga', () => {
  const fina = calcularCargaRepisa(800, 300, 10);
  const gruesa = calcularCargaRepisa(800, 300, 25);
  assert.ok(gruesa.cargaTotalKg > fina.cargaTotalKg);
});

test('calcularCargaRepisa: mayor luz soporta menos carga', () => {
  const corta = calcularCargaRepisa(600, 300, 18);
  const larga = calcularCargaRepisa(1200, 300, 18);
  assert.ok(larga.cargaTotalKg < corta.cargaTotalKg);
});

test('calcularCargaRepisa: cuando manda la deflexión, deflexionMm = luz / deflexionLimite_L', () => {
  const r = calcularCargaRepisa(1200, 300, 18);
  assert.equal(r.limitante, 'deflexion');
  assert.ok(Math.abs(r.deflexionMm - 1200 / 250) < 1e-9);
});

test('calcularCargaRepisa: con deflexión permisiva manda la flexión', () => {
  // Límite L/20 (muy permisivo) → qFlexion < qDeflexion
  const r = calcularCargaRepisa(400, 400, 25, 2500, 18, 20);
  assert.equal(r.limitante, 'flexion');
});

test('calcularCargaRepisa: los defaults coinciden con STRUCTURAL del config', () => {
  const conDefaults = calcularCargaRepisa(800, 300, 18);
  const conExplicitos = calcularCargaRepisa(
    800, 300, 18,
    STRUCTURAL.defaultEMpa,
    STRUCTURAL.defaultSigmaMpa,
    STRUCTURAL.deflexionLimitRatio,
  );
  assert.deepEqual(conExplicitos, conDefaults);
});

test('calcularCargaRepisa: un límite de deflexión más permisivo (L/x menor) aumenta la carga', () => {
  // El parámetro es el denominador x de L/x: L/100 permite más flecha que L/500
  const estricto = calcularCargaRepisa(800, 300, 18, 2500, 18, 500);
  const permisivo = calcularCargaRepisa(800, 300, 18, 2500, 18, 100);
  assert.equal(estricto.limitante, 'deflexion');
  assert.ok(permisivo.cargaTotalKg > estricto.cargaTotalKg);
});

// ———————————————————————————— clasificarRiesgo ————————————————————————————

function pieza(overrides = {}) {
  return { nombre: 'Panel', ancho: 400, alto: 400, espesor: 18, ...overrides };
}

test('clasificarRiesgo: fondo decorativo fino (≤5 mm) → info / no estructural', () => {
  for (const nombre of ['Fondo', 'Trasera', 'Panel decorativo', 'Tapacanto']) {
    const r = clasificarRiesgo(pieza({ nombre, espesor: 5 }));
    assert.equal(r.level, 'info', nombre);
    assert.equal(r.label, 'Fondo decorativo');
  }
});

test('clasificarRiesgo: pieza fina no decorativa → Bajo', () => {
  const r = clasificarRiesgo(pieza({ nombre: 'Lateral', espesor: 5 }));
  assert.equal(r.level, 'success');
  assert.equal(r.label, 'Bajo');
});

test('clasificarRiesgo: repisa >800 mm y ≤15 mm → Crítico', () => {
  const r = clasificarRiesgo(pieza({ nombre: 'Repisa', ancho: 900, espesor: 15 }));
  assert.equal(r.level, 'danger');
  assert.match(r.accion, /divisor vertical o soporte central/);
});

test('clasificarRiesgo: repisa 600–800 mm y ≤15 mm → Alto', () => {
  const r = clasificarRiesgo(pieza({ nombre: 'Estante', ancho: 700, espesor: 15 }));
  assert.equal(r.level, 'warning');
  assert.equal(r.label, 'Alto');
});

test('clasificarRiesgo: repisa 400–600 mm y exactamente 15 mm → Medio', () => {
  const r = clasificarRiesgo(pieza({ nombre: 'Repisa', ancho: 500, espesor: 15 }));
  assert.equal(r.level, 'medium');
  assert.equal(r.label, 'Medio');
});

test('clasificarRiesgo: repisa 400–600 mm con espesor distinto de 15 mm → Bajo (sin acción)', () => {
  const r10 = clasificarRiesgo(pieza({ nombre: 'Repisa', ancho: 500, espesor: 10 }));
  assert.equal(r10.level, 'success');
  const r18 = clasificarRiesgo(pieza({ nombre: 'Repisa', ancho: 500, espesor: 18 }));
  assert.equal(r18.level, 'success');
});

test('clasificarRiesgo: la luz es el mayor de ancho/alto', () => {
  const r = clasificarRiesgo(pieza({ nombre: 'Repisa', ancho: 300, alto: 900, espesor: 15 }));
  assert.equal(r.level, 'danger');
});

test('clasificarRiesgo: normaliza acentos y mayúsculas del nombre', () => {
  const r = clasificarRiesgo(pieza({ nombre: 'ÉSTANTE', ancho: 700, espesor: 15 }));
  assert.equal(r.level, 'warning');
});

test('clasificarRiesgo: umbrales límite exactos (800 y 600 mm pertenecen a Alto)', () => {
  assert.equal(clasificarRiesgo(pieza({ nombre: 'Repisa', ancho: 800, espesor: 15 })).level, 'warning');
  assert.equal(clasificarRiesgo(pieza({ nombre: 'Repisa', ancho: 600, espesor: 15 })).level, 'warning');
  assert.equal(clasificarRiesgo(pieza({ nombre: 'Repisa', ancho: 599, espesor: 15 })).level, 'medium');
});

// ———————————————————————————— calcularVuelco ————————————————————————————

test('calcularVuelco devuelve los 5 escenarios con nombre, fs y seguro', () => {
  const escenarios = calcularVuelco({ profundidad: 500 });
  assert.equal(escenarios.length, 5);
  assert.deepEqual(escenarios.map((e) => e.nombre), [
    'Vacío',
    'Normal',
    'Lleno',
    'Lleno + Cajón abierto',
    'Lleno + Carga frontal',
  ]);
  for (const e of escenarios) {
    assert.equal(typeof e.fs, 'number');
    assert.equal(typeof e.seguro, 'boolean');
  }
});

test('calcularVuelco: fs coincide con la fórmula peso·g·(prof/2)/vuelco (2 decimales)', () => {
  const profundidad = 500;
  const pesoVacio = 100;
  const cargaMaxima = 200;
  const [vacio] = calcularVuelco({ profundidad, pesoVacio, cargaMaxima });
  const esperado = Number(((pesoVacio * 9.81 * (profundidad / 1000 / 2)) / 10).toFixed(2));
  assert.equal(vacio.fs, esperado);
});

test('calcularVuelco: mueble ligero y poco profundo es inseguro; pesado y profundo es seguro', () => {
  const inseguros = calcularVuelco({ profundidad: 100, pesoVacio: 10, cargaMaxima: 20 });
  assert.ok(inseguros.every((e) => e.seguro === false), '100 mm / 10 kg nunca es seguro');
  const seguros = calcularVuelco({ profundidad: 1000, pesoVacio: 120, cargaMaxima: 350 });
  assert.ok(seguros.every((e) => e.seguro === true), '1000 mm / defaults siempre es seguro');
});

test('calcularVuelco: seguro usa el umbral fsThreshold del config (1.5)', () => {
  const escenarios = calcularVuelco({ profundidad: 500 });
  for (const e of escenarios) {
    assert.equal(e.seguro, e.fs >= STRUCTURAL.fsThreshold);
  }
});

test('calcularVuelco: usa pesoVacio=120 y cargaMaxima=350 por defecto', () => {
  const [conDefaults] = calcularVuelco({ profundidad: 500 });
  const [explicitos] = calcularVuelco({ profundidad: 500, pesoVacio: 120, cargaMaxima: 350 });
  assert.equal(conDefaults.fs, explicitos.fs);
});

// ——————————————————————————— estimatePieceWeight ——————————————————————————

test('estimatePieceWeight: melamina 0.7 kg/dm³ con cantidad 1', () => {
  // 400×300×15 mm → 4×3×1.5 dm³ = 18 dm³ × 0.7 = 12.6 kg
  const w = estimatePieceWeight({ ancho: 400, alto: 300, espesor: 15, cantidad: 1 });
  assert.ok(Math.abs(w - 12.6) < 1e-9);
});

test('estimatePieceWeight: escala lineal con la cantidad', () => {
  const una = estimatePieceWeight({ ancho: 400, alto: 300, espesor: 15, cantidad: 1 });
  const tres = estimatePieceWeight({ ancho: 400, alto: 300, espesor: 15, cantidad: 3 });
  assert.ok(Math.abs(tres - una * 3) < 1e-9);
});

// —————————————————————————— getProfundidadMueble ——————————————————————————

test('getProfundidadMueble: sin base/tapa devuelve 600 por defecto', () => {
  assert.equal(getProfundidadMueble([{ nombre: 'Lateral', ancho: 500, alto: 700 }]), 600);
  assert.equal(getProfundidadMueble([]), 600);
});

test('getProfundidadMueble: toma el menor ancho/alto entre bases y tapas', () => {
  const piezas = [
    { nombre: 'Base', ancho: 550, alto: 500 },
    { nombre: 'Tapa', ancho: 560, alto: 520 },
    { nombre: 'Lateral', ancho: 100, alto: 2000 },
  ];
  assert.equal(getProfundidadMueble(piezas), 500);
});
