// js/components/inlineVerticalConfig.js — Panel inline de offsets verticales para la vista isométrica
// Componente sin estado: renderiza inputs a partir del store y delega cambios a app.js.

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

export function createInlineVerticalConfig() {
  function mount(parent, store) {
    const state = store.get();
    const values = state.userConfig || { ...VERTICAL_POSITIONS };

    const root = document.createElement('div');
    root.className = 'iso-config-panel card';
    root.innerHTML = `
      <div class="iso-config-panel__header">
        <span>Offsets verticales</span>
        <button class="btn btn--secondary btn--sm" data-reset>Restaurar defaults</button>
      </div>
      <div class="iso-config-panel__body">
        ${CONFIG_FIELDS.map(({ key, label }) => {
          const value = Number.isFinite(values[key]) ? values[key] : VERTICAL_POSITIONS[key];
          return `
            <div class="form-group">
              <label for="iso-config-${key}">${label}</label>
              <input
                id="iso-config-${key}"
                type="number"
                data-config-key="${key}"
                value="${value}"
                placeholder="${VERTICAL_POSITIONS[key]}"
                step="any"
                min="0"
              />
            </div>
          `;
        }).join('')}
      </div>
    `;

    root.querySelectorAll('input[data-config-key]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.configKey;
        const value = parseFloat(input.value);
        if (Number.isFinite(value)) {
          updateUserConfig(key, value);
        }
      });
    });

    root.querySelector('[data-reset]')?.addEventListener('click', () => {
      resetUserConfig();
    });

    parent.appendChild(root);
    return root;
  }

  return { mount };
}
