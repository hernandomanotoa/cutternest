import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGapPreset, GAP_PRESETS } from './gapPresets.js';
import { VERTICAL_POSITIONS } from './config.js';

test('getGapPreset resuelve por nombre de archivo', () => {
  const preset = getGapPreset('ejemplo-closet-abierto-modular.csv');
  assert.equal(preset.hangerRailHeight, 1800);
  assert.equal(preset.stackGap, 25);
});

test('getGapPreset resuelve por ruta ./data/xxx.csv', () => {
  const preset = getGapPreset('./data/ejemplo-estanteria.csv');
  assert.equal(preset.stackGap, 30);
});

test('getGapPreset devuelve {} sin coincidencia', () => {
  assert.deepEqual(getGapPreset('no-existe.csv'), {});
  assert.deepEqual(getGapPreset(''), {});
  assert.deepEqual(getGapPreset(null), {});
});

test('los presets solo usan claves numéricas de VERTICAL_POSITIONS', () => {
  for (const [name, preset] of Object.entries(GAP_PRESETS)) {
    for (const [key, value] of Object.entries(preset)) {
      assert.ok(key in VERTICAL_POSITIONS, `${name}: ${key} no existe en VERTICAL_POSITIONS`);
      assert.ok(Number.isFinite(value), `${name}: ${key} debe ser numérico`);
    }
  }
});
