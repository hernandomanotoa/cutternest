/**
 * Geometrías de piezas globales (zócalo, corona/tapa, fondo, espejo,
 * puertas y piezas genéricas) compartidas entre módulos.
 * Extraído de isometricRenderer.js — refactor puro, misma lógica.
 */

import { ROLE_COLORS, VERTICAL_POSITIONS } from '../../../core/config.js';
import { inferRole } from '../../../services/classifierService.js';
import { plinthLayoutFromPieces, divparLayoutFromPieces } from '../../../services/plinthFrameService.js';
import { normalizeName } from '../../../utils/normalize.js';
import { findPairedHandle, isHandlePiece } from './handleMatching.js';

export function buildGlobalGeometries(renderer, globalPieces, moduleW, moduleD, moduleH, thickness, includeDoors = true, zocaloHeight = 0, moduleSpans = null) {
  const geometries = [];
  const globalDoors = [];
  // Modelo de zócalo: si el zócalo global incluye laterales (rol
  // 'plinth_side', ver classifierService), es un cajón de zócalo completo
  // sin base (patrón real de fabricación "zócalo full-width + módulos con
  // su propia base encima"): se dibuja como cajón visible a cara del
  // mueble, con el frente y el trasero como bandas z:0..zocaloHeight y los
  // laterales a profundidad completa. La base del primer módulo (apoyada a
  // z=zocaloHeight) hace de tapa del cajón. Sin laterales se conserva el
  // patín retranqueado clásico: frente solo, dibujado bajo el suelo.
  const plinthSides = globalPieces.filter((p) => inferRole(p) === 'plinth_side');
  const drawerPlinth = plinthSides.length > 0;
  const plinthH = drawerPlinth
    ? (zocaloHeight || Math.max(0, ...plinthSides.map((p) => Number(p.alto) || 0)))
    : 0;
  // Zócalo a marco (ver plinthFrameService): bandas derivadas de los frentes
  // (zócalo único, tramos de empalme a/b o N zócalos s{k}). Sobrevive el
  // round-trip CSV. `px`/`pw` mapean coordenadas lógicas a la vista; en
  // 'all' se usa el mapa real→visual por módulo (moduleSpans); sin mapa se
  // recae a la escala global.
  const bandLayout = drawerPlinth ? plinthLayoutFromPieces(globalPieces) : [];
  const plinthTotalW = bandLayout.reduce((s, b) => s + b.width, 0);
  const plinthScale = plinthTotalW > 0 ? moduleW / plinthTotalW : 1;
  // Vista completa: mapa real→visual por módulo. Cada módulo ocupa `width`
  // mm reales desde la posición visual `base`; los gaps quedan entre spans.
  const visX = moduleSpans?.length
    ? (logical) => {
      const L = Math.max(0, logical);
      let start = 0;
      for (const s of moduleSpans) {
        if (L <= start + s.width) return s.base + (L - start);
        start += s.width;
      }
      const last = moduleSpans[moduleSpans.length - 1];
      return last.base + (L - start);
    }
    : null;
  const px = (logical) => (visX ? visX(logical) : logical * plinthScale);
  const pw = (logical0, width) => (visX ? visX(logical0 + width) - visX(logical0) : width * plinthScale);
  const bandDe = (pieceId) => bandLayout.find((b) => b.pieceId === String(pieceId)) || null;
  const divparLayout = drawerPlinth ? divparLayoutFromPieces(globalPieces) : [];
  // Retraso configurable del frente del marco (efecto flotación), en mm.
  const plinthRecess = Number(renderer.verticalPositionOverrides?.plinthFrontRecess) || 0;

  // Costados y montantes de cada banda (por orden de id ↔ orden de banda).
  const costadosIzq = globalPieces.filter((p) => inferRole(p) === 'plinth_side' && /costado-izq$|lateral-izq$/.test(String(p.id)) && /costado/.test(String(p.id)));
  const costadosDer = globalPieces.filter((p) => inferRole(p) === 'plinth_side' && /costado-der$/.test(String(p.id)) && /costado/.test(String(p.id)));
  const montantes = globalPieces.filter((p) => inferRole(p) === 'plinth_side' && /-montante-\d+$/.test(String(p.id)));

  const pushSide = (side, x, t, isLeft) => {
    const isFront = renderer.isoFlip ? !isLeft : isLeft;
    geometries.push({
      x, y: 0, z: 0, w: t, d: moduleD, h: plinthH,
      color: side.color || ROLE_COLORS.wood, role: isFront ? 'side_panel_front' : 'side_panel_rear',
      name: side.nombre, id: side.id, opacity: 0.4,
    });
  };

  // Costados: si coinciden en cantidad con las bandas, uno por banda;
  // si no (catálogo legacy), extremos del moduleW.
  if (bandLayout.length && costadosIzq.length === bandLayout.length && costadosDer.length === bandLayout.length) {
    const ordenIzq = [...costadosIzq].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const ordenDer = [...costadosDer].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    bandLayout.forEach((band, i) => {
      const t = Number(ordenIzq[i].espesor) || thickness;
      pushSide(ordenIzq[i], px(band.x0), t, true);
      pushSide(ordenDer[i], px(band.x0 + band.width) - t, t, false);
    });
  } else {
    plinthSides.forEach((side) => {
      const sid = normalizeName(side.id);
      const isLeft = sid.includes('izquierdo') || sid.includes('izq');
      const t = Number(side.espesor) || thickness;
      pushSide(side, isLeft ? 0 : moduleW - t, t, isLeft);
    });
  }

  // Montantes interiores: en el CENTRO VISUAL de su banda (el centro lógico
  // no coincide con el visual cuando la banda cruza módulos: el skew isométrico
  // desplaza el mapeo).
  const bandIdxDe = (id) => {
    const m = String(id).match(/^glb-zocalo-s(\d+)-/);
    return m ? Number(m[1]) - 1 : 0;
  };
  montantes.forEach((mon) => {
    const bandIdx = bandIdxDe(mon.id);
    const band = bandLayout[bandIdx];
    if (!band) return;
    const jMatch = String(mon.id).match(/-montante-(\d+)$/);
    const j = jMatch ? Number(jMatch[1]) : 1;
    const nMon = montantes.filter((m2) => bandIdxDe(m2.id) === bandIdx).length;
    const t = Number(mon.espesor) || thickness;
    // Centro visual de su fracción de banda (el centro lógico no coincide
    // con el visual cuando la banda cruza módulos: el skew desplaza el mapeo).
    const x = px(band.x0) + (pw(band.x0, band.width) * j) / (nMon + 1) - t / 2;
    pushSide(mon, x, t, false);
  });

  // Divisiones paralelas al frente (bajo módulos de cajón/zapatera):
  // paneles a mitad de la profundidad, entre las caras interiores de los
  // costados de cada módulo. Apoyan el medio de la base del cajón.
  globalPieces.filter((p) => inferRole(p) === 'plinth_divider' && String(p.id).includes('-divpar-')).forEach((div) => {
    const m = String(div.id).match(/-divpar-(\d+)$/);
    const slot = m ? divparLayout[Number(m[1]) - 1] : null;
    if (!slot) return;
    const t = Number(div.espesor) || thickness;
    geometries.push({
      x: px(slot.x0) + t, y: moduleD / 2 - t / 2, z: 0,
      w: pw(slot.x0, slot.width) - 2 * t, d: t, h: plinthH,
      color: div.color || ROLE_COLORS.wood, role: 'back_panel',
      name: div.nombre, id: div.id, opacity: 0.25,
    });
  });

  globalPieces.forEach((p) => {
    const role = inferRole(p);
    const n = normalizeName(p.nombre);
    const color = p.color || ROLE_COLORS.wood;

    if (role === 'plinth_side' || role === 'plinth_divider') {
      // Ya dibujados en pasadas anteriores (necesitan plinthH / layout).
    } else if (drawerPlinth && (role === 'back_panel' || /-trasero(-[ab])?$/.test(String(p.id))) && n.includes('zocalo')) {
      // Trasero del cajón de zócalo: banda z:0..zocaloHeight en la cara
      // trasera. Con marco se dibuja como banda continua sobre el mapa; el
      // patrón de catálogo conserva su ancho propio.
      const w = Number(p.ancho) || moduleW;
      const t = Number(p.espesor) || thickness;
      const band = bandDe(String(p.id).replace(/-trasero/, '-frente'));
      // Tramo de empalme: el tramo A llega hasta la junta y el B arranca en
      // ella (sin costado intermedió); los demás van entre costados (−2t).
      const esA = /-a$/.test(String(p.id));
      const esB = /-b$/.test(String(p.id));
      const offL = band ? (esB ? 0 : t) : 0;
      const offR = band ? (esA ? 0 : t) : 0;
      geometries.push({
        x: band ? px(band.x0) + offL : 0, y: -t, z: 0,
        w: band ? pw(band.x0, band.width) - offL - offR : w, d: t, h: Number(p.alto) || plinthH,
        color, role: 'back_panel', name: p.nombre, id: p.id, opacity: 0.25,
      });
    } else if (role === 'bottom_panel' || n.includes('zocalo')) {
      const w = Number(p.ancho) || moduleW;
      if (drawerPlinth) {
        // Frente del cajón de zócalo: banda visible z:0..zocaloHeight,
        // retrasada `plinthRecess` mm (efecto de flotación); el patrón de
        // catálogo sigue al ras (recess = 0) y con su ancho propio.
        const t = Number(p.espesor) || thickness;
        const band = bandDe(p.id);
        const esA = /-a$/.test(String(p.id));
        const esB = /-b$/.test(String(p.id));
        const offL = band ? (esB ? 0 : t) : 0;
        const offR = band ? (esA ? 0 : t) : 0;
        geometries.push({
          x: band ? px(band.x0) + offL : 0, y: moduleD - t - (band ? plinthRecess : 0), z: 0,
          w: band ? pw(band.x0, band.width) - offL - offR : w, d: t, h: Number(p.alto) || plinthH,
          color, role: 'plinth', name: p.nombre, id: p.id,
        });
      } else {
        const d = Number(p.alto) || 100;
        geometries.push({
          x: 0, y: moduleD - d, z: -d, w, d, h: d,
          color, role: 'bottom_panel', name: p.nombre, id: p.id,
        });
      }
    } else if (role === 'top_panel') {
      const w = Number(p.ancho) || moduleW;
      const d = Number(p.alto) || moduleD;
      geometries.push({
        x: 0, y: 0, z: moduleH, w, d, h: thickness,
        color, role: 'top_panel', name: p.nombre, id: p.id,
      });
    } else if (role === 'back_panel') {
      const w = Number(p.ancho) || moduleW;
      const h = Number(p.alto) || moduleH;
      geometries.push({
        x: 0, y: -thickness, z: 0, w, d: thickness, h,
        color, role: 'back_panel', name: p.nombre, id: p.id, opacity: 0.25,
      });
    } else if (role === 'mirror') {
      // Espejo montado en la pared trasera, centrado en X y con offset desde tapa.
      const w = Number(p.ancho) || moduleW;
      const h = Number(p.alto) || 600;
      const zPos = Number.isFinite(p.pos_z)
        ? Number(p.pos_z)
        : Math.max(thickness, moduleH - thickness - h - (renderer.verticalPositionOverrides?.topInset ?? VERTICAL_POSITIONS.topInset));
      geometries.push({
        x: Math.max(0, (moduleW - w) / 2),
        y: -thickness,
        z: zPos,
        w, d: thickness, h,
        color, role: 'mirror', name: p.nombre, id: p.id, opacity: 0.45,
      });
    } else if (role === 'door') {
      // Puertas globales: solo se renderizan en vista completa o estructura global.
      // Los tiradores de puerta (rol 'door' por quirk del clasificador) no
      // cuentan: renderizan como geo de handle emparejada a su puerta.
      if (includeDoors && !isHandlePiece(p)) {
        globalDoors.push(p);
      }
    } else {
      // Pieza global genérica: caja según ancho/alto/espesor
      const w = Number(p.ancho) || moduleW;
      const d = Number(p.alto) || moduleD;
      const h = Number(p.espesor) || thickness;
      geometries.push({
        x: 0, y: 0, z: moduleH, w, d, h,
        color, role: 'brace', name: p.nombre, id: p.id, opacity: 0.8,
      });
    }
  });

  // Puertas globales: reparten el ancho total del módulo/mueble.
  // Si hay izquierda + derecha, cada una ocupa la mitad; si es una sola, todo.
  const doorCount = globalDoors.length;
  if (doorCount) {
    const doorGap = renderer.verticalPositionOverrides?.doorGap ?? VERTICAL_POSITIONS.doorGap;
    const availableW = Math.max(0, moduleW - (doorCount - 1) * doorGap);
    const doorW = doorCount >= 2 ? availableW / doorCount : moduleW;
    globalDoors.forEach((door, idx) => {
      const dn = normalizeName(door.nombre);
      const did = normalizeName(door.id);
      const isLeft = dn.includes('izquierdo') || dn.includes('izq') || did.includes('izquierdo') || did.includes('izq');
      const isRight = dn.includes('derecho') || dn.includes('der') || did.includes('derecho') || did.includes('der');
      let x = 0;
      if (doorCount >= 2) {
        if (isLeft) x = 0;
        else if (isRight) x = moduleW - doorW;
        else x = idx * (doorW + doorGap);
      }
      const h = Number(door.alto) || moduleH - 2 * thickness;
      const z = Number.isFinite(door.pos_z)
        ? Number(door.pos_z)
        : Math.max(thickness, moduleH - h - thickness - (renderer.verticalPositionOverrides?.doorTopInset ?? VERTICAL_POSITIONS.doorTopInset));
      const baseGeo = {
        x, y: moduleD, z, w: doorW, d: thickness, h,
        color: door.color || ROLE_COLORS.door, role: 'door', name: door.nombre, id: door.id,
        opacity: 0.35,
      };
      geometries.push(baseGeo);
      // Tirador de puerta global: geo propia; recibe el transform de la
      // puerta en la pasada final de apertura.
      const gHandle = findPairedHandle(door, globalPieces);
      if (gHandle && !geometries.some((g) => g.id === gHandle.id)) {
        geometries.push({
          x: x + doorW / 2 - 15,
          y: moduleD + (Number(door.espesor) || thickness),
          z: z + h / 2 - 10,
          w: 30, d: 10, h: 20,
          color: gHandle.color || ROLE_COLORS.handle, role: 'handle', name: gHandle.nombre, id: gHandle.id,
        });
      }
    });
  }

  return geometries;
}
