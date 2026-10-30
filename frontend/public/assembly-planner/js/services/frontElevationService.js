// js/services/frontElevationService.js — Modelo de datos de la vista frontal
// acotada (plano de taller) de UN módulo. Servicio PURO: sin DOM ni SVG (el
// SVG lo arma js/components/renderers/frontElevationRenderer.js).
//
// Proyecta las piezas del módulo al plano X-Z (ancho × alto, mm desde el
// borde inferior izquierdo del casco) y emite:
//   - rectángulos proyectados con etiqueta de corte "ancho × alto" (mm),
//     distinguiendo piezas fijas (casco, gola) de móviles (frentes);
//   - cotas principales: ancho total, alto total y ancho interior;
//   - marcas de posición Z de frentes y tiras gola.
//
// buildFrontElevation(pieces, moduleId, userConfig?) →
//   { ok:true, moduleId, ancho, alto, espesor, anchoInterior,
//     rectangulos, cotas, marcas, leyenda }
// | { ok:false, errors }

import { inferRole } from './classifierService.js';
import { getGolaCfg } from './golaService.js';
import { DEFAULT_THICKNESS } from '../core/config.js';

// Piezas vistas de frente como elementos fijos (casco, gola y compañía).
const ROLES_FIJOS = new Set([
  'side_panel',
  'top_panel',
  'bottom_panel',
  'back_panel',
  'shelf',
  'divider',
  'brace',
  'hanger_rail',
  'panel',
  'gola_strip',
]);

// Piezas móviles: frentes de cajón, puertas y similares (se dibujan por
// encima de las fijas y con trazo distinto).
const ROLES_MOVILES = new Set(['drawer_face', 'door', 'mirror', 'seat_panel']);

const mm = (v) => Math.round(Number(v) * 10) / 10;

// Pieza del módulo raíz o de sus submódulos ('11', '1.2'...), misma
// convención que golaService.perteneceAModulo.
function perteneceAModulo(p, moduleId) {
  const mod = String(p?.modulo || '').trim();
  const id = String(moduleId);
  return mod === id || (/^\d+$/.test(id) && (mod.startsWith(id) || mod.startsWith(`${id}.`)));
}

// Dimensiones del casco desde sus piezas (mismo criterio que golaService.cascoDims).
function cascoDims(pieces, moduleId) {
  const delMod = (pieces || []).filter((p) => String(p.modulo || '') === String(moduleId));
  const tapa = delMod.find((p) => String(p.id) === `m${moduleId}-tapa`)
    || delMod.find((p) => inferRole(p) === 'top_panel');
  const lateral = delMod.find((p) => String(p.id) === `m${moduleId}-lateral-izq`)
    || delMod.find((p) => inferRole(p) === 'side_panel');
  if (!tapa && !lateral) return null;
  const espesor = Number((tapa || lateral).espesor) || DEFAULT_THICKNESS;
  const ancho = tapa ? Number(tapa.ancho) || 0 : 0;
  const alto = lateral ? Number(lateral.alto) || 0 : 0;
  if (!ancho || !alto) return null;
  return { ancho, alto, espesor, anchoInterior: ancho - 2 * espesor };
}

const esPestanaGola = (p) => /-pestana(-sup|-inf)?$/.test(String(p.id));

/**
 * Modelo de la vista frontal acotada de un módulo.
 *
 * @param {object[]} pieces piezas del diseño completo.
 * @param {string|number} moduleId módulo raíz (incluye sus submódulos).
 * @param {object} [userConfig] config del usuario (gola: holgura lateral).
 * @returns modelo de datos (sin DOM/SVG) listo para el renderer.
 */
export function buildFrontElevation(pieces, moduleId, userConfig = {}) {
  const modId = String(moduleId);
  const lista = (pieces || []).filter((p) => perteneceAModulo(p, modId));
  const casco = cascoDims(pieces, modId);
  if (!casco) {
    return { ok: false, errors: [`El módulo ${modId} no tiene casco (tapa/lateral) para derivar el alzado`] };
  }
  const { ancho, alto, espesor, anchoInterior } = casco;
  const cfg = getGolaCfg(userConfig);
  const rectangulos = [];
  const sidePanels = [];
  let ladoAlterno = 0;

  const centroX = (w) => mm((ancho - w) / 2);

  for (const p of lista) {
    const rol = inferRole(p);
    const id = String(p.id);
    const w = Number(p.ancho) || 0;
    const h = Number(p.alto) || 0;
    const esp = Number(p.espesor) || espesor;
    const zNum = Number(p.pos_z);
    const etiqueta = `${mm(w)}×${mm(h)}`;

    if (ROLES_MOVILES.has(rol)) {
      if (!w || !h) continue;
      rectangulos.push({
        id, nombre: String(p.nombre || id), rol,
        x: centroX(w), z: mm(Number.isFinite(zNum) ? zNum : 0),
        ancho: mm(w), alto: mm(h),
        fija: false, etiqueta,
      });
      continue;
    }

    if (!ROLES_FIJOS.has(rol)) continue;

    switch (rol) {
      case 'side_panel': {
        sidePanels.push(p);
        const ref = `${id} ${p.nombre || ''}`.toLowerCase();
        const esIzq = /izq|izquierd/.test(ref)
          ? true
          : /der|derech/.test(ref)
            ? false
            : (ladoAlterno++ % 2 === 0);
        const x = esIzq ? 0 : mm(ancho - esp);
        rectangulos.push({
          id, nombre: String(p.nombre || id), rol,
          x, z: 0, ancho: mm(esp), alto: mm(alto),
          fija: true, etiqueta,
        });
        break;
      }
      case 'top_panel':
        rectangulos.push({
          id, nombre: String(p.nombre || id), rol,
          x: 0, z: mm(alto - esp), ancho: mm(ancho), alto: mm(esp),
          fija: true, etiqueta,
        });
        break;
      case 'bottom_panel':
        rectangulos.push({
          id, nombre: String(p.nombre || id), rol,
          x: 0, z: 0, ancho: mm(ancho), alto: mm(esp),
          fija: true, etiqueta,
        });
        break;
      case 'back_panel':
        // El fondo va detrás de todo: se dibuja primero con baja opacidad.
        rectangulos.push({
          id, nombre: String(p.nombre || id), rol,
          x: 0, z: 0, ancho: mm(ancho), alto: mm(alto),
          fija: true, etiqueta, trasera: true,
        });
        break;
      case 'gola_strip': {
        // Pestañas: su 'alto' es la PROFUNDIDAD de la tira; en el plano X-Z
        // su altura vertical es el espesor (15), anclada en su pos_z.
        if (esPestanaGola(p)) {
          rectangulos.push({
            id, nombre: String(p.nombre || id), rol,
            x: centroX(w), z: mm(Number.isFinite(zNum) ? zNum : 0),
            ancho: mm(w), alto: mm(esp),
            fija: true, etiqueta,
          });
        } else {
          rectangulos.push({
            id, nombre: String(p.nombre || id), rol,
            x: centroX(w), z: mm(Number.isFinite(zNum) ? zNum : 0),
            ancho: mm(w), alto: mm(h),
            fija: true, etiqueta,
          });
        }
        break;
      }
      default: {
        // shelf / divider / brace / hanger_rail / panel: pieza horizontal
        // anclada por pos_z; sin pos_z no es proyectable de forma fiable.
        if (!Number.isFinite(zNum)) break;
        rectangulos.push({
          id, nombre: String(p.nombre || id), rol,
          x: centroX(w), z: mm(zNum),
          ancho: mm(w), alto: mm(esp),
          fija: true, etiqueta,
        });
      }
    }
  }

  // Cotas principales (mm). `nivel` apila las líneas de cota en el margen
  // inferior (0 = más externa) para que ancho total e interior no choquen.
  const cotas = [
    { eje: 'x', inicio: 0, fin: mm(ancho), valor: mm(ancho), etiqueta: `Ancho total ${mm(ancho)}`, nivel: 0 },
    { eje: 'x', inicio: mm(espesor), fin: mm(ancho - espesor), valor: mm(anchoInterior), etiqueta: `Ancho interior ${mm(anchoInterior)}`, nivel: 1 },
    { eje: 'z', inicio: 0, fin: mm(alto), valor: mm(alto), etiqueta: `Alto total ${mm(alto)}`, nivel: 0 },
  ];

  // Marcas de posición Z de frentes (móviles) y tiras gola (fijas), ordenadas
  // de abajo arriba; referencia para el trazado de ticks en el margen izq.
  const marcas = rectangulos
    .filter((r) => r.rol === 'drawer_face' || r.rol === 'door' || r.rol === 'gola_strip')
    .map((r) => ({ valor: r.z, etiqueta: `${r.id} · z=${r.z}`, refId: r.id, fija: r.fija }))
    .sort((a, b) => a.valor - b.valor);

  const fijas = rectangulos.filter((r) => r.fija && !r.trasera).length;
  const moviles = rectangulos.filter((r) => !r.fija).length;

  return {
    ok: true,
    moduleId: modId,
    ancho: mm(ancho),
    alto: mm(alto),
    espesor: mm(espesor),
    anchoInterior: mm(anchoInterior),
    holguraLateralGola: mm(cfg.golaHolguraLateral),
    rectangulos,
    cotas,
    marcas,
    leyenda: { fijas, moviles },
  };
}
