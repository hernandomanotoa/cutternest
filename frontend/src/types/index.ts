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
  tipo: string;
  posicion: Point3D;
  direccion: Point3D;
  piezas: string[];
}

export interface AssemblyStep {
  numero: number;
  titulo: string;
  descripcion: string;
  piezas: string[];
  piezas_3d: AssemblyPiece3D[];
  conectores: AssemblyConnector[];
  herramientas: string[];
  tiempo_estimado_min: number;
}

export interface AssemblyResponse {
  pasos: AssemblyStep[];
  vista_completa: AssemblyPiece3D[];
  conectores_completos: AssemblyConnector[];
}
