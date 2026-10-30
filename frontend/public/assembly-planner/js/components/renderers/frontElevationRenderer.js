// js/components/renderers/frontElevationRenderer.js — Dibuja en SVG los
// planos acotados de taller a partir de los modelos puros de
// frontElevationService.js (alzado frontal de un módulo) y
// golaSectionService.js (sección transversal de canales gola C y L).
// Componente sin estado: funciones puras string → string, con layout resuelto
// por svgEngine.js (patrón de los renderers existentes). Colores de
// core/config.js (sin hex hardcodeados).

import { CutterNestSvgEngine } from './svgEngine.js';
import { COLORS, ROLE_COLORS, DIMENSION_COLORS, UI_COLORS } from '../../core/config.js';

const FONT = "system-ui,sans-serif";
const TXT = COLORS.textDark;

function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function defs() {
  return `<defs>
    <marker id="cnfe-dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${DIMENSION_COLORS.arrow}"/></marker>
  </defs>`;
}

// Línea de cota horizontal (eje x) con flechas a ambos extremos.
function cotaX(x1, x2, y, etiqueta) {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${DIMENSION_COLORS.arrow}" stroke-width="1.2" marker-start="url(#cnfe-dim-arrow)" marker-end="url(#cnfe-dim-arrow)"/>
  <line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}" stroke="${DIMENSION_COLORS.arrow}" stroke-width="1"/>
  <line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}" stroke="${DIMENSION_COLORS.arrow}" stroke-width="1"/>
  <text x="${(x1 + x2) / 2}" y="${y + 16}" text-anchor="middle" fill="${DIMENSION_COLORS.text}" font-size="11" font-weight="700" font-family="${FONT}">${esc(etiqueta)} mm</text>`;
}

// Línea de cota vertical (eje z) con flechas a ambos extremos.
function cotaZ(z1, z2, x, etiqueta) {
  return `<line x1="${x}" y1="${z1}" x2="${x}" y2="${z2}" stroke="${DIMENSION_COLORS.arrow}" stroke-width="1.2" marker-start="url(#cnfe-dim-arrow)" marker-end="url(#cnfe-dim-arrow)"/>
  <line x1="${x - 5}" y1="${z1}" x2="${x + 5}" y2="${z1}" stroke="${DIMENSION_COLORS.arrow}" stroke-width="1"/>
  <line x1="${x - 5}" y1="${z2}" x2="${x + 5}" y2="${z2}" stroke="${DIMENSION_COLORS.arrow}" stroke-width="1"/>
  <text x="${x + 8}" y="${(z1 + z2) / 2}" text-anchor="start" fill="${DIMENSION_COLORS.text}" font-size="11" font-weight="700" font-family="${FONT}" transform="rotate(90 ${x + 8} ${(z1 + z2) / 2})">${esc(etiqueta)} mm</text>`;
}

/**
 * SVG del alzado frontal acotado de un módulo (modelo de
 * frontElevationService.buildFrontElevation). El layout de los rectángulos
 * lo resuelve CutterNestSvgEngine (coordenadas explícitas en mm); las cotas,
 * marcas de posición Z y la leyenda se dibujan alrededor.
 *
 * @param {object} modelo modelo ok:true de buildFrontElevation.
 * @returns {string} SVG listo para insertar o exportar.
 */
export function renderFrontElevationSvg(modelo) {
  const { ancho, alto, rectangulos, cotas, marcas, moduleId } = modelo;
  const MARGEN_IZQ = 150;
  const MARGEN_DER = 90;
  const MARGEN_SUP = 34;
  const MARGEN_INF = 130;

  const engine = new CutterNestSvgEngine();
  engine.addNode('modulo', { w: ancho, h: alto, type: 'container', color: 'none' });
  for (const r of rectangulos) {
    engine.addNode(r.id, {
      w: r.ancho,
      h: r.alto,
      type: r.rol,
      color: ROLE_COLORS[r.rol] || ROLE_COLORS.default,
      parent: 'modulo',
      constraints: { marginX: r.x, offsetY: alto - r.z - r.alto },
      overlapAllowed: true,
    });
  }
  engine.solveLayout();
  const nodo = (id) => engine.graph.get(id);

  const orgX = MARGEN_IZQ;
  const orgY = MARGEN_SUP; // esquina superior del módulo en pantalla
  // svgY(z) = orgY + (alto − z); las cotas en margen derecho se dibujan en
  // coordenadas de pantalla directamente.
  const yTop = orgY;
  const yBottom = orgY + alto;

  let svg = `<svg viewBox="0 0 ${MARGEN_IZQ + ancho + MARGEN_DER} ${MARGEN_SUP + alto + MARGEN_INF}" xmlns="http://www.w3.org/2000/svg" style="background:${UI_COLORS.white};width:100%;max-width:900px;height:auto;display:block;">
  ${defs()}
  <text x="${orgX}" y="20" fill="${TXT}" font-size="14" font-weight="700" font-family="${FONT}">Alzado frontal — Módulo ${esc(moduleId)} — ${esc(ancho)} × ${esc(alto)} mm</text>
  <g transform="translate(${orgX},${orgY})">
`;

  // Rectángulos proyectados (traseras primero, luego fijas, luego móviles).
  const orden = [...rectangulos].sort((a, b) => {
    const za = a.trasera ? 0 : a.fija ? 1 : 2;
    const zb = b.trasera ? 0 : b.fija ? 1 : 2;
    return za - zb;
  });
  for (const r of orden) {
    const n = nodo(r.id);
    if (!n) continue;
    const fill = ROLE_COLORS[r.rol] || ROLE_COLORS.default;
    const stroke = r.trasera ? COLORS.strokeDefault : r.fija ? COLORS.strokeDefault : COLORS.strokeActive;
    const opacity = r.trasera ? 0.12 : 1;
    const width = r.fija || r.trasera ? 1.2 : 2.4;
    svg += `    <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${width}" data-id="${esc(r.id)}" data-rol="${esc(r.rol)}"/>
`;
    if (!r.trasera && n.w > 70 && n.h > 18) {
      svg += `    <text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 4}" text-anchor="middle" fill="${UI_COLORS.white}" font-size="10" font-weight="600" font-family="${FONT}" pointer-events="none">${esc(r.etiqueta)}</text>
`;
    }
  }

  // Cotas principales (coordinadas de pantalla, z invertida).
  for (const c of cotas) {
    if (c.eje === 'x') {
      svg += `    ${cotaX(c.inicio, c.fin, alto + 28 + c.nivel * 34, c.etiqueta)}
`;
    } else {
      svg += `    ${cotaZ(alto - c.inicio, alto - c.fin, ancho + 24 + c.nivel * 30, c.etiqueta)}
`;
    }
  }

  // Marcas de posición Z (ticks en el margen izquierdo).
  for (const m of marcas) {
    const y = alto - m.valor;
    const color = m.fija ? DIMENSION_COLORS.text : COLORS.strokeActive;
    svg += `    <line x1="-10" y1="${y}" x2="0" y2="${y}" stroke="${color}" stroke-width="1.4"/>
    <text x="-14" y="${y + 3}" text-anchor="end" fill="${color}" font-size="9" font-family="${FONT}">${esc(m.etiqueta)}</text>
`;
  }

  svg += `  </g>
`;

  // Leyenda fijas / móviles (fuera del grupo, coordenadas de viewBox).
  const ly = MARGEN_SUP + alto + 108;
  svg += `  <rect x="${orgX}" y="${ly - 11}" width="16" height="11" fill="${ROLE_COLORS.gola_strip}" stroke="${COLORS.strokeDefault}" stroke-width="1.2"/>
  <text x="${orgX + 22}" y="${ly - 2}" fill="${TXT}" font-size="11" font-family="${FONT}">Fijas (casco · gola) — ${esc(modelo.leyenda.fijas)}</text>
  <rect x="${orgX + 210}" y="${ly - 11}" width="16" height="11" fill="${ROLE_COLORS.drawer_face}" stroke="${COLORS.strokeActive}" stroke-width="2.2"/>
  <text x="${orgX + 232}" y="${ly - 2}" fill="${TXT}" font-size="11" font-family="${FONT}">Móviles (frentes) — ${esc(modelo.leyenda.moviles)}</text>
</svg>`;
  return svg;
}

/**
 * SVG de la sección transversal acotada de un canal gola (modelo de
 * golaSectionService.buildGolaSections): corte lateral Y-Z con el fondo, las
 * pestañas, los frentes adyacentes, la abertura útil de agarre y los puntos
 * de fijación.
 *
 * @param {object} seccion sección de buildGolaSections.
 * @returns {string} SVG listo para insertar o exportar.
 */
export function renderGolaSectionSvg(seccion) {
  const { piezas, abertura, puntosFijacion, cotas } = seccion;
  const maxY = Math.max(...piezas.map((p) => p.y + p.profundidad), abertura.yHasta) + 10;
  const minY = Math.min(...piezas.map((p) => p.y), abertura.yDesde, 0) - 8;
  const maxZ = Math.max(...piezas.map((p) => p.z + p.alto), abertura.hastaZ) + 60;
  const minZ = Math.min(...piezas.map((p) => p.z), abertura.desdeZ, 0) - 34;

  const W = maxY - minY + 170;
  const H = maxZ - minZ + 40;
  // Plano de frentes: eje vertical en y = 0 (línea de referencia punteada).
  const orgX = -minY + 12;
  const orgY = maxZ;

  const sy = (z) => orgY - z;       // z → pantalla
  const sx = (y) => orgX + y;       // y → pantalla

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:${UI_COLORS.white};width:100%;max-width:520px;height:auto;display:block;">
  ${defs()}
  <text x="8" y="18" fill="${TXT}" font-size="13" font-weight="700" font-family="${FONT}">Sección ${seccion.tipo === 'C' ? 'transversal' : 'vertical'} — ${esc(seccion.descripcion)} — Módulo ${esc(seccion.modulo)}</text>
  <g>
    <line x1="${sx(minY)}" y1="${sy(0)}" x2="${sx(maxY)}" stroke="${COLORS.strokeDefault}" stroke-width="0.8" stroke-dasharray="4 3"/>
    <text x="${sx(minY)}" y="${sy(0) - 6}" fill="${COLORS.strokeDefault}" font-size="9" font-family="${FONT}">Plano de frentes</text>
`;

  const FILL_ROL = {
    fondo: ROLE_COLORS.gola_strip,
    pestana: ROLE_COLORS.gola_strip,
    frente: ROLE_COLORS.drawer_face,
    repisa: ROLE_COLORS.shelf,
  };
  for (const p of piezas) {
    const fill = FILL_ROL[p.rol] || ROLE_COLORS.default;
    const stroke = p.fija ? COLORS.strokeDefault : COLORS.strokeActive;
    svg += `    <rect x="${sx(p.y)}" y="${sy(p.z + p.alto)}" width="${p.profundidad}" height="${p.alto}" fill="${fill}" stroke="${stroke}" stroke-width="${p.fija ? 1.2 : 2}" data-id="${esc(p.id)}" data-rol="${esc(p.rol)}"/>
    <text x="${sx(p.y) + p.profundidad / 2}" y="${sy(p.z + p.alto / 2) + 3}" text-anchor="middle" fill="${UI_COLORS.white}" font-size="8.5" font-weight="600" font-family="${FONT}" pointer-events="none">${esc(p.etiqueta)}</text>
`;
  }

  // Abertura útil de agarre.
  const abW = abertura.yHasta - abertura.yDesde;
  const abH = abertura.hastaZ - abertura.desdeZ;
  svg += `    <rect x="${sx(abertura.yDesde)}" y="${sy(abertura.hastaZ)}" width="${abW}" height="${abH}" fill="${ROLE_COLORS.gola_grip}" fill-opacity="0.45" stroke="${ROLE_COLORS.gola_grip}" stroke-width="1.2" stroke-dasharray="3 2"/>
    <text x="${sx(abertura.yDesde) + abW / 2}" y="${sy(abertura.hastaZ) - 5}" text-anchor="middle" fill="${TXT}" font-size="9.5" font-weight="700" font-family="${FONT}">${esc(abertura.etiqueta)}</text>
`;

  // Puntos de fijación (tornillos del fondo, en su cara frontal).
  puntosFijacion.forEach((pt, i) => {
    const cx = sx(seccion.retranqueoMm) - 5;
    const cy = sy(pt.zMm);
    svg += `    <circle cx="${cx}" cy="${cy}" r="3" fill="${DIMENSION_COLORS.arrow}"/>
    <text x="${cx - 7}" y="${cy + (i % 2 ? 12 : -6)}" text-anchor="end" fill="${DIMENSION_COLORS.text}" font-size="8.5" font-family="${FONT}">${esc(pt.nota)}</text>
`;
  });

  // Cotas: las de eje z a la derecha, las de eje y abajo.
  const cotasZ = cotas.filter((c) => c.eje === 'z');
  const cotasY = cotas.filter((c) => c.eje === 'y');
  cotasZ.forEach((c, i) => {
    svg += `    ${cotaZ(sy(c.inicio), sy(c.fin), sx(maxY) + 14 + i * 26, c.etiqueta)}
`;
  });
  cotasY.forEach((c, i) => {
    svg += `    ${cotaX(sx(c.inicio), sx(c.fin), sy(minZ) + 18 + i * 26, c.etiqueta)}
`;
  });

  svg += `  </g>
</svg>`;
  return svg;
}
