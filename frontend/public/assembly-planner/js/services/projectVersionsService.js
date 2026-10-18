// js/services/projectVersionsService.js — Versiones de disenos del
// Assembly Planner en localStorage (key cn-assembly-versions).
// Mismo patron que userConfigService: puro, sin DOM, tolerante a storage
// ausente o JSON corrupto. El payload guarda piezas SERIALIZADAS (CSV) para
// que loadVersion() las re-parsee y obtenga derivados recalculados.

import { piecesToCSV, parseCSV } from './csvParser.js';

const STORAGE_KEY = 'cn-assembly-versions';
const SCHEMA = 1;
const MAX_VERSIONS = 50;

function getStorage() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Lee el contenedor completo { schema, versions }. JSON corrupto o schema
// desconocido -> contenedor vacio (no lanza).
function readContainer() {
  const storage = getStorage();
  if (!storage) return { schema: SCHEMA, versions: [] };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { schema: SCHEMA, versions: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.versions)) return { schema: SCHEMA, versions: [] };
    return { schema: SCHEMA, versions: parsed.versions };
  } catch {
    return { schema: SCHEMA, versions: [] };
  }
}

function writeContainer(container) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(container));
    return true;
  } catch {
    return false; // quota llena o storage de solo lectura
  }
}

// Guarda una version del diseno actual. `pieces` es el array del store;
// `dependencies` es opcional. Devuelve { ok, version?, error?, evicted? }.
export function saveVersion(name, { pieces, dependencies } = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { ok: false, error: 'El nombre de la version es obligatorio' };
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return { ok: false, error: 'No hay piezas que guardar' };
  }

  const container = readContainer();
  const version = {
    id: generateId(),
    name: trimmed.slice(0, 80),
    savedAt: new Date().toISOString(),
    pieceCount: pieces.length,
    csv: piecesToCSV(pieces),
    dependencies: Array.isArray(dependencies) ? dependencies : [],
  };
  container.versions.unshift(version);

  let evicted = null;
  if (container.versions.length > MAX_VERSIONS) {
    evicted = container.versions.pop();
  }
  if (!writeContainer(container)) {
    return { ok: false, error: 'No se pudo persistir (localStorage no disponible o lleno)' };
  }
  return { ok: true, version: publicVersion(version), evicted: evicted ? publicVersion(evicted) : null };
}

// Lista resumida (sin payload) ordenada por savedAt desc.
export function listVersions() {
  return readContainer().versions.map(publicVersion);
}

// Carga una version por id. Re-parsea el CSV para devolver piezas "limpias"
// (con derivados de classifyPiece recalculados). Devuelve
// { ok, name?, pieces?, dependencies?, error? }.
export function loadVersion(id) {
  const found = readContainer().versions.find((v) => v.id === id);
  if (!found) return { ok: false, error: 'Version no encontrada' };
  const result = parseCSV(found.csv);
  if (!result.ok) return { ok: false, error: 'CSV corrupto en la version guardada' };
  return {
    ok: true,
    name: found.name,
    savedAt: found.savedAt,
    pieces: result.pieces,
    dependencies: Array.isArray(found.dependencies) ? found.dependencies : [],
    warnings: result.warnings,
  };
}

export function deleteVersion(id) {
  const container = readContainer();
  const before = container.versions.length;
  container.versions = container.versions.filter((v) => v.id !== id);
  if (container.versions.length === before) return { ok: false, error: 'Version no encontrada' };
  writeContainer(container);
  return { ok: true };
}

export function deleteAllVersions() {
  writeContainer({ schema: SCHEMA, versions: [] });
  return { ok: true };
}

// Renombra una version (trim + max 80 chars, igual que saveVersion).
export function renameVersion(id, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { ok: false, error: 'El nombre de la version es obligatorio' };
  const container = readContainer();
  const found = container.versions.find((v) => v.id === id);
  if (!found) return { ok: false, error: 'Version no encontrada' };
  found.name = trimmed.slice(0, 80);
  writeContainer(container);
  return { ok: true, version: publicVersion(found) };
}

// Duplica una version (mismo payload, id y fecha nuevos, nombre + ' copia').
export function duplicateVersion(id) {
  const container = readContainer();
  const found = container.versions.find((v) => v.id === id);
  if (!found) return { ok: false, error: 'Version no encontrada' };
  const copy = {
    ...found,
    id: generateId(),
    name: `${found.name} copia`.slice(0, 80),
    savedAt: new Date().toISOString(),
  };
  container.versions.unshift(copy);
  let evicted = null;
  if (container.versions.length > MAX_VERSIONS) evicted = container.versions.pop();
  writeContainer(container);
  return { ok: true, version: publicVersion(copy), evicted: evicted ? publicVersion(evicted) : null };
}

// Nombre sugerido para la siguiente version: 'Closet v{N}' con N = count+1.
export function suggestedVersionName(prefix = 'Closet') {
  return `${prefix} v${countVersions() + 1}`;
}

// CSV crudo de una version (para exportar a archivo).
export function versionCsv(id) {
  const found = readContainer().versions.find((v) => v.id === id);
  if (!found) return null;
  return found.csv;
}

export function countVersions() {
  return readContainer().versions.length;
}

function publicVersion(v) {
  return {
    id: v.id,
    name: v.name,
    savedAt: v.savedAt,
    pieceCount: v.pieceCount,
  };
}
