// js/services/zapateraModos.test.js — Modos de construcción del frente
// de la zapatera extraíble (Constructor). 3 modos:
//   (N) 'normal' (DEFAULT): frente CORTO — mide bandeja + 30 mm
//       (ZAPATERA_FRENTE_DROP) y NO cubre el vano: el aire superior queda
//       abierto para el calzado y la unidad reserva SU vano completo en el
//       apilado. La bandeja es de borde UNIFORME al alto configurado
//       (`altoLateral`, default 100 mm): cara = laterales = fondo = división.
//       Sin tirador (apertura sin jaladera).
//   (X) 'extendido': el frente completa el vano hasta arriba (vano − 1,
//       holgura mínima); cara y laterales detrás a frente − 2·E.
//   (P) 'personalizado': alturas independientes (altoFrente, altoLateral,
//       altoFondo, altoDivision); la cara siempre = frente − 2·E. Con
//       conFrente=false queda bandeja sin frente (cara alta visible) — así
//       vive la 'bandeja a la vista' (ladosIguales + rim).
// Invariantes transversales: ids únicos, espesor global (espesorModulo) en
// todas las piezas de la bandeja, riel intacto y compatibilidad con gola y
// con el apilado por pos_z (mismas piezas-móviles con y sin frente).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addShoeTray, addDrawer, addShelf } from './closetBuilderService.js';
import { applyGola, drawerUnits } from './golaService.js';

const BASE = { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 };
const ids = (r) => r.pieces.map((p) => p.id);
const porId = (r, id) => r.pieces.find((p) => p.id === id);

describe('zapatera: modos de construcción del frente', () => {
  it("'normal': frente corto = bandeja + 30, bandeja uniforme al alto configurado", () => {
    const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'normal' });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(r.conFrente, true, 'lleva frente decorativo');
    assert.equal(porId(r, 'm1zapatera1-frente').alto, 130, 'frente = bandeja (100) + 30');
    assert.equal(porId(r, 'm1zapatera1-tirador'), undefined, 'sin tirador (apertura sin jaladera)');
    for (const sufijo of ['cara', 'lateral-izq', 'lateral-der', 'fondo', 'division']) {
      assert.equal(porId(r, `m1zapatera1-${sufijo}`).alto, 100, `${sufijo}: borde uniforme al alto de bandeja`);
    }
    // El alto de la zapatera es configurable: manda en la bandeja y el frente.
    const b80 = addShoeTray('1', 1, { ...BASE, modoFrente: 'normal', altoLateral: 80 });
    assert.ok(b80.ok, b80.errors?.join('; '));
    assert.equal(porId(b80, 'm1zapatera1-frente').alto, 110, 'frente = bandeja (80) + 30');
    assert.equal(porId(b80, 'm1zapatera1-cara').alto, 80, 'cara al nuevo alto');
    // El frente NO cubre el vano: 130 < 197 (vano − 3).
    assert.ok(porId(r, 'm1zapatera1-frente').alto < BASE.altoVano - 3, 'frente corto: aire abierto para el calzado');
  });

  it("validación 'normal': bandeja + 30 debe caber en el vano (error con consejo)", () => {
    const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'normal', altoLateral: 175 });
    assert.equal(r.ok, false, 'bandeja 175 + 30 = 205 > vano 200');
    assert.match(r.errors[0], /no cabe en el vano/);
    assert.match(r.errors[0], /170 mm/, 'consejo con el máximo que entraría');
    // Con frente completo (botas) el frente es vano − 3: no aplica la regla.
    const botas = addShoeTray('1', 1, { ...BASE, modoFrente: 'normal', altoLateral: 175, frenteCompleto: true });
    assert.ok(botas.ok, botas.errors?.join('; '));
  });

  it("default: sin modoFrente, conFrente=true resuelve 'normal'; conFrente=false → bandeja sin frente", () => {
    const legacy = addShoeTray('1', 1, { ...BASE });
    assert.ok(legacy.ok, legacy.errors?.join('; '));
    assert.equal(legacy.modoFrente, 'normal');
    assert.ok(legacy.frente && legacy.frente.alto === 130, 'frente = bandeja + 30');
    assert.equal(porId(legacy, 'm1zapatera1-cara').alto, 100, 'cara = alto de bandeja');
    assert.equal(porId(legacy, 'm1zapatera1-tirador'), undefined, 'sin tirador');
    // Sin frente (bandeja abierta): la cara alta queda de frente visible.
    const abierta = addShoeTray('1', 1, { ...BASE, conFrente: false });
    assert.ok(abierta.ok, abierta.errors?.join('; '));
    assert.equal(abierta.modoFrente, 'personalizado', 'la bandeja sin frente vive en personalizado');
    assert.equal(porId(abierta, 'm1zapatera1-frente'), undefined, 'sin frente decorativo');
    assert.equal(porId(abierta, 'm1zapatera1-cara').alto, 167, 'cara alta = vano − 3 − 2·E');
  });

  it("'extendido': frente = vano − 1 (completa el vano); cara y laterales detrás", () => {
    const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'extendido' });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(porId(r, 'm1zapatera1-frente').alto, 199, 'frente = vano − 1 (holgura mínima)');
    assert.equal(porId(r, 'm1zapatera1-cara').alto, 169, 'cara = frente − 2·15');
    assert.ok(Number(porId(r, 'm1zapatera1-lateral-izq').alto) <= 169, 'laterales ≤ cara');
  });

  it("'normal' con espesorModulo=18: la bandeja uniforme no depende del espesor (extendido sí)", () => {
    const n18 = addShoeTray('1', 1, { ...BASE, modoFrente: 'normal', espesorModulo: 18 });
    assert.ok(n18.ok, n18.errors?.join('; '));
    assert.equal(porId(n18, 'm1zapatera1-frente').alto, 130, 'normal E=18: frente = bandeja + 30');
    assert.equal(porId(n18, 'm1zapatera1-cara').alto, 100, 'normal E=18: cara = alto de bandeja');
    const e18 = addShoeTray('1', 1, { ...BASE, modoFrente: 'extendido', espesorModulo: 18 });
    assert.equal(porId(e18, 'm1zapatera1-frente').alto, 199, 'extendido E=18: frente = vano − 1');
    assert.equal(porId(e18, 'm1zapatera1-cara').alto, 163, 'extendido E=18: cara = frente − 2·18');
  });

  it('los 3 modos generan piezas con ids únicos y sin duplicados', () => {
    for (const modoFrente of ['normal', 'extendido', 'personalizado']) {
      const r = addShoeTray('1', 1, { ...BASE, modoFrente });
      assert.ok(r.ok, `${modoFrente}: ${r.errors?.join('; ')}`);
      const set = new Set(ids(r));
      assert.equal(set.size, r.pieces.length, `${modoFrente}: ids únicos`);
    }
  });

  it("'personalizado': cada pieza refleja SU altura (con frente); la cara = frente − 2·E", () => {
    const r = addShoeTray('1', 1, {
      ...BASE, modoFrente: 'personalizado', conFrente: true,
      altoFrente: 150, altoLateral: 90, altoFondo: 70, altoDivision: 60,
    });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(porId(r, 'm1zapatera1-frente').alto, 150, 'frente 150');
    assert.equal(porId(r, 'm1zapatera1-tirador'), undefined, 'sin tirador (apertura sin jaladera)');
    assert.equal(porId(r, 'm1zapatera1-lateral-izq').alto, 90, 'laterales 90');
    assert.equal(porId(r, 'm1zapatera1-lateral-der').alto, 90);
    assert.equal(porId(r, 'm1zapatera1-fondo').alto, 70, 'borde trasero 70');
    assert.equal(porId(r, 'm1zapatera1-division').alto, 60, 'división 60');
    assert.equal(porId(r, 'm1zapatera1-cara').alto, 120, 'cara = frente − 2·15 (detrás del frente)');
  });

  it("'personalizado': sin frente (conFrente=false) respeta las mismas alturas", () => {
    const r = addShoeTray('1', 1, {
      ...BASE, modoFrente: 'personalizado', conFrente: false,
      altoFrente: 150, altoLateral: 90, altoFondo: 70, altoDivision: 60,
    });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(porId(r, 'm1zapatera1-frente'), undefined, 'sin frente');
    assert.equal(porId(r, 'm1zapatera1-tirador'), undefined, 'sin tirador');
    assert.equal(porId(r, 'm1zapatera1-lateral-izq').alto, 90);
    assert.equal(porId(r, 'm1zapatera1-fondo').alto, 70);
    assert.equal(porId(r, 'm1zapatera1-division').alto, 60);
    // Sin frente la cara es la cara alta de la bandeja (frente − 2·E con el
    // frente de referencia del vano: 197 − 30 = 167).
    assert.equal(porId(r, 'm1zapatera1-cara').alto, 167, 'cara alta de la bandeja sin frente');
  });

  it('cambiar de modo no deja piezas obsoletas (sets de ids desde cero)', () => {
    const modos = [
      addShoeTray('1', 1, { ...BASE, modoFrente: 'normal' }),
      addShoeTray('1', 1, { ...BASE, modoFrente: 'extendido' }),
      addShoeTray('1', 1, { ...BASE, modoFrente: 'personalizado', conFrente: false, altoFrente: 150 }),
      addShoeTray('1', 1, { ...BASE, conFrente: false }),
    ];
    for (const r of modos) assert.ok(r.ok, r.errors?.join('; '));
    // Los modos con frente generan el mismo set de ids (mismas piezas, solo
    // cambian alturas): al cambiar de modo no sobra nada.
    assert.equal(ids(modos[0]).sort().join(','), ids(modos[1]).sort().join(','));
    // Ningún id fuera del vocabulario zapatera conocido.
    const conocidos = /-frente$|-tirador$|-lateral-izq$|-lateral-der$|-fondo$|-cara$|-division$|-base$/;
    for (const r of modos) {
      for (const id of ids(r)) assert.ok(conocidos.test(id), `id conocido: ${id}`);
    }
  });

  it('regla del espesor global: espesorModulo=18 en todas las piezas de la bandeja (3 modos)', () => {
    for (const modoFrente of ['normal', 'extendido', 'personalizado']) {
      const r = addShoeTray('1', 1, { ...BASE, modoFrente, espesorModulo: 18 });
      assert.ok(r.ok, `${modoFrente}: ${r.errors?.join('; ')}`);
      for (const p of r.pieces) {
        if (/-frente$|-tirador$/.test(p.id)) continue; // frente/tirador: espesor propio
        assert.equal(Number(p.espesor), 18, `${p.id}: espesor 18 (E global)`);
      }
      assert.equal(Number(porId(r, 'm1zapatera1-lateral-izq').espesor), 18);
    }
  });

  it("pos_z: bandeja sin frente devuelve las mismas piezas-móviles que con frente (mismo ancla)", () => {
    const conFrente = addShoeTray('1', 1, { ...BASE, modoFrente: 'normal' });
    const sinFrente = addShoeTray('1', 1, { ...BASE, conFrente: false });
    // La cara (ancla del apilado) existe en ambos con el mismo id: la
    // convención pos_z (asignarPosZInsercion) aplica igual.
    assert.ok(porId(conFrente, 'm1zapatera1-cara') && porId(sinFrente, 'm1zapatera1-cara'));
    assert.equal(ids(sinFrente).filter((i) => !/-frente$/.test(i)).sort().join(','),
      ids(conFrente).filter((i) => !/-frente$/.test(i)).sort().join(','));
  });

  it('frenteCompleto (botas) fuerza frente aunque conFrente=false', () => {
    const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'personalizado', conFrente: false, frenteCompleto: true });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.ok(porId(r, 'm1zapatera1-frente'), 'frente forzado por frenteCompleto');
    assert.equal(porId(r, 'm1zapatera1-tirador'), undefined, 'sin tirador (apertura sin jaladera)');
    assert.equal(porId(r, 'm1zapatera1-cara'), undefined, 'sin cara (el frente cierra la bandeja)');
  });

  it('validaciones: altoFrente fuera de rango y modoFrente inválido → error', () => {
    for (const altoFrente of [30, 250]) { // vano 200 → rango 50..199
      const r = addShoeTray('1', 1, { ...BASE, modoFrente: 'personalizado', altoFrente });
      assert.equal(r.ok, false, `altoFrente ${altoFrente} rechazado`);
      assert.match(r.errors[0], /altoFrente/);
    }
    for (const modoFrente of ['raro', 'borde', 'abierta', 'frenteBajo', 'normas', 'completo']) {
      const r = addShoeTray('1', 1, { ...BASE, modoFrente });
      assert.equal(r.ok, false, `modoFrente "${modoFrente}" rechazado`);
      assert.match(r.errors[0], /modoFrente/);
    }
  });

  it("rieles: los 3 modos mantienen profBandeja2 y holguras según el riel", () => {
    for (const riel of ['catalogo', 'telescopica26', 'oculta']) {
      const normal = addShoeTray('1', 1, { ...BASE, modoFrente: 'normal', riel });
      const extendido = addShoeTray('1', 1, { ...BASE, modoFrente: 'extendido', riel });
      assert.ok(normal.ok && extendido.ok, riel);
      for (const sufijo of ['lateral-izq', 'lateral-der', 'fondo', 'base']) {
        assert.equal(porId(extendido, `m1zapatera1-${sufijo}`).ancho, porId(normal, `m1zapatera1-${sufijo}`).ancho,
          `${riel}: ${sufijo} misma profundidad/luz`);
      }
    }
  });

  it("ladosIguales (bandeja a la vista): rim en cara, laterales y fondo; sin frente", () => {
    const r = addShoeTray('1', 1, {
      ...BASE, altoVano: 160, modoFrente: 'personalizado', conFrente: false,
      ladosIguales: true, rim: 120,
    });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(porId(r, 'm1zapatera1-cara').alto, 120, 'cara al rim');
    assert.equal(porId(r, 'm1zapatera1-lateral-izq').alto, 120, 'laterales al rim');
    assert.equal(porId(r, 'm1zapatera1-fondo').alto, 120, 'fondo al rim');
    assert.equal(porId(r, 'm1zapatera1-frente'), undefined, 'sin frente decorativo');
  });
});

describe('zapatera: modos × gola (integración mínima)', () => {
  // Casco + cajón + zapateras abiertas (conFrente=false: NO son unidades de
  // gola — drawerUnits cuenta drawer_face y la cara clasifica drawer_part;
  // coexiste sin reescalarse ni romper el reparto, A51) + cajón, con repisa
  // que ancla el topRef, apilados como app.js.
  function buildMixAbierta() {
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    assert.ok(casco.ok);
    const pieces = [...casco.pieces];
    let cursor = 15 + 10;
    const unidades = [
      addShoeTray('1', 1, {
        anchoModulo: 850, profundidadModulo: 600, altoVano: 220,
        modoFrente: 'personalizado', conFrente: false,
      }),
      addDrawer('1', 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 }),
      addShoeTray('1', 3, {
        anchoModulo: 850, profundidadModulo: 600, altoVano: 220,
        modoFrente: 'personalizado', conFrente: false,
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

  it("applyGola con zapateras abiertas (sin frente) no lanza ni duplica piezas", () => {
    const pieces = buildMixAbierta();
    const nZapatera = pieces.filter((p) => /zapatera/.test(String(p.id))).length;
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    // Ninguna pieza de zapatera duplicada ni eliminada: la gola solo añade
    // sus tiras (m{mod}gola-*) y las zapateras abiertas (sin frente) no son
    // unidades: no hay frente que reescalar (se comportan como A51).
    const zap = r.pieces.filter((p) => /zapatera/.test(String(p.id)));
    assert.equal(zap.length, nZapatera, 'misma cantidad de piezas de zapatera');
    assert.ok(r.pieces.some((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))), 'la gola añadió sus tiras');
    assert.ok(!r.pieces.some((p) => /gola/.test(String(p.id)) && /zapatera/.test(String(p.id))),
      'ninguna tira gola toca ids de zapatera');
  });

  it("la zapatera abierta (sin frente) no es unidad de gola: el conteo sigue siendo el de los cajones", () => {
    const pieces = buildMixAbierta();
    const unidades = drawerUnits(pieces, '1');
    assert.equal(unidades.length, 2, 'solo los 2 cajones son unidades');
    assert.ok(unidades.every((u) => u.frentes.every((f) => !/zapatera/.test(String(f.id)))),
      'ninguna unidad incluye frentes de zapatera');
  });
});
