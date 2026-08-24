# utils.js — Utilidades compartidas

## Código fuente completo

Archivo: `frontend/public/assembly-planner/js/utils.js`

```javascript
// utils.js — helpers comunes

export function $(selector, context = document) {
  return context.querySelector(selector);
}

export function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

export function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isHexColor(value) {
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(value);
}

export function normalizeColor(value) {
  const v = value.trim();
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9A-Fa-f]{3}$/.test(v)) return `#${v}`;
  return v;
}

export function formatDimension(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(0)} mm` : value;
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// --- Helpers de módulos ---

const GLOBAL_MODULE_ID = 'global';
const GLOBAL_MODULE_LABEL = 'Global / Estructura';

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isGlobalPiece(piece) {
  if (!piece) return false;
  const modulo = String(piece.modulo || '').trim().toLowerCase();
  if (modulo === 'estructura' || modulo === 'global') return true;
  if (piece.id.toLowerCase().startsWith('glb-')) return true;
  return false;
}

function pieceCategory(p) {
  const n = normalizeName(p.nombre);
  if (n.includes('cajon') && (n.includes('frente') || n.includes('lateral') || n.includes('fondo') || n.includes('base'))) return 'cajon_cuerpo';
  if (n.includes('tirador') && n.includes('cajon')) return 'cajon_tirador';
  if (n.includes('tapa') || n.includes('techo')) return 'tapa';
  if (n.includes('base')) return 'base';
  if (n.includes('lateral')) return 'lateral';
  if (n.includes('fondo') || n.includes('trasera')) return 'fondo';
  if (n.includes('repisa') || n.includes('estante')) return 'estante';
  if (n.includes('divisor') || n.includes('division')) return 'divisor';
  if (n.includes('puerta')) return 'puerta';
  if (n.includes('tirador')) return 'tirador';
  if (n.includes('barra')) return 'barra';
  if (n.includes('zocalo')) return 'zocalo';
  return 'otro';
}

function moduleFingerprint(pieces, moduleId) {
  const modPieces = pieces.filter((p) => !isGlobalPiece(p) && String(p.modulo || '1').trim() === String(moduleId).trim());
  const counts = {};
  modPieces.forEach((p) => {
    const cat = pieceCategory(p);
    counts[cat] = (counts[cat] || 0) + (Number(p.cantidad) || 1);
  });

  const dims = modPieces
    .filter((p) => ['base', 'tapa'].includes(pieceCategory(p)))
    .map((p) => ({ ancho: Number(p.ancho) || 0, alto: Number(p.alto) || 0 }));
  const keyDim = dims.length
    ? { ancho: Math.max(...dims.map((d) => d.ancho)), alto: Math.max(...dims.map((d) => d.alto)) }
    : { ancho: 0, alto: 0 };

  // Categorías esenciales para la estructura del módulo
  const essential = ['base', 'tapa', 'lateral', 'fondo', 'cajon_cuerpo', 'cajon_tirador', 'estante', 'puerta'];
  const essentialCounts = {};
  essential.forEach((k) => {
    essentialCounts[k] = counts[k] || 0;
  });

  // Categorías opcionales (no impiden agrupar si difieren)
  const optional = ['divisor', 'barra', 'zocalo', 'tirador', 'otro'];
  const optionalCounts = {};
  optional.forEach((k) => {
    optionalCounts[k] = counts[k] || 0;
  });

  const estDims = modPieces
    .filter((p) => pieceCategory(p) === 'estante')
    .map((p) => ({ ancho: Number(p.ancho) || 0, alto: Number(p.alto) || 0 }));
  const keyEstante = estDims.length
    ? { ancho: Math.max(...estDims.map((d) => d.ancho)), alto: Math.max(...estDims.map((d) => d.alto)) }
    : { ancho: 0, alto: 0 };

  return {
    essential: essentialCounts,
    optional: optionalCounts,
    ancho: keyDim.ancho,
    alto: keyDim.alto,
    estanteAncho: keyEstante.ancho,
    estanteAlto: keyEstante.alto,
  };
}

function fingerprintsMatch(a, b) {
  if (a.ancho !== b.ancho || a.alto !== b.alto) return false;
  // Ignoramos diferencias en estantes y opcionales para agrupar modulos de la misma familia
  const essentialKeys = new Set([...Object.keys(a.essential), ...Object.keys(b.essential)]);
  for (const k of essentialKeys) {
    if ((a.essential[k] || 0) !== (b.essential[k] || 0)) return false;
  }
  return true;
}

export function getModuleGroups(pieces) {
  const modules = new Set();
  pieces.forEach((p) => {
    if (isGlobalPiece(p)) return;
    modules.add(String(p.modulo || '1').trim());
  });

  const sorted = Array.from(modules).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const fingerprints = new Map();
  sorted.forEach((m) => {
    fingerprints.set(m, moduleFingerprint(pieces, m));
  });

  // Un modulo es hijo si existe otro modulo que sea prefijo suyo (p != h).
  function hasParent(h) {
    for (const p of sorted) {
      if (p !== h && h.startsWith(p)) return true;
    }
    return false;
  }

  const roots = sorted.filter((m) => !hasParent(m));
  const children = sorted.filter((m) => hasParent(m));

  const groups = [];
  const used = new Set();

  // Agrupar solo modulos raiz entre si
  roots.forEach((m) => {
    if (used.has(m)) return;
    const fp = fingerprints.get(m);
    const members = roots.filter((other) => !used.has(other) && fingerprintsMatch(fp, fingerprints.get(other)));
    members.forEach((x) => used.add(x));
    groups.push(members);
  });

  // Los modulos hijos quedan individuales para respetar su padre
  children.forEach((m) => {
    if (used.has(m)) return;
    groups.push([m]);
  });

  return groups
    .map((group) => {
      const id = group.join('+');
      const label = group.length > 1 ? `Módulos ${group.join(' + ')}` : `Módulo ${group[0]}`;
      return { id, label, modules: group };
    })
    .sort((a, b) => a.modules[0].localeCompare(b.modules[0], undefined, { numeric: true }));
}

export function getModules(pieces) {
  const hasGlobal = pieces.some((p) => isGlobalPiece(p));
  const groups = getModuleGroups(pieces);
  const ids = groups.map((g) => g.id);
  return hasGlobal ? [GLOBAL_MODULE_ID, ...ids] : ids;
}

export function getModuleGroup(pieces, groupId) {
  if (groupId === GLOBAL_MODULE_ID) {
    return { id: GLOBAL_MODULE_ID, label: GLOBAL_MODULE_LABEL, modules: [] };
  }
  const groups = getModuleGroups(pieces);
  const found = groups.find((g) => g.id === groupId);
  if (found) return found;

  // Si el id no es un grupo pero es un modulo individual valido,
  // devolver el modulo junto con todos sus descendientes (sub-modulos).
  const allModules = new Set();
  pieces.forEach((p) => {
    if (isGlobalPiece(p)) return;
    allModules.add(String(p.modulo || '1').trim());
  });
  const target = String(groupId).trim();
  if (allModules.has(target)) {
    const descendants = Array.from(allModules)
      .filter((m) => m === target || m.startsWith(target))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const label = descendants.length > 1 ? `Módulo ${target} + submódulos` : `Módulo ${target}`;
    return { id: descendants.join('+'), label, modules: descendants };
  }
  return groups[0] || { id: '1', label: 'Módulo 1', modules: ['1'] };
}

export function getModulePieces(pieces, moduleId) {
  if (moduleId === GLOBAL_MODULE_ID) {
    return pieces.filter((p) => isGlobalPiece(p));
  }
  const group = getModuleGroup(pieces, moduleId);
  const moduleSet = new Set(group.modules.map((m) => String(m).trim()));
  return pieces.filter((p) => {
    if (isGlobalPiece(p)) return true;
    return moduleSet.has(String(p.modulo || '1').trim());
  });
}

export function getModuleDependencies(dependencies, pieces) {
  const visibleIds = new Set(pieces.map((p) => p.id));
  return dependencies.filter((d) => visibleIds.has(d.from) && visibleIds.has(d.to));
}

export function getModuleLabel(moduleId, pieces = []) {
  if (moduleId === GLOBAL_MODULE_ID) return GLOBAL_MODULE_LABEL;
  const group = getModuleGroup(pieces, moduleId);
  return group.label;
}

```
