/**
 * collisionService.test.js
 *
 * Detección de colisiones al abrir piezas: AABB con/sin rotation, volumen de
 * intersección, pares de piezas móviles distintas y exclusión de estáticas.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  aabbOf,
  intersectVolume,
  movingPieceIds,
  detectCollisions,
} from '../collisionService.js';
import { IsometricRenderer } from '../../isometricRenderer.js';

const box = (id, name, dims) => ({ id, name, role: 'panel', ...dims });

describe('aabbOf', () => {
  it('caja alineada: extremos directos', () => {
    const b = aabbOf(box('a', 'A', { x: 0, y: 0, z: 0, w: 100, d: 50, h: 20 }));
    assert.deepEqual(b, { minX: 0, maxX: 100, minY: 0, maxY: 50, minZ: 0, maxZ: 20 });
  });

  it('con rotation usa el AABB de las esquinas rotadas', () => {
    const geo = {
      ...box('p', 'Puerta', { x: 0, y: 550, z: 15, w: 770, d: 18, h: 900 }),
      rotation: { axis: 'z', angleDeg: 90, pivot: { x: 0, y: 559 } },
    };
    const b = aabbOf(geo);
    assert.ok(b.maxY > 550 + 700, `puerta a 90° debe extenderse hacia +y, maxY=${b.maxY}`);
    assert.ok(b.maxX <= 559 + 1e-9, `extensión en x acotada por el grosor, maxX=${b.maxX}`);
  });
});

describe('intersectVolume', () => {
  it('solape parcial: dx·dy·dz', () => {
    const a = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100 };
    const b = { minX: 50, maxX: 150, minY: 50, maxY: 150, minZ: 50, maxZ: 150 };
    assert.equal(intersectVolume(a, b), 50 * 50 * 50);
  });

  it('contacto cara a cara no es colisión (volumen 0)', () => {
    const a = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100 };
    const b = { minX: 100, maxX: 200, minY: 0, maxY: 100, minZ: 0, maxZ: 100 };
    assert.equal(intersectVolume(a, b), 0);
  });

  it('disjuntos: 0', () => {
    const a = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
    const b = { minX: 20, maxX: 30, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
    assert.equal(intersectVolume(a, b), 0);
  });
});

describe('detectCollisions', () => {
  it('dos piezas móviles solapadas: un par con nombres y volumen', () => {
    const geos = [
      box('a', 'Frente cajon 1', { x: 0, y: 600, z: 0, w: 400, d: 400, h: 200 }),
      box('b', 'Puerta izquierda', { x: 200, y: 500, z: 0, w: 400, d: 200, h: 300 }),
      box('c', 'Estante fijo', { x: 0, y: 0, z: 0, w: 800, d: 500, h: 15 }),
    ];
    const pairs = detectCollisions(geos, new Set(['a', 'b']));
    assert.equal(pairs.length, 1);
    assert.deepEqual([pairs[0].aId, pairs[0].bId].sort(), ['a', 'b']);
    assert.equal(pairs[0].aName, 'Frente cajon 1');
    assert.ok(pairs[0].volume > 0);
  });

  it('no reporta pares que no se solapan', () => {
    const geos = [
      box('a', 'A', { x: 0, y: 0, z: 0, w: 100, d: 100, h: 100 }),
      box('b', 'B', { x: 500, y: 0, z: 0, w: 100, d: 100, h: 100 }),
    ];
    assert.deepEqual(detectCollisions(geos, new Set(['a', 'b'])), []);
  });

  it('ignora piezas estáticas: solape móvil/estática no reporta', () => {
    const geos = [
      box('a', 'Puerta abierta', { x: 0, y: 500, z: 0, w: 400, d: 400, h: 400 }),
      box('s', 'Lateral modulo', { x: 100, y: 400, z: 0, w: 200, d: 300, h: 400 }),
    ];
    assert.deepEqual(detectCollisions(geos, new Set(['a'])), []);
    assert.equal(detectCollisions(geos, new Set(['a', 's'])).length, 1, 'si ambas se mueven sí reporta');
  });

  it('ignora pares contra sí misma (mismo id) y dedupe por par de ids', () => {
    const geos = [
      box('a', 'Frente cajon', { x: 0, y: 600, z: 0, w: 400, d: 400, h: 200 }),
      box('a-side', 'Lateral cajon izq', { x: 15, y: 200, z: 15, w: 15, d: 400, h: 170 }),
      box('a-side2', 'Lateral cajon der', { x: 385, y: 200, z: 15, w: 15, d: 400, h: 170 }),
      box('b', 'Puerta', { x: 0, y: 500, z: 0, w: 400, d: 200, h: 300 }),
    ];
    const pairs = detectCollisions(geos, new Set(['a', 'a-side', 'a-side2', 'b']));
    const keys = pairs.map((p) => [p.aId, p.bId].sort().join('|'));
    assert.equal(new Set(keys).size, keys.length, 'sin pares duplicados');
    assert.ok(!pairs.some((p) => p.aId === p.bId));
  });

  it('apertura 0: sin piezas móviles no hay colisiones', () => {
    const pieces = [
      { id: 'p1', nombre: 'Puerta izquierda', ancho: 400, alto: 300, modulo: '1' },
      { id: 'c1', nombre: 'Frente cajon 1', ancho: 400, alto: 200, modulo: '1' },
    ];
    const movers = movingPieceIds(pieces, {}, 0);
    assert.equal(movers.size, 0);
    assert.deepEqual(detectCollisions([box('p1', 'P', { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 })], movers), []);
  });

  it('movingPieceIds: solo piezas con movimiento y apertura > 0', () => {
    const pieces = [
      { id: 'p1', nombre: 'Puerta izquierda', ancho: 400, alto: 300, modulo: '1' },
      { id: 'p2', nombre: 'Puerta derecha', ancho: 400, alto: 300, modulo: '1' },
      { id: 'e1', nombre: 'Estante 1', ancho: 400, alto: 300, modulo: '1' },
    ];
    assert.deepEqual([...movingPieceIds(pieces, { p1: 1 }, 0)].sort(), ['p1']);
    assert.deepEqual([...movingPieceIds(pieces, {}, 1)].sort(), ['p1', 'p2'], 'apertura global mueve todas');
    assert.deepEqual([...movingPieceIds(pieces, { p1: 0, p2: 0.5 }, 0)], ['p2']);
  });
});

describe('colisión integrada (IsometricRenderer)', () => {
  const cabinetBase = [
    { id: 'm1-base', nombre: 'Base modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-tapa', nombre: 'Tapa modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 550, alto: 1000, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-lateral-der', nombre: 'Lateral derecho M1', ancho: 550, alto: 1000, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
  ];
  // Puerta alta (cubre el vano completo en z) + cajón ancho en la zona media:
  // al abrirse, la puerta izquierda barre la zona frontal izquierda (x≈−184..15)
  // y el cajón extraído (ancho 780, x=10..790) alcanza esa zona → colisión.
  const pieces = [
    ...cabinetBase,
    { id: 'm1-puerta', nombre: 'Puerta izquierda', ancho: 770, alto: 900, cantidad: 1, rotate: 'no', color: '#FFFFFF', espesor: 18, modulo: '1' },
    { id: 'm1-cajon-1', nombre: 'Frente cajon 1', ancho: 780, alto: 200, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
  ];

  it('apertura 1: puerta abierta colisiona con cajón extraído', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12, aperturaGlobal: 1 });
    const { geometries } = renderer.computeGeometries('1', pieces);
    const movers = movingPieceIds(pieces, {}, 1);
    const pairs = detectCollisions(geometries, movers);
    assert.ok(pairs.length > 0, `se esperaba al menos una colisión, pares=${JSON.stringify(pairs)}`);
    const withDoor = pairs.some((p) => p.aId === 'm1-puerta' || p.bId === 'm1-puerta');
    const withDrawer = pairs.some((p) => p.aId === 'm1-cajon-1' || p.bId === 'm1-cajon-1');
    assert.ok(withDoor && withDrawer, `la colisión debe ser puerta vs cajón: ${JSON.stringify(pairs.map((p) => [p.aId, p.bId]))}`);
  });

  it('apertura 0: sin colisiones (ninguna pieza móvil)', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12 });
    const { geometries } = renderer.computeGeometries('1', pieces);
    const movers = movingPieceIds(pieces, {}, 0);
    assert.equal(detectCollisions(geometries, movers).length, 0);
  });
});
