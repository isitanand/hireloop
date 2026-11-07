"""Provider-layer contract tests: every Provider.complete()/complete_document()
must raise LLMError on failure, never a raw SDK exception. Callers (llm.py's
screen()/draft(), and the backend's profile router) all catch LLMError
specifically - anything else escapes as an unhandled crash instead of a
clean, user-facing error.

Regression test for a real bug: AnthropicProvider called the Anthropic SDK
directly with no try/except, so an auth failure (or rate limit, or any
other SDK-raised error) propagated as a raw anthropic.APIError instead of
LLMError, which crashed the FastAPI request instead of returning a 422.
"""
from __future__ import annotations

import pytest
import requests

from jobhunt.providers import (
    CONNECT_TIMEOUT,
    RETRY_ATTEMPTS,
    TIMEOUT,
    AnthropicProvider,
    GeminiProvider,
    GroqProvider,
    LLMError,
    NvidiaProvider,
    ProviderBusy,
    resolve_backup,
)


class _FailingMessages:
    def create(self, **kwargs):
        raise RuntimeError("simulated SDK failure (e.g. 401 from a bad key)")


class _FailingClient:
    messages = _FailingMessages()


def test_anthropic_complete_wraps_sdk_exception_as_llm_error(monkeypatch):
    provider = AnthropicProvider()
    monkeypatch.setattr(provider, "_client", lambda: _FailingClient())

    with pytest.raises(LLMError):
        provider.complete("anthropic-test-model", "system", "user", max_tokens=100)


def test_anthropic_complete_document_wraps_sdk_exception_as_llm_error(monkeypatch):
    provider = AnthropicProvider()
    monkeypatch.setattr(provider, "_client", lambda: _FailingClient())

    with pytest.raises(LLMError):
        provider.complete_document("anthropic-test-model", "prompt", b"%PDF-1.4 fake", max_tokens=100)


def _raise_timeout(*_args, **_kwargs):
    raise requests.exceptions.ReadTimeout("simulated read timeout")


def test_gemini_complete_wraps_network_exception_as_llm_error(monkeypatch):
    """Regression test for a real production incident: a ReadTimeout from
    requests.post() isn't a bad status code, it's a raised exception - the
    retry loop's `if r.status_code != 200` line never even runs, so it
    escaped uncaught past this function, past screen()/draft()'s per-batch
    try/except (which only catches LLMError), and killed the entire pipeline
    run instead of just skipping the one batch that hit it."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("jobhunt.providers.time.sleep", lambda *_: None)
    monkeypatch.setattr("jobhunt.providers.requests.post", _raise_timeout)

    with pytest.raises(LLMError):
        GeminiProvider().complete("gemini-x", "system", "user", max_tokens=100)


def test_openai_compat_complete_wraps_network_exception_as_llm_error(monkeypatch):
    """Same regression as above, for the Groq/NVIDIA/openai-compatible path."""
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr("jobhunt.providers.time.sleep", lambda *_: None)
    monkeypatch.setattr("jobhunt.providers.requests.post", _raise_timeout)

    with pytest.raises(ProviderBusy):
        GroqProvider().complete("llama-x", "system", "user", max_tokens=100)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload


_OVERLOADED = '{"error":{"message":"Service temporarily overloaded","type":"Service Unavailable","code":503}}'
_OK_CHAT = {"choices": [{"message": {"content": "hello"}}]}


def _script_replies(monkeypatch, replies: list) -> list[dict]:
    """Patch requests.post to hand back `replies` in order (an Exception in the
    list is raised instead); returns the list of call records so a test can
    assert how many attempts were made."""
    calls: list[dict] = []
    it = iter(replies)

    def fake_post(url, **kwargs):
        calls.append({"url": url, **kwargs})
        reply = next(it)
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr("jobhunt.providers.time.sleep", lambda *_: None)
    monkeypatch.setattr("jobhunt.providers.requests.post", fake_post)
    return calls


def test_nvidia_retries_transient_503_then_succeeds(monkeypatch):
    """Regression test for a real production incident: NVIDIA answered a resume
    upload with `HTTP 503 Service temporarily overloaded`, the openai-compatible
    path made exactly one attempt and surfaced the error, and the same upload
    worked when the user simply tried again a bit later. A short retry should
    have absorbed it."""
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")
    calls = _script_replies(monkeypatch, [
        _FakeResponse(503, text=_OVERLOADED),
        _FakeResponse(503, text=_OVERLOADED),
        _FakeResponse(200, _OK_CHAT),
    ])

    assert NvidiaProvider().complete("nemotron-x", "system", "user", max_tokens=100) == "hello"
    assert len(calls) == 3


def test_nvidia_gives_up_after_retries_on_persistent_503(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")
    calls = _script_replies(monkeypatch, [_FakeResponse(503, text=_OVERLOADED)] * RETRY_ATTEMPTS)

    with pytest.raises(ProviderBusy, match="HTTP 503"):
        NvidiaProvider().complete("nemotron-x", "system", "user", max_tokens=100)
    assert len(calls) == RETRY_ATTEMPTS


def test_openai_compat_does_not_retry_a_bad_key(monkeypatch):
    """A 401 is a real config problem - retrying it only delays the error."""
    monkeypatch.setenv("GROQ_API_KEY", "bad-key")
    calls = _script_replies(monkeypatch, [_FakeResponse(401, text="unauthorized")])

    with pytest.raises(LLMError, match="HTTP 401") as exc:
        GroqProvider().complete("llama-x", "system", "user", max_tokens=100)
    assert len(calls) == 1
    assert not isinstance(exc.value, ProviderBusy)  # a config error, not "try later"


def test_gemini_retries_transient_503_then_succeeds(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    calls = _script_replies(monkeypatch, [
        _FakeResponse(503, text="high demand"),
        _FakeResponse(200, {"candidates": [{
            "finishReason": "STOP", "content": {"parts": [{"text": "hello"}]}}]}),
    ])

    assert GeminiProvider().complete("gemini-x", "system", "user", max_tokens=100) == "hello"
    assert len(calls) == 2


def test_read_timeout_is_not_retried(monkeypatch):
    """A read timeout already cost the full TIMEOUT (120s). Retrying it
    RETRY_ATTEMPTS times turned one hung call into a ~6 minute wait - per batch,
    in a run of many batches - so a run against a hanging model looked frozen
    for the better part of an hour instead of skipping the batch after 2 min."""
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")
    calls = _script_replies(monkeypatch, [requests.exceptions.ReadTimeout("hung")] * RETRY_ATTEMPTS)

    with pytest.raises(ProviderBusy):
        NvidiaProvider().complete("nemotron-x", "system", "user", max_tokens=100)
    assert len(calls) == 1


def test_connection_errors_are_still_retried(monkeypatch):
    """Unlike a read timeout, a reset/refused connection fails fast, so
    retrying it is cheap and usually works."""
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")
    calls = _script_replies(monkeypatch, [
        requests.exceptions.ConnectionError("connection reset"),
        _FakeResponse(200, _OK_CHAT),
    ])

    assert NvidiaProvider().complete("nemotron-x", "system", "user", max_tokens=100) == "hello"
    assert len(calls) == 2


def test_requests_use_a_short_connect_timeout(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")
    calls = _script_replies(monkeypatch, [_FakeResponse(200, _OK_CHAT)])

    NvidiaProvider().complete("nemotron-x", "system", "user", max_tokens=100)

    assert calls[0]["timeout"] == (CONNECT_TIMEOUT, TIMEOUT)
    assert CONNECT_TIMEOUT < TIMEOUT


# ------------------------------------------------------------ resolve_backup --


def _clear_llm_env(monkeypatch):
    for key in ("LLM_PROVIDER", "DRAFT_PROVIDER", "DRAFT_MODEL", "LLM_BACKUP_PROVIDER", "LLM_BACKUP_MODEL"):
        monkeypatch.delenv(key, raising=False)


def test_resolve_backup_is_off_by_default(monkeypatch):
    _clear_llm_env(monkeypatch)
    monkeypatch.setenv("LLM_PROVIDER", "nvidia")

    assert resolve_backup("draft") is None


def test_resolve_backup_picks_the_backup_providers_own_default_model(monkeypatch):
    """DRAFT_MODEL names the *primary's* model (an NVIDIA id here). It must not
    be handed to Gemini, which would 404 on it and defeat the backup."""
    _clear_llm_env(monkeypatch)
    monkeypatch.setenv("LLM_PROVIDER", "nvidia")
    monkeypatch.setenv("DRAFT_MODEL", "nvidia/nemotron-3-super-120b-a12b")
    monkeypatch.setenv("LLM_BACKUP_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    provider, model = resolve_backup("draft")

    assert isinstance(provider, GeminiProvider)
    assert model == "gemini-3.6-flash"


def test_resolve_backup_model_can_be_overridden(monkeypatch):
    _clear_llm_env(monkeypatch)
    monkeypatch.setenv("LLM_PROVIDER", "nvidia")
    monkeypatch.setenv("LLM_BACKUP_PROVIDER", "groq")
    monkeypatch.setenv("LLM_BACKUP_MODEL", "llama-x")
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    _, model = resolve_backup("draft")

    assert model == "llama-x"


def test_resolve_backup_ignores_a_backup_that_is_the_primary(monkeypatch):
    _clear_llm_env(monkeypatch)
    monkeypatch.setenv("LLM_PROVIDER", "nvidia")
    monkeypatch.setenv("LLM_BACKUP_PROVIDER", "nvidia")

    assert resolve_backup("draft") is None


def test_resolve_backup_reports_a_missing_key_instead_of_hiding_it(monkeypatch):
    _clear_llm_env(monkeypatch)
    monkeypatch.setenv("LLM_PROVIDER", "nvidia")
    monkeypatch.setenv("LLM_BACKUP_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    with pytest.raises(LLMError, match="GEMINI_API_KEY"):
        resolve_backup("draft")


def test_resolve_backup_reports_an_unknown_provider(monkeypatch):
    _clear_llm_env(monkeypatch)
    monkeypatch.setenv("LLM_PROVIDER", "nvidia")
    monkeypatch.setenv("LLM_BACKUP_PROVIDER", "gemeni")

    with pytest.raises(LLMError, match="unknown provider"):
        resolve_backup("draft")
