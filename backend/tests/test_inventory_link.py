"""P1 — Inventario vinculado a la optimización y sobrantes por layout."""

from fastapi.testclient import TestClient

from app.cutting import calcular_sobrantes_layout
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


def _crear_proyecto(nombre: str) -> str:
    response = client.post(
        "/api/v1/projects",
        json={
            "name": nombre,
            "material_type": "MDF Melamina",
            "board_width_mm": 2440,
            "board_height_mm": 1220,
            "board_thickness_mm": 18,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def _optimizar(project_id: str, descontar: bool = True) -> dict:
    response = client.post(
        f"/api/v1/projects/{project_id}/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18, "kerf_mm": 3, "margin_mm": 5},
            "piezas": [
                {"id": "p1", "nombre": "Lateral", "ancho": 1000, "alto": 600, "cantidad": 1,
                 "rotate": True, "color": "#FFFFFF", "espesor": 18},
                {"id": "p2", "nombre": "Base", "ancho": 1000, "alto": 500, "cantidad": 1,
                 "rotate": True, "color": "#FFFFFF", "espesor": 18},
            ],
            "use_offcuts": False,
            "descontar_inventario": descontar,
        },
    )
    assert response.status_code == 200
    return response.json()


def _crear_stock(tipo: str = "MDF Melamina", cantidad: int = 5) -> str:
    response = client.post(
        "/api/v1/inventory",
        json={"tipo": tipo, "espesor_mm": 18, "ancho_mm": 2440, "alto_mm": 1220, "cantidad": cantidad},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _stock(item_id: str) -> dict:
    response = client.get("/api/v1/inventory")
    assert response.status_code == 200
    for item in response.json():
        if item["id"] == item_id:
            return item
    raise AssertionError(f"Item {item_id} no encontrado en inventario")


def test_optimize_descuenta_tableros_nuevos_con_movimiento_salida():
    _register_and_login("inv_link_user")
    item_id = _crear_stock(cantidad=5)
    project_id = _crear_proyecto("Descuento automático")

    data = _optimizar(project_id)
    assert data["total_tableros"] >= 1
    assert data["inventario_descuento"] == {"solicitados": 1, "consumidos": 1, "sin_stock": 0}
    assert _stock(item_id)["cantidad"] == 4

    response = client.get(f"/api/v1/inventory/{item_id}/movements")
    assert response.status_code == 200
    movimientos = response.json()
    salidas = [m for m in movimientos if m["tipo"] == "salida"]
    assert len(salidas) == 1
    assert "Optimización" in salidas[0]["motivo"]


def test_optimize_flag_descontar_inventario_desactivado():
    _register_and_login("inv_flag_user")
    item_id = _crear_stock(cantidad=5)
    project_id = _crear_proyecto("Sin descuento")

    data = _optimizar(project_id, descontar=False)
    assert "inventario_descuento" not in data
    assert _stock(item_id)["cantidad"] == 5


def test_optimize_sin_stock_reporta_sin_stock_sin_error():
    _register_and_login("inv_nostock_user")
    project_id = _crear_proyecto("Sin stock")

    data = _optimizar(project_id)
    assert data["inventario_descuento"]["consumidos"] == 0
    assert data["inventario_descuento"]["sin_stock"] == data["inventario_descuento"]["solicitados"] >= 1


def test_layout_offcuts_devuelve_rectangulos_y_registra():
    _register_and_login("inv_offcuts_user")
    project_id = _crear_proyecto("Sobrantes de layout")
    _optimizar(project_id)  # 2 piezas de 1000x600/500 sobre 2440x1220

    response = client.post(f"/api/v1/projects/{project_id}/layouts/0/offcuts")
    assert response.status_code == 200
    sobrantes = response.json()["sobrantes"]
    assert 1 <= len(sobrantes) <= 3
    for r in sobrantes:
        assert r["ancho"] >= 300 and r["alto"] >= 300  # umbral default (mm)
        assert r["area_m2"] > 0

    response = client.post(f"/api/v1/projects/{project_id}/layouts/0/offcuts?registrar=true")
    assert response.status_code == 200
    data = response.json()
    assert len(data["offcut_ids"]) == len(data["sobrantes"]) >= 1

    response = client.get("/api/v1/inventory/offcuts/registry")
    assert response.status_code == 200
    registrados = {o["id"] for o in response.json()}
    assert set(data["offcut_ids"]) <= registrados


def test_layout_offcuts_layout_inexistente_404():
    _register_and_login("inv_offcuts_404")
    project_id = _crear_proyecto("Sin layouts")
    response = client.post(f"/api/v1/projects/{project_id}/layouts/0/offcuts")
    assert response.status_code == 404


def test_sobrantes_layout_vacio_es_determinista():
    assert calcular_sobrantes_layout(2440, 1220, [], threshold_mm=300) == []

    placements = [
        {"id": "a", "x": 0, "y": 0, "w": 1000, "h": 1220},
        {"id": "b", "x": 1003, "y": 0, "w": 1000, "h": 600},
        {"id": "c", "x": 1003, "y": 603, "w": 1000, "h": 617},
    ]
    r1 = calcular_sobrantes_layout(2440, 1220, placements, threshold_mm=300)
    r2 = calcular_sobrantes_layout(2440, 1220, placements, threshold_mm=300)
    assert r1 == r2  # determinista
    # El mayor sobrante es la franja derecha: 437 de ancho × 1220.
    assert r1[0]["ancho"] == 2440 - 2003
    assert r1[0]["alto"] == 1220
