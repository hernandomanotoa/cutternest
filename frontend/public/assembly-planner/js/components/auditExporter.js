// js/components/auditExporter.js — Exportación del informe de auditoría
// Componente sin estado. `buildAuditHtml` es pura (string); la descarga
// usa el patrón de manualExporter.js (Blob + `download` compartido).

import { download } from './manual/manualExporter.js';
import { COLORS, UI_COLORS } from '../core/config.js';

const ESTADO_LABEL = {
  validado: 'Validado',
  'por-corregir': 'Por corregir',
  pendiente: 'Pendiente de información',
};

const ESTADO_COLOR = {
  validado: COLORS.strokeSuccess,
  'por-corregir': COLORS.strokeDanger,
  pendiente: COLORS.strokeWarning,
};

function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filaHtml(f) {
  return `<tr>
    <td>${esc(f.elemento)}</td>
    <td>${esc(f.medida || '—')}</td>
    <td style="color: ${ESTADO_COLOR[f.estado] || COLORS.textDark}; font-weight: 700;">${ESTADO_LABEL[f.estado] || esc(f.estado)}</td>
    <td>${esc(f.problema)}</td>
    <td>${esc(f.correccion)}</td>
    <td>${esc(f.justificacion)}</td>
  </tr>`;
}

/**
 * HTML standalone imprimible del informe de auditoría (patrón
 * manualExporter.js): banner de autorización, conteo por estado y la tabla
 * del contrato (Elemento | Medida/solución actual | Estado | Problema |
 * Corrección recomendada | Justificación técnica), agrupada por sección.
 */
export function buildAuditHtml(reporte, titulo = 'Informe de auditoría — CutterNest Assembly Planner') {
  const { rows = [], conteo = {}, corteAutorizado = false } = reporte || {};
  const porSeccion = new Map();
  for (const f of rows) {
    if (!porSeccion.has(f.seccion)) porSeccion.set(f.seccion, []);
    porSeccion.get(f.seccion).push(f);
  }
  const secciones = [...porSeccion.entries()]
    .map(([seccion, filas]) => `
      <tr><th colspan="6" style="text-align: left; border-bottom: 2px solid ${COLORS.strokeDefault};">${esc(seccion)}</th></tr>
      ${filas.map(filaHtml).join('')}`)
    .join('');

  const banner = corteAutorizado
    ? `<p style="border: 2px solid ${COLORS.strokeSuccess}; padding: 0.75rem; font-weight: 700;">✓ Despiece autorizado: 0 elementos por corregir (${conteo.pendiente || 0} pendiente(s) de información).</p>`
    : `<p style="border: 2px solid ${COLORS.strokeDanger}; padding: 0.75rem; font-weight: 700;">✕ No autorizar el corte: ${conteo['por-corregir'] || 0} elemento(s) por corregir.</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(titulo)}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; background: ${UI_COLORS.white}; color: ${COLORS.textDark}; }
h1 { font-size: 1.3rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
th, td { border: 1px solid ${COLORS.strokeDefault}; padding: 4px 6px; vertical-align: top; text-align: left; }
@media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>${esc(titulo)}</h1>
${banner}
<p>Validado: <strong>${conteo.validado || 0}</strong> · Por corregir: <strong>${conteo['por-corregir'] || 0}</strong> · Pendiente de información: <strong>${conteo.pendiente || 0}</strong></p>
<table>
<thead>
<tr><th>Elemento</th><th>Medida/solución actual</th><th>Estado</th><th>Problema</th><th>Corrección recomendada</th><th>Justificación técnica</th></tr>
</thead>
<tbody>${secciones}</tbody>
</table>
</body>
</html>`;
}

/** Descarga el informe como HTML standalone imprimible. Requiere DOM. */
export function exportAuditReport(reporte, filename = 'informe-auditoria.html') {
  const html = buildAuditHtml(reporte);
  download(filename, new Blob([html], { type: 'text/html;charset=utf-8' }));
}
