/**
 * Geometría de las tiras del sistema gola (modelo B2 de taller): canal tipo
 * C de melamina 15 mm entre cajones apilados, anclado con pos_z. La vista
 * 3D lo hereda gratis al vivir en el pipeline de computeGeometries().
 *
 * Modelo por gap (spec taller): fondo vertical de 15 INTERNO (retranqueado
 * golaStripSetback detrás de la espalda de los frentes, detrás de las caras)
 * + alas horizontales de 15 que cubren el retranqueo hasta 2 mm de la
 * espalda del frente + pestañas VERTICALES de 15 pegadas a la espalda de los
 * frentes, OCULTAS detrás de ellos y frenando a golaPaso de las caras de los
 * cajones relacionados. Los frentes crecen +30 mm (GOLA_LABIO_MM): el labio
 * cuelga sobre el canal y el dedo entra por el paso superior y engancha su
 * borde inferior por detrás. Nada se dibuja sobre el frente ni sobresale de
 * su espalda. SOLO canales C entre cajones: sobre el último frente no va
 * canal ni marca de agarre (gap de frente habitual).
 *
 * Marca de agarre (rol `gola_grip`, caja de 2 mm a ras de la espalda de los
 * frentes): el paso superior de cada canal (por donde entran los dedos).
 * Solo geometría de renderer (sin piezas ni BOM).
 */

import { ROLE_COLORS } from '../../../core/config.js';
import { inferRole } from '../../../services/classifierService.js';
import { getGolaCfg } from '../../../services/golaService.js';
import { effectiveDrawerGap } from './drawerGeometry.js';

// Espesor (profundidad Y) de la marca de agarre: una caja fina que solo
// resalta el hueco en el plano de frentes.
const GRIP_MARK_DEPTH = 2;

// Espesor del tablero de las tiras (fondo y labios), mm.
const ESP_TIRA = 15;

// Fallback del voladizo (frente − cara)/2 para la marca del agarre cuando
// no se encuentra el frente inferior (mm).
const GOLA_LABIO_FALLBACK = 30;

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
  // NO vive en el plano de frentes: va DETRÁS de la cara posterior de los
  // frentes (entre las caras de los cajones). La cara posterior del frente
  // está a yFace − espesorFrente; el fondo se retrancha golaStripSetback
  // desde ahí y los labios van de la cara posterior del fondo hasta a ras de
  // la cara posterior del frente. Nada queda coplanar con el frente ni se
  // dibuja sobre él.
  const yFace = moduleD - thickness + effectiveDrawerGap(renderer?.drawerGap, thickness);
  const frenteRef = (pieces || []).find((p) => inferRole(p) === 'drawer_face' && perteneceAModulo(p, modId));
  const ESP_FRENTE = Number(frenteRef?.espesor) || 15;
  const yCara = yFace - ESP_FRENTE;
  const stripW = Number(strips[0].ancho) || 0;
  const x = (moduleW - stripW) / 2;

  // Modelo B2: canal C de 3 piezas; cada una se dibuja según su tipo:
  // - fondo: panel vertical de 15 INTERNO (retranqueado golaStripSetback
  //   detrás de la espalda de los frentes).
  // - ala sup/inf: labios horizontales de 15 desde la cara frontal del
  //   fondo hasta 2 mm antes de la espalda de los frentes.
  // Frentes del módulo (para anclar la marca del agarre al paso real).
  const frentesGeo = (pieces || [])
    .filter((p) => inferRole(p) === 'drawer_face' && perteneceAModulo(p, modId))
    .map((f) => ({ top: (Number(f.pos_z) || 0) + (Number(f.alto) || 0) }));

  const geos = [];
  for (const p of strips) {
    const id = String(p.id);
    const z = Number(p.pos_z) || 0;
    const w = Number(p.ancho) || stripW;
    const color = p.color || ROLE_COLORS.gola_strip;
    if (id.endsWith('-fondo')) {
      const h = Number(p.alto) || golaCfg.golaPerfilHeight;
      geos.push({
        x, y: yCara - golaCfg.golaStripSetback - ESP_TIRA, z, w, d: ESP_TIRA, h,
        color, role: 'gola_strip', name: p.nombre, id: p.id,
      });
      // Marca del agarre: el PASO entre frentes (línea de sombra por donde
      // entra el dedo), a ras de la espalda del frente. El paso es el techo
      // del frente inmediatamente inferior al canal.
      const inferior = frentesGeo
        .filter((f) => f.top >= z - 5 && f.top <= z + 50)
        .reduce((best, f) => (best === null || f.top > best ? f.top : best), null);
      const labioCfg = Number(golaCfg.golaLabioMm) > 0 ? Number(golaCfg.golaLabioMm) : GOLA_LABIO_FALLBACK;
      const zPaso = inferior != null ? inferior : z + h - labioCfg;
      geos.push({
        x, y: yCara - GRIP_MARK_DEPTH, z: zPaso, w, d: GRIP_MARK_DEPTH, h: golaCfg.golaPaso,
        color: ROLE_COLORS.gola_grip, role: 'gola_grip', name: '', id: `${p.id}-grip`,
      });
    } else if (/-ala-(sup|inf)$/.test(id)) {
      // Ala horizontal: 'alto' de la pieza = largo (profundidad); su altura
      // vertical es el espesor (15). Frente a 2 mm de la espalda del frente.
      const largo = Number(p.alto) || golaCfg.golaStripSetback;
      geos.push({
        x, y: yCara - 2 - largo, z, w, d: largo, h: ESP_TIRA,
        color, role: 'gola_strip', name: p.nombre, id: p.id,
      });
    }
  }

  // Sin canal L: sobre el último frente no hay marca de agarre (queda el gap
  // de frente habitual, como en el apilado sin gola).
  return geos;
}
