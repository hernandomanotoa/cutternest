/**
 * correderasOcultas.test.js
 *
 * Verifica el ejemplo de cajonera con correderas ocultas generado por
 * scripts/generar-ejemplos-assembly.mjs:
 *   - ejemplo-cajonera-correderas-ocultas.csv
 *     (cajonera 600×900×450, 3 cajones en correderas ocultas estilo
 *     Blum Tandem / Häfele Matrix UM)
 *
 * Casos: parseo sin warnings, roles sin fallback genérico, inferencia del tipo
 * de riel 'oculta' por keyword, geometría de la caja (laterales al ras del
 * frente, sin descuento lateral; base = vano − 42 mm) y hardware derivado
 * ('Correderas ocultas' con especificación 'vano − 42 mm').
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCSV } from './csvParser.js';
import { calculateHardware } from './hardware.js';
import { inferRole } from './services/classifierService.js';
import { inferRailType, railTypeFor } from './services/railService.js';
import { matchDrawerBoxParts, buildDrawerBoxGeometries } from './services/drawerGeometryService.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = 'ejemplo-cajonera-correderas-ocultas.csv';

function loadExample() {
  const text = fs.readFileSync(path.resolve(HERE, '..', 'data', FILE), 'utf8');
  return parseCSV(text);
}

describe('ejemplo cajonera con correderas ocultas', () => {
  it('parsea con ok:true y 0 warnings', () => {
    const result = loadExample();
    assert.equal(result.ok, true, `errores: ${(result.errors || []).join(' | ')}`);
    assert.deepEqual(result.warnings, [], `warnings: ${(result.warnings || []).join(' | ')}`);
  });

  it('sin piezas de rol genérico y frentes drawer_face', () => {
    const { pieces } = loadExample();
    for (const p of pieces) {
      assert.notEqual(inferRole(p), 'panel', `"${p.nombre}" cayó en el rol genérico`);
    }
    const frentes = pieces.filter((p) => p.nombre.includes('Frente cajon oculto'));
    assert.equal(frentes.length, 3, `se esperaban 3 frentes: ${frentes.map((f) => f.nombre).join(', ')}`);
    for (const f of frentes) {
      assert.equal(inferRole(f), 'drawer_face', `"${f.nombre}" debería ser drawer_face`);
    }
  });

  it('frentes inferen riel oculta por keyword', () => {
    const { pieces } = loadExample();
    const frentes = pieces.filter((p) => p.nombre.includes('Frente cajon oculto'));
    assert.equal(frentes.length, 3);
    for (const f of frentes) {
      assert.equal(inferRailType(f), 'oculta', `"${f.nombre}" debería inferir riel oculta`);
    }
  });

  it('caja del cajón oculto: laterales al ras del frente (sin holgura lateral) y base = vano − 42', () => {
    const { pieces } = loadExample();
    const frente = pieces.find((p) => p.nombre === 'Frente cajon oculto 1 M1');
    assert.ok(frente, 'falta el Frente cajon oculto 1 M1');
    const parts = matchDrawerBoxParts(frente, pieces);
    assert.ok(parts, 'no se emparejaron las piezas de la caja del cajón 1');
    const x = 100;
    const w = frente.ancho; // 568 = vano 570 − 2
    const box = buildDrawerBoxGeometries({
      parts,
      x,
      yFace: 400,
      z: 50,
      w,
      h: frente.alto,
      railType: railTypeFor(frente),
    });
    const laterales = box.filter((b) => b.role === 'drawer_side');
    assert.equal(laterales.length, 2);
    for (const l of laterales) {
      assert.equal(l.w, 16, 'los laterales del cajón oculto son de 16 mm (rango Blum 16/19)');
    }
    const izq = laterales.find((l) => l.id.includes('izq'));
    const der = laterales.find((l) => l.id.includes('der'));
    assert.equal(izq.x, x, 'el lateral izquierdo va al ras del frente (sin holgura de riel)');
    assert.equal(der.x, x + w - 16, 'el lateral derecho va al ras del frente (sin holgura de riel)');
    const base = box.find((b) => b.role === 'drawer_bottom');
    assert.ok(base, 'falta la base del cajón en la caja');
    assert.equal(base.w, 528, 'la base mide vano − 42 mm (570 − 42 = 528), deducción de la corredera oculta');
  });

  it('hardware: una entrada Correderas ocultas (3 pares) con especificación vano − 42 mm', () => {
    const { pieces } = loadExample();
    const hw = calculateHardware(pieces, []);
    const ocultas = hw.find((h) => h.nombre === 'Correderas ocultas');
    assert.ok(ocultas, 'faltan las Correderas ocultas en la lista de herrajes');
    assert.equal(ocultas.cantidad, 3, '1 par por cada uno de los 3 cajones');
    assert.match(ocultas.especificacion, /vano − 42 mm/);
    assert.match(ocultas.especificacion, /Blum Tandem/);
    assert.equal(
      hw.some((h) => h.nombre === 'Correderas telescópicas'),
      false,
      'ningún cajón de este ejemplo debería generar correderas telescópicas'
    );
  });
});
