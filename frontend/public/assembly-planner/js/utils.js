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

export { normalizeName } from './utils/normalize.js';
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
} from './services/moduleService.js';
