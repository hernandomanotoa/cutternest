"""Tests del CRUD de versiones de diseno del planner en la nube
(/api/v1/planner-design-versions). Requieren sesion de usuario principal.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CSV_MINIMO = (
    "id,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo\n"
    "m1-base,Base modulo M1,850,600,1,si,#C19A6B,15,\"T,B,L,R\",1\n"
)


def _register_and_login(username: str) -> TestClient:
    # Cliente PROPIO por usuario: las cookies de sesion no deben mezclarse.
    c = TestClient(app)
    response = c.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": f"{username}@test.com",
            "password": "SecurePassword123!",
        },
    )
    assert response.status_code == 201
    backup_code = response.json()["backup_codes"][0]

    response = c.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "SecurePassword123!"},
    )
    assert response.status_code == 200
    response = c.post("/api/v1/auth/verify", json={"code": backup_code})
    assert response.status_code == 200
    return c


def test_crud_design_versions():
    c = _register_and_login("versions_user")

    # 401 sin sesion
    anon = TestClient(app)
    assert anon.get("/api/v1/planner-design-versions/").status_code == 401

    # Guardar
    r = c.post(
        "/api/v1/planner-design-versions/",
        json={"name": "Closet v1", "csv": CSV_MINIMO, "pieceCount": 1},
    )
    assert r.status_code == 201
    version = r.json()["version"]
    assert version["name"] == "Closet v1"
    assert version["pieceCount"] == 1
    vid = version["id"]

    # Listar: aparece la version resumida (sin payload csv)
    r = c.get("/api/v1/planner-design-versions/")
    assert r.status_code == 200
    versions = r.json()["versions"]
    assert len(versions) == 1
    assert versions[0]["id"] == vid
    assert "csv" not in versions[0]

    # Obtener: trae el CSV completo
    r = c.get(f"/api/v1/planner-design-versions/{vid}")
    assert r.status_code == 200
    assert "m1-base" in r.json()["csv"]

    # Eliminar
    r = c.delete(f"/api/v1/planner-design-versions/{vid}")
    assert r.status_code == 200
    assert c.get("/api/v1/planner-design-versions/").json()["versions"] == []

    # 404 tras eliminar
    assert c.get(f"/api/v1/planner-design-versions/{vid}").status_code == 404


def test_design_versions_ownership_isolation():
    owner = _register_and_login("versions_owner")
    other = _register_and_login("versions_other")

    r = owner.post(
        "/api/v1/planner-design-versions/",
        json={"name": "Privada", "csv": CSV_MINIMO, "pieceCount": 1},
    )
    vid = r.json()["version"]["id"]

    # Otro usuario no ve, no lee ni borra la version ajena
    assert other.get("/api/v1/planner-design-versions/").json()["versions"] == []
    assert other.get(f"/api/v1/planner-design-versions/{vid}").status_code == 404
    assert other.delete(f"/api/v1/planner-design-versions/{vid}").status_code == 404
    assert owner.get(f"/api/v1/planner-design-versions/{vid}").status_code == 200


def test_design_versions_capacity_evicts_oldest():
    c = _register_and_login("versions_capacity")
    ids = []
    for i in range(52):
        r = c.post(
            "/api/v1/planner-design-versions/",
            json={"name": f"V{i}", "csv": CSV_MINIMO, "pieceCount": 1},
        )
        assert r.status_code == 201
        ids.append(r.json()["version"]["id"])
    versions = c.get("/api/v1/planner-design-versions/").json()["versions"]
    assert len(versions) == 50, "tope de 50 versiones por usuario"
    # Las dos mas viejas fueron expulsadas; la mas nueva sigue
    assert ids[0] not in [v["id"] for v in versions]
    assert ids[-1] in [v["id"] for v in versions]
    # Orden: la mas reciente primero
    assert versions[0]["id"] == ids[-1]


def test_design_versions_validation():
    c = _register_and_login("versions_validation")
    # Nombre vacio
    assert c.post(
        "/api/v1/planner-design-versions/",
        json={"name": "", "csv": CSV_MINIMO, "pieceCount": 1},
    ).status_code == 422
    # CSV vacio
    assert c.post(
        "/api/v1/planner-design-versions/",
        json={"name": "X", "csv": "", "pieceCount": 1},
    ).status_code == 422
