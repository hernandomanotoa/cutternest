// app.js — punto de entrada y orquestador del Assembly Planner
// Usa js/core/store.js como única fuente de verdad del estado.

import {
  $,
  $$,
  readFileAsText,
  downloadText,
} from './components/domUtils.js';
import {
  getModules,
  getModulePieces,
  getModuleDependencies,
  getModuleLabel,
  getModuleGroup,
  getModuleOptions,
  isGlobalPiece,
} from './utils/helpers.js';
import { parseCSV, piecesToCSV, createEmptyPiece } from './services/csvParser.js';
import { sugerirDependencias } from './services/heuristics.js';
import { topologicalLevels, buildSteps } from './services/topologicalSort.js';
import { createCSVView } from './views/csvView.js';
import { createStructuralView } from './views/structuralView.js';
import { createIsometricView } from './views/isometricView.js';
import { createRenderer3DView } from './views/renderer3DView.js';
import { calculateHardware } from './services/hardware.js';
import { getStore, setStore, createStore } from './core/store.js';
import {
  saveUserConfig,
  resetUserConfig as resetUserConfigService,
  setActivePreset,
  loadUserConfig,
} from './services/userConfigService.js';
import { getGapPreset } from './core/gapPresets.js';

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
  // Validación amplia: raíces, submódulos, global y vista completa. Así un
  // submódulo seleccionado (p. ej. la bandeja '14') sobrevive al recálculo.
  const validIds = new Set(getModuleOptions(prev.pieces).map((o) => o.id));
  const currentModule = validIds.has(prev.currentModule)
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
  select.innerHTML = getModuleOptions(state.pieces)
    .map((o) => {
      const indent = o.depth > 0 ? '\u00A0\u00A0'.repeat(o.depth) + '\u21B3 ' : '';
      return `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${indent}${o.label}</option>`;
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
    // Roving tabindex: solo la tab activa entra en el orden de tabulación.
    tab.tabIndex = active ? 0 : -1;
  });
  // El panel compartido se etiqueta con la tab activa.
  const activeTab = $(`.tab[data-view="${view}"]`);
  $('#view-container')?.setAttribute('aria-labelledby', activeTab?.id || 'tab-csv');
  renderCurrentView();
}

// Navegación por teclado del tablist (patrón ARIA de tabs):
// las flechas mueven el foco (roving tabindex) y Enter/Espacio activa.
function handleTabsKeydown(event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const tabs = $$('.tab');
  const currentIndex = tabs.findIndex((t) => t === document.activeElement);
  if (currentIndex === -1) return;
  event.preventDefault();

  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = tabs.length - 1;
  }
  tabs[nextIndex].focus();
}

function activateFocusedTab(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const view = event.currentTarget?.dataset?.view;
  if (!view) return;
  // preventDefault evita el click nativo del botón (Enter/Space) que duplicaría la activación.
  event.preventDefault();
  switchTab(view);
}

export function loadExample(url) {
  fetch(url)
    .then((res) => res.text())
    .then((text) => loadCSV(text, getGapPreset(url)))
    .catch(() => setStatus('No se pudo cargar el ejemplo.', 'alert--danger'));
}

// `preset` (opcional): defaults del mueble (js/core/gapPresets.js). Se activa
// ANTES de fijar las piezas para que la primera render ya use los defaults del
// mueble; las ediciones del usuario se aplican encima vía loadUserConfig().
export function loadCSV(text, preset = null) {
  const result = parseCSV(text);
  if (!result.ok) {
    setStatus(`Errores: ${result.errors.slice(0, 3).join('; ')}`, 'alert--danger');
    return;
  }
  setActivePreset(preset || {});
  getStore().set({ userConfig: loadUserConfig() });
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

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function setAperturaGlobal(valor) {
  const store = getStore();
  store.setField('aperturaGlobal', clamp01(valor));
}

export function setAperturaPieza(pieceId, valor) {
  const store = getStore();
  const state = store.get();
  const aperturas = { ...state.aperturas };
  const v = clamp01(valor);
  if (v === 0 && !(pieceId in aperturas)) {
    store.setField('aperturas', aperturas);
    return;
  }
  if (v === 0) delete aperturas[pieceId];
  else aperturas[pieceId] = v;
  store.setField('aperturas', aperturas);
}

export function setAnguloPieza(pieceId, grados) {
  const store = getStore();
  const state = store.get();
  const n = Number(grados);
  if (!Number.isFinite(n)) return;
  const angulos = { ...state.angulos, [pieceId]: Math.min(120, Math.max(0, Math.abs(n))) };
  store.setField('angulos', angulos);
}

export function clearAnguloPieza(pieceId) {
  const store = getStore();
  const state = store.get();
  if (!(pieceId in (state.angulos || {}))) return;
  const angulos = { ...state.angulos };
  delete angulos[pieceId];
  store.setField('angulos', angulos);
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

export function updateFichaCorrections(patch) {
  const store = getStore();
  const state = store.get();
  const fichaCorrections = { ...(state.userConfig?.fichaCorrections || {}) };
  // null/undefined elimina la clave: permite revertir un campo a inferencia.
  for (const [key, value] of Object.entries(patch || {})) {
    if (value == null) delete fichaCorrections[key];
    else fichaCorrections[key] = value;
  }
  const next = { ...state.userConfig, fichaCorrections };
  store.set({ userConfig: next });
  saveUserConfig(next);
}

export function clearFichaCorrections() {
  const store = getStore();
  const state = store.get();
  const next = { ...state.userConfig, fichaCorrections: {} };
  store.set({ userConfig: next });
  saveUserConfig(next);
}

export function resetUserConfig() {
  const store = getStore();
  resetUserConfigService();
  store.set({ userConfig: loadUserConfig() });
}

function init() {
  if (!getStore()) {
    setStore(createStore());
  }

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.view));
    tab.addEventListener('keydown', handleTabsKeydown);
    tab.addEventListener('keydown', activateFocusedTab);
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
