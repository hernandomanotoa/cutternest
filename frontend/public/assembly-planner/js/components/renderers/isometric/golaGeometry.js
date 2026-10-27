/**
 * Geometría de las tiras del sistema gola: perfil horizontal de melamina
 * retranqueado detrás del plano de frentes, anclado con pos_z (borde
 * inferior), entre dos frentes apilados. La vista 3D lo hereda gratis al
 * vivir en el pipeline de computeGeometries().
 *
 * Además de la tira, se emite una marca fina (rol `gola_grip`, caja de 2 mm
 * en el plano de frentes) del canal de agarre: el hueco entre el techo de
 * la tira y el borde inferior del frente superior, y el hueco bajo el frente
 * L (entre el techo del último frente y la repisa/techo inmediato superior).
 * Son solo geometría de renderer (no generan piezas ni BOM).
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

  const geos = strips.map((p) => ({
    x,
    y,
    z: Number(p.pos_z) || 0,
    w: Number(p.ancho) || 0,
    d: golaCfg.golaStripDepth,
    h: Number(p.alto) || golaCfg.golaPerfilHeight,
    color: p.color || ROLE_COLORS.gola_strip,
    role: 'gola_strip',
    name: p.nombre,
    id: p.id,
  }));

  const frentes = (pieces || [])
    .filter((p) => inferRole(p) === 'drawer_face' && perteneceAModulo(p, modId))
    .sort((a, b) => (Number(a.pos_z) || 0) - (Number(b.pos_z) || 0));

  // Agarre de cada tira: entre el techo de la tira y el borde inferior del
  // frente inmediatamente superior (≈ golaFingerClearance por construcción).
  for (const t of strips) {
    const zTop = (Number(t.pos_z) || 0) + (Number(t.alto) || golaCfg.golaPerfilHeight);
    const superior = frentes.find((f) => Number(f.pos_z) >= zTop - 1.5);
    if (!superior) continue;
    const h = Number(superior.pos_z) - zTop;
    if (h <= 0.5) continue;
    geos.push({
      x,
      y: yFace,
      z: zTop,
      w: stripW,
      d: GRIP_MARK_DEPTH,
      h,
      color: ROLE_COLORS.gola_grip,
      role: 'gola_grip',
      name: '',
      id: `${t.id}-grip`,
    });
  }

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
