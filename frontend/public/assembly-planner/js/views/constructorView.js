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
  duplicateAllModules,
  focusModule,
} from '../app.js';
import { listCloudVersions } from '../services/designVersionsClient.js';
import { DRAWER_TYPES, SHOE_RACK_TYPES } from '../core/contentTypes.js';

const ALTO_VANO_OPCIONES = [130, 180, 200, 220, 280];
const TIPOS_CAJON = [
  { value: 'corredera', label: 'Corredera' },
  { value: 'volquete', label: 'Volquete' },
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
      const r = addContentToModule(moduleId, kind, { altoVano, tipo: tipo === 'personalizado' ? null : tipo, tipoCorredera, colorFrente });
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
          ${renderWarningsPanel(pieces)}
        </div>
      </div>

      <div class="card mb-2">
        <div class="card__header"><h2 class="card__title">Módulos y contenido</h2></div>
        <div class="card__body">
          ${groups.length === 0
            ? '<p class="empty-state">Todavía no hay módulos. Agrega el primero arriba.</p>'
            : groups.map((g) => renderModuleCard(g, pieces)).join('')}
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
        match = { refId: id, label: p.nombre, key: id };
      }
    } else if (/-repisa-\d+$/.test(id) && id.startsWith(`m${moduleId}-repisa-`)) {
      match = { refId: id, label: p.nombre, key: id };
    } else if (/-barra-(alta|baja)?-?\d*$/.test(id) && id.startsWith(`m${moduleId}-barra-`)) {
      // Solo listar la barra alta (o la simple): la baja va en pareja.
      if (!id.includes('-barra-baja')) match = { refId: id, label: p.nombre, key: id };
    } else if (id === `m${moduleId}-zocalo`) {
      match = { refId: id, label: p.nombre, key: id };
    }
    if (match && !items.some((i) => i.key === match.key)) items.push(match);
  }
  if (!items.length) return '';
  return `
    <ul class="cn-constructor__content-list">
      ${items.map((i) => `
        <li>
          <span>${escapeHtml(i.label)}</span>
          <button class="btn btn--danger btn--sm" data-action="remove-content" data-ref="${escapeHtml(i.refId)}" title="Eliminar">✕</button>
        </li>`).join('')}
    </ul>
  `;
}

function renderModuleCard(group, allPieces) {
  const moduleId = group.id;
  const piezas = allPieces.filter((p) => String(p.modulo) === String(moduleId));
  // Contar por tipo en TODO el mueble (las piezas de caja viven en
  // submodulos '11'/'12', fuera del modulo raiz). Cajón/zapatera: solo el
  // frente (1 por caja); repisa/barra: cada pieza.
  const countByKind = (kind) => {
    const pref = { shelf: `m${moduleId}-repisa-`, drawer: `m${moduleId}cajon`, shoeRack: `m${moduleId}zapatera`, rail: `m${moduleId}-barra-` }[kind];
    const matches = allPieces.filter((p) => String(p.id).startsWith(pref));
    return (kind === 'drawer' || kind === 'shoeRack')
      ? matches.filter((p) => p.id.endsWith('-frente')).length
      : matches.length;
  };
  const altoModulo = piezas.find((p) => p.id.endsWith('lateral-izq'))?.alto || null;
  const tieneZocalo = piezas.some((p) => p.id === `m${moduleId}-zocalo`);
  const altoZocalo = piezas.find((p) => p.id === `m${moduleId}-zocalo`)?.alto || 0;
  const vanoInfo = altoModulo ? vanoUsado(allPieces, moduleId, altoModulo, tieneZocalo, altoZocalo) : null;
  return `
    <div class="cn-constructor__module" data-module-scoped="${escapeHtml(moduleId)}">
      <div class="cn-constructor__module-head">
        <strong>${escapeHtml(group.label)}</strong>
        ${vanoInfo ? `<span class="badge ${vanoInfo.pct > 90 ? 'badge--danger' : vanoInfo.pct > 70 ? 'badge--warning' : 'badge--secondary'}">vano ${vanoInfo.usado}/${vanoInfo.util} mm (${vanoInfo.pct}%)</span>` : ''}
        <span class="cn-constructor__spacer"></span>
        <label class="form-group" style="margin:0;" title="Altura del vano en mm (libre; los tipos de la izquierda lo llenan automáticamente)">Vano (mm)
          <input type="number" data-alto-vano list="cn-vanos-sugeridos" value="200" min="50" max="600" step="10" />
          <datalist id="cn-vanos-sugeridos">
            ${ALTO_VANO_OPCIONES.map((h) => `<option value="${h}"></option>`).join('')}
          </datalist>
        </label>
        <label class="form-group" style="margin:0;" title="Tipo de cajón por prenda (alturas ergonómicas del catálogo)">Tipo cajón
          <select data-tipo-drawer>
            ${DRAWER_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}
            <option value="personalizado">Personalizado (usar vano libre)</option>
          </select>
        </label>
        <label class="form-group" style="margin:0;" title="Tipo de zapatera por calzado. Botas = frente completo (sin cara ni gaps)">Tipo zapatera
          <select data-tipo-zapatera>
            ${SHOE_RACK_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}
            <option value="personalizado">Personalizada (usar vano libre)</option>
          </select>
        </label>
        <label class="form-group" style="margin:0;">Mecanismo
          <select data-mecanismo>
            ${TIPOS_CAJON.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="form-group" style="margin:0;">Frente
          <input type="color" data-color-frente value="#8b5a2b" />
        </label>
        <label class="form-group" style="margin:0;">Cuerpo
          <input type="color" data-color-cuerpo value="#c19a6b" />
        </label>
        <button class="btn btn--secondary btn--sm" data-action="focus-module" data-module="${escapeHtml(moduleId)}" title="Ver este módulo en la vista isométrica">👁 Ver</button>
        <button class="btn btn--secondary btn--sm" data-action="edit-module" data-module="${escapeHtml(moduleId)}">Editar</button>
        <button class="btn btn--secondary btn--sm" data-action="move-module" data-module="${escapeHtml(moduleId)}" data-dir="izq" title="Mover a la izquierda">◀</button>
        <button class="btn btn--secondary btn--sm" data-action="move-module" data-module="${escapeHtml(moduleId)}" data-dir="der" title="Mover a la derecha">▶</button>
        <button class="btn btn--secondary btn--sm" data-action="recolor-module" data-module="${escapeHtml(moduleId)}">Color</button>
        <button class="btn btn--secondary btn--sm" data-action="duplicate-module" data-module="${escapeHtml(moduleId)}">Duplicar</button>
        <button class="btn btn--danger btn--sm" data-action="remove-module" data-module="${escapeHtml(moduleId)}">Eliminar módulo</button>
      </div>
      ${renderContentList(moduleId, allPieces)}
      <div class="cn-constructor__content-btns">
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shelf">+ Repisa (${countByKind('shelf')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="drawer">+ Cajón (${countByKind('drawer')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shoeRack">+ Zapatera (${countByKind('shoeRack')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="rail">+ Barra (${countByKind('rail')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="doubleRail">+ Doble barra</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="zocalo">+ Zócalo</button>
      </div>
      ${renderEditForm(moduleId, piezas)}
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
function vanoUsado(pieces, moduleId, altoModulo, tieneZocalo, altoZocalo) {
  const espesor = 15;
  const util = altoModulo - (tieneZocalo ? altoZocalo : 0) - espesor; // tapa
  const prefFrentes = [`m${moduleId}cajon`, `m${moduleId}zapatera`];
  const prefRepisa = `m${moduleId}-repisa-`;
  let usado = 0;
  for (const p of pieces) {
    const id = String(p.id);
    if (id.endsWith('-frente') && prefFrentes.some((pref) => id.startsWith(pref))) {
      usado += Number(p.alto) + 3; // altoVano ≈ frente + 3
    } else if (id.startsWith(prefRepisa)) {
      usado += espesor + 20; // repisa: espesor + gap de apilamiento aprox.
    }
  }
  const pct = util > 0 ? Math.min(100, Math.round((usado / util) * 100)) : 0;
  return { usado, util, pct };
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

// Panel de avisos del validador: re-parsea el mueble en silencio y muestra
// los warnings (luz de repisas, cobertura de frentes) de forma persistente.
function renderWarningsPanel(pieces) {
  if (!pieces.length) return '';
  let warnings = [];
  try {
    const result = parseCSV(piecesToCSV(pieces));
    warnings = result.warnings || [];
  } catch {
    return '';
  }
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
