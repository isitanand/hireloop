"""Shared test fixtures.

Mirrors the no-network, no-API-key philosophy already established in the
repo's own `tests/` (see tests/test_parsers.py, tests/test_llm.py): the
backend suite never makes a real HTTP call to an ATS board or an LLM
provider. Where the pipeline needs one, the test monkeypatches it, exactly
like the existing suite stubs the LLM client.

DATABASE_URL etc. must be set *before* `app.config`/`app.database` are
imported, since pydantic-settings reads the environment once at import time.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_tmp_dir = tempfile.mkdtemp(prefix="jobhunt-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp_dir) / 'test.db'}"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ADMIN_RUN_SECRET"] = "test-admin-secret"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
# jobhunt.providers.resolve()'s preflight check is a cheap env-var presence
# check, not a network call - but pipeline tests that monkeypatch
# llm.screen/llm.draft directly still go through resolve("screen") first
# (see app/services/pipeline_service.py), which raises LLMError and aborts
# the whole run before anything gets persisted if no provider credentials
# are set at all. Anthropic is the default provider (LLM_PROVIDER unset), so
# a fake key here is what those tests actually need, not a real one.
os.environ["ANTHROPIC_API_KEY"] = "test-anthropic-key"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    init_db()
    with TestClient(app) as c:
        yield c
    # Wipe every table between tests instead of recreating the sqlite file,
    # so each test starts from a clean slate without Windows file-lock
    # issues from deleting a file another handle still has open.
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture()
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def auth_headers(client):
    def _register(email: str = "alice@test.com", password: str = "password123"):
        r = client.post("/auth/register", json={"email": email, "password": password, "name": "Alice"})
        assert r.status_code == 201, r.text
        token = r.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    return _register


SAMPLE_PROFILE = {
    "name": "Alice", "current_title": "Software Engineer II", "years_experience": 3,
    "core_skills": ["Go", "Java", "Python", "Kubernetes", "Kafka", "distributed systems"],
    "domains": ["backend services"], "notable_projects": ["Built a thing"],
    "education": "B.E. Computer Science", "seniority": "mid",
    "target_titles": ["Software Engineer", "Backend Engineer", "Software Development Engineer"],
}


@pytest.fixture()
def sample_profile():
    return dict(SAMPLE_PROFILE)
