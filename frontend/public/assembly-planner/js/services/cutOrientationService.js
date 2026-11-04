// js/services/cutOrientationService.js — Tabla maestra de clasificación de
// veta (sentido de la veta por función de la pieza). Fuente única de verdad
// del flag `rotate`, del lado de la veta y de la orientación de veta,
// consumida por el Constructor (closetBuilderService), el parser (migración
// legacy) y la auditoría de veta (despieceAuditService). Lógica pura: sin
// DOM, sin SVG ni estado global.
//
// CONVENCIÓN DEL CSV (congruente con el taller): las columnas `ancho`/`alto`
// describen la pieza COMO ESTÁ en el mueble (orientación de mueble). La
// veta se deriva del TIPO de pieza con la regla "la veta sigue el lado más
// largo" (spec del taller):
//   - Vistas HORIZONTALES (frentes, puertas, repisas, tapas, golas,
//     divisiones de zapatera): veta a lo largo del ANCHO (su lado largo).
//   - Vistas VERTICALES (costados, montantes, divisores, fondo del módulo —
//     la MISMA veta que los laterales): veta a lo largo del ALTO.
//   - Ocultas/estructurales: rotate libre (el optimizador gira para ahorrar;
//     la veta no es exigible).
// El optimizador (backend) orienta cada pieza bloqueada poniendo su lado
// largo paralelo al eje de veta del tablero; nada de swaps en el CSV.

import { inferRole } from './classifierService.js';

export const CLASE_VETA = {
  VISTA_HORIZONTAL: 'vista-horizontal',
  VISTA_VERTICAL: 'vista-vertical',
  OCULTA: 'oculta',
};

// Clasificación por rol (los roles son los de classifierService.inferRole;
// los que no aparecen aquí no tienen regla de veta — p. ej. 'panel' genérico).
export const VETA_POR_ROL = {
  // ── Vista horizontal: la veta corre a lo largo del ancho (lado largo) ──
  // Convención de cantos (auditoría 2026-11): solo aristas VISTAS. Para
  // piezas horizontales T = arista trasera y B = arista frontal (vista en
  // planta con el frente del mueble abajo).
  drawer_face: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B,L,R' },
  door: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B,L,R' },
  front_panel: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B,L,R' },
  gola_strip: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T,B' },
  shelf: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'B' },
  top_panel: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'B,L,R' },
  drawer_divider: { clase: CLASE_VETA.VISTA_HORIZONTAL, rotate: false, ladoVeta: 'ancho', cantos: 'T' },

  // ── Vista vertical: la veta corre a lo largo del alto (lado largo) ──
  side_panel: { clase: CLASE_VETA.VISTA_VERTICAL, rotate: false, ladoVeta: 'alto', cantos: '' },
  divider: { clase: CLASE_VETA.VISTA_VERTICAL, rotate: false, ladoVeta: 'alto', cantos: '' },
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

// true si la pieza del rol es de VISTA VERTICAL (la veta corre a lo largo
// del alto). Usado por los renderers de veta (3D del planner, texturas).
export function esVistaVertical(rol) {
  const c = clasificacionVeta(rol);
  return !!c && c.clase === CLASE_VETA.VISTA_VERTICAL;
}

// Regla del taller para el OPTIMIZADOR: la veta de una pieza bloqueada sigue
// su lado más largo. Devuelve 'ancho' | 'alto' (lado de la veta) para piezas
// de vista, o null para las libres.
export function ladoVetaPieza(rol) {
  const c = clasificacionVeta(rol);
  return c && c.clase !== CLASE_VETA.OCULTA ? c.ladoVeta : null;
}

// Migra CSVs de la era "orientación de corte" (laterales/fondos/divisores
// con la primera medida = lado de la veta, p. ej. lateral 2400×600) de
// vuelta a la convención congruente de mueble (lateral 600×2400). La veta de
// esos roles vive en el ALTO (lado largo), así que la forma de corte se
// reconoce porque el ANCHO supera al alto. Idempotente. Punto de aplicación:
// csvParser.parseCSV (versiones locales y autoguardado re-parsean como CSV).
export function migraPiezasAMueble(pieces) {
  const lista = pieces || [];
  // Altura de cada módulo: los laterales aportan el alto del mueble, tanto
  // si el CSV ya es congruente (alto) como si viene de la era de corte
  // (ancho = alto del mueble, reconocible porque supera al propio alto).
  const altoModulo = new Map();
  for (const p of lista) {
    if (inferRole(p) !== 'side_panel') continue;
    const a = Number(p.ancho) || 0;
    const h = Number(p.alto) || 0;
    const altoMueble = a > h * 1.5 ? a : h;
    const mod = String(p.modulo || '');
    altoModulo.set(mod, Math.max(altoModulo.get(mod) || 0, altoMueble));
  }
  const resultado = [];
  const migradas = [];
  for (const p of lista) {
    const rol = inferRole(p);
    const c = clasificacionVeta(rol);
    if (!c || c.clase !== CLASE_VETA.VISTA_VERTICAL) {
      resultado.push(p);
      continue;
    }
    const ancho = Number(p.ancho) || 0;
    const alto = Number(p.alto) || 0;
    if (ancho <= alto * 1.5) {
      resultado.push(p); // ya congruente (el alto es el lado largo)
      continue;
    }
    // Forma de la era de corte (ancho = lado largo). Confirmar con el
    // módulo cuando hay laterales: el ancho mide su alto (externo o −2·E);
    // si no cuadra, la pieza es de mueble ancha y baja (p. ej. fondo de
    // módulo bajo) y se respeta tal cual.
    const H = altoModulo.get(String(p.modulo || '')) || 0;
    if (H > 0) {
      const e = Number(p.espesor) || 15;
      const cuadraCorte = Math.abs(ancho - H) <= 3 || Math.abs(ancho - (H - 2 * e)) <= 3;
      const cuadraMueble = Math.abs(alto - H) <= 3 || Math.abs(alto - (H - 2 * e)) <= 3;
      if (!cuadraCorte || cuadraMueble) {
        resultado.push(p);
        continue;
      }
    }
    resultado.push({ ...p, ancho: alto, alto: ancho });
    migradas.push({ id: String(p.id), nombre: String(p.nombre || p.id), rol, ancho: alto, alto: ancho });
  }
  return { pieces: resultado, migradas };
}
