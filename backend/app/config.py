from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "朝花夕拾"
    api_prefix: str = "/api"
    ai_base_url: str = "https://mynav.website/v1"
    ai_api_key: str = ""
    ai_model: str = "gpt-4.1-mini"
    ai_timeout: int = 180
    ai_temperature: float = 0.5
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def project_root(self) -> Path:
        return PROJECT_ROOT

    @property
    def prompts_dir(self) -> Path:
        return self.project_root / "prompts"

    @property
    def tools_dir(self) -> Path:
        return self.project_root / "tools"

    @property
    def exes_dir(self) -> Path:
        return self.project_root / "exes"

    @property
    def uploads_dir(self) -> Path:
        return self.project_root / "data" / "uploads"

    @property
    def parsed_dir(self) -> Path:
        return self.project_root / "data" / "parsed"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    settings.parsed_dir.mkdir(parents=True, exist_ok=True)
    settings.exes_dir.mkdir(parents=True, exist_ok=True)
    return settings
