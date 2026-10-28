// js/components/tour/driver.js — Motor de tour guiado (sin dependencias).
// Renderiza tooltips posicionados (top/bottom/left/right) anclados a un
// selector CSS, con resaltado del elemento objetivo, botón "Siguiente",
// cierre con Escape y persistencia en localStorage para no repetir el tour.
// Si el objetivo de un paso todavía no existe (p. ej. un botón que aparece
// al agregar un módulo), el tooltip queda en modo espera y se reintenta
// hasta waitTimeoutMs, después salta al siguiente paso.
// Capa components/: usa DOM, sin store ni services.

export const TOUR_SEEN_KEY = 'cn-assembly-gola-tour-seen';
const HIGHLIGHT_CLASS = 'cn-tour__highlight';
const VALID_POSITIONS = ['top', 'bottom', 'left', 'right'];

function getStorage() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function hasSeenTour() {
  try {
    return getStorage()?.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen() {
  try {
    getStorage()?.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    // Falla silenciosa en entornos sin localStorage.
  }
}

// Solo para tests: reinicia el estado "visto" del tour.
export function resetTourSeen() {
  try {
    getStorage()?.removeItem(TOUR_SEEN_KEY);
  } catch {
    // Falla silenciosa en entornos sin localStorage.
  }
}

// Crea un tour sobre una lista de pasos: { selector, title, text, position? }
// (position default 'bottom').
// options:
//   onFinish / onDismiss: callbacks al terminar los pasos o al cerrar.
//   markSeenOnClose: persiste el tour como visto al terminar/cerrar
//     (default true; 'destroyed' nunca marca, para no suprimir el tour al
//     cambiar de pestaña a mitad de recorrido).
//   waitTimeoutMs: cuánto espera un paso a que aparezca su objetivo antes de
//     saltearlo (default 30 s); pollIntervalMs: frecuencia de reintento.
// Devuelve { start, stop, next, refresh, isActive }.
export function createTour(steps, options = {}) {
  const list = Array.isArray(steps) ? steps : [];
  const {
    onFinish,
    onDismiss,
    markSeenOnClose = true,
    waitTimeoutMs = 30000,
    pollIntervalMs = 400,
  } = options;

  let index = 0;
  let active = false;
  let tooltipEl = null;
  let highlightedEl = null;
  let pollTimer = null;

  function clearHighlight() {
    if (highlightedEl) highlightedEl.classList.remove(HIGHLIGHT_CLASS);
    highlightedEl = null;
  }

  function clearPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function cleanup() {
    clearPoll();
    clearHighlight();
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onKeydown, true);
    }
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      stop('dismissed');
    }
  }

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    const el = document.createElement('div');
    el.className = 'cn-tour__tooltip';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <p class="cn-tour__step-count" data-tour-step-count></p>
      <h3 class="cn-tour__title" data-tour-title></h3>
      <p class="cn-tour__text" data-tour-text></p>
      <div class="cn-tour__actions">
        <button type="button" class="btn btn--secondary btn--sm" data-tour-close>Cerrar</button>
        <button type="button" class="btn btn--primary btn--sm" data-tour-next>Siguiente</button>
      </div>
    `;
    el.querySelector('[data-tour-close]').addEventListener('click', () => stop('dismissed'));
    el.querySelector('[data-tour-next]').addEventListener('click', () => next());
    document.body.appendChild(el);
    tooltipEl = el;
    return el;
  }

  function renderStepContent(step, waiting) {
    const el = ensureTooltip();
    el.querySelector('[data-tour-step-count]').textContent = `Paso ${index + 1} de ${list.length}`;
    el.querySelector('[data-tour-title]').textContent = step.title || '';
    el.querySelector('[data-tour-text]').textContent = step.text || '';
    el.querySelector('[data-tour-next]').textContent = index === list.length - 1 ? 'Finalizar' : 'Siguiente';
    el.classList.toggle('cn-tour__tooltip--waiting', waiting);
  }

  function placeWaiting() {
    const el = tooltipEl;
    if (!el) return;
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1024;
    el.style.left = `${Math.round(Math.max(8, vw / 2 - 150))}px`;
    el.style.top = '8px';
  }

  function positionTooltip(target, position) {
    const el = tooltipEl;
    if (!el) return;
    const margin = 12;
    const rect = target.getBoundingClientRect();
    el.style.visibility = 'hidden';
    el.style.left = '0px';
    el.style.top = '0px';
    const tw = el.offsetWidth || 280;
    const th = el.offsetHeight || 120;
    let left;
    let top;
    if (position === 'top') {
      left = rect.left + rect.width / 2 - tw / 2;
      top = rect.top - th - margin;
    } else if (position === 'left') {
      left = rect.left - tw - margin;
      top = rect.top + rect.height / 2 - th / 2;
    } else if (position === 'right') {
      left = rect.right + margin;
      top = rect.top + rect.height / 2 - th / 2;
    } else { // bottom
      left = rect.left + rect.width / 2 - tw / 2;
      top = rect.bottom + margin;
    }
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 768;
    left = Math.max(8, Math.min(left, vw - tw - 8));
    top = Math.max(8, Math.min(top, vh - th - 8));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.visibility = 'visible';
  }

  function findTarget(step) {
    try {
      return document.querySelector(step.selector);
    } catch {
      return null;
    }
  }

  function anchor(step, target) {
    renderStepContent(step, false);
    positionTooltip(target, VALID_POSITIONS.includes(step.position) ? step.position : 'bottom');
    clearHighlight();
    target.classList.add(HIGHLIGHT_CLASS);
    highlightedEl = target;
  }

  function showCurrent() {
    if (!active) return;
    clearPoll();
    clearHighlight();
    if (index >= list.length) {
      stop('finished');
      return;
    }
    const step = list[index];
    const target = findTarget(step);
    if (target) {
      anchor(step, target);
      return;
    }
    // Objetivo todavía no renderizado: tooltip en modo espera (arriba al
    // centro) y reintento hasta waitTimeoutMs; vencido, se saltea el paso.
    renderStepContent(step, true);
    placeWaiting();
    const deadline = Date.now() + waitTimeoutMs;
    pollTimer = setInterval(() => {
      if (!active) {
        clearPoll();
        return;
      }
      const found = findTarget(step);
      if (found) {
        clearPoll();
        anchor(step, found);
        return;
      }
      if (Date.now() >= deadline) {
        clearPoll();
        index += 1;
        showCurrent();
      }
    }, pollIntervalMs);
  }

  function stop(reason = 'dismissed') {
    if (!active) return;
    active = false;
    cleanup();
    if (markSeenOnClose && reason !== 'destroyed') markTourSeen();
    if (reason === 'finished' && onFinish) onFinish();
    else if (reason === 'dismissed' && onDismiss) onDismiss();
  }

  function start() {
    if (active || !list.length || typeof document === 'undefined') return;
    active = true;
    index = 0;
    document.addEventListener('keydown', onKeydown, true);
    showCurrent();
  }

  function next() {
    if (!active) return;
    index += 1;
    showCurrent();
  }

  // Re-ancla el paso actual tras un re-render de la vista (los nodos objetivo
  // se reemplazan con innerHTML y el highlight se pierde).
  function refresh() {
    if (!active || index >= list.length) return;
    const step = list[index];
    const target = findTarget(step);
    if (target) anchor(step, target);
  }

  function isActive() {
    return active;
  }

  return { start, stop, next, refresh, isActive };
}
