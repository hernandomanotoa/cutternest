// js/renderer3d/svgBuilder.js — Construcción del SVG con painter's algorithm
// Genera el SVG como string, sin dependencias del DOM, para poder ejecutarse
// tanto en el navegador como en tests de Node.

import { generateVertices, CUBOID_FACES } from './geometry.js';
import { rotateVertex, projectVertexCentered } from './transform.js';
import { classifyPiece } from './classifier3d.js';
import {
  getFaceColors,
  calculateOpacity,
  getEdgeBandColor,
  computeEdgeBands,
  makeRotationIndicator,
  makeDimensionLines,
  createMetalGradient,
  getFillForFace,
} from './materials.js';
import { escapeHtml } from '../utils.js';

/**
 * Escapa caracteres XML para atributos y contenido de texto.
 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${escapeXml(k)}="${escapeXml(v)}"`)
    .join(' ');
}

function openTag(tag, attrs = {}) {
  const a = attr(attrs);
  return a ? `<${tag} ${a}>` : `<${tag}>`;
}

function voidTag(tag, attrs = {}) {
  const a = attr(attrs);
  return a ? `<${tag} ${a} />` : `<${tag} />`;
}

function wrap(tag, attrs = {}, children = '') {
  return `${openTag(tag, attrs)}${children}</${tag}>`;
}

/**
 * Construye el SVG para un conjunto de piezas 3D.
 * @param {Array} pieces piezas 3D (ya orientadas y explotadas)
 * @param {Object} camera estado de cámara {rotX, rotY, scale, offsetX, offsetY}
 * @param {Object} options
 * @returns {string} SVG completo como string.
 */
export function buildSVG(pieces, camera, options = {}) {
  const {
    globalOpacity = 1,
    xrayMode = false,
    showDimensions = false,
    selectedId = null,
    hoveredId = null,
    width = 900,
    height = 600,
    title = '',
    dimsText = '',
    moduleCenter = { x: 0, y: 0, z: 0 },
    explodeLines = [],
    section = null,
    moduleSize = { w: 0, d: 0, h: 0 },
  } = options;

  const sectionCoord = section
    ? (p) => (section.axis === 'x' ? p.cx : section.axis === 'y' ? p.cy : p.cz)
    : null;
  const visiblePieces = section
    ? pieces.filter((p) => sectionCoord(p) <= section.value + 1e-6)
    : pieces;

  const renderQueue = [];
  const metalGradients = [];

  pieces.forEach((piece) => {
    if (section && sectionCoord(piece) > section.value + 1e-6) return;
    const type = classifyPiece(piece);
    const baseVerts = generateVertices(piece);
    const rotatedVerts = baseVerts.map((v) => rotateVertex({
      x: v.x - moduleCenter.x,
      y: v.y - moduleCenter.y,
      z: v.z - moduleCenter.z,
    }, camera.rotX, camera.rotY));
    const projectedVerts = baseVerts.map((v) => projectVertexCentered(v, moduleCenter, camera));

    const faceColors = getFaceColors(piece.color);
    let metalId = null;
    if (piece.role === 'hanger_rail') {
      metalId = `metal-${piece.id}`;
      metalGradients.push(createMetalGradient(metalId, piece.color));
    }

    const isSelected = selectedId === piece.id;
    const isHovered = hoveredId === piece.id;
    const isDimmed = selectedId && !isSelected;

    CUBOID_FACES.forEach((face) => {
      const pts = face.indices.map((i) => projectedVerts[i]);
      // La coordenada Y rotada representa la profundidad respecto a la cámara.
      const avgDepth = face.indices.reduce((sum, i) => sum + rotatedVerts[i].y, 0) / face.indices.length;
      renderQueue.push({
        piece,
        face,
        pts,
        avgDepth,
        type,
        faceColors,
        metalId,
        isSelected,
        isHovered,
        isDimmed,
      });
    });
  });

  // Painter's algorithm: ordenar de más lejano a más cercano (menor Y rotado primero)
  renderQueue.sort((a, b) => a.avgDepth - b.avgDepth);

  // Caras de corte: piezas atravesadas por el plano de sección se rellenan
  // con hatch en la intersección exacta del cuboide con el plano.
  const cutFaces = [];
  if (section) {
    visiblePieces.forEach((p) => {
      let corners = null;
      if (section.axis === 'x' && p.x < section.value && section.value < p.x + p.w) {
        const v = section.value;
        corners = [{ x: v, y: p.y, z: p.z }, { x: v, y: p.y + p.d, z: p.z }, { x: v, y: p.y + p.d, z: p.z + p.h }, { x: v, y: p.y, z: p.z + p.h }];
      } else if (section.axis === 'y' && p.y < section.value && section.value < p.y + p.d) {
        const v = section.value;
        corners = [{ x: p.x, y: v, z: p.z }, { x: p.x + p.w, y: v, z: p.z }, { x: p.x + p.w, y: v, z: p.z + p.h }, { x: p.x, y: v, z: p.z + p.h }];
      } else if (section.axis === 'z' && p.z < section.value && section.value < p.z + p.h) {
        const v = section.value;
        corners = [{ x: p.x, y: p.y, z: v }, { x: p.x + p.w, y: p.y, z: v }, { x: p.x + p.w, y: p.y + p.d, z: v }, { x: p.x, y: p.y + p.d, z: v }];
      }
      if (corners) {
        const pts = corners.map((c) => projectVertexCentered(c, moduleCenter, camera));
        cutFaces.push(pts.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' '));
      }
    });
  }

  const svgParts = [];

  // Líneas de ruta del explode (ensamblado -> despiezado), debajo de las caras.
  if (explodeLines.length) {
    const lineTags = explodeLines.map((l) => voidTag('line', {
      x1: l.from.x.toFixed(2),
      y1: l.from.y.toFixed(2),
      x2: l.to.x.toFixed(2),
      y2: l.to.y.toFixed(2),
      stroke: '#8b949e',
      'stroke-width': '1',
      'stroke-dasharray': '4,3',
      opacity: '0.7',
      'pointer-events': 'none',
    })).join('\n    ');
    svgParts.push(wrap('g', { class: 'r3d-explode-lines' }, lineTags));
  }

  // Indicador del plano de sección (rectángulo del plano proyectado)
  if (section && moduleSize.w > 0) {
    const v = section.value;
    const w = moduleSize.w;
    const d = moduleSize.d;
    const h = moduleSize.h;
    let corners;
    if (section.axis === 'x') corners = [{ x: v, y: 0, z: 0 }, { x: v, y: d, z: 0 }, { x: v, y: d, z: h }, { x: v, y: 0, z: h }];
    else if (section.axis === 'y') corners = [{ x: 0, y: v, z: 0 }, { x: w, y: v, z: 0 }, { x: w, y: v, z: h }, { x: 0, y: v, z: h }];
    else corners = [{ x: 0, y: 0, z: v }, { x: w, y: 0, z: v }, { x: w, y: d, z: v }, { x: 0, y: d, z: v }];
    const pts = corners.map((c) => projectVertexCentered(c, moduleCenter, camera));
    const pointsStr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    svgParts.push(voidTag('polygon', {
      points: pointsStr,
      fill: '#58a6ff',
      'fill-opacity': '0.08',
      stroke: '#58a6ff',
      'stroke-width': '1',
      'stroke-dasharray': '6,4',
      'pointer-events': 'none',
    }));
  }

  renderQueue.forEach((item) => {
    const { piece, face, pts, type, faceColors, metalId, isSelected, isHovered, isDimmed } = item;
    const pointsStr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

    const baseOpacity = calculateOpacity(type, face.name, globalOpacity, xrayMode);
    let opacity;
    if (isSelected) opacity = 1;
    else if (isHovered) opacity = 0.95;
    else if (isDimmed) opacity = baseOpacity * 0.3;
    else opacity = baseOpacity;

    svgParts.push(voidTag('polygon', {
      points: pointsStr,
      fill: getFillForFace(face.name, piece, faceColors, metalId),
      stroke: isSelected || isHovered ? '#FFD700' : '#222',
      'stroke-width': isSelected || isHovered ? '2' : '0.75',
      'stroke-linejoin': 'round',
      'fill-opacity': Math.max(0.02, opacity).toFixed(3),
      'stroke-opacity': '0.9',
      filter: isHovered ? 'brightness(1.3)' : undefined,
      'data-piece-id': piece.id,
      'data-face': face.name,
      'data-module': piece.modulo,
      'data-name': piece.name || piece.id,
      'data-role': piece.role,
      'data-cantos': (piece.cantos || []).join(','),
      'data-qty': String(piece.cantidad),
      'data-color': piece.color,
      'data-w': Number(piece.w).toFixed(1),
      'data-d': Number(piece.d).toFixed(1),
      'data-h': Number(piece.h).toFixed(1),
    }));

    // Cantos visibles solo en cara frontal
    if (face.name === 'front' && piece.cantos?.length) {
      const edgeColor = getEdgeBandColor(piece.color);
      computeEdgeBands(pts, piece.cantos).forEach((seg) => {
        svgParts.push(voidTag('line', {
          x1: seg.x1.toFixed(2),
          y1: seg.y1.toFixed(2),
          x2: seg.x2.toFixed(2),
          y2: seg.y2.toFixed(2),
          stroke: edgeColor,
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'pointer-events': 'none',
        }));
      });
    }

    // Indicador de rotación
    if (face.name === 'front' && piece.rotated) {
      svgParts.push(makeRotationIndicator(pts, piece));
    }

    // Cotas al hover o selección
    if (showDimensions && (isHovered || isSelected) && face.name === 'front') {
      svgParts.push(makeDimensionLines(pts, piece));
    }
  });

  // Caras de corte con hatch, encima de las caras visibles
  cutFaces.forEach((pointsStr) => {
    svgParts.push(voidTag('polygon', {
      points: pointsStr,
      fill: 'url(#r3d-hatch)',
      stroke: '#58a6ff',
      'stroke-width': '1',
      'pointer-events': 'none',
    }));
  });

  const defsContent = [
    metalGradients.join('\n    '),
    cutFaces.length
      ? wrap('pattern', {
          id: 'r3d-hatch',
          patternUnits: 'userSpaceOnUse',
          width: '8',
          height: '8',
          patternTransform: 'rotate(45)',
        }, `${voidTag('rect', { width: '8', height: '8', fill: '#58a6ff', 'fill-opacity': '0.2' })}${voidTag('line', { x1: '0', y1: '0', x2: '0', y2: '8', stroke: '#58a6ff', 'stroke-width': '1.5' })}`)
      : '',
  ].filter(Boolean).join('\n    ');
  const defs = defsContent ? wrap('defs', {}, defsContent) : '';

  const titleEl = wrap('text', {
    x: (width / 2).toFixed(1),
    y: '28',
    'text-anchor': 'middle',
    fill: '#c9d1d9',
    'font-size': '16',
    'font-weight': '700',
  }, `Vista 3D${title ? ` — ${escapeHtml(title)}` : ''}`);

  const dimsEl = wrap('text', {
    x: (width / 2).toFixed(1),
    y: '50',
    'text-anchor': 'middle',
    fill: '#8b949e',
    'font-size': '11',
  }, escapeHtml(dimsText));

  const mainGroup = wrap('g', { class: 'r3d-scene' }, svgParts.join('\n    '));

  const svg = wrap('svg', {
    viewBox: `0 0 ${width} ${height}`,
    xmlns: 'http://www.w3.org/2000/svg',
    role: 'img',
    'preserve-aspect-ratio': 'xMidYMid meet',
    style: 'width:100%;height:100%;display:block;background:#0d1117;',
  }, [defs, titleEl, dimsEl, mainGroup].filter(Boolean).join('\n  '));

  return svg;
}

export { CUBOID_FACES };
