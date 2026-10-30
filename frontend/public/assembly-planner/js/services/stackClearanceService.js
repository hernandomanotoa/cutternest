// js/services/stackClearanceService.js — Validación estricta de cabida vertical
// de pilas de frentes/cajones. Sin DOM. Lógica pura testeable.
//
// El renderer (drawerGeometry.js) tolera el exceso vertical comprimiendo la
// pila y emitiendo un warning ("se dibuja escalada"). El prompt de taller
// exige además EXPONER el conflicto como error: "Comprueba que la suma … no
// exceda la altura interior disponible. No fuerces la distribución propuesta
// si no cabe." Este servicio es ese chequeo estricto; NO altera el render.
//
// Reglas:
// - Módulos raíz (convención rootModuleIds: '11' e '1.2' como submódulos).
// - Frentes anclados con pos_z: no se comprimen; si su techo real (pos_z +
//   alto) supera el techo interior del casco, es error directo.
// - Frentes sin pos_z: el renderer los apila con compresión; aquí se calcula
//   la pila SIN compresión (Σ altos + gaps reales entre frentes) y se compara
//   contra la altura interior (cara superior de la base → cara inferior de la
//   tapa). Si excede, error con el exceso en mm.
// - Módulos con gola aplicada: exentos — applyGola cierra su span por
//   construcción y ya reporta su propio hard-fail; no se duplica ni se
//   contradice (se detecta por la presencia de piezas rol 'gola_strip').

import { VERTICAL_POSITIONS } from '../core/config.js';
import { nameIncludes } from '../utils/normalize.js';
import { inferRole } from './classifierService.js';
import { getModuleDimensions } from './geometryService.js';
import { rootModuleIds } from './closetBuilderService.js';

const TOL_MM = 0.5;

// Pieza del módulo raíz o de sus submódulos ('11', '1.2'...) — misma
// convención que golaService.perteneceAModulo.
function perteneceAModulo(p, moduleId) {
  const mod = String(p?.modulo || '').trim();
  const id = String(moduleId);
  return mod === id || (/^\d+$/.test(id) && (mod.startsWith(id) || mod.startsWith(`${id}.`)));
}

function frenteHeight(p) {
  return Number(p?.alto) || 0;
}

/**
 * Devuelve `{ errors: [{ modulo, mensaje }] }` con un error por pila que no
 * cabe. Mensajes en español con módulo, exceso en mm, techo interior y
 * sugerencia de resolución.
 */
export function validateStackClearance(pieces) {
  const errors = [];
  const all = pieces || [];
  const roots = rootModuleIds(all);

  for (const rootId of roots) {
    const modPieces = all.filter((p) => perteneceAModulo(p, rootId));
    if (modPieces.some((p) => inferRole(p) === 'gola_strip')) continue;

    const base = modPieces.find((p) => nameIncludes(p.nombre, ['base']));
    const top = modPieces.find((p) => nameIncludes(p.nombre, ['tapa', 'techo']));
    if (!base || !top) continue;

    const laterals = modPieces.filter((p) => nameIncludes(p.nombre, ['lateral']));
    const sideThickness = laterals.length ? Number(laterals[0].espesor) || 15 : Number(base.espesor) || 15;
    // Altura del casco: los laterales mandan (getModuleDimensions aplica
    // heurísticas por familia —p. ej. 'patas + tapa' en seating— que aquí
    // falsearían el vano interior del cabinet).
    const sideH = laterals.length
      ? Math.max(...laterals.map((p) => (p.rotate ? Number(p.ancho) || 0 : Number(p.alto) || 0)))
      : 0;
    const boxH = sideH || getModuleDimensions(modPieces, sideThickness, 'cabinet').height;

    const floor = Number(base.espesor) || 0;
    const ceiling = boxH - (Number(top.espesor) || 0);
    const available = ceiling - floor;
    if (available <= 0) continue;

    const fronts = modPieces.filter((p) => inferRole(p) === 'drawer_face');
    if (!fronts.length) continue;

    // Frentes anclados: no se mueven; su techo real debe quedar bajo el
    // techo interior del casco.
    for (const f of fronts) {
      if (!Number.isFinite(f.pos_z)) continue;
      const topF = Number(f.pos_z) + frenteHeight(f);
      if (topF > ceiling + TOL_MM) {
        const exceso = Math.round((topF - ceiling) * 10) / 10;
        errors.push({
          modulo: rootId,
          mensaje: `Módulo ${rootId}: el frente "${f.nombre}" anclado en pos_z=${f.pos_z} mm llega a ${Math.round(topF)} mm, ${exceso} mm por encima del techo interior (${Math.round(ceiling)} mm). No se comprime: baje pos_z o reduzca el alto del frente.`,
        });
      }
    }

    // Frentes flotantes: pila SIN compresión (Σ altos + gaps reales entre
    // frentes, drawerFrontGap de mueblería) contra la altura interior. Sin
    // repisas el renderer apila todos los flotantes en la única zona del
    // vano; con repisas fijas que fraccionen el módulo, los frentes suelen
    // venir anclados con pos_z (chequeados arriba) y quedan fuera de esta
    // pila.
    const gap = VERTICAL_POSITIONS.drawerFrontGap;
    const floating = fronts.filter((f) => !Number.isFinite(f.pos_z));
    if (floating.length) {
      const sumaH = floating.reduce((s, f) => s + frenteHeight(f), 0);
      const stackH = sumaH + (floating.length - 1) * gap;
      if (stackH > available + TOL_MM) {
        const exceso = Math.round((stackH - available) * 10) / 10;
        const nombres = floating.map((f) => `"${f.nombre}"`).join(', ');
        errors.push({
          modulo: rootId,
          mensaje: `Módulo ${rootId}: la pila de ${floating.length} frentes (${nombres}) suma ${Math.round(stackH)} mm (Σ altos ${Math.round(sumaH)} mm + ${floating.length - 1} gaps × ${gap} mm) y excede la altura interior disponible (${Math.round(available)} mm) por ${exceso} mm. La compresión no es una solución válida: quite un nivel o reduzca los altos de los frentes, o aumente el vano.`,
        });
      }
    }
  }

  return { errors };
}
