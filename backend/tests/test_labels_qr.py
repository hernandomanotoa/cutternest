"""P8 — QR en etiquetas: URL /projects/{id}?pieza={id}, ~12 mm."""

import os

from fastapi.testclient import TestClient

from app import pdf_generator
from app.main import app

client = TestClient(app)


def _boards():
    return [
        {
            "board_index": 0,
            "ancho": 2440, "alto": 1220,
            "placements": [
                {"id": "m1-puerta", "nombre": "Puerta M1", "x": 0, "y": 0,
                 "w": 500, "h": 600, "color": "#C19A6B"},
            ],
        },
    ]


def test_labels_qr_codifica_url_de_la_pieza(tmp_path, monkeypatch):
    payloads = []
    real_make = pdf_generator.qrcode.make

    def spy_make(data, *args, **kwargs):
        payloads.append(data)
        return real_make(data, *args, **kwargs)

    monkeypatch.setattr(pdf_generator.qrcode, "make", spy_make)

    path = pdf_generator.generate_labels_pdf(
        "Closet Demo", _boards(), str(tmp_path), project_id="abc-123"
    )
    assert path.endswith("etiquetas_Closet Demo.pdf")
    assert payloads == ["/projects/abc-123?pieza=m1-puerta"]

    with open(os.path.join(str(tmp_path), "etiquetas_Closet Demo.pdf"), "rb") as f:
        assert f.read().startswith(b"%PDF")


def test_labels_endpoint_devuelve_pdf_con_qr():
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

    _register_and_login("labels_qr_user")
    response = client.post("/api/v1/projects", json={"name": "Etiquetas QR"})
    assert response.status_code == 201
    project_id = response.json()["id"]

    response = client.post(
        f"/api/v1/projects/{project_id}/optimize",
        json={
            "tablero": {"ancho": 2440, "alto": 1220, "espesor": 18, "kerf_mm": 3, "margin_mm": 5},
            "piezas": [
                {"id": "p1", "nombre": "Lateral", "ancho": 1000, "alto": 600, "cantidad": 1,
                 "rotate": True, "color": "#FFFFFF", "espesor": 18},
            ],
            "use_offcuts": False,
        },
    )
    assert response.status_code == 200

    response = client.post(f"/api/v1/projects/{project_id}/labels")
    assert response.status_code == 200
    assert response.json()["pdf_path"].startswith("/exports/")
