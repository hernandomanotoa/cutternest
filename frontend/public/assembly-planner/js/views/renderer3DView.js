// js/views/renderer3DView.js — Vista del renderizador 3D orbital SVG

import { getModulePieces, getModuleLabel, getModules, escapeHtml } from '../utils.js';
import { buildAssemblyLevels, buildAssemblySequence } from '../services/assemblyStepService.js';
import { generarInstruccion, toolsForStep } from '../instructions.js';
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
  let playTimer = null;

  function stopPlayTimer() {
    if (playTimer !== null) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

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
    stopPlayTimer();
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
            <button id="r3d-step-mode" class="btn btn--secondary btn--sm" ${pieces.length ? '' : 'disabled'}>Modo paso</button>
            <span id="r3d-step-bar" style="display:none;align-items:center;gap:0.4rem;">
              <button id="r3d-step-prev" class="btn btn--secondary btn--sm">◀</button>
              <span id="r3d-step-label" style="font-size:0.8rem;color:#c9d1d9;white-space:nowrap;">Paso 1/1</span>
              <button id="r3d-step-next" class="btn btn--secondary btn--sm">▶</button>
              <button id="r3d-step-play" class="btn btn--secondary btn--sm">▶ Play</button>
            </span>
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
          <div class="r3d-slider-group">
            <label for="r3d-section-axis">Sección</label>
            <select id="r3d-section-axis" class="input" style="width:auto;">
              <option value="">Ninguna</option>
              <option value="x">Plano X</option>
              <option value="y">Plano Y</option>
              <option value="z">Plano Z</option>
            </select>
          </div>
          <div class="r3d-slider-group">
            <label for="r3d-section-t">Posición</label>
            <input type="range" id="r3d-section-t" min="0" max="100" step="1" value="100" disabled>
          </div>
        </div>
        <div class="card__body" style="flex:1;min-height:0;position:relative;padding:0;">
          <div style="display:flex;gap:0.75rem;height:100%;min-height:400px;padding:0.75rem;">
            <div id="r3d-canvas" class="r3d-canvas" style="flex:1;min-width:0;height:100%;background:${COLORS.background};border-radius:6px;overflow:hidden;"></div>
            <aside id="r3d-bom" style="width:240px;flex-shrink:0;overflow-y:auto;background:var(--surface,#161b22);border:1px solid var(--border,#30363d);border-radius:6px;padding:0.5rem;">
              <h3 style="margin:0 0 0.5rem;font-size:0.8rem;color:#8b949e;text-transform:uppercase;">Piezas (${pieces.length})</h3>
              <ul style="list-style:none;margin:0;padding:0;">
                ${pieces.map((p) => `
                  <li data-piece-id="${escapeHtml(p.id)}" class="r3d-bom__row"
                      style="padding:0.35rem 0.5rem;border-radius:4px;cursor:pointer;font-size:0.8rem;color:#c9d1d9;border-bottom:1px solid #21262d;">
                    <div style="font-weight:600;">${escapeHtml(p.nombre || p.id)}</div>
                    <div style="color:#8b949e;">${Number(p.ancho)}×${Number(p.alto)}×${Number(p.espesor)} mm · cantos: ${escapeHtml(p.cantos || '—')} · ×${Number(p.cantidad) || 1}</div>
                  </li>`).join('')}
              </ul>
            </aside>
          </div>
        </div>
        <div id="r3d-step-panel" class="card__body" style="display:none;padding:0.6rem 1rem;border-top:1px solid var(--border,#30363d);">
          <div id="r3d-step-instruction" style="font-size:0.85rem;color:#c9d1d9;margin:0 0 0.35rem;line-height:1.4;"></div>
          <div id="r3d-step-tools" style="font-size:0.75rem;color:#8b949e;"></div>
        </div>
      </div>`;

    canvas = container.querySelector('#r3d-canvas');
    renderer = new Renderer3D(canvas, {
      width: 900,
      height: 600,
      globalOpacity: 0.85,
      moduleGapMode,
      verticalPositionOverrides: state.userConfig,
      onPieceSelect: (id) => syncBomSelection(id),
    });
    renderer.load(targetModule, state.pieces);

    startRenderLoop();

    // BOM ↔ 3D bidireccional
    const bomRows = () => Array.from(container.querySelectorAll('.r3d-bom__row'));
    function syncBomSelection(id) {
      bomRows().forEach((row) => {
        row.style.background = row.dataset.pieceId === id ? '#2d333b' : 'transparent';
        row.style.color = row.dataset.pieceId === id ? '#FFD700' : '#c9d1d9';
      });
    }
    bomRows().forEach((row) => {
      row.addEventListener('mouseenter', () => renderer.setHoveredId(row.dataset.pieceId));
      row.addEventListener('mouseleave', () => renderer.setHoveredId(null));
      row.addEventListener('click', () => {
        const id = row.dataset.pieceId;
        renderer.setSelectedId(renderer.selectedId === id ? null : id);
        syncBomSelection(renderer.selectedId);
      });
    });

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

    renderer.controls.addChangeListener(updateSlidersFromCamera);

    const gapCheckbox = container.querySelector('#r3d-gap-mode');
    if (gapCheckbox) {
      gapCheckbox.addEventListener('change', () => {
        moduleGapMode = gapCheckbox.checked ? 'projected' : 'compact';
        renderer.setModuleGapMode?.(moduleGapMode);
      });
    }

    const sectionAxisSel = container.querySelector('#r3d-section-axis');
    const sectionTInput = container.querySelector('#r3d-section-t');
    if (sectionAxisSel && sectionTInput) {
      sectionAxisSel.addEventListener('change', () => {
        const axis = sectionAxisSel.value || null;
        sectionTInput.disabled = !axis;
        renderer.setSection(axis, Number(sectionTInput.value) / 100);
      });
      sectionTInput.addEventListener('input', () => {
        renderer.setSection(sectionAxisSel.value || null, Number(sectionTInput.value) / 100);
      });
    }

    // Modo ensamblaje paso a paso: secuencia de armado físico (casco exterior
    // primero, interiores intercalados por altura real). No usa el grafo Kahn,
    // cuyo orden izq→divisor→der se conserva para manual/grafo.
    const positions = new Map(renderer.geometries.map((g) => [g.id, g.z]));
    const sequence = buildAssemblySequence(pieces, positions);
    const totalSteps = sequence.totalPasos;
    renderer.setAssemblyLevels(buildAssemblyLevels(pieces, positions));
    const piezasData = Object.fromEntries(pieces.map((p) => [p.id, p]));

    const stepModeBtn = container.querySelector('#r3d-step-mode');
    const stepBar = container.querySelector('#r3d-step-bar');
    const stepLabel = container.querySelector('#r3d-step-label');
    const stepPanel = container.querySelector('#r3d-step-panel');
    const stepInstruction = container.querySelector('#r3d-step-instruction');
    const stepTools = container.querySelector('#r3d-step-tools');
    const playBtn = container.querySelector('#r3d-step-play');
    let stepMode = false;
    let currentStep = 1;

    // Si quedó un play activo de un render anterior (cambio de módulo/piezas), se detiene.
    stopPlayTimer();
    if (playBtn) playBtn.textContent = '▶ Play';

    function renderStepPanel() {
      if (!stepMode) {
        if (stepPanel) stepPanel.style.display = 'none';
        return;
      }
      const step = sequence.steps[currentStep - 1];
      if (stepInstruction) stepInstruction.textContent = generarInstruccion(step, piezasData);
      if (stepTools) stepTools.textContent = `Herramientas: ${toolsForStep(step, piezasData).join(', ')}`;
      if (stepPanel) stepPanel.style.display = 'block';
    }

    function stopPlay() {
      stopPlayTimer();
      if (playBtn) playBtn.textContent = '▶ Play';
    }

    function updateStepUI() {
      if (stepLabel) stepLabel.textContent = `Paso ${currentStep}/${totalSteps}`;
      renderer.setAssemblyStep(stepMode ? currentStep : null);
      renderStepPanel();
    }
    stepModeBtn?.addEventListener('click', () => {
      if (!totalSteps) return;
      stepMode = !stepMode;
      currentStep = Math.min(currentStep, totalSteps);
      if (!stepMode) stopPlay();
      if (stepBar) stepBar.style.display = stepMode ? 'inline-flex' : 'none';
      stepModeBtn.classList.toggle('btn--active', stepMode);
      updateStepUI();
    });
    container.querySelector('#r3d-step-prev')?.addEventListener('click', () => {
      stopPlay();
      currentStep = Math.max(1, currentStep - 1);
      updateStepUI();
    });
    container.querySelector('#r3d-step-next')?.addEventListener('click', () => {
      stopPlay();
      currentStep = Math.min(totalSteps, currentStep + 1);
      updateStepUI();
    });

    // Play automático: avanza un paso cada 2.5 s hasta el final y se detiene.
    playBtn?.addEventListener('click', () => {
      if (playTimer !== null) {
        stopPlay();
        return;
      }
      if (currentStep >= totalSteps) currentStep = 1;
      updateStepUI();
      playBtn.textContent = '⏸ Pausa';
      playTimer = setInterval(() => {
        if (currentStep >= totalSteps) {
          stopPlay();
          return;
        }
        currentStep += 1;
        updateStepUI();
      }, 2500);
    });
  }

  return { mount, destroy };
}
