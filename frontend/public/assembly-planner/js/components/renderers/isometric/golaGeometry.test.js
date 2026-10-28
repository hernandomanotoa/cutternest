// js/components/renderers/isometric/golaGeometry.test.js — Test de propiedades
// de buildGolaGeometries(): para cualquier pila de N cajones (2..5) y config
// gola, cada canal genera fondo + pestañas + marca de agarre con medidas
// coherentes: fondo alto = perfil, pestañas alto = espesor de tablero (15) y
// profundidad = golaStripDepth, pos_z ancladas al fondo, y el gap entre
// frentes consecutivos = paso + perfil + paso.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildGolaGeometries } from './golaGeometry.js';
import { createModule, addDrawer, addShelf } from '../../../services/closetBuilderService.js';
import { applyGola, GOLA_DEFAULTS } from '../../../services/golaService.js';
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
  s.pieces[0].pos_z = ultimoTecho + 300;
  pieces.push(...s.pieces);
  return pieces;
}

const rendererStub = { drawerGap: 15, verticalPositionOverrides: {} };
const moduleBox = { moduleW: ANCHO, moduleD: PROF, moduleH: ALTO, thickness: ESP };

const yFaceEsperada = (cfg) => PROF - ESP + 15;
const yBackEsperada = (cfg) => yFaceEsperada(cfg) - cfg.golaStripSetback;

// Configs sobre las que se barre la propiedad: default + overrides de taller.
const CONFIGS = [
  { nombre: 'defaults', overrides: {} },
  {
    nombre: 'perfil 40 / tira 70 / setback 15 / paso 4',
    overrides: { golaPerfilHeight: 40, golaStripDepth: 70, golaStripSetback: 15, golaPaso: 4 },
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
          golaStripDepth: cfgOverrides.overrides.golaStripDepth ?? GOLA_DEFAULTS.golaStripDepth,
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

        // N−1 canales C + 1 canal L.
        assert.equal(fondos.length, n, `${n - 1} canales C + 1 canal L`);
        assert.equal(tiras.length, n - 1);

        const stripW = ANCHO - 2 * ESP;
        const xCentrado = (ANCHO - stripW) / 2;

        // ── Propiedad: gap entre frentes consecutivos = paso + perfil + paso,
        // y la tira se ancla al techo del frente inferior + paso inferior.
        for (let i = 0; i < n - 1; i += 1) {
          const inferior = frentes[i];
          const superior = frentes[i + 1];
          const gap = superior.pos_z - (inferior.pos_z + inferior.alto);
          assert.ok(Math.abs(gap - (cfg.golaPaso + cfg.golaPerfilHeight + cfg.golaPaso)) <= 0.5,
            `gap frente ${i + 1}↔${i + 2} = ${gap} ≈ 2·${cfg.golaPaso} + ${cfg.golaPerfilHeight}`);
          assert.ok(Math.abs(tiras[i].pos_z - (inferior.pos_z + inferior.alto + cfg.golaPaso)) <= 0.5,
            `tira ${i + 1} anclada al techo del frente inferior + paso`);
          assert.ok(Math.abs(tiras[i].pos_z + tiras[i].alto + cfg.golaPaso - superior.pos_z) <= 0.5,
            `borde superior de la tira + paso = borde inferior del frente superior`);
        }

        // ── Propiedad: por cada fondo, fondo + pestañas + grip coherentes.
        for (const f of fondos) {
          const piezaFondo = r.pieces.find((p) => p.id === f.id);
          assert.ok(piezaFondo, `existe la pieza ${f.id}`);
          const pref = f.id.slice(0, -'-fondo'.length);
          const yBack = yBackEsperada(cfg);

          // Fondo: panel vertical retranqueado, alto = cuerpo del perfil.
          assert.equal(f.h, cfg.golaPerfilHeight, `${f.id}: alto = perfil`);
          assert.equal(f.d, ESP, `${f.id}: fondo es panel de ${ESP} de fondo`);
          assert.ok(Math.abs(f.z - piezaFondo.pos_z) <= 0.5, `${f.id}: z anclado al pos_z de la pieza`);
          assert.ok(Math.abs(f.y - (yBack - ESP)) <= 0.5, `${f.id}: cara frontal a yBack − ${ESP}`);
          assert.equal(f.w, stripW);
          assert.equal(f.x, xCentrado, 'canal centrado en el vano');
          assert.equal(f.color, piezaFondo.color || ROLE_COLORS.gola_strip,
            'color = color de la pieza (fallback al del rol)');

          // Pestaña superior: pegada al techo del fondo, alto = tablero (15),
          // profundidad = golaStripDepth.
          const sup = geos.find((g) => g.id === `${pref}-pestana-sup`);
          if (sup) {
            assert.equal(sup.h, ESP, 'pestaña sup: alto = espesor de tablero');
            assert.equal(sup.d, cfg.golaStripDepth, 'pestaña sup: alcance = golaStripDepth');
            assert.ok(Math.abs(sup.z - (f.z + f.h - ESP)) <= 0.5, 'pestaña sup: z = techo del fondo − tablero');
            assert.ok(Math.abs(sup.y - (yBack - ESP)) <= 0.5, 'pestaña sup: sale del fondo');
            assert.equal(sup.w, stripW);
          }

          // Pestaña inferior: en la base del fondo; el canal L solo lleva esta.
          const inf = geos.find((g) => g.id === `${pref}-pestana-inf` || g.id === `${pref}-pestana`);
          if (inf) {
            assert.equal(inf.h, ESP, 'pestaña inf: alto = espesor de tablero');
            assert.equal(inf.d, cfg.golaStripDepth, 'pestaña inf: alcance = golaStripDepth');
            assert.ok(Math.abs(inf.z - f.z) <= 0.5, 'pestaña inf: z = base del fondo');
            assert.ok(Math.abs(inf.y - (yBack - ESP)) <= 0.5, 'pestaña inf: sale del fondo');
            assert.equal(inf.w, stripW);
          }
          // Canal C: tiene ambas pestañas; canal L: solo la inferior.
          if (/gola-c\d+-fondo$/.test(f.id)) {
            assert.ok(sup && inf, `${f.id}: canal C con pestaña sup e inf`);
          } else {
            assert.ok(inf && !sup, `${f.id}: canal L solo con pestaña inferior`);
          }

          // Marca del agarre: paso superior sobre la tira, en el plano de frentes.
          const grip = geos.find((g) => g.id === `${f.id}-grip`);
          assert.ok(grip, `${f.id}: existe la marca de agarre`);
          assert.equal(grip.role, 'gola_grip');
          assert.equal(grip.color, ROLE_COLORS.gola_grip);
          assert.equal(grip.h, cfg.golaPaso, 'grip: alto = paso de agarre');
          assert.equal(grip.d, 2, 'grip: caja fina de 2 mm');
          assert.ok(Math.abs(grip.z - (f.z + f.h)) <= 0.5, 'grip: empieza en el techo de la tira');
          assert.ok(Math.abs(grip.y - yFaceEsperada(cfg)) <= 0.5, 'grip: en el plano de frentes');
          assert.equal(grip.w, stripW);
        }

        // ── Propiedad: agarre L bajo el techo del último frente → repisa.
        const lGrip = geos.find((g) => g.id === 'm1-gola-l-grip');
        assert.ok(lGrip, 'existe la marca del agarre L');
        const ultimo = frentes[frentes.length - 1];
        const techoUlt = ultimo.pos_z + ultimo.alto;
        const repisa = r.pieces.find((p) => p.id === 'm1-repisa-1');
        assert.ok(Math.abs(lGrip.z - techoUlt) <= 0.5, 'agarre L: z = techo del último frente');
        assert.ok(Math.abs(lGrip.z + lGrip.h - repisa.pos_z) <= 0.5,
          'agarre L: termina en la repisa inmediata superior');
        assert.ok(lGrip.h > 0, 'agarre L con altura positiva');
      });
    }
  }

  it('sin tiras del módulo → []', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    assert.deepEqual(buildGolaGeometries('1', casco.pieces, moduleBox, rendererStub, {}), []);
    assert.deepEqual(buildGolaGeometries('1', [], moduleBox, rendererStub, {}), []);
  });

  it('respeta el drawerGap del renderer para el plano de frentes', () => {
    const pieces = buildModule(2);
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const renderer = { drawerGap: 20, verticalPositionOverrides: {} };
    const geos = buildGolaGeometries('1', r.pieces, moduleBox, renderer, {});
    const grip = geos.find((g) => g.id.endsWith('-fondo-grip'));
    const yFace = PROF - ESP + 20;
    assert.ok(Math.abs(grip.y - yFace) <= 0.5, 'plano de frentes con drawerGap 20');
    const fondo = geos.find((g) => g.id.endsWith('-fondo'));
    assert.ok(Math.abs(fondo.y - (yFace - GOLA_DEFAULTS.golaStripSetback - ESP)) <= 0.5);
  });

  it('con renderer null y cfg null usa defaults (drawerGap 15, GOLA_DEFAULTS)', () => {
    const pieces = buildModule(2);
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    const geos = buildGolaGeometries('1', r.pieces, moduleBox, null, null);
    assert.ok(geos.length > 0);
    const fondo = geos.find((g) => g.id.endsWith('-fondo'));
    assert.equal(fondo.h, GOLA_DEFAULTS.golaPerfilHeight);
    const yFace = PROF - ESP + 15;
    assert.ok(Math.abs(fondo.y - (yFace - GOLA_DEFAULTS.golaStripSetback - ESP)) <= 0.5);
  });
});
