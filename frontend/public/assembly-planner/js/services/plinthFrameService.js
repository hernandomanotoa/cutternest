// js/services/plinthFrameService.js — Zócalo estructural a marco (cajón de
// 4 lados) para muebles que se arman en el piso y se levantan en vertical.
// Puro y testeable: sin DOM ni SVG (regla de oro).
//
// Modelo: el zócalo se divide en N sub-zócalos cuyos límites se toman de
// las juntas entre módulos (un sub-zócalo puede unir dos módulos y su
// divisor cae en la unión). Solo cuando el tramo entre dos juntas supera
// `maxSpan` se divide en partes de luz <= `splitLight`, con divisores
// verticales internos. Tramos de (splitLight, maxSpan] no llevan divisor
// pero usan 4 niveladores en vez de 2.
//
// Persistencia: las versiones se guardan como CSV (11 columnas), así que el
// layout debe ser DERIVABLE de ids + ancho + espesor (todo CSV-persistent).
// Convención de ids: `glb-zocalo-s{k}-frente|trasero|costado-izq|costado-der`
// y `glb-zocalo-s{k}-divisor-{j}` con k entero secuencial. El ancho del
// frente = ancho del segmento - 2*espesor; las posiciones X se recalculan
// acumulando segmentos (ver plinthLayoutFromPieces).

export const PLINTH_MAX_SPAN = 800;    // tramo máximo entre juntas sin dividir
export const PLINTH_SPLIT_LIGHT = 600; // luz objetivo al dividir un tramo ancho
export const PLINTH_DEFAULT_RECESS = 50; // retraso típico del frente (mm)
export const PLINTH_MAX_LEVELER_SPAN = 600; // a partir de aquí van 4 niveladores

// Posición X del divisor j (1..nDiv) dentro de un segmento. Fórmula única
// usada TANTO al generar piezas como al derivar el layout en el renderer:
// ambos lados deben coincidir exactamente.
export function dividerX(segX0, segWidth, j, nDiv) {
  return segX0 + Math.round((segWidth * j) / (nDiv + 1));
}

// Dimensiones de los módulos raíz ordenados (para segmentos y lift-check).
// Ancho desde la tapa `m{id}-tapa` (fallback: base + 2*espesor), alto desde
// la tapa, profundidad desde el lateral `m{id}-lateral-izq`.
export function rootModuleDims(pieces) {
  const mods = new Map();
  for (const p of pieces || []) {
    const m = String(p.modulo || '');
    if (!/^\d+$/.test(m)) continue;
    if (!mods.has(m)) mods.set(m, { id: m, ancho: 0, alto: 0, profundidad: 0, espesor: 15 });
    const dims = mods.get(m);
    if (/-tapa$/.test(p.id)) { dims.ancho = Number(p.ancho) || 0; dims.alto = Number(p.alto) || 0; dims.espesor = Number(p.espesor) || 15; }
    else if (/-base$/.test(p.id) && !dims.ancho) { dims.ancho = (Number(p.ancho) || 0) + 2 * dims.espesor; dims.espesor = Number(p.espesor) || 15; }
    else if (/-lateral-izq$/.test(p.id)) {
      dims.profundidad = Number(p.ancho) || 0;
      dims.alto = Number(p.alto) || 0; // el alto del módulo vive en los laterales (la tapa es horizontal)
    }
  }
  return [...mods.values()]
    .filter((d) => d.ancho > 0)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

// Segmentos de sub-zócalo a partir de los anchos de módulo (en orden).
// `junctionLeft/Right` indican si el límite coincide con una junta entre
// módulos (unión compartida) o es un corte interno (divisor propio).
export function computePlinthSegments(moduleWidths, { maxSpan = PLINTH_MAX_SPAN, splitLight = PLINTH_SPLIT_LIGHT } = {}) {
  const errors = [];
  if (!Array.isArray(moduleWidths) || !moduleWidths.length) {
    return { ok: false, errors: ['Se necesita al menos un módulo con tapa'] };
  }
  moduleWidths.forEach((w, i) => {
    if (!Number.isFinite(w) || w <= 0) errors.push(`Módulo ${i + 1}: ancho inválido (${w})`);
  });
  if (maxSpan < splitLight) errors.push(`maxSpan (${maxSpan}) debe ser >= splitLight (${splitLight})`);
  if (errors.length) return { ok: false, errors };

  const segments = [];
  let x = 0;
  moduleWidths.forEach((w, i) => {
    if (w <= maxSpan) {
      segments.push({ index: segments.length + 1, x0: x, width: w, modules: [i], junctionLeft: i > 0, junctionRight: i < moduleWidths.length - 1, dividers: [] });
      x += w;
      return;
    }
    // Tramo ancho: dividir en n partes de luz <= splitLight (reparto que
    // absorbe el redondeo en la última parte; límites en round(w*j/n)).
    const n = Math.ceil(w / splitLight);
    for (let j = 0; j < n; j += 1) {
      const x0 = x + Math.round((w * j) / n);
      const x1 = x + Math.round((w * (j + 1)) / n);
      const dividers = j < n - 1 ? [dividerX(x, w, j + 1, n - 1)] : [];
      segments.push({ index: segments.length + 1, x0, width: x1 - x0, modules: [i], junctionLeft: i > 0 && j === 0, junctionRight: i < moduleWidths.length - 1 && j === n - 1, dividers });
    }
    x += w;
  });
  const totalWidth = segments.reduce((s, g) => s + g.width, 0);
  const expected = moduleWidths.reduce((s, w) => s + w, 0);
  if (totalWidth !== expected) return { ok: false, errors: [`Cobertura: los segmentos suman ${totalWidth} mm, se esperaba ${expected} mm`] };
  return { ok: true, segments, totalWidth, warnings: [] };
}

// Piezas del marco para una lista de segmentos. Convención de cortes del
// taller: costados y divisores de largo = profundidad - 2*e (van entre el
// frente y el trasero); frente y trasero (largueros) de largo = ancho del
// segmento - 2*e (van entre los costados). Todas son paneles verticales de
// pie, altura = altoZocalo, ensamblados con tarugos.
export function plinthFramePieces(segments, { profundidad, altoZocalo, espesor = 18, color = '#C19A6B' } = {}) {
  const errors = [];
  if (!Array.isArray(segments) || !segments.length) errors.push('Sin segmentos de zócalo');
  if (!Number.isFinite(profundidad) || profundidad <= 0) errors.push('profundidad inválida');
  if (!Number.isFinite(altoZocalo) || altoZocalo <= 0) errors.push('altoZocalo inválido');
  if (errors.length) return { ok: false, errors };

  const e = espesor;
  const Z = Math.round(altoZocalo);
  const depthPiece = Math.round(profundidad - 2 * e);
  const warnings = [];
  const pieces = [];

  const mk = (id, nombre, ancho) => ({
    id, nombre, ancho, alto: Z, cantidad: 1, rotate: false,
    color, espesor: e, cantos: 'T,B,L,R', modulo: 'estructura', pos_z: 0,
  });

  for (const seg of segments) {
    const k = seg.index;
    const w = Math.round(seg.width - 2 * e);
    if (seg.width < Z) {
      warnings.push(`Sub-zócalo S${k} (${seg.width} mm) es más angosto que su alto (${Z} mm): posible inestabilidad, considere un divisor adicional.`);
    }
    pieces.push(mk(`glb-zocalo-s${k}-frente`, `Zocalo marco S${k} frente`, w));
    pieces.push(mk(`glb-zocalo-s${k}-trasero`, `Zocalo marco S${k} trasero`, w));
    pieces.push(mk(`glb-zocalo-s${k}-costado-izq`, `Lateral zocalo S${k} izquierdo`, depthPiece));
    pieces.push(mk(`glb-zocalo-s${k}-costado-der`, `Lateral zocalo S${k} derecho`, depthPiece));
    seg.dividers.forEach((dx, j) => {
      pieces.push(mk(`glb-zocalo-s${k}-divisor-${j + 1}`, `Divisor zocalo S${k} ${j + 1}`, depthPiece));
    });
  }
  return { ok: true, pieces, warnings };
}

// Layout derivado de las piezas persistidas (ids + ancho + espesor). Usado
// por el renderer y el hardware para posicionar segmentos tras recargar
// versiones CSV. Devuelve [] si no hay marco estructural.
export function plinthLayoutFromPieces(pieces) {
  const frentes = (pieces || [])
    .filter((p) => /^glb-zocalo-s\d+-frente$/.test(String(p.id)))
    .sort((a, b) => Number(String(a.id).match(/^glb-zocalo-s(\d+)-frente$/)[1]) - Number(String(b.id).match(/^glb-zocalo-s(\d+)-frente$/)[1]));
  if (!frentes.length) return [];
  const layout = [];
  let x0 = 0;
  frentes.forEach((f) => {
    const k = Number(String(f.id).match(/^glb-zocalo-s(\d+)-frente$/)[1]);
    const e = Number(f.espesor) || 15;
    const width = (Number(f.ancho) || 0) + 2 * e;
    if (width <= 0) return;
    const nDiv = (pieces || []).filter((p) => new RegExp(`^glb-zocalo-s${k}-divisor-`).test(String(p.id))).length;
    // El generador emite cada divisor en el borde derecho de su parte (el
    // límite entre partes de un módulo ancho dividido). Regla simétrica
    // aquí: los nDiv divisores del segmento caen en x0 + width.
    const dividers = Array.from({ length: nDiv }, () => x0 + width);
    layout.push({ index: k, x0, width, dividers });
    x0 += width;
  });
  return layout;
}

// Niveladores ocultos por sub-zócalo: 2, o 4 si el segmento supera 600 mm.
export function levelerCountForSegment(segWidth) {
  return segWidth > PLINTH_MAX_LEVELER_SPAN ? 4 : 2;
}

export function totalLevelers(layout) {
  return (layout || []).reduce((n, seg) => n + levelerCountForSegment(seg.width), 0);
}

// Verificación de levantamiento en vertical (restricción de diagonal con el
// techo). El mueble se arma acostado: alto_cuerpo ≤ √(H²−D²) − MARGEN_SEG.
// Z_real es el alto del zócalo y debe caer en [zMin, zMax]. Sin hTecho la
// verificación se omite (skipped).
export function computeLiftCheck({ altoModulo, altoZocalo, profundidad, hTecho, margenSeg = 20, margenAjuste = 10, zMin = 60, zMax = 150 } = {}) {
  const base = {
    skipped: false, altoCuerpo: null, zReal: Number(altoZocalo) || 0,
    diagonal: null, holgura: null, levantamientoOk: null, zEnRango: null, warnings: [],
  };
  if (!Number.isFinite(hTecho) || hTecho <= 0) return { ...base, skipped: true };
  const altoCuerpo = (Number(altoModulo) || 0) - (Number(altoZocalo) || 0);
  const diagonal = Math.hypot(altoCuerpo, Number(profundidad) || 0);
  // holgura real disponible para el levantamiento inclinado
  const holgura = hTecho - diagonal - (Number(margenSeg) || 0);
  const zReal = Number(altoZocalo) || 0;
  const zEnRango = zReal >= zMin && zReal <= zMax;
  const warnings = [];
  if (holgura < 0) warnings.push(`No cabe en vertical: la diagonal del cuerpo (${diagonal.toFixed(0)} mm) + margen de seguridad superan el techo (${hTecho} mm) en ${Math.abs(holgura).toFixed(0)} mm.`);
  if (!zEnRango) warnings.push(`Zócalo de ${zReal} mm fuera de rango [${zMin}, ${zMax}] mm (Z_real = H_objetivo − alto_cuerpo − ${Number(margenAjuste) || 10} mm de ajuste).`);
  return { ...base, altoCuerpo, zReal, diagonal, holgura, levantamientoOk: holgura >= 0, zEnRango, warnings };
}
