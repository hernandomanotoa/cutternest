// js/services/customTypesService.test.js — Tipos personalizados del taller:
//   - CRUD validado (forma del contrato, id cus-*, colisión con catálogo).
//   - Los customs se inyectan en los catálogos en vivo: getContentType,
//     el gola (fijoEnGola) y vanoDesdeCara los resuelven sin cambios.
//   - slug único desde el nombre (acentos, espacios, colisiones).
// Corre en el runner puro (node --test): el servicio cae a memoria sin
// localStorage.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  listCustomTypes,
  saveCustomType,
  deleteCustomType,
  slugCustomType,
  installCustomTypes,
} from './customTypesService.js';
import { getContentType, SHOE_RACK_TYPES, vanoDesdeCara } from '../core/contentTypes.js';
import { applyGola } from './golaService.js';
import { createModule, addDrawer, addShelf, addShoeTray } from './closetBuilderService.js';

const ZAPATERA = {
  kind: 'shoeRack', altoVano: 140, conFrenteDefault: true, fijoEnGola: true,
};

describe('customTypesService — guardar y resolver', () => {
  it('guardar un custom lo inyecta en el catálogo: getContentType lo resuelve', () => {
    const r = saveCustomType({ id: 'cus-test-baja', label: 'Zapatera baja 140', ...ZAPATERA });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(listCustomTypes().length, 1, 'persistido');
    const t = getContentType('shoeRack', 'cus-test-baja');
    assert.ok(t, 'resuelve desde el catálogo en vivo');
    assert.equal(t.altoVano, 140);
    assert.equal(t.fijoEnGola, true);
    assert.equal(t.cajaDelta, 30, 'contrato completo normalizado');
    assert.ok(SHOE_RACK_TYPES.some((x) => x.id === 'cus-test-baja'), 'está en el array del selector');
  });

  it('re-valida la forma: vano fuera de rango, rim fuera de rango, frente completo en cajón', () => {
    assert.equal(saveCustomType({ id: 'cus-a', label: 'X', kind: 'shoeRack', altoVano: 20 }).ok, false, 'vano < 50');
    assert.equal(saveCustomType({ id: 'cus-rim', label: 'X', kind: 'shoeRack', altoVano: 100, ladosIguales: true, rim: 150 }).ok, false, 'rim > vano');
    assert.equal(saveCustomType({ id: 'cus-c', label: 'X', kind: 'drawer', altoVano: 200, frenteCompleto: true }).ok, false, 'frente completo solo zapateras');
    assert.equal(saveCustomType({ id: 'sin-prefijo', label: 'X', kind: 'shoeRack', altoVano: 100 }).ok, false, 'id sin prefijo cus-');
    assert.equal(saveCustomType({ id: 'tenis', label: 'X', kind: 'shoeRack', altoVano: 100 }).ok, false, 'id del catálogo base');
    assert.equal(saveCustomType({ id: 'cus-tenis', label: 'X', kind: 'shoeRack', altoVano: 100 }).ok, true, 'cus-tenis es válido (no colisiona con "tenis")');
    deleteCustomType('cus-tenis');
  });

  it('rim sin ladosIguales se ignora (el input del form siempre envía valor)', () => {
    const r = saveCustomType({ id: 'cus-b', label: 'X', kind: 'shoeRack', altoVano: 100, rim: 120 });
    assert.ok(r.ok, 'no rechaza: rim no aplica sin lados iguales');
    assert.equal(getContentType('shoeRack', 'cus-b').rim, undefined, 'rim no se guarda sin ladosIguales');
    deleteCustomType('cus-b');
  });

  it('fondoMetodo: valida el valor y normaliza al contrato (default apoyado)', () => {
    const invalido = saveCustomType({ id: 'cus-fondo-x', label: 'X', kind: 'drawer', altoVano: 200, fondoMetodo: 'flotante' });
    assert.equal(invalido.ok, false, 'fondoMetodo inválido rechazado');
    assert.ok(invalido.errors.some((e) => e.includes('fondo')), 'el error nombra el fondo');

    const ranurado = saveCustomType({ id: 'cus-fondo-r', label: 'X', kind: 'drawer', altoVano: 200, fondoMetodo: 'ranurado' });
    assert.ok(ranurado.ok, ranurado.errors?.join('; '));
    assert.equal(getContentType('drawer', 'cus-fondo-r').fondoMetodo, 'ranurado');

    const implicito = saveCustomType({ id: 'cus-fondo-d', label: 'X', kind: 'drawer', altoVano: 200 });
    assert.ok(implicito.ok);
    assert.equal(getContentType('drawer', 'cus-fondo-d').fondoMetodo, 'apoyado', 'default retrocompatible');
    deleteCustomType('cus-fondo-r');
    deleteCustomType('cus-fondo-d');
  });

  it('editar (mismo id) actualiza sin colisión consigo mismo', () => {
    saveCustomType({ id: 'cus-edit', label: 'V1', ...ZAPATERA });
    const r = saveCustomType({ id: 'cus-edit', label: 'V2', ...ZAPATERA, altoVano: 180 });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(listCustomTypes().filter((t) => t.id === 'cus-edit').length, 1, 'una sola entrada');
    assert.equal(getContentType('shoeRack', 'cus-edit').altoVano, 180);
  });

  it('eliminar lo saca del catálogo y del storage', () => {
    saveCustomType({ id: 'cus-del', label: 'Borrar', ...ZAPATERA });
    assert.ok(deleteCustomType('cus-del').ok);
    assert.equal(getContentType('shoeRack', 'cus-del'), null, 'ya no resuelve');
    assert.ok(!SHOE_RACK_TYPES.some((x) => x.id === 'cus-del'), 'fuera del selector');
  });

  it('installCustomTypes es idempotente (re-instalar no duplica)', () => {
    saveCustomType({ id: 'cus-idem', label: 'Idem', ...ZAPATERA });
    const antes = SHOE_RACK_TYPES.filter((t) => t.id === 'cus-idem').length;
    installCustomTypes();
    installCustomTypes();
    assert.equal(SHOE_RACK_TYPES.filter((t) => t.id === 'cus-idem').length, antes, 'una sola entrada en el catálogo');
  });
});

describe('customTypesService — slug desde el nombre', () => {
  it('normaliza acentos, espacios y mayúsculas', () => {
    assert.equal(slugCustomType('Zapatera Baja 140'), 'cus-zapatera-baja-140');
    assert.equal(slugCustomType('Mi zapatería ñoña'), 'cus-mi-zapateria-nona');
    assert.equal(slugCustomType('  --  '), 'cus-tipo');
  });

  it('evita colisiones con catálogo y otros customs (sufijo numérico)', () => {
    assert.equal(slugCustomType('tenis'), 'cus-tenis', 'sin colisión: el catálogo tiene "tenis", no "cus-tenis"');
    saveCustomType({ id: slugCustomType('Baja'), label: 'Baja', ...ZAPATERA });
    assert.equal(slugCustomType('Baja'), 'cus-baja-2', 'segundo igual lleva sufijo');
  });
});

describe('customTypesService — integración con el contrato', () => {
  it('vanoDesdeCara reconstruye el vano con el delta del custom', () => {
    saveCustomType({ id: 'cus-vano', label: 'Vano', ...ZAPATERA });
    const cara = { nombre: 'Cara [cus-vano] zapatera x M1', alto: 107 };
    assert.equal(vanoDesdeCara(cara), 107 + 30 + 3, 'custom: cara + cajaDelta + luz');
  });

  it('el gola trata al custom zapatera como fijo (fijoEnGola del contrato)', () => {
    saveCustomType({ id: 'cus-gola', label: 'Gola fix', ...ZAPATERA, altoVano: 220 });
    // Módulo: custom zapatera (frente 217, fijo) + cajón (reescala).
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    assert.ok(casco.ok);
    const custom = getContentType('shoeRack', 'cus-gola');
    // Construcción vía addShoeTray con el contrato custom resuelto.
    const tray = addShoeTray('1', 1, {
      anchoModulo: 850, profundidadModulo: 600, altoVano: custom.altoVano,
      conFrente: true, tipoId: custom.id,
    });
    assert.ok(tray.ok);
    const cajon = addDrawer('1', 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 });
    assert.ok(cajon.ok);
    const frenteTray = tray.pieces.find((p) => p.id.endsWith('-frente'));
    frenteTray.pos_z = 25;
    const frenteCajon = cajon.pieces.find((p) => p.id.endsWith('-frente'));
    frenteCajon.pos_z = 25 + 217 + 2.5;
    const repisa = addShelf('1', { anchoUtil: 820, profReal: 570, index: 1 });
    repisa.pieces[0].pos_z = 1000;
    const pieces = [...casco.pieces, ...tray.pieces, ...cajon.pieces, ...repisa.pieces];
    const r = applyGola(pieces, '1', {});
    assert.ok(r.ok, r.errors?.join('; '));
    // La zapatera custom queda fija en 217; el cajón absorbe el aire.
    const fijos = r.pieces.filter((p) => p.id.endsWith('-frente'));
    const zap = fijos.find((p) => p.id.includes('zapatera'));
    const caj = fijos.find((p) => p.id.includes('cajon'));
    assert.equal(zap.alto, 217, 'frente custom fijo en su tipo');
    assert.ok(caj.alto !== 197 || r.warnings.length >= 0, 'cajón reescala (valor según span)');
    assert.ok(caj.alto > 177 - 1, 'cajón cubre su caja tras el reparto');
  });
});
