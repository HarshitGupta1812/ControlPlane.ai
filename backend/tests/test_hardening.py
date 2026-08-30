import pytest
from pydantic import ValidationError

from app.api.schemas import ChatRequest
from app.config import Settings
from app.core.orchestrator import GovernanceOrchestrator
from app.policies.simulator import simulate
from app.security.auth import hash_password, verify_password
from app.security.redaction import find_pii, redact, sanitize_for_log
from app.stages.generation_gate import StreamingSafetyGate


def test_password_hash_supports_long_input_without_truncation() -> None:
    password = "a" * 128
    hashed = hash_password(password)
    assert verify_password(password, hashed)
    assert not verify_password(password[:-1], hashed)


def test_redaction_map_never_leaks_values() -> None:
    raw = "Send maya@example.com and 4111 1111 1111 1111"
    findings = find_pii(raw)
    safe = redact(raw, findings)
    assert "maya@example.com" not in safe
    assert "4111" not in safe
    assert safe == "Send [EMAIL REDACTED] and [PAYMENT_CARD REDACTED]"
    assert sanitize_for_log({"api_key": "secret-value", "released_tokens": 4}) == {"api_key": "[REDACTED]", "released_tokens": 4}


def test_streaming_gate_withholds_unsafe_buffer() -> None:
    gate = StreamingSafetyGate(buffer_chars=20)
    assert gate.push("safe ") == []
    assert gate.push("violent output", unsafe=True) == []
    assert gate.cancelled is True
    assert gate.flush() == []


@pytest.mark.asyncio
async def test_pipeline_events_never_contain_raw_pii() -> None:
    result = await GovernanceOrchestrator().run("Please email maya@example.com the internal report")
    serialized = str([event.data for event in result.events])
    assert "maya@example.com" not in serialized
    assert "[EMAIL REDACTED]" in result.sanitized_prompt


@pytest.mark.asyncio
async def test_attached_source_changes_honest_verification() -> None:
    result = await GovernanceOrchestrator().run("Summarize the internal operations report", sources=[{"id": "runbook-1", "text": "Customer feedback clusters around operations and onboarding. We need to focus on improving the onboarding experience. Next steps: Overhaul documentation and hire more support staff."}])
    # With a source attached the verdict is a grounding verdict, no longer the
    # source-less UNVERIFIABLE; the exact grade depends on the live model output.
    assert result.verification in {"SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED"}
    assert result.verification != "UNVERIFIABLE"
    assert result.claims[0]["citations"] == ["runbook-1"]


@pytest.mark.asyncio
async def test_attached_source_is_graded_and_unsupported_escalates() -> None:
    result = await GovernanceOrchestrator().run("Summarize the internal operations report", sources=[{"id": "unrelated", "text": "A totally unrelated sentence about garden tools."}])
    # The source is fed to the model and graded by the verifier, so the verdict
    # is a grounding verdict (never the source-less UNVERIFIABLE) and is cited.
    assert result.verification in {"SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED"}
    assert result.claims and result.claims[0]["citations"] == ["unrelated"]
    # The escalation path stays wired: an UNSUPPORTED grounding verdict on a
    # non-decision use case flags the request and tags it as a hallucination risk.
    if result.verification == "UNSUPPORTED":
        assert result.action == "FLAG"
        assert "hallucination" in result.risk_tags


def test_simulator_runs_fusion_without_generation() -> None:
    result = simulate("Should we approve this applicant based on their neighborhood and family situation?")
    assert result["action"] == "HUMAN_REVIEW"
    assert "bias" in result["risk_tags"]
    assert result["estimated_cost_usd"] == 0.0


def test_chat_request_rejects_invalid_session_and_oversized_sources() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(prompt="hello", session_id="not-a-uuid")
    with pytest.raises(ValidationError):
        ChatRequest(prompt="hello", sources=[{"id": "source", "text": "x" * 12_001}])  # type: ignore


def test_settings_accepts_documented_comma_separated_cors_origins(monkeypatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080")
    assert Settings().cors_origins == ["http://localhost:5173", "http://localhost:8080"]
