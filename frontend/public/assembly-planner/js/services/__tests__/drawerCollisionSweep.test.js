// js/services/__tests__/drawerCollisionSweep.test.js — Barrido anti-solapes
// del catálogo: para cada CSV de data/, en cada módulo padre y con apertura 0,
// las piezas de la familia cajón (frente, laterales, base, fondo, cara,
// tirador) no deben producir NINGÚN par de colisión AABB. Regresión real
// (2026-09-12): el fondo se renderizaba con z = zBox (mismo borde inferior
// que la base) y la guía de colisión avisaba "La pieza 'Base ...' colisiona
// con 'Fondo ...' al abrir" en todos los cajones.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCSV } from '../../csvParser.js';
import { inferRole } from '../classifierService.js';
import { detectCollisions } from '../collisionService.js';
import { IsometricRenderer } from '../../isometricRenderer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', '..', '..', 'data');
const DRAWER_ROLES = new Set(['drawer_face', 'drawer_side', 'drawer_bottom', 'drawer_back', 'drawer_part', 'handle']);

const csvs = readdirSync(DATA_DIR).filter((f) => f.endsWith('.csv')).sort();
assert.ok(csvs.length >= 36, `se esperaban 36+ ejemplos en data/, hay ${csvs.length}`);

function parentModules(pieces) {
  const mods = [...new Set(pieces.map((p) => String(p.modulo)))]
    .filter((m) => m !== 'estructura' && m !== 'global');
  return mods.filter((m) => !mods.some((o) => o !== m && m.startsWith(o)));
}

function drawerPairsForModule(root, pieces) {
  const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1 });
  const { geometries } = renderer.computeGeometries(root, pieces);
  const roles = Object.fromEntries(pieces.map((p) => [p.id, inferRole(p)]));
  const drawerIds = new Set(
    pieces
      .filter((p) => String(p.modulo).startsWith(root) && DRAWER_ROLES.has(roles[p.id]))
      .map((p) => p.id)
  );
  return detectCollisions(geometries, drawerIds);
}

describe('barrido de colisiones en reposo (catálogo completo de data/)', () => {
  for (const csv of csvs) {
    it(`${csv}: sin pares de colisión entre piezas de cajón (apertura 0)`, () => {
      const { pieces, errors } = parseCSV(readFileSync(join(DATA_DIR, csv), 'utf8'));
      assert.deepEqual(errors, [], `errores de parseo en ${csv}`);
      const pares = [];
      for (const root of parentModules(pieces)) {
        for (const c of drawerPairsForModule(root, pieces)) {
          pares.push(`[${root}] ${c.aId} <-> ${c.bId} (vol ${c.volume.toFixed(1)})`);
        }
      }
      assert.deepEqual(pares, [], `${csv}: piezas de cajón que se solapan en reposo`);
    });
  }
});

describe('barrido con cajones abiertos (apertura global 1)', () => {
  for (const csv of csvs) {
    it(`${csv}: sin colisiones al abrir todos los cajones`, () => {
      const { pieces } = parseCSV(readFileSync(join(DATA_DIR, csv), 'utf8'));
      const pares = [];
      for (const root of parentModules(pieces)) {
        const renderer = new IsometricRenderer({ innerHTML: '' }, { scale: 0.1, aperturaGlobal: 1 });
        const { geometries } = renderer.computeGeometries(root, pieces);
        const roles = Object.fromEntries(pieces.map((p) => [p.id, inferRole(p)]));
        const drawerIds = new Set(
          pieces
            .filter((p) => String(p.modulo).startsWith(root) && DRAWER_ROLES.has(roles[p.id]))
            .map((p) => p.id)
        );
        for (const c of detectCollisions(geometries, drawerIds)) {
          pares.push(`[${root}] ${c.aId} <-> ${c.bId} (vol ${c.volume.toFixed(1)})`);
        }
      }
      assert.deepEqual(pares, [], `${csv}: colisiones al abrir todos los cajones`);
    });
  }
});
