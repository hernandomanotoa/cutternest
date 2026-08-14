from app.assembly import build_assembly_steps
from app.models import Piece, Project


def _piece(
    external_id: str,
    name: str,
    width_cm: float,
    height_cm: float,
    thickness_mm: float = 18.0,
    color: str = "#3B82F6",
    edge_banding: str = "",
) -> Piece:
    p = Piece(external_id=external_id, name=name, width_cm=width_cm, height_cm=height_cm, thickness_mm=thickness_mm, color=color, edge_banding=edge_banding)
    p.id = external_id
    return p


def _project() -> Project:
    p = Project(name="Test", description="")
    p.id = "test-project"
    return p


def test_assembly_estanteria_steps():
    pieces = [
        _piece("base", "Base", 120.0, 60.0, edge_banding="T,B,L,R"),
        _piece("tapa", "Tapa", 120.0, 60.0, edge_banding="T,B,L,R"),
        _piece("lateral-izq", "Lateral Izq", 50.0, 180.0, edge_banding="T,B,L"),
        _piece("lateral-der", "Lateral Der", 50.0, 180.0, edge_banding="T,B,R"),
        _piece("estante-1", "Estante 1", 100.0, 30.0),
        _piece("estante-2", "Estante 2", 100.0, 30.0),
        _piece("fondo", "Fondo", 60.0, 180.0, thickness_mm=3.0, color="#DDA0DD"),
    ]
    result = build_assembly_steps(_project(), pieces)
    pasos = result["pasos"]
    assert len(pasos) >= 5

    titles = [p["titulo"] for p in pasos]
    assert "Pegar cantos" in titles
    assert "Colocar base" in titles
    assert "Atornillar laterales" in titles
    assert "Colocar estantes" in titles
    assert "Colocar tapa" in titles
    assert "Fijar fondo" in titles

    # First step with 3D pieces should be the base
    base_step = next(p for p in pasos if p["titulo"] == "Colocar base")
    assert len(base_step["piezas_3d"]) >= 1
    base = base_step["piezas_3d"][0]
    assert base["nombre"] == "Base"
    assert base["posicion"]["x"] == 0.0
    assert base["posicion"]["y"] == 0.0

    # Laterals should be at left and right
    lateral_step = next(p for p in pasos if p["titulo"] == "Atornillar laterales")
    assert len(lateral_step["piezas_3d"]) == 2
    x_positions = sorted([p["posicion"]["x"] for p in lateral_step["piezas_3d"]])
    assert x_positions[0] == 0.0
    assert x_positions[1] > 0.0

    # Top should be above base
    top_step = next(p for p in pasos if p["titulo"] == "Colocar tapa")
    assert top_step["piezas_3d"][0]["posicion"]["y"] > 0.0

    # Full view should contain all positioned pieces
    assert len(result["vista_completa"]) >= 7


def test_assembly_empty():
    result = build_assembly_steps(_project(), [])
    assert result["pasos"] == []
    assert result["vista_completa"] == []


def test_assembly_no_recognized_structure():
    pieces = [_piece("panel-a", "Panel A", 80.0, 80.0)]
    result = build_assembly_steps(_project(), pieces)
    assert len(result["pasos"]) == 1
    assert result["pasos"][0]["titulo"] == "Ensamblaje general"
