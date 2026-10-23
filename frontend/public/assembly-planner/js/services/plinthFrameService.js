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

// Piezas del marco: ids `glb-zocalo-s{k}-*` (segmentado) y `glb-zocalo-*`
// (único). Usado para reemplazar/quitar el marco sin tocar otros globales.
export const MARCO_PIECE_RE = /^glb-zocalo(-s\d+)?-(frente|trasero|costado-izq|costado-der|divisor-\d+|divpar-\d+)$/;

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
// el lateral, profundidad desde el lateral `m{id}-lateral-izq`. Los ids
// anclados al módulo (`m\d+-pieza`) excluyen los submódulos (cajón/zapatera),
// cuyas piezas comparten sufijo pero viven en su propio módulo ('11'...).
export function rootModuleDims(pieces) {
  const mods = new Map();
  for (const p of pieces || []) {
    const m = String(p.modulo || '');
    if (!/^\d+$/.test(m)) continue;
    if (!mods.has(m)) mods.set(m, { id: m, ancho: 0, alto: 0, profundidad: 0, espesor: 15 });
    const dims = mods.get(m);
    if (/^m\d+-tapa$/.test(p.id)) { dims.ancho = Number(p.ancho) || 0; dims.alto = Number(p.alto) || 0; dims.espesor = Number(p.espesor) || 15; }
    else if (/^m\d+-base$/.test(p.id) && !dims.ancho) { dims.ancho = (Number(p.ancho) || 0) + 2 * dims.espesor; dims.espesor = Number(p.espesor) || 15; }
    else if (/^m\d+-lateral-izq$/.test(p.id)) {
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

// Piezas del marco. mode 'segmentado': un cajón por segmento (sub-zócalos).
// mode 'unico' (default): UN solo cajón de ancho total (Σ segmentos) con
// costados solo en los extremos; bajo cada módulo con cajones/zapateras
// (`drawerModules: [{moduloId, ancho}]`) agrega una división paralela al
// frente/trasero a mitad de la profundidad (apoya el medio de la base del
// cajón). Convención de cortes: costados y divisiones de largo = D−2e (van
// entre frente y trasero); largueros de largo = ancho − 2e (van entre
// costados). Paneles verticales de pie, altura = altoZocalo, tarugos.
export function plinthFramePieces(segments, { profundidad, altoZocalo, espesor = 18, color = '#C19A6B', mode = 'segmentado', drawerModules = [] } = {}) {
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

  const mk = (id, nombre, ancho, rotate = false) => ({
    id, nombre, ancho, alto: Z, cantidad: 1, rotate,
    color, espesor: e, cantos: 'T,B,L,R', modulo: 'estructura', pos_z: 0,
  });

  if (mode === 'unico') {
    const total = segments.reduce((s, g) => s + g.width, 0);
    const w = Math.round(total - 2 * e);
    if (total < Z) {
      warnings.push(`Zócalo único (${total} mm) es más angosto que su alto (${Z} mm): posible inestabilidad.`);
    }
    if (total > 2440) {
      warnings.push(`Largueros de ${w} mm: superan el tablero estándar de 2440 mm y requerirán empalme en obra.`);
    }
    pieces.push(mk('glb-zocalo-frente', 'Zocalo marco frente', w));
    pieces.push(mk('glb-zocalo-trasero', 'Zocalo marco trasero', w));
    pieces.push(mk('glb-zocalo-costado-izq', 'Lateral zocalo izquierdo', depthPiece));
    pieces.push(mk('glb-zocalo-costado-der', 'Lateral zocalo derecho', depthPiece));
    (drawerModules || []).forEach((m, i) => {
      const mw = Math.round((Number(m.ancho) || 0) - 2 * e);
      if (mw <= 0) return;
      pieces.push(mk(`glb-zocalo-divpar-${i + 1}`, `Division zocalo paralela frente M${m.moduloId}`, mw, true));
    });
    return { ok: true, pieces, warnings };
  }

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

// Frente del zócalo único (mode 'unico'), o null si no existe.
export function plinthSingleFrente(pieces) {
  return (pieces || []).find((p) => String(p.id) === 'glb-zocalo-frente') || null;
}

// True si hay zócalo estructural a marco (único o segmentado).
export function hasPlinthFrame(pieces) {
  return plinthLayoutFromPieces(pieces).length > 0 || Boolean(plinthSingleFrente(pieces));
}

// Alto Z del marco (frente único o el primer frente segmentado).
export function marcoZocaloHeight(pieces) {
  const f = plinthSingleFrente(pieces)
    || (pieces || []).find((p) => /^glb-zocalo-s\d+-frente$/.test(String(p.id)));
  return Number(f?.alto) || 0;
}

// Layout de las divisiones paralelas al frente (ids `glb-zocalo-divpar-{k}`,
// una por módulo con cajones/zapateras). Posiciones derivadas acumulando
// ancho + 2*espesor en orden de id (sobrevive el CSV de las versiones).
export function divparLayoutFromPieces(pieces) {
  const divpars = (pieces || [])
    .filter((p) => /^glb-zocalo-divpar-\d+$/.test(String(p.id)))
    .sort((a, b) => Number(a.id.match(/-(\d+)$/)[1]) - Number(b.id.match(/-(\d+)$/)[1]));
  const layout = [];
  let x0 = 0;
  for (const d of divpars) {
    const e = Number(d.espesor) || 15;
    const width = (Number(d.ancho) || 0) + 2 * e;
    if (width <= 0) continue;
    layout.push({ x0, width });
    x0 += width;
  }
  return layout;
}

// Ancho total cubierto por el marco (segmentado: Σ segmentos; único:
// ancho del frente + 2*espesor). 0 si no hay marco.
export function plinthTotalWidth(pieces) {
  const layout = plinthLayoutFromPieces(pieces);
  if (layout.length) return layout.reduce((s, g) => s + g.width, 0);
  const single = plinthSingleFrente(pieces);
  if (!single) return 0;
  return (Number(single.ancho) || 0) + 2 * (Number(single.espesor) || 15);
}

// Módulos raíz que contienen cajones o zapateras (frentes identificables),
// con su ancho de casco. Alimenta las divisiones paralelas al frente.
export function modulosConCajones(pieces) {
  const conCajones = new Set();
  for (const p of pieces || []) {
    // Los frentes de submódulo viven en su propio módulo ('m1cajon1' →
    // modulo '11'): el módulo raíz sale del prefijo del id, no de `modulo`.
    const m = String(p.id || '').match(/^m(\d+)(cajon|zapatera)\d*-frente$/);
    if (m) conCajones.add(m[1]);
  }
  return rootModuleDims(pieces)
    .filter((d) => conCajones.has(d.id))
    .map((d) => ({ moduloId: d.id, ancho: d.ancho }));
}

// Niveladores ocultos totales del marco: 2 por sub-zócalo (4 si supera
// 600 mm) en modo segmentado; 2 por cada 600 mm de ancho en modo único.
export function plinthLevelerCount(pieces) {
  const layout = plinthLayoutFromPieces(pieces);
  if (layout.length) return totalLevelers(layout);
  const total = plinthTotalWidth(pieces);
  if (!total) return 0;
  return 2 * Math.ceil(total / PLINTH_MAX_LEVELER_SPAN);
}

// True si el marco ya no coincide con los módulos (el usuario editó anchos
// o agregó/eliminó módulos tras generarlo): hay que regenerarlo.
export function marcoDesactualizado(pieces) {
  const totalMarco = plinthTotalWidth(pieces);
  if (!totalMarco) return false;
  const totalModulos = rootModuleDims(pieces).reduce((s, d) => s + (d.ancho || 0), 0);
  return totalModulos > 0 && Math.abs(totalMarco - totalModulos) > 2;
}

// Niveladores ocultos por sub-zócalo: 2, o 4 si el segmento supera 600 mm.
export function levelerCountForSegment(segWidth) {
  return segWidth > PLINTH_MAX_LEVELER_SPAN ? 4 : 2;
}

export function totalLevelers(layout) {
  return (layout || []).reduce((n, seg) => n + levelerCountForSegment(seg.width), 0);
}

// Plan de ensamble del zócalo a marco para el manual: orden de armado,
// uniones entre sub-zócalos (modo segmentado), divisiones paralelas al
// frente bajo módulos de cajón (modo único), niveladores y (si hay datos
// de obra) la verificación de levantamiento en vertical. Null si no hay
// marco. Puro: sin DOM.
export function plinthAssemblyPlan(pieces, { hTecho = 0, margenSeg = 20 } = {}) {
  const layout = plinthLayoutFromPieces(pieces);
  const single = plinthSingleFrente(pieces);
  if (!layout.length && !single) return null;
  const altoZocalo = marcoZocaloHeight(pieces);
  const levantamiento = Number(hTecho) > 0
    ? computeLiftCheck({
      altoModulo: Math.max(0, ...rootModuleDims(pieces).map((d) => d.alto || 0)),
      altoZocalo,
      profundidad: Math.max(0, ...rootModuleDims(pieces).map((d) => d.profundidad || 0)),
      hTecho: Number(hTecho),
      margenSeg: Number(margenSeg) || 20,
    })
    : null;
  if (single) {
    return {
      mode: 'unico',
      ancho: plinthTotalWidth(pieces),
      divparCount: divparLayoutFromPieces(pieces).length,
      niveladores: plinthLevelerCount(pieces),
      altoZocalo,
      levantamiento,
    };
  }
  const segments = layout.map((seg) => ({ ...seg, niveladores: levelerCountForSegment(seg.width) }));
  const uniones = [];
  for (let i = 1; i < layout.length; i += 1) {
    uniones.push({ x: layout[i].x0, entre: [layout[i - 1].index, layout[i].index] });
  }
  return { mode: 'segmentado', segments, uniones, niveladores: totalLevelers(layout), altoZocalo, levantamiento };
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
