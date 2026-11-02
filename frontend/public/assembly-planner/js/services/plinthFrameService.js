// js/services/plinthFrameService.js — Zócalo estructural a marco (cajón de
// 4 lados, UNICO, del ancho total del mueble) para muebles que se arman
// en el piso y se levantan en vertical. Puro y testeable: sin DOM ni SVG.
//
// Modelo: el zócalo es UN solo cajón de ancho total (Σ módulos) con
// costados solo en los extremos; bajo cada módulo con cajones/zapateras
// lleva una división paralela al frente/trasero a mitad de la profundidad
// (apoya el medio de la base del cajón).
//
// Persistencia: las versiones se guardan como CSV (11 columnas), así que la
// forma se DERIVA de los ids + ancho + espesor (todo CSV-persistent).
// Convención de ids: `glb-zocalo-frente|trasero|costado-izq|costado-der` y
// `glb-zocalo-divpar-{k}`.

// Piezas del marco (zócalo único, tramos de empalme `-a/-b`, zócalos
// múltiples `s{k}-` y legacy). Usado para reemplazar/quitar el marco sin
// tocar otros globales.
export const MARCO_PIECE_RE = /^glb-zocalo(-s\d+)?-(frente|trasero|costado-izq|costado-der|montante-\d+|divisor-\d+|divpar-\d+)(-[ab])?$/;

export const PLINTH_DEFAULT_RECESS = 50;    // retraso típico del frente (mm)

// Ajuste de taller al aplicar el zócalo: el frente del CAJÓN que queda
// directo sobre el zócalo crece +30 mm y se centra en su vano (15 mm arriba
// y 15 mm abajo). SOLO frentes de cajón: los de zapatera NO se tocan.
export const PLINTH_DRAWER_FRONT_LIFT_MM = 30;
export const PLINTH_LEVELER_SPAN = 600;     // un par de niveladores cada 600 mm
export const PLINTH_BOARD_LENGTH = 2440;    // largo del tablero de melamina
export const PLINTH_MONTANTE_LUZ = 1000;    // luz a partir de la cual va montante

// Piezas de frente del marco en orden de tramo/zócalo (único, `s{k}` o
// tramos de empalme `a`/`b`). Base del layout derivado.
function frentePiecesSorted(pieces) {
  const abRank = (id) => (/-b$/.test(String(id)) ? 1 : 0);
  return (pieces || [])
    .filter((p) => /^glb-zocalo(-s\d+)?-frente(-[ab])?$/.test(String(p.id)))
    .sort((a, b) => {
      const sa = Number(String(a.id).match(/^glb-zocalo-s(\d+)-/)?.[1] || 0);
      const sb = Number(String(b.id).match(/^glb-zocalo-s(\d+)-/)?.[1] || 0);
      if (sa !== sb) return sa - sb;
      return abRank(a.id) - abRank(b.id);
    });
}

// Layout del marco como bandas [ {pieceId, x0, width} ] derivado de los
// frentes (ancho + 2*espesor por banda, acumulado en orden). Sobrevive el
// CSV de las versiones. [] con el patrón de catálogo (sin frente propio).
export function plinthLayoutFromPieces(pieces) {
  const layout = [];
  let x0 = 0;
  for (const f of frentePiecesSorted(pieces)) {
    const e = Number(f.espesor) || 15;
    // Tramo de empalme (`-a/-b`): toca un costado solo en un extremo.
    const ab = /-[ab]$/.test(String(f.id));
    const width = (Number(f.ancho) || 0) + (ab ? e : 2 * e);
    if (width <= 0) continue;
    layout.push({ pieceId: String(f.id), x0, width });
    x0 += width;
  }
  return layout;
}

// Dimensiones de los módulos raíz ordenados. Ancho desde la tapa
// `m{id}-tapa` (fallback: base + 2*espesor), alto y profundidad desde el
// lateral `m{id}-lateral-izq`. Los ids anclados (`m\d+-pieza`) excluyen los
// submódulos (cajón/zapatera), cuyas piezas viven en su propio módulo.
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

// Frente del zócalo único simple, o null.
export function plinthSingleFrente(pieces) {
  return (pieces || []).find((p) => String(p.id) === 'glb-zocalo-frente') || null;
}

// True si hay zócalo estructural a marco (único, con empalme o múltiple).
export function hasPlinthFrame(pieces) {
  return frentePiecesSorted(pieces).length > 0;
}

// Alto Z del marco (del primer frente).
export function marcoZocaloHeight(pieces) {
  return Number(frentePiecesSorted(pieces)[0]?.alto) || 0;
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

// Ancho total cubierto por el marco (Σ bandas). 0 si no hay marco.
export function plinthTotalWidth(pieces) {
  return plinthLayoutFromPieces(pieces).reduce((s, b) => s + b.width, 0);
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

// Niveladores ocultos: un par cada 600 mm de luz, por banda del marco.
export function plinthLevelerCount(pieces) {
  const layout = plinthLayoutFromPieces(pieces);
  if (!layout.length) return 0;
  return layout.reduce((n, b) => n + 2 * Math.ceil(b.width / PLINTH_LEVELER_SPAN), 0);
}

// True si el marco ya no coincide con los módulos o con las reglas
// estructurales vigentes (el usuario editó módulos, o el marco fue generado
// antes de una regla nueva — p. ej. falta el montante en una luz > 1000):
// hay que regenerarlo.
export function marcoDesactualizado(pieces) {
  const layout = plinthLayoutFromPieces(pieces);
  if (!layout.length) return false;
  const totalModulos = rootModuleDims(pieces).reduce((s, d) => s + (d.ancho || 0), 0);
  if (totalModulos > 0 && Math.abs(plinthTotalWidth(pieces) - totalModulos) > 2) return true;
  // Reglas estructurales: toda luz > PLINTH_MONTANTE_LUZ necesita montante(s).
  return layout.some((band, i) => {
    const esperados = band.width > PLINTH_MONTANTE_LUZ ? Math.max(1, Math.ceil(band.width / PLINTH_MONTANTE_LUZ) - 1) : 0;
    const actuales = (pieces || []).filter((p) => new RegExp(`^glb-zocalo(-s${i + 1})?-montante-`).test(String(p.id))).length;
    return actuales < esperados;
  });
}

// Plan de ensamble del zócalo para el manual: orden de armado por banda
// (zócalos múltiples o tramos de empalme), montantes, uniones entre
// zócalos, niveladores y (si hay datos de obra) la verificación de
// levantamiento en vertical. Null si no hay marco. Puro: sin DOM.
export function plinthAssemblyPlan(pieces, { hTecho = 0, margenSeg = 20 } = {}) {
  const layout = plinthLayoutFromPieces(pieces);
  if (!layout.length) return null;
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
  const segments = layout.map((b, i) => ({
    index: i + 1,
    x0: b.x0,
    width: b.width,
    niveladores: 2 * Math.ceil(b.width / PLINTH_LEVELER_SPAN),
    montantes: (pieces || []).filter((p) => new RegExp(`^glb-zocalo(-s${i + 1})?-montante-`).test(String(p.id))).length,
  }));
  // Empalme: tramos -a/-b del mismo cajón (nZocalos = 1 partido por tablero).
  const empalme = layout.length === 2 && /-[ab]$/.test(layout[0].pieceId)
    ? { x: layout[1].x0 }
    : null;
  // Uniones solo entre zócalos independientes (no entre tramos de empalme).
  const uniones = [];
  if (!empalme) {
    for (let i = 1; i < layout.length; i += 1) {
      uniones.push({ x: layout[i].x0, entre: [i, i + 1] });
    }
  }
  return {
    ancho: plinthTotalWidth(pieces),
    segments,
    uniones,
    empalme,
    divparCount: divparLayoutFromPieces(pieces).length,
    niveladores: plinthLevelerCount(pieces),
    altoZocalo,
    levantamiento,
  };
}

// ── Form paramétrico del zócalo ────────────────────────────────────
// El zócalo se DEFINE con su forma exterior (ancho × profundidad × alto Z,
// espesor) y las piezas de corte se derivan de ahí. Estas dos funciones son
// la única frontera donde viven las restas/sumas de espesor:
// buildPlinthFrame (generar) y plinthFrameSpec (reconstruir el form desde
// las piezas persistidas). Ningún consumidor hace aritmética de espesor por
// su cuenta.

// Forma definida del zócalo derivada de las piezas (CSV-safe). Null si no
// hay marco. Las restas inversas viven SOLO aquí: los demás módulos leen el
// form ya resuelto.
export function plinthFrameSpec(pieces) {
  if (!hasPlinthFrame(pieces)) return null;
  const frente = frentePiecesSorted(pieces)[0];
  const e = Number(frente.espesor) || 15;
  const costado = (pieces || []).find((p) => /glb-zocalo(-s\d+)?-costado-izq$/.test(String(p.id)));
  const profundidad = costado ? (Number(costado.ancho) || 0) + 2 * e : 0;
  const layout = plinthLayoutFromPieces(pieces);
  return {
    ancho: plinthTotalWidth(pieces),
    profundidad,
    altoZocalo: marcoZocaloHeight(pieces),
    espesor: e,
    nZocalos: layout.length,
    luzMax: Math.max(0, ...layout.map((b) => b.width)),
  };
}

// División simétrica de `total` en `n` partes: base pareja y el remanente
// de redondeo lo absorben los segmentos centrales (extremos iguales).
export function symmetricSplit(total, n) {
  const base = Math.floor(total / n);
  let rem = total - base * n;
  const parts = new Array(n).fill(base);
  const order = [Math.floor(n / 2)];
  for (let d = 1; d < n && rem > 0; d += 1) {
    order.push(Math.floor(n / 2) - d, Math.floor(n / 2) + d);
  }
  for (const idx of order) {
    if (rem <= 0) break;
    if (idx >= 0 && idx < n) { parts[idx] += 1; rem -= 1; }
  }
  return parts;
}

// Punto de entrada único para generar el zócalo. El caller solo aporta las
// dimensiones de la FORMA (anchos de módulo, profundidad, alto Z, espesor) y
// cuántos zócalos quiere; la segmentación, el empalme por tablero, los
// montantes y las restas de corte se resuelven dentro. Devuelve
// { ok, pieces, spec, warnings }.
//
// Reglas estructurales (taller):
// - nZocalos = 1 y ancho <= 2440: un solo cajón (ids glb-zocalo-*).
// - nZocalos = 1 y ancho > 2440: MISMO cajón, pero frente/trasero partidos
//   en 2 tramos (ids *-frente-a / -b) con empalme en la junta de módulo
//   más cercana al centro.
// - nZocalos > 1: N cajones completos y simétricos (ids glb-zocalo-s{k}-*),
//   unidos en obra con tornillos cada 150 mm atravesando los costados
//   enfrentados.
// - Cualquier luz > PLINTH_MONTANTE_LUZ lleva montante(s) interior(es)
//   vertical(es) entre frente y trasero (refuerzo anti-flecha/racking).
export function buildPlinthFrame({ moduleWidths, profundidad, altoZocalo, espesor = 18, color = '#C19A6B', drawerModules = [], nZocalos = 1 }) {
  const errors = [];
  if (!Array.isArray(moduleWidths) || !moduleWidths.length) errors.push('Se necesita al menos un módulo (moduleWidths)');
  if (!Number.isFinite(profundidad) || profundidad <= 0) errors.push('profundidad inválida');
  if (!Number.isFinite(altoZocalo) || altoZocalo <= 0) errors.push('altoZocalo inválido');
  if (errors.length) return { ok: false, errors };

  const e = espesor;
  const total = moduleWidths.reduce((s, w) => s + w, 0);
  const Z = Math.round(altoZocalo);
  const depthPiece = Math.round(profundidad - 2 * e);
  const warnings = [];
  const n = Math.max(1, Math.min(8, Math.round(Number(nZocalos)) || 1));

  // Spans (banda exterior de cada zócalo/tramo): [{x0, width, key}]
  let spans;
  if (n === 1) {
    if (total <= PLINTH_BOARD_LENGTH) {
      spans = [{ x0: 0, width: total, key: 'glb-zocalo' }];
    } else {
      // Empalme: junta de módulo más cercana al centro.
      const target = total / 2;
      let split = total;
      let acum = 0;
      for (const w of moduleWidths) {
        acum += w;
        if (Math.abs(acum - target) < Math.abs(split - target)) split = acum;
      }
      spans = [
        { x0: 0, width: split, key: 'glb-zocalo', ab: 'a' },
        { x0: split, width: total - split, key: 'glb-zocalo', ab: 'b' },
      ];
      warnings.push(`Largueros partidos en x=${split} mm (junta de módulo): empalmar con tarugos Ø8 + cola, a escuadra.`);
    }
  } else {
    const parts = symmetricSplit(total, n);
    let x0 = 0;
    spans = parts.map((width, i) => {
      const span = { x0, width, key: `glb-zocalo-s${i + 1}` };
      x0 += width;
      return span;
    });
  }

  const mk = (id, nombre, ancho, rotate = false) => ({
    id, nombre, ancho, alto: Z, cantidad: 1, rotate,
    color, espesor: e, cantos: 'T,B,L,R', modulo: 'estructura', pos_z: 0,
  });

  const pieces = [];
  spans.forEach((span, i) => {
    const suf = span.ab ? `-${span.ab}` : '';
    const label = span.ab ? ` tramo ${span.ab.toUpperCase()}` : (n > 1 ? ` S${i + 1}` : '');
    // Larguero: entre costados (−2e) por banda completa; en el empalme el
    // tramo interno va del costado/extremo a la junta (−e).
    const larg = span.ab
      ? Math.round(span.width - e)
      : Math.round(span.width - 2 * e);
    pieces.push(mk(`${span.key}-frente${suf}`, `Zocalo marco${label} frente`, larg));
    pieces.push(mk(`${span.key}-trasero${suf}`, `Zocalo marco${label} trasero`, larg));
    // Costados de cada banda (en el empalme solo los extremos del cajón).
    if (!span.ab || span.ab === 'a') {
      pieces.push(mk(`${span.key}-costado-izq`, `Lateral zocalo${label} izquierdo`, depthPiece));
    }
    if (!span.ab || span.ab === 'b') {
      pieces.push(mk(`${span.key}-costado-der`, `Lateral zocalo${label} derecho`, depthPiece));
    }
    // Montantes interiores: 1 por cada 1000 mm de luz iniciado. El id lleva
    // el índice de span (s{i+1}) también en el empalme, para que el renderer
    // y la detección de desactualizado los asocien a su banda.
    const nMont = span.width > PLINTH_MONTANTE_LUZ ? Math.max(1, Math.ceil(span.width / PLINTH_MONTANTE_LUZ) - 1) : 0;
    const monKey = span.ab ? `glb-zocalo-s${i + 1}` : span.key;
    for (let j = 1; j <= nMont; j += 1) {
      pieces.push(mk(`${monKey}-montante-${j}`, `Montante zocalo${label} ${j}`, depthPiece));
    }
    if (larg > PLINTH_BOARD_LENGTH) {
      warnings.push(`Larguero de ${larg} mm (zócalo ${i + 1}) supera el tablero de ${PLINTH_BOARD_LENGTH} mm: partirlo en obra o aumentar la cantidad de zócalos.`);
    }
  });

  // Divisiones paralelas al frente bajo módulos de cajón (van entre costados
  // interiores: −2e del módulo; no dependen de la división en zócalos).
  (drawerModules || []).forEach((m, i) => {
    const mw = Math.round((Number(m.ancho) || 0) - 2 * e);
    if (mw <= 0) return;
    pieces.push(mk(`glb-zocalo-divpar-${i + 1}`, `Division zocalo paralela frente M${m.moduloId}`, mw, true));
  });

  if (total < Z) {
    warnings.push(`Zócalo (${total} mm) es más angosto que su alto (${Z} mm): posible inestabilidad.`);
  }
  const luzMax = Math.max(0, ...spans.map((s2) => s2.width));
  return {
    ok: true,
    pieces,
    warnings,
    spec: { ancho: total, profundidad, altoZocalo, espesor, nZocalos: spans.length, luzMax },
  };
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
