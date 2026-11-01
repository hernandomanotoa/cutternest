// js/services/golaService.test.js — Contrato del sistema gola (SOLO canales
// tipo C de melamina entre cajones: sobre el último frente queda el gap de
// frente habitual, sin canal L). Replica el apilado de app.js (cursor = cara
// superior de la base + drawerBaseOffset, avance alto + drawerFrontGap) y
// verifica geometría, round-trip, BOM y renderer.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addDrawer, addShelf, addShoeTray } from './closetBuilderService.js';
import {
  applyGola,
  removeGola,
  validateGola,
  isGolaEnabled,
  getGolaCfg,
  drawerUnits,
  golaReport,
  aberturaCanalGola,
  planFijacionCanal,
  fijacionGolaReport,
  resumenPlanFijacion,
  GOLA_TORNILLO_FIJACION,
  GOLA_BROCA_FIJACION,
  GOLA_DEFAULTS,
  GOLA_PESTANA_ALTO_MM,
  GOLA_LABIO_MM,
} from './golaService.js';
import { GOLA_PERFIL_TALLER } from '../core/config.js';
import { calculateHardware } from './hardware.js';
import { validateShoeClearance } from './shoeClearanceService.js';
import { IsometricRenderer } from '../components/renderers/isometricRenderer.js';

const ANCHO = 800;
const ALTO = 1600;
const PROF = 500;
const ESP = 15;
const VANO = 200; // frente 197 (caja 167). Con gola: frente 227 (197+30 de
// labio; frente = cara + 60). La gola TAPA el espacio: gap visible = la
// entrada de dedos (golaEntradaMm, default 20) y las alas viven detrás de
// los frentes, casi topando las caras. Canales SOLO entre cajones.
const DRAWER_FRONT_GAP = 2.5;
const INTERIOR = ANCHO - 2 * ESP; // 770
const TECHO_INTERIOR = ALTO - ESP; // 1585

// Casco + N cajones apilados como los apila app.js + repisa opcional.
// repisaZ: pos_z absoluto de la repisa (default: 300 mm sobre el último techo).
function buildModule(n, { conRepisa = true, repisaZ = null, alto = ALTO } = {}) {
  const casco = createModule({ ancho: ANCHO, alto, prof: PROF, modulo: '1' });
  assert.ok(casco.ok);
  const pieces = [...casco.pieces];
  let cursor = ESP + 10; // cara superior de la base (15) + drawerBaseOffset
  let ultimoTecho = 0;
  for (let i = 1; i <= n; i++) {
    const d = addDrawer('1', i, { anchoModulo: ANCHO, profundidadModulo: PROF, altoVano: VANO });
    assert.ok(d.ok);
    const frente = d.pieces.find((p) => p.id.endsWith('-frente'));
    frente.pos_z = cursor;
    cursor += frente.alto + DRAWER_FRONT_GAP;
    ultimoTecho = frente.pos_z + frente.alto;
    pieces.push(...d.pieces);
  }
  if (conRepisa) {
    const s = addShelf('1', { anchoUtil: INTERIOR, profReal: PROF - 2 * ESP, index: 1 });
    assert.ok(s.ok);
    s.pieces[0].pos_z = repisaZ ?? ultimoTecho + 300;
    pieces.push(...s.pieces);
  }
  return pieces;
}

const frentesOrdenados = (pieces) =>
  pieces
    .filter((p) => p.id.endsWith('-frente'))
    .sort((a, b) => a.pos_z - b.pos_z);

const tirasDe = (pieces) =>
  pieces.filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))).sort((a, b) => a.pos_z - b.pos_z);

const tiradoresDe = (pieces) =>
  pieces.filter((p) => String(p.id).startsWith('m1') && p.id.endsWith('-tirador'));

describe('getGolaCfg', () => {
  it('mergea defaults del perfil de taller con overrides numéricos y string', () => {
    const cfg = getGolaCfg({});
    assert.equal(cfg.golaPerfilHeight, GOLA_PERFIL_TALLER.golaPerfilHeight);
    assert.equal(cfg.golaFingerClearance, 20);
    assert.equal(cfg.golaMaxOverhang, 120);
    assert.equal(cfg.golaFijacion, GOLA_PERFIL_TALLER.golaFijacion);
    assert.ok(!cfg.golaFijacion.includes('PROVISIONAL'), 'la fijación default ya no marca PROVISIONAL');
    const custom = getGolaCfg({ golaPerfilHeight: 40, golaFijacion: '  Cola + tarugos ' });
    assert.equal(custom.golaPerfilHeight, 40);
    assert.equal(custom.golaFijacion, 'Cola + tarugos');
    assert.equal(getGolaCfg({ golaPerfilHeight: -5 }).golaPerfilHeight, 50, 'negativos caen a default');
  });

  it('moduleCfg: los overrides del módulo ganan sobre la config global', () => {
    const global_ = { golaPerfilHeight: 40, golaFingerClearance: 15 };
    const cfg = getGolaCfg(global_, { golaPerfilHeight: 50 });
    assert.equal(cfg.golaPerfilHeight, 50, 'override del módulo gana a la global');
    assert.equal(cfg.golaFingerClearance, 15, 'clave no tocada hereda la global');
    assert.equal(getGolaCfg({ golaStripDepth: 200 }).golaStripDepth, undefined,
      'golaStripDepth (tira profunda del modelo antiguo) se eliminó: se ignora silenciosamente');
    assert.equal(getGolaCfg({}, {}).golaPerfilHeight, 50, 'sin overrides → default');
    assert.equal(getGolaCfg(global_).golaPerfilHeight, 40, 'sin moduleCfg → igual que antes');
  });

  it('moduleCfg: negativos/no numéricos caen al valor global/default', () => {
    const cfg = getGolaCfg({ golaPerfilHeight: 40 }, { golaPerfilHeight: -5 });
    assert.equal(cfg.golaPerfilHeight, 40, 'negativo del módulo cae a la global');
    assert.equal(getGolaCfg({}, { golaPerfilHeight: 'abc' }).golaPerfilHeight, 50, 'no numérico cae al default');
  });

  it('moduleCfg: golaFijacion del módulo gana; string vacío cae a la global', () => {
    const cfg = getGolaCfg({ golaFijacion: 'Fijación global' }, { golaFijacion: '  Cola del módulo ' });
    assert.equal(cfg.golaFijacion, 'Cola del módulo', 'trim + gana sobre la global');
    assert.equal(getGolaCfg({ golaFijacion: 'Fijación global' }, { golaFijacion: '  ' }).golaFijacion, 'Fijación global');
    assert.equal(getGolaCfg({}, { golaFijacion: '' }).golaFijacion, GOLA_DEFAULTS.golaFijacion, 'vacío en ambas → default');
  });
});

describe('applyGola — tiras entre frentes (N = 2..5)', () => {
  for (const n of [2, 3, 4, 5]) {
    it(`N=${n}: exactamente N−1 tiras con ids m1-gola-{i}, sobre el techo del frente inferior y agarre hacia arriba`, () => {
      const pieces = buildModule(n, {
        repisaZ: ESP + 10 + n * 227 + (n - 1) * GOLA_DEFAULTS.golaEntradaMm + DRAWER_FRONT_GAP + 100,
      });
      const r = applyGola(pieces, '1', {});
      assert.ok(r.ok, r.errors?.join('; '));
      assert.equal(isGolaEnabled(r.pieces, '1'), true);

      const tiras = tirasDe(r.pieces);
      assert.equal(tiras.length, n - 1, `N=${n} → ${n - 1} tiras`);
      const frentes = frentesOrdenados(r.pieces);
      assert.equal(frentes.length, n);

      tiras.forEach((tira, i) => {
        assert.equal(tira.id, `m1gola-c${i + 1}-fondo`);
        const inferior = frentes[i]; // unidad i (más abajo)
        const superior = frentes[i + 1];
        const techoInf = inferior.pos_z + inferior.alto;
        // La gola tapa el espacio DETRÁS de los frentes: el fondo va desde el
        // ala inf (tras el frente inferior, casi topando su cara) hasta el ala
        // sup (tras el frente superior).
        const alaInf = r.pieces.find((p) => p.id === `m1gola-c${i + 1}-ala-inf`);
        const alaSup = r.pieces.find((p) => p.id === `m1gola-c${i + 1}-ala-sup`);
        assert.ok(Math.abs(alaInf.pos_z - (techoInf - GOLA_LABIO_MM + GOLA_DEFAULTS.golaPaso)) <= 0.5,
          `ala inf ${i + 1}: tras el frente inferior, casi topando su cara`);
        assert.ok(Math.abs(alaSup.pos_z + 15 - (superior.pos_z + GOLA_LABIO_MM - GOLA_DEFAULTS.golaPaso)) <= 0.5,
          `ala sup ${i + 1}: tras el frente superior, casi topando su cara (techo = cara del superior − paso)`);
        // Gap visible = la entrada de dedos: la gola cubre todo lo demás.
        assert.ok(Math.abs(superior.pos_z - (techoInf + GOLA_DEFAULTS.golaEntradaMm)) <= 0.5,
          `gap visible frente ${i + 1}↔${i + 2} = entrada de dedos`);
        // El fondo conecta las alas (C cerrada).
        assert.ok(Math.abs(tira.pos_z - alaInf.pos_z) <= 0.5, 'fondo arranca con el ala inf');
        assert.ok(Math.abs(tira.pos_z + tira.alto - (alaSup.pos_z + 15)) <= 0.5, 'fondo termina con el ala sup');
        assert.equal(tira.alto, GOLA_DEFAULTS.golaEntradaMm + 2 * GOLA_LABIO_MM - 2 * GOLA_DEFAULTS.golaPaso,
          'cuerpo = entrada + 2·labio − 2·paso (la zona que tapa)');
        assert.equal(tira.modulo, '1');
        assert.equal(tira.espesor, 15);
        assert.equal(tira.cantidad, 1);
        // longitud = ancho INTERIOR − 2·holgura (nunca el ancho exterior)
        assert.equal(tira.ancho, INTERIOR - 2 * GOLA_DEFAULTS.golaHolguraLateral);
      });
    });

    it(`N=${n}: coherencia del reparto (frentes = caja + 30 sin reducir, aire libre arriba, monótono, sin solapes)`, () => {
      // Repisa 150 mm sobre la pila (gap visible = entrada de dedos: la gola
      // cubre el espacio detrás de los frentes): los frentes crecen +30
      // (labio) de 197 a 227 y el aire sobra LIBRE sobre el último frente.
      const G = GOLA_DEFAULTS.golaEntradaMm;
      const bottom = ESP + 10;
      const techoPila = bottom + n * 227 + (n - 1) * G;
      const pieces = buildModule(n, { repisaZ: techoPila + DRAWER_FRONT_GAP + 150 });
      const repisaZ = pieces.find((p) => p.id === 'm1-repisa-1').pos_z;
      const H_new = repisaZ - DRAWER_FRONT_GAP - bottom;

      const r = applyGola(pieces, '1', {});
      assert.ok(r.ok, r.errors?.join('; '));
      const frentes = frentesOrdenados(r.pieces);

      // Frentes crecidos +30 (197 → 227): el labio que cuelga sobre el canal.
      for (const f of frentes) {
        assert.equal(f.alto, 227, `frente ${f.id} = 197 + 30 (labio)`);
      }
      // La pila no excede el span y el aire sobra arriba.
      const suma = frentes.reduce((s, f) => s + f.alto, 0) + (n - 1) * G;
      assert.ok(suma <= H_new + 0.5, `Σ ${suma} ≤ H_new ${H_new} (aire libre arriba)`);
      assert.ok(H_new - suma > 100, 'sobra aire sobre el último frente');
      for (let i = 1; i < n; i++) {
        assert.ok(frentes[i].pos_z > frentes[i - 1].pos_z, 'pos_z monótono creciente');
      }
      // Las tiras viven DETRÁS de los frentes (la gola tapa el espacio):
      // el solape en Z es el diseño, no un error. Cada frente cubre su caja.
      for (const f of frentes) {
        assert.ok(f.alto >= 167 + 30, `frente ${f.alto} mm cubre su caja + labio`);
      }
      const validacion = validateGola(r.pieces, '1', {});
      assert.deepEqual(validacion.errors, [], 'validateGola sin errores');
    });
  }
});

describe('applyGola — último frente (gap habitual, sin canal L)', () => {
  it('con repisa: frentes +30 (labio) y el aire sobra libre bajo la repisa', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const frentes = frentesOrdenados(r.pieces);
    // Pila: 25 + 3·227 + 2·20 = 746 → techo 746; el aire libre vive sobre
    // el último frente.
    const ultimo = frentes[frentes.length - 1];
    assert.ok(Math.abs(ultimo.pos_z + ultimo.alto - 746) <= 1,
      `techo de la pila ${ultimo.pos_z + ultimo.alto} = 746 (aire libre hasta la repisa)`);
    assert.ok(r.warnings.some((w) => w.includes('libres sobre el último frente')),
      `aviso de aire libre: ${r.warnings.join(' | ')}`);
    // La caja no cambia: el lateral del cajón sigue en 167 mm.
    const lateral = r.pieces.find((p) => p.id === 'm1cajon3-lateral-izq');
    assert.equal(lateral.alto, 167);
    // Ninguna pieza del canal L: SOLO canales C entre cajones.
    assert.ok(!r.pieces.some((p) => /gola-l\d*-/.test(String(p.id))), 'sin ids gola-l*');
  });

  it('sin repisa: la pila queda a caja + 30 con aire libre bajo el techo interior', () => {
    const pieces = buildModule(2, { conRepisa: false, alto: 600 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const frentes = frentesOrdenados(r.pieces);
    const ultimo = frentes[frentes.length - 1];
    const techoInterior = 600 - ESP;
    // Pila: 25 + 227 + 20 + 227 = 499 < 585 − 2.5: aire libre arriba.
    assert.ok(Math.abs(ultimo.pos_z + ultimo.alto - 499) <= 1,
      `techo de la pila ${ultimo.pos_z + ultimo.alto} = 499`);
    assert.ok(ultimo.pos_z + ultimo.alto < techoInterior - DRAWER_FRONT_GAP,
      'aire libre entre la pila y el techo interior');
  });

  it('sin cap: cajón único, el frente queda a caja + 30 y el aire libre sobre él', () => {
    // 1 cajón sin repisa: el frente NO rellena el span (regla: nunca reducir
    // ni estirar más allá de caja + 30); sobra aire bajo el techo interior.
    const pieces = buildModule(1, { conRepisa: false });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const frente = frentesOrdenados(r.pieces)[0];
    assert.equal(frente.alto, 227, 'frente 197 + 30 (labio)');
    const techoInterior = ALTO - ESP;
    assert.ok(frente.pos_z + frente.alto < techoInterior - DRAWER_FRONT_GAP,
      'aire libre entre el frente y el techo interior');
    assert.ok(r.warnings.some((w) => w.includes('libres sobre el último frente')),
      'aviso de aire libre');
    assert.equal(tirasDe(r.pieces).length, 0, 'un cajón no lleva tiras');
    assert.equal(isGolaEnabled(r.pieces, '1'), false, 'sin canales, el módulo no queda "con gola"');
  });

  it('los frentes NUNCA se reducen: con repisa baja da error de vano con consejos', () => {
    // Repisa baja: antes los frentes se achicaban; ahora la regla es "caja +
    // 30, sin reducir" → error con consejos (subir repisa / bajar cajón...).
    const pieces = buildModule(3, { repisaZ: 690 });
    const r = applyGola(pieces, '1', {});
    assert.equal(r.ok, false);
    assert.ok(r.errors[0].includes('el vano no alcanza'), `error de vano: ${r.errors[0]}`);
    assert.ok(r.errors[0].includes('frentes + labio'), 'el error menciona el crecimiento del labio');
    // FIXES APLICABLES: subir repisa siempre; bajar primer cajón solo con
    // aire real debajo (aquí no hay: la pila arranca en el piso).
    assert.deepEqual(r.fixes.map((f) => f.id), ['subir-repisa'], 'fix subir-repisa presente');
    assert.equal(r.fixes[0].mm > 0, true, 'el fix trae los mm exactos');
    const frentes = frentesOrdenados(pieces);
    assert.ok(frentes.every((f) => f.alto === 197), 'frentes originales intactos');
  });
});

describe('golaLabioMm configurable', () => {
  it('labio 40: los frentes crecen +40 (era +30) y el crecimiento estándar no avisa', () => {
    const pieces = buildModule(3, {
      repisaZ: ESP + 10 + 3 * (197 + 40) + 2 * GOLA_DEFAULTS.golaEntradaMm + DRAWER_FRONT_GAP + 100,
    });
    const r = applyGola(pieces, '1', { golaLabioMm: 40 });
    assert.ok(r.ok, r.errors?.join('; '));
    for (const f of frentesOrdenados(r.pieces)) {
      assert.equal(f.alto, 237, 'frente = 197 + 40 (labio configurable)');
    }
    assert.ok(
      !r.warnings.some((w) => /creció a/.test(w)),
      'el crecimiento estándar del labio no genera aviso (la vista previa ya lo anuncia)',
    );
  });

  it('sin configurar, el labio default es 30 (compatibilidad)', () => {
    const pieces = buildModule(2, {
      repisaZ: ESP + 10 + 2 * 227 + GOLA_DEFAULTS.golaEntradaMm + DRAWER_FRONT_GAP + 100,
    });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    for (const f of frentesOrdenados(r.pieces)) {
      assert.equal(f.alto, 227, 'frente = 197 + 30 (default)');
    }
  });
});

describe('tiradores', () => {
  it('applyGola elimina los tiradores del módulo si los hay (CSV legacy); removeGola NO regenera', () => {
    // Los cajones/zapateras del Constructor ya nacen SIN tirador (apertura
    // sin jaladera); un CSV importado o un diseño previo puede traerlos:
    // applyGola los elimina igual, y removeGola ya no los regenera.
    const pieces = buildModule(3);
    assert.equal(tiradoresDe(pieces).length, 0, 'el Constructor genera cajones sin tirador');
    const legacy = [...pieces, {
      id: 'm1cajon1-tirador',
      nombre: 'Tirador cajon 1 M1',
      ancho: 2,
      alto: 20,
      cantidad: 1,
      rotate: false,
      color: '#A0A0A0',
      espesor: 5,
      cantos: '',
      modulo: '11',
    }];
    const r = applyGola(legacy, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(tiradoresDe(r.pieces).length, 0, 'gola sin tiradores');

    const off = removeGola(r.pieces, '1', {}, r.meta);
    assert.ok(off.ok, off.errors?.join('; '));
    assert.equal(tiradoresDe(off.pieces).length, 0, 'removeGola no regenera tiradores');
  });
});

describe('round-trip enable → disable', () => {
  it('con meta: restaura alturas y pos_z originales exactos (±1 mm)', () => {
    const pieces = buildModule(4, { repisaZ: 1250 });
    const originales = new Map(frentesOrdenados(pieces).map((f) => [f.id, { alto: f.alto, pos_z: f.pos_z }]));

    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(r.meta.moduleId, '1');
    assert.deepEqual(Object.keys(r.meta.origHeights).sort(), [...originales.keys()].sort());

    const off = removeGola(r.pieces, '1', {}, r.meta);
    assert.ok(off.ok, off.errors?.join('; '));
    assert.equal(isGolaEnabled(off.pieces, '1'), false);
    assert.equal(tirasDe(off.pieces).length, 0);
    for (const f of frentesOrdenados(off.pieces)) {
      const o = originales.get(f.id);
      assert.ok(Math.abs(f.alto - o.alto) <= 1, `${f.id}: alto ${f.alto} → ${o.alto}`);
      assert.ok(Math.abs(f.pos_z - o.pos_z) <= 1, `${f.id}: pos_z ${f.pos_z} → ${o.pos_z}`);
    }
  });

  it('sin meta: fallback proporcional que llena el span con drawerFrontGap', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const off = removeGola(r.pieces, '1', { drawerFrontGap: DRAWER_FRONT_GAP });
    assert.ok(off.ok, off.errors?.join('; '));
    assert.equal(tirasDe(off.pieces).length, 0);
    assert.equal(tiradoresDe(off.pieces).length, 0, 'sin tiradores (apertura sin jaladera)');
    const frentes = frentesOrdenados(off.pieces);
    const techoUltimoGola = (() => {
      const f = frentesOrdenados(r.pieces);
      return f[f.length - 1].pos_z + f[f.length - 1].alto;
    })();
    const bottom = ESP + 10;
    // Span preservado y gaps de frente restaurados.
    assert.ok(Math.abs((frentes[2].pos_z + frentes[2].alto) - techoUltimoGola) <= 2,
      'el span ocupado se conserva');
    assert.ok(Math.abs(frentes[1].pos_z - (frentes[0].pos_z + frentes[0].alto + DRAWER_FRONT_GAP)) <= 1);
    assert.ok(Math.abs(frentes[2].pos_z - (frentes[1].pos_z + frentes[1].alto + DRAWER_FRONT_GAP)) <= 1);
    assert.ok(frentes.every((f) => f.alto > bottom), 'frentes con altura positiva');
  });
});

describe('BOM (calculateHardware)', () => {
  it('lista perfiles gola agrupados por largo y tornillos del plan ((N−1) fondos × por lado × 2 caras)', () => {
    const pieces = buildModule(4, { repisaZ: 1300 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const h = calculateHardware(r.pieces, [], {});
    // Los canales son PIEZAS de melamina (van en la lista de corte, no en
    // el BOM); el BOM solo trae la fijación.
    assert.equal(h.some((x) => x.nombre.includes('Perfil gola')), false, 'sin perfiles en el BOM');
    const tornillos = h.find((x) => x.nombre === 'Tornillo fijación gola');
    assert.ok(tornillos);
    // Fondos de canal: N−1 canales C; 2 por lado × 2 caras.
    assert.equal(tornillos.cantidad, 3 * 2 * 2, '(N−1) fondos × golaTornillosPorPerfil por lado × 2 caras');
    assert.ok(tornillos.especificacion.includes(GOLA_DEFAULTS.golaFijacion), 'fijación en la especificación');

    // Sin gola no hay ítems gola.
    const h0 = calculateHardware(pieces, [], {});
    assert.equal(h0.some((x) => x.nombre.includes('gola')), false);
  });

  it('respeta golaTornillosPorPerfil y golaFijacion del cfg', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const cfg = { golaTornillosPorPerfil: 4, golaFijacion: 'Cola blanca + tarugos' };
    const h = calculateHardware(r.pieces, [], cfg);
    // 3 cajones ⇒ 2 fondos de canal C (N−1) × 4 por lado × 2 caras.
    assert.equal(h.find((x) => x.nombre === 'Tornillo fijación gola').cantidad, 2 * 4 * 2);
    assert.ok(h.find((x) => x.nombre === 'Tornillo fijación gola').especificacion.includes('Cola blanca + tarugos'));
  });
});

describe('validateGola — interferencia del canal en profundidad (eje Y)', () => {
  it('caso normal (retranqueo 10 mm en módulo de 500 mm de fondo): sin errores', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const v = validateGola(r.pieces, '1', {});
    assert.deepEqual(v.errors, [], 'sin errores de interferencia en Y');
  });

  it('golaStripDepth persistida (tira profunda del modelo antiguo) se ignora: applyGola ok', () => {
    const pieces = buildModule(2, { repisaZ: 700 });
    const r = applyGola(pieces, '1', { golaStripDepth: 480 });
    assert.ok(r.ok, r.errors?.join('; '));
  });

  it('retranqueo excesivo (golaStripSetback > fondo del módulo) → error', () => {
    // yWeb = 500 − 15 + 15 − 600 = −100; trasero = −100 − 15 = −115 < espesor
    // 15: el fondo del canal quedaría detrás del plano interior del fondo.
    const pieces = buildModule(2, { repisaZ: 700 });
    const r = applyGola(pieces, '1', { golaStripSetback: 600 });
    assert.equal(r.ok, false);
    assert.ok(
      r.errors.some((e) => e.includes('retranqueo')),
      `error de retranqueo presente: ${r.errors?.join('; ')}`,
    );
  });
});

describe('límites', () => {
  it('1 cajón: applyGola ok, 0 canales; el frente queda a caja + 30 y isGolaEnabled queda false', () => {
    // Sin canal L, un cajón único no genera ningún canal: applyGola deja el
    // frente a caja + 30 (sin rellenar el span) y el módulo NO queda marcado
    // como "con gola" (isGolaEnabled mira las tiras).
    const pieces = buildModule(1, { repisaZ: 330 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(tirasDe(r.pieces).length, 0);
    assert.ok(!r.pieces.some((p) => /gola-l\d*-/.test(String(p.id))), 'sin canal L');
    const frente = frentesOrdenados(r.pieces)[0];
    assert.equal(frente.alto, 227, 'frente 197 + 30 (labio, sin rellenar el span)');
    assert.ok(frente.pos_z + frente.alto < 330 - DRAWER_FRONT_GAP, 'aire libre bajo la repisa');
    assert.equal(isGolaEnabled(r.pieces, '1'), false);
    assert.equal(tiradoresDe(r.pieces).length, 0);
    assert.equal(drawerUnits(r.pieces, '1').length, 1);
  });

  it('0 cajones: { ok: false } amable', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    const r = applyGola(casco.pieces, '1', {});
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  });

  it('vano insuficiente: { ok: false } con explicación', () => {
    // Repisa apenas 20 mm sobre la pila: tras los gaps gola (G = alto de la
    // tira) no queda vano para los frentes (caja + 30, sin reducirlos).
    const techoUlt = ESP + 10 + 4 * 197 + 3 * DRAWER_FRONT_GAP;
    const pieces = buildModule(4, { repisaZ: techoUlt + 20 });
    const r = applyGola(pieces, '1', {});
    assert.equal(r.ok, false);
    assert.ok(r.errors[0].includes('vano'));
  });

  it('vano corto por poco → error de vano con consejos (sin rebaja de cajas)', () => {
    // Regla nueva: NO existe rebaja de caja. 3 cajones 197/167 con 13.5 mm
    // menos de span: déficit 13.5 → error "el vano no alcanza" con consejos,
    // y las cajas y frentes quedan intactos.
    const G = GOLA_DEFAULTS.golaEntradaMm;
    const spanMin = 3 * 227 + 2 * G + DRAWER_FRONT_GAP;
    const pieces = buildModule(3, { repisaZ: ESP + 10 + spanMin - 13.5 });
    const latOriginal = pieces.find((p) => p.id === 'm1cajon1-lateral-izq').alto;
    const r = applyGola(pieces, '1', {});
    assert.equal(r.ok, false, 'déficit pequeño también falla (sin rebaja)');
    assert.ok(r.errors[0].includes('vano'));
    assert.ok(r.errors[0].includes('suba la repisa'), 'consejo de subir la repisa');
    assert.equal(pieces.find((p) => p.id === 'm1cajon1-lateral-izq').alto, latOriginal, 'caja intacta');
    assert.equal(pieces.find((p) => p.id === 'm1cajon1-frente').alto, 197, 'frente intacto');
  });

  it('déficit pequeño con config estricta → sigue fallando con el error de vano', () => {
    // 2 cajones, span 402.5: déficit vs mínimo (167+30)·2 + 56 = 450 → 47.5:
    // sin rebaja de cajas, siempre error (con o sin golaMaxRebajaCaja, que
    // quedó sin efecto).
    const pieces = buildModule(2, { alto: 460, repisaZ: 430 });
    for (const cfg of [{}, { golaMaxRebajaCaja: 2 }, { golaMaxRebajaCaja: 40 }]) {
      const r = applyGola(pieces, '1', cfg);
      assert.equal(r.ok, false, `déficit sin rebaja posible → error (${JSON.stringify(cfg)})`);
      assert.ok(r.errors[0].includes('vano'));
      assert.ok(r.errors[0].includes('suba la repisa'), 'consejo de subir la repisa');
    }
  });

  it('golaMaxRebajaCaja quedó sin efecto (la rebaja de cajas se eliminó)', () => {
    const G = GOLA_DEFAULTS.golaEntradaMm;
    const spanMin = 3 * 227 + 2 * G + DRAWER_FRONT_GAP;
    const pieces = buildModule(3, { repisaZ: ESP + 10 + spanMin - 13.5 });
    const r = applyGola(pieces, '1', { golaMaxRebajaCaja: 40 });
    assert.equal(r.ok, false, 'aun con tope 40: sin rebaja, error de vano');
    assert.ok(r.errors[0].includes('vano'));
  });
});

describe('renderer (computeGeometries)', () => {
  it('emite geos role gola_strip detrás de la cara posterior de los frentes', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1 });
    const { geometries } = renderer.computeGeometries('1', r.pieces);
    const golas = geometries.filter((g) => g.role === 'gola_strip');
    // 3 cajones ⇒ 2 canales C × 3 piezas (fondo + 2 alas) = 6.
    assert.equal(golas.length, 6);

    const tiras = tirasDe(r.pieces); // fondos C
    assert.equal(tiras.length, 2);
    const yFace = PROF - ESP + 15;
    const yCara = yFace - 15; // cara posterior del frente (espesor 15)
    const yBack = yCara - GOLA_DEFAULTS.golaStripSetback;
    const fondosGeos = golas.filter((g) => g.id.endsWith('-fondo'));
    assert.equal(fondosGeos.length, 2, 'N−1 fondos C');
    tiras.forEach((t, i) => {
      const g = fondosGeos.find((fg) => fg.id === t.id);
      assert.ok(g, `geo del ${t.id}`);
      assert.equal(g.w, INTERIOR, 'ancho = interior (holgura 0)');
      assert.equal(g.h, GOLA_DEFAULTS.golaEntradaMm + 2 * GOLA_LABIO_MM - 2 * GOLA_DEFAULTS.golaPaso, 'alto = entrada + 2·labio − 2·paso');
      assert.equal(g.d, 15, 'el fondo es un panel vertical de 15');
      assert.ok(Math.abs(g.z - t.pos_z) <= 0.5);
      assert.ok(Math.abs(g.y - (yBack - 15)) <= 0.5, 'cara frontal del fondo a yBack (interno, detrás de los frentes)');
    });
    const LARGO_ALA = GOLA_DEFAULTS.golaStripSetback + 15 - 2; // traslape del fondo − holgura frontal
    const alas = golas.filter((g) => g.id.includes('-ala-'));
    assert.equal(alas.length, 4, '2 alas sup + 2 alas inf (una pareja por canal C)');
    alas.forEach((g) => {
      assert.equal(g.h, 15, 'ala: 15 de alto (tablero)');
      assert.equal(g.d, LARGO_ALA, 'largo = retranqueo + fondo (traslape) − 2 mm');
      assert.ok(Math.abs(g.y + g.d - (yCara - 2)) <= 0.5, 'termina 2 mm antes de la espalda del frente');
      assert.ok(Math.abs(g.y - (yCara - GOLA_DEFAULTS.golaStripSetback - 15)) <= 0.5,
        'arranca en la cara posterior del fondo (la C queda cerrada: fondo entre las alas)');
      assert.ok(g.y + g.d <= yFace - 15 + 0.5, 'nada llega al plano de frentes');
    });

  });

  it('emite marcas gola_grip del canal de agarre (una por fondo de canal C)', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1 });
    const { geometries } = renderer.computeGeometries('1', r.pieces);
    const grips = geometries.filter((g) => g.role === 'gola_grip');
    // Solo las marcas de paso de los fondos C (N−1). Sobre el último frente
    // no hay marca: queda el gap de frente habitual (sin canal L).
    assert.equal(grips.length, 2, 'N−1 marcas de paso (fondos C)');
    assert.ok(!grips.some((g) => /gola-l/.test(g.id)), 'sin marca de agarre L');

    const tiras = tirasDe(r.pieces);
    const frentes = frentesOrdenados(r.pieces);
    const yFace = PROF - ESP + 15;
    grips.filter((g) => /-fondo-grip$/.test(g.id)).slice(0, 2).forEach((g, i) => {
      assert.equal(g.id, `m1gola-c${i + 1}-fondo-grip`);
      // La marca es el PASO entre frentes (línea de sombra): arranca en el
      // techo del frente inferior y termina en el borde inferior del superior.
      const techoInf = Number(frentes[i].pos_z) + (Number(frentes[i].alto) || 0);
      assert.ok(Math.abs(g.z - techoInf) <= 0.5,
        `grip ${i + 1}: z ${g.z} = techo del frente inferior (el paso)`);
      assert.equal(g.h, GOLA_DEFAULTS.golaPaso, 'marca de la línea de sombra (paso)');
      // El frente superior queda a la ENTRADA configurable sobre la marca.
      assert.ok(Math.abs(Number(frentes[i + 1].pos_z) - (g.z + GOLA_DEFAULTS.golaEntradaMm)) <= 0.5,
        `grip ${i + 1}: el frente superior queda a la entrada de dedos sobre la marca`);
      assert.equal(g.w, INTERIOR, 'ancho = interior');
      assert.equal(g.d, 2, 'marca fina');
      assert.equal(g.y, yFace - 15 - 2, 'a ras de la cara posterior del frente (no sobresale)');
      assert.ok(g.y + g.d <= yFace - 15 + 0.5, 'nada sobresale delante de la cara posterior del frente');
      assert.equal(g.color, '#4ECDC4', 'color de acento del rol');
    });
  });

  it('sin repisa, solo las marcas de paso de los canales C (N−1); aire libre sobre el último frente', () => {
    const pieces = buildModule(2, { conRepisa: false });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1 });
    const { geometries } = renderer.computeGeometries('1', r.pieces);
    const grips = geometries.filter((g) => g.role === 'gola_grip');
    assert.equal(grips.length, 1, 'una marca por fondo de canal C');
    assert.ok(!grips.some((g) => /gola-l/.test(g.id)), 'sin marca L bajo el techo interior');
    // Sobre el último frente queda el gap de frente habitual (drawerFrontGap)
    // más el aire libre de la regla "caja + 30" hasta el techo interior.
    const frentes = frentesOrdenados(r.pieces);
    const ultimo = frentes[frentes.length - 1];
    const aire = TECHO_INTERIOR - DRAWER_FRONT_GAP - (ultimo.pos_z + ultimo.alto);
    assert.ok(aire > 0, `aire libre sobre el último frente (${aire} mm)`);
    // Gap visible = entrada de dedos (la gola cubre el resto detrás).
    assert.ok(Math.abs(frentes[1].pos_z - (frentes[0].pos_z + frentes[0].alto) - GOLA_DEFAULTS.golaEntradaMm) <= 0.5,
      'gap visible = entrada de dedos');
  });
});

describe('golaReport — sección del manual', () => {
  it('módulo de 1 solo cajón: sin canales C el reporte queda vacío', () => {
    // Sin canal L, un cajón único no genera ningún canal (N−1 = 0): el
    // reporte de perfiles gola no tiene filas.
    const pieces = buildModule(1, { repisaZ: 500 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.ok(!r.pieces.some((p) => /gola-c\d+-|gola-l\d*-/.test(String(p.id))), '0 canales');

    assert.deepEqual(golaReport(r.pieces, {}), [], 'sin canales no hay sección');
  });

  it('módulo con N cajones: filas de cada canal C (N−1), sin canal L', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const rows = golaReport(r.pieces, {});
    // 2 canales C (fondo + 2 alas = 3 filas c/u).
    assert.equal(rows.filter((x) => x.id.includes('gola-c')).length, 2 * 3);
    assert.equal(rows.filter((x) => x.id.includes('gola-l')).length, 0, 'sin canal L');
    assert.ok(rows.some((x) => /Canal C 1 \(entre cajones\)/.test(x.ubicacion)));
    // Sin piezas gola no hay sección.
    assert.deepEqual(golaReport(pieces, {}), []);
  });
});

describe('abertura útil de agarre', () => {
  it('canal C: 50 mm exterior / 20 mm útiles / 10 mm de entrada con defaults', () => {
    const ab = aberturaCanalGola('C', getGolaCfg({}));
    assert.deepEqual(ab, {
      tipo: 'C',
      alturaExteriorMm: GOLA_DEFAULTS.golaEntradaMm + 2 * GOLA_LABIO_MM,
      aberturaUtilMm: GOLA_DEFAULTS.golaEntradaMm + 2 * GOLA_LABIO_MM - 2 * GOLA_PESTANA_ALTO_MM - 2 * GOLA_DEFAULTS.golaPaso,
      profundidadEntradaMm: GOLA_LABIO_MM,
    });
    assert.equal(ab.aberturaUtilMm, 44);
  });

  it('canal L: abertura útil = golaFingerClearance (20 mm) — API en desuso (nadie la llama con L)', () => {
    const ab = aberturaCanalGola('L', getGolaCfg({}));
    assert.equal(ab.alturaExteriorMm, 50);
    assert.equal(ab.aberturaUtilMm, 20);
    assert.equal(ab.profundidadEntradaMm, 30);
  });

  it('validateGola: warning cuando golaMinAperturaUtil supera la abertura real', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const v = validateGola(r.pieces, '1', { golaMinAperturaUtil: 45 });
    assert.ok(
      v.warnings.some((w) => /abertura útil de agarre del canal C \(44 mm\).*mínimo ergonómico configurado \(45 mm\)/.test(w)),
      `warning de canal C presente: ${v.warnings.join(' | ')}`,
    );
    assert.ok(
      !v.warnings.some((w) => /abertura útil de agarre del canal L/.test(w)),
      'sin warning de canal L (ya no existe)',
    );
  });

  it('regresión: con defaults un caso típico no produce el warning nuevo', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const v = validateGola(r.pieces, '1', {});
    assert.equal(v.errors.length, 0);
    assert.ok(
      !v.warnings.some((w) => /abertura útil de agarre/.test(w)),
      `sin warning de abertura con defaults: ${v.warnings.join(' | ')}`,
    );
  });

  it('golaReport: la fila del fondo de cada canal incluye su abertura', () => {
    const pieces = buildModule(2, { repisaZ: 700 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const rows = golaReport(r.pieces, {});
    const fondos = rows.filter((x) => x.id.endsWith('-fondo'));
    assert.equal(fondos.length, 1, 'N−1 = 1 fondo de canal C');
    for (const f of fondos) {
      assert.ok(f.abertura, `fila ${f.id} con abertura`);
      assert.equal(f.abertura.aberturaUtilMm, 44);
      assert.equal(f.abertura.alturaExteriorMm, 80);
      assert.equal(f.abertura.profundidadEntradaMm, 30);
    }
    assert.ok(rows.filter((x) => !x.id.endsWith('-fondo')).every((x) => x.abertura === null),
      'pestañas sin abertura (resume al canal, va en el fondo)');
    const cFondo = fondos.find((x) => x.id.includes('gola-c'));
    assert.equal(cFondo.abertura.tipo, 'C');
  });
});

describe('applyGola — mix zapateras CON frente + cajones (frente + 30 labio)', () => {
  const GAP = GOLA_DEFAULTS.golaEntradaMm; // gap visible = entrada de dedos
  // Casco 850×2400×600 + 2 zapateras con frente (vano 220, modo 'normal':
  // bandeja uniforme 100, frente corto fijo = 130) + 2 cajones (vano 200 →
  // frente 197, lateral 167), apilados como app.js y repisa que ancla el
  // topRef. Regla: nadie absorbe aire — zapateras fijas en su tipo y cajones
  // a caja + 30; el aire que sobra queda libre sobre el último frente.
  function buildMix(repisaZ, { tipoId = 'tacones' } = {}) {
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    assert.ok(casco.ok);
    const pieces = [...casco.pieces];
    let cursor = 15 + 10; // cara superior de la base + drawerBaseOffset
    const unidades = [
      addShoeTray('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 220, conFrente: true, tipoId }),
      addShoeTray('1', 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 220, conFrente: true, tipoId }),
      addDrawer('1', 3, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 }),
      addDrawer('1', 4, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 }),
    ];
    for (const u of unidades) {
      assert.ok(u.ok);
      const frente = u.pieces.find((p) => p.id.endsWith('-frente'));
      frente.pos_z = cursor;
      cursor += frente.alto + 2.5;
      pieces.push(...u.pieces);
    }
    const s = addShelf('1', { anchoUtil: 850 - 2 * 15, profReal: 600 - 2 * 15, index: 1 });
    assert.ok(s.ok);
    s.pieces[0].pos_z = repisaZ;
    pieces.push(...s.pieces);
    return pieces;
  }

  const alturaFrente = (pieces, id) => Number(pieces.find((p) => p.id === id)?.alto) || 0;

  it('span ajustado: zapateras fijas en su tipo, cajones +30 (labio) y aire libre arriba', () => {
    // Zapateras fijas (2×130) + cajones con labio (2×227); pila = 714 + 3·20
    // = 774: repisa @1010 → span 982.5: sobra aire sobre el último frente.
    const pieces = buildMix(1010);
    const bottom = 25;
    const span = 1010 - DRAWER_FRONT_GAP /* gap habitual sobre el último frente */ - bottom; // 982.5
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    // Zapateras: fijas — conservan el frente corto (bandeja + 30).
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 130, 'zapatera 1 conserva su frente corto');
    assert.equal(alturaFrente(r.pieces, 'm1zapatera2-frente'), 130, 'zapatera 2 conserva su frente corto');
    // Cajones: frente +30 (197 → 227): el labio que cuelga sobre el canal.
    assert.equal(alturaFrente(r.pieces, 'm1cajon3-frente'), 227, 'cajón 3 = 197 + 30 (labio)');
    assert.equal(alturaFrente(r.pieces, 'm1cajon4-frente'), 227, 'cajón 4 = 197 + 30 (labio)');
    // Invariante: Σ alturas + (N−1)·G ≤ span (el aire sobra arriba).
    const suma = ['m1zapatera1-frente', 'm1zapatera2-frente', 'm1cajon3-frente', 'm1cajon4-frente']
      .reduce((s, id) => s + alturaFrente(r.pieces, id), 0);
    assert.ok(suma + 3 * GAP <= span + 0.5, `Σ${suma} + 3·86 ≤ span ${span}`);
    assert.ok(r.warnings.some((w) => w.includes('libres sobre el último frente')),
      'aviso de aire libre');
    // Canales SOLO entre cajones: el mix (zap, zap, caj, caj) tiene exactamente 1.
    assert.equal(r.pieces.filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))).length, 1, '1 canal: solo entre los dos cajones');
    assert.ok(!r.pieces.some((p) => /gola-c[12]-/.test(String(p.id))), 'sin canales en los pares con zapateras (c1↔c2 solo)');
  });

  it('las zapateras NO varían (posición ni medida) y el gap tras ellas respeta su vano', () => {
    // Spec: al aplicar gola con cajones en el módulo, las zapateras quedan
    // INAMOVIBLES. Los cajones se apilan desde el techo de la última zapatera
    // con el gap de su vano (220 − 130 = 90), y entre cajones con la entrada.
    const pieces = buildMix(1010);
    // Espaciado ergonómico previo (gap 90 entre zapateras: clearance 205).
    const previas = { m1zapatera1: 25, m1zapatera2: 245, m1cajon3: 540, m1cajon4: 739.5 };
    for (const [pref, z] of Object.entries(previas)) {
      const f = pieces.find((p2) => p2.id === `${pref}-frente`);
      if (f) f.pos_z = z;
    }
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const pieza = (id) => r.pieces.find((p2) => p2.id === id);
    // Zapateras: posición y medida intactas.
    assert.equal(Number(pieza('m1zapatera1-frente').pos_z), 25, 'zapatera 1: posición sin cambios');
    assert.equal(Number(pieza('m1zapatera1-frente').alto), 130, 'zapatera 1: medida sin cambios');
    assert.equal(Number(pieza('m1zapatera2-frente').pos_z), 245, 'zapatera 2: posición sin cambios');
    assert.equal(Number(pieza('m1zapatera2-frente').alto), 130, 'zapatera 2: medida sin cambios');
    // Cajones: +30 de labio y apilados desde el techo de la zapatera 2.
    assert.equal(Number(pieza('m1cajon3-frente').alto), 227, 'cajón 3: 197 + 30');
    assert.equal(Number(pieza('m1cajon3-frente').pos_z), 465, 'cajón 3: 245 + 130 + 90 (vano de la zapatera)');
    assert.equal(Number(pieza('m1cajon4-frente').pos_z), 712, 'cajón 4: 465 + 227 + 20 (entrada, canal C)');
    // El clearance del calzado queda por encima del mínimo de tacones.
    const { warnings } = validateShoeClearance(r.pieces, {});
    assert.deepEqual(warnings, [], 'sin avisos de altura libre: 130 + 90 − 15 = 205 ≥ 180');
  });

  it('span insuficiente con zapateras fijas: rechaza indicando el fijo de las zapateras', () => {
    // Repisa @750 → span 722.5, disponible 662.5 < mínimo 714 (2×130 fijas +
    // 2×227 con labio): el error debe mencionar que el mínimo incluye las
    // zapateras a altura de tipo.
    const pieces = buildMix(750);
    const r = applyGola(pieces, '1', {});
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /el vano no alcanza/);
    assert.match(r.errors[0], /fijas en su posición y medida/);
  });

  it('solo zapateras: la pila fija cabe con el aire abierto encima (frentes cortos)', () => {
    // 2 zapateras fijas (130 cada una): la pila mide 2·130 + 56 = 316; el
    // span (982.5) se cuadra con el AIRE ABIERTO que queda encima (es el
    // aire del calzado de la última zapatera) — no se exigen frentes altos.
    const pieces = buildMix(1010).filter((p) => !/cajon/.test(String(p.id)));
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 130, 'zapatera 1 fija en 130');
    assert.equal(alturaFrente(r.pieces, 'm1zapatera2-frente'), 130, 'zapatera 2 fija en 130');
    // La pila no llega a la repisa: aire abierto sobre el último frente.
    const techoPila = 25 + 130 + GAP + 130;
    assert.ok(techoPila < 1010 - 100, `la pila (${techoPila} mm) queda muy por debajo de la repisa: aire abierto`);
    // La gola es SOLO entre cajones: entre zapateras NO va canal.
    assert.equal(r.pieces.filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))).length, 0, 'sin canales entre zapateras');
    assert.equal(isGolaEnabled(r.pieces, '1'), false, 'sin canales, el módulo no queda "con gola"');
    // Y si la pila NO CABE (repisa demasiado baja), rechaza:
    const baja = buildMix(288).filter((p) => !/cajon/.test(String(p.id)));
    const r2 = applyGola(baja, '1', {});
    assert.equal(r2.ok, false);
    assert.match(r2.errors[0], /el vano no alcanza/);
  });

  it('span insuficiente: sigue rechazando con "el vano no alcanza"', () => {
    // Módulo corto (460) con la repisa justo sobre los cajones: span 402.5,
    // disponible 346.5 < 394 (2 cajones × (167+30)) → rechazo.
    const pieces = buildModule(2, { alto: 460, repisaZ: 430 });
    const r = applyGola(pieces, '1', {});
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /el vano no alcanza/);
    assert.match(r.errors[0], /faltan 71\.5 mm/);
  });

  it('con tag manda el CONTRATO aunque el nombre no diga "zapatera"', () => {
    // Frentes con tag [tacones] pero SIN la palabra clave: el contrato los
    // marca fijos (la regex histórica no los reconocería).
    const pieces = buildMix(1010);
    for (const id of ['m1zapatera1-frente', 'm1zapatera2-frente']) {
      const f = pieces.find((p) => p.id === id);
      f.nombre = f.nombre.replace(/zapatera/gi, 'calzado');
      assert.ok(!/zapatera/i.test(f.nombre));
    }
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 130, 'fija por contrato [tacones] (frente corto)');
    assert.equal(alturaFrente(r.pieces, 'm1zapatera2-frente'), 130);
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') >= 227, 'los cajones crecen +30 (labio)');
  });

  it('sin tag: la heurística por nombre sigue marcando la zapatera como fija', () => {
    const pieces = buildMix(1010, { tipoId: null });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 130, 'fija por palabra clave (retrocompatibilidad)');
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') >= 227);
  });
});

describe('plan de fijación de canales gola', () => {
  const fondoC = { id: 'm1gola-c1-fondo', ancho: INTERIOR, alto: 50 };

  it('canal C con defaults: anfitrión laterales, 2 tornillos por lado, sin soporte trasero', () => {
    const plan = planFijacionCanal(fondoC, { tipo: 'C', indice: 1 });
    assert.equal(plan.tipo, 'C');
    assert.equal(plan.canalId, 'm1gola-c1');
    assert.equal(plan.anfitrion.tipo, 'laterales');
    assert.equal(plan.tornillos.porLado, 2);
    assert.equal(plan.tornillos.total, 4);
    assert.equal(plan.tornillos.diametro, GOLA_TORNILLO_FIJACION);
    assert.equal(plan.tornillos.broca, GOLA_BROCA_FIJACION);
    assert.deepEqual(plan.tornillos.posicionZmm, [15, 35]);
    assert.equal(plan.tornillos.posicionYmm, GOLA_DEFAULTS.golaStripSetback, 'retranqueo por defecto (fondo interno)');
    assert.equal(plan.soporteTrasero, null, '770 < 900: sin soporte');
    assert.deepEqual(plan.warnings, []);
  });

  it('canal L: recibe el anclaje superior real por ctx — API en desuso (nadie la llama con L)', () => {
    const anclaje = { tipo: 'repisa', id: 'm1-repisa1', descripcion: 'repisa m1-repisa1' };
    const plan = planFijacionCanal(
      { id: 'm1gola-l1-fondo', ancho: INTERIOR, alto: 50 },
      { tipo: 'L', indice: 1 },
      GOLA_DEFAULTS,
      { anclajeSuperior: anclaje },
    );
    assert.equal(plan.tipo, 'L');
    assert.deepEqual(plan.anclajeSuperior, anclaje);
  });

  it('exige soporte trasero cuando la luz del canal supera el umbral', () => {
    const plan = planFijacionCanal({ id: 'm1gola-c1-fondo', ancho: 950, alto: 50 }, { tipo: 'C', indice: 1 });
    assert.ok(plan.soporteTrasero?.requerido);
    assert.equal(plan.soporteTrasero.anchoMm, 950);
    assert.ok(plan.warnings.some((w) => /soporte trasero/.test(w)));
  });

  it('avisa cuando un punto de tornillo queda cerca del borde (fondo bajo)', () => {
    const plan = planFijacionCanal({ id: 'm1gola-c1-fondo', ancho: INTERIOR, alto: 18 }, { tipo: 'C', indice: 1 });
    assert.deepEqual(plan.tornillos.posicionZmm, [9], 'un solo tornillo centrado');
    assert.ok(plan.warnings.some((w) => /riesgo de astillado/.test(w)));
  });

  it('fijacionGolaReport recorre los canales reales y golaReport expone el plan', () => {
    const pieces = buildModule(2);
    const conGola = applyGola(pieces, '1', {});
    assert.ok(conGola.ok, conGola.errors?.join('; '));
    const { planes, warnings } = fijacionGolaReport(conGola.pieces, {});
    assert.equal(planes.length, 1, '2 cajones ⇒ 1 canal C (N−1)');
    assert.ok(planes.every((p) => p.tornillos.total >= 2));
    const resumen = resumenPlanFijacion(planes[0]);
    assert.match(resumen, /tornillos/);
    assert.match(resumen, /anfitrión: laterales/);
    const reporte = golaReport(conGola.pieces, {});
    const filasFondo = reporte.filter((r) => /-fondo$/.test(String(r.id)));
    assert.equal(filasFondo.length, 1);
    assert.ok(filasFondo.every((r) => r.fijacionPlan && r.fijacionPlanTxt?.includes('tornillos')));
    assert.deepEqual(warnings, []);
  });

  it('validateGola incluye los warnings del plan de fijación (soporte trasero exigido)', () => {
    const casco = createModule({ ancho: 950, alto: ALTO, prof: PROF, modulo: '1' });
    assert.ok(casco.ok);
    const pieces = [...casco.pieces];
    let cursor = ESP + 10;
    for (let i = 1; i <= 2; i++) {
      const d = addDrawer('1', i, { anchoModulo: 950, profundidadModulo: PROF, altoVano: VANO });
      assert.ok(d.ok);
      const frente = d.pieces.find((p) => p.id.endsWith('-frente'));
      frente.pos_z = cursor;
      cursor += frente.alto + DRAWER_FRONT_GAP;
      pieces.push(...d.pieces);
    }
    const s = addShelf('1', { anchoUtil: 950 - 2 * ESP, profReal: PROF - 2 * ESP, index: 1 });
    assert.ok(s.ok);
    s.pieces[0].pos_z = cursor + 300;
    pieces.push(...s.pieces);
    const conGola = applyGola(pieces, '1', {});
    assert.ok(conGola.ok, conGola.errors?.join('; '));
    const v = validateGola(conGola.pieces, '1', {});
    assert.ok(v.warnings.some((w) => /soporte trasero/.test(w)));
  });
});
