// js/views/isometricView.js — Vista isométrica 3D SVG

import { getModulePieces, getModuleLabel, escapeHtml } from '../utils/helpers.js';
import { COLORS } from '../core/config.js';
import { IsometricRenderer } from '../components/renderers/isometricRenderer.js';
import { createPieceOffsetsConfig } from '../components/pieceOffsetsConfig.js';
import { createFurnitureFicha } from '../components/furnitureFicha.js';
import { createAperturaControls, createGapModeToggle } from '../components/aperturaControls.js';
import { createModuleSelector } from '../components/moduleSelector.js';
import { motionConfigFor, decideAperturaToggle } from '../services/motionService.js';
import { detectCollisions, movingPieceIds } from '../services/collisionService.js';
import { attachFullscreenToggle } from '../utils/fullscreen.js';
import { setAperturaGlobal, setAperturaPieza, setAnguloPieza, clearAnguloPieza } from '../app.js';

export function createIsometricView(store) {
  let unsubscribe = null;
  let unsubscribeConfig = null;
  let unsubscribeApertura = null;
  let unsubscribeAngulo = null;
  let container = null;
  let canvas = null;
  let selectedPieceId = null;
  // Pestana activa del host de paneles (ficha|offsets): persiste en sesion.
  let activePanel = 'ficha';
  try {
    activePanel = localStorage.getItem('cn-assembly-iso-panel') === 'offsets' ? 'offsets' : 'ficha';
  } catch {
    // sin storage: default ficha
  }
  let scale = 0.12;
  let explodeFactor = 0;
  let drawerGap = 15;
  let isoFlip = true;
  let moduleGapMode = 'compact';
  let detachFullscreen = null;
  // Referencias para decidir si un state:changed requiere re-montar la vista
  // (piezas/módulo/config cambiaron) o solo re-render del canvas (apertura).
  let lastPieces = null;
  let lastModule = null;
  let lastUserConfig = null;

  // Controles de apertura/ángulo compartidos (componente sin estado): la vista
  // les pasa piezas/aperturas/ángulos y recibe los cambios vía callbacks.
  const aperturaControls = createAperturaControls({
    prefix: 'iso',
    layout: 'inline',
    showPieceSelect: true,
    onAperturaGlobal: setAperturaGlobal,
    onAperturaPieza: setAperturaPieza,
    onAnguloPieza: (id, degrees) => {
      if (degrees == null) clearAnguloPieza(id);
      else setAnguloPieza(id, degrees);
    },
    onSelectPiece: (id) => {
      selectedPieceId = id;
    },
  });
  const gapToggle = createGapModeToggle({
    id: 'iso-gap-mode',
    onChange: (mode) => {
      moduleGapMode = mode;
      render();
    },
  });

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
      syncAperturaControls();
      render();
    });
    unsubscribeAngulo = store.subscribe('angulo:changed', () => {
      syncAperturaControls();
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
    if (detachFullscreen) {
      detachFullscreen();
      detachFullscreen = null;
    }
    aperturaControls.destroy();
    gapToggle.destroy();
    container = null;
    canvas = null;
  }

  function renderView(container, state) {
    let targetModule = state.currentModule;
    const pieces = getModulePieces(state.pieces, targetModule);
    lastPieces = state.pieces;
    lastModule = state.currentModule;
    lastUserConfig = state.userConfig;

    if (!pieces.length) {
      createModuleSelector({
        id: 'iso-module-selector',
        emptyText: 'Selecciona un módulo para ver la vista isométrica.',
        onChange: (id) => store.set({ currentModule: id }),
      }).mount(container, { pieces: state.pieces, currentModule: targetModule });
      return;
    }

    container.innerHTML = `
      <div class="card" style="height:100%;display:flex;flex-direction:column;">
        <div class="card__header">
          <h2 class="card__title">Vista isométrica 3D — ${getModuleLabel(targetModule, state.pieces)}</h2>
          <div class="isometric-controls flex gap-1 flex-wrap">
            <button id="btn-iso-zoom-in" class="btn btn--secondary btn--sm" title="Acercar la vista isométrica" aria-label="Acercar la vista isométrica">Zoom +</button>
            <button id="btn-iso-zoom-out" class="btn btn--secondary btn--sm" title="Alejar la vista isométrica" aria-label="Alejar la vista isométrica">Zoom −</button>
            <button id="btn-iso-reset" class="btn btn--secondary btn--sm" title="Restablecer zoom, perspectiva y aperturas" aria-label="Restablecer zoom, perspectiva y aperturas">Reset</button>
            <button id="btn-iso-explode" class="btn btn--secondary btn--sm" title="Separar las piezas para ver el interior (vista explodida)" aria-label="Separar las piezas para ver el interior (vista explodida)">Explodida</button>
            <button id="btn-iso-flip" class="btn btn--secondary btn--sm" title="Invertir la perspectiva (ver el otro lateral)" aria-label="Invertir la perspectiva (ver el otro lateral)">↔ Invertir perspectiva</button>
            ${aperturaControls.html({ aperturaGlobal: state.aperturaGlobal, pieces, selectedPieceId })}
            <button id="btn-iso-export" class="btn btn--primary btn--sm" title="Descargar el dibujo isométrico como archivo SVG" aria-label="Descargar el dibujo isométrico como archivo SVG">Exportar SVG</button>
            <button id="btn-iso-fullscreen" class="btn btn--secondary btn--sm" title="Ver la vista isométrica en pantalla completa" aria-label="Ver la vista isométrica en pantalla completa">⛶ Pantalla completa</button>
            ${gapToggle.html({ checked: moduleGapMode === 'projected' })}
          </div>
        </div>
        <div class="card__body" style="flex:1;min-height:0;position:relative;">
          <div id="iso-collision-msg" style="display:none;position:absolute;top:0.9rem;left:0.9rem;z-index:5;background:${COLORS.strokeDanger}1a;border:1px solid ${COLORS.strokeDanger};border-radius:6px;padding:0.4rem 0.7rem;font-size:0.78rem;color:${COLORS.strokeDanger};max-width:70%;"></div>
          <div id="iso-canvas" class="iso-canvas" role="img" aria-label="Vista isométrica 3D del módulo ${escapeHtml(getModuleLabel(targetModule, state.pieces))}" style="width:100%;height:100%;min-height:400px;background:${COLORS.background};border-radius:6px;overflow:hidden;"></div>
          <div id="iso-config-host" class="iso-config-host"></div>
        </div>
      </div>`;

    aperturaControls.bind(container);
    gapToggle.bind(container);

    canvas = container.querySelector('#iso-canvas');
    render();

    // Doble-click sobre una pieza: alterna su apertura individual 0↔1
    // (cajones, zapateras en riel, puertas bisagra/corrediza y volquetes).
    canvas.addEventListener('dblclick', (e) => {
      const poly = e.target.closest?.('polygon[data-piece-id]');
      const id = poly?.getAttribute('data-piece-id');
      if (!id) return;
      const piece = pieces.find((p) => p.id === id);
      if (!piece || !motionConfigFor(piece)) return;
      selectedPieceId = id;
      syncAperturaControls();
      const actual = store.get().aperturas?.[id];
      setAperturaPieza(id, decideAperturaToggle(actual));
    });

    // Host de paneles con PESTAÑAS (patron estandar, ver AGENTS.md): un solo
    // panel visible a la vez — la mitad de huella que dos paneles apilados,
    // sin doble scroll. La pestaña activa persiste en localStorage.
    mountIsoPanels(container.querySelector('#iso-config-host'));

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
    detachFullscreen = attachFullscreenToggle(
      container.querySelector('#btn-iso-fullscreen'),
      card,
    );

    syncAperturaControls();
  }

  // Sincroniza slider global y controles de apertura/ángulo de la pieza
  // seleccionada a través del componente compartido.
  // Renderiza la barra de pestanas y monta SOLO el panel activo. Un panel
  // visible a la vez: la mitad de huella que dos paneles apilados y sin
  // doble scroll (diagnostico UI/UX: los paneles son herramientas secundarias
  // sobre el lienzo, que es la tarea primaria). La seleccion persiste.
  function mountIsoPanels(host) {
    if (!host) return;
    host.innerHTML = `
      <div class="iso-config-tabs" role="tablist" aria-label="Paneles de configuración">
        <button type="button" class="iso-config-tab${activePanel === 'ficha' ? ' is-active' : ''}" role="tab"
          data-iso-tab="ficha" aria-selected="${activePanel === 'ficha'}" title="Clasificación y medidas del mueble">📋 Ficha técnica</button>
        <button type="button" class="iso-config-tab${activePanel === 'offsets' ? ' is-active' : ''}" role="tab"
          data-iso-tab="offsets" aria-selected="${activePanel === 'offsets'}" title="Offsets y gaps por pieza">📏 Offsets y gaps</button>
      </div>
      <div class="iso-config-panel-slot"></div>
    `;
    host.querySelectorAll('[data-iso-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.dataset.isoTab === activePanel) return;
        activePanel = tab.dataset.isoTab;
        try {
          localStorage.setItem('cn-assembly-iso-panel', activePanel);
        } catch {
          // sin storage: vale solo para la sesion
        }
        // Solo intercambia el panel: no hace falta re-renderizar el lienzo.
        mountIsoPanels(host);
      });
    });
    const slot = host.querySelector('.iso-config-panel-slot');
    if (activePanel === 'offsets') {
      createPieceOffsetsConfig().mount(slot, store);
    } else {
      createFurnitureFicha().mount(slot, store);
    }
  }

  function syncAperturaControls() {
    if (!container) return;
    const state = store.get();
    aperturaControls.sync({
      pieces: lastPieces ? getModulePieces(lastPieces, lastModule) : [],
      aperturaGlobal: state.aperturaGlobal,
      aperturas: state.aperturas || {},
      angulos: state.angulos || {},
      selectedPieceId,
    });
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
