import asyncio
import json
from collections.abc import AsyncIterator
from contextvars import ContextVar
from typing import Any

import httpx

from app.config import get_settings

_fallback_used: ContextVar[bool] = ContextVar("llm_fallback_used", default=False)

# Use-case-specific system prompts for differentiated outputs
SYSTEM_PROMPTS: dict[str, str] = {
    "customer_support": (
        "You are a concise, empathetic customer service agent for an enterprise organisation. "
        "Keep language warm, action-oriented, and solution-focused. Use short paragraphs. "
        "When listing steps, number them. End with a clear next action for the customer."
    ),
    "internal_knowledge": (
        "You are an internal operations analyst summarising information for a technical team. "
        "Structure your response with bullet-point findings and concrete recommended next steps. "
        "Be precise, avoid filler, and cite relevant process names or metrics where possible."
    ),
    "decision_support": (
        "You are a risk-aware decision advisor for senior leadership. "
        "Present a balanced analysis with clearly labelled Pros and Cons sections. "
        "Flag uncertainties explicitly and provide a final Recommendation paragraph with caveats. "
        "Use formal language and quantify impact where feasible."
    ),
}

# Use-case-specific mock responses for dev mode
MOCK_RESPONSES: dict[str, list[str]] = {
    "customer_support": [
        (
            "Thank you for reaching out — I understand how frustrating this must be.\n\n"
            "Here is what I recommend:\n\n"
            "1. **Verify your account details** in Settings > Profile to ensure everything is current.\n"
            "2. **Clear your browser cache** and retry the action that was failing.\n"
            "3. If the issue persists, I have escalated a support ticket (ref #CS-4821) to our engineering team with a 24-hour SLA.\n\n"
            "You should receive a resolution confirmation within one business day. "
            "Please reply here if you need anything else in the meantime."
        ),
    ],
    "internal_knowledge": [
        (
            "**Key Findings:**\n\n"
            "- Customer feedback clusters around three recurring themes: onboarding friction (34%), handoff latency between support tiers (28%), and search relevance degradation (19%).\n"
            "- Incident volume increased 12% week-over-week, primarily in the onboarding funnel.\n"
            "- The current runbook for escalation (RB-ops-017) has not been updated since Q1.\n\n"
            "**Recommended Next Steps:**\n\n"
            "- Tighten the first-run onboarding checklist to reduce drop-off.\n"
            "- Introduce an escalation SLA of 4 hours for Tier-2 handoffs.\n"
            "- Refresh high-traffic knowledge articles flagged by the search relevance audit.\n"
            "- Schedule a runbook review session for RB-ops-017 with the on-call rotation leads."
        ),
    ],
    "decision_support": [
        (
            "## Analysis: Recommended Course of Action\n\n"
            "### Pros\n"
            "- Projected ROI of 18–22% over the next fiscal quarter based on current pipeline data.\n"
            "- Aligns with the strategic objective to reduce operational overhead by consolidating tooling.\n"
            "- Risk exposure is bounded: worst-case downside is estimated at 4% of allocated budget.\n\n"
            "### Cons\n"
            "- Implementation timeline of 6–8 weeks introduces a delivery risk if Q3 hiring targets slip.\n"
            "- Dependency on a third-party vendor whose SLA history shows 97.2% uptime (below our 99.5% threshold).\n"
            "- Insufficient historical data to model long-term churn impact with high confidence.\n\n"
            "### Uncertainties\n"
            "- Market conditions in the target segment remain volatile; a ±3% variance in demand forecasting is plausible.\n"
            "- Legal review of the vendor contract is pending and may introduce additional constraints.\n\n"
            "### Recommendation\n"
            "**Proceed with a phased rollout**, gating full deployment on successful completion of a 2-week pilot with the operations team. "
            "This mitigates delivery risk while preserving the projected ROI window. "
            "Escalate the vendor SLA concern to procurement before contract finalisation."
        ),
    ],
}


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

    async def stream(self, prompt: str, route: dict[str, Any], *, system_prompt: str | None = None) -> AsyncIterator[str]:
        _fallback_used.set(False)
        if self.settings.dev_mock_llm:
            # Pick a use-case-specific mock response based on the system prompt
            response = _select_mock_response(system_prompt)
            for word in response.split():
                yield word + " "
            return
        if not (self.settings.groq_api_key or self.settings.gemini_api_key):
            # A real environment must never label a canned answer as provider output.
            raise RuntimeError("No LLM provider is configured")
        try:
            async for content in self._provider_stream(prompt, route["model"], system_prompt=system_prompt):
                yield content
            return
        except Exception:
            _fallback_used.set(True)
        try:
            async for content in self._provider_stream(prompt, route["fallback"], system_prompt=system_prompt):
                yield content
            return
        except Exception:
            fallback = "The selected models were unavailable. ControlPlane used a deterministic safe fallback and recorded the route event."
            for word in fallback.split():
                yield word + " "

    async def _provider_stream(self, prompt: str, model: str, *, system_prompt: str | None = None) -> AsyncIterator[str]:
        if model.startswith("gemini/"):
            async for content in self._gemini_stream(prompt, model, system_prompt=system_prompt):
                yield content
            return

        from litellm import acompletion

        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        async with asyncio.timeout(self.settings.llm_timeout_seconds):
            api_key = self.settings.groq_api_key if model.startswith("groq/") else self.settings.gemini_api_key
            stream = await acompletion(model=model, messages=messages, stream=True, api_key=api_key)
            async for chunk in stream:
                chunk_content: str | None = getattr(chunk.choices[0].delta, "content", None)
                if chunk_content:
                    yield chunk_content

    async def _gemini_stream(self, prompt: str, model: str, *, system_prompt: str | None = None) -> AsyncIterator[str]:
        """Stream Gemini directly so current AI Studio AQ authorization keys work."""
        if not self.settings.gemini_api_key:
            raise RuntimeError("Gemini API key is not configured")
        model_name = model.removeprefix("gemini/")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:streamGenerateContent?alt=sse"

        contents: list[dict[str, Any]] = []
        if system_prompt:
            contents.append({"role": "model", "parts": [{"text": system_prompt}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        payload: dict[str, Any] = {"contents": contents}
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


def _select_mock_response(system_prompt: str | None) -> str:
    """Pick a mock response matching the use-case system prompt."""
    if system_prompt:
        for key, prompt_text in SYSTEM_PROMPTS.items():
            if prompt_text == system_prompt:
                responses = MOCK_RESPONSES.get(key, [])
                if responses:
                    return responses[0]
    # Fallback to internal_knowledge style
    return MOCK_RESPONSES["internal_knowledge"][0]
