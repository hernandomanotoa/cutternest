// js/services/golaService.test.js — Contrato del sistema gola (tiras de
// melamina entre frentes + L-gola en el cajón superior). Replica el apilado
// de app.js (cursor = cara superior de la base + drawerBaseOffset, avance
// alto + drawerFrontGap) y verifica geometría, round-trip, BOM y renderer.

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
  GOLA_DEFAULTS,
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
const fondoL = (pieces) => pieces.find((p) => /gola-l\d+-fondo$/.test(String(p.id)));

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
    assert.equal(cfg.golaStripDepth, GOLA_DEFAULTS.golaStripDepth, 'y si nadie la toca, el default');
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
      // Repisa 150 mm sobre la pila: la L del último frente queda por debajo
      // del cap de sobrealtura y los frentes redistribuidos cubren sus cajas
      // (≥ lateral + 10).
      const techoUlt = ESP + 10 + n * 197 + (n - 1) * DRAWER_FRONT_GAP;
      const pieces = buildModule(n, { repisaZ: techoUlt + 150 });
      const repisaZ = pieces.find((p) => p.id === 'm1-repisa-1').pos_z;
      const bottom = ESP + 10;
      // Gap entre frentes = paso + perfil + paso (canal centrado).
      const G = GOLA_DEFAULTS.golaPaso + GOLA_DEFAULTS.golaPerfilHeight + GOLA_DEFAULTS.golaPaso;
      const H_new = repisaZ - GOLA_DEFAULTS.golaFingerClearance - bottom;

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

describe('applyGola — L-gola (cajón superior extendido)', () => {
  it('con repisa: el techo del último frente queda a "clearance" bajo la repisa', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const frentes = frentesOrdenados(r.pieces);
    const ultimo = frentes[frentes.length - 1];
    assert.ok(Math.abs(ultimo.pos_z + ultimo.alto - (900 - GOLA_DEFAULTS.golaFingerClearance)) <= 1,
      `techo ${ultimo.pos_z + ultimo.alto} = repisa − clearance (${900 - 20})`);
    // La caja no cambia: el lateral del cajón sigue en 167 mm.
    const lateral = r.pieces.find((p) => p.id === 'm1cajon3-lateral-izq');
    assert.equal(lateral.alto, 167);
  });

  it('sin repisa: el techo del último frente queda a "clearance" bajo el techo interior del casco', () => {
    // Módulo bajo (600 mm): la extensión L queda por debajo del cap.
    const pieces = buildModule(2, { conRepisa: false, alto: 600 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const frentes = frentesOrdenados(r.pieces);
    const ultimo = frentes[frentes.length - 1];
    const techoInterior = 600 - ESP;
    assert.ok(Math.abs(ultimo.pos_z + ultimo.alto - (techoInterior - GOLA_DEFAULTS.golaFingerClearance)) <= 1,
      `techo ${ultimo.pos_z + ultimo.alto} = techo interior − clearance (${techoInterior - 20})`);
  });

  it('warning y cap cuando la repisa queda más arriba que golaMaxOverhang', () => {
    // 1 cajón sin repisa: el frente tendría que extenderse >120 mm sobre su
    // caja → se capa a lateral(167) + 120 y se avisa.
    const pieces = buildModule(1, { conRepisa: false });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.ok(r.warnings.some((w) => w.includes('cap') || w.includes('limitó')),
      `warning de cap presente: ${r.warnings.join(' | ')}`);
    const frente = frentesOrdenados(r.pieces)[0];
    assert.equal(frente.alto, 167 + GOLA_DEFAULTS.golaMaxOverhang);
    assert.equal(tirasDe(r.pieces).length, 0, 'un cajón no lleva tiras');
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
  it('se eliminan al activar y se regeneran (2×20, esp 5) al desactivar', () => {
    const pieces = buildModule(3);
    assert.equal(tiradoresDe(pieces).length, 3, '3 tiradores originales');

    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(tiradoresDe(r.pieces).length, 0, 'gola sin tiradores');

    const off = removeGola(r.pieces, '1', {}, r.meta);
    assert.ok(off.ok, off.errors?.join('; '));
    const tiradores = tiradoresDe(off.pieces);
    assert.equal(tiradores.length, 3, 'tiradores regenerados');
    const t1 = tiradores.find((p) => p.id === 'm1cajon1-tirador');
    assert.equal(t1.ancho, 2);
    assert.equal(t1.alto, 20);
    assert.equal(t1.espesor, 5);
    assert.equal(t1.nombre, 'Tirador cajon 1 M1');
    assert.equal(t1.modulo, '11');
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
    assert.equal(tiradoresDe(off.pieces).length, 3, 'tiradores presentes');
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
  it('lista perfiles gola agrupados por largo y tornillos (N−1)·2', () => {
    const pieces = buildModule(4, { repisaZ: 1100 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const h = calculateHardware(r.pieces, [], {});
    // Los canales son PIEZAS de melamina (van en la lista de corte, no en
    // el BOM); el BOM solo trae la fijación.
    assert.equal(h.some((x) => x.nombre.includes('Perfil gola')), false, 'sin perfiles en el BOM');
    const tornillos = h.find((x) => x.nombre === 'Tornillo fijación gola');
    assert.ok(tornillos);
    // Fondos de canal: (N−1) C + 1 L = N fondos.
    assert.equal(tornillos.cantidad, 4 * 2, 'N fondos × golaTornillosPorPerfil');
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
    // 3 cajones ⇒ 3 fondos de canal (2 C + 1 L) × 4 tornillos.
    assert.equal(h.find((x) => x.nombre === 'Tornillo fijación gola').cantidad, 3 * 4);
    assert.ok(h.find((x) => x.nombre === 'Tornillo fijación gola').especificacion.includes('Cola blanca + tarugos'));
  });
});

describe('validateGola — interferencia tira↔caja en profundidad (eje Y)', () => {
  it('caso normal (tira 60 mm retranqueada 10 mm en módulo de 500 mm de fondo): sin errores nuevos', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const v = validateGola(r.pieces, '1', {});
    assert.deepEqual(v.errors, [], 'sin errores de interferencia en Y');
  });

  it('tira que sobresale por detrás de las cajas (golaStripDepth 480 en fondo 500) → error', () => {
    // yTira = 500 − 15 + 15 − 10 = 490; trasero = 490 − 480 = 10 < espesor 15.
    const pieces = buildModule(2, { repisaZ: 700 });
    const r = applyGola(pieces, '1', { golaStripDepth: 480 });
    assert.equal(r.ok, false);
    assert.ok(
      r.errors.some((e) => e.includes('detrás') || e.includes('profundidad')),
      `error de interferencia presente: ${r.errors?.join('; ')}`,
    );
  });

  it('retranqueo excesivo (golaStripSetback > fondo del módulo) → error', () => {
    // yTira = 500 − 15 + 15 − 600 = −100 < espesor 15: la tira quedaría
    // detrás del plano interior del fondo.
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
  it('1 cajón: ok, 0 tiras y L-gola aplicada', () => {
    // Repisa lo bastante cerca para que la extensión L no choque con el cap.
    const pieces = buildModule(1, { repisaZ: 330 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(tirasDe(r.pieces).length, 0);
    const frente = frentesOrdenados(r.pieces)[0];
    assert.ok(Math.abs(frente.pos_z + frente.alto - (330 - 20)) <= 1, 'L bajo la repisa');
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
    // tira) no queda vano para que los frentes cubran sus cajas.
    const techoUlt = ESP + 10 + 4 * 197 + 3 * DRAWER_FRONT_GAP;
    const pieces = buildModule(4, { repisaZ: techoUlt + 20 });
    const r = applyGola(pieces, '1', {});
    assert.equal(r.ok, false);
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
    // 3 cajones ⇒ 2 canales C (fondo + 2 pestañas) + 1 canal L (fondo + 1)
    // = 8 geometrías.
    assert.equal(golas.length, 8);

    const tiras = tirasDe(r.pieces); // fondos C
    const yFace = PROF - ESP + 15;
    const yBack = yFace - GOLA_DEFAULTS.golaStripSetback;
    const fondosGeos = golas.filter((g) => g.id.endsWith('-fondo'));
    assert.equal(fondosGeos.length, 3, '2 fondos C + 1 fondo L');
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
    assert.equal(pestanas.length, 5, '2 sup + 2 inf en C + 1 inf en L');
    pestanas.forEach((g) => {
      assert.equal(g.h, 15, 'pestaña: 15 de alto (tablero)');
      assert.equal(g.d, GOLA_DEFAULTS.golaStripDepth, 'alcance de la pestaña');
      assert.equal(g.y, yBack - 15, 'sale del fondo hacia el frente');
    });
  });

  it('emite marcas gola_grip del canal de agarre (N−1 por tira + 1 bajo el frente L)', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1 });
    const { geometries } = renderer.computeGeometries('1', r.pieces);
    const grips = geometries.filter((g) => g.role === 'gola_grip');
    // 2 marcas de paso (fondos C) + 1 marca del paso L + 1 agarre clásico
    // (techo del último frente → repisa).
    assert.equal(grips.length, 4, '3 marcas de paso (fondos) + 1 agarre L clásico');

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

    const lGrip = grips.find((g) => g.id === 'm1-gola-l-grip');
    assert.ok(lGrip, 'existe la marca del agarre L (techo del último frente → repisa)');
    const ultimo = frentes[frentes.length - 1];
    assert.ok(Math.abs(lGrip.z - (ultimo.pos_z + ultimo.alto)) <= 0.5,
      'z = techo del último frente');
    assert.equal(lGrip.h, GOLA_DEFAULTS.golaFingerClearance, 'gap bajo la repisa = agarre');
    assert.equal(lGrip.w, INTERIOR);
  });

  it('sin repisa, la marca L se coloca bajo el techo interior del casco', () => {
    const pieces = buildModule(2, { conRepisa: false });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1 });
    const { geometries } = renderer.computeGeometries('1', r.pieces);
    const grips = geometries.filter((g) => g.role === 'gola_grip');
    // 1 marca de paso (fondo C) + 1 marca de paso L + 1 agarre clásico.
    assert.equal(grips.length, 3);
    const lGrip = grips.find((g) => g.id === 'm1-gola-l-grip');
    assert.ok(lGrip);
    // techo interior = ALTO − ESP (sin repisa): la L no está capeada (vano alto).
    assert.ok(Math.abs(lGrip.z + lGrip.h - TECHO_INTERIOR) <= 1,
      `agarre L termina en el techo interior (${lGrip.z} + ${lGrip.h} ≈ ${TECHO_INTERIOR})`);
  });
});

describe('golaReport — sección del manual', () => {
  it('módulo de 1 solo cajón: el canal L propio lo incluye sin golaLFrontIds', () => {
    // applyGola siempre emite el canal L (m{mod}gola-l1-fondo/pestana), así
    // que el reporte cubre el módulo aunque no tenga canales C (0 gaps).
    const pieces = buildModule(1, { repisaZ: 500 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));

    const rows = golaReport(r.pieces, {});
    const ids = rows.map((x) => x.id);
    assert.ok(ids.includes('m1gola-l1-fondo'), 'fondo del canal L reportado');
    assert.ok(ids.includes('m1gola-l1-pestana'), 'pestaña del canal L reportada');
    assert.equal(ids.filter((id) => id.includes('gola-c')).length, 0, 'sin canales C');
    for (const row of rows) {
      assert.match(row.ubicacion, /Canal L \(bajo la repisa\)/);
      assert.equal(row.corteMm, INTERIOR - 2 * GOLA_DEFAULTS.golaHolguraLateral);
      assert.equal(row.cantidad, 1);
      assert.ok(row.material.length > 0, 'material/acabado presente');
    }
    assert.equal(rows.find((x) => x.id.endsWith('-fondo')).fijacion, GOLA_DEFAULTS.golaFijacion);
  });

  it('módulo con N cajones: filas de cada canal C y del canal L', () => {
    const pieces = buildModule(3, { repisaZ: 900 });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const rows = golaReport(r.pieces, {});
    // 2 canales C (fondo + 2 pestañas = 3 filas c/u) + 1 canal L (2 filas).
    assert.equal(rows.filter((x) => x.id.includes('gola-c')).length, 2 * 3);
    assert.equal(rows.filter((x) => x.id.includes('gola-l')).length, 2);
    assert.ok(rows.some((x) => /Canal C 1 \(entre cajones\)/.test(x.ubicacion)));
    // Sin piezas gola no hay sección.
    assert.deepEqual(golaReport(pieces, {}), []);
  });
});

describe('applyGola — mix zapateras CON frente + cajones (reparto con piso)', () => {
  const GAP = 56; // 3 + 50 + 3
  // Casco 850×2400×600 + 2 zapateras con frente (vano 220 → frente 217,
  // lateral 100) + 2 cajones (vano 200 → frente 197, lateral 167), apilados
  // como app.js y repisa que ancla el topRef. El proporcional puro dejaría
  // los frentes de cajón (~156) bajo su caja (177): el reparto con piso debe
  // quitarle aire a las zapateras (holgura 107) y dárselo a los cajones.
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
    // Con zapateras fijas (2×217) hacen falta 434+354+3·56 = 956 de span:
    // repisa @1010 → span 965 (margen de 9 mm para los cajones).
    const pieces = buildMix(1010);
    const bottom = 25;
    const span = 1010 - 20 /* finger clearance */ - bottom; // 965
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    // Zapateras: sin reescalar — conservan la altura por defecto del tipo.
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 217, 'zapatera 1 conserva su tipo');
    assert.equal(alturaFrente(r.pieces, 'm1zapatera2-frente'), 217, 'zapatera 2 conserva su tipo');
    // Cajones: cada frente ≥ su caja (167+10) y absorben TODO el aire.
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') >= 177, 'cajón 3 cubre su caja (167+10)');
    assert.ok(alturaFrente(r.pieces, 'm1cajon4-frente') >= 177, 'cajón 4 cubre su caja (167+10)');
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') > 197 - 30,
      `el aire va a los cajones, no a las zapateras: ${alturaFrente(r.pieces, 'm1cajon3-frente')}`);
    // Invariante: Σ alturas + (N−1)·G = span.
    const suma = ['m1zapatera1-frente', 'm1zapatera2-frente', 'm1cajon3-frente', 'm1cajon4-frente']
      .reduce((s, id) => s + alturaFrente(r.pieces, id), 0);
    assert.ok(Math.abs(suma + 3 * GAP - span) <= 0.5, `Σ${suma} + 3·56 ≈ span ${span}`);
    // Canales entre TODAS las unidades (zapatera↔zapatera y zapatera↔cajón).
    assert.equal(r.pieces.filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id))).length, 3);
  });

  it('span insuficiente con zapateras fijas: rechaza indicando el fijo de las zapateras', () => {
    // Repisa @950 → span 905 < 956 necesarios: el error debe mencionar que
    // el mínimo incluye las zapateras a altura de tipo.
    const pieces = buildMix(950);
    const r = applyGola(pieces, '1', {});
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /el vano no alcanza/);
    assert.match(r.errors[0], /zapateras a altura de tipo/);
  });

  it('solo zapateras: la pila fija debe cuadrar el span', () => {
    const pieces = buildMix(1010).filter((p) => !/cajon/.test(String(p.id)));
    const r = applyGola(pieces, '1', {});
    // 2 zapateras fijas: 2·217 + 56 = 490 ≠ span 965 → error con el target.
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /conservan la altura de su tipo/);
    assert.match(r.errors[0], /ajuste la repisa/i);
  });

  it('span insuficiente: sigue rechazando con "el vano no alcanza"', () => {
    // Módulo corto (460) con la repisa justo sobre los cajones: span 385,
    // disponible 329 < 354 (2 cajones × (167+10)) → rechazo.
    const pieces = buildModule(2, { alto: 460, repisaZ: 430 });
    const r = applyGola(pieces, '1', {});
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
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 217, 'fija por contrato [tacones]');
    assert.equal(alturaFrente(r.pieces, 'm1zapatera2-frente'), 217);
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') >= 177, 'los cajones siguen reescalando');
  });

  it('sin tag: la heurística por nombre sigue marcando la zapatera como fija', () => {
    const pieces = buildMix(1010, { tipoId: null });
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(alturaFrente(r.pieces, 'm1zapatera1-frente'), 217, 'fija por palabra clave (retrocompatibilidad)');
    assert.ok(alturaFrente(r.pieces, 'm1cajon3-frente') >= 177);
  });
});
