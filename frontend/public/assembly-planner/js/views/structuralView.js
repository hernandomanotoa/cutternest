// structuralView.js — Vista de análisis estructural

import { $, getModulePieces, getModuleLabel } from '../utils.js';
import { COLORS } from '../core/config.js';
import { calcularCargaRepisa, clasificarRiesgo, calcularVuelco, estimatePieceWeight, getProfundidadMueble } from '../structural.js';

export function createStructuralView(store) {
  let unsubscribe = null;
  let container = null;

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', () => render(container, store.get()));
    render(container, store.get());
  }

  function destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    container = null;
  }

  return { mount, destroy };
}

function render(container, state) {
  const pieces = getModulePieces(state.pieces, state.currentModule);
  const moduleLabel = getModuleLabel(state.currentModule, state.pieces);

  if (!pieces.length) {
    container.innerHTML = `<div class="card"><div class="card__body"><p class="empty-state">Importa un CSV para ver el análisis estructural de ${moduleLabel}.</p></div></div>`;
    return;
  }

  const repisas = pieces.filter((p) => {
    const n = p.nombre.toLowerCase();
    return n.includes('repisa') || n.includes('estante');
  });

  const profundidad = getProfundidadMueble(pieces);
  const pesoTotal = pieces.reduce((sum, p) => sum + estimatePieceWeight(p), 0);
  const mueble = {
    pesoVacio: pesoTotal,
    cargaMaxima: repisas.length * 25,
    profundidad,
  };
  const vuelco = calcularVuelco(mueble);

  container.innerHTML = `
    <div class="card mb-2">
      <div class="card__header"><h2 class="card__title">Análisis de cargas — ${moduleLabel}</h2></div>
      <div class="card__body">
        ${repisas.length === 0 ? '<p class="empty-state">No hay repisas/estantes en este módulo.</p>' : repisas.map((p) => renderRepisaChart(p)).join('')}
      </div>
    </div>

    <div class="card mb-2">
      <div class="card__header"><h2 class="card__title">Clasificación de riesgo</h2></div>
      <div class="card__body">
        <div class="table-container">
          <table>
            <thead>
              <tr><th>Pieza</th><th>Luz</th><th>Espesor</th><th>Riesgo</th><th>Acción</th></tr>
            </thead>
            <tbody>
              ${pieces.map((p) => renderRiesgoRow(p)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card__header"><h2 class="card__title">Análisis de vuelco</h2></div>
      <div class="card__body">
        <p class="mb-1">Peso estimado del mueble: <strong>${pesoTotal.toFixed(1)} kg</strong> · Profundidad: <strong>${profundidad} mm</strong></p>
        ${vuelco.some((e) => !e.seguro) ? '<div class="alert alert--danger">Factor de seguridad < 1.5: anclaje a pared obligatorio.</div>' : '<div class="alert alert--success">Factor de seguridad aceptable en todos los escenarios.</div>'}
        ${vuelco.map((e) => renderVuelcoRow(e)).join('')}
      </div>
    </div>
  `;
}

function renderRepisaChart(p) {
  const luz = Math.max(p.ancho, p.alto);
  const prof = Math.min(p.ancho, p.alto);
  const carga = calcularCargaRepisa(luz, prof, p.espesor);
  const pct = Math.min((carga.cargaTotalKg / 25) * 100, 100);
  const color = carga.cargaTotalKg >= 25 ? COLORS.strokeSuccess : carga.cargaTotalKg >= 15 ? COLORS.strokeWarning : COLORS.strokeDanger;
  return `
    <div class="chart-bar">
      <span class="chart-label">${p.nombre}</span>
      <div class="chart-track">
        <div class="chart-fill" style="width: ${pct}%; background: ${color};"></div>
      </div>
      <span style="width: 90px; font-size: 0.8rem; font-weight: 700; color: ${color};">${carga.cargaTotalKg} kg</span>
    </div>
    <div style="font-size: 0.75rem; color: ${COLORS.textSecondary}; margin-left: 128px; margin-bottom: 0.75rem;">
      Limitante: ${carga.limitante} · Deflexión: ${carga.deflexionMm.toFixed(2)} mm · Referencia práctica: 25 kg
    </div>
  `;
}

function renderRiesgoRow(p) {
  const riesgo = clasificarRiesgo(p);
  const luz = Math.max(p.ancho, p.alto);
  return `
    <tr>
      <td>${p.nombre}</td>
      <td>${luz} mm</td>
      <td>${p.espesor} mm</td>
      <td><span class="badge badge--${riesgo.level}">${riesgo.label}</span></td>
      <td>${riesgo.accion}</td>
    </tr>
  `;
}

function renderVuelcoRow(e) {
  const color = e.fs >= 1.5 ? COLORS.strokeSuccess : e.fs >= 1.0 ? COLORS.strokeWarning : COLORS.strokeDanger;
  const width = Math.min(e.fs / 2.5 * 100, 100);
  return `
    <div class="chart-bar">
      <span class="chart-label">${e.nombre}</span>
      <div class="chart-track">
        <div class="chart-fill" style="width: ${width}%; background: ${color};"></div>
      </div>
      <span style="width: 60px; font-size: 0.8rem; font-weight: 700; color: ${color};">FS ${e.fs}</span>
    </div>
  `;
}
