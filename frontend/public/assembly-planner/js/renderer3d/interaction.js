// js/renderer3d/interaction.js — Hover, click, tooltip y selección

import { escapeHtml } from '../utils.js';

/**
 * Crea un sistema de interacción sobre el contenedor SVG.
 * @param {HTMLElement} container
 * @param {Object} callbacks { onHover(id), onSelect(id) }
 */
export function createInteraction(container, callbacks = {}) {
  let tooltip = null;
  let currentHoverId = null;

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = 'r3d-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '1000';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function getPieceData(el) {
    if (!el) return null;
    const id = el.getAttribute('data-piece-id');
    if (!id) return null;
    return {
      id,
      module: el.getAttribute('data-module'),
      face: el.getAttribute('data-face'),
    };
  }

  function showTooltip(piece, event) {
    const el = ensureTooltip();
    const cantos = piece.cantos?.length ? piece.cantos.join(',') : 'Sin canto';
    el.innerHTML = `
      <div class="r3d-tooltip__name">${escapeHtml(piece.name || piece.id)}</div>
      <div class="r3d-tooltip__dims">${Number(piece.w).toFixed(0)} × ${Number(piece.d).toFixed(0)} × ${Number(piece.h).toFixed(0)} mm</div>
      <div class="r3d-tooltip__meta">Cantos: ${escapeHtml(cantos)}</div>
      <div class="r3d-tooltip__meta">Módulo: ${escapeHtml(piece.modulo)} · Cantidad: ${piece.cantidad}</div>
      <div class="r3d-tooltip__meta">Color: ${escapeHtml(piece.color)} · Material: ${escapeHtml(piece.role)}</div>
    `;
    el.style.display = 'block';
    positionTooltip(event.clientX, event.clientY);
  }

  function positionTooltip(clientX, clientY) {
    const el = ensureTooltip();
    const offset = 15;
    const rect = el.getBoundingClientRect();
    let x = clientX + offset;
    let y = clientY + offset;
    if (x + rect.width > window.innerWidth) x = clientX - rect.width - offset;
    if (y + rect.height > window.innerHeight) y = clientY - rect.height - offset;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
  }

  function handleMouseMove(e) {
    const target = e.target.closest('polygon[data-piece-id]');
    const data = getPieceData(target);

    if (data && data.id !== currentHoverId) {
      currentHoverId = data.id;
      callbacks.onHover?.(data.id);

      // Mostrar tooltip con datos del elemento
      showTooltip(
        {
          name: target.getAttribute('data-name') || data.id,
          cantos: (target.getAttribute('data-cantos') || '').split(',').filter(Boolean),
          modulo: data.module,
          cantidad: target.getAttribute('data-qty') || '1',
          color: target.getAttribute('data-color') || '#C19A6B',
          role: target.getAttribute('data-role') || '',
          w: target.getAttribute('data-w') || '0',
          d: target.getAttribute('data-d') || '0',
          h: target.getAttribute('data-h') || '0',
        },
        e
      );
    } else if (!data && currentHoverId) {
      currentHoverId = null;
      callbacks.onHover?.(null);
      hideTooltip();
    } else if (data) {
      positionTooltip(e.clientX, e.clientY);
    }
  }

  function handleClick(e) {
    const target = e.target.closest('polygon[data-piece-id]');
    const data = getPieceData(target);
    if (data) {
      callbacks.onSelect?.(data.id);
    } else {
      callbacks.onSelect?.(null);
    }
  }

  function handleMouseLeave() {
    currentHoverId = null;
    callbacks.onHover?.(null);
    hideTooltip();
  }

  container.addEventListener('mousemove', handleMouseMove);
  container.addEventListener('click', handleClick);
  container.addEventListener('mouseleave', handleMouseLeave);

  return {
    destroy() {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
    },
  };
}
