// js/components/manual/manualExporter.js — Exportación de manual de ensamblaje
// Requiere DOM global (window, document) para html2canvas/jsPDF.

import { generarInstruccion, toolsForStep } from '../../services/instructions.js';
import { golaReport } from '../../services/golaService.js';
import { COLORS, UI_COLORS } from '../../core/config.js';
import { toast } from '../toast.js';
import {
  FICHAS,
  ESTRUCTURAS_CONSTRUCTIVAS,
  USO_TABLERO,
  NIVELES_COMPLEJIDAD,
} from '../../core/furnitureTaxonomy.js';

// "mesa_centro_lateral" → "mesa centro lateral"
function humanize(key) {
  return String(key || '').replace(/_/g, ' ');
}

function formatRango([min, max]) {
  return `${min}–${max} mm`;
}

// [90, 150] → "aprox. 1.5–2.5 h"
function formatTiempo([min, max]) {
  const h = (v) => Math.round((v / 60) * 10) / 10;
  return `aprox. ${h(min)}–${h(max)} h`;
}

// Sección "Ficha técnica" al inicio del manual. `ficha` llega ya con las
// correcciones manuales aplicadas (applyFichaCorrections). Solo se renderiza
// cuando hay un tipo resuelto; sin clasificación no hay sección.
function renderFichaSection(ficha) {
  const c = ficha?.clasificacion;
  if (!c || !c.tipo) return '';
  const fichaTipo = FICHAS[c.tipo];
  const medidasStd = fichaTipo
    ? `Estándar: ${formatRango(fichaTipo.medidasEstandar.ancho)} (ancho) × ${formatRango(fichaTipo.medidasEstandar.alto)} (alto) × ${formatRango(fichaTipo.medidasEstandar.prof)} (prof).`
    : '';
  const medidasProyecto = ficha?.medidasProyecto
    ? `Proyecto: ${ficha.medidasProyecto.width} × ${ficha.medidasProyecto.height} × ${ficha.medidasProyecto.depth} mm (ancho × alto × prof).`
    : '';
  const herrajes = fichaTipo
    ? `<ul>${fichaTipo.herrajesTipicos.map((h) => `<li>${h}</li>`).join('')}</ul>`
    : '';
  const tiempo = fichaTipo
    ? `<p>Tiempo estimado: ${formatTiempo(fichaTipo.tiempoMinutos)} (ajustable).</p>`
    : '';

  return `
    <section style="page-break-after: always; margin-bottom: 2rem;">
      <h2>Ficha técnica</h2>
      <p>Mueble: ${humanize(c.tipo)}${c.ambiente ? ` — ambiente: ${humanize(c.ambiente)}` : ''}.</p>
      <p>Estructura: ${ESTRUCTURAS_CONSTRUCTIVAS[c.estructura]?.label || humanize(c.estructura)}. Uso de tablero: ${USO_TABLERO[c.usoTablero]?.label || humanize(c.usoTablero)}. Nivel: ${NIVELES_COMPLEJIDAD[c.nivel]?.label || c.nivel}.</p>
      <p>${medidasStd} ${medidasProyecto}</p>
      ${fichaTipo ? `<p>Herrajes típicos:</p>${herrajes}` : ''}
      ${tiempo}
    </section>
  `;
}

// Sección "Plano de ensamble del zócalo" (solo con zócalo estructural a
// marco): orden de armado en el piso, uniones entre sub-zócalos (modo
// segmentado), divisiones paralelas al frente bajo cajones (modo único),
// niveladores y verificación de levantamiento en vertical.
function renderLevantamiento(plan) {
  const lev = plan.levantamiento;
  if (!lev || lev.skipped) return '';
  return `<p><strong>Levantamiento en vertical:</strong> diagonal del cuerpo ${lev.diagonal.toFixed(0)} mm
    + margen de seguridad vs techo → holgura <strong>${lev.holgura.toFixed(0)} mm</strong>
    (${lev.levantamientoOk ? '✓ cabe' : '✕ NO cabe, reducir alto del cuerpo'}).</p>`;
}

function renderPlinthPlanSection(plan) {
  if (!plan) return '';
  const sub = plan.segments.map((s) => `
    <li><strong>Zócalo ${plan.segments.length > 1 ? `S${s.index}` : ''}</strong> (${s.width} mm de ancho):
    ensamblar trasero, 2 costados y frente a escuadra con tarugos${s.montantes ? `; fijar ${s.montantes} montante(s) interior(es) entre frente y trasero` : ''}.
    Instalar ${s.niveladores} niveladores ocultos M8/M10 (±25 mm) en el interior del marco.</li>`).join('');
  const uniones = plan.empalme
    ? `<p>Empalme de los largueros (frente y trasero) a ${plan.empalme.x} mm del origen:
    tarugos Ø8 + cola, a escuadra, sobre la junta del módulo.</p>`
    : (plan.uniones.length
      ? `<p>Unión entre zócalos: ${plan.uniones.map((u) => `S${u.entre[0]}–S${u.entre[1]} (a ${u.x} mm del origen)`).join('; ')}:
    tornillos cada 150 mm atravesando los costados enfrentados.</p>`
      : '');
  return `
    <section style="page-break-after: always; margin-bottom: 2rem;">
      <h2>Plano de ensamble del zócalo</h2>
      <p>El mueble se arma en el piso sobre el zócalo y se levanta en vertical dentro de la habitación.</p>
      <ol>${sub}</ol>
      ${uniones}
      ${renderLevantamiento(plan)}
    </section>
  `;
}

// Sección "Canales gola" (piezas rol gola_strip): tabla por pieza del
// canal (fondo y pestañas) con ubicación, corte ancho×alto, cantidad,
// material (melamina del módulo) y fijación.
function renderGolaSection(rows) {
  if (!rows.length) return '';
  const body = rows.map((r) => `
    <tr>
      <td>${r.id}</td>
      <td>${r.ubicacion}</td>
      <td>${r.corteMm} × ${r.altoMm} mm</td>
      <td>${r.cantidad}</td>
      <td>${r.material}</td>
      <td>${r.fijacion}</td>
    </tr>`).join('');
  return `
    <section style="page-break-after: always; margin-bottom: 2rem;">
      <h2>Canales gola (melamina)</h2>
      <p>Sistema de apertura sin tiradores construido con el mismo tablero del módulo: por cada gap entre frentes, un canal tipo C (fondo retranqueado + pestaña superior e inferior) y, bajo la repisa, un canal tipo L (fondo + pestaña inferior). El frente superior se estira para tapar la pestaña de la L; su caja queda rebajada para pasar bajo el canal.</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr><th>Identificador</th><th>Ubicación</th><th>Corte (ancho × alto)</th><th>Cantidad</th><th>Material/acabado</th><th>Observaciones de fijación</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `;
}

export function buildStandaloneHtml(steps, piecesById, moduleLabel = 'CutterNest', ficha = null, plinthPlan = null, options = {}) {
  const golaRows = golaReport(
    Object.values(piecesById || {}),
    options.userConfig || {},
    { lFrontIds: options.golaLFrontIds || [] },
  );
  const body = steps.map((s) => {
    const completed = new Set();
    for (let i = 0; i < steps.indexOf(s); i++) completed.add(steps[i].paso);
    return `
      <section style="page-break-after: always; margin-bottom: 2rem;">
        <h2>Paso ${s.paso}: ${generarInstruccion(s, piecesById)}</h2>
        <p>Piezas: ${s.piezas.map((id) => piecesById[id]?.nombre).filter(Boolean).join(', ')}</p>
        <p>Herramientas: ${toolsForStep(s, piecesById).join(', ')}</p>
        <p>Tiempo estimado: ${s.tiempo} min</p>
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Manual de Ensamblaje CutterNest — ${moduleLabel}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; background: ${UI_COLORS.white}; color: ${COLORS.textDark}; }
h1, h2 { color: ${COLORS.textDark}; }
section { margin-bottom: 2rem; }
@media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>Manual de Ensamblaje — ${moduleLabel}</h1>
${renderFichaSection(ficha)}
${renderPlinthPlanSection(plinthPlan)}
${renderGolaSection(golaRows)}
${body}
</body>
</html>`;
}

export async function exportCurrentStepPdf(step, piecesById, moduleLabel) {
  const hasJsPDF = typeof window.jspdf?.jsPDF === 'function';
  const hasHtml2Canvas = typeof window.html2canvas === 'function';
  if (!hasJsPDF || !hasHtml2Canvas) {
    const missing = [!hasJsPDF && 'jspdf', !hasHtml2Canvas && 'html2canvas'].filter(Boolean).join(' y ');
    toast(`Exportación PDF no disponible: falta ${missing}. Ejecuta "pnpm install" y recarga la página.`, { type: 'error' });
    return;
  }

  const { jsPDF } = window.jspdf;
  const svgEl = document.querySelector('#manual-step-content svg');
  if (!svgEl) {
    toast('No hay diagrama para exportar en este paso.', { type: 'info' });
    return;
  }

  try {
    const canvas = await html2canvas(svgEl, { backgroundColor: COLORS.background, scale: 2 });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 14;

    pdf.setFontSize(16);
    pdf.text(`Manual de ensamblaje — ${moduleLabel}`, margin, margin + 6);

    const tools = toolsForStep(step, piecesById);
    const piecesText = step.piezas.map((id) => piecesById[id]?.nombre).filter(Boolean).join(', ');

    pdf.setFontSize(11);
    pdf.text(`Paso ${step.paso}: ${generarInstruccion(step, piecesById)}`, margin, margin + 14);
    pdf.setFontSize(10);
    pdf.text(`Piezas: ${piecesText || 'Ninguna'}`, margin, margin + 21);
    pdf.text(`Herramientas: ${tools.join(', ') || 'Ninguna'}`, margin, margin + 27);
    pdf.text(`Tiempo estimado: ${step.tiempo} min`, margin, margin + 33);

    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
    const maxImgH = pageH - (margin + 38) - margin;
    const finalH = Math.min(imgH, maxImgH);
    const finalW = (canvas.width * finalH) / canvas.height;
    const x = (pageW - finalW) / 2;
    pdf.addImage(imgData, 'PNG', x, margin + 38, finalW, finalH);

    pdf.save(`manual-paso-${step.paso}-${moduleLabel.replace(/\s+/g, '_')}.pdf`);
  } catch (err) {
    console.error(err);
    toast('No se pudo generar el PDF. Revisa la consola para más detalles.', { type: 'error' });
  }
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
