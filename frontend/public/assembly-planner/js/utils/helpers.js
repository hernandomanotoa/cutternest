// utils/helpers.js — helpers comunes (funciones puras, sin DOM)

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

export { normalizeName } from './normalize.js';
export {
  ALL_MODULE_ID,
  ALL_MODULE_LABEL,
  GLOBAL_MODULE_ID,
  GLOBAL_MODULE_LABEL,
  isGlobalPiece,
  getModuleGroups,
  getModules,
  getModuleGroup,
  getModulePieces,
  getModuleDependencies,
  getModuleLabel,
  getModuleOptions,
  describeSubmodule,
} from '../services/moduleService.js';
