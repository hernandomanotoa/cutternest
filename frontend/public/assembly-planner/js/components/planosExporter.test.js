// js/components/planosExporter.test.js — Contrato de la exportación de
// planos acotados: buildPlanosData ensambla alzados + secciones gola y
// buildPlanosHtml genera un standalone imprimible con las cotas clave en mm
// y el detalle de fijación, sin dependencias externas (offline).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addDrawer, addShelf } from '../services/closetBuilderService.js';
import { applyGola } from '../services/golaService.js';
import { buildPlanosData, buildPlanosHtml } from './planosExporter.js';

const ANCHO = 800;
const ALTO = 1600;
const PROF = 500;
const VANO = 200;
const DRAWER_FRONT_GAP = 2.5;
const INTERIOR = ANCHO - 2 * 15;

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

describe('buildPlanosData', () => {
  const planos = buildPlanosData(buildPieces(), {});

  it('genera un alzado frontal por módulo raíz', () => {
    assert.equal(planos.frontales.length, 1);
    const frontal = planos.frontales[0];
    assert.equal(frontal.moduleId, '1');
    assert.equal(frontal.ancho, ANCHO);
    assert.match(frontal.svg, /^<svg /, 'SVG inline del alzado');
    assert.match(frontal.svg, /Alzado frontal — Módulo 1/);
    assert.match(frontal.svg, /Ancho interior 770/);
  });

  it('genera solo la sección C (N−1) con su detalle de fijación; sin canal L', () => {
    assert.equal(planos.secciones.length, 1);
    const c = planos.secciones.find((s) => s.tipo === 'C');
    assert.match(c.svg, /Canal C 1/);
    assert.match(c.svg, /Abertura útil 20 mm/);
    assert.match(c.svg, /Retranqueo 10/);
    assert.ok(!planos.secciones.some((s) => s.tipo === 'L'), 'sin sección L');
    assert.match(c.planTxt, /3\.5×16/);
    assert.equal(planos.advertencias.length, 0);
  });
});

describe('buildPlanosHtml', () => {
  const html = buildPlanosHtml(buildPlanosData(buildPieces(), {}));

  it('contiene frontal, secciones y cotas clave en mm', () => {
    assert.match(html, /Alzado frontal — Módulo 1 \(800 × 1600 mm\)/);
    assert.match(html, /Sección transversal — Canal C 1/);
    assert.doesNotMatch(html, /Canal L/);
    assert.match(html, /Retranqueo 10 mm/);
    assert.match(html, /Abertura útil 20 mm/);
    assert.match(html, /Paso 3 mm/);
    assert.match(html, /<strong>Fijación:<\/strong>/);
  });

  it('es standalone y offline: sin scripts ni recursos externos', () => {
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /src="http/);
    assert.doesNotMatch(html, /href="http/);
    assert.match(html, /^<!DOCTYPE html>/);
  });

  it('indica cuando no hay canales gola', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    const planosSinGola = buildPlanosData(casco.pieces, {});
    assert.equal(planosSinGola.secciones.length, 0);
    const htmlSinGola = buildPlanosHtml(planosSinGola);
    assert.match(htmlSinGola, /Sin canales gola en el diseño/);
    assert.match(htmlSinGola, /Alzado frontal — Módulo 1/);
  });
});
