/**
 * drawerGeometryService.test.js
 *
 * Geometría de la caja de cajón con piezas reales: emparejamiento de
 * laterales/base/fondo con su frente, construcción de la caja anclada al
 * frente y fallback sintético cuando faltan piezas.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDrawerBoxGeometries,
  hasRealDrawerBox,
  matchDrawerBoxParts,
} from '../drawerGeometryService.js';
import { IsometricRenderer } from '../../isometricRenderer.js';

const FACE = { id: 'm1-cajon-1', nombre: 'Frente cajon 1', ancho: 400, alto: 200, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' };
const LAT_IZQ = { id: 'm1-cajon-lat-izq', nombre: 'Lateral cajon 1 izq', ancho: 480, alto: 170, cantidad: 1, rotate: 'no', color: '#D9C2A3', espesor: 15, modulo: '1' };
const LAT_DER = { id: 'm1-cajon-lat-der', nombre: 'Lateral cajon 1 der', ancho: 480, alto: 170, cantidad: 1, rotate: 'no', color: '#D9C2A3', espesor: 15, modulo: '1' };
const BASE = { id: 'm1-cajon-base', nombre: 'Base cajon 1', ancho: 370, alto: 480, cantidad: 1, rotate: 'si', color: '#D9C2A3', espesor: 15, modulo: '1' };
const FONDO = { id: 'm1-cajon-fondo', nombre: 'Fondo cajon 1', ancho: 370, alto: 170, cantidad: 1, rotate: 'no', color: '#F2F2F2', espesor: 15, modulo: '1' };
const CARA = { id: 'm1-cajon-cara', nombre: 'Cara cajon 1', ancho: 370, alto: 170, cantidad: 1, rotate: 'no', color: '#D9C2A3', espesor: 15, modulo: '1' };

const PLACE = { x: 100, yFace: 500, z: 50, w: 400, h: 200, thickness: 15, fallbackDepth: 510 };

describe('matchDrawerBoxParts', () => {
  it('empareja por prefijo de id (m1-cajon-1 → m1-cajon-lat-izq/base/fondo/cara)', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO, CARA]);
    assert.ok(parts);
    assert.deepEqual(parts.laterales, [LAT_IZQ, LAT_DER]);
    assert.equal(parts.base, BASE);
    assert.equal(parts.fondo, FONDO);
    assert.equal(parts.cara, CARA);
  });

  it('cara ausente: parts.cara es null (cajón de 5 piezas, compatibilidad hacia atrás)', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO]);
    assert.ok(parts);
    assert.equal(parts.cara, null);
  });

  it('empareja por submódulo cuando el prefijo de id no casa', () => {
    const face = { ...FACE, id: 'frente1', modulo: '11' };
    const pool = [
      { ...LAT_IZQ, id: 'lat1', modulo: '11' },
      { ...LAT_DER, id: 'lat2', modulo: '11' },
      { ...BASE, id: 'base1', modulo: '11' },
      // Otra bandeja del mismo módulo padre: no debe mezclarse
      { ...LAT_IZQ, id: 'lat9', modulo: '12' },
    ];
    const parts = matchDrawerBoxParts(face, pool);
    assert.ok(parts);
    assert.equal(parts.laterales.length, 2);
    assert.ok(parts.laterales.every((p) => p.modulo === '11'));
    assert.equal(parts.base.id, 'base1');
  });

  it('rechaza pool ambiguo: piezas de varios cajones mezcladas en el mismo módulo', () => {
    // Dos cajones en el módulo sin relación de prefijo (4 laterales + 2 bases):
    // no se puede decidir el emparejamiento → null (fallback sintético).
    const otros = [
      { ...LAT_IZQ, id: 'lat-a1' }, { ...LAT_DER, id: 'lat-a2' }, { ...BASE, id: 'base-a1' },
      { ...LAT_IZQ, id: 'lat-b1' }, { ...LAT_DER, id: 'lat-b2' }, { ...BASE, id: 'base-b1' },
    ];
    assert.equal(matchDrawerBoxParts(FACE, otros), null);
  });

  it('devuelve null cuando no hay piezas de caja', () => {
    assert.equal(matchDrawerBoxParts(FACE, [FACE]), null);
  });
});

describe('hasRealDrawerBox', () => {
  it('exige 2 laterales y base como mínimo', () => {
    const full = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO]);
    const sinFondo = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE]);
    const unLateral = matchDrawerBoxParts(FACE, [LAT_IZQ, BASE]);
    assert.equal(hasRealDrawerBox(full), true);
    assert.equal(hasRealDrawerBox(sinFondo), true, 'fondo es opcional (zapatera-cajón)');
    assert.equal(hasRealDrawerBox(unLateral), false);
  });
});

describe('buildDrawerBoxGeometries', () => {
  it('cajón completo: 5 geometrías (2 laterales + base + fondo + cara) ancladas al frente', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO, CARA]);
    const box = buildDrawerBoxGeometries({ parts, ...PLACE });
    assert.equal(box.length, 5);

    // Riel telescópico por defecto: holgura 12,7 mm por lado (RAIL_TYPES).
    const izq = box.find((g) => g.id === 'm1-cajon-lat-izq');
    const der = box.find((g) => g.id === 'm1-cajon-lat-der');
    for (const [geo, xEsperado] of [[izq, 112.7], [der, 472.3]]) {
      assert.equal(geo.role, 'drawer_side');
      assert.equal(geo.x, xEsperado);
      assert.equal(geo.y, 20, 'anclada al frente: y = yFace − prof (500−480)');
      assert.equal(geo.z, 65, 'z = z + espBase (50+15)');
      assert.equal(geo.d, 480, 'profundidad real del lateral (ancho CSV)');
      assert.equal(geo.h, 170);
      assert.equal(geo.w, 15, 'espesor real del lateral');
      assert.equal(geo.name, geo.id.includes('izq') ? 'Lateral cajon 1 izq' : 'Lateral cajon 1 der');
    }

    // Máximo interior con holgura telescópica: 400 − 2·(15+12,7) = 344,6.
    // La base real (370) se clampa a ese vano interior.
    const base = box.find((g) => g.id === 'm1-cajon-base');
    assert.equal(base.role, 'drawer_bottom');
    assert.ok(Math.abs(base.w - 344.6) < 1e-9, 'base real clampada al máximo interior (vano − 2·(esp+holgura))');
    assert.ok(Math.abs(base.x - 127.7) < 1e-9, 'centrada en el vano del frente');
    assert.equal(base.y, 20);
    assert.equal(base.h, 15, 'espesor real de la base');

    const fondo = box.find((g) => g.id === 'm1-cajon-fondo');
    assert.equal(fondo.role, 'drawer_back');
    assert.ok(Math.abs(fondo.w - 344.6) < 1e-9);
    assert.equal(fondo.d, 15, 'espesor real del fondo');
    assert.equal(fondo.y, 20, 'trasera de la caja, contra el fondo del cajón');
    assert.equal(fondo.z, 80, 'z = zBox + espBase (65+15): apoyado SOBRE la base');
    assert.equal(fondo.h, 155, 'alto real 170 clampado a latAlto − espBase (170−15)');

    // El fondo no debe intersecar la base en AABB: rangos [z, z+h) disjuntos.
    const aabb = (g) => ({ minX: g.x, maxX: g.x + g.w, minY: g.y, maxY: g.y + g.d, minZ: g.z, maxZ: g.z + g.h });
    const ab = aabb(base);
    const af = aabb(fondo);
    assert.ok(
      af.minZ >= ab.maxZ - 1e-9,
      `el fondo [${af.minZ},${af.maxZ}) debe empezar donde termina la base [${ab.minZ},${ab.maxZ})`
    );
    // Y no debe superar el borde superior de los laterales.
    const latTop = izq.z + izq.h;
    assert.ok(af.maxZ <= latTop + 1e-9, `el fondo (${af.maxZ}) no debe pasar el borde superior de los laterales (${latTop})`);

    // Cara: frente interior de la caja. Anclada a la cara INTERIOR del lateral
    // izquierdo (su ancho mide el interior entre laterales); en y va pegada al
    // frente (yFace − espCara).
    const cara = box.find((g) => g.id === 'm1-cajon-cara');
    assert.equal(cara.role, 'drawer_part');
    assert.equal(cara.x, 127.7, 'cara interior del lateral izq (latX[0] + espLat)');
    assert.equal(cara.y, 485, 'yFace − espCara (500−15)');
    assert.equal(cara.z, 65);
    assert.ok(Math.abs(cara.w - 344.6) < 1e-9, 'ancho real clampado al interior entre laterales');
    assert.ok(Math.abs(cara.x + cara.w - 472.3) < 1e-9, 'cara termina exactamente en la cara interior del lateral der');
    assert.equal(cara.d, 15, 'espesor real de la cara (en profundidad)');
    assert.equal(cara.h, 170, 'mismo alto que los laterales');
    assert.equal(cara.real, true);
  });

  it('riel oculta: modo catálogo — laterales retranqueados, base = vano − 42, rebajo inferior y alto capado', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO, CARA]);
    const box = buildDrawerBoxGeometries({ parts, ...PLACE, railType: 'oculta' });
    assert.equal(box.length, 5);

    const izq = box.find((g) => g.id === 'm1-cajon-lat-izq');
    const der = box.find((g) => g.id === 'm1-cajon-lat-der');
    // Retranqueo por lado = (interiorDeduction − 2·espLat)/2 = (42 − 30)/2 = 6.
    assert.equal(izq.x, 106, 'oculta retranquea los laterales (21 − espLat por lado)');
    assert.equal(der.x, 479);
    // Rebajo inferior: la caja cuelga bottomClearance (12,7) bajo el borde
    // inferior del vano.
    assert.equal(izq.z, 52.3, 'z = z + espBase − bottomClearance (50 + 15 − 12,7)');
    assert.equal(izq.h, 170, 'alto real 170 ≤ vano − 23 (177), sin cap');

    // Máximo interior oculta: 400 − 42 = 358 (deducción de catálogo). La base
    // real (370) se clampa a ese interior.
    const base = box.find((g) => g.id === 'm1-cajon-base');
    assert.equal(base.w, 358, 'base clampada a vano − 42 (deducción interior oculta)');
    assert.equal(base.x, 121);

    // La cara comparte el anclaje del lateral izquierdo y va al frente de la caja.
    const cara = box.find((g) => g.id === 'm1-cajon-cara');
    assert.equal(cara.x, 121, 'cara interior del lateral izq (106 + espLat)');
    assert.equal(cara.y, 485, 'yFace − espCara (500−15)');
    assert.equal(cara.w, 358, 'cara clampada al interior entre laterales');
    assert.equal(cara.h, 170);
  });

  it('riel oculta: capa el alto de la caja a vano − maxHeightDeduction', () => {
    const latAlta = { ...LAT_IZQ, id: 'm1-cajon-lat-alta', alto: 195 };
    const latAlta2 = { ...LAT_DER, id: 'm1-cajon-lat-alta2', alto: 195 };
    const parts = matchDrawerBoxParts(FACE, [latAlta, latAlta2, BASE, FONDO]);
    const box = buildDrawerBoxGeometries({ parts, ...PLACE, railType: 'oculta' });
    const lat = box.find((g) => g.id === 'm1-cajon-lat-alta');
    assert.equal(lat.h, 177, 'alto capado a vano − 23 (200 − 23)');
    const base = box.find((g) => g.id === 'm1-cajon-base');
    assert.ok(base, 'la base sigue presente con laterales altos');
  });

  it('sin fondo: 3 geometrías (zapatera-cajón)', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE]);
    const box = buildDrawerBoxGeometries({ parts, ...PLACE });
    assert.equal(box.length, 3);
    assert.ok(!box.some((g) => g.role === 'drawer_back'));
  });

  it('conjunto incompleto: [] (el renderer mantiene la caja sintética)', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, BASE]);
    assert.deepEqual(buildDrawerBoxGeometries({ parts, ...PLACE }), []);
  });
});

describe('IsometricRenderer con piezas reales de cajón', () => {
  const cabinetBase = [
    { id: 'm1-base', nombre: 'Base modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-tapa', nombre: 'Tapa modulo M1', ancho: 800, alto: 550, cantidad: 1, rotate: 'si', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 550, alto: 1000, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
    { id: 'm1-lateral-der', nombre: 'Lateral derecho M1', ancho: 550, alto: 1000, cantidad: 1, rotate: 'no', color: '#C19A6B', espesor: 15, modulo: '1' },
  ];
  const realDrawerPieces = [...cabinetBase, FACE, LAT_IZQ, LAT_DER, BASE, FONDO, CARA];

  it('usa las piezas reales (ids CSV) en vez de la caja sintética', () => {
    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12 });
    const { geometries } = renderer.computeGeometries('1', realDrawerPieces);
    for (const id of ['m1-cajon-lat-izq', 'm1-cajon-lat-der', 'm1-cajon-base', 'm1-cajon-fondo', 'm1-cajon-cara']) {
      assert.ok(geometries.find((g) => g.id === id), `falta la geometría real ${id}`);
    }
    assert.ok(!geometries.some((g) => g.id === 'm1-cajon-1-side'), 'no debe quedar caja sintética');
  });

  it('apertura 1: cara/laterales/base/fondo reales comparten el Δy del frente', () => {
    const closed = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12 });
    const closedGeos = closed.computeGeometries('1', realDrawerPieces).geometries;
    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.12, aperturaGlobal: 1 });
    const geos = renderer.computeGeometries('1', realDrawerPieces).geometries;

    const ids = ['m1-cajon-1', 'm1-cajon-lat-izq', 'm1-cajon-lat-der', 'm1-cajon-base', 'm1-cajon-fondo', 'm1-cajon-cara'];
    const dyOf = (id) => {
      const open = geos.find((g) => g.id === id);
      const shut = closedGeos.find((g) => g.id === id);
      assert.ok(open && shut, `geometría ${id} debe existir en ambos renders`);
      return open.y - shut.y;
    };
    const dys = ids.map(dyOf);
    assert.ok(dys[0] > 0, 'el frente debe trasladarse +y');
    dys.forEach((dy, i) => {
      assert.ok(Math.abs(dy - dys[0]) < 1e-9, `${ids[i]} debe compartir el Δy (${dy} vs ${dys[0]})`);
    });
  });
});

const DIVISOR = { id: 'm1-cajon-divisor', nombre: 'Divisor cajon 1', ancho: 370, alto: 140, cantidad: 1, rotate: 'no', color: '#D9C2A3', espesor: 15, modulo: '1' };

describe('divisor interior de cajón (drawer_divider)', () => {
  it('matchDrawerBoxParts devuelve los divisores del pool emparejado', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO, CARA, DIVISOR]);
    assert.ok(parts);
    assert.deepEqual(parts.divisores, [DIVISOR]);
  });

  it('sin divisores en el pool, parts.divisores queda vacío', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO, CARA]);
    assert.deepEqual(parts.divisores, []);
  });

  it('el divisor no se confunde con la cara (drawer_part)', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO, CARA, DIVISOR]);
    assert.equal(parts.cara, CARA);
    assert.ok(!parts.divisores.includes(CARA));
  });

  it('geometría: paralelo al fondo, apoyado sobre la base, centrado en profundidad', () => {
    const parts = matchDrawerBoxParts(FACE, [LAT_IZQ, LAT_DER, BASE, FONDO, CARA, DIVISOR]);
    const box = buildDrawerBoxGeometries({ parts, ...PLACE });
    const div = box.find((g) => g.id === DIVISOR.id);
    assert.ok(div, 'falta la geometría del divisor');
    assert.equal(div.role, 'drawer_divider');
    const fondo = box.find((g) => g.id === FONDO.id);
    const base = box.find((g) => g.id === BASE.id);
    const cara = box.find((g) => g.id === CARA.id);
    // Mismo plano que el fondo (ancho en x, espesor en y), apoyado sobre la base.
    assert.equal(div.z, base.z + base.h);
    assert.equal(div.w, fondo.w);
    assert.equal(div.d, DIVISOR.espesor);
    // Entre la cara (frente) y el fondo, sin tocarlos.
    assert.ok(div.y > fondo.y + fondo.d, 'el divisor debe quedar detrás del fondo');
    assert.ok(div.y + div.d < cara.y, 'el divisor debe quedar delante de la cara');
    // Alto capado al borde superior de los laterales.
    const lat = box.find((g) => g.role === 'drawer_side');
    assert.ok(div.z + div.h <= lat.z + lat.h + 1e-9);
  });
});
