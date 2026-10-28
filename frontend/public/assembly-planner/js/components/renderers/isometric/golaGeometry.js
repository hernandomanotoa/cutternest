/**
 * Geometría de las tiras del sistema gola: perfil horizontal de melamina
 * retranqueado detrás del plano de frentes, anclado con pos_z (borde
 * inferior), entre dos frentes apilados. La vista 3D lo hereda gratis al
 * vivir en el pipeline de computeGeometries().
 *
 * La tira-U LLENA el gap entre frentes: toca el borde superior del frente
 * inferior y el borde inferior del frente superior. El agarre lo genera el
 * RETRANQUEO (la tira queda detrás del plano de frentes): la mano engancha
 * el borde del frente superior por delante de la tira. Por eso la marca de
 * agarre (rol `gola_grip`, caja de 2 mm en el plano de frentes) cubre todo
 * el alto de la tira: señala el canal horizontal donde entran los dedos.
 * También se emite la marca bajo el frente L (techo del último frente →
 * repisa/techo inmediato superior). Solo geometría de renderer (sin piezas
 * ni BOM).
 */

import { ROLE_COLORS } from '../../../core/config.js';
import { inferRole } from '../../../services/classifierService.js';
import { getGolaCfg } from '../../../services/golaService.js';

// Espesor (profundidad Y) de la marca de agarre: una caja fina que solo
// resalta el hueco en el plano de frentes.
const GRIP_MARK_DEPTH = 2;

// Pieza del módulo raíz o de sus submódulos ('11', '1.2'...). Mismo criterio
// que golaService (no exportado): strips frentes y repisas del módulo.
function perteneceAModulo(p, moduleId) {
  const mod = String(p?.modulo || '').trim();
  const id = String(moduleId);
  return mod === id || (/^\d+$/.test(id) && (mod.startsWith(id) || mod.startsWith(`${id}.`)));
}

/**
 * Construye las geometrías de las tiras gola de un módulo.
 *
 * @param {string} moduleId módulo raíz ('1')
 * @param {Array} pieces piezas (con pos_z) del módulo y sus submódulos
 * @param {{moduleW:number, moduleD:number, moduleH:number, thickness:number}} moduleBox
 * @param {object} renderer IsometricRenderer (drawerGap, verticalPositionOverrides)
 * @param {object} [cfg] overrides gola (userConfig); por defecto los del renderer
 * @returns {Array<{x,y,z,w,d,h,color,role,name,id}>}
 */
export function buildGolaGeometries(moduleId, pieces, moduleBox, renderer, cfg = null) {
  const { moduleW, moduleD, moduleH, thickness } = moduleBox;
  const golaCfg = getGolaCfg(cfg || renderer?.verticalPositionOverrides || {});
  const modId = String(moduleId);
  const strips = (pieces || []).filter((p) => {
    if (inferRole(p) !== 'gola_strip') return false;
    return perteneceAModulo(p, modId);
  });
  if (!strips.length) return [];
  strips.sort((a, b) => (Number(a.pos_z) || 0) - (Number(b.pos_z) || 0));

  // Plano de frentes: misma referencia que drawerGeometry (yFace) menos el
  // retranqueo configurado; la tira se extiende hacia el fondo.
  const yFace = moduleD - thickness + (renderer?.drawerGap ?? 15);
  const y = yFace - golaCfg.golaStripSetback;
  const stripW = Number(strips[0].ancho) || 0;
  const x = (moduleW - stripW) / 2;

  // Cada canal se dibuja desde su FONDO (pieza ...-fondo): panel vertical
  // retranqueado + pestañas horizontales (sup e inf) que forman el canal de
  // agarre abierto hacia el frente. El canal L solo lleva pestaña inferior.
  const fondos = strips.filter((p) => String(p.id).endsWith('-fondo'));
  const yBack = yFace - golaCfg.golaStripSetback; // cara frontal del fondo
  const geos = [];
  for (const f of fondos) {
    const z = Number(f.pos_z) || 0;
    const h = Number(f.alto) || golaCfg.golaPerfilHeight;
    const w = Number(f.ancho) || stripW;
    const pref = String(f.id).slice(0, -'-fondo'.length);
    const pestanaSup = strips.find((p) => p.id === `${pref}-pestana-sup`);
    const pestanaInf = strips.find((p) => p.id === `${pref}-pestana-inf` || p.id === `${pref}-pestana`);
    geos.push({
      x, y: yBack - 15, z, w, d: 15, h,
      color: f.color || ROLE_COLORS.gola_strip,
      role: 'gola_strip', name: f.nombre, id: f.id,
    });
    const profP = golaCfg.golaStripDepth;
    if (pestanaSup) {
      geos.push({
        x, y: yBack - 15, z: z + h - 15, w, d: profP, h: 15,
        color: pestanaSup.color || ROLE_COLORS.gola_strip,
        role: 'gola_strip', name: pestanaSup.nombre, id: pestanaSup.id,
      });
    }
    if (pestanaInf) {
      geos.push({
        x, y: yBack - 15, z, w, d: profP, h: 15,
        color: pestanaInf.color || ROLE_COLORS.gola_strip,
        role: 'gola_strip', name: pestanaInf.nombre, id: pestanaInf.id,
      });
    }
    // Marca del agarre: el paso superior (por donde entran los dedos al canal).
    geos.push({
      x, y: yFace, z: z + h, w, d: GRIP_MARK_DEPTH, h: golaCfg.golaPaso,
      color: ROLE_COLORS.gola_grip, role: 'gola_grip', name: '', id: `${f.id}-grip`,
    });
  }

  const frentes = (pieces || [])
    .filter((p) => inferRole(p) === 'drawer_face' && perteneceAModulo(p, modId))
    .sort((a, b) => (Number(a.pos_z) || 0) - (Number(b.pos_z) || 0));

  // Agarre de la L: entre el techo del último frente y la repisa inmediata
  // superior (solo repisas del módulo raíz); sin repisa, bajo el techo
  // interior del casco. Mismo criterio de topRef que golaService.
  const ultimoFrente = frentes[frentes.length - 1];
  if (ultimoFrente) {
    const techoUlt = (Number(ultimoFrente.pos_z) || 0) + (Number(ultimoFrente.alto) || 0);
    const repisas = (pieces || []).filter((p) =>
      inferRole(p) === 'shelf'
      && String(p.modulo || '').trim() === modId
      && Number.isFinite(Number(p.pos_z))
      && Number(p.pos_z) >= techoUlt - 0.5);
    const topRef = repisas.length
      ? Math.min(...repisas.map((p) => Number(p.pos_z)))
      : moduleH - thickness;
    const hL = topRef - techoUlt;
    if (hL > 0.5) {
      geos.push({
        x,
        y: yFace,
        z: techoUlt,
        w: stripW,
        d: GRIP_MARK_DEPTH,
        h: hL,
        color: ROLE_COLORS.gola_grip,
        role: 'gola_grip',
        name: '',
        id: `m${modId}-gola-l-grip`,
      });
    }
  }

  return geos;
}
