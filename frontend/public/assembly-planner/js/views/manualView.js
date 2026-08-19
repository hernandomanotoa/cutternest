// manualView.js — Vista del manual de ensamblaje auto-generado

import { $, $$, isGlobalPiece, getModuleLabel, getModulePieces } from '../utils.js';
import { state } from '../app.js';
import { generarInstruccion, toolsForStep } from '../instructions.js';

export function renderManualView(container) {
  const moduleLabel = getModuleLabel(state.currentModule, state.pieces);
  const allActivePieces = state.pieces.filter((p) => {
    if (state.currentModule === 'global') return isGlobalPiece(p);
    return p.modulo === state.currentModule || isGlobalPiece(p);
  });
  const globalIds = new Set(allActivePieces.filter((p) => isGlobalPiece(p)).map((p) => p.id));

  if (!state.pieces.length) {
    container.innerHTML = '<div class="card"><div class="card__body"><p class="empty-state">Importa un CSV para generar el manual de ensamblaje.</p></div></div>';
    return;
  }

  if (state.cycle) {
    container.innerHTML = `<div class="card"><div class="card__body"><div class="alert alert--danger">Hay un ciclo en las dependencias. Corrígelo en la vista Grafo antes de generar el manual.</div></div></div>`;
    return;
  }

  if (!state.steps.length) {
    container.innerHTML = '<div class="card"><div class="card__body"><p class="empty-state">No se pudieron calcular pasos. Revisa las dependencias.</p></div></div>';
    return;
  }

  container.innerHTML = `
    <div class="manual-view">
      <div class="card mb-2">
        <div class="card__header">
          <div class="flex justify-between items-center">
            <h2 class="card__title">Manual de ensamblaje — ${moduleLabel}</h2>
            <div class="flex gap-1">
              <button id="btn-manual-pdf" class="btn btn--primary btn--sm">Exportar PDF</button>
              <button id="btn-manual-html" class="btn btn--secondary btn--sm">Exportar HTML</button>
              <button id="btn-manual-json" class="btn btn--secondary btn--sm">Exportar JSON</button>
              <button id="btn-manual-print" class="btn btn--secondary btn--sm">Imprimir</button>
            </div>
          </div>
        </div>
        <div class="card__body">
          ${globalIds.size ? `
            <div class="alert alert--info mb-2">
              <strong>Estructura global pre-ensamblada:</strong>
              <span class="flex flex-wrap gap-1 mt-1">
                ${Array.from(globalIds).map((id) => {
                  const p = state.pieces.find((x) => x.id === id);
                  return p ? `<span class="badge badge--secondary" style="border-left: 3px solid ${p.color};">${p.nombre}</span>` : '';
                }).join('')}
              </span>
            </div>
          ` : ''}
          <div class="flex justify-between items-center mb-2">
            <button id="btn-manual-prev" class="btn btn--secondary">‹ Anterior</button>
            <div id="manual-progress" class="flex-1 mx-2"></div>
            <span id="manual-counter" class="text-secondary"></span>
            <button id="btn-manual-next" class="btn btn--secondary">Siguiente ›</button>
          </div>
          <div id="manual-step-content"></div>
        </div>
      </div>
    </div>
  `;

  const piecesById = Object.fromEntries(state.pieces.map((p) => [p.id, p]));
  let current = 0;

  function renderStep() {
    const step = state.steps[current];
    const allSteps = state.steps;
    const completed = new Set();
    for (let i = 0; i < current; i++) {
      allSteps[i].piezas.forEach((id) => completed.add(id));
    }
    // Las piezas globales se consideran pre-ensambladas
    globalIds.forEach((id) => completed.add(id));
    const active = new Set(step.piezas);

    // Determinar el submódulo real de este paso para dibujar solo sus piezas
    const firstPieceId = step.piezas[0];
    const firstPiece = piecesById[firstPieceId];
    const stepModule = firstPiece && !isGlobalPiece(firstPiece)
      ? String(firstPiece.modulo).trim()
      : state.currentModule;
    const stepModuleLabel = stepModule !== state.currentModule && stepModule !== 'global'
      ? ` (Submódulo ${stepModule})`
      : '';
    const stepPieces = stepModule === 'global'
      ? state.pieces.filter(isGlobalPiece)
      : state.pieces.filter((p) => String(p.modulo || '1').trim() === stepModule);

    $('#manual-counter', container).textContent = `Paso ${current + 1} de ${allSteps.length}${stepModuleLabel}`;
    $('#manual-progress', container).innerHTML = allSteps.map((_, i) => `
      <span class="badge ${i <= current ? 'badge--success' : 'badge--secondary'}" style="margin-right: 0.25rem; cursor: pointer;" data-goto="${i}">•</span>
    `).join('');

    $$('#manual-progress [data-goto]', container).forEach((el) => {
      el.addEventListener('click', () => {
        current = Number(el.dataset.goto);
        renderStep();
      });
    });

    const tools = toolsForStep(step, piecesById);
    const warning = step.piezas.some((id) => {
      const p = piecesById[id];
      return p && (p.riesgo === 'critico' || p.riesgo === 'alto');
    });

    $('#manual-step-content', container).innerHTML = `
      <h3 class="mb-1">PASO ${step.paso}: ${generarInstruccion(step, piecesById).split('.')[0]}${stepModuleLabel}</h3>
      <p class="mb-2">${generarInstruccion(step, piecesById)}</p>
      ${warning ? '<div class="alert alert--warning">Este paso incluye piezas con riesgo estructural. Verifica soportes antes de continuar.</div>' : ''}
      <div class="manual-step mb-2">
        ${generarDiagramaPaso(step, piecesById, completed, active, stepPieces, stepModule)}
      </div>
      <div class="flex gap-2 flex-wrap mb-2">
        <div class="card" style="flex: 1; min-width: 220px;">
          <div class="card__header"><h4 class="card__title">Piezas involucradas</h4></div>
          <div class="card__body">
            ${step.piezas.map((id) => {
              const p = piecesById[id];
              if (!p) return '';
              return `
                <div class="flex gap-1 items-center mb-1">
                  <span class="swatch" style="background: ${p.color};"></span>
                  <div>
                    <strong>${p.nombre}</strong>
                    <div style="font-size: 0.75rem; color: #94a3b8;">${p.ancho}×${p.alto} mm · ${p.cantidad} u.</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="card" style="flex: 1; min-width: 220px;">
          <div class="card__header"><h4 class="card__title">Herramientas necesarias</h4></div>
          <div class="card__body">
            <ul class="mb-0">
              ${tools.map((t) => `<li>${t}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  $('#btn-manual-prev', container)?.addEventListener('click', () => {
    if (current > 0) { current--; renderStep(); }
  });
  $('#btn-manual-next', container)?.addEventListener('click', () => {
    if (current < state.steps.length - 1) { current++; renderStep(); }
  });

  $('#btn-manual-json', container)?.addEventListener('click', () => {
    const payload = {
      proyecto: 'CutterNest',
      modulo: moduleLabel,
      totalPasos: state.steps.length,
      pasos: state.steps.map((s, i) => ({
        paso: s.paso,
        piezas: s.piezas.map((id) => ({ id, nombre: piecesById[id]?.nombre, dimensiones: `${piecesById[id]?.ancho}×${piecesById[id]?.alto}` })),
        instruccion: generarInstruccion(s, piecesById),
        herramientas: toolsForStep(s, piecesById),
        tiempo: s.tiempo,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    download('manual.json', blob);
  });

  $('#btn-manual-html', container)?.addEventListener('click', () => {
    const html = buildStandaloneHtml(state.steps, piecesById, moduleLabel);
    const blob = new Blob([html], { type: 'text/html' });
    download('manual-ensamblaje.html', blob);
  });

  $('#btn-manual-print', container)?.addEventListener('click', () => {
    window.print();
  });

  $('#btn-manual-pdf', container)?.addEventListener('click', () => {
    const step = state.steps[current];
    exportCurrentStepPdf(step, piecesById, moduleLabel);
  });

  renderStep();
}

async function exportCurrentStepPdf(step, piecesById, moduleLabel) {
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
    const canvas = await html2canvas(svgEl, { backgroundColor: '#0f172a', scale: 2 });
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

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function generarDiagramaPaso(paso, piecesById, completedIds, activeIds, allActivePieces, stepModule) {
  const width = 700;
  const height = 420;
  const margin = { top: 30, right: 30, bottom: 30, left: 30 };

  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  const all = allActivePieces || state.pieces;
  const activeList = Array.from(activeIds).map((id) => piecesById[id]).filter(Boolean);

  // Detectar paso de submodulo de cajon: modulo de 2+ digitos y todas las piezas son del cajon
  const moduleStr = String(stepModule || '').trim();
  const isCajonSubmodulo = moduleStr && moduleStr !== 'global' && moduleStr.length >= 2 &&
    all.some((p) => norm(p.nombre).includes('cajon'));

  if (isCajonSubmodulo) {
    return generarDiagramaCajon(all, piecesById, completedIds, activeIds, width, height, margin);
  }

  // Layout heurístico simple: laterales a los lados, base abajo, tapa arriba, repisas intermedias
  const base = all.find((p) => norm(p.nombre).includes('base') && !norm(p.nombre).includes('cajon'));
  const tapa = all.find((p) => norm(p.nombre).includes('tapa') && !norm(p.nombre).includes('cajon'));
  const laterales = all.filter((p) => norm(p.nombre).includes('lateral') && !norm(p.nombre).includes('cajon'));
  const repisaGroups = all
    .filter((p) => (norm(p.nombre).includes('repisa') || norm(p.nombre).includes('estante')) && !norm(p.nombre).includes('cajon'))
    .reduce((map, p) => {
      const key = p.originalId || p.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
      return map;
    }, new Map());
  const repisas = Array.from(repisaGroups.values()).map((group) => group[0]);
  const repisaInstances = Array.from(repisaGroups.values());
  const fondo = all.find((p) => norm(p.nombre).includes('fondo') && !norm(p.nombre).includes('cajon'));
  const frentesCajon = all.filter((p) => norm(p.nombre).includes('frente') && norm(p.nombre).includes('cajon'));
  const tiradores = all.filter((p) => norm(p.nombre).includes('tirador'));

  const svgParts = [];

  function rect(x, y, w, h, color, opacity = 1, stroke = '#334155', label = '') {
    const sx = x + margin.left;
    const sy = y + margin.top;
    return `
      <rect x="${sx}" y="${sy}" width="${w}" height="${h}" rx="3" fill="${color}" stroke="${stroke}" stroke-width="2" opacity="${opacity}" />
      ${label ? `<text x="${sx + w/2}" y="${sy + h/2 + 4}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600">${label}</text>` : ''}
    `;
  }

  function circle(x, y, r, color, opacity = 1, stroke = '#334155') {
    const sx = x + margin.left;
    const sy = y + margin.top;
    return `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${color}" stroke="${stroke}" stroke-width="2" opacity="${opacity}" />`;
  }

  // Estructura de referencia (caja)
  const boxX = 180, boxY = 80, boxW = 320, boxH = 240;
  svgParts.push(`<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" fill="none" stroke="#334155" stroke-dasharray="4 4" opacity="0.4" />`);

  if (base) {
    const isActive = activeIds.has(base.id);
    const isDone = completedIds.has(base.id) || isActive;
    svgParts.push(rect(boxX, boxY + boxH - 20, boxW, 20, base.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Base'));
  }
  if (tapa) {
    const isActive = activeIds.has(tapa.id);
    const isDone = completedIds.has(tapa.id) || isActive;
    svgParts.push(rect(boxX, boxY, boxW, 20, tapa.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Tapa'));
  }
  laterales.forEach((lat, i) => {
    const isActive = activeIds.has(lat.id);
    const isDone = completedIds.has(lat.id) || isActive;
    const lx = i === 0 ? boxX : boxX + boxW - 30;
    svgParts.push(rect(lx, boxY + 20, 30, boxH - 40, lat.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Lat'));
  });
  if (fondo) {
    const isActive = activeIds.has(fondo.id);
    const isDone = completedIds.has(fondo.id) || isActive;
    svgParts.push(rect(boxX + 35, boxY + 35, boxW - 70, boxH - 70, fondo.color, isDone ? 0.9 : 0.15, isActive ? '#4ECDC4' : '#334155'));
  }
  // Repisas: superior arriba, inferior abajo, resto distribuidas en el medio
  const repisaSuperior = repisaInstances.filter((g) => norm(g[0].nombre).includes('superior'));
  const repisaInferior = repisaInstances.filter((g) => norm(g[0].nombre).includes('inferior'));
  const repisaMedio = repisaInstances.filter((g) => !norm(g[0].nombre).includes('superior') && !norm(g[0].nombre).includes('inferior'));

  const interiorY = boxY + 35;
  const interiorH = boxH - 70;
  const shelfH = 18;
  const shelfPad = 10;

  function drawRepisaGroup(group, y, label = '', growDown = true) {
    const rep = group[0];
    const isActive = group.some((p) => activeIds.has(p.id));
    const isDone = group.some((p) => completedIds.has(p.id) || activeIds.has(p.id));
    const qty = Math.min(group.length, 8);
    // Si crece hacia arriba, la coordenada y es la posicion inferior del grupo
    const startY = growDown ? y : y - (qty - 1) * (shelfH + 4);
    for (let q = 0; q < qty; q++) {
      const yy = startY + q * (shelfH + 4);
      const pieceLabel = q === 0 ? `${rep.nombre.split(' ')[0]}${qty > 1 ? ' ×' + qty : ''}` : label;
      svgParts.push(rect(boxX + 35, yy, boxW - 70, shelfH, rep.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', pieceLabel));
    }
  }

  if (repisaSuperior.length) {
    let y = interiorY + shelfPad;
    repisaSuperior.forEach((g) => { drawRepisaGroup(g, y, '', true); y += shelfH + 8; });
  }
  if (repisaInferior.length) {
    // y apunta al borde inferior del grupo inferior; las instancias crecen hacia arriba
    let y = interiorY + interiorH - shelfPad;
    [...repisaInferior].reverse().forEach((g) => { drawRepisaGroup(g, y, '', false); y -= shelfH + 8; });
  }
  if (repisaMedio.length) {
    const topUsed = repisaSuperior.length * (shelfH + 8);
    const bottomUsed = repisaInferior.length * (shelfH + 8);
    const available = interiorH - topUsed - bottomUsed - shelfPad * 2;
    const slotH = available / repisaMedio.length;
    repisaMedio.forEach((g, i) => {
      const y = interiorY + shelfPad + topUsed + i * slotH + slotH / 2 - shelfH / 2;
      drawRepisaGroup(g, y, '', true);
    });
  }

  // Frentes de cajón: si son 2 se apilan verticalmente, si no lado a lado
  const interiorX = boxX + 35;
  const interiorW = boxW - 70;
  frentesCajon.forEach((frente, i) => {
    const isActive = activeIds.has(frente.id);
    const isDone = completedIds.has(frente.id) || isActive;
    if (frentesCajon.length === 2) {
      const fw = Math.min(120, interiorW - 40);
      const fh = Math.min(80, (interiorH - 60) / 2);
      const fx = interiorX + (interiorW - fw) / 2;
      const fy = i === 0 ? interiorY + 20 : interiorY + interiorH - fh - 20;
      svgParts.push(rect(fx, fy, fw, fh, frente.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Frente'));
    } else {
      const fw = frentesCajon.length > 1 ? Math.min(120, (interiorW - 40) / frentesCajon.length) : Math.min(120, interiorW - 40);
      const fh = Math.min(80, interiorH - 60);
      const spacing = frentesCajon.length > 1 ? (interiorW - frentesCajon.length * fw) / (frentesCajon.length + 1) : (interiorW - fw) / 2;
      const fx = interiorX + spacing + i * (fw + spacing);
      const fy = interiorY + interiorH - fh - 10;
      svgParts.push(rect(fx, fy, fw, fh, frente.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Frente'));
    }
  });

  // Tiradores (círculos sobre los frentes o piezas activas)
  tiradores.forEach((tir) => {
    const isActive = activeIds.has(tir.id);
    const isDone = completedIds.has(tir.id) || isActive;
    if (frentesCajon.length > 0) {
      frentesCajon.forEach((frente, fi) => {
        let fw, fh, fx, fy;
        if (frentesCajon.length === 2) {
          fw = Math.min(120, interiorW - 40);
          fh = Math.min(80, (interiorH - 60) / 2);
          fx = interiorX + (interiorW - fw) / 2;
          fy = fi === 0 ? interiorY + 20 : interiorY + interiorH - fh - 20;
        } else {
          fw = frentesCajon.length > 1 ? Math.min(120, (interiorW - 40) / frentesCajon.length) : Math.min(120, interiorW - 40);
          fh = Math.min(80, interiorH - 60);
          const spacing = frentesCajon.length > 1 ? (interiorW - frentesCajon.length * fw) / (frentesCajon.length + 1) : (interiorW - fw) / 2;
          fx = interiorX + spacing + fi * (fw + spacing);
          fy = interiorY + interiorH - fh - 10;
        }
        svgParts.push(circle(fx + fw / 2, fy + fh / 2, 6, tir.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155'));
      });
    } else {
      const tx = boxX + boxW / 2;
      const ty = boxY + boxH / 2;
      svgParts.push(circle(tx, ty, 6, tir.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155'));
    }
  });

  // Leyenda
  svgParts.push(`
    <g transform="translate(${width - 150}, 30)">
      <rect x="0" y="0" width="12" height="12" fill="#10b981" rx="2" />
      <text x="18" y="11" fill="#f1f5f9" font-size="11">Ensamblada</text>
      <rect x="0" y="20" width="12" height="12" fill="#4ECDC4" rx="2" />
      <text x="18" y="31" fill="#f1f5f9" font-size="11">Paso actual</text>
      <rect x="0" y="40" width="12" height="12" fill="#334155" rx="2" opacity="0.4" />
      <text x="18" y="51" fill="#f1f5f9" font-size="11">Pendiente</text>
    </g>
  `);

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a;">
      ${svgParts.join('')}
    </svg>
  `;
}

function generarDiagramaCajon(all, piecesById, completedIds, activeIds, width, height, margin) {
  // Vista explotada/de caja para submodulos de cajon: base, tapa, laterales, fondo, frente y tirador.
  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function rect(x, y, w, h, color, opacity = 1, stroke = '#334155', label = '') {
    const sx = x + margin.left;
    const sy = y + margin.top;
    return `
      <rect x="${sx}" y="${sy}" width="${w}" height="${h}" rx="3" fill="${color}" stroke="${stroke}" stroke-width="2" opacity="${opacity}" />
      ${label ? `<text x="${sx + w/2}" y="${sy + h/2 + 4}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600">${label}</text>` : ''}
    `;
  }

  function circle(x, y, r, color, opacity = 1, stroke = '#334155') {
    const sx = x + margin.left;
    const sy = y + margin.top;
    return `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${color}" stroke="${stroke}" stroke-width="2" opacity="${opacity}" />`;
  }

  const svgParts = [];

  // Caja de referencia del cajon centrada
  const boxW = 220;
  const boxH = 160;
  const boxX = (width - boxW) / 2 - margin.left;
  const boxY = (height - boxH) / 2 - margin.top;
  svgParts.push(`<rect x="${boxX + margin.left}" y="${boxY + margin.top}" width="${boxW}" height="${boxH}" fill="none" stroke="#334155" stroke-dasharray="4 4" opacity="0.4" />`);

  const base = all.find((p) => norm(p.nombre).includes('base'));
  const tapa = all.find((p) => norm(p.nombre).includes('tapa'));
  const laterales = all.filter((p) => norm(p.nombre).includes('lateral'));
  const fondo = all.find((p) => norm(p.nombre).includes('fondo'));
  const frentesCajon = all.filter((p) => norm(p.nombre).includes('frente'));
  const tiradores = all.filter((p) => norm(p.nombre).includes('tirador'));

  // Tapa arriba, base abajo
  if (tapa) {
    const isActive = activeIds.has(tapa.id);
    const isDone = completedIds.has(tapa.id) || isActive;
    svgParts.push(rect(boxX + 10, boxY, boxW - 20, 20, tapa.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Tapa'));
  }
  if (base) {
    const isActive = activeIds.has(base.id);
    const isDone = completedIds.has(base.id) || isActive;
    svgParts.push(rect(boxX + 10, boxY + boxH - 20, boxW - 20, 20, base.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Base'));
  }

  // Laterales a los lados
  laterales.forEach((lat, i) => {
    const isActive = activeIds.has(lat.id);
    const isDone = completedIds.has(lat.id) || isActive;
    const lx = i === 0 ? boxX : boxX + boxW - 30;
    svgParts.push(rect(lx, boxY + 20, 30, boxH - 40, lat.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Lat'));
  });

  // Fondo al centro
  if (fondo) {
    const isActive = activeIds.has(fondo.id);
    const isDone = completedIds.has(fondo.id) || isActive;
    svgParts.push(rect(boxX + 35, boxY + 35, boxW - 70, boxH - 70, fondo.color, isDone ? 0.9 : 0.15, isActive ? '#4ECDC4' : '#334155'));
  }

  // Frente del cajon por encima
  if (frentesCajon.length) {
    frentesCajon.forEach((frente) => {
      const isActive = activeIds.has(frente.id);
      const isDone = completedIds.has(frente.id) || isActive;
      const fw = Math.min(160, boxW - 60);
      const fh = Math.min(100, boxH - 60);
      const fx = boxX + (boxW - fw) / 2;
      const fy = boxY + (boxH - fh) / 2;
      svgParts.push(rect(fx, fy, fw, fh, frente.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155', 'Frente'));
      // Tirador centrado en el frente
      tiradores.forEach((tir) => {
        const isTirActive = activeIds.has(tir.id);
        const isTirDone = completedIds.has(tir.id) || isTirActive;
        svgParts.push(circle(fx + fw / 2, fy + fh / 2, 6, tir.color, isTirDone ? 1 : 0.25, isTirActive ? '#4ECDC4' : '#334155'));
      });
    });
  } else if (tiradores.length) {
    tiradores.forEach((tir) => {
      const isActive = activeIds.has(tir.id);
      const isDone = completedIds.has(tir.id) || isActive;
      svgParts.push(circle(boxX + boxW / 2, boxY + boxH / 2, 6, tir.color, isDone ? 1 : 0.25, isActive ? '#4ECDC4' : '#334155'));
    });
  }

  // Leyenda
  svgParts.push(`
    <g transform="translate(${width - 150}, 30)">
      <rect x="0" y="0" width="12" height="12" fill="#10b981" rx="2" />
      <text x="18" y="11" fill="#f1f5f9" font-size="11">Ensamblada</text>
      <rect x="0" y="20" width="12" height="12" fill="#4ECDC4" rx="2" />
      <text x="18" y="31" fill="#f1f5f9" font-size="11">Paso actual</text>
      <rect x="0" y="40" width="12" height="12" fill="#334155" rx="2" opacity="0.4" />
      <text x="18" y="51" fill="#f1f5f9" font-size="11">Pendiente</text>
    </g>
  `);

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a;">
      ${svgParts.join('')}
    </svg>
  `;
}

function buildStandaloneHtml(steps, piecesById, moduleLabel = 'CutterNest') {
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
body { font-family: system-ui, sans-serif; margin: 2rem; background: #fff; color: #0f172a; }
h1, h2 { color: #0f172a; }
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
