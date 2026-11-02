// js/utils/grainPattern.js — Patrón SVG procedural de veta de madera para los
// renderers del planner (3D e isométrica). Genera <pattern> deterministas
// (semilla fija) derivados del color base de cada pieza: el color de la veta
// se calcula oscureciendo el base, así cualquier melamina del proyecto
// muestra vetas coherentes sin configuración. Lógica pura (strings SVG);
// testeable con node --test.

import { swapEnCorte } from '../services/cutOrientationService.js';
import { inferRole } from '../services/classifierService.js';

// Generador pseudoaleatorio con semilla (mulberry32): mismas entradas →
// mismo patrón en cada render.
export function mulberry32(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rango = (rng, min, max) => min + rng() * (max - min);

/** Oscurece un '#rrggbb' multiplicando RGB por (1 − factor). */
export function oscurecerHex(hex, factor = 0.35) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#5a4632';
  const n = parseInt(m[1], 16);
  const c = (shift) => {
    const v = Math.round(((n >> shift) & 255) * (1 - factor));
    return Math.max(0, Math.min(255, v));
  };
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

/** Hash determinista (FNV-1a) para el id del patrón. */
function hashId(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const SEMILLA_VETA = 20261102;
const TILE = 28; // px del tile del patrón
const N_VETAS = 9;

/**
 * Id determinista del patrón de veta para (color, direccion). Mismo par →
 * mismo id (la caché de defs reutiliza el patrón entre piezas).
 */
export function patronVetaId(color, direccion, soloVetas = false) {
  return `gv-${hashId(`${String(color).toLowerCase()}|${direccion}|${soloVetas ? 'sv' : 'c'}`)}`;
}

/**
 * Markup <pattern> de veta procedural: rect de color base + N vetas finas
 * onduladas (sinusoide poligonal) en el color oscurecido. Dirección
 * 'vertical' rota el tile 90° (la veta corre a lo largo de Y).
 */
export function patronVetaDef(color, direccion, semilla = SEMILLA_VETA, opts = {}) {
  const id = patronVetaId(color, direccion, !!opts.soloVetas);
  const rng = mulberry32(semilla);
  const veta = oscurecerHex(color, 0.38);
  const boost = opts.soloVetas ? 1.5 : 1;
  const partes = [];
  for (let i = 0; i < N_VETAS; i += 1) {
    const baseY = (i + 0.5) * (TILE / N_VETAS) + rango(rng, -1.5, 1.5);
    const amp = rango(rng, 0.6, 2.2);
    const f1 = rango(rng, 0.25, 0.6);
    const f2 = rango(rng, 0.6, 1.1);
    const p1 = rango(rng, 0, Math.PI * 2);
    const p2 = rango(rng, 0, Math.PI * 2);
    const grosor = rango(rng, 0.4, 1.1).toFixed(2);
    const opacidad = Math.min(0.55, rango(rng, 0.14, 0.32) * boost).toFixed(2);
    let d = '';
    for (let x = 0; x <= TILE; x += 2) {
      const y = baseY + amp * Math.sin(x * f1 + p1) + (amp / 2) * Math.sin(x * f2 + p2);
      d += `${x === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(2)}`;
    }
    partes.push(`<path d="${d}" fill="none" stroke="${veta}" stroke-width="${grosor}" opacity="${opacidad}"/>`);
  }
  const transform = direccion === 'vertical' ? ` patternTransform="rotate(90)"` : '';
  const base = opts.soloVetas ? '' : `<rect width="${TILE}" height="${TILE}" fill="${color}"/>`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${TILE}" height="${TILE}"${transform}>` +
    `${base}${partes.join('')}</pattern>`;
}

/**
 * Dirección de la veta para el RENDER de una pieza: misma regla que la
 * orientación de corte (cutOrientationService.swapEnCorte): piezas de vista
 * vertical (costados, divisores) → 'vertical'; el resto → 'horizontal'.
 */
export function direccionVetaRender(piece) {
  return swapEnCorte(inferRole(piece)) ? 'vertical' : 'horizontal';
}

/**
 * Registro de patrones usados en un render: collect(color, direccion) marca
 * el patrón como usado y devuelve el fill `url(#id)`; defs() entrega el
 * bloque <defs> con las definiciones (una por par usado).
 */
export function crearRegistroPatronesVeta() {
  const usados = new Map();
  return {
    collect(color, direccion, opts) {
      const clave = `${String(color).toLowerCase()}|${direccion}|${opts?.soloVetas ? 'sv' : 'c'}`;
      if (!usados.has(clave)) usados.set(clave, patronVetaDef(color, direccion, SEMILLA_VETA, opts));
      return `url(#${patronVetaId(color, direccion)})}`;
    },
    defs() {
      if (!usados.size) return '';
      return `<defs>${[...usados.values()].join('')}</defs>`;
    },
  };
}
