import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferRole, detectFamily, isDividerVertical } from '../../services/classifierService.js';

const piece = (name, overrides = {}) => ({
  id: overrides.id ?? 'P-1',
  nombre: name,
  ancho: overrides.ancho ?? 500,
  alto: overrides.alto ?? 300,
  modulo: overrides.modulo ?? '1',
});

describe('inferRole', () => {
  it('detects drawer parts', () => {
    assert.equal(inferRole(piece('Frente Cajón 1')), 'drawer_face');
    assert.equal(inferRole(piece('Lateral Cajón')), 'drawer_side');
    assert.equal(inferRole(piece('Base cajón')), 'drawer_bottom');
    assert.equal(inferRole(piece('Fondo Cajón')), 'drawer_back');
    assert.equal(inferRole(piece('Tirador Cajón')), 'handle');
    assert.equal(inferRole(piece('Cajón sin más')), 'drawer_part');
    assert.equal(inferRole(piece('Cara cajon sup M1')), 'drawer_part', 'la cara no cae en panel genérico');
  });

  it('detects doors and handles', () => {
    assert.equal(inferRole(piece('Puerta Izquierda')), 'door');
    assert.equal(inferRole(piece('Tirador Metálico')), 'handle');
  });

  it('detects structural panels', () => {
    assert.equal(inferRole(piece('Zócalo', { modulo: 'estructura' })), 'bottom_panel');
    assert.equal(inferRole(piece('Zócalo', { modulo: '1' })), 'plinth');
    assert.equal(inferRole(piece('Estante 1')), 'shelf');
    assert.equal(inferRole(piece('Tapa')), 'top_panel');
    assert.equal(inferRole(piece('Fondo')), 'back_panel');
    assert.equal(inferRole(piece('Frente')), 'front_panel');
    assert.equal(inferRole(piece('Lateral Izquierdo')), 'side_panel');
  });

  it('detects shoe racks as shelves', () => {
    assert.equal(inferRole(piece('Zapatero inclinado 1', { ancho: 829, alto: 330 })), 'shelf');
    assert.equal(inferRole(piece('Estante regulable', { ancho: 829, alto: 550 })), 'shelf');
  });

  it('detects entrepaños as shelves', () => {
    assert.equal(inferRole(piece('Entrepaño botellero 1', { ancho: 350, alto: 300 })), 'shelf');
    assert.equal(inferRole(piece('Entrepano botellero 2', { ancho: 350, alto: 300 })), 'shelf');
  });

  it('falls back to shape heuristics', () => {
    assert.equal(inferRole(piece('Tabla', { ancho: 1200, alto: 100 })), 'shelf');
    assert.equal(inferRole(piece('Tabla', { ancho: 100, alto: 1200 })), 'side_panel');
  });

  it('defaults to panel', () => {
    assert.equal(inferRole(piece('Pieza genérica')), 'panel');
  });
});

describe('detectFamily', () => {
  it('detects seating when legs and seat/back exist', () => {
    const pieces = [piece('Pata Delantera', { id: 'P-1' }), piece('Asiento', { id: 'P-2' }), piece('Respaldo', { id: 'P-3' })];
    assert.equal(detectFamily(pieces), 'seating');
  });

  it('detects table when only legs', () => {
    const pieces = [piece('Pata', { id: 'P-1' })];
    assert.equal(detectFamily(pieces), 'table');
  });

  it('detects wardrobe when doors exist', () => {
    const pieces = [piece('Puerta', { id: 'P-1' })];
    assert.equal(detectFamily(pieces), 'wardrobe');
  });

  it('detects cabinet when drawers exist', () => {
    const pieces = [piece('Cajón 1', { id: 'P-1' })];
    assert.equal(detectFamily(pieces), 'cabinet');
  });

  it('filters by module id', () => {
    const pieces = [
      piece('Puerta', { id: 'P-1', modulo: '2' }),
      piece('Cajón', { id: 'P-2', modulo: '1' }),
    ];
    assert.equal(detectFamily(pieces, '2'), 'wardrobe');
    assert.equal(detectFamily(pieces, '1'), 'cabinet');
  });
});

describe('inferRole - dividers', () => {
  it('classifies central divider/montante as divider', () => {
    assert.equal(inferRole(piece('Montante central', { ancho: 300, alto: 2200 })), 'divider');
    assert.equal(inferRole(piece('Divisor central', { ancho: 250, alto: 1800 })), 'divider');
  });

  it('classifies side dividers as divider', () => {
    assert.equal(inferRole(piece('Divisor izquierdo', { ancho: 30, alto: 2200 })), 'divider');
    assert.equal(inferRole(piece('Divisor derecho', { ancho: 30, alto: 2200 })), 'divider');
  });
});

describe('inferRole - zapatera-cajón', () => {
  it('zapatera extraíble: familia cajón sin la palabra "cajon"', () => {
    assert.equal(inferRole(piece('Lateral zapatera extraible 1 izq')), 'drawer_side');
    assert.equal(inferRole(piece('Lateral zapatera extraible 1 der')), 'drawer_side');
    assert.equal(inferRole(piece('Frente zapatera extraible 1')), 'drawer_face');
    assert.equal(inferRole(piece('Base zapatera extraible 1')), 'drawer_bottom');
    assert.equal(inferRole(piece('Fondo zapatera extraible 1')), 'drawer_back');
    assert.equal(inferRole(piece('Tirador zapatera extraible 1')), 'handle');
    assert.equal(inferRole(piece('Pieza zapatera extraible 1')), 'drawer_part');
    assert.equal(inferRole(piece('Cara zapatera extraible 1')), 'drawer_part', 'la cara de zapatera no cae en panel genérico');
  });

  it('zapatera en riel/corredera también es familia cajón', () => {
    assert.equal(inferRole(piece('Frente zapatera riel 1')), 'drawer_face');
    assert.equal(inferRole(piece('Frente zapatero corredera 1')), 'drawer_face');
  });

  it('zapatero fijo sin keyword de deslizamiento sigue siendo shelf', () => {
    assert.equal(inferRole(piece('Bandeja zapatero', { ancho: 870, alto: 15 })), 'shelf');
    assert.equal(inferRole(piece('Zapatero compartimentos', { ancho: 870, alto: 15 })), 'shelf');
  });

  it('laterales/base estructurales sin zapatera no se ven afectados', () => {
    assert.equal(inferRole(piece('Lateral izquierdo')), 'side_panel');
    assert.equal(inferRole(piece('Base modulo M1')), 'bottom_panel');
  });
});

describe('isDividerVertical', () => {
  it('detects tall dividers as vertical', () => {
    assert.equal(isDividerVertical(piece('Division vertical', { ancho: 550, alto: 2400 })), true);
    assert.equal(isDividerVertical(piece('Divisor', { ancho: 18, alto: 1800 })), true);
  });

  it('detects wide dividers as horizontal', () => {
    assert.equal(isDividerVertical(piece('Division horizontal', { ancho: 800, alto: 18 })), false);
    assert.equal(isDividerVertical(piece('Divisor', { ancho: 600, alto: 200 })), false);
  });

  it('respects rotate flag', () => {
    assert.equal(isDividerVertical({ nombre: 'Divisor', ancho: 2400, alto: 550, rotate: 'si' }), true);
    assert.equal(isDividerVertical({ nombre: 'Divisor', ancho: 550, alto: 2400, rotate: 'si' }), false);
  });
});
