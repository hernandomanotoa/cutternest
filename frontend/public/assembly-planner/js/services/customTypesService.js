// js/services/customTypesService.js — Tipos de contenido personalizados del
// taller (fase final del contrato de tipos): el usuario crea sus propios
// tipos de cajón/zapatera (vano, frente por defecto, lados iguales + rim,
// fijo en gola) y aparecen en los selectores del Constructor.
//
// Los customs se INYECTAN en los catálogos en vivo (DRAWER_TYPES /
// SHOE_RACK_TYPES): getContentType, el gola, el apilado (vanoDesdeCara) y
// el tag [tipo] funcionan con ellos sin cambios. Persistencia en
// localStorage propia ('cn-assembly-custom-types'); el id lleva prefijo
// 'cus-' para no colisionar con el catálogo versionado del repo.

import { DRAWER_TYPES, SHOE_RACK_TYPES, getContentType } from '../core/contentTypes.js';

const KEY = 'cn-assembly-custom-types';
const ID_RE = /^cus-[a-z0-9-]+$/;
const KINDS = ['drawer', 'shoeRack'];
// Ids del catálogo base (foto al importar): los customs no pueden usarlos;
// re-editar un custom propio no cuenta como colisión.
const BASE_IDS = new Set([...DRAWER_TYPES, ...SHOE_RACK_TYPES].map((t) => t.id));

// Storage tolerante a entornos sin localStorage (runner puro node --test):
// fallback en memoria por proceso.
const memStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
})();

function storage() {
  return typeof localStorage === 'undefined' ? memStorage : localStorage;
}

export function listCustomTypes(kind = null) {
  let all = [];
  try { all = JSON.parse(storage().getItem(KEY) || '[]'); } catch { all = []; }
  if (!Array.isArray(all)) all = [];
  return kind ? all.filter((t) => t.kind === kind) : all;
}

function persist(all) {
  storage().setItem(KEY, JSON.stringify(all));
}

function catalogFor(kind) {
  return kind === 'shoeRack' ? SHOE_RACK_TYPES : DRAWER_TYPES;
}

// Inserta/actualiza el custom en el catálogo en vivo (idempotente).
function installIntoCatalog(def) {
  const catalog = catalogFor(def.kind);
  const i = catalog.findIndex((t) => t.id === def.id);
  if (i >= 0) catalog[i] = { ...catalog[i], ...def };
  else catalog.push(def);
}

function removeFromCatalog(kind, id) {
  const catalog = catalogFor(kind);
  const i = catalog.findIndex((t) => t.id === id);
  if (i >= 0) catalog.splice(i, 1);
}

// Arranque: vuelca los customs guardados al catálogo en vivo. Idempotente.
export function installCustomTypes() {
  for (const def of listCustomTypes()) installIntoCatalog(def);
}

// Validación de forma (espejo del test del contrato en contentTypes.test).
export function validateCustomType(def) {
  const errors = [];
  const id = String(def?.id || '');
  const label = String(def?.label || '').trim();
  const kind = String(def?.kind || '');
  const vano = Number(def?.altoVano);
  if (!ID_RE.test(id)) errors.push('id: "cus-" + letras, números o guiones (ej. cus-zapatera-baja)');
  if (BASE_IDS.has(id)) errors.push('id: ya existe en el catálogo');
  if (!KINDS.includes(kind)) errors.push('contenido: cajón o zapatera');
  if (!label) errors.push('nombre: obligatorio');
  if (!Number.isFinite(vano) || vano < 50 || vano > 900) errors.push('vano: entre 50 y 900 mm');
  if (kind === 'drawer' && def?.frenteCompleto) errors.push('frente completo solo aplica a zapateras');
  // Método de montaje del fondo (solo cajones): valor del contrato.
  if (def?.fondoMetodo != null && def?.fondoMetodo !== ''
    && !['apoyado', 'ranurado'].includes(def.fondoMetodo)) {
    errors.push('fondo: "apoyado" (sobre la base) o "ranurado" (embutido en ranura)');
  }
  // rim solo aplica con ladosIguales: si el form lo envía igual (input
  // siempre visible), se ignora; con lados iguales debe estar en rango.
  if (kind === 'shoeRack' && def?.ladosIguales && def?.rim != null && def?.rim !== '') {
    const rim = Number(def.rim);
    if (!Number.isFinite(rim) || rim < 40 || rim > vano) errors.push('rim: entre 40 y el vano');
  }
  return errors;
}

// Alta/edición (mismo id = edición). Normaliza al contrato completo.
export function saveCustomType(def) {
  const errors = validateCustomType(def);
  if (errors.length) return { ok: false, errors };
  const kind = String(def.kind);
  const normalized = {
    id: String(def.id),
    kind,
    label: String(def.label).trim(),
    altoVano: Number(def.altoVano),
    frenteCompleto: kind === 'shoeRack' ? !!def.frenteCompleto : false,
    conFrenteDefault: kind === 'drawer' ? true : def.conFrenteDefault !== false,
    fijoEnGola: kind === 'shoeRack' ? def.fijoEnGola !== false : false,
    cajaDelta: 30,
    fondoMetodo: def.fondoMetodo === 'ranurado' ? 'ranurado' : 'apoyado',
    ...(kind === 'shoeRack' && !!def.ladosIguales
      ? { ladosIguales: true, rim: Math.min(Number(def.rim) || 120, Number(def.altoVano)) }
      : {}),
  };
  const all = listCustomTypes();
  const i = all.findIndex((t) => t.id === normalized.id);
  if (i >= 0) all[i] = normalized;
  else all.push(normalized);
  persist(all);
  installIntoCatalog(normalized);
  return { ok: true, type: normalized };
}

export function deleteCustomType(id) {
  const all = listCustomTypes();
  const def = all.find((t) => t.id === id);
  if (!def) return { ok: false, errors: [`Tipo ${id} no existe`] };
  persist(all.filter((t) => t.id !== id));
  removeFromCatalog(def.kind, id);
  return { ok: true };
}

// Slug único a partir del nombre: 'Mis zapatos bajos' → 'cus-mis-zapatos-bajos'.
export function slugCustomType(nombre) {
  const slug = String(nombre || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'tipo';  const taken = new Set([...DRAWER_TYPES, ...SHOE_RACK_TYPES].map((t) => t.id));
  let id = `cus-${slug}`;
  let n = 2;
  while (taken.has(id)) id = `cus-${slug}-${n++}`;
  return id;
}

// Resolución con prefijo de origen (UI/tests): null si no es custom.
export function getCustomType(kind, id) {
  const t = getContentType(kind, id);
  return t && String(t.id).startsWith('cus-') ? t : null;
}
