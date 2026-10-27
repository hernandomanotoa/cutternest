// js/components/furnitureFicha.js — Panel "Ficha técnica del mueble" (S4)
// Componente sin estado: lee del store (piezas + userConfig.fichaCorrections)
// y delega la persistencia a app.js (updateFichaCorrections/clearFichaCorrections).
// La inferencia vive en js/services/furnitureClassifier.js; aquí solo render.
// DOM solo dentro de mount() para que el smoke test pueda importar el módulo.

import { COLORS } from '../core/config.js';
import {
  AMBIENTES,
  FICHAS,
  ESTRUCTURAS_CONSTRUCTIVAS,
  USO_TABLERO,
  NIVELES_COMPLEJIDAD,
} from '../core/furnitureTaxonomy.js';
import { classifyFurniture, applyFichaCorrections } from '../services/furnitureClassifier.js';
import { getModuleDimensions } from '../services/geometryService.js';
import { buildAssemblySequence } from '../services/assemblyStepService.js';
import { escapeHtml, getModuleLabel } from '../utils/helpers.js';
import { buildStandaloneHtml, download } from './manual/manualExporter.js';
import { updateFichaCorrections, clearFichaCorrections } from '../app.js';
import { plinthAssemblyPlan, plinthFrameSpec, hasPlinthFrame } from '../services/plinthFrameService.js';

const COLLAPSE_KEY = 'cn-assembly-ficha-collapsed';

function getCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function setCollapsed(value) {
  try {
    if (value) localStorage.setItem(COLLAPSE_KEY, '1');
    else localStorage.removeItem(COLLAPSE_KEY);
  } catch {
    // ignorar entornos sin storage
  }
}

// "cajonera" → "cajonera"; "mesa_centro_lateral" → "mesa centro lateral".
function humanize(key) {
  return String(key || '').replace(/_/g, ' ');
}

// Indicador discreto de que el valor viene de inferencia (no de corrección).
function inferidoMark(confianza) {
  if (confianza === 'alta') return '';
  return `<span style="color:${COLORS.textSecondary};font-size:0.72rem;"> (inferido)</span>`;
}

// [90, 150] → "aprox. 1.5–2.5 h"
function formatTiempo([min, max]) {
  const h = (v) => Math.round((v / 60) * 10) / 10;
  return `aprox. ${h(min)}–${h(max)} h`;
}

function formatRango([min, max]) {
  return `${min}–${max} mm`;
}

function inferThickness(pieces) {
  const conEspesor = pieces.find((p) => Number(p.espesor));
  return Number(conEspesor?.espesor) || 18;
}

// Construye el HTML del manual (sección de ficha + pasos de ensamblaje) con
// el pipeline real: secuencia física de assemblyStepService (sin posiciones
// z: la vista 3D no está activa, se usa el orden por palabra clave) y
// tiempo default de 10 min por paso, igual que buildSteps en app.js.
// Devuelve { filename, html } listo para download().
function buildFichaExport(pieces, clasificacion, currentModule, obraCfg = {}) {
  const piecesById = Object.fromEntries(pieces.map((p) => [p.id, p]));
  const moduleLabel = getModuleLabel(currentModule, pieces);
  const { steps } = buildAssemblySequence(pieces);
  const stepsConTiempo = steps.map((s) => ({ ...s, tiempo: 10 }));
  const ficha = {
    clasificacion,
    medidasProyecto: getModuleDimensions(pieces, inferThickness(pieces)),
  };
  const plinthPlan = plinthAssemblyPlan(pieces, {
    hTecho: Number(obraCfg.obraHTecho) || 0,
    margenSeg: Number(obraCfg.obraMargenSeg) || 20,
  });
  const slug = String(moduleLabel || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return {
    filename: `ficha-tecnica-${slug || 'mueble'}.html`,
    // options: userConfig lleva los overrides gola (golaFijacion, etc.) para
    // la sección "Perfiles gola" del manual (firma retrocompatible).
    html: buildStandaloneHtml(stepsConTiempo, piecesById, moduleLabel, ficha, plinthPlan, { userConfig: obraCfg }),
  };
}

export function createFurnitureFicha() {
  function mount(parent, store) {
    const state = store.get();
    const pieces = state.pieces || [];
    const corrections = state.userConfig?.fichaCorrections || {};
    const clasificacion = applyFichaCorrections(classifyFurniture(pieces), corrections);

    const collapsed = getCollapsed();
    // El formulario de corrección aparece si la inferencia es débil o si el
    // usuario lo pide con "Corregir". Estado de pantalla, no persistido.
    let correcting = clasificacion.confianza.ambiente === 'baja' ||
      clasificacion.confianza.tipo === 'baja';

    const root = document.createElement('div');
    root.className = `iso-config-panel cn-furniture-ficha-panel${collapsed ? ' is-collapsed' : ''}`;
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.overflow = 'hidden';
    root.innerHTML = renderPanel(pieces, clasificacion, corrections, correcting, collapsed, state.userConfig || {});

    const toggleBtn = root.querySelector('[data-toggle]');
    toggleBtn?.addEventListener('click', () => {
      const next = !root.classList.toggle('is-collapsed');
      toggleBtn.textContent = next ? '▼' : '▶';
      setCollapsed(!next);
    });

    root.querySelector('[data-correct]')?.addEventListener('click', () => {
      correcting = !correcting;
      const body = root.querySelector('[data-ficha-correction]');
      if (body) body.style.display = correcting ? '' : 'none';
      const btn = root.querySelector('[data-correct]');
      if (btn) btn.textContent = correcting ? 'Ocultar corrección' : 'Corregir';
    });

    // La clasificación ya lleva las correcciones aplicadas, así el HTML
    // exportado refleja lo que el usuario ve en el panel.
    root.querySelector('[data-export-ficha]')?.addEventListener('click', () => {
      if (!pieces.length) return;
      const { filename, html } = buildFichaExport(pieces, clasificacion, state.currentModule, state.userConfig || {});
      download(filename, new Blob([html], { type: 'text/html' }));
    });

    root.addEventListener('change', (e) => {
      if (e.target.matches('[data-ficha-ambiente]')) {
        const ambiente = e.target.value || null;
        // Cascada: al cambiar el ambiente, el tipo cae al primero del ambiente
        // (o se limpia si se vuelve a "Auto").
        const tipo = ambiente ? AMBIENTES[ambiente][0] : null;
        updateFichaCorrections({ ambiente, tipo });
      } else if (e.target.matches('[data-ficha-tipo]')) {
        updateFichaCorrections({ tipo: e.target.value || null });
      } else if (e.target.matches('[data-ficha-nivel]')) {
        updateFichaCorrections({ nivel: e.target.value || null });
      }
    });

    root.querySelector('[data-clear-corrections]')?.addEventListener('click', () => {
      clearFichaCorrections();
    });

    parent.appendChild(root);
    return root;
  }

  return { mount };
}

function renderPanel(pieces, clasificacion, corrections, correcting, collapsed, cfg = {}) {
  if (!pieces.length) {
    return `
      <div class="iso-config-panel__header">
        <span>Ficha técnica del mueble</span>
        <div class="iso-config-panel__actions">
          <button class="btn btn--icon btn--sm" data-toggle title="Ocultar/mostrar ficha">${collapsed ? '▶' : '▼'}</button>
        </div>
      </div>
      <div class="iso-config-panel__body" style="display:block;">
        <p class="empty-state" style="padding:0.75rem;">Carga un CSV o ejemplo para ver la ficha técnica.</p>
      </div>
    `;
  }

  return `
    <div class="iso-config-panel__header">
      <span>Ficha técnica del mueble</span>
      <div class="iso-config-panel__actions">
        <button class="btn btn--secondary btn--sm" data-export-ficha>Exportar ficha (HTML)</button>
        <button class="btn btn--secondary btn--sm" data-correct>${correcting ? 'Ocultar corrección' : 'Corregir'}</button>
        <button class="btn btn--icon btn--sm" data-toggle title="Ocultar/mostrar ficha">${collapsed ? '▶' : '▼'}</button>
      </div>
    </div>
    <div class="iso-config-panel__body" style="display:block;">
      ${renderClasificacion(clasificacion, corrections)}
      ${renderFichaTipo(clasificacion)}
      ${renderMedidasProyecto(pieces)}
      ${renderObra(pieces, cfg)}
      <div data-ficha-correction style="display:${correcting ? '' : 'none'};">
        ${renderCorreccion(clasificacion)}
      </div>
    </div>
  `;
}

// Datos de obra y levantamiento: resumen del zócalo estructural (sub-zócalos
// y niveladores) y, con H techo cargada, la verificación de la diagonal por
// módulo. Comparte computeLiftCheck con la tarjeta del Constructor.
function renderObra(pieces, cfg = {}) {
  const plan = plinthAssemblyPlan(pieces, {
    hTecho: Number(cfg.obraHTecho) || 0,
    margenSeg: Number(cfg.obraMargenSeg) || 20,
  });
  if (!plan) return '';
  const spec = plinthFrameSpec(pieces);
  const forma = spec ? `${spec.ancho}×${spec.profundidad}×${spec.altoZocalo} mm (e${spec.espesor})` : '';
  const zocalo = spec
    ? (spec.nZocalos > 1
      ? `Zócalo a marco ${forma}: ${spec.nZocalos} cajones de ~${Math.round(spec.luzMax)} mm unidos con tornillos · ${plan.niveladores} niveladores M8/M10`
      : `Zócalo a marco ${forma} · ${plan.niveladores} niveladores ocultos M8/M10`)
    : '';
  let lev = '';
  if (hasPlinthFrame(pieces)) {
    lev = `<div style="font-size:0.78rem;color:${COLORS.textSecondary};">Con zócalo a marco la altura la define el propio marco (Z): los datos de obra no aplican.</div>`;
  } else if (plan?.levantamiento && !plan.levantamiento.skipped) {
    const r = plan.levantamiento;
    lev = `
      <div style="font-size:0.78rem;color:${r.levantamientoOk ? COLORS.textDark : '#B3261E'};">
        Levantamiento en vertical (H techo ${Number(cfg.obraHTecho)} mm):
        diagonal ${r.diagonal.toFixed(0)} mm, holgura ${r.holgura.toFixed(0)} mm
        ${r.levantamientoOk ? '✓' : '✕ NO cabe'}
      </div>`;
  } else if (Number(cfg.obraHTecho) > 0) {
    lev = `<div style="font-size:0.78rem;color:${COLORS.textSecondary};">Cargue los datos de obra (H techo) también en el Constructor para verificar la diagonal.</div>`;
  }
  return `
    <div style="margin-bottom:0.5rem;">
      <div style="font-size:0.72rem;font-weight:700;color:${COLORS.textSecondary};text-transform:uppercase;margin-bottom:0.25rem;">Zócalo y obra</div>
      ${zocalo ? `<div style="font-size:0.8rem;">${escapeHtml(zocalo)}</div>` : ''}
      ${lev}
    </div>
  `;
}

function renderClasificacion(c, corrections) {
  const row = (label, valor, confianza) => `
    <div style="display:flex;justify-content:space-between;gap:0.5rem;padding:0.15rem 0;">
      <span style="color:${COLORS.textSecondary};font-size:0.75rem;">${escapeHtml(label)}</span>
      <span style="font-size:0.8rem;text-align:right;">${valor}${inferidoMark(confianza)}</span>
    </div>
  `;
  const valorO = (v) => (v ? escapeHtml(humanize(v)) : `<span style="color:${COLORS.textSecondary};">sin determinar</span>`);

  return `
    <div style="margin-bottom:0.5rem;">
      <div style="font-size:0.72rem;font-weight:700;color:${COLORS.textSecondary};text-transform:uppercase;margin-bottom:0.25rem;">Clasificación</div>
      ${row('Ambiente', valorO(c.ambiente), c.confianza.ambiente)}
      ${row('Tipo', valorO(c.tipo), c.confianza.tipo)}
      ${row('Estructura', escapeHtml(ESTRUCTURAS_CONSTRUCTIVAS[c.estructura]?.label || humanize(c.estructura)), c.confianza.estructura)}
      ${row('Uso de tablero', escapeHtml(USO_TABLERO[c.usoTablero]?.label || humanize(c.usoTablero)), c.confianza.usoTablero)}
      ${row('Nivel', escapeHtml(NIVELES_COMPLEJIDAD[c.nivel]?.label || c.nivel), corrections.nivel ? 'alta' : 'media')}
    </div>
  `;
}

function renderFichaTipo(c) {
  const ficha = c.tipo ? FICHAS[c.tipo] : null;
  if (!ficha) return '';
  return `
    <div style="margin-bottom:0.5rem;">
      <div style="font-size:0.72rem;font-weight:700;color:${COLORS.textSecondary};text-transform:uppercase;margin-bottom:0.25rem;">Ficha: ${escapeHtml(humanize(c.tipo))}</div>
      <div style="font-size:0.78rem;">
        Medidas estándar: ${formatRango(ficha.medidasEstandar.ancho)} (ancho) ×
        ${formatRango(ficha.medidasEstandar.alto)} (alto) ×
        ${formatRango(ficha.medidasEstandar.prof)} (prof)
      </div>
      <div style="font-size:0.78rem;">Espesores típicos: ${ficha.espesoresTipicos.join(', ')} mm</div>
      <div style="font-size:0.78rem;">Tiempo estimado: ${formatTiempo(ficha.tiempoMinutos)}
        <span style="color:${COLORS.textSecondary};font-size:0.72rem;"> (ajustable)</span>
      </div>
      <ul style="margin:0.25rem 0 0;padding-left:1.1rem;font-size:0.78rem;color:${COLORS.textSecondary};">
        ${ficha.herrajesTipicos.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderMedidasProyecto(pieces) {
  const dims = getModuleDimensions(pieces, inferThickness(pieces));
  return `
    <div style="margin-bottom:0.5rem;">
      <div style="font-size:0.72rem;font-weight:700;color:${COLORS.textSecondary};text-transform:uppercase;margin-bottom:0.25rem;">Medidas del proyecto</div>
      <div style="font-size:0.8rem;">${dims.width} × ${dims.height} × ${dims.depth} mm (ancho × alto × prof)</div>
    </div>
  `;
}

function renderCorreccion(c) {
  const ambienteActual = c.ambiente || '';
  const tiposDelAmbiente = ambienteActual ? AMBIENTES[ambienteActual] : [];
  const nivelActual = ['basico', 'medio', 'alto'].includes(c.nivel) ? c.nivel : '';
  const selectStyle = 'width:100%;padding:0.35rem 0.5rem;font-size:0.8rem;margin-bottom:0.4rem;';

  return `
    <div style="border-top:1px solid ${COLORS.strokePanel};padding-top:0.5rem;margin-bottom:0.25rem;">
      <div style="font-size:0.72rem;font-weight:700;color:${COLORS.textSecondary};text-transform:uppercase;margin-bottom:0.25rem;">Corrección manual</div>
      <label style="font-size:0.72rem;">Ambiente</label>
      <select data-ficha-ambiente aria-label="Corregir ambiente" style="${selectStyle}">
        <option value="">Auto (inferido)</option>
        ${Object.keys(AMBIENTES).map((a) => `<option value="${escapeHtml(a)}" ${a === ambienteActual ? 'selected' : ''}>${escapeHtml(humanize(a))}</option>`).join('')}
      </select>
      <label style="font-size:0.72rem;">Tipo</label>
      <select data-ficha-tipo aria-label="Corregir tipo" style="${selectStyle}">
        <option value="">Auto (inferido)</option>
        ${tiposDelAmbiente.map((t) => `<option value="${escapeHtml(t)}" ${t === c.tipo ? 'selected' : ''}>${escapeHtml(humanize(t))}</option>`).join('')}
      </select>
      <label style="font-size:0.72rem;">Nivel</label>
      <select data-ficha-nivel aria-label="Corregir nivel" style="${selectStyle}">
        <option value="">Auto (inferido)</option>
        ${Object.keys(NIVELES_COMPLEJIDAD).map((n) => `<option value="${escapeHtml(n)}" ${n === nivelActual ? 'selected' : ''}>${escapeHtml(NIVELES_COMPLEJIDAD[n].label)}</option>`).join('')}
      </select>
      <button class="btn btn--secondary btn--sm" data-clear-corrections>Restablecer inferencia</button>
    </div>
  `;
}
