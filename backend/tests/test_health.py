from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app


def test_health_exposes_correlation_id() -> None:
    response = TestClient(app).get("/health", headers={"X-Request-ID": "not-a-uuid"})
    assert response.status_code == 200
    UUID(response.headers["X-Request-ID"])


def test_health_accepts_valid_correlation_id() -> None:
    request_id = "12345678-1234-5678-1234-567812345678"
    response = TestClient(app).get("/health", headers={"X-Request-ID": request_id})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == request_id
