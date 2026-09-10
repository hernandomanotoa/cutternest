// js/views/isometricView.js — Vista isométrica 3D SVG

import { getModulePieces, getModuleLabel, getModules, escapeHtml } from '../utils.js';
import { COLORS } from '../core/config.js';
import { IsometricRenderer } from '../isometricRenderer.js';
import { createPieceOffsetsConfig } from '../components/pieceOffsetsConfig.js';
import { motionConfigFor } from '../services/motionService.js';
import { detectCollisions, movingPieceIds } from '../services/collisionService.js';
import { setAperturaGlobal, setAperturaPieza, setAnguloPieza, clearAnguloPieza } from '../app.js';

export function createIsometricView(store) {
  let unsubscribe = null;
  let unsubscribeConfig = null;
  let unsubscribeApertura = null;
  let unsubscribeAngulo = null;
  let container = null;
  let canvas = null;
  let selectedPieceId = null;
  let scale = 0.12;
  let explodeFactor = 0;
  let drawerGap = 15;
  let isoFlip = true;
  let fullscreenChangeHandler = null;
  let webkitFullscreenChangeHandler = null;
  let moduleGapMode = 'compact';
  // Referencias para decidir si un state:changed requiere re-montar la vista
  // (piezas/módulo/config cambiaron) o solo re-render del canvas (apertura).
  let lastPieces = null;
  let lastModule = null;
  let lastUserConfig = null;

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', () => {
      const state = store.get();
      if (state.pieces !== lastPieces || state.currentModule !== lastModule || state.userConfig !== lastUserConfig) {
        renderView(container, state);
      } else {
        render();
      }
    });
    unsubscribeConfig = store.subscribe('userConfig:changed', () => render());
    unsubscribeApertura = store.subscribe('apertura:changed', () => {
      syncAperturaUI();
      render();
    });
    unsubscribeAngulo = store.subscribe('angulo:changed', () => {
      syncAperturaUI();
      render();
    });
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
    if (unsubscribeApertura) {
      unsubscribeApertura();
      unsubscribeApertura = null;
    }
    if (unsubscribeAngulo) {
      unsubscribeAngulo();
      unsubscribeAngulo = null;
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
    lastPieces = state.pieces;
    lastModule = state.currentModule;
    lastUserConfig = state.userConfig;

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
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.4rem;">
              <span>Apertura</span>
              <input type="range" id="iso-apertura" min="0" max="100" step="1" value="${Math.round((state.aperturaGlobal ?? 0) * 100)}" style="cursor:pointer;width:110px;">
            </label>
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.35rem;">
              <span>Pieza</span>
              <select id="iso-piece-select" class="input" style="width:auto;max-width:180px;">
                <option value="">—</option>
                ${pieces.filter((p) => motionConfigFor(p)).map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === selectedPieceId ? 'selected' : ''}>${escapeHtml(p.nombre || p.id)}</option>`).join('')}
              </select>
            </label>
            <label class="btn btn--secondary btn--sm" id="iso-piece-apertura-group" style="cursor:pointer;align-items:center;display:none;gap:0.4rem;">
              <span>Apertura pieza</span>
              <input type="range" id="iso-piece-apertura" min="0" max="100" step="1" value="0" style="cursor:pointer;width:90px;">
            </label>
            <label class="btn btn--secondary btn--sm" id="iso-piece-angulo-group" style="cursor:pointer;align-items:center;display:none;gap:0.35rem;">
              <span>Ángulo</span>
              <input type="number" id="iso-piece-angulo" min="0" max="120" step="5" placeholder="105" style="width:56px;">
              <span style="font-size:0.75rem;">°</span>
              ${[45, 70, 90, 110].map((a) => `<button type="button" class="btn btn--secondary btn--sm iso-angulo-preset" data-angulo="${a}" style="padding:0.05rem 0.3rem;">${a}°</button>`).join('')}
              <button type="button" class="btn btn--secondary btn--sm" id="iso-angulo-auto" style="padding:0.05rem 0.3rem;">Auto</button>
            </label>
            <button id="btn-iso-export" class="btn btn--primary btn--sm">Exportar SVG</button>
            <button id="btn-iso-fullscreen" class="btn btn--secondary btn--sm">⛶ Pantalla completa</button>
            <label class="btn btn--secondary btn--sm" style="cursor:pointer;align-items:center;display:inline-flex;gap:0.25rem;">
              <input type="checkbox" id="iso-gap-mode" ${moduleGapMode === 'projected' ? 'checked' : ''} style="cursor:pointer;">
              <span>Gap profundidad</span>
            </label>
          </div>
        </div>
        <div class="card__body" style="flex:1;min-height:0;position:relative;">
          <div id="iso-collision-msg" style="display:none;position:absolute;top:0.9rem;left:0.9rem;z-index:5;background:${COLORS.strokeDanger}1a;border:1px solid ${COLORS.strokeDanger};border-radius:6px;padding:0.4rem 0.7rem;font-size:0.78rem;color:${COLORS.strokeDanger};max-width:70%;"></div>
          <div id="iso-canvas" class="iso-canvas" style="width:100%;height:100%;min-height:400px;background:${COLORS.background};border-radius:6px;overflow:hidden;"></div>
          <div id="iso-config-host" class="iso-config-host"></div>
        </div>
      </div>`;

    canvas = container.querySelector('#iso-canvas');
    render();

    createPieceOffsetsConfig().mount(
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
      setAperturaGlobal(0);
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
    container.querySelector('#iso-apertura')?.addEventListener('input', (e) => {
      setAperturaGlobal(Number(e.target.value) / 100);
    });
    container.querySelector('#iso-piece-select')?.addEventListener('change', (e) => {
      selectedPieceId = e.target.value || null;
      syncAperturaUI();
    });
    container.querySelector('#iso-piece-apertura')?.addEventListener('input', (e) => {
      if (selectedPieceId) setAperturaPieza(selectedPieceId, Number(e.target.value) / 100);
    });
    container.querySelector('#iso-piece-angulo')?.addEventListener('change', (e) => {
      if (!selectedPieceId) return;
      const v = e.target.value;
      if (v === '' || v == null) clearAnguloPieza(selectedPieceId);
      else setAnguloPieza(selectedPieceId, Number(v));
    });
    container.querySelectorAll('.iso-angulo-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (selectedPieceId) setAnguloPieza(selectedPieceId, Number(btn.dataset.angulo));
      });
    });
    container.querySelector('#iso-angulo-auto')?.addEventListener('click', () => {
      if (selectedPieceId) clearAnguloPieza(selectedPieceId);
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

    const gapCheckbox = container.querySelector('#iso-gap-mode');
    if (gapCheckbox) gapCheckbox.checked = moduleGapMode === 'projected';
    gapCheckbox?.addEventListener('change', () => {
      moduleGapMode = gapCheckbox.checked ? 'projected' : 'compact';
      render();
    });
    syncAperturaUI();
  }

  // Sincroniza slider global y controles de la pieza seleccionada.
  function syncAperturaUI() {
    if (!container) return;
    const state = store.get();
    const globalInput = container.querySelector('#iso-apertura');
    if (globalInput) globalInput.value = String(Math.round((state.aperturaGlobal ?? 0) * 100));
    const pieces = lastPieces ? getModulePieces(lastPieces, lastModule) : [];
    const piece = selectedPieceId ? pieces.find((p) => p.id === selectedPieceId) : null;
    const cfg = piece ? motionConfigFor(piece) : null;

    const apGroup = container.querySelector('#iso-piece-apertura-group');
    const apInput = container.querySelector('#iso-piece-apertura');
    if (apGroup && apInput) {
      if (piece && cfg) {
        apGroup.style.display = '';
        const override = state.aperturas?.[selectedPieceId];
        apInput.value = String(Math.round((override ?? state.aperturaGlobal ?? 0) * 100));
      } else {
        apGroup.style.display = 'none';
      }
    }
    const anGroup = container.querySelector('#iso-piece-angulo-group');
    const anInput = container.querySelector('#iso-piece-angulo');
    if (anGroup && anInput) {
      if (piece && cfg?.kind === 'hinge') {
        anGroup.style.display = '';
        const override = state.angulos?.[selectedPieceId];
        anInput.value = override != null ? String(Math.round(override)) : '';
      } else {
        anGroup.style.display = 'none';
      }
    }
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
      aperturaGlobal: state.aperturaGlobal ?? 0,
      aperturas: state.aperturas || {},
      angulos: state.angulos || {},
      explodeFactor,
      moduleGapMode,
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
    updateCollisions(renderer, pieces, state);
  }

  // Guía de colisión: resalta piezas móviles que se solapan al abrirse y
  // muestra un mensaje breve por cada par colisionante.
  function updateCollisions(renderer, pieces, state) {
    const msg = container?.querySelector('#iso-collision-msg');
    if (!renderer || !container) return;
    const movers = movingPieceIds(pieces, state.aperturas, state.aperturaGlobal);
    const { geometries } = renderer.computeGeometries(state.currentModule, pieces);
    const pairs = detectCollisions(geometries, movers);
    const colliding = new Set(pairs.flatMap((p) => [p.aId, p.bId]));
    container.querySelectorAll('polygon[data-piece-id]').forEach((poly) => {
      if (colliding.has(poly.dataset.pieceId)) {
        poly.setAttribute('stroke', COLORS.strokeDanger);
        poly.setAttribute('stroke-width', '2.5');
      }
    });
    if (!msg) return;
    if (!pairs.length) {
      msg.style.display = 'none';
      msg.textContent = '';
      return;
    }
    msg.innerHTML = pairs.slice(0, 3)
      .map((p) => `<div>⚠ ${escapeHtml(`La pieza '${p.aName}' colisiona con '${p.bName}' al abrir`)}</div>`)
      .join('');
    msg.style.display = '';
  }

  return { mount, destroy };
}
