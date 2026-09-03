// js/views/renderer3DView.js — Vista del renderizador 3D orbital SVG

import { getModulePieces, getModuleLabel, getModules } from '../utils.js';
import { Renderer3D, DEFAULT_CAMERA } from '../renderer3d/index.js';
import { COLORS } from '../core/config.js';

export function createRenderer3DView(store) {
  let unsubscribe = null;
  let unsubscribeConfig = null;
  let container = null;
  let canvas = null;
  let renderer = null;
  let renderLoopId = null;
  let moduleGapMode = 'compact';

  function startRenderLoop() {
    if (renderLoopId !== null) return;
    const loop = () => {
      renderer?.render();
      renderLoopId = requestAnimationFrame(loop);
    };
    renderLoopId = requestAnimationFrame(loop);
  }

  function stopRenderLoop() {
    if (renderLoopId !== null) {
      cancelAnimationFrame(renderLoopId);
      renderLoopId = null;
    }
  }

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', () => renderView(container, store.get()));
    unsubscribeConfig = store.subscribe('userConfig:changed', () => renderView(container, store.get()));
    renderView(container, store.get());
  }

  function destroy() {
    stopRenderLoop();
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (unsubscribeConfig) {
      unsubscribeConfig();
      unsubscribeConfig = null;
    }
    if (renderer) {
      renderer.destroy();
      renderer = null;
    }
    container = null;
    canvas = null;
  }

  function renderView(container, state) {
    const targetModule = state.currentModule;
    const modules = getModules(state.pieces);
    const pieces = getModulePieces(state.pieces, targetModule);

    if (!pieces.length) {
      const options = modules.map((m) => `<option value="${m}" ${m === targetModule ? 'selected' : ''}>${getModuleLabel(m, state.pieces)}</option>`).join('');
      container.innerHTML = `
        <div class="card">
          <div class="card__body">
            <p class="empty-state mb-2">Selecciona un módulo para ver la vista 3D.</p>
            <select id="r3d-module-selector" class="input" ${options ? '' : 'disabled'}>
              ${options || '<option disabled>No hay módulos</option>'}
            </select>
          </div>
        </div>`;
      container.querySelector('#r3d-module-selector')?.addEventListener('change', (e) => {
        store.set({ currentModule: e.target.value });
      });
      return;
    }

    container.innerHTML = `
      <div class="card" style="height:100%;display:flex;flex-direction:column;">
        <div class="card__header">
          <h2 class="card__title">Vista 3D — ${getModuleLabel(targetModule, state.pieces)}</h2>
          <div class="r3d-controls flex gap-1 flex-wrap">
            <button id="r3d-reset" class="btn btn--secondary btn--sm">↺ Reset</button>
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
              <input type="checkbox" id="r3d-dims" style="cursor:pointer;">
              <span>Cotas</span>
            </label>
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
              <input type="checkbox" id="r3d-xray" style="cursor:pointer;">
              <span>X-ray</span>
            </label>
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
              <input type="checkbox" id="r3d-gap-mode" ${moduleGapMode === 'projected' ? 'checked' : ''} style="cursor:pointer;">
              <span>Gap profundidad</span>
            </label>
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
              <input type="checkbox" id="r3d-projection" style="cursor:pointer;">
              <span>Perspectiva</span>
            </label>
            <span class="r3d-presets flex gap-05" style="display:inline-flex;gap:0.5rem;">
              <button class="r3d-preset btn btn--secondary btn--sm" data-preset="iso">Iso</button>
              <button class="r3d-preset btn btn--secondary btn--sm" data-preset="front">Frente</button>
              <button class="r3d-preset btn btn--secondary btn--sm" data-preset="side">Lado</button>
              <button class="r3d-preset btn btn--secondary btn--sm" data-preset="top">Arriba</button>
            </span>
          </div>
        </div>
        <div class="r3d-sliders card__body" style="padding:0.5rem 1rem;">
          <div class="r3d-slider-group">
            <label for="r3d-opacity">Opacidad</label>
            <input type="range" id="r3d-opacity" min="0.15" max="1" step="0.05" value="0.85">
          </div>
          <div class="r3d-slider-group">
            <label for="r3d-explode">Explode</label>
            <input type="range" id="r3d-explode" min="0" max="1" step="0.05" value="0">
          </div>
          <div class="r3d-slider-group">
            <label for="r3d-rot-x">Rotación X</label>
            <input type="range" id="r3d-rot-x" min="-60" max="60" step="1" value="${DEFAULT_CAMERA.rotX}">
          </div>
          <div class="r3d-slider-group">
            <label for="r3d-rot-y">Rotación Y</label>
            <input type="range" id="r3d-rot-y" min="-90" max="90" step="1" value="${DEFAULT_CAMERA.rotY}">
          </div>
        </div>
        <div class="card__body" style="flex:1;min-height:0;position:relative;padding:0;">
          <div id="r3d-canvas" class="r3d-canvas" style="width:100%;height:100%;min-height:400px;background:${COLORS.background};border-radius:6px;overflow:hidden;"></div>
        </div>
      </div>`;

    canvas = container.querySelector('#r3d-canvas');
    renderer = new Renderer3D(canvas, {
      width: 900,
      height: 600,
      globalOpacity: 0.85,
      moduleGapMode,
      verticalPositionOverrides: state.userConfig,
    });
    renderer.load(targetModule, state.pieces);

    startRenderLoop();

    const rotXInput = container.querySelector('#r3d-rot-x');
    const rotYInput = container.querySelector('#r3d-rot-y');

    function updateSlidersFromCamera() {
      const cam = renderer.controls.getState();
      if (rotXInput) rotXInput.value = String(Math.round(cam.rotX));
      if (rotYInput) rotYInput.value = String(Math.round(cam.rotY));
    }

    container.querySelector('#r3d-reset')?.addEventListener('click', () => {
      renderer.controls.reset();
      updateSlidersFromCamera();
    });
    container.querySelector('#r3d-dims')?.addEventListener('change', (e) => renderer.setShowDimensions(e.target.checked));
    container.querySelector('#r3d-xray')?.addEventListener('change', (e) => renderer.setXrayMode(e.target.checked));
    container.querySelector('#r3d-projection')?.addEventListener('change', (e) => renderer.setProjection(e.target.checked ? 'persp' : 'ortho'));
    container.querySelector('#r3d-opacity')?.addEventListener('input', (e) => renderer.setGlobalOpacity(Number(e.target.value)));
    container.querySelector('#r3d-explode')?.addEventListener('input', (e) => renderer.setExplodeFactor(Number(e.target.value)));
    rotXInput?.addEventListener('input', (e) => renderer.setRotX(e.target.value));
    rotYInput?.addEventListener('input', (e) => renderer.setRotY(e.target.value));

    container.querySelectorAll('.r3d-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = renderer.applyViewPreset(btn.dataset.preset);
        if (preset) updateSlidersFromCamera();
      });
    });

    container.querySelectorAll('.r3d-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = renderer.applyViewPreset(btn.dataset.preset);
        if (preset) updateSlidersFromCamera();
      });
    });

    renderer.controls.addChangeListener(updateSlidersFromCamera);
    renderer.controls._onChange = () => updateSlidersFromCamera();

    const gapCheckbox = container.querySelector('#r3d-gap-mode');
    if (gapCheckbox) {
      gapCheckbox.addEventListener('change', () => {
        moduleGapMode = gapCheckbox.checked ? 'projected' : 'compact';
        renderer.setModuleGapMode?.(moduleGapMode);
      });
    }
  }

  return { mount, destroy };
}
