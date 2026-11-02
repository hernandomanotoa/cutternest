// js/services/cutOrientationService.test.js — Tests de la tabla maestra de
// clasificación de veta (Fase 0). Runner: node --test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASE_VETA,
  VETA_POR_ROL,
  clasificacionVeta,
  rotateDeRol,
  cantosDeRol,
  rolesVetaLibre,
  swapEnCorte,
} from './cutOrientationService.js';

test('vista horizontal: frentes/puertas/repisas/tapas/golas con rotate bloqueado y veta en el ancho', () => {
  for (const rol of ['drawer_face', 'door', 'front_panel', 'gola_strip', 'shelf', 'top_panel', 'drawer_divider']) {
    const c = clasificacionVeta(rol);
    assert.ok(c, `rol ${rol} clasificado`);
    assert.equal(c.clase, CLASE_VETA.VISTA_HORIZONTAL);
    assert.equal(c.rotate, false, `${rol}: rotate 'no' (veta bloqueada)`);
    assert.equal(c.ladoVeta, 'ancho', `${rol}: la veta corre a lo largo del ancho`);
    assert.equal(swapEnCorte(rol), false, `${rol}: sin swap de columnas`);
  }
});

test('vista vertical: costados, divisores y FONDO de módulo con rotate bloqueado y veta en el alto (swap en corte)', () => {
  for (const rol of ['side_panel', 'divider', 'back_panel']) {
    const c = clasificacionVeta(rol);
    assert.equal(c.clase, CLASE_VETA.VISTA_VERTICAL);
    assert.equal(c.rotate, false, `${rol}: rotate 'no' (veta bloqueada)`);
    assert.equal(c.ladoVeta, 'alto', `${rol}: la veta corre a lo largo del alto`);
    assert.equal(swapEnCorte(rol), true, `${rol}: en corte se invierten las columnas`);
  }
});

test('ocultas: rotación libre para ahorrar material', () => {
  for (const rol of ['drawer_bottom', 'drawer_side', 'drawer_back', 'drawer_part', 'bottom_panel', 'plinth_side', 'plinth_divider', 'brace', 'hanger_rail', 'leg']) {
    const c = clasificacionVeta(rol);
    assert.ok(c, `rol ${rol} clasificado`);
    assert.equal(c.clase, CLASE_VETA.OCULTA);
    assert.equal(c.rotate, true, `${rol}: rotate 'si' (libre)`);
    assert.equal(c.ladoVeta, null, `${rol}: sin lado de veta impuesto`);
    assert.equal(swapEnCorte(rol), false, `${rol}: libre, sin swap definido`);
  }
});

test('rolesVetaLibre lista exactamente las piezas ocultas', () => {
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
});

test('rotateDeRol devuelve el booleano de la tabla para roles conocidos', () => {
  assert.equal(rotateDeRol('drawer_face'), false);
  assert.equal(rotateDeRol('side_panel'), false);
  assert.equal(rotateDeRol('drawer_bottom'), true);
});

test('cantosDeRol: presets de la guía del taller (solo caras visibles)', () => {
  assert.equal(cantosDeRol('drawer_face'), 'T,B,L,R', 'frente: perímetro completo');
  assert.equal(cantosDeRol('door'), 'T,B,L,R');
  assert.equal(cantosDeRol('gola_strip'), 'T,B');
  assert.equal(cantosDeRol('shelf'), 'T,B', 'repisa visible: lados paralelos a la veta');
  assert.equal(cantosDeRol('drawer_divider'), 'T,B,L,R');
  for (const rol of ['drawer_bottom', 'drawer_side', 'drawer_back', 'drawer_part', 'bottom_panel', 'back_panel', 'brace', 'hanger_rail', 'leg']) {
    assert.equal(cantosDeRol(rol), '', `${rol}: oculta, sin tapacantos`);
  }
  assert.equal(cantosDeRol('side_panel'), null, 'laterales: L/R dependen del lado (sin preset)');
  assert.equal(cantosDeRol('divider'), null);
  assert.equal(cantosDeRol('panel'), null);
});
