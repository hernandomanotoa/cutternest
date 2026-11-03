// js/components/renderers/isometric/golaGeometry.test.js — Test de propiedades
// de buildGolaGeometries(): para cualquier pila de N cajones (2..5) y config
// gola, cada canal genera fondo + pestañas + marca de agarre con medidas
// coherentes: fondo alto = perfil y retranqueado golaStripSetback detrás de
// la cara posterior de los frentes, pestañas (labios) alto = espesor de
// tablero (15) y alcance = retranqueo + 15 (a ras de esa cara, sin tocar el
// frente), pos_z ancladas al fondo, y el gap entre frentes consecutivos =
// paso + perfil + paso.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildGolaGeometries } from './golaGeometry.js';
import { createModule, addDrawer, addShelf } from '../../../services/closetBuilderService.js';
import { applyGola, GOLA_DEFAULTS, GOLA_LABIO_MM } from '../../../services/golaService.js';
import { ROLE_COLORS } from '../../../core/config.js';

const ANCHO = 800;
const ALTO = 1600;
const PROF = 500;
const ESP = 15;
const VANO = 200;
const DRAWER_FRONT_GAP = 2.5;

// Casco + N cajones apilados (mismo apilado que golaService.test.js).
function buildModule(n) {
  const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
  assert.ok(casco.ok);
  const pieces = [...casco.pieces];
  let cursor = ESP + 10;
  let ultimoTecho = 0;
  for (let i = 1; i <= n; i += 1) {
    const d = addDrawer('1', i, { anchoModulo: ANCHO, profundidadModulo: PROF, altoVano: VANO });
    assert.ok(d.ok);
    const frente = d.pieces.find((p) => p.id.endsWith('-frente'));
    frente.pos_z = cursor;
    cursor += frente.alto + DRAWER_FRONT_GAP;
    ultimoTecho = frente.pos_z + frente.alto;
    pieces.push(...d.pieces);
  }
  const s = addShelf('1', { anchoUtil: ANCHO - 2 * ESP, profReal: PROF - 2 * ESP, index: 1 });
  assert.ok(s.ok);
  // Repisa que deja ~150 mm de aire sobre la pila CON gola (frentes 227,
  // gap visible = paso): ultimoTecho usa gaps 2.5 y frentes 197.
  s.pieces[0].pos_z = ESP + 10 + n * (197 + 30) + (n - 1) * GOLA_DEFAULTS.golaEntradaMm + DRAWER_FRONT_GAP + 150;
  pieces.push(...s.pieces);
  return pieces;
}

const rendererStub = { drawerGap: 15, verticalPositionOverrides: {} };
const moduleBox = { moduleW: ANCHO, moduleD: PROF, moduleH: ALTO, thickness: ESP };

const ESP_FRENTE = 15; // espesor de los frentes de los cajones de prueba
const yFaceEsperada = (cfg) => PROF - ESP + 15;
// La cara posterior del frente está a yFace − espesorFrente: el canal vive
// detrás de ella (entre las caras de los cajones).
const yCaraEsperada = (cfg) => yFaceEsperada(cfg) - ESP_FRENTE;
const yBackEsperada = (cfg) => yCaraEsperada(cfg) - cfg.golaStripSetback;

// Configs sobre las que se barre la propiedad: default + overrides de taller.
const CONFIGS = [
  { nombre: 'defaults', overrides: {} },
  {
    nombre: 'perfil 40 / setback 15 / paso 4',
    overrides: { golaPerfilHeight: 40, golaStripSetback: 15, golaPaso: 4 },
  },
];

describe('buildGolaGeometries — propiedades del canal (fondo + pestañas + agarre)', () => {
  for (const cfgOverrides of CONFIGS) {
    for (let n = 2; n <= 5; n += 1) {
      it(`${cfgOverrides.nombre}, N=${n}: cada canal es coherente y el gap frente↔frente = 2·paso + perfil`, () => {
        const pieces = buildModule(n);
        const r = applyGola(pieces, '1', cfgOverrides.overrides);
        assert.ok(r.ok, r.errors?.join('; '));
        const cfg = {
          golaPerfilHeight: cfgOverrides.overrides.golaPerfilHeight ?? GOLA_DEFAULTS.golaPerfilHeight,
          golaPaso: cfgOverrides.overrides.golaPaso ?? GOLA_DEFAULTS.golaPaso,
          golaStripSetback: cfgOverrides.overrides.golaStripSetback ?? GOLA_DEFAULTS.golaStripSetback,
        };

        const geos = buildGolaGeometries('1', r.pieces, moduleBox, rendererStub, cfgOverrides.overrides);
        const fondos = geos.filter((g) => g.role === 'gola_strip' && g.id.endsWith('-fondo'));
        const frentes = r.pieces
          .filter((p) => p.id.endsWith('-frente'))
          .sort((a, b) => a.pos_z - b.pos_z);
        const tiras = r.pieces
          .filter((p) => /^m1gola-c\d+-fondo$/.test(String(p.id)))
          .sort((a, b) => a.pos_z - b.pos_z);

        // SOLO canales C: N−1 fondos (el canal L se eliminó).
        assert.equal(fondos.length, n - 1, `N=${n} → ${n - 1} canales C`);
        assert.equal(tiras.length, n - 1);

        const stripW = ANCHO - 2 * ESP;
        const xCentrado = (ANCHO - stripW) / 2;

        // ── Propiedad: la gola TAPA el espacio: gap visible = la entrada de
        // dedos; las alas viven tras los frentes, casi topando las caras.
        const entrada = GOLA_DEFAULTS.golaEntradaMm;
        for (let i = 0; i < n - 1; i += 1) {
          const inferior = frentes[i];
          const superior = frentes[i + 1];
          const techoInf = inferior.pos_z + inferior.alto;
          const gap = superior.pos_z - techoInf;
          assert.ok(Math.abs(gap - entrada) <= 0.5,
            `gap visible frente ${i + 1}↔${i + 2} = ${gap} ≈ entrada de dedos ${entrada}`);
          const alaInf = r.pieces.find((p) => p.id === `m1gola-c${i + 1}-ala-inf`);
          const alaSup = r.pieces.find((p) => p.id === `m1gola-c${i + 1}-ala-sup`);
          assert.ok(Math.abs(alaInf.pos_z - (techoInf - GOLA_LABIO_MM + cfg.golaPaso)) <= 0.5,
            `ala inf ${i + 1}: tras el frente inferior, casi topando su cara`);
          assert.ok(Math.abs(alaSup.pos_z + 15 - (superior.pos_z + GOLA_LABIO_MM - cfg.golaPaso)) <= 0.5,
            `ala sup ${i + 1}: tras el frente superior, casi topando su cara`);
          // El fondo conecta las alas (C cerrada, detrás de todo).
          assert.ok(Math.abs(tiras[i].pos_z - alaInf.pos_z) <= 0.5, 'fondo arranca con el ala inf');
          assert.ok(Math.abs(tiras[i].pos_z + tiras[i].alto - (alaSup.pos_z + 15)) <= 0.5, 'fondo termina con el ala sup');
        }

        // ── Propiedad: por cada fondo, fondo + pestañas + grip coherentes.
        for (const f of fondos) {
          const piezaFondo = r.pieces.find((p) => p.id === f.id);
          assert.ok(piezaFondo, `existe la pieza ${f.id}`);
          const pref = f.id.slice(0, -'-fondo'.length);
          const yBack = yBackEsperada(cfg);
          const yCara = yCaraEsperada(cfg);

          // Fondo: panel vertical interno, alto = 2·labio (la zona que tapa).
          assert.equal(f.h, GOLA_DEFAULTS.golaEntradaMm + 2 * GOLA_LABIO_MM - 2 * cfg.golaPaso, `${f.id}: alto = entrada + 2·labio − 2·paso`);
          assert.equal(f.d, ESP, `${f.id}: fondo es panel de ${ESP} de fondo`);
          assert.ok(Math.abs(f.z - piezaFondo.pos_z) <= 0.5, `${f.id}: z anclado al pos_z de la pieza`);
          assert.ok(Math.abs(f.y - (yBack - ESP)) <= 0.5, `${f.id}: cara frontal a yBack − ${ESP}`);
          assert.equal(f.w, stripW);
          assert.equal(f.x, xCentrado, 'canal centrado en el vano');
          assert.equal(f.color, piezaFondo.color || ROLE_COLORS.gola_strip,
            'color = color de la pieza (fallback al del rol)');

          // Largo del ala: retranqueo + espesor del fondo (traslape) − 2 mm.
          const LARGO_ALA = cfg.golaStripSetback + ESP - 2;
          // Ala superior (horizontal): del fondo (traslapándolo: la C cerrada,
          // fondo entre las alas) hasta 2 mm antes de la espalda del frente.
          const alaSup = geos.find((g) => g.id === `${pref}-ala-sup`);
          if (alaSup) {
            assert.equal(alaSup.h, ESP, 'ala sup: alto = espesor de tablero');
            assert.equal(alaSup.d, LARGO_ALA, 'ala sup: largo = retranqueo + fondo (traslape) − 2 mm');
            assert.ok(Math.abs(alaSup.z - (f.z + f.h - ESP)) <= 0.5, 'ala sup: z = techo del fondo − tablero');
            assert.ok(Math.abs(alaSup.y - (yCara - cfg.golaStripSetback - ESP)) <= 0.5,
              'ala sup: arranca en la cara posterior del fondo (C cerrada)');
            assert.ok(Math.abs(alaSup.y + alaSup.d - (yCara - 2)) <= 0.5, 'ala sup: termina 2 mm antes de la espalda del frente');
            assert.equal(alaSup.w, stripW);
          }

          // Ala inferior (horizontal): en la base del fondo; mismo alcance.
          const alaInf = geos.find((g) => g.id === `${pref}-ala-inf`);
          if (alaInf) {
            assert.equal(alaInf.h, ESP, 'ala inf: alto = espesor de tablero');
            assert.equal(alaInf.d, LARGO_ALA, 'ala inf: largo = retranqueo + fondo (traslape) − 2 mm');
            assert.ok(Math.abs(alaInf.z - f.z) <= 0.5, 'ala inf: z = base del fondo');
            assert.ok(Math.abs(alaInf.y - (yCara - cfg.golaStripSetback - ESP)) <= 0.5,
              'ala inf: arranca en la cara posterior del fondo (C cerrada)');
            assert.ok(Math.abs(alaInf.y + alaInf.d - (yCara - 2)) <= 0.5, 'ala inf: termina 2 mm antes de la espalda del frente');
            assert.equal(alaInf.w, stripW);
          }
          // Canal C: 3 piezas (fondo + 2 alas), sin pestañas.
          if (/gola-c\d+-fondo$/.test(f.id)) {
            assert.ok(alaSup && alaInf, `${f.id}: canal C con ala sup e inf`);
            assert.ok(!geos.some((g) => g.id.includes('-pestana-')), 'sin pestañas: C de 3 piezas');
          } else {
            assert.fail(`${f.id}: no debe haber fondos que no sean de canal C`);
          }

          // Marca del agarre: paso superior sobre la tira, a ras de la espalda del frente.
          const grip = geos.find((g) => g.id === `${f.id}-grip`);
          assert.ok(grip, `${f.id}: existe la marca de agarre`);
          assert.equal(grip.role, 'gola_grip');
          assert.equal(grip.color, ROLE_COLORS.gola_grip);
          assert.equal(grip.h, cfg.golaPaso, 'grip: alto = paso de agarre');
          assert.equal(grip.d, 2, 'grip: caja fina de 2 mm');
          // La marca es el PASO entre frentes: empieza en el techo del
          // frente inferior (≈ fondo.z + labio − paso).
          assert.ok(Math.abs(grip.z - (f.z + GOLA_LABIO_MM - cfg.golaPaso)) <= 0.5, 'grip: empieza en el techo del frente inferior (el paso)');
          assert.ok(Math.abs(grip.y - (yCaraEsperada(cfg) - 2)) <= 0.5, 'grip: a ras de la espalda del frente');
          assert.equal(grip.w, stripW);
        }

        // ── Propiedad: sobre el último frente NO hay marca de agarre (el
        // canal L se eliminó; queda el gap de frente habitual).
        assert.ok(!geos.some((g) => /gola-l/.test(g.id)), 'sin geometrías del canal L');
      });
    }
  }

  it('sin tiras del módulo → []', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    assert.deepEqual(buildGolaGeometries('1', casco.pieces, moduleBox, rendererStub, {}), []);
    assert.deepEqual(buildGolaGeometries('1', [], moduleBox, rendererStub, {}), []);
  });

  for (const cfgOverrides of CONFIGS) {
    it(`invariante ${cfgOverrides.nombre}: ninguna tira sobresale del plano de frentes y el fondo queda retranqueado`, () => {
      const pieces = buildModule(4);
      const r = applyGola(pieces, '1', cfgOverrides.overrides);
      assert.ok(r.ok, r.errors?.join('; '));
      const setback = cfgOverrides.overrides.golaStripSetback ?? GOLA_DEFAULTS.golaStripSetback;
      const geos = buildGolaGeometries('1', r.pieces, moduleBox, rendererStub, cfgOverrides.overrides);
      const yCara = yCaraEsperada();
      for (const g of geos.filter((x) => x.role === 'gola_strip')) {
        assert.ok(g.y + g.d <= yCara + 0.5,
          `${g.id}: cara frontal ${g.y + g.d} ≤ cara posterior del frente ${yCara} (nada toca el frente)`);
      }
      for (const f of geos.filter((x) => x.id.endsWith('-fondo'))) {
        assert.ok(Math.abs((f.y + f.d) - (yCara - setback)) <= 0.5,
          `${f.id}: cara frontal del fondo a ${setback} mm detrás de la espalda del frente (interno)`);
      }
    });
  }

  it('respeta el drawerGap del renderer para el plano de frentes', () => {
    const pieces = buildModule(2);
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const renderer = { drawerGap: 20, verticalPositionOverrides: {} };
    const geos = buildGolaGeometries('1', r.pieces, moduleBox, renderer, {});
    const grip = geos.find((g) => g.id.endsWith('-fondo-grip'));
    const yFace = PROF - ESP + 20;
    const yCara = yFace - ESP_FRENTE;
    assert.ok(Math.abs(grip.y - (yCara - 2)) <= 0.5, 'marca a ras de la cara posterior (drawerGap 20)');
    const fondo = geos.find((g) => g.id.endsWith('-fondo'));
    assert.ok(Math.abs(fondo.y - (yCara - GOLA_DEFAULTS.golaStripSetback - ESP)) <= 0.5);
  });

  it("con drawerGap 'interno' la gola se retranquea un espesor detrás del plano de frentes", () => {
    const pieces = buildModule(2);
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const renderer = { drawerGap: 'interno', verticalPositionOverrides: {} };
    const geos = buildGolaGeometries('1', r.pieces, moduleBox, renderer, {});
    // yFace = PROF − 2·ESP: frente retranqueado un espesor (interno entre
    // laterales); el canal y la marca del agarre van detrás de su plano.
    const yCara = PROF - 2 * ESP - ESP_FRENTE;
    const grip = geos.find((g) => g.id.endsWith('-fondo-grip'));
    assert.ok(Math.abs(grip.y - (yCara - 2)) <= 0.5, 'marca del agarre detrás del frente interno');
    const fondo = geos.find((g) => g.id.endsWith('-fondo'));
    assert.ok(Math.abs(fondo.y - (yCara - GOLA_DEFAULTS.golaStripSetback - ESP)) <= 0.5);
  });

  it('con renderer null y cfg null usa defaults (drawerGap 15, GOLA_DEFAULTS)', () => {
    const pieces = buildModule(2);
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const geos = buildGolaGeometries('1', r.pieces, moduleBox, null, null);
    assert.ok(geos.length > 0);
    const fondo = geos.find((g) => g.id.endsWith('-fondo'));
    assert.equal(fondo.h, GOLA_DEFAULTS.golaEntradaMm + 2 * GOLA_LABIO_MM - 2 * GOLA_DEFAULTS.golaPaso);
    const yCara = PROF - ESP + 15 - ESP_FRENTE;
    assert.ok(Math.abs(fondo.y - (yCara - GOLA_DEFAULTS.golaStripSetback - ESP)) <= 0.5);
  });
});
