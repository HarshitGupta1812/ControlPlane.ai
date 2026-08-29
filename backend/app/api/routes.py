import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from math import exp
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, desc, func, select
from sqlalchemy.orm import Session

from app.api.schemas import (
    ApiKeyCreate,
    AssistantRequest,
    ChatRequest,
    FeedbackIn,
    PolicySimulation,
    PolicyVersionIn,
    ReviewResolution,
)
from app.assistant.service import answer as assistant_answer
from app.assistant.tools import get_recent_requests, get_usage_summary, list_policies
from app.config import get_settings
from app.core.context import get_request_id
from app.core.orchestrator import GovernanceOrchestrator, PipelineResult
from app.core.stream import sse
from app.db.models import (
    ApiKey,
    Event,
    Feedback,
    HumanReviewQueue,
    Message,
    Policy,
    RequestRecord,
    SessionRecord,
    UsageDaily,
    UseCase,
    User,
)
from app.db.repositories import persist_result
from app.db.session import get_db
from app.observability.metrics import ASSISTANT_REQUESTS, REQUESTS, STAGE_LATENCY
from app.observability.ratelimit import limiter
from app.policies.profiles import POLICIES, PolicyProfile
from app.policies.simulator import simulate
from app.security.auth import get_current_user
from app.security.keys import generate_api_key
from app.security.sanitization import sanitize_event

router = APIRouter(prefix="/api", tags=["control-plane"])
orchestrator = GovernanceOrchestrator()
UserDep = Annotated[User, Depends(get_current_user)]
DbDep = Annotated[Session, Depends(get_db)]


def _normalize_uuid(value: str, label: str = "resource") -> str:
    try:
        return str(UUID(value))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail=f"{label.capitalize()} not found") from None


def public_request(record: RequestRecord) -> dict:
    return {"id": record.id, "prompt": record.prompt_sanitized, "use_case": record.use_case, "use_case_confidence": record.use_case_confidence, "use_case_inferred": record.use_case_inferred, "complexity": record.complexity, "action": record.policy_action, "policy_key": record.policy_key, "policy_version": record.policy_version, "risk_tags": record.risk_tags, "model_served": record.model_served, "verification_verdict": record.verification_verdict, "verification_claims": record.verification_claims, "trust_score": record.trust_score, "trust_breakdown": record.trust_breakdown, "tokens_in": record.tokens_in, "tokens_out": record.tokens_out, "cost_usd": record.cost_usd, "latency_ms": record.latency_ms, "compounding_risk": record.compounding_risk, "status": record.status, "created_at": record.created_at}


def _policy_key_for_use_case(use_case: str | None) -> str | None:
    normalized = (use_case or "").lower().replace(" ", "_")
    return {"customer_support": "CP-CS-14", "internal_knowledge": "CP-IK-07", "decision_support": "CP-DS-11"}.get(normalized)


def _load_policy_override(db: Session, *, user: User, policy_key: str | None) -> PolicyProfile | None:
    if not policy_key:
        return None
    row = db.scalar(select(Policy).where(Policy.tenant_id == user.tenant_id, Policy.policy_key == policy_key, Policy.active.is_(True)).order_by(desc(Policy.version)))
    if row is None:
        row = db.scalar(select(Policy).where(Policy.tenant_id.is_(None), Policy.policy_key == policy_key, Policy.active.is_(True)).order_by(desc(Policy.version)))
    if row is None:
        return None
    return PolicyProfile(row.policy_key, row.version, row.name, "custom", row.geography, row.sector, row.rules)


def _update_session(db: Session, *, user: User, session_id: str | None, risk: float, use_case: str) -> None:
    if not session_id:
        return
    session = db.scalar(select(SessionRecord).where(SessionRecord.id == session_id, SessionRecord.user_id == user.id, SessionRecord.tenant_id == user.tenant_id))
    if session is None:
        return
    session.compounding_risk = min(100.0, max(0.0, float(risk)))
    session.use_case = session.use_case or use_case
    session.last_seen_at = datetime.now(UTC)
    db.commit()


@router.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(body: ChatRequest, request: Request, user: UserDep, db: DbDep):
    if len(body.prompt) > get_settings().max_prompt_chars:
        raise HTTPException(status_code=413, detail="Prompt exceeds the configured maximum length")
    request_id = get_request_id()
    session_risk = 0.0
    session_window: list[str] = []
    session_id = body.session_id
    if session_id:
        session = db.scalar(select(SessionRecord).where(SessionRecord.id == session_id, SessionRecord.user_id == user.id, SessionRecord.tenant_id == user.tenant_id))
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        last_seen = session.last_seen_at
        if last_seen is not None and last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=UTC)
        elapsed_seconds = max(0.0, (datetime.now(UTC) - last_seen).total_seconds()) if last_seen else 0.0
        session_risk = float(session.compounding_risk) * exp(-elapsed_seconds / (max(get_settings().session_risk_decay_minutes, 1.0) * 60))
        session_window = [message.content_sanitized for message in db.scalars(select(Message).where(Message.request_id.in_(select(RequestRecord.id).where(RequestRecord.session_id == session_id))).order_by(Message.created_at).limit(10)).all()]
    else:
        session = SessionRecord(user_id=user.id, tenant_id=user.tenant_id, use_case=body.use_case)
        db.add(session)
        db.flush()
        session_id = session.id

    policy_override = _load_policy_override(db, user=user, policy_key=body.policy_key or _policy_key_for_use_case(body.use_case))

    async def generate() -> AsyncIterator[str]:
        yield sse("context", {"request_id": request_id, "session_id": session_id, "scope": "tenant_user"})
        result: PipelineResult | None = None
        stream_kwargs = {
            "use_case": body.use_case,
            "policy_key": body.policy_key,
            "routing_preference": body.routing_preference,
            "request_id": request_id,
            "headers": dict(request.headers),
            "pii_action": body.pii_action,
            "safety_strictness": body.safety_strictness,
            "verification": body.verification,
            "max_cost_usd": body.max_cost_usd,
            "session_risk": session_risk,
            "sources": [source.model_dump() for source in body.sources],
            "session_window": session_window,
            "policy_override": policy_override,
        }
        try:
            async for kind, payload in orchestrator.stream_events(body.prompt, **stream_kwargs):
                if kind == "result":
                    result = payload["result"]
                    continue
                if kind == "stage":
                    STAGE_LATENCY.labels(stage=payload["stage"]).observe(payload["duration_ms"])
                yield sse(kind, payload)
        except asyncio.CancelledError:
            raise
        except Exception:
            db.rollback()
            yield sse("error", {"request_id": request_id, "code": "pipeline_error", "message": "The governance pipeline failed safely."})
            return
        if result is None:
            return
        try:
            record = persist_result(db, user=user, result=result, session_id=session_id)
            _update_session(db, user=user, session_id=session_id, risk=result.compounding_risk, use_case=result.use_case)
        except Exception:
            db.rollback()
            yield sse("error", {"request_id": request_id, "code": "persistence_error", "message": "The governance result could not be persisted."})
            return
        REQUESTS.labels(action=result.action, use_case=result.use_case).inc()
        yield sse("done", {"request_id": record.id, "action": result.action, "model": result.model, "latency_ms": result.latency_ms, "cost_usd": result.cost_usd, "trust_score": result.trust_score})

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/requests")
def requests_list(user: UserDep, db: DbDep, offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100), action: str | None = None, use_case: str | None = None) -> dict:
    predicates = [RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id]
    if action: predicates.append(RequestRecord.policy_action == action)
    if use_case: predicates.append(RequestRecord.use_case == use_case)
    rows = db.scalars(select(RequestRecord).where(and_(*predicates)).order_by(desc(RequestRecord.created_at)).offset(offset).limit(limit)).all()
    total = db.scalar(select(func.count(RequestRecord.id)).where(and_(*predicates))) or 0
    return {"items": [public_request(row) for row in rows], "total": total, "offset": offset, "limit": limit}


@router.get("/requests/{request_id}")
def request_detail(request_id: str, user: UserDep, db: DbDep) -> dict:
    request_id = _normalize_uuid(request_id, "request")
    row = db.scalar(select(RequestRecord).where(RequestRecord.id == request_id, RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id))
    if not row: raise HTTPException(status_code=404, detail="Request not found")
    payload = public_request(row)
    payload["events"] = [{"sequence": event.sequence, "stage": event.stage, "status": event.status, "duration_ms": event.duration_ms, "confidence": event.confidence, "data": sanitize_event(event.data), "ts": event.ts} for event in db.scalars(select(Event).where(Event.request_id == request_id).order_by(Event.sequence, Event.ts)).all()]
    return payload


@router.get("/requests/{request_id}/events")
def request_events(request_id: str, user: UserDep, db: DbDep) -> list[dict]:
    request_id = _normalize_uuid(request_id, "request")
    exists = db.scalar(select(RequestRecord.id).where(RequestRecord.id == request_id, RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id))
    if not exists: raise HTTPException(status_code=404, detail="Request not found")
    return [{"sequence": event.sequence, "stage": event.stage, "status": event.status, "duration_ms": event.duration_ms, "confidence": event.confidence, "data": sanitize_event(event.data), "ts": event.ts} for event in db.scalars(select(Event).where(Event.request_id == request_id).order_by(Event.sequence, Event.ts)).all()]


@router.get("/requests/{request_id}/replay")
def request_replay(request_id: str, user: UserDep, db: DbDep) -> dict:
    request_id = _normalize_uuid(request_id, "request")
    return {"request_id": request_id, "events": request_events(request_id, user, db), "read_only": True}


@router.post("/requests/{request_id}/feedback")
def request_feedback(request_id: str, body: FeedbackIn, user: UserDep, db: DbDep) -> dict:
    request_id = _normalize_uuid(request_id, "request")
    exists = db.scalar(select(RequestRecord.id).where(RequestRecord.id == request_id, RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id))
    if not exists: raise HTTPException(status_code=404, detail="Request not found")
    db.add(Feedback(tenant_id=user.tenant_id, user_id=user.id, request_id=request_id, rule_key=body.rule_key, label=body.label, note=body.note))
    db.commit()
    return {"ok": True}


@router.get("/me/recent-requests")
def me_recent(user: UserDep, db: DbDep, limit: int = Query(5, ge=1, le=10)) -> list[dict]:
    return get_recent_requests(db, user_id=user.id, tenant_id=user.tenant_id, limit=limit)


@router.get("/me/usage-summary")
def me_usage(user: UserDep, db: DbDep, days: int = Query(7, ge=1, le=90)) -> dict:
    return get_usage_summary(db, user_id=user.id, tenant_id=user.tenant_id, days=days)


@router.post("/keys")
def create_gateway_key(body: ApiKeyCreate, user: UserDep, db: DbDep) -> dict:
    raw, prefix, key_hash = generate_api_key()
    record = ApiKey(tenant_id=user.tenant_id, user_id=user.id, key_prefix=prefix, key_hash=key_hash, label=body.label, default_use_case=body.default_use_case)
    db.add(record)
    db.commit()
    return {"id": record.id, "label": record.label, "prefix": record.key_prefix, "default_use_case": record.default_use_case, "key": raw, "warning": "Store this key now. It will never be shown again."}


@router.get("/keys")
def list_gateway_keys(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.scalars(select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.tenant_id == user.tenant_id, ApiKey.revoked.is_(False)).order_by(desc(ApiKey.created_at))).all()
    return [{"id": row.id, "label": row.label, "prefix": row.key_prefix, "default_use_case": row.default_use_case, "created_at": row.created_at} for row in rows]


@router.post("/keys/{key_id}/revoke")
def revoke_gateway_key(key_id: str, user: UserDep, db: DbDep) -> dict:
    key_id = _normalize_uuid(key_id, "API key")
    row = db.scalar(select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id, ApiKey.tenant_id == user.tenant_id, ApiKey.revoked.is_(False)))
    if row is None:
        raise HTTPException(status_code=404, detail="API key not found")
    row.revoked = True
    db.commit()
    return {"ok": True, "id": row.id}


@router.post("/assistant/stream")
@limiter.limit("60/minute")
async def assistant_stream(request: Request, body: AssistantRequest, user: UserDep, db: DbDep):
    ASSISTANT_REQUESTS.inc()
    response = await assistant_answer(body.message, db=db, user=user)

    async def generate() -> AsyncIterator[str]:
        yield sse("context", {"sources": response.sources, "tool_calls": response.tool_calls, "scope": "product_and_current_user"})
        for token in response.text.split(" "):
            yield sse("token", {"text": token + " "})
        yield sse("done", {"tool_calls": response.tool_calls})

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@router.get("/policies")
def policies_list(user: UserDep, db: DbDep) -> list[dict]:
    return list_policies(db, tenant_id=user.tenant_id) or [{"key": item.key, "version": item.version, "name": item.name, "geography": item.geography, "sector": item.sector} for item in POLICIES]


@router.get("/policies/profiles")
def policy_profiles(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.scalars(select(Policy).where((Policy.tenant_id == user.tenant_id) | (Policy.tenant_id.is_(None))).order_by(Policy.policy_key, desc(Policy.version))).all()
    selected: dict[str, Policy] = {}
    for row in rows:
        if row.policy_key not in selected or row.tenant_id == user.tenant_id:
            selected[row.policy_key] = row
    if selected:
        return [{"key": row.policy_key, "version": row.version, "name": row.name, "geography": row.geography, "sector": row.sector, "rules": row.rules, "active": row.active} for row in selected.values()]
    return [{"key": item.key, "version": item.version, "name": item.name, "use_case": item.use_case, "geography": item.geography, "sector": item.sector, "rules": item.rules, "active": True} for item in POLICIES]


@router.post("/policies")
def create_policy(body: PolicyVersionIn, user: UserDep, db: DbDep) -> dict:
    key = body.policy_key or f"CP-CUSTOM-{user.id[:6].upper()}"
    latest = db.scalar(select(func.max(Policy.version)).where(Policy.tenant_id == user.tenant_id, Policy.policy_key == key)) or 0
    record = Policy(tenant_id=user.tenant_id, policy_key=key, version=int(latest) + 1, name=body.name, geography=body.geography, sector=body.sector, rules=body.rules, active=body.active)
    if body.active:
        db.query(Policy).filter(Policy.tenant_id == user.tenant_id, Policy.policy_key == key).update({Policy.active: False}, synchronize_session=False)
    db.add(record)
    db.commit()
    return {"key": record.policy_key, "version": record.version, "name": record.name, "geography": record.geography, "sector": record.sector, "rules": record.rules, "active": record.active}


@router.put("/policies/{policy_key}/version")
def create_policy_version(policy_key: str, body: PolicyVersionIn, user: UserDep, db: DbDep) -> dict:
    latest = db.scalar(select(func.max(Policy.version)).where(Policy.tenant_id == user.tenant_id, Policy.policy_key == policy_key))
    if latest is None:
        raise HTTPException(status_code=404, detail="Policy profile not found")
    active = bool(body.active)
    if active:
        db.query(Policy).filter(Policy.tenant_id == user.tenant_id, Policy.policy_key == policy_key).update({Policy.active: False}, synchronize_session=False)
    record = Policy(tenant_id=user.tenant_id, policy_key=policy_key, version=int(latest) + 1, name=body.name, geography=body.geography, sector=body.sector, rules=body.rules, active=active)
    db.add(record)
    db.commit()
    return {"key": record.policy_key, "version": record.version, "name": record.name, "geography": record.geography, "sector": record.sector, "rules": record.rules, "active": record.active}


@router.get("/policies/{policy_key}/versions")
def policy_versions(policy_key: str, user: UserDep, db: DbDep) -> list[dict]:
    rows = db.scalars(select(Policy).where(Policy.policy_key == policy_key, (Policy.tenant_id == user.tenant_id) | (Policy.tenant_id.is_(None))).order_by(desc(Policy.version))).all()
    return [{"key": row.policy_key, "version": row.version, "name": row.name, "geography": row.geography, "sector": row.sector, "rules": row.rules, "active": row.active} for row in rows]


@router.post("/policies/{policy_key}/activate")
def activate_policy(policy_key: str, version: int, user: UserDep, db: DbDep) -> dict:
    row = db.scalar(select(Policy).where(Policy.tenant_id == user.tenant_id, Policy.policy_key == policy_key, Policy.version == version))
    if row is None:
        raise HTTPException(status_code=404, detail="Tenant policy version not found")
    db.query(Policy).filter(Policy.tenant_id == user.tenant_id, Policy.policy_key == policy_key).update({Policy.active: False}, synchronize_session=False)
    row.active = True
    db.commit()
    return {"ok": True, "key": policy_key, "version": version}


@router.post("/policies/simulate")
def policy_simulation(body: PolicySimulation, user: UserDep, db: DbDep) -> dict:
    if len(body.prompt) > get_settings().max_prompt_chars:
        raise HTTPException(status_code=413, detail="Prompt exceeds the configured maximum length")
    return simulate(body.prompt, body.use_case, body.policy_key, _load_policy_override(db, user=user, policy_key=body.policy_key or _policy_key_for_use_case(body.use_case)))


@router.get("/use-cases")
def use_cases(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.scalars(select(UseCase).where((UseCase.tenant_id == user.tenant_id) | (UseCase.tenant_id.is_(None)), UseCase.active.is_(True))).all()
    return [{"key": row.key, "name": row.name, "profile": row.profile} for row in rows]


@router.post("/use-cases/detect")
def use_case_detect(body: dict, user: UserDep) -> dict:
    prompt = str(body.get("prompt", ""))
    if len(prompt) > get_settings().max_prompt_chars:
        raise HTTPException(status_code=413, detail="Prompt exceeds the configured maximum length")
    return simulate(prompt, body.get("use_case"), None)


@router.get("/sessions")
def sessions(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.scalars(select(SessionRecord).where(SessionRecord.user_id == user.id, SessionRecord.tenant_id == user.tenant_id).order_by(desc(SessionRecord.last_seen_at)).limit(25)).all()
    return [{"id": row.id, "use_case": row.use_case, "compounding_risk": row.compounding_risk, "last_seen_at": row.last_seen_at} for row in rows]


@router.get("/activity/live")
def activity_live(user: UserDep, db: DbDep, after: datetime | None = None) -> list[dict]:
    predicate = [RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id]
    if after: predicate.append(RequestRecord.created_at > after)
    rows = db.scalars(select(RequestRecord).where(and_(*predicate)).order_by(desc(RequestRecord.created_at)).limit(25)).all()
    return [{"id": row.id, "action": row.policy_action, "use_case": row.use_case, "trust_score": row.trust_score, "created_at": row.created_at} for row in rows]


@router.get("/analytics/summary")
def analytics_summary(user: UserDep, db: DbDep) -> dict:
    start = datetime.now(UTC) - timedelta(days=7)
    rollup = db.execute(select(func.sum(UsageDaily.requests), func.sum(UsageDaily.interventions), func.sum(UsageDaily.trust_sum), func.sum(UsageDaily.spend_usd)).where(UsageDaily.tenant_id == user.tenant_id, UsageDaily.user_id == user.id, UsageDaily.use_case == "all", UsageDaily.day >= start)).one()
    count, interventions, trust_sum, spend = rollup
    # Existing installations may not have refreshed rollups yet; preserve a SQL-only fallback.
    if not count:
        predicate = [RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id, RequestRecord.created_at >= start]
        count, average, spend = db.execute(select(func.count(RequestRecord.id), func.avg(RequestRecord.trust_score), func.sum(RequestRecord.cost_usd)).where(and_(*predicate))).one()
        interventions = db.scalar(select(func.count(RequestRecord.id)).where(and_(*predicate), RequestRecord.policy_action.in_(["FLAG", "HUMAN_REVIEW", "BLOCK", "SANITIZE"]))) or 0
        return {"requests": count or 0, "average_trust": round(float(average or 0), 1), "spend_usd": round(float(spend or 0), 4), "interventions": interventions}
    average = float(trust_sum or 0) / float(count)
    return {"requests": int(count), "average_trust": round(average, 1), "spend_usd": round(float(spend or 0), 4), "interventions": int(interventions or 0)}


@router.get("/analytics/timeseries")
def analytics_timeseries(user: UserDep, db: DbDep) -> list[dict]:
    start = datetime.now(UTC) - timedelta(days=31)
    rows = db.execute(select(UsageDaily.day, UsageDaily.requests, UsageDaily.trust_sum).where(UsageDaily.tenant_id == user.tenant_id, UsageDaily.user_id == user.id, UsageDaily.use_case == "all", UsageDaily.day >= start).order_by(UsageDaily.day).limit(31)).all()
    if rows:
        return [{"day": str(row.day.date() if hasattr(row.day, "date") else row.day), "requests": row.requests, "trust": round(float(row.trust_sum or 0) / max(int(row.requests or 1), 1), 1)} for row in rows]
    fallback = db.execute(select(func.date(RequestRecord.created_at).label("day"), func.count(RequestRecord.id).label("requests"), func.avg(RequestRecord.trust_score).label("trust")).where(RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id).group_by(func.date(RequestRecord.created_at)).order_by(func.date(RequestRecord.created_at)).limit(31)).all()
    return [{"day": str(row.day), "requests": row.requests, "trust": round(float(row.trust or 0), 1)} for row in fallback]


@router.get("/analytics/by-use-case")
def analytics_by_use_case(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.execute(select(RequestRecord.use_case, func.count(RequestRecord.id).label("requests"), func.avg(RequestRecord.trust_score).label("trust"), func.sum(RequestRecord.cost_usd).label("spend")).where(RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id).group_by(RequestRecord.use_case).order_by(desc(func.count(RequestRecord.id)))).all()
    return [{"use_case": row.use_case, "requests": row.requests, "trust": round(float(row.trust or 0), 1), "spend_usd": round(float(row.spend or 0), 4)} for row in rows]


@router.get("/analytics/risks")
def analytics_risks(user: UserDep, db: DbDep) -> list[dict]:
    tags = ("privacy", "injection", "security", "hallucination", "bias", "financial", "decision", "toxicity", "minor")
    base = [RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id]
    return [{"risk_tag": tag, "count": int(db.scalar(select(func.count(RequestRecord.id)).where(and_(*base), RequestRecord.risk_tags.contains([tag]))) or 0)} for tag in tags]


@router.get("/analytics/models")
def analytics_models(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.execute(select(RequestRecord.model_served, func.count(RequestRecord.id).label("requests"), func.avg(RequestRecord.latency_ms).label("latency_ms"), func.sum(RequestRecord.cost_usd).label("spend_usd")).where(RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id).group_by(RequestRecord.model_served).order_by(desc(func.count(RequestRecord.id)))).all()
    return [{"model": row.model_served, "requests": row.requests, "avg_latency_ms": round(float(row.latency_ms or 0), 1), "spend_usd": round(float(row.spend_usd or 0), 4)} for row in rows]


@router.get("/analytics/violations")
def analytics_violations(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.execute(select(RequestRecord.policy_action, func.count(RequestRecord.id).label("count")).where(RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id).group_by(RequestRecord.policy_action).order_by(desc(func.count(RequestRecord.id)))).all()
    return [{"action": row.policy_action, "count": row.count} for row in rows]


@router.get("/analytics/trust-breakdown")
def analytics_trust_breakdown(user: UserDep, db: DbDep) -> dict:
    predicate = and_(RequestRecord.user_id == user.id, RequestRecord.tenant_id == user.tenant_id)
    row = db.execute(select(func.avg(RequestRecord.trust_score), func.avg(RequestRecord.trust_breakdown["privacy"].as_float()), func.avg(RequestRecord.trust_breakdown["safety"].as_float()), func.avg(RequestRecord.trust_breakdown["accuracy"].as_float()), func.avg(RequestRecord.trust_breakdown["policy_fit"].as_float())).where(predicate)).one()
    keys = ("score", "privacy", "safety", "accuracy", "policy_fit")
    return {key: round(float(value or 0), 1) for key, value in zip(keys, row, strict=True)}


@router.get("/analytics/calibration")
def analytics_calibration(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.execute(select(Feedback.rule_key, RequestRecord.use_case, func.count(Feedback.id).label("feedback_count"), func.sum(case((Feedback.label == "false_positive", 1), else_=0)).label("false_positives"), func.sum(case((Feedback.label == "false_negative", 1), else_=0)).label("false_negatives")).join(RequestRecord, RequestRecord.id == Feedback.request_id).where(Feedback.user_id == user.id, Feedback.tenant_id == user.tenant_id).group_by(Feedback.rule_key, RequestRecord.use_case).order_by(desc(func.count(Feedback.id))).limit(100)).all()
    return [{"rule_key": row.rule_key, "use_case": row.use_case, "feedback_count": row.feedback_count, "false_positives": row.false_positives or 0, "false_negatives": row.false_negatives or 0, "fp_rate": round(float(row.false_positives or 0) / max(int(row.feedback_count or 1), 1), 3), "fn_rate": round(float(row.false_negatives or 0) / max(int(row.feedback_count or 1), 1), 3)} for row in rows]


@router.get("/human-review")
def human_review(user: UserDep, db: DbDep) -> list[dict]:
    rows = db.scalars(select(HumanReviewQueue).where(HumanReviewQueue.tenant_id == user.tenant_id, HumanReviewQueue.status == "pending").order_by(HumanReviewQueue.created_at).limit(100)).all()
    return [{"id": row.id, "request_id": row.request_id, "status": row.status, "reason": row.reason, "created_at": row.created_at} for row in rows]


@router.post("/human-review/{item_id}/resolve")
def resolve_review(item_id: str, body: ReviewResolution, user: UserDep, db: DbDep) -> dict:
    item_id = _normalize_uuid(item_id, "review item")
    item = db.scalar(select(HumanReviewQueue).where(HumanReviewQueue.id == item_id, HumanReviewQueue.tenant_id == user.tenant_id))
    if not item: raise HTTPException(status_code=404, detail="Review item not found")
    item.status = "resolved"; item.resolved_by = user.id; item.resolution = body.resolution; db.commit()
    return {"ok": True, "id": item.id, "resolution": item.resolution}
