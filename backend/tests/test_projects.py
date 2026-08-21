from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _register_and_login(username: str, password: str = "SecurePassword123!") -> list:
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": f"{username}@test.com", "password": password},
    )
    assert response.status_code == 201
    backup_codes = response.json()["backup_codes"]

    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    assert "temp_token" in response.cookies

    response = client.post(
        "/api/v1/auth/verify",
        json={"code": backup_codes[0]},
    )
    assert response.status_code == 200
    return backup_codes


def _login_with_backup(username: str, backup_code: str, password: str = "SecurePassword123!"):
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    response = client.post(
        "/api/v1/auth/verify",
        json={"code": backup_code},
    )
    assert response.status_code == 200


def test_project_ownership():
    owner_backup_codes = _register_and_login("owner_user")

    # Crear proyecto
    response = client.post(
        "/api/v1/projects",
        json={"name": "Proyecto A", "description": "test"},
    )
    assert response.status_code == 201
    project_id = response.json()["id"]

    # Usuario distinto no puede leer el proyecto
    client.cookies.clear()
    _register_and_login("other_user")
    response = client.get(f"/api/v1/projects/{project_id}")
    assert response.status_code == 403

    response = client.post(
        f"/api/v1/projects/{project_id}/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18, "kerf_mm": 3, "margin_mm": 2},
            "piezas": [],
            "use_offcuts": False,
        },
    )
    assert response.status_code == 403

    response = client.delete(f"/api/v1/projects/{project_id}")
    assert response.status_code == 403

    # Owner sigue pudiendo acceder
    client.cookies.clear()
    _login_with_backup("owner_user", owner_backup_codes[1])
    response = client.get(f"/api/v1/projects/{project_id}")
    assert response.status_code == 200


def test_guest_cannot_access_projects():
    _register_and_login("pin_host")

    response = client.post("/api/v1/auth/guest/pin", json={})
    assert response.status_code == 200
    pin = response.json()["pin"]

    client.cookies.clear()
    response = client.post("/api/v1/auth/guest/login", json={"pin": pin})
    assert response.status_code == 200

    response = client.get("/api/v1/projects")
    assert response.status_code == 200
    assert response.json() == []

    response = client.post("/api/v1/projects", json={"name": "Proyecto Guest"})
    assert response.status_code == 401


def test_catalog_returns_materials_and_formats():
    _register_and_login("catalog_user")
    response = client.get("/api/v1/catalog")
    assert response.status_code == 200
    data = response.json()
    assert "board_formats" in data
    assert "materials" in data
    assert "colors" in data
    assert any("Ecuador" in f["name"] for f in data["board_formats"])
    assert any("MDF Melamina" == m["name"] for m in data["materials"])


def test_quote_uses_catalog_price_when_costo_not_provided():
    _register_and_login("quote_catalog_user")

    response = client.post(
        "/api/v1/projects",
        json={
            "name": "Cotización con catálogo",
            "board_width_mm": 1830,
            "board_height_mm": 2440,
            "board_thickness_mm": 18,
            "material_type": "MDF Melamina",
        },
    )
    assert response.status_code == 201
    project_id = response.json()["id"]

    response = client.post(
        f"/api/v1/projects/{project_id}/optimize",
        json={
            "tablero": {"ancho": 1830, "alto": 2440, "espesor": 18, "kerf_mm": 3, "margin_mm": 2},
            "piezas": [
                {"id": "base", "nombre": "Base", "ancho": 900, "alto": 600, "cantidad": 1, "rotate": True, "color": "#FFFFFF", "espesor": 18},
            ],
            "use_offcuts": False,
        },
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/v1/projects/{project_id}/quote",
        json={
            "hardware": [],
            "costo_hora_mano_obra": 5.0,
            "margen": 1.3,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["breakdown"]["material"] > 0
