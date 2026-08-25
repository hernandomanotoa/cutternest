// graphView.js — Vista del grafo de dependencias interactivo

import { $, $$, throttle, clamp, getModulePieces, getModuleLabel } from '../utils.js';
import { COLORS } from '../core/config.js';
import { setStatus, addDependency, removeDependency, resetDependencies, clearDependencies } from '../app.js';
import { DEPENDENCY_TYPES } from '../heuristics.js';
import { detectCycle } from '../topologicalSort.js';
import {
  NODE_W,
  NODE_H,
  PADDING,
  computeLayout,
  nearestEdgePoint,
  truncate,
} from '../components/graph/graphLayout.js';

export function createGraphView(store) {
  let unsubscribe = null;
  let container = null;
  let resizeObserver = null;
  let windowMoveHandler = null;
  let windowEndHandler = null;

  function mount(parent) {
    container = parent;
    unsubscribe = store.subscribe('state:changed', () => renderGraphView(container, store));
    renderGraphView(container, store);
  }

  function destroy() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (windowMoveHandler) {
      window.removeEventListener('mousemove', windowMoveHandler);
      window.removeEventListener('touchmove', windowMoveHandler);
      windowMoveHandler = null;
    }
    if (windowEndHandler) {
      window.removeEventListener('mouseup', windowEndHandler);
      window.removeEventListener('touchend', windowEndHandler);
      windowEndHandler = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    container = null;
  }

  return { mount, destroy };

  function renderGraphView(container, store) {
    const state = store.get();

    // Filtrar piezas y dependencias según el módulo activo
    const pieces = getModulePieces(state.pieces, state.currentModule);
    const visibleIds = new Set(pieces.map((p) => p.id));
    const dependencies = state.dependencies.filter((d) => visibleIds.has(d.from) && visibleIds.has(d.to));

    const moduleLabel = getModuleLabel(state.currentModule, state.pieces);

    // Estado local del grafo
    let selectedId = null;
    let scale = 1;
    let pan = { x: 0, y: 0 };
    let dragging = null; // { type: 'node'|'pan', ... }
    let layoutMode = 'hierarchical'; // 'hierarchical' | 'structural'

    container.innerHTML = `
      <div class="card mb-2">
        <div class="card__body">
          <div class="flex justify-between items-center mb-1">
            <h2 class="card__title m-0">Grafo — ${moduleLabel}</h2>
            <div class="flex gap-1">
              <button id="btn-layout" class="btn btn--secondary btn--sm">Layout: Jerárquico</button>
              <button id="btn-center" class="btn btn--secondary btn--sm">Centrar grafo</button>
              <button id="btn-reset-deps" class="btn btn--secondary btn--sm">Restaurar heurísticas</button>
              <button id="btn-clear-deps" class="btn btn--danger btn--sm">Limpiar</button>
            </div>
          </div>
          <p class="empty-state mb-1">Click en un nodo y luego en otro para crear flecha. Arrastra nodos. Click en flecha para eliminar. Los nodos con borde punteado son piezas globales compartidas.</p>
          <div id="graph-wrap" class="graph-container">
            <svg id="graph-svg" class="graph-svg" preserveAspectRatio="xMidYMid meet"></svg>
          </div>
          <div id="graph-panel" class="mt-2"></div>
        </div>
      </div>
    `;

    if (!pieces.length) return;

    const svg = $('#graph-svg', container);
    const wrap = $('#graph-wrap', container);
    const panel = $('#graph-panel', container);

    // Calcula layout inicial segun modo activo
    function resetLayout() {
      const layout = computeLayout(pieces, dependencies, wrap.clientWidth, wrap.clientHeight, layoutMode);
      Object.keys(layout).forEach((id) => {
        positions[id] = { ...layout[id] };
      });
      scheduleCenterView();
    }

    function scheduleCenterView() {
      if (wrap.clientWidth && wrap.clientHeight) {
        centerView();
        render();
      } else {
        requestAnimationFrame(() => {
          if (wrap.clientWidth && wrap.clientHeight) {
            centerView();
            render();
          }
        });
        setTimeout(() => {
          if (wrap.clientWidth && wrap.clientHeight) {
            centerView();
            render();
          }
        }, 80);
        setTimeout(() => {
          if (wrap.clientWidth && wrap.clientHeight) {
            centerView();
            render();
          }
        }, 250);
      }
    }

    function toggleLayout() {
      layoutMode = layoutMode === 'hierarchical' ? 'structural' : 'hierarchical';
      $('#btn-layout', container).textContent = `Layout: ${layoutMode === 'hierarchical' ? 'Jerárquico' : 'Estructural'}`;
      resetLayout();
      render();
    }

    const positions = {};
    resetLayout();

    // Recalcular vista cuando el contenedor cambie de tamaño (cambio de pestana, redimension, etc.)
    if (typeof ResizeObserver !== 'undefined' && wrap) {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver(() => {
        centerView();
        render();
      });
      resizeObserver.observe(wrap);
    }

    function render() {
      const currentState = store.get();
      const nodes = pieces.map((p) => ({ ...p, ...positions[p.id] }));
      const cycle = currentState.cycle || [];
      const cycleSet = new Set(cycle);

      const viewWidth = Math.max(wrap.clientWidth, 600);
      const viewHeight = Math.max(wrap.clientHeight, 400);
      const viewBoxW = viewWidth;
      const viewBoxH = viewHeight;

      svg.setAttribute('viewBox', `${-pan.x} ${-pan.y} ${viewBoxW / scale} ${viewBoxH / scale}`);
      svg.innerHTML = `
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${COLORS.strokeActive}" />
          </marker>
          ${Object.entries(DEPENDENCY_TYPES).map(([key, cfg]) => `
            <marker id="arrow-${key}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="${cfg.color}" />
            </marker>
          `).join('')}
        </defs>
        <g id="edges-layer"></g>
        <g id="nodes-layer"></g>
      `;

      const edgesLayer = $('#edges-layer', svg);
      const nodesLayer = $('#nodes-layer', svg);

      // Render edges
      dependencies.forEach((dep, idx) => {
        const from = positions[dep.from];
        const to = positions[dep.to];
        if (!from || !to) return;
        const cfg = DEPENDENCY_TYPES[dep.type] || DEPENDENCY_TYPES.estructural;
        const start = nearestEdgePoint(from, to);
        const end = nearestEdgePoint(to, from);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // CurvaBezier para separar aristas que comparten destino
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const offset = (idx % 5 - 2) * 20;
        const ctrlX = midX - (dy / len) * offset;
        const ctrlY = midY + (dx / len) * offset;
        path.setAttribute('d', `M ${start.x} ${start.y} Q ${ctrlX} ${ctrlY} ${end.x} ${end.y}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', cfg.color);
        path.setAttribute('stroke-width', cfg.width);
        path.setAttribute('stroke-dasharray', cfg.dash === 'none' ? '' : cfg.dash);
        path.setAttribute('marker-end', `url(#arrow-${dep.type})`);
        path.setAttribute('class', 'graph-edge');
        path.style.cursor = 'pointer';
        path.addEventListener('click', (e) => {
          e.stopPropagation();
          onRemoveDependency(dep.from, dep.to);
        });
        edgesLayer.appendChild(path);
      });

      // Render nodes
      nodes.forEach((node) => {
        const global = isGlobalPiece(node);
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `graph-node ${selectedId === node.id ? 'graph-node--selected' : ''} ${global ? 'graph-node--global' : ''}`);
        g.setAttribute('transform', `translate(${node.x - NODE_W / 2}, ${node.y - NODE_H / 2})`);
        g.style.cursor = 'grab';

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', NODE_W);
        rect.setAttribute('height', NODE_H);
        rect.setAttribute('rx', 8);
        rect.setAttribute('fill', node.color);
        rect.setAttribute('stroke', cycleSet.has(node.id) ? COLORS.strokeDanger : global ? COLORS.globalBadge : COLORS.strokePanel);
        rect.setAttribute('stroke-width', cycleSet.has(node.id) ? 3 : global ? 2.5 : 1.5);
        rect.setAttribute('stroke-dasharray', global ? '6,4' : 'none');
        g.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', NODE_W / 2);
        text.setAttribute('y', NODE_H / 2 - 4);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', COLORS.textDark);
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', '700');
        const qtySuffix = node.cantidad > 1 ? ` ×${node.cantidad}` : '';
        text.textContent = truncate(node.nombre, 14) + qtySuffix;
        g.appendChild(text);

        const dim = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        dim.setAttribute('x', NODE_W / 2);
        dim.setAttribute('y', NODE_H / 2 + 12);
        dim.setAttribute('text-anchor', 'middle');
        dim.setAttribute('fill', COLORS.textDark);
        dim.setAttribute('font-size', '9');
        dim.textContent = `${Math.round(node.ancho)}×${Math.round(node.alto)}`;
        g.appendChild(dim);

        if (global) {
          const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          badge.setAttribute('x', NODE_W / 2);
          badge.setAttribute('y', -6);
          badge.setAttribute('text-anchor', 'middle');
          badge.setAttribute('fill', COLORS.globalBadge);
          badge.setAttribute('font-size', '9');
          badge.setAttribute('font-weight', '700');
          badge.textContent = 'GLOBAL';
          g.appendChild(badge);
        }

        g.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          dragging = { type: 'node', id: node.id, startX: e.clientX, startY: e.clientY, startPos: { ...positions[node.id] } };
          selectNode(node.id);
        });

        g.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          const touch = e.touches[0];
          dragging = { type: 'node', id: node.id, startX: touch.clientX, startY: touch.clientY, startPos: { ...positions[node.id] } };
          selectNode(node.id);
        }, { passive: true });

        nodesLayer.appendChild(g);
      });

      renderPanel(panel);
    }

    function selectNode(id) {
      if (!selectedId) {
        selectedId = id;
        setStatus(`Nodo seleccionado: ${pieces.find((p) => p.id === id)?.nombre}. Haz click en otro nodo para conectar.`);
        render();
        return;
      }
      if (selectedId === id) {
        selectedId = null;
        render();
        return;
      }
      const currentState = store.get();
      const candidate = [...currentState.dependencies, { from: selectedId, to: id, type: 'estructural' }];
      const cycle = detectCycle(currentState.pieces.map((p) => p.id), candidate);
      if (cycle) {
        setStatus(`Ciclo detectado: no se creó la dependencia.`, 'alert--danger');
        selectedId = null;
        render();
        return;
      }
      addDependency(selectedId, id, 'estructural');
      selectedId = null;
      render();
    }

    function onRemoveDependency(from, to) {
      removeDependency(from, to);
    }

    function renderPanel(panelEl) {
      const cfg = DEPENDENCY_TYPES;
      panelEl.innerHTML = `
        <h3 class="mb-1">Dependencias visibles (${dependencies.length})</h3>
        <div class="flex gap-1 mb-1 flex-wrap">
          ${Object.entries(cfg).map(([key, c]) => `
            <span class="badge badge--secondary" style="border-left: 4px solid ${c.color};">${c.label}</span>
          `).join('')}
        </div>
        <div class="table-container" style="max-height: 200px; overflow-y: auto;">
          <table>
            <tbody>
              ${dependencies.length === 0 ? '<tr><td colspan="4" class="empty-state">Sin dependencias</td></tr>' : dependencies.map((d, i) => {
                const c = cfg[d.type] || cfg.estructural;
                return `
                  <tr>
                    <td><span class="badge badge--secondary" style="border-left: 3px solid ${c.color};">${c.label}</span></td>
                    <td>${d.from}</td>
                    <td>→ ${d.to}</td>
                    <td><button class="btn btn--danger btn--sm" data-remove="${i}">×</button></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      $$('button[data-remove]', panelEl).forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.remove);
          if (Number.isFinite(idx) && dependencies[idx]) {
            removeDependency(dependencies[idx].from, dependencies[idx].to);
          }
        });
      });
    }

    function onMove(clientX, clientY) {
      if (!dragging) return;
      if (dragging.type === 'node') {
        const dx = (clientX - dragging.startX) / scale;
        const dy = (clientY - dragging.startY) / scale;
        positions[dragging.id] = {
          x: clamp(dragging.startPos.x + dx, NODE_W / 2 + 10, 2000 - NODE_W / 2),
          y: clamp(dragging.startPos.y + dy, NODE_H / 2 + 10, 2000 - NODE_H / 2),
        };
        render();
      } else if (dragging.type === 'pan') {
        const dx = (clientX - dragging.startX) / scale;
        const dy = (clientY - dragging.startY) / scale;
        pan = { x: dragging.startPan.x - dx, y: dragging.startPan.y - dy };
        render();
      }
    }

    function onEnd() {
      dragging = null;
    }

    // Eventos de mouse/touch globales
    if (windowMoveHandler) {
      window.removeEventListener('mousemove', windowMoveHandler);
      window.removeEventListener('touchmove', windowMoveHandler);
    }
    if (windowEndHandler) {
      window.removeEventListener('mouseup', windowEndHandler);
      window.removeEventListener('touchend', windowEndHandler);
    }

    windowMoveHandler = throttle((e) => {
      if (e.touches) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      } else {
        onMove(e.clientX, e.clientY);
      }
    }, 16);

    windowEndHandler = onEnd;

    svg.addEventListener('mousedown', (e) => {
      if (e.target === svg) {
        dragging = { type: 'pan', startX: e.clientX, startY: e.clientY, startPan: { ...pan } };
        selectedId = null;
      }
    });

    window.addEventListener('mousemove', windowMoveHandler);
    window.addEventListener('mouseup', windowEndHandler);

    svg.addEventListener('touchstart', (e) => {
      if (e.target === svg) {
        const touch = e.touches[0];
        dragging = { type: 'pan', startX: touch.clientX, startY: touch.clientY, startPan: { ...pan } };
        selectedId = null;
      }
    }, { passive: true });

    window.addEventListener('touchmove', windowMoveHandler, { passive: true });
    window.addEventListener('touchend', windowEndHandler);

    // Zoom con rueda
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = clamp(scale * delta, 0.5, 3);
      render();
    }, { passive: false });

    $('#btn-layout', container)?.addEventListener('click', () => {
      toggleLayout();
    });

    $('#btn-reset-deps', container)?.addEventListener('click', () => {
      resetDependencies();
    });

    $('#btn-clear-deps', container)?.addEventListener('click', () => {
      clearDependencies();
    });

    $('#btn-center', container)?.addEventListener('click', () => {
      resetLayout();
      render();
    });

    render();

    function centerView() {
      if (!wrap.clientWidth || !wrap.clientHeight) return;
      const ids = Object.keys(positions);
      if (!ids.length) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      ids.forEach((id) => {
        const p = positions[id];
        minX = Math.min(minX, p.x - NODE_W / 2);
        minY = Math.min(minY, p.y - NODE_H / 2);
        maxX = Math.max(maxX, p.x + NODE_W / 2);
        maxY = Math.max(maxY, p.y + NODE_H / 2);
      });
      const contentW = maxX - minX + PADDING * 2;
      const contentH = maxY - minY + PADDING * 2;
      const scaleX = wrap.clientWidth / contentW;
      const scaleY = wrap.clientHeight / contentH;
      scale = clamp(Math.min(scaleX, scaleY), 0.5, 1);
      const contentCenterX = (minX + maxX) / 2;
      const contentCenterY = (minY + maxY) / 2;
      pan = {
        x: contentCenterX - (wrap.clientWidth / scale) / 2,
        y: contentCenterY - (wrap.clientHeight / scale) / 2,
      };
    }
  }
}
