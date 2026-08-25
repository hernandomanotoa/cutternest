// js/views/settingsView.js — Panel de configuración de offsets verticales

import { $ } from '../utils.js';
import { VERTICAL_POSITIONS } from '../core/config.js';
import { updateUserConfig, resetUserConfig } from '../app.js';

const CONFIG_FIELDS = [
  { key: 'defaultGap', label: 'Gap entre repisas (mm)' },
  { key: 'fixedBottomMargin', label: 'Margen inferior fijo (mm)' },
  { key: 'shelfTopOffset', label: 'Offset repisa superior (mm)' },
  { key: 'shelfBottomOffset', label: 'Offset repisa inferior (mm)' },
  { key: 'shelfMiddleGap', label: 'Gap estantes regulables (mm)' },
  { key: 'shoeRackBottomOffset', label: 'Altura base zapateros (mm)' },
  { key: 'shoeRackGap', label: 'Gap entre zapateros (mm)' },
  { key: 'seatHeight', label: 'Altura del asiento (mm)' },
  { key: 'hangerRailHeight', label: 'Altura riel colgador (mm)' },
];

export function createSettingsView(store) {
  let container = null;

  function mount(parent) {
    container = parent;
    render(container, store.get());
  }

  function destroy() {
    container = null;
  }

  return { mount, destroy };
}

function render(container, state) {
  const values = state.userConfig || { ...VERTICAL_POSITIONS };

  container.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h2 class="card__title">⚙ Configuración de posicionamiento vertical</h2>
      </div>
      <div class="card__body">
        <p class="empty-state mb-2">
          Ajusta los offsets usados por el renderizador isométrico y el manual de ensamblaje.
        </p>
        <div class="form-group-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;">
          ${CONFIG_FIELDS.map(({ key, label }) => renderField(key, label, values[key])).join('')}
        </div>
        <div class="flex gap-1 mt-2">
          <button id="btn-reset-config" class="btn btn--danger">Restaurar defaults</button>
        </div>
      </div>
    </div>
  `;

  bindEvents(container);
}

function renderField(key, label, value) {
  return `
    <div class="form-group">
      <label for="config-${key}">${label}</label>
      <input
        id="config-${key}"
        type="number"
        data-config-key="${key}"
        value="${Number.isFinite(value) ? value : VERTICAL_POSITIONS[key]}"
        step="any"
        min="0"
      />
    </div>
  `;
}

function bindEvents(container) {
  container.querySelectorAll('input[data-config-key]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.configKey;
      const value = parseFloat(input.value);
      if (Number.isFinite(value)) {
        updateUserConfig(key, value);
      }
    });
  });

  $('#btn-reset-config', container)?.addEventListener('click', () => {
    resetUserConfig();
    render(container, { userConfig: { ...VERTICAL_POSITIONS } });
  });
}
