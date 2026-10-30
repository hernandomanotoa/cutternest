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
import { inferRole } from './services/classifierService.js';
import { topologicalLevels, buildSteps } from './services/topologicalSort.js';
import { createCSVView } from './views/csvView.js';
import { createStructuralView } from './views/structuralView.js';
import { createAuditView } from './views/auditView.js';
import { createConstructorView } from './views/constructorView.js';
import { createIsometricView } from './views/isometricView.js';
import { createRenderer3DView } from './views/renderer3DView.js';
import { calculateHardware } from './services/hardware.js';
import { inferRailType } from './services/railService.js';
import { getStore, setStore, createStore } from './core/store.js';
import {
  saveUserConfig,
  resetUserConfig as resetUserConfigService,
  setActivePreset,
  loadUserConfig,
} from './services/userConfigService.js';
import { getGapPreset, GAP_PRESETS } from './core/gapPresets.js';
import {
  buildPlinthFrame,
  hasPlinthFrame,
  marcoZocaloHeight,
  modulosConCajones,
  plinthLevelerCount,
  rootModuleDims,
  MARCO_PIECE_RE,
} from './services/plinthFrameService.js';
import { getContentType, RAIL_SIDE_HEIGHT, BANDEJA_RIM_HEIGHT, tipoTagDe, vanoDesdeCara, fondoMetodoDeTipo } from './core/contentTypes.js';
import { installCustomTypes } from './services/customTypesService.js';
import {
  createModule,
  addZocalo,
  addShelf,
  addHangerRail,
  addDoubleRail,
  addDrawer,
  addShoeTray,
  addDivider,
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
  saveAutosave,
  readAutosave,
  clearAutosave,
} from './services/projectVersionsService.js';
import {
  applyGola,
  removeGola,
  isGolaEnabled,
  getGolaCfg,
  drawerUnits,
} from './services/golaService.js';

export const GLOBAL_MODULE_ID = 'global';

const viewFactories = {
  csv: createCSVView,
  constructor: createConstructorView,
  estructural: createStructuralView,
  auditoria: createAuditView,
  isometric: createIsometricView,
  renderer3d: createRenderer3DView,
};

let currentViewInstance = null;

// Tipos personalizados del taller (customTypesService): se inyectan en los
// catálogos en vivo antes de que cualquier vista los consuma. Idempotente;
// sin localStorage (tests) es un no-op.
installCustomTypes();

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

  const hardware = calculateHardware(prev.pieces, dependencies, prev.userConfig || {});

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
  const summaryModule = $('#summary-module');
  if (summaryModule) summaryModule.textContent = getModuleLabel(state.currentModule, state.pieces);
  const summaryPieces = $('#summary-pieces');
  if (summaryPieces) summaryPieces.textContent = activePieces.length;
  const summarySteps = $('#summary-steps');
  if (summarySteps) summarySteps.textContent = state.steps.length;
  const summaryAlerts = $('#summary-alerts');
  if (summaryAlerts) summaryAlerts.textContent = state.alerts.length;
  const graphStatus = $('#summary-graph');
  if (graphStatus) {
    graphStatus.textContent = state.cycle ? 'Ciclo' : state.pieces.length ? 'Válido' : 'Vacío';
    graphStatus.className = `summary-value ${state.cycle ? 'text-danger' : state.pieces.length ? 'text-success' : ''}`;
  }

  const hardwareList = $('#hardware-list');
  if (!hardwareList) return;
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
  snapshotUndo('Cargar CSV');
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

// Pila de deshacer: snapshots de {pieces, dependencies, currentModule}
// tomados ANTES de cada accion estructural del Constructor. Limite acotado
// (memoria) y sin duplicados consecutivos (misma referencia de pieces).
const UNDO_LIMIT = 25;
const undoStack = [];
let undoRestoring = false;

function snapshotUndo(label) {
  if (undoRestoring) return;
  const state = getStore().get();
  const last = undoStack[undoStack.length - 1];
  if (last && last.pieces === state.pieces) return;
  undoStack.push({
    label,
    pieces: state.pieces,
    dependencies: state.dependencies,
    currentModule: state.currentModule,
  });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

// Deshace la ultima accion estructural. Devuelve { ok, label? }.
export function undoLast() {
  const snap = undoStack.pop();
  if (!snap) return { ok: false, error: 'No hay nada que deshacer' };
  undoRestoring = true;
  getStore().set({
    pieces: snap.pieces,
    dependencies: snap.dependencies,
    currentModule: snap.currentModule,
    currentStep: 0,
  });
  recalculateAll();
  undoRestoring = false;
  return { ok: true, label: snap.label };
}

export function canUndo() {
  return undoStack.length > 0;
}

// Enfoca un modulo concreto en la vista isometrica/3D (boton "ver" del
// Constructor): fija currentModule y cambia de pestana.
export function focusModule(moduleId) {
  const store = getStore();
  store.set({ currentModule: String(moduleId) });
  recalculateAll();
  switchTab('isometric');
  return { ok: true };
}

// Duplica TODOS los modulos del mueble (con su contenido) de una vez.
export function duplicateAllModules() {
  const store = getStore();
  const state = store.get();
  const roots = [...rootModuleIds(state.pieces)].sort((a, b) => Number(a) - Number(b));
  if (!roots.length) return { ok: false, errors: ['No hay modulos que duplicar'] };
  snapshotUndo('Duplicar mueble');
  let pieces = state.pieces;
  const nuevosIds = [];
  for (const r of roots) {
    const newId = nextModuleId(pieces);
    const copias = duplicateModulePieces(pieces, r, newId);
    if (!copias.length) return { ok: false, errors: [`El modulo ${r} no existe`] };
    pieces = [...pieces, ...copias];
    nuevosIds.push(newId);
  }
  store.set({ pieces, dependencies: sugerirDependencias(pieces) });
  recalculateAll();
  return { ok: true, count: roots.length, moduleIds: nuevosIds };
}

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
  snapshotUndo("Agregar modulo");
  const store = getStore();
  const state = store.get();
  const cantidad = Math.max(1, Math.min(12, Number(config.cantidad) || 1));
  const alturaZocalo = Number(config.alturaZocalo) > 0 ? Number(config.alturaZocalo) : 150;
  // Con el zócalo estructural a marco activo, el módulo nuevo no lleva
  // frente simple (el marco lo reemplaza); la base sigue interna y el marco
  // se regenera abajo para incluir el módulo.
  const marcoActivo = hasPlinthFrame(state.pieces);
  const conZocalo = !!config.conZocalo && !marcoActivo;
  // Alto del mueble FIJO (incluye el zócalo): el casco descuenta la zona
  // del zócalo para que el fondo se apoye sobre la base interior. Con el
  // marco activo manda el Z del marco (userConfig), no el del formulario.
  const cfg = state.userConfig || {};
  const zEfectivo = marcoActivo
    ? (Number(cfg.plinthAltoZocalo) || 100)
    : conZocalo ? alturaZocalo : 0;
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
      baseInterna: conZocalo || marcoActivo,
      alturaZocalo: zEfectivo,
    });
    if (!result.ok) return { ok: false, errors: result.errors };
    nuevas.push(...result.pieces);
    if (conZocalo) {
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
  if (marcoActivo) {
    // Regenerar el marco para incluir los módulos nuevos (sin segundo
    // paso de undo: la acción completa es un solo "Agregar módulo").
    const cfg = getStore().get().userConfig || {};
    applyStructuralPlinth({
      altoZocalo: Number(cfg.plinthAltoZocalo) || 100,
      retraso: Number(cfg.plinthFrontRecess) || 0,
      nZocalos: Number(cfg.plinthNZocalo) || 1,
      skipUndo: true,
    });
  }
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
  snapshotUndo("Agregar contenido");
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
  // Vano del tipo de contenido (tenis 200, botas 450...): la unidad reserva
  // SU vano completo en el apilado, aunque la pieza ancla (cara de la
  // bandeja abierta) sea mas baja que el vano.
  const tipo = opts.tipo ? getContentType(kind, opts.tipo) : null;
  const altoVano = Number(opts.altoVano) > 0 ? Number(opts.altoVano) : (tipo?.altoVano ?? 200);
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
    const altoZocalo = Number(opts.alturaZocalo) > 0 ? Number(opts.alturaZocalo) : 150;
    result = addZocalo(moduleId, {
      ancho: anchoModulo,
      alto: altoZocalo,
      espesor, color: colorCuerpo,
    });
    // Primer zocalo del modulo: convertir la base a interna para que se
    // apoye sobre el (si aun es externa) y descontar el zócalo del fondo:
    // la altura del mueble queda fija y el fondo se apoya sobre la base.
    const tieneZocalo = state.pieces.some((p) => p.id === `m${moduleId}-zocalo`);
    const tapa = modPieces.find((p) => p.id === `m${moduleId}-tapa`);
    const base = modPieces.find((p) => p.id === `m${moduleId}-base`);
    const lateral = modPieces.find((p) => p.id === `m${moduleId}-lateral-izq`);
    if (result.ok && !tieneZocalo && base && tapa && lateral
      && Number(base.ancho) >= Number(tapa.ancho)) {
      const altoModulo = Number(lateral.alto) || 0;
      piecesMutadas = state.pieces.map((p) => {
        if (p.id === base.id) return { ...p, ancho: anchoModulo - 2 * espesor, alto: profModulo - espesor };
        if (p.id === `m${moduleId}-fondo` && altoModulo) {
          return { ...p, alto: Math.max(100, altoModulo - altoZocalo - 2 * espesor) };
        }
        return p;
      });
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
    if (kind === 'shoeRack') {
      // Bandeja zapatera: laterales bajos (cubren la riel) y frente variable
      // (completo = sin cara ni gaps; bajo = cara + gaps como el cajón;
      // conFrente = false por default: bandeja abierta, sin frente ni tirador).
      result = addShoeTray(moduleId, idx, {
        anchoModulo, profundidadModulo: profModulo,
        altoVano,
        espesorModulo: espesor,
        frenteCompleto: tipo ? !!tipo.frenteCompleto : !!opts.frenteCompleto,
        conFrente: !!opts.conFrente,
        // Modo del frente (3 modos del Constructor): whitelist; sin modo
        // válido cae al default del servicio (hereda de conFrente).
        modoFrente: ['completo', 'borde', 'abierta', 'personalizado'].includes(opts.modoFrente)
          ? opts.modoFrente
          : null,
        // Alturas del modo 'borde'/'personalizado' (>0; si no, default del
        // servicio). Ningún espesor nuevo: TODO sale de espesorModulo.
        bordeFrontal: Number(opts.bordeFrontal) > 0 ? Number(opts.bordeFrontal) : undefined,
        altoFondo: Number(opts.altoFondo) > 0 ? Number(opts.altoFondo) : null,
        altoDivision: Number(opts.altoDivision) > 0 ? Number(opts.altoDivision) : null,
        altoFrente: Number(opts.altoFrente) > 0 ? Number(opts.altoFrente) : null,
        altoLateral: Number(opts.altoLateral) >= 40 ? Number(opts.altoLateral) : undefined,
        ladosIguales: tipo ? !!tipo.ladosIguales : !!opts.ladosIguales,
        rim: tipo && tipo.rim ? tipo.rim : BANDEJA_RIM_HEIGHT,
        tipoId: tipo ? tipo.id : null,
        espesorFrente: [15, 18, 25].includes(Number(opts.espesorFrente)) ? Number(opts.espesorFrente) : 15,
        colorFrente: opts.colorFrente || '#8B5A2B',
        colorLateral: opts.colorLateral || '#D9C2A3',
        // División central (apoyo de la fila delantera): por defecto va.
        division: opts.division !== false,
        riel: ['catalogo', 'telescopica26', 'oculta', 'marco'].includes(opts.riel) ? opts.riel : 'catalogo',
        frenteLuz: Number(opts.frenteLuz) || 1,
      });
    } else {
      result = addDrawer(moduleId, idx, {
        anchoModulo, profundidadModulo: profModulo,
        altoVano,
        espesorModulo: espesor,
        tipo: opts.tipoCorredera || 'corredera',
        vocabulario: 'cajon',
        nPorFila: Number(opts.nPorFila) === 2 ? 2 : 1,
        espesorFrente: [15, 18, 25].includes(Number(opts.espesorFrente)) ? Number(opts.espesorFrente) : 15,
        colorFrente: opts.colorFrente || '#8B5A2B',
        colorLateral: opts.colorLateral || '#D9C2A3',
        riel: ['catalogo', 'telescopica26', 'oculta'].includes(opts.riel) ? opts.riel : 'catalogo',
        frenteLuz: Number(opts.frenteLuz) || 1,
        tipoId: tipo ? tipo.id : null,
        // Método del fondo: el override de la tarjeta gana; si no, el del
        // tipo (addDrawer cae a 'apoyado' sin contrato).
        fondoMetodo: ['apoyado', 'ranurado'].includes(opts.fondoMetodo) ? opts.fondoMetodo : null,
      });
    }
  } else if (kind === 'divider') {
    // Divisor vertical: span completo del vano util (zocalo -> tapa).
    const altoModulo = Number(modPieces.find((p) => p.id.endsWith('lateral-izq'))?.alto) || 0;
    const altoZocalo = state.pieces.find((p) => p.id === `m${moduleId}-zocalo`)?.alto || 0;
    result = addDivider(moduleId, {
      altoUtil: altoModulo - altoZocalo - espesor,
      espesor,
      color: colorCuerpo,
      index: nextContentIndex(state.pieces, moduleId, 'divider'),
    });
  } else {
    return { ok: false, errors: [`Contenido "${kind}" no soportado`] };
  }

  if (!result.ok) return result;
  // Anclar el contenido nuevo con pos_z (orden de insercion = orden vertical):
  // el renderizador apila por ZONAS (todas las repisas juntas, luego todos los
  // frentes), asi que sin ancla, agregar una repisa DESPUES de unos cajones la
  // dibujaba debajo de ellos. Con pos_z cada pieza queda donde el usuario la
  // agrego, de abajo hacia arriba (como se arma en el taller).
  const errorAncla = asignarPosZInsercion(state.pieces, result.pieces, moduleId, kind, {
    stackGap: state.userConfig?.stackGap ?? 20,
    drawerFrontGap: state.userConfig?.drawerFrontGap ?? 2.5,
    separacion: Number(opts.separacion) > 0 ? Number(opts.separacion) : 0,
    insetTapa: Number(opts.insetTapa) > 0 ? Number(opts.insetTapa) : 0,
    hangerRailHeight: state.userConfig?.hangerRailHeight ?? 1700,
    altoVano,
  });
  if (errorAncla) return { ok: false, errors: [errorAncla] };
  const basePieces = piecesMutadas || state.pieces;
  let allPieces = [...basePieces, ...result.pieces];
  allPieces = renombrarRepisas(allPieces, moduleId);
  store.set({ pieces: allPieces, dependencies: sugerirDependencias(allPieces) });
  recalculateAll();
  return { ok: true, warnings: validatePiecesQuiet(allPieces) };
}

// Cursor acumulativo de insercion por modulo: recorre las piezas ya ancladas
// (pos_z) del modulo y devuelve la Z libre mas alta. Las repisas aportan su
// espesor; los frentes su alto. Sin anclas, arranca sobre la cara superior
// de la base (zocalo + espesor + offset de montaje).

// Cara superior mas alta de las piezas ancladas del modulo (SIN gap de
// apilado): zocalo+base si no hay nada. Sirve para ubicar el contenido nuevo
// a una separacion personalizada de la pieza anterior ("a 300 mm de la
// repisa de abajo").
export function caraSuperiorPila(pieces, moduleId) {
  const zocalo = (pieces || []).find((p) => p.id === `m${moduleId}-zocalo`);
  const base = (pieces || []).find((p) => p.id === `m${moduleId}-base`);
  let top = (zocalo ? Number(zocalo.alto) || 0 : 0) + (Number(base?.espesor) || 15);
  for (const p of pieces || []) {
    if (!Number.isFinite(p.pos_z)) continue;
    const mod = String(p.modulo || '');
    const esDelModulo = mod === String(moduleId)
      || (/^\d+$/.test(String(moduleId)) && (mod.startsWith(String(moduleId)) || mod.startsWith(`${moduleId}.`)));
    if (!esDelModulo) continue;
    // Solo las piezas "portantes" de la pila: frentes y repisas/barras/zocalo
    // del modulo raiz. Las piezas de caja (laterales/fondo/cara/base/tirador)
    // siguen a su frente: no cuentan.
    if (/-(lateral|fondo|cara|base|tirador)-?$/.test(String(p.id)) && mod !== String(moduleId)) continue;
    const alto = /-frente$/.test(String(p.id)) ? (Number(p.alto) || 0) : (Number(p.espesor) || 15);
    top = Math.max(top, Number(p.pos_z) + alto);
  }
  return top;
}



// Resuelve el modulo RAIZ de una pieza: los frentes viven en submodulos
// ('11'), y split('.') no basta — '11'.split('.')[0] es '11', no '1'. Usa
// rootModuleIds para encontrar la raiz que contiene al submodulo.
function rootDePieza(pieces, pieza) {
  const mod = String(pieza?.modulo || '');
  const roots = [...rootModuleIds(pieces || [])];
  const directa = roots.find((r) => r === mod);
  if (directa) return directa;
  const prefijo = roots.find((r) => /^(\d+)$/.test(r) && mod.startsWith(r));
  return prefijo || mod;
}

// Renombra las repisas de un modulo segun su posicion en el apilado: la MAS
// ALTA es "Repisa superior M{n}" (convencion del catalogo); las demas se
// numeran de abajo hacia arriba. Define superior/inferior por posicion, no
// por orden de creacion. Devuelve las piezas renombradas (nueva referencia).
function renombrarRepisas(pieces, moduleId) {
  const prefijo = `m${moduleId}-repisa-`;
  const repisas = pieces
    .filter((p) => String(p.id).startsWith(prefijo) && Number.isFinite(p.pos_z))
    .sort((a, b) => a.pos_z - b.pos_z);
  if (!repisas.length) return pieces;
  const nombreSuperior = `Repisa superior M${moduleId}`;
  return pieces.map((p) => {
    const idx = repisas.findIndex((r) => r.id === p.id);
    if (idx === -1) return p;
    if (idx === repisas.length - 1) {
      return p.nombre === nombreSuperior ? p : { ...p, nombre: nombreSuperior };
    }
    const nombre = `Repisa ${idx + 1} M${moduleId}`;
    return p.nombre === nombre ? p : { ...p, nombre };
  });
}

// Reordena el contenido de un modulo en el apilado: intercambia el pos_z de
// la pieza (frente/repisa/barra) con su vecina inmediata arriba ('up') o
// abajo ('down'). El refuerzo sigue a su repisa. Define superior/inferior
// por posicion; tras el cambio renombra las repisas (la mas alta = superior).
export function moveContent(refId, direction) {
  const store = getStore();
  const state = store.get();
  const ref = String(refId);
  const pieza = state.pieces.find((p) => p.id === ref);
  if (!pieza) return { ok: false, errors: ['Pieza no encontrada'] };
  const modulo = rootDePieza(state.pieces, pieza);
  const pertenece = (p) => {
    const mod = String(p.modulo || '');
    return mod === modulo || (/^\d+$/.test(modulo) && (mod.startsWith(modulo) || mod.startsWith(`${modulo}.`)));
  };
  // Anclas apilables: frentes (cajon/zapatera), repisas y barras del modulo.
  const esAncla = (p) => Number.isFinite(p.pos_z) && pertenece(p) && (
    /-frente$/.test(p.id)
    // Prefijo exacto: el regex '-repisa-\d+$' tambien matchea los REFUERZOS
    // ('m1-refuerzo-repisa-1') y duplicaba cada repisa en la pila.
    || p.id.startsWith(`m${modulo}-repisa-`)
    || (p.id.startsWith(`m${modulo}-barra-`) && !p.id.includes('-barra-baja'))
  );
  const anclas = state.pieces.filter(esAncla).sort((a, b) => a.pos_z - b.pos_z);
  const idx = anclas.findIndex((p) => p.id === ref);
  const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= anclas.length) {
    return { ok: false, errors: ['No hay pieza con la que intercambiar'] };
  }
  snapshotUndo('Reordenar contenido');
  const a = anclas[idx];
  const b = anclas[swapIdx];
  // Re-apilado (no swap crudo de pos_z): el swap de valores crudos dejaba
  // SOLAPADAS piezas de distinta altura (repisa 15 mm vs frente 197 mm).
  // Se re-apilan las dos desde la posicion del que queda abajo, con la
  // altura y el gap propios de cada una.
  const stackGap = state.userConfig?.stackGap ?? 20;
  const drawerFrontGap = state.userConfig?.drawerFrontGap ?? 2.5;
  const altoDe = (p) => (/-frente$/.test(p.id) ? (Number(p.alto) || 0) : (Number(p.espesor) || 15));
  const tieneCara = (p) => state.pieces.some((q) => {
    const pref = String(p.id).slice(0, -'-frente'.length);
    return String(q.id).startsWith(pref) && q.id.endsWith('-cara');
  });
  const gapDe = (p) => {
    if (/-frente$/.test(p.id)) return tieneCara(p) ? drawerFrontGap : 0;
    return stackGap;
  };
  // Tras el swap, el que queda ABAJO arranca donde empezaba el mas bajo de
  // los dos; el de arriba se apila sobre el con su gap.
  const lower = direction === 'up' ? b : a;
  const upper = direction === 'up' ? a : b;
  const zBase = Math.min(a.pos_z, b.pos_z);
  const zLower = zBase;
  const zUpper = zLower + altoDe(lower) + gapDe(upper);
  const idsLower = new Set([lower.id, lower.id.replace('-repisa-', '-refuerzo-repisa-')]);
  const idsUpper = new Set([upper.id, upper.id.replace('-repisa-', '-refuerzo-repisa-')]);
  let pieces = state.pieces.map((p) => {
    if (idsLower.has(p.id)) return { ...p, pos_z: Math.round(zLower * 10) / 10 };
    if (idsUpper.has(p.id)) return { ...p, pos_z: Math.round(zUpper * 10) / 10 };
    return p;
  });
  pieces = renombrarRepisas(pieces, modulo);
  store.set({ pieces });
  recalculateAll();
  return { ok: true };
}

// Fija la altura (pos_z) de una pieza de contenido del Constructor. refId es
// el id de referencia del chip (frente, repisa, barra o zocalo). El cambio
// aplica al GRUPO: el frente arrastra su caja (la geometria de cajon posiciona
// laterales/fondo/cara/base respecto al frente) y la repisa arrastra su
// refuerzo. Valida que quepa dentro del modulo.
export function updateContentPosZ(refId, posZ) {
  const store = getStore();
  const state = store.get();
  const ref = String(refId);
  const objetivo = Number(posZ);
  if (!Number.isFinite(objetivo) || objetivo < 0) {
    return { ok: false, errors: ['La altura debe ser un numero >= 0 mm'] };
  }
  const pieza = state.pieces.find((p) => p.id === ref);
  if (!pieza) return { ok: false, errors: ['Pieza no encontrada'] };
  const modulo = rootDePieza(state.pieces, pieza);
  const altoModulo = Number(state.pieces.find((p) => p.id === `m${modulo}-lateral-izq`)?.alto) || null;
  if (altoModulo != null && objetivo + (Number(pieza.alto) || 15) > altoModulo) {
    return { ok: false, errors: [`Altura ${objetivo} mm fuera del modulo (${altoModulo} mm util)`] };
  }
  snapshotUndo('Cambiar altura');
  const esFrente = ref.endsWith('-frente');
  const esRepisa = /-repisa-\d+$/.test(ref);
  const pieces = state.pieces.map((p) => {
    if (p.id === ref) return { ...p, pos_z: objetivo };
    if (esRepisa && p.id === ref.replace('-repisa-', '-refuerzo-repisa-')) return { ...p, pos_z: objetivo };
    return p;
  });
  void esFrente; // la caja sigue al frente por geometria de cajon: nada mas que tocar
  store.set({ pieces });
  recalculateAll();
  return { ok: true };
}

function cursorInsercion(pieces, moduleId, stackGap, drawerFrontGap) {
  const zocalo = pieces.find((p) => p.id === `m${moduleId}-zocalo`);
  // Zócalo estructural a marco (global): ancla el apilado igual que el
  // frente simple de módulo cuando este no existe.
  const marcoZ = Math.max(0, ...(pieces || [])
    .filter((p) => /^glb-zocalo(-s\d+)?-frente(-[ab])?$/.test(String(p.id)))
    .map((p) => Number(p.alto) || 0));
  const base = pieces.find((p) => p.id === `m${moduleId}-base`);
  const baseTop = (zocalo ? Number(zocalo.alto) || 0 : marcoZ) + (Number(base?.espesor) || 15);
  let cursor = baseTop + 10; // drawerBaseOffset
  for (const p of pieces || []) {
    if (!Number.isFinite(p.pos_z)) continue;
    const mod = String(p.modulo || '');
    const esDelModulo = mod === String(moduleId)
      || (/^\d+$/.test(String(moduleId)) && (mod.startsWith(String(moduleId)) || mod.startsWith(`${moduleId}.`)));
    if (!esDelModulo) continue;
    // El avance replica EXACTAMENTE como se apiló en su momento (asignarPosZ
    // Insercion): frentes con gap de frente (o sin gap si eran frente
    // completo: se detecta porque su caja no tiene cara), resto con stackGap.
    if (/-frente$/.test(String(p.id))) {
      const sinGap = !(pieces || []).some((q) => {
        const pref = String(p.id).slice(0, -'-frente'.length);
        return String(q.id).startsWith(pref) && q.id.endsWith('-cara');
      });
      cursor = Math.max(cursor, Number(p.pos_z) + (Number(p.alto) || 0) + (sinGap ? 0 : drawerFrontGap));
    } else if (/-cara$/.test(String(p.id))) {
      // Cara ancla de cajón/zapatera SIN frente (bandeja abierta): la unidad
      // reserva su vano completo, no solo el espesor de la pieza; si no, lo
      // que se agregue después quedaría pisando la zona de la bandeja. El
      // vano sale del contrato [tipo] de la cara cuando existe (el cara-borde
      // de los modos 'borde'/'personalizado NO refleja el vano: mide el borde
      // frontal, no vano − 2E − 3); sin tag cae al histórico cara + cajaDelta
      // + luz (33). Con frente propio la cara no es ancla (no lleva pos_z) y
      // esta rama es solo defensiva.
      const pref = String(p.id).slice(0, -'-cara'.length);
      const conFrente = (pieces || []).some((q) => String(q.id) === `${pref}-frente`);
      const tag = tipoTagDe(`${p.nombre || ''}`);
      const tipoUnidad = tag ? getContentType('shoeRack', tag) : null;
      const avance = conFrente
        ? (Number(p.espesor) || 15) + stackGap
        : (tipoUnidad?.altoVano ?? vanoDesdeCara(p)) + drawerFrontGap;
      cursor = Math.max(cursor, Number(p.pos_z) + avance);
    } else {
      cursor = Math.max(cursor, Number(p.pos_z) + (Number(p.espesor) || 15) + stackGap);
    }
  }
  return cursor;
}

// Asigna pos_z a las piezas recien agregadas segun el cursor del modulo.
function asignarPosZInsercion(piecesActuales, piezasNuevas, moduleId, kind, { stackGap, drawerFrontGap, separacion = 0, insetTapa = 0, hangerRailHeight = 1700, altoVano = 0 }) {
  // Geometria vertical del modulo: cara inferior de la tapa (techo del vano
  // util) y cara superior de la base (piso).
  const altoModulo = Number(piecesActuales.find((p) => p.id === `m${moduleId}-lateral-izq`)?.alto) || 0;
  const zocalo = piecesActuales.find((p) => p.id === `m${moduleId}-zocalo`);
  const tapa = piecesActuales.find((p) => p.id === `m${moduleId}-tapa`);
  const techo = altoModulo - (zocalo ? Number(zocalo.alto) || 0 : 0) - (Number(tapa?.espesor) || 15);
  let cursor;
  let error = null;
  if (kind === 'rail') {
    // Barra colgadora simple: altura ergonomica fija (como el catalogo:
    // camisera a 1800 del preset), NO apilada. Ajustable luego con el ✎ del
    // chip. Clamp: nunca a menos de 60 mm bajo la tapa.
    cursor = Math.min(hangerRailHeight, Math.max(0, techo - 60));
  } else if (insetTapa > 0) {
    // Inset desde la cara inferior de la tapa (topInset del catalogo:
    // alzamiento/maletero). Gana sobre la separacion si ambos estan.
    const ancla = piezasNuevas.find((p) => p.id.endsWith('-frente'))
      || piezasNuevas.find((p) => /-repisa-\d+$/.test(p.id))
      || piezasNuevas[0];
    const altoPieza = ancla
      ? (ancla.id.endsWith('-frente') ? (Number(ancla.alto) || 0) : (Number(ancla.espesor) || 15))
      : 15;
    cursor = techo - insetTapa - altoPieza;
    const pisoReal = caraSuperiorPila(piecesActuales, moduleId); // tope de la pila existente
    if (cursor < pisoReal) {
      error = `Inset ${insetTapa} mm desde la tapa no cabe: quedaria bajo la pila (vano util ${Math.round(techo)} mm)`;
      cursor = pisoReal;
    }
  } else if (separacion > 0) {
    // Separacion personalizada desde la pieza anterior ("a N mm de la de
    // abajo"): arranca la pila desde la cara superior SIN el gap por defecto.
    cursor = caraSuperiorPila(piecesActuales, moduleId) + separacion;
  } else {
    cursor = cursorInsercion(piecesActuales, moduleId, stackGap, drawerFrontGap);
  }
  const fijar = (pieza, avance) => {
    if (!pieza) return;
    pieza.pos_z = Math.round(cursor * 10) / 10;
    cursor += avance;
  };
  if (kind === 'divider') {
    // Span completo: anclado al PISO del vano (zocalo + base), no al tope de
    // la pila. No participa del cursor de apilado.
    const divisor = piezasNuevas[0];
    if (divisor) {
      const z = piecesActuales.find((p) => p.id === `m${moduleId}-zocalo`);
      const b = piecesActuales.find((p) => p.id === `m${moduleId}-base`);
      divisor.pos_z = (z ? Number(z.alto) || 0 : 0) + (Number(b?.espesor) || 15);
    }
  } else if (kind === 'shelf') {
    const repisa = piezasNuevas.find((p) => /-repisa-\d+$/.test(p.id));
    const refuerzo = piezasNuevas.find((p) => /-refuerzo-repisa-\d+$/.test(p.id));
    fijar(repisa, (Number(repisa?.espesor) || 15) + stackGap);
    if (refuerzo) refuerzo.pos_z = repisa?.pos_z ?? refuerzo.pos_z;
  } else if (kind === 'rail') {
    fijar(piezasNuevas[0], 25 + stackGap);
  } else if (kind === 'drawer' || kind === 'shoeRack') {
    // Frente decorativo, o la cara del cuerpo cuando la zapatera va sin
    // frente (bandeja abierta: la cara queda anclada y hace de frente visible).
    const frente = piezasNuevas.find((p) => p.id.endsWith('-frente'))
      || piezasNuevas.find((p) => p.id.endsWith('-cara'));
    // Frente completo (zapatera botas): cubre todo el vano y va sin gaps —
    // apilado flush, sin drawerFrontGap. Frente bajo: apila con gap.
    const sinGap = kind === 'shoeRack' && !piezasNuevas.some((p) => p.id.endsWith('-cara'));
    // La unidad reserva SU vano completo (altoVano del tipo), no solo el
    // alto de la pieza ancla: la bandeja abierta sin frente tiene la cara
    // mas baja que el vano (cara = vano − 2·ESP_BASE − 3) y si el cursor
    // avanzara solo eso, la siguiente pieza quedaría pisando la zona de
    // la bandeja. Con frente se conserva el avance histórico (frente.alto).
    const ocupa = frente && frente.id.endsWith('-frente')
      ? (Number(frente.alto) || 0)
      : (altoVano || (Number(frente?.alto) || 0));
    fijar(frente, ocupa + (sinGap ? 0 : drawerFrontGap));
  }
  // doubleRail trae pos_z absolutos ergonomicos (2100/1000); zocalo no ancla.
  return error;
}

// Duplica un modulo (casco + contenido + submodulos) con id nuevo.
export function duplicateModule(moduleId) {
  snapshotUndo("Duplicar modulo");
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

// Recolorea el casco de un modulo (base/tapa/laterales/zocalo). También
// recolorea las tiras gola del módulo: usan el mismo `modulo` e id
// `m{mod}-gola-{i}` (mismo material/color que el módulo).
export function recolorModule(moduleId, color) {
  snapshotUndo("Recolorear modulo");
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
  const prefijoGola = `m${moduleId}-gola-`;
  const pieces = state.pieces.map((p) => {
    const id = String(p.id);
    if (cascoIds.has(id)) return { ...p, color: String(color) };
    if (id.startsWith(prefijoGola)) return { ...p, color: String(color) };
    return p;
  });
  store.set({ pieces });
  recalculateAll();
  return { ok: true };
}

// ── Sistema gola (golaService) ────────────────────────────────────

// Metadatos de round-trip por módulo (alturas/pos_z originales de frentes),
// persistidos por el orquestador: el servicio es puro y no toca storage.
const GOLA_META_KEY = 'cn-assembly-gola';

function loadGolaMetas() {
  try {
    const raw = localStorage.getItem(GOLA_META_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveGolaMetas(metas) {
  try {
    localStorage.setItem(GOLA_META_KEY, JSON.stringify(metas));
  } catch {
    // Falla silenciosa en entornos sin localStorage.
  }
}

// Config gola por módulo: overrides parciales (moduleId → cfg parcial) sobre
// la userConfig global, persistidos por el orquestador (el servicio es puro).
const GOLA_MODULE_CFG_KEY = 'cn-assembly-gola-cfg';

export function loadGolaModuleCfgs() {
  try {
    const raw = localStorage.getItem(GOLA_MODULE_CFG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveGolaModuleCfgs(map) {
  try {
    localStorage.setItem(GOLA_MODULE_CFG_KEY, JSON.stringify(map));
  } catch {
    // Falla silenciosa en entornos sin localStorage.
  }
}

// Config gola efectiva de un módulo: GOLA_DEFAULTS ← userConfig global ←
// overrides del módulo (cn-assembly-gola-cfg). Sin overrides del módulo es
// idéntica a la config global.
export function getGolaCfgForModule(modId) {
  const state = getStore().get();
  return getGolaCfg(state.userConfig || {}, loadGolaModuleCfgs()[String(modId)] || {});
}

// Re-aplica el gola de un módulo sobre un array de piezas (puro respecto al
// store): si ya había tiras, restaura primero los frentes originales con el
// meta persistido para no acumular reescalados, y vuelve a aplicar con los
// cfg actuales. Recibe la config YA mergeada (getGolaCfgForModule): el caller
// decide la capa (global vs. overrides del módulo). NO hace snapshot ni toca
// el store: el caller decide cuándo persistir (enableGola hace SU snapshot;
// editModuleDimensions forma la re-aplicación parte de SU propia acción de
// undo única).
// Devuelve { ok, pieces?, meta?, errors?, warnings? }.
function reapplyGolaPieces(modId, basePieces, cfg) {
  let pieces = basePieces;
  if (isGolaEnabled(pieces, modId)) {
    const metas = loadGolaMetas();
    const restored = removeGola(pieces, modId, cfg, metas[modId]);
    if (restored.ok) pieces = restored.pieces;
  }
  const result = applyGola(pieces, modId, cfg);
  if (!result.ok) return { ok: false, errors: result.errors, warnings: result.warnings };
  return { ok: true, pieces: result.pieces, meta: result.meta, warnings: result.warnings || [] };
}

// Vista previa (dry-run) del sistema gola: replica sobre memoria lo que
// haría enableGola (mismo reapplyGolaPieces) SIN snapshotUndo ni store.set,
// y devuelve además el plan para la UI de confirmación:
//   { unidades, tiras, frentes: [{nombre, antes, despues}], agarre, gapGola }
// { ok:false, errors } si la activación fallaría (mismo criterio que enableGola).
export function previewGola(moduleId) {
  const store = getStore();
  const state = store.get();
  const modId = String(moduleId);
  const cfg = getGolaCfgForModule(modId);

  const dry = reapplyGolaPieces(modId, state.pieces, cfg);
  if (!dry.ok) return { ok: false, errors: dry.errors, warnings: dry.warnings };

  const alturasActuales = new Map(
    (state.pieces || []).map((p) => [String(p.id), Number(p.alto) || 0]),
  );
  const unidades = drawerUnits(dry.pieces, modId);
  const frentes = unidades.map((u) => {
    const ref = u.frentes[0];
    const despues = Math.max(...u.frentes.map((f) => Number(f.alto) || 0));
    const antes = alturasActuales.has(String(ref.id))
      ? alturasActuales.get(String(ref.id))
      : despues;
    return { nombre: ref.nombre, antes, despues };
  });
  const plan = {
    unidades: unidades.length,
    tiras: Math.max(0, unidades.length - 1),
    frentes,
    agarre: cfg.golaFingerClearance,
    gapGola: cfg.golaPaso + cfg.golaPerfilHeight + cfg.golaPaso,
    cuerpoPerfil: cfg.golaPerfilHeight,
  };
  return { ok: true, warnings: dry.warnings || [], plan };
}

// Activa (o re-aplica con los cfg actuales) el sistema gola de un módulo.
// Devuelve { ok, warnings?, errors? }.
export function enableGola(moduleId) {
  const store = getStore();
  const state = store.get();
  const modId = String(moduleId);

  const reapplied = reapplyGolaPieces(modId, state.pieces, getGolaCfgForModule(modId));
  if (!reapplied.ok) return { ok: false, errors: reapplied.errors, warnings: reapplied.warnings };

  snapshotUndo('Activar gola');
  store.set({ pieces: reapplied.pieces, dependencies: sugerirDependencias(reapplied.pieces) });
  const metas = loadGolaMetas();
  metas[modId] = reapplied.meta;
  saveGolaMetas(metas);
  recalculateAll();
  return { ok: true, warnings: [...(reapplied.warnings || []), ...validatePiecesQuiet(reapplied.pieces)] };
}

// Desactiva el sistema gola del módulo: quita las tiras, restaura frentes
// (con el meta persistido; fallback proporcional si no hay) y regenera los
// tiradores. Limpia el meta del módulo.
export function disableGola(moduleId) {
  const store = getStore();
  const state = store.get();
  const modId = String(moduleId);
  if (!isGolaEnabled(state.pieces, modId)) return { ok: true, warnings: [] };

  const metas = loadGolaMetas();
  const cfg = getGolaCfgForModule(modId);
  snapshotUndo('Desactivar gola');
  const result = removeGola(state.pieces, modId, cfg, metas[modId]);
  if (!result.ok) return { ok: false, errors: result.errors };

  delete metas[modId];
  saveGolaMetas(metas);
  store.set({ pieces: result.pieces, dependencies: sugerirDependencias(result.pieces) });
  recalculateAll();
  return { ok: true, warnings: validatePiecesQuiet(result.pieces) };
}

/**
 * Mergea overrides de config gola del módulo en el mapa persistido
 * (cn-assembly-gola-cfg; no pisa claves no incluidas) y, si el módulo tiene
 * el gola activo, re-aplica con la config efectiva (delega en enableGola,
 * que hace su propio snapshot de undo). Si no está activo solo persiste: la
 * config se aplicará la próxima vez que se active. Devuelve el resultado de
 * la re-aplicación ({ok, warnings?, errors?}) o { ok: true } si no hay
 * re-aplicación.
 */
export function setGolaModuleConfig(moduleId, overrides = {}) {
  const modId = String(moduleId);
  const map = loadGolaModuleCfgs();
  map[modId] = { ...(map[modId] || {}), ...overrides };
  saveGolaModuleCfgs(map);
  if (isGolaEnabled(getStore().get().pieces, modId)) {
    return enableGola(modId);
  }
  return { ok: true };
}

// Limpia todo el mueble (nuevo mueble). La vista pide doble confirmacion.
// Elimina un contenido individual de un modulo. ref = el indice de la pieza
// (p. ej. 'm1cajon2-frente' para un cajon, 'm1-repisa-1' para una repisa,
// 'm1-barra-alta-1' para una barra). Quita TODAS las piezas del grupo
// (caja completa, refuerzo incluido).
export function removeContentPiece(refId) {
  snapshotUndo("Eliminar contenido");
  const store = getStore();
  const state = store.get();
  const ref = String(refId);
  // Prefijo del grupo: sin el sufijo final ('-frente', '-lateral-izq'...).
  // Para ids tipo 'm1cajon2-frente' el grupo es 'm1cajon2-'; para
  // 'm1-repisa-1' es 'm1-repisa-1' (pieza unica, mas su refuerzo).
  let groupPrefix = ref.slice(0, ref.lastIndexOf('-') + 1);
  if (groupPrefix === 'm') groupPrefix = ref; // seguridad: sin guiones
  // El zócalo simple (`m{N}-zocalo`) es pieza única: su prefijo `m{N}-`
  // arrastraría todo el casco (fondo/base terminan en esos sufijos).
  if (/^m\d+-zocalo$/.test(ref)) groupPrefix = ref;
  const esRepisa = /-repisa-\d+$/.test(ref);
  const esZocaloSimple = /^m\d+-zocalo$/.test(ref);
  const zocaloMod = esZocaloSimple ? ref.match(/^m(\d+)-zocalo$/)[1] : null;
  let pieces = state.pieces.filter((p) => {
    const id = String(p.id);
    if (id === ref) return false;
    if (id.startsWith(groupPrefix) && /-(frente|lateral(-izq|-der)?|fondo|cara|division|base|tirador)$/.test(id)) return false;
    // La repisa arranca su refuerzo asociado.
    if (esRepisa && id === ref.replace('-repisa-', '-refuerzo-repisa-')) return false;
    return true;
  });
  // Sin zócalo simple el fondo vuelve a su alto completo (alto − 2e).
  if (zocaloMod) {
    const lateral = pieces.find((p) => p.id === `m${zocaloMod}-lateral-izq`);
    const altoMod = Number(lateral?.alto) || 0;
    if (altoMod) {
      const e = Number(pieces.find((p) => p.id === `m${zocaloMod}-fondo`)?.espesor) || 15;
      pieces = pieces.map((p) => (
        p.id === `m${zocaloMod}-fondo` ? { ...p, alto: Math.max(100, altoMod - 2 * e) } : p
      ));
    }
  }
  store.set({ pieces, dependencies: sugerirDependencias(pieces) });
  recalculateAll();
  return { ok: true };
}

// Reordena un modulo: 'izq' intercambia su posicion con el modulo raiz
// numerico anterior, 'der' con el siguiente. Renumerar ids es invasivo
// (cambia ids/submodulos de piezas y dependencias), asi que se implementa
// como intercambio de numeros de modulo entre los dos afectados.
export function moveModule(moduleId, direction) {
  snapshotUndo("Reordenar modulo");
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
  // Los metas gola (round-trip de frentes/cajas) viajan con su módulo: sin
  // esto el meta quedaba bajo la clave del vecino y el round-trip se perdía.
  // Las claves internas (ids de piezas) se renombran con el mismo prefijo.
  const golaMetas = loadGolaMetas();
  if (
    Object.prototype.hasOwnProperty.call(golaMetas, a)
    || Object.prototype.hasOwnProperty.call(golaMetas, b)
  ) {
    const metaA = golaMetas[a] ? renombrarClavesMetaGola(golaMetas[a], a, b) : undefined;
    const metaB = golaMetas[b] ? renombrarClavesMetaGola(golaMetas[b], b, a) : undefined;
    if (metaB) golaMetas[a] = metaB; else delete golaMetas[a];
    if (metaA) golaMetas[b] = metaA; else delete golaMetas[b];
    saveGolaMetas(golaMetas);
  }
  store.set({ pieces, dependencies: sugerirDependencias(pieces) });
  recalculateAll();
  return { ok: true, moduleId: b };
}

// Renombra las claves de ids de un meta gola (origHeights/origTops) cuando su
// módulo cambia de número (moveModule): los frentes se restauran por id.
function renombrarClavesMetaGola(meta, oldId, newId) {
  if (!meta || typeof meta !== 'object') return meta;
  const oldPref = `m${oldId}`;
  const re = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const key = String(k);
      out[key.startsWith(oldPref) ? `m${newId}` + key.slice(oldPref.length) : key] = v;
    }
    return out;
  };
  return { ...meta, moduleId: String(newId), origHeights: re(meta.origHeights), origTops: re(meta.origTops) };
}

// Renombra el prefijo de modulo de todas las piezas de un modulo raiz:
// ids 'm{old}...' → 'm{new}...' y modulos raiz/submodulo acordes.
function renameModulePrefix(pieces, oldId, newId) {
  const oldPref = `m${oldId}`;
  const newPref = `m${newId}`;
  // El prefijo numérico es ambiguo con las raíces ('81' puede ser el módulo
  // 81 o el submódulo 1 del 8): al renombrar una raíz, todo lo que empieza
  // con su número viaja con ella. Vale también para el prefijo temporal
  // 'x{n}' del intercambio (moveModule): sus submódulos 'x{n}{k}' deben
  // seguirlo; sin esto quedaban huérfanos como módulos 'x81', 'x82'...
  const pertenece = (mod) => {
    const m = String(mod || '');
    return m === String(oldId) || m.startsWith(String(oldId));
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

// Edita las dimensiones del casco de un modulo existente Y reajusta el
// contenido interior al nuevo vano:
//  - Repisas/refuerzos/barras/zocalo: nuevo ancho util (ancho - 2E).
//  - Cajones/zapateras: se REGENERAN con addDrawer() usando el nuevo ancho/
//    profundidad del modulo, conservando su alto de vano, colores y tipo
//    (los ids se mantienen: mismo modulo + mismo indice).
// Si algun cajon no cabe en el nuevo ancho, la operacion aborta sin cambios.
// Genera (o regenera) el zócalo estructural a marco: N sub-zócalos cajón
// de 4 lados alineados a las juntas entre módulos, con divisores internos
// cuando un tramo supera 800 mm. Reemplaza las piezas `glb-zocalo-s*`
// previas. opts: { altoZocalo, retraso, maxSpan?, splitLight?, skipUndo? }.
// El retraso del frente persiste en userConfig.plinthFrontRecess (lo lee el
// renderer).
export function applyStructuralPlinth(opts = {}) {
  const store = getStore();
  const state = store.get();
  const dims = rootModuleDims(state.pieces);
  if (!dims.length) return { ok: false, errors: ['Agregue al menos un módulo con casco (tapa/base)'] };
  const altoZocalo = Number(opts.altoZocalo) || 100;
  const retraso = Math.max(0, Number(opts.retraso) || 0);
  const profundidad = Math.max(...dims.map((d) => d.profundidad || 0));
  if (!profundidad) return { ok: false, errors: ['No se pudo determinar la profundidad del mueble (falta el lateral)'] };
  const espesor = dims[0].espesor || 15;
  // C2: el frente retrasado no puede quedar detrás del trasero del marco.
  if (retraso > profundidad - 2 * espesor) {
    return { ok: false, errors: [`Retraso de ${retraso} mm inválido: el frente quedaría detrás del trasero del marco (máximo ${profundidad - 2 * espesor} mm para ${profundidad} mm de profundidad)`] };
  }
  // Forma definida del zócalo: el servicio deriva las piezas de corte; aquí
  // no hay restas de espesor — solo la forma (anchos de módulo, profundidad,
  // alto Z) y la cantidad de zócalos.
  const cfg0 = state.userConfig || {};
  const built = buildPlinthFrame({
    moduleWidths: dims.map((d) => d.ancho),
    profundidad,
    altoZocalo,
    espesor,
    drawerModules: modulosConCajones(state.pieces),
    nZocalos: Number(opts.nZocalos ?? cfg0.plinthNZocalo) || 1,
  });
  if (!built.ok) return { ok: false, errors: built.errors };
  if (!opts.skipUndo) snapshotUndo('Zocalo estructural a marco');
  // El marco reemplaza al frente simple de cada módulo (el apilado se
  // ancla al marco vía cursorInsercion).
  const pieces = [
    ...state.pieces.filter((p) => !MARCO_PIECE_RE.test(String(p.id)) && !/^m\d+-zocalo$/.test(String(p.id))),
    ...built.pieces,
  ];
  // Altura del mueble fija: los fondos de los módulos se reajustan al Z del
  // marco (los cascos pueden haberse generado con otro alto de zócalo), y
  // las bases externas se convierten a internas (apoyadas sobre el marco).
  const altoLateral = new Map();
  const anchoTapa = new Map();
  const profLateral = new Map();
  pieces.forEach((p) => {
    const ml = String(p.id).match(/^m(\d+)-lateral-izq$/);
    if (ml) { altoLateral.set(ml[1], Number(p.alto) || 0); profLateral.set(ml[1], Number(p.ancho) || 0); }
    const mt = String(p.id).match(/^m(\d+)-tapa$/);
    if (mt) anchoTapa.set(mt[1], Number(p.ancho) || 0);
  });
  const piecesFinales = pieces.map((p) => {
    const mm = String(p.id).match(/^m(\d+)-(fondo|base)$/);
    if (!mm) return p;
    const altoMod = altoLateral.get(mm[1]);
    if (!altoMod) return p;
    const e = Number(p.espesor) || 15;
    if (mm[2] === 'fondo') {
      return { ...p, alto: Math.max(100, altoMod - altoZocalo - 2 * e) };
    }
    // Base externa (ancho ≈ tapa): pasa a interna, apoyada sobre el marco.
    const tapaW = anchoTapa.get(mm[1]) || 0;
    const prof = profLateral.get(mm[1]) || 0;
    if (tapaW && Number(p.ancho) >= tapaW - 2 && prof) {
      return { ...p, ancho: tapaW - 2 * e, alto: prof - e };
    }
    return p;
  });
  saveUserConfig({ plinthFrontRecess: retraso });
  store.set({ pieces: piecesFinales, dependencies: sugerirDependencias(piecesFinales) });
  getStore().set({ userConfig: loadUserConfig() });
  recalculateAll();
  return {
    ok: true,
    ancho: built.spec.ancho,
    nZocalos: built.spec.nZocalos,
    luzMax: built.spec.luzMax,
    pieceCount: built.pieces.length,
    levelers: plinthLevelerCount(built.pieces),
    warnings: built.warnings,
  };
}

export function removeStructuralPlinth() {
  const store = getStore();
  const state = store.get();
  const remaining = state.pieces.filter((p) => !MARCO_PIECE_RE.test(String(p.id)));
  if (remaining.length === state.pieces.length) return { ok: false, errors: ['No hay zócalo estructural'] };
  snapshotUndo('Quitar zócalo estructural');
  // Restaurar el frente simple en los módulos que se quedaron sin él
  // (se eliminaron al generar el marco). Mismo alto Z configurado.
  const cfg = state.userConfig || {};
  const altoZocalo = Number(cfg.plinthAltoZocalo) || 100;
  const restauradas = [];
  for (const d of rootModuleDims(remaining)) {
    if (remaining.some((p) => p.id === `m${d.id}-zocalo`)) continue;
    const tapa = remaining.find((p) => p.id === `m${d.id}-tapa`);
    const z = addZocalo(d.id, {
      ancho: d.ancho,
      alto: altoZocalo,
      espesor: Number(tapa?.espesor) || d.espesor || 15,
      color: tapa?.color || '#C19A6B',
    });
    if (z.ok) restauradas.push(...z.pieces);
  }
  const pieces = [...remaining, ...restauradas];
  // Restaurar también el fondo a su alto completo (sin descuento de zócalo).
  const altoLateral = new Map();
  pieces.forEach((p) => {
    const ml = String(p.id).match(/^m(\d+)-lateral-izq$/);
    if (ml) altoLateral.set(ml[1], Number(p.alto) || 0);
  });
  const piecesFinales = pieces.map((p) => {
    const mf = String(p.id).match(/^m(\d+)-fondo$/);
    if (!mf) return p;
    const altoMod = altoLateral.get(mf[1]);
    if (!altoMod) return p;
    const e = Number(p.espesor) || 15;
    // El frente simple restaurado vuelve a ocupar la zona del zócalo
    // (mismo Z): el fondo mantiene el descuento y sigue apoyado en la base.
    return { ...p, alto: Math.max(100, altoMod - altoZocalo - 2 * e) };
  });
  store.set({ pieces: piecesFinales, dependencies: sugerirDependencias(piecesFinales) });
  recalculateAll();
  return { ok: true, restored: restauradas.length };
}

export function editModuleDimensions(moduleId, { ancho, alto, prof }) {
  snapshotUndo("Editar dimensiones");
  const store = getStore();
  const state = store.get();
  const dims = { ancho: Number(ancho), alto: Number(alto), prof: Number(prof) };
  if (!(dims.ancho >= 100 && dims.alto >= 100 && dims.prof >= 100)) {
    return { ok: false, errors: ['Las dimensiones deben ser >= 100 mm'] };
  }
  const tapa = state.pieces.find((p) => p.id === `m${moduleId}-tapa`);
  if (!tapa) return { ok: false, errors: [`El modulo ${moduleId} no tiene casco`] };
  const espesor = Number(tapa.espesor) || 15;
  const anchoUtil = dims.ancho - 2 * espesor;
  const profUtil = dims.prof - 2 * espesor;
  if (anchoUtil < 50 || profUtil < 50) {
    return { ok: false, errors: [`Vano interior demasiado pequeño (${anchoUtil}×${profUtil} mm) para ${dims.ancho}×${dims.prof} con espesor ${espesor}`] };
  }
  const baseEsInterna = state.pieces.some((p) => p.id === `m${moduleId}-zocalo`)
    && state.pieces.find((p) => p.id === `m${moduleId}-base`)?.ancho < tapa.ancho;

  // 1. Detectar los grupos de cajon/zapatera del modulo por ROL + submodulo
  //    (agnostico a la convencion de ids: el builder genera 'm1cajon1-frente'
  //    y el catalogo 'm21-cajon-frente'). Un grupo = las piezas de un
  //    submodulo del modulo que contienen un frente (rol drawer_face). Las
  //    piezas regeneradas se RENOMBRAN a los ids viejos (mismo sufijo) para
  //    conservar la convencion y las dependencias por id.
  const SUFIJOS = ['lateral-izq', 'lateral-der', 'frente', 'fondo', 'cara', 'division', 'base', 'tirador'];
  const sufijoDe = (id) => SUFIJOS.find((s) => String(id).endsWith(`-${s}`));
  const esSubmoduloDe = (mod) => {
    const m = String(mod || '');
    return m !== String(moduleId) && /^\d+$/.test(String(moduleId))
      && (m.startsWith(String(moduleId)) || m.startsWith(`${moduleId}.`));
  };
  const porSubmodulo = new Map();
  for (const p of state.pieces) {
    if (!esSubmoduloDe(p.modulo)) continue;
    if (!porSubmodulo.has(String(p.modulo))) porSubmodulo.set(String(p.modulo), []);
    porSubmodulo.get(String(p.modulo)).push(p);
  }

  const grupos = [];
  for (const piezasGrupo of porSubmodulo.values()) {
    const frente = piezasGrupo.find((p) => inferRole(p) === 'drawer_face');
    // Zapatera sin frente (bandeja abierta): la cara del cuerpo la identifica
    // (el frente decorativo es opcional y puede no existir).
    const cara = !frente
      ? piezasGrupo.find((p) => sufijoDe(p.id) === 'cara' && /zapatera/i.test(`${p.nombre} ${p.id}`))
      : null;
    if (!frente && !cara) continue; // submodulo sin frente ni cara: no es una caja de cajon
    const textoFrente = `${(frente || cara).nombre} ${(frente || cara).id}`.toLowerCase();
    const esZapatera = textoFrente.includes('zapatera');
    const esVolquete = !esZapatera && (!piezasGrupo.some((p) => sufijoDe(p.id) === 'cara')
      || textoFrente.includes('abatible'));
    const lateral = piezasGrupo.find((p) => sufijoDe(p.id) === 'lateral-izq');
    // Contrato por tag (sobrevive al CSV): con tag la inferencia es exacta;
    // sin tag (catálogo/diseños previos) cae a la heurística histórica.
    const tipoTag = tipoTagDe(`${(frente || cara)?.nombre || ''}`);
    const tipoUnidad = tipoTag ? getContentType('shoeRack', tipoTag) : null;
    // Modo 'borde' detectable por datos: bandeja sin frente cuya cara es MÁS
    // BAJA que el lateral (en 'abierta' la cara alta siempre supera al
    // lateral bajo; en la bandeja a la vista van iguales). Best-effort: las
    // alturas personalizadas de fondo/división no se recuperan (se re-derivan
    // del lateral), igual que el vano sin tag.
    const modoBorde = esZapatera && !frente && !!cara && !!lateral
      && Number(cara.alto) < Number(lateral.alto);
    const regenerado = esZapatera
      ? addShoeTray(moduleId, 1, {
        anchoModulo: dims.ancho,
        profundidadModulo: dims.prof,
        espesorModulo: espesor,
        // frente.alto = vano − 3; sin frente, la cara = vano − 3 − 2·15. Con
        // tag, el vano del tipo es exacto (la bandeja a la vista satura el
        // rim y la cara no lo refleja).
        altoVano: frente ? (Number(frente.alto) || 200) + 3 : (tipoUnidad?.altoVano ?? vanoDesdeCara(cara)),
        frenteCompleto: !piezasGrupo.some((p) => sufijoDe(p.id) === 'cara'),
        // Se preserva la opción: solo hay frente viejo si la bandeja lo llevaba.
        conFrente: !!frente,
        modoFrente: modoBorde ? 'borde' : null,
        bordeFrontal: modoBorde ? Number(cara.alto) : undefined,
        // Bandeja a la vista (ladosIguales): con tag, del contrato; sin tag,
        // la cara al mismo alto que el lateral.
        ladosIguales: esZapatera && !frente && !!cara && !!lateral
          && (tipoUnidad ? !!tipoUnidad.ladosIguales
            : Number(cara.alto) === Number(lateral.alto)),
        tipoId: tipoUnidad ? tipoUnidad.id : null,
        altoLateral: Math.max(40, Number(lateral?.alto) || RAIL_SIDE_HEIGHT),
        colorFrente: (frente || cara).color || '#8B5A2B',
        colorLateral: lateral?.color || '#D9C2A3',
        division: piezasGrupo.some((p) => sufijoDe(p.id) === 'division'),
        // El riel se preserva: se infiere del nombre del frente viejo (la cara
        // no lleva el tag del riel; sin frente cae al catálogo).
        riel: frente ? inferRailType(frente) : 'catalogo',
      })
      : addDrawer(moduleId, 1, {
        anchoModulo: dims.ancho,
        profundidadModulo: dims.prof,
        espesorModulo: espesor,
        altoVano: (Number(frente.alto) || 200) + 3, // frente.alto = vano - 3
        tipo: esVolquete ? 'volquete' : 'corredera',
        vocabulario: 'cajon',
        colorFrente: frente.color || '#8B5A2B',
        colorLateral: lateral?.color || '#D9C2A3',
        riel: esVolquete ? 'catalogo' : inferRailType(frente),
        // El contrato [tipo] del frente preserva el método del fondo (y se
        // reestampa en el frente regenerado). Sin tag, detección por datos:
        // el fondo ranurado se corta más ancho que la cara (interior).
        tipoId: tipoTag && getContentType('drawer', tipoTag) ? tipoTag : null,
        fondoMetodo: tipoTag && getContentType('drawer', tipoTag)
          ? fondoMetodoDeTipo(tipoTag)
          : (() => {
            const fondoViejo = piezasGrupo.find((p) => sufijoDe(p.id) === 'fondo');
            const caraVieja = piezasGrupo.find((p) => sufijoDe(p.id) === 'cara');
            const caraW = Number(caraVieja?.ancho) || 0;
            return caraW > 0 && Number(fondoViejo?.ancho) > caraW + 1 ? 'ranurado' : 'apoyado';
          })(),
      });
    if (!regenerado.ok) {
      return { ok: false, errors: [`${(frente || cara).nombre} no cabe en ${dims.ancho} mm de ancho: ${regenerado.errors.join('; ')}`] };
    }
    // Renombrar piezas regeneradas a los ids viejos (par por sufijo):
    // conserva la convencion del catalogo/builder y las dependencias por id.
    const viejaPorSufijo = new Map(piezasGrupo.map((p) => [sufijoDe(p.id), p]));
    const renombradas = regenerado.pieces.map((np) => {
      const vieja = viejaPorSufijo.get(sufijoDe(np.id));
      if (!vieja) return np;
      const out = { ...np, id: vieja.id, modulo: vieja.modulo };
      // Conservar el anclaje vertical (pos_z) de la pieza vieja: sin esto,
      // al editar dimensiones los cajones perden su posicion y el renderer
      // los re-apila por zonas, rompiendo el orden de insercion. En la
      // zapatera sin frente, el ancla es la cara (hace de frente visible).
      if ((sufijoDe(np.id) === 'frente' || sufijoDe(np.id) === 'cara') && Number.isFinite(vieja.pos_z)) {
        out.pos_z = vieja.pos_z;
      }
      return out;
    });
    // Pieza nueva sin par viejo (tirador faltante en un CSV manual): id
    // derivado del submodulo viejo para no colisionar con otros modulos.
    for (const np of renombradas) {
      if (piezasGrupo.some((v) => v.id === np.id)) continue;
      const s = sufijoDe(np.id);
      np.id = `${piezasGrupo[0].modulo}-extra-${s || 'pieza'}`;
    }
    grupos.push({ viejas: new Set(piezasGrupo.map((p) => p.id)), piezasNuevas: renombradas });
  }

  // 2. Casco redimensionado. El fondo descuenta la zona del zócalo (simple
  //    o marco): la altura del mueble queda fija y se apoya sobre la base.
  const zocaloSimple = state.pieces.find((p) => p.id === `m${moduleId}-zocalo`);
  const zDescuento = zocaloSimple
    ? (Number(zocaloSimple.alto) || 0)
    : marcoZocaloHeight(state.pieces);
  const cascoIds = {
    base: [`m${moduleId}-base`, baseEsInterna ? anchoUtil : dims.ancho, baseEsInterna ? dims.prof - espesor : dims.prof],
    tapa: [`m${moduleId}-tapa`, dims.ancho, dims.prof],
    'lateral-izq': [`m${moduleId}-lateral-izq`, dims.prof, dims.alto],
    'lateral-der': [`m${moduleId}-lateral-der`, dims.prof, dims.alto],
    fondo: [`m${moduleId}-fondo`, anchoUtil, Math.max(100, dims.alto - zDescuento - 2 * espesor)],
  };

  // 3. Aplicar: casco + contenido interior adaptado.
  const reemplazos = new Map(); // id viejo -> pieza nueva (cajones regenerados)
  const idsGrupoViejo = new Set();
  for (const g of grupos) {
    for (const np of g.piezasNuevas) reemplazos.set(np.id, np);
    for (const id of g.viejas) idsGrupoViejo.add(id);
  }

  const esDelModuloRaiz = (p) => String(p.modulo) === String(moduleId);
  const pieces = [];
  for (const p of state.pieces) {
    const id = String(p.id);
    // 1) Pieza regenerada (cajon/zapatera): entra SU reemplazo (mismo id
    //    viejo renombrado). El chequeo va ANTES que idsGrupoViejo.
    if (reemplazos.has(id)) { pieces.push(reemplazos.get(id)); continue; }
    // 2) Pieza vieja de un grupo regenerado sin par (no debería pasar): sale.
    if (idsGrupoViejo.has(id)) continue;
    // Casco.
    let cascoMatch = null;
    for (const [, [cid, w, h]] of Object.entries(cascoIds)) {
      if (id === cid) cascoMatch = [w, h];
    }
    if (cascoMatch) { pieces.push({ ...p, ancho: cascoMatch[0], alto: cascoMatch[1] }); continue; }
    // Contenido interior del modulo RAIZ, por ROL (agnóstico a ids de
    // catálogo: 'm2-repisa-superior' o 'm2-repisa-1' son rol 'shelf').
    if (esDelModuloRaiz(p)) {
      const rol = inferRole(p);
      if (rol === 'shelf') { pieces.push({ ...p, ancho: anchoUtil, alto: profUtil }); continue; }
      if (rol === 'brace' || rol === 'hanger_rail' || rol === 'plinth') {
        pieces.push({ ...p, ancho: anchoUtil });
        continue;
      }
    }
    pieces.push(p);
  }
  // 4. Gola: si el módulo tenía tiras aplicadas, re-aplicar para que se
  //    re-anchoen al nuevo vano y se re-derive el topRef con la nueva altura
  //    de casco. Forma parte de la MISMA acción (un solo undo devuelve todo).
  //    Si el vano nuevo no alcanza para re-aplicar, NO se aborta la edición:
  //    las tiras quedan como quedaron y el motivo se devuelve como warning.
  let finalPieces = pieces;
  const golaWarnings = [];
  if (isGolaEnabled(pieces, moduleId)) {
    const reapplied = reapplyGolaPieces(String(moduleId), pieces, getGolaCfgForModule(String(moduleId)));
    if (reapplied.ok) {
      finalPieces = reapplied.pieces;
      golaWarnings.push(...(reapplied.warnings || []));
      const golaMetas = loadGolaMetas();
      golaMetas[String(moduleId)] = reapplied.meta;
      saveGolaMetas(golaMetas);
    } else {
      golaWarnings.push(...(reapplied.errors || []));
    }
  }
  store.set({ pieces: finalPieces, dependencies: sugerirDependencias(finalPieces) });
  recalculateAll();
  return golaWarnings.length ? { ok: true, warnings: golaWarnings } : { ok: true };
}

// Limpia todo el mueble (nuevo mueble). La vista pide doble confirmacion.
export function clearAllPieces() {
  snapshotUndo("Nuevo mueble");
  const store = getStore();
  store.set({ pieces: [], dependencies: [], warnings: [], currentModule: 'global', currentStep: 0 });
  recalculateAll();
  return { ok: true };
}

// Elimina un modulo: quita las piezas cuyo modulo raiz coincide (incluye
// submodulos tipo '11' al borrar '1').
export function removeModule(moduleId) {
  snapshotUndo("Eliminar modulo");
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
  // Limpiar el meta gola del módulo eliminado (queda huérfano).
  const golaMetas = loadGolaMetas();
  if (Object.prototype.hasOwnProperty.call(golaMetas, id)) {
    delete golaMetas[id];
    saveGolaMetas(golaMetas);
  }
  // Limpiar también su config gola por módulo.
  const golaCfgs = loadGolaModuleCfgs();
  if (Object.prototype.hasOwnProperty.call(golaCfgs, id)) {
    delete golaCfgs[id];
    saveGolaModuleCfgs(golaCfgs);
  }
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
  const result = saveVersion(name, {
    pieces: state.pieces,
    dependencies: state.dependencies,
    golaMetas: loadGolaMetas(),
    golaModuleCfgs: loadGolaModuleCfgs(),
  });
  if (result.ok) lastSavedHash = piecesHash(state.pieces);
  return result;
}

export function loadVersionById(id) {
  const result = loadVersion(id);
  if (!result.ok) return result;
  snapshotUndo('Cargar version');
  setActivePreset(CONSTRUCTOR_PRESET);
  // Rehidratar los metas gola de la versión (round-trip exacto de frentes al
  // desactivar). Merge con los existentes: una versión vieja sin el campo no
  // borra los metas de otros módulos del estado actual.
  if (result.golaMetas && typeof result.golaMetas === 'object') {
    saveGolaMetas({ ...loadGolaMetas(), ...result.golaMetas });
  }
  // Mismo criterio para la config gola por módulo: merge, una versión vieja
  // sin el campo no borra los overrides de otros módulos del estado actual.
  if (result.golaModuleCfgs && typeof result.golaModuleCfgs === 'object') {
    saveGolaModuleCfgs({ ...loadGolaModuleCfgs(), ...result.golaModuleCfgs });
  }
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
  snapshotUndo('Cargar version de nube');
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

// ── Autoguardado del mueble en construcción ───────────────────────
// Suscripción con debounce: persiste las piezas ~2 s después del último
// cambio, bajo la clave cn-assembly-autosave. Solo LEE el store: no toca la
// pila de deshacer. Si el mueble se vacía ("Nuevo mueble"), se conserva el
// último autoguardado como red de seguridad; la clave solo se limpia al
// recuperar o descartar desde el aviso de la vista Constructor.

const AUTOSAVE_DEBOUNCE_MS = 2000;
let autosaveTimer = null;
let autosaveUnsubscribe = null;
let autosaveStoreRef = null;
// Referencia de las piezas restauradas: evita que la suscripción re-escriba
// la clave inmediatamente tras recuperar (el contrato es "restaurar y limpiar").
let autosaveSkipRef = null;

// Se re-suscribe si el store cambió (setStore en tests o en la app shell).
export function initAutosave({ debounceMs = AUTOSAVE_DEBOUNCE_MS } = {}) {
  const store = getStore();
  if (autosaveUnsubscribe && autosaveStoreRef === store) return;
  if (autosaveUnsubscribe) autosaveUnsubscribe();
  autosaveStoreRef = store;
  autosaveUnsubscribe = store.subscribe('state:changed', ({ prev, state }) => {
    if (prev.pieces === state.pieces) return;
    clearTimeout(autosaveTimer);
    if (state.pieces === autosaveSkipRef) {
      autosaveSkipRef = null;
      return;
    }
    if (!state.pieces.length) return;
    autosaveTimer = setTimeout(() => {
      saveAutosave(getStore().get().pieces);
    }, debounceMs);
  });
}

export function hasAutosave() {
  const r = readAutosave();
  return r.ok && r.pieces.length > 0;
}

// Restaura el mueble autoguardado. Sin pisar el undo: hace SU snapshot
// (Ctrl+Z vuelve al estado previo, típicamente el mueble vacío).
export function restoreAutosave() {
  const r = readAutosave();
  if (!r.ok) return r;
  snapshotUndo('Recuperar último mueble');
  setActivePreset(CONSTRUCTOR_PRESET);
  autosaveSkipRef = r.pieces;
  getStore().set({
    userConfig: loadUserConfig(),
    pieces: r.pieces,
    dependencies: sugerirDependencias(r.pieces),
    warnings: r.warnings || [],
    currentStep: 0,
    ...(countRootModules(r.pieces) > 1 ? { currentModule: 'all' } : {}),
  });
  recalculateAll();
  clearAutosave();
  return { ok: true, pieceCount: r.pieces.length };
}

export function discardAutosave() {
  clearAutosave();
  return { ok: true };
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
  initAutosave();

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.view));
    tab.addEventListener('keydown', handleTabsKeydown);
    tab.addEventListener('keydown', activateFocusedTab);
  });

  $('#module-selector')?.addEventListener('change', (e) => {
    getStore().set({ currentModule: e.target.value });
    recalculateAll();
  });

  // Buscador del catálogo: filtra las opciones del selector de ejemplos por
  // texto (nombre visible y valor), ocultando los optgroups vacíos.
  $('#example-filter')?.addEventListener('input', (e) => {
    const term = String(e.target.value || '').trim().toLowerCase();
    const select = $('#example-selector');
    if (!select) return;
    select.querySelectorAll('optgroup').forEach((group) => {
      let visibles = 0;
      group.querySelectorAll('option').forEach((opt) => {
        const match = !term
          || opt.textContent.toLowerCase().includes(term)
          || String(opt.value).toLowerCase().includes(term);
        opt.hidden = !match;
        if (match) visibles += 1;
      });
      group.hidden = visibles === 0;
    });
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
