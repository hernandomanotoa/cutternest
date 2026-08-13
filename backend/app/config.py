import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/cutternest.db"
    jwt_secret_key: str = "change-me-in-production-min-32-chars"
    jwt_access_expire_minutes: int = 15
    jwt_refresh_expire_days: int = 7
    guest_session_hours: int = 4
    offcut_threshold_cm: float = 30.0
    kerf_mm: float = 3.0
    margen_mm: float = 2.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
