// app.js — punto de entrada y orquestador del Assembly Planner

import { $, $$, readFileAsText, downloadText, getModules, getModulePieces, getModuleDependencies, getModuleLabel, getModuleGroup, isGlobalPiece } from './utils.js';
import { parseCSV, piecesToCSV, createEmptyPiece } from './csvParser.js';
import { sugerirDependencias } from './heuristics.js';
import { topologicalLevels, buildSteps } from './topologicalSort.js';
import { renderCSVView } from './views/csvView.js';
import { renderGraphView } from './views/graphView.js';
import { renderStructuralView } from './views/structuralView.js';
import { renderAssemblyView } from './views/assemblyView.js';
import { renderManualView } from './views/manualView.js';
import { renderIsometricView } from './views/isometricView.js';
import { calculateHardware } from './hardware.js';

export const state = {
  pieces: [],
  dependencies: [],
  modules: [],
  currentModule: 'global',
  levels: [],
  sorted: [],
  cycle: null,
  steps: [],
  alerts: [],
  hardware: [],
  currentStep: 0,
  simulationMode: 'paused',
  currentView: 'csv',
};

export const GLOBAL_MODULE_ID = 'global';

const viewRenderers = {
  csv: renderCSVView,
  estructural: renderStructuralView,
  grafo: renderGraphView,
  ensamblaje: renderAssemblyView,
  manual: renderManualView,
  isometric: renderIsometricView,
};

export function setStatus(message, type = '') {
  const el = $('#status-message');
  if (!el) return;
  el.textContent = message;
  el.className = type;
}

export function getActivePieces() {
  return getModulePieces(state.pieces, state.currentModule);
}

export function getActiveDependencies() {
  const pieces = getActivePieces();
  return getModuleDependencies(state.dependencies, pieces);
}

export function recalculateAll() {
  const ids = state.pieces.map((p) => p.id);
  state.dependencies = state.dependencies.filter(
    (d) => ids.includes(d.from) && ids.includes(d.to)
  );

  // Detectar módulos
  state.modules = getModules(state.pieces);
  if (!state.modules.includes(state.currentModule)) {
    state.currentModule = state.modules[0] || GLOBAL_MODULE_ID;
  }

  // Calcular con subconjunto activo
  const activePieces = getActivePieces();
  const activeIds = activePieces.map((p) => p.id);
  const activeDependencies = getModuleDependencies(state.dependencies, activePieces);

  const piecesById = Object.fromEntries(state.pieces.map((p) => [p.id, p]));

  // Si el modulo actual es un grupo, calcular pasos por sub-modulo y concatenar
  const group = getModuleGroup(state.pieces, state.currentModule);
  if (group && group.modules.length > 1) {
    let stepOffset = 0;
    const allSteps = [];
    // Paso inicial: piezas globales (estructura de union) ensambladas una sola vez
    const globalPieces = activePieces.filter((p) => isGlobalPiece(p));
    if (globalPieces.length > 0) {
      allSteps.push({
        paso: ++stepOffset,
        piezas: globalPieces.map((p) => p.id),
        paralelo: globalPieces.length > 1,
        tiempo: 10,
      });
    }
    group.modules.forEach((mod) => {
      const modPieces = getModulePieces(state.pieces, mod).filter((p) => !isGlobalPiece(p));
      const modIds = modPieces.map((p) => p.id);
      const modDeps = getModuleDependencies(state.dependencies, modPieces);
      const modResult = buildSteps(modIds, modDeps, piecesById);
      if (modResult.ok) {
        modResult.steps.forEach((s) => {
          allSteps.push({
            ...s,
            paso: stepOffset + s.paso,
          });
        });
        stepOffset += modResult.steps.length;
      }
    });
    state.steps = allSteps;
    state.levels = allSteps.map((s) => s.piezas);
    state.sorted = allSteps.flatMap((s) => s.piezas.map((id) => ({ id, level: s.paso })));
    state.cycle = null;
  } else {
    const topo = topologicalLevels(activeIds, activeDependencies);
    state.levels = topo.levels;
    state.sorted = topo.sorted;
    state.cycle = topo.cycle;
    state.steps = buildSteps(activeIds, activeDependencies, piecesById).steps || [];
  }

  state.alerts = [];
  activePieces.forEach((p) => {
    if (p.riesgo === 'critico') state.alerts.push({ level: 'danger', piece: p, text: `Crítico: ${p.nombre} requiere soporte/divisor.` });
    if (p.riesgo === 'alto') state.alerts.push({ level: 'warning', piece: p, text: `Alto: ${p.nombre} recomienda soporte intermedio.` });
    if (p.tipo === 'fondo_decorativo') state.alerts.push({ level: 'info', piece: p, text: `${p.nombre} es fondo decorativo (${p.espesor} mm).` });
  });
  if (state.cycle) {
    state.alerts.push({ level: 'danger', text: `Ciclo detectado: ${state.cycle.join(' → ')}` });
  }

  state.hardware = calculateHardware(state.pieces, state.dependencies);
  updateModuleSelector();
  updateSummary();
  renderCurrentView();
}

export function updateSummary() {
  const activePieces = getActivePieces();
  $('#summary-module').textContent = getModuleLabel(state.currentModule, state.pieces);
  $('#summary-pieces').textContent = activePieces.length;
  $('#summary-steps').textContent = state.steps.length;
  $('#summary-alerts').textContent = state.alerts.length;
  const graphStatus = $('#summary-graph');
  if (graphStatus) {
    graphStatus.textContent = state.cycle ? 'Ciclo' : state.pieces.length ? 'Válido' : 'Vacío';
    graphStatus.className = `summary-value ${state.cycle ? 'text-danger' : state.pieces.length ? 'text-success' : ''}`;
  }

  const hardwareList = $('#hardware-list');
  if (state.hardware.length === 0) {
    hardwareList.innerHTML = '<p class="empty-state">Importa un CSV para ver la lista.</p>';
    return;
  }
  hardwareList.innerHTML = state.hardware
    .map(
      (h) => `
      <div class="hardware-item ${h.bloqueante ? 'blocking' : ''}">
        <span class="hardware-qty">${h.cantidad}</span>
        <div class="hardware-name">${h.nombre}</div>
        <div class="hardware-meta">${h.especificacion} — ${h.prioridad}</div>
      </div>
    `
    )
    .join('');
}

export function updateModuleSelector() {
  const select = $('#module-selector');
  if (!select) return;
  const current = state.currentModule;
  select.innerHTML = state.modules.map((m) => {
    const label = getModuleLabel(m, state.pieces);
    return `<option value="${m}" ${m === current ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

export function renderCurrentView() {
  const container = $('#view-container');
  container.innerHTML = '';
  const render = viewRenderers[state.currentView] || viewRenderers.csv;
  render(container, state);
}

export function switchTab(view) {
  state.currentView = view;
  $$('.tab').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('tab--active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  renderCurrentView();
}

export function loadExample(url) {
  fetch(url)
    .then((res) => res.text())
    .then((text) => loadCSV(text))
    .catch(() => setStatus('No se pudo cargar el ejemplo.', 'alert--danger'));
}

export function loadCSV(text) {
  const result = parseCSV(text);
  if (!result.ok) {
    setStatus(`Errores: ${result.errors.slice(0, 3).join('; ')}`, 'alert--danger');
    return;
  }
  state.pieces = result.pieces;
  state.dependencies = sugerirDependencias(state.pieces);
  state.warnings = result.warnings;
  recalculateAll();
  setStatus(`CSV cargado: ${state.pieces.length} piezas, ${state.dependencies.length} dependencias.`, 'alert--success');
}

export function addEmptyPiece() {
  const count = state.pieces.filter((p) => p.id.startsWith('pieza-')).length + 1;
  state.pieces.push(createEmptyPiece(count + state.pieces.length));
  recalculateAll();
}

function init() {
  // Tabs
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.view));
  });

  // Selector de módulo
  $('#module-selector')?.addEventListener('change', (e) => {
    state.currentModule = e.target.value;
    recalculateAll();
  });

  // Boton de ejemplo desde select
  $('#btn-load-example')?.addEventListener('click', () => {
    const select = $('#example-selector');
    const path = select?.value;
    if (!path) {
      showStatus('Selecciona un mueble primero', 'warning');
      return;
    }
    loadExample(path);
  });

  // Importar CSV
  $('#file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      loadCSV(text);
    } catch (err) {
      setStatus('Error leyendo archivo.', 'alert--danger');
    }
  });

  // Exportar CSV
  $('#btn-export-csv')?.addEventListener('click', () => {
    if (!state.pieces.length) {
      setStatus('No hay piezas para exportar.', 'alert--warning');
      return;
    }
    downloadText('cutternest-piezas.csv', piecesToCSV(state.pieces), 'text/csv');
  });

  // Render inicial
  switchTab('csv');
  setStatus('Listo. Carga un CSV o usa los ejemplos para comenzar.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
