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
  // Repisa en el span EXACTO de la pila con gola B2: frentes 197+30 (labio)
  // y gaps 86 = 30 labio + paso + perfil + paso (caja en 167).
  const paso = cfgGola.golaPaso ?? 3;
  const perfil = cfgGola.golaPerfilHeight ?? 50;
  const G = 30 + paso + perfil + paso;
  const s = addShelf('1', { anchoUtil: ANCHO - 2 * 15, profReal: PROF - 2 * 15, index: 1 });
  assert.ok(s.ok);
  s.pieces[0].pos_z = Math.round((25 + n * 227 + (n - 1) * G + 2.5) * 10) / 10;
  pieces.push(...s.pieces);
  const r = applyGola(pieces, '1', cfgGola);
  assert.ok(r.ok, r.errors?.join('; '));
  return r.pieces;
}

describe('auditarLuzLibreGola — canal de la mano (mínimo 40 mm)', () => {
  it('gola bien construida: voladizo 30 (luz 27 ≥ 25) → sin filas', () => {
    const pieces = buildModuleConGola(3);
    assert.deepEqual(auditarLuzLibreGola(pieces), []);
  });

  it('voladizo insuficiente (caja alta, luz < 25): ERROR CRÍTICO con el déficit exacto', () => {
    // Frente 227 con caja 200 → voladizo 13.5 → luz = 30 + 27 − 3 − 30 = 24 mm.
    const pieces = buildModuleConGola(2);
    for (const p of pieces) {
      if (/m1cajon\d+-(lateral-izq|lateral-der|cara|fondo)$/.test(String(p.id))) p.alto = 200;
    }
    const filas = auditarLuzLibreGola(pieces);
    assert.equal(filas.length, 1, 'un par de frentes para el único canal');
    for (const f of filas) {
      assert.equal(f.luzMm, 24);
      assert.equal(f.deficitMm, LUZ_MIN_MANO_MM - 24);
      assert.match(f.mensaje, /ERROR CRÍTICO DE BLOQUEO/);
      assert.match(f.mensaje, /obstruye el agarre/);
      assert.match(f.correccion, /Rebajar la caja|voladizo/i);
    }
  });

  it('sin gola en el mueble → sin auditoría de luz', () => {
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    assert.deepEqual(auditarLuzLibreGola(casco.pieces), []);
  });
});

describe('auditarVeta — sentido de veta (rotate) por función', () => {
  it('frente y gola con rotate: nivel error; laterales/caras/fondos/bases: libres (info)', () => {
    const piezas = [
      { id: 'm1cajon1-frente', nombre: 'Frente cajon 1 M1', ancho: 818, alto: 197, rotate: true, modulo: '11' },
      { id: 'm1gola-c1-fondo', nombre: 'Fondo de canal Gola C 1', ancho: 788, alto: 50, rotate: true, modulo: '1' },
      { id: 'm1cajon1-lateral-izq', nombre: 'Lateral cajon 1 M1', ancho: 545, alto: 167, rotate: true, modulo: '11' },
      { id: 'm1cajon1-cara', nombre: 'Cara cajon 1 M1', ancho: 735, alto: 167, rotate: true, modulo: '11' },
      { id: 'm1cajon1-fondo', nombre: 'Fondo cajon 1 M1', ancho: 735, alto: 167, rotate: true, modulo: '11' },
      { id: 'm1cajon1-base', nombre: 'Base cajon 1 M1', ancho: 765, alto: 515, rotate: true, modulo: '11' },
    ];
    const { incumplimientos, libres } = auditarVeta(piezas);
    assert.equal(incumplimientos.length, 2, 'frente + gola');
    assert.ok(incumplimientos.every((i) => i.nivel === 'error'));
    assert.ok(incumplimientos.some((i) => i.rol === 'drawer_face' && /horizontal a lo largo del ancho/.test(i.mensaje)));
    assert.ok(incumplimientos.some((i) => i.rol === 'gola_strip' && /visible en el fondo del canal/.test(i.mensaje)));
    const rolesLibres = libres.map((l) => l.rol).sort();
    assert.deepEqual(rolesLibres, ['drawer_back', 'drawer_bottom', 'drawer_part', 'drawer_side']);
    assert.ok(libres.every((l) => /rotate libre permitido/.test(l.mensaje)));
    assert.ok(libres.every((l) => /optimizador SÍ puede rotarlas para ahorrar material/.test(l.mensaje)));
  });

  it('piezas con rotate en regla → sin incumplimientos', () => {
    const piezas = [
      { id: 'm1cajon1-frente', nombre: 'Frente cajon 1 M1', ancho: 818, alto: 197, rotate: false, modulo: '11' },
      { id: 'm1gola-c1-fondo', nombre: 'Fondo de canal Gola C 1', ancho: 788, alto: 50, rotate: false, modulo: '1' },
      { id: 'm1cajon1-lateral-izq', nombre: 'Lateral cajon 1 M1', ancho: 545, alto: 167, rotate: false, modulo: '11' },
      { id: 'm1cajon1-base', nombre: 'Base cajon 1 M1', ancho: 765, alto: 515, rotate: true, modulo: '11' },
    ];
    const { incumplimientos } = auditarVeta(piezas);
    assert.deepEqual(incumplimientos, []);
  });

  it('piezas de vista verticales (costado, divisor) con rotate: error de veta vertical', () => {
    const piezas = [
      { id: 'm1-lateral-izq', nombre: 'Lateral izquierdo M1', ancho: 600, alto: 2400, rotate: true, modulo: '1' },
      { id: 'm1-divisor-1', nombre: 'Divisor 1 M1', ancho: 15, alto: 2000, rotate: true, modulo: '1' },
      { id: 'm1-repisa-1', nombre: 'Repisa 1 M1', ancho: 800, alto: 400, rotate: true, modulo: '1' },
      { id: 'm1-tapa', nombre: 'Tapa modulo M1', ancho: 850, alto: 600, rotate: true, modulo: '1' },
    ];
    const { incumplimientos } = auditarVeta(piezas);
    assert.equal(incumplimientos.length, 4);
    const porRol = Object.fromEntries(incumplimientos.map((i) => [i.rol, i]));
    assert.match(porRol.side_panel.mensaje, /vertical a lo largo del alto/);
    assert.match(porRol.divider.mensaje, /vertical a lo largo del alto/);
    assert.match(porRol.shelf.mensaje, /horizontal a lo largo del ancho/);
    assert.match(porRol.top_panel.mensaje, /horizontal a lo largo del ancho/);
  });

  it('Constructor: un cajón completo queda verde (frente bloqueado, caja libre)', () => {
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    const cajon = addDrawer('1', 1, {
      anchoModulo: 850, profundidadModulo: 600, altoVano: 250,
      espesorModulo: 15, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3',
    });
    assert.ok(cajon.ok);
    const { incumplimientos } = auditarVeta([...casco.pieces, ...cajon.pieces]);
    assert.deepEqual(incumplimientos, []);
  });
});

describe('auditarColisionGola — caja ≥60 mm bajo el frente', () => {
  it('caja alta (holgura 30 mm < 60): ERROR DE COLISIÓN con déficit', () => {
    // El cajón estándar del Constructor cumple justo con la regla (frente
    // 227 con labio − caja 167 = 60), así que se ejercita con una caja alta
    // (CSV legacy / personalizada) que incumple.
    const casco = createModule({ ancho: ANCHO, alto: ALTO, prof: PROF, modulo: '1' });
    const pieces = [
      ...casco.pieces,
      { id: 'm1cajon1-frente', nombre: 'Frente cajon 1 M1', ancho: 818, alto: 227, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L,R', modulo: '11', pos_z: 25 },
      { id: 'm1cajon1-lateral-izq', nombre: 'Lateral cajon 1 M1', ancho: 545, alto: 197, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L', modulo: '11' },
      { id: 'm1cajon1-cara', nombre: 'Cara cajon 1 M1', ancho: 735, alto: 197, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L,R', modulo: '11' },
      { id: 'm1cajon2-frente', nombre: 'Frente cajon 2 M1', ancho: 818, alto: 227, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L,R', modulo: '12', pos_z: 320 },
      { id: 'm1cajon2-lateral-izq', nombre: 'Lateral cajon 2 M1', ancho: 545, alto: 197, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B,L', modulo: '12' },
      // canal C del módulo (la presencia de gola activa la auditoría).
      { id: 'm1gola-c1-fondo', nombre: 'Fondo de canal Gola C 1', ancho: 788, alto: 50, rotate: false, cantidad: 1, espesor: 15, cantos: 'T,B', modulo: '1', pos_z: 255 },
    ];
    const filas = auditarColisionGola(pieces);
    assert.equal(filas.length, 2, 'un cajón por unidad');
    for (const f of filas) {
      assert.equal(f.holguraMm, 30, 'caja = frente − 30 (227 − 197)');
      assert.equal(f.deficitMm, COLISION_GOLA_MIN_MM - 30);
      assert.match(f.mensaje, /ERROR DE COLISIÓN/);
      assert.match(f.mensaje, /chocará contra la gola al intentar cerrar/);
      assert.match(f.correccion, /Rebajar la estructura interna 30 mm/);
    }
  });

  it('cajón estándar del Constructor con gola B2: holgura 60 → sin colisión', () => {
    const pieces = buildModuleConGola(3);
    assert.deepEqual(auditarColisionGola(pieces), [], 'frente 227 − caja 167 = 60: cumple justo');
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
