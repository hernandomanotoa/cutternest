from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_register_and_login_flow():
    # Registro
    response = client.post(
        "/api/v1/auth/register",
        json={"username": "testuser", "email": "test@test.com", "password": "SecurePassword123!"},
    )
    assert response.status_code == 201
    data = response.json()
    assert "qr_base64" in data
    assert len(data["backup_codes"]) == 10
    backup_code = data["backup_codes"][0]

    # Login step 1
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "SecurePassword123!"},
    )
    assert response.status_code == 200
    temp_token = response.json()["temp_token"]
    assert temp_token

    # Verify con codigo incorrecto debe fallar
    response = client.post(
        "/api/v1/auth/verify",
        json={"temp_token": temp_token, "code": "000000"},
    )
    assert response.status_code == 401

    # Verify con backup code correcto debe funcionar y devolver cookies
    response = client.post(
        "/api/v1/auth/verify",
        json={"temp_token": temp_token, "code": backup_code},
    )
    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies

    # Usar la cookie de access_token para obtener el usuario actual
    response = client.get("/api/v1/auth/users/me")
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"

    # Logout debe borrar cookies
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 200
    assert response.cookies.get("access_token") is None


def test_backup_code_cannot_be_reused():
    # Registro de un segundo usuario para este test
    response = client.post(
        "/api/v1/auth/register",
        json={"username": "testuser2", "email": "test2@test.com", "password": "SecurePassword123!"},
    )
    assert response.status_code == 201
    backup_code = response.json()["backup_codes"][0]

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser2", "password": "SecurePassword123!"},
    )
    temp_token = response.json()["temp_token"]

    # Primer uso OK
    response = client.post(
        "/api/v1/auth/verify",
        json={"temp_token": temp_token, "code": backup_code},
    )
    assert response.status_code == 200

    # Reusar el mismo backup code debe fallar
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser2", "password": "SecurePassword123!"},
    )
    temp_token = response.json()["temp_token"]
    response = client.post(
        "/api/v1/auth/verify",
        json={"temp_token": temp_token, "code": backup_code},
    )
    assert response.status_code == 401
