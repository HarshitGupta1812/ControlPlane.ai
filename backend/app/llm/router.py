import asyncio
import json
from collections.abc import AsyncIterator
from contextvars import ContextVar
from typing import Any

import httpx

from app.config import get_settings

_fallback_used: ContextVar[bool] = ContextVar("llm_fallback_used", default=False)


class ModelRouter:
    def __init__(self) -> None:
        self.settings = get_settings()

    def select(self, *, tier: str, preference: str = "auto") -> dict[str, Any]:
        capable = preference == "capable" or (preference == "auto" and tier == "capable")
        cost = .0148 if capable else .0022
        groq = {"model": "groq/openai/gpt-oss-20b", "provider": "groq", "fallback": "gemini/gemini-3.6-flash", "estimated_cost_usd": cost}
        gemini = {"model": "gemini/gemini-3.6-flash", "provider": "gemini", "fallback": "groq/openai/gpt-oss-20b", "estimated_cost_usd": cost}
        # Groq is always the primary model; Gemini is the fallback. Only when no
        # Groq key is configured does Gemini become primary.
        if self.settings.groq_api_key:
            return groq
        if self.settings.gemini_api_key:
            return gemini
        return groq

    @staticmethod
    def fallback_used() -> bool:
        return _fallback_used.get()

    async def stream(self, prompt: str, route: dict[str, Any]) -> AsyncIterator[str]:
        _fallback_used.set(False)
        if self.settings.dev_mock_llm:
            response = "Customer feedback clusters around onboarding friction, handoff latency, and search relevance. Recommended actions: tighten the first-run checklist, add an escalation SLA, and refresh high-traffic knowledge articles."
            for word in response.split():
                yield word + " "
            return
        if not (self.settings.groq_api_key or self.settings.gemini_api_key):
            # A real environment must never label a canned answer as provider output.
            raise RuntimeError("No LLM provider is configured")
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
        if model.startswith("gemini/"):
            async for content in self._gemini_stream(prompt, model):
                yield content
            return

        from litellm import acompletion

        async with asyncio.timeout(self.settings.llm_timeout_seconds):
            api_key = self.settings.groq_api_key if model.startswith("groq/") else self.settings.gemini_api_key
            stream = await acompletion(model=model, messages=[{"role": "user", "content": prompt}], stream=True, api_key=api_key)
            async for chunk in stream:
                content = getattr(chunk.choices[0].delta, "content", None)
                if content:
                    yield content

    async def _gemini_stream(self, prompt: str, model: str) -> AsyncIterator[str]:
        """Stream Gemini directly so current AI Studio AQ authorization keys work."""
        if not self.settings.gemini_api_key:
            raise RuntimeError("Gemini API key is not configured")
        model_name = model.removeprefix("gemini/")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:streamGenerateContent?alt=sse"
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        timeout = httpx.Timeout(self.settings.llm_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client, client.stream("POST", url, headers={"x-goog-api-key": self.settings.gemini_api_key}, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = json.loads(line.removeprefix("data: "))
                for candidate in data.get("candidates", []):
                    for part in candidate.get("content", {}).get("parts", []):
                        text = part.get("text")
                        if text:
                            yield str(text)
