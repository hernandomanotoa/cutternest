// js/renderer3d/geometry.js — Geometría 3D de piezas CutterNest
// Lógica pura, sin DOM. Reutiliza el clasificador de piezas existente.

import { inferRole, isShoeRack, isDividerVertical } from '../services/classifierService.js';
import { boxCorners, rotateCorners } from '../services/motionService.js';
import { normalizeName } from '../utils/normalize.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Construye la representación 3D de una pieza a partir de una fila CSV.
 * @param {Object} csvRow
 * @returns {Object} { id, name, x, y, z, w, h, d, cx, cy, cz, color, espesor, tipo, role, cantos, cantidad, modulo, raw }
 */
export function buildPiece3D(csvRow) {
  const piece = { ...csvRow };

  // Normalizar rotate
  const rotated = String(piece.rotate || '').toLowerCase() === 'si';
  let ancho = Number(piece.ancho) || 0;
  let alto = Number(piece.alto) || 0;
  if (rotated) [ancho, alto] = [alto, ancho];

  const espesor = Number(piece.espesor) || 15;
  const role = inferRole(piece);
  const tipo = classifyOrientation(role, piece);

  let w, h, d;
  switch (tipo) {
    case 'vertical':
      w = espesor;
      h = alto;
      d = ancho;
      break;
    case 'horizontal_xz':
      w = ancho;
      h = alto;
      d = espesor;
      break;
    case 'horizontal_xy':
    default:
      w = ancho;
      h = espesor;
      d = alto;
      break;
  }

  const x = Number(piece.pos_x) || 0;
  const y = Number(piece.pos_y) || 0;
  const z = Number(piece.pos_z) || 0;

  return {
    id: piece.id,
    name: piece.nombre,
    x, y, z,
    w, h, d,
    cx: x + w / 2,
    cy: y + d / 2,
    cz: z + h / 2,
    color: piece.color || '#C19A6B',
    espesor,
    tipo,
    role,
    cantos: parseCantos(piece.cantos),
    cantidad: Number(piece.cantidad) || 1,
    modulo: String(piece.modulo || '1').trim(),
    rotated,
    raw: piece,
  };
}

/**
 * Determina la orientación 3D de una pieza según su rol.
 * @returns {'vertical' | 'horizontal_xy' | 'horizontal_xz'}
 */
export function orientPiece(piece) {
  return classifyOrientation(inferRole(piece), piece);
}

function classifyOrientation(role, piece) {
  const n = normalizeName(piece?.nombre || '');

  // Piezas verticales: laterales, divisiones, puertas, frentes, vidrios, montantes
  if (
    role === 'side_panel' ||
    role === 'divider' ||
    role === 'door' ||
    role === 'glass' ||
    role === 'front_panel' ||
    role === 'drawer_face' ||
    role === 'mirror' ||
    (role === 'back_panel' && !n.includes('fondo')) // fondo sin palabra fondo = panel trasero vertical
  ) {
    return 'vertical';
  }

  // Fondo propiamente dicho: en el prompt es horizontal XZ
  if (role === 'back_panel' && n.includes('fondo')) return 'horizontal_xz';

  // Todo lo demás se trata como horizontal XY (tapa, base, estantes, barras, cajones)
  return 'horizontal_xy';
}

function parseCantos(cantos) {
  if (!cantos || String(cantos).trim() === '') return [];
  return String(cantos)
    .split(/[,;]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Genera los 8 vértices de un cuboide a partir de su posición y dimensiones.
 * @param {Object} box { x, y, z, w, h, d }
 * @returns {Array<{x:number,y:number,z:number}>}
 */
export function generateVertices(box) {
  const { x, y, z, w, h, d } = box;
  return [
    { x, y, z },             // 0 inferior-izq-trasera
    { x: x + w, y, z },      // 1 inferior-der-trasera
    { x: x + w, y: y + d, z }, // 2 inferior-der-frontal
    { x, y: y + d, z },      // 3 inferior-izq-frontal
    { x, y, z: z + h },      // 4 superior-izq-trasera
    { x: x + w, y, z: z + h }, // 5 superior-der-trasera
    { x: x + w, y: y + d, z: z + h }, // 6 superior-der-frontal
    { x, y: y + d, z: z + h }, // 7 superior-izq-frontal
  ];
}

/**
 * Vértices de una pieza 3D respetando geo.rotation (apertura de bisagra).
 * El orden de esquinas de boxCorners/rotateCorners coincide con el de
 * generateVertices, así que CUBOID_FACES sigue siendo válido.
 */
export function pieceVertices(piece) {
  if (piece.rotation) {
    return rotateCorners(boxCorners(piece), piece.rotation);
  }
  return generateVertices(piece);
}

/**
 * Define las 6 caras de un cuboide con sus índices de vértices.
 */
export const CUBOID_FACES = [
  { name: 'back', indices: [0, 1, 5, 4], normal: { x: 0, y: -1, z: 0 } },
  { name: 'front', indices: [3, 2, 6, 7], normal: { x: 0, y: 1, z: 0 } },
  { name: 'left', indices: [0, 3, 7, 4], normal: { x: -1, y: 0, z: 0 } },
  { name: 'right', indices: [1, 2, 6, 5], normal: { x: 1, y: 0, z: 0 } },
  { name: 'bottom', indices: [0, 1, 2, 3], normal: { x: 0, y: 0, z: -1 } },
  { name: 'top', indices: [4, 5, 6, 7], normal: { x: 0, y: 0, z: 1 } },
];

/**
 * Calcula la caja envolvente (bounding box) de un conjunto de geometrías 3D.
 * Devuelve esquinas, centro y tamaño en mm. Se usa como centro de rotación
 * orbital y explode: en vista completa los módulos se desplazan en X, así que
 * el centro debe calcularse sobre las geometrías reales, no sobre moduleW/2.
 */
export function computeBoundingBox(pieces) {
  const zero = { x: 0, y: 0, z: 0 };
  if (!pieces || !pieces.length) {
    return { min: { ...zero }, max: { ...zero }, center: { ...zero }, size: { w: 0, d: 0, h: 0 } };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of pieces) {
    if (p.rotation) {
      // Puerta abierta: la caja alineada no refleja la extensión real; se
      // usan las 8 esquinas rotadas para acotar explode y centro orbital.
      const corners = rotateCorners(boxCorners(p), p.rotation);
      for (const c of corners) {
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
        minZ = Math.min(minZ, c.z);
        maxZ = Math.max(maxZ, c.z);
      }
      continue;
    }
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + p.w);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y + p.d);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z + p.h);
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    size: { w: maxX - minX, d: maxY - minY, h: maxZ - minZ },
  };
}

/**
 * Calcula el centroide de un conjunto de piezas 3D.
 */
export function computeModuleCenter(pieces) {
  if (!pieces.length) return { x: 0, y: 0, z: 0 };
  const sum = pieces.reduce(
    (acc, p) => ({ x: acc.x + p.cx, y: acc.y + p.cy, z: acc.z + p.cz }),
    { x: 0, y: 0, z: 0 }
  );
  return {
    x: sum.x / pieces.length,
    y: sum.y / pieces.length,
    z: sum.z / pieces.length,
  };
}

export { DEG_TO_RAD, inferRole, isShoeRack };
