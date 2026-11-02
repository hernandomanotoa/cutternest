// js/services/cutOrientationService.test.js — Tabla maestra de veta con la
// convención congruente: el CSV es ORIENTACIÓN DE MUEBLE (ancho/alto = como
// está la pieza en el módulo) y la veta se deriva del rol con la regla "la
// veta sigue el lado más largo". Runner: node --test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASE_VETA,
  VETA_POR_ROL,
  clasificacionVeta,
  rotateDeRol,
  cantosDeRol,
  rolesVetaLibre,
  esVistaVertical,
  ladoVetaPieza,
  migraPiezasAMueble,
} from './cutOrientationService.js';

test('vistas horizontales: veta a lo largo del ancho (lado largo), rotate bloqueado', () => {
  for (const rol of ['drawer_face', 'door', 'front_panel', 'gola_strip', 'shelf', 'top_panel', 'drawer_divider']) {
    const c = clasificacionVeta(rol);
    assert.ok(c, `rol ${rol} clasificado`);
    assert.equal(c.clase, CLASE_VETA.VISTA_HORIZONTAL);
    assert.equal(c.rotate, false, `${rol}: rotate 'no' (veta bloqueada)`);
    assert.equal(c.ladoVeta, 'ancho', `${rol}: la veta corre a lo largo del ancho`);
  }
});

test('vistas verticales: costados, divisores y FONDO con veta a lo largo del alto', () => {
  for (const rol of ['side_panel', 'divider', 'back_panel']) {
    const c = clasificacionVeta(rol);
    assert.equal(c.clase, CLASE_VETA.VISTA_VERTICAL);
    assert.equal(c.rotate, false, `${rol}: rotate 'no' (veta bloqueada)`);
    assert.equal(c.ladoVeta, 'alto', `${rol}: la veta corre a lo largo del alto`);
    assert.equal(esVistaVertical(rol), true);
  }
  assert.equal(esVistaVertical('drawer_face'), false);
  assert.equal(esVistaVertical('shelf'), false);
});

test('ocultas: rotación libre para ahorrar material', () => {
  for (const rol of ['drawer_bottom', 'drawer_side', 'drawer_back', 'drawer_part', 'bottom_panel', 'back_panel'.replace('back_panel', 'plinth_side'), 'plinth_divider', 'brace', 'hanger_rail', 'leg']) {
    const c = clasificacionVeta(rol);
    assert.ok(c, `rol ${rol} clasificado`);
    assert.equal(c.clase, CLASE_VETA.OCULTA);
    assert.equal(c.rotate, true, `${rol}: rotate 'si' (libre)`);
    assert.equal(c.ladoVeta, null);
  }
});

test('ladoVetaPieza: regla del lado largo para el optimizador', () => {
  assert.equal(ladoVetaPieza('drawer_face'), 'ancho');
  assert.equal(ladoVetaPieza('side_panel'), 'alto');
  assert.equal(ladoVetaPieza('back_panel'), 'alto');
  assert.equal(ladoVetaPieza('drawer_side'), null, 'ocultas: libres');
});

test('rolesVetaLibre lista exactamente las piezas ocultas (sin back_panel)', () => {
  const libres = rolesVetaLibre();
  assert.ok(libres.includes('drawer_side'));
  assert.ok(!libres.includes('back_panel'), 'el fondo es de vista (veta vertical)');
  assert.ok(!libres.includes('drawer_face'));
  assert.ok(!libres.includes('side_panel'));
  for (const rol of libres) {
    assert.equal(VETA_POR_ROL[rol].clase, CLASE_VETA.OCULTA);
  }
});

test('rol desconocido: sin clasificación ni rotate impuesto (null)', () => {
  assert.equal(clasificacionVeta('panel'), null);
  assert.equal(rotateDeRol('panel'), null);
  assert.equal(rotateDeRol('mirror'), null);
  assert.equal(cantosDeRol('side_panel'), '', 'laterales: preset vacío (los L/R van por lado en el builder)');
  assert.equal(cantosDeRol('drawer_face'), 'T,B,L,R');
});

test('migraPiezasAMueble: la era de corte vuelve a orientación congruente', () => {
  const laterales = [
    { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 2400, alto: 600, espesor: 15, rotate: false, modulo: '1' },
    { id: 'm1-lateral-der', nombre: 'Lateral derecho M1', ancho: 2400, alto: 600, espesor: 15, rotate: false, modulo: '1' },
  ];
  const fondoCut = { id: 'm1-fondo', nombre: 'Fondo modulo M1', ancho: 2370, alto: 820, espesor: 15, rotate: false, modulo: '1' };
  const r = migraPiezasAMueble([...laterales, fondoCut]);
  assert.equal(r.migradas.length, 3);
  const porId = Object.fromEntries(r.pieces.map((p) => [p.id, p]));
  assert.deepEqual([porId['m1-lateral-izq'].ancho, porId['m1-lateral-izq'].alto], [600, 2400]);
  assert.deepEqual([porId['m1-fondo'].ancho, porId['m1-fondo'].alto], [820, 2370]);
});

test('migraPiezasAMueble: respeta piezas ya congruentes (lateral 600×2400, fondo de módulo bajo)', () => {
  const piezas = [
    { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 600, alto: 2400, espesor: 15, rotate: false, modulo: '1' },
    // Fondo de módulo bajo y ancho (banco): ancho > alto Y congruente.
    { id: 'm1-fondo', nombre: 'Fondo banco', ancho: 870, alto: 390, espesor: 15, rotate: false, modulo: '1' },
    { id: 'm1-repisa-1', nombre: 'Repisa 1 M1', ancho: 820, alto: 350, espesor: 15, rotate: false, modulo: '1' },
  ];
  const r = migraPiezasAMueble(piezas);
  assert.equal(r.migradas.length, 0, 'nada se toca: ya congruente');
  assert.equal(r.pieces.find((p) => p.id === 'm1-fondo').ancho, 870);
});

test('migraPiezasAMueble: idempotente', () => {
  const cut = [{ id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 2400, alto: 600, espesor: 15, rotate: false, modulo: '1' }];
  const una = migraPiezasAMueble(cut);
  const dos = migraPiezasAMueble(una.pieces);
  assert.equal(dos.migradas.length, 0);
  assert.deepEqual(dos.pieces, una.pieces);
});
