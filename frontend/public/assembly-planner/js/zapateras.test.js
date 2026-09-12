/**
 * zapateras.test.js
 *
 * Verifica los 4 ejemplos de zapateras generados por
 * scripts/generar-ejemplos-assembly.mjs:
 *   - ejemplo-zapatero-volquete.csv   (cajones abatibles / volquete)
 *   - ejemplo-zapatero-extraible.csv  (5 zapateras-cajón extraíbles en correderas;
 *                                      caja completa de 6 piezas con fondo y cara)
 *   - ejemplo-zapatero-banco.csv      (asiento + 2 cajones a nivel de piso)
 *   - ejemplo-zapatera-repisa.csv     (6 bandejas extraíbles de 6 piezas, sin tirador;
 *                                      apertura rail)
 *
 * Casos: parseo sin warnings, clasificación de roles (drawer_face, drawer_side,
 * shelf, seat_panel, sin fallback 'panel') y hardware derivado (bisagras
 * abatibles vs correderas telescópicas).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCSV } from './csvParser.js';
import { calculateHardware } from './hardware.js';
import { inferRole } from './services/classifierService.js';
import { motionConfigFor } from './services/motionService.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', 'data');

const EXAMPLES = {
  volquete: 'ejemplo-zapatero-volquete.csv',
  extraible: 'ejemplo-zapatero-extraible.csv',
  banco: 'ejemplo-zapatero-banco.csv',
  repisaRiel: 'ejemplo-zapatera-repisa.csv',
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

  it('extraíble: zapateras-cajón de 6 piezas (frente + laterales sin "cajon") clasifican como cajón', () => {
    const { pieces } = loadExample(EXAMPLES.extraible);
    const frentes = pieces.filter((p) => p.nombre.includes('Frente zapatera extraible'));
    assert.equal(frentes.length, 5);
    for (const f of frentes) {
      assert.equal(
        inferRole(f),
        'drawer_face',
        `"${f.nombre}" debería ser drawer_face vía la regla de zapatera-cajón`
      );
      assert.equal(f.nombre.includes('cajon'), false, `"${f.nombre}" no debe contener "cajon"`);
    }
    const laterales = pieces.filter((p) => p.nombre.includes('Lateral zapatera extraible'));
    assert.equal(laterales.length, 10, `se esperaban 10 laterales (5×2): ${laterales.length}`);
    for (const l of laterales) {
      assert.equal(inferRole(l), 'drawer_side', `"${l.nombre}" debería ser drawer_side`);
    }
    const bases = pieces.filter((p) => p.nombre.includes('Base zapatera extraible'));
    assert.equal(bases.length, 5);
    for (const b of bases) {
      assert.equal(inferRole(b), 'drawer_bottom', `"${b.nombre}" debería ser drawer_bottom`);
    }
    // Modelo completo de caja: fondo y cara interiores presentes en las 5
    // zapateras (ancho interior = round(vano − 25,4) − 2·espLat = 715 mm).
    const fondos = pieces.filter((p) => p.nombre.includes('Fondo zapatera extraible'));
    assert.equal(fondos.length, 5, `se esperaban 5 fondos: ${fondos.length}`);
    for (const f of fondos) {
      assert.equal(inferRole(f), 'drawer_back', `"${f.nombre}" debería ser drawer_back`);
      assert.equal(Number(f.ancho), 715, `"${f.nombre}" mide el interior de la caja`);
    }
    const caras = pieces.filter((p) => p.nombre.includes('Cara zapatera extraible'));
    assert.equal(caras.length, 5, `se esperaban 5 caras: ${caras.length}`);
    for (const c of caras) {
      assert.equal(inferRole(c), 'drawer_part', `"${c.nombre}" debería ser drawer_part`);
      assert.equal(Number(c.ancho), 715, `"${c.nombre}" mide el interior de la caja`);
    }
    const hw = hardwareFor(pieces);
    const correderas = hw.find((h) => h.nombre === 'Correderas telescópicas');
    assert.ok(correderas, 'faltan las correderas telescópicas');
    assert.equal(correderas.cantidad, 5);
    const bandeja = pieces.find((p) => p.nombre === 'Bandeja zapatero');
    assert.ok(bandeja, 'falta la bandeja zapatero');
    assert.equal(inferRole(bandeja), 'shelf', '"Bandeja zapatero" debería ser shelf');
  });

  it('repisa con riel: 6 bandejas extraíbles clasifican como cajón y abren en rail', () => {
    const { pieces } = loadExample(EXAMPLES.repisaRiel);
    const frentes = pieces.filter((p) => p.nombre.includes('Frente zapatera repisa extraible'));
    assert.equal(frentes.length, 6, `se esperaban 6 frentes: ${frentes.length}`);
    for (const f of frentes) {
      assert.equal(inferRole(f), 'drawer_face', `"${f.nombre}" debería ser drawer_face`);
      assert.deepEqual(motionConfigFor(f), { kind: 'rail', side: null }, `"${f.nombre}" debería abrir en rail`);
    }
    const laterales = pieces.filter((p) => p.nombre.includes('Lateral zapatera repisa extraible'));
    assert.equal(laterales.length, 12, `se esperaban 12 laterales (6×2): ${laterales.length}`);
    for (const l of laterales) {
      assert.equal(inferRole(l), 'drawer_side', `"${l.nombre}" debería ser drawer_side`);
    }
    const bases = pieces.filter((p) => p.nombre.includes('Base bandeja zapatera extraible'));
    assert.equal(bases.length, 6, `se esperaban 6 bases: ${bases.length}`);
    for (const b of bases) {
      assert.equal(inferRole(b), 'drawer_bottom', `"${b.nombre}" debería ser drawer_bottom`);
    }
    // Caja completa de 6 piezas: fondo y cara interiores (715 mm = interior).
    const fondos = pieces.filter((p) => p.nombre.includes('Fondo zapatera repisa extraible'));
    assert.equal(fondos.length, 6, `se esperaban 6 fondos: ${fondos.length}`);
    for (const f of fondos) {
      assert.equal(inferRole(f), 'drawer_back', `"${f.nombre}" debería ser drawer_back`);
    }
    const caras = pieces.filter((p) => p.nombre.includes('Cara zapatera repisa extraible'));
    assert.equal(caras.length, 6, `se esperaban 6 caras: ${caras.length}`);
    for (const c of caras) {
      assert.equal(inferRole(c), 'drawer_part', `"${c.nombre}" debería ser drawer_part`);
    }
    assert.equal(
      pieces.some((p) => p.nombre.includes('tirador')),
      false,
      'la zapatera-repisa omite el tirador (se jala del frente)'
    );
    const hw = hardwareFor(pieces);
    const correderas = hw.find((h) => h.nombre === 'Correderas telescópicas');
    assert.ok(correderas, 'faltan las correderas telescópicas');
    assert.equal(correderas.cantidad, 6);
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
    // La cara ("Cara cajon ...") es parte de la caja: drawer_part, no cuenta
    // como frente ni duplica el conteo de correderas.
    const caras = pieces.filter((p) => p.nombre.includes('Cara cajon'));
    assert.equal(caras.length, 2, `se esperaban 2 caras: ${caras.length}`);
    for (const c of caras) {
      assert.equal(inferRole(c), 'drawer_part', `"${c.nombre}" debería ser drawer_part`);
    }
    const hw = hardwareFor(pieces);
    const correderas = hw.find((h) => h.nombre === 'Correderas telescópicas');
    assert.ok(correderas, 'faltan las correderas telescópicas');
    assert.equal(correderas.cantidad, 2);
  });
});
