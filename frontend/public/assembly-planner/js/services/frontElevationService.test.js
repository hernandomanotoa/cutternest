// js/services/frontElevationService.test.js — Contrato del modelo de alzado
// frontal acotado: proyección X-Z, etiquetas de corte, distinción fijas /
// móviles, cotas principales (ancho total/interior, alto) y marcas de
// posición Z de frentes y tiras gola.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addDrawer, addShelf } from './closetBuilderService.js';
import { applyGola } from './golaService.js';
import { buildFrontElevation } from './frontElevationService.js';

const ANCHO = 800;
const ALTO = 1600;
const PROF = 500;
const VANO = 200;
const DRAWER_FRONT_GAP = 2.5;
const INTERIOR = ANCHO - 2 * 15;

// Geometría esperada (la gola tapa el espacio): frentes 227 (197+30 de
// labio), gap visible = entrada de dedos (20): frente 1 (z=25, techo 252),
// frente 2 (z=272, techo 499), repisa a 781.5 (aire libre arriba). El canal
// vive detrás: fondo z = techo frente 1 − labio + paso = 225.
const Z1 = 25;
const ALTO_FRENTE_1 = 227;
const Z2 = 272;
const ALTO_FRENTE_2 = 227; // mismo criterio que el frente 1 (197 + 30 labio)
const Z_BASE_C1 = 225; // techo frente 1 (252) − labio (30) + paso (3)

// Casco + 2 cajones + repisa con gola aplicada (mismo patrón que
// golaService.test.js y auditView.dom.test.js).
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

describe('buildFrontElevation: proyección X-Z del módulo', () => {
  const modelo = buildFrontElevation(buildPieces(), '1');

  it('deriva ancho, alto e interior del casco', () => {
    assert.equal(modelo.ok, true);
    assert.equal(modelo.ancho, ANCHO);
    assert.equal(modelo.alto, ALTO);
    assert.equal(modelo.espesor, 15);
    assert.equal(modelo.anchoInterior, INTERIOR);
  });

  it('proyecta frentes como rectángulos móviles con posición Z exacta', () => {
    const frentes = modelo.rectangulos.filter((r) => r.rol === 'drawer_face');
    assert.equal(frentes.length, 2);
    const f1 = frentes.find((f) => Math.abs(f.z - Z1) < 0.01);
    const f2 = frentes.find((f) => Math.abs(f.z - Z2) < 0.01);
    assert.ok(f1 && f2, 'ambos frentes proyectados');
    for (const f of [f1, f2]) {
      assert.equal(f.fija, false);
      assert.equal(f.x, (ANCHO - f.ancho) / 2, 'centrado en el vano');
      assert.match(f.etiqueta, /^\d+(\.\d+)?×\d+(\.\d+)?$/, 'etiqueta de corte ancho×alto');
    }
    assert.equal(f1.alto, ALTO_FRENTE_1);
    assert.equal(f2.alto, ALTO_FRENTE_2, 'mismo criterio de reparto para el último frente (sin extensión L)');
  });

  it('incluye casco y tiras gola como piezas fijas', () => {
    const rolesFijos = modelo.rectangulos.filter((r) => r.fija);
    const roles = new Set(rolesFijos.map((r) => r.rol));
    assert.ok(roles.has('side_panel'), 'laterales fijos');
    assert.ok(roles.has('top_panel'), 'tapa fija');
    assert.ok(roles.has('bottom_panel'), 'base fija');
    assert.ok(roles.has('shelf'), 'repisa fija');
    assert.ok(roles.has('gola_strip'), 'tiras gola fijas');
    const fondo = modelo.rectangulos.find((r) => r.id === 'm1gola-c1-fondo');
    assert.ok(fondo, 'fondo del canal C proyectado');
    assert.equal(fondo.fija, true);
    assert.equal(fondo.alto, 74, 'cuerpo = entrada + 2·labio − 2·paso');
    assert.ok(Math.abs(fondo.z - Z_BASE_C1) < 0.01, `z del fondo C1 (${fondo.z} ≈ ${Z_BASE_C1})`);
    // C de 3 piezas: las alas sup/inf acompañan al fondo (sin pestañas).
    assert.ok(!modelo.rectangulos.some((r) => /-pestana-/.test(String(r.id))), 'sin pestañas proyectadas');
    const alas = modelo.rectangulos.filter((r) => r.rol === 'gola_strip' && /-ala-/.test(r.id));
    assert.equal(alas.length, 2, 'ala sup e inf del único canal C');
    for (const a2 of alas) assert.equal(a2.alto, 15, 'ala: altura vertical = espesor');
    assert.ok(!modelo.rectangulos.some((r) => /gola-l\d*-/.test(r.id)), 'sin canal L proyectado');
  });

  it('emite cotas principales: ancho total, ancho interior y alto total', () => {
    const porValor = (v) => modelo.cotas.find((c) => c.valor === v);
    assert.ok(porValor(ANCHO), 'cota de ancho total');
    assert.ok(porValor(INTERIOR), 'cota de ancho interior');
    assert.ok(porValor(ALTO), 'cota de alto total');
    const interior = porValor(INTERIOR);
    assert.equal(interior.eje, 'x');
    assert.equal(interior.inicio, 15);
    assert.equal(interior.fin, ANCHO - 15);
  });

  it('marca las posiciones Z de frentes y tiras, ordenadas de abajo arriba', () => {
    assert.ok(modelo.marcas.length >= 5, '2 frentes + 3+ tiras');
    const zs = modelo.marcas.map((m) => m.valor);
    assert.deepEqual(zs, [...zs].sort((a, b) => a - b));
    assert.ok(modelo.marcas.some((m) => m.refId === 'm1cajon1-frente' && Math.abs(m.valor - Z1) < 0.01));
    assert.ok(modelo.marcas.some((m) => m.refId === 'm1gola-c1-fondo' && Math.abs(m.valor - Z_BASE_C1) < 0.01));
    assert.ok(modelo.marcas.every((m) => /z=/.test(m.etiqueta)));
  });

  it('contabiliza fijas y móviles para la leyenda', () => {
    assert.equal(modelo.leyenda.moviles, 2);
    assert.equal(modelo.leyenda.fijas, modelo.rectangulos.filter((r) => r.fija && !r.trasera).length);
  });
});

describe('buildFrontElevation: casos límite', () => {
  it('falla sin casco derivable', () => {
    const r = buildFrontElevation([{ id: 'x', nombre: 'X', ancho: 100, alto: 100, modulo: '1' }], '1');
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /no tiene casco/);
  });

  it('sin gola proyecta solo casco y frentes dados', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    const r = buildFrontElevation(casco.pieces, '1');
    assert.equal(r.ok, true);
    assert.ok(r.rectangulos.every((p) => p.fija));
    assert.equal(r.marcas.length, 0);
  });
});
