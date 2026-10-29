// js/core/contentTypes.test.js — Invariantes del catálogo de tipos de
// contenido del Constructor (cajones y zapateras): ids únicos, alturas de
// vano positivas, RAIL_SIDE_HEIGHT estable y frenteCompleto restringido a
// zapateras altas (botas).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAIL_SIDE_HEIGHT,
  BANDEJA_RIM_HEIGHT,
  DRAWER_TYPES,
  SHOE_RACK_TYPES,
  getContentType,
  stampTipoTag,
  tipoTagDe,
  vanoDesdeCara,
} from './contentTypes.js';

const TODOS = [...DRAWER_TYPES, ...SHOE_RACK_TYPES];

describe('RAIL_SIDE_HEIGHT', () => {
  it('es 100 mm (cubre la corredera telescópica con margen)', () => {
    assert.equal(RAIL_SIDE_HEIGHT, 100);
    assert.ok(Number.isFinite(RAIL_SIDE_HEIGHT));
  });
});

describe('catálogos: forma básica de cada entrada', () => {
  it('cada tipo tiene id y label no vacíos', () => {
    for (const t of TODOS) {
      assert.equal(typeof t.id, 'string', JSON.stringify(t));
      assert.ok(t.id.trim().length > 0, `id vacío en ${JSON.stringify(t)}`);
      assert.equal(typeof t.label, 'string');
      assert.ok(t.label.trim().length > 0, `label vacío en ${t.id}`);
      assert.equal(typeof t.frenteCompleto, 'boolean', `${t.id}: frenteCompleto booleano`);
    }
  });

  it('altoVano es numérico, finito y positivo en todos los tipos', () => {
    for (const t of TODOS) {
      assert.equal(typeof t.altoVano, 'number', `${t.id}: altoVano numérico`);
      assert.ok(Number.isFinite(t.altoVano), `${t.id}: altoVano finito`);
      assert.ok(t.altoVano > 0, `${t.id}: altoVano positivo (got ${t.altoVano})`);
    }
  });

  it('los ids son únicos entre ambos catálogos (incluida la resolución cruzada)', () => {
    const ids = TODOS.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, `ids duplicados: ${ids}`);
  });
});

describe('frenteCompleto', () => {
  it('ningún cajón (DRAWER_TYPES) tiene frente completo', () => {
    for (const t of DRAWER_TYPES) {
      assert.equal(t.frenteCompleto, false, `${t.id}: el cajón nunca cubre todo el vano`);
    }
  });

  it('solo las zapateras altas tienen frente completo', () => {
    const completas = SHOE_RACK_TYPES.filter((t) => t.frenteCompleto);
    assert.deepEqual(completas.map((t) => t.id), ['botas'],
      'frenteCompleto solo en botas (cubre el vano entero, sin cara)');
  });

  it('frenteCompleto=true implica zapatera alta (≥400 mm) y viceversa para botas', () => {
    const ALTURA_MINIMA_FRENTE_COMPLETO = 400;
    for (const t of SHOE_RACK_TYPES) {
      if (t.frenteCompleto) {
        assert.ok(t.altoVano >= ALTURA_MINIMA_FRENTE_COMPLETO,
          `${t.id}: frente completo exige vano alto (got ${t.altoVano})`);
      } else {
        assert.ok(t.altoVano < ALTURA_MINIMA_FRENTE_COMPLETO,
          `${t.id}: vano bajo con frente completo sería inconsistente (got ${t.altoVano})`);
      }
    }
  });

  it('botas es la zapatera de mayor vano', () => {
    const max = Math.max(...SHOE_RACK_TYPES.map((t) => t.altoVano));
    const botas = SHOE_RACK_TYPES.find((t) => t.id === 'botas');
    assert.equal(botas.altoVano, max);
  });
});

describe('getContentType', () => {
  it('resuelve tipos de cajón en DRAWER_TYPES', () => {
    const t = getContentType('drawer', 'estandar');
    assert.ok(t);
    assert.equal(t.id, 'estandar');
    assert.equal(t.altoVano, 200);
    assert.equal(t.frenteCompleto, false);
  });

  it('resuelve tipos de zapatera en SHOE_RACK_TYPES', () => {
    const t = getContentType('shoeRack', 'botas');
    assert.ok(t);
    assert.equal(t.frenteCompleto, true);
    assert.equal(t.altoVano, 450);
  });

  it("la bandeja a la vista trae ladosIguales y rim apenas más alto que la riel", () => {
    const t = getContentType('shoeRack', 'bandeja');
    assert.ok(t);
    assert.equal(t.ladosIguales, true, 'lados iguales cuando va sin frente');
    assert.equal(t.frenteCompleto, false);
    assert.equal(t.altoVano, 160);
    assert.ok(BANDEJA_RIM_HEIGHT > RAIL_SIDE_HEIGHT, 'rim un poco más alto que la riel');
    assert.ok(BANDEJA_RIM_HEIGHT <= t.altoVano - 33 + 1,
      'el rim cabe en el vano de su tipo (o queda saturado)');
  });

  it('kind desconocido cae al catálogo de cajones', () => {
    assert.equal(getContentType('otro', 'estandar').id, 'estandar');
  });

  it('devuelve null para ids inexistentes', () => {
    assert.equal(getContentType('drawer', 'botas'), null, 'botas no existe en cajones');
    assert.equal(getContentType('shoeRack', 'estandar'), null);
    assert.equal(getContentType('drawer', 'nope'), null);
    assert.equal(getContentType('drawer', null), null);
    assert.equal(getContentType('drawer', undefined), null);
  });
});

describe('tag de tipo en el nombre (contrato que sobrevive al CSV)', () => {
  it('stampTipoTag inserta [id] tras la primera palabra; tipoTagDe lo extrae', () => {
    const n = stampTipoTag('Frente zapatera extraible 1 M1', 'bandeja');
    assert.equal(n, 'Frente [bandeja] zapatera extraible 1 M1');
    assert.equal(tipoTagDe(n), 'bandeja');
    assert.equal(tipoTagDe('Cara [tenis] zapatera extraible 2 M1'), 'tenis');
  });

  it('sin tipoId no-op; sin tag / nulo → null', () => {
    assert.equal(stampTipoTag('Frente cajon 1 M1', null), 'Frente cajon 1 M1');
    assert.equal(tipoTagDe('Frente cajon 1 M1'), null);
    assert.equal(tipoTagDe(''), null);
    assert.equal(tipoTagDe(null), null);
  });

  it('fijoEnGola: todas las zapateras fijas en el gola, ningún cajón', () => {
    for (const t of SHOE_RACK_TYPES) {
      assert.equal(t.fijoEnGola, true, `${t.id}: el frente de zapatera conserva su tipo`);
    }
    for (const t of DRAWER_TYPES) {
      assert.ok(!t.fijoEnGola, `${t.id}: el cajón reescala en el gola`);
    }
  });
});

describe('contrato completo de tipo (fase 2)', () => {
  it('cada tipo declara las claves del contrato con el tipo correcto', () => {
    for (const t of TODOS) {
      assert.equal(typeof t.conFrenteDefault, 'boolean', `${t.id}: conFrenteDefault booleano`);
      assert.equal(typeof t.fijoEnGola, 'boolean', `${t.id}: fijoEnGola booleano`);
      assert.equal(typeof t.cajaDelta, 'number', `${t.id}: cajaDelta numérico`);
      assert.ok(t.cajaDelta > 0, `${t.id}: cajaDelta positivo`);
      if (t.rim != null) {
        assert.ok(t.ladosIguales, `${t.id}: rim solo con ladosIguales (bandeja a la vista)`);
        assert.ok(t.rim > RAIL_SIDE_HEIGHT - 1, `${t.id}: rim al menos a la altura de la riel`);
      }
    }
  });

  it('por defecto las zapateras llevan frente; la bandeja a la vista es la excepción', () => {
    for (const t of SHOE_RACK_TYPES) {
      assert.equal(t.conFrenteDefault, t.id !== 'bandeja',
        `${t.id}: conFrenteDefault ${t.id === 'bandeja' ? 'false (se ve)' : 'true'}`);
    }
    for (const t of DRAWER_TYPES) {
      assert.equal(t.conFrenteDefault, true, `${t.id}: el cajón siempre lleva frente`);
    }
  });

  it('vanoDesdeCara: con tag usa el contrato; sin tag el histórico 33', () => {
    const caraTag = { nombre: 'Cara [tenis] zapatera extraible 1 M1', alto: 167 };
    assert.equal(vanoDesdeCara(caraTag), 167 + 30 + 3, 'tag: cara + cajaDelta + luz');
    const caraSinTag = { nombre: 'Cara zapatera extraible 1 M1', alto: 167 };
    assert.equal(vanoDesdeCara(caraSinTag), 200, 'sin tag: histórico 33');
    // cajaDelta del contrato distinto cambia la reconstrucción:
    const caraDelta = { nombre: 'Cara [custom] zapatera x M1', alto: 170 };
    assert.equal(vanoDesdeCara(caraDelta), 170 + 33, 'tipo desconocido: cae al 30+3');
  });
});
