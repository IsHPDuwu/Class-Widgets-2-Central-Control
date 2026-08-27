from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CC_", extra="ignore")

    database_url: str = "sqlite:///./central-control.db"
    admin_key: str = Field(default="development-only-change-me", min_length=16)
    public_url: str = "http://localhost:8000"
    secret_encryption_key: str = ""
    allow_insecure_http: bool = True
    poll_interval_seconds: int = Field(default=10, ge=5, le=300)
    device_online_timeout_seconds: int = Field(default=45, ge=15, le=3600)
    automation_poll_interval_seconds: int = Field(default=2, ge=1, le=60)
    allow_registration: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
