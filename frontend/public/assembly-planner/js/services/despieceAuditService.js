// js/services/despieceAuditService.js — Auditoría estricta de despiece
// (reglas de control del taller). Lógica pura, sin DOM ni SVG; testeable con
// node --test. Consume la lista de piezas del mueble y reporta tres familias
// de controles sobre módulos con sistema gola (y la veta en todo el mueble):
//
//   1) Luz libre del canal de la mano: entre dos frentes consecutivos la
//      luz (pos_z del superior − techo del inferior) debe ser ≥ 40 mm; si
//      no, ERROR CRÍTICO DE BLOQUEO con los mm a restar de los frentes.
//   2) Sentido de veta (rotate) por función de la pieza: frentes y golas
//      rotate 'no' (obligatorio, continuidad estética horizontal); laterales,
//      caras y fondos rotate 'no' (recomendado); bases rotate libre (el
//      optimizador SÍ puede rotarlas para ahorrar material).
//   3) Colisión gola: la estructura interna de la caja (laterales/caras)
//      debe quedar al menos 60 mm por debajo del frente; si no, ERROR DE
//      COLISIÓN (el cajón choca la gola al cerrar) con los mm de déficit.

import { inferRole } from './classifierService.js';
import { rootModuleIds } from './closetBuilderService.js';

export const LUZ_MIN_MANO_MM = 40;
export const COLISION_GOLA_MIN_MM = 60;

const mm1 = (v) => Math.round(Number(v) * 10) / 10;

// Módulo RAÍZ de una pieza: los frentes viven en submódulos ('11', '1.2') y
// las tiras gola en el módulo raíz ('1'). Resuelve contra los módulos que
// existen en el mueble: '11' → '1' cuando '1' existe; si no hay '1', '11' es
// raíz (misma convención que golaService.perteneceAModulo).
function raizDePieza(pieces, modulo) {
  const m = String(modulo || '').trim();
  const roots = new Set(rootModuleIds(pieces || []));
  if (roots.has(m)) return m;
  const numerica = m.match(/^(\d+)/);
  if (numerica) {
    for (let i = numerica[1].length - 1; i >= 1; i -= 1) {
      const pref = numerica[1].slice(0, i);
      if (roots.has(pref)) return pref;
    }
  }
  return m;
}

// Frentes (rol drawer_face) con pos_z anclado, agrupados por módulo raíz y
// ordenados de abajo arriba.
function frentesPorRaiz(pieces) {
  const porRaiz = new Map();
  for (const p of pieces || []) {
    if (inferRole(p) !== 'drawer_face') continue;
    if (!Number.isFinite(Number(p.pos_z))) continue;
    const raiz = raizDePieza(pieces, p.modulo);
    if (!porRaiz.has(raiz)) porRaiz.set(raiz, []);
    porRaiz.get(raiz).push(p);
  }
  for (const [raiz, fs] of porRaiz) {
    porRaiz.set(raiz, fs.sort((a, b) => (Number(a.pos_z) || 0) - (Number(b.pos_z) || 0)));
  }
  return porRaiz;
}

// Módulos raíz con sistema gola aplicado (al menos una pieza rol gola_strip).
function raicesConGola(pieces) {
  const raices = new Set();
  for (const p of pieces || []) {
    if (inferRole(p) === 'gola_strip') raices.add(raizDePieza(pieces, p.modulo));
  }
  return raices;
}

// Bandeja de borde uniforme (CSV legacy): la cara mide lo mismo que el
// frente; su "caja" es un borde, no una cara interna — se exime del
// control de colisión (mismo testigo que golaService.drawerUnits).
function esBandejaUniforme(pieces, frente) {
  const sub = String(frente.modulo || '');
  const altoFrente = Number(frente.alto) || 0;
  return (pieces || []).some((c) =>
    String(c.modulo || '') === sub
    && inferRole(c) === 'drawer_part'
    && Math.abs((Number(c.alto) || 0) - altoFrente) <= 0.5);
}

/**
 * 1) Luz libre del canal de la mano (módulos con gola).
 *
 * @returns {Array<{modulo, inferiorId, inferiorNombre, superiorId, luzMm,
 *   deficitMm, mensaje, correccion}>} una fila por par de frentes con luz
 *   insuficiente ([] si todo ok o no hay gola).
 */
export function auditarLuzLibreGola(pieces, { luzMinMm = LUZ_MIN_MANO_MM } = {}) {
  const gola = raicesConGola(pieces);
  if (!gola.size) return [];
  const filas = [];
  for (const [raiz, frentes] of frentesPorRaiz(pieces)) {
    if (!gola.has(raiz) || frentes.length < 2) continue;
    for (let i = 1; i < frentes.length; i++) {
      const inferior = frentes[i - 1];
      const superior = frentes[i];
      const techoInf = (Number(inferior.pos_z) || 0) + (Number(inferior.alto) || 0);
      const luz = mm1((Number(superior.pos_z) || 0) - techoInf);
      if (luz >= luzMinMm - 0.5) continue;
      const deficit = mm1(luzMinMm - luz);
      const porFrente = Math.ceil((deficit / 2) * 10) / 10;
      filas.push({
        modulo: raiz,
        inferiorId: String(inferior.id),
        inferiorNombre: String(inferior.nombre || inferior.id),
        superiorId: String(superior.id),
        luzMm: luz,
        deficitMm: deficit,
        mensaje: `ERROR CRÍTICO DE BLOQUEO — Módulo ${raiz}: la luz libre entre "${inferior.nombre || inferior.id}" y el frente superior es de ${luz} mm (< ${luzMinMm} mm): los frentes están muy altos y obstruyen el canal de la mano.`,
        correccion: `Restar ${deficit} mm al alto de los frentes (p. ej. ${porFrente} mm a cada uno de los dos frentes adyacentes) para dejar la luz libre de ${luzMinMm} mm.`,
      });
    }
  }
  return filas;
}

// Roles de veta estricta: nivel 'error' = obligatorio (continuidad estética
// frontal), 'warning' = recomendado (interior), 'info' = rotate libre.
const VETA_POR_ROL = {
  drawer_face: { nivel: 'error', etiqueta: 'Frente', motivo: 'la veta debe correr estrictamente horizontal a lo largo del ancho para que coincida visualmente en todo el frente del mueble' },
  door: { nivel: 'error', etiqueta: 'Puerta', motivo: 'la veta debe correr horizontal a lo largo del ancho del frente' },
  front_panel: { nivel: 'error', etiqueta: 'Frente', motivo: 'la veta debe correr horizontal a lo largo del ancho del frente' },
  gola_strip: { nivel: 'error', etiqueta: 'Gola', motivo: 'al ser pieza frontal visible en el fondo del canal, su veta debe correr horizontal a lo largo de su ancho, igual que los frentes' },
  drawer_side: { nivel: 'warning', etiqueta: 'Lateral', motivo: 'la veta interna debe correr a lo largo de la profundidad para que, al abrir el cajón, la madera se vea natural de adelante hacia atrás' },
  drawer_part: { nivel: 'warning', etiqueta: 'Cara', motivo: 'la veta debe correr horizontal a lo largo de su ancho' },
  drawer_back: { nivel: 'warning', etiqueta: 'Fondo', motivo: 'la veta debe correr horizontal a lo largo de su ancho' },
};
const ROL_VETA_INFO = 'drawer_bottom'; // bases: rotate libre (ahorro de material)

/**
 * 2) Auditoría estricta del sentido de veta (rotate) por función.
 *
 * @returns {{incumplimientos: Array, basesLibres: Array}}
 *   incumplimientos: filas {id, nombre, rol, etiqueta, nivel: 'error'|
 *   'warning', ancho, alto, mensaje} de piezas con rotate cuando la regla
 *   pide 'no'. basesLibres: una fila informativa por módulo con bases de
 *   cajón (rotate permitido; el optimizador puede rotar para ahorrar).
 */
export function auditarVeta(pieces) {
  const incumplimientos = [];
  const basesPorRaiz = new Map();
  for (const p of pieces || []) {
    const rol = inferRole(p);
    if (rol === ROL_VETA_INFO) {
      const raiz = raizDePieza(pieces, p.modulo);
      if (!basesPorRaiz.has(raiz)) basesPorRaiz.set(raiz, []);
      basesPorRaiz.get(raiz).push(p);
      continue;
    }
    const regla = VETA_POR_ROL[rol];
    if (!regla) continue;
    // rotate: el shape del store lo normaliza a booleano (piece() del
    // builder); desde CSV puede llegar como booleano o 'si'/'no'.
    const rotate = p.rotate === true || p.rotate === 'si' || p.rotate === 'sí';
    if (!rotate) continue;
    incumplimientos.push({
      id: String(p.id),
      nombre: String(p.nombre || p.id),
      rol,
      etiqueta: regla.etiqueta,
      nivel: regla.nivel,
      ancho: Number(p.ancho) || 0,
      alto: Number(p.alto) || 0,
      mensaje: `${regla.etiqueta} "${p.nombre || p.id}" (M${raizDePieza(pieces, p.modulo)}): rotate 'si' — ${regla.motivo}.`,
    });
  }
  const basesLibres = [...basesPorRaiz.entries()].map(([raiz, bases]) => ({
    modulo: raiz,
    cantidad: bases.length,
    ids: bases.map((b) => String(b.id)),
    mensaje: `Bases de cajón M${raiz} (×${bases.length}): rotate libre permitido — al ir ocultas horizontalmente en el piso del cajón el sentido de la veta no importa; aquí el optimizador SÍ puede rotar la pieza para ahorrar material.`,
  }));
  return { incumplimientos, basesLibres };
}

/**
 * 3) Verificación de estructura interna: la caja debe quedar al menos
 * minMm por debajo del frente (colisión con la gola al cerrar).
 *
 * @returns {Array<{modulo, frenteId, frenteNombre, frenteMm, cajaMm,
 *   holguraMm, deficitMm, mensaje, correccion}>} una fila por cajón en
 *   módulos con gola cuya holgura sea insuficiente ([] si todo ok).
 */
export function auditarColisionGola(pieces, { minMm = COLISION_GOLA_MIN_MM } = {}) {
  const gola = raicesConGola(pieces);
  if (!gola.size) return [];
  const filas = [];
  const porSub = new Map();
  for (const p of pieces || []) {
    if (!gola.has(raizDePieza(pieces, p.modulo))) continue;
    const sub = String(p.modulo || '');
    if (!porSub.has(sub)) porSub.set(sub, { frentes: [], caja: [] });
    const bucket = porSub.get(sub);
    const rol = inferRole(p);
    if (rol === 'drawer_face') bucket.frentes.push(p);
    else if (['drawer_side', 'drawer_back', 'drawer_part'].includes(rol)) bucket.caja.push(p);
  }
  for (const [sub, bucket] of porSub) {
    if (!bucket.frentes.length || !bucket.caja.length) continue;
    const frente = bucket.frentes.reduce((a, b) => ((Number(a.alto) || 0) >= (Number(b.alto) || 0) ? a : b));
    if (esBandejaUniforme(pieces, frente)) continue; // bandeja uniforme (legacy): borde, no caja
    const frenteMm = Number(frente.alto) || 0;
    const cajaMm = Math.max(...bucket.caja.map((p) => Number(p.alto) || 0));
    const holgura = mm1(frenteMm - cajaMm);
    if (holgura >= minMm - 0.5) continue;
    const deficit = mm1(minMm - holgura);
    filas.push({
      modulo: raizDePieza(pieces, sub),
      submodulo: sub,
      frenteId: String(frente.id),
      frenteNombre: String(frente.nombre || frente.id),
      frenteMm,
      cajaMm,
      holguraMm: holgura,
      deficitMm: deficit,
      mensaje: `ERROR DE COLISIÓN — Módulo ${raizDePieza(pieces, sub)} ("${frente.nombre || frente.id}"): la caja interna (${cajaMm} mm) queda solo ${holgura} mm por debajo del frente (${frenteMm} mm) (< ${minMm} mm): el cajón chocará contra la gola al intentar cerrar.`,
      correccion: `Rebajar la estructura interna ${deficit} mm (o aumentar el alto del frente en esa medida) para dejar la holgura mínima de ${minMm} mm.`,
    });
  }
  return filas;
}
