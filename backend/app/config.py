import os
from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/cutternest.db"
    jwt_secret_key: str = "change-me-in-production-min-32-chars"
    totp_encryption_key: str = "change-me-in-production-min-32-chars"
    cors_origins: str = "http://localhost:3000"
    cookie_secure: bool = False
    cookie_samesite: str = "Lax"
    jwt_access_expire_minutes: int = 15
    jwt_refresh_expire_days: int = 7
    guest_session_hours: int = 4
    offcut_threshold_cm: float = 30.0
    kerf_mm: float = 3.0
    margen_mm: float = 2.0

    @property
    def cors_origins_list(self) -> List[str]:
        origins = self.cors_origins.strip()
        if not origins:
            return ["http://localhost:3000"]
        return [origin.strip() for origin in origins.split(",") if origin.strip()]

    @field_validator("jwt_secret_key", "totp_encryption_key")
    @classmethod
    def _validate_secret_length(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("El secreto debe tener al menos 32 caracteres")
        return v

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
