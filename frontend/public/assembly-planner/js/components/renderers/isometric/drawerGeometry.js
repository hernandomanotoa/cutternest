/**
 * Geometría de cajones: frentes apilados por zonas verticales (con pos_z
 * anclado o flotante), cajas reales del CSV o sintéticas, extracción por
 * riel (traslación +y) o volquete (rotación bisagra) y tiradores.
 * Emite warnings ergonómicos en renderer.warnings cuando una pila excede
 * su vano y se dibuja escalada.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { ROLE_COLORS, VERTICAL_POSITIONS } from '../../../core/config.js';
import { fondoMetodoDeTipo, tipoTagDe, rielTagDe } from '../../../core/contentTypes.js';
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

/**
 * drawerGap efectivo del renderer en mm. Además del numérico (15 tapajunta,
 * 0 a ras) acepta 'interno': frente retranqueado UN ESPESOR completo
 * (yFace = moduleD − 2·E), de modo que queda entre los laterales y la gola
 * lo acompaña detrás de su plano. Centraliza la conversión para
 * drawerGeometry y golaGeometry.
 */
export function effectiveDrawerGap(drawerGap, thickness = 15) {
  if (drawerGap === 'interno') return -Math.abs(thickness || 15);
  return drawerGap ?? 15;
}

export function buildDrawerGeometries(renderer, roles, moduleW, moduleD, moduleH, thickness, family, shelfPositions = [], bottomPanelOffset = 0, topPanelOffset = null) {  const geometries = [];
  const frentes = roles.filter((p) => inferRole(p) === 'drawer_face');
  // Zapatera sin frente (bandeja abierta): la cara del cuerpo hace de frente
  // visible. Una cara solo se promueve cuando su unidad (prefijo) NO tiene
  // frente propio; las caras de cajón con frente siguen siendo drawer_part.
  const prefsConFrente = new Set(frentes.map((f) => String(f.id).replace(/-frente-\d+$|-frente$/, '')));
  const carasSueltas = roles.filter((p) => inferRole(p) === 'drawer_part'
    && /cara/.test(`${p.nombre} ${p.id}`)
    && !prefsConFrente.has(String(p.id).replace(/-cara$/, '')));
  const faces = [...frentes, ...carasSueltas];
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

  // Tope real del hueco vertical (sin las zonas sintéticas pos_z anexadas):
  // altura útil total del módulo entre base y tapa.
  const coreZoneEnd = zones.length > anchoredDims.length
    ? zones[zones.length - anchoredDims.length - 1].yEnd
    : zones[zones.length - 1].yEnd;

  zoneGroups.forEach((group, zi) => {
    if (!group.length) return;
    const zone = zones[zi];
    const zoneH = Math.max(0, zone.yEnd - zone.yStart);
    const totalH = group.reduce((s, d) => s + d.h, 0);
    // Fila horizontal: cuando los frentes NO caben apilados en su zona pero
    // juntos sí quepan a lo ancho del vano, se distribuyen en columna (caso
    // cajones en fila tipo buro/comoda). Sin pos_z no hay otra señal de la
    // disposición diseñada; apilado sigue siendo el default cuando cabe.
    const vanoW = Math.max(0, moduleW - 2 * thickness);
    const totalW = group.reduce((s, d) => s + d.w, 0);
    const fila = group.length > 1 && totalH > zoneH && totalW <= vanoW;
    const stackGap = renderer.verticalPositionOverrides?.stackGap ?? VERTICAL_POSITIONS.stackGap;
    const distributedGap = group.length > 0 ? (zoneH - totalH) / (group.length + 1) : 0;
    const gap = totalH < zoneH ? Math.min(stackGap, distributedGap) : 0;
    let scale = totalH > zoneH && !fila ? zoneH / totalH : 1;
    if (fila) {
      // Cada frente centrado en TODA la altura útil del módulo; si ni así
      // cabe, se escala (mismo warning que el apilado).
      const fullH = Math.max(0, coreZoneEnd - zones[0].yStart);
      const maxH = Math.max(...group.map((d) => d.h));
      if (maxH > fullH) scale = fullH / maxH;
      renderer.warnings.push(
        `Los frentes no caben apilados en el vano (${Math.round(totalH)} mm en ${Math.round(zoneH)} mm); se dibujan en fila horizontal.`
      );
    }
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
    const fullZoneH = Math.max(0, coreZoneEnd - zones[0].yStart);
    // En fila: gap igual entre frentes repartiendo el ancho sobrante del vano.
    const gapFila = fila && group.length > 0
      ? Math.max(0, vanoW - totalW) / (group.length + 1)
      : 0;
    let filaCursor = thickness + gapFila;

    group.forEach((d) => {
      const h = d.h * scale;
      const w = d.w;
      const x = fila ? filaCursor : (moduleW - w) / 2;
      if (fila) filaCursor += w + gapFila;
      const zBase = fila
        ? zones[0].yStart + Math.max(0, (fullZoneH - h) / 2)
        : currentZ;
      const drawerDepth = Math.max(0, moduleD - 2 * thickness - 10);
      const yFace = moduleD - thickness + effectiveDrawerGap(renderer.drawerGap, thickness);
      // Fondo del módulo (embutido, [0..E]) + holgura configurada (default 10
      // mm): la caja no debe pasarlo sea cual sea el modo de frentes. Las
      // piezas generadas por el Constructor ya traen la profundidad retrasada
      // (ras/interno); el clamp cubre datos de otro modo (legado tapajunta
      // visto en ras/interno) y avisa para regenerar.
      const holguraFondo = Math.max(0, Number(renderer.verticalPositionOverrides?.holguraFondoCajon ?? 10));
      const profMax = Math.max(0, yFace - thickness - holguraFondo);
      const clampProf = (prof) => {
        const p = Math.max(0, Math.min(prof, profMax));
        if (prof > profMax + 0.5) {
          renderer.warnings.push(
            `La caja de "${d.face.nombre}" (${Math.round(prof)} mm) no cabe detrás del frente en el modo actual (hasta el fondo caben ${Math.round(profMax)} mm): se dibuja ajustada. Regenere el contenido (editar módulo) para cortarla a medida.`
          );
        }
        return p;
      };
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
        const faceBase = { x, y: yFace, z: zBase, w, d: thickness, h };
        const moved = applyApertureToGeo(faceBase, faceCfg, drawerOpen, renderer.angulos?.[d.face.id]);
        const rotation = moved.rotation
          ? { ...moved.rotation, pivot: { ...moved.rotation.pivot, y: yFace + thickness } }
          : null;
        rail = (geo) => (rotation ? { ...geo, rotation } : geo);
      } else {
        // Extracción según el tipo de riel: Δy = apertura·extracción·
        // (profundidad REAL de la caja + 20 mm); con extensión total (1.0)
        // la caja sale justo del todo del mueble. La profundidad real sale
        // de los laterales del conjunto (no de la sintética del fallback).
        const drawerBoxPre = matchDrawerBoxParts(d.face, roles.filter((p) => !consumed.has(p.id)));
        const profReal = clampProf(hasRealDrawerBox(drawerBoxPre)
          ? Math.max(...drawerBoxPre.laterales.map((lat) => Number(lat.ancho) || 0))
          : drawerDepth);
        const railDy = drawerOpen * getRailType(railType).extraction * (profReal + 20);
        rail = (geo) => (railDy ? { ...geo, y: geo.y + railDy } : geo);
      }

      // Frente del cajón
      geometries.push(rail({
        x, y: yFace, z: zBase, w, d: thickness, h,
        color: d.face.color, role: 'drawer_face', name: d.face.nombre, id: d.face.id,
        overflow: scale < 1,
      }));

      // Caja del cajón: piezas reales (laterales/base/fondo del CSV) cuando
      // forman el conjunto mínimo (2 laterales + base); si no, caja
      // sintética como fallback. En ambos casos el MISMO transform `rail`
      // (traslación rail o rotation volquete) mueve la caja con el frente.
      const drawerBox = matchDrawerBoxParts(d.face, roles.filter((p) => !consumed.has(p.id)));
      if (hasRealDrawerBox(drawerBox)) {
        // Método del fondo: del contrato [tipo] del frente (los customs
        // inyectados en DRAWER_TYPES también resuelven). Sin tag → 'apoyado'
        // (comportamiento histórico, detección por datos).
        const fondoMetodo = fondoMetodoDeTipo(tipoTagDe(d.face?.nombre));
        const boxGeos = buildDrawerBoxGeometries({
          parts: drawerBox, x, yFace, z: zBase, w, h, thickness, fallbackDepth: drawerDepth, railType,
          rielHolgura: rielTagDe(d.face?.nombre),
          fondoMetodo,
          maxDepth: profMax,
        });
        boxGeos.forEach((g) => consumed.add(g.id));
        boxGeos.forEach((g) => geometries.push(rail(g)));
      } else {
        // Laterales del cajón: holgura del riel por lado (RAIL_TYPES); la
        // oculta (clear 0) dibuja los laterales al ras del vano. Profundidad
        // sintética clampada al espacio real hasta el fondo (modo de frentes).
        const sideH = Math.max(0, h - 2 * thickness);
        const sideColor = d.face.color;
        const clear = getRailType(railType).sideClearance || 0;
        const synthDepth = clampProf(drawerDepth);
        geometries.push(
          rail({
            x: x + thickness + clear, y: 0, z: zBase + thickness, w: thickness, d: synthDepth, h: sideH,
            color: sideColor, role: 'drawer_side', name: 'Lateral cajón', id: `${d.face.id}-side`, opacity: 0.5,
          }),
          rail({
            x: x + w - 2 * thickness - clear, y: 0, z: zBase + thickness, w: thickness, d: synthDepth, h: sideH,
            color: sideColor, role: 'drawer_side', name: 'Lateral cajón', id: `${d.face.id}-side2`, opacity: 0.5,
          })
        );

        // Base del cajón
        geometries.push(rail({
          x: x + thickness + clear, y: 0, z: zBase + thickness, w: w - 2 * thickness - 2 * clear, d: synthDepth, h: thickness,
          color: sideColor, role: 'drawer_bottom', name: 'Base cajón', id: `${d.face.id}-bottom`, opacity: 0.5,
        }));

        // Fondo del cajón
        geometries.push(rail({
          x: x + thickness + clear, y: synthDepth - thickness, z: zBase + thickness, w: w - 2 * thickness - 2 * clear, d: thickness, h: sideH,
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
        const hz = zBase + h / 2 - 10;
        geometries.push(rail({
          x: hx, y: moduleD + effectiveDrawerGap(renderer.drawerGap, thickness), z: hz, w: 30, d: 10, h: 20,
          color: handle.color || ROLE_COLORS.handle, role: 'handle', name: handle.nombre, id: handle.id,
        }));
      }

      if (!fila) currentZ += h + gap;
    });
  });

  return geometries;
}
