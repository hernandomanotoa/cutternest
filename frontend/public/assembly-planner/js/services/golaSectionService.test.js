// js/services/golaSectionService.test.js — Contrato de las secciones
// transversales acotadas de los canales gola: canal C (fondo 50, pestañas
// 15, paso 3, retranqueo 10, abertura útil 20) y canal L (abertura 20 bajo
// la repisa), con puntos de fijación del plan calculado.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addDrawer, addShelf } from './closetBuilderService.js';
import { applyGola } from './golaService.js';
import { buildGolaSections } from './golaSectionService.js';

const ANCHO = 800;
const ALTO = 1600;
const PROF = 500;
const VANO = 200;
const DRAWER_FRONT_GAP = 2.5;
const INTERIOR = ANCHO - 2 * 15;

// Defaults de taller: golaPerfilHeight 50, golaPaso 3, golaStripSetback 10,
// golaStripDepth 60, golaFingerClearance 20. Con la repisa a +300 del
// último techo: frente 1 = 310.5 (z=25), frente 2 (la L) capado a 287
// (z=391.5), zBase C1 = 338.5, zL = 668.5, topRef = 721.5.
const Z_BASE_C1 = 338.5;
const Z_L = 668.5;
const TOP_REF = 721.5;

function buildPieces() {
  const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
  assert.ok(casco.ok);
  const pieces = [...casco.pieces];
  let cursor = 15 + 10;
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
  const s = addShelf('1', { anchoUtil: INTERIOR, profReal: PROF - 2 * 15, index: 1 });
  assert.ok(s.ok);
  s.pieces[0].pos_z = ultimoTecho + 300;
  pieces.push(...s.pieces);
  const gola = applyGola(pieces, '1', {});
  assert.ok(gola.ok, gola.errors?.join(' | '));
  return gola.pieces;
}

describe('buildGolaSections: canal C entre frentes', () => {
  const secciones = buildGolaSections(buildPieces(), {});
  const canalC = secciones.find((s) => s.tipo === 'C');

  it('genera un canal C y un canal L por módulo', () => {
    assert.equal(secciones.length, 2);
    assert.ok(canalC, 'canal C presente');
    assert.ok(secciones.some((s) => s.tipo === 'L'), 'canal L presente');
    assert.equal(canalC.modulo, '1');
    assert.equal(canalC.canalId, 'm1gola-c1');
    assert.match(canalC.descripcion, /Canal C 1/);
  });

  it('expone las medidas reales del perfil de taller', () => {
    assert.equal(canalC.perfilMm, 50);
    assert.equal(canalC.pasoMm, 3);
    assert.equal(canalC.retranqueoMm, 10);
    assert.equal(canalC.profundidadMm, 60);
    assert.equal(canalC.espesorMm, 15);
  });

  it('secciona el cuerpo del canal: fondo 50 retranqueado y dos pestañas de 15', () => {
    const fondo = canalC.piezas.find((p) => p.rol === 'fondo');
    assert.ok(fondo);
    assert.equal(fondo.alto, 50, 'cuerpo del perfil');
    assert.equal(fondo.y, 10, 'retranqueo detrás del plano de frentes');
    assert.equal(fondo.profundidad, 60, 'profundidad de la tira');
    assert.ok(Math.abs(fondo.z - Z_BASE_C1) < 0.01);
    const pestanas = canalC.piezas.filter((p) => p.rol === 'pestana');
    assert.equal(pestanas.length, 2);
    for (const p of pestanas) {
      assert.equal(p.alto, 15, 'pestaña: espesor de la melamina');
      assert.equal(p.y, 0, 'pestañas abiertas al frente');
      assert.equal(p.profundidad, 10 + 15);
    }
    const zInf = pestanas.map((p) => p.z).sort((a, b) => a - b);
    assert.ok(Math.abs(zInf[0] - Z_BASE_C1) < 0.01, 'pestaña inferior al pie del cuerpo');
    assert.ok(Math.abs(zInf[1] - (Z_BASE_C1 + 50 - 15)) < 0.01, 'pestaña superior bajo el techo del cuerpo');
  });

  it('incluye los frentes adyacentes como piezas móviles', () => {
    const frentes = canalC.piezas.filter((p) => p.rol === 'frente');
    assert.equal(frentes.length, 2);
    assert.ok(frentes.every((p) => p.fija === false));
    assert.ok(frentes.every((p) => p.y === -15));
    const frenteInf = frentes.find((p) => p.z + p.alto <= Z_BASE_C1);
    const frenteSup = frentes.find((p) => p.z >= Z_BASE_C1);
    assert.ok(frenteInf && frenteSup, 'un frente abajo y otro arriba del canal');
    assert.ok(Math.abs(frenteInf.z + frenteInf.alto - (Z_BASE_C1 - 3)) < 0.01, 'techo del frente inferior = zBase − paso');
    assert.ok(Math.abs(frenteSup.z - (Z_BASE_C1 + 50 + 3)) < 0.01, 'z del frente superior = zBase + perfil + paso');
  });

  it('anota la abertura útil de agarre (20 mm) y su entrada', () => {
    assert.equal(canalC.abertura.utilMm, 20);
    assert.equal(canalC.abertura.altoMm, 20);
    assert.equal(canalC.abertura.profundidadMm, 10);
    assert.match(canalC.abertura.etiqueta, /abertura útil 20/i);
    assert.ok(Math.abs(canalC.abertura.desdeZ - (Z_BASE_C1 + 15)) < 0.01);
    assert.ok(Math.abs(canalC.abertura.hastaZ - (Z_BASE_C1 + 50 - 15)) < 0.01);
  });

  it('cotas: cuerpo 50, retranqueo 10 y paso 3 anotados', () => {
    const porEtiqueta = (re) => canalC.cotas.find((c) => re.test(c.etiqueta));
    assert.ok(porEtiqueta(/Cuerpo del perfil/), 'cota del cuerpo');
    assert.equal(porEtiqueta(/Cuerpo del perfil/).valor, 50);
    assert.equal(porEtiqueta(/Retranqueo/).valor, 10);
    assert.equal(porEtiqueta(/Paso/).valor, 3);
  });

  it('puntos de fijación del fondo según el plan calculado', () => {
    assert.equal(canalC.puntosFijacion.length, 2, '2 tornillos por lado (defaults)');
    assert.deepEqual(
      canalC.puntosFijacion.map((p) => p.distDesdeBordeMm).sort((a, b) => a - b),
      [15, 35],
    );
    assert.ok(canalC.puntosFijacion.every((p) => /Tornillo/.test(p.nota)));
    assert.match(canalC.planTxt, /3\.5×16/);
  });
});

describe('buildGolaSections: canal L bajo la repisa', () => {
  const secciones = buildGolaSections(buildPieces(), {});
  const canalL = secciones.find((s) => s.tipo === 'L');

  it('abertura útil de 20 mm bajo la repisa', () => {
    assert.equal(canalL.abertura.utilMm, 20, 'golaFingerClearance');
    assert.match(canalL.abertura.etiqueta, /abajo de la repisa|bajo la repisa/i);
    assert.ok(Math.abs(canalL.abertura.hastaZ - TOP_REF) < 0.01, 'la abertura llega a la cara inferior de la repisa');
    assert.ok(Math.abs(canalL.abertura.desdeZ - (TOP_REF - 20)) < 0.01);
  });

  it('secciona fondo + pestaña inferior + frente L + repisa', () => {
    const roles = canalL.piezas.map((p) => p.rol).sort();
    assert.deepEqual(roles, ['fondo', 'frente', 'pestana', 'repisa']);
    const fondo = canalL.piezas.find((p) => p.rol === 'fondo');
    assert.equal(fondo.alto, 50);
    assert.ok(Math.abs(fondo.z - Z_L) < 0.01);
    assert.equal(canalL.piezas.filter((p) => p.rol === 'pestana').length, 1, 'solo pestaña inferior');
    assert.equal(canalL.anclajeSuperior.tipo, 'repisa');
  });
});

describe('buildGolaSections: casos límite', () => {
  it('sin tiras gola devuelve []', () => {
    assert.deepEqual(buildGolaSections([], {}), []);
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    assert.deepEqual(buildGolaSections(casco.pieces, {}), []);
  });
});
