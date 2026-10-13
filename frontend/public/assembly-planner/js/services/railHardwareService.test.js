// railHardwareService.test.js — contrato de textos de herrajes por tipo de riel

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAIL_TYPES, DEFAULT_RAIL_TYPE } from '../core/config.js';
import {
  railHardwareName,
  railHardwareSpec,
  railConfirmationMessage,
  railInstallText,
} from './railHardwareService.js';

test('railHardwareName devuelve el nombre por tipo de riel conocido', () => {
  assert.equal(railHardwareName('telescopica'), 'Correderas telescópicas');
  assert.equal(railHardwareName('oculta'), 'Correderas ocultas');
  assert.equal(railHardwareName('ruedas'), 'Correderas euro ruedas');
  assert.equal(railHardwareName('ligera'), 'Correderas ligeras');
});

test('railHardwareName cae a telescópica (DEFAULT_RAIL_TYPE) para tipos desconocidos', () => {
  for (const type of [undefined, null, '', 'inexistente', 42]) {
    assert.equal(railHardwareName(type), railHardwareName(DEFAULT_RAIL_TYPE), `fallback para ${type}`);
  }
});

test('railHardwareSpec devuelve la especificación por tipo', () => {
  assert.match(railHardwareSpec('telescopica'), /Extensión total/);
  assert.match(railHardwareSpec('oculta'), /vano − 42 mm/);
  assert.match(railHardwareSpec('ruedas'), /Extensión parcial/);
  assert.match(railHardwareSpec('ligera'), /uso ligero/);
});

test('railHardwareSpec cae a telescópica para tipos desconocidos', () => {
  assert.equal(railHardwareSpec('otro'), railHardwareSpec(DEFAULT_RAIL_TYPE));
  assert.equal(railHardwareSpec(undefined), railHardwareSpec(DEFAULT_RAIL_TYPE));
});

test('las holguras citadas en las especificaciones son coherentes con RAIL_TYPES', () => {
  // telescópica: 12,7 mm por lado → "vano − 25,4 mm"
  assert.equal(RAIL_TYPES.telescopica.sideClearance * 2, 25.4);
  assert.match(railHardwareSpec('telescopica'), /vano − 25,4 mm/);
  assert.match(railHardwareSpec('ruedas'), /vano − 25 mm/);
  assert.equal(RAIL_TYPES.ruedas.sideClearance * 2, 25);
  // oculta: deducción de ancho INTERIOR (−42 mm), no de ancho exterior
  assert.equal(RAIL_TYPES.oculta.sideClearance, 0);
  assert.match(railHardwareSpec('oculta'), /ancho interior de cajón = vano − 42 mm/);
  // ligera: 10 mm por lado → "vano − 20 mm" en la confirmación
  assert.equal(RAIL_TYPES.ligera.sideClearance * 2, 20);
  assert.match(railHardwareName('ligera'), /ligeras/);
});

test('railConfirmationMessage infiere el tipo de riel de la pieza', () => {
  assert.match(railConfirmationMessage({ nombre: 'Frente cajon 1' }), /telescópica/);
  assert.match(railConfirmationMessage({ nombre: 'Frente cajon oculto 1' }), /oculta/);
  assert.match(railConfirmationMessage({ nombre: 'Frente cajon ruedas 1' }), /ruedas/);
  assert.match(
    railConfirmationMessage({ nombre: 'Bandeja zapatera riel 1' }),
    /ligera/,
  );
});

test('railConfirmationMessage incluye la deducción de vano correcta por tipo', () => {
  assert.match(railConfirmationMessage({ nombre: 'Frente cajon 1' }), /vano − 25,4 mm/);
  assert.match(railConfirmationMessage({ nombre: 'Frente cajon oculto 1' }), /vano − 42 mm/);
  assert.match(railConfirmationMessage({ nombre: 'Frente cajon ruedas 1' }), /vano − 25 mm/);
  assert.match(railConfirmationMessage({ nombre: 'Bandeja zapatera corredera 1' }), /vano − 20 mm/);
});

test('railConfirmationMessage cae al default si la inferencia no existe en RAIL_TYPES', () => {
  // railTypeFor garantiza un tipo válido; incluso con pieza sin nombre debe responder
  assert.equal(
    railConfirmationMessage({}),
    railConfirmationMessage({ nombre: 'Frente cajon 1' }),
  );
});

test('railInstallText devuelve el texto de instalación por tipo inferido', () => {
  assert.match(railInstallText({ nombre: 'Frente cajon 1' }), /telescópicas de extensión total/);
  assert.match(railInstallText({ nombre: 'Frente cajon oculto 1' }), /ocultas \(ancho interior = vano − 42 mm/);
  assert.match(railInstallText({ nombre: 'Frente cajon ruedas 1' }), /ruedas de extensión parcial/);
  assert.match(railInstallText({ nombre: 'Bandeja zapatera riel 1' }), /ligeras de extensión parcial/);
});

test('railInstallText termina indicando que el riel ya fue confirmado', () => {
  for (const nombre of ['Frente cajon 1', 'Frente cajon oculto 1', 'Frente cajon ruedas 1', 'Bandeja zapatera riel 1']) {
    assert.match(railInstallText({ nombre }), /ya confirmadas/);
  }
});
