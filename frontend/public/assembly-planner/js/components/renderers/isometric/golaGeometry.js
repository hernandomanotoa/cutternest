/**
 * Geometría de las tiras del sistema gola: canal de melamina ABIERTO AL
 * FRENTE y retranqueado detrás del plano de frentes, anclado con pos_z
 * (borde inferior), entre dos frentes apilados. La vista 3D lo hereda gratis
 * al vivir en el pipeline de computeGeometries().
 *
 * Modelo (mismo que golaSectionService, el plano de taller): por cada gap
 * entre frentes, un canal tipo C = fondo vertical de 15 retranqueado
 * golaStripSetback detrás del plano de frentes + dos labios (pestañas) de
 * 15 de espesor A RAS del plano de frentes que cubren el retranqueo y
 * traslapan el fondo (encolado/atornillado). El HUECO entre los labios, a
 * la profundidad del retranqueo, es donde entran los dedos: la mano pasa
 * por el paso superior y engancha el borde inferior del frente superior
 * POR DETRÁS. Nada sobresale delante del plano de frentes (así el frente se
 * jala libre y la gola no lo obstruye). SOLO canales C entre cajones: sobre
 * el último frente no va canal ni marca de agarre (gap de frente habitual).
 *
 * Marca de agarre (rol `gola_grip`, caja de 2 mm en el plano de frentes):
 * el paso superior de cada canal (por donde entran los dedos) y la ranura
 * libre sobre el frente L (techo del último frente → repisa/techo
 * inmediato superior). Solo geometría de renderer (sin piezas ni BOM).
 */

import { ROLE_COLORS } from '../../../core/config.js';
import { inferRole } from '../../../services/classifierService.js';
import { getGolaCfg } from '../../../services/golaService.js';

// Espesor (profundidad Y) de la marca de agarre: una caja fina que solo
// resalta el hueco en el plano de frentes.
const GRIP_MARK_DEPTH = 2;

// Espesor del tablero de las tiras (fondo y labios), mm.
const ESP_TIRA = 15;

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

  // Plano de frentes: misma referencia que drawerGeometry (yFace). El canal
  // vive DETRÁS de ese plano: el fondo con su cara frontal a
  // yFace − golaStripSetback y los labios a ras del plano de frentes.
  const yFace = moduleD - thickness + (renderer?.drawerGap ?? 15);
  const stripW = Number(strips[0].ancho) || 0;
  const x = (moduleW - stripW) / 2;

  // Cada canal se dibuja desde su FONDO (pieza ...-fondo): panel vertical
  // retranqueado + labios horizontales (sup e inf) A RAS del plano de
  // frentes que forman el canal de agarre. El canal L solo lleva labio
  // inferior.
  const fondos = strips.filter((p) => String(p.id).endsWith('-fondo'));
  const geos = [];
  for (const f of fondos) {
    const z = Number(f.pos_z) || 0;
    const h = Number(f.alto) || golaCfg.golaPerfilHeight;
    const w = Number(f.ancho) || stripW;
    const pref = String(f.id).slice(0, -'-fondo'.length);
    const pestanaSup = strips.find((p) => p.id === `${pref}-pestana-sup`);
    const pestanaInf = strips.find((p) => p.id === `${pref}-pestana-inf` || p.id === `${pref}-pestana`);
    const yWeb = yFace - golaCfg.golaStripSetback; // cara frontal del fondo
    geos.push({
      x, y: yWeb - ESP_TIRA, z, w, d: ESP_TIRA, h,
      color: f.color || ROLE_COLORS.gola_strip,
      role: 'gola_strip', name: f.nombre, id: f.id,
    });
    // Labios: de la cara posterior del fondo hasta a ras del plano de
    // frentes (cubren el retranqueo y traslapan el fondo ESP_TIRA).
    const largoLabio = golaCfg.golaStripSetback + ESP_TIRA;
    if (pestanaSup) {
      geos.push({
        x, y: yWeb - ESP_TIRA, z: z + h - ESP_TIRA, w, d: largoLabio, h: ESP_TIRA,
        color: pestanaSup.color || ROLE_COLORS.gola_strip,
        role: 'gola_strip', name: pestanaSup.nombre, id: pestanaSup.id,
      });
    }
    if (pestanaInf) {
      geos.push({
        x, y: yWeb - ESP_TIRA, z, w, d: largoLabio, h: ESP_TIRA,
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

  // Sin canal L: sobre el último frente no hay marca de agarre (queda el gap
  // de frente habitual, como en el apilado sin gola).
  return geos;
}
