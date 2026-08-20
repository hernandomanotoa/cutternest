# isometricView.js — Vista isométrica

## Código fuente completo

Archivo: `frontend/public/assembly-planner/js/views/isometricView.js`

```javascript
// js/views/isometricView.js — Vista isométrica 3D SVG

import { getModulePieces, getModuleLabel } from '../utils.js';
import { IsometricRenderer } from '../isometricRenderer.js';
import { state } from '../app.js';

export function renderIsometricView(container, viewState) {
  const pieces = getModulePieces(viewState.pieces, viewState.currentModule);

  if (!pieces.length) {
    container.innerHTML = `
      <div class="card">
        <div class="card__body">
          <p class="empty-state">Importa un CSV y selecciona un módulo para ver la vista isométrica.</p>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h2 class="card__title">Vista isométrica 3D</h2>
        <div class="isometric-controls flex gap-1">
          <button id="btn-iso-zoom-in" class="btn btn--secondary btn--sm">Zoom +</button>
          <button id="btn-iso-zoom-out" class="btn btn--secondary btn--sm">Zoom −</button>
          <button id="btn-iso-reset" class="btn btn--secondary btn--sm">Reset</button>
          <button id="btn-iso-explode" class="btn btn--secondary btn--sm">Explodida</button>
          <button id="btn-iso-drawers" class="btn btn--secondary btn--sm">Abrir cajones</button>
          <button id="btn-iso-doors" class="btn btn--secondary btn--sm">Abrir puertas</button>
          <button id="btn-iso-export" class="btn btn--primary btn--sm">Exportar SVG</button>
        </div>
      </div>
      <div class="card__body">
        <div id="iso-canvas" class="iso-canvas" style="width:100%;min-height:400px;"></div>
      </div>
    </div>`;

  const canvas = container.querySelector('#iso-canvas');
  let scale = 0.12;
  let explodeFactor = 0;
  let drawerGap = 15;
  let doorAngle = 0;

  const label = getModuleLabel(viewState.currentModule, viewState.pieces);

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
      labelMode: 'auto',
    });
    renderer.render(viewState.currentModule, pieces, viewState.dependencies);
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
    a.download = `cutternest-iso-${viewState.currentModule}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

```
