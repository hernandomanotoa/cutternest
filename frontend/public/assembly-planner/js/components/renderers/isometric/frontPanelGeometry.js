/**
 * Geometría de paneles frontales (puertas y vidrios): apilado vertical por
 * columnas (izquierda/centro/derecha) y zonas (superior/medio/inferior),
 * con tiradores emparejados.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { ROLE_COLORS, VERTICAL_POSITIONS } from '../../../core/config.js';
import { inferRole } from '../../../services/classifierService.js';
import { getPieceDims } from '../../../services/geometryService.js';
import { inferDoorX } from '../../../services/isoGeometryService.js';
import { normalizeName } from '../../../utils/normalize.js';
import { findPairedHandle } from './handleMatching.js';

export function buildFrontPanelGeometries(renderer, panels, moduleW, moduleD, moduleH, thickness, family, bottomPanelOffset = 0, topPanelOffset = null, allRoles = []) {
  const overrides = renderer.verticalPositionOverrides || {};
  const t = Number(thickness) || 15;
  const gap = overrides.doorGap ?? VERTICAL_POSITIONS.doorGap;
  const topInset = overrides.doorTopInset ?? VERTICAL_POSITIONS.doorTopInset;
  const bottomOffset = overrides.doorBaseOffset ?? VERTICAL_POSITIONS.doorBaseOffset;
  const baseTop = bottomPanelOffset + t;
  const topLimit = Number.isFinite(topPanelOffset) ? topPanelOffset : moduleH - t;

  const items = panels.map((piece) => {
    const role = inferRole(piece);
    const dims = getPieceDims(piece, role, thickness, family);
    const w = dims.w || moduleW - 2 * thickness;
    const h = dims.h || moduleH - 2 * thickness;
    const x = inferDoorX(piece, moduleW, w, thickness);
    const n = normalizeName(piece.nombre);
    const id = normalizeName(piece.id);
    const text = `${n} ${id}`;
    let column = 'center';
    if (n.includes('izquierda') || n.includes('izq') || id.includes('izq')) column = 'left';
    else if (n.includes('derecha') || n.includes('der') || id.includes('der')) column = 'right';
    let zone = 'middle';
    if (text.includes('superior') || text.includes('sup')) zone = 'top';
    else if (text.includes('inferior') || text.includes('inf') || text.includes('bajo')) zone = 'bottom';
    return { piece, role, x, w, h, column, zone, hasPosZ: Number.isFinite(piece.pos_z), posZ: Number(piece.pos_z) };
  });

  // Agrupar por columna (izquierda/centro/derecha): solo se apilan los
  // paneles que comparten columna (ej. puerta superior + puerta inferior).
  const groups = new Map();
  items.forEach((it) => {
    if (!groups.has(it.column)) groups.set(it.column, []);
    groups.get(it.column).push(it);
  });

  const geos = [];
  groups.forEach((group) => {
    const tops = group.filter((i) => i.zone === 'top');
    const bottoms = group.filter((i) => i.zone === 'bottom');
    const middles = group.filter((i) => i.zone === 'middle');
    const zMap = new Map();

    let topY = topLimit - topInset;
    tops.slice().sort((a, b) => b.h - a.h).forEach((it) => {
      const z = it.hasPosZ ? it.posZ : topY - it.h;
      zMap.set(it, z);
      topY = z - gap;
    });

    let bottomY = baseTop + bottomOffset;
    bottoms.slice().sort((a, b) => a.h - b.h).forEach((it) => {
      const z = it.hasPosZ ? it.posZ : bottomY;
      zMap.set(it, z);
      bottomY = z + it.h + gap;
    });

    const middleTop = tops.length ? topY + gap : topLimit - topInset;
    const middleBottom = bottoms.length ? bottomY - gap : baseTop + bottomOffset;
    const available = Math.max(0, middleTop - middleBottom);
    const totalH = middles.reduce((s, i) => s + i.h, 0);
    const n = middles.length;
    const middleGap = n > 1 ? Math.min(gap, Math.max(0, (available - totalH) / (n - 1))) : 0;
    let cur = middleBottom + (n > 1 ? 0 : Math.max(0, (available - totalH) / 2));
    middles.slice().sort((a, b) => a.h - b.h).forEach((it) => {
      const z = it.hasPosZ ? it.posZ : cur;
      zMap.set(it, z);
      cur = z + it.h + middleGap;
    });

    group.forEach((it) => {
      const z = zMap.get(it);
      const baseGeo = {
        x: it.x, y: moduleD, z, w: it.w,
        d: it.role === 'glass' ? (Number(it.piece.espesor) || thickness) : thickness,
        h: it.h,
        color: it.piece.color, role: it.role, name: it.piece.nombre, id: it.piece.id,
        opacity: it.role === 'glass' ? 0.3 : 0.35,
      };
      geos.push(baseGeo);

      // Tirador de puerta: geo propia centrada en el frente. Recibe el
      // transform de la puerta (rotation/Δx) en la pasada final de apertura.
      if (it.role === 'door') {
        const handle = findPairedHandle(it.piece, allRoles);
        if (handle && !geos.some((g) => g.id === handle.id)) {
          geos.push({
            x: it.x + it.w / 2 - 15,
            y: moduleD + (Number(it.piece.espesor) || thickness),
            z: z + it.h / 2 - 10,
            w: 30, d: 10, h: 20,
            color: handle.color || ROLE_COLORS.handle, role: 'handle', name: handle.nombre, id: handle.id,
          });
        }
      }
    });
  });

  return geos;
}
