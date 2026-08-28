// js/components/inlineVerticalConfig.js — Panel inline de offsets verticales para la vista isométrica
// Componente sin estado: renderiza inputs a partir del store y delega cambios a app.js.
// Solo muestra los offsets relevantes para las piezas del módulo activo.

import { VERTICAL_POSITIONS } from '../core/config.js';
import { updateUserConfig, resetUserConfig } from '../app.js';
import { getModulePieces } from '../utils.js';
import { inferRole, isShoeRack } from '../services/classifierService.js';

const CONFIG_FIELDS = [
  // Base (bottom_panel): offset desde el suelo
  { key: 'bottomPanelOffset', label: 'Altura de la base desde el suelo (mm)', roles: ['bottom_panel'] },
  // General (siempre visibles)
  { key: 'defaultGap', label: 'Gap entre piezas (mm)' },
  { key: 'firstInnerGap', label: 'Gap base → primera pieza (mm)' },
  // Repisas / estantes
  { key: 'shelfTopInset', label: 'Inset repisa superior desde tapa (mm)', roles: ['shelf'] },
  { key: 'shelfBaseOffset', label: 'Offset repisa inferior desde base (mm)', roles: ['shelf'] },
  { key: 'shelfMiddleGap', label: 'Gap estantes regulables (mm)', roles: ['shelf'] },
  // Zapateros
  { key: 'shoeRackBaseOffset', label: 'Offset zapatero desde base (mm)', zapatero: true },
  { key: 'shoeRackGap', label: 'Gap entre zapateros (mm)', zapatero: true },
  // Cajones
  { key: 'drawerFaceGap', label: 'Gap entre frentes de cajón (mm)', roles: ['drawer_face'] },
  { key: 'drawerBaseOffset', label: 'Offset frente cajón inferior desde base (mm)', roles: ['drawer_face'] },
  // Puertas
  { key: 'doorGap', label: 'Gap entre puertas (mm)', roles: ['door'] },
  { key: 'doorTopInset', label: 'Inset puerta superior desde tapa (mm)', roles: ['door'] },
  { key: 'doorBaseOffset', label: 'Offset puerta inferior desde base (mm)', roles: ['door'] },
  // Travesaños / soportes
  { key: 'braceTopInset', label: 'Inset travesaño superior desde tapa (mm)', roles: ['brace'] },
  { key: 'braceBaseOffset', label: 'Offset travesaño inferior desde base (mm)', roles: ['brace'] },
  // Espejos
  { key: 'mirrorTopInset', label: 'Inset espejo desde tapa (mm)', roles: ['mirror'] },
  // Patas
  { key: 'legOffsetX', label: 'Margen patas desde lateral (mm)', roles: ['leg'] },
  { key: 'legOffsetY', label: 'Margen patas desde frente/fondo (mm)', roles: ['leg'] },
  // Asientos
  { key: 'seatHeight', label: 'Altura del asiento (mm)', roles: ['seat_panel'] },
  // Riel colgador
  { key: 'hangerRailHeight', label: 'Altura riel colgador (mm)', roles: ['hanger_rail'] },
];

export function createInlineVerticalConfig() {
  function mount(parent, store) {
    const state = store.get();
    const values = state.userConfig || { ...VERTICAL_POSITIONS };

    // Filtrar offsets relevantes según las piezas del módulo activo.
    const activePieces = getModulePieces(state.pieces, state.currentModule);
    const roles = new Set(activePieces.map((p) => inferRole(p)));
    const hasZapatero = activePieces.some((p) => isShoeRack(p));

    const visibleFields = CONFIG_FIELDS.filter((f) => {
      if (f.zapatero) return hasZapatero;
      if (f.roles) return f.roles.some((r) => roles.has(r));
      return true;
    });

    const root = document.createElement('div');
    root.className = 'iso-config-panel card';
    root.innerHTML = `
      <div class="iso-config-panel__header">
        <span>Offsets verticales</span>
        <button class="btn btn--secondary btn--sm" data-reset>Restaurar defaults</button>
      </div>
      <div class="iso-config-panel__body">
        ${
          visibleFields.length
            ? visibleFields
                .map(({ key, label }) => {
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
                })
                .join('')
            : '<p class="empty-state">No hay offsets relevantes para este módulo.</p>'
        }
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
