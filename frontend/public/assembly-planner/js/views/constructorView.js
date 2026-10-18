// js/views/constructorView.js — Vista "Constructor": armado paso a paso de
// closets abiertos (modulos + contenido) y gestion de versiones del diseno.
// La logica de construccion vive en services/closetBuilderService.js y la de
// versiones en services/projectVersionsService.js; aqui solo UI + pegamento
// con las acciones de app.js (regla de oro: sin logica de negocio en views/).

import { getModuleGroups, escapeHtml } from '../utils/helpers.js';
import { countRootModules } from '../services/closetBuilderService.js';
import { listVersions } from '../services/projectVersionsService.js';
import { toast } from '../components/toast.js';
import {
  addModuleFromBuilder,
  addContentToModule,
  removeModule,
  saveCurrentVersion,
  loadVersionById,
  deleteVersionById,
  deleteAllVersionsAction,
} from '../app.js';

const ALTO_VANO_OPCIONES = [130, 180, 200, 220, 280];

export function createConstructorView(store) {
  let unsubscribe = null;
  let container = null;

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', render);
    container.addEventListener('click', onClick);
    render();
  }

  function destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (container) {
      container.removeEventListener('click', onClick);
    }
    container = null;
  }

  // Fuerza re-render tras acciones que no mutan el store (versiones viven
  // en localStorage y no emiten state:changed).
  function refresh() {
    if (container) render();
  }

  function onClick(e) {
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
      };
      const r = addModuleFromBuilder(cfg);
      if (r.ok) toast(`Modulo ${r.moduleId} agregado`, { type: 'success' });
      else toast(r.errors.join('; '), { type: 'error' });
    } else if (action === 'add-content') {
      const moduleId = btn.dataset.module;
      const kind = btn.dataset.kind;
      const altoVano = Number(container.querySelector(`[data-alto-vano="${CSS.escape(moduleId)}"]`)?.value) || 200;
      const r = addContentToModule(moduleId, kind, { altoVano });
      if (r.ok) toast(`${labelKind(kind)} agregado al modulo ${moduleId}`, { type: 'success' });
      else toast(r.errors.join('; '), { type: 'error' });
    } else if (action === 'remove-module') {
      const moduleId = btn.dataset.module;
      if (btn.dataset.confirm === '1') {
        removeModule(moduleId);
        toast(`Modulo ${moduleId} eliminado`, { type: 'info' });
      } else {
        btn.dataset.confirm = '1';
        btn.textContent = '¿Seguro?';
        setTimeout(() => {
          if (btn.isConnected) {
            btn.dataset.confirm = '';
            btn.textContent = 'Eliminar módulo';
          }
        }, 2500);
      }
    } else if (action === 'save-version') {
      const name = container.querySelector('[data-version-name]')?.value?.trim();
      const r = saveCurrentVersion(name);
      if (r.ok) {
        toast(`Versión "${r.version.name}" guardada`, { type: 'success' });
        refresh();
      } else {
        toast(r.error || 'No se pudo guardar', { type: 'error' });
      }
    } else if (action === 'load-version') {
      const r = loadVersionById(btn.dataset.id);
      if (r.ok) toast(`Versión "${r.name}" cargada`, { type: 'success' });
      else toast(r.error || 'No se pudo cargar', { type: 'error' });
    } else if (action === 'delete-version') {
      if (btn.dataset.confirm === '1') {
        deleteVersionById(btn.dataset.id);
        toast('Versión eliminada', { type: 'info' });
        refresh();
      } else {
        btn.dataset.confirm = '1';
        btn.textContent = '¿Seguro?';
        setTimeout(() => {
          if (btn.isConnected) {
            btn.dataset.confirm = '';
            btn.textContent = 'Eliminar';
          }
        }, 2500);
      }
    } else if (action === 'delete-all-versions') {
      if (btn.dataset.confirm === '1') {
        deleteAllVersionsAction();
        toast('Todas las versiones eliminadas', { type: 'info' });
        refresh();
      } else {
        btn.dataset.confirm = '1';
        btn.textContent = '¿Eliminar TODAS?';
        setTimeout(() => {
          if (btn.isConnected) {
            btn.dataset.confirm = '';
            btn.textContent = 'Eliminar todas';
          }
        }, 2500);
      }
    }
  }

  function render() {
    if (!container) return;
    const state = store.get();
    const groups = getModuleGroups(state.pieces || []);
    const versions = listVersions();
    container.innerHTML = `
      <div class="card mb-2">
        <div class="card__header"><h2 class="card__title">Constructor de clóset — agregar módulo</h2></div>
        <div class="card__body">
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
            <label class="form-group cn-constructor__check">
              <input type="checkbox" data-cfg="zocalo" checked /> Zócalo inferior
            </label>
          </div>
          <button class="btn btn--primary" data-action="add-module">+ Agregar módulo</button>
          <p class="empty-state" style="margin-top:0.5rem;">
            Módulos en el mueble: ${countRootModules(state.pieces || [])}. Las vistas isométrica y 3D muestran todo el mueble al seleccionar "Vista completa".
          </p>
        </div>
      </div>

      <div class="card mb-2">
        <div class="card__header"><h2 class="card__title">Módulos y contenido</h2></div>
        <div class="card__body">
          ${groups.length === 0
            ? '<p class="empty-state">Todavía no hay módulos. Agrega el primero arriba.</p>'
            : groups.map((g) => renderModuleCard(g, state)).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card__header"><h2 class="card__title">Versiones del diseño</h2></div>
        <div class="card__body">
          <div class="cn-constructor__version-form">
            <input type="text" data-version-name placeholder="Nombre de la versión (ej. Closet v1)" maxlength="80" />
            <button class="btn btn--primary" data-action="save-version">Guardar versión</button>
          </div>
          ${versions.length === 0
            ? '<p class="empty-state">No hay versiones guardadas todavía.</p>'
            : `<div class="table-container"><table>
                <thead><tr><th>Nombre</th><th>Piezas</th><th>Fecha</th><th>Acciones</th></tr></thead>
                <tbody>
                  ${versions.map((v) => `
                    <tr>
                      <td>${escapeHtml(v.name)}</td>
                      <td>${v.pieceCount}</td>
                      <td>${formatFecha(v.savedAt)}</td>
                      <td class="cn-constructor__actions">
                        <button class="btn btn--secondary btn--sm" data-action="load-version" data-id="${escapeHtml(v.id)}">Cargar</button>
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

function renderModuleCard(group, state) {
  const moduleId = group.id;
  const piezas = (state.pieces || []).filter((p) => String(p.modulo) === String(moduleId));
  const countByKind = (kind) => {
    const pref = { shelf: `m${moduleId}-repisa-`, drawer: `m${moduleId}cajon`, shoeRack: `m${moduleId}zapatera`, rail: `m${moduleId}-barra-` }[kind];
    return piezas.filter((p) => String(p.id).startsWith(pref)).length;
  };
  return `
    <div class="cn-constructor__module">
      <div class="cn-constructor__module-head">
        <strong>${escapeHtml(group.label)}</strong>
        <span class="empty-state" style="margin:0;">${piezas.length} piezas estructurales</span>
        <span class="cn-constructor__spacer"></span>
        <label class="form-group" style="margin:0;">Vano cajón
          <select data-alto-vano="${escapeHtml(moduleId)}">
            ${ALTO_VANO_OPCIONES.map((h) => `<option value="${h}" ${h === 200 ? 'selected' : ''}>${h} mm</option>`).join('')}
          </select>
        </label>
        <button class="btn btn--danger btn--sm" data-action="remove-module" data-module="${escapeHtml(moduleId)}">Eliminar módulo</button>
      </div>
      <div class="cn-constructor__content-btns">
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shelf">+ Repisa (${countByKind('shelf')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="drawer">+ Cajón (${countByKind('drawer')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shoeRack">+ Zapatera (${countByKind('shoeRack')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="rail">+ Barra (${countByKind('rail')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="zocalo">+ Zócalo</button>
      </div>
    </div>
  `;
}

function labelKind(kind) {
  return { shelf: 'Repisa', drawer: 'Cajón', shoeRack: 'Zapatera', rail: 'Barra', zocalo: 'Zócalo' }[kind] || kind;
}

function formatFecha(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}
