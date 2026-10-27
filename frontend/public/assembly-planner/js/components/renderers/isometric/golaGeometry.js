/**
 * Geometría de las tiras del sistema gola: perfil horizontal de melamina
 * retranqueado detrás del plano de frentes, anclado con pos_z (borde
 * inferior), entre dos frentes apilados. La vista 3D lo hereda gratis al
 * vivir en el pipeline de computeGeometries().
 */

import { ROLE_COLORS } from '../../../core/config.js';
import { inferRole } from '../../../services/classifierService.js';
import { getGolaCfg } from '../../../services/golaService.js';

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
  const { moduleW, moduleD, thickness } = moduleBox;
  const golaCfg = getGolaCfg(cfg || renderer?.verticalPositionOverrides || {});
  const modId = String(moduleId);
  const strips = (pieces || []).filter((p) => {
    if (inferRole(p) !== 'gola_strip') return false;
    const mod = String(p.modulo || '').trim();
    return mod === modId || (/^\d+$/.test(modId) && (mod.startsWith(modId) || mod.startsWith(`${modId}.`)));
  });
  if (!strips.length) return [];

  // Plano de frentes: misma referencia que drawerGeometry (yFace) menos el
  // retranqueo configurado; la tira se extiende hacia el fondo.
  const yFace = moduleD - thickness + (renderer?.drawerGap ?? 15);
  const y = yFace - golaCfg.golaStripSetback;
  const x = (moduleW - (Number(strips[0].ancho) || 0)) / 2;

  return strips.map((p) => ({
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
}
