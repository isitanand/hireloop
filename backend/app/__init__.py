"""Backend package bootstrap.

The `jobhunt/` pipeline package lives one level up (sibling of `backend/`),
not inside it - the whole point of this backend is to wrap that existing,
tested package rather than duplicate it. Put the project root on sys.path so
`import jobhunt` works no matter what directory uvicorn is launched from.
"""
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_backend_env() -> None:
    """Populate os.environ from backend/.env - this MUST run before anything
    imports `jobhunt.providers` or `jobhunt.mailer`, both of which read
    LLM_PROVIDER / *_API_KEY / SMTP_* straight from os.environ.

    Deliberately NOT done via pydantic-settings: that only loads `.env`
    into the `Settings` object's own fields (database_url, jwt_secret, ...),
    it never touches os.environ, so `jobhunt/providers.py`'s `os.getenv()`
    calls would never see anything from `backend/.env` otherwise - LLM
    provider config in that file would silently do nothing.

    Uses setdefault, same as jobhunt/cli.py's own `_load_env()`: an
    already-set environment variable wins over the file. This is what
    `backend/tests/conftest.py` relies on (it sets JWT_SECRET,
    ADMIN_RUN_SECRET, etc. in os.environ *before* importing `app`,
    specifically so the test suite never touches whatever happens to be in
    a developer's real `backend/.env`) - flip this to unconditional
    assignment and every test that depends on that isolation breaks. It
    still fixes the actual bug this function exists for: a stray
    ANTHROPIC_API_KEY sitting in the OS environment (unrelated to this
    project, left over from something else) only caused a problem because
    LLM_PROVIDER was never being set from `backend/.env` at all before this
    function existed - once LLM_PROVIDER=gemini is actually applied,
    `resolve()` picks Gemini and never looks at ANTHROPIC_API_KEY in the
    first place, regardless of what that stray variable is set to.
    """
    env_path = BACKEND_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_backend_env()
