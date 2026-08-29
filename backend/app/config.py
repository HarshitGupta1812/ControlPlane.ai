from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://controlplane:controlplane@localhost:5432/controlplane"
    jwt_secret: str = "dev-only-change-this-controlplane-secret"
    jwt_expire_minutes: int = 480
    # NoDecode lets the documented comma-separated environment value reach
    # parse_origins instead of requiring JSON array syntax in Docker.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    dev_mock_llm: bool = True
    groq_api_key: str | None = None
    gemini_api_key: str | None = None
    max_prompt_chars: int = 12000
    auto_create_tables: bool = False
    detector_upgrades: bool = False
    llm_timeout_seconds: float = 30.0
    session_risk_decay_minutes: float = 30.0
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


def normalized_database_url(value: str) -> str:
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value.removeprefix("postgres://")
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value.removeprefix("postgresql://")
    if value.startswith("sqlite"):
        raise ValueError("ControlPlane requires PostgreSQL; SQLite is unsupported")
    return value
