// js/services/zapateraModos.test.js — Tres modos de construcción del frente
// de la zapatera extraíble (Constructor):
//   (A) 'completo': frente decorativo + tirador, cara alta detrás.
//   (B) 'borde': bandeja abierta, SIN frente ni tirador; la -cara se emite
//       BAJA como borde frontal (default 40 mm, editable 20..300).
//   (C) 'personalizado': alturas independientes (altoFrente, bordeFrontal,
//       altoLateral, altoFondo, altoDivision); el frente va según conFrente.
// Invariantes transversales: ids únicos, espesor global (espesorModulo) en
// todas las piezas de la bandeja, riel intacto y compatibilidad con gola y
// con el apilado por pos_z (mismas piezas-móviles que el modo 'abierta').

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addShoeTray, addDrawer, addShelf } from './closetBuilderService.js';
import { applyGola, drawerUnits } from './golaService.js';

const BASE = { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 };
const ids = (r) => r.pieces.map((p) => p.id);
const porId = (r, id) => r.pieces.find((p) => p.id === id);

describe('zapatera: modos de construcción del frente', () => {
  it('los 3 modos generan piezas con ids únicos y sin duplicados', () => {
    for (const modoFrente of ['completo', 'borde', 'personalizado']) {
      const r = addShoeTray('1', 1, { ...BASE, modoFrente, conFrente: modoFrente !== 'borde' });
      assert.ok(r.ok, `${modoFrente}: ${r.errors?.join('; ')}`);
      const set = new Set(ids(r));
      assert.equal(set.size, r.pieces.length, `${modoFrente}: ids únicos`);
    }
  });

  it("'completo' preserva el comportamiento previo (frente vano−3, tirador, cara alta)", () => {
    const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'completo' });
    assert.ok(r.ok);
    assert.equal(porId(r, 'm1zapatera1-frente').alto, 197, 'frente alto = vano − 3');
    assert.ok(porId(r, 'm1zapatera1-tirador'), 'tirador presente');
    assert.equal(porId(r, 'm1zapatera1-cara').alto, 167, 'cara alta detrás del frente (197 − 2·15)');
    // Sin modo explícito, conFrente (default true) resuelve 'completo'.
    const legacy = addShoeTray('1', 1, { ...BASE });
    assert.equal(legacy.modoFrente, 'completo');
    assert.equal(ids(legacy).sort().join(','), ids(r).sort().join(','), 'mismo set de piezas');
  });

  it("'borde': sin frente ni tirador y la cara mide el borde frontal (40 y 60)", () => {
    for (const bordeFrontal of [40, 60]) {
      const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'borde', bordeFrontal });
      assert.ok(r.ok, r.errors?.join('; '));
      assert.equal(porId(r, 'm1zapatera1-frente'), undefined, 'sin frente decorativo');
      assert.equal(porId(r, 'm1zapatera1-tirador'), undefined, 'sin tirador');
      const cara = porId(r, 'm1zapatera1-cara');
      assert.ok(cara, 'la cara sigue existiendo (borde de agarre)');
      assert.equal(cara.alto, bordeFrontal, `cara = borde frontal ${bordeFrontal}`);
      assert.equal(cara.id, 'm1zapatera1-cara', 'id de la cara inalterado');
      assert.match(cara.nombre, /^Cara zapatera extraible/, 'nombre de la cara inalterado');
    }
  });

  it("'borde': laterales/fondo/división/base miden igual que en modo 'abierta'", () => {
    const abierta = addShoeTray('1', 1, { ...BASE, modoFrente: 'abierta' });
    const borde = addShoeTray('1', 1, { ...BASE, modoFrente: 'borde', bordeFrontal: 40 });
    assert.ok(abierta.ok && borde.ok);
    for (const sufijo of ['lateral-izq', 'lateral-der', 'fondo', 'division', 'base']) {
      const a = porId(abierta, `m1zapatera1-${sufijo}`);
      const b = porId(borde, `m1zapatera1-${sufijo}`);
      assert.ok(a && b, `${sufijo} presente en ambos modos`);
      assert.equal(a.ancho, b.ancho, `${sufijo}: mismo ancho`);
      assert.equal(a.alto, b.alto, `${sufijo}: mismo alto`);
    }
  });

  it("'personalizado': cada pieza refleja SU altura (con frente)", () => {
    const r = addShoeTray('1', 1, {
      ...BASE, modoFrente: 'personalizado', conFrente: true,
      altoFrente: 150, bordeFrontal: 50, altoLateral: 90, altoFondo: 70, altoDivision: 60,
    });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(porId(r, 'm1zapatera1-frente').alto, 150, 'frente 150');
    assert.ok(porId(r, 'm1zapatera1-tirador'), 'tirador con frente');
    assert.equal(porId(r, 'm1zapatera1-lateral-izq').alto, 90, 'laterales 90');
    assert.equal(porId(r, 'm1zapatera1-lateral-der').alto, 90);
    assert.equal(porId(r, 'm1zapatera1-fondo').alto, 70, 'borde trasero 70');
    assert.equal(porId(r, 'm1zapatera1-division').alto, 60, 'división 60');
    assert.equal(porId(r, 'm1zapatera1-cara').alto, 50, 'borde frontal 50');
  });

  it("'personalizado': sin frente (conFrente=false) respeta las mismas alturas", () => {
    const r = addShoeTray('1', 1, {
      ...BASE, modoFrente: 'personalizado', conFrente: false,
      altoFrente: 150, bordeFrontal: 50, altoLateral: 90, altoFondo: 70, altoDivision: 60,
    });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(porId(r, 'm1zapatera1-frente'), undefined, 'sin frente');
    assert.equal(porId(r, 'm1zapatera1-tirador'), undefined, 'sin tirador');
    assert.equal(porId(r, 'm1zapatera1-lateral-izq').alto, 90);
    assert.equal(porId(r, 'm1zapatera1-fondo').alto, 70);
    assert.equal(porId(r, 'm1zapatera1-division').alto, 60);
    assert.equal(porId(r, 'm1zapatera1-cara').alto, 50);
  });

  it('cambiar de modo no deja piezas obsoletas (sets de ids desde cero)', () => {
    const modos = [
      addShoeTray('1', 1, { ...BASE, modoFrente: 'completo' }),
      addShoeTray('1', 1, { ...BASE, modoFrente: 'borde', bordeFrontal: 60 }),
      addShoeTray('1', 1, { ...BASE, modoFrente: 'personalizado', conFrente: false, bordeFrontal: 50 }),
      addShoeTray('1', 1, { ...BASE, modoFrente: 'abierta' }),
    ];
    for (const r of modos) assert.ok(r.ok, r.errors?.join('; '));
    // 'borde' y 'abierta' generan el mismo set de ids (la cara baja es la
    // MISMA pieza, no una nueva): al cambiar de modo no sobra nada.
    assert.equal(ids(modos[1]).sort().join(','), ids(modos[3]).sort().join(','));
    // Ningún id fuera del vocabulario zapatera conocido.
    const conocidos = /-frente$|-tirador$|-lateral-izq$|-lateral-der$|-fondo$|-cara$|-division$|-base$/;
    for (const r of modos) {
      for (const id of ids(r)) assert.ok(conocidos.test(id), `id conocido: ${id}`);
    }
  });

  it('regla del espesor global: espesorModulo=18 en todas las piezas de la bandeja (3 modos)', () => {
    for (const modoFrente of ['completo', 'borde', 'personalizado']) {
      const r = addShoeTray('1', 1, { ...BASE, modoFrente, espesorModulo: 18, conFrente: modoFrente !== 'borde' });
      assert.ok(r.ok, r.errors?.join('; '));
      for (const p of r.pieces) {
        if (/-frente$|-tirador$/.test(p.id)) continue; // frente/tirador: espesor propio
        assert.equal(Number(p.espesor), 18, `${p.id}: espesor 18 (E global)`);
      }
      assert.equal(Number(porId(r, 'm1zapatera1-lateral-izq').espesor), 18);
    }
  });

  it("pos_z: el modo 'borde' devuelve las mismas piezas-móviles que 'abierta' (mismo ancla)", () => {
    const abierta = addShoeTray('1', 1, { ...BASE, modoFrente: 'abierta' });
    const borde = addShoeTray('1', 1, { ...BASE, modoFrente: 'borde', bordeFrontal: 40 });
    // La cara (ancla del apilado) existe en ambos con el mismo id: la
    // convención pos_z (asignarPosZInsercion) aplica igual.
    assert.ok(porId(abierta, 'm1zapatera1-cara') && porId(borde, 'm1zapatera1-cara'));
    assert.equal(ids(borde).sort().join(','), ids(abierta).sort().join(','));
  });

  it('frenteCompleto (botas) fuerza frente aunque el modo sea borde', () => {
    const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'borde', frenteCompleto: true });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.ok(porId(r, 'm1zapatera1-frente'), 'frente forzado por frenteCompleto');
    assert.ok(porId(r, 'm1zapatera1-tirador'), 'tirador con el frente');
    assert.equal(porId(r, 'm1zapatera1-cara'), undefined, 'sin cara (el frente cierra la bandeja)');
  });

  it('validaciones: bordeFrontal fuera de 20..300 y altoFrente fuera de rango → error', () => {
    for (const bordeFrontal of [10, 301]) {
      const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'borde', bordeFrontal });
      assert.equal(r.ok, false, `bordeFrontal ${bordeFrontal} rechazado`);
      assert.match(r.errors[0], /bordeFrontal/);
    }
    for (const altoFrente of [30, 250]) { // vano 200 → rango 50..199
      const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'personalizado', altoFrente });
      assert.equal(r.ok, false, `altoFrente ${altoFrente} rechazado`);
      assert.match(r.errors[0], /altoFrente/);
    }
    const modoInvalido = addShoeTray('1', 1, { ...BASE, modoFrente: 'raro' });
    assert.equal(modoInvalido.ok, false);
    assert.match(modoInvalido.errors[0], /modoFrente/);
  });

  it("rieles: el modo 'borde' mantiene profBandeja2 y holguras según el riel", () => {
    for (const riel of ['catalogo', 'telescopica26', 'oculta']) {
      const abierta = addShoeTray('1', 1, { ...BASE, modoFrente: 'abierta', riel });
      const borde = addShoeTray('1', 1, { ...BASE, modoFrente: 'borde', riel });
      assert.ok(abierta.ok && borde.ok, riel);
      for (const sufijo of ['lateral-izq', 'lateral-der', 'fondo', 'base']) {
        assert.equal(porId(borde, `m1zapatera1-${sufijo}`).ancho, porId(abierta, `m1zapatera1-${sufijo}`).ancho,
          `${riel}: ${sufijo} misma profundidad/luz`);
      }
    }
  });

  it("ladosIguales + 'borde': el borde manda sobre la cara, los laterales siguen el rim", () => {
    const r = addShoeTray('1', 1, {
      ...BASE, altoVano: 160, modoFrente: 'borde', bordeFrontal: 40,
      ladosIguales: true, conFrente: false, rim: 120,
    });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(porId(r, 'm1zapatera1-cara').alto, 40, 'cara = borde frontal');
    assert.equal(porId(r, 'm1zapatera1-lateral-izq').alto, 120, 'laterales al rim (ladosIguales)');
    assert.equal(porId(r, 'm1zapatera1-fondo').alto, 120, 'fondo al rim');
  });
});

describe('zapatera: modos × gola (integración mínima)', () => {
  // Casco + cajón + zapatera en modo 'borde' (sin frente: NO es unidad de
  // gola — drawerUnits cuenta drawer_face y la cara clasifica drawer_part;
  // coexiste sin reescalarse ni romper el reparto, A51) + cajón, con repisa
  // que ancla el topRef, apilados como app.js.
  function buildMixBorde() {
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    assert.ok(casco.ok);
    const pieces = [...casco.pieces];
    let cursor = 15 + 10;
    const unidades = [
      addShoeTray('1', 1, {
        anchoModulo: 850, profundidadModulo: 600, altoVano: 220,
        modoFrente: 'borde', bordeFrontal: 40, conFrente: false,
      }),
      addDrawer('1', 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 }),
      addShoeTray('1', 3, {
        anchoModulo: 850, profundidadModulo: 600, altoVano: 220,
        modoFrente: 'borde', bordeFrontal: 40, conFrente: false,
      }),
      addDrawer('1', 4, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 }),
    ];
    for (const u of unidades) {
      assert.ok(u.ok, u.errors?.join('; '));
      // Ancla: frente si lo hay, cara si no (convención de app.js).
      const ancla = u.pieces.find((p) => p.id.endsWith('-frente'))
        || u.pieces.find((p) => p.id.endsWith('-cara'));
      ancla.pos_z = cursor;
      cursor += 220 + 2.5;
      pieces.push(...u.pieces);
    }
    const s = addShelf('1', { anchoUtil: 850 - 2 * 15, profReal: 600 - 2 * 15, index: 1 });
    assert.ok(s.ok);
    s.pieces[0].pos_z = 1100;
    pieces.push(...s.pieces);
    return pieces;
  }

  it("applyGola con zapateras en modo 'borde' no lanza ni duplica piezas", () => {
    const pieces = buildMixBorde();
    const nZapatera = pieces.filter((p) => /zapatera/.test(String(p.id))).length;
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    // Ninguna pieza de zapatera duplicada ni eliminada: la gola solo añade
    // sus tiras (m{mod}gola-*) y las zapateras-borde (sin frente) no son
    // unidades: no hay frente que reescalar (se comportan como A51).
    const zap = r.pieces.filter((p) => /zapatera/.test(String(p.id)));
    assert.equal(zap.length, nZapatera, 'misma cantidad de piezas de zapatera');
    assert.ok(r.pieces.some((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))), 'la gola añadió sus tiras');
    assert.ok(!r.pieces.some((p) => /gola/.test(String(p.id)) && /zapatera/.test(String(p.id))),
      'ninguna tira gola toca ids de zapatera');
    // Las caras-borde no se reescalaron: siguen midiendo 40.
    for (const p of zap.filter((q) => String(q.id).endsWith('-cara'))) {
      assert.equal(Number(p.alto), 40, 'cara-borde intacta tras la gola');
    }
  });

  it("la zapatera 'borde' no es unidad de gola: el conteo sigue siendo el de los cajones", () => {
    const pieces = buildMixBorde();
    const unidades = drawerUnits(pieces, '1');
    assert.equal(unidades.length, 2, 'solo los 2 cajones son unidades');
    assert.ok(unidades.every((u) => u.frentes.every((f) => !/zapatera/.test(String(f.id)))),
      'ninguna unidad incluye frentes de zapatera');
  });
});
