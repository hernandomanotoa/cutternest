"""P4 — Cotizador 1-clic: lista de precios y recálculo del quote."""

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


def _crear_precio(tipo: str, nombre: str, precio: float) -> str:
    response = client.post(
        "/api/v1/price-list",
        json={"tipo": tipo, "nombre": nombre, "precio": precio},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _crear_proyecto_con_piezas(piezas: list) -> str:
    response = client.post(
        "/api/v1/projects",
        json={"name": "Cotización 1-clic", "material_type": "MDF Melamina"},
    )
    assert response.status_code == 201
    project_id = response.json()["id"]
    response = client.post(
        f"/api/v1/projects/{project_id}/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18, "kerf_mm": 3, "margin_mm": 5},
            "piezas": piezas,
            "use_offcuts": False,
        },
    )
    assert response.status_code == 200
    return project_id


def test_price_list_crud():
    _register_and_login("pricelist_user")

    item_id = _crear_precio("material_m2", "MDF Melamina", 10.0)
    response = client.get("/api/v1/price-list")
    assert response.status_code == 200
    items = response.json()
    assert any(i["id"] == item_id and i["moneda"] == "$" for i in items)

    response = client.get("/api/v1/price-list?tipo=herraje")
    assert response.status_code == 200
    assert response.json() == []

    response = client.patch(f"/api/v1/price-list/{item_id}", json={"precio": 12.5})
    assert response.status_code == 200
    assert response.json()["precio"] == 12.5

    response = client.delete(f"/api/v1/price-list/{item_id}")
    assert response.status_code == 204
    response = client.get("/api/v1/price-list")
    assert all(i["id"] != item_id for i in response.json())

    response = client.patch(f"/api/v1/price-list/{item_id}", json={"precio": 1})
    assert response.status_code == 404

    response = client.post("/api/v1/price-list", json={"tipo": "otro", "nombre": "X", "precio": 1})
    assert response.status_code == 422


def test_quote_un_clic_con_lista_de_precios():
    _register_and_login("quote1click_user")
    _crear_precio("material_m2", "MDF Melamina", 10.0)
    _crear_precio("tapacanto_ml", "Tapacanto PVC 22mm", 0.5)
    _crear_precio("herraje", "Tornillo confirmat 6.4x50", 0.15)
    _crear_precio("herraje", "Bisagra cazoleta 35mm", 1.2)
    _crear_precio("herraje", "Tirador aluminio 128mm", 3.75)
    _crear_precio("mano_obra_m2", "Mano de obra taller", 6.0)

    project_id = _crear_proyecto_con_piezas([
        {"id": "p1", "nombre": "Puerta principal", "ancho": 500, "alto": 600, "cantidad": 1,
         "rotate": True, "color": "#FFFFFF", "espesor": 18, "cantos": "T,B"},
    ])

    response = client.post(
        f"/api/v1/projects/{project_id}/quote",
        json={"hardware": [], "costo_hora_mano_obra": 5.0, "margen": 1.3, "incluir_mano_obra": True},
    )
    assert response.status_code == 200
    data = response.json()

    conceptos = {i["concepto"]: i for i in data["items"]}
    assert set(conceptos) == {"Material", "Tapacanto", "Herrajes", "Mano de obra"}

    # Material: 0.5×0.6 = 0.3 m² × 10
    assert conceptos["Material"]["subtotal"] == 3.0
    # Tapacanto: (500+500) mm = 1.0 ml × 0.5
    assert conceptos["Tapacanto"]["subtotal"] == 0.5
    # Herrajes: 4 confirmat + 2 bisagras + 1 tirador = 0.6 + 2.4 + 3.75
    assert conceptos["Herrajes"]["subtotal"] == 6.75
    # Mano de obra: 0.3 m² × 6
    assert conceptos["Mano de obra"]["subtotal"] == 1.8

    esperado_subtotal = round(3.0 + 0.5 + 6.75 + 1.8, 2)
    assert data["subtotal"] == esperado_subtotal
    assert data["total"] == round(esperado_subtotal * 1.3, 2)
    assert data["breakdown"]["total"] == data["total"]
    assert data["warnings"] == []
    assert data["pdf_path"].startswith("/exports/") and data["pdf_path"].endswith(".pdf")


def test_quote_herraje_sin_precio_genera_warning():
    _register_and_login("quote_warn_user")
    _crear_precio("material_m2", "MDF Melamina", 10.0)
    # Sin items de herraje: todo queda a precio 0 con warning.

    project_id = _crear_proyecto_con_piezas([
        {"id": "p1", "nombre": "Puerta", "ancho": 400, "alto": 600, "cantidad": 1,
         "rotate": True, "color": "#FFFFFF", "espesor": 18},
    ])

    response = client.post(
        f"/api/v1/projects/{project_id}/quote",
        json={"hardware": [], "costo_hora_mano_obra": 5.0, "margen": 1.3},
    )
    assert response.status_code == 200
    data = response.json()
    assert any("Bisagra cazoleta 35mm" in w for w in data["warnings"])
    assert any("Tornillo confirmat 6.4x50" in w for w in data["warnings"])
    assert data["total"] > 0  # el material sí cotiza
    assert data["breakdown"]["mano_obra"] == 0  # flag no activado


def test_quote_hardware_extra_del_request():
    _register_and_login("quote_extra_user")
    _crear_precio("material_m2", "MDF Melamina", 10.0)
    _crear_precio("herraje", "Pata ajustable H150", 2.5)

    project_id = _crear_proyecto_con_piezas([
        {"id": "p1", "nombre": "Base", "ancho": 800, "alto": 600, "cantidad": 1,
         "rotate": True, "color": "#FFFFFF", "espesor": 18},
    ])

    response = client.post(
        f"/api/v1/projects/{project_id}/quote",
        json={
            "hardware": [{"item": "Pata ajustable H150", "cantidad": 4, "precio_unit": 0}],
            "costo_hora_mano_obra": 5.0,
            "margen": 1.1,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert any(h["item"] == "Pata ajustable H150" and h["cantidad"] == 4 for h in data["hardware"])
    assert data["breakdown"]["hardware"] == 10.0  # 4 × 2.5 de la lista
