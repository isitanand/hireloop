from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    # Managed Postgres (Neon, ...) closes idle connections - Neon suspends its
    # compute after ~5 idle minutes. A connection parked in the pool while a
    # run sits in the multi-minute LLM screening pass is then dead at the next
    # commit ("SSL connection has been closed unexpectedly"), and the run
    # fails at the very end. pre_ping tests each connection as it is checked
    # out and quietly swaps a dead one for a fresh one.
    return {"pool_pre_ping": True}


def _normalize_database_url(url: str) -> str:
    # Older Render/Heroku postgres URLs use postgres://, which SQLAlchemy 1.4+ rejected
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


_db_url = _normalize_database_url(settings.database_url)
engine = create_engine(_db_url, **_engine_kwargs(_db_url))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    # Student-project scope: create tables directly from the models rather
    # than running Alembic migrations. Good enough for a from-scratch app
    # with no prior schema to migrate; a real production service would use
    # Alembic from day one.
    from . import models  # noqa: F401  (registers models on Base.metadata)

    Base.metadata.create_all(bind=engine)
