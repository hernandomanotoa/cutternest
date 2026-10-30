// js/components/planosExporter.js — Exportación de planos acotados de taller
// (alzado frontal por módulo + secciones gola C/L + detalle de fijación).
// Componente sin estado. `buildPlanosData` y `buildPlanosHtml` son puras
// (string); la descarga usa el patrón de manualExporter.js/auditExporter.js
// (Blob + download compartido). HTML standalone imprimible, offline, sin
// librerías (los SVG van inline).

import { download } from './manual/manualExporter.js';
import { COLORS, UI_COLORS } from '../core/config.js';
import { getModuleGroups } from '../services/moduleService.js';
import { buildFrontElevation } from '../services/frontElevationService.js';
import { buildGolaSections } from '../services/golaSectionService.js';
import {
  renderFrontElevationSvg,
  renderGolaSectionSvg,
} from './renderers/frontElevationRenderer.js';

function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Ensambla los datos de los planos: un alzado frontal por módulo raíz, las
 * secciones de canales gola y el detalle de fijación (plan calculado por
 * canal). Pura: servicios + renderers, sin DOM.
 *
 * @param {object[]} pieces piezas del diseño.
 * @param {object} [userConfig] config del usuario.
 * @returns {{frontales: Array, secciones: Array, advertencias: string[]}}
 *   frontales: [{ moduleId, ancho, alto, modelo, svg }]
 *   secciones: [{ tipo, canalId, descripcion, modulo, svg, planTxt }]
 */
export function buildPlanosData(pieces, userConfig = {}) {
  const lista = pieces || [];
  const frontales = [];
  const advertencias = [];

  for (const grupo of getModuleGroups(lista)) {
    const modelo = buildFrontElevation(lista, grupo.id, userConfig);
    if (!modelo.ok) {
      advertencias.push(...(modelo.errors || []).map((e) => `Módulo ${grupo.id}: ${e}`));
      continue;
    }
    frontales.push({
      moduleId: grupo.id,
      ancho: modelo.ancho,
      alto: modelo.alto,
      modelo,
      svg: renderFrontElevationSvg(modelo),
    });
  }

  const secciones = buildGolaSections(lista, userConfig).map((s) => ({
    tipo: s.tipo,
    canalId: s.canalId,
    descripcion: s.descripcion,
    modulo: s.modulo,
    aberturaUtilMm: s.abertura.utilMm,
    svg: renderGolaSectionSvg(s),
    planTxt: s.planTxt,
  }));

  return { frontales, secciones, advertencias };
}

/**
 * HTML standalone imprimible de los planos acotados: alzado frontal de cada
 * módulo, secciones transversales gola (C y L) y detalle de fijación por
 * canal (resumen del plan calculado). Offline: CSS inline, SVG inline.
 */
export function buildPlanosHtml(planos, titulo = 'Planos acotados — CutterNest Assembly Planner') {
  const { frontales = [], secciones = [], advertencias = [] } = planos || {};

  const frontalesHtml = frontales.map((f) => `
  <section class="plano">
    <h2>Alzado frontal — Módulo ${esc(f.moduleId)} (${esc(f.ancho)} × ${esc(f.alto)} mm)</h2>
    ${f.svg}
  </section>`).join('');

  const seccionesHtml = secciones.length
    ? secciones.map((s) => `
  <section class="plano">
    <h2>Sección ${s.tipo === 'C' ? 'transversal' : 'vertical'} — ${esc(s.descripcion)} (Módulo ${esc(s.modulo)})</h2>
    ${s.svg}
    <p class="fijacion"><strong>Fijación:</strong> ${esc(s.planTxt)}</p>
  </section>`).join('')
    : '  <p>Sin canales gola en el diseño.</p>';

  const advertenciasHtml = advertencias.length
    ? `<p style="border: 2px solid ${COLORS.strokeWarning}; padding: 0.5rem;"><strong>Avisos:</strong> ${advertencias.map(esc).join(' · ')}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(titulo)}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; background: ${UI_COLORS.white}; color: ${COLORS.textDark}; }
h1 { font-size: 1.3rem; }
h2 { font-size: 1rem; margin-bottom: 0.25rem; }
section.plano { margin-bottom: 1.5rem; page-break-inside: avoid; }
p.fijacion { font-size: 0.8rem; max-width: 70ch; }
@media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>${esc(titulo)}</h1>
${advertenciasHtml}
${frontalesHtml}
<h1>Secciones gola</h1>
${seccionesHtml}
</body>
</html>`;
}

/** Descarga los planos como HTML standalone imprimible. Requiere DOM. */
export function exportPlanos(planos, filename = 'planos-acotados.html') {
  const html = buildPlanosHtml(planos);
  download(filename, new Blob([html], { type: 'text/html;charset=utf-8' }));
}
