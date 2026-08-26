from app.llm.router import ModelRouter


def test_router_uses_groq_as_default_primary(monkeypatch) -> None:
    router = ModelRouter()
    monkeypatch.setattr(router.settings, "groq_api_key", "groq-test")
    monkeypatch.setattr(router.settings, "gemini_api_key", "")
    assert router.select(tier="balanced")["model"] == "groq/gpt-oss-20b"
    assert router.select(tier="balanced")["fallback"] == "gemini/gemini-2.5-flash"


def test_capable_route_uses_gemini_when_configured(monkeypatch) -> None:
    router = ModelRouter()
    monkeypatch.setattr(router.settings, "groq_api_key", "groq-test")
    monkeypatch.setattr(router.settings, "gemini_api_key", "gemini-test")
    assert router.select(tier="capable")["model"] == "gemini/gemini-2.5-flash"
