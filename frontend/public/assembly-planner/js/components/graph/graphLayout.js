// js/components/graph/graphLayout.js — Cálculos de layout puros para el grafo de dependencias
// Sin DOM.

import { normalizeName } from '../../utils/normalize.js';
import { topologicalLevels } from '../../topologicalSort.js';

export const NODE_W = 120;
export const NODE_H = 56;
export const LEVEL_GAP_X = 180;
export const NODE_GAP_Y = 70;
export const PADDING = 80;

export function computeLayout(pieces, dependencies, viewW, viewH, mode) {
  if (mode === 'structural') {
    return computeStructuralLayout(pieces, viewW, viewH);
  }
  return computeHierarchicalLayout(pieces, dependencies, viewW, viewH);
}

export function computeHierarchicalLayout(pieces, dependencies, viewW, viewH) {
  const ids = pieces.map((p) => p.id);
  const result = topologicalLevels(ids, dependencies);
  const levels = result.ok && result.levels.length ? result.levels : [ids];
  const layout = {};

  const levelWidth = LEVEL_GAP_X;
  const startX = Math.max(PADDING, (viewW - (levels.length - 1) * levelWidth) / 2);
  const centerY = viewH / 2;

  levels.forEach((level, li) => {
    const totalH = (level.length - 1) * NODE_GAP_Y;
    const baseY = centerY - totalH / 2;
    level.forEach((id, i) => {
      layout[id] = {
        x: startX + li * levelWidth,
        y: baseY + i * NODE_GAP_Y,
      };
    });
  });

  return layout;
}

export function computeStructuralLayout(pieces, viewW, viewH) {
  const safeW = Math.max(viewW || 0, 600);
  const safeH = Math.max(viewH || 0, 400);
  const layout = {};
  const centerX = safeW / 2;
  const centerY = safeH / 2;
  const boxW = Math.min(700, safeW * 0.7);
  const boxH = Math.min(420, safeH * 0.7);
  const left = centerX - boxW / 2;
  const right = centerX + boxW / 2;
  const top = centerY - boxH / 2;
  const bottom = centerY + boxH / 2;

  const groups = {
    base: [],
    tapa: [],
    lateralIzq: [],
    lateralDer: [],
    fondo: [],
    repisaSuperior: [],
    repisaInferior: [],
    repisaMedio: [],
    frenteCajon: [],
    tirador: [],
    zocalo: [],
    puerta: [],
    cajon: [],
    barra: [],
    divisor: [],
    otro: [],
  };

  pieces.forEach((p) => {
    const n = normalizeName(p.nombre);
    if (n.includes('tirador')) groups.tirador.push(p);
    else if (n.includes('zocalo')) groups.zocalo.push(p);
    else if (n.includes('puerta')) groups.puerta.push(p);
    else if (n.includes('barra')) groups.barra.push(p);
    else if (n.includes('divisor') || n.includes('division')) groups.divisor.push(p);
    else if (n.includes('frente') && n.includes('cajon')) groups.frenteCajon.push(p);
    else if (n.includes('cajon')) groups.cajon.push(p);
    else if (n.includes('tapa') || n.includes('techo')) groups.tapa.push(p);
    else if (n.includes('base')) groups.base.push(p);
    else if (n.includes('lateral')) {
      if (n.includes('izq')) groups.lateralIzq.push(p);
      else if (n.includes('der')) groups.lateralDer.push(p);
      else groups.lateralDer.push(p);
    } else if (n.includes('fondo') || n.includes('trasera')) groups.fondo.push(p);
    else if (n.includes('repisa') || n.includes('estante')) {
      if (n.includes('superior')) groups.repisaSuperior.push(p);
      else if (n.includes('inferior')) groups.repisaInferior.push(p);
      else groups.repisaMedio.push(p);
    } else {
      groups.otro.push(p);
    }
  });

  function placeRow(list, y, startX, endX) {
    const count = list.length;
    if (count === 0) return;
    const gap = (endX - startX) / (count + 1);
    list.forEach((p, i) => {
      layout[p.id] = { x: startX + gap * (i + 1), y };
    });
  }

  function placeCol(list, x, startY, endY) {
    const count = list.length;
    if (count === 0) return;
    const gap = (endY - startY) / (count + 1);
    list.forEach((p, i) => {
      layout[p.id] = { x, y: startY + gap * (i + 1) };
    });
  }

  placeRow(groups.tapa, top - 50, left + 60, right - 60);
  placeRow(groups.base, bottom + 50, left + 60, right - 60);
  placeRow(groups.zocalo, bottom + 110, left + 60, right - 60);

  placeCol(groups.lateralIzq, left - 60, top + 80, bottom - 80);
  placeCol(groups.lateralDer, right + 60, top + 80, bottom - 80);

  groups.fondo.forEach((p) => {
    layout[p.id] = { x: centerX, y: centerY };
  });

  placeRow(groups.repisaSuperior, top + 70, left + 100, right - 100);
  placeRow(groups.repisaInferior, bottom - 70, left + 100, right - 100);

  const midCount = groups.repisaMedio.length;
  if (midCount > 0) {
    const availableH = bottom - 120 - (top + 120);
    const gap = availableH / (midCount + 1);
    groups.repisaMedio.forEach((p, i) => {
      layout[p.id] = { x: centerX, y: top + 120 + gap * (i + 1) };
    });
  }

  if (groups.frenteCajon.length === 2) {
    layout[groups.frenteCajon[0].id] = { x: centerX, y: top + 140 };
    layout[groups.frenteCajon[1].id] = { x: centerX, y: bottom - 140 };
  } else {
    placeRow(groups.frenteCajon, bottom - 130, left + 120, right - 120);
  }

  groups.tirador.forEach((p, i) => {
    layout[p.id] = { x: centerX + (i - (groups.tirador.length - 1) / 2) * 50, y: bottom - 180 };
  });

  placeRow(groups.puerta, bottom - 60, left + 120, right - 120);
  placeRow(groups.barra, centerY, left + 120, right - 120);
  placeRow(groups.divisor, centerY, left + 120, right - 120);
  placeRow(groups.cajon, centerY, left + 120, right - 120);

  groups.otro.forEach((p, i) => {
    layout[p.id] = { x: right + 200 + (i % 3) * 140, y: bottom - 200 + Math.floor(i / 3) * 70 };
  });

  return layout;
}

export function nearestEdgePoint(center, target) {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const angle = Math.atan2(dy, dx);
  const halfW = NODE_W / 2 + 4;
  const halfH = NODE_H / 2 + 4;
  let x, y;
  const tanAngle = Math.tan(angle);
  if (Math.abs(dx) * halfH > Math.abs(dy) * halfW) {
    x = center.x + (dx > 0 ? halfW : -halfW);
    y = center.y + (halfW * Math.sign(dx)) * tanAngle;
  } else {
    y = center.y + (dy > 0 ? halfH : -halfH);
    x = center.x + (halfH * Math.sign(dy)) / tanAngle;
  }
  return { x, y };
}

export function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
