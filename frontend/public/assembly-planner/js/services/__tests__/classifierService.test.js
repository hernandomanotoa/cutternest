import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferRole, detectFamily } from '../../services/classifierService.js';

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
  });

  it('detects doors and handles', () => {
    assert.equal(inferRole(piece('Puerta Izquierda')), 'door');
    assert.equal(inferRole(piece('Tirador Metálico')), 'handle');
  });

  it('detects structural panels', () => {
    assert.equal(inferRole(piece('Zócalo')), 'bottom_panel');
    assert.equal(inferRole(piece('Estante 1')), 'shelf');
    assert.equal(inferRole(piece('Tapa')), 'top_panel');
    assert.equal(inferRole(piece('Fondo')), 'back_panel');
    assert.equal(inferRole(piece('Frente')), 'front_panel');
    assert.equal(inferRole(piece('Lateral Izquierdo')), 'side_panel');
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
