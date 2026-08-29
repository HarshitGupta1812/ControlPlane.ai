import pytest

from app.llm.router import ModelRouter


def test_router_uses_groq_as_default_primary(monkeypatch) -> None:
    router = ModelRouter()
    monkeypatch.setattr(router.settings, "groq_api_key", "groq-test")
    monkeypatch.setattr(router.settings, "gemini_api_key", "")
    assert router.select(tier="balanced")["model"] == "groq/openai/gpt-oss-20b"
    assert router.select(tier="balanced")["fallback"] == "gemini/gemini-3.6-flash"


def test_groq_stays_primary_on_the_capable_tier(monkeypatch) -> None:
    # Groq is the unconditional primary whenever a Groq key is configured;
    # Gemini 3.6-flash is only ever the fallback.
    router = ModelRouter()
    monkeypatch.setattr(router.settings, "groq_api_key", "groq-test")
    monkeypatch.setattr(router.settings, "gemini_api_key", "gemini-test")
    route = router.select(tier="capable")
    assert route["model"] == "groq/openai/gpt-oss-20b"
    assert route["fallback"] == "gemini/gemini-3.6-flash"


def test_gemini_is_primary_only_without_a_groq_key(monkeypatch) -> None:
    router = ModelRouter()
    monkeypatch.setattr(router.settings, "groq_api_key", "")
    monkeypatch.setattr(router.settings, "gemini_api_key", "gemini-test")
    route = router.select(tier="capable")
    assert route["model"] == "gemini/gemini-3.6-flash"
    assert route["fallback"] == "groq/openai/gpt-oss-20b"


@pytest.mark.asyncio
async def test_router_never_uses_a_mock_response_without_development_mode(monkeypatch) -> None:
    router = ModelRouter()
    monkeypatch.setattr(router.settings, "dev_mock_llm", False)
    monkeypatch.setattr(router.settings, "groq_api_key", None)
    monkeypatch.setattr(router.settings, "gemini_api_key", None)
    with pytest.raises(RuntimeError, match="No LLM provider"):
        await anext(router.stream("hello", router.select(tier="balanced")))
