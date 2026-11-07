"""Backend settings, read from environment / backend/.env.

Kept separate from the CLI's own `.env` (which drives `jobhunt/cli.py`
directly) so the web app and the CLI can be configured independently, but
they share the same env var *names* for the LLM/SMTP pieces (LLM_PROVIDER,
ANTHROPIC_API_KEY, SMTP_USER, ...) since both ultimately call into the same
`jobhunt/providers.py` and `jobhunt/mailer.py`.
"""
from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
DEFAULT_SQLITE_URL = f"sqlite:///{DATA_DIR / 'jobhunt.db'}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"), env_file_encoding="utf-8", extra="ignore",
        validate_default=True,
    )

    # --- database ---------------------------------------------------------
    # SQLite by default (zero setup, fine for local dev + small deployments).
    # Point DATABASE_URL at Postgres (e.g. a free Neon/Supabase instance) in
    # production - see docs/DEPLOYMENT.md. An empty value - from `.env`,
    # docker-compose, or a Render dashboard field left blank - must fall
    # back to the default too, not become `create_engine("")`.
    database_url: str = DEFAULT_SQLITE_URL

    @field_validator("database_url", mode="after")
    @classmethod
    def _default_when_blank(cls, v: str) -> str:
        return v or DEFAULT_SQLITE_URL

    # --- auth ---------------------------------------------------------------
    # MUST be overridden in production (docs/DEPLOYMENT.md walks through
    # generating one). The fallback exists so local dev works out of the box.
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # --- admin / scheduled runs --------------------------------------------
    # Shared secret the GitHub Actions cron sends to POST /admin/run-scheduled.
    admin_run_secret: str = "dev-only-secret-change-me"

    # --- CORS ---------------------------------------------------------------
    # The deployed frontend origin(s), comma-separated. "*" is fine for local
    # dev only.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- job cache -------------------------------------------------------
    # How long the shared Job cache is considered fresh before a pipeline run
    # refetches the ATS boards. Keeps repeated "Run search" clicks from
    # hammering Greenhouse/Lever/Ashby.
    job_cache_ttl_minutes: int = 240

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
# Only used for the local SQLite file - Postgres deployments need no local
# directory. Uploaded resumes live in the DB (Profile.resume_bytes), not here.
DATA_DIR.mkdir(parents=True, exist_ok=True)
