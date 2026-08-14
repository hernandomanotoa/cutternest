import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Enum,
    JSON,
)
from sqlalchemy.dialects.sqlite import VARCHAR
from sqlalchemy.orm import relationship

from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class User(Base):
    __tablename__ = "users"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    totp_secret_encrypted = Column(Text, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.user)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    guest_pins = relationship("GuestSession", back_populates="created_by_user", cascade="all, delete-orphan")
    backup_codes = relationship("BackupCode", back_populates="user", cascade="all, delete-orphan")


class BackupCode(Base):
    __tablename__ = "backup_codes"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    user_id = Column(VARCHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="backup_codes")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    user_id = Column(VARCHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token_hash = Column(String(255), nullable=False)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")


class GuestSession(Base):
    __tablename__ = "guest_sessions"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    pin = Column(String(4), nullable=False, index=True)
    created_by = Column(VARCHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    created_by_user = relationship("User", back_populates="guest_pins")


class Project(Base):
    __tablename__ = "projects"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(VARCHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    board_width_cm = Column(Float, nullable=False, default=244.0)
    board_height_cm = Column(Float, nullable=False, default=122.0)
    board_thickness_mm = Column(Float, nullable=False, default=18.0)
    kerf_mm = Column(Float, nullable=False, default=3.0)
    margin_mm = Column(Float, nullable=False, default=2.0)
    material_type = Column(String(64), nullable=True, default="MDF")
    use_offcuts = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="projects")
    pieces = relationship("Piece", back_populates="project", cascade="all, delete-orphan")
    layouts = relationship("Layout", back_populates="project", cascade="all, delete-orphan")
    quotes = relationship("Quote", back_populates="project", cascade="all, delete-orphan")


class Piece(Base):
    __tablename__ = "pieces"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    project_id = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String(64), nullable=False)
    name = Column(String(128), nullable=False)
    width_cm = Column(Float, nullable=False)
    height_cm = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    rotate = Column(Boolean, nullable=False, default=True)
    color = Column(String(7), nullable=False, default="#3B82F6")
    thickness_mm = Column(Float, nullable=False, default=18.0)
    edge_banding = Column(String(16), nullable=True, default="")

    project = relationship("Project", back_populates="pieces")


class Layout(Base):
    __tablename__ = "layouts"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    project_id = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    board_index = Column(Integer, nullable=False)
    board_width_cm = Column(Float, nullable=False)
    board_height_cm = Column(Float, nullable=False)
    utilization = Column(Float, nullable=False)
    svg_path = Column(String(512), nullable=True)
    png_path = Column(String(512), nullable=True)
    placements = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="layouts")


class InventoryState(str, enum.Enum):
    nuevo = "nuevo"
    sobrante = "sobrante"
    danado = "danado"


class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    tipo = Column(String(64), nullable=False)
    espesor_mm = Column(Float, nullable=False)
    ancho_cm = Column(Float, nullable=False)
    alto_cm = Column(Float, nullable=False)
    cantidad = Column(Integer, nullable=False, default=1)
    estado = Column(Enum(InventoryState), nullable=False, default=InventoryState.nuevo)
    proyecto_origen = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    area_m2 = Column(Float, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    consumed_at = Column(DateTime, nullable=True)

    project = relationship("Project")


class Quote(Base):
    __tablename__ = "quotes"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    project_id = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    hardware = Column(JSON, nullable=False, default=list)
    material_cost = Column(Float, nullable=False)
    hardware_cost = Column(Float, nullable=False)
    labor_cost = Column(Float, nullable=False)
    total = Column(Float, nullable=False)
    margin = Column(Float, nullable=False)
    pdf_path = Column(String(512), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="quotes")

class AssemblyModuleCategory(str, enum.Enum):
    superior = "SUP"
    inferior = "INF"
    global_ = "GLOBAL"


class AssemblyPieceStatus(str, enum.Enum):
    not_started = "NOT_STARTED"
    ready = "READY"
    placed = "PLACED"
    aligned = "ALIGNED"
    locked = "LOCKED"
    error = "ERROR"
    completed = "COMPLETED"


class AssemblyStepStatus(str, enum.Enum):
    pending = "PENDING"
    in_progress = "IN_PROGRESS"
    completed = "COMPLETED"
    blocked = "BLOCKED"


class AssemblyModule(Base):
    __tablename__ = "assembly_modules"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    project_id = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(32), nullable=False)
    category = Column(Enum(AssemblyModuleCategory), nullable=False, default=AssemblyModuleCategory.global_)
    name = Column(String(128), nullable=False)
    position = Column(JSON, nullable=False, default=dict)
    dimensions = Column(JSON, nullable=False, default=dict)
    order_index = Column(Integer, nullable=False, default=0)

    project = relationship("Project")


class AssemblyPiece(Base):
    __tablename__ = "assembly_pieces"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    project_id = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    module_id = Column(VARCHAR(36), ForeignKey("assembly_modules.id", ondelete="CASCADE"), nullable=True, index=True)
    piece_id = Column(VARCHAR(36), ForeignKey("pieces.id", ondelete="SET NULL"), nullable=True, index=True)
    code = Column(String(32), nullable=False, index=True)
    category = Column(String(16), nullable=False)
    piece_type = Column(String(16), nullable=False)
    expected_position = Column(JSON, nullable=False, default=dict)
    expected_rotation = Column(JSON, nullable=False, default=dict)
    current_position = Column(JSON, nullable=True)
    current_rotation = Column(JSON, nullable=True)
    tolerance_position_mm = Column(Float, nullable=False, default=2.0)
    tolerance_rotation_deg = Column(Float, nullable=False, default=5.0)
    status = Column(Enum(AssemblyPieceStatus), nullable=False, default=AssemblyPieceStatus.not_started)
    dependencies = Column(JSON, nullable=False, default=list)
    extra_data = Column(JSON, nullable=False, default=dict)

    project = relationship("Project")
    module = relationship("AssemblyModule")
    piece = relationship("Piece")


class AssemblyConnector(Base):
    __tablename__ = "assembly_connectors"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    project_id = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(32), nullable=False)
    connector_type = Column(String(32), nullable=False)
    position = Column(JSON, nullable=False, default=dict)
    direction = Column(JSON, nullable=False, default=dict)
    piece_codes = Column(JSON, nullable=False, default=list)
    step_id = Column(VARCHAR(36), ForeignKey("assembly_steps.id", ondelete="SET NULL"), nullable=True, index=True)

    project = relationship("Project")
    step = relationship("AssemblyStep")


class AssemblyStep(Base):
    __tablename__ = "assembly_steps"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    project_id = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    step_number = Column(Integer, nullable=False)
    code = Column(String(32), nullable=False)
    title = Column(String(128), nullable=False)
    description = Column(Text, nullable=False)
    module_id = Column(VARCHAR(36), ForeignKey("assembly_modules.id", ondelete="SET NULL"), nullable=True, index=True)
    piece_codes = Column(JSON, nullable=False, default=list)
    connector_ids = Column(JSON, nullable=False, default=list)
    tool_ids = Column(JSON, nullable=False, default=list)
    dependencies = Column(JSON, nullable=False, default=list)
    camera = Column(JSON, nullable=True)
    animation = Column(JSON, nullable=True)
    status = Column(Enum(AssemblyStepStatus), nullable=False, default=AssemblyStepStatus.pending)

    project = relationship("Project")
    module = relationship("AssemblyModule")


class AssemblyState(Base):
    __tablename__ = "assembly_states"

    id = Column(VARCHAR(36), primary_key=True, default=generate_uuid)
    project_id = Column(VARCHAR(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    current_step_id = Column(VARCHAR(36), ForeignKey("assembly_steps.id", ondelete="SET NULL"), nullable=True)
    completed_step_ids = Column(JSON, nullable=False, default=list)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project")
