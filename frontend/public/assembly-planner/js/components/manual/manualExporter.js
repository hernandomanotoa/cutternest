// js/components/manual/manualExporter.js — Exportación de manual de ensamblaje
// Requiere DOM global (window, document) para html2canvas/jsPDF.

import { generarInstruccion, toolsForStep } from '../../instructions.js';
import { COLORS } from '../../core/config.js';

export function buildStandaloneHtml(steps, piecesById, moduleLabel = 'CutterNest') {
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
body { font-family: system-ui, sans-serif; margin: 2rem; background: #fff; color: ${COLORS.textDark}; }
h1, h2 { color: ${COLORS.textDark}; }
section { margin-bottom: 2rem; }
@media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>Manual de Ensamblaje — ${moduleLabel}</h1>
${body}
</body>
</html>`;
}

export async function exportCurrentStepPdf(step, piecesById, moduleLabel) {
  const hasJsPDF = typeof window.jspdf?.jsPDF === 'function';
  const hasHtml2Canvas = typeof window.html2canvas === 'function';
  if (!hasJsPDF || !hasHtml2Canvas) {
    alert('Las librerías de PDF no están disponibles. Ejecuta "pnpm install" y vuelve a compilar.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const svgEl = document.querySelector('#manual-step-content svg');
  if (!svgEl) {
    alert('No hay diagrama para exportar en este paso.');
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
    alert('No se pudo generar el PDF. Revisa la consola para más detalles.');
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
