// js/renderer3d/transform.js — Rotación, proyección, explode y animaciones
// Lógica pura, sin DOM.

import { computeModuleCenter } from './geometry.js';

export const DEG_TO_RAD = Math.PI / 180;

/**
 * Rota un vértice alrededor del origen.
 * - rotY: rotación horizontal (azimut)
 * - rotX: rotación vertical (elevación)
 * Se aplica primero rotY, luego rotX.
 */
export function rotateVertex(v, rotXDeg, rotYDeg) {
  const rx = rotXDeg * DEG_TO_RAD;
  const ry = rotYDeg * DEG_TO_RAD;

  // Rotación alrededor de Y
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x1 = v.x * cosY - v.z * sinY;
  const z1 = v.x * sinY + v.z * cosY;
  const y1 = v.y;

  // Rotación alrededor de X
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y2 = y1 * cosX - z1 * sinX;
  const z2 = y1 * sinX + z1 * cosX;

  return { x: x1, y: y2, z: z2 };
}

/**
 * Proyección ortográfica centrada en el módulo.
 * @param {Object} v vértice en mm {x,y,z}
 * @param {Object} moduleCenter centro del módulo en mm {x,y,z}
 * @param {Object} camera {rotX, rotY, scale, offsetX, offsetY}
 */
export function projectVertexCentered(v, moduleCenter, camera) {
  const centered = {
    x: v.x - moduleCenter.x,
    y: v.y - moduleCenter.y,
    z: v.z - moduleCenter.z,
  };
  const rotated = rotateVertex(centered, camera.rotX, camera.rotY);
  return {
    x: camera.offsetX + rotated.x * camera.scale,
    y: camera.offsetY - rotated.z * camera.scale, // usamos Z como altura visual
  };
}

/**
 * Proyección ortográfica simple (sin centrar).
 * @param {Object} v vértice rotado {x,y,z}
 * @param {number} scale
 * @param {number} offsetX
 * @param {number} offsetY
 */
export function projectVertex(v, scale, offsetX, offsetY) {
  return {
    x: offsetX + v.x * scale,
    y: offsetY - v.y * scale,
  };
}

/**
 * Calcula la profundidad promedio de una cara después de la rotación.
 */
export function faceAverageZ(rotatedVertices, faceIndices) {
  return faceIndices.reduce((sum, i) => sum + rotatedVertices[i].z, 0) / faceIndices.length;
}

/**
 * Aplica el efecto explode a un conjunto de piezas.
 * @param {Array} pieces piezas 3D con centroide (cx,cy,cz)
 * @param {number} factor 0..1 (o mayor)
 * @param {Object} moduleCenter centro del módulo {x,y,z}
 * @param {Function} classifyFn función (piece) => 'envelope' | 'interior' | 'structural'
 */
export function applyExplode(pieces, factor, moduleCenter, classifyFn) {
  if (!factor) return pieces.map((p) => ({ ...p }));

  return pieces.map((p) => {
    const type = classifyFn ? classifyFn(p) : 'interior';
    let multiplier = 1.0;

    switch (type) {
      case 'envelope':
        multiplier = 0.6;
        break;
      case 'interior':
        multiplier = 1.5;
        break;
      case 'structural':
        multiplier = 1.0;
        break;
      default:
        multiplier = 1.0;
    }

    // El zócalo permanece anclado (factor 0)
    if (p.role === 'plinth') multiplier = 0.05;

    const dx = p.cx - moduleCenter.x;
    const dy = p.cy - moduleCenter.y;
    const dz = p.cz - moduleCenter.z;

    const k = factor * multiplier;
    return {
      ...p,
      x: p.x + dx * k,
      y: p.y + dy * k,
      z: p.z + dz * k,
      cx: p.cx + dx * k,
      cy: p.cy + dy * k,
      cz: p.cz + dz * k,
    };
  });
}

/**
 * Interpolación lineal entre a y b.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpola las propiedades numéricas de un objeto hacia un target.
 * Útil para animar explode/opacity/camera.
 */
export function lerpObject(current, target, t) {
  const result = {};
  for (const key of Object.keys(target)) {
    const a = Number(current[key]);
    const b = Number(target[key]);
    result[key] = Number.isFinite(a) && Number.isFinite(b) ? lerp(a, b, t) : target[key];
  }
  return result;
}

/**
 * Calcula el centroide del módulo para un conjunto de piezas.
 */
export { computeModuleCenter };
