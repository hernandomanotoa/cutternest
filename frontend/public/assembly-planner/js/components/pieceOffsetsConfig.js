// js/components/pieceOffsetsConfig.js — Tabla de offsets/gaps por pieza para la vista isométrica
// Componente sin estado: lee del store y delega cambios a app.js.

import { VERTICAL_POSITIONS } from '../core/config.js';
import { updatePieceOffset, resetPieceOffsets } from '../app.js';
import { getModulePieces } from '../utils.js';
import { escapeHtml } from '../utils.js';
import { inferRole } from '../services/classifierService.js';
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

    const filterInput = root.querySelector('[data-filter]');
    filterInput?.addEventListener('input', () => {
      const term = filterInput.value.trim().toLowerCase();
      root.querySelectorAll('.cn-piece-row').forEach((row) => {
        const visible = !term || (row.dataset.search || '').includes(term);
        row.style.display = visible ? '' : 'none';
      });
      root.querySelectorAll('[data-role-header]').forEach((header) => {
        const role = header.dataset.roleHeader;
        const tbody = root.querySelector(`tbody[data-role="${CSS.escape(role)}"]`);
        if (!tbody) return;
        const anyVisible = tbody.querySelector('.cn-piece-row:not([style*="none"])');
        header.style.display = anyVisible ? '' : 'none';
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

// Orden lógico de los grupos para que la base quede arriba y se reduzca el scroll.
const GROUP_ORDER = [
  'bottom_panel',
  'top_panel',
  'shelf',
  'drawer_face',
  'door',
  'brace',
  'mirror',
  'hanger_rail',
  'seat_panel',
  'leg',
  'divider',
];

function renderTable(groups, activePieces, userConfig) {
  if (!groups.length) {
    return '<p class="empty-state">No hay piezas configurables para este módulo.</p>';
  }

  const byRole = new Map();
  groups.forEach((g) => {
    const role = inferRole(g.piece);
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(g);
  });

  const tbodies = GROUP_ORDER
    .filter((role) => byRole.has(role))
    .map((role) => {
      const items = byRole.get(role).slice().sort((a, b) => {
        const za = getPieceOffsetConfig(a.piece, undefined, userConfig).zone || '';
        const zb = getPieceOffsetConfig(b.piece, undefined, userConfig).zone || '';
        if (za !== zb) return za.localeCompare(zb);
        return String(a.piece.nombre).localeCompare(String(b.piece.nombre));
      });
      const typeLabel = getPieceTypeLabel(items[0].piece);
      const rows = items.map((item) => renderRow(item, activePieces, userConfig)).join('');
      return `
        <tbody data-role="${escapeHtml(role)}">
          <tr class="cn-group-header" data-role-header="${escapeHtml(role)}">
            <td colspan="3" style="padding:0.4rem 0.6rem;background:#1e293b;position:sticky;top:0;z-index:2;">
              <strong style="color:#94a3b8;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.04em;">${escapeHtml(typeLabel)}</strong>
            </td>
          </tr>
          ${rows}
        </tbody>
      `;
    })
    .join('');

  return `
    <div class="table-container" style="max-height:calc(100vh - 14rem);">
      <div style="padding:0.35rem 0.5rem;background:#0f172a;position:sticky;top:0;z-index:3;border-bottom:1px solid #334155;">
        <input
          type="search"
          data-filter
          placeholder="Buscar pieza..."
          style="width:100%;background:#1e293b;border:1px solid #334155;border-radius:0.35rem;padding:0.35rem 0.5rem;color:#f1f5f9;font-size:0.8rem;"
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>Pieza</th>
            <th>Offset / Inset</th>
            <th>Gap</th>
          </tr>
        </thead>
        ${tbodies}
      </table>
    </div>
  `;
}

function renderRow({ originalId, piece, count }, activePieces, userConfig) {
  const cfg = getPieceOffsetConfig(piece, undefined, userConfig);
  const showGap = shouldShowGap(piece, activePieces);
  const typeLabel = getPieceTypeLabel(piece);
  const offsetPlaceholder = getOffsetPlaceholder(piece, cfg.zone);
  const offsetValue = Number.isFinite(cfg.offset) ? cfg.offset : VERTICAL_POSITIONS[getDefaultKey(piece, cfg.zone)] || 0;
  const gapValue = Number.isFinite(cfg.gap) ? cfg.gap : 0;
  const qtyBadge = count > 1 ? `<span class="badge badge--secondary">×${count}</span>` : '';
  const searchText = escapeHtml(`${typeLabel} ${piece.nombre}`.toLowerCase());

  return `
    <tr class="cn-piece-row" data-search="${searchText}">
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
