// js/components/pieceOffsetsConfig.js — Tabla de offsets/gaps por pieza para la vista isométrica
// Componente sin estado: lee del store y delega cambios a app.js.

import { VERTICAL_POSITIONS } from '../core/config.js';
import { updatePieceOffset, resetPieceOffsets } from '../app.js';
import { getModulePieces, escapeHtml } from '../utils.js';
import { inferRole, isShoeRack } from '../services/classifierService.js';
import {
  groupPiecesByOriginalId,
  getPieceOffsetConfig,
  getOffsetPlaceholder,
  getGapPlaceholder,
  shouldShowGap,
  getPieceTypeLabel,
  isConfigurablePiece,
} from '../services/pieceOffsetService.js';

const COLLAPSE_KEY = 'cn-assembly-piece-offsets-collapsed';
const UI_STATE_KEY = 'cn-assembly-piece-offsets-ui';

const ALL_VALUE = 'all';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'bottom_panel', label: 'Base' },
  { value: 'top_panel', label: 'Tapa' },
  { value: 'shelf', label: 'Entrepaño' },
  { value: 'shelf-shoe', label: 'Zapatero' },
  { value: 'hanger_rail', label: 'Riel colgador' },
  { value: 'divider', label: 'Divisor' },
];

// Orden lógico de los grupos para que la base quede arriba y se reduzca el scroll.
const GROUP_ORDER = [
  'bottom_panel',
  'top_panel',
  'shelf',
  'shelf-shoe',
  'drawer_face',
  'door',
  'brace',
  'mirror',
  'hanger_rail',
  'seat_panel',
  'leg',
  'divider',
  'plinth',
];

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

function readUiState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeUiState(patch) {
  try {
    const current = readUiState();
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // ignorar entornos sin storage
  }
}

function getCategoryKey(piece) {
  const role = inferRole(piece);
  if (role === 'shelf' && isShoeRack(piece)) return 'shelf-shoe';
  return role;
}

function getCategoryLabel(key) {
  const option = CATEGORY_OPTIONS.find((o) => o.value === key);
  return option ? option.label : getPieceTypeLabel({ nombre: '' });
}

export function createPieceOffsetsConfig() {
  function mount(parent, store) {
    const state = store.get();
    const activePieces = getModulePieces(state.pieces, state.currentModule);
    const groups = groupPiecesByOriginalId(activePieces).filter((g) => isConfigurablePiece(g.piece));

    const collapsed = getCollapsed();
    const ui = readUiState();

    const root = document.createElement('div');
    root.className = `iso-config-panel cn-piece-offsets-panel${collapsed ? ' is-collapsed' : ''}`;
    root.style.width = '460px';
    root.style.maxWidth = 'calc(100vw - 2rem)';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.overflow = 'hidden';
    root.innerHTML = `
      <div class="iso-config-panel__header">
        <span>Offsets y gaps por pieza</span>
        <div class="iso-config-panel__actions">
          <button class="btn btn--icon btn--sm" data-toggle title="Ocultar/mostrar offsets">${collapsed ? '▶' : '▼'}</button>
          <button class="btn btn--secondary btn--sm" data-reset>Restaurar defaults</button>
        </div>
      </div>
      <div class="iso-config-panel__body" style="display:block;overflow:hidden;">
        ${renderPanel(groups, activePieces, state.userConfig, ui)}
      </div>
    `;

    const toggleBtn = root.querySelector('[data-toggle]');
    toggleBtn?.addEventListener('click', () => {
      const next = !root.classList.toggle('is-collapsed');
      toggleBtn.textContent = next ? '▼' : '▶';
      setCollapsed(!next);
    });

    // Delegación de eventos para inputs de offset/gap, búsqueda, filtro y secciones.
    root.addEventListener('click', (e) => {
      const headerBtn = e.target.closest('[data-role-toggle]');
      if (!headerBtn) return;
      const role = headerBtn.dataset.roleToggle;
      const tbody = root.querySelector(`tbody[data-role="${CSS.escape(role)}"]`);
      toggleSection(headerBtn, tbody, role);
    });

    root.addEventListener('input', (e) => {
      if (e.target.matches('[data-filter-search]')) {
        applyFilters(root);
        writeUiState({ search: e.target.value });
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.matches('input[data-field]')) {
        const originalId = e.target.dataset.originalId;
        const field = e.target.dataset.field;
        const value = parseFloat(e.target.value);
        if (originalId && field && Number.isFinite(value)) {
          updatePieceOffset(originalId, field, value);
        }
      } else if (e.target.matches('[data-filter-category]')) {
        applyFilters(root);
        writeUiState({ category: e.target.value });
      }
    });

    root.querySelector('[data-reset]')?.addEventListener('click', () => {
      resetPieceOffsets();
    });

    parent.appendChild(root);

    // Restaurar estado de búsqueda/filtro tras montar.
    const searchInput = root.querySelector('[data-filter-search]');
    const categorySelect = root.querySelector('[data-filter-category]');
    if (searchInput && ui.search) searchInput.value = ui.search;
    if (categorySelect && ui.category) categorySelect.value = ui.category;
    applyFilters(root);

    return root;
  }

  return { mount };
}

function toggleSection(button, tbody, role) {
  if (!tbody || !button) return;
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expanded));
  button.querySelector('.cn-group-header__chevron').textContent = expanded ? '▾' : '▸';
  tbody.classList.toggle('is-collapsed', !expanded);
  const ui = readUiState();
  const collapsed = { ...(ui.collapsed || {}), [role]: !expanded };
  writeUiState({ collapsed });
}

function computeInitialCollapsed(groups, ui) {
  const collapsed = { ...(ui.collapsed || {}) };
  // Si aún no hay preferencia guardada, colapsar automáticamente las secciones muy grandes
  // para evitar scroll excesivo en modelos con muchas piezas.
  const byCategory = new Map();
  groups.forEach((g) => {
    const key = getCategoryKey(g.piece);
    if (!byCategory.has(key)) byCategory.set(key, 0);
    byCategory.set(key, byCategory.get(key) + g.count);
  });
  byCategory.forEach((count, key) => {
    if (!(key in collapsed) && count > 8) {
      collapsed[key] = true;
    }
  });
  return collapsed;
}

function renderPanel(groups, activePieces, userConfig, ui) {
  if (!groups.length) {
    return '<p class="empty-state" style="padding:0.75rem;">No hay piezas configurables para este módulo.</p>';
  }

  const totalPieces = groups.reduce((sum, g) => sum + g.count, 0);
  const categoryOptions = CATEGORY_OPTIONS.map(
    (o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
  ).join('');
  const initialCollapsed = computeInitialCollapsed(groups, ui);

  return `
    <div class="cn-piece-offsets__toolbar">
      <input
        type="search"
        data-filter-search
        placeholder="Buscar pieza..."
        aria-label="Buscar pieza"
      />
      <select data-filter-category aria-label="Filtrar por categoría">
        ${categoryOptions}
      </select>
      <span class="cn-piece-offsets__total" data-total-counter data-total="${totalPieces}">${totalPieces} piezas</span>
    </div>
    <div class="cn-piece-offsets__table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:50%;">Pieza</th>
            <th style="width:28%;">Offset / Inset</th>
            <th style="width:22%;">Gap</th>
          </tr>
        </thead>
        ${renderTbodies(groups, activePieces, userConfig, initialCollapsed)}
      </table>
    </div>
  `;
}

function renderTbodies(groups, activePieces, userConfig, initialCollapsed) {
  const byCategory = new Map();
  groups.forEach((g) => {
    const key = getCategoryKey(g.piece);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(g);
  });

  return GROUP_ORDER
    .filter((key) => byCategory.has(key))
    .map((key) => {
      const items = byCategory
        .get(key)
        .slice()
        .sort((a, b) => {
          const za = getPieceOffsetConfig(a.piece, undefined, userConfig).zone || '';
          const zb = getPieceOffsetConfig(b.piece, undefined, userConfig).zone || '';
          if (za !== zb) return za.localeCompare(zb);
          return String(a.piece.nombre).localeCompare(String(b.piece.nombre));
        });
      const typeLabel = getCategoryLabel(key);
      const categoryCount = items.reduce((sum, it) => sum + it.count, 0);
      const isCollapsed = !!initialCollapsed[key];
      const rows = items.map((item) => renderRow(item, activePieces, userConfig, key)).join('');
      return `
        <tbody data-role="${escapeHtml(key)}" id="tbody-${escapeHtml(key)}" class="${isCollapsed ? 'is-collapsed' : ''}">
          <tr class="cn-group-header" data-role-header="${escapeHtml(key)}">
            <td colspan="3">
              <button
                type="button"
                data-role-toggle="${escapeHtml(key)}"
                aria-expanded="${!isCollapsed}"
                aria-controls="tbody-${escapeHtml(key)}"
              >
                <span class="cn-group-header__chevron">${isCollapsed ? '▸' : '▾'}</span>
                <span>${escapeHtml(typeLabel)}</span>
                <span class="cn-group-header__count">${categoryCount}</span>
              </button>
            </td>
          </tr>
          ${rows}
        </tbody>
      `;
    })
    .join('');
}

function renderRow({ originalId, piece, count }, activePieces, userConfig, categoryKey) {
  const cfg = getPieceOffsetConfig(piece, undefined, userConfig);
  const showGap = shouldShowGap(piece, activePieces);
  const typeLabel = getPieceTypeLabel(piece);
  const offsetPlaceholder = getOffsetPlaceholder(piece, cfg.zone);
  const gapPlaceholder = getGapPlaceholder(piece, cfg.zone);
  const offsetValue = Number.isFinite(cfg.offset) ? cfg.offset : VERTICAL_POSITIONS[getDefaultKey(piece, cfg.zone)] || 0;
  const gapValue = Number.isFinite(cfg.gap) ? cfg.gap : 0;
  const qtyBadge = count > 1 ? `<span class="badge badge--secondary">×${count}</span>` : '';
  const searchText = escapeHtml(`${typeLabel} ${piece.nombre}`.toLowerCase());

  return `
    <tr class="cn-piece-row" data-search="${searchText}" data-category="${escapeHtml(categoryKey)}" data-count="${count}">
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
          aria-label="${escapeHtml(offsetPlaceholder)} para ${escapeHtml(piece.nombre)}"
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
                placeholder="${escapeHtml(gapPlaceholder)}"
                step="any"
                min="0"
                aria-label="${escapeHtml(gapPlaceholder)} para ${escapeHtml(piece.nombre)}"
              />`
            : '<span class="empty-state">—</span>'
        }
      </td>
    </tr>
  `;
}

function applyFilters(root) {
  const searchInput = root.querySelector('[data-filter-search]');
  const categorySelect = root.querySelector('[data-filter-category]');
  const counter = root.querySelector('[data-total-counter]');
  if (!searchInput || !categorySelect) return;

  const term = searchInput.value.trim().toLowerCase();
  const category = categorySelect.value;
  const totalAll = Number(counter?.dataset.total || 0);

  let visiblePieces = 0;

  root.querySelectorAll('.cn-piece-row').forEach((row) => {
    const matchesSearch = !term || (row.dataset.search || '').includes(term);
    const matchesCategory = category === ALL_VALUE || row.dataset.category === category;
    const visible = matchesSearch && matchesCategory;
    row.style.display = visible ? '' : 'none';
    if (visible) visiblePieces += Number(row.dataset.count || 1);
  });

  root.querySelectorAll('[data-role-header]').forEach((header) => {
    const role = header.dataset.roleHeader;
    const tbody = root.querySelector(`tbody[data-role="${CSS.escape(role)}"]`);
    if (!tbody) return;
    const anyVisible = tbody.querySelector('.cn-piece-row:not([style*="display: none"])');
    header.style.display = anyVisible ? '' : 'none';
    const btn = header.querySelector('[data-role-toggle]');

    if (term || category !== ALL_VALUE) {
      // Durante búsqueda o filtro, expandir automáticamente las categorías con coincidencias.
      if (anyVisible && tbody.classList.contains('is-collapsed')) {
        setExpanded(btn, tbody, role, true, false);
      }
    } else {
      // Sin búsqueda ni filtro: restaurar estado de colapso persistido.
      const ui = readUiState();
      const desiredCollapsed = !!(ui.collapsed || {})[role];
      const currentlyCollapsed = btn?.getAttribute('aria-expanded') === 'false';
      if (currentlyCollapsed !== desiredCollapsed) {
        setExpanded(btn, tbody, role, !desiredCollapsed, false);
      }
    }
  });

  if (counter) {
    const showingAll = !term && category === ALL_VALUE;
    counter.textContent = showingAll
      ? `${totalAll} piezas`
      : `${visiblePieces} de ${totalAll} piezas`;
  }
}

function setExpanded(button, tbody, role, expanded, persist = true) {
  if (!button || !tbody) return;
  button.setAttribute('aria-expanded', String(expanded));
  button.querySelector('.cn-group-header__chevron').textContent = expanded ? '▾' : '▸';
  tbody.classList.toggle('is-collapsed', !expanded);
  if (persist) {
    const ui = readUiState();
    writeUiState({ collapsed: { ...(ui.collapsed || {}), [role]: !expanded } });
  }
}

function getDefaultKey(piece, zone) {
  // Fallback visual; el servicio real usa VERTICAL_POSITIONS directamente.
  const role = piece.role || inferRole(piece);
  if (zone === 'fixed-bottom') return 'shoeRackBaseOffset';
  if (role === 'divider') return 'dividerBaseOffset';
  if (zone === 'top') {
    if (role === 'shelf') return 'shelfTopInset';
    if (role === 'door') return 'doorTopInset';
    if (role === 'brace') return 'braceTopInset';
    if (role === 'mirror') return 'mirrorTopInset';
  }
  return 'defaultGap';
}
