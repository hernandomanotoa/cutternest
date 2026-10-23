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

// Piezas del marco (forma actual `glb-zocalo-*` y legacy segmentado
// `glb-zocalo-s{k}-*`, para limpiar versiones viejas). Usado para
// reemplazar/quitar el marco sin tocar otros globales.
export const MARCO_PIECE_RE = /^glb-zocalo(-s\d+)?-(frente|trasero|costado-izq|costado-der|divisor-\d+|divpar-\d+)$/;

export const PLINTH_DEFAULT_RECESS = 50;    // retraso típico del frente (mm)
export const PLINTH_LEVELER_SPAN = 600;     // un par de niveladores cada 600 mm

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

// Frente del zócalo, o null si no existe.
export function plinthSingleFrente(pieces) {
  return (pieces || []).find((p) => String(p.id) === 'glb-zocalo-frente') || null;
}

// True si hay zócalo estructural a marco.
export function hasPlinthFrame(pieces) {
  return Boolean(plinthSingleFrente(pieces));
}

// Alto Z del marco.
export function marcoZocaloHeight(pieces) {
  return Number(plinthSingleFrente(pieces)?.alto) || 0;
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

// Ancho total cubierto por el marco (ancho del frente + 2*espesor). 0 si no
// hay marco.
export function plinthTotalWidth(pieces) {
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

// Niveladores ocultos: un par cada 600 mm de ancho del marco.
export function plinthLevelerCount(pieces) {
  const total = plinthTotalWidth(pieces);
  if (!total) return 0;
  return 2 * Math.ceil(total / PLINTH_LEVELER_SPAN);
}

// True si el marco ya no coincide con los módulos (el usuario editó anchos
// o agregó/eliminó módulos tras generarlo): hay que regenerarlo.
export function marcoDesactualizado(pieces) {
  const totalMarco = plinthTotalWidth(pieces);
  if (!totalMarco) return false;
  const totalModulos = rootModuleDims(pieces).reduce((s, d) => s + (d.ancho || 0), 0);
  return totalModulos > 0 && Math.abs(totalMarco - totalModulos) > 2;
}

// Plan de ensamble del zócalo para el manual: orden de armado, divisiones
// paralelas al frente, niveladores y (si hay datos de obra) la verificación
// de levantamiento en vertical. Null si no hay marco. Puro: sin DOM.
export function plinthAssemblyPlan(pieces, { hTecho = 0, margenSeg = 20 } = {}) {
  const single = plinthSingleFrente(pieces);
  if (!single) return null;
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
  return {
    ancho: plinthTotalWidth(pieces),
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
  const single = plinthSingleFrente(pieces);
  if (!single) return null;
  const e = Number(single.espesor) || 15;
  const costado = (pieces || []).find((p) => /glb-zocalo-costado-izq$/.test(String(p.id)));
  const profundidad = costado ? (Number(costado.ancho) || 0) + 2 * e : 0;
  return {
    ancho: plinthTotalWidth(pieces),
    profundidad,
    altoZocalo: marcoZocaloHeight(pieces),
    espesor: e,
  };
}

// Punto de entrada único para generar el zócalo. El caller solo aporta las
// dimensiones de la FORMA (anchos de módulo, profundidad, alto Z, espesor);
// las restas de corte se resuelven dentro. Devuelve { ok, pieces, spec, warnings }.
export function buildPlinthFrame({ moduleWidths, profundidad, altoZocalo, espesor = 18, color = '#C19A6B', drawerModules = [] }) {
  const errors = [];
  if (!Array.isArray(moduleWidths) || !moduleWidths.length) errors.push('Se necesita al menos un módulo (moduleWidths)');
  if (!Number.isFinite(profundidad) || profundidad <= 0) errors.push('profundidad inválida');
  if (!Number.isFinite(altoZocalo) || altoZocalo <= 0) errors.push('altoZocalo inválido');
  if (errors.length) return { ok: false, errors };

  const e = espesor;
  const total = moduleWidths.reduce((s, w) => s + w, 0);
  const Z = Math.round(altoZocalo);
  const depthPiece = Math.round(profundidad - 2 * e);
  const w = Math.round(total - 2 * e);
  const warnings = [];
  if (total < Z) {
    warnings.push(`Zócalo (${total} mm) es más angosto que su alto (${Z} mm): posible inestabilidad.`);
  }
  if (total > 2440) {
    warnings.push(`Largueros de ${w} mm: superan el tablero estándar de 2440 mm y requerirán empalme en obra.`);
  }

  const mk = (id, nombre, ancho, rotate = false) => ({
    id, nombre, ancho, alto: Z, cantidad: 1, rotate,
    color, espesor: e, cantos: 'T,B,L,R', modulo: 'estructura', pos_z: 0,
  });

  const pieces = [
    mk('glb-zocalo-frente', 'Zocalo marco frente', w),
    mk('glb-zocalo-trasero', 'Zocalo marco trasero', w),
    mk('glb-zocalo-costado-izq', 'Lateral zocalo izquierdo', depthPiece),
    mk('glb-zocalo-costado-der', 'Lateral zocalo derecho', depthPiece),
  ];
  (drawerModules || []).forEach((m, i) => {
    const mw = Math.round((Number(m.ancho) || 0) - 2 * e);
    if (mw <= 0) return;
    pieces.push(mk(`glb-zocalo-divpar-${i + 1}`, `Division zocalo paralela frente M${m.moduloId}`, mw, true));
  });
  return {
    ok: true,
    pieces,
    warnings,
    spec: { ancho: total, profundidad, altoZocalo, espesor },
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
