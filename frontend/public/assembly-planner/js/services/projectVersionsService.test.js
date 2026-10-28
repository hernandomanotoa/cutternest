import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  saveVersion,
  listVersions,
  loadVersion,
  deleteVersion,
  deleteAllVersions,
  countVersions,
  renameVersion,
  duplicateVersion,
  suggestedVersionName,
  versionCsv,
  saveAutosave,
  readAutosave,
  clearAutosave,
  AUTOSAVE_KEY,
} from './projectVersionsService.js';
import { createModule, addDrawer } from './closetBuilderService.js';
import { buildPlinthFrame, plinthTotalWidth } from './plinthFrameService.js';

function createMockStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; },
  };
}

function muebleDePrueba() {
  const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
  const cajon = addDrawer('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 });
  return [...casco.pieces, ...cajon.pieces];
}

describe('projectVersionsService', () => {
  beforeEach(() => {
    globalThis.localStorage = createMockStorage();
  });

  it('round-trip: guardar y cargar reproduce las piezas', () => {
    const pieces = muebleDePrueba();
    const saved = saveVersion('Closet demo', { pieces });
    assert.ok(saved.ok, saved.error);
    assert.equal(saved.version.name, 'Closet demo');
    assert.equal(saved.version.pieceCount, pieces.length);

    const loaded = loadVersion(saved.version.id);
    assert.ok(loaded.ok, loaded.error);
    assert.equal(loaded.name, 'Closet demo');
    assert.equal(loaded.pieces.length, pieces.length);
    assert.deepEqual(
      loaded.pieces.map((p) => `${p.id}:${p.ancho}x${p.alto}`),
      pieces.map((p) => `${p.id}:${p.ancho}x${p.alto}`),
    );
  });

  it('listVersions ordena por savedAt desc y resume sin payload', () => {
    saveVersion('Vieja', { pieces: muebleDePrueba() });
    saveVersion('Nueva', { pieces: muebleDePrueba() });
    const list = listVersions();
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'Nueva');
    assert.equal(list[1].name, 'Vieja');
    assert.ok(!('csv' in list[0]), 'el listado no debe exponer el payload');
  });

  it('rechaza nombre vacio y piezas vacias sin lanzar', () => {
    assert.equal(saveVersion('', { pieces: muebleDePrueba() }).ok, false);
    assert.equal(saveVersion('  ', { pieces: muebleDePrueba() }).ok, false);
    assert.equal(saveVersion('X', { pieces: [] }).ok, false);
    assert.equal(saveVersion('X', {}).ok, false);
  });

  it('deleteVersion elimina solo la indicada', () => {
    const a = saveVersion('A', { pieces: muebleDePrueba() });
    const b = saveVersion('B', { pieces: muebleDePrueba() });
    const r = deleteVersion(a.version.id);
    assert.ok(r.ok);
    assert.equal(countVersions(), 1);
    assert.equal(listVersions()[0].id, b.version.id);
    assert.equal(deleteVersion('no-existe').ok, false);
  });

  it('deleteAllVersions vacia el storage', () => {
    saveVersion('A', { pieces: muebleDePrueba() });
    saveVersion('B', { pieces: muebleDePrueba() });
    deleteAllVersions();
    assert.equal(countVersions(), 0);
    assert.deepEqual(listVersions(), []);
  });

  it('expulsa la version mas vieja al superar el limite', () => {
    const pieces = muebleDePrueba();
    let first = null;
    for (let i = 0; i < 52; i++) {
      const r = saveVersion(`V${i}`, { pieces });
      if (i === 0) first = r.version.id;
    }
    assert.equal(countVersions(), 50);
    const ids = listVersions().map((v) => v.id);
    assert.ok(!ids.includes(first), 'la mas vieja fue expulsada');
  });

  it('tolerante a JSON corrupto: comportamiento como storage vacio', () => {
    globalThis.localStorage = createMockStorage({ 'cn-assembly-versions': '{no-json' });
    assert.deepEqual(listVersions(), []);
    assert.equal(countVersions(), 0);
    const r = saveVersion('Recuperado', { pieces: muebleDePrueba() });
    assert.ok(r.ok, r.error);
    assert.equal(countVersions(), 1);
  });

  it('tolerante a localStorage ausente', () => {
    delete globalThis.localStorage;
    assert.doesNotThrow(() => saveVersion('X', { pieces: muebleDePrueba() }));
    assert.doesNotThrow(() => listVersions());
    assert.equal(countVersions(), 0);
  });

  it('loadVersion de id inexistente no lanza', () => {
    assert.equal(loadVersion('nope').ok, false);
  });

  it('renameVersion renombra y valida', () => {
    const s = saveVersion('Original', { pieces: muebleDePrueba() });
    const r = renameVersion(s.version.id, '  Nuevo nombre  ');
    assert.ok(r.ok);
    assert.equal(r.version.name, 'Nuevo nombre');
    assert.equal(loadVersion(s.version.id).name, 'Nuevo nombre');
    assert.equal(renameVersion(s.version.id, '').ok, false);
    assert.equal(renameVersion('nope', 'X').ok, false);
  });

  it('duplicateVersion copia payload con nombre + copia', () => {
    const s = saveVersion('Base', { pieces: muebleDePrueba() });
    const r = duplicateVersion(s.version.id);
    assert.ok(r.ok);
    assert.equal(r.version.name, 'Base copia');
    assert.equal(countVersions(), 2);
    const loaded = loadVersion(r.version.id);
    assert.ok(loaded.ok);
    assert.equal(loaded.pieces.length, muebleDePrueba().length);
  });

  it('suggestedVersionName numera secuencialmente', () => {
    assert.equal(suggestedVersionName(), 'Closet v1');
    saveVersion('A', { pieces: muebleDePrueba() });
    assert.equal(suggestedVersionName(), 'Closet v2');
    assert.equal(suggestedVersionName('Vestidor'), 'Vestidor v2');
  });

  it('versionCsv devuelve el CSV o null', () => {
    const s = saveVersion('CSV', { pieces: muebleDePrueba() });
    const csv = versionCsv(s.version.id);
    assert.ok(csv.includes('id,nombre,ancho'));
    assert.equal(versionCsv('nope'), null);
  });

  it('golaMetas: round-trip preserva el map moduleId→meta', () => {
    const pieces = muebleDePrueba();
    const golaMetas = {
      1: { moduleId: '1', origSpan: 777.5, origHeights: { 'm1cajon1-frente': 197 }, origTops: { 'm1cajon1-frente': 25 } },
    };
    const saved = saveVersion('Con gola', { pieces, golaMetas });
    assert.ok(saved.ok, saved.error);

    const loaded = loadVersion(saved.version.id);
    assert.ok(loaded.ok, loaded.error);
    assert.deepEqual(loaded.golaMetas, golaMetas);
  });

  it('golaMetas: version guardada sin el campo carga con null (dato viejo)', () => {
    const saved = saveVersion('Sin gola', { pieces: muebleDePrueba() });
    assert.ok(saved.ok, saved.error);
    const loaded = loadVersion(saved.version.id);
    assert.ok(loaded.ok, loaded.error);
    assert.equal(loaded.golaMetas, null);
  });

  it('golaMetas: version escrita a mano sin el campo (schema viejo) no rompe', () => {
    // Simula una version persistida antes de que existiera golaMetas:
    // inyecta el contenedor JSON directo, sin el campo.
    const pieces = muebleDePrueba();
    const csv = versionCsv(saveVersion('Tmp', { pieces }).version.id);
    const vieja = {
      schema: 1,
      versions: [{
        id: 'v-vieja', name: 'Legacy', savedAt: new Date().toISOString(),
        pieceCount: pieces.length, csv, dependencies: [],
      }],
    };
    globalThis.localStorage = createMockStorage({ 'cn-assembly-versions': JSON.stringify(vieja) });
    const loaded = loadVersion('v-vieja');
    assert.ok(loaded.ok, loaded.error);
    assert.equal(loaded.golaMetas, null);
    assert.equal(loaded.pieces.length, pieces.length);
  });

  it('golaMetas: duplicateVersion copia el campo', () => {
    const golaMetas = { 1: { moduleId: '1', origSpan: 100, origHeights: {}, origTops: {} } };
    const saved = saveVersion('Base', { pieces: muebleDePrueba(), golaMetas });
    const copy = duplicateVersion(saved.version.id);
    assert.ok(copy.ok);
    assert.deepEqual(loadVersion(copy.version.id).golaMetas, golaMetas);
  });

  it('golaModuleCfgs: round-trip preserva el map moduleId→cfg parcial', () => {
    const golaModuleCfgs = { 1: { golaPerfilHeight: 40, golaFijacion: 'Cola' }, 2: { golaPerfilHeight: 35 } };
    const saved = saveVersion('Cfg por módulo', { pieces: muebleDePrueba(), golaModuleCfgs });
    assert.ok(saved.ok, saved.error);

    const loaded = loadVersion(saved.version.id);
    assert.ok(loaded.ok, loaded.error);
    assert.deepEqual(loaded.golaModuleCfgs, golaModuleCfgs);
  });

  it('golaModuleCfgs: version guardada sin el campo carga con null (dato viejo)', () => {
    const saved = saveVersion('Sin cfg', { pieces: muebleDePrueba() });
    assert.ok(saved.ok);
    const loaded = loadVersion(saved.version.id);
    assert.ok(loaded.ok);
    assert.equal(loaded.golaModuleCfgs, null);
    assert.equal(loaded.golaMetas, null, 'golaMetas sigue tolerante también');
  });

  it('golaModuleCfgs: version escrita a mano sin el campo (schema viejo) no rompe', () => {
    const pieces = muebleDePrueba();
    const csv = versionCsv(saveVersion('Tmp2', { pieces }).version.id);
    const vieja = {
      schema: 1,
      versions: [{
        id: 'v-vieja-cfg', name: 'Legacy', savedAt: new Date().toISOString(),
        pieceCount: pieces.length, csv, dependencies: [],
        golaMetas: { 1: { moduleId: '1', origSpan: 100, origHeights: {}, origTops: {} } },
      }],
    };
    globalThis.localStorage = createMockStorage({ 'cn-assembly-versions': JSON.stringify(vieja) });
    const loaded = loadVersion('v-vieja-cfg');
    assert.ok(loaded.ok, loaded.error);
    assert.equal(loaded.golaModuleCfgs, null);
    assert.ok(loaded.golaMetas, 'el campo viejo sigue presente');
  });

  it('golaModuleCfgs: duplicateVersion copia el campo', () => {
    const golaModuleCfgs = { 1: { golaPerfilHeight: 40 } };
    const saved = saveVersion('Base cfg', { pieces: muebleDePrueba(), golaModuleCfgs });
    const copy = duplicateVersion(saved.version.id);
    assert.ok(copy.ok);
    assert.deepEqual(loadVersion(copy.version.id).golaModuleCfgs, golaModuleCfgs);
  });
});

describe('projectVersionsService/zócalo estructural a marco', () => {
  beforeEach(() => {
    globalThis.localStorage = createMockStorage();
  });

  it('round-trip: el layout segmentado del marco sobrevive al CSV de la versión', () => {
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    const marco = buildPlinthFrame({
      moduleWidths: [850], profundidad: 600, altoZocalo: 90, espesor: 18,
      drawerModules: [{ moduloId: '1', ancho: 850 }],
    });
    const pieces = [...casco.pieces, ...marco.pieces];
    assert.equal(plinthTotalWidth(pieces), 850);

    const saved = saveVersion('Closet con marco', { pieces });
    assert.ok(saved.ok, saved.error);
    const loaded = loadVersion(saved.version.id);
    assert.ok(loaded.ok, loaded.error);

    assert.equal(plinthTotalWidth(loaded.pieces), 850, 'ancho del marco derivable tras cargar');
    assert.ok(loaded.pieces.some((p) => p.id === 'glb-zocalo-divpar-1'), 'división paralela preservada');
    // El validador no debe quejarse de la suma de bases tras el round-trip.
    assert.ok(
      !(loaded.warnings || []).some((w) => w.includes('no coincide con suma de bases')),
      `aviso espurio: ${(loaded.warnings || []).join(' | ')}`
    );
  });
});

describe('projectVersionsService/autoguardado (cn-assembly-autosave)', () => {
  beforeEach(() => {
    globalThis.localStorage = createMockStorage();
  });

  it('round-trip: autoguardar y leer reproduce las piezas', () => {
    const pieces = muebleDePrueba();
    const saved = saveAutosave(pieces);
    assert.ok(saved.ok, saved.error);

    const auto = readAutosave();
    assert.ok(auto.ok, auto.error);
    assert.ok(auto.savedAt, 'guarda la marca de tiempo');
    assert.equal(auto.pieces.length, pieces.length);
    assert.deepEqual(
      auto.pieces.map((p) => `${p.id}:${p.ancho}x${p.alto}`),
      pieces.map((p) => `${p.id}:${p.ancho}x${p.alto}`),
    );
  });

  it('readAutosave sin clave, con JSON corrupto o con CSV corrupto devuelve ok:false', () => {
    assert.equal(readAutosave().ok, false);

    globalThis.localStorage.setItem(AUTOSAVE_KEY, '{corrupto');
    assert.equal(readAutosave().ok, false);

    globalThis.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ savedAt: 'x', csv: 'esto,no,es,csv,valido' }));
    assert.equal(readAutosave().ok, false);
  });

  it('clearAutosave elimina la clave', () => {
    saveAutosave(muebleDePrueba());
    assert.equal(readAutosave().ok, true);
    clearAutosave();
    assert.equal(readAutosave().ok, false);
  });

  it('saveAutosave rechaza una lista vacía de piezas', () => {
    assert.equal(saveAutosave([]).ok, false);
  });
});
