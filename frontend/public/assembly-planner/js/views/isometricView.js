// js/views/isometricView.js — Vista isométrica 3D SVG

import { getModulePieces, getModuleLabel, getModules } from '../utils.js';
import { IsometricRenderer } from '../isometricRenderer.js';

export function renderIsometricView(container, viewState) {
  // Si estamos en global sin piezas, mostrar mensaje útil con selector
  let targetModule = viewState.currentModule;
  const modules = getModules(viewState.pieces);
  const pieces = getModulePieces(viewState.pieces, targetModule);

  if (!pieces.length) {
    const options = modules.map((m) => `<option value="${m}" ${m === targetModule ? 'selected' : ''}>Módulo ${m}</option>`).join('');
    container.innerHTML = `
      <div class="card">
        <div class="card__body">
          <p class="empty-state mb-2">Selecciona un módulo para ver la vista isométrica.</p>
          <select id="iso-module-selector" class="input" ${options ? '' : 'disabled'}>
            ${options || '<option disabled>No hay módulos</option>'}
          </select>
        </div>
      </div>`;
    const select = container.querySelector('#iso-module-selector');
    select?.addEventListener('change', (e) => {
      viewState.currentModule = e.target.value;
      renderIsometricView(container, viewState);
    });
    return;
  }

  container.innerHTML = `
    <div class="card" style="height:100%;display:flex;flex-direction:column;">
      <div class="card__header">
        <h2 class="card__title">Vista isométrica 3D</h2>
        <div class="isometric-controls flex gap-1 flex-wrap">
          <button id="btn-iso-zoom-in" class="btn btn--secondary btn--sm">Zoom +</button>
          <button id="btn-iso-zoom-out" class="btn btn--secondary btn--sm">Zoom −</button>
          <button id="btn-iso-reset" class="btn btn--secondary btn--sm">Reset</button>
          <button id="btn-iso-explode" class="btn btn--secondary btn--sm">Explodida</button>
          <button id="btn-iso-flip" class="btn btn--secondary btn--sm">↔ Invertir perspectiva</button>
          <button id="btn-iso-drawers" class="btn btn--secondary btn--sm">Abrir cajones</button>
          <button id="btn-iso-doors" class="btn btn--secondary btn--sm">Abrir puertas</button>
          <button id="btn-iso-export" class="btn btn--primary btn--sm">Exportar SVG</button>
        </div>
      </div>
      <div class="card__body" style="flex:1;min-height:0;">
        <div id="iso-canvas" class="iso-canvas" style="width:100%;height:100%;min-height:400px;background:#0f172a;border-radius:6px;overflow:hidden;"></div>
      </div>
    </div>`;

  const canvas = container.querySelector('#iso-canvas');
  let scale = 0.12;
  let explodeFactor = 0;
  let drawerGap = 15;
  let doorAngle = 0;
  let isoFlip = false;

  function render() {
    const renderer = new IsometricRenderer(canvas, {
      scale,
      isoDepth: 0.5,
      padding: 100,
      showDimensions: true,
      showAxes: true,
      drawerGap,
      doorAngle,
      explodeFactor,
      isoFlip,
      labelMode: 'auto',
    });
    renderer.render(targetModule, pieces, viewState.dependencies);
    // Asegurar que el SVG llene el contenedor
    const svg = canvas.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.maxHeight = 'none';
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  }

  render();

  // Controles
  container.querySelector('#btn-iso-zoom-in')?.addEventListener('click', () => {
    scale = Math.min(scale * 1.2, 0.5);
    render();
  });
  container.querySelector('#btn-iso-zoom-out')?.addEventListener('click', () => {
    scale = Math.max(scale / 1.2, 0.03);
    render();
  });
  container.querySelector('#btn-iso-reset')?.addEventListener('click', () => {
    scale = 0.12;
    explodeFactor = 0;
    drawerGap = 15;
    doorAngle = 0;
    render();
  });
  container.querySelector('#btn-iso-explode')?.addEventListener('click', () => {
    explodeFactor = explodeFactor > 0 ? 0 : 0.3;
    render();
  });
  container.querySelector('#btn-iso-flip')?.addEventListener('click', () => {
    isoFlip = !isoFlip;
    render();
  });

  container.querySelector('#btn-iso-drawers')?.addEventListener('click', () => {
    drawerGap = drawerGap > 15 ? 15 : 60;
    render();
  });
  container.querySelector('#btn-iso-doors')?.addEventListener('click', () => {
    doorAngle = doorAngle > 0 ? 0 : 25;
    render();
  });
  container.querySelector('#btn-iso-export')?.addEventListener('click', () => {
    const svg = canvas.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutternest-iso-${targetModule}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}
