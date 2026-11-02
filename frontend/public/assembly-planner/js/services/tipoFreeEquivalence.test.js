// js/services/tipoFreeEquivalence.test.js — Equivalencia tipo vs vano libre.
// Al eliminar los selects 'Tipo cajón'/'Tipo zapatera' del Constructor, las
// piezas nuevas se generan SIN tag [tipo] (tipoId=null) tomando el vano del
// input. Estos tests fijan el contrato: para cada tipo del catálogo existe
// una configuración de vano libre que genera EXACTAMENTE las mismas piezas
// (salvo el tag [tipo] en el nombre, que solo sobrevive en CSV legacy).
// Runner: node --test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDrawer, addShoeTray } from './closetBuilderService.js';
import { DRAWER_TYPES, SHOE_RACK_TYPES } from '../core/contentTypes.js';

const BASE_DRAWER = {
  anchoModulo: 850,
  profundidadModulo: 600,
  espesorModulo: 15,
  colorFrente: '#8B5A2B',
  colorLateral: '#D9C2A3',
};
const BASE_TRAY = {
  anchoModulo: 850,
  profundidadModulo: 600,
  espesorModulo: 15,
  espesorFrente: 15,
  colorFrente: '#8B5A2B',
  colorLateral: '#D9C2A3',
};

const sinTag = (nombre) => String(nombre)
  .replace(/\s*\[[^\]]+\]\s*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Compara dos resultados del builder pieza a pieza ignorando SOLO el tag
// [tipo] del nombre (las ids no llevan tag y deben coincidir).
function mismaGeometria(a, b, caso) {
  assert.ok(a.ok, `${caso}: con tipo ok (${(a.errors || []).join('; ')})`);
  assert.ok(b.ok, `${caso}: sin tipo ok (${(b.errors || []).join('; ')})`);
  assert.equal(a.pieces.length, b.pieces.length, `${caso}: misma cantidad de piezas`);
  const norm = (pieces) => pieces.map((p) => ({ ...p, nombre: sinTag(p.nombre) }));
  assert.deepEqual(norm(b.pieces), norm(a.pieces), `${caso}: piezas idénticas salvo el tag [tipo]`);
}

test('cajones: cada tipo del catálogo ≡ vano libre con su altoVano', () => {
  for (const t of DRAWER_TYPES) {
    const conTipo = addDrawer('1', 1, { ...BASE_DRAWER, altoVano: t.altoVano, tipoId: t.id });
    const libre = addDrawer('1', 1, { ...BASE_DRAWER, altoVano: t.altoVano, tipoId: null });
    mismaGeometria(conTipo, libre, `cajón ${t.id} (vano ${t.altoVano})`);
  }
});

test('zapateras planos/tenis/tacones/botines ≡ vano libre, frente normal con frente', () => {
  for (const t of SHOE_RACK_TYPES.filter((x) => !x.frenteCompleto && x.conFrenteDefault && !x.ladosIguales)) {
    const opts = {
      ...BASE_TRAY,
      altoVano: t.altoVano,
      conFrente: true,
      modoFrente: 'normal',
      altoLateral: 100,
    };
    const conTipo = addShoeTray('1', 1, { ...opts, tipoId: t.id });
    const libre = addShoeTray('1', 1, { ...opts, tipoId: null });
    mismaGeometria(conTipo, libre, `zapatera ${t.id} (vano ${t.altoVano})`);
  }
});

test('zapatera botas (frente completo) ≡ vano libre 450 + frenteCompleto', () => {
  const opts = {
    ...BASE_TRAY,
    altoVano: 450,
    conFrente: true,
    modoFrente: 'normal',
    frenteCompleto: true,
  };
  const conTipo = addShoeTray('1', 1, { ...opts, tipoId: 'botas' });
  const libre = addShoeTray('1', 1, { ...opts, tipoId: null });
  mismaGeometria(conTipo, libre, 'zapatera botas');
});

test('bandeja a la vista ≡ sin frente + modo normal + lados iguales al rim', () => {
  const opts = {
    ...BASE_TRAY,
    altoVano: 160,
    conFrente: false,
    modoFrente: 'normal',
    altoLateral: 120, // = rim del tipo 'bandeja'
  };
  const conTipo = addShoeTray('1', 1, { ...opts, ladosIguales: true, rim: 120, tipoId: 'bandeja' });
  // Espejo del mapeo de app.js sin tipo: sin frente + modo normal ⇒ lados
  // iguales (rim default BANDEJA_RIM_HEIGHT = 120).
  const libre = addShoeTray('1', 1, { ...opts, ladosIguales: true, rim: 120, tipoId: null });
  mismaGeometria(conTipo, libre, 'bandeja a la vista');
});

test('el tag [tipo] solo cambia el nombre (persistencia del contrato legacy)', () => {
  const conTipo = addDrawer('1', 1, { ...BASE_DRAWER, altoVano: 200, tipoId: 'estandar' });
  assert.ok(conTipo.pieces.some((p) => /\[estandar\]/.test(p.nombre)), 'el frente lleva el tag [tipo]');
  const libre = addDrawer('1', 1, { ...BASE_DRAWER, altoVano: 200, tipoId: null });
  assert.ok(libre.pieces.every((p) => !/\[/.test(p.nombre)), 'sin tipo no hay tag en ninguna pieza');
});
