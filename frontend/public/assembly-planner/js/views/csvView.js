// csvView.js — Vista de importación y edición de CSV

import { $, $$, escapeHtml, isGlobalPiece, getModuleLabel } from '../utils.js';
import { state, recalculateAll, loadCSV, addEmptyPiece, setStatus } from '../app.js';
import { piecesToCSV } from '../csvParser.js';

export function renderCSVView(container) {
  const pieces = state.pieces;
  const warnings = state.warnings || [];

  container.innerHTML = `
    <div class="card mb-2">
      <div class="card__header">
        <h2 class="card__title">Importar / editar CSV — ${getModuleLabel(state.currentModule, state.pieces)}</h2>
      </div>
      <div class="card__body">
        <div class="form-group mb-2">
          <label for="csv-raw">Pega aquí el CSV CutterNest</label>
          <textarea id="csv-raw" class="csv-editor" placeholder="id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo\nm1-base,Base,120,60,1,si,#96CEB4,18,\"T,B,L,R\",1"></textarea>
          <small class="form-help">Edita el CSV y presiona <kbd>Ctrl</kbd>+<kbd>Enter</kbd> o el botón <strong>Actualizar mueble</strong> para aplicar los cambios.</small>
        </div>
        <div class="flex gap-1 items-center flex-wrap">
          <button id="btn-parse-csv" class="btn btn--primary">🔄 Actualizar mueble</button>
          <button id="btn-reload-csv" class="btn btn--secondary">↺ Restaurar CSV actual</button>
          <button id="btn-add-piece" class="btn btn--secondary">+ Pieza</button>
          <button id="btn-export-table" class="btn btn--secondary">⬇ Exportar CSV</button>
        </div>
        ${warnings.length ? renderWarnings(warnings) : ''}
        <div class="table-container mt-2">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Ancho</th>
                <th>Alto</th>
                <th>Cant.</th>
                <th>Color</th>
                <th>Esp.</th>
                <th>Cantos</th>
                <th>Mód.</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="csv-table-body">
              ${pieces.length ? pieces.map((p, i) => renderPieceRow(p, i)).join('') : '<tr><td colspan="10" class="empty-state">No hay piezas. Carga un ejemplo o importa un CSV.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  bindEvents(container);
}

function renderWarnings(warnings) {
  const unique = [...new Set(warnings)];
  return `
    <div class="alert alert--warning mt-2">
      <strong>Advertencias (${unique.length}):</strong>
      <ul class="mt-1 mb-0">
        ${unique.slice(0, 8).map((w) => `<li>${escapeHtml(w)}</li>`).join('')}
        ${unique.length > 8 ? `<li>... y ${unique.length - 8} más.</li>` : ''}
      </ul>
    </div>
  `;
}

function renderPieceRow(piece, index) {
  const cantosValue = piece.cantos ? piece.cantos.replace(/"/g, '') : '';
  const global = isGlobalPiece(piece);
  const activeModule = state.currentModule === 'global' || piece.modulo === state.currentModule || global;
  const rowClass = activeModule ? 'csv-row-active' : 'csv-row-inactive';
  const badge = global ? '<span class="badge badge--info">Global</span>' : `<span class="badge badge--secondary">${escapeHtml(piece.modulo || '1')}</span>`;
  return `
    <tr data-index="${index}" class="${rowClass}">
      <td><input type="text" data-field="id" value="${escapeHtml(piece.id)}" /></td>
      <td><input type="text" data-field="nombre" value="${escapeHtml(piece.nombre)}" /></td>
      <td><input type="number" data-field="ancho" value="${piece.ancho}" min="1" /></td>
      <td><input type="number" data-field="alto" value="${piece.alto}" min="1" /></td>
      <td><input type="number" data-field="cantidad" value="${piece.cantidad}" min="1" /></td>
      <td><input type="color" data-field="color" value="${piece.color}" /></td>
      <td><input type="number" data-field="espesor" value="${piece.espesor}" min="1" /></td>
      <td><input type="text" data-field="cantos" value="${escapeHtml(cantosValue)}" placeholder="T,B,L,R" /></td>
      <td><input type="text" data-field="modulo" value="${escapeHtml(piece.modulo)}" /> ${badge}</td>
      <td><button class="btn btn--danger btn--sm" data-delete="${index}">×</button></td>
    </tr>
  `;
}

function bindEvents(container) {
  const rawArea = $('#csv-raw', container);
  if (rawArea && state.pieces.length) {
    rawArea.value = piecesToCSV(state.pieces);
  }

  $('#btn-parse-csv', container)?.addEventListener('click', () => applyEditorCSV(rawArea));

  $('#btn-reload-csv', container)?.addEventListener('click', () => {
    if (!state.pieces.length) {
      setStatus('No hay CSV cargado para restaurar.', 'alert--warning');
      return;
    }
    if (rawArea) rawArea.value = piecesToCSV(state.pieces);
    setStatus('CSV del editor restaurado al estado actual.', 'alert--info');
  });

  rawArea?.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      applyEditorCSV(rawArea);
    }
  });

  function applyEditorCSV(area) {
    const text = area?.value || '';
    if (!text.trim()) {
      setStatus('El editor de CSV está vacío.', 'alert--warning');
      return;
    }
    loadCSV(text);
  }

  $('#btn-add-piece', container)?.addEventListener('click', () => {
    addEmptyPiece();
  });

  $('#btn-export-table', container)?.addEventListener('click', () => {
    if (!state.pieces.length) {
      setStatus('No hay piezas para exportar.', 'alert--warning');
      return;
    }
    const text = piecesToCSV(state.pieces);
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cutternest-piezas-modificado.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  container.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const tr = input.closest('tr');
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    if (!Number.isFinite(idx) || !state.pieces[idx]) return;

    const field = input.dataset.field;
    const piece = state.pieces[idx];
    let value = input.value;

    if (['ancho', 'alto', 'espesor'].includes(field)) {
      value = parseFloat(value);
      if (!Number.isFinite(value) || value <= 0) return;
    } else if (field === 'cantidad') {
      value = parseInt(value, 10);
      if (!Number.isInteger(value) || value < 1) return;
    } else if (field === 'rotate') {
      value = input.checked;
    }

    piece[field] = value;
    recalculateAll();
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-delete]');
    if (!btn) return;
    const idx = Number(btn.dataset.delete);
    if (Number.isFinite(idx) && state.pieces[idx]) {
      state.pieces.splice(idx, 1);
      recalculateAll();
    }
  });
}
