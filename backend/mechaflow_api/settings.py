"""Runtime settings for the MechaFlow CAD API.

Settings intentionally read from environment variables directly so the backend
can run cheaply without a configuration service during early development.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from . import __version__


TRUE_VALUES = {"1", "true", "yes", "on"}
DEFAULT_CORS_ORIGINS = ("http://127.0.0.1:5173", "http://localhost:5173")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer port, got {raw!r}") from exc
    if value < 0 or value > 65535:
        raise ValueError(f"{name} must be between 0 and 65535, got {value}")
    return value


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in TRUE_VALUES


def _env_csv(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return tuple(item.strip() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    app_name: str = field(default_factory=lambda: os.getenv("MECHAFLOW_API_NAME", "MechaFlow CAD API"))
    environment: str = field(default_factory=lambda: os.getenv("MECHAFLOW_ENV", "local"))
    version: str = __version__
    host: str = field(default_factory=lambda: os.getenv("MECHAFLOW_API_HOST", "127.0.0.1"))
    # Port 0 asks the OS to allocate a free port. Set MECHAFLOW_API_PORT for a
    # stable local URL or hosted deployment.
    port: int = field(default_factory=lambda: _env_int("MECHAFLOW_API_PORT", 0))
    api_prefix: str = field(default_factory=lambda: os.getenv("MECHAFLOW_API_PREFIX", "/api"))
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: _env_csv("MECHAFLOW_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    )
    local_mode: bool = field(default_factory=lambda: _env_bool("MECHAFLOW_LOCAL_MODE", True))


def get_settings() -> Settings:
    return Settings()
