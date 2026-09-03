// app.js — punto de entrada y orquestador del Assembly Planner
// Usa js/core/store.js como única fuente de verdad del estado.

import {
  $,
  $$,
  readFileAsText,
  downloadText,
  getModules,
  getModulePieces,
  getModuleDependencies,
  getModuleLabel,
  getModuleGroup,
  isGlobalPiece,
} from './utils.js';
import { parseCSV, piecesToCSV, createEmptyPiece } from './csvParser.js';
import { sugerirDependencias } from './heuristics.js';
import { topologicalLevels, buildSteps } from './topologicalSort.js';
import { createCSVView } from './views/csvView.js';
import { createStructuralView } from './views/structuralView.js';
import { createIsometricView } from './views/isometricView.js';
import { createRenderer3DView } from './views/renderer3DView.js';
import { calculateHardware } from './hardware.js';
import { getStore, setStore, createStore } from './core/store.js';
import { VERTICAL_POSITIONS } from './core/config.js';
import {
  saveUserConfig,
  resetUserConfig as resetUserConfigService,
} from './services/userConfigService.js';

export const GLOBAL_MODULE_ID = 'global';

const viewFactories = {
  csv: createCSVView,
  estructural: createStructuralView,
  isometric: createIsometricView,
  renderer3d: createRenderer3DView,
};

let currentViewInstance = null;

export function getAppStore() {
  return getStore();
}

export function setAppStore(store) {
  setStore(store);
}

export function setStatus(message, type = '') {
  const el = $('#status-message');
  if (!el) return;
  el.textContent = message;
  el.className = type;
}

export function getActivePieces(state) {
  return getModulePieces(state.pieces, state.currentModule);
}

export function getActiveDependencies(state) {
  const pieces = getActivePieces(state);
  return getModuleDependencies(state.dependencies, pieces);
}

export function recalculateAll() {
  const store = getStore();
  const prev = store.get();
  const ids = prev.pieces.map((p) => p.id);
  const dependencies = prev.dependencies.filter(
    (d) => ids.includes(d.from) && ids.includes(d.to)
  );

  const modules = getModules(prev.pieces);
  const currentModule = modules.includes(prev.currentModule)
    ? prev.currentModule
    : modules[0] || GLOBAL_MODULE_ID;

  const activePieces = getModulePieces(prev.pieces, currentModule);
  const activeIds = activePieces.map((p) => p.id);
  const activeDependencies = getModuleDependencies(dependencies, activePieces);
  const piecesById = Object.fromEntries(prev.pieces.map((p) => [p.id, p]));

  let steps = [];
  let levels = [];
  let sorted = [];
  let cycle = null;

  const group = getModuleGroup(prev.pieces, currentModule);
  if (group && group.modules.length > 1) {
    let stepOffset = 0;
    const allSteps = [];
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
      const modPieces = getModulePieces(prev.pieces, mod).filter((p) => !isGlobalPiece(p));
      const modIds = modPieces.map((p) => p.id);
      const modDeps = getModuleDependencies(dependencies, modPieces);
      const modResult = buildSteps(modIds, modDeps, piecesById);
      if (modResult.ok) {
        modResult.steps.forEach((s) => {
          allSteps.push({ ...s, paso: stepOffset + s.paso });
        });
        stepOffset += modResult.steps.length;
      }
    });
    steps = allSteps;
    levels = allSteps.map((s) => s.piezas);
    sorted = allSteps.flatMap((s) => s.piezas.map((id) => ({ id, level: s.paso })));
    cycle = null;
  } else {
    const topo = topologicalLevels(activeIds, activeDependencies);
    levels = topo.levels;
    sorted = topo.sorted;
    cycle = topo.cycle;
    steps = buildSteps(activeIds, activeDependencies, piecesById).steps || [];
  }

  const alerts = [];
  activePieces.forEach((p) => {
    if (p.riesgo === 'critico') {
      alerts.push({ level: 'danger', piece: p, text: `Crítico: ${p.nombre} requiere soporte/divisor.` });
    }
    if (p.riesgo === 'alto') {
      alerts.push({ level: 'warning', piece: p, text: `Alto: ${p.nombre} recomienda soporte intermedio.` });
    }
    if (p.tipo === 'fondo_decorativo') {
      alerts.push({ level: 'info', piece: p, text: `${p.nombre} es fondo decorativo (${p.espesor} mm).` });
    }
  });
  if (cycle) {
    alerts.push({ level: 'danger', text: `Ciclo detectado: ${cycle.join(' → ')}` });
  }

  const hardware = calculateHardware(prev.pieces, dependencies);

  store.set({
    dependencies,
    modules,
    currentModule,
    levels,
    sorted,
    cycle,
    steps,
    alerts,
    hardware,
  });

  updateModuleSelector();
  updateSummary();
  renderCurrentView();
}

export function updateSummary() {
  const state = getStore().get();
  const activePieces = getActivePieces(state);
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
  const state = getStore().get();
  const select = $('#module-selector');
  if (!select) return;
  const current = state.currentModule;
  select.innerHTML = state.modules
    .map((m) => {
      const label = getModuleLabel(m, state.pieces);
      return `<option value="${m}" ${m === current ? 'selected' : ''}>${label}</option>`;
    })
    .join('');
}

export function renderCurrentView() {
  const store = getStore();
  const state = store.get();
  const container = $('#view-container');
  if (!container) return;

  if (currentViewInstance && typeof currentViewInstance.destroy === 'function') {
    currentViewInstance.destroy();
  }
  container.innerHTML = '';

  const factory = viewFactories[state.currentView] || viewFactories.csv;
  currentViewInstance = factory(store);
  currentViewInstance.mount(container);
}

export function switchTab(view) {
  const store = getStore();
  store.set({ currentView: view });
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
  getStore().set({
    pieces: result.pieces,
    dependencies: sugerirDependencias(result.pieces),
    warnings: result.warnings,
    currentStep: 0,
  });
  recalculateAll();
  setStatus(`CSV cargado: ${result.pieces.length} piezas, ${getStore().get().dependencies.length} dependencias.`, 'alert--success');
}

export function addEmptyPiece() {
  const store = getStore();
  const state = store.get();
  const count = state.pieces.filter((p) => p.id.startsWith('pieza-')).length + 1;
  store.set({ pieces: [...state.pieces, createEmptyPiece(count + state.pieces.length)] });
  recalculateAll();
}

export function addDependency(from, to, type = 'estructural') {
  const store = getStore();
  const state = store.get();
  store.set({ dependencies: [...state.dependencies, { from, to, type }] });
  recalculateAll();
}

export function removeDependency(from, to) {
  const store = getStore();
  const state = store.get();
  const dependencies = state.dependencies.filter((d) => !(d.from === from && d.to === to));
  store.set({ dependencies });
  recalculateAll();
}

export function resetDependencies() {
  const store = getStore();
  const state = store.get();
  store.set({ dependencies: sugerirDependencias(state.pieces) });
  recalculateAll();
}

export function clearDependencies() {
  getStore().set({ dependencies: [] });
  recalculateAll();
}

export function updatePiece(index, field, value) {
  const store = getStore();
  const state = store.get();
  if (!state.pieces[index]) return;
  const pieces = state.pieces.map((p, i) => (i === index ? { ...p, [field]: value } : p));
  store.set({ pieces });
  recalculateAll();
}

export function removePiece(index) {
  const store = getStore();
  const state = store.get();
  const pieces = state.pieces.filter((_, i) => i !== index);
  store.set({ pieces });
  recalculateAll();
}

export function updateUserConfig(key, value) {
  const store = getStore();
  const state = store.get();
  const next = { ...state.userConfig, [key]: Number(value) };
  store.set({ userConfig: next });
  saveUserConfig(next);
}

export function updatePieceOffset(originalId, field, value) {
  const store = getStore();
  const state = store.get();
  const pieceOffsets = { ...(state.userConfig?.pieceOffsets || {}) };
  pieceOffsets[originalId] = { ...pieceOffsets[originalId], [field]: Number(value) };
  const next = { ...state.userConfig, pieceOffsets };
  store.set({ userConfig: next });
  saveUserConfig(next);
}

export function resetPieceOffsets() {
  const store = getStore();
  const state = store.get();
  const next = { ...state.userConfig, pieceOffsets: {} };
  store.set({ userConfig: next });
  saveUserConfig(next);
}

export function resetUserConfig() {
  const store = getStore();
  store.set({ userConfig: { ...VERTICAL_POSITIONS, pieceOffsets: {} } });
  resetUserConfigService();
}

function init() {
  if (!getStore()) {
    setStore(createStore());
  }

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.view));
  });

  $('#module-selector')?.addEventListener('change', (e) => {
    getStore().set({ currentModule: e.target.value });
    recalculateAll();
  });

  $('#btn-load-example')?.addEventListener('click', () => {
    const select = $('#example-selector');
    const path = select?.value;
    if (!path) {
      setStatus('Selecciona un mueble primero', 'warning');
      return;
    }
    loadExample(path);
  });

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

  $('#btn-export-csv')?.addEventListener('click', () => {
    const state = getStore().get();
    if (!state.pieces.length) {
      setStatus('No hay piezas para exportar.', 'alert--warning');
      return;
    }
    downloadText('cutternest-piezas.csv', piecesToCSV(state.pieces), 'text/csv');
  });

  $('#btn-save-example')?.addEventListener('click', async () => {
    const state = getStore().get();
    if (!state.pieces.length) {
      setStatus('No hay piezas para guardar como ejemplo.', 'alert--warning');
      return;
    }
    const name = prompt('Nombre del nuevo ejemplo:');
    if (!name || !name.trim()) return;
    const csv = piecesToCSV(state.pieces);
    try {
      const res = await fetch('/api/v1/assembly-planner/examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error del servidor');
      const select = $('#example-selector');
      const option = document.createElement('option');
      option.value = data.path;
      option.textContent = data.name;
      select.appendChild(option);
      select.value = option.value;
      setStatus(`Ejemplo guardado: ${data.path}`, 'alert--success');
    } catch (err) {
      setStatus(`No se pudo guardar: ${err.message}`, 'alert--danger');
    }
  });

  switchTab('csv');
  setStatus('Listo. Carga un CSV o usa los ejemplos para comenzar.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
