// js/services/cutOrientationService.js — Tabla maestra de clasificación de
// veta (sentido de la veta por función de la pieza). Fuente única de verdad
// del flag `rotate` y de la orientación de corte, consumida por el
// Constructor (closetBuilderService) y coherente con la auditoría de veta
// (despieceAuditService). Lógica pura: sin DOM, sin SVG ni estado global.
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
// vertical (en orientación de corte se invierten las columnas: ancho=alto
// del mueble, alto=profundidad). Las piezas ocultas tienen `ladoVeta: null`
// (libres). La proyección de corte se aplica en la Fase C (el CSV pasa a ser
// despiece en orientación de corte); hoy las piezas se emiten en orientación
// de mueble y `swapEnCorte` solo documenta la regla.

export const CLASE_VETA = {
  VISTA_VERTICAL: 'vista-vertical',
  VISTA_HORIZONTAL: 'vista-horizontal',
  OCULTA: 'oculta',
};

// Clasificación por rol (los roles son los de classifierService.inferRole;
// los que no aparecen aquí no tienen regla de veta — p. ej. 'panel' genérico).
export const VETA_POR_ROL = {
  // ── Vista horizontal: veta a lo largo del ancho, rotate bloqueado ──
  drawer_face: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho' },
  door: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho' },
  front_panel: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho' },
  gola_strip: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho' },
  shelf: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho' },
  top_panel: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho' },
  drawer_divider: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho' },

  // ── Vista vertical: veta a lo largo del alto, rotate bloqueado ──
  side_panel: { clase: CLASE_VETA.VISTA_VERTICAL, rotate: false, ladoVeta: 'alto' },
  divider: { clase: CLASE_VETA.VISTA_VERTICAL, rotate: false, ladoVeta: 'alto' },

  // ── Ocultas / estructurales: rotación libre (ahorro de material) ──
  drawer_bottom: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  drawer_side: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  drawer_back: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  drawer_part: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  bottom_panel: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  back_panel: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  plinth_side: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  plinth_divider: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  brace: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  hanger_rail: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
  leg: { clase: CLASE_VETA.OCULTA, rotate: true, ladoVeta: null },
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

// Roles cuya veta es libre (rotate 'si' permitido sin observación): los de
// clase oculta. La auditoría los reporta como informativos, no incumplimiento.
export function rolesVetaLibre() {
  return Object.keys(VETA_POR_ROL).filter((r) => VETA_POR_ROL[r].clase === CLASE_VETA.OCULTA);
}

// true si en orientación de corte las columnas ancho/alto se invierten
// (piezas de vista vertical). Fase C: el CSV pasará a ser despiece y el
// renderer proyectará de vuelta por rol; hoy solo documenta la regla.
export function swapEnCorte(rol) {
  const c = clasificacionVeta(rol);
  return !!c && c.ladoVeta === 'alto';
}
