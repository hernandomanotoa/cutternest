// js/views/constructorView.js — Vista "Constructor": armado paso a paso de
// closets abiertos (modulos + contenido) y gestion de versiones del diseno.
// La logica de construccion vive en services/closetBuilderService.js y la de
// versiones en services/projectVersionsService.js; aqui solo UI + pegamento
// con las acciones de app.js (regla de oro: sin logica de negocio en views/).

import { getModuleGroups, escapeHtml } from '../utils/helpers.js';
import { countRootModules } from '../services/closetBuilderService.js';
import { listVersions, suggestedVersionName, togglePinVersion } from '../services/projectVersionsService.js';
import { parseCSV, piecesToCSV } from '../services/csvParser.js';
import { toast } from '../components/toast.js';
import {
  applyGolaFix,
  addModuleFromBuilder,
  addContentToModule,
  aplicarCantoFrente,
  removeModule,
  duplicateModule,
  recolorModule,
  clearAllPieces,
  removeContentPiece,
  moveModule,
  editModuleDimensions,
  saveCurrentVersion,
  loadVersionById,
  deleteVersionById,
  deleteAllVersionsAction,
  renameVersionById,
  duplicateVersionById,
  exportVersionCsv,
  exportCurrentCsv,
  isDesignDirty,
  switchTab,
  saveCurrentVersionToCloud,
  loadCloudVersionById,
  deleteCloudVersionById,
  undoLast,
  canUndo,
  updateContentPosZ,
  moveContent,
  duplicateAllModules,
  focusModule,
  applyStructuralPlinth,
  removeStructuralPlinth,
  enableGola,
  disableGola,
  previewGola,
  setGolaModuleConfig,
  loadGolaModuleCfgs,
  recalculateAll,
  restoreAutosave,
  discardAutosave,
  hasAutosave,
  setGolaModoGlobal,
} from '../app.js';
import { createTour, hasSeenTour } from '../components/tour/driver.js';
import { GOLA_TOUR_STEPS } from '../data/golaTour.js';
import { listCloudVersions } from '../services/designVersionsClient.js';
import { isGolaEnabled, drawerUnits, getGolaCfg, esUnidadFijaGola } from '../services/golaService.js';
import { RAIL_SIDE_HEIGHT } from '../core/contentTypes.js';
import { constructorCascoWidth } from '../services/geometryService.js';
import { saveUserConfig, loadUserConfig } from '../services/userConfigService.js';
import {
  computeLiftCheck,
  rootModuleDims,
  hasPlinthFrame,
  plinthFrameSpec,
  plinthLevelerCount,
  marcoDesactualizado,
  marcoZocaloHeight,
} from '../services/plinthFrameService.js';

const ALTO_VANO_OPCIONES = [130, 180, 200, 220, 280];
const TIPOS_CAJON = [
  { value: 'corredera', label: 'Corredera' },
  { value: 'volquete', label: 'Volquete' },
];

// Parámetros numéricos del sistema gola editables por módulo (persistidos
// como overrides en cn-assembly-gola-cfg, con fallback a la userConfig
// global): clave cfg, label, min, step.
const GOLA_CFG_FIELDS = [
  ['golaLabioMm', 'Labio frente (mm)', 10, 1],
  ['golaEntradaMm', 'Entrada dedos (mm)', 5, 1],
  ['golaPaso', 'Holgura ala↔cara (mm)', 1, 1],
  ['golaStripSetback', 'Retranqueo (mm)', 0, 5],
  ['golaHolguraLateral', 'Holgura lat. (mm)', 0, 1],
  ['golaTornillosPorPerfil', 'Tornillos/lado', 1, 1],
  ['golaSoporteTraseroDesde', 'Soporte trasero desde (mm)', 0, 50],
];

const FURNITURE_NAME_KEY = 'cn-assembly-furniture-name';

// Control segmentado (spec Segmented del prototipo): píldoras role=radio + un
// <select> REAL oculto con el MISMO data-attribute y opciones. Los clicks
// escriben el select y disparan 'change': los handlers onChange existentes y
// los tests (que escriben select.value) quedan intactos.
function segmentedControl(label, attrs, options, current) {
  return `
    <div class="cn-segmented" role="radiogroup" aria-label="${escapeHtml(label)}">
      ${options.map((o) => `
        <button type="button" role="radio" aria-checked="${o.value === current}"
          class="cn-segmented__opt${o.value === current ? ' is-active' : ''}"
          data-seg-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('')}
      <select class="is-hidden" ${attrs}>
        ${options.map((o) => `<option value="${escapeHtml(o.value)}"${o.value === current ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>
    </div>`;
}

// Steppers − / + de un input numérico (spec NumberField). Los botones ajustan
// el input hermano (con clamp min/max) y disparan 'change': mismo contrato
// que escribir el valor a mano.
function numSteppers() {
  return `
    <span class="cn-field-num__unit" aria-hidden="true">mm</span>
    <span class="cn-field-num__btns">
      <button type="button" class="cn-field-num__btn" data-step="-1" aria-label="Disminuir">−</button>
      <button type="button" class="cn-field-num__btn" data-step="1" aria-label="Aumentar">+</button>
    </span>`;
}

function stepNumberField(stepBtn) {
  const input = stepBtn.closest('.cn-field-num')?.querySelector('input');
  if (!input) return;
  const step = Number(input.step) > 0 ? Number(input.step) : 10;
  const min = input.min === '' ? NaN : Number(input.min);
  const max = input.max === '' ? NaN : Number(input.max);
  let v = (Number(input.value) || 0) + step * Number(stepBtn.dataset.step);
  if (Number.isFinite(min)) v = Math.max(min, v);
  if (Number.isFinite(max)) v = Math.min(max, v);
  input.value = String(Math.round(v * 100) / 100);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function activateSegment(segBtn) {
  const group = segBtn.closest('.cn-segmented');
  const select = group?.querySelector('select');
  if (!select) return;
  select.value = segBtn.dataset.segValue;
  group.querySelectorAll('.cn-segmented__opt').forEach((b) => {
    const on = b === segBtn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function getFurnitureName() {
  try {
    return localStorage.getItem(FURNITURE_NAME_KEY) || '';
  } catch {
    return '';
  }
}

function setFurnitureName(name) {
  try {
    if (name) localStorage.setItem(FURNITURE_NAME_KEY, String(name));
    else localStorage.removeItem(FURNITURE_NAME_KEY);
  } catch {
    // sin storage: el nombre vive solo en la sesion
  }
}

export function createConstructorView(store) {
  let unsubscribe = null;
  let container = null;
  // Versiones en la nube: null = no cargadas aun, {auth:false} = sin sesion,
  // {versions: [...]} = cargadas. Se refrescan con el boton o tras subir.
  let cloud = null;
  let cloudLoading = false;
  // Vista previa de activación gola (dry-run sin mutar el store): se confirma
  // o cancela desde el panel inline de la tarjeta del módulo.
  let golaPreview = null;
  // Fase plegado: estado de colapso por módulo (override del usuario); el
  // default colapsa todo cuando hay muchos módulos (se setea en render()).
  // Fase esquema interactivo: módulo cuyo menú "+ añadir" del esquema está
  // abierto (null = ninguno).
  let schemeMenuFor = null;
  // Riel izquierdo: contraíble (persistido); libera el área central.
  let railCollapsed = false;
  try { railCollapsed = localStorage.getItem('cn-rail-collapsed') === '1'; } catch { /* sin storage */ }

  // Vista de módulos: la sección 02 arranca OCULTA (ocupa mucho espacio en
  // el centro): solo se muestra el módulo seleccionado desde el riel (clic
  // en un módulo). '+ Añadir' del riel vuelve a los Datos generales (01).
  // null = sin selección (placeholder).
  // La selección PERSISTE: cambiar de pestaña recrea la vista y sin esto el
  // módulo en edición "desaparecía" al volver. Si el id no existe en el
  // diseño actual, la guardia del render muestra el placeholder.
  // Error de activación del gola con FIXES APLICABLES (subir repisa / bajar
  // primer cajón): se muestra en la tarjeta con botones que ajustan el vano
  // y re-intentan el gola (app.js applyGolaFix). null = sin error pendiente.
  let golaError = null;

  // Grupo "Nuevo módulo" (01): tras agregar un módulo queda COLAPSADO y se
  // mantiene así hasta pulsar «+ Añadir» del riel (que lo vuelve a expandir
  // para el siguiente alta).
  let nuevoModuloCollapsed = false;

  const SELECTED_MODULE_KEY = 'cn-constructor-selected-module';
  let selectedModuleId = null;
  try { selectedModuleId = localStorage.getItem(SELECTED_MODULE_KEY) || null; } catch { /* sin storage */ }
  function setSelectedModule(id) {
    selectedModuleId = id == null ? null : String(id);
    try {
      if (selectedModuleId) localStorage.setItem(SELECTED_MODULE_KEY, selectedModuleId);
      else localStorage.removeItem(SELECTED_MODULE_KEY);
    } catch { /* sin storage */ }
  }
  // Tour guiado del sistema gola (components/tour/driver.js): se ofrece con
  // store vacío y tour no visto; la vista decide cuándo lanzarlo.
  let tour = null;

  function startTour() {
    if (tour && tour.isActive()) return;
    tour = createTour(GOLA_TOUR_STEPS, {
      onFinish: () => { tour = null; },
      onDismiss: () => { tour = null; },
    });
    tour.start();
  }

  // Auto-inicio del tour: una sola vez (el driver persiste "visto" en
  // localStorage al cerrar/terminar). Se dispara solo con el Constructor
  // vacío, tras dejar que el primer render pinte el encabezado.
  function maybeAutostartTour() {
    if (store.get().pieces.length) return;
    if (hasSeenTour()) return;
    setTimeout(() => {
      if (!container) return;
      if (store.get().pieces.length) return;
      if (hasSeenTour()) return;
      startTour();
    }, 800);
  }

  function onMouseover(e) {
    // E6.2: hover en un glifo del esquema resalta el chip del mismo
    // contenido (y viceversa). Solo clases CSS: sin lógica de negocio.
    const row = e.target.closest?.('.cn-scheme__row');
    const chipEl = e.target.closest?.('.cn-chip');
    const refId = row?.dataset.ref || chipEl?.dataset.ref;
    container.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
    if (!refId) return;
    container.querySelector(`.cn-chip[data-ref="${CSS.escape(refId)}"]`)?.classList.add('is-highlighted');
    container.querySelector(`.cn-scheme__row[data-ref="${CSS.escape(refId)}"]`)?.classList.add('is-highlighted');
  }

  function onMouseleave(e) {
    if (e.target === container) {
      container.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
    }
  }

  function onWheel(e) {
    // E6.1: zoom con la rueda sobre un esquema (Ctrl/Cmd libre: cualquier
    // wheel sobre el SVG hace zoom; se evita el scroll de la página).
    const svg = e.target.closest?.('.cn-scheme svg');
    if (!svg) return;
    e.preventDefault();
    const mod = svg.closest('[data-module-scoped]')?.dataset.moduleScoped;
    if (!mod) return;
    const actual = schemeZoomFor(mod);
    const next = Math.min(SCHEME_ZOOM_MAX, Math.max(1, actual + (e.deltaY < 0 ? 0.5 : -0.5)));
    if (next !== actual) {
      schemeZoomState.set(String(mod), next);
      render();
    }
  }

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', render);
    container.addEventListener('click', onClick);
    container.addEventListener('keydown', onKeydown);
    container.addEventListener('change', onChange);
    // Cálculo cruzado Prof. caja ↔ Holgura fondo: la holgura es lo que
    // SOBRA de profundidad hasta el fondo del módulo (ras el frente). Editar
    // cualquiera de los dos recalcula el otro.
    function onProfCajaInput(e) {
      if (!e.target.matches('[data-prof-caja], [data-holgura-fondo]')) return;
      const scoped3 = e.target.closest('[data-module-scoped]');
      if (!scoped3) return;
      const modId3 = scoped3.dataset.moduleScoped;
      const lat = store.get().pieces.find((p) => p.id === `m${modId3}-lateral-izq`);
      const tapa = store.get().pieces.find((p) => p.id === `m${modId3}-tapa`);
      if (!lat || !tapa) return;
      const E = Number(tapa.espesor) || 15;
      const modo = ['ras', 'tapajunta', 'interno'].includes(store.get().userConfig?.frontGapMode)
        ? store.get().userConfig.frontGapMode : 'ras';
      // disponible = prof − retranqueo(frentes) − E(fondo embutido)
      const retrx = modo === 'ras' ? E : modo === 'interno' ? 2 * E : 0;
      const disp = Math.max(0, (Number(lat.ancho) || 0) - retrx - E);
      const profEl = scoped3.querySelector('[data-prof-caja]');
      const holgEl = scoped3.querySelector('[data-holgura-fondo]');
      if (e.target === profEl) {
        const prof = Number(profEl.value) || 0;
        if (prof > 0 && holgEl) holgEl.value = String(Math.max(0, Math.round(disp - prof)));
      } else if (e.target === holgEl) {
        const prof = Number(profEl?.value) || 0;
        if (prof > 0 && profEl) profEl.value = String(Math.max(100, Math.round(disp - (Number(holgEl.value) || 0))));
      }
    }

    container.addEventListener('input', onProfCajaInput);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('mouseover', onMouseover);
    container.addEventListener('mouseleave', onMouseleave);
    render();
    maybeAutostartTour();
  }

  function destroy() {
    if (tour) {
      // 'destroyed' limpia el DOM del tour sin marcarlo como visto: cambiar
      // de pestaña a mitad de recorrido no debe suprimirlo para siempre.
      tour.stop('destroyed');
      tour = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (container) {
      container.removeEventListener('click', onClick);
      container.removeEventListener('keydown', onKeydown);
      container.removeEventListener('change', onChange);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('mouseover', onMouseover);
      container.removeEventListener('mouseleave', onMouseleave);
    }
    container = null;
  }

  // Fuerza re-render tras acciones que no mutan el store (versiones viven
  // en localStorage y no emiten state:changed).
  function refresh() {
    if (container) render();
  }


  async function refreshCloud() {
    if (cloudLoading) return;
    cloudLoading = true;
    const r = await listCloudVersions();
    cloud = r.ok ? { versions: r.versions || [] } : { auth: r.auth === false, error: r.error };
    cloudLoading = false;
    refresh();
  }

  // Seccion de versiones en la nube (null = no cargadas aun).
  function renderCloudVersions() {
    if (cloudLoading) return '<p class="empty-state">Cargando versiones de la nube…</p>';
    if (!cloud) return '';
    if (cloud.auth) {
      return '<p class="empty-state">☁ Iniciá sesión en la app para sincronizar versiones con la nube.</p>';
    }
    if (cloud.error) {
      return `<p class="empty-state">☁ Nube: ${escapeHtml(cloud.error)}</p>`;
    }
    const versions = cloud.versions || [];
    if (!versions.length) {
      return '<p class="empty-state">☁ No hay versiones en la nube. Usá el botón "☁ Nube" para subir la actual.</p>';
    }
    return `
      <div class="table-container" style="margin-bottom:0.75rem;">
        <table>
          <thead><tr><th>☁ Nube</th><th>Piezas</th><th>Fecha</th><th>Acciones</th></tr></thead>
          <tbody>
            ${versions.map((v) => `
              <tr>
                <td>${escapeHtml(v.name)}</td>
                <td>${v.pieceCount}</td>
                <td>${formatFecha(v.savedAt)}</td>
                <td class="cn-constructor__actions">
                  <button class="btn btn--secondary btn--sm" data-action="load-cloud" data-id="${escapeHtml(v.id)}">Cargar</button>
                  <button class="btn btn--danger btn--sm" data-action="delete-cloud" data-id="${escapeHtml(v.id)}">Eliminar</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function onChange(e) {
    // Parámetros del sistema gola: overrides POR MÓDULO (cn-assembly-gola-cfg)
    // vía setGolaModuleConfig; la userConfig global queda como fallback para
    // módulos sin overrides. Con gola activo en el módulo, el propio
    // setGolaModuleConfig re-aplica (enableGola) con la config efectiva.
    if (e.target.matches('[data-gola-cfg]')) {
      const key = e.target.dataset.golaCfg;
      const scoped = e.target.closest('[data-module-scoped]');
      const moduleId = scoped?.dataset.moduleScoped;
      if (!moduleId) return;
      let overrides;
      if (key === 'golaFijacion') {
        overrides = { golaFijacion: e.target.value };
      } else {
        const value = Number(e.target.value);
        if (!Number.isFinite(value)) return;
        overrides = { [key]: value };
      }
      const r = setGolaModuleConfig(moduleId, overrides);
      if (!r.ok) toast(r.errors.join('; '), { type: 'error' });
      else warnIfAny(r.warnings);
      return;
    }
    // Datos de obra / zócalo estructural: persisten en userConfig (los
    // defaults viven en VERTICAL_POSITIONS) y alimentan el lift-check y el
    // retraso del frente del marco en el renderer.
    if (e.target.matches('[data-obra]')) {
      const KEY = {
        altoZocalo: 'plinthAltoZocalo',
        retraso: 'plinthFrontRecess',
        htecho: 'obraHTecho',
        mseg: 'obraMargenSeg',
        majuste: 'obraMargenAjuste',
        zmin: 'obraZmin',
        zmax: 'obraZmax',
      };
      const cfgKey = KEY[e.target.dataset.obra];
      if (cfgKey) {
        const value = Number(e.target.value);
        if (Number.isFinite(value)) {
          saveUserConfig({ [cfgKey]: value });
          store.set({ userConfig: loadUserConfig() });
        }
      }
      if (e.target.dataset.obra === 'tipo') {
        if (e.target.value === 'marco') doApplyPlinth();
        else doRemovePlinth();
      }
      if (e.target.dataset.obra === 'frontgap') {
        const value = e.target.value;
        if (['ras', 'tapajunta', 'interno'].includes(value)) {
          saveUserConfig({ frontGapMode: value });
          store.set({ userConfig: loadUserConfig() });
          recalculateAll();
        }
        return;
      }
      if (e.target.dataset.obra === 'canto') {
        const value = Number(e.target.value);
        if (Number.isFinite(value)) {
          saveUserConfig({ cantoEspesor: value });
          store.set({ userConfig: loadUserConfig() });
          recalculateAll();
        }
        return;
      }
      if (e.target.dataset.obra === 'nzocalos') {
        // Cambiar la cantidad regenera el marco al instante si ya existe.
        saveUserConfig({ plinthNZocalos: Math.max(1, Math.min(4, Number(e.target.value) || 1)) });
        store.set({ userConfig: loadUserConfig() });
        if (hasPlinthFrame(store.get().pieces)) doApplyPlinth();
      }
      return;
    }
    // Modo de construcción de la zapatera: muestra/oculta los campos de
    // altura propios de cada modo (regla: solo los parámetros pertinentes).
    if (e.target.matches('[data-modo-zapatera]')) {
      toggleCamposZapatera(e.target.closest('[data-module-scoped]'), e.target.value);
      return;
    }
    // Nombre del mueble: persiste y alimenta el nombre sugerido de versiones.
    if (e.target.matches('[data-furniture-name]')) {
      setFurnitureName(e.target.value.trim());
      refresh();
    }
    // Datos generales del mueble: cada campo persiste en userConfig al
    // editarlo (espejo del patrón data-obra). Los valores se re-aplican al
    // re-render; los steppers disparan change y persisten igual.
    const CFG_KEY = {
      espesor: 'espesorTablero',
      color: 'colorCuerpo',
      'ancho-total': 'anchoTotal',
      reparto: 'repartoModulos',
      ancho: 'anchoModulo',
      alto: 'altoModulo',
      prof: 'profModulo',
      'altura-zocalo': 'alturaZocalo',
      cantidad: 'cantidadModulos',
      zocalo: 'conZocalo',
      'gola-modo': 'golaModoGlobal',
    };
    if (e.target.matches('[data-cfg]')) {
      const cfgKey = CFG_KEY[e.target.dataset.cfg];
      if (cfgKey) {
        const value = e.target.type === 'checkbox'
          ? (e.target.checked ? 1 : 0)
          : e.target.dataset.cfg === 'color' ? e.target.value : Number(e.target.value);
        if (e.target.dataset.cfg === 'color' || Number.isFinite(value)) {
          saveUserConfig({ [cfgKey]: value });
          store.set({ userConfig: loadUserConfig() });
        }
      }
    }
    // Modo gola global: al activar aplica el sistema a todos los módulos
    // elegibles (resumen); al desactivar lo retira de todos.
    if (e.target.matches('[data-cfg="gola-modo"]')) {
      const r = setGolaModoGlobal(e.target.checked);
      if (e.target.checked) {
        const partes = [`gola aplicada a ${(r.applied || []).length} módulo(s)`];
        for (const f of r.fallos || []) {
          partes.push(`M${f.modulo}: ${f.errors.join(' ')}`);
        }
        toast(partes.join(' · '), { type: (r.fallos || []).length ? 'error' : 'success', durationMs: 9000 });
      } else {
        toast(`Modo gola desactivado${(r.removed || []).length ? ` (retirado de ${r.removed.length} módulo(s))` : ''}`, { type: 'info' });
      }
      refresh();
      return;
    }
    // Ancho total + reparto: calcula el ancho por modulo y lo precarga.
    if (e.target.matches('[data-cfg="ancho-total"], [data-cfg="reparto"]')) {
      const root = container;
      const total = Number(root.querySelector('[data-cfg="ancho-total"]')?.value) || 0;
      const reparto = Math.max(1, Number(root.querySelector('[data-cfg="reparto"]')?.value) || 1);
      const anchoInput = root.querySelector('[data-cfg="ancho"]');
      if (total >= 100 && anchoInput) {
        anchoInput.value = Math.floor(total / reparto);
        toast(`Ancho por módulo: ${anchoInput.value} mm (${total} ÷ ${reparto})`, { type: 'info' });
      }
    }
  }

  function onKeydown(e) {
    // Navegación por flechas en los controles segmentados (accesibilidad).
    if (e.target.matches('.cn-segmented__opt') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const opts = [...e.target.closest('.cn-segmented').querySelectorAll('.cn-segmented__opt')];
      const i = opts.indexOf(e.target);
      const next = opts[(i + (e.key === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length];
      next.focus();
      activateSegment(next);
      return;
    }
    // Enter en el nombre de version guarda (mejora #12).
    if (e.key === 'Enter' && e.target.matches('[data-version-name]')) {
      e.preventDefault();
      saveVersionFromInput();
    }
    // Ctrl/Cmd+Z deshace la ultima accion estructural del Constructor.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input, select, textarea')) {
      e.preventDefault();
      doUndo();
    }
    // Ctrl/Cmd+S: atajo universal de guardar -> guarda version (con nombre
    // sugerido si el input esta vacio). Bloquea el dialogo del navegador.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveVersionFromInput();
    }
  }

  function doUndo() {
    const r = undoLast();
    if (r.ok) toast(`Deshacer: ${r.label}`, { type: 'info' });
    else toast(r.error, { type: 'info' });
  }

  function saveVersionFromInput(alsoCloud = false, cloudBtn = null) {
    // Con input vacio (p. ej. Ctrl+S directo) usa el nombre sugerido.
    const name = container.querySelector('[data-version-name]')?.value?.trim()
      || suggestedVersionName(getFurnitureName() || 'Closet');
    const r = saveCurrentVersion(name);
    if (r.ok) {
      toast(`Versión "${r.version.name}" guardada`, { type: 'success' });
      refresh();
      if (alsoCloud) saveCurrentVersionCloud(name, cloudBtn);
    } else {
      toast(r.error || 'No se pudo guardar', { type: 'error' });
    }
  }

  async function saveCurrentVersionCloud(name, btn = null) {
    // Estado de progreso: el boton se deshabilita y avisa mientras dura el
    // fetch (antes no habia indicador y parecia que no pasaba nada).
    if (btn) {
      btn.disabled = true;
      btn.dataset.labelOriginal = btn.textContent;
      btn.textContent = '☁ Subiendo…';
    }
    try {
      const r = await saveCurrentVersionToCloud(name);
      if (r.ok) {
        toast(`Versión "${r.version.name}" subida a la nube`, { type: 'success' });
        refreshCloud();
      } else if (r.auth) {
        toast(`Nube: ${r.error}. Iniciá sesión para sincronizar.`, { type: 'info', durationMs: 6000 });
      } else {
        toast(`Nube: ${r.error}`, { type: 'error' });
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.labelOriginal || '☁ Nube';
      }
    }
  }

  function confirmable(btn, labelArmed, fn) {
    if (btn.dataset.confirm === '1') {
      fn();
    } else {
      btn.dataset.confirm = '1';
      btn.textContent = labelArmed;
      setTimeout(() => {
        if (btn.isConnected) {
          btn.dataset.confirm = '';
          render();
        }
      }, 2500);
    }
  }

  async function onClick(e) {
    // Steppers numéricos y control segmentado: sin data-action (interacción
    // local del campo; el 'change' disparado alcanza a onChange delegado).
    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) {
      stepNumberField(stepBtn);
      return;
    }
    const segBtn = e.target.closest('.cn-segmented__opt');
    if (segBtn) {
      activateSegment(segBtn);
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'add-module') {
      const root = container;
      const cfg = {
        ancho: Number(root.querySelector('[data-cfg="ancho"]')?.value),
        alto: Number(root.querySelector('[data-cfg="alto"]')?.value),
        prof: Number(root.querySelector('[data-cfg="prof"]')?.value),
        espesor: Number(root.querySelector('[data-cfg="espesor"]')?.value),
        colorCuerpo: root.querySelector('[data-cfg="color"]')?.value || '#C19A6B',
        conZocalo: root.querySelector('[data-cfg="zocalo"]')?.checked,
        alturaZocalo: Number(root.querySelector('[data-cfg="altura-zocalo"]')?.value) || 150,
        cantidad: Number(root.querySelector('[data-cfg="cantidad"]')?.value) || 1,
      };
      const r = addModuleFromBuilder(cfg);
      if (r.ok) {
        // Selecciona el primer módulo creado: la sección 02 lo muestra (el
        // re-render del store ya ocurrió dentro de addModuleFromBuilder, con
        // la selección anterior: se re-renderiza para revelarlo).
        if (r.moduleIds[0] != null) setSelectedModule(r.moduleIds[0]);
        nuevoModuloCollapsed = true;
        render();
        toast(`${r.moduleIds.length} módulo(s) agregado(s)`, { type: 'success' });
        warnIfAny(r.warnings);
      } else {
        toast(r.errors.join('; '), { type: 'error' });
      }
    } else if (action === 'add-content') {
      const moduleId = btn.dataset.module;
      const kind = btn.dataset.kind;
      const scoped = `[data-module-scoped="${CSS.escape(moduleId)}"]`;
      // Sin tipos de catálogo (eliminados del UI): la altura del vano es la
      // única entrada (Vano mm). Vacío => el servicio cae a su default.
      const altoVano = Number(container.querySelector(`${scoped} [data-alto-vano]`)?.value) || 0;
      const tipoCorredera = container.querySelector(`${scoped} [data-mecanismo]`)?.value || 'corredera';
      const colorFrente = container.querySelector(`${scoped} [data-color-frente]`)?.value || '#8B5A2B';
      const separacion = Number(container.querySelector(`${scoped} [data-separacion]`)?.value) || 0;
      const insetTapa = Number(container.querySelector(`${scoped} [data-inset-tapa]`)?.value) || 0;
      const nPorFila = Number(container.querySelector(`${scoped} [data-n-por-fila]`)?.value) || 1;
      const espesorFrente = Number(container.querySelector(`${scoped} [data-espesor-frente]`)?.value) || 15;
      // División central de la zapatera (apoyo de la fila delantera): el
      // checkbox por defecto va activado; solo aplica a zapateras.
      const division = container.querySelector(`${scoped} [data-division]`)?.checked !== false;
      // Modo de construcción del frente de la zapatera (3 modos del
      // Constructor): 'normal' (default), 'extendido' o 'personalizado'
      // (alturas independientes). El checkbox "Frente zapatera" decide si la
      // bandeja lleva frente decorativo (desmarcado = bandeja a la vista:
      // la cara alta queda de frente visible/de agarre); el tipo 'bandeja a
      // la vista' lo desmarca por defecto.
      const modoZapatera = container.querySelector(`${scoped} [data-modo-zapatera]`)?.value || 'normal';
      const conFrente = container.querySelector(`${scoped} [data-con-frente-zapatera]`)?.checked !== false;
      const numCampo = (sel2) => {
        const v = Number(container.querySelector(`${scoped} ${sel2}`)?.value);
        return Number.isFinite(v) && v > 0 ? v : null;
      };
      // Alturas del modo 'personalizado' (vacío = default del servicio:
      // laterales RAIL_SIDE_HEIGHT, frente vano − 3 / vano − 1 extendido,
      // fondo/división = laterales).
      const altoFrenteZ = numCampo('[data-alto-frente-zapatera]');
      const altoLateralZ = numCampo('[data-alto-lateral-zapatera]');
      const altoFondoZ = numCampo('[data-alto-fondo-zapatera]');
      const altoDivisionZ = numCampo('[data-alto-division-zapatera]');
      // Tipo de riel: define las medidas de la caja (descuentos y fondo).
      const riel = container.querySelector(`${scoped} [data-tipo-riel]`)?.value || 'catalogo';
      // Método del fondo del cajón: apoyado (default) o ranurado (embutido).
      const fondoRanurado = container.querySelector(`${scoped} [data-fondo-ranurado]`)?.checked === true;
      // Repisa: llegar al borde frontal del módulo (default) y refuerzo con
      // luz ≥ 600 (default). Ambos persisten como preferencia de contenido.
      const repisaAlFrente = container.querySelector(`${scoped} [data-repisa-al-frente]`)?.checked !== false;
      const refuerzoRepisa = container.querySelector(`${scoped} [data-refuerzo-repisa]`)?.checked !== false;
      // Holgura caja→fondo del módulo (regla de taller: 10 mm).
      const holguraFondo = Math.max(0, Number(container.querySelector(`${scoped} [data-holgura-fondo]`)?.value ?? 10) || 0);
      // Profundidad de caja explícita (vacío = automática por riel). Al
      // fijarla, la holgura pasada al servicio es el SOBRANTE resultante
      // (disponible − profundidad), para que la validación de holgura use
      // el valor que el usuario ve en la tarjeta.
      const profCajaVal = Number(container.querySelector(`${scoped} [data-prof-caja]`)?.value) || 0;
      const rielHolguraVal = Number(container.querySelector(`${scoped} [data-riel-holgura]`)?.value) || 0;
      // Luz perimetral del frente (persistida; spec gola: 3 mm por lado).
      // Va DENTRO del mismo saveUserConfig de abajo: saveUserConfig REEMPLAZA
      // el storage completo, un segundo call la borraría (por eso el input
      // volvía a 1 tras aplicar).
      const luzFrente = Math.max(0.5, Number(container.querySelector(`${scoped} [data-luz-frente]`)?.value) || 1);
      // Canto PVC: control único en Datos de obra (data-obra="canto",
      // persistido como cantoEspesor); addContentToModule lo lee del
      // userConfig — no hay paso explícito.
      // Persistir las preferencias para los siguientes módulos (sesión).
      saveUserConfig({
        drawerFrontLuz: luzFrente,
        ...(altoVano > 0 ? { contentVano: altoVano } : {}),
        contentNPorFila: nPorFila,
        contentDivision: division ? 1 : 0,
        contentFrenteZapatera: conFrente ? 1 : 0,
        contentModoZapatera: modoZapatera,
        contentAltoFrenteZapatera: altoFrenteZ ?? '',
        contentAltoLateralZapatera: altoLateralZ ?? '',
        contentAltoFondoZapatera: altoFondoZ ?? '',
        contentAltoDivisionZapatera: altoDivisionZ ?? '',
        contentFondoRanurado: fondoRanurado ? 1 : 0,
        contentRiel: riel,
        contentRefuerzoRepisa: refuerzoRepisa ? 1 : 0,
        repisaAlFrente: repisaAlFrente ? 1 : 0,
        holguraFondoCajon: holguraFondo,
        contentProfCaja: profCajaVal || 0,
        contentRielHolgura: rielHolguraVal || 0,
      });
      store.set({ userConfig: loadUserConfig() });
      const r = addContentToModule(moduleId, kind, {
        altoVano,
        rielHolgura: rielHolguraVal > 0 ? rielHolguraVal : null,
        profundidadCaja: profCajaVal > 0 ? profCajaVal : null,
        tipo: null, // los tipos de catálogo se eliminaron del UI (vano libre)
        tipoCorredera, colorFrente, separacion, insetTapa, nPorFila, espesorFrente,
        division, conFrente, modoFrente: modoZapatera, altoFrente: altoFrenteZ,
        altoLateral: altoLateralZ, altoFondo: altoFondoZ, altoDivision: altoDivisionZ,
        riel, frenteLuz: luzFrente, fondoMetodo: fondoRanurado ? 'ranurado' : 'apoyado',
        repisaAlFrente: repisaAlFrente ? 1 : 0, conRefuerzo: refuerzoRepisa,
      });
      if (r.ok) {
        toast(`${labelKind(kind)} agregado al módulo ${moduleId}`, { type: 'success' });
        warnIfAny(r.warnings);
      } else {
        toast(r.errors.join('; '), { type: 'error' });
      }
    } else if (action === 'apply-canto-global') {
      // Control único en Datos de obra: aplica el valor PERSISTIDO (el
      // change del select ya lo guardó) a TODO el mueble. Leer del storage
      // y no del nodo DOM: el render completo de la vista reemplaza el
      // select en cada state:changed y el valor del nodo puede quedar
      // desincronizado en entornos DOM ligeros.
      const valor = Number(loadUserConfig().cantoEspesor ?? 0) || 0;
      const r = aplicarCantoFrente(valor);
      if (r.ok) {
        toast(`Canto PVC ${valor} mm aplicado: ${r.reconstruidos} módulo(s) reconstruido(s)`, { type: 'success' });
      } else {
        toast(r.errors.join('; '), { type: 'error' });
      }
    } else if (action === 'remove-module') {
      confirmable(btn, '¿Seguro?', () => {
        removeModule(btn.dataset.module);
        if (String(selectedModuleId) === String(btn.dataset.module)) setSelectedModule(null);
        toast(`Módulo ${btn.dataset.module} eliminado`, { type: 'info' });
      });
    } else if (action === 'duplicate-module') {
      const r = duplicateModule(btn.dataset.module);
      if (r.ok) toast(`Módulo duplicado como ${r.moduleId}`, { type: 'success' });
      else toast(r.errors.join('; '), { type: 'error' });
    } else if (action === 'move-content') {
      const r = moveContent(btn.dataset.ref, btn.dataset.dir);
      if (!r.ok) toast(r.errors.join('; '), { type: 'info' });
    } else if (action === 'apply-plinth') {
      doApplyPlinth();
    } else if (action === 'remove-plinth') {
      doRemovePlinth();
    } else if (action === 'edit-posz') {
      // Edicion inline de la altura: el label del chip se convierte en un
      // input numerico con el pos_z actual. Enter/blur confirma, Escape
      // cancela. La pieza afectada se resuelve por data-ref del chip.
      const chip = btn.closest('.cn-chip');
      if (!chip || chip.querySelector('input')) return;
      const label = chip.querySelector('.cn-chip__label');
      const valorActual = label?.dataset.posz || '';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '10';
      input.value = valorActual;
      input.setAttribute('aria-label', 'Altura desde el suelo (mm)');
      input.style.cssText = 'width:5.5rem;font-size:0.75rem;padding:0.05rem 0.3rem;';
      label.replaceChildren(input);
      input.focus();
      input.select();
      let cerrado = false;
      const cerrar = (aplicar) => {
        if (cerrado) return;
        cerrado = true;
        if (aplicar) {
          const r = updateContentPosZ(btn.dataset.ref, Number(input.value));
          if (!r.ok) toast(r.errors.join('; '), { type: 'error' });
        }
        render(); // re-render de la vista (el store ya emitio state:changed si aplico)
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); cerrar(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); cerrar(false); }
      });
      input.addEventListener('blur', () => cerrar(true));
    } else if (action === 'remove-content') {
      confirmable(btn, '¿Seguro?', () => {
        removeContentPiece(btn.dataset.ref);
        toast('Contenido eliminado', { type: 'info' });
      });
    } else if (action === 'move-module') {
      const r = moveModule(btn.dataset.module, btn.dataset.dir);
      if (!r.ok) toast(r.errors.join('; '), { type: 'error' });
    } else if (action === 'edit-module') {
      const row = btn.closest('[data-module-scoped]');
      const form = row?.querySelector('[data-edit-form]');
      if (form) form.classList.toggle('is-hidden');
    } else if (action === 'apply-edit-module') {
      const moduleId = btn.dataset.module;
      const scoped = `[data-module-scoped="${CSS.escape(moduleId)}"]`;
      const marcoHEd = Number(container.querySelector(`${scoped} [data-edit-alto]`)?.dataset.marcoH) || 0;
      const dims = {
        ancho: Number(container.querySelector(`${scoped} [data-edit-ancho]`)?.value),
        // El campo es altura TOTAL con marco: se descuenta para regenerar
        // el casco (los laterales miden casco = total − marco).
        alto: Math.max(100, Number(container.querySelector(`${scoped} [data-edit-alto]`)?.value) - marcoHEd),
        prof: Number(container.querySelector(`${scoped} [data-edit-prof]`)?.value),
      };
      // La luz del frente también se persiste al "Aplicar" (el usuario la
      // ajusta en la tarjeta y espera que este botón la guarde; saveUserConfig
      // hace merge, no borra otras claves).
      const luz = Math.max(0.5, Number(container.querySelector(`${scoped} [data-luz-frente]`)?.value) || 1);
      saveUserConfig({ drawerFrontLuz: luz });
      store.set({ userConfig: loadUserConfig() });
      const r = editModuleDimensions(moduleId, dims);
      if (r.ok) toast(`Módulo ${moduleId} actualizado`, { type: 'success' });
      else toast(r.errors.join('; '), { type: 'error' });
    } else if (action === 'recolor-module') {
      const color = container.querySelector(`[data-module-scoped="${CSS.escape(btn.dataset.module)}"] [data-color-cuerpo]`)?.value;
      const r = recolorModule(btn.dataset.module, color);
      if (r.ok) toast(`Módulo ${btn.dataset.module} recoloreado`, { type: 'success' });
      else toast(r.errors.join('; '), { type: 'error' });
    } else if (action === 'toggle-gola') {
      const moduleId = btn.dataset.module;
      if (!btn.checked) {
        // Desactivación: reversible con undo (Ctrl+Z), sigue siendo directa.
        const r = disableGola(moduleId);
        if (!r.ok) {
          toast(r.errors.join('; '), { type: 'error' });
          render(); // revertir el checkbox al estado real
          return;
        }
        toast(`Gola desactivada en el módulo ${moduleId}: canales eliminados, frentes restaurados`, { type: 'success' });
        warnIfAny(r.warnings);
        return;
      }
      // Activación: vista previa con confirmación (dry-run, no muta el store).
      const pv = previewGola(moduleId);
      if (!pv.ok) {
        golaError = { moduleId: String(moduleId), errors: pv.errors || [], fixes: pv.fixes || [] };
        toast(pv.errors.join('; '), { type: 'error', durationMs: 8000 });
        golaPreview = null;
        render(); // revertir el checkbox (sigue apagado en el store)
        return;
      }
      golaError = null;
      golaPreview = { moduleId, plan: pv.plan, warnings: pv.warnings };
      render();
    } else if (action === 'confirm-gola') {
      const moduleId = btn.dataset.module;
      golaPreview = null;
      golaError = null;
      const r = enableGola(moduleId);
      if (!r.ok) {
        golaError = { moduleId: String(moduleId), errors: r.errors || [], fixes: r.fixes || [] };
        toast(r.errors.join('; '), { type: 'error', durationMs: 8000 });
        render();
        return;
      }
      toast(`Gola activada en el módulo ${moduleId}: canales C/L de melamina, apertura sin jaladera`, { type: 'success' });
      warnIfAny(r.warnings);
    } else if (action === 'cancel-gola') {
      // El dry-run nunca tocó el store: basta re-render para volver a off.
      golaPreview = null;
      golaError = null;
      render();
    } else if (action === 'clear-all') {
      confirmable(btn, '¿Borrar TODO?', () => {
        clearAllPieces();
        toast('Mueble nuevo: piezas eliminadas', { type: 'info' });
      });
    } else if (action === 'undo') {
      doUndo();
    } else if (action === 'duplicate-all') {
      const r = duplicateAllModules();
      if (r.ok) toast(`Mueble duplicado: ${r.count} módulo(s) nuevos`, { type: 'success' });
      else toast(r.errors.join('; '), { type: 'error' });
    } else if (action === 'focus-module') {
      focusModule(btn.dataset.module);
    } else if (action === 'pin-version') {
      const r = togglePinVersion(btn.dataset.id);
      if (r.ok) { toast(r.pinned ? 'Versión fijada 📌' : 'Versión desfijada', { type: 'info' }); refresh(); }
    } else if (action === 'furniture-name') {
      // El change del input lo maneja onChange abajo; este branch no aplica.
      void btn;
    } else if (action === 'save-version') {
      saveVersionFromInput();
    } else if (action === 'save-cloud') {
      saveVersionFromInput(true, btn);
    } else if (action === 'refresh-cloud') {
      refreshCloud();
    } else if (action === 'load-cloud') {
      const r = await loadCloudVersionById(btn.dataset.id);
      if (r.ok) toast(`Versión de nube "${r.name}" cargada`, { type: 'success' });
      else toast(r.error || 'No se pudo cargar', { type: 'error' });
    } else if (action === 'delete-cloud') {
      confirmable(btn, '¿Seguro?', async () => {
        const r = await deleteCloudVersionById(btn.dataset.id);
        if (r.ok) { toast('Versión de nube eliminada', { type: 'info' }); refreshCloud(); }
        else toast(r.error, { type: 'error' });
      });
    } else if (action === 'load-version') {
      const r = loadVersionById(btn.dataset.id);
      if (r.ok) toast(`Versión "${r.name}" cargada`, { type: 'success' });
      else toast(r.error || 'No se pudo cargar', { type: 'error' });
    } else if (action === 'rename-version') {
      const row = btn.closest('tr');
      const input = row?.querySelector('[data-rename-input]');
      if (input && !input.classList.contains('is-hidden')) {
        const r = renameVersionById(btn.dataset.id, input.value);
        if (r.ok) { toast('Versión renombrada', { type: 'success' }); refresh(); }
        else toast(r.error, { type: 'error' });
      } else if (input) {
        input.classList.remove('is-hidden');
        input.focus();
      }
    } else if (action === 'duplicate-version') {
      const r = duplicateVersionById(btn.dataset.id);
      if (r.ok) { toast(`Copia creada: ${r.version.name}`, { type: 'success' }); refresh(); }
      else toast(r.error, { type: 'error' });
    } else if (action === 'export-version') {
      const r = exportVersionCsv(btn.dataset.id);
      if (!r.ok) toast(r.error, { type: 'error' });
    } else if (action === 'export-current') {
      const r = exportCurrentCsv();
      if (r.ok) toast('CSV exportado', { type: 'success' });
      else toast(r.error, { type: 'error' });
    } else if (action === 'delete-version') {
      confirmable(btn, '¿Seguro?', () => {
        deleteVersionById(btn.dataset.id);
        toast('Versión eliminada', { type: 'info' });
        refresh();
      });
    } else if (action === 'delete-all-versions') {
      confirmable(btn, '¿Eliminar TODAS?', () => {
        deleteAllVersionsAction();
        toast('Todas las versiones eliminadas', { type: 'info' });
        refresh();
      });
    } else if (action === 'start-tour') {
      startTour();
    } else if (action === 'restore-autosave') {
      const r = restoreAutosave();
      if (r.ok) toast(`Mueble recuperado: ${r.pieceCount} pieza(s) restauradas`, { type: 'success' });
      else toast(r.error || 'No se pudo recuperar el autoguardado', { type: 'error' });
    } else if (action === 'discard-autosave') {
      discardAutosave();
      refresh();
    } else if (action === 'goto-view') {
      switchTab(btn.dataset.view);
    } else if (action === 'apply-gola-fix') {
      // Aplica el ajuste de vano sugerido (subir repisa / bajar primer
      // cajón) y re-intenta el gola en la misma acción (un solo undo).
      const mod = String(btn.dataset.module);
      const r = applyGolaFix(mod, { id: btn.dataset.fixId, mm: Number(btn.dataset.fixMm) || 0 });
      if (!r.ok) {
        toast(r.errors.join('; '), { type: 'error' });
        return;
      }
      if (r.gola.ok) {
        golaError = null;
        toast('Vano ajustado y gola aplicada ✓', { type: 'success' });
      } else {
        golaError = { moduleId: mod, errors: r.gola.errors || [], fixes: r.gola.fixes || [] };
        toast('Vano ajustado; el gola aún no cabe — nuevas opciones en la tarjeta', { type: 'info', durationMs: 6000 });
      }
      render();
    } else if (action === 'toggle-nuevo-modulo') {
      // Colapsar/expandir el grupo "Nuevo módulo" de Datos generales.
      nuevoModuloCollapsed = !nuevoModuloCollapsed;
      render();
    } else if (action === 'rail-toggle') {
      // Contraer/mostrar el riel izquierdo (persistido).
      railCollapsed = !railCollapsed;
      try { localStorage.setItem('cn-rail-collapsed', railCollapsed ? '1' : '0'); } catch { /* sin storage */ }
      render();
    } else if (action === 'rail-add-module') {
      // Riel izquierdo: "Añadir" muestra los Datos generales (01) para crear
      // el módulo (la sección 02 queda oculta hasta elegir un módulo).
      // Expande el grupo "Nuevo módulo" (tras agregar quedó colapsado) y
      // conserva la selección actual: el módulo en edición sigue visible.
      nuevoModuloCollapsed = false;
      render();
      const target = container.querySelector('[data-cfg="ancho"]');
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      target?.focus?.();
    } else if (action === 'rail-focus-module') {
      // Riel izquierdo: clic en un módulo REVELA su tarjeta en la sección 02
      // (la única visible) y hace scroll hasta ella.
      setSelectedModule(btn.dataset.module);
      moduleFoldState.set(String(btn.dataset.module), false);
      render();
      const card = container.querySelector(`[data-module-scoped="${CSS.escape(btn.dataset.module)}"]`);
      if (!card) return;
      card.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      card.classList.add('cn-module-flash');
      setTimeout(() => card.classList?.remove('cn-module-flash'), 1400);
    } else if (action === 'toggle-collapse') {
      // Fase plegado: contrae/expande las preferencias de la tarjeta.
      const id = String(btn.dataset.module);
      moduleFoldState.set(id, !isModuleCollapsed(id));
      render();
    } else if (action === 'scheme-zoom') {
      // E6.1: zoom del esquema (in/out/reset) con factor por módulo.
      const id = String(btn.dataset.module);
      const actual = schemeZoomFor(id);
      const next = btn.dataset.dir === 'in' ? Math.min(SCHEME_ZOOM_MAX, actual + 0.5)
        : btn.dataset.dir === 'out' ? Math.max(1, actual - 0.5) : 1;
      if (next === actual && btn.dataset.dir !== 'reset') return;
      schemeZoomState.set(id, next);
      render();
    } else if (action === 'scheme-remove') {
      // Esquema interactivo: clic en un elemento lo quita (undo = Ctrl+Z).
      const r = removeContentPiece(btn.dataset.ref);
      if (r.ok) toast('Contenido eliminado desde el esquema (Ctrl+Z deshace)', { type: 'info' });
      else toast(r.errors.join('; '), { type: 'error' });
    } else if (action === 'scheme-menu') {
      // Esquema interactivo: la zona ＋ abre/cierra el menú de alta.
      const id = String(btn.dataset.module);
      schemeMenuFor = schemeMenuFor === id ? null : id;
      render();
    } else if (action === 'scheme-add') {
      // El menú reutiliza el botón real "+ Tipo" de la tarjeta: mismas prefs,
      // mismas validaciones y mismos toasts (cero lógica nueva).
      const mod = schemeMenuFor;
      schemeMenuFor = null;
      const target = container.querySelector(
        `[data-module-scoped="${CSS.escape(mod || '')}"] [data-action="add-content"][data-kind="${CSS.escape(btn.dataset.kind)}"]`,
      );
      if (target) target.click();
    }
  }

  function doApplyPlinth() {
    const state = store.get();
    const cfg = state.userConfig || {};
    const r = applyStructuralPlinth({
      altoZocalo: Number(cfg.plinthAltoZocalo) || 100,
      retraso: Number(cfg.plinthFrontRecess) || 0,
      nZocalos: Number(cfg.plinthNZocalos) || 1,
    });
    if (!r.ok) {
      toast(r.errors.join('; '), { type: 'error' });
      return;
    }
    toast(`Zócalo a marco (${r.ancho} mm): ${r.pieceCount} piezas, ${r.levelers} niveladores`, { type: 'success' });
    (r.warnings || []).forEach((w) => toast(w, { type: 'info', durationMs: 8000 }));
  }

  function doRemovePlinth() {
    const r = removeStructuralPlinth();
    if (!r.ok) toast(r.errors.join('; '), { type: 'info' });
    else toast(`Zócalo estructural eliminado${r.restored ? `; se restauraron ${r.restored} frente(s) simple(s)` : ''}`, { type: 'success' });
  }

  function render() {
    if (!container) return;
    const state = store.get();
    const pieces = state.pieces || [];
    const groups = getModuleGroups(pieces);
    const versions = listVersions();
    const dirty = isDesignDirty();
    // Fase plegado: con muchos módulos las tarjetas arrancan colapsadas
    // (cabecera + chips + esquema); el usuario expande las que edita.
    collapseDefault = groups.length > 3;
    container.innerHTML = `
      <div class="cn-constructor${railCollapsed ? ' cn-rail-off' : ''}">
      ${pieces.length === 0 && hasAutosave() ? renderAutosaveBanner() : ''}
      <div class="cn-constructor__layout">
      <aside class="cn-rail" style="position:relative;">
        <button class="cn-rail-toggle" data-action="rail-toggle" title="${railCollapsed ? 'Mostrar panel de módulos' : 'Contraer panel de módulos'}" aria-label="${railCollapsed ? 'Mostrar panel de módulos' : 'Contraer panel de módulos'}">${railCollapsed ? '⇥' : '⇤'}</button>
        ${renderModuleRail(groups, pieces, selectedModuleId)}
        <section class="cn-rail__section">
          <div class="cn-rail__head">
            <h3 class="t-label">Zócalo y obra</h3>
            <span class="cn-constructor__summary" data-plinth-resumen>${resumenPlinth(pieces, state)}</span>
          </div>
          <div class="cn-constructor__grid">
            <div class="form-group">Tipo de zócalo
              ${segmentedControl('Tipo de zócalo', 'data-obra="tipo"', [
                { value: 'simple', label: 'Frente simple por módulo' },
                { value: 'marco', label: 'Marco estructural (cajón de 4 lados)' },
              ], hasPlinthFrame(pieces) ? 'marco' : 'simple')}
            </div>
            <label class="form-group">Cantidad de zócalos
              <select data-obra="nzocalos">
                ${[1, 2, 3, 4].map((n) => `<option value="${n}" ${Number(state.userConfig?.plinthNZocalos || 1) === n ? 'selected' : ''}>${n === 1 ? '1 (único)' : n}</option>`).join('')}
              </select>
            </label>
            <label class="form-group">Alto zócalo Z (mm)
              <span class="cn-field-num"><input type="number" data-obra="altoZocalo" value="${Number(state.userConfig?.plinthAltoZocalo) || 100}" min="50" max="300" step="5" />${numSteppers()}</span>
            </label>
            <label class="form-group">Retraso frente (mm)
              <span class="cn-field-num"><input type="number" data-obra="retraso" value="${Number(state.userConfig?.plinthFrontRecess) || 0}" min="0" max="150" step="5" />${numSteppers()}</span>
            </label>
          </div>
          <details class="cn-constructor__obra" ${Number(state.userConfig?.obraHTecho) > 0 ? 'open' : ''}>
            <summary>Datos de obra — levantamiento en vertical (restricción de diagonal)</summary>
            <div class="cn-constructor__grid">
              <label class="form-group">H techo (mm)
                <input type="number" data-obra="htecho" value="${Number(state.userConfig?.obraHTecho) || ''}" min="0" step="10" placeholder="0 = sin verificar" />
              </label>
              <label class="form-group">Margen seguridad (mm)
                <input type="number" data-obra="mseg" value="${Number(state.userConfig?.obraMargenSeg ?? 20)}" min="0" step="5" />
              </label>
              <label class="form-group">Margen ajuste (mm)
                <input type="number" data-obra="majuste" value="${Number(state.userConfig?.obraMargenAjuste ?? 10)}" min="0" step="5" />
              </label>
              <label class="form-group">Z mín (mm)
                <input type="number" data-obra="zmin" value="${Number(state.userConfig?.obraZmin ?? 60)}" min="0" step="5" />
              </label>
              <label class="form-group">Z máx (mm)
                <input type="number" data-obra="zmax" value="${Number(state.userConfig?.obraZmax ?? 150)}" min="0" step="5" />
              </label>
            </div>
            ${renderLiftCheck(pieces, state)}
          </details>
          ${marcoDesactualizado(pieces) ? '<p class="cn-constructor__warnings" role="alert">⚠ Los módulos cambiaron desde que se generó el marco. Pulse <strong>Generar marco</strong> para actualizar los sub-zócalos.</p>' : ''}
          <div class="cn-constructor__content-btns">
            <button class="btn btn--primary" data-action="apply-plinth">${marcoDesactualizado(pieces) ? 'Regenerar marco' : 'Generar marco'}</button>
            <button class="btn btn--secondary" data-action="remove-plinth" ${hasPlinthFrame(pieces) ? '' : 'disabled'}>Quitar marco</button>
          </div>
        </section>
        <section class="cn-rail__section">
          <div class="cn-rail__head">
            <h3 class="t-label">Versiones guardadas</h3>
          </div>
          <div class="cn-constructor__version-form">
            <input type="text" data-version-name placeholder="${escapeHtml(suggestedVersionName(getFurnitureName() || 'Closet'))}" maxlength="80" aria-label="Nombre de la versión" />
            <button class="btn btn--primary" data-action="save-version">Guardar versión</button>
            <button class="btn btn--secondary" data-action="save-cloud" title="Guardar tambien en la nube (requiere sesion)">☁ Nube</button>
            <button class="btn btn--secondary" data-action="refresh-cloud" title="Listar versiones de la nube">Actualizar nube</button>
          </div>
          ${renderCloudVersions()}
          ${versions.length === 0
            ? '<p class="empty-state">No hay versiones guardadas todavía.</p>'
            : `<div class="table-container"><table>
                <thead><tr><th>Nombre</th><th>Piezas</th><th>Fecha</th><th>Acciones</th></tr></thead>
                <tbody>
                  ${versions.map((v) => `
                    <tr>
                      <td>
                        <button class="btn btn--icon btn--sm" data-action="pin-version" data-id="${escapeHtml(v.id)}" title="${v.pinned ? 'Desfijar (queda protegida de "Eliminar todas")' : 'Fijar versión'}">${v.pinned ? '📌' : '📍'}</button>
                        <span data-name>${escapeHtml(v.name)}</span>
                        <input type="text" class="is-hidden" data-rename-input value="${escapeHtml(v.name)}" maxlength="80" />
                      </td>
                      <td>${v.pieceCount}</td>
                      <td>${formatFecha(v.savedAt)}</td>
                      <td class="cn-constructor__actions">
                        <button class="btn btn--secondary btn--sm" data-action="load-version" data-id="${escapeHtml(v.id)}">Cargar</button>
                        <button class="btn btn--secondary btn--sm" data-action="rename-version" data-id="${escapeHtml(v.id)}">Renombrar</button>
                        <button class="btn btn--secondary btn--sm" data-action="duplicate-version" data-id="${escapeHtml(v.id)}">Duplicar</button>
                        <button class="btn btn--secondary btn--sm" data-action="export-version" data-id="${escapeHtml(v.id)}">CSV</button>
                        <button class="btn btn--danger btn--sm" data-action="delete-version" data-id="${escapeHtml(v.id)}">Eliminar</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table></div>
              <button class="btn btn--danger" data-action="delete-all-versions" style="margin-top:0.5rem;">Eliminar todas</button>`}
        </section>
      </aside>
      <div class="cn-constructor__main">
      <section class="card">
        <div class="card__header">
          <span class="cn-section-head__index" aria-hidden="true">01</span>
          <h2 class="card__title">Datos generales del mueble</h2>
          <div class="cn-section-head__aside">
            ${pieces.length === 0 && !hasSeenTour() ? '<button class="btn btn--secondary btn--sm" data-action="start-tour" title="Recorrido guiado del sistema gola">Tour gola</button>' : ''}
            <span class="cn-constructor__summary" data-resumen>${resumenMueble(pieces, state)}</span>
            ${dirty ? '<span class="badge badge--secondary" title="Hay cambios sin guardar en una versión">● sin guardar</span>' : ''}
          </div>
        </div>
        <div class="card__body">
          <div class="cn-form-section">
            <h4 class="cn-form-section__title">Mueble</h4>
            <div class="cn-constructor__grid">
              <label class="form-group">Nombre del mueble
                <input type="text" data-furniture-name value="${escapeHtml(getFurnitureName())}" placeholder="Clóset dormitorio" maxlength="60" />
              </label>
              <div class="form-group">Espesor de tablero
                ${segmentedControl('Espesor de tablero', 'data-cfg="espesor"', [
                  { value: '15', label: '15 mm' },
                  { value: '18', label: '18 mm' },
                  { value: '25', label: '25 mm' },
                ], String(Number(state.userConfig?.espesorTablero) || 15))}
              </div>
              <label class="form-group">Color cuerpo
                <input type="color" data-cfg="color" value="${escapeHtml(state.userConfig?.colorCuerpo || '#c19a6b')}" />
              </label>
              <label class="form-group" title="Posición del frente de cajón/zapatera respecto de los laterales: 'A ras' termina alineado (no sobresale); 'Tapajunta' cubre la cara frontal de los laterales (un espesor por delante); 'Interno' queda retranqueado un espesor ENTRE los laterales (se ven los laterales como marco). La caja gana/pierde profundidad en consecuencia y la gola lo sigue">Frentes
                <select data-obra="frontgap">
                  <option value="ras" ${(state.userConfig?.frontGapMode ?? 'ras') === 'ras' ? 'selected' : ''}>A ras</option>
                  <option value="tapajunta" ${state.userConfig?.frontGapMode === 'tapajunta' ? 'selected' : ''}>Tapajunta</option>
                  <option value="interno" ${state.userConfig?.frontGapMode === 'interno' ? 'selected' : ''}>Interno</option>
                </select>
              </label>
              <label class="form-group" title="Espesor del canto (PVC o melamina) de los lados del frente: descuenta 2×espesor del ancho de corte para que el frente canteado conserve la holgura en el vano (con 1–2 mm sin descuento quedaría al ras o no entraría) y alimenta la lista de herrajes. '↻ Todo' reconstruye los frentes existentes del mueble con el nuevo valor">Canto PVC (mm)
                <select data-obra="canto">
                  ${[0, 0.4, 0.8, 1, 2].map((e) => `<option value="${e}" ${Number(state.userConfig?.cantoEspesor ?? 0) === e ? 'selected' : ''}>${e === 0 ? '0 (sin canto)' : `${e} mm`}</option>`).join('')}
                </select>
              </label>
              <button class="btn btn--sm" style="align-self:end;" data-action="apply-canto-global" title="Reconstruye TODOS los frentes del mueble (cajones y zapateras) con el Canto PVC elegido. Un solo paso de deshacer (Ctrl+Z) revierte el lote completo">↻ Todo el mueble</button>
              <label class="form-group cn-toggle" title="Modo gola: aplica el sistema de apertura sin tiradores a TODOS los módulos con ≥2 cajones de una vez. Los módulos nuevos lo heredan al alcanzar 2 cajones. Desactívalo para retirarlo de todos.">
                <input type="checkbox" data-cfg="gola-modo" ${Number(state.userConfig?.golaModoGlobal) === 1 ? 'checked' : ''} />
                <span class="cn-toggle__text">
                  <span class="cn-toggle__label">Modo gola</span>
                  <span class="cn-toggle__desc">Sin tiradores en todos los módulos con cajones; los nuevos lo heredan.</span>
                </span>
              </label>
            </div>
          </div>
          <div class="cn-form-section${nuevoModuloCollapsed ? ' is-collapsed' : ''}">
            <h4 class="cn-form-section__title">
              Nuevo módulo
              <button type="button" class="cn-form-section__toggle" data-action="toggle-nuevo-modulo"
                aria-expanded="${nuevoModuloCollapsed ? 'false' : 'true'}"
                title="${nuevoModuloCollapsed ? 'Expandir formulario de nuevo módulo' : 'Colapsar formulario de nuevo módulo'}">${nuevoModuloCollapsed ? '▸' : '▾'}</button>
            </h4>
            <div class="cn-constructor__grid">
              <label class="form-group">Ancho total (mm)
                <input type="number" data-cfg="ancho-total" value="${Number(state.userConfig?.anchoTotal) || ''}" placeholder="3400" min="100" step="10" />
              </label>
              <label class="form-group">Repartir en
                <input type="number" data-cfg="reparto" value="${Number(state.userConfig?.repartoModulos) || 4}" min="1" max="12" />
              </label>
              <label class="form-group">Ancho (mm)
                <span class="cn-field-num"><input type="number" data-cfg="ancho" value="${Number(state.userConfig?.anchoModulo) || 850}" min="100" step="10" />${numSteppers()}</span>
              </label>
              <label class="form-group">Alto (mm)
                <span class="cn-field-num"><input type="number" data-cfg="alto" value="${Number(state.userConfig?.altoModulo) || 2400}" min="100" step="10" />${numSteppers()}</span>
              </label>
              <label class="form-group">Profundidad (mm)
                <span class="cn-field-num"><input type="number" data-cfg="prof" value="${Number(state.userConfig?.profModulo) || 600}" min="100" step="10" />${numSteppers()}</span>
              </label>
              <label class="form-group">Zócalo (mm)
                <input type="number" data-cfg="altura-zocalo" value="${Number(state.userConfig?.alturaZocalo) || 150}" min="50" max="300" step="10" />
              </label>
              <label class="form-group">Cantidad
                <input type="number" data-cfg="cantidad" value="${Number(state.userConfig?.cantidadModulos) || 1}" min="1" max="12" />
              </label>
              <label class="form-group cn-toggle" title="La base queda apoyada sobre el zócalo">
                <input type="checkbox" data-cfg="zocalo" ${state.userConfig?.conZocalo === 0 ? '' : 'checked'} />
                <span class="cn-toggle__text">
                  <span class="cn-toggle__label">Con zócalo</span>
                  <span class="cn-toggle__desc">La base queda apoyada sobre el zócalo.</span>
                </span>
              </label>
            </div>
            <button class="btn btn--primary" data-action="add-module">+ Agregar módulo(s)</button>
          </div>
          <div class="cn-form-section">
            <h4 class="cn-form-section__title">Acciones del mueble</h4>
            <div class="cn-constructor__content-btns">
              <button class="btn btn--secondary" data-action="undo" ${canUndo() ? '' : 'disabled'} title="Deshacer última acción (Ctrl+Z)">↩ Deshacer</button>
              <button class="btn btn--secondary" data-action="duplicate-all" ${pieces.length ? '' : 'disabled'}>Duplicar mueble</button>
              <button class="btn btn--secondary" data-action="export-current" ${pieces.length ? '' : 'disabled'}>Exportar CSV</button>
              <button class="btn btn--secondary" data-action="goto-view" data-view="isometric" ${pieces.length ? '' : 'disabled'}>Ver isométrica</button>
              <button class="btn btn--secondary" data-action="goto-view" data-view="renderer3d" ${pieces.length ? '' : 'disabled'}>Ver 3D</button>
              <button class="btn btn--danger" data-action="clear-all" ${pieces.length ? '' : 'disabled'}>Nuevo mueble</button>
            </div>
          </div>
          ${renderWarningsPanel(pieces, state)}
        </div>
      </section>

      <section class="card">
        <div class="card__header">
          <span class="cn-section-head__index" aria-hidden="true">02</span>
          <h2 class="card__title">Módulos y contenido</h2>
        </div>
        <div class="card__body">
          ${groups.length === 0
            ? '<p class="empty-state">Todavía no hay módulos. Agrega el primero arriba.</p>'
            : (() => {
              // Se revela el módulo seleccionado; si la selección es nula o
              // quedó stale (otro diseño cargado), el PRIMER módulo se ve por
              // defecto: agregar siempre muestra el módulo, nunca el placeholder.
              const reveladaId = groups.some((g) => String(g.id) === String(selectedModuleId))
                ? String(selectedModuleId)
                : String(groups[0].id);
              return groups.map((g) => renderModuleCard(
                g, pieces, state.userConfig || {}, golaPreview, schemeMenuFor,
                String(g.id) === reveladaId,
                golaError && String(golaError.moduleId) === String(g.id) ? golaError : null,
              )).join('');
            })()}
        </div>
      </section>
      </div>
      </div>
      </div>
    `;
    // Fijar el valor de los selects de modo de zapatera: happy-dom (tests)
    // no respeta el atributo `selected` en opciones 3ª+ al parsear el HTML
    // (devuelve la 2ª opción); en navegador esto es un no-op.
    for (const sel of container.querySelectorAll('[data-modo-default]')) {
      sel.value = sel.dataset.modoDefault;
    }
    // Re-render del Constructor: el innerHTML reemplazó los nodos objetivo del
    // tour; si hay uno activo, se re-ancla al paso actual.
    if (tour && tour.isActive()) tour.refresh();
  }

  return { mount, destroy };
}

// Banner de recuperación del autoguardado: solo con el Constructor vacío y
// una clave cn-assembly-autosave con piezas. Recuperar restaura y limpia la
// clave; Descartar solo la limpia.
function renderAutosaveBanner() {
  return `
    <div class="cn-autosave-banner" role="status">
      <span>Hay un mueble en construcción autoguardado en este navegador.</span>
      <span class="cn-constructor__spacer"></span>
      <button class="btn btn--primary btn--sm" data-action="restore-autosave">Recuperar último mueble</button>
      <button class="btn btn--secondary btn--sm" data-action="discard-autosave">Descartar</button>
    </div>
  `;
}

// Lista de contenido agregado al modulo (cajones, zapateras, repisas,
// barras, zocalo) con boton de eliminacion individual. El orden de la
// lista es el de insercion (orden del array de piezas).
// Icono + estilo por tipo de contenido (chips del listado por modulo).
// Icono por tipo de contenido (chips del listado por modulo). SVG inline
// 12×12 (nitidez a cualquier tamaño, hereda color del chip).
const CONTENT_ICON = {
  zocalo: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1.5" y="7" width="9" height="3" rx="0.8"/></svg>',
  shelf: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1" y1="6" x2="11" y2="6"/></svg>',
  drawer: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2" width="9" height="8" rx="1.2"/><line x1="4.5" y1="6" x2="7.5" y2="6"/></svg>',
  shoeRack: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="1.5" y1="4" x2="10.5" y2="6.5"/><line x1="1.5" y1="7" x2="10.5" y2="9.5"/></svg>',
  rail: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="1.5" y1="6" x2="10.5" y2="6"/><circle cx="1.8" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="10.2" cy="6" r="1" fill="currentColor" stroke="none"/></svg>',
  divider: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="6" y1="1.5" x2="6" y2="10.5"/></svg>',
};

// Fase plegado: estado de colapso por módulo. Override explícito del usuario
// en moduleFoldState; sin override manda collapseDefault (colapsar listas
// largas), que render() setea según la cantidad de módulos.
const moduleFoldState = new Map();
let collapseDefault = false;

// E6.1 — Zoom del esquema frontal por módulo (factor 1 = ajustado; máx 4).
const SCHEME_ZOOM_MAX = 4;
const schemeZoomState = new Map();
function schemeZoomFor(moduleId) {
  const f = Number(schemeZoomState.get(String(moduleId))) || 1;
  return Math.min(SCHEME_ZOOM_MAX, Math.max(1, f));
}

function isModuleCollapsed(moduleId) {
  const key = String(moduleId);
  return moduleFoldState.has(key) ? moduleFoldState.get(key) : collapseDefault;
}

// Items de contenido de un módulo (cajones, zapateras, repisas, barras,
// zócalo, divisores) en orden de inserción = orden de apilado (abajo ->
// arriba). Comparten los chips y el esquema frontal del módulo.
function contentItemsForModule(moduleId, allPieces) {
  const items = [];
  for (const p of allPieces) {
    const id = String(p.id);
    let match = null;
    if (id.endsWith('-frente')) {
      // El frente 'm1cajon2-frente' pertenece al modulo 1; 'm11cajon1-...'
      // al 11 (greedy \d+ toma todos los digitos del prefijo).
      const root = id.match(/^m(\d+)/)?.[1];
      if (root === String(moduleId) && /(cajon|zapatera)\d+-frente$/.test(id)) {
        const kind = id.includes('zapatera') ? 'shoeRack' : 'drawer';
        match = { refId: id, label: p.nombre, key: id, kind };
      }
    } else if (/(cajon|zapatera)\d+-cara$/.test(id)) {
      // Cajón/zapatera SIN frente (bandeja abierta, default): la cara hace de
      // frente visible y referencia el chip — solo si el grupo no tiene frente.
      const root = id.match(/^m(\d+)/)?.[1];
      const pref = id.replace(/-cara$/, '');
      if (root === String(moduleId) && !allPieces.some((q) => String(q.id) === `${pref}-frente`)) {
        const kind = id.includes('zapatera') ? 'shoeRack' : 'drawer';
        match = { refId: id, label: p.nombre, key: id, kind };
      }
    } else if (/-repisa-\d+$/.test(id) && id.startsWith(`m${moduleId}-repisa-`)) {
      match = { refId: id, label: p.nombre, key: id, kind: 'shelf' };
    } else if (/-barra-(alta|baja)?-?\d*$/.test(id) && id.startsWith(`m${moduleId}-barra-`)) {
      // Solo listar la barra alta (o la simple): la baja va en pareja.
      if (!id.includes('-barra-baja')) match = { refId: id, label: p.nombre, key: id, kind: 'rail' };
    } else if (id === `m${moduleId}-zocalo`) {
      match = { refId: id, label: p.nombre, key: id, kind: 'zocalo' };
    } else if (/^m\d+-divisor-\d+$/.test(id) && id.startsWith(`m${moduleId}-divisor-`)) {
      match = { refId: id, label: p.nombre, key: id, kind: 'divider' };
    }
    if (match && !items.some((i) => i.key === match.key)) items.push(match);
  }
  return items;
}

function renderContentList(moduleId, allPieces) {
  const items = contentItemsForModule(moduleId, allPieces);
  if (!items.length) return '';
  // Sufijo del modo en el chip de la zapatera: detectable por geometría
  // (sobrevive al CSV; el modo no se persiste en las piezas). Bandeja SIN
  // frente cuya cara es MÁS BAJA que el lateral = cara-borde bajo de CSV
  // legacy (el constructor actual siempre emite la cara alta: cara = frente
  // − 2·E, mayor que el lateral bajo; en la bandeja a la vista van iguales,
  // sin sufijo).
  const sufijoModoZapatera = (refId) => {
    const pref = String(refId).replace(/-(frente|cara)$/, '');
    if (!/zapatera\d+$/.test(pref)) return '';
    if (allPieces.some((p) => p.id === `${pref}-frente`)) return '';
    const cara = allPieces.find((p) => p.id === `${pref}-cara`);
    const lat = allPieces.find((p) => p.id === `${pref}-lateral-izq`);
    if (cara && lat && Number(cara.alto) < Number(lat.alto)) return ` · borde ${Number(cara.alto)} mm`;
    return '';
  };
  // CHIPS en una sola fila que fluye (no una lista vertical): cada chip lleva
  // icono por tipo, nombre corto, altura real en el tooltip y el ✕ integrado.
  // El orden de izquierda a derecha es el orden de apilado (abajo -> arriba).
  return `
    <div class="cn-constructor__chips" role="list" aria-label="Contenido del módulo">
      ${items.map((i) => {
        const piece = allPieces.find((p) => p.id === i.refId);
        const altura = Number.isFinite(piece?.pos_z) ? ` · z=${Math.round(piece.pos_z)} mm` : '';
        const sufijo = i.kind === 'shoeRack' ? sufijoModoZapatera(i.refId) : '';
        return `
        <span class="cn-chip cn-chip--${i.kind}" role="listitem" data-ref="${escapeHtml(i.refId)}" title="${escapeHtml(i.label)}${altura}">
          <span class="cn-chip__icon" aria-hidden="true">${CONTENT_ICON[i.kind] || '·'}</span>
          <span class="cn-chip__label"${Number.isFinite(piece?.pos_z) ? ` data-posz="${Math.round(piece.pos_z)}"` : ''}>${escapeHtml(nombreCorto(i.label))}${sufijo}</span>
          ${i.kind === 'zocalo' || i.kind === 'divider' ? '' : `
            <button class="cn-chip__move" data-action="move-content" data-dir="down" data-ref="${escapeHtml(i.refId)}" title="Bajar en el apilado (queda antes / mas abajo)" aria-label="Bajar ${escapeHtml(i.label)}">◀</button>
            <button class="cn-chip__move" data-action="move-content" data-dir="up" data-ref="${escapeHtml(i.refId)}" title="Subir en el apilado (queda despues / mas arriba)" aria-label="Subir ${escapeHtml(i.label)}">▶</button>
            <button class="cn-chip__edit" data-action="edit-posz" data-ref="${escapeHtml(i.refId)}" title="Cambiar altura (pos_z) de ${escapeHtml(i.label)}" aria-label="Cambiar altura de ${escapeHtml(i.label)}">✎</button>`}
          <button class="cn-chip__remove" data-action="remove-content" data-ref="${escapeHtml(i.refId)}" title="Eliminar ${escapeHtml(i.label)}" aria-label="Eliminar ${escapeHtml(i.label)}">✕</button>
        </span>`;
      }).join('')}
    </div>
  `;
}

// Esquema frontal en vivo del módulo (spec "Esquema frontal" del prototipo):
// SVG con casco, zócalo y glifos del contenido apilado (mismo orden que los
// chips: el último item queda arriba). Fase interactiva: clic en un elemento
// lo QUITA (undo con Ctrl+Z) y la zona "＋" (tope de la pila) abre un menú
// para AÑADIR contenido con las prefs de la tarjeta. Derivado de las piezas.
function renderModuleScheme(moduleId, allPieces, piezas, menuOpen = false) {
  const tapa = piezas.find((p) => String(p.id).endsWith('-tapa'));
  const lateral = piezas.find((p) => String(p.id).endsWith('-lateral-izq'));
  if (!tapa || !lateral) return '';
  const ancho = Number(tapa.ancho) || 0;
  const alto = Number(lateral.alto) || 0;
  if (!ancho || !alto) return '';
  const zocalo = piezas.find((p) => p.id === `m${moduleId}-zocalo`);
  const items = contentItemsForModule(moduleId, allPieces).filter((i) => i.kind !== 'zocalo');
  const W = 200, H = 230, DIMS = 20;
  const ratio = Math.min(W / ancho, (H - DIMS) / alto);
  const w = ancho * ratio, h = alto * ratio;
  const x = (W - w) / 2, y = 6;
  const e = Math.max(2, 15 * ratio);
  const zk = zocalo ? Math.max(8, (Number(zocalo.alto) || 0) * ratio) : 0;
  const inner = { x: x + e, y: y + e, w: w - e * 2, h: h - e * 2 - zk };
  // La zona "añadir" ocupa una fila extra ARRIBA (el nuevo contenido se
  // apila en la cima); los items reparten el resto (abajo -> arriba).
  const n = Math.max(items.length, 1);
  const rowH = inner.h / (items.length + 1);
  const r1 = (v) => Math.round(v * 10) / 10;
  const glyphs = {
    shelf: (gy, rh) => `<line x1="${r1(inner.x)}" y1="${r1(gy + rh / 2)}" x2="${r1(inner.x + inner.w)}" y2="${r1(gy + rh / 2)}"/>`,
    drawer: (gy, rh) => `<rect x="${r1(inner.x + 5)}" y="${r1(gy + 3)}" width="${r1(inner.w - 10)}" height="${r1(rh - 6)}" rx="2"/><line x1="${r1(inner.x + inner.w / 2 - 8)}" y1="${r1(gy + rh / 2)}" x2="${r1(inner.x + inner.w / 2 + 8)}" y2="${r1(gy + rh / 2)}"/>`,
    shoeRack: (gy, rh) => `<line x1="${r1(inner.x + 3)}" y1="${r1(gy + rh * 0.3)}" x2="${r1(inner.x + inner.w - 3)}" y2="${r1(gy + rh * 0.55)}"/><line x1="${r1(inner.x + 3)}" y1="${r1(gy + rh * 0.65)}" x2="${r1(inner.x + inner.w - 3)}" y2="${r1(gy + rh * 0.9)}"/>`,
    rail: (gy, rh) => `<line x1="${r1(inner.x + 6)}" y1="${r1(gy + rh / 2)}" x2="${r1(inner.x + inner.w - 6)}" y2="${r1(gy + rh / 2)}"/><circle cx="${r1(inner.x + 6)}" cy="${r1(gy + rh / 2)}" r="2"/><circle cx="${r1(inner.x + inner.w - 6)}" cy="${r1(gy + rh / 2)}" r="2"/>`,
    divider: (gy, rh) => `<line x1="${r1(inner.x + inner.w / 2)}" y1="${r1(gy)}" x2="${r1(inner.x + inner.w / 2)}" y2="${r1(gy + rh)}"/>`,
  };
  const escId = escapeHtml(String(moduleId));
  const addZone = `
        <g class="cn-scheme__add" data-action="scheme-menu" data-module="${escId}" role="button"
           tabindex="-1" aria-label="Añadir contenido al módulo ${escId}" title="Añadir contenido (usa las preferencias de la tarjeta)">
          <rect x="${r1(inner.x)}" y="${r1(inner.y)}" width="${r1(inner.w)}" height="${r1(rowH - 2)}" rx="3"/>
          <text x="${r1(inner.x + inner.w / 2)}" y="${r1(inner.y + (rowH - 2) / 2 + 3)}" text-anchor="middle">＋</text>
        </g>`;
  // Zoom: el viewBox se encoge alrededor del centro (factor 1 = ajustado).
  const zoom = schemeZoomFor(moduleId);
  const vbW = r1(W / zoom), vbH = r1(H / zoom);
  const vbX = r1((W - vbW) / 2), vbY = r1((H - vbH) / 2);
  return `
    <figure class="cn-scheme">
      <figcaption class="cn-scheme__caption">
        <span>Esquema frontal</span>
        <span class="cn-scheme__hint">clic: quitar · ＋: añadir</span>
        <span class="cn-scheme__tools">
          <button type="button" class="cn-scheme__zoombtn" data-action="scheme-zoom" data-module="${escId}" data-dir="out" title="Alejar" aria-label="Alejar esquema">−</button>
          <button type="button" class="cn-scheme__zoombtn" data-action="scheme-zoom" data-module="${escId}" data-dir="reset" title="Ajustar a pantalla" aria-label="Ajustar esquema">${zoom > 1 ? Math.round(zoom * 100) + '%' : '⤢'}</button>
          <button type="button" class="cn-scheme__zoombtn" data-action="scheme-zoom" data-module="${escId}" data-dir="in" title="Acercar" aria-label="Acercar esquema">＋</button>
        </span>
      </figcaption>
      <svg viewBox="${vbX} ${vbY} ${vbW} ${vbH}" data-scheme-zoom="${zoom}" role="img" aria-label="Esquema frontal del módulo ${escId}">
        <rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" class="cn-scheme__body" rx="2"/>
        ${zocalo ? `<rect x="${r1(inner.x)}" y="${r1(y + h - e - zk)}" width="${r1(inner.w)}" height="${r1(zk)}" class="cn-scheme__zocalo"/>` : ''}
        ${addZone}
        ${items.length === 0
          ? `<text x="${W / 2}" y="${r1(inner.y + rowH + (inner.h - rowH) / 2)}" text-anchor="middle" class="cn-scheme__empty">Sin contenido — usá el ＋ para añadir</text>`
          : items.map((it, i) => {
              // El item 0 va abajo; el último queda justo debajo de la zona ＋.
              const idx = items.length - 1 - i;
              const gy = inner.y + rowH + idx * rowH;
              return `<g class="cn-scheme__row" data-action="scheme-remove" data-ref="${escapeHtml(it.refId)}"
                  role="button" tabindex="-1" aria-label="Quitar ${escapeHtml(nombreCorto(it.label))}" title="Quitar ${escapeHtml(nombreCorto(it.label))} (Ctrl+Z deshace)">
                  <rect class="cn-scheme__hit" x="${r1(inner.x)}" y="${r1(gy + 1)}" width="${r1(inner.w)}" height="${r1(rowH - 2)}" rx="3"/>
                  <g class="cn-scheme__glyph cn-scheme__glyph--${it.kind}">${glyphs[it.kind]?.(gy, rowH) ?? ''}</g>
                </g>`;
            }).join('')}
        <text x="${W / 2}" y="${Math.min(y + h + 13, H - 2)}" text-anchor="middle" class="cn-scheme__dims">${ancho} mm</text>
      </svg>
      ${menuOpen ? `
      <div class="cn-scheme-menu" role="menu" aria-label="Añadir contenido al módulo ${escId}">
        ${[['shelf', 'Repisa'], ['drawer', 'Cajón'], ['shoeRack', 'Zapatera'], ['rail', 'Barra'], ['doubleRail', 'Doble barra'], ['zocalo', 'Zócalo'], ['divider', 'Divisor']]
          .map(([k, l]) => `<button type="button" role="menuitem" class="cn-scheme-menu__opt" data-action="scheme-add" data-kind="${k}">＋ ${l}</button>`).join('')}
      </div>` : ''}
    </figure>`;
}

// "Frente zapatera extraible 2 M1" -> "Zapatera 2"; "Repisa 3 M1" -> "Repisa 3";
// "Barra colgadora 1 M1" -> "Barra 1". El tooltip conserva el nombre completo.
function nombreCorto(nombre) {
  let out = String(nombre || '');
  out = out.replace(/^Frente (?:\[[a-z][a-z0-9-]*\]\s*)?(cajon|zapatera extraible)( abatible)?/i, (m, g) => (g.toLowerCase().includes('zapatera') ? 'Zapatera' : 'Cajón'));
  out = out.replace(/^Barra (colgadora|alta|baja)/i, 'Barra');
  // El tag de contrato [tipo] es interno (sobrevive al CSV): no se muestra.
  out = out.replace(/\s*\[[a-z][a-z0-9-]*\]/i, '');
  out = out.replace(/\s*M\d+\s*$/, '');
  return out.trim();
}

// Muestra/oculta los campos de altura de la zapatera según el modo elegido
// (regla del spec: solo los parámetros pertinentes a cada modo). Campo
// 'alto' (alto de la bandeja/cara): visible en 'normal' (define la bandeja
// uniforme y el frente = alto + 30) y en 'personalizado'. El resto de campos
// de altura solo aplican al modo 'personalizado'. display inline por
// robustez (la clase .is-hidden no vive en el CSS del planner).
function toggleCamposZapatera(scoped, modo) {
  if (!scoped) return;
  scoped.querySelectorAll('[data-zapatera-campo]').forEach((el) => {
    const visible = el.dataset.zapateraCampo === 'alto'
      ? modo === 'normal' || modo === 'personalizado'
      : modo === 'personalizado';
    el.style.display = visible ? '' : 'none';
  });
}

function renderModuleCard(group, allPieces, cfg = {}, golaPreview = null, schemeMenuFor = null, revelada = true, golaErrorFor = null) {
  // Preferencias persistidas del formulario de contenido (se reutilizan al
  // crear cada módulo): vano, tipos, división, riel y N por fila.
  const prefVano = Number(cfg.contentVano) || 200;
  const prefNPorFila = Number(cfg.contentNPorFila) || 1;
  const prefDivision = Number(cfg.contentDivision) !== 0;
  // Repisa: refuerzo automático con luz ≥ 600 (default) y borde al frente del
  // módulo (default; desmarcado = retranqueo histórico de un espesor).
  const prefRefuerzoRepisa = cfg.contentRefuerzoRepisa != null ? Number(cfg.contentRefuerzoRepisa) !== 0 : true;
  const prefRepisaAlFrente = cfg.repisaAlFrente != null ? Number(cfg.repisaAlFrente) !== 0 : true;
  // Modo del frente de la zapatera. Default 'normal' (frente normal: como el
  // de un cajón — frente = vano − 3 y cara detrás a frente − 2·espesor). Los
  // prefs válidos ('normal'/'extendido'/'personalizado') se respetan; cualquier
  // pref legacy se mapea: con frente ('normas'/'frenteBajo'/'completo' o pref
  // desconocido) → 'normal'; los modos legacy sin frente ('borde'/'abierta')
  // con contentFrenteZapatera=0 → 'personalizado' (la bandeja sin frente vive
  // ahí ahora).
  const MODO_ZAPATERA_VALIDOS = ['normal', 'extendido', 'personalizado'];
  const prefModoZapatera = MODO_ZAPATERA_VALIDOS.includes(cfg.contentModoZapatera)
    ? cfg.contentModoZapatera
    : (['borde', 'abierta'].includes(cfg.contentModoZapatera) && Number(cfg.contentFrenteZapatera) === 0
        ? 'personalizado'
        : 'normal');
  const prefConFrenteZapatera = Number(cfg.contentFrenteZapatera) !== 0;
  const zapPersoVisible = prefModoZapatera === 'personalizado';
  const zapAltoVisible = zapPersoVisible || prefModoZapatera === 'normal';
  const numPref = (v) => (Number(v) > 0 ? Number(v) : '');
  // Método del fondo del cajón (persistido; default apoyado — el checkbox
  // 'Fondo ranurado' es elección del usuario por sesión).
  const prefFondoRanurado = cfg.contentFondoRanurado != null
    ? Number(cfg.contentFondoRanurado) !== 0
    : false;
  const sel = (actual, value) => (actual === value ? 'selected' : '');
  const moduleId = group.id;
  const piezas = allPieces.filter((p) => String(p.modulo) === String(moduleId));
  // Contar por tipo en TODO el mueble (las piezas de caja viven en
  // submodulos '11'/'12', fuera del modulo raiz). Cajón/zapatera: unidades por
  // GRUPO (prefijo m{mod}cajonN/zapateraN); por frente no sirve: la zapatera
  // de bandeja abierta no lleva frente (contaba 0) y el 2-por-fila lleva 2
  // frentes en un solo grupo. Por grupo se cuenta max(frentes, caras): botas/
  // marco tienen frente sin cara, la abierta tiene cara sin frente, y el
  // 2-por-fila conserva su doble cuenta. Repisa/barra: cada pieza.
  const countByKind = (kind) => {
    const pref = { shelf: `m${moduleId}-repisa-`, rail: `m${moduleId}-barra-`, divider: `m${moduleId}-divisor-` }[kind];
    if (kind !== 'drawer' && kind !== 'shoeRack') {
      return allPieces.filter((p) => String(p.id).startsWith(pref)).length;
    }
    const re = new RegExp(`^m${moduleId}${kind === 'drawer' ? 'cajon' : 'zapatera'}\\d+(?=-|$)`);
    const grupos = new Map();
    for (const p of allPieces) {
      const g = String(p.id).match(re)?.[0];
      if (!g) continue;
      const e = grupos.get(g) || { frente: 0, cara: 0 };
      if (p.id.endsWith('-frente')) e.frente += 1;
      else if (p.id.endsWith('-cara')) e.cara += 1;
      grupos.set(g, e);
    }
    return [...grupos.values()].reduce((n, e) => n + Math.max(e.frente, e.cara), 0);
  };
  const altoModulo = piezas.find((p) => p.id.endsWith('lateral-izq'))?.alto || null;
  // Zócalo: frente simple del módulo o marco estructural global (el marco
  // reemplaza al frente simple; mismo anclaje del vano).
  const zocaloSimple = piezas.find((p) => p.id === `m${moduleId}-zocalo`);
  const marcoZ = Math.max(0, ...piezas.filter((p) => /^glb-zocalo(-s\d+)?-frente(-[ab])?$/.test(String(p.id))).map((p) => Number(p.alto) || 0));
  const tieneZocalo = Boolean(zocaloSimple) || marcoZ > 0;
  const altoZocalo = zocaloSimple ? Number(zocaloSimple.alto) || 0 : marcoZ;
  const vanoInfo = altoModulo ? vanoUsado(allPieces, moduleId, altoModulo, tieneZocalo, altoZocalo) : null;
  // Sistema gola: solo si el módulo tiene >= 2 unidades-cajón (el caso de 1
  // cajón/L-gola lo soporta el servicio, pero la UI lo reserva a pilas).
  const golaUnidades = drawerUnits(allPieces, moduleId).length;
  // El gola es SOLO entre cajones: el toggle se ofrece con ≥2 cajones
  // móviles (las zapateras no forman canal ni entre ellas ni con cajones).
  const golaCajones = drawerUnits(allPieces, moduleId).filter((u) => !esUnidadFijaGola(u)).length;
  const golaOn = isGolaEnabled(allPieces, moduleId);
  const golaPreviewHere = golaPreview && String(golaPreview.moduleId) === String(moduleId);
  // Config efectiva del módulo: global ← overrides propios (el panel edita el
  // módulo; sin overrides muestra los valores globales, como antes).
  const golaCfg = getGolaCfg(cfg, loadGolaModuleCfgs()[String(moduleId)] || {});
  const collapsed = isModuleCollapsed(moduleId);
  // Oculto (display:none) hasta que se selecciona desde el riel: la sección
  // 02 solo muestra el módulo activo; el resto queda en el DOM.
  const concealed = !revelada ? ' cn-constructor__module--concealed' : '';
  return `
    <div class="cn-constructor__module${collapsed ? ' is-collapsed' : ''}${concealed}" data-module-scoped="${escapeHtml(moduleId)}">
      <div class="cn-constructor__module-head">
        <button class="btn btn--icon btn--sm cn-module-collapse" data-action="toggle-collapse" data-module="${escapeHtml(moduleId)}"
          aria-expanded="${collapsed ? 'false' : 'true'}"
          title="${collapsed ? 'Expandir preferencias del módulo' : 'Contraer preferencias del módulo'}"
          aria-label="${collapsed ? 'Expandir preferencias del módulo' : 'Contraer preferencias del módulo'}">${collapsed ? '▸' : '▾'}</button>
        <strong>${escapeHtml(group.label)}</strong>
        ${vanoInfo ? `<span class="badge ${vanoInfo.pct > 90 ? 'badge--danger' : vanoInfo.pct > 70 ? 'badge--warning' : 'badge--secondary'}">vano ${vanoInfo.usado}/${vanoInfo.util} mm (${vanoInfo.pct}%)</span>` : ''}
        <span class="cn-constructor__spacer"></span>
        <span class="cn-module-actions">
          <button class="btn btn--icon btn--sm" data-action="focus-module" data-module="${escapeHtml(moduleId)}" title="Ver este módulo en la vista isométrica" aria-label="Ver módulo en isométrica">👁</button>
          <button class="btn btn--icon btn--sm" data-action="edit-module" data-module="${escapeHtml(moduleId)}" title="Editar dimensiones del casco" aria-label="Editar dimensiones del casco">✎</button>
          <button class="btn btn--icon btn--sm" data-action="move-module" data-module="${escapeHtml(moduleId)}" data-dir="inicio" title="Mover al principio" aria-label="Mover módulo al principio">⇤</button>
          <button class="btn btn--icon btn--sm" data-action="move-module" data-module="${escapeHtml(moduleId)}" data-dir="izq" title="Mover a la izquierda" aria-label="Mover módulo a la izquierda">◀</button>
          <button class="btn btn--icon btn--sm" data-action="move-module" data-module="${escapeHtml(moduleId)}" data-dir="der" title="Mover a la derecha" aria-label="Mover módulo a la derecha">▶</button>
          <button class="btn btn--icon btn--sm" data-action="move-module" data-module="${escapeHtml(moduleId)}" data-dir="fin" title="Mover al final" aria-label="Mover módulo al final">⇥</button>
          <button class="btn btn--icon btn--sm" data-action="recolor-module" data-module="${escapeHtml(moduleId)}" title="Recolorear con el color Cuerpo del grupo Módulo" aria-label="Recolorear módulo">🎨</button>
          <button class="btn btn--icon btn--sm" data-action="duplicate-module" data-module="${escapeHtml(moduleId)}" title="Duplicar módulo" aria-label="Duplicar módulo">⿻</button>
          <button class="btn btn--icon btn--sm btn--danger" data-action="remove-module" data-module="${escapeHtml(moduleId)}" title="Eliminar módulo" aria-label="Eliminar módulo">🗑</button>
        </span>
      </div>
      <div class="cn-constructor__module-prefs">
        <fieldset class="cn-pref-group">
          <legend>Contenido</legend>
          <div class="cn-pref-group__fields">
            <label class="form-group" style="margin:0;" title="Altura del vano en mm (libre; los tipos de cajón/zapatera lo llenan automáticamente)">Vano (mm)
              <input type="number" data-alto-vano list="cn-vanos-sugeridos" value="${prefVano}" min="50" max="600" step="10" />
              <datalist id="cn-vanos-sugeridos">
                ${ALTO_VANO_OPCIONES.map((h) => `<option value="${h}"></option>`).join('')}
              </datalist>
            </label>
            <label class="form-group" style="margin:0;" title="Distancia desde la cara inferior de la tapa (alzamiento/maletero; gana sobre Sep. anterior)">Inset tapa (mm)
              <input type="number" data-inset-tapa placeholder="auto" min="0" max="2000" step="10" />
            </label>
            <label class="form-group" style="margin:0;" title="Distancia desde la cara superior de la pieza anterior (0 o vacio = gap por defecto)">Sep. anterior (mm)
              <input type="number" data-separacion placeholder="auto" min="0" max="2000" step="10" />
            </label>
            <label class="form-group" style="margin:0;">Cuerpo
              <input type="color" data-color-cuerpo value="#c19a6b" />
            </label>
            ${golaCajones >= 2 ? `
            <label class="form-group cn-toggle" style="margin:0;" title="Sistema gola: canales de melamina entre frentes de cajones (sin tiradores — tipo C retranqueado con su agarre; sobre el último frente queda el gap habitual)">
              <input type="checkbox" data-action="toggle-gola" data-module="${escapeHtml(moduleId)}" ${golaOn || golaPreviewHere ? 'checked' : ''} />
              <span class="cn-toggle__text"><span class="cn-toggle__label">Gola</span></span>
            </label>` : ''}
            ${golaErrorFor ? `
            <div class="cn-pref-group__gola-error">
              <p class="cn-gola-error__msg">⚠ ${golaErrorFor.errors.map((e2) => escapeHtml(e2)).join(' ')}</p>
              <div class="cn-gola-error__fixes">
                ${golaErrorFor.fixes.map((f) => `<button type="button" class="btn btn--primary btn--sm" data-action="apply-gola-fix" data-module="${escapeHtml(moduleId)}" data-fix-id="${escapeHtml(f.id)}" data-fix-mm="${Number(f.mm) || 0}">${escapeHtml(f.label)}</button>`).join('')}
              </div>
            </div>` : ''}
            <label class="form-group cn-toggle" style="margin:0;" title="La repisa llega hasta el borde frontal del módulo (cara trasera contra el fondo embutido). Desmarcado: retranqueo histórico de un espesor (15 mm detrás del frente)">
              <input type="checkbox" data-repisa-al-frente ${prefRepisaAlFrente ? 'checked' : ''} />
              <span class="cn-toggle__text"><span class="cn-toggle__label">Repisa al frente</span></span>
            </label>
            <label class="form-group cn-toggle" style="margin:0;" title="Refuerzo interior de 100 mm en repisas con luz ≥ 600 mm (evita el pandeo; el validador lo exige a partir de esa luz con espesor ≤ 15). Desmarcado = repisa sin refuerzo">
              <input type="checkbox" data-refuerzo-repisa ${prefRefuerzoRepisa ? 'checked' : ''} />
              <span class="cn-toggle__text"><span class="cn-toggle__label">Refuerzo repisa</span></span>
            </label>
            <div class="cn-constructor__content-btns cn-pref-group__actions">
              <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shelf">+ Repisa (${countByKind('shelf')})</button>
              <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="drawer">+ Cajón (${countByKind('drawer')})</button>
              <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shoeRack">+ Zapatera (${countByKind('shoeRack')})</button>
              <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="rail">+ Barra (${countByKind('rail')})</button>
              <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="doubleRail">+ Doble barra</button>
              <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="zocalo">+ Zócalo</button>
              <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="divider" title="Divisor vertical de bahias (span completo del vano)">+ Divisor (${countByKind('divider')})</button>
            </div>
          </div>
        </fieldset>
        <fieldset class="cn-pref-group">
          <legend>Cajón</legend>
          <div class="cn-pref-group__fields">
            <div class="form-group" style="margin:0;" title="Mecanismo de apertura — SOLO cajones (la zapatera siempre es corredera; el volquete no aplica)">Mecanismo
              ${segmentedControl('Mecanismo de apertura', 'data-mecanismo', TIPOS_CAJON, TIPOS_CAJON[0].value)}
            </div>
            <label class="form-group" style="margin:0;" title="El riel DEFINE las medidas de la caja del cajón/zapatera (descuentos por holgura y largo del fondo). 'Marco regulable' = herraje de catálogo para zapateras: sin cajón, solo el frente.">Riel / herraje
              <select data-tipo-riel>
                <option value="catalogo" ${sel(cfg.contentRiel || 'catalogo', 'catalogo')}>Catálogo (estándar del proyecto)</option>
                <option value="telescopica26" ${sel(cfg.contentRiel, 'telescopica26')}>Telescópica balines (−26 mm, fondo = riel)</option>
                <option value="oculta" ${sel(cfg.contentRiel, 'oculta')}>Oculta bajo cajón (−10 mm, cierre suave)</option>
                <option value="marco" ${sel(cfg.contentRiel, 'marco')}>Marco aluminio regulable (zapatera, sin cajón)</option>
              </select>
            </label>
            <label class="form-group" style="margin:0;" title="Profundidad de la caja del cajón/zapatera. Vacío = automática por regla del riel (telescópica −26, etc.). Al fijarla, la 'Holgura fondo' se recalcula con lo que sobra hasta el fondo del módulo — y al editar la holgura se recalcula esta profundidad. El valor se guarda en el frente (tag [profN]) y sobrevive al CSV y a ediciones">Prof. caja (mm)
              <input type="number" data-prof-caja value="${Number(cfg.contentProfCaja) > 0 ? Number(cfg.contentProfCaja) : ''}" placeholder="auto (riel)" min="100" step="5" />
            </label>
            <label class="form-group" style="margin:0;" title="Holgura lateral del herraje POR LADO (lo que la corredera descuenta entre la caja y el lateral del módulo). Vacío = regla del tipo de riel (catálogo 12,7 mm/lado; telescópica 26 13 mm/lado). Fíjala si tu riel física difiere — la caja y su posición se calculan con tu valor. Se guarda en el frente (tag [rielN]) y sobrevive al CSV y a ediciones">Holgura riel (mm/lado)
              <input type="number" data-riel-holgura value="${Number(cfg.contentRielHolgura) > 0 ? Number(cfg.contentRielHolgura) : ''}" placeholder="regla del tipo" min="0" max="30" step="0.5" />
            </label>
            <label class="form-group" style="margin:0;" title="Espacio recomendado entre la cara trasera de la caja (cajón/zapatera) y el fondo del módulo. 10 mm = regla de taller (tolerancias de corte, montaje y ventilación); el riel 'Catálogo' conserva su regla propia de 25 mm. Si fijas 'Prof. caja', este valor es el SOBRANTE (editable: recalcula la profundidad)">Holgura fondo (mm)
              <input type="number" data-holgura-fondo value="${Number(cfg.holguraFondoCajon ?? 10)}" min="0" max="50" step="1" />
            </label>
            <label class="form-group cn-toggle" style="margin:0;" title="Sistema de montaje del fondo (solo cajones). Apoyado: fondo sobre la base, interno a los laterales. Ranurado: fondo embutido en ranura corrida en cada lateral — se corta más ancho (cantos enterrados) y sube casi a la cara superior del lateral">
              <input type="checkbox" data-fondo-ranurado ${prefFondoRanurado ? 'checked' : ''} />
              <span class="cn-toggle__text">
                <span class="cn-toggle__label">Fondo ranurado</span>
                <span class="cn-toggle__desc">Ranura corrida: más rigidez.</span>
              </span>
            </label>
            <label class="form-group" style="margin:0;" title="Cajones por fila: 2 divide el ancho del vano en dos frentes (modulos anchos)">N por fila
              <select data-n-por-fila>
                <option value="1" ${prefNPorFila === 1 ? 'selected' : ''}>1</option>
                <option value="2" ${prefNPorFila === 2 ? 'selected' : ''}>2</option>
              </select>
            </label>
            <label class="form-group" style="margin:0;" title="Luz perimetral del frente por lado respecto del vano interior (spec gola: 3 mm)">Luz frente (mm)
              <input type="number" data-luz-frente value="${Number(cfg.drawerFrontLuz ?? 1)}" min="0.5" max="5" step="0.5" />
            </label>

            <label class="form-group" style="margin:0;" title="Espesor del frente decorativo (puede diferir del cuerpo: frente 18 con cuerpo 15 es lo mas comun)">Esp. frente
              <select data-espesor-frente>
                <option value="15" selected>15 mm</option>
                <option value="18">18 mm</option>
                <option value="25">25 mm</option>
              </select>
            </label>
            <label class="form-group" style="margin:0;" title="Color del frente decorativo de cajones/zapateras">Frente
              <input type="color" data-color-frente value="#8b5a2b" />
            </label>
          </div>
        </fieldset>
        <fieldset class="cn-pref-group">
          <legend>Zapatera</legend>
          <div class="cn-pref-group__fields">
            <label class="form-group" style="margin:0;" title="Modo de construcción del frente de la zapatera. Frente normal (default): el frente mide 30 mm más que la bandeja (alto zapatera + 30) y NO cubre el vano — el aire superior queda abierto para el calzado; la bandeja va de borde uniforme (cara = laterales = fondo = división al alto zapatera). Frente extendido (= botas): el frente completa el vano hasta arriba (vano − 1, holgura mínima). Personalizado: alturas independientes (frente, laterales, fondo y división). Bandeja a la vista = desmarcar 'Frente zapatera' (la cara queda de frente visible)">Modo zapatera
              <select data-modo-zapatera data-modo-default="${prefModoZapatera}">
                <option value="normal" ${sel(prefModoZapatera, 'normal')}>Frente normal</option>
                <option value="extendido" ${sel(prefModoZapatera, 'extendido')}>Frente extendido</option>
                <option value="personalizado" ${sel(prefModoZapatera, 'personalizado')}>Personalizado</option>
              </select>
            </label>
            <label class="form-group cn-toggle" style="margin:0;" title="Frente decorativo de la zapatera (sin tirador: se jala del borde). Desmarcado = bandeja a la vista: la cara queda como frente visible y de agarre (el tipo 'bandeja a la vista' lo desmarca por defecto)">
              <input type="checkbox" data-con-frente-zapatera ${prefConFrenteZapatera ? 'checked' : ''} />
              <span class="cn-toggle__text"><span class="cn-toggle__label">Frente zapatera</span></span>
            </label>
            <label class="form-group" style="margin:0;" title="División central (por defecto): apoyo paralelo al fondo a media profundidad para la fila delantera de zapatos; la fila trasera se apoya en el fondo">División
              <input type="checkbox" data-division ${prefDivision ? 'checked' : ''} />
            </label>
            <label class="form-group" style="margin:0;${zapPersoVisible ? '' : 'display:none;'}" data-zapatera-campo="personalizado" title="Altura del frente decorativo (vacío = alto zapatera + 30 en 'Frente normal', vano − 1 en 'Frente extendido'). Con 'Frente zapatera' desmarcado define el alto de la CARA (bandeja a la vista; vacío = cara alta = vano − 3 − 2·E)">Alto frente / cara (mm)
              <input type="number" data-alto-frente-zapatera value="${numPref(cfg.contentAltoFrenteZapatera)}" placeholder="según modo" min="50" step="5" />
            </label>
            <label class="form-group" style="margin:0;${zapAltoVisible ? '' : 'display:none;'}" data-zapatera-campo="alto" title="Altura de la zapatera (cara/bandeja): en 'Frente normal' la bandeja va de borde uniforme a este alto y el frente mide alto + 30 mm (vacío = 100 mm, alto de riel); en 'Personalizado' es el alto de los laterales">Alto zapatera (mm)
              <input type="number" data-alto-lateral-zapatera value="${numPref(cfg.contentAltoLateralZapatera) || RAIL_SIDE_HEIGHT}" min="40" step="5" />
            </label>
            <label class="form-group" style="margin:0;${zapPersoVisible ? '' : 'display:none;'}" data-zapatera-campo="personalizado" title="Altura del borde trasero / fondo de la bandeja (vacío = laterales)">Alto fondo (mm)
              <input type="number" data-alto-fondo-zapatera value="${numPref(cfg.contentAltoFondoZapatera)}" placeholder="= laterales" min="20" step="5" />
            </label>
            <label class="form-group" style="margin:0;${zapPersoVisible ? '' : 'display:none;'}" data-zapatera-campo="personalizado" title="Altura de la división transversal (vacío = laterales)">Alto división (mm)
              <input type="number" data-alto-division-zapatera value="${numPref(cfg.contentAltoDivisionZapatera)}" placeholder="= laterales" min="20" step="5" />
            </label>
          </div>
        </fieldset>
        <fieldset class="cn-pref-group">
          <legend>Módulo</legend>
          <div class="cn-pref-group__fields">
            <div class="cn-pref-group__scheme">
              ${renderModuleScheme(moduleId, allPieces, piezas, schemeMenuFor === String(moduleId))}
            </div>
          </div>
        </fieldset>
      </div>
      <div class="cn-constructor__module-main">
        ${renderContentList(moduleId, allPieces)}
        ${golaPreviewHere ? renderGolaPreviewPanel(golaPreview) : ''}
        ${golaOn && golaUnidades >= 2 ? renderGolaPanel(golaCfg) : ''}
        ${renderEditForm(moduleId, piezas)}
      </div>
    </div>
  `;
}

// Panel de parámetros del sistema gola (visible solo con gola activo en el
// módulo). Reusa el estilo del formulario de edición de dimensiones; muestra
// la config efectiva del módulo (global ← overrides) y los valores escriben
// overrides del módulo vía [data-gola-cfg] (onChange → setGolaModuleConfig).
function renderGolaPanel(cfg = {}) {
  return `
    <div class="cn-constructor__edit-form" data-gola-panel>
      ${GOLA_CFG_FIELDS.map(([key, label, min, step]) => `
        <label class="form-group" style="margin:0;" title="${key}">${label}
          <input type="number" data-gola-cfg="${key}" value="${Number(cfg[key]) || ''}" min="${min}" step="${step}" />
        </label>`).join('')}
      <label class="form-group" style="margin:0;" title="Fijación de los perfiles (preferencia de texto persistida)">Fijación
        <input type="text" data-gola-cfg="golaFijacion" value="${escapeHtml(cfg.golaFijacion || '')}" placeholder="Tornillos 3.5×16…" />
      </label>
      <small>Canales tipo C de melamina SOLO entre cajones: fondo interno + 2 alas (3 piezas); sobre el último frente queda el gap habitual. Los frentes crecen +30 mm: el labio cuelga sobre el canal (frente = cara + 60) y forma el agarre; los dedos entran por el gap visible (entrada configurable). Parámetros editables abajo.</small>
    </div>
  `;
}

// Panel de confirmación de la vista previa gola (dry-run de app.js): resume
// perfiles creados, gap/agarre y el reescalado de frentes antes de activar.
// Reusa el estilo del formulario de edición; sin estilos inline (clases CSS
// cn-gola-preview__*). Cada frente lleva su id para desambiguar homónimos de
// distintos submódulos, y los que no cambian se atenúan en vez de repetir
// "X → X mm".
function renderGolaPreviewPanel(preview) {
  const { plan, warnings } = preview;
  const frentes = plan.frentes.map((f) => {
    const cambia = Number(f.antes) !== Number(f.despues);
    const medida = cambia
      ? `<strong>${f.antes} → ${f.despues} mm</strong>`
      : `<span class="cn-gola-preview__sin-cambio">${f.antes} mm · sin cambios</span>`;
    return `<li>${medida} <span class="cn-gola-preview__frente">${escapeHtml(f.nombre)}</span> <code class="cn-gola-preview__id">${escapeHtml(f.id)}</code></li>`;
  }).join('');
  return `
    <div class="cn-constructor__edit-form cn-gola-preview" data-gola-preview>
      <p class="cn-gola-preview__titulo"><strong>Vista previa — sistema gola</strong></p>
      <p class="cn-gola-preview__resumen">Se crearán ${plan.tiras} canal(es) tipo C entre cajones (fondo + 2 alas de melamina) — gap visible de ${plan.gapGola} mm (la entrada de dedos: la gola tapa el espacio detrás de los frentes), agarre de ${plan.agarre} mm. Canales solo entre cajones. Los frentes crecen +30 mm: el labio cuelga sobre el canal. Sobre el último frente queda el gap habitual (sin canal L). Los frentes quedarán:</p>
      <ul class="cn-gola-preview__frentes">${frentes}</ul>
      ${(warnings || []).length ? `
      <div class="cn-constructor__warnings cn-gola-preview__warnings">
        <strong>Avisos:</strong>
        <ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      </div>` : ''}
      <div class="cn-constructor__content-btns">
        <button class="btn btn--primary btn--sm" data-action="confirm-gola" data-module="${escapeHtml(preview.moduleId)}">Aplicar gola</button>
        <button class="btn btn--secondary btn--sm" data-action="cancel-gola">Cancelar</button>
      </div>
    </div>
  `;
}

// Formulario oculto de edicion de dimensiones del casco (M3). Solo casco:
// el contenido agregado se conserva; el usuario lo reajusta si quiere.
// Riel izquierdo del Constructor (spec LeftRail): lista compacta de módulos
// raíz con numeración, dimensiones y conteo de contenido. Clic = bajar a la
// tarjeta del módulo y resaltarla; "Añadir" baja al formulario de nuevo
// módulo. Sin lógica de negocio: solo navegación dentro de la vista.
function renderModuleRail(groups, pieces, selectedModuleId = null) {
  return `
    <section class="cn-rail__section">
      <div class="cn-rail__head">
        <h3 class="t-label">Módulos</h3>
        <button class="btn btn--secondary btn--sm" data-action="rail-add-module">+ Añadir</button>
      </div>
      ${groups.length === 0
        ? '<p class="cn-rail__empty">Sin módulos todavía.</p>'
        : `<ul class="cn-rail__list">
            ${groups.map((g, i) => {
              const mods = pieces.filter((p) => String(p.modulo) === String(g.id));
              const tapa = mods.find((p) => String(p.id).endsWith('-tapa'));
              const lat = mods.find((p) => String(p.id).endsWith('-lateral-izq'));
              const dims = tapa && lat ? `${tapa.ancho} × ${lat.alto} × ${tapa.alto}` : '';
              const count = contentItemsForModule(g.id, pieces).length;
              const activo = String(g.id) === String(selectedModuleId);
              return `
              <li>
                <button class="cn-rail__module${activo ? ' cn-rail__module--active' : ''}" data-action="rail-focus-module" data-module="${escapeHtml(g.id)}"
                  title="Ir a ${escapeHtml(g.label)}" aria-current="${activo ? 'true' : 'false'}">
                  <span class="cn-rail__num">${String(i + 1).padStart(2, '0')}</span>
                  <span class="cn-rail__name">
                    <span class="cn-rail__label">${escapeHtml(g.label)}</span>
                    ${dims ? `<span class="cn-rail__dims">${dims}</span>` : ''}
                  </span>
                  ${count ? `<span class="cn-rail__count">${count}</span>` : ''}
                </button>
              </li>`;
            }).join('')}
          </ul>`}
    </section>`;
}

function renderEditForm(moduleId, piezas) {
  const tapa = piezas.find((p) => p.id.endsWith('-tapa'));
  const lateral = piezas.find((p) => p.id.endsWith('-lateral-izq'));
  if (!tapa || !lateral) return '';
  // Convención 2026-11: la tapa va EMBUTIDA — el ancho del módulo se
  // deriva del FONDO (embutido: ancho + 2E), no de la tapa.
  const fondo = piezas.find((p) => p.id.endsWith('-fondo'));
  const e = Number(tapa.espesor) || 15;
  const anchoModulo = fondo ? (Number(fondo.ancho) || 0) + 2 * e : Number(tapa.ancho) || 0;
  // Convención 2026-11: con marco estructural el lateral mide el CASCO
  // (apoyado sobre el marco). El campo Alto muestra la altura TOTAL del
  // mueble (casco + marco) y apply-edit descuenta el marco al regenerar.
  const marcoH = hasPlinthFrame(piezas) ? marcoZocaloHeight(piezas) : 0;
  const altoTotal = (Number(lateral.alto) || 0) + marcoH;
  return `
    <div class="cn-constructor__edit-form is-hidden" data-edit-form>
      <label class="form-group" style="margin:0;">Ancho
        <input type="number" data-edit-ancho value="${anchoModulo}" min="100" step="10" />
      </label>
      <label class="form-group" style="margin:0;" title="${marcoH ? `Con marco estructural: altura TOTAL (casco ${Number(lateral.alto)} + marco ${marcoH})` : 'Altura del módulo'}">Alto${marcoH ? ' (total)' : ''}
        <input type="number" data-edit-alto data-marco-h="${marcoH}" value="${altoTotal}" min="100" step="10" />
      </label>
      <label class="form-group" style="margin:0;">Prof.
        <input type="number" data-edit-prof value="${Number(tapa.alto)}" min="100" step="10" />
      </label>
      <button class="btn btn--primary btn--sm" data-action="apply-edit-module" data-module="${escapeHtml(moduleId)}">Aplicar</button>
      <small>Casco y contenido interior (cajones, repisas, barras) se adaptan al nuevo vano.</small>
    </div>
  `;
}

// Alto util estimado del modulo y vano ocupado por frentes de cajon.
// Alto util ocupado calculado sobre los spans reales (pos_z + alto) de las
// piezas ancladas: unión de intervalos, sin solapamientos. Antes se estimaba
// sumando frentes + espesores fijos, lo que subestimaba el % cuando habia
// separaciones grandes (Sep. anterior) o piezas editadas con ✎.
function vanoUsado(pieces, moduleId, altoModulo, tieneZocalo, altoZocalo) {
  const espesor = 15;
  const util = altoModulo - (tieneZocalo ? altoZocalo : 0) - espesor; // tapa
  const prefFrentes = [`m${moduleId}cajon`, `m${moduleId}zapatera`];
  const prefRepisa = `m${moduleId}-repisa-`;
  const spans = [];
  let estimado = 0; // fallback para piezas sin pos_z (CSV del catalogo)
  let haySpans = false;
  for (const p of pieces) {
    const id = String(p.id);
    const esFrente = id.endsWith('-frente') && prefFrentes.some((pref) => id.startsWith(pref));
    const esRepisa = id.startsWith(prefRepisa);
    if (!esFrente && !esRepisa) continue;
    const alto = esFrente ? (Number(p.alto) || 0) + 3 : espesor;
    if (Number.isFinite(p.pos_z)) {
      haySpans = true;
      spans.push([Number(p.pos_z), Number(p.pos_z) + alto]);
    } else {
      estimado += esFrente ? alto : espesor + 20;
    }
  }
  let usado;
  if (haySpans) {
    // Union de intervalos ordenados: suma solo la cobertura real.
    spans.sort((x, y) => x[0] - y[0]);
    usado = 0;
    let curStart = null;
    let curEnd = null;
    for (const [s, e] of spans) {
      if (curStart === null) { curStart = s; curEnd = e; continue; }
      if (s <= curEnd) curEnd = Math.max(curEnd, e);
      else { usado += curEnd - curStart; curStart = s; curEnd = e; }
    }
    if (curStart !== null) usado += curEnd - curStart;
    usado = Math.max(usado, estimado);
  } else {
    usado = estimado;
  }
  const pct = util > 0 ? Math.min(100, Math.round((usado / util) * 100)) : 0;
  return { usado: Math.round(usado), util, pct };
}

// Resumen del zócalo estructural para la cabecera de su tarjeta: muestra la
// forma definida (ancho × profundidad × alto Z, espesor) y la división, no
// las restas de corte — esas viven solo en el despiece.
function resumenPlinth(pieces, state = {}) {
  if (!hasPlinthFrame(pieces)) return 'frente simple por módulo';
  const spec = plinthFrameSpec(pieces);
  const niveladores = plinthLevelerCount(pieces);
  if (!spec) return `${niveladores} niveladores`;
  const forma = `${spec.ancho}×${spec.profundidad}×${spec.altoZocalo} mm (e${spec.espesor})`;
  if (spec.nZocalos > 1) {
    return `${spec.nZocalos} zócalos de ~${Math.round(spec.luzMax)} mm ${forma} · ${niveladores} niveladores`;
  }
  return `zócalo único ${forma} · ${niveladores} niveladores`;
}

// Verificación de levantamiento en vertical por módulo (restricción de
// diagonal con el techo). Muestra alto del cuerpo, diagonal y holgura; solo
// aparece cuando se cargó la altura de techo de la obra.
function renderLiftCheck(pieces, state = {}) {
  const cfg = state.userConfig || {};
  // Con zócalo a marco, la altura la define el propio marco (Z): los datos
  // de obra dejan de aplicar.
  if (hasPlinthFrame(pieces)) return '<p class="empty-state">Con zócalo a marco, la altura la define el marco (Z): los datos de obra no aplican.</p>';
  const hTecho = Number(cfg.obraHTecho) || 0;
  if (!hTecho) return '<p class="empty-state">Sin altura de techo: cargue H techo para verificar la diagonal de levantamiento y el rango de Z.</p>';
  const dims = rootModuleDims(pieces);
  if (!dims.length) return '<p class="empty-state">Agregue módulos para verificar el levantamiento.</p>';
  const altoZocalo = Number(cfg.plinthAltoZocalo) || 100;
  const lineas = dims.map((d) => {
    const r = computeLiftCheck({
      altoModulo: d.alto, altoZocalo, profundidad: d.profundidad, hTecho,
      margenSeg: Number(cfg.obraMargenSeg ?? 20),
      margenAjuste: Number(cfg.obraMargenAjuste ?? 10),
      zMin: Number(cfg.obraZmin ?? 60),
      zMax: Number(cfg.obraZmax ?? 150),
    });
    const ok = r.levantamientoOk && r.zEnRango;
    const holgura = r.holgura == null ? '' : ` · holgura ${r.holgura.toFixed(0)} mm`;
    const diagonal = r.diagonal == null ? '' : ` · diagonal ${r.diagonal.toFixed(0)} mm`;
    return `<li>${ok ? '✓' : '✕'} M${d.id}: cuerpo ${r.altoCuerpo} mm${diagonal}${holgura}${ok ? '' : ` — ${escapeHtml(r.warnings.join(' '))}`}</li>`;
  });
  return `<ul class="cn-constructor__liftcheck">${lineas.join('')}</ul>`;
}

function resumenMueble(pieces, state = {}) {
  const modulos = countRootModules(pieces);
  if (!modulos) return 'Sin módulos';
  const ancho = anchoTotal(pieces);
  const nombre = getFurnitureName();
  const hardware = resumenHardware(state.hardware || []);
  return `${nombre ? escapeHtml(nombre) + ' · ' : ''}${modulos} módulo(s) · ${pieces.length} piezas · ≈${ancho} mm${hardware ? ' · ' + hardware : ''}`;
}

// Cuenta herrajes clave del state.hardware (calculateHardware ya corre en
// recalculateAll): correderas, tiradores, barras y bisagras.
function resumenHardware(hardware) {
  const pick = (re) => hardware.filter((h) => re.test(h.nombre)).reduce((n, h) => n + (h.cantidad || 0), 0);
  const partes = [];
  const correderas = pick(/corredera/i);
  const tiradores = pick(/tirador/i);
  const barras = pick(/barra|riel/i);
  if (correderas) partes.push(`${correderas} correderas`);
  if (tiradores) partes.push(`${tiradores} tiradores`);
  if (barras) partes.push(`${barras} barras`);
  return partes.join(', ');
}

// Avisos de obra: verificación de levantamiento por módulo (solo con H
// techo cargada) y marco desactualizado respecto de los módulos.
function avisosObra(pieces, state = {}) {
  const cfg = state.userConfig || {};
  const out = [];
  const hTecho = Number(cfg.obraHTecho) || 0;
  if (hTecho && !hasPlinthFrame(pieces)) {
    const altoZocalo = Number(cfg.plinthAltoZocalo) || 100;
    for (const d of rootModuleDims(pieces)) {
      const r = computeLiftCheck({
        altoModulo: d.alto, altoZocalo, profundidad: d.profundidad, hTecho,
        margenSeg: Number(cfg.obraMargenSeg ?? 20),
        margenAjuste: Number(cfg.obraMargenAjuste ?? 10),
        zMin: Number(cfg.obraZmin ?? 60),
        zMax: Number(cfg.obraZmax ?? 150),
      });
      r.warnings.forEach((w) => out.push(`M${d.id}: ${w}`));
    }
  }
  if (marcoDesactualizado(pieces)) {
    out.push('Zócalo a marco desactualizado: los módulos cambiaron (ancho/agregados/eliminados). Pulse "Generar marco" en la tarjeta de zócalo para actualizarlo.');
  }
  return out;
}

// Panel de avisos del validador (spec "Validación de diseño" del prototipo):
// lista de ítems con icono por nivel (warn ámbar / ok menta) en lugar de un
// bloque plano. Re-parsea el mueble en silencio y muestra los warnings (luz
// de repisas, cobertura de frentes) de forma persistente.
function renderWarningsPanel(pieces, state = {}) {
  if (!pieces.length) return '';
  let warnings = [];
  try {
    const result = parseCSV(piecesToCSV(pieces));
    warnings = result.warnings || [];
  } catch {
    return '';
  }
  warnings = [...warnings, ...avisosObra(pieces, state)];
  if (!warnings.length) {
    return `
      <div class="cn-constructor__warnings cn-constructor__warnings--ok" role="status">
        <div class="cn-warnings__head">
          <span class="t-label">Validación de diseño</span>
        </div>
        <ul class="cn-warnings__list">
          <li class="cn-warnings__item cn-warnings__item--ok">
            <span class="cn-warnings__icon" aria-hidden="true">✓</span>
            <span>Sin avisos de diseño. Todo listo para despiece.</span>
          </li>
        </ul>
      </div>`;
  }
  const mostrados = warnings.slice(0, 4);
  const extra = warnings.length > 4
    ? `<li class="cn-warnings__item cn-warnings__item--warn"><span class="cn-warnings__icon" aria-hidden="true">⚠</span><span>… y ${warnings.length - 4} aviso(s) más</span></li>` : '';
  return `
    <div class="cn-constructor__warnings" role="status">
      <div class="cn-warnings__head">
        <span class="t-label">Validación de diseño</span>
        <span class="cn-warnings__count">${warnings.length}</span>
      </div>
      <ul class="cn-warnings__list">
        ${mostrados.map((w) => `
          <li class="cn-warnings__item cn-warnings__item--warn">
            <span class="cn-warnings__icon" aria-hidden="true">⚠</span>
            <span>${escapeHtml(w)}</span>
          </li>`).join('')}${extra}
      </ul>
    </div>
  `;
}

function anchoTotal(pieces) {
  // Convención 2026-11: la tapa va EMBUTIDA — el ancho del módulo se
  // deriva del FONDO (constructorCascoWidth), no de la tapa.
  const grupos = new Map();
  for (const p of pieces) {
    const mod = String(p.modulo).split('.')[0];
    if (!grupos.has(mod)) grupos.set(mod, []);
    grupos.get(mod).push(p);
  }
  let total = 0;
  const vistos = new Set();
  for (const p of pieces) {
    if (!String(p.id).endsWith('-tapa')) continue;
    const mod = String(p.modulo).split('.')[0];
    if (vistos.has(mod)) continue;
    vistos.add(mod);
    total += constructorCascoWidth(grupos.get(mod) || [p], Number(p.ancho) || 0);
  }
  return total;
}

// Toast informativo con los warnings del validador (truncado a los 2
// primeros para no saturar; el detalle completo queda en la vista CSV).
function warnIfAny(warnings) {
  if (!Array.isArray(warnings) || !warnings.length) return;
  const mostrados = warnings.slice(0, 2).join(' · ');
  const extra = warnings.length > 2 ? ` (y ${warnings.length - 2} más)` : '';
  toast(`⚠ ${warnings.length} aviso(s): ${mostrados}${extra}`, { type: 'info', durationMs: 6000 });
}

function labelKind(kind) {  return {
    shelf: 'Repisa', drawer: 'Cajón', shoeRack: 'Zapatera', rail: 'Barra',
    doubleRail: 'Doble barra', zocalo: 'Zócalo',
  }[kind] || kind;
}

function formatFecha(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}
