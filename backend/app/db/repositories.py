from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.orchestrator import PipelineResult
from app.db.models import Event, HumanReviewQueue, Message, RequestRecord, User
from app.db.rollups import refresh_usage_daily
from app.security.sanitization import sanitize_event


def persist_result(db: Session, *, user: User, result: PipelineResult, session_id: str | None = None) -> RequestRecord:
    record = RequestRecord(
        id=result.request_id,
        tenant_id=user.tenant_id,
        user_id=user.id,
        prompt_sanitized=result.sanitized_prompt,
        session_id=session_id,
        use_case=result.use_case,
        use_case_confidence=result.use_case_confidence,
        use_case_inferred=result.use_case_inferred,
        complexity=result.complexity,
        policy_action=result.action,
        policy_key=result.policy_key,
        policy_version=result.policy_version,
        risk_tags=result.risk_tags,
        model_served=result.model,
        fallback_used=result.fallback_used,
        pii_summary=result.pii,
        injection_summary=result.injection,
        verification_verdict=result.verification,
        verification_claims=result.claims,
        trust_score=result.trust_score,
        trust_breakdown=result.trust_breakdown,
        tokens_in=len(result.sanitized_prompt.split()),
        tokens_out=len(result.response.split()),
        cost_usd=result.cost_usd,
        latency_ms=result.latency_ms,
        ttfb_ms=result.latency_ms,
        compounding_risk=result.compounding_risk,
        human_review_status="pending" if result.action == "HUMAN_REVIEW" else None,
        status="blocked" if result.action == "BLOCK" else "completed",
    )
    db.add(record)
    db.add(
        Message(
            request_id=result.request_id,
            role="user",
            content_sanitized=result.sanitized_prompt,
            token_count=len(result.sanitized_prompt.split()),
        )
    )
    if result.response:
        db.add(Message(request_id=result.request_id, role="assistant", content_sanitized=result.response, token_count=len(result.response.split())))
    db.add_all(
        [
            Event(
                request_id=result.request_id,
                sequence=sequence,
                stage=event.stage,
                status=event.status,
                duration_ms=event.duration_ms,
                confidence=event.confidence,
                data=sanitize_event(event.data),
            )
            for sequence, event in enumerate(result.events, start=1)
        ]
    )
    if result.action == "HUMAN_REVIEW":
        db.add(HumanReviewQueue(tenant_id=user.tenant_id, request_id=result.request_id, reason=" · ".join(result.risk_tags) or "Policy threshold"))
    db.commit()
    today = datetime.now(UTC).date()
    refresh_usage_daily(db, user.tenant_id, user.id, today, result.use_case)
    refresh_usage_daily(db, user.tenant_id, user.id, today, "all")
    db.refresh(record)
    return record
