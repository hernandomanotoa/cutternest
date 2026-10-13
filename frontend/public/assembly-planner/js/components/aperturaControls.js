// js/components/aperturaControls.js — Controles compartidos de apertura/ángulo
// (slider global, selector de pieza, apertura por pieza y ángulo de bisagra)
// usados por las vistas isométrica (js/views/isometricView.js) y 3D
// (js/views/renderer3DView.js).
// Componente sin estado propio: no toca el store ni app.js. La vista le pasa
// los datos (piezas, aperturas, ángulos, selección) vía html()/sync() y
// recibe los cambios del usuario vía callbacks. La decisión de visibilidad
// (pieza móvil / kind === 'hinge') usa motionConfigFor (servicio puro), igual
// que hacían antes las vistas. Soporta dos layouts:
//   'inline' → botones-toolbar de la vista isométrica (<label class="btn…">)
//   'group'  → filas .r3d-slider-group del panel de sliders de la vista 3D
// DOM solo dentro de bind(); el módulo es importable en Node sin DOM.

import { RENDERER3D_THEME } from '../core/config.js';
import { motionConfigFor } from '../services/motionService.js';
import { escapeHtml } from '../utils/helpers.js';

const ANGULO_PRESETS = [45, 70, 90, 110];

export function createAperturaControls({
  prefix,
  layout = 'inline',
  showPieceSelect = false,
  onAperturaGlobal = () => {},
  onAperturaPieza = () => {},
  onAnguloPieza = () => {},
  onSelectPiece = () => {},
}) {
  const ids = {
    global: `${prefix}-apertura`,
    select: `${prefix}-piece-select`,
    apGroup: `${prefix}-piece-apertura-group`,
    ap: `${prefix}-piece-apertura`,
    anGroup: `${prefix}-piece-angulo-group`,
    an: `${prefix}-piece-angulo`,
    anAuto: `${prefix}-angulo-auto`,
  };

  let root = null;
  let lastSync = null;
  let selectedPieceId = null;

  const sel = (key) => (root ? root.querySelector(`#${ids[key]}`) : null);

  function renderPresets() {
    const cls = `${prefix}-angulo-preset`;
    const pad = layout === 'group' ? '0.1rem 0.35rem' : '0.05rem 0.3rem';
    const buttons = ANGULO_PRESETS.map(
      (a) => `<button type="button" class="btn btn--secondary btn--sm ${cls}" data-angulo="${a}" style="padding:${pad};">${a}°</button>`,
    ).join('');
    const auto = `<button type="button" class="btn btn--secondary btn--sm" id="${ids.anAuto}" style="padding:${pad};">Auto</button>`;
    // En el layout 'group' los presets van envueltos en un span propio del
    // tema 3D; en 'inline' van sueltos dentro del label (como la vista iso).
    return layout === 'group'
      ? `<span class="r3d-angulo-presets" style="display:inline-flex;gap:0.2rem;">${buttons}${auto}</span>`
      : `${buttons}${auto}`;
  }

  function renderPieceSelect(pieces, initialSelected) {
    if (!showPieceSelect) return '';
    const options = pieces
      .filter((p) => motionConfigFor(p))
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}" ${p.id === initialSelected ? 'selected' : ''}>${escapeHtml(p.nombre || p.id)}</option>`,
      )
      .join('');
    return `<label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.35rem;">
  <span>Pieza</span>
  <select id="${ids.select}" class="input" style="width:auto;max-width:180px;">
    <option value="">—</option>
    ${options}
  </select>
</label>`;
  }

  function html({ aperturaGlobal = 0, pieces = [], selectedPieceId: initialSelected = null } = {}) {
    const globalValue = Math.round((aperturaGlobal ?? 0) * 100);
    if (layout === 'group') {
      return `<div class="r3d-slider-group">
  <label for="${ids.global}">Apertura</label>
  <input type="range" id="${ids.global}" min="0" max="100" step="1" value="${globalValue}">
</div>
<div class="r3d-slider-group" id="${ids.apGroup}" style="display:none;">
  <label for="${ids.ap}">Apertura pieza</label>
  <input type="range" id="${ids.ap}" min="0" max="100" step="1" value="0">
</div>
<div class="r3d-slider-group" id="${ids.anGroup}" style="display:none;align-items:center;gap:0.35rem;">
  <label for="${ids.an}">Ángulo</label>
  <input type="number" id="${ids.an}" min="0" max="120" step="5" placeholder="105" style="width:58px;">
  <span style="font-size:0.75rem;color:${RENDERER3D_THEME.textSecondary};">°</span>
  ${renderPresets()}
</div>`;
    }
    return `<label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.4rem;">
  <span>Apertura</span>
  <input type="range" id="${ids.global}" min="0" max="100" step="1" value="${globalValue}" style="cursor:pointer;width:110px;">
</label>
${renderPieceSelect(pieces, initialSelected)}
<label class="btn btn--secondary btn--sm" id="${ids.apGroup}" style="cursor:pointer;align-items:center;display:none;gap:0.4rem;">
  <span>Apertura pieza</span>
  <input type="range" id="${ids.ap}" min="0" max="100" step="1" value="0" style="cursor:pointer;width:90px;">
</label>
<label class="btn btn--secondary btn--sm" id="${ids.anGroup}" style="cursor:pointer;align-items:center;display:none;gap:0.35rem;">
  <span>Ángulo</span>
  <input type="number" id="${ids.an}" min="0" max="120" step="5" placeholder="105" style="width:56px;">
  <span style="font-size:0.75rem;">°</span>
  ${renderPresets()}
</label>`;
  }

  function bind(containerEl) {
    root = containerEl;
    sel('global')?.addEventListener('input', (e) => onAperturaGlobal(Number(e.target.value) / 100));
    sel('select')?.addEventListener('change', (e) => {
      selectedPieceId = e.target.value || null;
      onSelectPiece(selectedPieceId);
      applySync();
    });
    sel('ap')?.addEventListener('input', (e) => {
      if (selectedPieceId) onAperturaPieza(selectedPieceId, Number(e.target.value) / 100);
    });
    sel('an')?.addEventListener('change', (e) => {
      if (!selectedPieceId) return;
      const v = e.target.value;
      onAnguloPieza(selectedPieceId, v === '' || v == null ? null : Number(v));
    });
    sel('anGroup')?.querySelectorAll('button[data-angulo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (selectedPieceId) onAnguloPieza(selectedPieceId, Number(btn.dataset.angulo));
      });
    });
    sel('anAuto')?.addEventListener('click', () => {
      if (selectedPieceId) onAnguloPieza(selectedPieceId, null);
    });
  }

  // Sincroniza slider global y visibilidad/valores de los controles por pieza
  // a partir del estado que la vista le pasa. `pieces` debe ser la lista que
  // la vista use para resolver la selección (módulo activo en iso, lista
  // completa en 3D), preservando el comportamiento previo de cada vista.
  function sync(args = {}) {
    lastSync = {
      pieces: args.pieces || [],
      aperturaGlobal: args.aperturaGlobal ?? 0,
      aperturas: args.aperturas || {},
      angulos: args.angulos || {},
    };
    if ('selectedPieceId' in args) selectedPieceId = args.selectedPieceId ?? null;
    applySync();
  }

  function applySync() {
    if (!root || !lastSync) return;
    const { pieces, aperturaGlobal, aperturas, angulos } = lastSync;
    const g = sel('global');
    if (g) g.value = String(Math.round((aperturaGlobal ?? 0) * 100));
    const piece = selectedPieceId ? pieces.find((p) => p.id === selectedPieceId) : null;
    const cfg = piece ? motionConfigFor(piece) : null;

    const apGroup = sel('apGroup');
    const ap = sel('ap');
    if (apGroup && ap) {
      if (piece && cfg) {
        apGroup.style.display = '';
        ap.value = String(Math.round((aperturas[piece.id] ?? aperturaGlobal ?? 0) * 100));
      } else {
        apGroup.style.display = 'none';
      }
    }

    const anGroup = sel('anGroup');
    const an = sel('an');
    if (anGroup && an) {
      if (piece && cfg?.kind === 'hinge') {
        anGroup.style.display = '';
        const override = angulos[piece.id];
        an.value = override != null ? String(Math.round(override)) : '';
      } else {
        anGroup.style.display = 'none';
      }
    }
  }

  function destroy() {
    root = null;
    lastSync = null;
    selectedPieceId = null;
  }

  return { html, bind, sync, destroy };
}

// Toggle "Gap profundidad" (checkbox compact/projected). Mismo markup en
// ambas vistas; solo cambia el id y el callback.
export function createGapModeToggle({ id, onChange = () => {} }) {
  let input = null;

  function html({ checked = false } = {}) {
    return `<label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
  <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="cursor:pointer;">
  <span>Gap profundidad</span>
</label>`;
  }

  function bind(containerEl) {
    input = containerEl.querySelector(`#${id}`);
    input?.addEventListener('change', () => onChange(input.checked ? 'projected' : 'compact'));
  }

  function destroy() {
    input = null;
  }

  return { html, bind, destroy };
}
