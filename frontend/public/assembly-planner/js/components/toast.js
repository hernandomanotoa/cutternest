// js/components/toast.js — Sistema de notificaciones toast (sin dependencias)
//
// Lógica pura (cola/máximo de visibles) separada de la parte DOM para poder
// testearla con node --test. Los colores se toman SIEMPRE de js/core/config.js
// y se aplican inline al crear el nodo: no hay hex literales ni clases CSS.

import { COLORS, RISK_COLORS } from '../core/config.js';

export const TOAST_TYPES = ['info', 'success', 'error'];
export const TOAST_DEFAULT_DURATION_MS = 4000;
export const TOAST_MAX_VISIBLE = 4;

// Color de acento por tipo, resuelto desde config.js (sin literales).
const TOAST_COLORS = {
  info: RISK_COLORS.info,
  success: RISK_COLORS.success,
  error: RISK_COLORS.danger,
};

export function normalizeToastType(type) {
  return TOAST_TYPES.includes(type) ? type : 'info';
}

// ── Lógica pura (sin DOM) ──────────────────────────────────────────────────
// Registro de toasts activos: al superar maxVisible se evicta el más antiguo.
export function createToastRegistry({ maxVisible = TOAST_MAX_VISIBLE } = {}) {
  const items = [];
  let nextId = 1;
  return {
    add(message, { type = 'info', durationMs = TOAST_DEFAULT_DURATION_MS } = {}) {
      const item = {
        id: nextId++,
        message: String(message),
        type: normalizeToastType(type),
        durationMs: Number.isFinite(Number(durationMs)) && Number(durationMs) > 0
          ? Number(durationMs)
          : TOAST_DEFAULT_DURATION_MS,
      };
      items.push(item);
      let evicted = null;
      while (items.length > maxVisible) evicted = items.shift();
      return { item, evicted };
    },
    remove(id) {
      const index = items.findIndex((t) => t.id === id);
      if (index === -1) return null;
      return items.splice(index, 1)[0];
    },
    list() {
      return items.map((t) => ({ ...t }));
    },
    clear() {
      items.length = 0;
    },
  };
}

// ── Parte DOM ───────────────────────────────────────────────────────────────

const registry = createToastRegistry();
let containerEl = null;

function getContainer() {
  if (containerEl && document.body.contains(containerEl)) return containerEl;
  containerEl = document.createElement('div');
  containerEl.id = 'toast-container';
  containerEl.setAttribute('role', 'status');
  containerEl.setAttribute('aria-live', 'polite');
  Object.assign(containerEl.style, {
    position: 'fixed',
    bottom: '1rem',
    right: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    zIndex: '10000',
    maxWidth: '340px',
    pointerEvents: 'none',
  });
  document.body.appendChild(containerEl);
  return containerEl;
}

function removeToastEl(id) {
  const el = containerEl?.querySelector(`[data-toast-id="${id}"]`);
  if (el) el.remove();
}

function renderToast(item) {
  const accent = TOAST_COLORS[item.type];
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.toastId = String(item.id);
  el.setAttribute('role', 'alert');
  Object.assign(el.style, {
    background: COLORS.background,
    color: COLORS.textPrimary,
    border: `1px solid ${accent}`,
    borderLeft: `4px solid ${accent}`,
    borderRadius: '8px',
    padding: '0.6rem 0.9rem',
    fontSize: '0.85rem',
    lineHeight: '1.4',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
    cursor: 'pointer',
    pointerEvents: 'auto',
    opacity: '0',
    transform: 'translateY(4px)',
    transition: 'opacity 160ms ease, transform 160ms ease',
  });
  el.textContent = item.message;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });
  el.addEventListener('click', () => dismissToast(item.id));
  return el;
}

export function dismissToast(id) {
  const removed = registry.remove(id);
  removeToastEl(id);
  return removed;
}

// Muestra un toast. `type`: 'info' | 'success' | 'error'.
// En entornos sin DOM (node --test) solo registra la lógica pura y devuelve el item.
export function toast(message, { type = 'info', durationMs = TOAST_DEFAULT_DURATION_MS } = {}) {
  const { item, evicted } = registry.add(message, { type, durationMs });
  if (typeof document === 'undefined') return item;
  const container = getContainer();
  if (evicted) removeToastEl(evicted.id);
  container.appendChild(renderToast(item));
  setTimeout(() => dismissToast(item.id), item.durationMs);
  return item;
}
