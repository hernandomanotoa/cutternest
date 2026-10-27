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
  addModuleFromBuilder,
  addContentToModule,
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
  recalculateAll,
} from '../app.js';
import { listCloudVersions } from '../services/designVersionsClient.js';
import { isGolaEnabled, drawerUnits } from '../services/golaService.js';
import { DRAWER_TYPES, SHOE_RACK_TYPES } from '../core/contentTypes.js';
import { saveUserConfig, loadUserConfig } from '../services/userConfigService.js';
import {
  computeLiftCheck,
  rootModuleDims,
  hasPlinthFrame,
  plinthFrameSpec,
  plinthLevelerCount,
  marcoDesactualizado,
} from '../services/plinthFrameService.js';

const ALTO_VANO_OPCIONES = [130, 180, 200, 220, 280];
const TIPOS_CAJON = [
  { value: 'corredera', label: 'Corredera' },
  { value: 'volquete', label: 'Volquete' },
];

// Parámetros numéricos del sistema gola editables por módulo (persistidos en
// userConfig como los demás VERTICAL_POSITIONS): clave cfg, label, min, step.
const GOLA_CFG_FIELDS = [
  ['golaPerfilHeight', 'Alto tira (mm)', 10, 5],
  ['golaFingerClearance', 'Agarre (mm)', 5, 5],
  ['golaStripDepth', 'Prof. tira (mm)', 20, 5],
  ['golaStripSetback', 'Retranqueo (mm)', 0, 5],
  ['golaHolguraLateral', 'Holgura lat. (mm)', 0, 1],
  ['golaTornillosPorPerfil', 'Tornillos/perfil', 1, 1],
  ['golaMaxOverhang', 'Máx. sobrealtura L (mm)', 30, 10],
];

const FURNITURE_NAME_KEY = 'cn-assembly-furniture-name';

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

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', render);
    container.addEventListener('click', onClick);
    container.addEventListener('keydown', onKeydown);
    container.addEventListener('change', onChange);
    render();
  }

  function destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (container) {
      container.removeEventListener('click', onClick);
      container.removeEventListener('keydown', onKeydown);
      container.removeEventListener('change', onChange);
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
    // Parámetros del sistema gola: numéricos persistidos como los demás
    // VERTICAL_POSITIONS; golaFijacion como STRING_PREF. Con gola activo en
    // el módulo, un cambio numérico re-aplica enableGola (re-calcula).
    if (e.target.matches('[data-gola-cfg]')) {
      const key = e.target.dataset.golaCfg;
      const scoped = e.target.closest('[data-module-scoped]');
      const moduleId = scoped?.dataset.moduleScoped;
      if (key === 'golaFijacion') {
        saveUserConfig({ golaFijacion: e.target.value });
        store.set({ userConfig: loadUserConfig() });
        recalculateAll();
        return;
      }
      const value = Number(e.target.value);
      if (!Number.isFinite(value)) return;
      saveUserConfig({ [key]: value });
      store.set({ userConfig: loadUserConfig() });
      if (moduleId && isGolaEnabled(store.get().pieces, moduleId)) {
        const r = enableGola(moduleId);
        if (!r.ok) toast(r.errors.join('; '), { type: 'error' });
        else warnIfAny(r.warnings);
      }
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
    // Tipo de cajón/zapatera: llena el vano con la altura ergonómica del
    // tipo elegido (los tipos del catálogo). 'personalizado' deja el valor.
    if (e.target.matches('[data-tipo-drawer], [data-tipo-zapatera]')) {
      const catalog = e.target.matches('[data-tipo-drawer]') ? DRAWER_TYPES : SHOE_RACK_TYPES;
      const tipo = catalog.find((t) => t.id === e.target.value);
      if (tipo) {
        const scoped = e.target.closest('[data-module-scoped]');
        const vano = scoped?.querySelector('[data-alto-vano]');
        if (vano) vano.value = String(tipo.altoVano);
      }
    }
    // Nombre del mueble: persiste y alimenta el nombre sugerido de versiones.
    if (e.target.matches('[data-furniture-name]')) {
      setFurnitureName(e.target.value.trim());
      refresh();
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
        toast(`${r.moduleIds.length} módulo(s) agregado(s)`, { type: 'success' });
        warnIfAny(r.warnings);
      } else {
        toast(r.errors.join('; '), { type: 'error' });
      }
    } else if (action === 'add-content') {
      const moduleId = btn.dataset.module;
      const kind = btn.dataset.kind;
      const scoped = `[data-module-scoped="${CSS.escape(moduleId)}"]`;
      const altoVanoInput = Number(container.querySelector(`${scoped} [data-alto-vano]`)?.value) || 0;
      // Tipo ergonomico (contentTypes.js): cajon por prenda, zapatera por
      // calzado. 'personalizado' => se toma el vano libre del input.
      const tipo = kind === 'shoeRack'
        ? container.querySelector(`${scoped} [data-tipo-zapatera]`)?.value
        : container.querySelector(`${scoped} [data-tipo-drawer]`)?.value;
      // Con tipo del catálogo, el tipo manda sobre el input (altoVano=0 =>
      // addContentToModule usa tipo.altoVano).
      const altoVano = tipo && tipo !== 'personalizado' ? 0 : altoVanoInput;
      const tipoCorredera = container.querySelector(`${scoped} [data-mecanismo]`)?.value || 'corredera';
      const colorFrente = container.querySelector(`${scoped} [data-color-frente]`)?.value || '#8B5A2B';
      const separacion = Number(container.querySelector(`${scoped} [data-separacion]`)?.value) || 0;
      const insetTapa = Number(container.querySelector(`${scoped} [data-inset-tapa]`)?.value) || 0;
      const nPorFila = Number(container.querySelector(`${scoped} [data-n-por-fila]`)?.value) || 1;
      const espesorFrente = Number(container.querySelector(`${scoped} [data-espesor-frente]`)?.value) || 15;
      // División central de la zapatera (apoyo de la fila delantera): el
      // checkbox por defecto va activado; solo aplica a zapateras.
      const division = container.querySelector(`${scoped} [data-division]`)?.checked !== false;
      // Tipo de riel: define las medidas de la caja (descuentos y fondo).
      const riel = container.querySelector(`${scoped} [data-tipo-riel]`)?.value || 'catalogo';
      // Persistir las preferencias para los siguientes módulos (sesión).
      saveUserConfig({
        ...(altoVanoInput > 0 ? { contentVano: altoVanoInput } : {}),
        contentNPorFila: nPorFila,
        contentDivision: division ? 1 : 0,
        contentTipoCajon: container.querySelector(`${scoped} [data-tipo-drawer]`)?.value || '',
        contentTipoZapatera: container.querySelector(`${scoped} [data-tipo-zapatera]`)?.value || '',
        contentRiel: riel,
      });
      store.set({ userConfig: loadUserConfig() });
      const r = addContentToModule(moduleId, kind, { altoVano, tipo: tipo === 'personalizado' ? null : tipo, tipoCorredera, colorFrente, separacion, insetTapa, nPorFila, espesorFrente, division, riel });
      if (r.ok) {
        toast(`${labelKind(kind)} agregado al módulo ${moduleId}`, { type: 'success' });
        warnIfAny(r.warnings);
      } else {
        toast(r.errors.join('; '), { type: 'error' });
      }
    } else if (action === 'remove-module') {
      confirmable(btn, '¿Seguro?', () => {
        removeModule(btn.dataset.module);
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
      const dims = {
        ancho: Number(container.querySelector(`${scoped} [data-edit-ancho]`)?.value),
        alto: Number(container.querySelector(`${scoped} [data-edit-alto]`)?.value),
        prof: Number(container.querySelector(`${scoped} [data-edit-prof]`)?.value),
      };
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
      const r = btn.checked ? enableGola(moduleId) : disableGola(moduleId);
      if (!r.ok) {
        toast(r.errors.join('; '), { type: 'error' });
        render(); // revertir el checkbox al estado real
        return;
      }
      toast(
        btn.checked
          ? `Gola activada en el módulo ${moduleId}: sin tiradores, agarre en los perfiles`
          : `Gola desactivada en el módulo ${moduleId}: tiradores restaurados`,
        { type: 'success' },
      );
      warnIfAny(r.warnings);
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
    } else if (action === 'goto-view') {
      switchTab(btn.dataset.view);
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
    container.innerHTML = `
      <div class="card mb-2">
        <div class="card__header">
          <h2 class="card__title">Constructor de clóset — agregar módulo</h2>
          <span class="cn-constructor__summary" data-resumen>${resumenMueble(pieces, state)}</span>
          ${dirty ? '<span class="badge badge--secondary" title="Hay cambios sin guardar en una versión">● sin guardar</span>' : ''}
        </div>
        <div class="card__body">
          <div class="cn-constructor__grid">
            <label class="form-group">Nombre del mueble
              <input type="text" data-furniture-name value="${escapeHtml(getFurnitureName())}" placeholder="Clóset dormitorio" maxlength="60" />
            </label>
            <label class="form-group">Ancho total (mm)
              <input type="number" data-cfg="ancho-total" placeholder="3400" min="100" step="10" />
            </label>
            <label class="form-group">Repartir en
              <input type="number" data-cfg="reparto" value="4" min="1" max="12" />
            </label>
          </div>
          <div class="cn-constructor__grid">
            <label class="form-group">Ancho (mm)
              <input type="number" data-cfg="ancho" value="850" min="100" step="10" />
            </label>
            <label class="form-group">Alto (mm)
              <input type="number" data-cfg="alto" value="2400" min="100" step="10" />
            </label>
            <label class="form-group">Profundidad (mm)
              <input type="number" data-cfg="prof" value="600" min="100" step="10" />
            </label>
            <label class="form-group">Espesor
              <select data-cfg="espesor">
                <option value="15" selected>15 mm</option>
                <option value="18">18 mm</option>
                <option value="25">25 mm</option>
              </select>
            </label>
            <label class="form-group">Color cuerpo
              <input type="color" data-cfg="color" value="#c19a6b" />
            </label>
            <label class="form-group" title="Espesor del canto PVC para la lista de herrajes (no cambia las medidas de corte)">Canto PVC
              <select data-obra="canto">
                ${[0.8, 1, 2].map((e) => `<option value="${e}" ${Number(state.userConfig?.cantoEspesor ?? 0.8) === e ? 'selected' : ''}>${e} mm</option>`).join('')}
              </select>
            </label>
            <label class="form-group">Zócalo (mm)
              <input type="number" data-cfg="altura-zocalo" value="150" min="50" max="300" step="10" />
            </label>
            <label class="form-group">Cantidad
              <input type="number" data-cfg="cantidad" value="1" min="1" max="12" />
            </label>
            <label class="form-group cn-constructor__check">
              <input type="checkbox" data-cfg="zocalo" checked /> Con zócalo<br />
              <small>la base queda apoyada sobre el zócalo</small>
            </label>
          </div>
          <div class="cn-constructor__content-btns">
            <button class="btn btn--primary" data-action="add-module">+ Agregar módulo(s)</button>
            <button class="btn btn--secondary" data-action="undo" ${canUndo() ? '' : 'disabled'} title="Deshacer última acción (Ctrl+Z)">↩ Deshacer</button>
            <button class="btn btn--secondary" data-action="duplicate-all" ${pieces.length ? '' : 'disabled'}>Duplicar mueble</button>
            <button class="btn btn--secondary" data-action="export-current" ${pieces.length ? '' : 'disabled'}>Exportar CSV</button>
            <button class="btn btn--secondary" data-action="goto-view" data-view="isometric" ${pieces.length ? '' : 'disabled'}>Ver isométrica</button>
            <button class="btn btn--secondary" data-action="goto-view" data-view="renderer3d" ${pieces.length ? '' : 'disabled'}>Ver 3D</button>
            <button class="btn btn--danger" data-action="clear-all" ${pieces.length ? '' : 'disabled'}>Nuevo mueble</button>
          </div>
          ${renderWarningsPanel(pieces, state)}
        </div>
      </div>

      <div class="card mb-2">
        <div class="card__header">
          <h2 class="card__title">Zócalo estructural y datos de obra</h2>
          <span class="cn-constructor__summary" data-plinth-resumen>${resumenPlinth(pieces, state)}</span>
        </div>
        <div class="card__body">
          <div class="cn-constructor__grid">
            <label class="form-group">Tipo de zócalo
              <select data-obra="tipo">
                <option value="simple" ${hasPlinthFrame(pieces) ? '' : 'selected'}>Frente simple por módulo</option>
                <option value="marco" ${hasPlinthFrame(pieces) ? 'selected' : ''}>Marco estructural (cajón de 4 lados)</option>
              </select>
            </label>
            <label class="form-group">Cantidad de zócalos
              <select data-obra="nzocalos">
                ${[1, 2, 3, 4].map((n) => `<option value="${n}" ${Number(state.userConfig?.plinthNZocalos || 1) === n ? 'selected' : ''}>${n === 1 ? '1 (único)' : n}</option>`).join('')}
              </select>
            </label>
            <label class="form-group">Alto zócalo Z (mm)
              <input type="number" data-obra="altoZocalo" value="${Number(state.userConfig?.plinthAltoZocalo) || 100}" min="50" max="300" step="5" />
            </label>
            <label class="form-group">Retraso frente (mm)
              <input type="number" data-obra="retraso" value="${Number(state.userConfig?.plinthFrontRecess) || 0}" min="0" max="150" step="5" />
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
        </div>
      </div>

      <div class="card mb-2">
        <div class="card__header"><h2 class="card__title">Módulos y contenido</h2></div>
        <div class="card__body">
          ${groups.length === 0
            ? '<p class="empty-state">Todavía no hay módulos. Agrega el primero arriba.</p>'
            : groups.map((g) => renderModuleCard(g, pieces, state.userConfig || {})).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card__header"><h2 class="card__title">Versiones del diseño</h2></div>
        <div class="card__body">
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
        </div>
      </div>
    `;
  }

  return { mount, destroy };
}

// Lista de contenido agregado al modulo (cajones, zapateras, repisas,
// barras, zocalo) con boton de eliminacion individual. El orden de la
// lista es el de insercion (orden del array de piezas).
// Icono + estilo por tipo de contenido (chips del listado por modulo).
const CONTENT_ICON = {
  zocalo: '▬',
  shelf: '▔',
  drawer: '▤',
  shoeRack: '👟',
  rail: '⚡',
  divider: '╫',
};

function renderContentList(moduleId, allPieces) {
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
  if (!items.length) return '';
  // CHIPS en una sola fila que fluye (no una lista vertical): cada chip lleva
  // icono por tipo, nombre corto, altura real en el tooltip y el ✕ integrado.
  // El orden de izquierda a derecha es el orden de apilado (abajo -> arriba).
  return `
    <div class="cn-constructor__chips" role="list" aria-label="Contenido del módulo">
      ${items.map((i) => {
        const piece = allPieces.find((p) => p.id === i.refId);
        const altura = Number.isFinite(piece?.pos_z) ? ` · z=${Math.round(piece.pos_z)} mm` : '';
        return `
        <span class="cn-chip cn-chip--${i.kind}" role="listitem" title="${escapeHtml(i.label)}${altura}">
          <span class="cn-chip__icon" aria-hidden="true">${CONTENT_ICON[i.kind] || '·'}</span>
          <span class="cn-chip__label"${Number.isFinite(piece?.pos_z) ? ` data-posz="${Math.round(piece.pos_z)}"` : ''}>${escapeHtml(nombreCorto(i.label))}</span>
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

// "Frente zapatera extraible 2 M1" -> "Zapatera 2"; "Repisa 3 M1" -> "Repisa 3";
// "Barra colgadora 1 M1" -> "Barra 1". El tooltip conserva el nombre completo.
function nombreCorto(nombre) {
  let out = String(nombre || '');
  out = out.replace(/^Frente (cajon|zapatera extraible)( abatible)?/i, (m, g) => (g.toLowerCase().includes('zapatera') ? 'Zapatera' : 'Cajón'));
  out = out.replace(/^Barra (colgadora|alta|baja)/i, 'Barra');
  out = out.replace(/\s*M\d+\s*$/, '');
  return out.trim();
}

function renderModuleCard(group, allPieces, cfg = {}) {
  // Preferencias persistidas del formulario de contenido (se reutilizan al
  // crear cada módulo): vano, tipos, división, riel y N por fila.
  const prefVano = Number(cfg.contentVano) || 200;
  const prefNPorFila = Number(cfg.contentNPorFila) || 1;
  const prefDivision = Number(cfg.contentDivision) !== 0;
  const sel = (actual, value) => (actual === value ? 'selected' : '');
  const moduleId = group.id;
  const piezas = allPieces.filter((p) => String(p.modulo) === String(moduleId));
  // Contar por tipo en TODO el mueble (las piezas de caja viven en
  // submodulos '11'/'12', fuera del modulo raiz). Cajón/zapatera: solo el
  // frente (1 por caja); repisa/barra: cada pieza.
  const countByKind = (kind) => {
    const pref = { shelf: `m${moduleId}-repisa-`, drawer: `m${moduleId}cajon`, shoeRack: `m${moduleId}zapatera`, rail: `m${moduleId}-barra-`, divider: `m${moduleId}-divisor-` }[kind];
    const matches = allPieces.filter((p) => String(p.id).startsWith(pref));
    return (kind === 'drawer' || kind === 'shoeRack')
      ? matches.filter((p) => p.id.endsWith('-frente')).length
      : matches.length;
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
  const golaOn = isGolaEnabled(allPieces, moduleId);
  return `
    <div class="cn-constructor__module" data-module-scoped="${escapeHtml(moduleId)}">
      <div class="cn-constructor__module-head">
        <strong>${escapeHtml(group.label)}</strong>
        ${vanoInfo ? `<span class="badge ${vanoInfo.pct > 90 ? 'badge--danger' : vanoInfo.pct > 70 ? 'badge--warning' : 'badge--secondary'}">vano ${vanoInfo.usado}/${vanoInfo.util} mm (${vanoInfo.pct}%)</span>` : ''}
        <span class="cn-constructor__spacer"></span>
        <label class="form-group" style="margin:0;" title="Distancia desde la cara inferior de la tapa (alzamiento/maletero; gana sobre Sep. anterior)">Inset tapa (mm)
          <input type="number" data-inset-tapa placeholder="auto" min="0" max="2000" step="10" />
        </label>
        <label class="form-group" style="margin:0;" title="Distancia desde la cara superior de la pieza anterior (0 o vacio = gap por defecto)">Sep. anterior (mm)
          <input type="number" data-separacion placeholder="auto" min="0" max="2000" step="10" />
        </label>
        <label class="form-group" style="margin:0;" title="Altura del vano en mm (libre; los tipos de la izquierda lo llenan automáticamente)">Vano (mm)
          <input type="number" data-alto-vano list="cn-vanos-sugeridos" value="${prefVano}" min="50" max="600" step="10" />
          <datalist id="cn-vanos-sugeridos">
            ${ALTO_VANO_OPCIONES.map((h) => `<option value="${h}"></option>`).join('')}
          </datalist>
        </label>
        <label class="form-group" style="margin:0;" title="Tipo de cajón por prenda (alturas ergonómicas del catálogo)">Tipo cajón
          <select data-tipo-drawer>
            ${DRAWER_TYPES.map((t) => `<option value="${t.id}" ${sel(cfg.contentTipoCajon || DRAWER_TYPES[0].id, t.id)}>${t.label}</option>`).join('')}
            <option value="personalizado" ${sel(cfg.contentTipoCajon, 'personalizado')}>Personalizado (usar vano libre)</option>
          </select>
        </label>
        <label class="form-group" style="margin:0;" title="Tipo de zapatera por calzado. Botas = frente completo (sin cara ni gaps)">Tipo zapatera
          <select data-tipo-zapatera>
            ${SHOE_RACK_TYPES.map((t) => `<option value="${t.id}" ${sel(cfg.contentTipoZapatera || SHOE_RACK_TYPES[0].id, t.id)}>${t.label}</option>`).join('')}
            <option value="personalizado" ${sel(cfg.contentTipoZapatera, 'personalizado')}>Personalizada (usar vano libre)</option>
          </select>
        </label>
        <label class="form-group" style="margin:0;" title="División central (por defecto): apoyo paralelo al fondo a media profundidad para la fila delantera de zapatos; la fila trasera se apoya en el fondo">División zapatera
          <input type="checkbox" data-division ${prefDivision ? 'checked' : ''} />
        </label>
        <label class="form-group" style="margin:0;">Mecanismo
          <select data-mecanismo>
            ${TIPOS_CAJON.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="form-group" style="margin:0;" title="El tipo de riel DEFINE las medidas de la caja del cajón/zapatera (descuentos por holgura y largo del fondo). 'Marco regulable' = herraje de catálogo para zapateras: sin cajón, solo el frente.">Tipo de riel
          <select data-tipo-riel>
            <option value="catalogo" ${sel(cfg.contentRiel || 'catalogo', 'catalogo')}>Catálogo (estándar del proyecto)</option>
            <option value="telescopica26" ${sel(cfg.contentRiel, 'telescopica26')}>Telescópica balines (−26 mm, fondo = riel)</option>
            <option value="oculta" ${sel(cfg.contentRiel, 'oculta')}>Oculta bajo cajón (−10 mm, cierre suave)</option>
            <option value="marco" ${sel(cfg.contentRiel, 'marco')}>Marco aluminio regulable (zapatera, sin cajón)</option>
          </select>
        </label>
        <label class="form-group" style="margin:0;" title="Cajones por fila: 2 divide el ancho del vano en dos frentes (modulos anchos)">N por fila
          <select data-n-por-fila>
            <option value="1" ${prefNPorFila === 1 ? 'selected' : ''}>1</option>
            <option value="2" ${prefNPorFila === 2 ? 'selected' : ''}>2</option>
          </select>
        </label>
        <label class="form-group" style="margin:0;" title="Espesor del frente decorativo (puede diferir del cuerpo: frente 18 con cuerpo 15 es lo mas comun)">Esp. frente
          <select data-espesor-frente>
            <option value="15" selected>15 mm</option>
            <option value="18">18 mm</option>
            <option value="25">25 mm</option>
          </select>
        </label>
        <label class="form-group" style="margin:0;">Frente
          <input type="color" data-color-frente value="#8b5a2b" />
        </label>
        <label class="form-group" style="margin:0;">Cuerpo
          <input type="color" data-color-cuerpo value="#c19a6b" />
        </label>
        ${golaUnidades >= 2 ? `
        <label class="form-group cn-constructor__check" style="margin:0;" title="Sistema gola: tiras de melamina entre frentes (sin tiradores, agarre en los perfiles) y frente del cajón superior extendido en L">
          <input type="checkbox" data-action="toggle-gola" data-module="${escapeHtml(moduleId)}" ${golaOn ? 'checked' : ''} /> Gola
        </label>` : ''}
        <button class="btn btn--secondary btn--sm" data-action="focus-module" data-module="${escapeHtml(moduleId)}" title="Ver este módulo en la vista isométrica">👁 Ver</button>
        <button class="btn btn--secondary btn--sm" data-action="edit-module" data-module="${escapeHtml(moduleId)}">Editar</button>
        <button class="btn btn--secondary btn--sm" data-action="move-module" data-module="${escapeHtml(moduleId)}" data-dir="izq" title="Mover a la izquierda">◀</button>
        <button class="btn btn--secondary btn--sm" data-action="move-module" data-module="${escapeHtml(moduleId)}" data-dir="der" title="Mover a la derecha">▶</button>
        <button class="btn btn--secondary btn--sm" data-action="recolor-module" data-module="${escapeHtml(moduleId)}">Color</button>
        <button class="btn btn--secondary btn--sm" data-action="duplicate-module" data-module="${escapeHtml(moduleId)}">Duplicar</button>
        <button class="btn btn--danger btn--sm" data-action="remove-module" data-module="${escapeHtml(moduleId)}">Eliminar módulo</button>
      </div>
      ${renderContentList(moduleId, allPieces)}
      ${golaOn && golaUnidades >= 2 ? renderGolaPanel(cfg) : ''}
      <div class="cn-constructor__content-btns">
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shelf">+ Repisa (${countByKind('shelf')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="drawer">+ Cajón (${countByKind('drawer')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shoeRack">+ Zapatera (${countByKind('shoeRack')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="rail">+ Barra (${countByKind('rail')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="doubleRail">+ Doble barra</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="zocalo">+ Zócalo</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="divider" title="Divisor vertical de bahias (span completo del vano)">+ Divisor (${countByKind('divider')})</button>
      </div>
      ${renderEditForm(moduleId, piezas)}
    </div>
  `;
}

// Panel de parámetros del sistema gola (visible solo con gola activo en el
// módulo). Reusa el estilo del formulario de edición de dimensiones; los
// valores leen/escriben userConfig vía [data-gola-cfg] (onChange).
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
      <small>Tiras de melamina entre frentes (agarre hacia arriba); el cajón superior cierra en L. Sin mecanizados — parámetros PROVISIONALES.</small>
    </div>
  `;
}

// Formulario oculto de edicion de dimensiones del casco (M3). Solo casco:
// el contenido agregado se conserva; el usuario lo reajusta si quiere.
function renderEditForm(moduleId, piezas) {
  const tapa = piezas.find((p) => p.id.endsWith('-tapa'));
  const lateral = piezas.find((p) => p.id.endsWith('-lateral-izq'));
  if (!tapa || !lateral) return '';
  return `
    <div class="cn-constructor__edit-form is-hidden" data-edit-form>
      <label class="form-group" style="margin:0;">Ancho
        <input type="number" data-edit-ancho value="${Number(tapa.ancho)}" min="100" step="10" />
      </label>
      <label class="form-group" style="margin:0;">Alto
        <input type="number" data-edit-alto value="${Number(lateral.alto)}" min="100" step="10" />
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

// Panel de avisos del validador: re-parsea el mueble en silencio y muestra
// los warnings (luz de repisas, cobertura de frentes) de forma persistente.
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
    return '<p class="cn-constructor__warnings cn-constructor__warnings--ok">✓ Sin avisos de diseño</p>';
  }
  const mostrados = warnings.slice(0, 4);
  const extra = warnings.length > 4 ? `<li>… y ${warnings.length - 4} aviso(s) más</li>` : '';
  return `
    <div class="cn-constructor__warnings" role="status">
      <strong>⚠ ${warnings.length} aviso(s) de diseño:</strong>
      <ul>${mostrados.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}${extra}</ul>
    </div>
  `;
}

function anchoTotal(pieces) {
  let total = 0;
  const vistos = new Set();
  for (const p of pieces) {
    if (!String(p.id).endsWith('-tapa')) continue;
    const mod = String(p.modulo).split('.')[0];
    if (vistos.has(mod)) continue;
    vistos.add(mod);
    total += Number(p.ancho) || 0;
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
