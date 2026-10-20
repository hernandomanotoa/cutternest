// js/core/config.js — Constantes y configuración global del Assembly Planner
// Cualquier magic number/color/threshold debe residir aquí.

export const DEFAULT_THICKNESS = 15;

export const COLORS = {
  background: '#0f172a',
  strokeDefault: '#475569',
  strokePanel: '#334155',
  strokeActive: '#4ECDC4',
  strokeDanger: '#ef4444',
  strokeSuccess: '#10b981',
  strokeWarning: '#fbbf24',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textDark: '#0f172a',
  accent: '#f59e0b',
  globalBadge: '#4ECDC4',
};

export const DEPENDENCY_STYLES = {
  estructural: { label: 'Estructural', color: '#4ECDC4', width: 2, dash: 'none' },
  fondo: { label: 'Fondo', color: '#94a3b8', width: 1.5, dash: '4,4' },
  interior: { label: 'Interior', color: '#DDA0DD', width: 1.5, dash: 'none' },
  soporte: { label: 'Soporte', color: '#f97316', width: 3, dash: 'none' },
  accesorio: { label: 'Accesorio', color: '#3b82f6', width: 1, dash: 'none' },
  acabado: { label: 'Acabado', color: '#fbbf24', width: 1, dash: 'none' },
  bloqueo: { label: 'Bloqueo', color: '#ef4444', width: 3, dash: '8,4' },
};

export const SVG_CONFIG = {
  defaultScale: 0.12,
  minScale: 0.03,
  maxScale: 0.5,
  isoDepth: 0.5,
  padding: 100,
  titleSpace: 60,
};

export const GRAPH_CONFIG = {
  nodeWidth: 120,
  nodeHeight: 56,
  levelGapX: 180,
  nodeGapY: 70,
  padding: 80,
  minScale: 0.5,
  maxScale: 3,
};

export const MANUAL_CONFIG = {
  width: 700,
  height: 420,
  minZoom: 0.5,
  maxZoom: 3,
  zoomStep: 0.25,
};

// ── Tipos de riel/corredera ────────────────────────────────────────────────
// Constantes de catálogo (Häfele/Blum) que gobiernan la holgura lateral de
// la caja (sideClearance, mm por lado) y la fracción de extracción al abrir
// (extraction: 1.0 = extensión total, 0.75 = extensión parcial típica).
// La oculta es el caso especial: NO descuenta holgura por lado; su deducción
// (−42 mm) aplica al ancho INTERIOR de la caja, más rebajo inferior y tope
// de alto del cajón. Todo valor marcado '(verificar catálogo)' debe
// confirmarse contra la ficha técnica antes de producción.
export const RAIL_TYPES = {
  telescopica: {
    label: 'Lateral bolillas 3 tramos (extensión total)',
    sideClearance: 12.7,   // mm por lado → ancho caja = vano − 25,4
    extraction: 1.0,
    catalogo: 'Häfele Matrix Runner BB / Accuride 3832 (verificar catálogo)',
  },
  oculta: {
    label: 'Oculta inferior (extensión total)',
    sideClearance: 0,      // no descuenta por lado: la caja va al ras del vano
    extraction: 1.0,
    interiorDeduction: 42, // ancho INTERIOR = vano − 42 (+ 2 × esp. lateral)
    bottomClearance: 12.7, // rebajo inferior bajo la base del cajón
    maxHeightDeduction: 23, // alto máx. del cajón = vano − 23
    catalogo: 'Blum Tandem 563H / Häfele Matrix UM A30',
  },
  ruedas: {
    label: 'Euro ruedas (extensión parcial ~75%)',
    sideClearance: 12.5,   // mm por lado → ancho caja = vano − 25
    extraction: 0.75,
    catalogo: 'Häfele Euro roller (verificar catálogo)',
  },
  ligera: {
    label: 'Ligera bolillas 27 mm ranurado (extensión parcial ~75%)',
    sideClearance: 10,     // mm por lado (bandejas/zapateras ligeras)
    extraction: 0.75,
    catalogo: 'Bolillas 27 mm ranurado (verificar catálogo)',
  },
};

export const DEFAULT_RAIL_TYPE = 'telescopica';

export const STRUCTURAL = {
  defaultEMpa: 2500,
  defaultSigmaMpa: 18,
  deflexionLimitRatio: 250,
  densityKgDm3: 0.7,
  fsThreshold: 1.5,
  moduleHeightWarning: 1800,
  wideShelfThreshold: 1000,
};

export const DEFAULTS = {
  moduleWidth: 900,
  moduleHeight: 600,
  moduleDepth: 400,
  thickness: DEFAULT_THICKNESS,
  pieceSize: 100,
  cantos: 'T,B,L,R',
};

export const ROLE_COLORS = {
  wood: '#C19A6B',
  metal: '#A0A0A0',
  leg: '#1e293b',
  back_panel: '#1e293b',
  side_panel: '#334155',
  bottom_panel: '#334155',
  top_panel: '#334155',
  plinth: '#8B5A2B',
  panel: '#334155',
  shelf: '#475569',
  divider: '#475569',
  drawer_face: '#fbbf24',
  drawer_side: '#64748b',
  drawer_bottom: '#64748b',
  drawer_back: '#64748b',
  drawer_divider: '#64748b',
  headboard: '#64748b',
  bed_bottom: '#64748b',
  bed_slat: '#a8a29e',
  door: '#1e293b',
  mirror: '#1e293b',
  handle: '#e2e8f0',
  brace: '#94a3b8',
  hanger_rail: '#A0A0A0',
  default: '#475569',
};

export const AXES_COLORS = {
  x: '#ef4444',
  y: '#22c55e',
  z: '#3b82f6',
};

export const DIMENSION_COLORS = {
  arrow: '#f59e0b',
  text: '#f59e0b',
};

// ── Tema oscuro del renderer 3D (estilo GitHub dark) ───────────────────────
// Usado por js/renderer3d/* (SVG del canvas 3D) y js/views/renderer3DView.js.
export const RENDERER3D_THEME = {
  canvasBackground: '#0d1117', // fondo del canvas SVG 3D
  surface: '#161b22',          // superficie de paneles laterales (BOM)
  rowBorder: '#21262d',        // borde inferior de filas
  rowSelected: '#2d333b',      // fondo de fila seleccionada
  border: '#30363d',           // bordes genéricos de tarjetas/paneles
  textSecondary: '#8b949e',    // texto secundario y metadatos
  textPrimary: '#c9d1d9',      // texto principal
  accent: '#58a6ff',           // acento: plano de sección y paso actual
  strokeBase: '#222',          // stroke por defecto de las caras 3D
};

// ── Maderas del renderer 3D ────────────────────────────────────────────────
// Haya = color base por defecto; Nogal y sus cantos asociados.
export const WOOD_COLORS = {
  beech: '#C19A6B',      // Haya (color base por defecto de piezas)
  walnut: '#8B5A2B',     // Nogal
  walnutEdge: '#3a1f0a', // canto de nogal (oscuro)
  beechEdge: '#5c3a1e',  // canto de haya (más oscuro)
};

// ── Colores de resaltado interactivo ───────────────────────────────────────
export const HIGHLIGHT_COLORS = {
  selection: '#FFD700', // selección / hover / fila activa
  dimension: '#00ff88', // cotas y texto de dimensiones 3D
};

// ── Colores de la UI (placeholders, exportaciones) ─────────────────────────
export const UI_COLORS = {
  mint: '#96CEB4',   // color de ejemplo en el placeholder del editor CSV
  white: '#ffffff',  // fondo blanco de manuales exportados
};

// ── Semáforo de riesgo estructural (js/structural.js) ──────────────────────
export const RISK_COLORS = {
  info: '#3b82f6',    // fondo decorativo / no estructural
  success: '#10b981', // riesgo bajo
  danger: '#ef4444',  // riesgo crítico
  warning: '#f97316', // riesgo alto
  medium: '#fbbf24',  // riesgo medio
};

export const Z_INDEX = {
  back_panel: 1,
  side_panel_rear: 2,
  mirror: 3,
  plinth: 4,
  divider: 5,
  bottom_panel: 6,
  top_panel: 6,
  panel: 6,
  hanger_rail: 6,
  shelf: 6,
  brace: 7,
  drawer_back: 8,
  drawer_bottom: 9,
  drawer_side: 10,
  drawer_part: 24, // cara del cajón: interior frontal, justo bajo el frente
  drawer_divider: 24, // divisor interior: capa de la cara, bajo el frente
  seat_panel: 11,
  headboard: 12,
  leg: 13,
  side_panel_front: 20,
  glass: 24,
  front_panel: 25,
  drawer_face: 25,
  door: 25,
  handle: 26,
  // Cama: tarima como cajón-base y láminas encima, antes del frente/cabecero
  bed_bottom: 7,
  bed_slat: 8,
};

export const VERTICAL_POSITIONS = {
  // ── Offset: distancia desde un borde de referencia ───────────
  bottomPanelOffset: 0,      // distancia suelo → cara inferior de la base (bottom_panel)

  // ── Gap base → primera pieza interior / entre piezas horizontales ──
  baseTopGap: 20,            // gap mínimo desde la cara superior de la base a la primera pieza horizontal
  stackGap: 20,              // gap entre piezas horizontales apiladas

  // ── Inset: distancia hacia adentro desde la cara INFERIOR de la tapa ──
  topInset: 50,              // inset desde la cara inferior de la tapa a la pieza superior (maletero estándar)

  // Offsets desde la cara SUPERIOR de la base (base top → pieza inferior).
  lowerShelfBaseOffset: 30,  // repisa inferior pegada a la base, hueco mínimo de limpieza
  drawerBaseOffset: 10,      // frentes arrancan justo sobre la base; la base queda oculta tras el frente
  braceBaseOffset: 0,        // travesaño inferior al ras de la cara superior de la base
  doorBaseOffset: 2,         // puerta inferior: gap desde la cara superior de la base (= doorGap)

  // ── Gaps específicos (difieren del stackGap genérico) ─────────
  doorGap: 2,                // gap entre puertas
  drawerFrontGap: 2.5,       // gap entre frentes de cajón apilados (mueblería real: 2–3 mm)

  // ── Alturas absolutas desde el suelo ──────────────────────────
  seatHeight: 450,           // altura del asiento
  hangerRailHeight: 1700,    // altura del riel/barra colgadora

  // ── Inset específicos por tipo de pieza ─────────────────────
  doorTopInset: 2,           // puerta superior: gap desde la cara inferior de la tapa (= doorGap)

  // ── Offset horizontal de patas ─────────────────────────────────
  legOffsetX: 20,            // margen patas desde lateral (X)
  legOffsetY: 20,            // margen patas desde frente/fondo (Y)

  // ── Divisor vertical ────────────────────────────────────────────
  dividerBaseOffset: 0,      // distancia desde la cara superior de la base al borde inferior del divisor
  dividerTopInset: 0,        // distancia desde la cara inferior de la tapa/repisa superior al borde superior del divisor
};

// Separación estándar entre módulos en la vista multi-módulo (mm). Vive en
// core (no en renderer3d/) porque la usa tanto la vista 3D como la
// isométrica ('Vista completa'). moduleLayout.js lo re-exporta por compat.
export const MODULE_GAP_MM = 20;
