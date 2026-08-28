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
  panel: '#334155',
  shelf: '#475569',
  divider: '#475569',
  drawer_face: '#fbbf24',
  drawer_side: '#64748b',
  drawer_bottom: '#64748b',
  drawer_back: '#64748b',
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

export const Z_INDEX = {
  back_panel: 1,
  side_panel_rear: 2,
  mirror: 3,
  divider: 4,
  bottom_panel: 5,
  top_panel: 5,
  panel: 5,
  hanger_rail: 6,
  shelf: 6,
  brace: 7,
  drawer_back: 8,
  drawer_bottom: 9,
  drawer_side: 10,
  seat_panel: 11,
  leg: 13,
  side_panel_front: 20,
  glass: 24,
  front_panel: 25,
  drawer_face: 25,
  door: 25,
  handle: 26,
};

export const VERTICAL_POSITIONS = {
  // ── Offset: distancia desde un borde de referencia ───────────
  bottomPanelOffset: 0,      // distancia suelo → cara inferior de la base (bottom_panel)

  // ── Gap: espacio libre entre dos piezas o entre una pieza y un borde ──
  firstInnerGap: 20,         // gap base → primera pieza interior (middle)

  // Offsets desde la cara SUPERIOR de la base (base top → pieza inferior).
  shelfBaseOffset: 80,       // repisa inferior: distancia desde la cara superior de la base
  drawerBaseOffset: 80,      // frente de cajón inferior: distancia desde la cara superior de la base
  braceBaseOffset: 80,       // travesaño inferior: distancia desde la cara superior de la base
  doorBaseOffset: 0,         // puerta inferior: distancia desde la cara superior de la base
  shoeRackBaseOffset: 20,    // zapatero: distancia desde la cara superior de la base

  // ── Gap entre piezas del mismo tipo (apilado) ────────────────
  defaultGap: 20,            // gap genérico entre piezas
  shelfMiddleGap: 20,        // gap entre repisas/estantes regulables
  shoeRackGap: 20,           // gap entre zapateros
  drawerFaceGap: 20,         // gap entre frentes de cajón
  doorGap: 2,                // gap entre puertas

  // ── Alturas absolutas desde el suelo ──────────────────────────
  seatHeight: 450,           // altura del asiento
  hangerRailHeight: 1700,    // altura del riel/barra colgadora

  // ── Inset: distancia hacia adentro desde la cara INFERIOR de la tapa ──
  shelfTopInset: 120,        // repisa superior: inset desde la cara inferior de la tapa
  braceTopInset: 120,        // travesaño superior: inset desde la cara inferior de la tapa
  doorTopInset: 0,           // puerta superior: inset desde la cara inferior de la tapa
  mirrorTopInset: 120,       // espejo: inset desde la cara inferior de la tapa

  // ── Offset horizontal de patas ─────────────────────────────────
  legOffsetX: 20,            // margen patas desde lateral (X)
  legOffsetY: 20,            // margen patas desde frente/fondo (Y)
};
