from app.assembly import AssemblyEngine, _detect_cycle, build_assembly_steps
from app.models import Piece, Project
from app.schemas import AssemblyPiece, AssemblyProgressUpdate, Point3D, Rotation3D, Transform3D

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _piece(
    external_id: str,
    name: str,
    width_mm: float,
    height_mm: float,
    thickness_mm: float = 18.0,
    color: str = "#3B82F6",
    edge_banding: str = "",
) -> Piece:
    p = Piece(
        external_id=external_id,
        name=name,
        width_mm=width_mm,
        height_mm=height_mm,
        thickness_mm=thickness_mm,
        color=color,
        edge_banding=edge_banding,
    )
    p.id = external_id
    return p


def _project() -> Project:
    p = Project(name="Test", description="")
    p.id = "test-project"
    return p


def _estanteria_pieces():
    return [
        _piece("base", "Base", 1200.0, 600.0, edge_banding="T,B,L,R"),
        _piece("tapa", "Tapa", 1200.0, 600.0, edge_banding="T,B,L,R"),
        _piece("lateral-izq", "Lateral Izq", 500.0, 1800.0, edge_banding="T,B,L"),
        _piece("lateral-der", "Lateral Der", 500.0, 1800.0, edge_banding="T,B,R"),
        _piece("estante-1", "Estante 1", 1000.0, 300.0),
        _piece("estante-2", "Estante 2", 1000.0, 300.0),
        _piece("fondo", "Fondo", 600.0, 1800.0, thickness_mm=3.0, color="#DDA0DD"),
    ]


def test_assembly_estanteria_steps():
    pieces = _estanteria_pieces()
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

    base_step = next(p for p in pasos if p["titulo"] == "Colocar base")
    assert len(base_step["piezas_3d"]) >= 1
    base = base_step["piezas_3d"][0]
    assert base["nombre"] == "Base"
    assert base["posicion"]["x"] == 0.0
    assert base["posicion"]["y"] == 0.0

    lateral_step = next(p for p in pasos if p["titulo"] == "Atornillar laterales")
    assert len(lateral_step["piezas_3d"]) == 2
    x_positions = sorted([p["posicion"]["x"] for p in lateral_step["piezas_3d"]])
    assert x_positions[0] == 0.0
    assert x_positions[1] > 0.0

    top_step = next(p for p in pasos if p["titulo"] == "Colocar tapa")
    assert top_step["piezas_3d"][0]["posicion"]["y"] > 0.0

    assert len(result["vista_completa"]) >= 7
    assert len(result["conectores_completos"]) > 0
    tipos = {c["tipo"] for c in result["conectores_completos"]}
    assert "confirmat" in tipos or "taco" in tipos or "tornillo" in tipos


def test_assembly_empty():
    result = build_assembly_steps(_project(), [])
    assert result["pasos"] == []
    assert result["vista_completa"] == []


def test_assembly_no_recognized_structure():
    pieces = [_piece("panel-a", "Panel A", 800.0, 800.0)]
    result = build_assembly_steps(_project(), pieces)
    assert len(result["pasos"]) == 1
    assert result["pasos"][0]["titulo"] == "Colocar piezas restantes"


def test_assembly_generates_modules_and_codes():
    pieces = [
        _piece("M01-base", "Base M01", 1200.0, 600.0),
        _piece("M01-lateral-izq", "Lateral Izq M01", 500.0, 1800.0),
        _piece("M01-lateral-der", "Lateral Der M01", 500.0, 1800.0),
        _piece("M02-base", "Base M02", 1200.0, 600.0),
        _piece("M02-lateral-izq", "Lateral Izq M02", 500.0, 1800.0),
        _piece("M02-lateral-der", "Lateral Der M02", 500.0, 1800.0),
    ]
    result = AssemblyEngine.build_assembly("proj", pieces)
    codes = [p["code"] for p in result["pieces"]]
    assert any(c.startswith("GLOBAL-M01-") for c in codes)
    assert any(c.startswith("GLOBAL-M02-") for c in codes)
    assert any(c == "GLOBAL-DIV-I" for c in codes)

    modules = result["modules"]
    assert len(modules) == 2
    assert modules[0]["code"] == "M01"
    assert modules[1]["code"] == "M02"


def test_assembly_expected_position():
    pieces = [
        _piece("base", "Base", 1200.0, 600.0),
        _piece("lateral-izq", "Lateral Izq", 500.0, 1800.0),
    ]
    result = AssemblyEngine.build_assembly("proj", pieces)
    base = next(p for p in result["pieces"] if p["piece_type"] == "base")
    assert base["expected_position"]["x"] == 0.0
    assert base["expected_position"]["y"] == 0.0
    assert base["expected_position"]["z"] == 0.0

    lateral = next(p for p in result["pieces"] if p["piece_type"].startswith("lateral"))
    assert lateral["expected_position"]["x"] == 0.0
    assert lateral["expected_position"]["y"] > 0.0  # sobre la base


def test_assembly_connectors():
    pieces = [
        _piece("base", "Base", 1200.0, 600.0),
        _piece("lateral-izq", "Lateral Izq", 500.0, 1800.0),
        _piece("lateral-der", "Lateral Der", 500.0, 1800.0),
        _piece("tapa", "Tapa", 1200.0, 600.0),
    ]
    result = AssemblyEngine.build_assembly("proj", pieces)
    tipos = {c["connector_type"] for c in result["connectors"]}
    assert "confirmat" in tipos
    assert all(c["position"]["x"] >= 0 for c in result["connectors"])


def test_assembly_step_dependencies():
    pieces = [
        _piece("base", "Base", 1200.0, 600.0),
        _piece("lateral-izq", "Lateral Izq", 500.0, 1800.0),
        _piece("tapa", "Tapa", 1200.0, 600.0),
    ]
    result = AssemblyEngine.build_assembly("proj", pieces)
    steps = result["steps"]
    assert steps[0]["step_number"] < steps[-1]["step_number"]
    # Los pasos posteriores declaran dependencia de los anteriores
    for i, step in enumerate(steps[1:], start=1):
        assert len(step["dependencies"]) > 0 or step["title"] == "Colocar puertas y acabados"


def test_assembly_validation_detects_offset():
    piece = AssemblyPiece(
        codigo="TEST",
        categoria="GLOBAL",
        tipo_pieza="base",
        posicion_esperada=Point3D(x=0.0, y=0.0, z=0.0),
        rotacion_esperada=Rotation3D(x=0.0, y=0.0, z=0.0),
        tolerancia_posicion_mm=2.0,
        tolerancia_rotacion_deg=5.0,
        dependencias=[],
        metadatos={},
    )
    ok = Transform3D(position=Point3D(x=0.0, y=0.0, z=0.0), rotation=Rotation3D(x=0.0, y=0.0, z=0.0))
    bad = Transform3D(position=Point3D(x=10.0, y=0.0, z=0.0), rotation=Rotation3D(x=0.0, y=0.0, z=0.0))
    assert AssemblyEngine.validate_piece(piece, ok)["valid"]
    assert not AssemblyEngine.validate_piece(piece, bad)["valid"]


def _register_and_login(username: str, password: str = "SecurePassword123!"):
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": f"{username}@test.com", "password": password},
    )
    assert response.status_code == 201
    backup_codes = response.json()["backup_codes"]

    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200

    response = client.post(
        "/api/v1/auth/verify",
        json={"code": backup_codes[0]},
    )
    assert response.status_code == 200
    return backup_codes


def test_assembly_progress_endpoint_updates_state():
    _register_and_login("assembly_progress_user")

    response = client.post("/api/v1/projects", json={"name": "Assembly Test"})
    assert response.status_code == 201
    project_id = response.json()["id"]

    pieces_payload = [
        {"id": "base", "nombre": "Base", "ancho": 1200.0, "alto": 600.0, "cantidad": 1, "rotate": True, "color": "#3B82F6", "espesor": 18.0},
        {"id": "lateral-izq", "nombre": "Lateral Izq", "ancho": 500.0, "alto": 1800.0, "cantidad": 1, "rotate": True, "color": "#3B82F6", "espesor": 18.0},
        {"id": "lateral-der", "nombre": "Lateral Der", "ancho": 500.0, "alto": 1800.0, "cantidad": 1, "rotate": True, "color": "#3B82F6", "espesor": 18.0},
    ]
    response = client.post(
        f"/api/v1/projects/{project_id}/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18, "kerf_mm": 3, "margin_mm": 2},
            "piezas": pieces_payload,
            "use_offcuts": False,
        },
    )
    assert response.status_code == 200

    response = client.get(f"/api/v1/projects/{project_id}/assembly")
    assert response.status_code == 200
    assembly = response.json()

    base_step = next(p for p in assembly["pasos"] if p["titulo"] == "Colocar base")
    step_id = base_step["id"]
    base_piece = base_step["piezas_3d"][0]
    code = base_piece["id"]

    update = {
        "piece_updates": {
            code: {
                "position": {
                    "x": base_piece["posicion"]["x"],
                    "y": base_piece["posicion"]["y"],
                    "z": base_piece["posicion"]["z"],
                },
                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
            }
        }
    }
    response = client.post(
        f"/api/v1/projects/{project_id}/assembly/steps/{step_id}/progress",
        json=update,
    )
    assert response.status_code == 200
    updated = response.json()

    updated_piece = next(p for p in updated["pieces"] if p["codigo"] == code)
    assert updated_piece["estado"] in ("ALIGNED", "LOCKED", "COMPLETED")
    assert updated_piece["posicion_actual"] is not None
    assert updated_piece["posicion_actual"]["x"] == base_piece["posicion"]["x"]


def test_save_pieces_endpoint_generates_generic_assembly():
    """Guardar piezas sin optimizar debe generar códigos, módulos y ensamblaje genérico."""
    _register_and_login("save_pieces_user")

    response = client.post("/api/v1/projects", json={"name": "Closet generico", "description": "test csv"})
    assert response.status_code == 201
    project_id = response.json()["id"]

    pieces_payload = [
        {"id": "b1", "nombre": "Base", "ancho": 900.0, "alto": 600.0, "cantidad": 1, "rotate": True, "color": "#ffffff", "espesor": 18.0},
        {"id": "l1", "nombre": "Lateral", "ancho": 600.0, "alto": 2100.0, "cantidad": 2, "rotate": True, "color": "#ffffff", "espesor": 18.0},
        {"id": "e1", "nombre": "Estante", "ancho": 840.0, "alto": 400.0, "cantidad": 3, "rotate": True, "color": "#ffffff", "espesor": 18.0},
        {"id": "t1", "nombre": "Tapa", "ancho": 900.0, "alto": 600.0, "cantidad": 1, "rotate": True, "color": "#ffffff", "espesor": 18.0},
        {"id": "f1", "nombre": "Fondo", "ancho": 900.0, "alto": 2100.0, "cantidad": 1, "rotate": True, "color": "#eeeeee", "espesor": 4.0},
        {"id": "s1", "nombre": "Soporte extra", "ancho": 200.0, "alto": 200.0, "cantidad": 1, "rotate": True, "color": "#ffffff", "espesor": 18.0},
    ]

    response = client.post(f"/api/v1/projects/{project_id}/pieces", json={"piezas": pieces_payload})
    assert response.status_code == 200
    data = response.json()
    assert len(data["modules"]) >= 1
    # Se coloca cada pieza del payload (más la duplicación interna del lateral izq/der)
    assert len(data["vista_completa"]) == len(pieces_payload) + 1
    assert any("OTR" in p["id"] for p in data["vista_completa"])

    # Los códigos deben seguir el patrón [CAT]-[MOD]-[TIPO]-[SEQ]
    codes = {p["id"] for p in data["vista_completa"]}
    assert all(len(c.split("-")) == 4 for c in codes)

    response = client.get(f"/api/v1/projects/{project_id}/assembly")
    assert response.status_code == 200
    assembly = response.json()
    assert len(assembly["pasos"]) >= 5
    titles = [p["titulo"] for p in assembly["pasos"]]
    assert "Colocar base" in titles
    assert "Atornillar laterales" in titles
    assert "Colocar estantes" in titles
    assert "Colocar tapa" in titles
    assert "Fijar fondo" in titles
    assert "Colocar piezas restantes" in titles



def test_assembly_plan_topological_levels():
    pieces = _estanteria_pieces()
    result = AssemblyEngine.build_assembly("proj", pieces)
    deps = result["dependencies"]
    assert len(deps) >= 4
    levels = result["levels"]
    assert len(levels) >= 3
    # Verificar que cada nivel contiene piezas y que no se repiten
    all_codes = [code for level in levels for code in level]
    assert len(all_codes) == len(set(all_codes))


def test_assembly_plan_cycle_detection():
    nodes = ["A", "B", "C"]
    edges = [("A", "B"), ("B", "C"), ("C", "A")]
    cycle = _detect_cycle(nodes, edges)
    assert cycle is not None
    assert set(cycle) == {"A", "B", "C"}


def test_assembly_plan_endpoint():
    _register_and_login("assembly_plan_user")

    response = client.post("/api/v1/projects", json={"name": "Plan Test"})
    assert response.status_code == 201
    project_id = response.json()["id"]

    pieces_payload = [
        {"id": "base", "nombre": "Base", "ancho": 1200.0, "alto": 600.0, "cantidad": 1, "rotate": True, "color": "#3B82F6", "espesor": 18.0},
        {"id": "lateral-izq", "nombre": "Lateral Izq", "ancho": 500.0, "alto": 1800.0, "cantidad": 1, "rotate": True, "color": "#3B82F6", "espesor": 18.0},
        {"id": "lateral-der", "nombre": "Lateral Der", "ancho": 500.0, "alto": 1800.0, "cantidad": 1, "rotate": True, "color": "#3B82F6", "espesor": 18.0},
        {"id": "estante-1", "nombre": "Estante 1", "ancho": 1000.0, "alto": 300.0, "cantidad": 1, "rotate": True, "color": "#3B82F6", "espesor": 18.0},
    ]
    response = client.post(f"/api/v1/projects/{project_id}/pieces", json={"piezas": pieces_payload})
    assert response.status_code == 200

    # Obtener dependencias por defecto del ensamblaje existente
    response = client.get(f"/api/v1/projects/{project_id}/assembly")
    assert response.status_code == 200
    assembly = response.json()
    deps = assembly["dependencies"]

    response = client.post(
        f"/api/v1/projects/{project_id}/assembly/plan",
        json={"dependencies": deps, "save": True},
    )
    assert response.status_code == 200
    plan = response.json()
    assert len(plan["levels"]) >= 1
    assert len(plan["steps"]) >= 1
    assert plan["cycle"] is None or plan["cycle"] == []
