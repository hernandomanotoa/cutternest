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
