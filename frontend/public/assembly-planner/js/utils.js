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

export function getModuleGroups(pieces) {
  const modules = new Set();
  pieces.forEach((p) => {
    if (isGlobalPiece(p)) return;
    modules.add(String(p.modulo || '1').trim());
  });

  const sorted = Array.from(modules).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Un modulo es hijo si existe otro modulo que sea prefijo suyo (p != h).
  function hasParent(h) {
    for (const p of sorted) {
      if (p !== h && h.startsWith(p)) return true;
    }
    return false;
  }

  const roots = sorted.filter((m) => !hasParent(m));

  // Cada módulo raíz es su propio grupo; no se agrupan por similitud.
  return roots.map((m) => ({
    id: m,
    label: `Módulo ${m}`,
    modules: [m],
  }));
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
