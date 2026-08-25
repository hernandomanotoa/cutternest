// assemblyView.js — Vista de ensamblaje, timeline y simulador

import { $, $$, isGlobalPiece, getModuleLabel } from '../utils.js';
import { COLORS } from '../core/config.js';
import { recalculateAll, setStatus } from '../app.js';
import { generarInstruccion, toolsForStep } from '../instructions.js';

export function createAssemblyView(store) {
  let unsubscribe = null;
  let container = null;
  let interval = null;

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', () => render(container, store.get()));
    render(container, store.get());
  }

  function destroy() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    container = null;
  }

  function render(container, state) {
    const activePieces = state.pieces.filter((p) => {
      if (state.currentModule === 'global') return isGlobalPiece(p);
      return p.modulo === state.currentModule || isGlobalPiece(p);
    });
    const moduleLabel = getModuleLabel(state.currentModule, state.pieces);
    const hasGlobalContext = state.currentModule !== 'global' && activePieces.some((p) => isGlobalPiece(p));
    const globalPieces = hasGlobalContext ? activePieces.filter((p) => isGlobalPiece(p)) : [];

    if (!state.pieces.length) {
      container.innerHTML = '<div class="card"><div class="card__body"><p class="empty-state">Importa un CSV para calcular los pasos de ensamblaje.</p></div></div>';
      return;
    }

    if (state.cycle) {
      container.innerHTML = `
        <div class="card">
          <div class="card__body">
            <div class="alert alert--danger mb-2">
              <strong>Hay un ciclo en las dependencias.</strong><br>
              El ciclo detectado es: <code>${state.cycle.join(' → ')}</code>.<br>
              Ve a la vista <strong>Grafo</strong>, elimina la flecha que cierra el bucle o usa <em>Restaurar heurísticas</em>.
            </div>
            <div class="flex gap-1">
              <button id="btn-assembly-goto-graph" class="btn btn--secondary">Ir al Grafo</button>
              <button id="btn-assembly-reset-deps" class="btn btn--primary">Restablecer dependencias sugeridas</button>
            </div>
          </div>
        </div>
      `;
      container.querySelector('#btn-assembly-goto-graph')?.addEventListener('click', () => {
        const { switchTab } = await import('../app.js');
        switchTab('grafo');
      });
      container.querySelector('#btn-assembly-reset-deps')?.addEventListener('click', async () => {
        const { resetDependencies } = await import('../app.js');
        resetDependencies();
      });
      return;
    }

    container.innerHTML = `
      <div class="card mb-2">
        <div class="card__header">
          <div class="flex justify-between items-center">
            <h2 class="card__title">Pasos de ensamblaje — ${moduleLabel}</h2>
            <div class="flex gap-1 items-center">
              <button id="btn-prev" class="btn btn--secondary btn--sm">‹ Anterior</button>
              <button id="btn-play" class="btn btn--primary btn--sm">▶ Play</button>
              <button id="btn-pause" class="btn btn--secondary btn--sm hidden">⏸ Pausa</button>
              <button id="btn-next" class="btn btn--secondary btn--sm">Siguiente ›</button>
              <button id="btn-reset" class="btn btn--secondary btn--sm">↺ Reset</button>
            </div>
          </div>
        </div>
        <div class="card__body">
          ${hasGlobalContext ? renderGlobalContext(globalPieces) : ''}
          <div class="form-group mb-2">
            <label for="sim-speed">Velocidad del simulador</label>
            <input id="sim-speed" type="range" min="500" max="3000" step="100" value="1500" />
          </div>
          <div id="instruction-box" class="alert alert--info mb-2">
            <strong>Instrucción:</strong> <span id="instruction-text">Selecciona un paso o presiona Play.</span>
          </div>
          <div id="timeline" class="timeline"></div>
        </div>
      </div>

      <div class="card">
        <div class="card__header"><h2 class="card__title">Estado del ensamblaje</h2></div>
        <div class="card__body" id="assembly-state"></div>
      </div>
    `;

    const piecesById = Object.fromEntries(state.pieces.map((p) => [p.id, p]));
    let current = state.currentStep || 0;
    let speed = 1500;

    function renderTimeline() {
      const timeline = $('#timeline', container);
      timeline.innerHTML = state.steps.map((step, idx) => {
        const active = idx === current;
        return `
          <div class="timeline-step ${active ? 'timeline-step--active' : ''}" data-step="${idx}">
            <div class="flex justify-between items-center mb-1">
              <strong>Paso ${step.paso}</strong>
              ${step.paralelo ? '<span class="badge badge--info">Paralelo</span>' : '<span class="badge badge--secondary">Secuencial</span>'}
            </div>
            <div class="flex flex-wrap gap-1 mb-1">
              ${step.piezas.map((id) => {
                const p = piecesById[id];
                return p ? `<span class="swatch" style="background: ${p.color};"></span> ${p.nombre}` : id;
              }).join('')}
            </div>
            <div style="font-size: 0.75rem; color: ${COLORS.textSecondary};">~${step.tiempo} min</div>
          </div>
        `;
      }).join('');

      $$('.timeline-step', container).forEach((el) => {
        el.addEventListener('click', () => {
          current = Number(el.dataset.step);
          updateState();
        });
      });

      updateState();
    }

    function updateState() {
      store.set((s) => ({ ...s, currentStep: current, simulationMode: interval ? 'playing' : 'paused' }));
      $$('.timeline-step', container).forEach((el, idx) => {
        el.classList.toggle('timeline-step--active', idx === current);
      });

      const step = state.steps[current];
      if (!step) return;

      const instruccion = generarInstruccion(step, piecesById);
      $('#instruction-text', container).textContent = instruccion;

      const tools = toolsForStep(step, piecesById);
      const stateBox = $('#assembly-state', container);
      stateBox.innerHTML = `
        <p><strong>Paso ${step.paso} de ${state.steps.length}</strong> — ${step.paralelo ? 'Piezas en paralelo' : 'Pieza secuencial'}</p>
        <p><strong>Herramientas:</strong> ${tools.join(', ')}</p>
        <div class="flex gap-1 flex-wrap mt-1">
          ${step.piezas.map((id) => {
            const p = piecesById[id];
            if (!p) return '';
            return `
              <div class="card" style="width: 140px;">
                <div class="card__body" style="padding: 0.5rem;">
                  <div class="swatch mb-1" style="background: ${p.color}; width: 24px; height: 24px;"></div>
                  <strong>${p.nombre}</strong>
                  <div style="font-size: 0.75rem; color: ${COLORS.textSecondary};">${p.ancho}×${p.alto} mm</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function play() {
      if (interval) return;
      $('#btn-play', container).classList.add('hidden');
      $('#btn-pause', container).classList.remove('hidden');
      interval = setInterval(() => {
        if (current >= state.steps.length - 1) {
          pause();
          setStatus('Simulación completada.', 'alert--success');
          return;
        }
        current++;
        updateState();
      }, speed);
    }

    function pause() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      $('#btn-play', container)?.classList.remove('hidden');
      $('#btn-pause', container)?.classList.add('hidden');
      store.set((s) => ({ ...s, simulationMode: 'paused' }));
    }

    $('#btn-play', container)?.addEventListener('click', play);
    $('#btn-pause', container)?.addEventListener('click', pause);
    $('#btn-next', container)?.addEventListener('click', () => {
      pause();
      if (current < state.steps.length - 1) {
        current++;
        updateState();
      }
    });
    $('#btn-prev', container)?.addEventListener('click', () => {
      pause();
      if (current > 0) {
        current--;
        updateState();
      }
    });
    $('#btn-reset', container)?.addEventListener('click', () => {
      pause();
      current = 0;
      updateState();
    });
    $('#sim-speed', container)?.addEventListener('input', (e) => {
      speed = Number(e.target.value);
      if (interval) {
        pause();
        play();
      }
    });

    renderTimeline();
  }

  return { mount, destroy };
}

function renderGlobalContext(pieces) {
  return `
    <div class="alert alert--info mb-2">
      <strong>Estructura global ya ensamblada:</strong>
      <div class="flex flex-wrap gap-1 mt-1">
        ${pieces.map((p) => `
          <span class="badge badge--secondary" style="border-left: 3px solid ${p.color};">${p.nombre}</span>
        `).join('')}
      </div>
    </div>
  `;
}
