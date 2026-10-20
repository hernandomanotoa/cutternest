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
import {
  saveCloudVersion,
  getCloudVersion,
  deleteCloudVersion,
} from './services/designVersionsClient.js';
import { sugerirDependencias } from './services/heuristics.js';
import { topologicalLevels, buildSteps } from './services/topologicalSort.js';
import { createCSVView } from './views/csvView.js';
import { createStructuralView } from './views/structuralView.js';
import { createConstructorView } from './views/constructorView.js';
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
import { getGapPreset, GAP_PRESETS } from './core/gapPresets.js';
import {
  createModule,
  addZocalo,
  addShelf,
  addHangerRail,
  addDoubleRail,
  addDrawer,
  nextModuleId,
  nextContentIndex,
  countRootModules,
  rootModuleIds,
  duplicateModulePieces,
} from './services/closetBuilderService.js';
import {
  saveVersion,
  loadVersion,
  deleteVersion,
  deleteAllVersions,
  renameVersion,
  duplicateVersion,
  versionCsv,
} from './services/projectVersionsService.js';

export const GLOBAL_MODULE_ID = 'global';

const viewFactories = {
  csv: createCSVView,
  constructor: createConstructorView,
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
    // Mueble multi-modulo: arrancar en Vista completa (todas las piezas).
    ...(countRootModules(result.pieces) > 1 ? { currentModule: 'all' } : {}),
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

// ── Constructor de closets (closetBuilderService) ─────────────────

// Preset aplicado en memoria a los muebles creados en el Constructor: los
// mismos valores versionados en GAP_PRESETS para el closet abierto modular
// (fuente unica; si se editan alli, el constructor los hereda). No se
// persiste: solo reactiva las posiciones verticales del closet.
const CONSTRUCTOR_PRESET = GAP_PRESETS['ejemplo-closet-abierto-modular.csv'];

function applyConstructorPreset() {
  setActivePreset(CONSTRUCTOR_PRESET);
  getStore().set({ userConfig: loadUserConfig() });
}

// Re-parsea el mueble completo en silencio para recuperar los warnings del
// validador (luz de repisas, cobertura de frentes, etc.) tras un cambio del
// constructor. La vista los muestra como toast informativo (mejora #19).
function validatePiecesQuiet(pieces) {
  try {
    const result = parseCSV(piecesToCSV(pieces));
    return Array.isArray(result.warnings) ? result.warnings : [];
  } catch {
    return [];
  }
}

// Agrega uno o mas modulos nuevos (casco + zocalo opcional) al mueble.
// config: { ancho, alto, prof, espesor?, colorCuerpo?, conZocalo?,
// alturaZocalo?, cantidad? }. Con zocalo la base se genera INTERNA para
// apoyarse sobre el (modelo zocalo-cajon). Devuelve { ok, moduleIds? }.
export function addModuleFromBuilder(config) {
  const store = getStore();
  const state = store.get();
  const cantidad = Math.max(1, Math.min(12, Number(config.cantidad) || 1));
  const alturaZocalo = Number(config.alturaZocalo) > 0 ? Number(config.alturaZocalo) : 150;
  const nuevas = [];
  const moduleIds = [];

  for (let i = 0; i < cantidad; i++) {
    const moduleId = nextModuleId([...state.pieces, ...nuevas]);
    const result = createModule({
      ancho: Number(config.ancho),
      alto: Number(config.alto),
      prof: Number(config.prof),
      espesor: config.espesor ?? 15,
      colorCuerpo: config.colorCuerpo || '#C19A6B',
      modulo: moduleId,
      baseInterna: !!config.conZocalo,
    });
    if (!result.ok) return { ok: false, errors: result.errors };
    nuevas.push(...result.pieces);
    if (config.conZocalo) {
      const z = addZocalo(moduleId, {
        ancho: Number(config.ancho),
        alto: alturaZocalo,
        espesor: config.espesor ?? 15,
        color: config.colorCuerpo || '#C19A6B',
      });
      if (!z.ok) return { ok: false, errors: z.errors };
      nuevas.push(...z.pieces);
    }
    moduleIds.push(moduleId);
  }

  applyConstructorPreset();
  const allPieces = [...state.pieces, ...nuevas];
  store.set({ pieces: allPieces, dependencies: sugerirDependencias(allPieces) });
  recalculateAll();
  // Segundo (y siguientes) modulo: saltar a Vista completa automaticamente.
  if (countRootModules(getStore().get().pieces) > 1) {
    getStore().set({ currentModule: 'all' });
    recalculateAll();
  }
  return { ok: true, moduleId: moduleIds[moduleIds.length - 1], moduleIds, warnings: validatePiecesQuiet(allPieces) };
}

// Derive las dimensiones reales del modulo desde su casco. Ancho/profundidad
// se leen de la TAPA (siempre externa); si falta, de la base ajustando el
// montaje (base interna = modulo - 2E). Alto del lateral.
function moduleDims(modPieces, moduleId) {
  const tapa = modPieces.find((p) => p.id === `m${moduleId}-tapa`);
  const base = modPieces.find((p) => p.id === `m${moduleId}-base`);
  const lateral = modPieces.find((p) => p.id === `m${moduleId}-lateral-izq`);
  if (!base && !tapa) return null;
  const espesor = Number((base || tapa).espesor) || 15;
  const baseEsInterna = base && tapa ? Number(base.ancho) < Number(tapa.ancho) : false;
  const anchoModulo = tapa ? Number(tapa.ancho)
    : baseEsInterna || !tapa ? Number(base.ancho) + 2 * espesor : Number(base.ancho);
  const profModulo = tapa ? Number(tapa.alto)
    : Number(base.alto) + (baseEsInterna ? 2 * espesor : 0);
  return { anchoModulo, profModulo, altoModulo: lateral ? Number(lateral.alto) : null, espesor, colorCuerpo: (base || tapa).color || '#C19A6B' };
}

// Agrega contenido a un modulo existente. kind: shelf|rail|doubleRail|
// zocalo|drawer|shoeRack. opts.altoVano aplica a drawer/shoeRack;
// opts.tipo 'corredera'|'volquete'; opts.colorFrente para cajones/zapateras;
// opts.alturaZocalo para zocalo (default 150).
export function addContentToModule(moduleId, kind, opts = {}) {
  const store = getStore();
  const state = store.get();
  const modPieces = state.pieces.filter((p) => String(p.modulo) === String(moduleId));
  const dims = moduleDims(modPieces, moduleId);
  if (!dims) return { ok: false, errors: [`El modulo ${moduleId} no tiene casco (base/tapa)`] };
  const { anchoModulo, profModulo, espesor, colorCuerpo } = dims;
  const anchoUtil = anchoModulo - 2 * espesor;
  const profUtil = profModulo - 2 * espesor;

  let result = null;
  let piecesMutadas = null;
  if (kind === 'shelf') {
    result = addShelf(moduleId, {
      anchoUtil, profReal: profUtil, espesor,
      color: opts.color || '#D9C2A3',
      index: nextContentIndex(state.pieces, moduleId, 'shelf'),
    });
  } else if (kind === 'rail') {
    result = addHangerRail(moduleId, {
      anchoUtil, index: nextContentIndex(state.pieces, moduleId, 'rail'),
    });
  } else if (kind === 'doubleRail') {
    result = addDoubleRail(moduleId, { anchoUtil, index: nextContentIndex(state.pieces, moduleId, 'rail') });
  } else if (kind === 'zocalo') {
    result = addZocalo(moduleId, {
      ancho: anchoModulo,
      alto: Number(opts.alturaZocalo) > 0 ? Number(opts.alturaZocalo) : 150,
      espesor, color: colorCuerpo,
    });
    // Primer zocalo del modulo: convertir la base a interna para que se
    // apoye sobre el (si aun es externa).
    const tieneZocalo = state.pieces.some((p) => p.id === `m${moduleId}-zocalo`);
    const tapa = modPieces.find((p) => p.id === `m${moduleId}-tapa`);
    const base = modPieces.find((p) => p.id === `m${moduleId}-base`);
    if (result.ok && !tieneZocalo && base && tapa && Number(base.ancho) >= Number(tapa.ancho)) {
      piecesMutadas = state.pieces.map((p) => (
        p.id === base.id
          ? { ...p, ancho: anchoModulo - 2 * espesor, alto: profModulo - 2 * espesor }
          : p
      ));
    }
  } else if (kind === 'drawer' || kind === 'shoeRack') {
    // Contador UNIFICADO cajón+zapatera: submódulos secuenciales según el
    // orden de inserción (11, 12, 13...). Con contadores separados, cajón 1
    // y zapatera 1 colisionaban en el mismo submódulo ('11') y el
    // emparejamiento de cajas (matchDrawerBoxParts) podía cruzarlas.
    const idx = Math.max(
      nextContentIndex(state.pieces, moduleId, 'drawer'),
      nextContentIndex(state.pieces, moduleId, 'shoeRack'),
    );
    result = addDrawer(moduleId, idx, {
      anchoModulo, profundidadModulo: profModulo,
      altoVano: Number(opts.altoVano) > 0 ? Number(opts.altoVano) : 200,
      tipo: opts.tipo || 'corredera',
      vocabulario: kind === 'shoeRack' ? 'zapatera' : 'cajon',
      colorFrente: opts.colorFrente || '#8B5A2B',
      colorLateral: opts.colorLateral || '#D9C2A3',
    });
  } else {
    return { ok: false, errors: [`Contenido "${kind}" no soportado`] };
  }

  if (!result.ok) return result;
  const basePieces = piecesMutadas || state.pieces;
  const allPieces = [...basePieces, ...result.pieces];
  store.set({ pieces: allPieces, dependencies: sugerirDependencias(allPieces) });
  recalculateAll();
  return { ok: true, warnings: validatePiecesQuiet(allPieces) };
}

// Duplica un modulo (casco + contenido + submodulos) con id nuevo.
export function duplicateModule(moduleId) {
  const store = getStore();
  const state = store.get();
  const newId = nextModuleId(state.pieces);
  const copias = duplicateModulePieces(state.pieces, moduleId, newId);
  if (!copias.length) return { ok: false, errors: [`El modulo ${moduleId} no existe`] };
  const allPieces = [...state.pieces, ...copias];
  store.set({ pieces: allPieces, dependencies: sugerirDependencias(allPieces) });
  recalculateAll();
  return { ok: true, moduleId: newId };
}

// Recolorea el casco de un modulo (base/tapa/laterales/zocalo).
export function recolorModule(moduleId, color) {
  const store = getStore();
  const state = store.get();
  if (!/^#[0-9A-Fa-f]{6}$/.test(String(color || ''))) {
    return { ok: false, errors: [`Color invalido "${color}"`] };
  }
  const cascoIds = new Set([
    `m${moduleId}-base`, `m${moduleId}-tapa`,
    `m${moduleId}-lateral-izq`, `m${moduleId}-lateral-der`,
    `m${moduleId}-zocalo`,
  ]);
  const pieces = state.pieces.map((p) => (
    cascoIds.has(String(p.id)) ? { ...p, color: String(color) } : p
  ));
  store.set({ pieces });
  recalculateAll();
  return { ok: true };
}

// Limpia todo el mueble (nuevo mueble). La vista pide doble confirmacion.
// Elimina un contenido individual de un modulo. ref = el indice de la pieza
// (p. ej. 'm1cajon2-frente' para un cajon, 'm1-repisa-1' para una repisa,
// 'm1-barra-alta-1' para una barra). Quita TODAS las piezas del grupo
// (caja completa, refuerzo incluido).
export function removeContentPiece(refId) {
  const store = getStore();
  const state = store.get();
  const ref = String(refId);
  // Prefijo del grupo: sin el sufijo final ('-frente', '-lateral-izq'...).
  // Para ids tipo 'm1cajon2-frente' el grupo es 'm1cajon2-'; para
  // 'm1-repisa-1' es 'm1-repisa-1' (pieza unica, mas su refuerzo).
  let groupPrefix = ref.slice(0, ref.lastIndexOf('-') + 1);
  if (groupPrefix === 'm') groupPrefix = ref; // seguridad: sin guiones
  const esRepisa = /-repisa-\d+$/.test(ref);
  const pieces = state.pieces.filter((p) => {
    const id = String(p.id);
    if (id === ref) return false;
    if (id.startsWith(groupPrefix) && /-(frente|lateral|fondo|cara|base|tirador)$/.test(id)) return false;
    // La repisa arranca su refuerzo asociado.
    if (esRepisa && id === ref.replace('-repisa-', '-refuerzo-repisa-')) return false;
    return true;
  });
  store.set({ pieces, dependencies: sugerirDependencias(pieces) });
  recalculateAll();
  return { ok: true };
}

// Reordena un modulo: 'izq' intercambia su posicion con el modulo raiz
// numerico anterior, 'der' con el siguiente. Renumerar ids es invasivo
// (cambia ids/submodulos de piezas y dependencias), asi que se implementa
// como intercambio de numeros de modulo entre los dos afectados.
export function moveModule(moduleId, direction) {
  const store = getStore();
  const state = store.get();
  const roots = [...rootModuleIds(state.pieces)].sort((a, b) => Number(a) - Number(b));
  const idx = roots.indexOf(String(moduleId));
  const swapWith = direction === 'izq' ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= roots.length) {
    return { ok: false, errors: ['No hay modulo con que intercambiar'] };
  }
  const a = roots[idx];
  const b = roots[swapWith];
  // Renombrar a→tmp, b→a, tmp→b con un prefijo temporal no numerico.
  let pieces = renameModulePrefix(state.pieces, a, `x${a}`);
  pieces = renameModulePrefix(pieces, b, a);
  pieces = renameModulePrefix(pieces, `x${a}`, b);
  store.set({ pieces, dependencies: sugerirDependencias(pieces) });
  recalculateAll();
  return { ok: true, moduleId: b };
}

// Renombra el prefijo de modulo de todas las piezas de un modulo raiz:
// ids 'm{old}...' → 'm{new}...' y modulos raiz/submodulo acordes.
function renameModulePrefix(pieces, oldId, newId) {
  const oldPref = `m${oldId}`;
  const newPref = `m${newId}`;
  const pertenece = (mod) => {
    const m = String(mod || '');
    return m === String(oldId) || (m.startsWith(String(oldId)) && /^\d+$/.test(oldId));
  };
  return pieces.map((p) => {
    const mod = String(p.modulo || '');
    if (!pertenece(mod)) return p;
    const nuevoModulo = mod === String(oldId)
      ? String(newId)
      : String(newId) + mod.slice(String(oldId).length);
    const nuevoId = String(p.id).startsWith(oldPref)
      ? newPref + String(p.id).slice(oldPref.length)
      : String(p.id);
    const nuevoOriginalId = p.originalId && String(p.originalId).startsWith(oldPref)
      ? newPref + String(p.originalId).slice(oldPref.length)
      : p.originalId;
    return { ...p, id: nuevoId, modulo: nuevoModulo, originalId: nuevoOriginalId };
  });
}

// Edita las dimensiones del casco de un modulo existente. Solo el casco
// (base/tapa/laterales/fondo); el contenido agregado se conserva tal cual.
export function editModuleDimensions(moduleId, { ancho, alto, prof }) {
  const store = getStore();
  const state = store.get();
  const dims = { ancho: Number(ancho), alto: Number(alto), prof: Number(prof) };
  if (!(dims.ancho >= 100 && dims.alto >= 100 && dims.prof >= 100)) {
    return { ok: false, errors: ['Las dimensiones deben ser >= 100 mm'] };
  }
  const tapa = state.pieces.find((p) => p.id === `m${moduleId}-tapa`);
  if (!tapa) return { ok: false, errors: [`El modulo ${moduleId} no tiene casco`] };
  const espesor = Number(tapa.espesor) || 15;
  const baseEsInterna = state.pieces.some((p) => p.id === `m${moduleId}-zocalo`)
    && state.pieces.find((p) => p.id === `m${moduleId}-base`)?.ancho < tapa.ancho;
  const cascoIds = {
    base: [`m${moduleId}-base`, baseEsInterna ? dims.ancho - 2 * espesor : dims.ancho, baseEsInterna ? dims.prof - 2 * espesor : dims.prof],
    tapa: [`m${moduleId}-tapa`, dims.ancho, dims.prof],
    'lateral-izq': [`m${moduleId}-lateral-izq`, dims.prof, dims.alto],
    'lateral-der': [`m${moduleId}-lateral-der`, dims.prof, dims.alto],
    fondo: [`m${moduleId}-fondo`, dims.ancho - 2 * espesor, dims.alto - 2 * espesor],
  };
  const pieces = state.pieces.map((p) => {
    for (const [, [id, w, h]] of Object.entries(cascoIds)) {
      if (p.id === id) return { ...p, ancho: w, alto: h };
    }
    return p;
  });
  store.set({ pieces, dependencies: sugerirDependencias(pieces) });
  recalculateAll();
  return { ok: true };
}

// Limpia todo el mueble (nuevo mueble). La vista pide doble confirmacion.
export function clearAllPieces() {
  const store = getStore();
  store.set({ pieces: [], dependencies: [], warnings: [], currentModule: 'global', currentStep: 0 });
  recalculateAll();
  return { ok: true };
}

// Elimina un modulo: quita las piezas cuyo modulo raiz coincide (incluye
// submodulos tipo '11' al borrar '1').
export function removeModule(moduleId) {
  const store = getStore();
  const state = store.get();
  const id = String(moduleId);
  const pieces = state.pieces.filter((p) => {
    const mod = String(p.modulo || '');
    if (mod === id) return false;
    // Submodulo concatenado ('11' pertenece a '1') o dotted ('1.2').
    if (/^\d+$/.test(id) && (mod.startsWith(id) || mod.startsWith(`${id}.`))) return false;
    return true;
  });
  store.set({ pieces, dependencies: sugerirDependencias(pieces) });
  recalculateAll();
  return { ok: true };
}

// ── Versiones de diseno (projectVersionsService) ──────────────────

// Hash barato (djb2) del CSV de piezas: alimenta el badge "sin guardar".
let lastSavedHash = null;
function piecesHash(pieces) {
  const csv = piecesToCSV(pieces || []);
  let h = 5381;
  for (let i = 0; i < csv.length; i++) h = ((h << 5) + h + csv.charCodeAt(i)) | 0;
  return String(h);
}

// true cuando las piezas actuales difieren de la ultima version guardada
// o cargada (null al inicio de sesion = sin baseline).
export function isDesignDirty() {
  if (lastSavedHash === null) return false;
  return piecesHash(getStore().get().pieces) !== lastSavedHash;
}

export function saveCurrentVersion(name) {
  const state = getStore().get();
  const result = saveVersion(name, { pieces: state.pieces, dependencies: state.dependencies });
  if (result.ok) lastSavedHash = piecesHash(state.pieces);
  return result;
}

export function loadVersionById(id) {
  const result = loadVersion(id);
  if (!result.ok) return result;
  setActivePreset(CONSTRUCTOR_PRESET);
  getStore().set({
    userConfig: loadUserConfig(),
    pieces: result.pieces,
    dependencies: result.dependencies.length
      ? result.dependencies
      : sugerirDependencias(result.pieces),
    warnings: result.warnings || [],
    currentStep: 0,
    ...(countRootModules(result.pieces) > 1 ? { currentModule: 'all' } : {}),
  });
  lastSavedHash = piecesHash(result.pieces);
  recalculateAll();
  return { ok: true, name: result.name };
}

export function deleteVersionById(id) {
  return deleteVersion(id);
}

export function deleteAllVersionsAction() {
  return deleteAllVersions();
}

export function renameVersionById(id, name) {
  return renameVersion(id, name);
}

export function duplicateVersionById(id) {
  return duplicateVersion(id);
}

// Exporta una version guardada a archivo CSV.
export function exportVersionCsv(id) {
  const csv = versionCsv(id);
  if (!csv) return { ok: false, error: 'Version no encontrada' };
  const name = loadVersion(id)?.name || 'version';
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  downloadText(`cutternest-${slug || 'version'}.csv`, csv, 'text/csv');
  return { ok: true };
}

// Exporta el mueble actual a archivo CSV.
export function exportCurrentCsv() {
  const state = getStore().get();
  if (!state.pieces.length) return { ok: false, error: 'No hay piezas que exportar' };
  downloadText('cutternest-piezas.csv', piecesToCSV(state.pieces), 'text/csv');
  return { ok: true };
}

// ── Versiones en la nube (designVersionsClient) ───────────────────

export async function saveCurrentVersionToCloud(name) {
  const state = getStore().get();
  if (!state.pieces.length) return { ok: false, error: 'No hay piezas que guardar' };
  const trimmed = String(name || '').trim() || `Closet ${new Date().toLocaleDateString('es-ES')}`;
  return saveCloudVersion(trimmed, {
    csv: piecesToCSV(state.pieces),
    pieceCount: state.pieces.length,
  });
}

export async function loadCloudVersionById(id) {
  const r = await getCloudVersion(id);
  if (!r.ok) return r;
  const result = parseCSV(r.csv);
  if (!result.ok) return { ok: false, error: 'CSV corrupto en la version de nube' };
  setActivePreset(CONSTRUCTOR_PRESET);
  getStore().set({
    userConfig: loadUserConfig(),
    pieces: result.pieces,
    dependencies: sugerirDependencias(result.pieces),
    warnings: result.warnings || [],
    currentStep: 0,
    ...(countRootModules(result.pieces) > 1 ? { currentModule: 'all' } : {}),
  });
  lastSavedHash = piecesHash(result.pieces);
  recalculateAll();
  return { ok: true, name: r.name };
}

export async function deleteCloudVersionById(id) {
  return deleteCloudVersion(id);
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
