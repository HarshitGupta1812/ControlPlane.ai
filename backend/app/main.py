from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.responses import Response

from app.api.auth import router as auth_router
from app.api.demo import router as demo_router
from app.api.health import router as health_router
from app.api.openai import router as openai_router
from app.api.routes import router as api_router
from app.config import get_settings
from app.db.session import Base, SessionLocal, engine
from app.observability.logging import configure_logging
from app.observability.middleware import CorrelationMiddleware
from app.observability.ratelimit import limiter
from app.seed import seed_reference_data

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level, development=settings.app_env == "development")
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            seed_reference_data(db)
    yield


app = FastAPI(title="ControlPlane.ai API", version="0.1.0", description="Real-time governance layer for enterprise AI", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CorrelationMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID"])
app.include_router(health_router)
app.include_router(auth_router, prefix="/api")
app.include_router(api_router)
app.include_router(demo_router)
app.include_router(openai_router)


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"service": "controlplane-api", "status": "ok", "docs": "/docs"}


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
