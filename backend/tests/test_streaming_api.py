import pytest

from app.core.orchestrator import GovernanceOrchestrator
from app.core.stream import governed_stream
from app.stages.generation_gate import StreamingSafetyGate


def test_streaming_gate_withholds_unsafe_buffer() -> None:
    gate = StreamingSafetyGate(buffer_chars=20)
    assert gate.push("safe ") == []
    assert gate.push("violent output", unsafe=True) == []
    assert gate.cancelled is True
    assert gate.flush() == []


@pytest.mark.asyncio
async def test_stream_events_yield_tokens_and_post_governance_events() -> None:
    packets = []
    async for kind, payload in GovernanceOrchestrator().stream_events("Summarize the internal operations report"):
        packets.append((kind, payload))
    kinds = [kind for kind, _ in packets]
    assert "token" in kinds
    assert kinds[-2:] == ["post", "result"]
    assert packets[-1][1]["result"].action in {"ALLOW", "FLAG", "HUMAN_REVIEW"}


@pytest.mark.asyncio
async def test_sse_helper_serializes_typed_events() -> None:
    frames = []
    async for frame in governed_stream(GovernanceOrchestrator(), "Summarize internal operations"):
        frames.append(frame)
    assert any(frame.startswith("event: stage") for frame in frames)
    assert any(frame.startswith("event: done") for frame in frames)
    assert all("[EMAIL REDACTED]" not in frame for frame in frames)


@pytest.mark.asyncio
async def test_high_strictness_intervenes_on_medium_toxicity() -> None:
    class UnsafeRouter:
        def select(self, **kwargs):
            return {"model": "mock", "fallback": "mock", "estimated_cost_usd": 0.0}

        @staticmethod
        def fallback_used() -> bool:
            return False

        async def stream(self, prompt, route, **kwargs):
            yield "violent "

    orchestrator = GovernanceOrchestrator()
    orchestrator.router = UnsafeRouter()  # type: ignore
    result = await orchestrator.run("Summarize internal operations", safety_strictness="high")
    assert result.action == "FLAG"
    assert "streaming safety gate" in result.response
    assert result.events[7].status == "warn"
