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

from jobhunt.providers import AnthropicProvider, GeminiProvider, GroqProvider, LLMError


class _FailingMessages:
    def create(self, **kwargs):
        raise RuntimeError("simulated SDK failure (e.g. 401 from a bad key)")


class _FailingClient:
    messages = _FailingMessages()


def test_anthropic_complete_wraps_sdk_exception_as_llm_error(monkeypatch):
    provider = AnthropicProvider()
    monkeypatch.setattr(provider, "_client", lambda: _FailingClient())

    with pytest.raises(LLMError):
        provider.complete("claude-x", "system", "user", max_tokens=100)


def test_anthropic_complete_document_wraps_sdk_exception_as_llm_error(monkeypatch):
    provider = AnthropicProvider()
    monkeypatch.setattr(provider, "_client", lambda: _FailingClient())

    with pytest.raises(LLMError):
        provider.complete_document("claude-x", "prompt", b"%PDF-1.4 fake", max_tokens=100)


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
    """Same regression as above, for the Groq/NVIDIA/openai-compatible path -
    no retry loop here, so no sleep to patch out."""
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr("jobhunt.providers.requests.post", _raise_timeout)

    with pytest.raises(LLMError):
        GroqProvider().complete("llama-x", "system", "user", max_tokens=100)
