// js/services/golaService.test.js — Contrato del sistema gola (tiras de
// melamina entre frentes + L-gola en el cajón superior). Replica el apilado
// de app.js (cursor = cara superior de la base + drawerBaseOffset, avance
// alto + drawerFrontGap) y verifica geometría, round-trip, BOM y renderer.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addDrawer, addShelf } from './closetBuilderService.js';
import {
  applyGola,
  removeGola,
  validateGola,
  isGolaEnabled,
  getGolaCfg,
  drawerUnits,
  GOLA_DEFAULTS,
} from './golaService.js';
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
  pieces.filter((p) => /^m1-gola-\d+$/.test(String(p.id))).sort((a, b) => a.pos_z - b.pos_z);

const tiradoresDe = (pieces) =>
  pieces.filter((p) => String(p.id).startsWith('m1') && p.id.endsWith('-tirador'));

describe('getGolaCfg', () => {
  it('mergea defaults PROVISIONALES con overrides numéricos y string', () => {
    const cfg = getGolaCfg({});
    assert.equal(cfg.golaPerfilHeight, 30);
    assert.equal(cfg.golaFingerClearance, 20);
    assert.equal(cfg.golaMaxOverhang, 120);
    assert.ok(cfg.golaFijacion.includes('PROVISIONAL'));
    const custom = getGolaCfg({ golaPerfilHeight: 40, golaFijacion: '  Cola + tarugos ' });
    assert.equal(custom.golaPerfilHeight, 40);
    assert.equal(custom.golaFijacion, 'Cola + tarugos');
    assert.equal(getGolaCfg({ golaPerfilHeight: -5 }).golaPerfilHeight, 30, 'negativos caen a default');
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
        assert.equal(tira.id, `m1-gola-${i + 1}`);
        const inferior = frentes[i]; // unidad i (más abajo)
        const superior = frentes[i + 1];
        // pos_z = techo del frente inferior
        assert.ok(Math.abs(tira.pos_z - (inferior.pos_z + inferior.alto)) <= 0.5,
          `tira ${i + 1}: pos_z ${tira.pos_z} = techo inferior ${inferior.pos_z + inferior.alto}`);
        // agarre: techo tira + clearance = borde inferior del frente superior
        assert.ok(Math.abs(tira.pos_z + tira.alto + GOLA_DEFAULTS.golaFingerClearance - superior.pos_z) <= 0.5,
          `tira ${i + 1}: agarre ${GOLA_DEFAULTS.golaFingerClearance} mm bajo el frente superior`);
        assert.equal(tira.alto, 30, 'alto de tira = golaPerfilHeight');
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
      const G = GOLA_DEFAULTS.golaPerfilHeight + GOLA_DEFAULTS.golaFingerClearance;
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
    const pieces = buildModule(3, { repisaZ: 700 });
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
    const perfiles = h.find((x) => x.nombre === 'Perfil gola melamina');
    assert.ok(perfiles, 'ítem Perfil gola melamina');
    assert.equal(perfiles.cantidad, 3, 'N−1 perfiles');
    assert.ok(perfiles.especificacion.includes(`corte ${INTERIOR - 4} mm c/u`), 'corte por largo');
    assert.ok(perfiles.especificacion.includes(GOLA_DEFAULTS.golaFijacion), 'fijación en la especificación');
    assert.equal(perfiles.prioridad, 'Media');
    assert.equal(perfiles.bloqueante, false);

    const tornillos = h.find((x) => x.nombre === 'Tornillo fijación gola');
    assert.ok(tornillos);
    assert.equal(tornillos.cantidad, 3 * 2, '(N−1)·golaTornillosPorPerfil');

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
    assert.equal(h.find((x) => x.nombre === 'Tornillo fijación gola').cantidad, 2 * 4);
    assert.ok(h.find((x) => x.nombre === 'Perfil gola melamina').especificacion.includes('Cola blanca + tarugos'));
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
    // Repisa apenas 40 mm sobre la pila: tras los gaps gola no queda vano
    // para que los frentes cubran sus cajas.
    const techoUlt = ESP + 10 + 4 * 197 + 3 * DRAWER_FRONT_GAP;
    const pieces = buildModule(4, { repisaZ: techoUlt + 40 });
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
    assert.equal(golas.length, 2);

    const tiras = tirasDe(r.pieces);
    golas.forEach((g, i) => {
      assert.equal(g.id, tiras[i].id);
      assert.equal(g.w, INTERIOR - 4);
      assert.equal(g.h, 30);
      assert.equal(g.d, GOLA_DEFAULTS.golaStripDepth);
      assert.ok(Math.abs(g.z - tiras[i].pos_z) <= 0.5);
      // y = yFace − setback; yFace = moduleD − thickness + drawerGap (15).
      const yFace = PROF - ESP + 15;
      assert.ok(Math.abs(g.y - (yFace - GOLA_DEFAULTS.golaStripSetback)) <= 0.5,
        `y ${g.y} = yFace − setback`);
      // centrada en el módulo
      const moduleW = ANCHO;
      assert.ok(Math.abs(g.x - (moduleW - g.w) / 2) <= 0.5);
    });
  });
});
