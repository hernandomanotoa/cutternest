/**
 * zapateras.test.js
 *
 * Verifica los 3 ejemplos de zapateras generados por
 * scripts/generar-ejemplos-assembly.mjs:
 *   - ejemplo-zapatero-volquete.csv   (cajones abatibles / volquete)
 *   - ejemplo-zapatero-extraible.csv  (5 bandejas extraíbles en correderas)
 *   - ejemplo-zapatero-banco.csv      (asiento + 2 cajones a nivel de piso)
 *
 * Casos: parseo sin warnings, clasificación de roles (drawer_face, shelf,
 * seat_panel, sin fallback 'panel') y hardware derivado (bisagras abatibles
 * vs correderas telescópicas).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCSV } from './csvParser.js';
import { calculateHardware } from './hardware.js';
import { inferRole } from './services/classifierService.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', 'data');

const EXAMPLES = {
  volquete: 'ejemplo-zapatero-volquete.csv',
  extraible: 'ejemplo-zapatero-extraible.csv',
  banco: 'ejemplo-zapatero-banco.csv',
};

function loadExample(file) {
  const text = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
  const result = parseCSV(text);
  return result;
}

function hardwareFor(pieces) {
  return calculateHardware(pieces, []);
}

describe('ejemplos de zapateras', () => {
  for (const [key, file] of Object.entries(EXAMPLES)) {
    it(`${file}: parsea con ok:true y 0 warnings`, () => {
      const result = loadExample(file);
      assert.equal(result.ok, true, `errores: ${(result.errors || []).join(' | ')}`);
      assert.deepEqual(result.warnings, [], `warnings: ${(result.warnings || []).join(' | ')}`);
    });
  }

  it('volquete: sin piezas de rol genérico y frentes abatibles como drawer_face', () => {
    const { pieces } = loadExample(EXAMPLES.volquete);
    for (const p of pieces) {
      assert.notEqual(inferRole(p), 'panel', `"${p.nombre}" cayó en el rol genérico`);
    }
    const frentes = pieces.filter((p) => p.nombre.includes('Frente cajon abatible'));
    assert.equal(frentes.length, 3, `se esperaban 3 frentes abatibles: ${frentes.map((f) => f.nombre).join(', ')}`);
    for (const f of frentes) {
      assert.equal(inferRole(f), 'drawer_face', `"${f.nombre}" debería ser drawer_face`);
    }
  });

  it('volquete: hardware con bisagras abatibles (6) y sin correderas telescópicas', () => {
    const { pieces } = loadExample(EXAMPLES.volquete);
    const hw = hardwareFor(pieces);
    const bisagras = hw.find((h) => h.nombre === 'Bisagras abatibles para zapatera volquete');
    assert.ok(bisagras, 'faltan las bisagras abatibles para zapatera volquete');
    assert.equal(bisagras.cantidad, 6);
    assert.equal(
      hw.some((h) => h.nombre === 'Correderas telescópicas'),
      false,
      'un volquete no debería generar correderas telescópicas'
    );
  });

  it('extraíble: frentes drawer_face, correderas telescópicas (5) y bandeja shelf', () => {
    const { pieces } = loadExample(EXAMPLES.extraible);
    const frentes = pieces.filter((p) => p.nombre.includes('Frente cajon extraible'));
    assert.equal(frentes.length, 5);
    for (const f of frentes) {
      assert.equal(inferRole(f), 'drawer_face', `"${f.nombre}" debería ser drawer_face`);
    }
    const hw = hardwareFor(pieces);
    const correderas = hw.find((h) => h.nombre === 'Correderas telescópicas');
    assert.ok(correderas, 'faltan las correderas telescópicas');
    assert.equal(correderas.cantidad, 5);
    const bandeja = pieces.find((p) => p.nombre === 'Bandeja zapatero');
    assert.ok(bandeja, 'falta la bandeja zapatero');
    assert.equal(inferRole(bandeja), 'shelf', '"Bandeja zapatero base" debería ser shelf');
  });

  it('banco: asiento seat_panel, correderas telescópicas (2) y cajones drawer_face', () => {
    const { pieces } = loadExample(EXAMPLES.banco);
    const asiento = pieces.find((p) => p.nombre === 'Asiento banco');
    assert.ok(asiento, 'falta el Asiento banco');
    assert.equal(inferRole(asiento), 'seat_panel', '"Asiento banco" debería ser seat_panel');
    const frentes = pieces.filter((p) => p.nombre.includes('Frente cajon'));
    assert.equal(frentes.length, 2);
    for (const f of frentes) {
      assert.equal(inferRole(f), 'drawer_face', `"${f.nombre}" debería ser drawer_face`);
    }
    const hw = hardwareFor(pieces);
    const correderas = hw.find((h) => h.nombre === 'Correderas telescópicas');
    assert.ok(correderas, 'faltan las correderas telescópicas');
    assert.equal(correderas.cantidad, 2);
  });
});
