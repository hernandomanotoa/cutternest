// js/views/constructorView.js — Vista "Constructor": armado paso a paso de
// closets abiertos (modulos + contenido) y gestion de versiones del diseno.
// La logica de construccion vive en services/closetBuilderService.js y la de
// versiones en services/projectVersionsService.js; aqui solo UI + pegamento
// con las acciones de app.js (regla de oro: sin logica de negocio en views/).

import { getModuleGroups, escapeHtml } from '../utils/helpers.js';
import { countRootModules } from '../services/closetBuilderService.js';
import { listVersions, suggestedVersionName } from '../services/projectVersionsService.js';
import { toast } from '../components/toast.js';
import {
  addModuleFromBuilder,
  addContentToModule,
  removeModule,
  duplicateModule,
  recolorModule,
  clearAllPieces,
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
} from '../app.js';

const ALTO_VANO_OPCIONES = [130, 180, 200, 220, 280];
const TIPOS_CAJON = [
  { value: 'corredera', label: 'Corredera' },
  { value: 'volquete', label: 'Volquete' },
];

export function createConstructorView(store) {
  let unsubscribe = null;
  let container = null;

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', render);
    container.addEventListener('click', onClick);
    container.addEventListener('keydown', onKeydown);
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
    }
    container = null;
  }

  // Fuerza re-render tras acciones que no mutan el store (versiones viven
  // en localStorage y no emiten state:changed).
  function refresh() {
    if (container) render();
  }

  function onKeydown(e) {
    // Enter en el nombre de version guarda (mejora #12).
    if (e.key === 'Enter' && e.target.matches('[data-version-name]')) {
      e.preventDefault();
      saveVersionFromInput();
    }
  }

  function saveVersionFromInput() {
    const name = container.querySelector('[data-version-name]')?.value?.trim();
    const r = saveCurrentVersion(name);
    if (r.ok) {
      toast(`Versión "${r.version.name}" guardada`, { type: 'success' });
      refresh();
    } else {
      toast(r.error || 'No se pudo guardar', { type: 'error' });
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
      const altoVano = Number(container.querySelector(`${scoped} [data-alto-vano]`)?.value) || 200;
      const tipo = container.querySelector(`${scoped} [data-tipo-cajon]`)?.value || 'corredera';
      const colorFrente = container.querySelector(`${scoped} [data-color-frente]`)?.value || '#8B5A2B';
      const r = addContentToModule(moduleId, kind, { altoVano, tipo, colorFrente });
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
    } else if (action === 'save-version') {
      saveVersionFromInput();
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
          <span class="cn-constructor__summary" data-resumen>${resumenMueble(pieces)}</span>
          ${dirty ? '<span class="badge badge--secondary" title="Hay cambios sin guardar en una versión">● sin guardar</span>' : ''}
        </div>
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
            <button class="btn btn--secondary" data-action="export-current" ${pieces.length ? '' : 'disabled'}>Exportar CSV</button>
            <button class="btn btn--secondary" data-action="goto-view" data-view="isometric" ${pieces.length ? '' : 'disabled'}>Ver isométrica</button>
            <button class="btn btn--secondary" data-action="goto-view" data-view="renderer3d" ${pieces.length ? '' : 'disabled'}>Ver 3D</button>
            <button class="btn btn--danger" data-action="clear-all" ${pieces.length ? '' : 'disabled'}>Nuevo mueble</button>
          </div>
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
            <input type="text" data-version-name placeholder="${escapeHtml(suggestedVersionName())}" maxlength="80" />
            <button class="btn btn--primary" data-action="save-version">Guardar versión</button>
          </div>
          ${versions.length === 0
            ? '<p class="empty-state">No hay versiones guardadas todavía.</p>'
            : `<div class="table-container"><table>
                <thead><tr><th>Nombre</th><th>Piezas</th><th>Fecha</th><th>Acciones</th></tr></thead>
                <tbody>
                  ${versions.map((v) => `
                    <tr>
                      <td>
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

function renderModuleCard(group, allPieces) {
  const moduleId = group.id;
  const piezas = allPieces.filter((p) => String(p.modulo) === String(moduleId));
  const countByKind = (kind) => {
    const pref = { shelf: `m${moduleId}-repisa-`, drawer: `m${moduleId}cajon`, shoeRack: `m${moduleId}zapatera`, rail: `m${moduleId}-barra-` }[kind];
    return piezas.filter((p) => String(p.id).startsWith(pref)).length;
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
        <label class="form-group" style="margin:0;">Vano cajón
          <select data-alto-vano>
            ${ALTO_VANO_OPCIONES.map((h) => `<option value="${h}" ${h === 200 ? 'selected' : ''}>${h} mm</option>`).join('')}
          </select>
        </label>
        <label class="form-group" style="margin:0;">Tipo
          <select data-tipo-cajon>
            ${TIPOS_CAJON.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="form-group" style="margin:0;">Frente
          <input type="color" data-color-frente value="#8b5a2b" />
        </label>
        <label class="form-group" style="margin:0;">Cuerpo
          <input type="color" data-color-cuerpo value="#c19a6b" />
        </label>
        <button class="btn btn--secondary btn--sm" data-action="recolor-module" data-module="${escapeHtml(moduleId)}">Aplicar color</button>
        <button class="btn btn--secondary btn--sm" data-action="duplicate-module" data-module="${escapeHtml(moduleId)}">Duplicar</button>
        <button class="btn btn--danger btn--sm" data-action="remove-module" data-module="${escapeHtml(moduleId)}">Eliminar módulo</button>
      </div>
      <div class="cn-constructor__content-btns">
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shelf">+ Repisa (${countByKind('shelf')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="drawer">+ Cajón (${countByKind('drawer')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="shoeRack">+ Zapatera (${countByKind('shoeRack')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="rail">+ Barra (${countByKind('rail')})</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="doubleRail">+ Doble barra</button>
        <button class="btn btn--secondary btn--sm" data-action="add-content" data-module="${escapeHtml(moduleId)}" data-kind="zocalo">+ Zócalo</button>
      </div>
    </div>
  `;
}

// Alto util estimado del modulo y vano ocupado por frentes de cajon.
function vanoUsado(pieces, moduleId, altoModulo, tieneZocalo, altoZocalo) {
  const espesor = 15;
  const util = altoModulo - (tieneZocalo ? altoZocalo : 0) - espesor; // tapa
  const prefFrentes = [`m${moduleId}cajon`, `m${moduleId}zapatera`];
  let usado = 0;
  for (const p of pieces) {
    const id = String(p.id);
    if (!id.endsWith('-frente')) continue;
    if (prefFrentes.some((pref) => id.startsWith(pref))) usado += Number(p.alto) + 3; // altoVano ≈ frente + 3
  }
  const pct = util > 0 ? Math.min(100, Math.round((usado / util) * 100)) : 0;
  return { usado, util, pct };
}

function resumenMueble(pieces) {
  const modulos = countRootModules(pieces);
  if (!modulos) return 'Sin módulos';
  const ancho = anchoTotal(pieces);
  return `${modulos} módulo(s) · ${pieces.length} piezas · ≈${ancho} mm ancho`;
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
