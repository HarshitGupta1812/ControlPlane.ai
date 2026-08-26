from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])


def _health_payload() -> dict[str, str]:
    return {"status": "ok", "service": "controlplane-api"}


@router.get("/health")
def health() -> dict:
    return _health_payload()


@router.get("/api/health")
def api_health() -> dict:
    return _health_payload()


@router.get("/health/ready")
def ready(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}
