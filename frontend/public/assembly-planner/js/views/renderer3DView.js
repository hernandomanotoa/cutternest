// js/views/renderer3DView.js — Vista del renderizador 3D orbital SVG

import { getModulePieces, getModuleLabel, escapeHtml } from '../utils/helpers.js';
import { buildAssemblyLevels, buildAssemblySequence } from '../services/assemblyStepService.js';
import { computeStepApertures } from '../services/stepApertureService.js';
import { motionConfigFor, decideAperturaToggle } from '../services/motionService.js';
import { detectCollisions, movingPieceIds } from '../services/collisionService.js';
import { generarInstruccion, toolsForStep } from '../services/instructions.js';
import { Renderer3D, DEFAULT_CAMERA } from '../renderer3d/index.js';
import { COLORS, RENDERER3D_THEME, HIGHLIGHT_COLORS } from '../core/config.js';
import { attachFullscreenToggle } from '../utils/fullscreen.js';
import { createAperturaControls, createGapModeToggle } from '../components/aperturaControls.js';
import { createModuleSelector } from '../components/moduleSelector.js';
import { setAperturaGlobal, setAperturaPieza, setAnguloPieza, clearAnguloPieza } from '../app.js';

export function createRenderer3DView(store) {
  let unsubscribe = null;
  let unsubscribeConfig = null;
  let unsubscribeApertura = null;
  let unsubscribeAngulo = null;
  let container = null;
  let canvas = null;
  let renderer = null;
  let renderLoopId = null;
  let moduleGapMode = 'compact';
  let detachFullscreen = null;
  let playTimer = null;
  // Referencias para distinguir cambios estructurales (piezas/módulo/config)
  // de cambios de apertura (slider), que no deben re-montar la vista.
  let lastPieces = null;
  let lastModule = null;
  let lastUserConfig = null;
  let selectedPieceId = null;
  // Controles de apertura compartidos. Se recrean en cada render estructural
  // dentro de renderView (ver creación previa al template del HTML).
  let aperturaControls = null;
  // Toggle "Gap profundidad" compartido: sus callbacks solo tocan estado de la
  // vista (moduleGapMode) y el renderer, así que se crea una sola vez.
  const gapToggle = createGapModeToggle({
    id: 'r3d-gap-mode',
    onChange: (mode) => {
      moduleGapMode = mode;
      renderer?.setModuleGapMode?.(mode);
    },
  });

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
      updateCollisions();
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

  // Sincroniza el slider global y los controles de apertura/ángulo de la
  // pieza seleccionada a través del componente compartido. La lógica de
  // visibilidad (pieza móvil / kind === 'hinge') vive en el componente.
  function syncAperturaControls(pieces = null) {
    if (!aperturaControls) return;
    const state = store.get();
    aperturaControls.sync({
      pieces: pieces ?? (lastPieces || []),
      aperturaGlobal: state.aperturaGlobal,
      aperturas: state.aperturas || {},
      angulos: state.angulos || {},
      selectedPieceId,
    });
  }

  // Guía de colisión: resalta piezas móviles que se solapan al abrirse.
  let lastCollisionKey = '';
  function updateCollisions() {
    if (!renderer || !container) return;
    const msg = container.querySelector('#r3d-collision-msg');
    const state = store.get();
    const pieces = lastPieces || [];
    const movers = movingPieceIds(pieces, state.aperturas, state.aperturaGlobal);
    const pairs = detectCollisions(renderer.geometries, movers);
    const key = pairs.map((p) => `${p.aId}|${p.bId}`).join(',');
    // setCollisionIds fuerza un re-render; solo se invoca cuando el conjunto
    // de colisiones realmente cambió (evita re-render por frame del loop).
    if (key === lastCollisionKey) return;
    lastCollisionKey = key;
    renderer.setCollisionIds(pairs.length ? pairs.flatMap((p) => [p.aId, p.bId]) : null);
    if (!msg) return;
    if (!pairs.length) {
      msg.style.display = 'none';
      msg.textContent = '';
      return;
    }
    const lines = pairs.slice(0, 3).map((p) => `La pieza '${p.aName}' colisiona con '${p.bName}' al abrir`);
    msg.innerHTML = lines.map((l) => `<div>⚠ ${escapeHtml(l)}</div>`).join('');
    msg.style.display = '';
  }

  function applyAperturaFromStore() {
    if (!renderer || !container) return;
    const state = store.get();
    renderer.setApertura(state.aperturaGlobal ?? 0, state.aperturas || {}, state.angulos || {});
    syncAperturaControls();
  }

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', () => {
      const state = store.get();
      if (state.pieces !== lastPieces || state.currentModule !== lastModule || state.userConfig !== lastUserConfig) {
        renderView(container, state);
      } else {
        applyAperturaFromStore();
      }
    });
    unsubscribeConfig = store.subscribe('userConfig:changed', () => renderView(container, store.get()));
    unsubscribeApertura = store.subscribe('apertura:changed', () => applyAperturaFromStore());
    unsubscribeAngulo = store.subscribe('angulo:changed', () => applyAperturaFromStore());
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
    if (unsubscribeApertura) {
      unsubscribeApertura();
      unsubscribeApertura = null;
    }
    if (unsubscribeAngulo) {
      unsubscribeAngulo();
      unsubscribeAngulo = null;
    }
    if (renderer) {
      renderer.destroy();
      renderer = null;
    }
    if (detachFullscreen) {
      detachFullscreen();
      detachFullscreen = null;
    }
    aperturaControls?.destroy();
    gapToggle.destroy();
    container = null;
    canvas = null;
  }

  function renderView(container, state) {
    const targetModule = state.currentModule;
    const pieces = getModulePieces(state.pieces, targetModule);
    lastPieces = state.pieces;
    lastModule = state.currentModule;
    lastUserConfig = state.userConfig;

    // Estado del modo paso y de la apertura sincronizada. Se declara aquí (y
    // no junto a los controles) porque los handlers de selección/doble-click
    // del renderer también lo consultan. Overrides y snapshot son locales a
    // la vista: no van al store (decisión documentada en syncStepApertures).
    let stepMode = false;
    let currentStep = 1;
    // Overrides manuales de apertura (piezaId → 0..1) con prioridad sobre la
    // apertura automática del paso. Persisten al navegar pasos dentro del
    // modo paso y se limpian al salir de él.
    let stepOverrides = new Map();
    // Piezas cuya apertura fue escrita automáticamente en el store; se usan
    // para retirar del store las entradas automáticas que ya no aplican.
    let autoApertureKeys = new Set();
    // Snapshot del estado de apertura previo a entrar al modo paso, para
    // restaurarlo al salir.
    let aperturaSnapshot = null;

    if (!pieces.length) {
      createModuleSelector({
        id: 'r3d-module-selector',
        emptyText: 'Selecciona un módulo para ver la vista 3D.',
        onChange: (id) => store.set({ currentModule: id }),
      }).mount(container, { pieces: state.pieces, currentModule: targetModule });
      return;
    }

    // Se recrean en cada render estructural porque onAperturaPieza debe cerrar
    // sobre markStepOverride (local al modo paso). Deben existir ANTES del
    // template: su HTML se interpola en los sliders de abajo.
    aperturaControls = createAperturaControls({
      prefix: 'r3d',
      layout: 'group',
      onAperturaGlobal: setAperturaGlobal,
      onAperturaPieza: (id, valor) => {
        // En modo paso, el valor manual es un override que gana sobre la
        // apertura automática del paso y persiste al navegar.
        markStepOverride(id, valor);
        setAperturaPieza(id, valor);
      },
      onAnguloPieza: (id, degrees) => {
        if (degrees == null) clearAnguloPieza(id);
        else setAnguloPieza(id, degrees);
      },
    });

    container.innerHTML = `
      <div class="card" style="height:100%;display:flex;flex-direction:column;">
        <div class="card__header">
          <h2 class="card__title">Vista 3D — ${getModuleLabel(targetModule, state.pieces)}</h2>
          <div class="r3d-controls flex gap-1 flex-wrap">
            <button id="r3d-reset" class="btn btn--secondary btn--sm">↺ Reset</button>
            <button id="r3d-fullscreen" class="btn btn--secondary btn--sm">⛶ Pantalla completa</button>
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
              <input type="checkbox" id="r3d-dims" style="cursor:pointer;">
              <span>Cotas</span>
            </label>
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
              <input type="checkbox" id="r3d-xray" style="cursor:pointer;">
              <span>X-ray</span>
            </label>
            ${gapToggle.html({ checked: moduleGapMode === 'projected' })}
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
              <input type="checkbox" id="r3d-projection" style="cursor:pointer;">
              <span>Perspectiva</span>
            </label>
            <button id="r3d-step-mode" class="btn btn--secondary btn--sm" ${pieces.length ? '' : 'disabled'}>Modo paso</button>
            <span id="r3d-step-bar" style="display:none;align-items:center;gap:0.4rem;">
              <button id="r3d-step-prev" class="btn btn--secondary btn--sm">◀</button>
              <span id="r3d-step-label" style="font-size:0.8rem;color:${RENDERER3D_THEME.textPrimary};white-space:nowrap;">Paso 1/1</span>
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
          ${aperturaControls.html({ aperturaGlobal: state.aperturaGlobal })}
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
          <div id="r3d-collision-msg" style="display:none;position:absolute;top:0.9rem;left:0.9rem;z-index:5;background:${COLORS.strokeDanger}1a;border:1px solid ${COLORS.strokeDanger};border-radius:6px;padding:0.4rem 0.7rem;font-size:0.78rem;color:${COLORS.strokeDanger};max-width:70%;"></div>
          <div style="display:flex;gap:0.75rem;height:100%;min-height:400px;padding:0.75rem;">
            <div id="r3d-canvas" class="r3d-canvas" role="img" aria-label="Vista 3D orbital del módulo ${escapeHtml(getModuleLabel(targetModule, state.pieces))}" style="flex:1;min-width:0;height:100%;background:${COLORS.background};border-radius:6px;overflow:hidden;"></div>
            <aside id="r3d-bom" style="width:240px;flex-shrink:0;overflow-y:auto;background:var(--surface,${RENDERER3D_THEME.surface});border:1px solid var(--border,${RENDERER3D_THEME.border});border-radius:6px;padding:0.5rem;">
              <h3 style="margin:0 0 0.5rem;font-size:0.8rem;color:${RENDERER3D_THEME.textSecondary};text-transform:uppercase;">Piezas (${pieces.length})</h3>
              <ul style="list-style:none;margin:0;padding:0;">
                ${pieces.map((p) => `
                  <li data-piece-id="${escapeHtml(p.id)}" class="r3d-bom__row"
                      style="padding:0.35rem 0.5rem;border-radius:4px;cursor:pointer;font-size:0.8rem;color:${RENDERER3D_THEME.textPrimary};border-bottom:1px solid ${RENDERER3D_THEME.rowBorder};">
                    <div style="font-weight:600;">${escapeHtml(p.nombre || p.id)}</div>
                    <div style="color:${RENDERER3D_THEME.textSecondary};">${Number(p.ancho)}×${Number(p.alto)}×${Number(p.espesor)} mm · cantos: ${escapeHtml(p.cantos || '—')} · ×${Number(p.cantidad) || 1}</div>
                  </li>`).join('')}
              </ul>
            </aside>
          </div>
        </div>
        <div id="r3d-step-panel" class="card__body" style="display:none;padding:0.6rem 1rem;border-top:1px solid var(--border,${RENDERER3D_THEME.border});">
          <div id="r3d-step-instruction" style="font-size:0.85rem;color:${RENDERER3D_THEME.textPrimary};margin:0 0 0.35rem;line-height:1.4;"></div>
          <div id="r3d-step-tools" style="font-size:0.75rem;color:${RENDERER3D_THEME.textSecondary};"></div>
        </div>
      </div>`;

    aperturaControls.bind(container);
    gapToggle.bind(container);

    canvas = container.querySelector('#r3d-canvas');
    renderer = new Renderer3D(canvas, {
      width: 900,
      height: 600,
      globalOpacity: 0.85,
      moduleGapMode,
      verticalPositionOverrides: state.userConfig,
      onPieceSelect: (id) => {
        selectedPieceId = id;
        syncBomSelection(id);
        syncAperturaControls();
      },
      onPieceDoubleClick: (id) => {
        const piece = lastPieces ? lastPieces.find((p) => p.id === id) : null;
        if (!piece || !motionConfigFor(piece)) return;
        // Seleccionar y alternar override 0↔1 (intermedio → 1).
        renderer.setSelectedId(id);
        selectedPieceId = id;
        syncBomSelection(id);
        syncAperturaControls();
        const actual = store.get().aperturas?.[id];
        const siguiente = decideAperturaToggle(actual);
        markStepOverride(id, siguiente);
        setAperturaPieza(id, siguiente);
      },
    });
    renderer.load(targetModule, state.pieces);
    applyAperturaFromStore();

    startRenderLoop();

    // BOM ↔ 3D bidireccional
    const bomRows = () => Array.from(container.querySelectorAll('.r3d-bom__row'));
    function syncBomSelection(id) {
      bomRows().forEach((row) => {
        row.style.background = row.dataset.pieceId === id ? RENDERER3D_THEME.rowSelected : 'transparent';
        row.style.color = row.dataset.pieceId === id ? HIGHLIGHT_COLORS.selection : RENDERER3D_THEME.textPrimary;
      });
    }
    bomRows().forEach((row) => {
      row.addEventListener('mouseenter', () => renderer.setHoveredId(row.dataset.pieceId));
      row.addEventListener('mouseleave', () => renderer.setHoveredId(null));
      row.addEventListener('click', () => {
        const id = row.dataset.pieceId;
        renderer.setSelectedId(renderer.selectedId === id ? null : id);
        selectedPieceId = renderer.selectedId;
        syncBomSelection(renderer.selectedId);
        syncAperturaControls();
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
    if (detachFullscreen) detachFullscreen();
    detachFullscreen = attachFullscreenToggle(
      container.querySelector('#r3d-fullscreen'),
      container.querySelector('.card'),
    );
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

    // Si quedó un play activo de un render anterior (cambio de módulo/piezas), se detiene.
    stopPlayTimer();
    if (playBtn) playBtn.textContent = '▶ Play';

    // Registra un override manual de apertura mientras el modo paso está
    // activo. Fuera del modo paso no aplica: el store ya guarda el valor.
    function markStepOverride(pieceId, valor) {
      if (!stepMode) return;
      const piece = pieces.find((p) => p.id === pieceId);
      if (!piece || !motionConfigFor(piece)) return;
      stepOverrides.set(pieceId, Math.min(1, Math.max(0, Number(valor) || 0)));
    }

    // Escribe en el store las aperturas automáticas del paso actual:
    // piezas móviles del paso → 1, de pasos anteriores → 0, salvo override
    // manual. Las de pasos posteriores quedan ocultas por setAssemblyStep y
    // se retiran del store las entradas automáticas que ya no aplican.
    function syncStepApertures() {
      if (!stepMode) return;
      const target = computeStepApertures(pieces, sequence, currentStep, stepOverrides);
      const s = store.get();
      const aperturas = { ...s.aperturas };
      let changed = false;
      for (const id of autoApertureKeys) {
        if (!target.has(id) && id in aperturas) {
          delete aperturas[id];
          changed = true;
        }
      }
      for (const [id, valor] of target) {
        if (aperturas[id] !== valor) {
          aperturas[id] = valor;
          changed = true;
        }
      }
      autoApertureKeys = new Set(target.keys());
      if (changed) store.setField('aperturas', aperturas);
    }

    // Al salir del modo paso se restaura el estado de apertura previo a
    // entrar (snapshot) y se descartan overrides y entradas automáticas.
    function restoreAperturaSnapshot() {
      stepOverrides = new Map();
      autoApertureKeys = new Set();
      if (!aperturaSnapshot) return;
      store.set({
        aperturas: aperturaSnapshot.aperturas,
        aperturaGlobal: aperturaSnapshot.aperturaGlobal,
      });
      aperturaSnapshot = null;
    }

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
      syncStepApertures();
      renderStepPanel();
    }
    stepModeBtn?.addEventListener('click', () => {
      if (!totalSteps) return;
      stepMode = !stepMode;
      currentStep = Math.min(currentStep, totalSteps);
      if (stepMode) {
        const s = store.get();
        aperturaSnapshot = { aperturas: { ...s.aperturas }, aperturaGlobal: s.aperturaGlobal ?? 0 };
      } else {
        stopPlay();
        restoreAperturaSnapshot();
      }
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
