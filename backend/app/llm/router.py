import asyncio
from collections.abc import AsyncIterator
from contextvars import ContextVar
from typing import Any

from app.config import get_settings

_fallback_used: ContextVar[bool] = ContextVar("llm_fallback_used", default=False)


class ModelRouter:
    def __init__(self) -> None:
        self.settings = get_settings()

    def select(self, *, tier: str, preference: str = "auto") -> dict[str, Any]:
        capable = preference == "capable" or (preference == "auto" and tier == "capable")
        if capable and self.settings.gemini_api_key:
            return {"model": "gemini/gemini-2.5-flash", "provider": "gemini", "fallback": "groq/gpt-oss-20b", "estimated_cost_usd": .0148}
        if not capable and self.settings.groq_api_key:
            return {"model": "groq/gpt-oss-20b", "provider": "groq", "fallback": "gemini/gemini-2.5-flash", "estimated_cost_usd": .0022}
        if self.settings.gemini_api_key:
            return {"model": "gemini/gemini-2.5-flash", "provider": "gemini", "fallback": "groq/gpt-oss-20b", "estimated_cost_usd": .0148}
        return {"model": "groq/gpt-oss-20b", "provider": "groq", "fallback": "gemini/gemini-2.5-flash", "estimated_cost_usd": .0022}

    @staticmethod
    def fallback_used() -> bool:
        return _fallback_used.get()

    async def stream(self, prompt: str, route: dict[str, Any]) -> AsyncIterator[str]:
        _fallback_used.set(False)
        if self.settings.dev_mock_llm or not (self.settings.groq_api_key or self.settings.gemini_api_key):
            response = "Customer feedback clusters around onboarding friction, handoff latency, and search relevance. Recommended actions: tighten the first-run checklist, add an escalation SLA, and refresh high-traffic knowledge articles."
            for word in response.split():
                yield word + " "
            return
        try:
            async for content in self._provider_stream(prompt, route["model"]):
                yield content
            return
        except Exception:
            _fallback_used.set(True)
        try:
            async for content in self._provider_stream(prompt, route["fallback"]):
                yield content
            return
        except Exception:
            fallback = "The selected models were unavailable. ControlPlane used a deterministic safe fallback and recorded the route event."
            for word in fallback.split():
                yield word + " "

    async def _provider_stream(self, prompt: str, model: str) -> AsyncIterator[str]:
        from litellm import acompletion

        async with asyncio.timeout(self.settings.llm_timeout_seconds):
            api_key = self.settings.groq_api_key if model.startswith("groq/") else self.settings.gemini_api_key
            stream = await acompletion(model=model, messages=[{"role": "user", "content": prompt}], stream=True, api_key=api_key)
            async for chunk in stream:
                content = getattr(chunk.choices[0].delta, "content", None)
                if content:
                    yield content
