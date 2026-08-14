export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  mode: 'principal' | 'guest' | null;
  expiresAt: number | null;
}

export interface BoardInput {
  ancho: number;
  alto: number;
  espesor: number;
  kerf_mm: number;
  margen_mm: number;
}

export interface PieceInput {
  id: string;
  nombre: string;
  ancho: number;
  alto: number;
  cantidad: number;
  rotar: boolean;
  color: string;
  espesor: number;
  cantos?: string;
  modulo?: string;
}

export interface Placement {
  id: string;
  nombre: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  espesor: number;
  rotado: boolean;
}

export interface BoardResult {
  board_index: number;
  ancho: number;
  alto: number;
  utilizacion: number;
  placements: Placement[];
}

export interface OptimizeResponse {
  tableros: BoardResult[];
  total_tableros: number;
  area_total_m2: number;
  area_usada_m2: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  owner_id?: string;
  board_width_cm?: number;
  board_height_cm?: number;
  board_thickness_mm?: number;
  kerf_mm?: number;
  margin_mm?: number;
  material_type?: string;
  use_offcuts?: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  tipo: string;
  espesor_mm: number;
  ancho_cm: number;
  alto_cm: number;
  cantidad: number;
  estado: string;
  area_m2: number;
  created_at: string;
}

export interface Template {
  id: string;
  nombre: string;
  descripcion: string;
  parametros: Record<string, { min: number; max: number; default: number; step: number }>;
}

export interface HardwareItem {
  item: string;
  cantidad: number;
  precio_unit: number;
}

export interface QuoteBreakdown {
  material: number;
  hardware: number;
  mano_obra: number;
  subtotal: number;
  total: number;
}

export interface Quote {
  quote_id: string;
  project_id: string;
  breakdown: QuoteBreakdown;
  hardware: HardwareItem[];
  pdf_path?: string;
  created_at: string;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Transform3D {
  position: Point3D;
  rotation: Point3D;
}

export interface AssemblyPiece3D {
  id: string;
  nombre: string;
  ancho: number;
  alto: number;
  profundidad: number;
  color: string;
  posicion: Point3D;
  rotacion: Point3D;
}

export interface AssemblyConnector {
  id?: string;
  tipo: string;
  posicion: Point3D;
  direccion: Point3D;
  piezas: string[];
  step_id?: string;
}

export interface AssemblyStep {
  id: string;
  numero: number;
  code: string;
  titulo: string;
  descripcion: string;
  module_id?: string;
  piezas: string[];
  piezas_3d: AssemblyPiece3D[];
  conectores: AssemblyConnector[];
  connector_ids: string[];
  herramientas: string[];
  dependencies: string[];
  tiempo_estimado_min: number;
  status: string;
  camera?: Record<string, unknown>;
  animation?: Record<string, unknown>;
}

export interface AssemblyModule {
  id: string;
  code: string;
  categoria: string;
  nombre: string;
  posicion: Point3D;
  dimensiones: Point3D;
  order_index: number;
}

export interface AssemblyPieceState {
  id: string;
  codigo: string;
  categoria: string;
  tipo_pieza: string;
  posicion_esperada: Point3D;
  rotacion_esperada: Point3D;
  posicion_actual?: Point3D | null;
  rotacion_actual?: Point3D | null;
  tolerancia_posicion_mm: number;
  tolerancia_rotacion_deg: number;
  estado: string;
  dependencias: string[];
}

export interface AssemblyState {
  id: string;
  current_step_id?: string;
  completed_step_ids: string[];
  started_at: string;
  updated_at: string;
}

export interface AssemblyResponse {
  pasos: AssemblyStep[];
  vista_completa: AssemblyPiece3D[];
  conectores_completos: AssemblyConnector[];
  modules: AssemblyModule[];
  pieces: AssemblyPieceState[];
  connectors: AssemblyConnector[];
  steps: AssemblyStep[];
  state?: AssemblyState;
}

export interface AssemblyValidationResult {
  step_id: string;
  valid: boolean;
  piece_results: Record<string, { valid: boolean; errors: string[] }>;
  errors: string[];
  next_step_id?: string;
}

export interface AssemblyProgressUpdate {
  piece_updates?: Record<string, Transform3D>;
  status?: string;
}

export interface BoardFormat {
  name: string;
  width_cm: number;
  height_cm: number;
  country: string;
}

export interface CatalogMaterial {
  name: string;
  description: string;
  thicknesses: number[];
  prices: Record<string, number>;
}

export interface CatalogColor {
  name: string;
  hex: string;
}

export interface CatalogResponse {
  board_formats: BoardFormat[];
  materials: CatalogMaterial[];
  colors: CatalogColor[];
}
