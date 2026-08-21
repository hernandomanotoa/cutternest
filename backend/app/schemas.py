from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict


class TokenResponse(BaseModel):
    message: str = "Autenticado"
    expires_in: int


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: str = Field(..., max_length=255)


class UserCreate(UserBase):
    password: str = Field(..., min_length=10)


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
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=255)


class LoginStep1Response(BaseModel):
    message: str = "Credenciales validas, continue con la verificacion TOTP"


class VerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)
    temp_token: Optional[str] = Field(None, max_length=512)


class GuestPinRequest(BaseModel):
    project_id: Optional[str] = Field(None, max_length=36)


class GuestPinResponse(BaseModel):
    pin: str
    expires_at: datetime
    project_id: Optional[str] = None


class GuestLoginRequest(BaseModel):
    pin: str = Field(..., min_length=6, max_length=6)


class RefreshRequest(BaseModel):
    refresh_token: str


# Optimizador
class BoardInput(BaseModel):
    ancho: float = Field(2440.0, gt=0)
    alto: float = Field(1220.0, gt=0)
    espesor: float = Field(18.0, gt=0)
    kerf_mm: float = Field(3.0, ge=0)
    margen_mm: float = Field(5.0, ge=0)


class PieceInput(BaseModel):
    id: str = Field(..., max_length=64)
    nombre: str = Field(..., max_length=128)
    ancho: float = Field(..., gt=0)
    alto: float = Field(..., gt=0)
    cantidad: int = Field(1, ge=1)
    rotate: bool = True
    color: str = Field("#3B82F6", max_length=7)
    espesor: float = Field(18.0, gt=0)
    cantos: Optional[str] = Field("", max_length=16)
    modulo: Optional[str] = Field(None, max_length=16)


class OptimizeRequest(BaseModel):
    tablero: BoardInput
    piezas: List[PieceInput] = Field(..., max_length=5000)
    use_offcuts: bool = False
    material_type: Optional[str] = Field(None, max_length=64)


class PiecesUpdateRequest(BaseModel):
    piezas: List[PieceInput] = Field(..., max_length=5000)


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
    ancho_mm: float
    alto_mm: float
    cantidad: int = 1


class InventoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tipo: str
    espesor_mm: float
    ancho_mm: float
    alto_mm: float
    cantidad: int
    estado: str
    area_m2: float
    created_at: datetime


class InventoryConsume(BaseModel):
    cantidad: int = 1


class InventoryRestock(BaseModel):
    cantidad: int = Field(..., gt=0)
    motivo: Optional[str] = Field(None, max_length=500)


class InventoryMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    inventory_id: str
    tipo: str
    cantidad: int
    motivo: Optional[str]
    created_at: datetime


# Proyectos
class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    status: Optional[str] = Field("active", max_length=32)
    board_width_mm: Optional[float] = None
    board_height_mm: Optional[float] = None
    board_thickness_mm: Optional[float] = None
    kerf_mm: Optional[float] = None
    margin_mm: Optional[float] = None
    material_type: Optional[str] = Field(None, max_length=64)
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


class HardwareTemplate(BaseModel):
    item: str
    precio_unit: float
    categoria: str


class QuoteRequest(BaseModel):
    hardware: List[HardwareItem]
    costo_m2_mdf: Optional[float] = Field(None, ge=0)
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


class Rotation3D(BaseModel):
    x: float
    y: float
    z: float


class Transform3D(BaseModel):
    position: Point3D
    rotation: Rotation3D


class Tolerance3D(BaseModel):
    position_mm: float = 2.0
    rotation_deg: float = 5.0


class AssemblyPiece3D(BaseModel):
    id: str
    nombre: str
    ancho: float
    alto: float
    profundidad: float
    color: str
    modulo: Optional[str] = None
    posicion: Point3D
    rotacion: Rotation3D


class AssemblyConnector(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: Optional[str] = None
    project_id: Optional[str] = None
    code: str
    tipo: str = Field(..., validation_alias="connector_type")
    posicion: Point3D = Field(..., validation_alias="position")
    direccion: Point3D = Field(..., validation_alias="direction")
    piezas: List[str] = Field(..., validation_alias="piece_codes")
    step_id: Optional[str] = None


class AssemblyModule(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: Optional[str] = None
    project_id: Optional[str] = None
    code: str
    categoria: str = Field(..., validation_alias="category")
    nombre: str = Field(..., validation_alias="name")
    posicion: Point3D = Field(..., validation_alias="position")
    dimensiones: Point3D = Field(..., validation_alias="dimensions")
    order_index: int


class AssemblyPiece(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: Optional[str] = None
    project_id: Optional[str] = None
    module_id: Optional[str] = None
    piece_id: Optional[str] = None
    codigo: str = Field(..., validation_alias="code")
    categoria: str = Field(..., validation_alias="category")
    tipo_pieza: str = Field(..., validation_alias="piece_type")
    posicion_esperada: Point3D = Field(..., validation_alias="expected_position")
    rotacion_esperada: Rotation3D = Field(..., validation_alias="expected_rotation")
    posicion_actual: Optional[Point3D] = Field(None, validation_alias="current_position")
    rotacion_actual: Optional[Rotation3D] = Field(None, validation_alias="current_rotation")
    tolerancia_posicion_mm: float = Field(2.0, validation_alias="tolerance_position_mm")
    tolerancia_rotacion_deg: float = Field(5.0, validation_alias="tolerance_rotation_deg")
    estado: str = Field("NOT_STARTED", validation_alias="status")
    dependencias: List[str] = Field(..., validation_alias="dependencies")
    metadatos: Dict[str, Any] = Field(..., validation_alias="extra_data")


class AssemblyStep(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: Optional[str] = None
    project_id: Optional[str] = None
    numero: int = Field(..., validation_alias="step_number")
    code: str
    titulo: str = Field(..., validation_alias="title")
    descripcion: str = Field(..., validation_alias="description")
    module_id: Optional[str] = None
    piezas: List[str] = Field(..., validation_alias="piece_codes")
    connector_ids: List[str]
    herramientas: List[str] = Field(..., validation_alias="tool_ids")
    dependencies: List[str]
    camera: Optional[Dict[str, Any]] = None
    animation: Optional[Dict[str, Any]] = None
    status: str = "PENDING"
    piezas_3d: Optional[List[AssemblyPiece3D]] = None
    conectores: Optional[List[AssemblyConnector]] = None
    tiempo_estimado_min: Optional[int] = None


class AssemblyState(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: Optional[str] = None
    project_id: Optional[str] = None
    current_step_id: Optional[str] = None
    completed_step_ids: List[str]
    started_at: datetime
    updated_at: datetime


class AssemblyStepValidation(BaseModel):
    step_id: str
    piece_transforms: Dict[str, Transform3D]


class AssemblyValidationResult(BaseModel):
    step_id: str
    valid: bool
    piece_results: Dict[str, Dict[str, Any]]
    errors: List[str]
    next_step_id: Optional[str] = None


class AssemblyProgressUpdate(BaseModel):
    piece_updates: Optional[Dict[str, Transform3D]] = None
    status: Optional[str] = None


class AssemblyResponse(BaseModel):
    pasos: List[AssemblyStep]
    vista_completa: List[AssemblyPiece3D]
    conectores_completos: List[AssemblyConnector]
    modules: List[AssemblyModule]
    pieces: List[AssemblyPiece]
    connectors: List[AssemblyConnector]
    steps: List[AssemblyStep]
    state: Optional[AssemblyState] = None
    dependencies: List[List[str]] = []
    levels: List[List[str]] = []


class AssemblyPlanRequest(BaseModel):
    dependencies: List[List[str]]
    save: bool = True


class AssemblyPlanResponse(BaseModel):
    dependencies: List[List[str]]
    levels: List[List[str]]
    min_steps: int
    steps: List[AssemblyStep]
    cycle: Optional[List[str]] = None


class EfficiencyReport(BaseModel):
    project_id: str
    project_name: str
    utilizacion_promedio: float
    total_tableros: int
    created_at: datetime
