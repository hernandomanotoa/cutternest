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
} from './golaService.js';
import { GOLA_PERFIL_TALLER } from '../core/config.js';
import { calculateHardware } from './hardware.js';
import { IsometricRenderer } from '../components/renderers/isometricRenderer.js';

const ANCHO = 800;
const ALTO = 1600;
const PROF = 500;
const ESP = 15;
const VANO = 200; // frente 197, lateral de caja 167 (addDrawer: frente − 2·15)
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
      const pieces = buildModule(n);
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
        // pos_z = techo del frente inferior + paso inferior
        assert.ok(Math.abs(tira.pos_z - (inferior.pos_z + inferior.alto + GOLA_DEFAULTS.golaPaso)) <= 0.5,
          `tira ${i + 1}: pos_z ${tira.pos_z} = techo inferior + paso ${inferior.pos_z + inferior.alto + GOLA_DEFAULTS.golaPaso}`);
        // Canal centrado: paso + perfil + paso = borde inferior del frente superior.
        assert.ok(Math.abs(tira.pos_z + tira.alto + GOLA_DEFAULTS.golaPaso - superior.pos_z) <= 0.5,
          `tira ${i + 1}: paso superior ${GOLA_DEFAULTS.golaPaso} bajo el frente superior`);
        assert.equal(tira.alto, GOLA_DEFAULTS.golaPerfilHeight, 'alto de tira = cuerpo del perfil C');
        assert.equal(tira.modulo, '1');
        assert.equal(tira.espesor, 15);
        assert.equal(tira.cantidad, 1);
        // longitud = ancho INTERIOR − 2·holgura (nunca el ancho exterior)
        assert.equal(tira.ancho, INTERIOR - 2 * GOLA_DEFAULTS.golaHolguraLateral);
      });
    });

    it(`N=${n}: coherencia del reparto (Σaᵢ' + (N−1)·G = H_new ±2, monótono, sin solapes, cubre caja)`, () => {
      // Repisa 150 mm sobre la pila: los frentes redistribuidos cubren sus
      // cajas (≥ lateral + 10) y el último frente queda a drawerFrontGap de
      // la repisa (sin canal L).
      const techoUlt = ESP + 10 + n * 197 + (n - 1) * DRAWER_FRONT_GAP;
      const pieces = buildModule(n, { repisaZ: techoUlt + 150 });
      const repisaZ = pieces.find((p) => p.id === 'm1-repisa-1').pos_z;
      const bottom = ESP + 10;
      // Gap entre frentes = paso + perfil + paso (canal centrado).
      const G = GOLA_DEFAULTS.golaPaso + GOLA_DEFAULTS.golaPerfilHeight + GOLA_DEFAULTS.golaPaso;
      const H_new = repisaZ - DRAWER_FRONT_GAP - bottom;

      const r = applyGola(pieces, '1', {});
      assert.ok(r.ok, r.errors?.join('; '));
      const frentes = frentesOrdenados(r.pieces);

      const suma = frentes.reduce((s, f) => s + f.alto, 0) + (n - 1) * G;
      assert.ok(Math.abs(suma - H_new) <= 2, `Σ ${suma} ≈ H_new ${H_new}`);
      for (let i = 1; i < n; i++) {
        assert.ok(frentes[i].pos_z > frentes[i - 1].pos_z, 'pos_z monótono creciente');
      }
      // Sin solapes frente↔tira y cada frente cubre su caja (lateral 167 + 10)
      const tiras = tirasDe(r.pieces);
      for (const f of frentes) {
        assert.ok(f.alto >= 167 + 10, `frente ${f.alto} mm cubre su caja`);
        for (const t of tiras) {
          const solapa = t.pos_z < f.pos_z + f.alto - 0.5 && f.pos_z < t.pos_z + t.alto - 0.5;
          assert.ok(!solapa, `sin solape ${f.id} ↔ ${t.id}`);
        }
      }
      const validacion = validateGola(r.pieces, '1', {});
      assert.deepEqual(validacion.errors, [], 'validateGola sin errores');
    });
  }
});

describe('applyGola — último frente (gap habitual, sin canal L)', () => {
  it('con repisa: el techo del último frente queda a drawerFrontGap bajo la repisa', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const frentes = frentesOrdenados(r.pieces);
    const ultimo = frentes[frentes.length - 1];
    assert.ok(Math.abs(ultimo.pos_z + ultimo.alto - (900 - DRAWER_FRONT_GAP)) <= 1,
      `techo ${ultimo.pos_z + ultimo.alto} = repisa − drawerFrontGap (${900 - DRAWER_FRONT_GAP})`);
    // La caja no cambia: el lateral del cajón sigue en 167 mm.
    const lateral = r.pieces.find((p) => p.id === 'm1cajon3-lateral-izq');
    assert.equal(lateral.alto, 167);
    // Ninguna pieza del canal L: SOLO canales C entre cajones.
    assert.ok(!r.pieces.some((p) => /gola-l\d*-/.test(String(p.id))), 'sin ids gola-l*');
  });

  it('sin repisa: el techo del último frente queda a drawerFrontGap bajo el techo interior del casco', () => {
    const pieces = buildModule(2, { conRepisa: false, alto: 600 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const frentes = frentesOrdenados(r.pieces);
    const ultimo = frentes[frentes.length - 1];
    const techoInterior = 600 - ESP;
    assert.ok(Math.abs(ultimo.pos_z + ultimo.alto - (techoInterior - DRAWER_FRONT_GAP)) <= 1,
      `techo ${ultimo.pos_z + ultimo.alto} = techo interior − drawerFrontGap (${techoInterior - DRAWER_FRONT_GAP})`);
  });

  it('sin cap: cajón único alto, el frente rellena todo el span sin warning de sobrealtura', () => {
    // 1 cajón sin repisa: el frente crece hasta topRef − drawerFrontGap (el
    // golaMaxOverhang del modelo con canal L ya no aplica; no hay extensión
    // especial del último frente).
    const pieces = buildModule(1, { conRepisa: false });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const frente = frentesOrdenados(r.pieces)[0];
    const techoInterior = ALTO - ESP;
    assert.ok(Math.abs(frente.pos_z + frente.alto - (techoInterior - DRAWER_FRONT_GAP)) <= 1,
      'el frente rellena el span hasta el techo interior − drawerFrontGap');
    assert.ok(!r.warnings.some((w) => w.includes('cap') || w.includes('limitó')),
      `sin warning de cap: ${r.warnings.join(' | ')}`);
    assert.equal(tirasDe(r.pieces).length, 0, 'un cajón no lleva tiras');
    assert.equal(isGolaEnabled(r.pieces, '1'), false, 'sin canales, el módulo no queda "con gola"');
  });

  it('aviso cuando los frentes se reducen respecto de su alto original', () => {
    // Repisa baja: los frentes deben achicarse (pero sin perder la caja).
    const pieces = buildModule(3, { repisaZ: 690 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.ok(r.warnings.some((w) => w.includes('reducido')),
      `warning de reducción presente: ${r.warnings.join(' | ')}`);
    const frentes = frentesOrdenados(r.pieces);
    assert.ok(frentes.every((f) => f.alto < 197 && f.alto >= 167 + 10), 'frentes reducidos pero cubriendo caja');
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
    const pieces = buildModule(4, { repisaZ: 1000 });
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
    const pieces = buildModule(4, { repisaZ: 1100 });
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
  it('1 cajón: applyGola ok, 0 canales; el frente rellena el span y isGolaEnabled queda false', () => {
    // Sin canal L, un cajón único no genera ningún canal: applyGola reescala
    // el frente para llenar el span hasta topRef − drawerFrontGap y el
    // módulo NO queda marcado como "con gola" (isGolaEnabled mira las tiras).
    const pieces = buildModule(1, { repisaZ: 330 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(tirasDe(r.pieces).length, 0);
    assert.ok(!r.pieces.some((p) => /gola-l\d*-/.test(String(p.id))), 'sin canal L');
    const frente = frentesOrdenados(r.pieces)[0];
    assert.ok(Math.abs(frente.pos_z + frente.alto - (330 - DRAWER_FRONT_GAP)) <= 1,
      'el frente queda a drawerFrontGap bajo la repisa');
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
    // tira) no queda vano para que los frentes cubran sus cajas. Con la
    // rebaja de caja habilitada este déficit cabría, así que aquí la
    // desactivamos (golaMaxRebajaCaja 0) para probar el error estricto.
    const techoUlt = ESP + 10 + 4 * 197 + 3 * DRAWER_FRONT_GAP;
    const pieces = buildModule(4, { repisaZ: techoUlt + 20 });
    const r = applyGola(pieces, '1', { golaMaxRebajaCaja: 0 });
    assert.equal(r.ok, false);
    assert.ok(r.errors[0].includes('vano'));
  });

  it('vano corto por poco → rebaja la caja (con aviso) y aplica; round-trip restaura', () => {
    // 3 cajones 197/167: span mínimo = Σ pisos (167+10) + 2 canales × 56 +
    // gap superior. Con 13.5 mm menos, el déficit (4.5/cajón) cabe en la
    // rebaja default (40) y la gola aplica rebajando las cajas.
    const G = GOLA_DEFAULTS.golaPaso + GOLA_DEFAULTS.golaPerfilHeight + GOLA_DEFAULTS.golaPaso;
    const spanMin = 3 * (167 + 10) + 2 * G + DRAWER_FRONT_GAP;
    const pieces = buildModule(3, { repisaZ: ESP + 10 + spanMin - 13.5 });
    const latOriginal = pieces.find((p) => p.id === 'm1cajon1-lateral-izq').alto;
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    // Aviso de rebaja y cajas más bajas en la misma medida.
    assert.ok(r.warnings.some((w) => w.includes('caja') && w.includes('rebajó')), 'aviso de rebaja de caja');
    const rebaja = 13.5 / 3; // repartido entre los 3 cajones
    for (const n of [1, 2, 3]) {
      const lat = r.pieces.find((p) => p.id === `m1cajon${n}-lateral-izq`);
      assert.ok(Math.abs(lat.alto - (latOriginal - rebaja)) <= 0.2, `cajón ${n}: caja rebajada ${lat.alto}`);
      const frente = r.pieces.find((p) => p.id === `m1cajon${n}-frente`);
      assert.ok(frente.alto >= lat.alto + 10 - 0.5, `cajón ${n}: frente cubre la caja rebajada`);
    }
    // Round-trip: cajas y frentes restaurados al desactivar.
    const off = removeGola(r.pieces, '1', {}, r.meta);
    assert.ok(off.ok, off.errors?.join('; '));
    assert.equal(off.pieces.find((p) => p.id === 'm1cajon1-lateral-izq').alto, latOriginal, 'caja restaurada');
    assert.equal(off.pieces.find((p) => p.id === 'm1cajon1-frente').alto, 197, 'frente restaurado');
  });

  it('déficit mayor que golaMaxRebajaCaja → sigue fallando con el error de vano', () => {
    // 2 cajones, span 402.5: déficit 7.5 mm → 3.75/cajón. Con el default
    // (40) la rebaja lo absorbe y aplica; con tope 2 mm no cabe y falla con
    // el error de vano y sus consejos.
    const pieces = buildModule(2, { alto: 460, repisaZ: 430 });
    const aplicada = applyGola(pieces, '1', {});
    assert.ok(aplicada.ok, 'déficit 3.75/cajón ≤ 40 → rebaja y aplica');
    const estricta = applyGola(pieces, '1', { golaMaxRebajaCaja: 2 });
    assert.equal(estricta.ok, false, 'déficit 3.75/cajón > 2 → error');
    assert.ok(estricta.errors[0].includes('vano'));
    assert.ok(estricta.errors[0].includes('suba la repisa'), 'consejo de subir la repisa');
  });

  it('golaMaxRebajaCaja=0 desactiva la rebaja (comportamiento estricto)', () => {
    const G = GOLA_DEFAULTS.golaPaso + GOLA_DEFAULTS.golaPerfilHeight + GOLA_DEFAULTS.golaPaso;
    const spanMin = 3 * (167 + 10) + 2 * G + DRAWER_FRONT_GAP;
    const pieces = buildModule(3, { repisaZ: ESP + 10 + spanMin - 13.5 });
    const r = applyGola(pieces, '1', { golaMaxRebajaCaja: 0 });
    assert.equal(r.ok, false, 'sin rebaja permitida → error de vano');
    assert.ok(r.errors[0].includes('vano'));
  });
});

describe('renderer (computeGeometries)', () => {
  it('emite geos role gola_strip retranqueadas detrás del plano de frentes', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1 });
    const { geometries } = renderer.computeGeometries('1', r.pieces);
    const golas = geometries.filter((g) => g.role === 'gola_strip');
    // 3 cajones ⇒ 2 canales C (fondo + 2 pestañas c/u) = 6 geometrías.
    assert.equal(golas.length, 6);

    const tiras = tirasDe(r.pieces); // fondos C
    assert.equal(tiras.length, 2);
    const yFace = PROF - ESP + 15;
    const yBack = yFace - GOLA_DEFAULTS.golaStripSetback;
    const fondosGeos = golas.filter((g) => g.id.endsWith('-fondo'));
    assert.equal(fondosGeos.length, 2, 'N−1 fondos C');
    tiras.forEach((t, i) => {
      const g = fondosGeos.find((fg) => fg.id === t.id);
      assert.ok(g, `geo del ${t.id}`);
      assert.equal(g.w, INTERIOR, 'ancho = interior (holgura 0)');
      assert.equal(g.h, GOLA_DEFAULTS.golaPerfilHeight, 'alto = cuerpo del perfil');
      assert.equal(g.d, 15, 'el fondo es un panel vertical de 15');
      assert.ok(Math.abs(g.z - t.pos_z) <= 0.5);
      assert.ok(Math.abs(g.y - (yBack - 15)) <= 0.5, 'cara frontal del fondo a yBack');
    });
    const pestanas = golas.filter((g) => g.id.includes('-pestana'));
    assert.equal(pestanas.length, 4, '2 sup + 2 inf (una pareja por canal C)');
    pestanas.forEach((g) => {
      assert.equal(g.h, 15, 'pestaña: 15 de alto (tablero)');
      assert.equal(g.d, GOLA_DEFAULTS.golaStripSetback + 15, 'alcance = retranqueo + 15');
      assert.equal(g.y, yBack - 15, 'arranca en la cara posterior del fondo');
      assert.ok(g.y + g.d <= yFace + 0.5, 'a ras del plano de frentes: no sobresale por delante');
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
      // Canal de agarre: el paso superior sobre la tira (por donde entran
      // los dedos); termina en el borde inferior del frente superior.
      assert.ok(Math.abs(g.z - (tiras[i].pos_z + tiras[i].alto)) <= 0.5,
        `grip ${i + 1}: z ${g.z} = techo de la tira`);
      assert.equal(g.h, GOLA_DEFAULTS.golaPaso, 'marca del paso de agarre');
      assert.ok(Math.abs(Number(frentes[i + 1].pos_z) - (g.z + g.h)) <= 0.5,
        `grip ${i + 1}: termina en el borde inferior del frente superior`);
      assert.equal(g.w, INTERIOR, 'ancho = interior');
      assert.equal(g.d, 2, 'marca fina en el plano de frentes');
      assert.equal(g.y, yFace, 'en el plano de frentes (no retranqueada)');
      assert.equal(g.color, '#4ECDC4', 'color de acento del rol');
    });
  });

  it('sin repisa, solo las marcas de paso de los canales C (N−1); nada sobre el último frente', () => {
    const pieces = buildModule(2, { conRepisa: false });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1 });
    const { geometries } = renderer.computeGeometries('1', r.pieces);
    const grips = geometries.filter((g) => g.role === 'gola_grip');
    assert.equal(grips.length, 1, 'una marca por fondo de canal C');
    assert.ok(!grips.some((g) => /gola-l/.test(g.id)), 'sin marca L bajo el techo interior');
    // Sobre el último frente queda el gap de frente habitual (drawerFrontGap)
    // hasta el techo interior: sin marca de agarre.
    const frentes = frentesOrdenados(r.pieces);
    const ultimo = frentes[frentes.length - 1];
    assert.ok(Math.abs(ultimo.pos_z + ultimo.alto + DRAWER_FRONT_GAP - TECHO_INTERIOR) <= 1,
      'gap de frente habitual sobre el último frente');
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
    // 2 canales C (fondo + 2 pestañas = 3 filas c/u).
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
      alturaExteriorMm: 50,
      aberturaUtilMm: 50 - 2 * GOLA_PESTANA_ALTO_MM,
      profundidadEntradaMm: 10,
    });
    assert.equal(ab.aberturaUtilMm, 20);
  });

  it('canal L: abertura útil = golaFingerClearance (20 mm) — API en desuso (nadie la llama con L)', () => {
    const ab = aberturaCanalGola('L', getGolaCfg({}));
    assert.equal(ab.alturaExteriorMm, 50);
    assert.equal(ab.aberturaUtilMm, 20);
    assert.equal(ab.profundidadEntradaMm, 10);
  });

  it('validateGola: warning cuando golaMinAperturaUtil supera la abertura real', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const v = validateGola(r.pieces, '1', { golaMinAperturaUtil: 25 });
    assert.ok(
      v.warnings.some((w) => /abertura útil de agarre del canal C \(20 mm\).*mínimo ergonómico configurado \(25 mm\)/.test(w)),
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
      assert.equal(f.abertura.aberturaUtilMm, 20);
      assert.equal(f.abertura.alturaExteriorMm, 50);
      assert.equal(f.abertura.profundidadEntradaMm, 10);
    }
    assert.ok(rows.filter((x) => !x.id.endsWith('-fondo')).every((x) => x.abertura === null),
      'pestañas sin abertura (resume al canal, va en el fondo)');
    const cFondo = fondos.find((x) => x.id.includes('gola-c'));
    assert.equal(cFondo.abertura.tipo, 'C');
  });
});

describe('applyGola — mix zapateras CON frente + cajones (reparto con piso)', () => {
  const GAP = 56; // 3 + 50 + 3
  // Casco 850×2400×600 + 2 zapateras con frente (vano 220, modo 'normal':
  // bandeja uniforme 100, frente corto fijo = 130) + 2 cajones (vano 200 →
  // frente 197, lateral 167), apilados como app.js y repisa que ancla el
  // topRef. El proporcional puro dejaría los frentes de cajón bajo su caja:
  // el reparto con piso quita aire a los cajones y conserva el fijo de las
  // zapateras — el aire superior del vano de cada zapatera (cara+30 con el
  // calzado asomando) es aire real que el reparto puede usar.
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

  it('span ajustado: zapateras fijas en su altura de tipo, cajones reparten el aire', () => {
    // Con zapateras fijas (2×130) el mínimo es 260+354+3·56 = 818 de span:
    // repisa @1010 → span 982.5: los cajones absorben TODO el aire sobrante.
    const pieces = buildMix(1010);
    const bottom = 25;
    const span = 1010 - DRAWER_FRONT_GAP /* gap habitual sobre el último frente */ - bottom; // 982.5
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    // Zapateras: sin reescalar — conservan el frente corto (bandeja + 30).
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 130, 'zapatera 1 conserva su frente corto');
    assert.equal(alturaFrente(r.pieces, 'm1zapatera2-frente'), 130, 'zapatera 2 conserva su frente corto');
    // Cajones: cada frente ≥ su caja (167+10) y absorben TODO el aire.
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') >= 177, 'cajón 3 cubre su caja (167+10)');
    assert.ok(alturaFrente(r.pieces, 'm1cajon4-frente') >= 177, 'cajón 4 cubre su caja (167+10)');
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') > 197 + 50,
      `el aire (incluido el de los vanos de las zapateras) va a los cajones: ${alturaFrente(r.pieces, 'm1cajon3-frente')}`);
    // Invariante: Σ alturas + (N−1)·G = span.
    const suma = ['m1zapatera1-frente', 'm1zapatera2-frente', 'm1cajon3-frente', 'm1cajon4-frente']
      .reduce((s, id) => s + alturaFrente(r.pieces, id), 0);
    assert.ok(Math.abs(suma + 3 * GAP - span) <= 0.5, `Σ${suma} + 3·56 ≈ span ${span}`);
    // Canales entre TODAS las unidades (zapatera↔zapatera y zapatera↔cajón).
    assert.equal(r.pieces.filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))).length, 3);
  });

  it('span insuficiente con zapateras fijas: rechaza indicando el fijo de las zapateras', () => {
    // Repisa @750 → span 722.5, disponible 554.5 < mínimo 614 (2×130 fijas +
    // 2 pisos de 177): el error debe mencionar que el mínimo incluye las
    // zapateras a altura de tipo. Con la rebaja habilitada este déficit
    // (29.75/cajón ≤ 40) se absorbería, así que aquí se desactiva (tope 0)
    // para ejercitar el error.
    const pieces = buildMix(750);
    const r = applyGola(pieces, '1', { golaMaxRebajaCaja: 0 });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /el vano no alcanza/);
    assert.match(r.errors[0], /zapateras a altura de tipo/);
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
    // Un canal C entre las dos zapateras.
    assert.equal(r.pieces.filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))).length, 1);
    // Y si la pila NO CABE (repisa demasiado baja), rechaza:
    const baja = buildMix(340).filter((p) => !/cajon/.test(String(p.id)));
    const r2 = applyGola(baja, '1', { golaMaxRebajaCaja: 0 });
    assert.equal(r2.ok, false);
    assert.match(r2.errors[0], /el vano no alcanza/);
  });

  it('span insuficiente: sigue rechazando con "el vano no alcanza"', () => {
    // Módulo corto (460) con la repisa justo sobre los cajones: span 402.5,
    // disponible 346.5 < 354 (2 cajones × (167+10)) → rechazo. El déficit
    // (3.75/cajón) lo absorbería la rebaja default, así que se desactiva
    // (tope 0) para ejercitar el error estricto.
    const pieces = buildModule(2, { alto: 460, repisaZ: 430 });
    const r = applyGola(pieces, '1', { golaMaxRebajaCaja: 0 });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /el vano no alcanza/);
    assert.match(r.errors[0], /mínimo 354 mm/);
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
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') >= 177, 'los cajones siguen reescalando');
  });

  it('sin tag: la heurística por nombre sigue marcando la zapatera como fija', () => {
    const pieces = buildMix(1010, { tipoId: null });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 130, 'fija por palabra clave (retrocompatibilidad)');
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') >= 177);
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
    assert.equal(plan.tornillos.posicionYmm, 10, 'retranqueo por defecto');
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
