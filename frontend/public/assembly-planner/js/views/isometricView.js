// js/views/isometricView.js — Vista isométrica 3D SVG

import { getModulePieces, getModuleLabel, getModules } from '../utils.js';
import { COLORS } from '../core/config.js';
import { IsometricRenderer } from '../isometricRenderer.js';
import { createInlineVerticalConfig } from '../components/inlineVerticalConfig.js';

export function createIsometricView(store) {
  let unsubscribe = null;
  let unsubscribeConfig = null;
  let container = null;
  let canvas = null;
  let scale = 0.12;
  let explodeFactor = 0;
  let drawerGap = 15;
  let doorAngle = 0;
  let isoFlip = true;
  let fullscreenChangeHandler = null;
  let webkitFullscreenChangeHandler = null;

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', () => renderView(container, store.get()));
    unsubscribeConfig = store.subscribe('userConfig:changed', () => render());
    renderView(container, store.get());
  }

  function destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (unsubscribeConfig) {
      unsubscribeConfig();
      unsubscribeConfig = null;
    }
    if (fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
      fullscreenChangeHandler = null;
    }
    if (webkitFullscreenChangeHandler) {
      document.removeEventListener('webkitfullscreenchange', webkitFullscreenChangeHandler);
      webkitFullscreenChangeHandler = null;
    }
    container = null;
    canvas = null;
  }

  function renderView(container, state) {
    let targetModule = state.currentModule;
    const modules = getModules(state.pieces);
    const pieces = getModulePieces(state.pieces, targetModule);

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
        store.set({ currentModule: e.target.value });
      });
      return;
    }

    container.innerHTML = `
      <div class="card" style="height:100%;display:flex;flex-direction:column;">
        <div class="card__header">
          <h2 class="card__title">Vista isométrica 3D — ${getModuleLabel(targetModule, state.pieces)}</h2>
          <div class="isometric-controls flex gap-1 flex-wrap">
            <button id="btn-iso-zoom-in" class="btn btn--secondary btn--sm">Zoom +</button>
            <button id="btn-iso-zoom-out" class="btn btn--secondary btn--sm">Zoom −</button>
            <button id="btn-iso-reset" class="btn btn--secondary btn--sm">Reset</button>
            <button id="btn-iso-explode" class="btn btn--secondary btn--sm">Explodida</button>
            <button id="btn-iso-flip" class="btn btn--secondary btn--sm">↔ Invertir perspectiva</button>
            <button id="btn-iso-drawers" class="btn btn--secondary btn--sm">Abrir cajones</button>
            <button id="btn-iso-doors" class="btn btn--secondary btn--sm">Abrir puertas</button>
            <button id="btn-iso-export" class="btn btn--primary btn--sm">Exportar SVG</button>
            <button id="btn-iso-fullscreen" class="btn btn--secondary btn--sm">⛶ Pantalla completa</button>
          </div>
        </div>
        <div class="card__body" style="flex:1;min-height:0;position:relative;">
          <div id="iso-canvas" class="iso-canvas" style="width:100%;height:100%;min-height:400px;background:${COLORS.background};border-radius:6px;overflow:hidden;"></div>
          <div id="iso-config-host" class="iso-config-host"></div>
        </div>
      </div>`;

    canvas = container.querySelector('#iso-canvas');
    render();

    createInlineVerticalConfig().mount(
      container.querySelector('#iso-config-host'),
      store
    );

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
      explodeFactor = explodeFactor > 0 ? 0 : 0.7;
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

    const card = container.querySelector('.card');
    const btnFullscreen = container.querySelector('#btn-iso-fullscreen');
    function updateFullscreenBtn() {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (btnFullscreen) btnFullscreen.textContent = isFull ? 'Salir pantalla completa' : '⛶ Pantalla completa';
    }
    function toggleFullscreen() {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (isFull) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (card) {
        if (card.requestFullscreen) card.requestFullscreen();
        else if (card.webkitRequestFullscreen) card.webkitRequestFullscreen();
      }
    }
    if (fullscreenChangeHandler) document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
    if (webkitFullscreenChangeHandler) document.removeEventListener('webkitfullscreenchange', webkitFullscreenChangeHandler);
    btnFullscreen?.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenBtn);
    document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
    fullscreenChangeHandler = updateFullscreenBtn;
    webkitFullscreenChangeHandler = updateFullscreenBtn;
  }

  function render() {
    if (!canvas) return;
    const state = store.get();
    const pieces = getModulePieces(state.pieces, state.currentModule);
    const renderer = new IsometricRenderer(canvas, {
      scale,
      isoDepth: 0.5,
      padding: 100,
      showDimensions: true,
      drawerGap,
      doorAngle,
      explodeFactor,
      isoFlip,
      labelMode: 'auto',
      verticalPositionOverrides: state.userConfig,
    });
    renderer.render(state.currentModule, pieces, state.dependencies);
    const svg = canvas.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.maxHeight = 'none';
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  }

  return { mount, destroy };
}
