// js/services/cutOrientationService.js — Tabla maestra de clasificación de
// veta (sentido de la veta por función de la pieza). Fuente única de verdad
// del flag `rotate` y de la orientación de corte, consumida por el
// Constructor (closetBuilderService), el parser (migración legacy) y la
// auditoría de veta (despieceAuditService). Lógica pura: sin DOM, sin SVG
// ni estado global.
import { inferRole } from './classifierService.js';
//
// Convención del taller (spec CNC):
//   - Piezas de VISTA VERTICAL (costados, montantes, divisiones expuestas):
//     veta a lo largo del ALTO de la pieza; rotate 'no' (bloqueada).
//   - Piezas de VISTA HORIZONTAL (frentes, puertas, repisas abiertas, tapas,
//     golas): veta a lo largo del ANCHO de la pieza; rotate 'no'.
//   - Piezas OCULTAS/estructurales (bases, laterales internos de cajón,
//     traseras, caras, fondos, zócalos, amarres, refuerzos, barras):
//     rotate 'si' — el optimizador las rota libremente para ahorrar material.
//
// La veta de la PIEZA corre siempre a lo largo de su primera medida (`ancho`
// del CSV) cuando rotate es 'no'; el eje de veta del TABLERO se configura en
// el optimizador (Fase B) y no vive aquí.
//
// `ladoVeta` indica, en la orientación de MUEBLE de la pieza, por qué lado
// corre la veta: 'ancho' = pieza horizontal (sin swap), 'alto' = pieza
// vertical. El CSV es despiece: el Constructor emite con `proyectaCorte`
// (las de vista vertical van ancho=alto del mueble, alto=profundidad) y los
// consumidores de geometría proyectan de vuelta con `proyectaMueble`.
// `migraPiezasACorte` convierte CSV legacy (orientación de mueble) al
// importar. Las piezas ocultas tienen `ladoVeta: null` (libres, sin swap).

export const CLASE_VETA = {
  VISTA_VERTICAL: 'vista-vertical',
  VISTA_HORIZONTAL: 'vista-horizontal',
  OCULTA: 'oculta',
};

// Clasificación por rol (los roles son los de classifierService.inferRole;
// los que no aparecen aquí no tienen regla de veta — p. ej. 'panel' genérico).
export const VETA_POR_ROL = {
  // ── Vista horizontal: veta a lo largo del ancho, rotate bloqueado ──
  drawer_face: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B,L,R' },
  door: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B,L,R' },
  front_panel: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B,L,R' },
  gola_strip: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B' },
  shelf: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B' },
  top_panel: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B,L,R' },
  drawer_divider: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B,L,R' },

  // ── Vista vertical: veta a lo largo del alto, rotate bloqueado ──
  side_panel: { clase: CLASE_VETA.VISTA_VERTICAL, rotate: false, ladoVeta: 'alto' },
  divider: { clase: CLASE_VETA.VISTA_VERTICAL, rotate: false, ladoVeta: 'alto' },
  // Fondo del módulo: MISMA veta que los laterales (vertical, spec taller).
  back_panel: { clase: CLASE_VETA.VISTA_VERTICAL, rotate: false, ladoVeta: 'alto', cantos: '' },

  // ── Ocultas / estructurales: rotación libre (ahorro de material) ──
  drawer_bottom: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  drawer_side: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  drawer_back: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  drawer_part: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  bottom_panel: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  plinth_side: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  plinth_divider: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  brace: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  hanger_rail: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
  leg: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null, cantos: '' },
};

// Clasificación de una pieza a partir de su rol inferido; null si el rol no
// tiene regla (el caller decide el default).
export function clasificacionVeta(rol) {
  return VETA_POR_ROL[rol] || null;
}

// rotate (boolean) que debe emitir el Constructor para el rol; null si el rol
// no tiene regla (el caller mantiene su default explícito).
export function rotateDeRol(rol) {
  const c = clasificacionVeta(rol);
  return c ? c.rotate : null;
}

// Tapacantos por defecto del rol (guía del taller: solo caras visibles);
// el caller puede sobreescribirlo pieza a pieza. Null si el rol no tiene
// preset (p. ej. laterales, donde L/R dependen del lado).
export function cantosDeRol(rol) {
  const c = clasificacionVeta(rol);
  return c && 'cantos' in c ? c.cantos : null;
}

// Roles cuya veta es libre (rotate 'si' permitido sin observación): los de
// clase oculta. La auditoría los reporta como informativos, no incumplimiento.
export function rolesVetaLibre() {
  return Object.keys(VETA_POR_ROL).filter((r) => VETA_POR_ROL[r].clase === CLASE_VETA.OCULTA);
}

// true si en orientación de corte las columnas ancho/alto se invierten
// (piezas de vista vertical: costados, divisores de vano). Es la regla que
// aplica el Constructor al emitir y el proyector al leer.
export function swapEnCorte(rol) {
  const c = clasificacionVeta(rol);
  return !!c && c.ladoVeta === 'alto';
}

// Dimensiones en ORIENTACIÓN DE CORTE para el rol: el lado de la veta va en
// la primera medida (convención del taller y del CSV). Las piezas de vista
// vertical se invierten; el resto queda igual.
export function proyectaCorte(rol, ancho, alto) {
  return swapEnCorte(rol)
    ? { ancho: alto, alto: ancho }
    : { ancho, alto };
}

// Dimensiones en ORIENTACIÓN DE MUEBLE (la que usan renderer y servicios
// estructurales): inversa de proyectaCorte.
export function proyectaMueble(rol, ancho, alto) {
  return swapEnCorte(rol)
    ? { ancho: alto, alto: ancho }
    : { ancho, alto };
}

// Migra piezas en convención LEGACY (laterales/divisores en orientación de
// mueble: alto > ancho) a orientación de corte. Devuelve { pieces, migradas }
// con una entrada por pieza migrada {id, nombre, rol, ancho, alto} (las
// medidas NUEvas). Las piezas ya en corte (ancho ≥ alto) pasan igual; las
// ocultas y las de vista horizontal no se tocan. Idempotente. El punto de
// aplicación es csvParser.parseCSV: versiones locales y autoguardado se
// persisten como CSV y re-parsean al cargar, con lo que un solo punto cubre
// los diseños guardados.
export function migraPiezasACorte(pieces) {
  const resultado = [];
  const migradas = [];
  // Altura de cada módulo en corte = ANCHO almacenado de sus laterales.
  // Clave para decidir la orientación de fondos legacy sin ambigüedad
  // (un módulo bajo y ancho tiene el fondo de corte con alto > ancho).
  const altoModuloPorLateral = new Map();
  for (const p of pieces || []) {
    if (inferRole(p) !== 'side_panel') continue;
    const mod = String(p.modulo || '');
    altoModuloPorLateral.set(mod, Math.max(altoModuloPorLateral.get(mod) || 0, Number(p.ancho) || 0));
  }
  for (const p of pieces || []) {
    const rol = inferRole(p);
    if (!swapEnCorte(rol)) {
      resultado.push(p);
      continue;
    }
    const ancho = Number(p.ancho) || 0;
    const alto = Number(p.alto) || 0;
    // Las piezas de VISTA (veta obligatoria) quedan con rotate bloqueado:
    // los fondos legacy venían 'si' (libres, era oculto) y la regla nueva
    // los exige 'no'.
    const rotateBloqueado = clasificacionVeta(rol)?.clase === CLASE_VETA.VISTA_VERTICAL;
    // Orientación del fondo legacy, decidida por la ALTURA del módulo (el
    // ancho almacenado de sus laterales): el lado de la veta mide esa
    // altura — en mueble es la 2ª medida (alto), en corte la 1ª (ancho).
    // Ambigua sin laterales (p. ej. CSV suelto): alto > ancho.
    const altoModulo = altoModuloPorLateral.get(String(p.modulo || '')) || 0;
    let esMueble = null;
    if (rol === 'back_panel' && altoModulo > 0) {
      // Fondo EMBUTIDO: el lado de la veta mide altoDelMódulo − 2·E (E =
      // espesor de la propia pieza). Externo (a caja completa): ±0.
      const e = Number(p.espesor) || 15;
      if (Math.abs(alto - (altoModulo - 2 * e)) <= 3 || Math.abs(alto - altoModulo) <= 3) esMueble = true;
      else if (Math.abs(ancho - (altoModulo - 2 * e)) <= 3 || Math.abs(ancho - altoModulo) <= 3) esMueble = false;
    }
    if (esMueble === null) esMueble = alto > ancho;
    if (!esMueble) {
      // Ya en orientación de corte: solo normaliza el rotate de las vistas.
      resultado.push(rotateBloqueado && p.rotate ? { ...p, rotate: false } : p);
      continue;
    }
    resultado.push({ ...p, ancho: alto, alto: ancho, ...(rotateBloqueado ? { rotate: false } : {}) });
    migradas.push({ id: String(p.id), nombre: String(p.nombre || p.id), rol, ancho: alto, alto: ancho });
  }
  return { pieces: resultado, migradas };
}
