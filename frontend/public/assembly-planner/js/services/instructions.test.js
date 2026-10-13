// instructions.test.js — contrato de instrucciones textuales y herramientas por paso

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarInstruccion, toolsForStep } from './instructions.js';

function piezasData(...piezas) {
  return Object.fromEntries(piezas.map((p) => [p.id, p]));
}
function pieza(id, nombre, extra = {}) {
  return { id, nombre, ...extra };
}
function paso(...ids) {
  return { piezas: ids };
}

// ——————————————————————————— generarInstruccion ———————————————————————————

test('generarInstruccion: paso con laterales (conteo y escuadra)', () => {
  const data = piezasData(pieza('l1', 'Lateral izq'), pieza('l2', 'Lateral der'));
  const msg = generarInstruccion(paso('l1', 'l2'), data);
  assert.match(msg, /2 laterales/);
  assert.match(msg, /a escuadra/);
});

test('generarInstruccion: bases y tapas se nombran unidas con " y "', () => {
  const data = piezasData(pieza('b1', 'Base'), pieza('t1', 'Tapa'));
  const msg = generarInstruccion(paso('b1', 't1'), data);
  assert.match(msg, /Unir Base y Tapa/);
  assert.match(msg, /cajas euro o tornillos confirmat/);
});

test('generarInstruccion: fondos con instrucción de ranura o atornillado', () => {
  const data = piezasData(pieza('f1', 'Fondo'));
  const msg = generarInstruccion(paso('f1'), data);
  assert.match(msg, /Fijar el fondo/);
  assert.match(msg, /cola blanca/);
});

test('generarInstruccion: repisa sin riesgo no advierte pandeo', () => {
  const data = piezasData(pieza('r1', 'Repisa 1', { riesgo: 'bajo' }));
  const msg = generarInstruccion(paso('r1'), data);
  assert.match(msg, /1 repisa\(s\)/);
  assert.match(msg, /25 kg distribuidos/);
  assert.doesNotMatch(msg, /Verificar riesgo de pandeo/);
});

test('generarInstruccion: repisa con riesgo critico/alto advierte pandeo', () => {
  for (const riesgo of ['critico', 'alto']) {
    const data = piezasData(pieza('r1', 'Repisa 1', { riesgo }));
    const msg = generarInstruccion(paso('r1'), data);
    assert.match(msg, /Verificar riesgo de pandeo/, `riesgo=${riesgo}`);
  }
});

test('generarInstruccion: puertas (bisagras, tiradores, calce)', () => {
  const data = piezasData(pieza('p1', 'Puerta 1'));
  const msg = generarInstruccion(paso('p1'), data);
  assert.match(msg, /1 puerta\(s\) abatible\(s\)/);
});

test('generarInstruccion: cajones mencionan el texto del riel inferido', () => {
  const data = piezasData(pieza('c1', 'Frente cajon 1'));
  const msg = generarInstruccion(paso('c1'), data);
  assert.match(msg, /Armar cajones/);
  assert.match(msg, /telescópicas/);
});

test('generarInstruccion: cajón abatible añade el pistón de gas', () => {
  const data = piezasData(pieza('c1', 'Frente cajon abatible 1'));
  const msg = generarInstruccion(paso('c1'), data);
  assert.match(msg, /pistón de gas/);
});

test('generarInstruccion: cajón volquete también añade el pistón de gas', () => {
  const data = piezasData(pieza('c1', 'Frente cajon volquete'));
  const msg = generarInstruccion(paso('c1'), data);
  assert.match(msg, /pistón de gas/);
});

test('generarInstruccion: textos de riel mezclados se listan una sola vez cada uno', () => {
  const data = piezasData(
    pieza('c1', 'Frente cajon 1'),
    pieza('c2', 'Frente cajon oculto 1'),
    pieza('c3', 'Frente cajon 2'),
  );
  const msg = generarInstruccion(paso('c1', 'c2', 'c3'), data);
  const vecesTelescopica = msg.split('telescópicas').length - 1;
  const vecesOculta = msg.split('ocultas').length - 1;
  assert.equal(vecesTelescopica, 1, 'texto telescópica deduplicado');
  assert.equal(vecesOculta, 1, 'texto oculta deduplicado');
});

test('generarInstruccion: cabecero, tarima, láminas de somier, zócalo y barras', () => {
  assert.match(generarInstruccion(paso('x1'), piezasData(pieza('x1', 'Cabecero'))), /esquineros metálicos de unión/);
  assert.match(generarInstruccion(paso('x1'), piezasData(pieza('x1', 'Tarima'))), /soporte central/);
  assert.match(generarInstruccion(paso('x1'), piezasData(pieza('x1', 'Láminas somier'))), /separación de 50–80 mm/);
  assert.match(generarInstruccion(paso('x1'), piezasData(pieza('x1', 'Zocalo'))), /patas niveladoras/);
  assert.match(generarInstruccion(paso('x1'), piezasData(pieza('x1', 'Barra'))), /barras cromadas/);
});

test('generarInstruccion: piezas no reconocidas usan el fallback genérico', () => {
  const data = piezasData(pieza('z1', 'Módulo raro'), pieza('z2', 'Otro panel'));
  const msg = generarInstruccion(paso('z1', 'z2'), data);
  assert.match(msg, /Ensamblar Módulo raro, Otro panel\./);
});

test('generarInstruccion: "Zócalo" con tilde matchea el keyword zocalo normalizado', () => {
  // La normalización quita acentos (igual que structural.js/clasificarRiesgo).
  const msg = generarInstruccion(paso('z1'), piezasData(pieza('z1', 'Zócalo')));
  assert.match(msg, /Fijar zócalo\(s\) a la base y laterales, dejando patas niveladoras ajustables\./);
});

test('generarInstruccion: ids inexistentes en piezasData se ignoran', () => {
  const data = piezasData(pieza('l1', 'Lateral izq'));
  const msg = generarInstruccion(paso('l1', 'fantasma'), data);
  assert.match(msg, /1 laterales/);
});

test('generarInstruccion: paso sin piezas devuelve "Ensamblar ."', () => {
  assert.equal(generarInstruccion(paso(), {}), 'Ensamblar .');
  assert.equal(generarInstruccion({}, {}), 'Ensamblar .');
});

test('generarInstruccion: laterales tienen prioridad sobre bases si coinciden en el paso', () => {
  const data = piezasData(pieza('l1', 'Lateral izq'), pieza('b1', 'Base'));
  const msg = generarInstruccion(paso('l1', 'b1'), data);
  assert.match(msg, /laterales de pie/);
});

// ————————————————————————————— toolsForStep —————————————————————————————

test('toolsForStep: paso vacío solo trae metro y lápiz', () => {
  assert.deepEqual(toolsForStep(paso(), {}), ['metro', 'lápiz']);
});

test('toolsForStep: laterales/base/tapa añaden taladro, escuadra y confirmat', () => {
  const tools = toolsForStep(paso('l1'), piezasData(pieza('l1', 'Lateral izq')));
  for (const t of ['metro', 'lápiz', 'taladro', 'escuadra', 'tornillos confirmat']) {
    assert.ok(tools.includes(t), `falta ${t}`);
  }
});

test('toolsForStep: fondo añade clavadora y cola blanca', () => {
  const tools = toolsForStep(paso('f1'), piezasData(pieza('f1', 'Fondo')));
  assert.ok(tools.includes('clavadora / atornillador'));
  assert.ok(tools.includes('cola blanca'));
});

test('toolsForStep: repisa añade nivel y soportes anticaída', () => {
  const tools = toolsForStep(paso('r1'), piezasData(pieza('r1', 'Repisa 1')));
  assert.ok(tools.includes('nivel'));
  assert.ok(tools.includes('soportes metálicos anticaída'));
});

test('toolsForStep: puerta añade bisagras, tiradores y destornillador', () => {
  const tools = toolsForStep(paso('p1'), piezasData(pieza('p1', 'Puerta 1')));
  for (const t of ['bisagras', 'tiradores', 'destornillador']) assert.ok(tools.includes(t));
});

test('toolsForStep: cajón añade correderas telescópicas y martillo de goma', () => {
  const tools = toolsForStep(paso('c1'), piezasData(pieza('c1', 'Frente cajon 1')));
  assert.ok(tools.includes('correderas telescópicas'));
  assert.ok(tools.includes('martillo de goma'));
});

test('toolsForStep: zócalo añade patas niveladoras (con y sin tilde)', () => {
  for (const nombre of ['Zocalo', 'Zócalo']) {
    const tools = toolsForStep(paso('z1'), piezasData(pieza('z1', nombre)));
    assert.ok(tools.includes('patas niveladoras'));
  }
});

test('toolsForStep: cabecero y tarima añaden esquineros metálicos', () => {
  for (const nombre of ['Cabecero', 'Tarima']) {
    const tools = toolsForStep(paso('x1'), piezasData(pieza('x1', nombre)));
    assert.ok(tools.includes('esquineros metálicos de unión'), nombre);
  }
});

test('toolsForStep: somier añade láminas de somier', () => {
  const tools = toolsForStep(paso('s1'), piezasData(pieza('s1', 'Láminas somier')));
  assert.ok(tools.includes('láminas de somier'));
});

test('toolsForStep: abatible/volquete añade pistones de gas 600 N', () => {
  for (const nombre of ['Frente cajon abatible', 'Frente cajon volquete']) {
    const tools = toolsForStep(paso('c1'), piezasData(pieza('c1', nombre)));
    assert.ok(tools.includes('pistones de gas 600 N'), nombre);
  }
});

test('toolsForStep: ids inexistentes se ignoran', () => {
  const tools = toolsForStep(paso('fantasma'), piezasData(pieza('l1', 'Lateral izq')));
  assert.deepEqual(tools, ['metro', 'lápiz']);
});
