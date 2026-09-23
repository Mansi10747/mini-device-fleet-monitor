import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings."""

    app_name: str = "Mini Device Fleet Monitor"
    app_version: str = "1.0.0"
    heartbeat_timeout_seconds: float = float(
        os.getenv("HEARTBEAT_TIMEOUT_SECONDS", "30.0")
    )
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
