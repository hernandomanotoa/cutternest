// js/services/drawerGeometryService.js — Geometría de la caja de cajón con piezas reales
// Lógica pura, sin DOM ni SVG. Dado un frente de cajón y las piezas reales del
// módulo (drawer_side ×2, drawer_bottom, drawer_back, drawer_part/cara),
// calcula la posición de cada pieza de la caja en el espacio del módulo,
// anclada al frente. El renderer aplica después el movimiento de apertura
// (rail/hinge) igual que al frente: la caja se mueve como un grupo rígido.

import { inferRole } from './classifierService.js';
import { normalizeName } from '../utils/normalize.js';
import { getRailType } from './railService.js';
import { DEFAULT_RAIL_TYPE, DEFAULT_THICKNESS } from '../core/config.js';

const PART_ROLES = ['drawer_side', 'drawer_bottom', 'drawer_back', 'drawer_part'];

function sideOf(piece) {
  const text = `${normalizeName(piece.nombre)} ${normalizeName(piece.id)}`;
  if (text.includes('izq') || text.includes('izquierda')) return 'izq';
  if (text.includes('der') || text.includes('derecha')) return 'der';
  return null;
}

/**
 * Empareja las piezas reales de la caja con su frente.
 * Estrategia, de más específica a más general:
 *   1. Prefijo de id (m21-cajon-frente → m21-cajon-lateral-izq/base/fondo).
 *   2. Mismo submódulo (mismo valor de columna `modulo`).
 *   3. Contención del nombre normalizado del frente.
 * Devuelve { laterales: [pieza, pieza], base, fondo, cara } con lo encontrado
 * (cualquiera puede faltar; cara = frente interior de la caja, rol drawer_part)
 * o null si no hay candidatos.
 */
export function matchDrawerBoxParts(face, candidates) {
  const parts = (candidates || []).filter((p) => p !== face && PART_ROLES.includes(inferRole(p)));
  if (!parts.length) return null;

  // Pool ambiguo = piezas de más de un cajón mezcladas (4 laterales, 2 bases…).
  // No se puede decidir a qué frente pertenecen: se rechaza y el renderer usa
  // la caja sintética. El prefijo de id es específico y se acepta siempre.
  const ambiguous = (pool) =>
    pool.filter((p) => inferRole(p) === 'drawer_side').length > 2 ||
    pool.filter((p) => inferRole(p) === 'drawer_bottom').length > 1;

  let pool = [];
  const prefix = String(face.id || '').split('-').slice(0, -1).join('-');
  if (prefix) {
    pool = parts.filter((p) => {
      const id = String(p.id || '');
      return id === prefix || id.startsWith(`${prefix}-`);
    });
  }
  if (!pool.length) {
    const faceMod = String(face.modulo || '').trim();
    const byMod = faceMod ? parts.filter((p) => String(p.modulo || '').trim() === faceMod) : [];
    if (byMod.length && !ambiguous(byMod)) pool = byMod;
  }
  if (!pool.length) {
    const name = normalizeName(face.nombre);
    const byName = name ? parts.filter((p) => normalizeName(p.nombre).includes(name)) : [];
    if (byName.length && !ambiguous(byName)) pool = byName;
  }
  if (!pool.length) return null;

  const sides = pool.filter((p) => inferRole(p) === 'drawer_side');
  const bySide = { izq: null, der: null };
  for (const s of sides) {
    const lado = sideOf(s);
    if (lado && !bySide[lado]) bySide[lado] = s;
  }
  let laterales;
  if (bySide.izq && bySide.der) laterales = [bySide.izq, bySide.der];
  else {
    const rest = sides.filter((s) => s !== bySide.izq && s !== bySide.der);
    laterales = [bySide.izq || bySide.der || rest[0], rest[0] || rest[1]].filter(Boolean).slice(0, 2);
  }

  const named = (keyword) => pool.find((p) => normalizeName(p.nombre).includes(keyword) || normalizeName(p.id).includes(keyword));
  const base = pool.find((p) => inferRole(p) === 'drawer_bottom') || named('base');
  const fondo = pool.find((p) => inferRole(p) === 'drawer_back') || named('fondo');
  // Cara: frente interior de la caja (entre los laterales). Rol genérico
  // drawer_part o nombre/id con 'cara'.
  const cara = pool.find((p) => inferRole(p) === 'drawer_part') || named('cara');

  return { laterales, base: base || null, fondo: fondo || null, cara: cara || null };
}

/**
 * La caja real es utilizable cuando hay 2 laterales y base: el conjunto mínimo
 * coherente. Con menos piezas el renderer mantiene la caja sintética.
 */
export function hasRealDrawerBox(parts) {
  return !!parts && parts.laterales.length >= 2 && !!parts.base;
}

/**
 * Geometría de la caja (laterales, base, fondo y cara) anclada al frente.
 * Convención de coordenadas del renderer: y = profundidad (+y = frente del
 * módulo), z = altura. La caja ocupa [yFace − prof, yFace] y queda centrada en
 * el vano del frente (x..x+w). railType fija la holgura lateral que ocupa el
 * riel (RAIL_TYPES): telescópica descuenta 12,7 mm por lado; la oculta usa
 * modo catálogo (interior = vano − 42, laterales retranqueados, rebajo
 * inferior de 12,7 mm y alto máx. = vano − 23). La cara (frente interior de
 * la caja, entre los laterales) se dibuja solo si está presente en el CSV
 * (compatibilidad hacia atrás con cajones de 5 piezas).
 *
 * @returns {Array} [{x,y,z,w,d,h,color,role,name,id}] por pieza real; [] si el
 *   conjunto no alcanza el mínimo (hasRealDrawerBox).
 */
export function buildDrawerBoxGeometries({ parts, x, yFace, z, w, h, thickness = DEFAULT_THICKNESS, fallbackDepth = 0, railType = DEFAULT_RAIL_TYPE }) {
  if (!hasRealDrawerBox(parts)) return [];

  const rail = getRailType(railType);
  const clear = rail.sideClearance || 0;
  // Modo catálogo (riel oculta, interiorDeduction > 0): la deducción es del
  // ancho INTERIOR (base/fondo = vano − interiorDeduction). Los laterales se
  // retranquean (interiorDeduction − 2·espLat)/2 por lado, la caja cuelga
  // bottomClearance bajo el borde inferior del vano y su alto se capa a
  // vano − maxHeightDeduction. Los rieles con sideClearance (laterales,
  // ruedas, ligera) mantienen el cálculo clásico: vano − 2·(espLat + clear).
  const catalog = Number(rail.interiorDeduction) > 0;

  const lat = parts.laterales[0];
  const espLat = Number(lat.espesor) || thickness;
  const espBase = parts.base ? (Number(parts.base.espesor) || thickness) : espLat;
  const profLat = Math.max(0, Number(lat.ancho) || 0) || fallbackDepth;
  const latInset = catalog
    ? Math.max(0, (Number(rail.interiorDeduction) - 2 * espLat) / 2)
    : clear;
  const bottomDrop = catalog ? Math.max(0, Number(rail.bottomClearance) || 0) : 0;
  const maxBoxH = catalog
    ? Math.max(0, h - (Number(rail.maxHeightDeduction) || 0))
    : Math.max(0, h);
  const latAlto = Math.min(
    Math.max(0, Number(lat.alto) || 0) || Math.max(0, h - 2 * espBase),
    maxBoxH
  );
  const zBox = z + espBase - bottomDrop;
  const box = [];

  const latX = [x + latInset, x + Math.max(0, w - espLat - latInset)];
  parts.laterales.slice(0, 2).forEach((pieza, i) => {
    box.push({
      x: latX[i], y: yFace - profLat, z: zBox,
      w: espLat, d: profLat, h: latAlto,
      color: pieza.color, role: 'drawer_side', name: pieza.nombre, id: pieza.id, real: true,
    });
  });

  // Máximo ancho interior de base/fondo: modo catálogo (oculta) vano −
  // interiorDeduction (deducción del ancho interior); modo clásico
  // vano − 2·(espLat + clear).
  const maxInterior = catalog
    ? Math.max(0, w - Number(rail.interiorDeduction))
    : Math.max(0, w - 2 * (espLat + clear));
  const baseRealW = Math.max(0, Number(parts.base.ancho) || 0);
  const baseW = baseRealW > 0 ? Math.min(baseRealW, maxInterior) : maxInterior;
  const profBase = Math.max(0, Number(parts.base.alto) || 0) || profLat;
  box.push({
    x: x + (w - baseW) / 2, y: yFace - profBase, z: zBox,
    w: baseW, d: profBase, h: espBase,
    color: parts.base.color, role: 'drawer_bottom', name: parts.base.nombre, id: parts.base.id, real: true,
  });

  if (parts.fondo) {
    const backRealW = Math.max(0, Number(parts.fondo.ancho) || 0);
    const backW = backRealW > 0 ? Math.min(backRealW, maxInterior) : maxInterior;
    // El fondo va APOYADO SOBRE la base (en un cajón real no comparten el
    // plano inferior: z = zBox + espBase) y su alto se capa para no pasar
    // el borde superior de los laterales: ocupa [zBox + espBase, zBox + latAlto).
    const backMaxH = Math.max(0, latAlto - espBase);
    const backH = Math.min(Math.max(0, Number(parts.fondo.alto) || 0) || backMaxH, backMaxH);
    const backT = Number(parts.fondo.espesor) || thickness;
    box.push({
      x: x + (w - backW) / 2, y: yFace - profLat, z: zBox + espBase,
      w: backW, d: backT, h: backH,
      color: parts.fondo.color, role: 'drawer_back', name: parts.fondo.nombre, id: parts.fondo.id, real: true,
    });
  }

  // Cara: frente interior de la caja (va justo detrás del frente decorativo).
  // Su ancho mide el interior ENTRE laterales, así que se ancla a la cara
  // interior del lateral izquierdo (no a su cara exterior, que haría que la
  // cara solapara el lateral en el AABB). En y ocupa el último espesor de la
  // caja, pegada al frente.
  if (parts.cara) {
    const caraRealW = Math.max(0, Number(parts.cara.ancho) || 0);
    const interiorBetween = Math.max(0, latX[1] - (latX[0] + espLat));
    const caraW = caraRealW > 0 ? Math.min(caraRealW, interiorBetween) : interiorBetween;
    const espCara = Number(parts.cara.espesor) || espLat;
    box.push({
      x: latX[0] + espLat, y: yFace - espCara, z: zBox,
      w: caraW, d: espCara, h: latAlto,
      color: parts.cara.color, role: 'drawer_part', name: parts.cara.nombre, id: parts.cara.id, real: true,
    });
  }

  return box;
}
