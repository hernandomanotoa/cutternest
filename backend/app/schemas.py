from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict


class TokenResponse(BaseModel):
    message: str = "Autenticado"
    expires_in: int


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: str = Field(..., max_length=255)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    role: str
    is_active: bool
    created_at: datetime


class RegisterResponse(BaseModel):
    user: UserRead
    qr_base64: str
    backup_codes: List[str]


class LoginStep1Request(BaseModel):
    username: str
    password: str


class LoginStep1Response(BaseModel):
    message: str = "Credenciales validas, continue con la verificacion TOTP"


class VerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)
    temp_token: Optional[str] = None


class GuestPinRequest(BaseModel):
    pass


class GuestPinResponse(BaseModel):
    pin: str
    expires_at: datetime


class GuestLoginRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=4)


class RefreshRequest(BaseModel):
    refresh_token: str


# Optimizador
class BoardInput(BaseModel):
    ancho: float = Field(..., gt=0)
    alto: float = Field(..., gt=0)
    espesor: float = Field(..., gt=0)
    kerf_mm: float = Field(3.0, ge=0)
    margen_mm: float = Field(2.0, ge=0)


class PieceInput(BaseModel):
    id: str
    nombre: str
    ancho: float = Field(..., gt=0)
    alto: float = Field(..., gt=0)
    cantidad: int = Field(1, ge=1)
    rotar: bool = True
    color: str = "#3B82F6"
    espesor: float = 18.0
    cantos: Optional[str] = ""


class OptimizeRequest(BaseModel):
    tablero: BoardInput
    piezas: List[PieceInput]
    usar_sobrantes: bool = False


class PlacementRead(BaseModel):
    id: str
    nombre: str
    x: float
    y: float
    w: float
    h: float
    color: str
    espesor: float
    rotado: bool


class BoardResult(BaseModel):
    board_index: int
    ancho: float
    alto: float
    utilizacion: float
    placements: List[PlacementRead]


class OptimizeResponse(BaseModel):
    tableros: List[BoardResult]
    total_tableros: int
    area_total_m2: float
    area_usada_m2: float


# Inventario
class InventoryCreate(BaseModel):
    tipo: str
    espesor_mm: float
    ancho_cm: float
    alto_cm: float
    cantidad: int = 1


class InventoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tipo: str
    espesor_mm: float
    ancho_cm: float
    alto_cm: float
    cantidad: int
    estado: str
    area_m2: float
    created_at: datetime


class InventoryConsume(BaseModel):
    cantidad: int = 1


# Proyectos
class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    board_width_cm: Optional[float] = None
    board_height_cm: Optional[float] = None
    board_thickness_mm: Optional[float] = None
    kerf_mm: Optional[float] = None
    margin_mm: Optional[float] = None
    material_type: Optional[str] = None
    use_offcuts: Optional[bool] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    owner_id: Optional[str]
    created_at: datetime
    updated_at: datetime


class ProjectDetailRead(ProjectRead):
    pieces: List[dict]
    layouts: List[dict]


# Plantillas
class TemplateRead(BaseModel):
    id: str
    nombre: str
    descripcion: str
    parametros: dict


class TemplateGenerateRequest(BaseModel):
    ancho: float
    alto: float
    profundidad: float
    n_estantes: Optional[int] = None


# Cotización
class HardwareItem(BaseModel):
    item: str
    cantidad: float
    precio_unit: float


class QuoteRequest(BaseModel):
    hardware: List[HardwareItem]
    costo_m2_mdf: float = Field(..., gt=0)
    costo_hora_mano_obra: float = Field(..., gt=0)
    margen: float = Field(1.3, gt=1.0)


class QuoteBreakdown(BaseModel):
    material: float
    hardware: float
    mano_obra: float
    subtotal: float
    total: float


class QuoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    material_cost: float
    hardware_cost: float
    labor_cost: float
    total: float
    margin: float
    pdf_path: Optional[str]
    created_at: datetime


# Ensamblaje
class Point3D(BaseModel):
    x: float
    y: float
    z: float


class AssemblyPiece3D(BaseModel):
    id: str
    nombre: str
    ancho: float
    alto: float
    profundidad: float
    color: str
    posicion: Point3D
    rotacion: Point3D


class AssemblyConnector(BaseModel):
    tipo: str
    posicion: Point3D
    direccion: Point3D
    piezas: List[str]


class AssemblyStep(BaseModel):
    numero: int
    titulo: str
    descripcion: str
    piezas: List[str]
    piezas_3d: List[AssemblyPiece3D]
    conectores: List[AssemblyConnector]
    herramientas: List[str]
    tiempo_estimado_min: int


class AssemblyResponse(BaseModel):
    pasos: List[AssemblyStep]
    vista_completa: List[AssemblyPiece3D]
    conectores_completos: List[AssemblyConnector]


# Reportes
class EfficiencyReport(BaseModel):
    project_id: str
    project_name: str
    utilizacion_promedio: float
    total_tableros: int
    created_at: datetime
