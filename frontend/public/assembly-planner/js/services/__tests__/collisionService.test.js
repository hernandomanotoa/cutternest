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
  esObstaculoFijo,
} from '../collisionService.js';
import { IsometricRenderer } from '../../components/renderers/isometricRenderer.js';
import { createModule, addDrawer, addShelf } from '../closetBuilderService.js';
import { applyGola } from '../golaService.js';

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

describe('esObstaculoFijo', () => {
  it('rol gola_strip (o id/nombre con gola) es obstáculo; marcas gola_grip no', () => {
    assert.ok(esObstaculoFijo({ id: 'm1gola-c1-fondo', role: 'gola_strip' }));
    assert.ok(esObstaculoFijo({ id: 'm1gola-l1-pestana', role: 'gola_strip' }));
    assert.ok(esObstaculoFijo({ id: 'tira-1', name: 'Perfil gola C 1' }), 'nombre con gola, sin rol');
    assert.ok(!esObstaculoFijo({ id: 'm1gola-c1-fondo-grip', role: 'gola_grip' }), 'marca de agarre');
    assert.ok(!esObstaculoFijo({ id: 'm1-gola-l-grip', role: 'gola_grip' }), 'marca de agarre L');
    assert.ok(!esObstaculoFijo({ id: 'm1-lateral-izq', role: 'side_panel' }));
    assert.ok(!esObstaculoFijo({ id: 'x', role: 'panel', name: 'Estante' }));
  });
});

describe('obstáculos fijos (tiras gola)', () => {
  const ANCHO = 800;
  const ALTO = 1600;
  const PROF = 500;
  const ESP = 15;
  const VANO = 200;
  const INTERIOR = ANCHO - 2 * ESP;

  // Casco + N cajones apilados (mismo patrón que golaService.test.js) y gola
  // aplicada. Devuelve las piezas resultantes de applyGola.
  function buildConGola(n, repisaZ, cfg = {}) {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    assert.ok(casco.ok);
    const pieces = [...casco.pieces];
    let cursor = ESP + 10;
    for (let i = 1; i <= n; i++) {
      const d = addDrawer('1', i, { anchoModulo: ANCHO, profundidadModulo: PROF, altoVano: VANO });
      assert.ok(d.ok);
      const frente = d.pieces.find((p) => p.id.endsWith('-frente'));
      frente.pos_z = cursor;
      cursor += frente.alto + 2.5;
      pieces.push(...d.pieces);
    }
    const s = addShelf('1', { anchoUtil: INTERIOR, profReal: PROF - 2 * ESP, index: 1 });
    assert.ok(s.ok);
    s.pieces[0].pos_z = repisaZ;
    pieces.push(...s.pieces);
    const r = applyGola(pieces, '1', cfg);
    assert.ok(r.ok, r.errors?.join('; '));
    return r.pieces;
  }

  function paresAlAbrir(pieces, { aperturaGlobal = 1, aperturas = {}, overrides = {} } = {}) {
    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1, aperturaGlobal, verticalPositionOverrides: overrides });
    const { geometries } = renderer.computeGeometries('1', pieces);
    const movers = movingPieceIds(pieces, aperturas, aperturaGlobal);
    return { pairs: detectCollisions(geometries, movers), geometries, movers };
  }

  it('tira gola mal posicionada en el vano de un cajón: colisión al extraerse', () => {
    // Canal desplazado al vano (z) del cajón 1 (mala construcción): al abrir
    // el cajón, su caja barre el volumen de la tira fija y debe reportarse.
    // Con el canal bien construido (detrás del plano de frentes, a ras) la
    // caja extraída nunca lo toca. En golaGeometry la z de las pestañas se
    // deriva del FONDO de su canal, así que la corrupción se hace sobre el
    // fondo. Apertura parcial (0.5): a la salida completa la caja ya dejó el
    // vano y no habría colisión.
    const pieces = buildConGola(2, 900);
    const fondo = pieces.find((p) => p.id === 'm1gola-c1-fondo');
    assert.ok(fondo, 'existe el fondo del canal C1');
    const frente1 = pieces
      .filter((p) => p.id.endsWith('-frente'))
      .sort((a, b) => a.pos_z - b.pos_z)[0];
    // Corrupción: el canal del gap superior baja al vano (z) del cajón 1.
    fondo.pos_z = frente1.pos_z + 40;
    const { pairs } = paresAlAbrir(pieces, { aperturaGlobal: 0.5 });
    const hit = pairs.find((p) => p.aId === 'm1gola-c1-pestana-inf' || p.bId === 'm1gola-c1-pestana-inf');
    assert.ok(hit, `se esperaba colisión con la tira desplazada: ${JSON.stringify(pairs.map((p) => [p.aId, p.bId]))}`);
    assert.equal(hit.contraObstaculoFijo, true, 'el par se marca como obstáculo fijo');
  });

  it('gola bien construida (applyGola): sin colisiones con todos los movers abiertos', () => {
    const pieces = buildConGola(3, 900);
    const { pairs } = paresAlAbrir(pieces);
    assert.deepEqual(pairs, [], `pares inesperados: ${JSON.stringify(pairs.map((p) => [p.aId, p.bId, p.volume]))}`);
  });

  it('canal C: los labios terminan a ras del plano de frentes y NO reportan colisión al abrir', () => {
    // Sin canal L, los canales C son los únicos elementos gola fijos: al abrir
    // los frentes (los labios terminan A RAS del plano de frentes, así que
    // apenas el frente avanza su propio espesor ya queda libre) ningún par de
    // colisión debe involucrar tiras gola.
    const pieces = buildConGola(3, 900);
    const frentes = pieces
      .filter((p) => p.id.endsWith('-frente'))
      .sort((a, b) => a.pos_z - b.pos_z);
    const aperturas = Object.fromEntries(frentes.map((f) => [f.id, 0.02]));
    const { pairs } = paresAlAbrir(pieces, { aperturaGlobal: 0, aperturas });
    for (const p of pairs) {
      assert.ok(![p.aId, p.bId].some((id) => /gola-[cl]\d*-/.test(id)),
        `ningún par debe involucrar tiras gola: ${p.aId} | ${p.bId}`);
    }
  });

  it('tira gola ensanchada sobre el casco: obstáculo↔fijo del casco no se reporta', () => {
    const pieces = buildConGola(2, 900);
    const fondo = pieces.find((p) => p.id === 'm1gola-c1-fondo');
    fondo.ancho = ANCHO + 400; // AABB de la tira cubre también los laterales
    const { pairs } = paresAlAbrir(pieces);
    for (const p of pairs) {
      assert.ok(!/lateral/.test(p.aId) && !/lateral/.test(p.bId),
        `el lateral (pieza fija del casco) no debe reportar: ${p.aId} | ${p.bId}`);
    }
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
