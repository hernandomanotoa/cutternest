from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _register_and_login(username: str, password: str = "SecurePassword123!") -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": f"{username}@test.com", "password": password},
    )
    assert response.status_code == 201
    backup_codes = response.json()["backup_codes"]

    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200

    response = client.post("/api/v1/auth/verify", json={"code": backup_codes[0]})
    assert response.status_code == 200


def _create_offcut(payload: dict) -> dict:
    response = client.post("/api/v1/inventory/offcuts", json=payload)
    assert response.status_code == 201
    return response.json()


# (a) CRUD básico de offcuts
def test_offcut_crud():
    _register_and_login("offcut_crud_user")

    created = _create_offcut(
        {"material": "MDF", "width_mm": 600, "height_mm": 400, "thickness_mm": 18, "quantity": 2}
    )
    assert created["material"] == "MDF"
    assert created["width_mm"] == 600
    assert created["height_mm"] == 400
    assert created["thickness_mm"] == 18
    assert created["quantity"] == 2
    assert created["id"]
    assert created["created_at"]

    response = client.get("/api/v1/inventory/offcuts/registry")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == created["id"]

    response = client.delete(f"/api/v1/inventory/offcuts/{created['id']}")
    assert response.status_code == 204

    response = client.get("/api/v1/inventory/offcuts/registry")
    assert response.json() == []

    # Eliminar un id inexistente devuelve 404
    response = client.delete(f"/api/v1/inventory/offcuts/{created['id']}")
    assert response.status_code == 404


def test_offcut_requires_auth():
    client.cookies.clear()
    response = client.get("/api/v1/inventory/offcuts/registry")
    assert response.status_code == 401
    response = client.post(
        "/api/v1/inventory/offcuts",
        json={"material": "MDF", "width_mm": 600, "height_mm": 400, "thickness_mm": 18},
    )
    assert response.status_code == 401


# (b) optimize con use_offcuts=true usa el sobrante y consume stock
def test_optimize_uses_offcut_and_consumes_stock():
    _register_and_login("offcut_optimize_user")
    offcut = _create_offcut(
        {"material": "MDF", "width_mm": 600, "height_mm": 600, "thickness_mm": 18, "quantity": 1}
    )

    response = client.post(
        "/api/v1/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18},
            "material_type": "MDF",
            "use_offcuts": True,
            "piezas": [
                {
                    "id": "fondo",
                    "nombre": "Fondo",
                    "ancho": 500,
                    "alto": 500,
                    "cantidad": 1,
                    "rotate": True,
                    "espesor": 18,
                }
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()

    placements = [p for t in data["tableros"] for p in t["placements"]]
    assert len(placements) == 1
    assert placements[0]["en_sobrante"] is True
    assert placements[0]["offcut_id"] == offcut["id"]

    # El sobrante tenía quantity=1 y se consumió: la fila se elimina
    response = client.get("/api/v1/inventory/offcuts/registry")
    assert response.json() == []


def test_optimize_offcut_partial_consumption():
    _register_and_login("offcut_partial_user")
    offcut = _create_offcut(
        {"material": "MDF", "width_mm": 600, "height_mm": 600, "thickness_mm": 18, "quantity": 3}
    )

    response = client.post(
        "/api/v1/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18},
            "material_type": "MDF",
            "use_offcuts": True,
            "piezas": [
                {
                    "id": "fondo",
                    "nombre": "Fondo",
                    "ancho": 500,
                    "alto": 500,
                    "cantidad": 1,
                    "rotate": True,
                    "espesor": 18,
                }
            ],
        },
    )
    assert response.status_code == 200

    response = client.get("/api/v1/inventory/offcuts/registry")
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == offcut["id"]
    assert items[0]["quantity"] == 2


def test_optimize_offcut_material_mismatch_uses_new_board():
    _register_and_login("offcut_mismatch_user")
    _create_offcut({"material": "Melamina", "width_mm": 600, "height_mm": 600, "thickness_mm": 18})

    response = client.post(
        "/api/v1/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18},
            "material_type": "MDF",
            "use_offcuts": True,
            "piezas": [
                {
                    "id": "fondo",
                    "nombre": "Fondo",
                    "ancho": 500,
                    "alto": 500,
                    "cantidad": 1,
                    "rotate": True,
                    "espesor": 18,
                }
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    placements = [p for t in data["tableros"] for p in t["placements"]]
    assert placements[0]["en_sobrante"] is False
    assert placements[0]["offcut_id"] is None

    # No se consumió stock del sobrante de Melamina
    response = client.get("/api/v1/inventory/offcuts/registry")
    assert response.json()[0]["quantity"] == 1


# (c) optimize con use_offcuts=false no toca los offcuts
def test_optimize_without_offcuts_ignores_stock():
    _register_and_login("offcut_disabled_user")
    offcut = _create_offcut(
        {"material": "MDF", "width_mm": 600, "height_mm": 600, "thickness_mm": 18, "quantity": 2}
    )

    response = client.post(
        "/api/v1/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18},
            "material_type": "MDF",
            "use_offcuts": False,
            "piezas": [
                {
                    "id": "fondo",
                    "nombre": "Fondo",
                    "ancho": 500,
                    "alto": 500,
                    "cantidad": 1,
                    "rotate": True,
                    "espesor": 18,
                }
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    placements = [p for t in data["tableros"] for p in t["placements"]]
    assert placements[0]["en_sobrante"] is False
    assert placements[0]["offcut_id"] is None

    # Stock intacto
    response = client.get("/api/v1/inventory/offcuts/registry")
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == offcut["id"]
    assert items[0]["quantity"] == 2
