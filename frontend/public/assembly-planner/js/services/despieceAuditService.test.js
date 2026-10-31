// js/services/despieceAuditService.test.js — Reglas de control estricto del
// taller: luz libre del canal de la mano (≥40 mm), veta (rotate) por función
// y colisión de la caja con la gola (≥60 mm bajo el frente).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModule, addDrawer, addShelf } from './closetBuilderService.js';
import { applyGola } from './golaService.js';
import {
  auditarLuzLibreGola,
  auditarVeta,
  auditarColisionGola,
  LUZ_MIN_MANO_MM,
  COLISION_GOLA_MIN_MM,
} from './despieceAuditService.js';

const ANCHO = 850;
const ALTO = 2000;
const PROF = 600;
const VANO = 200;

function buildModuleConGola(n, cfgGola = {}) {
  const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
  assert.ok(casco.ok);
  const pieces = [...casco.pieces];
  let cursor = 15 + 10;
  let ultimoTecho = 0;
  for (let i = 1; i <= n; i += 1) {
    const d = addDrawer('1', i, { anchoModulo: ANCHO, profundidadModulo: PROF, altoVano: VANO });
    assert.ok(d.ok);
    const frente = d.pieces.find((p) => p.id.endsWith('-frente'));
    frente.pos_z = cursor;
    cursor += frente.alto + 2.5;
    ultimoTecho = frente.pos_z + frente.alto;
    pieces.push(...d.pieces);
  }
  // Repisa en el span EXACTO de la pila: los frentes conservan 197 mm
  // (vano − 3) y la caja queda en 167 (holgura 30 < 60 → colisión detectable).
  const paso = cfgGola.golaPaso ?? 3;
  const perfil = cfgGola.golaPerfilHeight ?? 50;
  const G = paso + perfil + paso;
  const s = addShelf('1', { anchoUtil: ANCHO - 2 * 15, profReal: PROF - 2 * 15, index: 1 });
  assert.ok(s.ok);
  s.pieces[0].pos_z = Math.round((25 + n * 197 + (n - 1) * G + 2.5) * 10) / 10;
  pieces.push(...s.pieces);
  const r = applyGola(pieces, '1', cfgGola);
  assert.ok(r.ok, r.errors?.join('; '));
  return r.pieces;
}

describe('auditarLuzLibreGola — canal de la mano (mínimo 40 mm)', () => {
  it('gola bien construida: gap gola 56 mm ≥ 40 → sin filas', () => {
    const pieces = buildModuleConGola(3);
    assert.deepEqual(auditarLuzLibreGola(pieces), []);
  });

  it('perfil bajo (gap 36 mm < 40): ERROR CRÍTICO con el déficit exacto', () => {
    const pieces = buildModuleConGola(3, { golaPerfilHeight: 30 });
    const filas = auditarLuzLibreGola(pieces);
    assert.equal(filas.length, 2, 'un par de frentes por cada uno de los 2 canales');
    for (const f of filas) {
      assert.equal(f.luzMm, 36);
      assert.equal(f.deficitMm, LUZ_MIN_MANO_MM - 36);
      assert.match(f.mensaje, /ERROR CRÍTICO DE BLOQUEO/);
      assert.match(f.mensaje, /obstruyen el canal de la mano/);
      assert.match(f.correccion, /Restar 4 mm al alto de los frentes/);
      assert.match(f.correccion, /2 mm a cada uno/);
    }
  });

  it('sin gola en el mueble → sin auditoría de luz', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    assert.deepEqual(auditarLuzLibreGola(casco.pieces), []);
  });
});

describe('auditarVeta — sentido de veta (rotate) por función', () => {
  it('frente y gola con rotate: nivel error; lateral/cara/fondo: warning; base: info', () => {
    const piezas = [
      { id: 'm1cajon1-frente', nombre: 'Frente cajon 1 M1', ancho: 818, alto: 197, rotate: true, modulo: '11' },
      { id: 'm1gola-c1-fondo', nombre: 'Fondo de canal Gola C 1', ancho: 788, alto: 50, rotate: true, modulo: '1' },
      { id: 'm1cajon1-lateral-izq', nombre: 'Lateral cajon 1 M1', ancho: 545, alto: 167, rotate: true, modulo: '11' },
      { id: 'm1cajon1-cara', nombre: 'Cara cajon 1 M1', ancho: 735, alto: 167, rotate: true, modulo: '11' },
      { id: 'm1cajon1-fondo', nombre: 'Fondo cajon 1 M1', ancho: 735, alto: 167, rotate: true, modulo: '11' },
      { id: 'm1cajon1-base', nombre: 'Base cajon 1 M1', ancho: 765, alto: 515, rotate: true, modulo: '11' },
    ];
    const { incumplimientos, basesLibres } = auditarVeta(piezas);
    const porNivel = { error: [], warning: [] };
    for (const i of incumplimientos) porNivel[i.nivel].push(i);
    assert.equal(porNivel.error.length, 2, 'frente + gola');
    assert.ok(porNivel.error.some((i) => i.rol === 'drawer_face' && /horizontal a lo largo del ancho/.test(i.mensaje)));
    assert.ok(porNivel.error.some((i) => i.rol === 'gola_strip' && /visible en el fondo del canal/.test(i.mensaje)));
    assert.equal(porNivel.warning.length, 3, 'lateral + cara + fondo');
    assert.ok(porNivel.warning.some((i) => i.rol === 'drawer_side' && /de adelante hacia atrás/.test(i.mensaje)));
    assert.equal(basesLibres.length, 1, 'una fila informativa por módulo');
    assert.match(basesLibres[0].mensaje, /optimizador SÍ puede rotar la pieza para ahorrar material/);
  });

  it('piezas con rotate en regla → sin incumplimientos', () => {
    const piezas = [
      { id: 'm1cajon1-frente', nombre: 'Frente cajon 1 M1', ancho: 818, alto: 197, rotate: false, modulo: '11' },
      { id: 'm1gola-c1-fondo', nombre: 'Fondo de canal Gola C 1', ancho: 788, alto: 50, rotate: false, modulo: '1' },
      { id: 'm1cajon1-lateral-izq', nombre: 'Lateral cajon 1 M1', ancho: 545, alto: 167, rotate: false, modulo: '11' },
      { id: 'm1cajon1-base', nombre: 'Base cajon 1 M1', ancho: 765, alto: 515, rotate: true, modulo: '11' },
    ];
    const { incumplimientos, basesLibres } = auditarVeta(piezas);
    assert.deepEqual(incumplimientos, []);
    assert.equal(basesLibres.length, 1, 'la base rotate=si sigue siendo libre (info)');
  });
});

describe('auditarColisionGola — caja ≥60 mm bajo el frente', () => {
  it('cajón estándar (holgura 30 mm < 60): ERROR DE COLISIÓN con déficit', () => {
    const pieces = buildModuleConGola(3);
    const filas = auditarColisionGola(pieces);
    assert.equal(filas.length, 3, 'un cajón por unidad');
    for (const f of filas) {
      assert.equal(f.holguraMm, 30, 'caja = frente − 2·E (197 − 167)');
      assert.equal(f.deficitMm, COLISION_GOLA_MIN_MM - 30);
      assert.match(f.mensaje, /ERROR DE COLISIÓN/);
      assert.match(f.mensaje, /chocará contra la gola al intentar cerrar/);
      assert.match(f.correccion, /Rebajar la estructura interna 30 mm/);
    }
  });

  it('sin gola → sin auditoría de colisión', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    const d = addDrawer('1', 1, { anchoModulo: ANCHO, profundidadModulo: PROF, altoVano: VANO });
    assert.deepEqual(auditarColisionGola([...casco.pieces, ...d.pieces]), []);
  });

  it('bandeja de borde uniforme (CSV legacy): exenta (la cara es borde, no caja)', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    const pieces = [
      ...casco.pieces,
      // cajón estándar: frente 197 / caja 167 (holgura 30 → colisión).
      { id: 'm1cajon1-frente', nombre: 'Frente cajon 1 M1', ancho: 818, alto: 197, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L,R', modulo: '11', pos_z: 25 },
      { id: 'm1cajon1-lateral-izq', nombre: 'Lateral cajon 1 M1', ancho: 545, alto: 167, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L', modulo: '11' },
      { id: 'm1cajon1-cara', nombre: 'Cara cajon 1 M1', ancho: 735, alto: 167, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L,R', modulo: '11' },
      // bandeja de borde uniforme (legacy): frente == cara == 100 (exenta).
      { id: 'm1zapatera1-frente', nombre: 'Frente zapatera extraible 1 M1', ancho: 818, alto: 100, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L,R', modulo: '12', pos_z: 300 },
      { id: 'm1zapatera1-cara', nombre: 'Cara zapatera extraible 1 M1', ancho: 735, alto: 100, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L,R', modulo: '12' },
      { id: 'm1zapatera1-lateral-izq', nombre: 'Lateral zapatera extraible 1 izq M1', ancho: 545, alto: 100, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L', modulo: '12' },
      // canal C del módulo (la presencia de gola activa la auditoría).
      { id: 'm1gola-c1-fondo', nombre: 'Fondo de canal Gola C 1', ancho: 788, alto: 50, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B', modulo: '1', pos_z: 240 },
    ];
    const filas = auditarColisionGola(pieces);
    assert.equal(filas.length, 1, 'solo el cajón; la bandeja uniforme queda exenta');
    assert.match(filas[0].frenteId, /cajon/);
  });
});
