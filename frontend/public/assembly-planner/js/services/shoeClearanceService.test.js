// shoeClearanceService.test.js — Altura libre entre niveles de zapateras

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateShoeClearance,
  SHOE_CLEARANCE_MINIMOS,
  SHOE_CLEARANCE_SOURCE,
  tipoDeUnidadZapatera,
} from './shoeClearanceService.js';

// Fixture mínimo de una unidad zapatera extraíble: frente ancla (con tag
// [tipo]) + base (drawer_bottom). El espesor real de la base se lee del CSV.
function unidadZapatera(modulo, index, tipo, posZ, espBase = 15) {
  const sub = `${modulo}${index}`;
  const pref = `m${modulo}zapatera${index}`;
  return [
    {
      id: `${pref}-frente`,
      nombre: `Frente [${tipo}] zapatera extraible ${index} M${modulo}`,
      ancho: 400, alto: 180, cantidad: 1, rotate: 'si', color: '#8B5A2B',
      espesor: 15, cantos: 'T,B,L,R', modulo: sub, pos_z: posZ,
    },
    {
      id: `${pref}-base`,
      nombre: `Base zapatera extraible ${index} M${modulo}`,
      ancho: 350, alto: 500, cantidad: 1, rotate: 'si', color: '#D9C2A3',
      espesor: espBase, cantos: 'T,B,L,R', modulo: sub,
    },
  ];
}

function repisa(modulo, index, posZ, espesor = 15) {
  return {
    id: `m${modulo}-repisa-${index}`,
    nombre: `Repisa ${index} M${modulo}`,
    ancho: 400, alto: espesor, cantidad: 1, rotate: 'si', color: '#D9C2A3',
    espesor, cantos: 'T,B,L,R', modulo: String(modulo), pos_z: posZ,
  };
}

// Casco mínimo del módulo raíz: sin él, rootModuleIds no puede atribuir los
// submódulos '11'/'12' a la raíz '1' (convención concatenada) y cada
// zapatera quedaría como pila independiente.
function casco(modulo, alto = 1200, espesor = 15) {
  const mod = String(modulo);
  const p = (id, nombre, ancho, al, opts = {}) => ({
    id, nombre, ancho, alto: al, cantidad: 1, rotate: 'no', color: '#D9C2A3',
    espesor, cantos: 'T,B,L,R', modulo: mod, ...opts,
  });
  return [
    p(`m${mod}-lateral-izq`, `Lateral izquierdo M${mod}`, 500, alto),
    p(`m${mod}-lateral-der`, `Lateral derecho M${mod}`, 500, alto),
    p(`m${mod}-base`, `Base M${mod}`, 800, 500, { rotate: 'si' }),
    p(`m${mod}-tapa`, `Tapa M${mod}`, 800, 500, { rotate: 'si' }),
  ];
}

// alturaLibre entre dos unidades con igual espBase = posZSup − posZInf − espBase.
// (posZSup + espBase) − (posZInf + 2·espBase)

test('dos zapateras [planos] apiladas con altura libre 130 mm → sin warning', () => {
  const pieces = [
    ...casco(1),
    ...unidadZapatera(1, 1, 'planos', 100),
    ...unidadZapatera(1, 2, 'planos', 245), // 245 − 100 − 15 = 130 ≥ 120
  ];
  const { warnings, niveles } = validateShoeClearance(pieces);
  assert.equal(warnings.length, 0);
  assert.equal(niveles.length, 1);
  assert.equal(niveles[0].alturaLibreMm, 130);
  assert.equal(niveles[0].minimoMm, SHOE_CLEARANCE_MINIMOS.planos);
  assert.equal(niveles[0].ok, true);
});

test('dos zapateras [planos] apiladas con altura libre 100 mm → warning con tipo y mínimo', () => {
  const pieces = [
    ...casco(1),
    ...unidadZapatera(1, 1, 'planos', 100),
    ...unidadZapatera(1, 2, 'planos', 215), // 215 − 100 − 15 = 100 < 120
  ];
  const { warnings, niveles } = validateShoeClearance(pieces);
  assert.equal(warnings.length, 1);
  const w = warnings[0];
  assert.equal(w.nivel, 1);
  assert.equal(w.tipoId, 'planos');
  assert.equal(w.alturaLibreMm, 100);
  assert.equal(w.minimoMm, 120);
  assert.match(w.mensaje, /Módulo 1/);
  assert.match(w.mensaje, /nivel 1/);
  assert.match(w.mensaje, /100 mm/);
  assert.match(w.mensaje, /120 mm/);
  assert.equal(niveles[0].ok, false);
});

test('mezcla de tipos: cada nivel se evalúa con el mínimo de su propio tipo', () => {
  const pieces = [
    ...casco(1),
    ...unidadZapatera(1, 1, 'planos', 100),
    ...unidadZapatera(1, 2, 'tenis', 245), // nivel 1 (planos): 130 ≥ 120 ✓
    ...unidadZapatera(1, 3, 'tacones', 410), // nivel 2 (tenis): 150 ≥ 150 ✓
    repisa(1, 9, 595), // nivel 3 (tacones): 595 − 410 − 30 = 155 < 180 ✗
  ];
  const { warnings, niveles } = validateShoeClearance(pieces);
  assert.equal(niveles.length, 3);
  assert.deepEqual(
    niveles.map((n) => [n.nivel, n.tipoId, n.alturaLibreMm, n.ok]),
    [[1, 'planos', 130, true], [2, 'tenis', 150, true], [3, 'tacones', 155, false]],
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].tipoId, 'tacones');
  assert.equal(warnings[0].minimoMm, SHOE_CLEARANCE_MINIMOS.tacones);
});

test('sin pos_z (apilado implícito del renderer): niveles omitidos, sin warnings', () => {
  const pieces = [
    ...casco(1),
    ...unidadZapatera(1, 1, 'planos', null),
    ...unidadZapatera(1, 2, 'planos', undefined),
  ];
  const { warnings, niveles } = validateShoeClearance(pieces);
  assert.equal(warnings.length, 0);
  assert.equal(niveles.length, 0);
});

test('módulo sin zapateras (cajones apilados) → sin warnings', () => {
  const cajon = (index, posZ) => ([
    {
      id: `m1cajon${index}-frente`,
      nombre: `Frente cajon extraible ${index} M1`,
      ancho: 400, alto: 200, cantidad: 1, rotate: 'si', color: '#8B5A2B',
      espesor: 15, cantos: 'T,B,L,R', modulo: `1${index}`, pos_z: posZ,
    },
    {
      id: `m1cajon${index}-base`,
      nombre: `Base cajon extraible ${index} M1`,
      ancho: 350, alto: 500, cantidad: 1, rotate: 'si', color: '#D9C2A3',
      espesor: 15, cantos: 'T,B,L,R', modulo: `1${index}`,
    },
  ]);
  const pieces = [...casco(1), ...cajon(1, 100), ...cajon(2, 205)]; // hueco de 5 mm: no aplica
  const { warnings, niveles } = validateShoeClearance(pieces);
  assert.equal(warnings.length, 0);
  assert.equal(niveles.length, 0);
});

test('userConfig puede bajar el mínimo (shoeClearanceMinimos)', () => {
  const pieces = [
    ...casco(1),
    ...unidadZapatera(1, 1, 'planos', 100),
    ...unidadZapatera(1, 2, 'planos', 215), // altura libre 100 < 120 default
  ];
  assert.equal(validateShoeClearance(pieces).warnings.length, 1);
  const conOverride = validateShoeClearance(pieces, { shoeClearanceMinimos: { planos: 90 } });
  assert.equal(conOverride.warnings.length, 0);
  assert.equal(conOverride.niveles[0].minimoMm, 90);
});

test('el espesor real de la base del CSV modifica la altura libre', () => {
  // Base inferior de 25 mm: trayTop = 100 + 50 → alturaLibre con posZ 245:
  // (245 + 15) − (100 + 50) = 110 < 120 → warning.
  const pieces = [
    ...casco(1),
    ...unidadZapatera(1, 1, 'planos', 100, 25),
    ...unidadZapatera(1, 2, 'planos', 245, 15),
  ];
  const { warnings, niveles } = validateShoeClearance(pieces);
  assert.equal(niveles[0].alturaLibreMm, 110);
  assert.equal(warnings.length, 1);
});

test('tipoDeUnidadZapatera: tag primero, heurística de nombre como fallback', () => {
  assert.equal(
    tipoDeUnidadZapatera({ nombre: 'Frente [tenis] zapatera extraible 1 M1', id: 'm1zapatera1-frente' }),
    'tenis',
  );
  // Diseño previo al contrato: tipo en el nombre, sin tag.
  assert.equal(
    tipoDeUnidadZapatera({ nombre: 'Frente zapatera extraible botines M1', id: 'm1zapatera1-frente' }),
    'botines',
  );
  // Sin tag ni palabra clave: no se adivina (nivel no evaluable).
  assert.equal(
    tipoDeUnidadZapatera({ nombre: 'Frente zapatera extraible M1', id: 'm1zapatera1-frente' }),
    null,
  );
  // No zapatera: null.
  assert.equal(
    tipoDeUnidadZapatera({ nombre: 'Frente cajon extraible 1 M1', id: 'm1cajon1-frente' }),
    null,
  );
});

test('los mínimos son consistentes con el apilado del Constructor (altoVano)', () => {
  // Con el cursor de app.js (gap 2.5 mm, espBase 15), la altura libre que
  // deja cada tipo apilado debe superar su mínimo recomendado.
  const frenteAlto = { planos: 177, tenis: 197, tacones: 217, botines: 217, botas: 447 };
  const sinGap = new Set(['botas']); // frente completo: apilado flush
  for (const [tipo, alto] of Object.entries(frenteAlto)) {
    const gap = sinGap.has(tipo) ? 0 : 2.5;
    const alturaLibre = (alto + gap + 15) - 2 * 15;
    assert.ok(
      alturaLibre >= SHOE_CLEARANCE_MINIMOS[tipo],
      `${tipo}: ${alturaLibre} mm libres ≥ mínimo ${SHOE_CLEARANCE_MINIMOS[tipo]} mm`,
    );
  }
  assert.equal(SHOE_CLEARANCE_SOURCE, 'taller-medido');
});
