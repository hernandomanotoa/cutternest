import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    AssemblyConnector as AssemblyConnectorModel,
    AssemblyModule as AssemblyModuleModel,
    AssemblyPiece as AssemblyPieceModel,
    AssemblyState as AssemblyStateModel,
    AssemblyStep as AssemblyStepModel,
    Piece,
    Project,
)
from app.schemas import (
    AssemblyConnector,
    AssemblyModule,
    AssemblyPiece,
    AssemblyPiece3D,
    AssemblyProgressUpdate,
    AssemblyState,
    AssemblyStep,
    AssemblyStepValidation,
    AssemblyValidationResult,
    Point3D,
    Rotation3D,
    Transform3D,
)


# -----------------------------------------------------------------------------
# Constantes y reglas de clasificación
# -----------------------------------------------------------------------------
DEFAULT_POSITION_TOLERANCE_MM = 2.0
DEFAULT_ROTATION_TOLERANCE_DEG = 5.0

_PIECE_KINDS: List[Tuple[str, str]] = [
    ("izquierdo", "lateral_izq"),
    ("izq", "lateral_izq"),
    ("left", "lateral_izq"),
    ("derecho", "lateral_der"),
    ("der", "lateral_der"),
    ("right", "lateral_der"),
    ("lateral", "lateral"),
    ("lat", "lateral"),
    ("tapa", "tapa"),
    ("base", "base"),
    ("fondo", "fondo"),
    ("estante", "estante"),
    ("repisa", "repisa"),
    ("puerta", "puerta"),
    ("zapatero", "zapatero"),
    ("zocalo", "zocalo"),
    ("cajon", "cajon"),
    ("pata", "pata"),
    ("division", "division"),
    ("div", "division"),
]

_TYPE_ABBR = {
    "lateral": "LAT",
    "lateral_izq": "LAT",
    "lateral_der": "LAT",
    "base": "BAS",
    "tapa": "TAP",
    "estante": "EST",
    "repisa": "REP",
    "fondo": "FON",
    "puerta": "PUE",
    "zapatero": "ZAP",
    "zocalo": "ZOC",
    "cajon": "CAJ",
    "pata": "PAT",
    "division": "DIV",
    "other": "OTR",
}

_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]

_MODULE_RE = re.compile(r"^(m|mod|module)(\d+)", re.IGNORECASE)

_STEP_TOOLS = {
    "cantos": ["plancha canto", "cutter", "lijadora"],
    "base_patas": ["escuadra", "nivel"],
    "laterales": ["taladro", "escuadra", "tornillos confirmat"],
    "estantes": ["taladro", "nivel", "tacos de madera"],
    "tapa": ["taladro", "escuadra"],
    "fondo": ["clavadora", "tornillos"],
    "acabados": ["destornillador", "bisagras", "tiradores"],
    "general": ["taladro", "escuadra"],
}


# -----------------------------------------------------------------------------
# Utilidades geométricas y de clasificación
# -----------------------------------------------------------------------------
def _to_mm(cm: float) -> float:
    return float(cm) * 10.0


def _piece_type(piece: Piece) -> str:
    text = f"{piece.external_id.lower()} {piece.name.lower()}"
    for keyword, kind in _PIECE_KINDS:
        if keyword in text:
            return kind
    return "other"


def _type_by_dimensions(width_cm: float, height_cm: float, thickness_mm: float) -> str:
    """Clasificación genérica por proporciones cuando no hay keyword."""
    w = width_cm
    h = height_cm
    t = thickness_mm / 10.0  # cm
    if w > 0 and h > 0:
        ratio = max(w, h) / min(w, h)
        thin = min(w, h) <= t * 2.5
        if thin:
            return "fondo"
        if ratio >= 3.0:
            if h > w:
                return "lateral"
            return "base"
        if ratio >= 1.5:
            if h > w:
                return "lateral"
            return "estante"
    return "other"


def _piece_type_with_fallback(piece: Piece) -> str:
    kind = _piece_type(piece)
    if kind != "other":
        return kind
    return _type_by_dimensions(piece.width_cm, piece.height_cm, piece.thickness_mm)


def _infer_module(piece: Piece) -> str:
    match = _MODULE_RE.match(piece.external_id)
    if match:
        return f"M{int(match.group(2)):02d}"
    return "GLB"


def _module_category(module_code: str, pieces: List[Piece]) -> str:
    sup_keywords = ["sup", "alto", "top", "colgante", "superior"]
    inf_keywords = ["inf", "bajo", "bottom", "zocalo", "inferior"]
    has_sup = False
    has_inf = False
    for p in pieces:
        text = f"{p.external_id.lower()} {p.name.lower()}"
        if any(k in text for k in sup_keywords):
            has_sup = True
        if any(k in text for k in inf_keywords):
            has_inf = True
    if has_sup:
        return "SUP"
    if has_inf:
        return "INF"
    return "GLOBAL"


def _parse_module_override(modulo: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Devuelve (categoria, codigo_modulo) desde un string como 'SUP-M01' o 'M01'."""
    if not modulo:
        return None, None
    text = modulo.strip().upper()
    cat: Optional[str] = None
    if text.startswith("SUP"):
        cat = "SUP"
    elif text.startswith("INF"):
        cat = "INF"
    match = _MODULE_RE.search(text)
    if match:
        return cat, f"M{int(match.group(2)):02d}"
    return cat, None


def assign_piece_codes(pieces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Asigna external_id canónico [CAT]-[MOD]-[TIPO]-[SEQ] a cada pieza.

    - Si la pieza trae 'modulo', se usa para derivar categoría y código de módulo.
    - Se infiere el tipo por nombre y, como fallback, por dimensiones.
    - El resultado conserva todos los demás campos y reemplaza 'id' por el código.
    """
    seq_by_module_type: Dict[Tuple[str, str], int] = {}
    result: List[Dict[str, Any]] = []

    for p in pieces:
        cat_override, module_override = _parse_module_override(p.get("modulo"))
        dummy = SimpleNamespace(
            external_id=str(p.get("id", "")),
            name=str(p.get("nombre", "")),
            width_cm=float(p.get("ancho", 0) or 0),
            height_cm=float(p.get("alto", 0) or 0),
            thickness_mm=float(p.get("espesor", 18) or 18),
        )
        kind = _piece_type_with_fallback(dummy)
        module_code = module_override or _infer_module(dummy)
        if module_code == "GLB":
            module_code = "M01"

        cat = cat_override or "GLB"
        if not cat_override:
            text = f"{dummy.external_id.lower()} {dummy.name.lower()}"
            if any(k in text for k in ["sup", "alto", "top", "colgante", "superior"]):
                cat = "SUP"
            elif any(k in text for k in ["inf", "bajo", "bottom", "zocalo", "inferior"]):
                cat = "INF"

        seq_key = (module_code, kind)
        seq = seq_by_module_type.get(seq_key, 0) + 1
        seq_by_module_type[seq_key] = seq
        code = _piece_code(cat, module_code, kind, seq)
        updated = dict(p)
        updated["id"] = code
        result.append(updated)
    return result


def _type_abbr(kind: str) -> str:
    return _TYPE_ABBR.get(kind, "OTR")


def _roman(n: int) -> str:
    if 1 <= n <= len(_ROMAN):
        return _ROMAN[n - 1]
    return str(n)


def _piece_code(cat: str, module_code: str, kind: str, seq: int) -> str:
    return f"{cat}-{module_code}-{_type_abbr(kind)}-{_roman(seq)}"


def _connector_code(cat: str, module_code: str, kind: str, seq: int) -> str:
    return f"{cat}-{module_code}-CON-{_type_abbr(kind)}-{_roman(seq)}"


def _step_code(cat: str, module_code: str, seq: int) -> str:
    return f"{cat}-{module_code}-PAS-{_roman(seq)}"


def _box_dimensions(piece: Piece, kind: str) -> Tuple[float, float, float]:
    """Devuelve (ancho, alto, profundidad) en mm según el tipo de pieza."""
    w = _to_mm(piece.width_cm)
    h = _to_mm(piece.height_cm)
    t = float(piece.thickness_mm)
    if kind in ("base", "tapa", "estante", "repisa", "zocalo", "cajon"):
        return (w, t, h)
    if kind in ("lateral", "lateral_izq", "lateral_der", "division"):
        return (t, h, w)
    if kind in ("fondo", "puerta", "zapatero"):
        return (w, h, t)
    if kind == "pata":
        return (t, h, t)
    return (w, h, t)


def _point3d(x: float, y: float, z: float) -> Dict[str, float]:
    return {"x": x, "y": y, "z": z}


def _rotation3d(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Dict[str, float]:
    return {"x": x, "y": y, "z": z}


def _distance(p1: Dict[str, float], p2: Dict[str, float]) -> float:
    return math.sqrt((p1["x"] - p2["x"]) ** 2 + (p1["y"] - p2["y"]) ** 2 + (p1["z"] - p2["z"]) ** 2)


def _rotation_diff(r1: Dict[str, float], r2: Dict[str, float]) -> Dict[str, float]:
    return {
        "x": abs(r1["x"] - r2["x"]),
        "y": abs(r1["y"] - r2["y"]),
        "z": abs(r1["z"] - r2["z"]),
    }


# -----------------------------------------------------------------------------
# Estructuras internas
# -----------------------------------------------------------------------------
@dataclass
class _PlacedPiece:
    piece_id: Optional[str]
    module_code: str
    module_category: str
    kind: str
    code: str
    name: str
    color: str
    width_mm: float
    height_mm: float
    depth_mm: float
    position: Dict[str, float]
    rotation: Dict[str, float]
    tolerance_position_mm: float
    tolerance_rotation_deg: float
    dependencies: List[str]
    edge_banding: str = ""
    piece_db_id: Optional[str] = None
    extra_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class _Module:
    code: str
    category: str
    pieces: List[Piece] = field(default_factory=list)
    x_mm: float = 0.0
    width_mm: float = 0.0
    height_mm: float = 0.0
    depth_mm: float = 0.0
    base_thickness_mm: float = 18.0
    top_thickness_mm: float = 18.0
    lateral_thickness_mm: float = 18.0


@dataclass
class _Division:
    code: str
    category: str
    x_mm: float
    thickness_mm: float
    height_mm: float
    depth_mm: float


@dataclass
class _Connector:
    code: str
    connector_type: str
    position: Dict[str, float]
    direction: Dict[str, float]
    piece_codes: List[str]
    step_code: Optional[str] = None


@dataclass
class _Step:
    code: str
    step_number: int
    title: str
    description: str
    module_code: Optional[str]
    piece_codes: List[str]
    connector_codes: List[str]
    tool_ids: List[str]
    dependencies: List[str]
    camera: Optional[Dict[str, Any]]
    animation: Optional[Dict[str, Any]]
    placed_pieces: List[_PlacedPiece] = field(default_factory=list)
    connectors: List[_Connector] = field(default_factory=list)
    tiempo_estimado_min: int = 0


# -----------------------------------------------------------------------------
# Motor de ensamblaje
# -----------------------------------------------------------------------------
class AssemblyEngine:
    @staticmethod
    def build_assembly(project_id: str, pieces: List[Piece]) -> Dict[str, Any]:
        """Genera la estructura completa de ensamblaje a partir de las piezas."""
        if not pieces:
            return {
                "modules": [],
                "pieces": [],
                "connectors": [],
                "steps": [],
                "state": None,
                "pasos": [],
                "vista_completa": [],
                "conectores_completos": [],
            }

        # 1. Agrupar en módulos
        groups: Dict[str, List[Piece]] = {}
        for p in pieces:
            code = _infer_module(p)
            groups.setdefault(code, []).append(p)

        def _module_sort_key(c: str) -> int:
            if c == "GLB":
                return 0
            match = re.match(r"M(\d+)", c)
            return int(match.group(1)) if match else 999

        module_codes = sorted(groups.keys(), key=_module_sort_key)
        modules: List[_Module] = []
        for code in module_codes:
            mod_pieces = groups[code]
            cat = _module_category(code, mod_pieces)
            mod = _Module(code=code, category=cat, pieces=mod_pieces)
            mod.base_thickness_mm = _thickness_of_kind(mod_pieces, "base") or mod.base_thickness_mm
            mod.top_thickness_mm = _thickness_of_kind(mod_pieces, "tapa") or mod.top_thickness_mm
            mod.lateral_thickness_mm = _thickness_of_kind(mod_pieces, "lateral") or mod.lateral_thickness_mm
            mod.width_mm = _module_width(mod_pieces)
            mod.height_mm = _module_height(mod_pieces)
            mod.depth_mm = _module_depth(mod_pieces)
            modules.append(mod)

        # 2. Posicionar módulos en X
        x_cursor = 0.0
        for mod in modules:
            mod.x_mm = x_cursor
            x_cursor += mod.width_mm

        # 3. Generar divisiones compartidas entre módulos
        divisions: List[_Division] = []
        for i in range(len(modules) - 1):
            left = modules[i]
            right = modules[i + 1]
            cat = _higher_category(left.category, right.category)
            div = _Division(
                code=f"{cat}-DIV-{_roman(i + 1)}",
                category=cat,
                x_mm=left.x_mm + left.width_mm,
                thickness_mm=left.lateral_thickness_mm,
                height_mm=max(left.height_mm, right.height_mm),
                depth_mm=max(left.depth_mm, right.depth_mm),
            )
            divisions.append(div)

        # 4. Posicionar piezas
        placed: List[_PlacedPiece] = []
        seq_by_module_type: Dict[str, Dict[str, int]] = {}

        for mod in modules:
            seq_by_module_type[mod.code] = {}
            mod_pieces = mod.pieces
            base = _first_of_kind(mod_pieces, "base")
            tapa = _first_of_kind(mod_pieces, "tapa")
            fondo = _first_of_kind(mod_pieces, "fondo")
            laterales = _all_of_kind(mod_pieces, "lateral") + _all_of_kind(mod_pieces, "lateral_izq") + _all_of_kind(mod_pieces, "lateral_der")
            estantes = _all_of_kind(mod_pieces, "estante") + _all_of_kind(mod_pieces, "repisa")
            puertas = _all_of_kind(mod_pieces, "puerta")
            zapateros = _all_of_kind(mod_pieces, "zapatero")
            zocalos = _all_of_kind(mod_pieces, "zocalo")
            cajones = _all_of_kind(mod_pieces, "cajon")
            patas = _all_of_kind(mod_pieces, "pata")

            # Laterales / divisiones del módulo
            mod_index = modules.index(mod)
            left_div = divisions[mod_index - 1] if mod_index > 0 else None
            right_div = divisions[mod_index] if mod_index < len(divisions) else None

            # Lateral izquierdo (bordo o división compartida)
            left_piece = _first_of_kind(laterales, "lateral_izq") or _first_of_kind(laterales, "lateral")
            if left_div:
                placed.append(_build_division_piece(left_div, mod, "left", left_piece))
            elif left_piece:
                placed.append(_build_placed_piece(left_piece, mod, "lateral_izq", seq_by_module_type[mod.code], seq_key="lateral"))
            elif len(modules) == 1:
                # Fallback: un único módulo sin laterales no genera lateral ficticio
                pass

            # Lateral derecho
            right_piece = _first_of_kind(laterales, "lateral_der") or _first_of_kind(laterales, "lateral")
            if right_div:
                placed.append(_build_division_piece(right_div, mod, "right", right_piece))
            elif right_piece:
                placed.append(_build_placed_piece(right_piece, mod, "lateral_der", seq_by_module_type[mod.code], seq_key="lateral"))

            # Base
            if base:
                placed.append(_build_placed_piece(base, mod, "base", seq_by_module_type[mod.code]))
            # Patas
            for p in patas:
                placed.append(_build_placed_piece(p, mod, "pata", seq_by_module_type[mod.code]))
            # Estantes / repisas
            for p in estantes:
                placed.append(_build_placed_piece(p, mod, "estante", seq_by_module_type[mod.code]))
            # Zapateros
            for p in zapateros:
                placed.append(_build_placed_piece(p, mod, "zapatero", seq_by_module_type[mod.code]))
            # Zócalos
            for p in zocalos:
                placed.append(_build_placed_piece(p, mod, "zocalo", seq_by_module_type[mod.code]))
            # Cajones
            for p in cajones:
                placed.append(_build_placed_piece(p, mod, "cajon", seq_by_module_type[mod.code]))
            # Tapa
            if tapa:
                placed.append(_build_placed_piece(tapa, mod, "tapa", seq_by_module_type[mod.code]))
            # Fondo
            if fondo:
                placed.append(_build_placed_piece(fondo, mod, "fondo", seq_by_module_type[mod.code]))
            # Puertas
            for idx, p in enumerate(puertas):
                placed.append(_build_placed_piece(p, mod, "puerta", seq_by_module_type[mod.code], index=idx, count=len(puertas)))

            # Piezas genéricas no clasificadas (other)
            placed_codes = {pp.piece_id for pp in placed if pp.module_code == mod.code}
            for p in mod_pieces:
                if p.id not in placed_codes and _piece_type_with_fallback(p) == "other":
                    placed.append(_build_placed_piece(p, mod, "other", seq_by_module_type[mod.code]))
                    placed_codes.add(p.id)

        # 5. Generar conectores
        connectors = _generate_connectors(placed, modules, divisions)

        # 6. Generar pasos y asignar conectores a pasos
        steps = _generate_steps(placed, connectors, modules, divisions, pieces)

        # 7. Construir respuestas compatibles
        pasos = [_step_to_dict(s) for s in steps]
        vista_completa = [_placed_to_3d(p) for p in placed]
        conectores_completos = [_connector_to_dict(c) for c in connectors]

        # 8. Datos persistentes
        modules_data = [_module_to_dict(m) for m in modules]
        pieces_data = [_placed_to_dict(p) for p in placed]
        connectors_data = [_connector_to_dict(c) for c in connectors]
        steps_data = [_step_to_dict(s) for s in steps]

        state_data = {
            "current_step_id": None,
            "completed_step_ids": [],
            "started_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        return {
            "modules": modules_data,
            "pieces": pieces_data,
            "connectors": connectors_data,
            "steps": steps_data,
            "state": state_data,
            "pasos": pasos,
            "vista_completa": vista_completa,
            "conectores_completos": conectores_completos,
        }

    @staticmethod
    def persist_assembly(db: Session, project_id: str, pieces: List[Piece]) -> Dict[str, Any]:
        """Borra ensamblajes anteriores y persiste el nuevo."""
        AssemblyEngine._clear_project_assembly(db, project_id)
        data = AssemblyEngine.build_assembly(project_id, pieces)

        # Guardar módulos
        module_id_by_code: Dict[str, str] = {}
        for m in data["modules"]:
            mod_db = AssemblyModuleModel(
                project_id=project_id,
                code=m["code"],
                category=m["category"],
                name=m["name"],
                position=m["position"],
                dimensions=m["dimensions"],
                order_index=m["order_index"],
            )
            db.add(mod_db)
            db.flush()
            module_id_by_code[m["code"]] = mod_db.id

        # Guardar piezas
        piece_id_by_code: Dict[str, str] = {}
        for p in data["pieces"]:
            mod_id = module_id_by_code.get(p["module_code"]) if p["module_code"] else None
            piece_db = AssemblyPieceModel(
                project_id=project_id,
                module_id=mod_id,
                piece_id=p.get("piece_id"),
                code=p["code"],
                category=p["category"],
                piece_type=p["piece_type"],
                expected_position=p["expected_position"],
                expected_rotation=p["expected_rotation"],
                current_position=p.get("current_position"),
                current_rotation=p.get("current_rotation"),
                tolerance_position_mm=p["tolerance_position_mm"],
                tolerance_rotation_deg=p["tolerance_rotation_deg"],
                status=p["status"],
                dependencies=p["dependencies"],
                extra_data=p["extra_data"],
            )
            db.add(piece_db)
            db.flush()
            piece_id_by_code[p["code"]] = piece_db.id

        # Guardar conectores (sin step_id por ahora)
        connector_id_by_code: Dict[str, str] = {}
        for c in data["connectors"]:
            conn_db = AssemblyConnectorModel(
                project_id=project_id,
                code=c["code"],
                connector_type=c["connector_type"],
                position=c["position"],
                direction=c["direction"],
                piece_codes=c["piece_codes"],
                step_id=None,
            )
            db.add(conn_db)
            db.flush()
            connector_id_by_code[c["code"]] = conn_db.id

        # Guardar pasos y asignar conectores
        step_id_by_code: Dict[str, str] = {}
        for s in data["steps"]:
            mod_id = module_id_by_code.get(s.get("module_code")) if s.get("module_code") else None
            step_db = AssemblyStepModel(
                project_id=project_id,
                step_number=s["step_number"],
                code=s["code"],
                title=s["title"],
                description=s["description"],
                module_id=mod_id,
                piece_codes=s["piece_codes"],
                connector_ids=[connector_id_by_code.get(c) for c in s["connector_ids"] if connector_id_by_code.get(c)],
                tool_ids=s["tool_ids"],
                dependencies=s["dependencies"],
                camera=s.get("camera"),
                animation=s.get("animation"),
                status=s["status"],
            )
            db.add(step_db)
            db.flush()
            step_id_by_code[s["code"]] = step_db.id
            # Actualizar step_id de conectores asignados
            for c in s["connector_ids"]:
                cid = connector_id_by_code.get(c)
                if cid:
                    conn = db.query(AssemblyConnectorModel).filter(AssemblyConnectorModel.id == cid).first()
                    if conn:
                        conn.step_id = step_db.id

        # Guardar estado
        state = data["state"]
        if state:
            state_db = AssemblyStateModel(
                project_id=project_id,
                current_step_id=None,
                completed_step_ids=[],
                started_at=state["started_at"],
                updated_at=state["updated_at"],
            )
            db.add(state_db)

        db.commit()

        # Recargar con códigos reales de DB
        return AssemblyEngine.load_assembly(db, project_id)

    @staticmethod
    def load_assembly(db: Session, project_id: str) -> Dict[str, Any]:
        """Carga un ensamblaje persistido y construye la respuesta de API."""
        modules_db = db.query(AssemblyModuleModel).filter(AssemblyModuleModel.project_id == project_id).order_by(AssemblyModuleModel.order_index).all()
        pieces_db = db.query(AssemblyPieceModel).filter(AssemblyPieceModel.project_id == project_id).all()
        connectors_db = db.query(AssemblyConnectorModel).filter(AssemblyConnectorModel.project_id == project_id).all()
        steps_db = db.query(AssemblyStepModel).filter(AssemblyStepModel.project_id == project_id).order_by(AssemblyStepModel.step_number).all()
        state_db = db.query(AssemblyStateModel).filter(AssemblyStateModel.project_id == project_id).first()

        piece_by_code: Dict[str, AssemblyPieceModel] = {p.code: p for p in pieces_db}
        connector_by_id: Dict[str, AssemblyConnectorModel] = {c.id: c for c in connectors_db}

        modules_data = [
            AssemblyModule.model_validate({
                "id": m.id,
                "project_id": m.project_id,
                "code": m.code,
                "category": m.category.value if m.category else None,
                "name": m.name,
                "position": m.position,
                "dimensions": m.dimensions,
                "order_index": m.order_index,
            }).model_dump()
            for m in modules_db
        ]
        pieces_data = [
            AssemblyPiece.model_validate({
                "id": p.id,
                "project_id": p.project_id,
                "module_id": p.module_id,
                "piece_id": p.piece_id,
                "code": p.code,
                "category": p.category,
                "piece_type": p.piece_type,
                "expected_position": p.expected_position,
                "expected_rotation": p.expected_rotation,
                "current_position": p.current_position,
                "current_rotation": p.current_rotation,
                "tolerance_position_mm": p.tolerance_position_mm,
                "tolerance_rotation_deg": p.tolerance_rotation_deg,
                "status": p.status.value if p.status else None,
                "dependencies": p.dependencies,
                "extra_data": p.extra_data,
            }).model_dump()
            for p in pieces_db
        ]
        connectors_data = [
            AssemblyConnector.model_validate({
                "id": c.id,
                "project_id": c.project_id,
                "code": c.code,
                "connector_type": c.connector_type,
                "position": c.position,
                "direction": c.direction,
                "piece_codes": c.piece_codes,
                "step_id": c.step_id,
            }).model_dump()
            for c in connectors_db
        ]

        # Construir pasos con vista 3D
        pasos: List[Dict[str, Any]] = []
        steps_data: List[Dict[str, Any]] = []
        for step_db in steps_db:
            step_dict = AssemblyStep.model_validate({
                "id": step_db.id,
                "project_id": step_db.project_id,
                "step_number": step_db.step_number,
                "code": step_db.code,
                "title": step_db.title,
                "description": step_db.description,
                "module_id": step_db.module_id,
                "piece_codes": step_db.piece_codes,
                "connector_ids": step_db.connector_ids,
                "tool_ids": step_db.tool_ids,
                "dependencies": step_db.dependencies,
                "camera": step_db.camera,
                "animation": step_db.animation,
                "status": step_db.status.value if step_db.status else None,
            }).model_dump()
            step_pieces_3d = []
            for code in step_db.piece_codes:
                p = piece_by_code.get(code)
                if p:
                    step_pieces_3d.append(_db_piece_to_3d(p))
            step_connectors = []
            for cid in step_db.connector_ids:
                c = connector_by_id.get(cid)
                if c:
                    step_connectors.append(AssemblyConnector.model_validate({
                        "id": c.id,
                        "project_id": c.project_id,
                        "code": c.code,
                        "connector_type": c.connector_type,
                        "position": c.position,
                        "direction": c.direction,
                        "piece_codes": c.piece_codes,
                        "step_id": c.step_id,
                    }).model_dump())
            step_dict["piezas_3d"] = step_pieces_3d
            step_dict["conectores"] = step_connectors
            step_dict["tiempo_estimado_min"] = step_db.animation.get("duration_min", 5) if step_db.animation else 5
            step_validated = AssemblyStep.model_validate(step_dict).model_dump()
            pasos.append(step_validated)
            steps_data.append(step_validated)

        vista_completa = [_db_piece_to_3d(p) for p in pieces_db]
        conectores_completos = [
            AssemblyConnector.model_validate({
                "id": c.id,
                "project_id": c.project_id,
                "code": c.code,
                "connector_type": c.connector_type,
                "position": c.position,
                "direction": c.direction,
                "piece_codes": c.piece_codes,
                "step_id": c.step_id,
            }).model_dump()
            for c in connectors_db
        ]

        state_data = None
        if state_db:
            state_data = AssemblyState.model_validate({
                "id": state_db.id,
                "project_id": state_db.project_id,
                "current_step_id": state_db.current_step_id,
                "completed_step_ids": state_db.completed_step_ids,
                "started_at": state_db.started_at,
                "updated_at": state_db.updated_at,
            }).model_dump()

        return {
            "modules": modules_data,
            "pieces": pieces_data,
            "connectors": connectors_data,
            "steps": steps_data,
            "state": state_data,
            "pasos": pasos,
            "vista_completa": vista_completa,
            "conectores_completos": conectores_completos,
        }

    @staticmethod
    def get_or_create_assembly(db: Session, project_id: str) -> Dict[str, Any]:
        has_modules = db.query(AssemblyModuleModel).filter(AssemblyModuleModel.project_id == project_id).first()
        if has_modules:
            return AssemblyEngine.load_assembly(db, project_id)

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
        pieces = db.query(Piece).filter(Piece.project_id == project_id).all()
        if not pieces:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El proyecto no tiene piezas")
        return AssemblyEngine.persist_assembly(db, project_id, pieces)

    @staticmethod
    def generate_for_project(db: Session, project_id: str) -> Dict[str, Any]:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")
        pieces = db.query(Piece).filter(Piece.project_id == project_id).all()
        if not pieces:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El proyecto no tiene piezas")
        return AssemblyEngine.persist_assembly(db, project_id, pieces)

    @staticmethod
    def validate_piece(piece: AssemblyPiece, current: Transform3D) -> Dict[str, Any]:
        expected_pos = {
            "x": piece.posicion_esperada.x,
            "y": piece.posicion_esperada.y,
            "z": piece.posicion_esperada.z,
        }
        expected_rot = {
            "x": piece.rotacion_esperada.x,
            "y": piece.rotacion_esperada.y,
            "z": piece.rotacion_esperada.z,
        }
        current_pos = {"x": current.position.x, "y": current.position.y, "z": current.position.z}
        current_rot = {"x": current.rotation.x, "y": current.rotation.y, "z": current.rotation.z}

        pos_err = _distance(expected_pos, current_pos)
        rot_err = _rotation_diff(expected_rot, current_rot)
        rot_ok = all(v <= piece.tolerancia_rotacion_deg for v in rot_err.values())
        pos_ok = pos_err <= piece.tolerancia_posicion_mm

        errors: List[str] = []
        if not pos_ok:
            errors.append(f"Posicion desplazada {pos_err:.2f} mm (tolerancia {piece.tolerancia_posicion_mm} mm)")
        if not rot_ok:
            errors.append(f"Rotacion fuera de tolerancia: {rot_err}")

        return {
            "code": piece.codigo,
            "valid": pos_ok and rot_ok,
            "position_error_mm": pos_err,
            "rotation_error_deg": rot_err,
            "errors": errors,
        }

    @staticmethod
    def validate_step(db: Session, step_id: str, piece_transforms: Dict[str, Transform3D]) -> AssemblyValidationResult:
        step = db.query(AssemblyStepModel).filter(AssemblyStepModel.id == step_id).first()
        if not step:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paso no encontrado")
        pieces_db = db.query(AssemblyPieceModel).filter(AssemblyPieceModel.code.in_(step.piece_codes)).all()
        piece_by_code = {p.code: p for p in pieces_db}

        piece_results: Dict[str, Dict[str, Any]] = {}
        errors: List[str] = []
        all_valid = True

        for code in step.piece_codes:
            piece_db = piece_by_code.get(code)
            if not piece_db:
                errors.append(f"Pieza {code} no encontrada en el paso")
                all_valid = False
                continue
            transform = piece_transforms.get(code)
            if not transform:
                errors.append(f"Falta transform para pieza {code}")
                all_valid = False
                continue
            piece_schema = AssemblyPiece.model_validate(piece_db)
            result = AssemblyEngine.validate_piece(piece_schema, transform)
            piece_results[code] = result
            if not result["valid"]:
                all_valid = False
                errors.extend(result["errors"])

        # Siguiente paso candidato
        next_step = None
        if all_valid:
            next = (
                db.query(AssemblyStepModel)
                .filter(
                    AssemblyStepModel.project_id == step.project_id,
                    AssemblyStepModel.step_number > step.step_number,
                )
                .order_by(AssemblyStepModel.step_number)
                .first()
            )
            if next:
                next_step = next.id

        return AssemblyValidationResult(
            step_id=step_id,
            valid=all_valid,
            piece_results=piece_results,
            errors=errors,
            next_step_id=next_step,
        )

    @staticmethod
    def update_progress(db: Session, step_id: str, update: AssemblyProgressUpdate) -> Dict[str, Any]:
        step = db.query(AssemblyStepModel).filter(AssemblyStepModel.id == step_id).first()
        if not step:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paso no encontrado")
        project_id = step.project_id

        piece_by_code: Dict[str, AssemblyPieceModel] = {}
        if update.piece_updates:
            pieces_db = db.query(AssemblyPieceModel).filter(AssemblyPieceModel.code.in_(update.piece_updates.keys())).all()
            piece_by_code = {p.code: p for p in pieces_db}
            for code, transform in update.piece_updates.items():
                piece_db = piece_by_code.get(code)
                if not piece_db:
                    continue
                piece_db.current_position = {
                    "x": transform.position.x,
                    "y": transform.position.y,
                    "z": transform.position.z,
                }
                piece_db.current_rotation = {
                    "x": transform.rotation.x,
                    "y": transform.rotation.y,
                    "z": transform.rotation.z,
                }
                if update.status:
                    piece_db.status = update.status
                else:
                    piece_schema = AssemblyPiece.model_validate(piece_db)
                    result = AssemblyEngine.validate_piece(piece_schema, transform)
                    piece_db.status = "ALIGNED" if result["valid"] else "ERROR"

        if update.status:
            for p in piece_by_code.values():
                p.status = update.status

        # Actualizar estado de ensamblaje
        state = db.query(AssemblyStateModel).filter(AssemblyStateModel.project_id == project_id).first()
        if state:
            if step.id not in state.completed_step_ids:
                state.completed_step_ids = list(state.completed_step_ids) + [step.id]
            state.current_step_id = step.id
            state.updated_at = datetime.utcnow()

        db.commit()

        return AssemblyEngine.load_assembly(db, project_id)

    @staticmethod
    def _clear_project_assembly(db: Session, project_id: str) -> None:
        db.query(AssemblyStepModel).filter(AssemblyStepModel.project_id == project_id).delete()
        db.query(AssemblyConnectorModel).filter(AssemblyConnectorModel.project_id == project_id).delete()
        db.query(AssemblyPieceModel).filter(AssemblyPieceModel.project_id == project_id).delete()
        db.query(AssemblyModuleModel).filter(AssemblyModuleModel.project_id == project_id).delete()
        db.query(AssemblyStateModel).filter(AssemblyStateModel.project_id == project_id).delete()
        db.commit()


# -----------------------------------------------------------------------------
# API pública del módulo (wrappers para no exponer la clase directamente)
# -----------------------------------------------------------------------------
def get_assembly(db: Session, project_id: str) -> Dict[str, Any]:
    return AssemblyEngine.get_or_create_assembly(db, project_id)


def generate_for_project(db: Session, project_id: str) -> Dict[str, Any]:
    return AssemblyEngine.generate_for_project(db, project_id)


def validate_step(db: Session, step_id: str, piece_transforms: Dict[str, Transform3D]) -> AssemblyValidationResult:
    return AssemblyEngine.validate_step(db, step_id, piece_transforms)


def update_progress(db: Session, step_id: str, update: AssemblyProgressUpdate) -> Dict[str, Any]:
    return AssemblyEngine.update_progress(db, step_id, update)


# -----------------------------------------------------------------------------
# Helpers de ensamblaje internos
# -----------------------------------------------------------------------------
def _thickness_of_kind(pieces: List[Piece], kind: str) -> Optional[float]:
    for p in pieces:
        if _piece_type_with_fallback(p) == kind or (kind == "lateral" and _piece_type_with_fallback(p).startswith("lateral")):
            return float(p.thickness_mm)
    return None


def _module_width(pieces: List[Piece]) -> float:
    horizontals = {"base", "tapa", "estante", "repisa", "puerta", "zapatero", "zocalo", "cajon"}
    vals = [_to_mm(p.width_cm) for p in pieces if _piece_type_with_fallback(p) in horizontals]
    if not vals:
        vals = [_to_mm(p.width_cm) for p in pieces]
    return max(vals, default=0.0)


def _module_height(pieces: List[Piece]) -> float:
    verticals = {"lateral", "lateral_izq", "lateral_der", "fondo", "puerta"}
    vals = [_to_mm(p.height_cm) for p in pieces if _piece_type_with_fallback(p) in verticals]
    if not vals:
        vals = [_to_mm(p.height_cm) for p in pieces]
    return max(vals, default=0.0)


def _module_depth(pieces: List[Piece]) -> float:
    # Laterales aportan su ancho como profundidad; base/tapa aportan su alto; fondo/puerta su espesor
    vals: List[float] = []
    for p in pieces:
        kind = _piece_type_with_fallback(p)
        if kind.startswith("lateral"):
            vals.append(_to_mm(p.width_cm))
        elif kind in ("base", "tapa", "estante", "repisa", "zapatero", "zocalo", "cajon"):
            vals.append(_to_mm(p.height_cm))
        elif kind in ("fondo", "puerta"):
            vals.append(float(p.thickness_mm))
    if not vals:
        vals = [_to_mm(p.height_cm) for p in pieces] + [_to_mm(p.width_cm) for p in pieces]
    return max(vals, default=0.0)


def _higher_category(a: str, b: str) -> str:
    priority = {"SUP": 3, "INF": 2, "GLOBAL": 1}
    return a if priority.get(a, 0) >= priority.get(b, 0) else b


def _first_of_kind(pieces: List[Piece], kind: str) -> Optional[Piece]:
    for p in pieces:
        if _piece_type_with_fallback(p) == kind:
            return p
    return None


def _all_of_kind(pieces: List[Piece], kind: str) -> List[Piece]:
    return [p for p in pieces if _piece_type_with_fallback(p) == kind]


def _next_seq(seqs: Dict[str, int], kind: str) -> int:
    seqs[kind] = seqs.get(kind, 0) + 1
    return seqs[kind]


def _build_placed_piece(
    piece: Piece,
    mod: _Module,
    kind: str,
    seqs: Dict[str, int],
    index: int = 0,
    count: int = 1,
    seq_key: Optional[str] = None,
) -> _PlacedPiece:
    code = _piece_code(mod.category, mod.code, seq_key or kind, _next_seq(seqs, seq_key or kind))
    dims = _box_dimensions(piece, kind)
    width_mm, height_mm, depth_mm = dims
    position = _position_for_kind(kind, mod, dims, index, count, piece)
    rotation = _rotation_for_kind(kind)
    return _PlacedPiece(
        piece_id=piece.id,
        module_code=mod.code,
        module_category=mod.category,
        kind=kind,
        code=code,
        name=piece.name,
        color=piece.color,
        width_mm=width_mm,
        height_mm=height_mm,
        depth_mm=depth_mm,
        position=position,
        rotation=rotation,
        tolerance_position_mm=DEFAULT_POSITION_TOLERANCE_MM,
        tolerance_rotation_deg=DEFAULT_ROTATION_TOLERANCE_DEG,
        dependencies=[],
        extra_data={"external_id": piece.external_id, "edge_banding": piece.edge_banding or ""},
        edge_banding=piece.edge_banding or "",
        piece_db_id=piece.id,
    )


def _build_division_piece(div: _Division, mod: _Module, side: str, source_piece: Optional[Piece]) -> _PlacedPiece:
    dims = (div.thickness_mm, div.height_mm, div.depth_mm)
    if side == "left":
        x = div.x_mm
    else:
        x = div.x_mm - div.thickness_mm
    position = _point3d(x, mod.base_thickness_mm, 0.0)
    return _PlacedPiece(
        piece_id=source_piece.id if source_piece else None,
        module_code=mod.code,
        module_category=div.category,
        kind="division",
        code=div.code,
        name=f"Division {div.code}",
        color="#9CA3AF",
        width_mm=div.thickness_mm,
        height_mm=div.height_mm,
        depth_mm=div.depth_mm,
        position=position,
        rotation=_rotation3d(),
        tolerance_position_mm=DEFAULT_POSITION_TOLERANCE_MM,
        tolerance_rotation_deg=DEFAULT_ROTATION_TOLERANCE_DEG,
        dependencies=[],
        extra_data={"shared": True, "side": side},
        edge_banding="",
        piece_db_id=source_piece.id if source_piece else None,
    )


def _position_for_kind(kind: str, mod: _Module, dims: Tuple[float, float, float], index: int, count: int, piece: Piece) -> Dict[str, float]:
    w, h, d = dims
    if kind == "base":
        return _point3d(mod.x_mm, 0.0, 0.0)
    if kind == "pata":
        # Dos patas frontales por defecto; si hay más se distribuyen
        x_positions = [mod.x_mm, mod.x_mm + mod.width_mm - w]
        if count > 2:
            x_positions += [mod.x_mm + mod.width_mm / 2 - w / 2]
        x = x_positions[index % len(x_positions)]
        return _point3d(x, -h, 0.0)
    if kind == "lateral_izq":
        return _point3d(mod.x_mm, mod.base_thickness_mm, 0.0)
    if kind == "lateral_der":
        return _point3d(mod.x_mm + mod.width_mm - w, mod.base_thickness_mm, 0.0)
    if kind == "lateral":
        # Lateral genérico: usado como izquierdo si es el único
        return _point3d(mod.x_mm, mod.base_thickness_mm, 0.0)
    if kind == "tapa":
        return _point3d(mod.x_mm, mod.base_thickness_mm + mod.height_mm, 0.0)
    if kind == "fondo":
        # Fondo entre laterales, en la cara trasera (Z = profundidad - espesor fondo)
        lat_thickness = mod.lateral_thickness_mm
        return _point3d(mod.x_mm + lat_thickness, mod.base_thickness_mm, mod.depth_mm - h)
    if kind == "estante":
        usable = mod.height_mm
        n = max(count, 1)
        if count == 1:
            y = mod.base_thickness_mm + usable / 2
        else:
            step = usable / (n + 1)
            y = mod.base_thickness_mm + step * (index + 1)
        return _point3d(mod.x_mm + mod.lateral_thickness_mm, y - h / 2, 0.0)
    if kind == "repisa":
        return _point3d(mod.x_mm + mod.lateral_thickness_mm, mod.base_thickness_mm + mod.height_mm / 2, 0.0)
    if kind == "puerta":
        door_width = mod.width_mm / max(count, 1)
        x = mod.x_mm + index * door_width
        return _point3d(x, mod.base_thickness_mm, mod.depth_mm - h)
    if kind == "zapatero":
        return _point3d(mod.x_mm + mod.lateral_thickness_mm, mod.base_thickness_mm + mod.height_mm / 2, 0.0)
    if kind == "zocalo":
        return _point3d(mod.x_mm + mod.lateral_thickness_mm, 0.0, 0.0)
    if kind == "cajon":
        return _point3d(mod.x_mm + mod.lateral_thickness_mm, mod.base_thickness_mm + mod.height_mm / 2, 0.0)
    return _point3d(mod.x_mm, mod.base_thickness_mm, 0.0)


def _rotation_for_kind(kind: str) -> Dict[str, float]:
    return _rotation3d()


def _placed_to_3d(p: _PlacedPiece) -> Dict[str, Any]:
    return {
        "id": p.code,
        "nombre": p.name,
        "ancho": p.width_mm / 10.0,
        "alto": p.height_mm / 10.0,
        "profundidad": p.depth_mm / 10.0,
        "color": p.color,
        "posicion": p.position,
        "rotacion": p.rotation,
    }


def _db_piece_to_3d(p: AssemblyPieceModel) -> Dict[str, Any]:
    dims = _box_dimensions_from_db(p)
    return {
        "id": p.code,
        "nombre": p.piece.name if p.piece else p.code,
        "ancho": dims[0] / 10.0,
        "alto": dims[1] / 10.0,
        "profundidad": dims[2] / 10.0,
        "color": p.piece.color if p.piece else "#3B82F6",
        "posicion": p.expected_position,
        "rotacion": p.expected_rotation,
    }


def _box_dimensions_from_db(p: AssemblyPieceModel) -> Tuple[float, float, float]:
    if p.piece:
        return _box_dimensions(p.piece, p.piece_type)
    # Fallback aproximado desde posición no disponible; usamos valores por defecto
    return (18.0, 18.0, 18.0)


def _generate_connectors(placed: List[_PlacedPiece], modules: List[_Module], divisions: List[_Division]) -> List[_Connector]:
    connectors: List[_Connector] = []
    seq_by_module: Dict[str, int] = {}

    for mod in modules:
        seq_by_module[mod.code] = 0
        mod_pieces = [p for p in placed if p.module_code == mod.code]
        horizontals = [p for p in mod_pieces if p.kind in ("base", "tapa", "estante", "repisa", "zocalo")]
        laterals = [p for p in mod_pieces if p.kind in ("lateral", "lateral_izq", "lateral_der")]
        divs = [p for p in mod_pieces if p.kind == "division"]
        fondo = next((p for p in mod_pieces if p.kind == "fondo"), None)
        puertas = [p for p in mod_pieces if p.kind == "puerta"]
        patas = [p for p in mod_pieces if p.kind == "pata"]
        side_pieces = laterals + divs

        # Confirmats entre horizontales y laterales/división
        for hor in horizontals:
            for side in side_pieces:
                side_x = side.position["x"]
                side_t = side.width_mm
                side_center_x = side_x + side_t / 2
                dir_x = -1.0 if side_center_x < mod.x_mm + mod.width_mm / 2 else 1.0
                y = hor.position["y"] + hor.height_mm / 2
                z_offsets = [5.0, max(5.0, mod.depth_mm - 5.0)]
                for z in z_offsets:
                    seq_by_module[mod.code] += 1
                    connectors.append(_Connector(
                        code=_connector_code(mod.category, mod.code, "CNF", seq_by_module[mod.code]),
                        connector_type="confirmat",
                        position=_point3d(side_center_x, y, z),
                        direction=_point3d(dir_x, 0.0, 0.0),
                        piece_codes=[hor.code, side.code],
                    ))

        # Tacos para estantes (hacia laterales/división)
        for est in [p for p in mod_pieces if p.kind == "estante"]:
            for side in side_pieces:
                side_x = side.position["x"]
                side_t = side.width_mm
                side_center_x = side_x + side_t / 2
                dir_x = -1.0 if side_center_x < mod.x_mm + mod.width_mm / 2 else 1.0
                y = est.position["y"] + est.height_mm / 2
                z_offsets = [5.0, max(5.0, mod.depth_mm - 5.0)]
                for z in z_offsets:
                    seq_by_module[mod.code] += 1
                    connectors.append(_Connector(
                        code=_connector_code(mod.category, mod.code, "TAC", seq_by_module[mod.code]),
                        connector_type="taco",
                        position=_point3d(side_center_x, y, z),
                        direction=_point3d(dir_x, 0.0, 0.0),
                        piece_codes=[est.code, side.code],
                    ))

        # Tornillos para fondo
        if fondo:
            f_x = fondo.position["x"]
            f_y = fondo.position["y"]
            f_z = fondo.position["z"] + fondo.depth_mm / 2
            f_w = fondo.width_mm
            f_h = fondo.height_mm
            corners = [
                (f_x + 5.0, f_y + 5.0, f_z),
                (f_x + f_w - 5.0, f_y + 5.0, f_z),
                (f_x + 5.0, f_y + f_h - 5.0, f_z),
                (f_x + f_w - 5.0, f_y + f_h - 5.0, f_z),
            ]
            for cx, cy, cz in corners:
                seq_by_module[mod.code] += 1
                connectors.append(_Connector(
                    code=_connector_code(mod.category, mod.code, "TOR", seq_by_module[mod.code]),
                    connector_type="tornillo",
                    position=_point3d(cx, cy, cz),
                    direction=_point3d(0.0, 0.0, 1.0),
                    piece_codes=[fondo.code, side_pieces[0].code if side_pieces else ""],
                ))

        # Bisagras y tiradores para puertas
        for idx, pta in enumerate(puertas):
            pta_w = pta.width_mm
            pta_h = pta.height_mm
            pta_d = pta.depth_mm
            pta_x = pta.position["x"]
            pta_y = pta.position["y"]
            pta_z = pta.position["z"] + pta_d / 2
            # Bisagras a ambos lados verticales
            hinge_xs = [pta_x + 5.0, pta_x + pta_w - 5.0]
            for hx in hinge_xs:
                for y_rel in (0.2, 0.8):
                    seq_by_module[mod.code] += 1
                    connectors.append(_Connector(
                        code=_connector_code(mod.category, mod.code, "BIS", seq_by_module[mod.code]),
                        connector_type="bisagra",
                        position=_point3d(hx, pta_y + pta_h * y_rel, pta_z),
                        direction=_point3d(0.0, 1.0, 0.0),
                        piece_codes=[pta.code, side_pieces[0].code if side_pieces else ""],
                    ))
            # Tirador centrado
            seq_by_module[mod.code] += 1
            connectors.append(_Connector(
                code=_connector_code(mod.category, mod.code, "TIR", seq_by_module[mod.code]),
                connector_type="tirador",
                position=_point3d(pta_x + pta_w / 2, pta_y + pta_h / 2, pta_z + pta_d / 2 + 5.0),
                direction=_point3d(0.0, 0.0, 1.0),
                piece_codes=[pta.code],
            ))

        # Patas: tornillo/taco en unión con base
        for pata in patas:
            seq_by_module[mod.code] += 1
            connectors.append(_Connector(
                code=_connector_code(mod.category, mod.code, "PAT", seq_by_module[mod.code]),
                connector_type="pata",
                position=_point3d(pata.position["x"] + pata.width_mm / 2, pata.position["y"] + pata.height_mm, pata.position["z"] + pata.depth_mm / 2),
                direction=_point3d(0.0, 1.0, 0.0),
                piece_codes=[pata.code],
            ))

    return connectors


def _generate_steps(
    placed: List[_PlacedPiece],
    connectors: List[_Connector],
    modules: List[_Module],
    divisions: List[_Division],
    original_pieces: List[Piece],
) -> List[_Step]:
    steps: List[_Step] = []
    step_number = 1

    # Preparación: piezas con canto
    canto_pieces = [p for p in placed if p.edge_banding]
    if canto_pieces:
        steps.append(_create_step(
            step_number=step_number,
            title="Pegar cantos",
            description="Aplicar la plancha de canto pre-encolada a los bordes indicados.",
            module_code=None,
            pieces=canto_pieces,
            connectors=[],
            tools=_STEP_TOOLS["cantos"],
            tiempo=15,
            dependencies=[],
            modules=modules,
            divisions=divisions,
        ))
        step_number += 1

    # Pasos por módulo
    for mod in modules:
        mod_pieces = [p for p in placed if p.module_code == mod.code]
        mod_steps = _steps_for_module(mod, mod_pieces, step_number, steps, connectors, modules, divisions)
        steps.extend(mod_steps)
        step_number += len(mod_steps)

    # Paso global de acabados (puertas, cajones, zapateros)
    finish_pieces = [p for p in placed if p.kind in ("puerta", "cajon", "zapatero")]
    finish_connectors = [c for c in connectors if any(p.code in c.piece_codes for p in finish_pieces)]
    if finish_pieces:
        deps = [steps[-1].code] if steps else []
        steps.append(_create_step(
            step_number=step_number,
            title="Colocar puertas y acabados",
            description="Instalar bisagras, puertas, cajones, zapateros y herrajes restantes.",
            module_code=None,
            pieces=finish_pieces,
            connectors=finish_connectors,
            tools=_STEP_TOOLS["acabados"],
            tiempo=30,
            dependencies=deps,
            modules=modules,
            divisions=divisions,
        ))
        step_number += 1

    if not steps:
        # Fallback
        all_pieces = placed
        deps = []
        steps.append(_create_step(
            step_number=1,
            title="Ensamblaje general",
            description="No se detecto una estructura clara. Revisa las piezas y ensambla segun el plano.",
            module_code=None,
            pieces=all_pieces,
            connectors=[],
            tools=_STEP_TOOLS["general"],
            tiempo=30,
            dependencies=deps,
            modules=modules,
            divisions=divisions,
        ))

    return steps


def _steps_for_module(
    mod: _Module,
    mod_pieces: List[_PlacedPiece],
    start_number: int,
    previous_steps: List[_Step],
    connectors: List[_Connector],
    modules: List[_Module],
    divisions: List[_Division],
) -> List[_Step]:
    steps: List[_Step] = []
    n = start_number

    base_pieces = [p for p in mod_pieces if p.kind == "base"]
    pata_pieces = [p for p in mod_pieces if p.kind == "pata"]
    lateral_pieces = [p for p in mod_pieces if p.kind in ("lateral", "lateral_izq", "lateral_der", "division")]
    estante_pieces = [p for p in mod_pieces if p.kind in ("estante", "repisa")]
    tapa_pieces = [p for p in mod_pieces if p.kind == "tapa"]
    fondo_pieces = [p for p in mod_pieces if p.kind == "fondo"]

    def _mod_connectors(piece_codes: List[str]) -> List[_Connector]:
        return [c for c in connectors if any(code in c.piece_codes for code in piece_codes)]

    base_group = base_pieces + pata_pieces
    if base_group:
        steps.append(_create_step(
            step_number=n,
            title="Colocar base",
            description="Posicionar la base y patas sobre una superficie plana.",
            module_code=mod.code,
            pieces=base_group,
            connectors=_mod_connectors([p.code for p in base_group]),
            tools=_STEP_TOOLS["base_patas"],
            tiempo=10,
            dependencies=[previous_steps[-1].code] if previous_steps else [],
            modules=modules,
            divisions=divisions,
        ))
        n += 1

    if lateral_pieces:
        deps = [steps[-1].code] if steps else ([previous_steps[-1].code] if previous_steps else [])
        steps.append(_create_step(
            step_number=n,
            title="Atornillar laterales",
            description="Fijar los laterales y divisiones al cuerpo principal.",
            module_code=mod.code,
            pieces=lateral_pieces,
            connectors=_mod_connectors([p.code for p in lateral_pieces]),
            tools=_STEP_TOOLS["laterales"],
            tiempo=20,
            dependencies=deps,
            modules=modules,
            divisions=divisions,
        ))
        n += 1

    if estante_pieces:
        deps = [steps[-1].code] if steps else []
        steps.append(_create_step(
            step_number=n,
            title="Colocar estantes",
            description="Insertar los estantes intermedios a la altura indicada.",
            module_code=mod.code,
            pieces=estante_pieces,
            connectors=_mod_connectors([p.code for p in estante_pieces]),
            tools=_STEP_TOOLS["estantes"],
            tiempo=25,
            dependencies=deps,
            modules=modules,
            divisions=divisions,
        ))
        n += 1

    if tapa_pieces:
        deps = [steps[-1].code] if steps else []
        steps.append(_create_step(
            step_number=n,
            title="Colocar tapa",
            description="Atornillar la tapa superior cerrando el cuerpo del modulo.",
            module_code=mod.code,
            pieces=tapa_pieces,
            connectors=_mod_connectors([p.code for p in tapa_pieces]),
            tools=_STEP_TOOLS["tapa"],
            tiempo=15,
            dependencies=deps,
            modules=modules,
            divisions=divisions,
        ))
        n += 1

    if fondo_pieces:
        deps = [steps[-1].code] if steps else []
        steps.append(_create_step(
            step_number=n,
            title="Fijar fondo",
            description="Atornillar el fondo en la parte trasera del modulo.",
            module_code=mod.code,
            pieces=fondo_pieces,
            connectors=_mod_connectors([p.code for p in fondo_pieces]),
            tools=_STEP_TOOLS["fondo"],
            tiempo=15,
            dependencies=deps,
            modules=modules,
            divisions=divisions,
        ))
        n += 1

    handled_kinds = {
        "base", "pata", "lateral", "lateral_izq", "lateral_der", "division",
        "estante", "repisa", "tapa", "fondo",
    }
    remaining_pieces = [p for p in mod_pieces if p.kind not in handled_kinds]
    if remaining_pieces:
        deps = [steps[-1].code] if steps else []
        steps.append(_create_step(
            step_number=n,
            title="Colocar piezas restantes",
            description="Fijar las piezas adicionales del módulo según el plano.",
            module_code=mod.code,
            pieces=remaining_pieces,
            connectors=_mod_connectors([p.code for p in remaining_pieces]),
            tools=["Destornillador", "Taladro", "Nivel"],
            tiempo=15,
            dependencies=deps,
            modules=modules,
            divisions=divisions,
        ))
        n += 1

    return steps


def _create_step(
    step_number: int,
    title: str,
    description: str,
    module_code: Optional[str],
    pieces: List[_PlacedPiece],
    connectors: List[_Connector],
    tools: List[str],
    tiempo: int,
    dependencies: List[str],
    modules: List[_Module],
    divisions: List[_Division],
) -> _Step:
    cat = "GLB"
    if module_code:
        mod = next((m for m in modules if m.code == module_code), None)
        cat = mod.category if mod else "GLB"
    code = _step_code(cat, module_code or "GLB", step_number)
    return _Step(
        code=code,
        step_number=step_number,
        title=title,
        description=description,
        module_code=module_code,
        piece_codes=[p.code for p in pieces],
        connector_codes=[c.code for c in connectors],
        tool_ids=tools,
        dependencies=dependencies,
        camera={"target": pieces[0].position if pieces else _point3d(0, 0, 0), "distance": 500},
        animation=None,
        placed_pieces=pieces,
        connectors=connectors,
        tiempo_estimado_min=tiempo,
    )


def _step_to_dict(s: _Step) -> Dict[str, Any]:
    return {
        "id": None,
        "step_number": s.step_number,
        "numero": s.step_number,
        "code": s.code,
        "title": s.title,
        "titulo": s.title,
        "description": s.description,
        "descripcion": s.description,
        "module_code": s.module_code,
        "module_id": None,
        "piece_codes": s.piece_codes,
        "piezas": s.piece_codes,
        "connector_ids": s.connector_codes,
        "tool_ids": s.tool_ids,
        "herramientas": s.tool_ids,
        "dependencies": s.dependencies,
        "camera": s.camera,
        "animation": s.animation,
        "status": "PENDING",
        "piezas_3d": [_placed_to_3d(p) for p in s.placed_pieces],
        "conectores": [_connector_to_dict(c) for c in s.connectors],
        "tiempo_estimado_min": s.tiempo_estimado_min,
    }


def _connector_to_dict(c: _Connector) -> Dict[str, Any]:
    return {
        "id": None,
        "code": c.code,
        "connector_type": c.connector_type,
        "tipo": c.connector_type,
        "position": c.position,
        "posicion": c.position,
        "direction": c.direction,
        "direccion": c.direction,
        "piece_codes": c.piece_codes,
        "piezas": c.piece_codes,
        "step_id": c.step_code,
    }


def _placed_to_dict(p: _PlacedPiece) -> Dict[str, Any]:
    return {
        "id": None,
        "project_id": None,
        "module_id": None,
        "piece_id": p.piece_id,
        "code": p.code,
        "module_code": p.module_code,
        "category": p.module_category,
        "piece_type": p.kind,
        "expected_position": p.position,
        "expected_rotation": p.rotation,
        "current_position": None,
        "current_rotation": None,
        "tolerance_position_mm": p.tolerance_position_mm,
        "tolerance_rotation_deg": p.tolerance_rotation_deg,
        "status": "NOT_STARTED",
        "dependencies": p.dependencies,
        "extra_data": p.extra_data,
    }


def _module_to_dict(m: _Module) -> Dict[str, Any]:
    return {
        "id": None,
        "project_id": None,
        "code": m.code,
        "category": m.category,
        "name": f"Modulo {m.code}",
        "position": _point3d(m.x_mm, 0.0, 0.0),
        "dimensions": _point3d(m.width_mm, m.height_mm, m.depth_mm),
        "order_index": 0 if m.code == "GLB" else int(m.code[1:]),
    }


# -----------------------------------------------------------------------------
# Funciones de compatibilidad con el código anterior
# -----------------------------------------------------------------------------
def build_assembly_steps(project: Project, pieces: List[Piece]) -> Dict[str, Any]:
    """Genera la vista de ensamblaje sin persistir (compatible con tests)."""
    result = AssemblyEngine.build_assembly(project.id, pieces)
    return {
        "pasos": result["pasos"],
        "vista_completa": result["vista_completa"],
        "conectores_completos": result["conectores_completos"],
    }


def get_assembly(db: Session, project_id: str) -> Dict[str, Any]:
    """Obtiene el ensamblaje, generándolo y persistiéndolo si no existe."""
    return AssemblyEngine.get_or_create_assembly(db, project_id)
