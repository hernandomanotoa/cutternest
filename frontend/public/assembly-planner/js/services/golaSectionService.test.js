// js/services/golaSectionService.test.js — Contrato de las secciones
// transversales acotadas de los canales gola: SOLO canal C (fondo 50×15
// retranqueado, labios 15 a ras del plano de frentes, paso 3, retranqueo 10,
// abertura útil 20), con puntos de fijación del plan calculado. El canal L se
// eliminó: sobre el último frente queda el gap de frente habitual.

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

// Defaults de taller: golaPaso 3, golaEntradaMm 20, golaStripSetback 60. La
// gola tapa el espacio: gap visible = entrada (20) — con la repisa a +300
// del último techo (apilado con gaps 2.5): frentes 197→227, pila
// = 25 + 227 + 20 + 227 = 499, frente 1 (z=25, techo 252), frente 2
// (z=272, techo 499), repisa a 781.5, aire libre; el canal vive detrás:
// zBase C1 = 252 − 30 + 3 = 225 (fondo 74: 20 + 60 − 6).
const Z_BASE_C1 = 225;

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
  const gola = applyGola(pieces, '1', { golaEntradaMm: 20 });
  assert.ok(gola.ok, gola.errors?.join(' | '));
  return gola.pieces;
}

describe('buildGolaSections: canal C entre frentes', () => {
  const secciones = buildGolaSections(buildPieces(), { golaEntradaMm: 20 });
  const canalC = secciones.find((s) => s.tipo === 'C');

  it('genera solo el canal C (N−1) por módulo; sin canal L', () => {
    assert.equal(secciones.length, 1, '2 cajones ⇒ 1 canal C');
    assert.ok(canalC, 'canal C presente');
    assert.ok(!secciones.some((s) => s.tipo === 'L'), 'sin canal L');
    assert.equal(canalC.modulo, '1');
    assert.equal(canalC.canalId, 'm1gola-c1');
    assert.match(canalC.descripcion, /Canal C 1/);
  });

  it('expone las medidas reales del perfil de taller', () => {
    assert.equal(canalC.perfilMm, 74, 'cuerpo = entrada + 2·labio − 2·paso (la pieza real)');
    assert.equal(canalC.pasoMm, 3);
    assert.equal(canalC.retranqueoMm, 60, 'fondo interno (default 60)');
    assert.equal(canalC.profundidadMm, 60, 'alcance del ala = retranqueo');
    assert.equal(canalC.espesorMm, 15);
  });

  it('secciona el cuerpo del canal: fondo 50×15 interno y dos alas (C de 3 piezas)', () => {
    const fondo = canalC.piezas.find((p) => p.rol === 'fondo');
    assert.ok(fondo);
    assert.equal(fondo.alto, 74, 'cuerpo = entrada + 2·labio − 2·paso');
    assert.equal(fondo.y, 60, 'fondo interno: retranqueo 60 detrás de la espalda del frente');
    assert.equal(fondo.profundidad, 15, 'el fondo es un panel vertical de 15');
    assert.ok(Math.abs(fondo.z - Z_BASE_C1) < 0.01);
    const alas = canalC.piezas.filter((p) => p.rol === 'ala');
    assert.equal(alas.length, 2, 'ala sup + ala inf');
    for (const p of alas) {
      assert.equal(p.alto, 15, 'ala: espesor de la melamina');
      assert.equal(p.y, 0, 'alas desde la espalda del frente');
      assert.equal(p.profundidad, 73, 'largo del ala = retranqueo 60 + fondo 15 − 2 mm (traslape: C cerrada)');
    }
    const zAlas = alas.map((p) => p.z).sort((a, b) => a - b);
    assert.ok(Math.abs(zAlas[0] - Z_BASE_C1) < 0.01, 'ala inferior al pie del cuerpo');
    assert.ok(Math.abs(zAlas[1] - (Z_BASE_C1 + 74 - 15)) < 0.01, 'ala superior bajo el techo del cuerpo');
    // La C es de 3 piezas: sin pestañas (fondo + 2 alas).
    assert.ok(!canalC.piezas.some((p) => p.rol === 'pestana'), 'sin pestañas en el canal');
  });

  it('incluye los frentes adyacentes como piezas móviles', () => {
    const frentes = canalC.piezas.filter((p) => p.rol === 'frente');
    assert.equal(frentes.length, 2);
    assert.ok(frentes.every((p) => p.fija === false));
    assert.ok(frentes.every((p) => p.y === -15));
    // La gola vive DETRÁS de los frentes: el fondo (zBase..zBase+60) se
    // solapa en Z con ambos frentes (el inferior lo cubre por abajo, el
    // superior por arriba).
    const frenteInf = frentes.find((p) => p.z + p.alto >= Z_BASE_C1 + 20 && p.z + p.alto <= Z_BASE_C1 + 35);
    const frenteSup = frentes.find((p) => p.z >= Z_BASE_C1 + 40 && p.z <= Z_BASE_C1 + 55);
    assert.ok(frenteInf && frenteSup, 'un frente abajo y otro arriba del canal (la gola detrás de ellos)');
    assert.ok(Math.abs(frenteInf.z + frenteInf.alto - (Z_BASE_C1 + 30 - 3)) < 0.01, 'techo del frente inferior (zBase = techo − labio + paso)');
    assert.ok(Math.abs(frenteSup.z - (Z_BASE_C1 + 47)) < 0.01, // 225 + 27 (techoInf) + 20 (entrada)
      'z del frente superior = techo inferior + entrada (gap visible: la gola tapa el resto)');
  });

  it('anota la abertura útil de agarre (20 mm) y su entrada', () => {
    assert.equal(canalC.abertura.utilMm, 44, 'hueco entre alas (20 + 2·30 − 2·15 − 2·3)');
    assert.equal(canalC.abertura.altoMm, 44);
    assert.equal(canalC.abertura.profundidadMm, 30, 'entrada = labio (30): el dedo engancha por detrás de él');
    assert.match(canalC.abertura.etiqueta, /abertura útil 44/i);
    assert.ok(Math.abs(canalC.abertura.desdeZ - (Z_BASE_C1 + 15)) < 0.01);
    assert.ok(Math.abs(canalC.abertura.hastaZ - (Z_BASE_C1 + 74 - 15)) < 0.01);
  });

  it('cotas: cuerpo 74, retranqueo 60, ala 60 y paso 3 anotados', () => {
    const porEtiqueta = (re) => canalC.cotas.find((c) => re.test(c.etiqueta));
    assert.ok(porEtiqueta(/Cuerpo del perfil/), 'cota del cuerpo');
    assert.equal(porEtiqueta(/Cuerpo del perfil/).valor, 74);
    assert.equal(porEtiqueta(/Retranqueo/).valor, 60);
    assert.equal(porEtiqueta(/Ala/).valor, 60);
    assert.equal(porEtiqueta(/Paso/).valor, 3);
  });

  it('puntos de fijación del fondo según el plan calculado', () => {
    assert.equal(canalC.puntosFijacion.length, 2, '2 tornillos por lado (defaults)');
    assert.deepEqual(
      canalC.puntosFijacion.map((p) => p.distDesdeBordeMm).sort((a, b) => a - b),
      [15, 59],
    );
    assert.ok(canalC.puntosFijacion.every((p) => /Tornillo/.test(p.nota)));
    assert.match(canalC.planTxt, /3\.5×16/);
  });
});

describe('buildGolaSections: casos límite', () => {
  it('sin tiras gola devuelve []', () => {
    assert.deepEqual(buildGolaSections([], {}), []);
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    assert.deepEqual(buildGolaSections(casco.pieces, {}), []);
  });
});
