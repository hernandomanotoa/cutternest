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
    temp_token = response.json()["temp_token"]

    response = client.post(
        "/api/v1/auth/verify",
        json={"temp_token": temp_token, "code": backup_codes[0]},
    )
    assert response.status_code == 200
    return backup_codes


def _login_with_backup(username: str, backup_code: str, password: str = "SecurePassword123!"):
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    temp_token = response.json()["temp_token"]
    response = client.post(
        "/api/v1/auth/verify",
        json={"temp_token": temp_token, "code": backup_code},
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
            "tablero": {"ancho": 244, "alto": 122, "espesor": 18, "kerf_mm": 3, "margin_mm": 2},
            "piezas": [],
            "usar_sobrantes": False,
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
