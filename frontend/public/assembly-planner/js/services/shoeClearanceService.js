// js/services/shoeClearanceService.js — Altura libre entre niveles de zapateras
// Lógica pura, sin DOM ni SVG.
//
// El prompt de taller exige "altura libre vertical para cada nivel medida
// entre las superficies superiores de las bandejas o baldas consecutivas".
// Esta validación la calcula con las piezas REALES del módulo (espesores del
// CSV, como drawerGeometryService) y la compara con el mínimo recomendado
// por tipo de calzado.
//
// Geometría (convención de drawerGeometryService): el ancla de apilado es
// el frente (o la cara cuando la bandeja va sin frente). Si su pos_z es el
// borde inferior del frente, la caja de la unidad arranca en
// zBox = pos_z + espBase (espBase = espesor real de su pieza base):
//   - superficie superior de la bandeja del nivel inferior (donde apoya el
//     calzado): trayTop = pos_z + 2·espBase (la base ocupa [zBox, zBox+espBase]).
//   - cara inferior de la base de la unidad superior (techo del hueco):
//     baseBottom = pos_z + espBase.
//   - alturaLibre = baseBottom(superior) − trayTop(inferior).
// El bottomDrop de la riel oculta (modo catálogo) baja la caja: ignorarlo
// hace el cálculo levemente conservador (resta menos hueco del que hay).
//
// Niveles SIN pos_z: el apilado implícito del renderer depende de zonas,
// offsets y compresión (verticalPositionService) y no reproduce una altura
// libre determinista entre bandejas — NO se inventa: esos niveles se omiten
// (documentado). La validación solo evalúa unidades ancladas (pos_z finito).
//
// Consistencia con el contrato de tipos (js/core/contentTypes.js): altoVano
// incluye frente + bordes + gaps de apilado, así que una unidad apilada con
// el cursor del Constructor siempre deja una altura libre MAYOR que estos
// mínimos (p. ej. planos: frente 177 + gap 2.5 + espBase 15 − 2·15 = 164.5).

import { inferRole, isShoeRack } from './classifierService.js';
import { normalizeName } from '../utils/normalize.js';
import { tipoTagDe, getContentType } from '../core/contentTypes.js';
import { rootModuleIds } from './closetBuilderService.js';
import { matchDrawerBoxParts } from './drawerGeometryService.js';
import { DEFAULT_THICKNESS } from '../core/config.js';

// Fuente de los mínimos (mismo criterio que GOLA_PERFIL_TALLER): medido en
// taller, versionado en repo y sobrescribible vía userConfig
// (userConfig.shoeClearanceMinimos = { tipoId: mm }).
export const SHOE_CLEARANCE_SOURCE = 'taller-medido';

// Altura libre mínima recomendada (mm) entre la bandeja de un nivel y la
// cara inferior de la base de la unidad apilada encima, por tipo de calzado.
// Criterio técnico: holgura de mano para ver/sacar el par apoyado en la
// bandeja (no el alto del calzado: la mano entra inclinada por el frente
// bajo). Relación con altoVano: mínimo ≈ altoVano − frente − bordes − gaps.
export const SHOE_CLEARANCE_MINIMOS = {
  planos: 120, // zapatos planos/bajos (altoVano 180)
  tenis: 150, // tenis / calzado deportivo grueso (altoVano 200)
  tacones: 180, // tacones (la punta inclinada pide más recorrido; altoVano 220)
  botines: 200, // botines (altoVano 220)
  botas: 350, // botas altas: entran casi de pie (frente completo, vano 450)
  bandeja: 120, // bandeja a la vista: calzado bajo sobre borde bajo (vano 160)
};

// Heurística por nombre cuando el tag [tipo] no sobrevive al CSV (diseños
// previos al contrato, p. ej. "Frente zapatera extraible planos M3").
// Devuelve null si el nombre no reconoce tipo: sin contrato no hay mínimo
// que aplicar (mejor omitir que adivinar y generar falsos avisos).
export function tipoZapateraPorNombre(piece) {
  const texto = normalizeName(`${piece?.nombre || ''} ${piece?.id || ''}`);
  if (!isShoeRack(piece)) return null;
  if (texto.includes('tacon')) return 'tacones';
  if (texto.includes('botin')) return 'botines';
  if (texto.includes('bota')) return 'botas';
  if (texto.includes('tenis') || texto.includes('deportiv') || texto.includes('sneaker')) return 'tenis';
  if (texto.includes('bandeja')) return 'bandeja';
  if (texto.includes('plano') || /\bbaj[oa]s?\b/.test(texto)) return 'planos';
  return null;
}

// Resuelve el tipo de una unidad zapatera: tag [tipo] primero (contrato,
// incluye tipos custom inyectados en SHOE_RACK_TYPES), heurística de nombre
// como fallback. Sin tag reconocible → null (nivel no evaluable).
export function tipoDeUnidadZapatera(piece) {
  const tag = tipoTagDe(piece?.nombre) || tipoTagDe(piece?.id);
  if (tag && getContentType('shoeRack', tag)) return tag;
  return tipoZapateraPorNombre(piece);
}

function minimosEfectivos(userConfig) {
  const overrides = userConfig?.shoeClearanceMinimos;
  const minimos = { ...SHOE_CLEARANCE_MINIMOS };
  if (overrides && typeof overrides === 'object') {
    for (const [tipoId, valor] of Object.entries(overrides)) {
      const v = Number(valor);
      if (Number.isFinite(v) && v > 0) minimos[tipoId] = v;
    }
  }
  return minimos;
}

// Atribuye un módulo (o submódulo) a su raíz, con las dos convenciones de
// contentTypes/closetBuilderService ('11' concatenado y '1.2' dotted).
function raizDe(mod, roots) {
  if (roots.has(mod)) return mod;
  if (mod.includes('.')) return mod.split('.')[0]; // la cabeza siempre es raíz
  for (const r of roots) {
    if (/^\d+$/.test(r) && mod.startsWith(r)) return r;
  }
  return mod;
}

// Unidades apiladas ancladas de un módulo raíz: frentes de cajón/zapatera
// (drawer_face) y caras de bandeja abierta (drawer_part, solo cuando no hay
// frente propio: con frente la cara no es ancla) con pos_z finito, más
// repisas (shelf) con pos_z — estas últimas solo hacen de techo del nivel
// inferior, no de zapatera evaluable.
function unidadesApiladas(groupPieces) {
  const unidades = [];
  for (const p of groupPieces) {
    if (!Number.isFinite(p?.pos_z)) continue;
    const rol = inferRole(p);
    if (rol === 'drawer_face') {
      unidades.push({ pieza: p, esZapatera: isShoeRack(p), esRepisa: false });
    } else if (rol === 'drawer_part' || /cara$/.test(normalizeName(String(p.id || '')))) {
      const pref = String(p.id || '').replace(/-?cara$/, '');
      const conFrente = groupPieces.some((q) => String(q.id || '') === `${pref}-frente`);
      if (!conFrente) unidades.push({ pieza: p, esZapatera: isShoeRack(p), esRepisa: false });
    } else if (rol === 'shelf') {
      unidades.push({ pieza: p, esZapatera: false, esRepisa: true });
    }
  }
  return unidades;
}

// Espesor real de la base (bandeja) de una unidad: la pieza drawer_bottom
// emparejada por prefijo/módulo/nombre (misma estrategia que el renderer);
// fallback al espesor por defecto si no hay caja real emparejada.
function espesorBaseDe(unidad, groupPieces) {
  if (unidad.esRepisa) return Number(unidad.pieza.espesor) || DEFAULT_THICKNESS;
  const parts = matchDrawerBoxParts(unidad.pieza, groupPieces);
  const base = parts?.base;
  return (Number(base?.espesor) || DEFAULT_THICKNESS);
}

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Valida la altura libre entre niveles consecutivos de zapateras apiladas.
 *
 * Para cada par de unidades ancladas (pos_z) consecutivas de un mismo
 * módulo raíz donde la INFERIOR es zapatera con tipo resoluble, calcula
 * alturaLibre = cara inferior de la base de la unidad superior − superficie
 * superior de la bandeja de la unidad inferior, y emite warning si queda
 * por debajo del mínimo del tipo (SHOE_CLEARANCE_MINIMOS, fuente
 * 'taller-medido', sobrescribible con userConfig.shoeClearanceMinimos).
 *
 * Aproximaciones documentadas:
 *   - Niveles sin pos_z (apilado implícito del renderer): se omiten — la
 *     posición depende de zonas/offsets y no es determinista.
 *   - El bottomDrop de la riel oculta (modo catálogo) no se descuenta: el
 *     cálculo queda levemente conservador.
 *   - La repisa (shelf) como unidad superior aporta su cara inferior
 *     (pos_z) como techo del hueco; la tapa del módulo no se evalúa.
 *
 * @param {Array} pieces Piezas del mueble (o de un módulo/raíz).
 * @param {object} [userConfig] Config de usuario; admite
 *   `shoeClearanceMinimos: { [tipoId]: mm }` para ajustar los mínimos.
 * @returns {{ warnings: Array<{modulo:string, nivel:number, tipoId:string,
 *   alturaLibreMm:number, minimoMm:number, mensaje:string}>,
 *   niveles: Array<{modulo:string, nivel:number, tipoId:string|null,
 *   alturaLibreMm:number, minimoMm:number|null, ok:boolean}>}}
 *   `warnings` solo trae niveles bajo mínimo; `niveles` lista todos los
 *   niveles evaluados (auditoría/testeo).
 */
export function validateShoeClearance(pieces, userConfig = {}) {
  const warnings = [];
  const niveles = [];
  if (!Array.isArray(pieces) || !pieces.length) return { warnings, niveles };

  const minimos = minimosEfectivos(userConfig);
  const roots = rootModuleIds(pieces);
  const porRaiz = new Map();
  for (const p of pieces) {
    const mod = String(p?.modulo || '').trim();
    if (!mod) continue;
    const raiz = raizDe(mod, roots);
    if (!porRaiz.has(raiz)) porRaiz.set(raiz, []);
    porRaiz.get(raiz).push(p);
  }

  for (const [raiz, groupPieces] of porRaiz) {
    const unidades = unidadesApiladas(groupPieces)
      .map((u) => ({ ...u, espBase: espesorBaseDe(u, groupPieces) }))
      .sort((a, b) => (a.pieza.pos_z - b.pieza.pos_z) || String(a.pieza.id).localeCompare(String(b.pieza.id)));

    for (let i = 0; i < unidades.length - 1; i++) {
      const inferior = unidades[i];
      const superior = unidades[i + 1];
      if (!inferior.esZapatera || inferior.esRepisa) continue;
      const tipoId = tipoDeUnidadZapatera(inferior.pieza);
      // trayTop: superficie superior de la bandeja (base ocupa
      // [pos_z + espBase, pos_z + 2·espBase]). En repisa, su propio espesor.
      const trayTop = inferior.esRepisa
        ? inferior.pieza.pos_z + inferior.espBase
        : inferior.pieza.pos_z + 2 * inferior.espBase;
      // baseBottom: cara inferior de la base de la unidad superior.
      const baseBottom = superior.esRepisa
        ? superior.pieza.pos_z
        : superior.pieza.pos_z + superior.espBase;
      const alturaLibre = r1(baseBottom - trayTop);
      const nivel = i + 1;

      if (!tipoId || !(tipoId in minimos)) {
        niveles.push({ modulo: raiz, nivel, tipoId, alturaLibreMm: alturaLibre, minimoMm: null, ok: true });
        continue;
      }
      const minimoMm = minimos[tipoId];
      const tipo = getContentType('shoeRack', tipoId);
      const tipoLabel = tipo?.label || tipoId;
      const ok = alturaLibre >= minimoMm;
      niveles.push({ modulo: raiz, nivel, tipoId, alturaLibreMm: alturaLibre, minimoMm, ok });
      if (!ok) {
        warnings.push({
          modulo: raiz,
          nivel,
          tipoId,
          alturaLibreMm: alturaLibre,
          minimoMm,
          mensaje: `Módulo ${raiz}: nivel ${nivel} (zapatera ${tipoLabel}): altura libre de ${alturaLibre} mm, por debajo del mínimo recomendado de ${minimoMm} mm para ese calzado.`,
        });
      }
    }
  }
  return { warnings, niveles };
}
