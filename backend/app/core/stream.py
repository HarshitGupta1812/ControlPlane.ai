import json
from collections.abc import AsyncIterator
from typing import Any

from app.core.orchestrator import GovernanceOrchestrator, PipelineResult
from app.security.redaction import sanitize_for_log


def sse(event: str, data: dict[str, Any]) -> str:
    safe_data = sanitize_for_log(data)
    return f"event: {event}\ndata: {json.dumps(safe_data, separators=(',', ':'), default=str)}\n\n"


async def governed_stream(orchestrator: GovernanceOrchestrator, prompt: str, **kwargs: object) -> AsyncIterator[str]:
    result: PipelineResult | None = None
    async for event, payload in orchestrator.stream_events(prompt, **kwargs):
        if event == "result":
            result = payload["result"]
            continue
        yield sse(event, payload)
    if result is not None:
        yield sse("done", {"request_id": result.request_id, "action": result.action, "model": result.model, "latency_ms": result.latency_ms, "cost_usd": result.cost_usd, "trust_score": result.trust_score})
