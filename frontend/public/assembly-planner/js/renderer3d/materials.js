// js/renderer3d/materials.js — Colores, cantos, metales e indicadores visuales

import { escapeHtml } from '../utils.js';
import { classifyPiece } from './classifier3d.js';

/**
 * Ajusta un color hexadecimal aclarando u oscureciendo un porcentaje.
 */
export function adjustColor(hex, percent) {
  const clean = String(hex || '#C19A6B').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  const adjust = Math.round(percent * 2.55);
  const r = Math.min(255, Math.max(0, (num >> 16) + adjust));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + adjust));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + adjust));
  return `rgb(${r},${g},${b})`;
}

/**
 * Devuelve el color base para cada cara del cuboide.
 * front: base, top: más claro, right: más oscuro, back/left/bottom: más oscuro.
 */
export function getFaceColors(baseColor) {
  return {
    front: baseColor,
    back: adjustColor(baseColor, -30),
    left: adjustColor(baseColor, -20),
    right: adjustColor(baseColor, -20),
    top: adjustColor(baseColor, 20),
    bottom: adjustColor(baseColor, -30),
  };
}

/**
 * Calcula la opacidad de una cara según el tipo de pieza, cara, opacidad global y modo X-ray.
 */
export function calculateOpacity(pieceType, faceName, globalOpacity, xrayMode) {
  const base = Math.max(0.05, Math.min(1, globalOpacity ?? 1));

  if (xrayMode && pieceType === 'envelope') {
    return 0.05;
  }

  if (pieceType === 'envelope') {
    if (faceName === 'front') return Math.min(0.25, base * 0.25);
    if (faceName === 'back') return Math.min(0.4, base * 0.4);
    return Math.min(0.5, base * 0.5); // laterales/top/bottom
  }

  if (pieceType === 'interior') {
    return Math.min(1, base + 0.15);
  }

  if (pieceType === 'structural') {
    return Math.min(1, base);
  }

  return base;
}

/**
 * Color del borde/canto según material.
 */
export function getEdgeBandColor(baseColor) {
  // Nogal (#8B5A2B) -> oscuro, Haya (#C19A6B) -> más oscuro
  if (baseColor?.toLowerCase() === '#8b5a2b') return '#3a1f0a';
  if (baseColor?.toLowerCase() === '#c19a6b') return '#5c3a1e';
  return adjustColor(baseColor, -40);
}

/**
 * Determina qué bordes de la cara frontal deben pintarse con canto.
 * @param {Array<string>} cantos ['T','B','L','R']
 * @returns {Array<{x1,y1,x2,y2}>} segmentos en coordenadas proyectadas de la cara frontal.
 */
export function computeEdgeBands(frontPolygon, cantos) {
  if (!cantos || !cantos.length) return [];
  // frontPolygon = [3, 2, 6, 7] en orden: inferior-izq-frontal, inferior-der-frontal, superior-der-frontal, superior-izq-frontal
  const [bl, br, tr, tl] = frontPolygon;
  const segments = [];

  if (cantos.includes('T')) segments.push({ x1: tl.x, y1: tl.y, x2: tr.x, y2: tr.y }); // top
  if (cantos.includes('B')) segments.push({ x1: bl.x, y1: bl.y, x2: br.x, y2: br.y }); // bottom
  if (cantos.includes('L')) segments.push({ x1: bl.x, y1: bl.y, x2: tl.x, y2: tl.y }); // left
  if (cantos.includes('R')) segments.push({ x1: br.x, y1: br.y, x2: tr.x, y2: tr.y }); // right

  return segments;
}

/**
 * Genera un indicador de rotación (↻) cerca de la cara frontal de la pieza.
 */
export function makeRotationIndicator(frontPolygon, piece) {
  if (!piece.rotated) return '';
  if (!frontPolygon || frontPolygon.length < 4) return '';
  const cx = frontPolygon.reduce((s, p) => s + p.x, 0) / frontPolygon.length;
  const cy = frontPolygon.reduce((s, p) => s + p.y, 0) / frontPolygon.length;
  return `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#FFD700" font-size="14" font-weight="bold" pointer-events="none">↻</text>`;
}

/**
 * Genera líneas de cota para la cara frontal de una pieza.
 */
export function makeDimensionLines(frontPolygon, piece) {
  if (!frontPolygon || frontPolygon.length < 4) return '';
  const [bl, br, tr, tl] = frontPolygon;
  const offset = 14;
  let svg = '';

  // Ancho (borde inferior)
  svg += drawCota(bl, br, `${piece.w.toFixed(0)}`, 0, offset, '#00ff88');
  // Alto (borde izquierdo)
  svg += drawCota(bl, tl, `${piece.h.toFixed(0)}`, -offset, 0, '#00ff88');
  // Profundidad: se representa como texto central con las 3 dimensiones,
  // ya que la profundidad no es visible en la proyección 2D de la cara frontal.
  const cx = (bl.x + br.x + tr.x + tl.x) / 4;
  const cy = (bl.y + br.y + tr.y + tl.y) / 4;
  svg += `
    <text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#00ff88" font-size="9" font-family="monospace" font-weight="600" pointer-events="none">${escapeHtml(`${piece.w.toFixed(0)} × ${piece.d.toFixed(0)} × ${piece.h.toFixed(0)}`)}</text>`;

  return svg;
}

function drawCota(a, b, text, offX, offY, color) {
  const ax = a.x + offX;
  const ay = a.y + offY;
  const bx = b.x + offX;
  const by = b.y + offY;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  return `
    <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.6" />
    <line x1="${b.x.toFixed(1)}" y1="${b.y.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.6" />
    <line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="0.75" opacity="0.85" />
    <text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="8" font-family="monospace">${escapeHtml(text)}</text>`;
}

/**
 * Genera un degradado metálico simulado para barras colgadoras.
 * Devuelve un <linearGradient> con un id único.
 */
export function createMetalGradient(id, color = '#A0A0A0') {
  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${adjustColor(color, -20)}" />
    <stop offset="50%" stop-color="${adjustColor(color, 30)}" />
    <stop offset="100%" stop-color="${adjustColor(color, -20)}" />
  </linearGradient>`;
}

/**
 * Devuelve el color de relleno para una cara, considerando metal para barras.
 */
export function getFillForFace(faceName, piece, faceColors, metalGradientId) {
  if (piece.role === 'hanger_rail' && faceName === 'top' && metalGradientId) {
    return `url(#${metalGradientId})`;
  }
  return faceColors[faceName];
}

/**
 * Calcula el color del stroke según selección/hover.
 */
export function getStrokeColor(isSelected, isHovered) {
  if (isSelected) return '#FFD700';
  if (isHovered) return '#FFD700';
  return null; // usar stroke por defecto
}

export function getStrokeWidth(isSelected, isHovered, baseWidth = 1) {
  if (isSelected || isHovered) return Math.max(2, baseWidth + 1);
  return baseWidth;
}
