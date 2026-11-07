from app.database import _engine_kwargs, _normalize_database_url


def test_postgres_pings_pooled_connections_before_use():
    """Regression test for a real production incident: on Neon a run failed at
    its final commit with `psycopg2.OperationalError: SSL connection has been
    closed unexpectedly`, because the pooled connection had sat idle through
    the long LLM screening pass and Neon had closed it. Without pool_pre_ping
    the pool hands that dead connection straight back out."""
    kwargs = _engine_kwargs("postgresql+psycopg2://user:pw@ep-example.neon.tech/db?sslmode=require")
    assert kwargs["pool_pre_ping"] is True


def test_sqlite_keeps_cross_thread_access_for_background_tasks():
    kwargs = _engine_kwargs("sqlite:///./jobhunt.db")
    assert kwargs["connect_args"] == {"check_same_thread": False}


def test_normalize_database_url():
    assert _normalize_database_url("postgres://user:pw@host/db") == "postgresql://user:pw@host/db"
    assert _normalize_database_url("postgresql://user:pw@host/db") == "postgresql://user:pw@host/db"
    assert _normalize_database_url("sqlite:///db.sqlite") == "sqlite:///db.sqlite"

