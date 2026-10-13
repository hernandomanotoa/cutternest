// js/components/moduleSelector.js — Selector de módulo del estado vacío
// (vista isométrica y vista 3D). Renderiza la tarjeta "Selecciona un módulo"
// con las opciones de getModuleOptions indentadas por profundidad jerárquica.
// Componente sin estado: no toca el store; avisa del cambio vía onChange.
// DOM solo dentro de mount(); el módulo es importable en Node sin DOM.

import { getModuleOptions } from '../utils/helpers.js';

export function createModuleSelector({ id, emptyText, onChange = () => {} }) {
  function mount(parent, { pieces, currentModule }) {
    const options = getModuleOptions(pieces)
      .map((o) => {
        const indent = o.depth > 0 ? '\u00A0\u00A0'.repeat(o.depth) + '\u21B3 ' : '';
        return `<option value="${o.id}" ${o.id === currentModule ? 'selected' : ''}>${indent}${o.label}</option>`;
      })
      .join('');
    parent.innerHTML = `
      <div class="card">
        <div class="card__body">
          <p class="empty-state mb-2">${emptyText}</p>
          <select id="${id}" class="input" ${options ? '' : 'disabled'}>
            ${options || '<option disabled>No hay módulos</option>'}
          </select>
        </div>
      </div>`;
    parent.querySelector(`#${id}`)?.addEventListener('change', (e) => onChange(e.target.value));
  }

  return { mount };
}
