// js/components/pieceOffsetsConfig.js — Tabla de offsets/gaps por pieza para la vista isométrica
// Componente sin estado: lee del store y delega cambios a app.js.

import { VERTICAL_POSITIONS } from '../core/config.js';
import { updatePieceOffset, resetPieceOffsets } from '../app.js';
import { getModulePieces } from '../utils.js';
import { escapeHtml } from '../utils.js';
import {
  groupPiecesByOriginalId,
  getPieceOffsetConfig,
  getOffsetPlaceholder,
  shouldShowGap,
  getPieceTypeLabel,
  isConfigurablePiece,
} from '../services/pieceOffsetService.js';

const COLLAPSE_KEY = 'cn-assembly-piece-offsets-collapsed';

function getCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function setCollapsed(value) {
  try {
    if (value) localStorage.setItem(COLLAPSE_KEY, '1');
    else localStorage.removeItem(COLLAPSE_KEY);
  } catch {
    // ignorar entornos sin storage
  }
}

export function createPieceOffsetsConfig() {
  function mount(parent, store) {
    const state = store.get();
    const activePieces = getModulePieces(state.pieces, state.currentModule);
    const groups = groupPiecesByOriginalId(activePieces).filter((g) => isConfigurablePiece(g.piece));

    const collapsed = getCollapsed();

    const root = document.createElement('div');
    root.className = `iso-config-panel card${collapsed ? ' is-collapsed' : ''}`;
    root.style.width = '460px';
    root.innerHTML = `
      <div class="iso-config-panel__header">
        <span>Offsets y gaps por pieza</span>
        <div class="iso-config-panel__actions">
          <button class="btn btn--icon btn--sm" data-toggle title="Ocultar/mostrar offsets">${collapsed ? '▶' : '▼'}</button>
          <button class="btn btn--secondary btn--sm" data-reset>Restaurar defaults</button>
        </div>
      </div>
      <div class="iso-config-panel__body" style="display:block;overflow:auto;">
        ${renderTable(groups, activePieces, state.userConfig)}
      </div>
    `;

    const toggleBtn = root.querySelector('[data-toggle]');
    toggleBtn?.addEventListener('click', () => {
      const next = !root.classList.toggle('is-collapsed');
      toggleBtn.textContent = next ? '▼' : '▶';
      setCollapsed(!next);
    });

    root.querySelectorAll('input[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const originalId = input.dataset.originalId;
        const field = input.dataset.field;
        const value = parseFloat(input.value);
        if (originalId && field && Number.isFinite(value)) {
          updatePieceOffset(originalId, field, value);
        }
      });
    });

    root.querySelector('[data-reset]')?.addEventListener('click', () => {
      resetPieceOffsets();
    });

    parent.appendChild(root);
    return root;
  }

  return { mount };
}

function renderTable(groups, activePieces, userConfig) {
  if (!groups.length) {
    return '<p class="empty-state">No hay piezas configurables para este módulo.</p>';
  }

  const rows = groups
    .map(({ originalId, piece, count }) => {
      const cfg = getPieceOffsetConfig(piece, undefined, userConfig);
      const showGap = shouldShowGap(piece, activePieces);
      const typeLabel = getPieceTypeLabel(piece);
      const offsetPlaceholder = getOffsetPlaceholder(piece, cfg.zone);
      const offsetValue = Number.isFinite(cfg.offset) ? cfg.offset : VERTICAL_POSITIONS[getDefaultKey(piece, cfg.zone)] || 0;
      const gapValue = Number.isFinite(cfg.gap) ? cfg.gap : 0;
      const qtyBadge = count > 1 ? `<span class="badge badge--secondary">×${count}</span>` : '';

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">
              <span class="badge badge--info">${escapeHtml(typeLabel)}</span>
              <span>${escapeHtml(piece.nombre)}</span>
              ${qtyBadge}
            </div>
          </td>
          <td>
            <input
              type="number"
              data-original-id="${escapeHtml(originalId)}"
              data-field="offset"
              value="${offsetValue}"
              placeholder="${escapeHtml(offsetPlaceholder)}"
              step="any"
              min="0"
            />
          </td>
          <td>
            ${
              showGap
                ? `<input
                    type="number"
                    data-original-id="${escapeHtml(originalId)}"
                    data-field="gap"
                    value="${gapValue}"
                    placeholder="Gap entre piezas (mm)"
                    step="any"
                    min="0"
                  />`
                : '<span class="empty-state">—</span>'
            }
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="table-container" style="max-height:calc(100vh - 14rem);">
      <table>
        <thead>
          <tr>
            <th>Pieza</th>
            <th>Offset / Inset</th>
            <th>Gap</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function getDefaultKey(piece, zone) {
  // Fallback visual; el servicio real usa VERTICAL_POSITIONS directamente.
  const role = piece.role || '';
  if (zone === 'fixed-bottom') return 'shoeRackBaseOffset';
  if (zone === 'top') {
    if (role === 'shelf') return 'shelfTopInset';
    if (role === 'door') return 'doorTopInset';
    if (role === 'brace') return 'braceTopInset';
    if (role === 'mirror') return 'mirrorTopInset';
  }
  return 'defaultGap';
}
