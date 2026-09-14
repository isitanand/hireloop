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

from jobhunt.providers import AnthropicProvider, LLMError


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
