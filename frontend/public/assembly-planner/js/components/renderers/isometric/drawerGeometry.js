/**
 * Geometría de cajones: frentes apilados por zonas verticales (con pos_z
 * anclado o flotante), cajas reales del CSV o sintéticas, extracción por
 * riel (traslación +y) o volquete (rotación bisagra) y tiradores.
 * Emite warnings ergonómicos en renderer.warnings cuando una pila excede
 * su vano y se dibuja escalada.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { ROLE_COLORS, VERTICAL_POSITIONS } from '../../../core/config.js';
import { inferRole } from '../../../services/classifierService.js';
import { buildDrawerBoxGeometries, hasRealDrawerBox, matchDrawerBoxParts } from '../../../services/drawerGeometryService.js';
import { getPieceDims } from '../../../services/geometryService.js';
import {
  calculateVerticalZones,
  drawerRank,
} from '../../../services/isoGeometryService.js';
import {
  applyApertureToGeo,
  motionConfigFor,
  opennessFor,
} from '../../../services/motionService.js';
import { getRailType, railTypeFor } from '../../../services/railService.js';
import { normalizeName } from '../../../utils/normalize.js';
import { aperturaEfectivaGlobal } from './apertures.js';

export function buildDrawerGeometries(renderer, roles, moduleW, moduleD, moduleH, thickness, family, shelfPositions = [], bottomPanelOffset = 0, topPanelOffset = null) {
  const geometries = [];
  const faces = roles.filter((p) => inferRole(p) === 'drawer_face');
  if (!faces.length) return geometries;
  // Piezas reales ya emparejadas a un frente: se excluyen de los siguientes
  // emparejamientos para que dos frentes no compartan la misma caja.
  const consumed = new Set();

  // Ubicar cada cajón dentro del hueco (zona) que le corresponde.
  // Las zonas están definidas por base/tapa/repisas. shelfPositions se
  // calcula una sola vez en buildModuleGeometries y se reutiliza aquí.
  const hasBottom = roles.some((p) => inferRole(p) === 'bottom_panel');
  const hasTop = roles.some((p) => inferRole(p) === 'top_panel');
  const zones = calculateVerticalZones(moduleH, thickness, shelfPositions, hasBottom, hasTop, bottomPanelOffset, topPanelOffset);

  const dims = faces.map((f) => ({ face: f, ...getPieceDims(f, 'drawer_face', thickness, family) }));
  // Ordenar: superior → medio → inferior
  dims.sort((a, b) => drawerRank(a.face) - drawerRank(b.face));

  // Frentes anclados con pos_z explícito (borde inferior absoluto, misma
  // convención que barras/puertas/piezas sueltas): se excluyen del apilado
  // por zonas y se emiten como grupo propio con una zona sintética exacta
  // [pos_z, pos_z+h] → scale 1, gap 0, currentZ = pos_z.
  const anchoredDims = dims.filter((d) => Number.isFinite(d.face.pos_z));
  const floatingDims = dims.filter((d) => !Number.isFinite(d.face.pos_z));

  const zoneGroups = zones.map(() => []);
  // Zona del grupo de rango medio (sin 'superior'/'inferior' en el nombre):
  // el vano MAS ALTO disponible. La torre de cajones vive en el hueco mayor
  // entre repisas fijas; floor(zones/2) con 2 o 4 zonas los metía en un
  // hueco pequeño, los escalaba hasta solapar las cajas (barrido
  // drawerCollisionSweep).
  let tallestZone = 0;
  for (let zi = 1; zi < zones.length; zi++) {
    if (zones[zi].yEnd - zones[zi].yStart > zones[tallestZone].yEnd - zones[tallestZone].yStart) tallestZone = zi;
  }
  floatingDims.forEach((d) => {
    const rank = drawerRank(d.face);
    let idx;
    if (rank <= 10) idx = zones.length - 1;          // superior → última zona (más alta)
    else if (rank >= 90) idx = 0;                      // inferior → primera zona (más baja)
    else idx = tallestZone;
    zoneGroups[idx].push(d);
  });
  anchoredDims.forEach((d) => {
    const z0 = Number(d.face.pos_z);
    zoneGroups.push([d]);
    zones.push({ yStart: z0, yEnd: z0 + d.h });
  });

  zoneGroups.forEach((group, zi) => {
    if (!group.length) return;
    const zone = zones[zi];
    const zoneH = Math.max(0, zone.yEnd - zone.yStart);
    const totalH = group.reduce((s, d) => s + d.h, 0);
    const stackGap = renderer.verticalPositionOverrides?.stackGap ?? VERTICAL_POSITIONS.stackGap;
    const distributedGap = group.length > 0 ? (zoneH - totalH) / (group.length + 1) : 0;
    const gap = totalH < zoneH ? Math.min(stackGap, distributedGap) : 0;
    const scale = totalH > zoneH ? zoneH / totalH : 1;
    if (scale < 1) {
      // Antes el escalado era silencioso: el 3D mostraba cajones más bajos
      // de lo diseñado sin avisar. Se conserva el ajuste para no solapar
      // las cajas, pero se reporta (índice estable del grupo en la lista de
      // zonas original: las zonas sintéticas pos_z se anexan al final).
      const nombres = group.map((d) => `"${d.face.nombre}"`).join(', ');
      renderer.warnings.push(
        `La pila de cajones (${Math.round(totalH)} mm) excede el vano disponible (${Math.round(zoneH)} mm): ${nombres} se dibuja escalada. Reduzca frentes o aumente el vano.`
      );
    }
    let currentZ = zone.yStart + gap;

    group.forEach((d) => {
      const h = d.h * scale;
      const w = d.w;
      const x = (moduleW - w) / 2;
      const drawerDepth = Math.max(0, moduleD - 2 * thickness - 10);
      const yFace = moduleD - thickness + renderer.drawerGap;
      // Apertura del cajón: se toma del frente (override por pieza o global).
      // - Rail (cajón/zapatera): traslación +y con el MISMO Δy para todo el
      //   grupo (movimiento rígido derivado del frente).
      // - Hinge inf (volquete/abatible): rotación rígida del grupo entero
      //   alrededor de la bisagra inferior-frontal del frente (pivot
      //   absoluto en coords de mundo; pivot.y = cara frontal).
      const drawerOpen = opennessFor(d.face.id, renderer.aperturas, aperturaEfectivaGlobal(renderer.aperturaGlobal, renderer.doorAngle));
      const faceCfg = motionConfigFor(d.face);
      // Tipo de riel inferido del frente: fija la fracción de extracción y
      // la holgura lateral de la caja (RAIL_TYPES).
      const railType = railTypeFor(d.face);
      let rail;
      if (faceCfg && faceCfg.kind === 'hinge') {
        const faceBase = { x, y: yFace, z: currentZ, w, d: thickness, h };
        const moved = applyApertureToGeo(faceBase, faceCfg, drawerOpen, renderer.angulos?.[d.face.id]);
        const rotation = moved.rotation
          ? { ...moved.rotation, pivot: { ...moved.rotation.pivot, y: yFace + thickness } }
          : null;
        rail = (geo) => (rotation ? { ...geo, rotation } : geo);
      } else {
        // Extracción según el tipo de riel: Δy = apertura·extracción·
        // (profundidad del cajón + 20 mm); con extensión total (1.0) la
        // caja sale del todo del mueble al abrirse.
        const railDy = drawerOpen * getRailType(railType).extraction * (drawerDepth + 20);
        rail = (geo) => (railDy ? { ...geo, y: geo.y + railDy } : geo);
      }

      // Frente del cajón
      geometries.push(rail({
        x, y: yFace, z: currentZ, w, d: thickness, h,
        color: d.face.color, role: 'drawer_face', name: d.face.nombre, id: d.face.id,
        overflow: scale < 1,
      }));

      // Caja del cajón: piezas reales (laterales/base/fondo del CSV) cuando
      // forman el conjunto mínimo (2 laterales + base); si no, caja
      // sintética como fallback. En ambos casos el MISMO transform `rail`
      // (traslación rail o rotation volquete) mueve la caja con el frente.
      const drawerBox = matchDrawerBoxParts(d.face, roles.filter((p) => !consumed.has(p.id)));
      if (hasRealDrawerBox(drawerBox)) {
        const boxGeos = buildDrawerBoxGeometries({
          parts: drawerBox, x, yFace, z: currentZ, w, h, thickness, fallbackDepth: drawerDepth, railType,
        });
        boxGeos.forEach((g) => consumed.add(g.id));
        boxGeos.forEach((g) => geometries.push(rail(g)));
      } else {
        // Laterales del cajón: holgura del riel por lado (RAIL_TYPES); la
        // oculta (clear 0) dibuja los laterales al ras del vano.
        const sideH = Math.max(0, h - 2 * thickness);
        const sideColor = d.face.color;
        const clear = getRailType(railType).sideClearance || 0;
        geometries.push(
          rail({
            x: x + thickness + clear, y: 0, z: currentZ + thickness, w: thickness, d: drawerDepth, h: sideH,
            color: sideColor, role: 'drawer_side', name: 'Lateral cajón', id: `${d.face.id}-side`, opacity: 0.5,
          }),
          rail({
            x: x + w - 2 * thickness - clear, y: 0, z: currentZ + thickness, w: thickness, d: drawerDepth, h: sideH,
            color: sideColor, role: 'drawer_side', name: 'Lateral cajón', id: `${d.face.id}-side2`, opacity: 0.5,
          })
        );

        // Base del cajón
        geometries.push(rail({
          x: x + thickness + clear, y: 0, z: currentZ + thickness, w: w - 2 * thickness - 2 * clear, d: drawerDepth, h: thickness,
          color: sideColor, role: 'drawer_bottom', name: 'Base cajón', id: `${d.face.id}-bottom`, opacity: 0.5,
        }));

        // Fondo del cajón
        geometries.push(rail({
          x: x + thickness + clear, y: drawerDepth - thickness, z: currentZ + thickness, w: w - 2 * thickness - 2 * clear, d: thickness, h: sideH,
          color: sideColor, role: 'drawer_back', name: 'Fondo cajón', id: `${d.face.id}-back`, opacity: 0.4,
        }));
      }

      // Tirador
      const faceIdPrefix = d.face.id.split('-').slice(0, -1).join('-');
      const handle = roles.find((p) =>
        inferRole(p) === 'handle' &&
        !renderer._doorHandleIds?.has(p.id) &&
        (p.id.startsWith(faceIdPrefix) || normalizeName(p.nombre).includes(normalizeName(d.face.nombre)))
      );
      if (handle) {
        const hx = x + w / 2 - 15;
        const hz = currentZ + h / 2 - 10;
        geometries.push(rail({
          x: hx, y: moduleD + renderer.drawerGap, z: hz, w: 30, d: 10, h: 20,
          color: handle.color || ROLE_COLORS.handle, role: 'handle', name: handle.nombre, id: handle.id,
        }));
      }

      currentZ += h + gap;
    });
  });

  return geometries;
}
