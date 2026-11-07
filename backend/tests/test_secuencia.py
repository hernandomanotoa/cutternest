"""P2 — Secuencia de corte guillotina por tablero."""

from fastapi.testclient import TestClient

from app.cutting import calcular_secuencia_corte
from app.main import app

client = TestClient(app)


def _synthetic_layout():
    """Tablero 1000×500 con 4 piezas: A | B/C apiladas | D."""
    return [
        {"id": "A", "x": 0, "y": 0, "w": 400, "h": 500},
        {"id": "B", "x": 400, "y": 0, "w": 300, "h": 250},
        {"id": "C", "x": 400, "y": 250, "w": 300, "h": 250},
        {"id": "D", "x": 700, "y": 0, "w": 300, "h": 500},
    ]


def test_secuencia_sintetica_4_piezas():
    resultado = calcular_secuencia_corte(1000, 500, kerf_mm=3, placements=_synthetic_layout())
    assert resultado["tablero"] == {"ancho": 1000.0, "alto": 500.0}
    assert resultado["kerf_mm"] == 3

    cortes = resultado["cortes"]
    assert [(c["n"], c["tipo"], c["medida_mm"]) for c in cortes] == [
        (1, "vertical", 400.0),
        (2, "vertical", 700.0),
        (3, "horizontal", 250.0),
    ]
    assert cortes[0]["piezas_separadas"] == ["A"]
    assert cortes[1]["piezas_separadas"] == ["A", "B", "C"]
    assert cortes[2]["piezas_separadas"] == ["B"]
    # Pasadas completas sobre lo que queda del tablero.
    assert (cortes[0]["de"], cortes[0]["a"]) == (0.0, 500.0)
    assert (cortes[2]["de"], cortes[2]["a"]) == (0.0, 1000.0)


def test_secuencia_dedup_lineas_separadas_por_kerf():
    """Dos aristas a menos de kerf = la MISMA pasada de sierra."""
    placements = [
        {"id": "X", "x": 0, "y": 0, "w": 400, "h": 100},
        {"id": "Y", "x": 403, "y": 0, "w": 400, "h": 100},
    ]
    resultado = calcular_secuencia_corte(1000, 500, kerf_mm=3, placements=placements)
    cortes = resultado["cortes"]
    assert len(cortes) == 1
    assert cortes[0]["medida_mm"] == 400.0


def test_secuencia_pieza_unica_sin_cortes():
    resultado = calcular_secuencia_corte(
        1000, 500, kerf_mm=3, placements=[{"id": "A", "x": 0, "y": 0, "w": 1000, "h": 500}]
    )
    assert resultado["cortes"] == []


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


def test_secuencia_endpoint_sobre_proyecto_optimizado():
    _register_and_login("secuencia_user")
    response = client.post(
        "/api/v1/projects",
        json={"name": "Secuencia", "material_type": "MDF", "kerf_mm": 3},
    )
    assert response.status_code == 201
    project_id = response.json()["id"]

    response = client.post(
        f"/api/v1/projects/{project_id}/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18, "kerf_mm": 3, "margin_mm": 5},
            "piezas": [
                {"id": "p1", "nombre": "Lateral", "ancho": 1000, "alto": 1200, "cantidad": 1,
                 "rotate": True, "color": "#FFFFFF", "espesor": 18},
                {"id": "p2", "nombre": "Otro lateral", "ancho": 1000, "alto": 1200, "cantidad": 1,
                 "rotate": True, "color": "#FFFFFF", "espesor": 18},
            ],
            "use_offcuts": False,
        },
    )
    assert response.status_code == 200
    assert response.json()["total_tableros"] == 1

    response = client.get(f"/api/v1/projects/{project_id}/layouts/0/secuencia")
    assert response.status_code == 200
    data = response.json()
    assert data["tablero"] == {"ancho": 2440.0, "alto": 1220.0}
    assert data["kerf_mm"] == 3.0
    assert len(data["cortes"]) >= 1
    verticales = [c for c in data["cortes"] if c["tipo"] == "vertical"]
    horizontales = [c for c in data["cortes"] if c["tipo"] == "horizontal"]
    medidas_v = [c["medida_mm"] for c in verticales]
    medidas_h = [c["medida_mm"] for c in horizontales]
    assert medidas_v == sorted(medidas_v)  # orden ascendente por coordenada
    assert medidas_h == sorted(medidas_h)
    for c in data["cortes"]:
        assert c["piezas_separadas"], "todo corte separa al menos una pieza"


def test_secuencia_layout_inexistente_404():
    _register_and_login("secuencia_404")
    response = client.post("/api/v1/projects", json={"name": "Sin layouts"})
    assert response.status_code == 201
    project_id = response.json()["id"]
    response = client.get(f"/api/v1/projects/{project_id}/layouts/0/secuencia")
    assert response.status_code == 404
