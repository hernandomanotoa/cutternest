// js/views/auditView.js — Vista "Auditoría": informe consolidado de
// validaciones con autorización de corte. Sigue el patrón de vistas:
// ciclo {mount, destroy}, suscripción al store y tolerancia a chrome parcial
// (funciona montada en un contenedor vacío, como en los tests DOM).

import { $ } from '../components/domUtils.js';
import { escapeHtml } from '../utils/helpers.js';
import { buildAuditReport, AUDIT_SECCIONES } from '../services/auditReportService.js';
import { exportAuditReport } from '../components/auditExporter.js';
import { buildPlanosData, exportPlanos } from '../components/planosExporter.js';

const ESTADO_LABEL = {
  validado: 'Validado',
  'por-corregir': 'Por corregir',
  pendiente: 'Pendiente de información',
};

const ESTADO_BADGE = {
  validado: 'badge--success',
  'por-corregir': 'badge--danger',
  pendiente: 'badge--warning',
};

export function createAuditView(store) {
  let unsubscribe = null;
  let container = null;
  let ultimoReporte = null;
  let ultimosPlanos = null;

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', render);
    render();
  }

  function destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    container = null;
    ultimoReporte = null;
    ultimosPlanos = null;
  }

  function render() {
    if (!container) return;
    const state = store.get();
    const pieces = state.pieces || [];
    if (!pieces.length) {
      ultimoReporte = null;
      ultimosPlanos = null;
      container.innerHTML = `
        <div class="card">
          <div class="card__body">
            <p class="empty-state">Importa un CSV o construye un mueble en el Constructor para generar el informe de auditoría.</p>
          </div>
        </div>`;
      return;
    }

    ultimoReporte = buildAuditReport(pieces, state.userConfig || {});
    ultimosPlanos = buildPlanosData(pieces, state.userConfig || {});
    container.innerHTML = `
      <div class="card mb-2">
        <div class="card__header">
          <h2 class="card__title">Informe de auditoría — autorización de corte</h2>
          <button id="btn-export-audit" class="btn btn--secondary" type="button">⬇ Exportar informe (HTML)</button>
        </div>
        <div class="card__body">
          ${renderBanner(ultimoReporte)}
          ${renderTabla(ultimoReporte)}
        </div>
      </div>
      ${renderPlanosCard(ultimosPlanos)}`;

    $('#btn-export-audit')?.addEventListener('click', () => {
      if (ultimoReporte) exportAuditReport(ultimoReporte);
    });
    $('#btn-export-planos')?.addEventListener('click', () => {
      if (ultimosPlanos) exportPlanos(ultimosPlanos);
    });
  }

  return { mount, destroy };
}

// Sección "Planos acotados": alzado frontal por módulo + secciones gola C/L
// con su detalle de fijación (documentation de validación del taller).
function renderPlanosCard(planos) {
  if (!planos) return '';
  const { frontales = [], secciones = [], advertencias = [] } = planos;
  const vacio = !frontales.length && !secciones.length;
  if (vacio) return '';

  const frontalesHtml = frontales.map((f) => `
    <div class="plano-modulo" data-modulo="${escapeHtml(f.moduleId)}">
      <h3 class="plano-modulo__titulo">Alzado frontal — Módulo ${escapeHtml(f.moduleId)} (${escapeHtml(f.ancho)} × ${escapeHtml(f.alto)} mm)</h3>
      <div class="plano-modulo__svg">${f.svg}</div>
    </div>`).join('');

  const seccionesHtml = secciones.length
    ? secciones.map((s) => `
    <div class="plano-seccion" data-canal="${escapeHtml(s.canalId)}">
      <h3 class="plano-modulo__titulo">Sección ${s.tipo === 'C' ? 'transversal' : 'vertical'} — ${escapeHtml(s.descripcion)}</h3>
      <div class="plano-modulo__svg">${s.svg}</div>
      <p class="plano-fijacion"><strong>Fijación:</strong> ${escapeHtml(s.planTxt)}</p>
    </div>`).join('')
    : '<p class="empty-state">Sin canales gola en el diseño.</p>';

  const advertenciasHtml = advertencias.length
    ? `<div class="alert alert--warning">${advertencias.map(escapeHtml).join('<br>')}</div>`
    : '';

  return `
    <div class="card mb-2" id="audit-planos">
      <div class="card__header">
        <h2 class="card__title">Planos acotados</h2>
        <button id="btn-export-planos" class="btn btn--secondary" type="button">⬇ Exportar planos (HTML)</button>
      </div>
      <div class="card__body">
        ${advertenciasHtml}
        ${frontalesHtml}
        <h3 class="plano-modulo__titulo">Secciones gola</h3>
        ${seccionesHtml}
      </div>
    </div>`;
}

function renderBanner(reporte) {
  const { conteo, corteAutorizado } = reporte;
  if (corteAutorizado) {
    return `
      <div class="alert alert--success" role="status">
        ✓ <strong>Despiece autorizado</strong>: 0 elementos por corregir
        (${conteo.validado} validado(s), ${conteo.pendiente} pendiente(s) de información).
      </div>`;
  }
  return `
    <div class="alert alert--danger" role="alert">
      ✕ <strong>No autorizar el corte: ${conteo['por-corregir']} elemento(s) por corregir.</strong>
      Resuélvalos antes de enviar el despiece a corte.
    </div>`;
}

function renderTabla(reporte) {
  const porSeccion = new Map();
  for (const f of reporte.rows) {
    if (!porSeccion.has(f.seccion)) porSeccion.set(f.seccion, []);
    porSeccion.get(f.seccion).push(f);
  }
  const secciones = AUDIT_SECCIONES.filter((s) => porSeccion.has(s));
  const body = secciones.map((seccion) => `
    <tr class="audit-section-row"><th colspan="6">${escapeHtml(seccion)}</th></tr>
    ${porSeccion.get(seccion).map(renderFila).join('')}
  `).join('');

  return `
    <div class="table-container">
      <table class="audit-table">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Medida/solución actual</th>
            <th>Estado</th>
            <th>Problema</th>
            <th>Corrección recomendada</th>
            <th>Justificación técnica</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderFila(f) {
  return `
    <tr data-estado="${f.estado}">
      <td>${escapeHtml(f.elemento)}</td>
      <td>${escapeHtml(f.medida || '—')}</td>
      <td><span class="badge ${ESTADO_BADGE[f.estado] || 'badge--secondary'}">${ESTADO_LABEL[f.estado] || escapeHtml(f.estado)}</span></td>
      <td>${escapeHtml(f.problema)}</td>
      <td>${escapeHtml(f.correccion)}</td>
      <td>${escapeHtml(f.justificacion)}</td>
    </tr>`;
}
