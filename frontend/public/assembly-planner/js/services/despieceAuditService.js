// js/services/despieceAuditService.js — Auditoría estricta de despiece
// (reglas de control del taller). Lógica pura, sin DOM ni SVG; testeable con
// node --test. Consume la lista de piezas del mueble y reporta tres familias
// de controles sobre módulos con sistema gola (y la veta en todo el mueble):
//
//   1) Luz libre del canal de la mano: entre dos frentes consecutivos la
//      luz (pos_z del superior − techo del inferior − LABIO de 30 mm que
//      cuelga del frente superior) debe ser ≥ 40 mm; si no, ERROR CRÍTICO
//      DE BLOQUEO con los mm a restar de los frentes.
//   2) Sentido de veta (rotate) por función de la pieza, derivado de la
//      tabla maestra cutOrientationService: piezas de VISTA (frentes,
//      puertas, repisas, tapas, golas, costados, divisores) con rotate 'no'
//      (obligatorio, continuidad estética) — nivel 'error' si rotan; piezas
//      OCULTAS/estructurales (bases, laterales internos, traseras, caras,
//      fondos, zócalos, amarres, barras) con rotate libre — fila informativa
//      por módulo y rol (el optimizador las rota para ahorrar material).
//   3) Colisión gola: la estructura interna de la caja (laterales/caras)
//      debe quedar al menos 60 mm por debajo del frente; si no, ERROR DE
//      COLISIÓN (el cajón choca la gola al cerrar) con los mm de déficit.

import { inferRole } from './classifierService.js';
import { rootModuleIds } from './closetBuilderService.js';
import { CLASE_VETA, VETA_POR_ROL } from './cutOrientationService.js';
import { GOLA_LABIO_MM, GOLA_DEFAULTS } from './golaService.js';

// Luz mínima del hueco de la mano: el dedo entra por el paso y necesita el
// hueco entre las alas (tras los frentes). Con el modelo actual (voladizo
// 30, alas de 15, paso 3) el hueco es 2·30 − 2·15 − 3 = 27 mm.
export const LUZ_MIN_MANO_MM = 25;
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
      // La gola tapa el espacio tras los frentes: la luz útil para la mano
      // es el hueco ENTRE las alas = (techoInf − oInf + paso + 15) ..
      // (pos_z_sup + oSup − 15), con o = (frente − cara)/2 por unidad.
      const paso = Number(GOLA_DEFAULTS.golaPaso) || 3;
      const overhangDe = (frente) => {
        const lat = (pieces || []).find((q) =>
          String(q.modulo || '') === String(frente.modulo || '') && inferRole(q) === 'drawer_side');
        const caja = lat ? Number(lat.alto) || 0 : 0;
        const f = Number(frente.alto) || 0;
        return caja > 0 ? Math.max(0, mm1((f - caja) / 2)) : (Number(GOLA_DEFAULTS.golaLabioMm) || GOLA_LABIO_MM);
      };
      const oInf = overhangDe(inferior);
      const oSup = overhangDe(superior);
      const desde = techoInf - oInf + paso + 15;
      const hasta = (Number(superior.pos_z) || 0) + oSup - 15;
      const luz = mm1(hasta - desde);
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
        mensaje: `ERROR CRÍTICO DE BLOQUEO — Módulo ${raiz}: el hueco de la mano entre las alas de la gola (tras "${inferior.nombre || inferior.id}") es de ${luz} mm (< ${luzMinMm} mm): el voladizo de los frentes es insuficiente y obstruye el agarre.`,
        correccion: `Aumentar el voladizo ${deficit} mm: rebajar la caja (laterales/cara/fondo, p. ej. ${porFrente} mm a cada unidad) o usar frentes más altos, hasta dejar el hueco de la mano ≥ ${luzMinMm} mm.`,
      });
    }
  }
  return filas;
}

// Etiquetas y motivos por rol para los mensajes de veta. Las reglas (qué rol
// es vista u oculta) viven en la tabla maestra cutOrientationService
// (VETA_POR_ROL); aquí solo el texto. Motivo según el lado de la veta en la
// orientación de mueble: 'ancho' = pieza horizontal, 'alto' = vertical.
const ETIQUETA_POR_ROL = {
  drawer_face: 'Frente',
  door: 'Puerta',
  front_panel: 'Frente',
  gola_strip: 'Gola',
  shelf: 'Repisa',
  top_panel: 'Tapa',
  drawer_divider: 'División',
  side_panel: 'Lateral',
  divider: 'Divisor',
};

const ETIQUETA_LIBRE_POR_ROL = {
  drawer_bottom: 'Bases de cajón',
  drawer_side: 'Laterales internos de cajón',
  drawer_back: 'Traseras de cajón',
  drawer_part: 'Caras de cajón',
  bottom_panel: 'Bases de módulo',
  back_panel: 'Fondos de módulo',
  plinth_side: 'Laterales de zócalo',
  plinth_divider: 'Divisiones de zócalo',
  brace: 'Amarres/refuerzos',
  hanger_rail: 'Barras',
  leg: 'Patas',
};

function motivoVeta(rol, ladoVeta) {
  if (rol === 'gola_strip') {
    return 'al ser pieza frontal visible en el fondo del canal, su veta debe correr horizontal a lo largo de su ancho, igual que los frentes';
  }
  if (ladoVeta === 'alto') {
    return 'la veta debe correr vertical a lo largo del alto, en continuidad con los costados del mueble';
  }
  return 'la veta debe correr estrictamente horizontal a lo largo del ancho para que coincida visualmente en todo el frente del mueble';
}

/**
 * 2) Auditoría estricta del sentido de veta (rotate) por función.
 *
 * @returns {{incumplimientos: Array, libres: Array}}
 *   incumplimientos: filas {id, nombre, rol, etiqueta, nivel: 'error',
 *   ancho, alto, mensaje} de piezas DE VISTA con rotate (la regla pide 'no').
 *   libres: una fila informativa por módulo y rol oculto
 *   {modulo, rol, etiqueta, cantidad, ids, mensaje}.
 */
export function auditarVeta(pieces) {
  const incumplimientos = [];
  const gruposLibres = new Map();
  for (const p of pieces || []) {
    const rol = inferRole(p);
    const regla = VETA_POR_ROL[rol];
    if (!regla) continue;
    const rotate = p.rotate === true || p.rotate === 'si' || p.rotate === 'sí';
    if (regla.clase === CLASE_VETA.OCULTA) {
      // Veta libre (pieza oculta): fila informativa agrupada por módulo+rol.
      const raiz = raizDePieza(pieces, p.modulo);
      const key = `${raiz}|${rol}`;
      if (!gruposLibres.has(key)) gruposLibres.set(key, { modulo: raiz, rol, piezas: [] });
      gruposLibres.get(key).piezas.push(p);
      continue;
    }
    if (!rotate) continue;
    incumplimientos.push({
      id: String(p.id),
      nombre: String(p.nombre || p.id),
      rol,
      etiqueta: ETIQUETA_POR_ROL[rol] || 'Pieza',
      ladoVeta: regla.ladoVeta,
      nivel: 'error',
      ancho: Number(p.ancho) || 0,
      alto: Number(p.alto) || 0,
      mensaje: `${ETIQUETA_POR_ROL[rol] || 'Pieza'} "${p.nombre || p.id}" (M${raizDePieza(pieces, p.modulo)}): rotate 'si' — ${motivoVeta(rol, regla.ladoVeta)}.`,
    });
  }
  const libres = [...gruposLibres.entries()].map(([, g]) => ({
    modulo: g.modulo,
    rol: g.rol,
    etiqueta: ETIQUETA_LIBRE_POR_ROL[g.rol] || 'Piezas ocultas',
    cantidad: g.piezas.length,
    ids: g.piezas.map((b) => String(b.id)),
    mensaje: `${ETIQUETA_LIBRE_POR_ROL[g.rol] || 'Piezas ocultas'} M${g.modulo} (×${g.piezas.length}): rotate libre permitido — al ir ocultas el sentido de la veta no importa; el optimizador SÍ puede rotarlas para ahorrar material.`,
  }));
  return { incumplimientos, libres };
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
